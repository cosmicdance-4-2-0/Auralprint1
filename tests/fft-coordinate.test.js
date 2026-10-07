import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { BandBank } from "../src/js/audio/band-bank.js";
import { runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { createAnalysisFrame, updateAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { selectOrbAnalysis } from "../src/js/render/visualizer-runtime.js";

function energies(fftSize, sampleRate, spike) {
  const freqDb = new Float32Array(fftSize / 2).fill(-100);
  freqDb[spike] = 0;
  BandBank.computeEnergiesFromAnalyser({ freqDb, analyser: { minDecibels: -100, maxDecibels: 0 } }, sampleRate, state.bands.energies01);
  return state.bands.energies01;
}

test("RC-08: bins below the aligned 22.5 kHz top boundary cannot energize a targeted Orb", () => {
  const previous = runtime.settings;
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    for (const fftSize of CONFIG.limits.audio.fftSizes) {
      BandBank.rebuild(22500, 48000);
      const boundaryBin = 22500 / (48000 / fftSize);
      assert.equal(energies(fftSize, 48000, boundaryBin - 1).at(-1), 0);
      const frame = updateAnalysisFrame(createAnalysisFrame(), { ready: true, monoLike: true, bands: {} }, state.bands);
      assert.equal(selectOrbAnalysis({ chanId: "C", bandIds: [255] }, frame).energyOverride01, 0);
      assert.equal(energies(fftSize, 48000, boundaryBin).at(-1), 1 / (fftSize / 2 - boundaryBin));
    }
  } finally { runtime.settings = previous; }
});

test("RC-08: correct FFT geometry preserves inclusive adjacent overlap and final-bin clamping", () => {
  const previous = runtime.settings;
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    runtime.settings.bands.count = 3;
    runtime.settings.bands.distributionMode = "linear";
    for (const sampleRate of [32000, 44100, 48000, 96000]) {
      const binHz = sampleRate / 16;
      runtime.settings.bands.floorHz = 2 * binHz;
      runtime.settings.bands.ceilingHz = 6 * binHz;
      BandBank.rebuild(6 * binHz, sampleRate);
      assert.deepEqual(energies(16, sampleRate, 2), [1 / 3, 1 / 5, 0]);
      assert.deepEqual(energies(16, sampleRate, 6), [0, 1 / 5, 1 / 2]);
      assert.deepEqual(energies(16, sampleRate, 7), [0, 0, 1 / 2]);
      assert.deepEqual(energies(16, sampleRate, 0), [1 / 3, 0, 0]);
    }
  } finally { runtime.settings = previous; }
});
