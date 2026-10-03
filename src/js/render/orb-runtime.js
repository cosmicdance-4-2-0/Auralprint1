import { clamp } from "../core/utils.js";
import { runtime, normalizeOrbChannelId } from "../core/preferences.js";
import { state } from "../core/state.js";
import { Orb } from "./orb.js";

/* =============================================================================
   Orb Runtime
   ========================================================================== */
function initOrbs() {
  state.orbs.length = 0;
  for (const def of runtime.settings.orbs) state.orbs.push(new Orb(def));
}

function getBandForOrb(orb, analysisFrame) {
  const channel = normalizeOrbChannelId(orb && orb.chanId, orb && orb.bandId);
  const sourceBand = channel === "L"
    ? analysisFrame.channels.L
    : (channel === "R" ? analysisFrame.channels.R : analysisFrame.channels.C);

  const bandIds = Array.isArray(orb && orb.bandIds) ? orb.bandIds : [];
  if (!bandIds.length) return { band: sourceBand, energyOverride01: null };

  const energies = analysisFrame.spectrum.energies01;
  if (!Array.isArray(energies) || !energies.length) return { band: sourceBand, energyOverride01: null };

  let sum = 0;
  for (const idx of bandIds) sum += energies[idx] || 0;
  const avg = sum / bandIds.length;

  return { band: sourceBand, energyOverride01: clamp(avg, 0, 1) };
}

function resetOrbsToDesignedPhases() {
  for (const orb of state.orbs) {
    orb.resetPhase();
    orb.resetTrail();
  }
  state.bands.ringPhaseRad = state.orbs.length ? state.orbs[0].angleRad : 0;
}

function syncOrbCosmeticsFromSettings() {
  const defs = runtime.settings.orbs;
  for (let i = 0; i < state.orbs.length; i++) {
    const def = defs[i];
    const orb = state.orbs[i];
    if (!def || !orb) continue;
    orb.syncCosmeticFromDef(def);
  }
}

export { initOrbs, getBandForOrb, resetOrbsToDesignedPhases, syncOrbCosmeticsFromSettings };
