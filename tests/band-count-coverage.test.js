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
  globalThis.location = { hash: "#p=" + Buffer.from(JSON.stringify({ schema: 10, prefs: { bands: { count: 2 }, orbs: [] } })).toString("base64url") };
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
    assert.equal(encodePresetPayload(preferences).prefs.bands.count, expected);
  }
  assert.equal(PRESET_SCHEMA_VERSION, 10);
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
