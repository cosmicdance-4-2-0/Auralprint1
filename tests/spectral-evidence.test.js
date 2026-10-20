import test from "node:test";
import assert from "node:assert/strict";

import { captureSpectralEvidence, SPECTRAL_EVIDENCE_FORMAT } from "../src/js/audio/spectral-evidence.js";

function liveFrame() {
  return {
    ready: true,
    monoLike: false,
    channels: {
      L: { rms: .1, energy01: .2, waveform: new Float32Array([.4]), bandEnergies01: [.1, .6] },
      R: { rms: .2, energy01: .3, waveform: new Float32Array([.5]), bandEnergies01: [.3, .5] },
      C: { rms: .3, energy01: .4, waveform: new Float32Array([.6]), bandEnergies01: new Float32Array([.2, .7]) },
    },
    spectrum: {
      energies01: [.2, .7],
      lowHz: [0, 20],
      highHz: [20, Infinity],
      dominantIndex: 1, dominantName: "High",
      metadata: { sampleRateHz: 48000, nyquistHz: 24000, effectiveFloorHz: 20, configCeilingHz: 30000, effectiveCeilingHz: 24000 },
    },
  };
}

test("spectral evidence captures L/R/C geometry and preserves open-ended frequency bounds in JSON", () => {
  const evidence = captureSpectralEvidence(liveFrame());
  assert.equal(evidence.format, SPECTRAL_EVIDENCE_FORMAT);
  assert.equal(evidence.monoLike, false);
  assert.equal(evidence.bands.length, 2);
  assert.deepEqual(evidence.bands[0].energies01, { L: .1, R: .3, C: Math.fround(.2) });
  assert.deepEqual(evidence.bands[1], {
    index: 1, lowHz: 20, highHz: null, isOpenEnded: true,
    energies01: { L: .6, R: .5, C: Math.fround(.7) },
  });
  assert.equal(evidence.metadata.effectiveCeilingHz, 24000);
  assert.deepEqual(evidence.dominant, { index: 1, name: "High" });
  assert.deepEqual(JSON.parse(JSON.stringify(evidence)), evidence);
});

test("evidence is deterministic, detached from producer buffers, and does not capture audio or source identifiers", () => {
  const frame = liveFrame();
  const first = captureSpectralEvidence(frame);
  assert.deepEqual(first, captureSpectralEvidence(frame));
  frame.channels.L.bandEnergies01[0] = .9;
  frame.channels.C.bandEnergies01[1] = .9;
  frame.spectrum.lowHz[0] = 10;
  frame.spectrum.metadata.sampleRateHz = 44100;
  assert.deepEqual(first.bands[0].energies01, { L: .1, R: .3, C: Math.fround(.2) });
  assert.equal(first.bands[0].lowHz, 0);
  assert.equal(first.metadata.sampleRateHz, 48000);
  const asJson = JSON.stringify(first);
  assert.doesNotMatch(asJson, /waveform|timeDomain|filename|audioContext|analyser|timestamp/);
});

test("missing or invalid observations fail rather than inventing measurements", () => {
  assert.throws(() => captureSpectralEvidence(null), /not ready/);
  const frame = liveFrame(); frame.ready = false;
  assert.throws(() => captureSpectralEvidence(frame), /not ready/);
  frame.ready = true; frame.channels.R.bandEnergies01 = [.1];
  assert.throws(() => captureSpectralEvidence(frame), /length mismatch/);
  frame.channels.R.bandEnergies01 = [.1, .2]; frame.channels.L.bandEnergies01[0] = NaN;
  assert.throws(() => captureSpectralEvidence(frame), /must be finite/);
  frame.channels.L.bandEnergies01[0] = .1; frame.spectrum.highHz[0] = -1;
  assert.throws(() => captureSpectralEvidence(frame), /inverted band/);
  frame.spectrum.highHz[0] = 20; frame.spectrum.dominantIndex = 9;
  assert.throws(() => captureSpectralEvidence(frame), /dominant band index/);
});

test("metadata explicitly preserves unknown values as null without coercion", () => {
  const frame = liveFrame();
  frame.spectrum.metadata.sampleRateHz = null;
  delete frame.spectrum.metadata.nyquistHz;
  const evidence = captureSpectralEvidence(frame);
  assert.equal(evidence.metadata.sampleRateHz, null);
  assert.equal(evidence.metadata.nyquistHz, null);
});
