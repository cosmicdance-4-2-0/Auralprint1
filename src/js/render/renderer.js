import { clamp } from "../core/utils.js";
import { BAND_NAMES, runtime } from "../core/preferences.js";
import { state } from "../core/state.js";
import { BandBank } from "../audio/band-bank.js";
import { createCompositor } from "./compositor.js";
import { readSceneRuntime } from "./scene-runtime.js";
import { createVisualizerRegistry, registerBuiltInVisualizers } from "./visualizer.js";

/* =============================================================================
   Renderer
   ========================================================================== */
const Renderer = (() => {
  function clearFrame() {
    const ctx = state.ctx;
    const s = runtime.settings;
    ctx.fillStyle = s.visuals.backgroundColor;
    ctx.fillRect(0, 0, state.widthPx, state.heightPx);
  }

  function readWaveformPeak(timeDomain) {
    if (!timeDomain || !timeDomain.length) return 0;
    let peak = 0;
    for (let i = 0; i < timeDomain.length; i++) {
      const value = Math.abs(timeDomain[i]);
      if (value > peak) peak = value;
    }
    return peak;
  }

  function createBandFrameBridge() {
    const bandFrame = {
      analysis: {
        timestamp: 0,
        sampleRate: null,
        fftSize: null,
        channels: [],
        rms: [],
        peak: [],
        globalMax: 0,
        compat: {
          centerWaveform: null,
        },
      },
      bands: [],
      dominantBandIndex: -1,
      dominantBand: null,
      distribution: runtime.settings.bands.distributionMode,
      rms: [],
      maxEnergy: 0,
      minEnergy: 0,
    };

    const channelEntries = {
      L: {
        id: "L",
        label: "Left",
        rms: 0,
        energy: 0,
        energy01: 0,
        timeDomain: null,
        magnitudes: null,
        bandEnergies01: null,
        phase: null,
      },
      R: {
        id: "R",
        label: "Right",
        rms: 0,
        energy: 0,
        energy01: 0,
        timeDomain: null,
        magnitudes: null,
        bandEnergies01: null,
        phase: null,
      },
      C: {
        id: "C",
        label: "Center",
        rms: 0,
        energy: 0,
        energy01: 0,
        timeDomain: null,
        magnitudes: null,
        bandEnergies01: null,
        phase: null,
      },
    };

    function ensureBandEntries(count) {
      while (bandFrame.bands.length < count) {
        const index = bandFrame.bands.length;
        bandFrame.bands.push({
          index,
          name: BAND_NAMES[index] || `Band ${index}`,
          startHz: 0,
          endHz: 0,
          binStart: null,
          binEnd: null,
          energy: 0,
          peak: null,
        });
      }
      bandFrame.bands.length = count;
    }

    return function buildBandFrame(bandSnapshot, nowSec) {
      const count = runtime.settings.bands.count;
      const lowHz = Array.isArray(state.bands.lowHz) ? state.bands.lowHz : [];
      const highHz = Array.isArray(state.bands.highHz) ? state.bands.highHz : [];
      const energies = Array.isArray(state.bands.energies01) ? state.bands.energies01 : [];
      const nyquistHz = Number.isFinite(state.bands.meta.nyquistHz) ? state.bands.meta.nyquistHz : null;
      const snapshotBands = bandSnapshot && bandSnapshot.ready && bandSnapshot.bands ? bandSnapshot.bands : null;
      const orderedBands = snapshotBands
        ? [snapshotBands.L, snapshotBands.R, snapshotBands.C]
          .filter(Boolean)
          .map((liveBand) => ({
            id: liveBand.id,
            label: liveBand.label || liveBand.id,
            rms: Number.isFinite(liveBand.rms) ? liveBand.rms : 0,
            energy: Number.isFinite(liveBand.energy01) ? clamp(liveBand.energy01, 0, 1) : 0,
            timeDomain: liveBand.timeDomain || null,
            freqDb: liveBand.freqDb || null,
            minDb: Number.isFinite(liveBand.minDb) ? liveBand.minDb : null,
            maxDb: Number.isFinite(liveBand.maxDb) ? liveBand.maxDb : null,
          }))
        : [];
      const centerChannel = orderedBands.find((channel) => channel.id === "C") || null;
      const fftBins = centerChannel && centerChannel.freqDb ? centerChannel.freqDb.length : 0;

      ensureBandEntries(count);

      let maxEnergy = 0;
      let minEnergy = count > 0 ? 1 : 0;

      for (let i = 0; i < count; i++) {
        const band = bandFrame.bands[i];
        const startHz = Number.isFinite(lowHz[i]) ? lowHz[i] : 0;
        const highHzRaw = highHz[i];
        const boundedEndHz = Number.isFinite(nyquistHz)
          ? Math.min(nyquistHz, highHzRaw === Infinity ? nyquistHz : (Number.isFinite(highHzRaw) ? highHzRaw : startHz))
          : (highHzRaw === Infinity ? Infinity : (Number.isFinite(highHzRaw) ? highHzRaw : startHz));
        const energy = clamp(energies[i] || 0, 0, 1);

        band.index = i;
        band.name = BAND_NAMES[i] || `Band ${i}`;
        band.startHz = startHz;
        band.endHz = boundedEndHz;
        band.energy = energy;
        band.peak = null;

        if (fftBins > 0 && Number.isFinite(nyquistHz) && nyquistHz > 0) {
          const highForBins = boundedEndHz === Infinity ? nyquistHz : boundedEndHz;
          band.binStart = clamp(Math.floor((startHz / nyquistHz) * (fftBins - 1)), 0, fftBins - 1);
          band.binEnd = clamp(Math.ceil((highForBins / nyquistHz) * (fftBins - 1)), 0, fftBins - 1);
        } else {
          band.binStart = null;
          band.binEnd = null;
        }

        if (energy > maxEnergy) maxEnergy = energy;
        if (energy < minEnergy) minEnergy = energy;
      }

      bandFrame.analysis.channels.length = 0;
      bandFrame.analysis.rms.length = 0;
      bandFrame.analysis.peak.length = 0;
      bandFrame.analysis.compat.centerWaveform = centerChannel ? centerChannel.timeDomain : null;

      let globalMax = 0;
      for (const liveBand of orderedBands) {
        const channelSpectrum = liveBand.freqDb && Number.isFinite(nyquistHz) && nyquistHz > 0
          ? BandBank.computeBandEnergiesFromFreqDb({
            freqDb: liveBand.freqDb,
            minDb: Number.isFinite(liveBand.minDb) ? liveBand.minDb : undefined,
            maxDb: Number.isFinite(liveBand.maxDb) ? liveBand.maxDb : undefined,
            nyquistHz,
          })
          : null;
        const channelEntry = channelEntries[liveBand.id] || {
          id: liveBand.id,
          label: liveBand.label || liveBand.id,
          rms: 0,
          energy: 0,
          energy01: 0,
          timeDomain: null,
          magnitudes: null,
          bandEnergies01: null,
          phase: null,
        };
        channelEntry.label = liveBand.label || channelEntry.label;
        channelEntry.rms = liveBand.rms;
        channelEntry.energy = liveBand.energy;
        channelEntry.energy01 = liveBand.energy;
        channelEntry.timeDomain = liveBand.timeDomain;
        channelEntry.magnitudes = liveBand.id === "C" && liveBand.freqDb ? liveBand.freqDb : null;
        channelEntry.bandEnergies01 = channelSpectrum ? channelSpectrum.energies01 : null;
        channelEntry.phase = null;
        bandFrame.analysis.channels.push(channelEntry);

        const rms = liveBand.rms;
        const peak = readWaveformPeak(liveBand.timeDomain);
        bandFrame.analysis.rms.push(rms);
        bandFrame.analysis.peak.push(peak);
        if (peak > globalMax) globalMax = peak;
      }

      const dominantBandIndex = count > 0
        ? clamp(Number.isInteger(state.bands.dominantIndex) ? state.bands.dominantIndex : 0, 0, count - 1)
        : -1;

      bandFrame.analysis.timestamp = Math.round((Number.isFinite(nowSec) ? nowSec : 0) * 1000);
      bandFrame.analysis.sampleRate = state.bands.meta.sampleRateHz;
      bandFrame.analysis.fftSize = centerChannel && centerChannel.freqDb
        ? centerChannel.freqDb.length * 2
        : (centerChannel && centerChannel.timeDomain
          ? centerChannel.timeDomain.length
          : runtime.settings.audio.fftSize);
      bandFrame.analysis.globalMax = globalMax;
      bandFrame.dominantBandIndex = dominantBandIndex;
      bandFrame.dominantBand = dominantBandIndex >= 0 ? bandFrame.bands[dominantBandIndex] : null;
      bandFrame.distribution = runtime.settings.bands.distributionMode;
      bandFrame.rms = bandFrame.analysis.rms;
      bandFrame.maxEnergy = maxEnergy;
      bandFrame.minEnergy = minEnergy;

      return bandFrame;
    };
  }

  const buildBandFrame = createBandFrameBridge();
  const visualizerRegistry = createVisualizerRegistry();
  registerBuiltInVisualizers(visualizerRegistry);
  const compositor = createCompositor({
    registry: visualizerRegistry,
    onWarning({ message }) {
      if (!message) return;
      console.warn(`[Compositor] ${message}`);
    },
  });

  function getRenderTarget() {
    return {
      canvas: state.canvas,
      ctx: state.ctx,
      widthPx: state.widthPx,
      heightPx: state.heightPx,
      dpr: state.dpr,
    };
  }

  function renderFrame({ bandSnapshot = null, dtSec = 0, nowSec = 0 } = {}) {
    clearFrame();

    const target = getRenderTarget();
    const sceneRuntime = readSceneRuntime();
    compositor.syncScene(sceneRuntime, target);
    compositor.update(buildBandFrame(bandSnapshot, nowSec), dtSec);
    compositor.render(target, sceneRuntime.viewTransform);
  }

  // RecorderEngine owns captureStream() and any MediaStream lifecycle.
  // Renderer exposes only the canonical display canvas as a read-only tap target.
  function getRecorderTap() {
    return {
      canvas: state.canvas,
      widthPx: state.widthPx,
      heightPx: state.heightPx,
      dpr: state.dpr,
    };
  }

  return { renderFrame, getRecorderTap };
})();

export { Renderer };
