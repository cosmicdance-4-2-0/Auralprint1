import { runtime } from "../core/preferences.js";
import { state } from "../core/state.js";
import { Orb } from "./orb.js";
import { VisualizerRuntime, selectOrbAnalysis } from "./visualizer-runtime.js";

/* =============================================================================
   Orb Runtime
   ========================================================================== */
function initOrbs() {
  state.orbs.length = 0;
  for (const def of runtime.settings.orbs) state.orbs.push(new Orb(def));
  VisualizerRuntime.rebuild(state.orbs);
}

const getBandForOrb = selectOrbAnalysis;

function resetVisualizers(reason) {
  VisualizerRuntime.reset(reason);
}

function resetOrbsToDesignedPhases() {
  VisualizerRuntime.reset("visuals");
}

function resetOrbTrailsForTrack() {
  VisualizerRuntime.reset("track");
}

function syncOrbsFromSettings() {
  const defs = runtime.settings.orbs;
  for (let i = 0; i < state.orbs.length; i++) {
    const def = defs[i];
    const orb = state.orbs[i];
    if (!def || !orb) continue;
    orb.syncFromDef(def);
  }
}

const syncOrbCosmeticsFromSettings = syncOrbsFromSettings;
export { initOrbs, getBandForOrb, resetVisualizers, resetOrbsToDesignedPhases, resetOrbTrailsForTrack, syncOrbsFromSettings, syncOrbCosmeticsFromSettings };
