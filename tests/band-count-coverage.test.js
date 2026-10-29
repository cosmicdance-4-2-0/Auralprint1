import { canonicalPrefs } from "./helpers/preset-semantics.js";
import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { PRESET_SCHEMA_VERSION } from "../src/js/core/constants.js";
import { preferences, replacePreferences, resolveSettings, runtime } from "../src/js/core/preferences.js";
import { sanitizePreset, encodePresetPayload } from "../src/js/presets/preset-codec.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { BandBank } from "../src/js/audio/band-bank.js";
import { state } from "../src/js/core/state.js";

function withSettings(run) {
  const previous = structuredClone(preferences);
  const previousLocation = globalThis.location;
  try { run(); } finally {
    replacePreferences(previous);
    resolveSettings();
    globalThis.location = previousLocation;
  }
}

test("RC-07: count-2 URL input represents 1 kHz after canonical import/resolve/rebuild", () => withSettings(() => {
  globalThis.location = { hash: "#p=" + Buffer.from(JSON.stringify({ schema: 11, prefs: { bands: { count: 2 }, orbs: [] } })).toString("base64url") };
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  resolveSettings();
  BandBank.rebuild(22500, 48000);
  const freqDb = new Float32Array(4096).fill(-100);
  freqDb[Math.round(1000 / (48000 / 8192))] = 0;
  BandBank.computeEnergiesFromAnalyser({ analyser: { minDecibels: -100, maxDecibels: 0 }, freqDb }, 48000, state.bands.energies01);
  assert.equal(preferences.bands.count, CONFIG.defaults.bands.count);
  assert.equal(runtime.settings.bands.count, preferences.bands.count);
  assert.ok(state.bands.energies01.some(value => value > 0), "1 kHz must have a represented band");
}));

test("RC-07: import and runtime share minimum/maximum validation without mutating preferences", () => withSettings(() => {
  assert.equal(CONFIG.limits.bands.count.min, 3);
  assert.equal(CONFIG.limits.bands.count.max, CONFIG.bandNames.length);
  for (const count of [undefined, null, "3", -1, 0, 1, 2, 3.5, 257, Number.MAX_SAFE_INTEGER, NaN, Infinity, 3, 128, 256]) {
    const expected = [3, 128, 256].includes(count) ? count : CONFIG.defaults.bands.count;
    for (const schema of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      assert.equal(sanitizePreset({ schema, prefs: { bands: { count } } }).bands.count, expected);
    }
    preferences.bands.count = count;
    resolveSettings();
    assert.equal(runtime.settings.bands.count, expected);
    assert.ok(Object.is(preferences.bands.count, count));
    assert.equal(canonicalPrefs(encodePresetPayload(preferences)).bands.count, expected);
  }
  assert.equal(PRESET_SCHEMA_VERSION, 16);
}));

test("RC-07: every supported count/distribution covers 0 through Nyquist, including clamped ceilings", () => withSettings(() => {
  for (const mode of CONFIG.limits.bands.distributionModes) {
    for (let count = 3; count <= CONFIG.bandNames.length; count++) {
      for (const sampleRate of [32000, 44100, 48000]) {
        preferences.bands = { ...CONFIG.defaults.bands, count, distributionMode: mode };
        resolveSettings();
        const ceiling = Math.min(22500, sampleRate / 2);
        BandBank.rebuild(ceiling, sampleRate);
        assert.equal(state.bands.lowHz.length, count);
        assert.equal(state.bands.lowHz[0], 0);
        assert.equal(state.bands.highHz.at(-1), Infinity);
        assert.equal(state.bands.lowHz.at(-1), ceiling);
        for (let i = 0; i < count - 1; i++) {
          assert.ok(Number.isFinite(state.bands.lowHz[i]));
          assert.ok(state.bands.highHz[i] >= state.bands.lowHz[i]);
          assert.ok(Math.abs(state.bands.highHz[i] - state.bands.lowHz[i + 1]) < 1e-8, `${mode}/${count}: gap at ${i}`);
        }
        assert.ok(state.bands.highHz[1] > state.bands.lowHz[1]);
      }
    }
  }
}));

const { createAnalysisFrame, updateAnalysisFrame } = await import('../src/js/audio/analysis-frame.js');
const { selectOrbAnalysis } = await import('../src/js/render/visualizer-runtime.js');
const { decodePresetPayload } = await import('../src/js/presets/preset-codec.js');
const { duplicateOrb } = await import('../src/js/core/orb-collection.js');
const { sanitizeOrbBandIds, BAND_NAMES } = await import('../src/js/core/preferences.js');

for (const counts of [[256, 32, 256], [256, 3, 256], [3, 32, 3]]) {
  test(`AUD-003: ${counts.join(' → ')} retains and reactivates authored targets through bank rebuild/share`, () => withSettings(() => {
    for (const raw of [[], [0, 2], [5, 100, 255], [255], [255, 5, 100], [5, '7', 5, 1.5, -1, 100, 255]]) {
      const canonical = sanitizeOrbBandIds(raw);
      replacePreferences(sanitizePreset({ schema: 11, prefs: { bands: { count: counts[0] }, orbs: [{ id: 'A', chanId: 'R', bandIds: raw, hueOffsetDeg: 42 }] } }));
      const originalOrb = structuredClone(preferences.orbs[0]);
      for (const count of counts) {
        preferences.bands.count = count; resolveSettings(); BandBank.rebuild(22500, 48000);
        for (const channel of ['L', 'R', 'C']) {
          assert.equal(state.bands.channels[channel].energies01.length, count);
          state.bands.channels[channel].energies01.fill(.5);
        }
        assert.deepEqual(preferences.orbs[0], originalOrb, 'count changes do not rewrite Orb configuration');
        assert.deepEqual(runtime.settings.orbs[0].bandIds, canonical);
        const analysis = updateAnalysisFrame(createAnalysisFrame(), { ready: true, bands: {} }, state.bands);
        const active = canonical.filter(index => index < count), selected = selectOrbAnalysis(runtime.settings.orbs[0], analysis);
        assert.equal(selected.energyOverride01, canonical.length ? (active.length ? .5 : 0) : null);
        assert.equal(selected.selectedDominantBandIndex, active[0] ?? null);
        const encoded = encodePresetPayload(preferences);
        assert.equal(encoded.schema, 16); assert.deepEqual(sanitizePreset(decodePresetPayload(encoded)).orbs[0], originalOrb);
        globalThis.location = { hash: '#p=' + Buffer.from(JSON.stringify(encoded)).toString('base64url') };
        assert.equal(UrlPreset.applyFromLocationHash(), true); assert.deepEqual(preferences.orbs[0], originalOrb);
      }
      const copy = duplicateOrb(preferences.orbs, 'A');
      assert.deepEqual(copy.bandIds, canonical); assert.notEqual(copy.bandIds, preferences.orbs[0].bandIds);
    }
  }));
}

test('AUD-003: original schema-10 count-3 scene persists inactive 255; legacy name migration stays canonical', () => withSettings(() => {
  const prefs = sanitizePreset({ schema: 11, prefs: { bands: { count: 3 }, orbs: [{ id: 'A', bandIds: [255] }, { id: 'legacy', bandNames: [BAND_NAMES[7], BAND_NAMES[0]] }] } });
  assert.deepEqual(prefs.orbs[0].bandIds, [255]); assert.deepEqual(prefs.orbs[1].bandIds, [7, 0]);
  assert.deepEqual(sanitizePreset(decodePresetPayload(encodePresetPayload(prefs))).orbs.map(o => o.bandIds), [[255], [7, 0]]);
}));
