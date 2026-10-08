import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { CONFIG } from "../src/js/core/config.js";
import { PRESET_SCHEMA_VERSION } from "../src/js/core/constants.js";
import { preferences, runtime, replacePreferences, resolveSettings, normalizeOrbDef } from "../src/js/core/preferences.js";
import { normalizeOrbCollection } from "../src/js/core/orb-collection.js";
import { normalizeMaxDeltaTimeSec, simulationDeltaSec } from "../src/js/core/timing.js";
import { decodePresetPayload, encodePresetPayload, sanitizePreset } from "../src/js/presets/preset-codec.js";
import { TrailSystem } from "../src/js/render/trail-system.js";

const ceiling = 1 / 30;
const rgb = { r: 1, g: .5, b: 0 };
const timingCases = [
  [1 / 60, 1 / 60], [ceiling, ceiling], [1 / 120, 1 / 120],
  [120, ceiling], [1e6, ceiling], [Number.MAX_VALUE, ceiling],
  ...[-1, 0, NaN, Infinity, -Infinity, undefined, null, "120", {}, []].map(value => [value, ceiling]),
];

test("RC-15 phase 1: emitted particles at identical and nearby coordinates coexist until real-time TTL", () => {
  const trail = new TrailSystem();
  const settings = { ...CONFIG.defaults.orbs[0].particles, ttlSec: 1 };
  for (const [x, y, now] of [[10, 20, 0], [10, 20, .25], [10.1, 20.1, .5]]) {
    trail.updateAndEmit(1 / 60, now, x, y, rgb, settings);
  }
  assert.equal(trail.particles.length, 12);
  assert.deepEqual(Array.from(trail.particles).map(p => [p.xSim, p.ySim, p.bornSec]),
    [[10,20,0], [10,20,.25], [10.1,20.1,.5]].flatMap(p => Array.from({length: 4}, () => p)));
  trail.updateAndEmit(0, 1, 0, 0, rgb, settings);
  assert.equal(trail.particles.length, 8);
  assert.ok(Array.from(trail.particles).every(p => p.bornSec > 0));
  trail.updateAndEmit(0, 1.5, 0, 0, rgb, settings);
  assert.equal(trail.particles.length, 0);
});

test("RC-15 phase 1: trail reset clears retained particles and fractional emission state", () => {
  const trail = new TrailSystem(), settings = CONFIG.defaults.orbs[0].particles;
  trail.updateAndEmit(1.5 / settings.emitPerSecond, 0, 2, 3, rgb, settings);
  assert.equal(trail.particles.length, 1);
  assert.equal(trail.emitAccumulator, .5);
  trail.reset();
  assert.deepEqual(Array.from(trail.particles), []);
  assert.equal(trail.emitAccumulator, 0);
  trail.updateAndEmit(.5 / settings.emitPerSecond, 1, 2, 3, rgb, settings);
  assert.equal(trail.particles.length, 0);
});

test("RC-15 phase 1: development schema-10 overlap input decodes, strips, and preserves all remaining fields", () => {
  const canonical = JSON.parse(readFileSync(new URL("./fixtures/schema-10-full.json", import.meta.url), "utf8"));
  const dirty = structuredClone(canonical);
  dirty.orbs.forEach((orb, i) => { orb.particles.overlapRadiusPx = i + 2; orb.particles.unknown = true; });
  dirty.unknown = true;
  const snapshot = structuredClone(dirty);
  const decoded = decodePresetPayload({ schema: 10, prefs: dirty });
  assert.equal(decoded.ok, true);
  const next = sanitizePreset(decoded);
  assert.deepEqual(next, canonical);
  assert.deepEqual(encodePresetPayload(next), { schema: 10, prefs: canonical });
  assert.deepEqual(encodePresetPayload(dirty), { schema: 10, prefs: canonical });
  assert.deepEqual(dirty, snapshot);
  const fallback = { ...CONFIG.defaults.orbs[0], particles: dirty.orbs[0].particles };
  for (const orb of [...CONFIG.defaults.orbs, ...normalizeOrbCollection(dirty.orbs), normalizeOrbDef({}, fallback)]) {
    assert.equal("overlapRadiusPx" in orb.particles, false);
    assert.deepEqual(Object.keys(orb.particles), ["emitPerSecond", "sizeMaxPx", "sizeMinPx", "sizeToMinSec", "ttlSec"]);
  }
  assert.equal(PRESET_SCHEMA_VERSION, 10);
});

test("RC-15 phase 1: timing ceiling is frozen CONFIG authority across codec and preference resolution", () => {
  assert.equal(CONFIG.limits.timing.maxDeltaTimeSec, ceiling);
  assert.equal(CONFIG.defaults.timing.maxDeltaTimeSec, ceiling);
  assert.ok(Object.isFrozen(CONFIG.limits.timing));
  assert.throws(() => { CONFIG.limits.timing.maxDeltaTimeSec = 120; }, TypeError);
  const old = structuredClone(preferences), oldSettings = runtime.settings;
  try {
    for (const [requested, expected] of timingCases) {
      const input = { timing: { maxDeltaTimeSec: requested } };
      assert.equal(normalizeMaxDeltaTimeSec(requested), expected);
      assert.equal(sanitizePreset({ schema: 10, prefs: input }).timing.maxDeltaTimeSec, expected);
      assert.equal(encodePresetPayload(input).prefs.timing.maxDeltaTimeSec, expected);
      replacePreferences({ ...structuredClone(CONFIG.defaults), ...input });
      resolveSettings();
      assert.equal(runtime.settings.timing.maxDeltaTimeSec, expected);
      assert.equal(preferences.timing.maxDeltaTimeSec, requested);
    }
    for (const timing of [null, undefined, {}, "bad"]) {
      preferences.timing = timing; resolveSettings();
      assert.equal(runtime.settings.timing.maxDeltaTimeSec, ceiling);
    }
  } finally { replacePreferences(old); runtime.settings = oldSettings; }
});

test("RC-15 phase 1: effective simulation delta rejects invalid elapsed time and independently caps manipulated settings", () => {
  for (const [requested, maximum] of timingCases) {
    for (const elapsed of [1 / 60, ceiling, 120, 1e6, Number.MAX_VALUE]) {
      assert.equal(simulationDeltaSec(elapsed, requested), Math.min(elapsed, maximum));
    }
    for (const elapsed of [-1, 0, NaN, Infinity, -Infinity, null, "120", undefined]) {
      assert.equal(simulationDeltaSec(elapsed, requested), 0);
    }
  }
});

test("RC-15 phase 1: production animation boundary discards stall time with no later catch-up and keeps real clocks", () => {
  // Execute the production callback with subsystem seams. Boot remains covered
  // by the normal build/browser checks; no copied timestep implementation here.
  const source = readFileSync(new URL("../src/js/main.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "").replace(/^main\(\);$/m, "").replace(/^export .*;$/m, "");
  const frames = [], nowSec = 1234;
  const testState = { time: { lastTimestampMs: null, simPaused: false }, bands: {} };
  const testRuntime = { settings: { timing: { maxDeltaTimeSec: Number.MAX_VALUE } } };
  const context = vm.createContext({
    CONFIG, state: testState, runtime: testRuntime, simulationDeltaSec,
    requestAnimationFrame() {}, resizeCanvasToDisplaySize() {},
    performance: { now: () => nowSec * 1000 }, createAnalysisFrame: () => ({}),
    updateAnalysisFrame() {}, AudioEngine: { sample: () => ({}) }, Renderer: {},
    VisualizerRuntime: { update: frame => frames.push({ ...frame }), render() {} },
    UI: { refreshAllUiText() {} }, Scrubber: { draw() {} },
  });
  vm.runInContext(source, context);
  const frame = ts => context.onAnimationFrame(ts);
  frame(0); assert.equal(frames.length, 0);
  frame(1000 / 60); assert.equal(frames.at(-1).dtSec, 1 / 60);
  frame(120000); assert.equal(frames.at(-1).dtSec, ceiling);
  frame(120000 + 1000 / 60); assert.ok(Math.abs(frames.at(-1).dtSec - 1 / 60) < 1e-12);
  assert.equal(testState.time.lastTimestampMs, 120000 + 1000 / 60);
  assert.ok(frames.every(f => f.nowSec === nowSec && f.dtSec <= ceiling));
  let ts = testState.time.lastTimestampMs;
  for (const [requested, expected] of timingCases) {
    testRuntime.settings.timing = { maxDeltaTimeSec: requested };
    ts += 120000; frame(ts);
    assert.equal(frames.at(-1).dtSec, expected);
  }
  testRuntime.settings.timing = null; ts += 120000; frame(ts);
  assert.equal(frames.at(-1).dtSec, ceiling);
});

test("RC-15 phase 1: per-Orb burst guard is independent of imported timing and bounded by CONFIG rate limits", () => {
  const old = runtime.settings;
  try {
    for (const maxDeltaTimeSec of [ceiling, 120, 1e6, Number.MAX_VALUE]) {
      runtime.settings = { timing: { maxDeltaTimeSec } };
      for (const rate of [240, 1000, 1e6, Number.MAX_VALUE]) {
        const trail = new TrailSystem();
        const settings = { ...CONFIG.defaults.orbs[0].particles, emitPerSecond: rate };
        trail.updateAndEmit(120, 0, 0, 0, rgb, settings);
        assert.equal(trail.particles.length, Math.ceil(Math.min(rate, CONFIG.limits.particles.emitPerSecond.max) * ceiling) + 2);
      }
    }
  } finally { runtime.settings = old; }
});
