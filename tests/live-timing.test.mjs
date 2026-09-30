import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadModule(relative, globals = {}, mocks = {}) {
  const filename = path.resolve(root, relative);
  const compiledModule = { exports: {} };
  const require = (name) => {
    if (name in mocks) return mocks[name];
    const target = name.startsWith("@/") ? name.slice(2) : path.relative(root, path.resolve(path.dirname(filename), name));
    return loadModule(`${target}.ts`, globals, mocks);
  };
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", ...Object.keys(globals), output)(
    require, compiledModule, compiledModule.exports, ...Object.values(globals));
  return compiledModule.exports;
}

const { parseLiveTimingPayload } = loadModule("lib/live-timing-protocol.ts");
const telemetry = JSON.stringify({ type: "telemetry", sampleIndex: 2, trackPosition: 0.3 });

function harness(useWebSocket = true) {
  const timers = new Map();
  let now = 0, nextTimer = 0;
  const sockets = [], sources = [], statuses = [], frames = [];
  class Socket {
    constructor() { sockets.push(this); }
    close() { this.closed = true; this.onclose?.(); }
  }
  class Source {
    constructor() { sources.push(this); }
    close() { this.closed = true; }
  }
  const { connectLiveTimingStream } = loadModule("lib/live-stream.ts", {
    process: { env: { NEXT_PUBLIC_LIVE_TIMING_WS_URL: useWebSocket ? "wss://fixture.invalid" : undefined } },
    WebSocket: Socket, EventSource: Source,
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  const subscription = connectLiveTimingStream({ onStatus: (state) => statuses.push(state), onFrame: (frame, connection) => frames.push({ frame, connection }) });
  const advance = (ms) => {
    now += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
  };
  return { sockets, sources, statuses, frames, subscription, advance, timers };
}

test("malformed and unsupported frames are ignored without throwing", () => {
  for (const payload of ["bad-json", "", "null", "[]", "42", '{"type":"unknown"}', '{"type":"telemetry"}', '{"M":[null,3]}']) {
    assert.equal(parseLiveTimingPayload(payload), null);
  }
  assert.equal(parseLiveTimingPayload(telemetry).sampleIndex, 2);
  assert.equal(parseLiveTimingPayload('{"type":"heartbeat"}').type, "heartbeat");
});

test("malformed race control never enters a valid telemetry frame", () => {
  const result = parseLiveTimingPayload(JSON.stringify({ type: "telemetry", sampleIndex: 0,
    raceControl: { flag: "Green", message: "Bad", events: [null], countdownEndsAt: null } }));
  assert.equal(result.raceControl, undefined);
  const control = { flag: "Idle", message: "No feed", events: [], countdownEndsAt: null };
  assert.deepEqual(parseLiveTimingPayload(JSON.stringify({ type: "race-control", raceControl: control })).raceControl, control);
});

test("connection status waits for the first valid frame", () => {
  const h = harness();
  assert.deepEqual(h.statuses, ["offline"]);
  h.sockets[0].onmessage({ data: "invalid" });
  assert.deepEqual(h.statuses, ["offline"]);
  h.sockets[0].onmessage({ data: telemetry });
  h.sockets[0].onmessage({ data: telemetry });
  assert.deepEqual(h.statuses, ["offline", "websocket"]);
  assert.equal(h.frames.length, 2);
  h.subscription.close();
});

test("silent WebSocket falls back once and ignores late socket messages", () => {
  const h = harness();
  const oldMessage = h.sockets[0].onmessage, oldError = h.sockets[0].onerror;
  h.advance(15_000);
  assert.equal(h.sources.length, 1);
  assert.equal(h.sockets[0].closed, true);
  oldError();
  oldMessage({ data: telemetry });
  assert.equal(h.sources.length, 1);
  assert.equal(h.frames.length, 0);
  h.sources[0].onmessage({ data: telemetry });
  assert.equal(h.frames[0].connection, "eventsource");
  h.subscription.close();
});

test("valid frames reset the WebSocket silence deadline", () => {
  const h = harness();
  h.advance(14_000);
  h.sockets[0].onmessage({ data: telemetry });
  h.advance(14_000);
  assert.equal(h.sources.length, 0);
  h.advance(1_000);
  assert.equal(h.sources.length, 1);
  assert.deepEqual(h.statuses, ["offline", "websocket", "offline"]);
  h.subscription.close();
});

test("replay silence and errors report offline until valid frames resume", () => {
  const h = harness(false);
  h.sources[0].onmessage({ data: telemetry });
  h.advance(30_000);
  assert.equal(h.statuses.at(-1), "offline");
  h.sources[0].onmessage({ data: telemetry });
  h.sources[0].onerror();
  assert.equal(h.statuses.at(-1), "offline");
  h.sources[0].onmessage({ data: telemetry });
  assert.equal(h.statuses.at(-1), "eventsource");
  assert.equal(h.sources.length, 1);
  h.subscription.close();
});

test("closing a subscription cancels timers and ignores queued callbacks", () => {
  for (const useWebSocket of [true, false]) {
    const h = harness(useWebSocket);
    const transport = h.sockets[0] ?? h.sources[0];
    const oldMessage = transport.onmessage, oldError = transport.onerror;
    h.subscription.close(); h.subscription.close();
    oldMessage({ data: telemetry }); oldError(); h.advance(60_000);
    assert.equal(h.timers.size, 0);
    assert.equal(h.frames.length, 0);
    assert.equal(transport.closed, true);
    assert.deepEqual(h.statuses, ["offline"]);
  }
});

test("replay endpoint emits no invented latency or race-control state", async () => {
  const timers = new Set();
  const { GET } = loadModule("app/api/live-timing/route.ts", {
    setInterval: (callback) => { timers.add(callback); return callback; },
    clearInterval: (callback) => timers.delete(callback),
  }, { "@/lib/dashboard-data": { getDashboardData: async () => ({ telemetrySamples: [{ index: 0, trackPosition: 0.1 }] }) } });
  const response = await GET();
  const reader = response.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  const frame = JSON.parse(first.slice(6).trim());
  assert.equal(frame.trackPosition, 0.1);
  assert.equal(frame.latencyMs, undefined);
  assert.equal(frame.raceControl, undefined);
  await reader.cancel();
  assert.equal(timers.size, 0);
});
