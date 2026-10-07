import { TAU } from "../core/constants.js";
import { runtime, normalizeOrbChannelId } from "../core/preferences.js";
import { state } from "../core/state.js";
import { clamp } from "../core/utils.js";

const SPECTRAL_RING_VISUALIZER_ID = "spectral-ring";

function selectOrbAnalysis(orb, analysisFrame) {
  const channel = normalizeOrbChannelId(orb && orb.chanId, orb && orb.bandId);
  const sourceBand = channel === "L"
    ? analysisFrame.channels.L
    : (channel === "R" ? analysisFrame.channels.R : analysisFrame.channels.C);
  const bandIds = Array.isArray(orb && orb.bandIds) ? orb.bandIds : [];
  if (!bandIds.length) return { band: sourceBand, energyOverride01: null, selectedDominantBandIndex: null };

  const energies = sourceBand && sourceBand.bandEnergies01;
  if (!energies || !energies.length) {
    return { band: sourceBand, energyOverride01: null, selectedDominantBandIndex: null };
  }
  let sum = 0;
  let selectedDominantBandIndex = null;
  let strongestEnergy = -Infinity;
  for (const idx of bandIds) {
    const energy = energies[idx] || 0;
    sum += energy;
    if (energy > strongestEnergy) {
      strongestEnergy = energy;
      selectedDominantBandIndex = idx;
    }
  }
  return {
    band: sourceBand,
    energyOverride01: clamp(sum / bandIds.length, 0, 1),
    selectedDominantBandIndex,
  };
}

function createSpectralRingVisualizer({ settingsRef = runtime, stateRef = state } = {}) {
  return {
    id: SPECTRAL_RING_VISUALIZER_ID,
    type: "spectral-ring",
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
      renderer.drawSpectralRing(frameContext.analysisFrame);
    },
    reset(reason) {
      if (reason === "visuals") {
        const overlay = settingsRef.settings.bands.overlay;
        stateRef.bands.ringPhaseRad = overlay.phaseMode === "orb" && stateRef.orbs.length
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
        selection ? selection.selectedDominantBandIndex : null,
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
  createSpectralRing = createSpectralRingVisualizer,
  createOrb = createOrbVisualizer,
} = {}) {
  let visualizers = [];

  function rebuild(orbs = state.orbs) {
    dispose();
    visualizers = [createSpectralRing()];
    for (const orb of orbs) visualizers.push(createOrb(orb));
    return visualizers;
  }

  function reconcile(orbs = state.orbs) {
    let overlay = visualizers.find((visualizer) => visualizer.type === "spectral-ring");
    if (!overlay) overlay = createSpectralRing();
    const existing = new Map(
      visualizers.filter((visualizer) => visualizer.type === "orb").map((visualizer) => [visualizer.id, visualizer]),
    );
    const next = [overlay];
    for (const orb of orbs) {
      const retained = existing.get(orb.id);
      if (retained && retained.orb === orb) {
        next.push(retained);
        existing.delete(orb.id);
      } else {
        if (retained) retained.dispose();
        next.push(createOrb(orb));
        existing.delete(orb.id);
      }
    }
    for (const removed of existing.values()) removed.dispose();
    visualizers = next;
    return visualizers;
  }

  function update(frameContext) {
    // Orb-locked Ring phase depends on current-frame Orb simulation.
    // Update dependency order is separate from render/composition order.
    for (const visualizer of visualizers) {
      if (visualizer.type !== "spectral-ring") visualizer.update(frameContext);
    }
    for (const visualizer of visualizers) {
      if (visualizer.type === "spectral-ring") visualizer.update(frameContext);
    }
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

  return { rebuild, reconcile, update, render, reset, dispose, getVisualizers };
}

const VisualizerRuntime = createVisualizerRuntime();

export {
  SPECTRAL_RING_VISUALIZER_ID,
  VisualizerRuntime,
  createSpectralRingVisualizer,
  createOrbVisualizer,
  createVisualizerRuntime,
  selectOrbAnalysis,
};
