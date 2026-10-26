import { ParticleGovernor } from "./particle-governor.js";
import { TraceRenderGovernor } from "./trace-render-governor.js";
import { normalizeParticleSafety } from "../core/particle-safety.js";
import { assertRuntimeOrbAdmission } from "../core/orb-admission.js";
import { TAU } from "../core/constants.js";
import { runtime, normalizeOrbChannelId, BAND_NAMES } from "../core/preferences.js";
import { state } from "../core/state.js";
import { clamp } from "../core/utils.js";

const SPECTRAL_RING_VISUALIZER_ID = "spectral-ring";

function selectOrbAnalysis(orb, analysisFrame) {
  const channel = normalizeOrbChannelId(orb && orb.chanId, orb && orb.bandId);
  const sourceBand = channel === "L"
    ? analysisFrame?.channels?.L
    : (channel === "R" ? analysisFrame?.channels?.R : analysisFrame?.channels?.C);
  const bandIds = Array.isArray(orb && orb.bandIds) ? orb.bandIds : [];
  if (!bandIds.length) return { band: sourceBand, energyOverride01: null, selectedDominantBandIndex: null };

  const energies = sourceBand && sourceBand.bandEnergies01;
  if (!energies || !Number.isInteger(energies.length) || energies.length <= 0) {
    return { band: sourceBand, energyOverride01: 0, selectedDominantBandIndex: null };
  }
  // Authored indices remain canonical; this consumer uses only the current
  // channel's actual array and bank boundaries, never the fixed name count alone.
  const activeCount = Math.min(energies.length, BAND_NAMES.length,
    analysisFrame?.spectrum?.lowHz?.length ?? energies.length,
    analysisFrame?.spectrum?.highHz?.length ?? energies.length);
  let sum = 0;
  let count = 0;
  let selectedDominantBandIndex = null;
  let strongestEnergy = -Infinity;
  for (const idx of bandIds) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= activeCount) continue;
    const energy = Number.isFinite(energies[idx]) ? clamp(energies[idx], 0, 1) : 0;
    sum += energy;
    count += 1;
    if (energy > strongestEnergy) {
      strongestEnergy = energy;
      selectedDominantBandIndex = idx;
    }
  }
  return {
    band: sourceBand,
    energyOverride01: count ? clamp(sum / count, 0, 1) : 0,
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
    update({ dtSec, motionDtSec = dtSec, simPaused = false }) {
      const overlay = settingsRef.settings.bands.overlay;
      if (overlay.phaseMode === "orb") {
        stateRef.bands.ringPhaseRad = stateRef.orbs.length
          ? stateRef.orbs[0].angleRad
          : stateRef.bands.ringPhaseRad;
      } else if (!simPaused) {
        const phaseDelta = overlay.ringSpeedRadPerSec * motionDtSec;
        if (phaseDelta !== 0) {
          stateRef.bands.ringPhaseRad = (
            (stateRef.bands.ringPhaseRad + phaseDelta) % TAU + TAU
          ) % TAU;
        }
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
    update({ dtSec, motionDtSec = dtSec, nowSec, simPaused, analysisFrame }) {
      if (simPaused) {
        // Pause motion/emission, while real-time lifetime retirement continues.
        orb.trail?.expireParticles?.(nowSec, orb.particles?.ttlSec);
        return;
      }
      const selection = analysisFrame.ready ? selectOrbAnalysis(orb, analysisFrame) : null;
      orb.step(
        dtSec,
        nowSec,
        selection ? selection.band : null,
        selection ? selection.energyOverride01 : null,
        analysisFrame.spectrum.dominantIndex,
        selection ? selection.selectedDominantBandIndex : null,
        motionDtSec,
      );
    },
    render(renderer, frameContext, traceWork) {
      const strokes = renderer.drawOrb(orb, frameContext.nowSec, frameContext.analysisFrame.spectrum.dominantIndex,
        traceWork?.quotaFor(orb));
      traceWork?.record(strokes);
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
  particlePolicy,
  traceRenderingPolicy,
  settingsRef = runtime,
} = {}) {
  let visualizers = [];
  // Explicit injection fixes an isolated test policy. Production supplies none
  // and follows runtime.settings through the same existing governor instance.
  const injectedPolicy = particlePolicy === undefined ? null : Object.freeze(normalizeParticleSafety(particlePolicy));
  const particleGovernor = new ParticleGovernor(injectedPolicy || settingsRef.settings?.particleSafety);
  const traceWork = new TraceRenderGovernor(traceRenderingPolicy);
  let lastSettingsSource = null;
  let traceSettingsDirty = false;
  let lastPolicySource = null;
  function syncSettings(settings = settingsRef.settings) {
    if (settings !== lastSettingsSource) {
      lastSettingsSource = settings;
      // UI resolves/synchronizes the runtime before synchronizing Orb definitions.
      // Defer candidate inspection until render, after that synchronous pipeline.
      traceSettingsDirty = true;
    }
    const source = injectedPolicy || settings?.particleSafety;
    if (source === lastPolicySource) return false;
    lastPolicySource = source;
    return particleGovernor.applyPolicy(source);
  }
  const syncParticleTrails = orbs => particleGovernor.setTrails(orbs
    .filter(orb => orb.trail?.governor === particleGovernor)
    .map(orb => orb.trail));

  function createOrbParticipant(orb) {
    orb.trail?.setGovernor?.(particleGovernor);
    return createOrb(orb);
  }

  function rebuild(orbs = state.orbs) {
    assertRuntimeOrbAdmission(orbs);
    syncSettings();
    // Replacing adapters need not reset surviving Orb-owned particle history.
    for (const visualizer of visualizers) visualizer.dispose();
    visualizers = [createSpectralRing()];
    for (const orb of orbs) visualizers.push(createOrbParticipant(orb));
    syncParticleTrails(orbs);
    traceWork.setVisualizers(visualizers);
    traceSettingsDirty = false;
    return visualizers;
  }

  function reconcile(orbs = state.orbs) {
    assertRuntimeOrbAdmission(orbs);
    syncSettings();
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
        next.push(createOrbParticipant(orb));
        existing.delete(orb.id);
      }
    }
    for (const removed of existing.values()) removed.dispose();
    visualizers = next;
    syncParticleTrails(orbs);
    traceWork.setVisualizers(visualizers);
    traceSettingsDirty = false;
    return visualizers;
  }

  function update(frameContext) {
    syncSettings();
    particleGovernor.beginFrame();
    // Orb-locked Ring phase depends on current-frame Orb simulation.
    // Update dependency order is separate from render/composition order.
    for (const visualizer of visualizers) {
      if (visualizer.type !== "spectral-ring") visualizer.update(frameContext);
    }
    particleGovernor.finishFrame();
    for (const visualizer of visualizers) {
      if (visualizer.type === "spectral-ring") visualizer.update(frameContext);
    }
  }

  function render(renderer, frameContext) {
    syncSettings();
    renderer.clearFrame();
    if (traceSettingsDirty) {
      traceWork.setVisualizers(visualizers);
      traceSettingsDirty = false;
    }
    traceWork.beginFrame();
    for (const visualizer of visualizers) {
      if (visualizer.isVisible()) visualizer.render(renderer, frameContext, traceWork);
    }
  }

  function reset(reason) {
    syncSettings();
    for (const visualizer of visualizers) visualizer.reset(reason);
    traceWork.clearStats();
  }

  function dispose() {
    for (const visualizer of visualizers) visualizer.dispose();
    visualizers = [];
    particleGovernor.dispose();
    traceWork.dispose();
  }

  function getVisualizers() {
    return visualizers;
  }

  return { rebuild, reconcile, update, render, reset, dispose, getVisualizers, syncSettings, getParticleStats: () => particleGovernor.getStats(), getTraceRenderStats: () => traceWork.getStats() };
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
