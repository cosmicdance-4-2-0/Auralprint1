import test from "node:test";
import assert from "node:assert/strict";
import { createTemporalFeatureEngine } from "../src/js/audio/temporal-features.js";

const params = { envelopeAttackSec: 0.02, envelopeReleaseSec: 0.2, fluxNormalizationSec: 0.05 };
function frame({ L = [0.1, 0.1], R = [0.1, 0.1], C = [0.1, 0.1], energy = 0.25, edges = [20, 100] } = {}) {
  return {
    ready: true,
    spectrum: { lowHz: edges },
    channels: {
      L: { energy01: energy, bandEnergies01: L },
      R: { energy01: energy, bandEnergies01: R },
      C: { energy01: energy, bandEnergies01: C },
    },
  };
}

test("first usable observation primes history without creating an attack", () => {
  const engine = createTemporalFeatureEngine(params);
  const edges = [20, 100];
  const input = frame({ edges });
  const result = engine.update(input, 0.05);
  assert.equal(result.ready, true);
  assert.equal(result.channels.C.energy01, 0.25);
  assert.equal(result.channels.C.envelope01, 0.25);
  assert.equal(result.channels.C.flux01, 0);
  assert.equal(result.channels.C.rise01, 0);
  assert.equal(engine.update(input, 0.05), result, "reusable stable result identity");
  assert.equal(result.channels.C.flux01, 0, "repeated samples should not create flux");
});

test("spectral rise, channel independence and attack/release are computed", () => {
  const engine = createTemporalFeatureEngine(params);
  const edges = [20, 100];
  engine.update(frame({ edges }), 0.05);
  const rising = frame({ edges, L: [0.1, 0.1], R: [0.1, 0.1], C: [0.5, 0.3], energy: 0.65 });
  const currentC = rising.channels.C.bandEnergies01.slice();
  const result = engine.update(rising, 0.05);
  assert.ok(Math.abs(result.channels.C.flux01 - 0.3) < 1e-10);
  assert.equal(result.channels.L.flux01, 0);
  assert.equal(result.channels.R.flux01, 0);
  assert.ok(Math.abs(result.channels.C.rise01 - 0.4) < 1e-10);
  assert.ok(result.channels.C.envelope01 > 0.25 && result.channels.C.envelope01 < 0.65);
  assert.deepEqual(rising.channels.C.bandEnergies01, currentC, "producer-owned arrays are read only");
  const falling = engine.update(frame({ edges, C: [0.1, 0.1], energy: 0.15 }), 0.05);
  assert.equal(falling.channels.C.flux01, 0, "decreases are not positive spectral flux");
  assert.ok(falling.channels.C.fall01 > 0);
  assert.ok(falling.channels.C.envelope01 > 0.15);
});

test("track gaps, band-definition changes and zero time reset temporal history", () => {
  const engine = createTemporalFeatureEngine(params);
  const edges = [20, 100];
  engine.update(frame({ edges }), 0.05);
  assert.equal(engine.update(frame({ edges, C: [0.9, 0.9] }), 0.05).channels.C.flux01, 0.8);
  engine.reset();
  assert.equal(engine.getFrame().ready, false);
  assert.equal(engine.update(frame({ edges, C: [0.9, 0.9] }), 0.05).channels.C.flux01, 0);
  assert.equal(engine.update(frame({ edges: [20, 100], C: [0.1, 0.1] }), 0.05).channels.C.flux01, 0);
  assert.equal(engine.update(frame({ edges, C: [0.9, 0.9] }), 0).ready, false);
  assert.equal(engine.update(frame({ edges, C: [0.9, 0.9] }), 0.05).channels.C.flux01, 0);
  assert.equal(engine.update({ ready: false }, 0.05).ready, false);
});

test("nonfinite inputs clamp to silence and invalid time scales are rejected", () => {
  assert.throws(() => createTemporalFeatureEngine({ ...params, envelopeAttackSec: 0 }), RangeError);
  const engine = createTemporalFeatureEngine(params);
  const edges = [20, 100];
  engine.update(frame({ edges }), 0.05);
  const current = frame({ edges, C: [Infinity, Number.NaN], energy: Number.NaN });
  engine.update(current, 0.05);
  assert.equal(engine.getFrame().channels.C.energy01, 0);
  assert.equal(engine.getFrame().channels.C.flux01, 0);
});
