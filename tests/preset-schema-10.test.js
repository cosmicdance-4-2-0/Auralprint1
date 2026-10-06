import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { CONFIG } from "../src/js/core/config.js";
import * as constants from "../src/js/core/constants.js";
import { normalizeOrbCollection } from "../src/js/core/orb-collection.js";
import { preferences, replacePreferences, runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { decodePresetPayload, encodePresetPayload, sanitizePreset } from "../src/js/presets/preset-codec.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";

// Produced by executing eae5e1f446aeb7bea4a2d8097dd5e53c5867ea35's
// actual writer, including its Scene persistence and Orb-settings modules.
const scene9 = JSON.parse(readFileSync(new URL("./fixtures/schema-9-scene.json", import.meta.url), "utf8"));
const full = JSON.parse(readFileSync(new URL("./fixtures/schema-10-full.json", import.meta.url), "utf8"));
// Schemas 5–8 use archived shipped sources, later 9 uses 2ae4191. Schemas
// 2–4 exercise formats explicitly accepted by the 0.1.10/schema-5 decoder;
// their original writers are not in this repository. See fixture provenance.
const legacy = JSON.parse(readFileSync(new URL("./fixtures/legacy-presets.json", import.meta.url), "utf8"));

function paths(value, prefix = "") {
  if (Array.isArray(value)) return prefix === "orbs" ? paths(value[0], "orbs[]") : [prefix];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => paths(child, prefix ? `${prefix}.${key}` : key)).sort();
  }
  return [prefix];
}

function readPath(value, path) {
  return path.split(".").reduce((current, key) => current[key], value);
}

function setPath(value, path, replacement) {
  const keys = path.split(".");
  const key = keys.pop();
  keys.reduce((current, key) => current[key], value)[key] = replacement;
}

function decodeRawHash(hash) {
  return JSON.parse(Buffer.from(hash.slice(3), "base64url").toString("utf8"));
}

function roundTrip(prefs, location) {
  replacePreferences(structuredClone(prefs));
  UrlPreset.writeHashFromPrefs();
  const payload = decodeRawHash(location.hash);
  replacePreferences(structuredClone(CONFIG.defaults));
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  return payload;
}

function rawHash(payload) {
  return "#p=" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function withUrl(callback) {
  const oldPrefs = structuredClone(preferences);
  const oldSettings = runtime.settings;
  const oldLocation = globalThis.location;
  const oldHistory = globalThis.history;
  const location = { pathname: "/auralprint.html", search: "?test=1", hash: "" };
  globalThis.location = location;
  globalThis.history = { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf("#")); } };
  try { return callback(location); }
  finally {
    replacePreferences(oldPrefs);
    runtime.settings = oldSettings;
    globalThis.location = oldLocation;
    globalThis.history = oldHistory;
  }
}

test("Schema 9 — Scene-node historical format recovers the actual emitted loss case", () => withUrl((location) => {
  location.hash = rawHash(scene9);
  replacePreferences(structuredClone(CONFIG.defaults));
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  assert.equal(preferences.orbs[0].id, "HISTORICAL-Z");
  assert.equal(preferences.orbs[0].chanId, "C");
  assert.deepEqual(preferences.orbs[0].bandIds, [7, 19]);
  assert.equal(preferences.orbs[0].hueOffsetDeg, 123);
  assert.equal(preferences.bands.overlay.enabled, true);
  assert.equal(preferences.bands.overlay.alpha, .42);
  assert.equal(preferences.bands.overlay.lineWidthPx, 4);
  // Node-relative centers used half the Scene bounds; schema-10 centers use
  // min(canvas dimensions), so they have no direct configuration equivalent.
  assert.equal(preferences.orbs[0].centerXFrac, 0);
  assert.equal(preferences.orbs[0].centerYFrac, 0);
  assert.equal("scene" in preferences, false);
}));

test("schema constants preserve 10 and every supported legacy integer 2–9", () => {
  assert.equal(constants.PRESET_SCHEMA_VERSION, 10);
  for (let schema = 2; schema <= 9; schema++) assert.equal(constants[`LEGACY_SCHEMA_V${schema}`], schema);
  assert.equal("LEGACY_SCHEMA_V10" in constants, false);
  assert.equal(Object.values(constants).includes(11), false);
});

test("field inventory recursively covers every CONFIG default with distinguishable legal fixture values", () => {
  // A new default automatically adds a path here; it must be represented in
  // the non-default fixture AND survive the independent round-trip assertion.
  // This guard does not use a second handwritten persistence field list.
  assert.deepEqual(paths(full), paths(CONFIG.defaults));
  assert.equal(paths(full).length, 52);
  for (const orb of full.orbs) assert.deepEqual(paths(orb), paths(CONFIG.defaults.orbs[0]));
  for (const path of paths(full).filter((path) => !path.startsWith("orbs[]"))) {
    assert.notDeepEqual(readPath(full, path), readPath(CONFIG.defaults, path), path);
  }
  for (const path of paths(full.orbs[0])) {
    assert.ok(full.orbs.some((orb, i) => !isDeepStrictEqual(readPath(orb, path), readPath(CONFIG.defaults.orbs[i % 2], path))), `non-default Orb value: ${path}`);
  }
});

test("complete non-default schema-10 fixture round-trips every field through URL and canonical replacement", () => withUrl((location) => {
  const payload = roundTrip(full, location);
  assert.deepEqual(payload, { schema: 10, prefs: full });
  assert.deepEqual(preferences, full);
  assert.deepEqual(preferences.orbs.map((orb) => orb.id), ["ORB-Z", "ORB-A", "CUSTOM-7"]);
  assert.deepEqual(Object.keys(payload).sort(), ["prefs", "schema"]);
  assert.deepEqual(Object.keys(payload.prefs).sort(), ["audio", "bands", "orbs", "timing", "visuals"]);
}));

test("pure codec round-trips the same complete fixture without browser globals or preference mutation", () => {
  const before = structuredClone(preferences);
  const settings = runtime.settings;
  const input = structuredClone(full);
  const payload = encodePresetPayload(input);
  const decoded = decodePresetPayload(JSON.parse(JSON.stringify(payload)));
  assert.equal(decoded.ok, true);
  const next = sanitizePreset(decoded);
  assert.deepEqual(next, full);
  assert.deepEqual(input, full);
  assert.deepEqual(preferences, before);
  assert.equal(runtime.settings, settings);
  next.orbs[0].trace.lineAlpha = 0;
  assert.equal(input.orbs[0].trace.lineAlpha, .23);
});

test("CONFIG.defaults round-trips semantically and remains immutable", () => withUrl((location) => {
  const expected = { ...structuredClone(CONFIG.defaults), orbs: normalizeOrbCollection(CONFIG.defaults.orbs) };
  const snapshot = structuredClone(CONFIG.defaults);
  const payload = roundTrip(CONFIG.defaults, location);
  assert.deepEqual(payload.prefs, expected);
  assert.deepEqual(preferences, expected);
  assert.deepEqual(CONFIG.defaults, snapshot);
}));

test("zero Orbs round-trip without fabricating defaults", () => withUrl((location) => {
  const empty = { ...structuredClone(full), orbs: [] };
  assert.deepEqual(roundTrip(empty, location).prefs, empty);
  assert.deepEqual(preferences, empty);
}));

test("duplicate Orb IDs retain canonical collection repair and array order", () => withUrl((location) => {
  const incoming = structuredClone(full);
  incoming.orbs = ["ORB0", "ORB0", "custom-id", "custom-id", ""].map((id, i) => ({ ...structuredClone(full.orbs[i % 3]), id }));
  location.hash = rawHash({ schema: 10, prefs: incoming });
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  assert.deepEqual(preferences.orbs.map((orb) => orb.id), ["ORB0", "ORB1", "custom-id", "ORB2", "ORB3"]);
  assert.deepEqual(preferences.orbs.map((orb) => orb.startAngleRad), incoming.orbs.map((orb) => orb.startAngleRad));
}));

test("unknown fields at every nesting level are stripped on both encode and decode", () => withUrl((location) => {
  const dirty = structuredClone(full);
  dirty.unknown = { marker: "UNKNOWN-ROOT" };
  for (const group of [dirty.visuals, dirty.audio, dirty.bands, dirty.bands.overlay, dirty.bands.rainbow, dirty.timing,
    ...dirty.orbs.flatMap((orb) => [orb, orb.motion, orb.response, orb.particles, orb.trace])]) group.unknown = "UNKNOWN-NESTED";
  assert.deepEqual(encodePresetPayload(dirty), { schema: 10, prefs: full });
  location.hash = rawHash({ schema: 10, prefs: dirty, unknown: true, runtime: { marker: true } });
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  assert.deepEqual(preferences, full);
  UrlPreset.writeHashFromPrefs();
  assert.deepEqual(decodeRawHash(location.hash), { schema: 10, prefs: full });
}));

test("runtime/session mutations and injected preference runtime fields never enter encoded payloads", () => withUrl((location) => {
  const oldState = { ...state };
  const oldRuntime = { ...runtime };
  try {
    replacePreferences(structuredClone(full));
    UrlPreset.writeHashFromPrefs();
    const before = decodeRawHash(location.hash);
    state.source = { kind: "stream", permission: { stream: "granted" }, streamMeta: { audioChannelCount: 2 }, sessionActive: true };
    state.audio = { filename: "private.wav", playbackPosition: 17, transportError: "runtime" };
    state.queue = { files: ["private.wav"], currentIndex: 1 };
    state.recording = { phase: "recording", chunks: ["private"], lastExportUrl: "blob:private" };
    state.bands = { energies01: [1], meta: { nyquistHz: 24000, effectiveFloorHz: 100, effectiveCeilingHz: 20000 } };
    state.analysisFrame = { tick: 99, waveform: [1] };
    state.orbs = [{ angleRad: 4, particles: [1], trail: { history: [1], emitAccumulator: 5 }, lastTimestampMs: 42 }];
    state.ui = { panelVisibility: { scene: false }, panelZOrder: ["audio"], workspaceLauncherCollapsed: true };
    runtime.settings = { sessionOnly: true };
    runtime.visualizers = [{ live: true }];
    UrlPreset.writeHashFromPrefs();
    assert.deepEqual(decodeRawHash(location.hash), before);
    // Mutable preferences must not become a back door for session data either.
    preferences.source = state.source;
    preferences.queue = state.queue;
    preferences.recording = state.recording;
    preferences.runtime = runtime;
    preferences.audio.playbackPosition = 17;
    preferences.audio.mediaElement = { currentTime: 17 };
    preferences.bands.energies01 = [1];
    preferences.bands.analysisFrame = state.analysisFrame;
    preferences.bands.effectiveFloorHz = 100;
    preferences.bands.effectiveCeilingHz = 20000;
    preferences.bands.overlay.ringPhaseRad = 4;
    preferences.ui = state.ui;
    preferences.orbs[0].angleRad = 4;
    preferences.orbs[0].trail = state.orbs[0].trail;
    preferences.orbs[0].particles.liveParticles = [1];
    preferences.orbs[0].motion.lastTimestampMs = 42;
    UrlPreset.writeHashFromPrefs();
    assert.deepEqual(decodeRawHash(location.hash), before);
    assert.deepEqual(before, { schema: 10, prefs: full });
  } finally {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, oldState);
    for (const key of Object.keys(runtime)) delete runtime[key];
    Object.assign(runtime, oldRuntime);
  }
}));

test("malformed values preserve existing clamps, defaults, enum rejection and dependent rules", () => withUrl((location) => {
  const input = {
    visuals: { backgroundColor: "red", particleColor: "#123" },
    audio: { fftSize: 123, smoothingTimeConstant: 2, rmsGain: -1, repeatMode: "bad", muted: "true", volume: 9 },
    bands: { count: 1, floorHz: 40000, ceilingHz: 3, distributionMode: "bad", particleColorSource: "bad",
      overlay: { enabled: "yes", connectAdjacent: 0, alpha: -2, pointSizePx: 99, minRadiusFrac: -1, maxRadiusFrac: 8,
        waveformRadialDisplaceFrac: "NaN", lineAlpha: 3, lineWidthPx: -4, phaseMode: "bad", ringSpeedRadPerSec: 999 },
      rainbow: { hueOffsetDeg: -5, saturation: 2, value: "NaN" } },
    timing: { maxDeltaTimeSec: "NaN" },
    orbs: [{ id: "BAD", chanId: "surround", bandIds: [7, "7", -1, 999, 2.2, "2", 19, 19], chirality: 0,
      startAngleRad: "NaN", hueOffsetDeg: 999, colorSource: "bad", centerXFrac: -2, centerYFrac: 2,
      motion: { angularSpeedRadPerSec: -1 },
      response: { minRadiusFrac: -1, maxRadiusFrac: 8, waveformRadialDisplaceFrac: "NaN" },
      particles: { emitPerSecond: 99999, sizeMaxPx: 2, sizeMinPx: 5, sizeToMinSec: 8, ttlSec: 1, overlapRadiusPx: -4 },
      trace: { lines: "false", numLines: 99999, lineAlpha: -3, lineWidthPx: 99, lineColorMode: "bad" } }],
  };
  const expected = structuredClone(CONFIG.defaults);
  expected.audio.smoothingTimeConstant = CONFIG.limits.audio.smoothingTimeConstant.max;
  expected.audio.rmsGain = CONFIG.limits.audio.rmsGain.min;
  expected.audio.volume = CONFIG.ui.volume.max;
  expected.bands.floorHz = expected.bands.ceilingHz = 40000;
  Object.assign(expected.bands.overlay, { alpha: 0, pointSizePx: 10, minRadiusFrac: .01, maxRadiusFrac: 1, lineAlpha: 1, lineWidthPx: 1, ringSpeedRadPerSec: constants.TAU });
  Object.assign(expected.bands.rainbow, { hueOffsetDeg: 0, saturation: 1 });
  expected.orbs = [{ ...structuredClone(CONFIG.defaults.orbs[0]), id: "BAD", chanId: "C", bandIds: [7, 2, 19], chirality: 1,
    hueOffsetDeg: 360, colorSource: "inherit", centerXFrac: -.95, centerYFrac: .95,
    motion: { angularSpeedRadPerSec: .01 },
    response: { minRadiusFrac: .01, maxRadiusFrac: 1, waveformRadialDisplaceFrac: .1 },
    particles: { emitPerSecond: 1000, sizeMaxPx: 2, sizeMinPx: 2, sizeToMinSec: 8, ttlSec: 8, overlapRadiusPx: .5 },
    trace: { lines: true, numLines: 1000, lineAlpha: 0, lineWidthPx: 6, lineColorMode: "dominantBand" } }];
  location.hash = rawHash({ schema: 10, prefs: input });
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  assert.deepEqual(preferences, expected);
  assert.deepEqual(encodePresetPayload(input).prefs, expected);
}));

test("nonfinite numbers and wrong nested types default without creating new sanitation semantics", () => {
  for (const invalid of [NaN, Infinity, -Infinity, null, "12", {}, []]) {
    const next = sanitizePreset({ schema: 10, prefs: { audio: { rmsGain: invalid }, timing: { maxDeltaTimeSec: invalid },
      bands: { floorHz: invalid }, orbs: [{ ...CONFIG.defaults.orbs[0], motion: invalid, response: invalid, particles: invalid, trace: invalid }] } });
    assert.deepEqual(next, { ...structuredClone(CONFIG.defaults), orbs: [structuredClone(CONFIG.defaults.orbs[0])] });
  }
  for (const invalid of [-1, 0]) {
    assert.equal(sanitizePreset({ schema: 10, prefs: { timing: { maxDeltaTimeSec: invalid } } }).timing.maxDeltaTimeSec, CONFIG.defaults.timing.maxDeltaTimeSec);
  }
  // AUD-002 remains separate: no new maximum for positive finite timing.
  assert.equal(sanitizePreset({ schema: 10, prefs: { timing: { maxDeltaTimeSec: 1e9 } } }).timing.maxDeltaTimeSec, 1e9);
});

test("URL application replaces preferences only and leaves runtime derivation caller-owned", () => withUrl((location) => {
  const settings = runtime.settings;
  replacePreferences({ ...structuredClone(CONFIG.defaults), stale: true });
  location.hash = rawHash({ schema: 10, prefs: full });
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  assert.deepEqual(preferences, full);
  assert.equal(runtime.settings, settings);
}));

test("codec distinguishes malformed and unsupported payloads while URL failures return false atomically", () => withUrl((location) => {
  for (const payload of [null, [], {}, { schema: 10 }, { schema: 10, prefs: null }, { schema: 10, prefs: [] }, { schema: 10, prefs: true }]) {
    assert.deepEqual(decodePresetPayload(payload), { ok: false, code: "malformed-payload" });
  }
  for (const schema of [1, 11, 0, "10", 10.5, undefined]) {
    assert.deepEqual(decodePresetPayload({ schema, prefs: {} }), { ok: false, code: "unsupported-schema" });
  }
  const before = structuredClone(preferences);
  const settings = runtime.settings;
  for (const hash of ["", "#other=value", "#p=%%%", "#p=", "#p=" + Buffer.from("{bad JSON").toString("base64url"),
    rawHash({ schema: 11, prefs: full }), rawHash({ schema: 10 }), rawHash({ schema: 10, prefs: [] })]) {
    location.hash = hash;
    assert.equal(UrlPreset.applyFromLocationHash(), false, hash);
    assert.deepEqual(preferences, before);
    assert.equal(runtime.settings, settings);
  }
}));

test("URL sanitation exceptions return false without replacing canonical preferences", () => withUrl((location) => {
  const before = structuredClone(preferences);
  const oldParse = JSON.parse;
  const incoming = { get audio() { throw new Error("application failure"); } };
  location.hash = rawHash({ schema: 10, prefs: {} });
  JSON.parse = () => ({ schema: 10, prefs: incoming });
  try { assert.equal(UrlPreset.applyFromLocationHash(), false); assert.deepEqual(preferences, before); }
  finally { JSON.parse = oldParse; }
}));

test("URL hash stays unpadded base64url UTF-8 JSON and preserves pathname/search", () => withUrl((location) => {
  const next = structuredClone(full);
  next.orbs[0].id = "ORB-宇宙-🎵";
  let writtenUrl;
  history.replaceState = (_state, _title, url) => { writtenUrl = url; location.hash = url.slice(url.indexOf("#")); };
  const payload = roundTrip(next, location);
  assert.match(location.hash, /^#p=[A-Za-z0-9_-]+$/);
  assert.equal(writtenUrl, location.pathname + location.search + location.hash);
  assert.deepEqual(payload, { schema: 10, prefs: next });
  assert.deepEqual(preferences, next);
}));

for (const path of paths(full).filter((path) => !path.startsWith("orbs[]"))) {
  test(`schema-10 field survives independently: ${path}`, () => withUrl((location) => {
    const expected = structuredClone(CONFIG.defaults);
    setPath(expected, path, readPath(full, path));
    assert.deepEqual(roundTrip(expected, location).prefs, expected);
    assert.deepEqual(preferences, expected);
  }));
}

for (const fixture of legacy) {
  const name = fixture.schema === 9 ? "Schema 9 — later top-level format" : `Schema ${fixture.schema} — documented legacy input`;
  test(`${name} migrates meaningful configuration and re-encodes as canonical schema 10`, () => withUrl((location) => {
    const beforeInput = structuredClone(fixture);
    // Missing legacy fields must never inherit current settings.
    replacePreferences(structuredClone(full));
    location.hash = rawHash({ schema: fixture.schema, prefs: fixture.prefs });
    assert.equal(UrlPreset.applyFromLocationHash(), true);
    for (const [path, value] of Object.entries(fixture.expected)) assert.deepEqual(readPath(preferences, path), value, `schema ${fixture.schema}: ${path}`);
    assert.deepEqual(paths(preferences), paths(CONFIG.defaults));
    if (fixture.schema <= 4) assert.deepEqual(preferences.orbs, CONFIG.defaults.orbs);
    UrlPreset.writeHashFromPrefs();
    const payload = decodeRawHash(location.hash);
    assert.equal(payload.schema, 10);
    assert.deepEqual(payload.prefs, preferences);
    assert.deepEqual(sanitizePreset(decodePresetPayload(payload)), preferences);
    assert.deepEqual(fixture, beforeInput);
  }));
}

test("schema-9 hybrids give whole top-level Orb/Ring settings precedence, including explicit emptiness", () => withUrl((location) => {
  for (const orbs of [[], legacy.find((fixture) => fixture.schema === 9).prefs.orbs]) {
    const prefs = structuredClone(scene9.prefs);
    prefs.orbs = structuredClone(orbs);
    prefs.bands.overlay = { enabled: false, alpha: .17 };
    location.hash = rawHash({ schema: 9, prefs });
    assert.equal(UrlPreset.applyFromLocationHash(), true);
    assert.deepEqual(preferences.orbs.map((orb) => orb.id), orbs.map((orb) => orb.id));
    assert.equal(preferences.bands.overlay.enabled, false);
    assert.equal(preferences.bands.overlay.alpha, .17);
    // An incomplete top-level Ring is not merged with the historical node.
    assert.equal(preferences.bands.overlay.lineWidthPx, CONFIG.defaults.bands.overlay.lineWidthPx);
  }
}));

test("schema-9 Scene recovery fills only absent top-level groups and honors Ring node.enabled", () => {
  const prefs = structuredClone(scene9.prefs);
  prefs.orbs = [];
  prefs.scene.nodes[1].enabled = false;
  prefs.scene.nodes[1].settings.enabled = true;
  const recovered = sanitizePreset({ schema: 9, prefs });
  assert.deepEqual(recovered.orbs, []);
  assert.equal(recovered.bands.overlay.enabled, false);
  assert.equal(recovered.bands.overlay.alpha, .42);
  delete prefs.orbs;
  prefs.bands.overlay = { enabled: false, alpha: .18 };
  const recoveredOrb = sanitizePreset({ schema: 9, prefs });
  assert.equal(recoveredOrb.orbs[0].id, "HISTORICAL-Z");
  assert.equal(recoveredOrb.bands.overlay.alpha, .18);
  const snapshot = structuredClone(prefs);
  sanitizePreset({ schema: 9, prefs });
  assert.deepEqual(prefs, snapshot);
});

test("schema-9 Scene layout/visibility and node-relative placement are intentionally discarded", () => {
  const prefs = structuredClone(scene9.prefs);
  const orbNode = prefs.scene.nodes[0];
  orbNode.enabled = false;
  orbNode.zIndex = 999;
  orbNode.bounds = { x: .1, y: .2, w: .3, h: .4 };
  orbNode.anchor = { x: .9, y: .8 };
  prefs.scene.selectedNodeId = "orbs-1";
  prefs.scene.editor = { expanded: true };
  prefs.scene.camera = { zoom: 2 };
  const normalized = sanitizePreset({ schema: 9, prefs });
  assert.equal(normalized.orbs.length, 2); // generic node visibility is not Orb count
  assert.deepEqual(normalized.orbs.map((orb) => orb.id), ["HISTORICAL-Z", "ORB1"]);
  assert.equal(normalized.orbs[0].centerXFrac, 0);
  assert.equal(normalized.orbs[0].centerYFrac, 0);
  assert.equal("scene" in normalized, false);
  assert.equal("bounds" in normalized.orbs[0], false);
  assert.deepEqual(encodePresetPayload(normalized).prefs, normalized);
});

test("schema-9 Scene recovery handles empty Orbs and malformed/unknown nodes safely", () => {
  const prefs = structuredClone(scene9.prefs);
  prefs.scene.nodes[0].settings = [];
  prefs.scene.nodes.unshift(null, { type: "unknown", settings: { marker: 1 } }, { type: "orbs", settings: 123 });
  assert.deepEqual(sanitizePreset({ schema: 9, prefs }).orbs, []);
  assert.deepEqual(sanitizePreset({ schema: 9, prefs: { scene: { nodes: "bad" } } }), CONFIG.defaults);
  // Scene form belongs only to the collided legacy schema, never schema 10.
  assert.deepEqual(sanitizePreset({ schema: 10, prefs: { scene: scene9.prefs.scene } }), CONFIG.defaults);
  prefs.orbs = null; // present-but-invalid top-level values still win
  prefs.bands.overlay = null;
  const next = sanitizePreset({ schema: 9, prefs });
  assert.deepEqual(next.orbs, CONFIG.defaults.orbs);
  assert.deepEqual(next.bands.overlay, CONFIG.defaults.bands.overlay);
});

test("every schema <=9 with Orbs copies global behavior into independent nested ownership", () => {
  for (const schema of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const prefs = structuredClone(legacy.find((fixture) => fixture.schema === 9).prefs);
    const snapshot = structuredClone(prefs);
    const next = sanitizePreset({ schema, prefs });
    for (const group of ["motion", "response", "particles", "trace"]) {
      assert.deepEqual(next.orbs[0][group], next.orbs[1][group]);
      assert.notEqual(next.orbs[0][group], next.orbs[1][group]);
      assert.notEqual(next.orbs[0][group], prefs[group]);
    }
    next.orbs[0].motion.angularSpeedRadPerSec = 2;
    next.orbs[0].response.minRadiusFrac = .3;
    next.orbs[0].particles.emitPerSecond = 900;
    next.orbs[0].trace.lineAlpha = .9;
    assert.equal(next.orbs[1].motion.angularSpeedRadPerSec, .82);
    assert.equal(next.orbs[1].response.minRadiusFrac, .13);
    assert.equal(next.orbs[1].particles.emitPerSecond, 320);
    assert.equal(next.orbs[1].trace.lineAlpha, .42);
    assert.deepEqual(prefs, snapshot);
  }
});

test("bandNames migration validates unique indices and canonical bandIds take precedence", () => {
  const next = sanitizePreset({ schema: 6, prefs: { orbs: [
    { id: "names", bandNames: ["Eternal Core", "Iron Heartbeat", "unknown", "Eternal Core", 5] },
    { id: "ids", bandIds: [7, 7, "19", -1], bandNames: ["Eternal Core"] },
  ] } });
  assert.deepEqual(next.orbs[0].bandIds, [0, 2]);
  assert.deepEqual(next.orbs[1].bandIds, [7, 19]);
  assert.equal("bandNames" in next.orbs[0], false);
});

test("legacy logSpacing boolean migrates only when canonical distribution is absent", () => {
  for (const [value, expected] of [[true, "log"], [false, "linear"]]) {
    assert.equal(sanitizePreset({ schema: 7, prefs: { bands: { logSpacing: value } } }).bands.distributionMode, expected);
  }
  for (const [distributionMode, expected] of [["mel", "mel"], ["bad", CONFIG.defaults.bands.distributionMode]]) {
    assert.equal(sanitizePreset({ schema: 7, prefs: { bands: { distributionMode, logSpacing: false } } }).bands.distributionMode, expected);
  }
});

test("legacy audio.loop migrates with valid canonical repeatMode precedence", () => {
  for (const [loop, expected] of [[true, "one"], [false, "none"]]) {
    assert.equal(sanitizePreset({ schema: 5, prefs: { audio: { loop } } }).audio.repeatMode, expected);
  }
  assert.equal(sanitizePreset({ schema: 5, prefs: { audio: { repeatMode: "all", loop: true } } }).audio.repeatMode, "all");
  assert.equal(sanitizePreset({ schema: 5, prefs: { audio: { repeatMode: "bad", loop: true } } }).audio.repeatMode, "one");
});

test("schema-10 output strips all legacy aliases, global behavior and historical Scene state", () => withUrl((location) => {
  for (const fixture of [...legacy, scene9]) {
    location.hash = rawHash({ schema: fixture.schema, prefs: fixture.prefs });
    assert.equal(UrlPreset.applyFromLocationHash(), true);
    UrlPreset.writeHashFromPrefs();
    const { prefs } = decodeRawHash(location.hash);
    for (const key of ["motion", "particles", "trace", "scene"]) assert.equal(key in prefs, false);
    for (const key of ["loop", "minRadiusFrac", "maxRadiusFrac"]) assert.equal(key in prefs.audio, false);
    for (const key of ["names", "logSpacing"]) assert.equal(key in prefs.bands, false);
    for (const orb of prefs.orbs) {
      for (const key of ["bandId", "bandNames", "centerX", "centerY"]) assert.equal(key in orb, false);
    }
    assert.deepEqual(paths(prefs), paths(CONFIG.defaults));
  }
}));

test("encoding polluted current preferences strips legacy-only paths without overriding canonical values", () => {
  const prefs = structuredClone(full);
  prefs.motion = { angularSpeedRadPerSec: 2 };
  prefs.particles = { emitPerSecond: 900 };
  prefs.trace = { lines: true };
  prefs.scene = scene9.prefs.scene;
  prefs.audio.loop = true;
  prefs.audio.minRadiusFrac = .3;
  prefs.audio.maxRadiusFrac = .9;
  prefs.bands.names = ["legacy"];
  prefs.bands.logSpacing = true;
  prefs.orbs[0].bandId = "C";
  prefs.orbs[0].bandNames = ["Eternal Core"];
  assert.deepEqual(encodePresetPayload(prefs), { schema: 10, prefs: full });
});

test("partial presets replace live preferences with canonical defaults for omitted settings", () => withUrl((location) => {
  replacePreferences(structuredClone(full));
  location.hash = rawHash({ schema: 10, prefs: { visuals: { backgroundColor: "#654321" } } });
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  const expected = structuredClone(CONFIG.defaults);
  expected.visuals.backgroundColor = "#654321";
  assert.deepEqual(preferences, expected);
}));
