import { CONFIG } from "./config.js";
import { clamp, deepClone } from "./utils.js";

/* =============================================================================
   Preferences + Runtime settings (derived)
   ========================================================================== */
const preferences = deepClone(CONFIG.defaults);
const runtime = { settings: deepClone(CONFIG.defaults) };

function replacePreferences(next) {
  const replacement = (next && typeof next === "object") ? next : deepClone(CONFIG.defaults);
  for (const key of Object.keys(preferences)) delete preferences[key];
  Object.assign(preferences, replacement);
  return preferences;
}

const BAND_NAMES = CONFIG.bandNames;
const BAND_NAME_TO_INDEX = new Map(BAND_NAMES.map((name, index) => [name, index]));

function resolveSettings() { runtime.settings = deepClone(preferences); }


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
      const n = Number(v);
      if (!Number.isInteger(n)) continue;
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
  // Canonical orb fields (v9 schema): see agents.md §4.2.
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
  };
}

export { preferences, runtime, replacePreferences, BAND_NAMES, BAND_NAME_TO_INDEX, resolveSettings, normalizeOrbChannelId, sanitizeOrbBandIds, normalizeOrbDef };
