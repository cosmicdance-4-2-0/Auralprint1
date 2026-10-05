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
