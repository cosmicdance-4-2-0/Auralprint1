import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TAU, RAD_TO_DEG, PRESET_SCHEMA_VERSION } from "../src/js/core/constants.js";
import { CONFIG } from "../src/js/core/config.js";
import { normalizeOrbPhaseRad, normalizeOrbDef, preferences, runtime, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { normalizeOrbCollection, createOrb, duplicateOrb } from "../src/js/core/orb-collection.js";
import { encodePresetPayload, decodePresetPayload, sanitizePreset } from "../src/js/presets/preset-codec.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { state } from "../src/js/core/state.js";
import { Orb } from "../src/js/render/orb.js";
import { ColorPolicy } from "../src/js/render/color-policy.js";
import { VisualizerRuntime } from "../src/js/render/visualizer-runtime.js";
import { initOrbs, reconcileOrbs, duplicateRuntimeOrb, resetOrbsToDesignedPhases, resetOrbTrailsForTrack } from "../src/js/render/orb-runtime.js";

const close = (a, b, label = "modular equivalence") => assert.ok(Math.abs(a - b) < 1e-12, `${label}: ${a} != ${b}`);
const defaultOrb = CONFIG.defaults.orbs[0];
const canonical = phase => normalizeOrbDef({ ...defaultOrb, startAngleRad: phase }, defaultOrb);
const rawHash = payload => "#p=" + Buffer.from(JSON.stringify(payload)).toString("base64url");
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

for (const [name, input, expected] of [
  ["zero", 0, 0], ["negative zero", -0, 0], ["quarter", Math.PI / 2, Math.PI / 2],
  ["half", Math.PI, Math.PI], ["three quarters", 3 * Math.PI / 2, 3 * Math.PI / 2],
  ["TAU", TAU, 0], ["2TAU", 2 * TAU, 0], ["-TAU", -TAU, 0], ["-2TAU", -2 * TAU, 0],
  ["450 degrees", 5 * Math.PI / 2, Math.PI / 2], ["negative quarter", -Math.PI / 2, 3 * Math.PI / 2],
  ["many turns positive", 37 * TAU + .75, .75], ["many turns negative", -37 * TAU - .75, TAU - .75],
]) test(`RC-17 normalization: ${name}`, () => {
  const result = normalizeOrbPhaseRad(input);
  close(result, expected); assert.ok(result >= 0 && result < TAU);
  assert.equal(Object.is(result, -0), false);
  assert.equal(canonical(input).startAngleRad, result);
});

test("RC-17 normalization: canonical inputs retain exact bits, without degree quantization or boundary snapping", () => {
  for (const input of [Number.MIN_VALUE, .0000000001, .1, 1, Math.PI / 2, Math.PI, 3 * Math.PI / 2,
    .5 / RAD_TO_DEG, 1.5 / RAD_TO_DEG, 57.2958 / RAD_TO_DEG, 359.5 / RAD_TO_DEG,
    TAU - Number.EPSILON * 4]) {
    assert.equal(normalizeOrbPhaseRad(input), input);
    const encoded = encodePresetPayload({ orbs: [{ id: "precise", startAngleRad: input }] });
    assert.equal(sanitizePreset(decodePresetPayload(encoded)).orbs[0].startAngleRad, input);
  }
  for (const input of [Number.MAX_VALUE, -Number.MAX_VALUE, 1e100, -1e100, -Number.MIN_VALUE]) {
    const phase = normalizeOrbPhaseRad(input);
    assert.ok(Number.isFinite(phase) && phase >= 0 && phase < TAU);
  }
});

test("RC-17 normalization: invalid types/nonfinite numbers use only a finite normalized fallback", () => {
  for (const invalid of [undefined, null, false, true, "0", "1.5", "", [], {}, new Number(1), NaN, Infinity, -Infinity]) {
    assert.equal(normalizeOrbPhaseRad(invalid, 5 * Math.PI / 2), Math.PI / 2);
    assert.equal(normalizeOrbPhaseRad(invalid, -Math.PI / 2), 3 * Math.PI / 2);
    assert.equal(normalizeOrbPhaseRad(invalid, invalid), 0);
    assert.equal(normalizeOrbDef({ startAngleRad: invalid }, { startAngleRad: 4 * Math.PI }).startAngleRad, 0);
  }
  assert.equal(normalizeOrbPhaseRad(0, Math.PI), 0, "zero must not fall through to fallback");
  assert.equal(normalizeOrbDef({}, CONFIG.defaults.orbs[1]).startAngleRad, Math.PI);
});

for (let schema = 2; schema <= 10; schema++) test(`RC-17 presets: schema ${schema} applies the same phase boundary`, () => {
  const payload = { schema, prefs: { particleSafety: { maxEmissionsPerFrame: 0, maxActiveParticles: 16384 },
    orbs: [{ id: "A", startAngleRad: 4 * Math.PI, hueOffsetDeg: 42, bandIds: [7, null, 3, false, 0] },
      { id: "B", startAngleRad: -Math.PI / 2 }, { id: "C", startAngleRad: 5 * Math.PI / 2 },
      { id: "D", startAngleRad: .5 / RAD_TO_DEG, unknown: "strip" }], unknown: "strip" } };
  const next = sanitizePreset(decodePresetPayload(payload));
  assert.deepEqual(next.orbs.map(o => o.startAngleRad), [0, 3 * Math.PI / 2, Math.PI / 2, .5 / RAD_TO_DEG]);
  assert.deepEqual(next.orbs[0].bandIds, [7, 3, 0]); assert.equal(next.orbs[0].hueOffsetDeg, 42);
  assert.deepEqual(next.particleSafety, payload.prefs.particleSafety);
  assert.ok(!("unknown" in next) && !("unknown" in next.orbs[3]));
  const encoded = encodePresetPayload(next); assert.equal(encoded.schema, 10);
  assert.deepEqual(sanitizePreset(decodePresetPayload(encoded)), next);
  assert.notEqual(next.orbs[0].motion, next.orbs[1].motion);
  // Missing, invalid and explicit zero respect corresponding collection defaults.
  next.orbs = sanitizePreset({ schema, prefs: { orbs: [{}, { startAngleRad: "450" }, { startAngleRad: 0 }] } }).orbs;
  assert.deepEqual(next.orbs.map(o => o.startAngleRad), [0, Math.PI, 0]);
});

test("RC-17 presets: historical fixtures and both schema-9 formats retain unrelated canonical settings", () => {
  for (const original of [...fixture("legacy-presets"), fixture("schema-9-scene"), { schema: 10, prefs: fixture("schema-10-full") }]) {
    const baseline = sanitizePreset(decodePresetPayload(original));
    const changed = structuredClone(original);
    const sceneOrbs = changed.prefs.scene?.nodes.find(n => n.type === "orbs")?.settings;
    const orbs = changed.prefs.orbs || sceneOrbs;
    if (!orbs) continue; // Old partial presets default to unchanged canonical Orbs.
    orbs[0].startAngleRad = 5 * Math.PI / 2;
    const result = sanitizePreset(decodePresetPayload(changed));
    baseline.orbs[0].startAngleRad = Math.PI / 2;
    assert.deepEqual(result, baseline, `schema ${original.schema} unrelated settings`);
    if (sceneOrbs) {
      changed.prefs.orbs = [{ id: "top-level", startAngleRad: -Math.PI / 2 }];
      assert.equal(sanitizePreset(decodePresetPayload(changed)).orbs[0].startAngleRad, 3 * Math.PI / 2);
    }
  }
  const development = sanitizePreset({ schema: 10, prefs: { orbs: [{ startAngleRad: 4 * Math.PI,
    particles: { overlapRadiusPx: 99 } }] } });
  assert.equal(development.orbs[0].startAngleRad, 0);
  assert.ok(!("overlapRadiusPx" in development.orbs[0].particles));
  assert.equal(development.orbs[0].particles.minPlacementDistancePx, defaultOrb.particles.minPlacementDistancePx);
});

test("RC-17 collection: defaults, creation and independent duplication use canonical designed phase", () => {
  assert.deepEqual(normalizeOrbCollection(CONFIG.defaults.orbs), CONFIG.defaults.orbs);
  const orbs = []; createOrb(orbs, { template: canonical(-Math.PI / 2) });
  const copy = duplicateOrb(orbs, orbs[0].id);
  assert.equal(copy.startAngleRad, 3 * Math.PI / 2); assert.notEqual(copy.id, orbs[0].id);
  assert.notEqual(copy.particles, orbs[0].particles);
  const direct = []; createOrb(direct, { template: { ...defaultOrb, startAngleRad: 5 * Math.PI / 2 } });
  assert.equal(direct[0].startAngleRad, Math.PI / 2);
});

function withScene(callback) {
  const saved = { prefs: structuredClone(preferences), settings: runtime.settings, orbs: state.orbs,
    size: [state.widthPx, state.heightPx, state.dpr], ring: state.bands.ringPhaseRad,
    location: globalThis.location, history: globalThis.history };
  state.widthPx = state.heightPx = 1000; state.dpr = 1; state.orbs = [];
  globalThis.location = { hash: "", pathname: "/auralprint.html", search: "" };
  globalThis.history = { replaceState(_s, _t, url) { location.hash = url.slice(url.indexOf("#")); } };
  try { callback(); }
  finally { VisualizerRuntime.dispose(); replacePreferences(saved.prefs); runtime.settings = saved.settings;
    state.orbs = saved.orbs; [state.widthPx, state.heightPx, state.dpr] = saved.size;
    state.bands.ringPhaseRad = saved.ring; globalThis.location = saved.location; globalThis.history = saved.history; }
}

test("RC-17 URL/replacement: import/export preserve precise phase, canonical shape and independent runtime history", () => withScene(() => {
  assert.equal(PRESET_SCHEMA_VERSION, 10);
  location.hash = rawHash({ schema: 10, prefs: { orbs: [{ id: "A", startAngleRad: 4 * Math.PI },
    { id: "B", startAngleRad: 1.5 / RAD_TO_DEG }] } });
  assert.equal(UrlPreset.applyFromLocationHash(), true); resolveSettings(); initOrbs();
  const [a, b] = state.orbs; a.angleRad = 1.25;
  a.trail.emitAt(1, 2, 1, { r: 1, g: 0, b: 0 }); const tail = a.trail.particles.tail;
  UrlPreset.writeHashFromPrefs();
  const payload = JSON.parse(Buffer.from(location.hash.slice(3), "base64url"));
  assert.deepEqual(payload.prefs.orbs.map(o => o.startAngleRad), [0, 1.5 / RAD_TO_DEG]);
  payload.prefs.orbs.reverse(); payload.prefs.orbs[1].startAngleRad = 5 * Math.PI / 2;
  location.hash = rawHash(payload); assert.equal(UrlPreset.applyFromLocationHash(), true);
  resolveSettings(); reconcileOrbs();
  assert.equal(state.orbs[1], a); assert.equal(state.orbs[0], b);
  assert.equal(a.angleRad, 1.25); assert.equal(a.trail.particles.tail, tail);
  assert.equal(a.startAngleRad, Math.PI / 2);
  const def = duplicateRuntimeOrb("A"), copy = state.orbs.find(o => o.id === def.id);
  assert.notEqual(copy, a); assert.equal(copy.angleRad, Math.PI / 2); assert.equal(copy.startAngleRad, a.startAngleRad);
  assert.equal(copy.trail.particles.length, 0); assert.equal(a.trail.particles.tail, tail);
  const before = structuredClone(preferences);
  location.hash = rawHash({ schema: 11, prefs: {} }); assert.equal(UrlPreset.applyFromLocationHash(), false);
  assert.deepEqual(preferences, before);
  replacePreferences(structuredClone(CONFIG.defaults)); resolveSettings(); initOrbs(); resetOrbsToDesignedPhases();
  assert.deepEqual(preferences, CONFIG.defaults); assert.deepEqual(state.orbs.map(o => o.angleRad), [0, Math.PI]);
}));

test("RC-17 geometry: equivalent phases produce actual matching coordinates, waveform sampling and phase color", () => withScene(() => {
  const waveform = Float32Array.from({ length: 257 }, (_, i) => Math.sin(i / 10));
  for (const [first, equivalent] of [[0, TAU], [Math.PI / 2, 5 * Math.PI / 2], [-Math.PI / 2, 3 * Math.PI / 2]]) {
    for (const chirality of [-1, 1]) for (const speed of [0, 2]) {
      const make = phase => new Orb({ ...canonical(phase), chirality, colorSource: "angle",
        motion: { angularSpeedRadPerSec: speed }, particles: { ...defaultOrb.particles, emitPerSecond: 0 } });
      const a = make(first), b = make(equivalent);
      try {
        for (let i = 0; i < 10000; i++) {
          for (const orb of [a, b]) orb.step(0, i / 10, { energy01: .6, waveform }, null, 7, null, i ? .1 : 0);
          close(a.xSim, b.xSim, "x coordinate"); close(a.ySim, b.ySim, "y coordinate");
          assert.equal(a.radialDispPx, b.radialDispPx);
          assert.deepEqual(ColorPolicy.pickParticleColorRgb01(a.angleRad, a), ColorPolicy.pickParticleColorRgb01(b.angleRad, b));
          assert.ok(a.angleRad >= 0 && a.angleRad < TAU);
        }
        assert.notEqual(a.xSim, 0, "real coordinates were calculated");
        if (speed) assert.notEqual(a.angleRad, a.startAngleRad);
      } finally { a.trail.dispose(); b.trail.dispose(); }
    }
  }
}));

for (const phaseMode of ["orb", "free"]) test(`RC-17 lifecycle: moving edit and ${phaseMode} Ring preserve history until explicit visual reset`, () => withScene(() => {
  replacePreferences(sanitizePreset({ schema: 10, prefs: { orbs: [{ id: "A", startAngleRad: .25, chirality: 1,
    motion: { angularSpeedRadPerSec: 2 } }, { id: "B", startAngleRad: Math.PI }],
    bands: { overlay: { phaseMode, ringSpeedRadPerSec: 1 } } } }));
  resolveSettings(); initOrbs(); const a = state.orbs[0], b = state.orbs[1];
  const frame = { dtSec: 1 / 60, motionDtSec: .1, nowSec: 1, simPaused: false,
    analysisFrame: { ready: false, spectrum: { dominantIndex: 0 } } };
  VisualizerRuntime.update(frame);
  a.trail.emitAt(10, 20, 1, { r: 1, g: 0, b: 0 }); a.trail.emitAccumulator = .375;
  const angle = a.angleRad, ring = state.bands.ringPhaseRad, tail = a.trail.particles.tail;
  const governor = a.trail.governor, list = a.trail.particles;
  preferences.orbs[0] = normalizeOrbDef({ ...preferences.orbs[0], startAngleRad: 5 * Math.PI / 2 }, defaultOrb);
  resolveSettings(); reconcileOrbs();
  assert.equal(state.orbs[0], a); assert.equal(state.orbs[1], b); assert.equal(a.angleRad, angle);
  assert.equal(a.trail.particles, list); assert.equal(list.tail, tail); assert.equal(a.trail.governor, governor);
  assert.equal(a.trail.emitAccumulator, .375); assert.equal(state.bands.ringPhaseRad, ring);
  assert.equal(a.startAngleRad, Math.PI / 2);
  resetOrbTrailsForTrack(); assert.equal(a.angleRad, angle); assert.equal(a.startAngleRad, Math.PI / 2);
  assert.equal(a.trail.particles.length, 0); assert.equal(state.bands.ringPhaseRad, ring);
  a.trail.emitAt(10, 20, 1, { r: 1, g: 0, b: 0 }); resetOrbsToDesignedPhases();
  assert.equal(state.orbs[0], a); assert.equal(a.angleRad, Math.PI / 2); assert.equal(a.trail.particles.length, 0);
  assert.equal(state.bands.ringPhaseRad, phaseMode === "orb" ? Math.PI / 2 : 0);
  VisualizerRuntime.update({ ...frame, nowSec: 2 });
  close(a.angleRad, Math.PI / 2 + .2);
  if (phaseMode === "orb") assert.equal(state.bands.ringPhaseRad, a.angleRad, "current-frame dependency");
  else close(state.bands.ringPhaseRad, .1, "free Ring retains independent phase ownership");
}));
