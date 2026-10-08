import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIG } from "../src/js/core/config.js";
import { BAND_NAMES, sanitizeOrbBandIds, normalizeOrbDef, preferences, runtime, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { normalizeOrbCollection, duplicateOrb } from "../src/js/core/orb-collection.js";
import { decodePresetPayload, encodePresetPayload, sanitizePreset } from "../src/js/presets/preset-codec.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { parseBandSelection } from "../src/js/ui/orb-band-picker.js";
import { createAnalysisFrame, updateAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { state } from "../src/js/core/state.js";
import { Orb } from "../src/js/render/orb.js";
import { initOrbs, reconcileOrbs, duplicateRuntimeOrb } from "../src/js/render/orb-runtime.js";
import { VisualizerRuntime, createVisualizerRuntime, selectOrbAnalysis } from "../src/js/render/visualizer-runtime.js";

const highest = BAND_NAMES.length - 1;
const invalid = [null, undefined, false, true, "", " \t", "17", " 17 ", [], [7], [[3]], {}, -1, BAND_NAMES.length, 1.5, NaN, Infinity, -Infinity];
const malformed = [null, false, "", [], true];
const mixed = [7, null, 3, false, 7, 0, true, 3];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const rawHash = payload => "#p=" + Buffer.from(JSON.stringify(payload)).toString("base64url");

for (const [label, value, expected] of [
  ["zero", 0, [0]], ["highest", highest, [highest]], ["interior", 17, [17]],
  ...invalid.map((v, i) => [`invalid type/value ${i}`, v, []]),
]) test(`RC-16: ${label}`, () => assert.deepEqual(sanitizeOrbBandIds([value]), expected));

test("RC-16: stable first occurrences, fresh arrays, empty/all-invalid collections and legacy names", () => {
  assert.deepEqual(sanitizeOrbBandIds([highest, 0, 17, highest, 0]), [highest, 0, 17]);
  assert.deepEqual(sanitizeOrbBandIds(mixed), [7, 3, 0]);
  assert.deepEqual(sanitizeOrbBandIds(invalid), []);
  assert.deepEqual(sanitizeOrbBandIds([]), []);
  assert.deepEqual(sanitizeOrbBandIds(undefined), []);
  assert.deepEqual(normalizeOrbCollection([]), []);
  const names = [BAND_NAMES[7], null, BAND_NAMES[0], "unknown", BAND_NAMES[7]];
  assert.deepEqual(sanitizeOrbBandIds(undefined, names), [7, 0]);
  assert.deepEqual(sanitizeOrbBandIds([], names), [], "explicit empty targets take precedence");
  const fallback = { ...CONFIG.defaults.orbs[0], bandIds: [17, 0] };
  assert.deepEqual(normalizeOrbDef({}, fallback).bandIds, [17, 0], "missing field uses existing fallback");
  assert.deepEqual(normalizeOrbDef({ bandIds: invalid }, fallback).bandIds, [], "invalid explicit targets do not inherit fallback");
  assert.deepEqual(normalizeOrbDef({ bandNames: names }, fallback).bandIds, [7, 0]);
  assert.deepEqual(normalizeOrbCollection([{ id: "missing" }])[0].bandIds, []);
  const frozen = Object.freeze([7, 0, 7]);
  const out = sanitizeOrbBandIds(frozen);
  assert.deepEqual(out, [7, 0]);
  assert.notEqual(out, frozen);
});

test("RC-16: independent Orb normalization and duplication retain configuration and ordering", () => {
  const orbs = normalizeOrbCollection([
    { id: "A", chanId: "L", bandIds: mixed, hueOffsetDeg: 42 },
    { id: "B", chanId: "R", bandIds: mixed, centerXFrac: .2 },
    { id: "C", chanId: "C", bandIds: malformed },
  ]);
  assert.deepEqual(orbs.map(o => o.bandIds), [[7, 3, 0], [7, 3, 0], []]);
  assert.notEqual(orbs[0].bandIds, orbs[1].bandIds);
  const duplicate = duplicateOrb(orbs, "A");
  assert.deepEqual(orbs.map(o => o.id), ["A", duplicate.id, "B", "C"]);
  assert.deepEqual({ ...duplicate, id: "A" }, orbs[0]);
  assert.notEqual(duplicate.bandIds, orbs[0].bandIds);
  duplicate.bandIds.push(highest);
  assert.deepEqual(orbs[0].bandIds, [7, 3, 0]);
  assert.deepEqual(orbs[2].bandIds, [7, 3, 0]);
  assert.equal(orbs[2].centerXFrac, .2);
});

test("RC-16: validated human text remains an explicit numbers-only model boundary", () => {
  const parsed = parseBandSelection(`7, 3; 7 0 ${highest}`);
  assert.deepEqual(parsed, { ids: [7, 3, 0, highest], error: "" });
  assert.ok(parsed.ids.every(v => typeof v === "number"));
  assert.deepEqual(normalizeOrbDef({ bandIds: parsed.ids }).bandIds, parsed.ids);
  assert.deepEqual(parseBandSelection(" \t"), { ids: [], error: "" });
  for (const text of ["true", "null", "[]", "-1", "1.5", "1e2", String(BAND_NAMES.length)]) {
    assert.equal(parseBandSelection(text).ids, null, text);
  }
});

test("RC-16: schemas 2–10 discard entries without losing scenes or reviving aliases", () => {
  for (let schema = 2; schema <= 10; schema++) {
    const decoded = decodePresetPayload({ schema, prefs: { visuals: { backgroundColor: "#123456" }, orbs: [
      { id: "A", chanId: "R", bandIds: [...mixed, "17", highest], hueOffsetDeg: 42 },
      { id: "B", chanId: "L", bandIds: malformed },
      { id: "legacy", bandNames: [BAND_NAMES[7], BAND_NAMES[0]] },
    ] } });
    assert.equal(decoded.ok, true);
    const normalized = sanitizePreset(decoded);
    assert.deepEqual(normalized.orbs.map(o => o.bandIds), [[7, 3, 0, highest], [], [7, 0]]);
    assert.deepEqual(normalized.orbs.map(o => o.id), ["A", "B", "legacy"]);
    assert.equal(normalized.orbs[0].chanId, "R");
    assert.equal(normalized.orbs[0].hueOffsetDeg, 42);
    assert.equal(normalized.visuals.backgroundColor, "#123456");
    assert.ok(normalized.orbs.every(o => !("bandNames" in o) && !("bandId" in o)));
    const encoded = encodePresetPayload(normalized);
    assert.equal(encoded.schema, 10);
    assert.deepEqual(sanitizePreset(decodePresetPayload(JSON.parse(JSON.stringify(encoded)))), normalized);
  }
});

test("RC-16: inspected historical fixtures keep all expected values, including both schema-9 forms", () => {
  const fixtures = JSON.parse(readFileSync(new URL("./fixtures/legacy-presets.json", import.meta.url)));
  for (const fixture of fixtures) {
    const normalized = sanitizePreset(decodePresetPayload(fixture));
    for (const [path, expected] of Object.entries(fixture.expected)) {
      assert.deepEqual(path.split(".").reduce((value, key) => value[key], normalized), expected, `schema ${fixture.schema}: ${path}`);
    }
    for (const orb of fixture.prefs.orbs || []) assert.ok((orb.bandIds || []).every(Number.isInteger));
  }
  const scene = JSON.parse(readFileSync(new URL("./fixtures/schema-9-scene.json", import.meta.url)));
  const recovered = sanitizePreset(decodePresetPayload(scene));
  assert.deepEqual(recovered.orbs.map(o => o.bandIds), [[7, 19], []]);
  const nodes = scene.prefs.scene.nodes;
  const original = nodes.find(n => n.type === "orbs");
  original.settings[0].bandIds = mixed;
  original.settings[1].bandIds = malformed;
  assert.deepEqual(sanitizePreset(decodePresetPayload(scene)).orbs.map(o => o.bandIds), [[7, 3, 0], []]);
  scene.prefs.orbs = [{ id: "top-level", bandIds: [highest, 0] }];
  assert.deepEqual(sanitizePreset(decodePresetPayload(scene)).orbs.map(o => [o.id, o.bandIds]), [["top-level", [highest, 0]]]);
});

function withScene(callback) {
  const saved = { prefs: structuredClone(preferences), settings: runtime.settings, orbs: state.orbs,
    size: [state.widthPx, state.heightPx, state.dpr], phase: state.bands.ringPhaseRad,
    location: globalThis.location, history: globalThis.history };
  globalThis.location = { hash: "", pathname: "/auralprint.html", search: "" };
  globalThis.history = { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf("#")); } };
  state.widthPx = state.heightPx = 1000; state.dpr = 1; state.orbs = [];
  try { return callback(); }
  finally {
    VisualizerRuntime.dispose();
    replacePreferences(saved.prefs); runtime.settings = saved.settings; state.orbs = saved.orbs;
    [state.widthPx, state.heightPx, state.dpr] = saved.size; state.bands.ringPhaseRad = saved.phase;
    globalThis.location = saved.location; globalThis.history = saved.history;
  }
}

test("RC-16: original URL import and actual Orb.step radius now match the empty control", t => withScene(() => {
  location.hash = rawHash({ schema: 10, prefs: { orbs: [{ id: "X", bandIds: malformed }] } });
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  assert.deepEqual(preferences.orbs[0].bandIds, []);
  const frame = { channels: Object.fromEntries(["L", "R", "C"].map(c => [c, { energy01: .9, bandEnergies01: [0, 0, ...Array(highest - 1).fill(.9)] }])) };
  const radius = def => {
    const orb = new Orb(def), selection = selectOrbAnalysis(orb, frame);
    orb.step(1 / 60, 1, selection.band, selection.energyOverride01, 0);
    orb.trail.dispose(); return orb.baseRadiusPx;
  };
  assert.equal(radius(preferences.orbs[0]), 721);
  assert.equal(radius({ ...preferences.orbs[0], bandIds: [] }), 721);
  assert.equal(radius({ ...preferences.orbs[0], bandIds: [0] }), 10, "deliberately selected silent Band 0 still targets Band 0");
  t.diagnostic("Original malformed URL radius: 721 px; empty control: 721 px; explicit silent Band 0: 10 px.");
}));

test("RC-16: real AnalysisFrame/runtime responses preserve distinct L/R/C energy, waveform and radius", t => withScene(() => {
  const samples = {}, bandState = { channels: {}, dominantIndex: highest };
  for (const [chanId, energy01, waveform, e0, e3, e7] of [
    ["L", .9, 1, .1, .2, .8], ["R", .3, -.5, .2, .4, .6], ["C", .6, .25, .3, .8, .4],
  ]) {
    samples[chanId] = { energy01, timeDomain: Float32Array.of(waveform), rms: energy01 };
    const energies01 = Array(BAND_NAMES.length).fill(0);
    energies01[0] = e0; energies01[3] = e3; energies01[7] = e7;
    bandState.channels[chanId] = { energies01 };
  }
  const frame = updateAnalysisFrame(createAnalysisFrame(), { ready: true, monoLike: false, bands: samples }, bandState);
  assert.equal(frame.spectrum.energies01, bandState.channels.C.energies01);
  const definitions = ["L", "R", "C"].flatMap(chanId => [
    { id: `${chanId}-invalid`, chanId, bandIds: invalid },
    { id: `${chanId}-empty`, chanId, bandIds: [] },
    { id: `${chanId}-mixed`, chanId, bandIds: mixed },
    { id: `${chanId}-valid`, chanId, bandIds: [7, 3, 0] },
    { id: `${chanId}-zero`, chanId, bandIds: [0] },
  ]);
  runtime.settings = sanitizePreset({ schema: 10, prefs: { orbs: definitions } });
  const orbs = runtime.settings.orbs.map(def => new Orb(def));
  const visualizers = createVisualizerRuntime(); visualizers.rebuild(orbs);
  const before = structuredClone(bandState);
  try {
    visualizers.update({ dtSec: 0, motionDtSec: 0, nowSec: 1, simPaused: false, analysisFrame: frame });
    const rows = [];
    for (const chanId of ["L", "R", "C"]) {
      const [allInvalid, empty, mixedOrb, valid, zero] = orbs.filter(o => o.chanId === chanId);
      const channel = frame.channels[chanId], energies = channel.bandEnergies01;
      const selected = (energies[7] + energies[3] + energies[0]) / 3;
      close(empty.baseRadiusPx, 10 + 790 * channel.energy01);
      assert.equal(allInvalid.baseRadiusPx, empty.baseRadiusPx);
      assert.equal(allInvalid.radialDispPx, empty.radialDispPx);
      assert.deepEqual(allInvalid.bandIds, []);
      assert.equal(selectOrbAnalysis(allInvalid, frame).energyOverride01, null);
      assert.equal(selectOrbAnalysis(allInvalid, frame).band, channel);
      close(valid.baseRadiusPx, 10 + 790 * selected);
      assert.equal(mixedOrb.baseRadiusPx, valid.baseRadiusPx);
      close(zero.baseRadiusPx, 10 + 790 * energies[0]);
      assert.notEqual(zero.baseRadiusPx, empty.baseRadiusPx);
      for (const orb of [allInvalid, empty, mixedOrb, valid, zero]) {
        close(orb.radialDispPx, orb.baseRadiusPx * orb.response.waveformRadialDisplaceFrac * channel.waveform[0]);
        const radius = orb.baseRadiusPx + orb.radialDispPx;
        close(orb.xSim, radius * Math.cos(orb.angleRad) + orb.centerXFrac * 1000);
        close(orb.ySim, radius * Math.sin(orb.angleRad) + orb.centerYFrac * 1000);
      }
      rows.push({ chanId, fullRadius: empty.baseRadiusPx, selectedRadius: valid.baseRadiusPx, band0Radius: zero.baseRadiusPx });
    }
    assert.equal(new Set(rows.map(r => r.fullRadius)).size, 3);
    assert.equal(new Set(rows.map(r => r.selectedRadius)).size, 3);
    assert.deepEqual(bandState, before, "visual consumers do not mutate analysis arrays");
    assert.equal(frame.spectrum.dominantIndex, highest);
    t.diagnostic(JSON.stringify(rows));
  } finally { visualizers.dispose(); }
}));

test("RC-16: URL round-trip, runtime reconciliation and duplication preserve scene/history and errors", () => withScene(() => {
  location.hash = rawHash({ schema: 10, prefs: { orbs: [{ id: "A", chanId: "R", bandIds: mixed, hueOffsetDeg: 42 }, { id: "B", bandIds: malformed }] } });
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  resolveSettings(); initOrbs();
  const a = state.orbs[0]; a.angleRad = 1.25;
  a.trail.emitAt(1, 2, 1, { r: 1, g: 0, b: 0 });
  const tail = a.trail.particles.tail;
  UrlPreset.writeHashFromPrefs();
  const encoded = JSON.parse(Buffer.from(location.hash.slice(3), "base64url"));
  assert.equal(encoded.schema, 10);
  assert.deepEqual(encoded.prefs.orbs.map(o => o.bandIds), [[7, 3, 0], []]);
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  preferences.orbs[0].bandIds = [highest, null, 0, true];
  resolveSettings(); reconcileOrbs();
  assert.equal(state.orbs[0], a);
  assert.deepEqual(a.bandIds, [highest, 0]);
  assert.equal(a.angleRad, 1.25);
  assert.equal(a.trail.particles.tail, tail);
  const duplicate = duplicateRuntimeOrb("A"), copy = state.orbs.find(o => o.id === duplicate.id);
  assert.deepEqual(copy.bandIds, [highest, 0]);
  assert.notEqual(copy.bandIds, a.bandIds);
  assert.equal(copy.trail.particles.length, 0);
  assert.equal(copy.angleRad, copy.startAngleRad);
  assert.equal(a.trail.particles.tail, tail);
  const saved = structuredClone(preferences);
  for (const payload of [{ schema: 11, prefs: {} }, { schema: 10, prefs: { orbs: Array.from({ length: CONFIG.limits.orbs.maxCount + 1 }, () => ({ bandIds: malformed })) } }]) {
    location.hash = rawHash(payload);
    assert.equal(UrlPreset.applyFromLocationHash(), false);
    assert.deepEqual(preferences, saved);
  }
  location.hash = "#p=invalid-base64!";
  assert.equal(UrlPreset.applyFromLocationHash(), false);
  assert.deepEqual(preferences, saved);
  runtime.settings.orbs = [{ ...runtime.settings.orbs[0] }, { ...runtime.settings.orbs[0] }];
  assert.throws(reconcileOrbs, /unique/);
  assert.equal(state.orbs[0], a);
}));
