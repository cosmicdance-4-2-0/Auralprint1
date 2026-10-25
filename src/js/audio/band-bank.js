import { clamp, lerp, fmt } from "../core/utils.js";
import { TAU } from "../core/constants.js";
import { runtime, BAND_NAMES } from "../core/preferences.js";
import { state } from "../core/state.js";

// Direct helpers accept positive finite Hz across binary64, independently of
// CONFIG's application admission limit. Inverses require finite scale values
// with a representable nonnegative Hz result; invalid domains throw RangeError.
function positiveHz(hz) {
  if (!Number.isFinite(hz) || hz <= 0) throw new RangeError("Frequency must be positive and finite.");
  return hz;
}
function finiteHz(hz) {
  if (!Number.isFinite(hz) || hz < 0) throw new RangeError("Scale value has no finite nonnegative frequency.");
  return hz;
}
function scaledLog(hz, scale, coefficient) {
  positiveHz(hz);
  const ratio = hz / scale;
  // log1p(x)/x tends to one, including when division underflows to zero.
  return ratio <= 1 ? hz * (coefficient / scale) * (ratio === 0 ? 1 : Math.log1p(ratio) / ratio)
    : coefficient * Math.log1p(ratio);
}
function unscaleLog(value, scale, coefficient) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("Scale value must be finite and nonnegative.");
  const maximum = scaledLog(Number.MAX_VALUE, scale, coefficient);
  if (value > maximum) throw new RangeError("Scale value exceeds the finite frequency domain.");
  if (value === maximum) return Number.MAX_VALUE;
  const exponent = value / coefficient;
  return finiteHz(exponent <= 1
    ? value * (scale / coefficient) * (exponent === 0 ? 1 : Math.expm1(exponent) / exponent)
    : scale * Math.expm1(exponent));
}
// Mel (O'Shaughnessy 1987), Bark (Traunmüller 1990), ERB-rate
// (Glasberg & Moore 1990). Constants define the existing distributions.
function hzToMel(hz) { return scaledLog(hz, 700, 2595 / Math.LN10); }
function melToHz(mel) { return unscaleLog(mel, 700, 2595 / Math.LN10); }
// A scalar binary64 Bark coordinate eventually rounds to its asymptote and
// cannot round-trip extreme Hz. Edge generation below avoids that coordinate.
function hzToBark(hz) { return 26.81 * (positiveHz(hz) / (1960 + hz)) - 0.53; }
function barkToHz(b) {
  if (!Number.isFinite(b) || b < -0.53 || b >= 26.28) throw new RangeError("Bark value must be in [-0.53, 26.28).");
  return finiteHz(1960 * ((b + 0.53) / (26.28 - b)));
}
function hzToErb(hz) { return scaledLog(hz, 1 / 0.00437, 21.4 / Math.LN10); }
function erbToHz(e) { return unscaleLog(e, 1 / 0.00437, 21.4 / Math.LN10); }

// expm1(x)/x has the analytic value one at zero. Keeping this ratio avoids
// losing subnormal frequency differences in logarithmic scale coordinates.
const expRelative = x => x === 0 ? 1 : Math.expm1(x) / x;
function interpolateShiftedLog(f0, f1, t, scale) {
  const span = Math.log1p((f1 - f0) / (scale + f0));
  return f0 + (f1 - f0) * (t * expRelative(t * span) / expRelative(span));
}

// Returns n+1 Hz edge values linearly spaced in the chosen perceptual domain
function computeInteriorEdges(mode, n, f0, f1) {
  positiveHz(f0); positiveHz(f1);
  if (f0 > f1 || !Number.isInteger(n) || n < 1) throw new RangeError("Edges require an ordered frequency interval and positive integer count.");
  const edges = new Array(n + 1);
  edges[0] = f0; edges[n] = f1;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    let hz;
    if (f0 === f1) hz = f0;
    else if (mode === "mel" || mode === "erb") hz = interpolateShiftedLog(f0, f1, t, mode === "mel" ? 700 : 1 / 0.00437);
    else if (mode === "bark") {
      // Algebraically interpolate the original Bark rational function in Hz.
      // Avoid its rounded -0.53/26.28 endpoints and inverse cancellation/pole.
      const denominator = 1960 + (1 - t) * f1 + t * f0;
      hz = f0 + (f1 - f0) * (t * ((1960 + f0) / denominator));
    } else if (mode === "log") hz = Math.exp(lerp(Math.log(f0), Math.log(f1), t));
    else hz = lerp(f0, f1, t); // Existing linear fallback.
    // Roundoff can cross an endpoint. NaN/Infinity must never reach clamp.
    if (!Number.isFinite(hz)) throw new RangeError("Nonfinite interior frequency.");
    edges[i] = clamp(hz, f0, f1);
    if (edges[i] < edges[i - 1]) throw new RangeError("Reversed interior frequency.");
  }
  return edges;
}

const BandBank = (() => {
  function getBandRangeData(index) {
    const n = runtime.settings.bands.count;
    if (!Number.isInteger(index) || index < 0 || index >= n) return null;

    const lowHz = state.bands.lowHz[index];
    const highHzRaw = state.bands.highHz[index];
    const meta = state.bands.meta;
    const nyquistHz = Number.isFinite(meta.nyquistHz) ? meta.nyquistHz : null;

    const highHzDisplay = Number.isFinite(nyquistHz)
      ? Math.min(nyquistHz, highHzRaw === Infinity ? nyquistHz : highHzRaw)
      : highHzRaw;

    return {
      index,
      lowHz,
      highHzRaw,
      highHzDisplay,
      floorHz: runtime.settings.bands.floorHz,
      effectiveCeilingHz: meta.effectiveCeilingHz,
      nyquistHz,
      isFloorBand: index === 0,
      isTopBand: index === n - 1,
      isOpenEnded: highHzRaw === Infinity,
      isNyquistLimited: highHzRaw === Infinity && Number.isFinite(nyquistHz),
    };
  }

  function formatBandFrequencyHz(hz) {
    if (hz === Infinity) return "∞";
    if (!Number.isFinite(hz)) return "n/a";
    if (hz >= 1000) return `${fmt(hz / 1000, hz >= 10000 ? 1 : 2)} kHz`;
    return `${fmt(hz, hz >= 100 ? 0 : 1)} Hz`;
  }

  function formatBandRangeText(index) {
    const range = getBandRangeData(index);
    if (!range) return "n/a";
    return `${formatBandFrequencyHz(range.lowHz)}–${formatBandFrequencyHz(range.highHzDisplay)}`;
  }

  function rebuild(effectiveCeilingHz, sampleRateHz = null) {
    const s = runtime.settings;
    const n = s.bands.count;
    const configuredFloorHz = s.bands.floorHz;
    const configCeilingHz = s.bands.ceilingHz;
    const f1 = Number.isFinite(effectiveCeilingHz) ? effectiveCeilingHz : configCeilingHz;
    positiveHz(configuredFloorHz); positiveHz(configCeilingHz); positiveHz(f1);
    if (configuredFloorHz > configCeilingHz || f1 > configCeilingHz || !Number.isInteger(n) || n < 3) throw new RangeError("Invalid band definition.");
    const f0 = Math.min(configuredFloorHz, f1);
    const interiorBands = n - 2;
    const edges = computeInteriorEdges(s.bands.distributionMode, interiorBands, f0, f1);

    state.bands.lowHz = new Array(n);
    state.bands.highHz = new Array(n);

    state.bands.lowHz[0] = 0;
    state.bands.highHz[0] = f0;

    for (let i = 0; i < interiorBands; i++) {
      state.bands.lowHz[1 + i]  = edges[i];
      state.bands.highHz[1 + i] = edges[i + 1];
    }

    state.bands.lowHz[n - 1] = f1;
    state.bands.highHz[n - 1] = Infinity;

    state.bands.channels = {
      L: { energies01: new Array(n).fill(0) },
      R: { energies01: new Array(n).fill(0) },
      C: { energies01: new Array(n).fill(0) },
    };
    state.bands.energies01 = state.bands.channels.C.energies01;
    state.bands.meta.sampleRateHz = Number.isFinite(sampleRateHz) && sampleRateHz > 0 ? sampleRateHz : null;
    state.bands.meta.nyquistHz = state.bands.meta.sampleRateHz === null ? null : sampleRateHz * 0.5;
    state.bands.meta.effectiveFloorHz = f0;
    state.bands.meta.configCeilingHz = configCeilingHz;
    state.bands.meta.effectiveCeilingHz = f1;
  }

  function bandIndexFromAngleRad(angleRad) {
    const n = runtime.settings.bands.count;
    const a01 = ((angleRad % TAU) + TAU) % TAU / TAU;
    let idx = Math.floor(a01 * n);
    idx = clamp(idx, 0, n - 1);
    return idx;
  }

  function computeEnergiesFromAnalyser(analyserBand, audioContextSampleRate, targetEnergies) {
    const s = runtime.settings;
    const n = s.bands.count;
    if (!analyserBand || !analyserBand.freqDb || !targetEnergies) return null;

    const nyquist = audioContextSampleRate * 0.5;
    const bins = analyserBand.freqDb.length;

    const minDb = analyserBand.analyser.minDecibels;
    const maxDb = analyserBand.analyser.maxDecibels;
    const dbSpan = Math.max(1e-6, (maxDb - minDb));

    let dominant = 0;
    let dominantVal = -1;

    for (let i = 0; i < n; i++) {
      const loHz = Math.min(nyquist, state.bands.lowHz[i]);
      const hiHzRaw = state.bands.highHz[i];
      const hiHz = Math.min(nyquist, (hiHzRaw === Infinity ? nyquist : hiHzRaw));

      if (hiHz <= loHz) {
        targetEnergies[i] = 0;
        continue;
      }

      const loBin = Math.floor((loHz / nyquist) * bins);
      const hiBin = Math.ceil((hiHz / nyquist) * bins);

      const a = clamp(loBin, 0, bins - 1);
      const b = clamp(hiBin, 0, bins - 1);

      if (b < a) {
        targetEnergies[i] = 0;
        continue;
      }

      let sum = 0;
      let count = 0;
      for (let k = a; k <= b; k++) {
        const t = clamp((analyserBand.freqDb[k] - minDb) / dbSpan, 0, 1);
        sum += t;
        count += 1;
      }

      const avg = count > 0 ? (sum / count) : 0;
      targetEnergies[i] = avg;

      if (avg > dominantVal) {
        dominantVal = avg;
        dominant = i;
      }
    }

    return dominant;
  }

  function updateGlobalDominant(dominantIndex) {
    state.bands.dominantIndex = dominantIndex;
    state.bands.dominantName = BAND_NAMES[dominantIndex] || `Band ${dominantIndex}`;
  }

  return { rebuild, bandIndexFromAngleRad, computeEnergiesFromAnalyser, updateGlobalDominant, getBandRangeData, formatBandRangeText };
})();

export { hzToMel, melToHz, hzToBark, barkToHz, hzToErb, erbToHz, computeInteriorEdges, BandBank };
