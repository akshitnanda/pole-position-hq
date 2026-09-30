import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nativeRequire = createRequire(import.meta.url);

// Execute the real TS modules with network and service boundaries replaced.
function loadModule(relative, { fetch, mocks = {} }) {
  const filename = path.resolve(root, relative);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  const require = (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return nativeRequire(specifier);
    const target = specifier.startsWith("@/") ? specifier.slice(2)
      : path.relative(root, path.resolve(path.dirname(filename), specifier));
    return loadModule(`${target}.ts`, { fetch, mocks });
  };
  new Function("require", "module", "exports", "fetch", "process", output)(
    require, compiledModule, compiledModule.exports, fetch, { env: {} },
  );
  return compiledModule.exports;
}

const session = {
  session_key: 1234, meeting_key: 123, session_name: "Race", session_type: "Race",
  date_start: "2020-09-06T13:00:00Z", date_end: "2020-09-06T15:00:00Z",
  circuit_short_name: "Monza", country_name: "Italy", country_code: "ITA",
  location: "Monza", gmt_offset: "02:00:00", is_cancelled: false, year: 2020,
};
const feedNames = ["session_result", "intervals", "laps", "position", "stints", "pit"];
function fixtureResponse(url, hasSession = true) {
  const endpoint = new URL(url).pathname.split("/").at(-1);
  if (endpoint === "sessions") return Response.json(hasSession ? [session] : []);
  if (endpoint === "graphql") return Response.json({ data: { findManySeasonDriverStanding: [] } });
  if (url.includes("reddit.com")) return Response.json({ data: { children: [] } });
  if (url.includes("motorsport.com") || url.includes("the-race.com")) return new Response("<rss><channel /></rss>");
  return Response.json([]);
}

test("independent session feeds all start before any of them completes", async () => {
  const started = new Set();
  let release, reportStarted;
  const gate = new Promise((resolve) => { release = resolve; });
  const allStarted = new Promise((resolve) => { reportStarted = resolve; });
  const { getDashboardData } = loadModule("lib/dashboard-data.ts", {
    fetch: async (url) => {
      const endpoint = new URL(url).pathname.split("/").at(-1);
      if (feedNames.includes(endpoint)) {
        started.add(endpoint);
        if (started.size === feedNames.length) reportStarted();
        await gate;
      }
      return fixtureResponse(url);
    },
  });
  const loading = getDashboardData();
  let timeout;
  try {
    await Promise.race([allStarted, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Session requests are serialized")), 2_000);
    })]);
    assert.equal(started.size, 6);
  } finally {
    clearTimeout(timeout);
    release();
    await loading;
  }
});

test("one failed session feed does not discard successful session evidence", async () => {
  let failures = 0;
  const { getDashboardData } = loadModule("lib/dashboard-data.ts", {
    fetch: async (url) => {
      const endpoint = new URL(url).pathname.split("/").at(-1);
      if (endpoint === "pit") { failures++; return new Response(null, { status: 503 }); }
      if (endpoint === "team_radio") return Response.json([{
        session_key: 1234, driver_number: 12, date: "2020-09-06T14:00:00Z",
        recording_url: "https://fixture.invalid/radio.mp3",
      }]);
      return fixtureResponse(url);
    },
  });
  const dashboard = await getDashboardData();
  assert.equal(failures, 3);
  assert.equal(dashboard.teamRadio.clips.length, 1);
  assert.equal(dashboard.teamRadio.session.sessionKey, 1234);
  assert.equal(dashboard.teamRadio.status, "cached");
  assert.equal(dashboard.strategy.status, "empty");
});

test("no race session means no session-scoped feed requests", async () => {
  const requested = [];
  const { getDashboardData } = loadModule("lib/dashboard-data.ts", {
    fetch: async (url) => { requested.push(url); return fixtureResponse(url, false); },
  });
  const dashboard = await getDashboardData();
  assert.equal(requested.some((url) => feedNames.includes(new URL(url).pathname.split("/").at(-1))), false);
  assert.equal(dashboard.telemetrySession, null);
  assert.deepEqual(dashboard.timingTower.entries, []);
});

test("refresh timeout resolves with an error while preserving the cached snapshot", async () => {
  const { configureStore } = nativeRequire("@reduxjs/toolkit");
  const { createApi, fetchBaseQuery } = nativeRequire("@reduxjs/toolkit/query/react");
  let configuredTimeout;
  const { dashboardApi } = loadModule("lib/store/dashboard-api.ts", {
    fetch: () => { throw new Error("Unexpected network access"); },
    mocks: {
      "@reduxjs/toolkit/query/react": { createApi, fetchBaseQuery: (config) => {
        configuredTimeout = config.timeout;
        return fetchBaseQuery({ ...config, baseUrl: "https://fixture.invalid/", timeout: 20,
          fetchFn: (request) => new Promise((_, reject) => {
            const abort = () => reject(request.signal.reason);
            if (request.signal.aborted) abort();
            else request.signal.addEventListener("abort", abort, { once: true });
          }),
        });
      } },
      "@/lib/analytics": { markWebSocketLag() {} },
      "@/lib/live-stream": { connectLiveTimingStream: () => ({ close() {} }) },
      "@/lib/offline-cache": { saveDashboardSnapshot: async () => {} },
    },
  });
  const store = configureStore({ reducer: { [dashboardApi.reducerPath]: dashboardApi.reducer },
    middleware: (getDefault) => getDefault().concat(dashboardApi.middleware) });
  try {
    const snapshot = { generatedAt: "2026-09-14T10:00:00Z", marker: "last good snapshot" };
    await store.dispatch(dashboardApi.util.upsertQueryData("getDashboard", undefined, snapshot));
    const result = await store.dispatch(dashboardApi.endpoints.getDashboard.initiate(undefined, { forceRefetch: true, subscribe: false }));
    assert.equal(configuredTimeout, 45_000);
    assert.equal(result.error.status, "TIMEOUT_ERROR");
    assert.deepEqual(result.data, snapshot);
  } finally {
    store.dispatch(dashboardApi.util.resetApiState());
  }
});

test("transport activity preserves archived provenance and replay cannot replace race control", async () => {
  const { configureStore } = nativeRequire("@reduxjs/toolkit");
  let handlers;
  const { dashboardApi } = loadModule("lib/store/dashboard-api.ts", {
    fetch: () => { throw new Error("Unexpected network access"); },
    mocks: {
      "@/lib/analytics": { markWebSocketLag() {} },
      "@/lib/live-stream": { connectLiveTimingStream: (value) => { handlers = value; return { close() {} }; } },
      "@/lib/offline-cache": { saveDashboardSnapshot: async () => {} },
    },
  });
  const store = configureStore({ reducer: { [dashboardApi.reducerPath]: dashboardApi.reducer },
    middleware: (getDefault) => getDefault().concat(dashboardApi.middleware) });
  try {
    const source = { status: "cached", note: "Archived lap trace", updatedAt: "2026-09-06T15:00:00Z" };
    const control = { flag: "Yellow", message: "Observed control message", countdownEndsAt: null, events: [] };
    await store.dispatch(dashboardApi.util.upsertQueryData("getDashboard", undefined, {
      liveTiming: { connection: "offline", sampleIndex: 0, trackPosition: 0, latencyMs: 0, receivedAt: null },
      sources: { telemetry: source }, raceControl: { ...control, flag: "Idle" },
    }));
    const current = () => dashboardApi.endpoints.getDashboard.select()(store.getState()).data;
    handlers.onFrame({ type: "telemetry", receivedAt: "2026-09-18T10:00:00Z", sampleIndex: 2, raceControl: control }, "websocket");
    assert.deepEqual(current().sources.telemetry, source);
    assert.deepEqual(current().raceControl, control);
    handlers.onFrame({ type: "telemetry", sampleIndex: 3, raceControl: { ...control, flag: "Green" } }, "eventsource");
    assert.deepEqual(current().raceControl, control);
    assert.deepEqual(current().sources.telemetry, source);
    handlers.onStatus("offline");
    assert.equal(current().liveTiming.connection, "offline");
    assert.equal(current().liveTiming.sampleIndex, 3);
  } finally {
    store.dispatch(dashboardApi.util.resetApiState());
  }
});
