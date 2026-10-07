import { clamp, lerp, fmt } from "../core/utils.js";
import { TAU } from "../core/constants.js";
import { runtime, BAND_NAMES } from "../core/preferences.js";
import { state } from "../core/state.js";

// Perceptual frequency scale converters
// Mel scale (O'Shaughnessy 1987)
function hzToMel(hz)  { return 2595 * Math.log10(1 + hz / 700); }
function melToHz(mel)  { return 700 * (Math.pow(10, mel / 2595) - 1); }
// Bark scale (Traunmüller 1990 — closed-form invertible)
function hzToBark(hz)  { return (26.81 * hz) / (1960 + hz) - 0.53; }
function barkToHz(b)   { return 1960 * (b + 0.53) / (26.28 - b); }
// ERB-rate scale (Glasberg & Moore 1990)
function hzToErb(hz)   { return 21.4 * Math.log10(0.00437 * hz + 1); }
function erbToHz(e)    { return (Math.pow(10, e / 21.4) - 1) / 0.00437; }

// Returns n+1 Hz edge values linearly spaced in the chosen perceptual domain
function computeInteriorEdges(mode, n, f0, f1) {
  const edges = new Array(n + 1);
  if (mode === "mel") {
    const s0 = hzToMel(f0), s1 = hzToMel(f1);
    for (let i = 0; i <= n; i++) edges[i] = melToHz(s0 + (s1 - s0) * (i / n));
  } else if (mode === "bark") {
    const s0 = hzToBark(f0), s1 = hzToBark(f1);
    for (let i = 0; i <= n; i++) edges[i] = barkToHz(s0 + (s1 - s0) * (i / n));
  } else if (mode === "erb") {
    const s0 = hzToErb(f0), s1 = hzToErb(f1);
    for (let i = 0; i <= n; i++) edges[i] = erbToHz(s0 + (s1 - s0) * (i / n));
  } else if (mode === "log") {
    const ratio = Math.pow(f1 / f0, 1 / n);
    for (let i = 0; i <= n; i++) edges[i] = f0 * Math.pow(ratio, i);
  } else { // "linear" (default / fallback)
    for (let i = 0; i <= n; i++) edges[i] = lerp(f0, f1, i / n);
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
    const f0 = Math.min(configuredFloorHz, f1);

    state.bands.lowHz = new Array(n);
    state.bands.highHz = new Array(n);

    state.bands.lowHz[0] = 0;
    state.bands.highHz[0] = f0;

    const interiorBands = n - 2;
    const edges = computeInteriorEdges(s.bands.distributionMode, interiorBands, f0, f1);
    for (let i = 0; i < edges.length; i++) edges[i] = clamp(edges[i], f0, f1);
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
    state.bands.meta.sampleRateHz = Number.isFinite(sampleRateHz) ? sampleRateHz : null;
    state.bands.meta.nyquistHz = Number.isFinite(sampleRateHz) ? sampleRateHz * 0.5 : null;
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
