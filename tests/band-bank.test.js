import { canonicalPrefs } from "./helpers/preset-semantics.js";
import test from "node:test";
import assert from "node:assert/strict";

import { BandBank } from "../src/js/audio/band-bank.js";
import { CONFIG } from "../src/js/core/config.js";
import { runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";

function analyserBand(db) {
  return {
    analyser: { minDecibels: -100, maxDecibels: 0 },
    freqDb: new Float32Array(16).fill(db),
  };
}

test("BandBank rebuild owns distinct reusable L/R/C arrays and replaces all on definition changes", () => {
  const previous = runtime.settings;
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    runtime.settings.bands.count = 4;
    BandBank.rebuild(20000, 48000);
    const first = Object.fromEntries(Object.entries(state.bands.channels).map(([id, value]) => [id, value.energies01]));
    assert.notEqual(first.L, first.R);
    assert.notEqual(first.L, first.C);
    assert.notEqual(first.R, first.C);
    assert.equal(state.bands.energies01, first.C);

    runtime.settings.bands.count = 6;
    BandBank.rebuild(18000, 48000);
    for (const id of ["L", "R", "C"]) {
      assert.notEqual(state.bands.channels[id].energies01, first[id]);
      assert.equal(state.bands.channels[id].energies01.length, 6);
    }
    assert.equal(state.bands.energies01, state.bands.channels.C.energies01);
  } finally {
    runtime.settings = previous;
  }
});

test("channel-neutral BandBank computation writes only its target and global dominant is set from C", () => {
  const previous = runtime.settings;
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    runtime.settings.bands.count = 4;
    BandBank.rebuild(20000, 48000);
    const { L, R, C } = state.bands.channels;
    BandBank.computeEnergiesFromAnalyser(analyserBand(-90), 48000, L.energies01);
    BandBank.computeEnergiesFromAnalyser(analyserBand(-50), 48000, R.energies01);
    const cDominant = BandBank.computeEnergiesFromAnalyser(analyserBand(-10), 48000, C.energies01);
    assert.ok(L.energies01.every((value) => Math.abs(value - 0.1) < 1e-6));
    assert.ok(R.energies01.every((value) => Math.abs(value - 0.5) < 1e-6));
    assert.ok(C.energies01.every((value) => Math.abs(value - 0.9) < 1e-6));
    BandBank.updateGlobalDominant(cDominant);
    assert.equal(state.bands.dominantIndex, cDominant);
    assert.equal(state.bands.energies01, C.energies01);
  } finally {
    runtime.settings = previous;
  }
});

test("BandBank derives Nyquist-bounded floor geometry without rewriting configuration", () => {
  const previous = runtime.settings;
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    Object.assign(runtime.settings.bands, { count: 6, floorHz: 20000, ceilingHz: 22500 });

    BandBank.rebuild(16000, 32000);

    assert.equal(runtime.settings.bands.floorHz, 20000);
    assert.equal(runtime.settings.bands.ceilingHz, 22500);
    assert.deepEqual(state.bands.meta, {
      sampleRateHz: 32000,
      nyquistHz: 16000,
      effectiveFloorHz: 16000,
      configCeilingHz: 22500,
      effectiveCeilingHz: 16000,
    });
    assert.equal(state.bands.highHz[0], 16000);
    assert.ok(state.bands.lowHz.slice(1, -1).every((hz) => hz <= 16000));
    assert.ok(state.bands.highHz.slice(1, -1).every((hz) => hz <= 16000));
    assert.equal(state.bands.lowHz.at(-1), 16000);
    assert.ok([...state.bands.lowHz, ...state.bands.highHz].filter(Number.isFinite).every((hz) => hz <= 16000));
    assert.equal(BandBank.formatBandRangeText(0), "0.0 Hz–16.0 kHz");
    assert.equal(BandBank.formatBandRangeText(1), "16.0 kHz–16.0 kHz");
    assert.equal(BandBank.formatBandRangeText(5), "16.0 kHz–16.0 kHz");
  } finally {
    runtime.settings = previous;
  }
});

test("zero-width bands do not consume an energized final FFT bin", () => {
  const previous = runtime.settings;
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    Object.assign(runtime.settings.bands, { count: 6, floorHz: 20000, ceilingHz: 22500 });
    BandBank.rebuild(16000, 32000);
    const data = analyserBand(-100);
    data.freqDb[data.freqDb.length - 1] = 0;

    BandBank.computeEnergiesFromAnalyser(data, 32000, state.bands.energies01);

    assert.ok(state.bands.energies01[0] > 0);
    assert.deepEqual(state.bands.energies01.slice(1), [0, 0, 0, 0, 0]);
  } finally {
    runtime.settings = previous;
  }
});

test("ordinary and ceiling-only Nyquist clamps retain expected effective limits", () => {
  const previous = runtime.settings;
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    Object.assign(runtime.settings.bands, { count: 6, floorHz: 20, ceilingHz: 22500 });

    BandBank.rebuild(22500, 48000);
    assert.equal(state.bands.meta.effectiveFloorHz, 20);
    assert.equal(state.bands.meta.effectiveCeilingHz, 22500);
    assert.equal(state.bands.highHz[0], 20);

    BandBank.rebuild(22050, 44100);
    assert.equal(state.bands.meta.effectiveFloorHz, 20);
    assert.equal(state.bands.meta.effectiveCeilingHz, 22050);
    assert.ok([...state.bands.lowHz, ...state.bands.highHz].filter(Number.isFinite).every((hz) => hz <= 22050));
  } finally {
    runtime.settings = previous;
  }
});

test("a configured floor exactly at Nyquist leaves every higher band empty", () => {
  const previous = runtime.settings;
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    Object.assign(runtime.settings.bands, { count: 4, floorHz: 16000, ceilingHz: 22500 });
    BandBank.rebuild(16000, 32000);
    const data = analyserBand(-100);
    data.freqDb[data.freqDb.length - 1] = 0;

    BandBank.computeEnergiesFromAnalyser(data, 32000, state.bands.energies01);

    assert.equal(state.bands.highHz[0], 16000);
    assert.ok(state.bands.energies01.every(Number.isFinite));
    assert.ok(state.bands.energies01[0] > 0);
    assert.deepEqual(state.bands.energies01.slice(1), [0, 0, 0]);
  } finally {
    runtime.settings = previous;
  }
});

const { computeInteriorEdges } = await import('../src/js/audio/band-bank.js');
const { preferences, replacePreferences, resolveSettings } = await import('../src/js/core/preferences.js');
const { sanitizePreset, encodePresetPayload } = await import('../src/js/presets/preset-codec.js');
const { BandBankController } = await import('../src/js/audio/band-bank-controller.js');

for (const count of [3, 4, 32, 256]) {
  test(`AUD-008: log geometry/energy at count ${count} survives extreme and collapsed schema-10 intervals`, () => {
    const previous = structuredClone(preferences);
    try {
      for (const floorHz of [Number.MIN_VALUE, 1e-307, 1e-200, 1e-100, 20, 22500 - 1e-10, 22500]) {
        replacePreferences(sanitizePreset({ schema: 10, prefs: { bands: { count, floorHz, ceilingHz: 22500, distributionMode: 'log' } } })); resolveSettings();
        assert.equal(preferences.bands.floorHz, floorHz);
        assert.equal(canonicalPrefs(encodePresetPayload(preferences)).bands.floorHz, floorHz);
        BandBank.rebuild(22500, 48000);
        const edges = state.bands.lowHz.slice(1), interior = count - 2;
        assert.equal(edges[0], floorHz); assert.equal(edges.at(-1), 22500);
        for (let i = 0; i < edges.length; i++) {
          assert.ok(Number.isFinite(edges[i]) && edges[i] >= floorHz && edges[i] <= 22500);
          if (i) assert.ok(edges[i] >= edges[i - 1], 'monotone, including binary64 equalities');
          if (i > 0 && i < interior && floorHz < 1e-100) {
            const expectedLog = Math.log(floorHz) + (Math.log(22500) - Math.log(floorHz)) * i / interior;
            const expected = Math.exp(expectedLog);
            assert.ok(Math.abs(edges[i] - expected) <= Math.max(Number.MIN_VALUE, expected * 1e-12), 'actual interior coverage, allowing subnormal precision');
            assert.ok(edges[i] < 22500);
          }
        }
        for (const [id, db, expected] of [['L', -90, .1], ['R', -50, .5], ['C', -10, .9]]) {
          const energies = state.bands.channels[id].energies01;
          BandBank.computeEnergiesFromAnalyser({ analyser: { minDecibels: -100, maxDecibels: 0 }, freqDb: new Float32Array(4096).fill(db) }, 48000, energies);
          for (let i = 0; i < count; i++) {
            const zeroWidth = state.bands.highHz[i] <= state.bands.lowHz[i];
            assert.ok(Math.abs(energies[i] - (zeroWidth ? 0 : expected)) < 1e-12, `${id} band ${i}: no spurious zero energy`);
          }
        }
      }
    } finally { replacePreferences(previous); resolveSettings(); }
  });
}

test('AUD-008: default log geometry keeps its defined spacing and exact endpoints', () => {
  for (const n of [1, 2, 30, 254]) {
    const f0 = CONFIG.defaults.bands.floorHz, f1 = CONFIG.defaults.bands.ceilingHz;
    const actual = computeInteriorEdges('log', n, f0, f1), oldRatio = Math.pow(f1 / f0, 1 / n);
    assert.equal(actual[0], f0); assert.equal(actual[n], f1);
    for (let i = 0; i <= n; i++) assert.ok(Math.abs(actual[i] - f0 * Math.pow(oldRatio, i)) <= actual[i] * 1e-12, 'ordinary spacing unchanged within floating-point precision');
  }
});

test('AUD-008: other distributions retain their transformation and linear interpolation', () => {
  const { hzToMel, melToHz, hzToBark, barkToHz, hzToErb, erbToHz } = transformations;
  for (const [mode, to, from] of [['linear', x => x, x => x], ['mel', hzToMel, melToHz], ['bark', hzToBark, barkToHz], ['erb', hzToErb, erbToHz]]) {
    for (const n of [1, 2, 30, 254]) {
      const edges = computeInteriorEdges(mode, n, 20, 22500);
      assert.equal(edges[0],20); assert.equal(edges[n],22500);
      for (let i = 0; i <= n; i++) {
        const expected = from(to(20) + (to(22500) - to(20)) * (i / n));
        assert.ok(Math.abs(edges[i]-expected) <= expected*3e-12, 'same perceptual definition within round-trip precision');
      }
    }
  }
});
const transformations = await import('../src/js/audio/band-bank.js');

test('AUD-008: production controller caps configured ceiling above Nyquist for extreme log floors', () => {
  const previous = structuredClone(preferences);
  try {
    for (const count of [3, 4, 32, 256]) {
      replacePreferences(sanitizePreset({ schema: 10, prefs: { bands: { count, floorHz: Number.MIN_VALUE, ceilingHz: 22500, distributionMode: 'log' } } })); resolveSettings();
      BandBankController.syncFromSettings(runtime.settings); BandBankController.onAudioContextKnown(32000); BandBankController.rebuildNow();
      assert.equal(state.bands.meta.effectiveCeilingHz, 16000); assert.equal(state.bands.lowHz.at(-1), 16000);
      assert.ok(state.bands.lowHz.every(hz => hz <= 16000));
      assert.equal(preferences.bands.ceilingHz, 22500);
    }
  } finally { replacePreferences(previous); resolveSettings(); BandBankController.syncFromSettings(runtime.settings); BandBankController.onAudioContextKnown(null); }
});
