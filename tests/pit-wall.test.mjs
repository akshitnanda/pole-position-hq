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
const { buildBriefText, buildBriefFilename } = loadModule("lib/pit-wall-export.ts");
const { buildBriefLibraryText } = loadModule("lib/brief-library-export.ts");
const { briefTextParts, formatBriefDate } = loadModule("lib/pit-wall-presentation.ts");
const { searchDashboardCommands } = loadModule("lib/dashboard-commands.ts");
const { summarizeSourceHealth, scheduleContext } = loadModule("lib/cockpit-status.ts");
const { briefCheckpointKey, updateBriefCheckpoint, compareBriefEvidence, listBriefCheckpoints } = loadModule("lib/brief-checkpoints.ts");
const { createTextDownload } = loadModule("lib/text-export.ts");
const { getDriverRaceSnapshot, dossierLap, dossierColor, dossierPortrait } = loadModule("lib/driver-dossier.ts");

test("reveal portrait upgrades only the supplied trusted image rendition", () => {
  assert.equal(dossierPortrait("https://media.formula1.com/drivers/name.png.transform/1col/image.png"), "https://media.formula1.com/drivers/name.png.transform/5col/image.png");
  assert.equal(dossierPortrait("https://media.formula1.com/portrait.png"), "https://media.formula1.com/portrait.png");
  for (const value of [null, "bad", "http://media.formula1.com/a.png", "https://elsewhere.test/a.png"]) assert.equal(dossierPortrait(value), null);
});

test("driver dossier only joins the requested driver and matching race session", () => {
  const dashboard = {
    timingTower: { session: { sessionKey: 10 }, status: "cached", updatedAt: "2026-10-01T00:00:00Z", note: "Archive", entries: [{ driverId: "ant", position: 5 }, { driverId: "rus", position: 1 }] },
    strategy: { session: { sessionKey: 10 }, status: "cached", drivers: [{ driverId: "ant", stints: [{ compound: "SOFT" }] }] },
  };
  assert.equal(getDriverRaceSnapshot(dashboard, "ant").entry.position, 5);
  assert.equal(getDriverRaceSnapshot(dashboard, "ant").strategy.stints[0].compound, "SOFT");
  assert.equal(getDriverRaceSnapshot(dashboard, "missing").entry, null);
  assert.equal(getDriverRaceSnapshot(dashboard, "rus").strategy, null);
  const unrelated = { ...dashboard, strategy: { ...dashboard.strategy, session: { sessionKey: 11 } } };
  assert.equal(getDriverRaceSnapshot(unrelated, "ant").strategy, null);
  assert.equal(getDriverRaceSnapshot(unrelated, "ant").strategyStatus, null);
  const noContext = { ...dashboard, timingTower: { ...dashboard.timingTower, session: null } };
  assert.equal(getDriverRaceSnapshot(noContext, "ant").entry, null);
  assert.equal(getDriverRaceSnapshot(noContext, "ant").strategy, null);
});

test("dossier lap formatting rounds across minute boundaries and preserves missing values", () => {
  assert.equal(dossierLap(59.9998), "1:00.000");
  assert.equal(dossierLap(105.413), "1:45.413");
  for (const value of [null, undefined, 0, -3, NaN, Infinity]) assert.equal(dossierLap(value), "—");
});

test("3D livery accepts only six-digit team colors", () => {
  assert.equal(dossierColor("00D2BE"), "#00D2BE");
  assert.equal(dossierColor("#e10600"), "#e10600");
  assert.equal(dossierColor("url(example)"), "#e10600");
  assert.equal(dossierColor(""), "#e10600");
});

test("export download resource preserves exact Unicode text and remains valid until released", async () => {
  const text = "Saved snapshot\nNico Hülkenberg · source <unchanged>\n2026-10-01T12:00:00Z";
  let received;
  const revoked = [];
  const resource = createTextDownload(text, {
    createObjectURL: (blob) => { received = blob; return "blob:test-export"; },
    revokeObjectURL: (url) => revoked.push(url),
  });
  assert.equal(resource.href, "blob:test-export");
  assert.equal(received.type, "text/plain;charset=utf-8");
  assert.equal(await received.text(), text);
  assert.deepEqual(revoked, []);
  resource.release();
  resource.release();
  assert.deepEqual(revoked, ["blob:test-export"]);
});

test("concurrent export resources release independently without invalidating a newer preview", () => {
  let next = 0;
  const revoked = [];
  const urlApi = { createObjectURL: () => `blob:export-${++next}`, revokeObjectURL: (url) => revoked.push(url) };
  const first = createTextDownload("First", urlApi);
  const second = createTextDownload("Second", urlApi);
  first.release();
  assert.deepEqual(revoked, [first.href]);
  assert.notEqual(first.href, second.href);
  second.release();
  assert.deepEqual(revoked, [first.href, second.href]);
});

test("blocked download preparation throws without claiming success or revoking unrelated URLs", () => {
  let revokes = 0;
  assert.throws(() => createTextDownload("Still available to preview", {
    createObjectURL: () => { throw new Error("Downloads blocked"); }, revokeObjectURL: () => revokes++,
  }), /Downloads blocked/);
  assert.equal(revokes, 0);
});

test("briefing pack preserves each checkpoint scope, frozen facts and receipts including unavailable drivers", () => {
  const makeRecord = (name, ref, date, fact) => {
    const evidence = [{ ref, label: name, kind: "driver", fact, source: "F1 standings", context: "2026 championship" }];
    return { evidence, brief: buildSnapshotBrief(evidence, "driver-focus", date) };
  };
  const ant = makeRecord("Kimi Antonelli", "DRIVER-ANT", "2026-09-28T12:00:00Z", "Frozen 302 points");
  const bor = makeRecord("Gabriel Bortoleto", "DRIVER-BOR", "2026-09-29T12:00:00Z", "Frozen 10 points");
  bor.brief.selectionMethod = "nim";
  bor.brief.model = "test-model";
  const entries = listBriefCheckpoints({
    [briefCheckpointKey("driver-focus", "ANT", 2026)]: ant,
    [briefCheckpointKey("driver-focus", "BOR", 2026)]: bor,
  }, [{ id: "ANT", fullName: "Kimi Antonelli" }], 2026);
  const original = JSON.stringify(entries);
  const text = buildBriefLibraryText(entries);
  assert.match(text, /2 saved checkpoints/);
  assert.match(text, /cannot be imported/);
  assert.ok(text.includes(buildBriefText("driver-focus", ant)));
  assert.ok(text.includes(buildBriefText("driver-focus", bor)));
  assert.match(text, /driver: ANT/);
  assert.match(text, /driver: BOR/);
  assert.match(text, /Driver is not in the current standings/);
  assert.match(text, /Selection: NVIDIA NIM/);
  assert.match(text, /Selection: Fixed snapshot rules \(no AI\)/);
  assert.equal(JSON.stringify(entries), original);
});

test("individual export names distinguish drivers and snapshots and avoid unsafe filename characters", () => {
  const record = { evidence: [{ kind: "driver", label: "Nico Hülkenberg / test:*?" }], brief: { snapshotGeneratedAt: "2026-09-30T17:07:59.382Z" } };
  const filename = buildBriefFilename("driver-focus", record);
  assert.match(filename, /nico-hulkenberg-test/);
  assert.ok(!/[<>:"/\\|?*]/.test(filename));
  assert.notEqual(filename, buildBriefFilename("driver-focus", { ...record, evidence: [{ kind: "driver", label: "Kimi Antonelli" }] }));
  assert.notEqual(filename, buildBriefFilename("driver-focus", { ...record, brief: { snapshotGeneratedAt: "2026-09-30T18:00:00Z" } }));
  assert.match(buildBriefFilename("weekend-outlook", record), /weekend/);
  assert.match(buildBriefFilename("race-brief", { evidence: [], brief: { snapshotGeneratedAt: "invalid" } }), /field-undated\.txt$/);
});

test("empty briefing pack is explicit and deterministic", () => {
  assert.match(buildBriefLibraryText([]), /0 saved checkpoints/);
  assert.equal(buildBriefLibraryText([]), buildBriefLibraryText([]));
});

test("saved brief library restores explicit driver/mode scope and uses frozen driver names", () => {
  const key = briefCheckpointKey("driver-focus", "ANT", 2026);
  const record = { brief: { snapshotGeneratedAt: "2026-09-28T12:00:00Z" }, evidence: [{ kind: "driver", label: "Frozen driver name" }] };
  const [entry] = listBriefCheckpoints({ [key]: record }, [{ id: "ANT", fullName: "New name" }], 2026);
  assert.equal(entry.label, "Driver focus · Frozen driver name");
  assert.equal(entry.driverId, "ANT");
  assert.equal(entry.mode, "driver-focus");
  assert.equal(entry.key, key);
  assert.equal(entry.record, record);
  assert.equal(entry.unavailableReason, null);
});

test("library retains unavailable checkpoints for export without mapping to another driver", () => {
  const record = { brief: { snapshotGeneratedAt: "2026-09-28T12:00:00Z" }, evidence: [] };
  const records = {
    [briefCheckpointKey("driver-focus", "MISSING", 2026)]: record,
    [briefCheckpointKey("race-brief", "ANT", 2025)]: record,
    [briefCheckpointKey("weekend-outlook", null, 2026)]: record,
  };
  const entries = listBriefCheckpoints(records, [{ id: "ANT", fullName: "Kimi" }], 2026);
  assert.equal(entries.length, 3);
  assert.match(entries.find((entry) => entry.driverId === "MISSING").unavailableReason, /not in the current standings/);
  assert.match(entries.find((entry) => entry.season === 2025).unavailableReason, /2025 season/);
  assert.equal(entries.find((entry) => entry.mode === "weekend-outlook").unavailableReason, null);
  assert.ok(entries.every((entry) => entry.record === record));
});

test("library sorts snapshots newest-first and skips invalid checkpoint scope keys", () => {
  const makeRecord = (date) => ({ brief: { snapshotGeneratedAt: date }, evidence: [] });
  const records = {
    [briefCheckpointKey("race-brief", "ANT", 2026)]: makeRecord("2026-09-26T12:00:00Z"),
    [briefCheckpointKey("driver-focus", "ANT", 2026)]: makeRecord("2026-09-28T12:00:00Z"),
    [briefCheckpointKey("weekend-outlook", null, 2026)]: makeRecord("invalid"),
    broken: makeRecord("2026-09-29T12:00:00Z"),
    '[2026,"__proto__",null]': makeRecord("2026-09-29T12:00:00Z"),
    '[2026,"weekend-outlook","ANT"]': makeRecord("2026-09-29T12:00:00Z"),
    '[2026,"race-brief",42]': makeRecord("2026-09-29T12:00:00Z"),
    '[2026,"race-brief",null,"extra"]': makeRecord("2026-09-29T12:00:00Z"),
  };
  assert.deepEqual(listBriefCheckpoints(records, [], 2026).map((entry) => entry.mode), ["driver-focus", "race-brief", "weekend-outlook"]);
  assert.deepEqual(listBriefCheckpoints({}, [], 2026), []);
});

test("brief checkpoints isolate driver-dependent modes and seasons, sharing only weekend outlook", () => {
  for (const mode of ["race-brief", "driver-focus"]) {
    assert.notEqual(briefCheckpointKey(mode, "ANT", 2026), briefCheckpointKey(mode, "BOR", 2026));
    assert.notEqual(briefCheckpointKey(mode, "ANT", 2026), briefCheckpointKey(mode, "ANT", 2027));
  }
  assert.equal(briefCheckpointKey("weekend-outlook", "ANT", 2026), briefCheckpointKey("weekend-outlook", "BOR", 2026));
  assert.notEqual(briefCheckpointKey("race-brief", "ANT", 2026), briefCheckpointKey("driver-focus", "ANT", 2026));
});

test("saving and releasing checkpoints preserve independent frozen records", () => {
  const record = { brief: { findings: [{ insight: "Original" }] }, evidence: [{ fact: "Original" }] };
  const original = {};
  const saved = updateBriefCheckpoint(original, "a", record);
  record.brief.findings[0].insight = "Changed";
  record.evidence[0].fact = "Changed";
  assert.deepEqual(original, {});
  assert.equal(saved.a.brief.findings[0].insight, "Original");
  assert.equal(saved.a.evidence[0].fact, "Original");
  const second = updateBriefCheckpoint(saved, "b", record);
  const released = updateBriefCheckpoint(second, "a");
  assert.equal(released.a, undefined);
  assert.equal(released.b.evidence[0].fact, "Changed");
  assert.equal(second.a.evidence[0].fact, "Original");
});

test("evidence comparison ignores ordering and positional refs but catches source and event changes", () => {
  const a = { ref: "TIMING-1", kind: "timing", label: "Driver A timing", fact: "P1", context: "Monza race", source: "OpenF1" };
  const b = { ...a, ref: "TIMING-2", label: "Driver B timing", fact: "P2" };
  assert.deepEqual(compareBriefEvidence([a, b], [{ ...b, ref: "TIMING-1" }, { ...a, ref: "TIMING-9" }]), []);
  for (const update of [{ fact: "P3" }, { context: "Baku race" }, { source: "Fallback" }]) {
    const changes = compareBriefEvidence([a], [{ ...a, ...update }]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].type, "updated");
    assert.equal(changes[0].before, a);
  }
  const replaced = compareBriefEvidence([a], [{ ...b, ref: a.ref }]);
  assert.deepEqual(replaced.map((item) => item.type), ["removed", "added"]);
});

test("ambiguous duplicate labels are never guessed into before-after pairs", () => {
  const a = { ref: "NEWS-1", kind: "news", label: "Same truncated title", fact: "First", source: "News" };
  const b = { ...a, ref: "NEWS-2", fact: "Second" };
  assert.deepEqual(compareBriefEvidence([a, b], [b, a]), []);
  const changes = compareBriefEvidence([a, b], [a, { ...b, fact: "Third" }]);
  assert.deepEqual(changes.map((item) => item.type), ["removed", "added"]);
  assert.deepEqual(compareBriefEvidence([], []), []);
  assert.equal(compareBriefEvidence([], [a])[0].type, "added");
  assert.equal(compareBriefEvidence([a], [])[0].type, "removed");
});

test("cockpit health distinguishes cached, modeled, missing and live sources", () => {
  const sources = Object.fromEntries(["live", "cached", "fallback", "simulated", "empty"].map((status) =>
    [status, { label: status, source: "Fixture", status, updatedAt: null }]));
  const health = summarizeSourceHealth(sources);
  assert.equal(health.total, 5);
  assert.equal(health.limited, 3);
  assert.equal(health.summary, "3 of 5 feeds limited");
  assert.deepEqual(health.counts, { live: 1, cached: 1, fallback: 1, simulated: 1, empty: 1 });
  assert.equal(health.feeds[1].status, "cached");
  assert.equal(summarizeSourceHealth({ cached: sources.cached }).summary, "1 of 1 feeds cached");
  assert.equal(summarizeSourceHealth({ live: sources.live }).summary, "1 source feed live");
  assert.equal(summarizeSourceHealth({}).summary, "No sources reported");
});

test("cockpit schedule never calls past, invalid or cancelled sessions upcoming", () => {
  const snapshot = "2026-09-26T12:00:00Z";
  const next = { dateStart: "2026-09-27T12:00:00Z", isCancelled: false };
  assert.equal(scheduleContext(next, snapshot), "Next on schedule");
  assert.equal(scheduleContext({ ...next, isCancelled: true }, snapshot), "Cancelled session");
  assert.equal(scheduleContext({ ...next, dateStart: snapshot }, snapshot), "Schedule reference");
  assert.equal(scheduleContext({ ...next, dateStart: "2026-09-20T12:00:00Z" }, snapshot), "Schedule reference");
  assert.equal(scheduleContext({ ...next, dateStart: "invalid" }, snapshot), "Schedule reference");
  assert.equal(scheduleContext(next, "invalid"), "Schedule reference");
  assert.equal(scheduleContext(null, snapshot), "Schedule unavailable");
});

test("command search matches driver, team and category terms without running actions", () => {
  let calls = 0;
  const commands = [
    { id: "theme", label: "Ferrari theme", detail: "LEC / HAM", category: "Theme", run: () => calls++ },
    { id: "driver", label: "Charles Leclerc", detail: "LEC Ferrari", category: "Driver", run: () => calls++ },
    { id: "refresh", label: "Refresh dashboard", detail: "Busy", category: "Action", disabled: true, run: () => calls++ },
  ];
  assert.deepEqual(searchDashboardCommands(commands, "ferrari driver").map((item) => item.id), ["driver"]);
  assert.deepEqual(searchDashboardCommands(commands, "  LÉC ").map((item) => item.id), ["theme", "driver"]);
  assert.equal(searchDashboardCommands(commands, "no-such-action").length, 0);
  assert.equal(searchDashboardCommands(commands, "refresh")[0].disabled, true);
  assert.deepEqual(searchDashboardCommands(commands, ""), commands);
  assert.equal(calls, 0);
});
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
