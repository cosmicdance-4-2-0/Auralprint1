import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { LEGACY_SCHEMA_V9, PRESET_SCHEMA_VERSION } from "../src/js/core/constants.js";
import { normalizeOrbDef, preferences, replacePreferences, resolveSettings, runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { Orb } from "../src/js/render/orb.js";
import { readBulkOrbValue, applyBulkOrbValue } from "../src/js/ui/ui.js";

function hash(schema, prefs) {
  return "#p=" + Buffer.from(JSON.stringify({ schema, prefs })).toString("base64url");
}

function withLocation(fn) {
  const old = { location: globalThis.location, history: globalThis.history, atob: globalThis.atob, btoa: globalThis.btoa };
  const location = { pathname: "/", search: "", hash: "" };
  globalThis.location = location;
  globalThis.atob = (v) => Buffer.from(v, "base64").toString("binary");
  globalThis.btoa = (v) => Buffer.from(v, "binary").toString("base64");
  globalThis.history = { replaceState(_a, _b, url) { location.hash = url.slice(url.indexOf("#")); } };
  try { fn(location); } finally { Object.assign(globalThis, old); }
}

test("normalizeOrbDef owns and independently reconstructs every schema-10 behavior group", () => {
  const fallback = CONFIG.defaults.orbs[0];
  const normalized = normalizeOrbDef({
    id: "X", motion: { angularSpeedRadPerSec: 999, unknown: true },
    response: { minRadiusFrac: -2, maxRadiusFrac: 4, waveformRadialDisplaceFrac: 9 },
    particles: { sizeMaxPx: 2, sizeMinPx: 5, sizeToMinSec: 8, ttlSec: 1, emitPerSecond: 1, overlapRadiusPx: 99, unknown: true },
    trace: { lines: false, numLines: 99999, lineAlpha: 7, lineWidthPx: 20, lineColorMode: "bad", unknown: true },
  }, fallback);
  assert.deepEqual(Object.keys(normalized), ["id","chanId","bandIds","chirality","startAngleRad","hueOffsetDeg","colorSource","centerXFrac","centerYFrac","motion","response","particles","trace"]);
  assert.equal(normalized.motion.angularSpeedRadPerSec, CONFIG.limits.motion.angularSpeedRadPerSec.max);
  assert.equal(normalized.response.minRadiusFrac, CONFIG.limits.orbs.response.minRadiusFrac.min);
  assert.equal(normalized.response.maxRadiusFrac, CONFIG.limits.orbs.response.maxRadiusFrac.max);
  assert.equal(normalized.particles.sizeMinPx, normalized.particles.sizeMaxPx);
  assert.equal(normalized.particles.ttlSec, normalized.particles.sizeToMinSec);
  assert.equal("unknown" in normalized.trace, false);
  assert.notEqual(normalized.motion, fallback.motion);
});

test("schema 9 copies legacy global behavior independently into every Orb", () => withLocation((location) => {
  const old = structuredClone(preferences);
  const legacy = structuredClone(CONFIG.defaults);
  legacy.orbs = [{ id: "A" }, { id: "B" }];
  legacy.motion = { angularSpeedRadPerSec: .8, waveformRadialDisplaceFrac: .2 };
  legacy.audio.minRadiusFrac = .05; legacy.audio.maxRadiusFrac = .7;
  legacy.particles = { emitPerSecond: 300, sizeMaxPx: 7, sizeMinPx: 2, sizeToMinSec: 2, ttlSec: 5, overlapRadiusPx: 3 };
  legacy.trace = { lines: true, numLines: 40, lineAlpha: .4, lineWidthPx: 3, lineColorMode: "lastParticle" };
  location.hash = hash(LEGACY_SCHEMA_V9, legacy);
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  for (const orb of preferences.orbs) {
    assert.equal(orb.motion.angularSpeedRadPerSec, .8); assert.equal(orb.response.minRadiusFrac, .05);
    assert.equal(orb.response.maxRadiusFrac, .7); assert.equal(orb.particles.emitPerSecond, 300); assert.equal(orb.trace.numLines, 40);
  }
  preferences.orbs[0].trace.numLines = 10;
  assert.equal(preferences.orbs[1].trace.numLines, 40);
  replacePreferences(old); resolveSettings();
}));

test("schema 10 round-trip preserves divergent Orbs and omits obsolete globals", () => withLocation((location) => {
  const old = structuredClone(preferences);
  const next = structuredClone(CONFIG.defaults);
  next.orbs[0].motion.angularSpeedRadPerSec = .2; next.orbs[1].motion.angularSpeedRadPerSec = 2;
  next.orbs[0].particles.emitPerSecond = 20; next.orbs[1].particles.emitPerSecond = 900;
  next.orbs[0].trace.lines = false; next.orbs[1].trace.numLines = 100;
  replacePreferences(next); resolveSettings(); UrlPreset.writeHashFromPrefs();
  const payload = JSON.parse(Buffer.from(location.hash.slice(3), "base64url"));
  assert.equal(payload.schema, PRESET_SCHEMA_VERSION);
  for (const key of ["motion", "particles", "trace"]) assert.equal(key in payload.prefs, false);
  assert.equal("minRadiusFrac" in payload.prefs.audio, false);
  replacePreferences(structuredClone(CONFIG.defaults)); resolveSettings();
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  assert.equal(preferences.orbs[0].motion.angularSpeedRadPerSec, .2);
  assert.equal(preferences.orbs[1].particles.emitPerSecond, 900);
  replacePreferences(old); resolveSettings();
}));

test("runtime Orbs use independent motion, response, waveform, and particle settings", () => {
  const oldSettings = runtime.settings; const oldWidth = state.widthPx; const oldHeight = state.heightPx;
  runtime.settings = structuredClone(CONFIG.defaults); state.widthPx = state.heightPx = 1000;
  const aDef = structuredClone(CONFIG.defaults.orbs[0]); const bDef = structuredClone(CONFIG.defaults.orbs[1]);
  aDef.motion.angularSpeedRadPerSec = .1; bDef.motion.angularSpeedRadPerSec = 1;
  aDef.response = { minRadiusFrac: .1, maxRadiusFrac: .2, waveformRadialDisplaceFrac: 0 };
  bDef.response = { minRadiusFrac: .4, maxRadiusFrac: .8, waveformRadialDisplaceFrac: .5 };
  aDef.particles.emitPerSecond = 10; bDef.particles.emitPerSecond = 100;
  const a = new Orb(aDef); const b = new Orb(bDef); const band = { energy01: .5, waveform: [1, 1] };
  a.step(.1, 1, band, .5, 0); b.step(.1, 1, band, .5, 0);
  assert.notEqual(a.angleRad, b.angleRad); assert.notEqual(a.baseRadiusPx, b.baseRadiusPx);
  assert.equal(a.radialDispPx, 0); assert.notEqual(b.radialDispPx, 0);
  assert.ok(b.trail.emitAccumulator > a.trail.emitAccumulator);
  runtime.settings = oldSettings; state.widthPx = oldWidth; state.heightPx = oldHeight;
});

test("bulk Orb helpers report mixed state without mutation and unify only on interaction", () => {
  const orbs = structuredClone(CONFIG.defaults.orbs); orbs[1].trace.lines = false;
  assert.deepEqual(readBulkOrbValue(orbs, "trace", "lines"), { available: true, mixed: true, value: true });
  assert.equal(orbs[1].trace.lines, false);
  applyBulkOrbValue(orbs, "trace", "lines", true);
  assert.deepEqual(readBulkOrbValue(orbs, "trace", "lines"), { available: true, mixed: false, value: true });
});

test("schema 10 round-trips zero, one, two, and many Orb collections without defaults", () => withLocation((location) => {
  const old = structuredClone(preferences);
  try {
    for (const count of [0, 1, 2, 5]) {
      const next = structuredClone(CONFIG.defaults);
      next.orbs = Array.from({ length: count }, (_, index) => ({
        ...structuredClone(CONFIG.defaults.orbs[index % CONFIG.defaults.orbs.length]),
        id: `CUSTOM-${index}`,
        centerXFrac: index / 10,
      }));
      replacePreferences(next); resolveSettings(); UrlPreset.writeHashFromPrefs();
      replacePreferences(structuredClone(CONFIG.defaults)); resolveSettings();
      assert.equal(UrlPreset.applyFromLocationHash(), true);
      assert.equal(preferences.orbs.length, count);
      assert.deepEqual(preferences.orbs.map((orb) => orb.id), next.orbs.map((orb) => orb.id));
      assert.deepEqual(preferences.orbs.map((orb) => orb.centerXFrac), next.orbs.map((orb) => orb.centerXFrac));
      assert.equal(JSON.parse(Buffer.from(location.hash.slice(3), "base64url")).schema, PRESET_SCHEMA_VERSION);
    }
  } finally {
    replacePreferences(old); resolveSettings();
  }
}));

test("zero-Orb bulk reads and writes are explicit harmless no-ops", () => {
  const orbs = [];
  assert.deepEqual(readBulkOrbValue(orbs, "trace", "lines"), { available: false, mixed: false, value: undefined });
  assert.equal(applyBulkOrbValue(orbs, "trace", "lines", true), false);
  assert.deepEqual(orbs, []);
});
