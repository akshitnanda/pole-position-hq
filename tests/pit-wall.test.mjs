import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Compile the actual TS modules using the project's existing compiler. Provider
// calls are replaced here so these regressions require neither secrets nor NIM.
function loadModule(relative, provider = async () => { throw new Error("Unexpected provider call"); }) {
  const filename = path.resolve(root, relative);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  const localRequire = (specifier) => {
    const target = specifier.startsWith("@/")
      ? specifier.slice(2)
      : path.relative(root, path.resolve(path.dirname(filename), specifier));
    return loadModule(`${target}.ts`, provider);
  };
  new Function("require", "module", "exports", "fetch", "process", compiled)(
    localRequire, compiledModule, compiledModule.exports, provider,
    { env: { NVIDIA_API_KEY: "test-placeholder" } },
  );
  return compiledModule.exports;
}

const { assemblePitWallBrief, buildSnapshotBrief, scopePitWallEvidence } = loadModule("lib/pit-wall-selection.ts");
const { buildPitWallEvidence } = loadModule("lib/pit-wall-ai.ts");
const { buildBriefText } = loadModule("lib/pit-wall-export.ts");
const { briefTextParts, formatBriefDate } = loadModule("lib/pit-wall-presentation.ts");
const archive = {
  circuitName: "Monza", sessionName: "Race", dateStart: "2026-09-06T13:00:00Z",
};
const upcoming = {
  circuitName: "Madring", sessionName: "Practice 1", location: "Madrid",
  dateStart: "2026-09-11T11:30:00Z",
};
function dashboardFixture() {
  return {
    season: 2026,
    nextSession: upcoming,
    weekendWeather: [{ label: "Practice 1", temperatureC: 28, rainChance: 0, summary: "Clear" }],
    timingTower: {
      session: archive, status: "cached",
      entries: [{ fullName: "Kimi Antonelli", abbreviation: "ANT", teamName: "Mercedes", position: 1,
        bestLap: 83.504, lastLap: 83.504, gapToLeader: 0, compound: "MEDIUM", raceStatus: "classified" }],
    },
    strategy: { session: archive, status: "cached", drivers: [] },
    raceIntelligence: { upgradeSignals: [] }, activity: { items: [] },
    sources: Object.fromEntries(["schedule", "weather", "telemetry"].map((key) =>
      [key, { source: `Fixture ${key}`, status: "cached", label: key }])),
  };
}
const ledger = buildPitWallEvidence(dashboardFixture(), null);
const snapshot = "2026-09-10T10:00:00Z";

test("driver focus includes a driver outside the top six with stable tower refs", () => {
  const fixture = dashboardFixture();
  const leader = fixture.timingTower.entries[0];
  fixture.timingTower.entries = Array.from({ length: 14 }, (_, index) => ({ ...leader,
    driverId: `driver-${index}`, fullName: `Driver ${index}`, position: index + 1,
  }));
  const selected = { id: "driver-13", abbreviation: "BOR", fullName: "Driver 13", standingPosition: 14, points: 10, teamName: "Audi" };
  const all = buildPitWallEvidence(fixture, selected);
  assert.equal(all.filter((item) => item.kind === "timing").length, 7);
  const focused = scopePitWallEvidence(all, "driver-focus").filter((item) => item.kind === "timing");
  assert.equal(focused.length, 1);
  assert.equal(focused[0].ref, "TIMING-14");
  assert.match(focused[0].fact, /Driver 13.*P14/);
  assert.match(focused[0].context, /Monza/);
  const topSix = buildPitWallEvidence(fixture, { ...selected, id: "driver-0", fullName: "Driver 0" });
  assert.equal(topSix.filter((item) => item.kind === "timing").length, 6);
});

test("readable dates preserve original timestamps and every non-date word", () => {
  const original = "Monza / Race / 2026-09-06T13:00:00.000Z / cached";
  const parts = briefTextParts(original);
  assert.equal(parts.map((part) => part.dateTime ?? part.text).join(""), original);
  assert.match(parts.map((part) => part.text).join(""), /6 Sept 2026.*13:00 UTC/);
  assert.match(formatBriefDate("2026-09-06T13:00:00Z", "America/Chicago"), /08:00/);
  assert.match(formatBriefDate("2026-01-06T13:00:00Z", "America/Chicago"), /07:00/);
  assert.match(formatBriefDate("2026-09-06T15:00:00+02:00"), /13:00 UTC/);
});

test("date presentation preserves missing dates, invalid input and export source values", () => {
  assert.equal(formatBriefDate("unavailable"), "unavailable");
  assert.equal(formatBriefDate("2026-02-30T13:00:00Z"), "2026-02-30T13:00:00Z");
  assert.deepEqual(briefTextParts("P14; best lap 1:23.504; no session time"), [{ text: "P14; best lap 1:23.504; no session time" }]);
  assert.deepEqual(briefTextParts("2026-99-99T13:00:00Z"), [{ text: "2026-99-99T13:00:00Z" }]);
  const brief = buildSnapshotBrief(ledger, "race-brief", snapshot);
  const original = buildBriefText("race-brief", { brief, evidence: ledger });
  briefTextParts(brief.findings[0].insight, "America/Chicago");
  assert.equal(buildBriefText("race-brief", { brief, evidence: ledger }), original);
  assert.match(original, /2026-09-11T11:30:00.000Z/);
});

test("snapshot briefs are immediate, deterministic and never attributed to AI", () => {
  const result = buildSnapshotBrief(ledger, "race-brief", snapshot);
  assert.equal(result.selectionMethod, "snapshot");
  assert.equal(result.generatedAt, snapshot);
  assert.deepEqual(result.findings.map((item) => item.evidenceRefs[0]), ["SESSION-NEXT", "TIMING-1", "WEATHER-1"]);
  assert.deepEqual(result, buildSnapshotBrief(ledger, "race-brief", snapshot));
  assert.match(buildBriefText("race-brief", { brief: result, evidence: ledger }), /Selection: Fixed snapshot rules \(no AI\)/);
});

test("snapshot selection handles empty and partial ledgers without inventing cards", () => {
  assert.equal(buildSnapshotBrief([], "race-brief", snapshot), null);
  assert.equal(buildSnapshotBrief(ledger.filter((item) => item.kind === "source"), "race-brief", snapshot), null);
  const result = buildSnapshotBrief(ledger.filter((item) => item.kind === "timing"), "race-brief", snapshot);
  assert.equal(result.findings.length, 1);
});

test("driver focus excludes another driver's timing and weekend excludes archive timing", () => {
  const driver = { ref: "DRIVER-BOR", kind: "driver", label: "Gabriel Bortoleto", fact: "P14", source: "Standings" };
  const scoped = scopePitWallEvidence([...ledger, driver], "driver-focus");
  assert.equal(scoped.some((item) => item.kind === "timing"), false);
  assert.equal(buildSnapshotBrief(scoped, "driver-focus", snapshot).findings[0].label, driver.label);
  assert.equal(scopePitWallEvidence(ledger, "weekend-outlook").some((item) => item.kind === "timing"), false);
});

test("scoping caps records while retaining feed status", () => {
  const many = Array.from({ length: 24 }, (_, index) => ({ ...ledger[0], ref: `SESSION-${index}` }));
  const status = ledger.find((item) => item.kind === "source");
  const scoped = scopePitWallEvidence([...many, status], "race-brief");
  assert.equal(scoped.length, 18);
  assert.equal(scoped.at(-1).ref, status.ref);
});

test("provider failures return a controlled error and never fabricate a brief", async () => {
  for (const provider of [async () => Response.json({}, { status: 503 }), async () => { throw new Error("Offline"); }]) {
    const { POST } = loadModule("app/api/ai-brief/route.ts", provider);
    const response = await POST(new Request("http://localhost/api/ai-brief", {
      method: "POST", body: JSON.stringify({ snapshotGeneratedAt: snapshot, evidence: ledger }),
    }));
    assert.equal(response.status, 502);
    assert.equal((await response.json()).findings, undefined);
  }
});

test("client cancellation propagates to the provider request", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const { POST } = loadModule("app/api/ai-brief/route.ts", async (_url, options) => {
    controller.abort();
    cancelled = options.signal.aborted;
    throw new DOMException("Aborted", "AbortError");
  });
  const response = await POST(new Request("http://localhost/api/ai-brief", {
    method: "POST", signal: controller.signal, body: JSON.stringify({ snapshotGeneratedAt: snapshot, evidence: ledger }),
  }));
  assert.equal(cancelled, true);
  assert.equal(response.status, 502);
});

test("archived Monza timing stays separate from the upcoming Madrid session", () => {
  const timing = ledger.find((item) => item.ref === "TIMING-1");
  assert.match(timing.context, /Monza \/ Race \/ 2026-09-06.*cached/);
  assert.doesNotMatch(timing.context, /Madrid|Madring|Practice/);
  assert.match(ledger.find((item) => item.ref === "SESSION-NEXT").context, /Madring.*scheduled/);
});

test("model prose cannot change any displayed field, including headline and next session", () => {
  const result = assemblePitWallBrief({
    priorityRefs: ["TIMING-1"],
    headline: "Verstappen wins Madrid practice", readout: "INVENTED CLAIM",
    watchNext: ["Invented pit strategy"], caveat: "All data verified live",
  }, ledger, "race-brief", "test-model", snapshot);
  assert.match(result.headline, /Kimi Antonelli/);
  assert.equal(result.findings[0].insight, ledger.find((item) => item.ref === "TIMING-1").fact);
  assert.match(result.findings[0].context, /Monza/);
  assert.deepEqual(result.watchNext, [ledger.find((item) => item.ref === "SESSION-NEXT").fact]);
  assert.doesNotMatch(JSON.stringify(result), /Verstappen|INVENTED|Invented|verified live/);
});

test("unknown, duplicate and status refs cannot create extra fact cards", () => {
  const result = assemblePitWallBrief({ priorityRefs: ["UNKNOWN", "SOURCE-STATUS", "TIMING-1", "TIMING-1", "WEATHER-1"] }, ledger, "race-brief", "test", snapshot);
  assert.deepEqual(result.findings.map((item) => item.evidenceRefs), [["TIMING-1"], ["WEATHER-1"]]);
  for (const invalid of [null, [], {}, { priorityRefs: ["UNKNOWN", 17, null] }]) {
    assert.equal(assemblePitWallBrief(invalid, ledger, "race-brief", "test", snapshot), null);
  }
});

test("missing archive context is explicit and never borrowed from the next event", () => {
  const fixture = dashboardFixture();
  fixture.timingTower.session = null;
  const timing = buildPitWallEvidence(fixture, null).find((item) => item.ref === "TIMING-1");
  assert.equal(timing.context, "Session unavailable / cached");
});

test("championship facts exclude lap averages from a different scope", () => {
  const driver = { fullName: "Gabriel Bortoleto", abbreviation: "BOR", standingPosition: 14, points: 10, teamName: "Audi", avgLap: 127.185 };
  const record = buildPitWallEvidence(dashboardFixture(), driver).find((item) => item.kind === "driver");
  assert.equal(record.context, "2026 championship standings");
  assert.doesNotMatch(record.fact, /lap|127|2:07/);
});

test("export retains frozen contexts, timestamps, caveat and the scheduled session's receipt", () => {
  const frozenEvidence = structuredClone(ledger);
  const brief = assemblePitWallBrief({ priorityRefs: ["TIMING-1"] }, frozenEvidence, "race-brief", "test-model", snapshot);
  const record = { brief, evidence: frozenEvidence };
  const exported = buildBriefText("race-brief", record);
  assert.ok(exported.includes(brief.findings[0].insight));
  assert.ok(exported.includes(brief.findings[0].context));
  assert.ok(exported.includes(brief.caveat));
  assert.ok(exported.includes(snapshot));
  assert.match(exported, /NEXT SCHEDULED SESSION/);
  assert.match(exported, /\[SESSION-NEXT\].*\nContext: Madring/);
  assert.match(exported, /Source: Fixture schedule/);
  const newerLedger = structuredClone(ledger);
  newerLedger.find((item) => item.ref === "TIMING-1").fact = "New event results";
  assert.doesNotMatch(buildBriefText("race-brief", record), /New event results/);
});

test("API uses the reference-only contract and preserves sanitized context", async () => {
  let calls = 0;
  const { POST } = loadModule("app/api/ai-brief/route.ts", async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 250);
    assert.match(body.messages[0].content, /priorityRefs/);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ priorityRefs: ["TIMING-1"], headline: "FABRICATED" }) } }] });
  });
  const response = await POST(new Request("http://localhost/api/ai-brief", {
    method: "POST", body: JSON.stringify({ mode: "race-brief", snapshotGeneratedAt: snapshot, evidence: ledger }),
  }));
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  const result = await response.json();
  assert.match(result.findings[0].context, /Monza/);
  assert.doesNotMatch(JSON.stringify(result), /FABRICATED/);
});

test("API rejects malformed request shapes and unusable model selections", async () => {
  const { POST } = loadModule("app/api/ai-brief/route.ts");
  for (const body of ["null", "[]", "17", "bad-json"]) {
    const response = await POST(new Request("http://localhost/api/ai-brief", { method: "POST", body }));
    assert.equal(response.status, 400);
  }
  const invalidProvider = loadModule("app/api/ai-brief/route.ts", async () =>
    Response.json({ choices: [{ message: { content: '{"priorityRefs":["UNKNOWN"]}' } }] }));
  const response = await invalidProvider.POST(new Request("http://localhost/api/ai-brief", {
    method: "POST", body: JSON.stringify({ snapshotGeneratedAt: snapshot, evidence: ledger }),
  }));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "invalid_nim_response");
});
