import test from "node:test";
import assert from "node:assert/strict";

import { createAnalysisFrame, updateAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { BandBank } from "../src/js/audio/band-bank.js";
import { state } from "../src/js/core/state.js";
import { getBandForOrb } from "../src/js/render/orb-runtime.js";

function sampledBand(waveform, rms, energy01) {
  return { analyser: { implementationDetail: true }, timeDomain: waveform, rms, energy01 };
}

function createReadySources() {
  const L = Float32Array.from([0.1, 0.2]);
  const R = Float32Array.from([0.3, 0.4]);
  const C = Float32Array.from([0.5, 0.6]);
  const energies01 = [0.1, 0.4, 0.7];
  return {
    waveforms: { L, R, C },
    audioSample: {
      ready: true,
      monoLike: false,
      bands: {
        L: sampledBand(L, 0.11, 0.21),
        R: sampledBand(R, 0.12, 0.22),
        C: sampledBand(C, 0.13, 0.23),
      },
    },
    bandState: {
      energies01,
      lowHz: [0, 20, 200],
      highHz: [20, 200, Infinity],
      dominantIndex: 2,
      dominantName: "Band Two",
      meta: { sampleRateHz: 48000, nyquistHz: 24000, configCeilingHz: 30000, effectiveCeilingHz: 24000 },
    },
  };
}

test("AnalysisFrame represents not-ready analysis without exposing Web Audio objects", () => {
  const frame = updateAnalysisFrame(createAnalysisFrame(), { ready: false }, {
    energies01: [], lowHz: [], highHz: [], meta: {},
  });
  assert.equal(frame.ready, false);
  assert.equal(frame.monoLike, true);
  for (const channel of Object.values(frame.channels)) {
    assert.deepEqual(channel, { waveform: null, rms: 0, energy01: 0 });
    assert.equal("analyser" in channel, false);
  }
});

test("AnalysisFrame exposes ready channel and spectrum data as producer-owned references", () => {
  const sources = createReadySources();
  const frame = updateAnalysisFrame(createAnalysisFrame(), sources.audioSample, sources.bandState);
  assert.equal(frame.ready, true);
  assert.equal(frame.monoLike, false);
  assert.equal(frame.channels.L.waveform, sources.waveforms.L);
  assert.equal(frame.channels.R.waveform, sources.waveforms.R);
  assert.equal(frame.channels.C.waveform, sources.waveforms.C);
  assert.deepEqual([frame.channels.L.rms, frame.channels.R.rms, frame.channels.C.rms], [0.11, 0.12, 0.13]);
  assert.deepEqual([frame.channels.L.energy01, frame.channels.R.energy01, frame.channels.C.energy01], [0.21, 0.22, 0.23]);
  assert.equal(frame.spectrum.energies01, sources.bandState.energies01);
  assert.equal(frame.spectrum.lowHz, sources.bandState.lowHz);
  assert.equal(frame.spectrum.highHz, sources.bandState.highHz);
  assert.equal(frame.spectrum.dominantIndex, 2);
  assert.equal(frame.spectrum.dominantName, "Band Two");
  assert.deepEqual(frame.spectrum.metadata, {
    sampleRateHz: 48000, nyquistHz: 24000, configCeilingHz: 30000, effectiveCeilingHz: 24000,
  });
  assert.equal("analyser" in frame.channels.L, false);
  assert.equal("audioContext" in frame, false);
});

test("orb routing preserves channel waveforms, full-spectrum energy, and combined selected-band averaging", () => {
  const sources = createReadySources();
  const frame = updateAnalysisFrame(createAnalysisFrame(), sources.audioSample, sources.bandState);
  for (const channel of ["L", "R", "C"]) {
    const selection = getBandForOrb({ chanId: channel, bandIds: [] }, frame);
    assert.equal(selection.band, frame.channels[channel]);
    assert.equal(selection.band.waveform, sources.waveforms[channel]);
    assert.equal(selection.energyOverride01, null);
  }
  const selected = getBandForOrb({ chanId: "L", bandIds: [0, 2] }, frame);
  assert.equal(selected.band, frame.channels.L);
  assert.ok(Math.abs(selected.energyOverride01 - 0.4) < Number.EPSILON);
  const safeInvalid = getBandForOrb({ chanId: "invalid", bandIds: [1, 999] }, frame);
  assert.equal(safeInvalid.band, frame.channels.C);
  assert.equal(safeInvalid.energyOverride01, 0.2);
});

test("a later AnalysisFrame update follows BandBank replacement arrays", () => {
  const sources = createReadySources();
  const frame = updateAnalysisFrame(createAnalysisFrame(), sources.audioSample, sources.bandState);
  const firstEnergies = frame.spectrum.energies01;
  const firstEdges = frame.spectrum.lowHz;
  BandBank.rebuild(22050, 44100);
  updateAnalysisFrame(frame, sources.audioSample, state.bands);
  assert.notEqual(frame.spectrum.energies01, firstEnergies);
  assert.notEqual(frame.spectrum.lowHz, firstEdges);
  assert.equal(frame.spectrum.energies01, state.bands.energies01);
  assert.equal(frame.spectrum.lowHz, state.bands.lowHz);
  assert.equal(frame.spectrum.metadata.sampleRateHz, 44100);
  assert.equal(frame.spectrum.metadata.nyquistHz, 22050);
  assert.equal(frame.spectrum.metadata.effectiveCeilingHz, 22050);
});
