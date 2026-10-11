import { CONFIG } from "../core/config.js";

// Read-only-by-contract outputs. The engine owns and reuses the result objects.
// Neither AnalysisFrame nor its producer-owned band arrays are mutated.
const CHANNEL_IDS = ["L", "R", "C"];
const clamp01 = (n) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;

function createTemporalFeatureEngine({ envelopeAttackSec, envelopeReleaseSec, fluxNormalizationSec }) {
  for (const value of [envelopeAttackSec, envelopeReleaseSec, fluxNormalizationSec]) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError("Temporal feature time scales must be finite and positive.");
  }

  const output = { ready: false, channels: {} };
  const history = {};
  let bandDefinition = null;
  for (const id of CHANNEL_IDS) {
    output.channels[id] = { energy01: 0, envelope01: 0, rise01: 0, fall01: 0, flux01: 0 };
    history[id] = { primed: false, energy01: 0, bands: null };
  }

  function reset() {
    output.ready = false;
    bandDefinition = null;
    for (const id of CHANNEL_IDS) {
      const target = output.channels[id];
      target.energy01 = target.envelope01 = target.rise01 = target.fall01 = target.flux01 = 0;
      const previous = history[id];
      previous.primed = false;
      previous.energy01 = 0;
      previous.bands = null;
    }
    return output;
  }

  function update(frame, elapsedSec) {
    // Hidden, suspended, or invalid frame intervals are discontinuities, not attacks.
    if (!frame?.ready || !Number.isFinite(elapsedSec) || elapsedSec <= 0) return reset();
    const currentDefinition = frame.spectrum?.lowHz ?? null;
    if (bandDefinition !== currentDefinition) reset();
    bandDefinition = currentDefinition;
    const rateScale = fluxNormalizationSec / elapsedSec;

    for (const id of CHANNEL_IDS) {
      const source = frame.channels?.[id];
      const energy = clamp01(source?.energy01);
      const bands = source?.bandEnergies01;
      const previous = history[id];
      const target = output.channels[id];
      target.energy01 = energy;
      if (!previous.primed) {
        previous.primed = true;
        previous.energy01 = energy;
        previous.bands = bands && bands.length ? Array.from(bands, clamp01) : null;
        target.envelope01 = energy;
        target.rise01 = target.fall01 = target.flux01 = 0;
        continue;
      }

      const change = energy - previous.energy01;
      target.rise01 = clamp01(Math.max(0, change) * rateScale);
      target.fall01 = clamp01(Math.max(0, -change) * rateScale);
      previous.energy01 = energy;

      const tau = energy > target.envelope01 ? envelopeAttackSec : envelopeReleaseSec;
      const blend = -Math.expm1(-elapsedSec / tau);
      target.envelope01 += (energy - target.envelope01) * blend;

      if (!bands || !bands.length) {
        previous.bands = null;
        target.flux01 = 0;
      } else if (!previous.bands || previous.bands.length !== bands.length) {
        // Newly available/rebuilt spectra seed the reference without a false event.
        previous.bands = Array.from(bands, clamp01);
        target.flux01 = 0;
      } else {
        let positiveChange = 0;
        for (let i = 0; i < bands.length; i++) {
          const next = clamp01(bands[i]);
          positiveChange += Math.max(0, next - previous.bands[i]);
          previous.bands[i] = next;
        }
        target.flux01 = clamp01((positiveChange / bands.length) * rateScale);
      }
    }
    output.ready = true;
    return output;
  }

  return { update, reset, getFrame: () => output };
}

const TemporalFeatures = createTemporalFeatureEngine(CONFIG.experimental.temporalAudio);
export { createTemporalFeatureEngine, TemporalFeatures };
