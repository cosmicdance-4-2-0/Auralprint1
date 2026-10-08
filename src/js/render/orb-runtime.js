import { preferences, resolveSettings, runtime } from "../core/preferences.js";
import { createOrb as createOrbDefinition, duplicateOrb as duplicateOrbDefinition, removeOrb as removeOrbDefinition } from "../core/orb-collection.js";
import { state } from "../core/state.js";
import { assertRuntimeOrbAdmission } from "../core/orb-admission.js";
import { Orb } from "./orb.js";
import { VisualizerRuntime, selectOrbAnalysis } from "./visualizer-runtime.js";

/* =============================================================================
   Orb Runtime
   ========================================================================== */
function initOrbs() {
  assertRuntimeOrbAdmission(runtime.settings.orbs);
  state.orbs.length = 0;
  for (const def of runtime.settings.orbs) state.orbs.push(new Orb(def));
  VisualizerRuntime.rebuild(state.orbs);
}

function reconcileOrbs() {
  assertRuntimeOrbAdmission(runtime.settings.orbs);
  const existing = new Map(state.orbs.map((orb) => [orb.id, orb]));
  const next = runtime.settings.orbs.map((def) => {
    const orb = existing.get(def.id);
    if (!orb) return new Orb(def);
    orb.syncFromDef(def);
    return orb;
  });
  state.orbs.length = 0;
  state.orbs.push(...next);
  VisualizerRuntime.reconcile(state.orbs);
  return state.orbs;
}

function createRuntimeOrb(options) {
  const created = createOrbDefinition(preferences.orbs, options);
  if (!created) return null;
  resolveSettings();
  reconcileOrbs();
  return created;
}

function duplicateRuntimeOrb(sourceId) {
  const duplicate = duplicateOrbDefinition(preferences.orbs, sourceId);
  if (!duplicate) return null;
  resolveSettings();
  reconcileOrbs();
  return duplicate;
}

function removeRuntimeOrb(id) {
  if (!removeOrbDefinition(preferences.orbs, id)) return false;
  resolveSettings();
  reconcileOrbs();
  return true;
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
  const defs = new Map(runtime.settings.orbs.map((def) => [def.id, def]));
  for (const orb of state.orbs) {
    const def = defs.get(orb.id);
    if (def) orb.syncFromDef(def);
  }
}

const syncOrbCosmeticsFromSettings = syncOrbsFromSettings;
export { createRuntimeOrb, duplicateRuntimeOrb, initOrbs, reconcileOrbs, removeRuntimeOrb, getBandForOrb, resetVisualizers, resetOrbsToDesignedPhases, resetOrbTrailsForTrack, syncOrbsFromSettings, syncOrbCosmeticsFromSettings };
