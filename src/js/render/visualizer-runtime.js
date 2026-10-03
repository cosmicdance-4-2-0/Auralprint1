import { TAU } from "../core/constants.js";
import { runtime, normalizeOrbChannelId } from "../core/preferences.js";
import { state } from "../core/state.js";
import { clamp } from "../core/utils.js";

const BAND_OVERLAY_VISUALIZER_ID = "band-overlay";

function selectOrbAnalysis(orb, analysisFrame) {
  const channel = normalizeOrbChannelId(orb && orb.chanId, orb && orb.bandId);
  const sourceBand = channel === "L"
    ? analysisFrame.channels.L
    : (channel === "R" ? analysisFrame.channels.R : analysisFrame.channels.C);
  const bandIds = Array.isArray(orb && orb.bandIds) ? orb.bandIds : [];
  if (!bandIds.length) return { band: sourceBand, energyOverride01: null };

  const energies = analysisFrame.spectrum.energies01;
  if (!Array.isArray(energies) || !energies.length) {
    return { band: sourceBand, energyOverride01: null };
  }
  let sum = 0;
  for (const idx of bandIds) sum += energies[idx] || 0;
  return {
    band: sourceBand,
    energyOverride01: clamp(sum / bandIds.length, 0, 1),
  };
}

function createBandOverlayVisualizer({ settingsRef = runtime, stateRef = state } = {}) {
  return {
    id: BAND_OVERLAY_VISUALIZER_ID,
    type: "band-overlay",
    isVisible() {
      return !!settingsRef.settings.bands.overlay.enabled;
    },
    update({ dtSec }) {
      const overlay = settingsRef.settings.bands.overlay;
      if (overlay.phaseMode === "orb") {
        stateRef.bands.ringPhaseRad = stateRef.orbs.length
          ? stateRef.orbs[0].angleRad
          : stateRef.bands.ringPhaseRad;
      } else {
        stateRef.bands.ringPhaseRad = (
          (stateRef.bands.ringPhaseRad + overlay.ringSpeedRadPerSec * dtSec) % TAU + TAU
        ) % TAU;
      }
    },
    render(renderer, frameContext) {
      renderer.drawBandOverlay(frameContext.analysisFrame);
    },
    reset(reason) {
      if (reason === "visuals") {
        stateRef.bands.ringPhaseRad = stateRef.orbs.length
          ? stateRef.orbs[0].startAngleRad
          : 0;
      }
    },
    dispose() {},
  };
}

function createOrbVisualizer(orb) {
  return {
    id: orb.id,
    type: "orb",
    orb,
    isVisible() { return true; },
    update({ dtSec, nowSec, simPaused, analysisFrame }) {
      if (simPaused) return;
      const selection = analysisFrame.ready ? selectOrbAnalysis(orb, analysisFrame) : null;
      orb.step(
        dtSec,
        nowSec,
        selection ? selection.band : null,
        selection ? selection.energyOverride01 : null,
        analysisFrame.spectrum.dominantIndex,
      );
    },
    render(renderer, frameContext) {
      renderer.drawOrb(orb, frameContext.nowSec, frameContext.analysisFrame.spectrum.dominantIndex);
    },
    reset(reason) {
      if (reason === "visuals") orb.resetPhase();
      if (reason === "visuals" || reason === "track") orb.resetTrail();
    },
    dispose() {},
  };
}

function createVisualizerRuntime({
  createBandOverlay = createBandOverlayVisualizer,
  createOrb = createOrbVisualizer,
} = {}) {
  let visualizers = [];

  function rebuild(orbs = state.orbs) {
    dispose();
    visualizers = [createBandOverlay()];
    for (const orb of orbs) visualizers.push(createOrb(orb));
    return visualizers;
  }

  function update(frameContext) {
    for (const visualizer of visualizers) visualizer.update(frameContext);
  }

  function render(renderer, frameContext) {
    renderer.clearFrame();
    for (const visualizer of visualizers) {
      if (visualizer.isVisible()) visualizer.render(renderer, frameContext);
    }
  }

  function reset(reason) {
    for (const visualizer of visualizers) visualizer.reset(reason);
  }

  function dispose() {
    for (const visualizer of visualizers) visualizer.dispose();
    visualizers = [];
  }

  function getVisualizers() {
    return visualizers;
  }

  return { rebuild, update, render, reset, dispose, getVisualizers };
}

const VisualizerRuntime = createVisualizerRuntime();

export {
  BAND_OVERLAY_VISUALIZER_ID,
  VisualizerRuntime,
  createBandOverlayVisualizer,
  createOrbVisualizer,
  createVisualizerRuntime,
  selectOrbAnalysis,
};
