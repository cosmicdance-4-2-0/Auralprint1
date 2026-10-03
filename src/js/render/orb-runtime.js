import { clamp } from "../core/utils.js";
import { runtime, normalizeOrbChannelId } from "../core/preferences.js";
import { state } from "../core/state.js";
import { normalizeSceneOrbSettings } from "./orb-settings.js";
import { Orb } from "./orb.js";

/* =============================================================================
   Orb Runtime
   ========================================================================== */
const activeOrbVisualizers = [];

function createOrbsFromSettings(settings = runtime.settings) {
  const defs = Array.isArray(settings && settings.orbs) ? settings.orbs : [];
  return normalizeSceneOrbSettings(defs).map((def) => new Orb(def));
}

function readVisualizerOrbs(instance) {
  if (!instance || typeof instance.getOrbs !== "function") return [];
  const orbs = instance.getOrbs();
  return Array.isArray(orbs) ? orbs : [];
}

function syncCompatStateOrbs(orbs) {
  state.orbs.length = 0;
  if (Array.isArray(orbs)) state.orbs.push(...orbs);
}

function readActiveVisualizerOrbs() {
  const orbs = [];
  for (const visualizer of activeOrbVisualizers) {
    orbs.push(...readVisualizerOrbs(visualizer));
  }
  return orbs;
}

function syncCompatStateFromActiveVisualizers() {
  syncCompatStateOrbs(readActiveVisualizerOrbs());
}

function setActiveOrbVisualizer(instance) {
  if (!instance) return;
  if (!activeOrbVisualizers.includes(instance)) activeOrbVisualizers.push(instance);
  syncCompatStateFromActiveVisualizers();
}

function clearActiveOrbVisualizer(instance) {
  if (!instance) {
    activeOrbVisualizers.length = 0;
    syncCompatStateOrbs([]);
    return;
  }

  const index = activeOrbVisualizers.indexOf(instance);
  if (index >= 0) activeOrbVisualizers.splice(index, 1);
  syncCompatStateFromActiveVisualizers();
}

function readActiveOrbs() {
  return activeOrbVisualizers.length ? readActiveVisualizerOrbs() : state.orbs;
}

function initOrbs() {
  if (activeOrbVisualizers.length) {
    const visualizers = activeOrbVisualizers.slice();
    for (const visualizer of visualizers) {
      if (typeof visualizer.rebuildFromSettings === "function") visualizer.rebuildFromSettings();
    }
    syncCompatStateFromActiveVisualizers();
    return;
  }

  syncCompatStateOrbs(createOrbsFromSettings());
}

function readFrameChannel(frame, channelId) {
  const channels = frame && frame.analysis && Array.isArray(frame.analysis.channels)
    ? frame.analysis.channels
    : [];
  return channels.find((channel) => channel && channel.id === channelId) || null;
}

function readChannelEnergy01(channel) {
  if (Number.isFinite(channel && channel.energy)) return clamp(channel.energy, 0, 1);
  if (Number.isFinite(channel && channel.energy01)) return clamp(channel.energy01, 0, 1);
  if (Number.isFinite(channel && channel.rms)) return clamp(channel.rms * runtime.settings.audio.rmsGain, 0, 1);
  return 0;
}

function readBandEnergy01(frame, bandIndex) {
  const bands = Array.isArray(frame && frame.bands) ? frame.bands : [];
  const band = Number.isInteger(bandIndex) ? bands[bandIndex] : null;
  if (Number.isFinite(band && band.energy)) return clamp(band.energy, 0, 1);
  return 0;
}

function readChannelBandEnergy01(channel, bandIndex) {
  const bandEnergies01 = Array.isArray(channel && channel.bandEnergies01) ? channel.bandEnergies01 : null;
  if (!bandEnergies01 || !Number.isInteger(bandIndex)) return null;
  const energy = bandEnergies01[bandIndex];
  return Number.isFinite(energy) ? clamp(energy, 0, 1) : 0;
}

function readDominantBandIndex(frame) {
  if (Number.isInteger(frame && frame.dominantBandIndex) && frame.dominantBandIndex >= 0) {
    return frame.dominantBandIndex;
  }
  if (Number.isInteger(frame && frame.dominantBand && frame.dominantBand.index) && frame.dominantBand.index >= 0) {
    return frame.dominantBand.index;
  }

  const bands = Array.isArray(frame && frame.bands) ? frame.bands : [];
  let strongestBandIndex = null;
  let strongestEnergy = -1;

  for (const band of bands) {
    const bandIndex = Number.isInteger(band && band.index) ? band.index : null;
    const energy = Number.isFinite(band && band.energy) ? clamp(band.energy, 0, 1) : 0;
    if (!Number.isInteger(bandIndex) || energy <= strongestEnergy) continue;
    strongestBandIndex = bandIndex;
    strongestEnergy = energy;
  }

  return strongestBandIndex;
}

function getBandForOrb(orb, frame) {
  const channel = normalizeOrbChannelId(orb && orb.chanId, orb && orb.bandId);
  const sourceChannel = readFrameChannel(frame, channel);
  const sourceBand = sourceChannel
    ? {
      id: sourceChannel.id,
      label: sourceChannel.label || sourceChannel.id,
      timeDomain: sourceChannel.timeDomain || null,
      energy01: readChannelEnergy01(sourceChannel),
    }
    : null;

  const bandIds = Array.isArray(orb && orb.bandIds) ? orb.bandIds : [];
  if (!bandIds.length) {
    return {
      band: sourceBand,
      energyOverride01: null,
      colorBandIndex: readDominantBandIndex(frame),
    };
  }

  let sum = 0;
  let strongestBandIndex = bandIds[0];
  let strongestEnergy = -1;
  const hasChannelBandSpectrum = Array.isArray(sourceChannel && sourceChannel.bandEnergies01);

  for (const idx of bandIds) {
    const energy = hasChannelBandSpectrum
      ? readChannelBandEnergy01(sourceChannel, idx)
      : readBandEnergy01(frame, idx);
    sum += energy;
    if (energy <= strongestEnergy) continue;
    strongestEnergy = energy;
    strongestBandIndex = idx;
  }

  const avg = sum / bandIds.length;

  return {
    band: sourceBand,
    energyOverride01: clamp(avg, 0, 1),
    colorBandIndex: strongestBandIndex,
  };
}

function resetOrbTrails() {
  for (const orb of readActiveOrbs()) orb.resetTrail();
}

function resetOrbsToDesignedPhases() {
  let angleRad = null;

  if (activeOrbVisualizers.length) {
    for (const visualizer of activeOrbVisualizers) {
      if (typeof visualizer.resetToDesignedPhases !== "function") continue;
      const nextAngleRad = visualizer.resetToDesignedPhases();
      if (angleRad === null && Number.isFinite(nextAngleRad)) angleRad = nextAngleRad;
    }
  } else {
    for (const orb of readActiveOrbs()) {
      orb.resetPhase();
      orb.resetTrail();
    }
    const primaryOrb = readActiveOrbs()[0] || null;
    angleRad = Number.isFinite(primaryOrb && primaryOrb.angleRad) ? primaryOrb.angleRad : null;
  }

  state.bands.ringPhaseRad = Number.isFinite(angleRad) ? angleRad : 0;
}

function getActiveOrbPrimaryAngleRad() {
  for (const visualizer of activeOrbVisualizers) {
    if (typeof visualizer.getPrimaryAngleRad !== "function") continue;
    const angleRad = visualizer.getPrimaryAngleRad();
    if (Number.isFinite(angleRad)) return angleRad;
  }

  const primaryOrb = state.orbs[0] || null;
  return Number.isFinite(primaryOrb && primaryOrb.angleRad) ? primaryOrb.angleRad : null;
}

export {
  clearActiveOrbVisualizer,
  createOrbsFromSettings,
  getActiveOrbPrimaryAngleRad,
  getBandForOrb,
  initOrbs,
  resetOrbTrails,
  resetOrbsToDesignedPhases,
  setActiveOrbVisualizer,
};
