import { normalizeMaxDeltaTimeSec } from "./timing.js";
import { normalizeParticleSafety } from "./particle-safety.js";
import { CONFIG } from "./config.js";
import { assertOrbAdmission } from "./orb-admission.js";
import { clamp, deepClone } from "./utils.js";

/* =============================================================================
   Preferences + Runtime settings (derived)
   ========================================================================== */
const preferences = deepClone(CONFIG.defaults);
const runtime = { settings: deepClone(CONFIG.defaults) };

function normalizeMinPlacementDistancePx(value, fallback = CONFIG.defaults.orbs[0].particles.minPlacementDistancePx) {
  const limits = CONFIG.limits.particles.minPlacementDistancePx;
  const raw = Number.isFinite(value) ? value : fallback;
  return clamp(Number.isFinite(raw) ? raw : CONFIG.defaults.orbs[0].particles.minPlacementDistancePx, limits.min, limits.max);
}

function replacePreferences(next) {
  const replacement = (next && typeof next === "object") ? next : deepClone(CONFIG.defaults);
  assertOrbAdmission(replacement.orbs);
  for (const key of Object.keys(preferences)) delete preferences[key];
  Object.assign(preferences, replacement);
  return preferences;
}

const BAND_NAMES = CONFIG.bandNames;
const BAND_NAME_TO_INDEX = new Map(BAND_NAMES.map((name, index) => [name, index]));

function normalizeBandCount(count) {
  const limits = CONFIG.limits.bands.count;
  return Number.isInteger(count) && count >= limits.min && count <= limits.max
    ? count
    : CONFIG.defaults.bands.count;
}

function resolveSettings() {
  assertOrbAdmission(preferences.orbs);
  runtime.settings = deepClone(preferences);
  runtime.settings.bands.count = normalizeBandCount(preferences.bands.count);
  runtime.settings.timing = { maxDeltaTimeSec: normalizeMaxDeltaTimeSec(preferences.timing?.maxDeltaTimeSec) };
  runtime.settings.particleSafety = normalizeParticleSafety(preferences.particleSafety);
}


function normalizeOrbChannelId(rawChanId, rawLegacyBandId) {
  const candidate = typeof rawChanId === "string"
    ? rawChanId
    : (typeof rawLegacyBandId === "string" ? rawLegacyBandId : "");
  const up = candidate.toUpperCase();
  return ["L", "R", "C"].includes(up) ? up : "C";
}

function sanitizeOrbBandIds(rawBandIds, rawBandNames) {
  const bandCount = BAND_NAMES.length;

  if (Array.isArray(rawBandIds)) {
    const out = [];
    const seen = new Set();
    for (const v of rawBandIds) {
      // Canonical references are integer numbers; imported types never coerce.
      const n = v;
      if (typeof n !== "number" || !Number.isInteger(n)) continue;
      if (n < 0 || n >= bandCount) continue;
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  }

  if (Array.isArray(rawBandNames) && bandCount) {
    const out = [];
    const seen = new Set();
    for (const bandName of rawBandNames) {
      if (typeof bandName !== "string") continue;
      const idx = BAND_NAME_TO_INDEX.get(bandName);
      if (!Number.isInteger(idx) || seen.has(idx)) continue;
      seen.add(idx);
      out.push(idx);
    }
    return out;
  }

  return [];
}

function normalizeOrbColorSource(raw, fallback) {
  const lim = CONFIG.limits.orbs.colorSources;
  const candidate = typeof raw === "string" ? raw : fallback;
  return lim.includes(candidate) ? candidate : "inherit";
}

function normalizeOrbDef(incomingOrb, fallbackOrb) {
  // Canonical orb fields (v10 schema): see agents.md §4.2.
  const fallback = fallbackOrb || {};
  const orb = (incomingOrb && typeof incomingOrb === "object") ? incomingOrb : {};
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const orbLim = CONFIG.limits.orbs;

  const id = typeof orb.id === "string" && orb.id.trim()
    ? orb.id
    : (typeof fallback.id === "string" ? fallback.id : "ORB");

  const chiralityRaw = Number.isFinite(orb.chirality) ? orb.chirality : fallback.chirality;
  const chirality = chiralityRaw >= 0 ? 1 : -1;

  const startAngleRad = Number.isFinite(orb.startAngleRad)
    ? orb.startAngleRad
    : (Number.isFinite(fallback.startAngleRad) ? fallback.startAngleRad : 0);

  const chanId = (hasOwn(orb, "chanId") || hasOwn(orb, "bandId"))
    ? normalizeOrbChannelId(orb.chanId, orb.bandId)
    : normalizeOrbChannelId(fallback.chanId, fallback.bandId);
  const bandIds = (hasOwn(orb, "bandIds") || hasOwn(orb, "bandNames"))
    ? sanitizeOrbBandIds(orb.bandIds, orb.bandNames)
    : sanitizeOrbBandIds(fallback.bandIds, fallback.bandNames);

  const hueRaw = Number.isFinite(orb.hueOffsetDeg) ? orb.hueOffsetDeg : fallback.hueOffsetDeg;
  const hueOffsetDeg = clamp(
    Number.isFinite(hueRaw) ? hueRaw : 0,
    orbLim.hueOffsetDeg.min,
    orbLim.hueOffsetDeg.max,
  );

  const colorSource = hasOwn(orb, "colorSource")
    ? normalizeOrbColorSource(orb.colorSource, fallback.colorSource)
    : normalizeOrbColorSource(fallback.colorSource, "inherit");

  const centerXRaw = Number.isFinite(orb.centerXFrac) ? orb.centerXFrac : fallback.centerXFrac;
  const centerYRaw = Number.isFinite(orb.centerYFrac) ? orb.centerYFrac : fallback.centerYFrac;
  const centerXFrac = clamp(
    Number.isFinite(centerXRaw) ? centerXRaw : 0,
    orbLim.centerXFrac.min,
    orbLim.centerXFrac.max,
  );
  const centerYFrac = clamp(
    Number.isFinite(centerYRaw) ? centerYRaw : 0,
    orbLim.centerYFrac.min,
    orbLim.centerYFrac.max,
  );

  const nestedNumber = (group, key, limits) => {
    const source = orb[group] && typeof orb[group] === "object" ? orb[group] : {};
    const defaults = fallback[group] && typeof fallback[group] === "object" ? fallback[group] : {};
    const raw = Number.isFinite(source[key]) ? source[key] : defaults[key];
    return clamp(Number.isFinite(raw) ? raw : limits.min, limits.min, limits.max);
  };
  const motion = {
    angularSpeedRadPerSec: nestedNumber("motion", "angularSpeedRadPerSec", CONFIG.limits.motion.angularSpeedRadPerSec),
  };
  const response = {
    minRadiusFrac: nestedNumber("response", "minRadiusFrac", orbLim.response.minRadiusFrac),
    maxRadiusFrac: nestedNumber("response", "maxRadiusFrac", orbLim.response.maxRadiusFrac),
    waveformRadialDisplaceFrac: nestedNumber("response", "waveformRadialDisplaceFrac", orbLim.response.waveformRadialDisplaceFrac),
  };
  const particles = {};
  for (const key of ["emitPerSecond", "sizeMaxPx", "sizeMinPx", "sizeToMinSec", "ttlSec"]) {
    particles[key] = nestedNumber("particles", key, CONFIG.limits.particles[key]);
  }
  particles.minPlacementDistancePx = normalizeMinPlacementDistancePx(orb.particles?.minPlacementDistancePx, fallback.particles?.minPlacementDistancePx);
  particles.sizeMinPx = Math.min(particles.sizeMinPx, particles.sizeMaxPx);
  particles.ttlSec = Math.max(particles.ttlSec, particles.sizeToMinSec);
  const traceSource = orb.trace && typeof orb.trace === "object" ? orb.trace : {};
  const traceFallback = fallback.trace && typeof fallback.trace === "object" ? fallback.trace : {};
  const mode = typeof traceSource.lineColorMode === "string" ? traceSource.lineColorMode : traceFallback.lineColorMode;
  const trace = {
    lines: typeof traceSource.lines === "boolean" ? traceSource.lines : !!traceFallback.lines,
    numLines: nestedNumber("trace", "numLines", CONFIG.limits.trace.numLines),
    lineAlpha: nestedNumber("trace", "lineAlpha", CONFIG.limits.trace.lineAlpha),
    lineWidthPx: nestedNumber("trace", "lineWidthPx", CONFIG.limits.trace.lineWidthPx),
    lineColorMode: ["fixed", "lastParticle", "dominantBand"].includes(mode) ? mode : "dominantBand",
  };

  return {
    id,
    chanId,
    bandIds,
    chirality,
    startAngleRad,
    hueOffsetDeg,
    colorSource,
    centerXFrac,
    centerYFrac,
    motion,
    response,
    particles,
    trace,
  };
}

export { preferences, runtime, replacePreferences, BAND_NAMES, BAND_NAME_TO_INDEX, resolveSettings, normalizeBandCount, normalizeOrbChannelId, sanitizeOrbBandIds, normalizeOrbDef, normalizeMinPlacementDistancePx };
