import { CONFIG } from "../core/config.js";
import { normalizeOrbChannelId, sanitizeOrbBandIds } from "../core/preferences.js";
import { clamp } from "../core/utils.js";

const DEFAULT_LEGACY_ORB = Object.freeze({
  id: "ORB0",
  chanId: "C",
  bandIds: [],
  chirality: -1,
  startAngleRad: 0,
});

const SCENE_ORB_RUNTIME_FIELDS = Object.freeze(["hueOffsetDeg", "centerX", "centerY"]);

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readSceneOrbDefaults() {
  return (CONFIG.visualizers && CONFIG.visualizers.orbs && CONFIG.visualizers.orbs.defaults) || {
    hueOffsetDeg: 0,
    centerX: 0,
    centerY: 0,
  };
}

function readSceneOrbLimits() {
  return (CONFIG.visualizers && CONFIG.visualizers.orbs && CONFIG.visualizers.orbs.limits) || {};
}

function sanitizeSceneOrbScalar(fieldName, rawValue, fallbackValue) {
  const defaults = readSceneOrbDefaults();
  const limits = readSceneOrbLimits();
  const fieldLimits = limits[fieldName] || {};
  const fallback = Number.isFinite(fallbackValue)
    ? fallbackValue
    : (Number.isFinite(defaults[fieldName]) ? defaults[fieldName] : 0);
  const numeric = Number.isFinite(rawValue) ? rawValue : fallback;
  const min = Number.isFinite(fieldLimits.min) ? fieldLimits.min : -Infinity;
  const max = Number.isFinite(fieldLimits.max) ? fieldLimits.max : Infinity;
  return clamp(numeric, min, max);
}

function readDefaultSceneOrbFallback(index = 0) {
  const defaults = Array.isArray(CONFIG.defaults.orbs) ? CONFIG.defaults.orbs : [];
  const legacyFallback = defaults[index % Math.max(1, defaults.length)] || DEFAULT_LEGACY_ORB;
  return {
    id: typeof legacyFallback.id === "string" ? legacyFallback.id : DEFAULT_LEGACY_ORB.id,
    chanId: normalizeOrbChannelId(legacyFallback.chanId, legacyFallback.bandId),
    bandIds: sanitizeOrbBandIds(legacyFallback.bandIds, legacyFallback.bandNames),
    chirality: Number.isFinite(legacyFallback.chirality) && legacyFallback.chirality >= 0 ? 1 : -1,
    startAngleRad: Number.isFinite(legacyFallback.startAngleRad)
      ? legacyFallback.startAngleRad
      : DEFAULT_LEGACY_ORB.startAngleRad,
    ...readSceneOrbDefaults(),
  };
}

function normalizeSceneOrbDef(incomingOrb, fallbackOrb = null) {
  const fallback = (fallbackOrb && typeof fallbackOrb === "object") ? fallbackOrb : readDefaultSceneOrbFallback(0);
  const orb = (incomingOrb && typeof incomingOrb === "object") ? incomingOrb : {};

  const id = typeof orb.id === "string" && orb.id.trim()
    ? orb.id
    : (typeof fallback.id === "string" ? fallback.id : DEFAULT_LEGACY_ORB.id);

  const chiralityRaw = Number.isFinite(orb.chirality) ? orb.chirality : fallback.chirality;
  const chirality = chiralityRaw >= 0 ? 1 : -1;

  const startAngleRad = Number.isFinite(orb.startAngleRad)
    ? orb.startAngleRad
    : (Number.isFinite(fallback.startAngleRad) ? fallback.startAngleRad : DEFAULT_LEGACY_ORB.startAngleRad);

  const chanId = (hasOwn(orb, "chanId") || hasOwn(orb, "bandId"))
    ? normalizeOrbChannelId(orb.chanId, orb.bandId)
    : normalizeOrbChannelId(fallback.chanId, fallback.bandId);
  const bandIds = (hasOwn(orb, "bandIds") || hasOwn(orb, "bandNames"))
    ? sanitizeOrbBandIds(orb.bandIds, orb.bandNames)
    : sanitizeOrbBandIds(fallback.bandIds, fallback.bandNames);

  return {
    id,
    chanId,
    bandIds,
    chirality,
    startAngleRad,
    hueOffsetDeg: sanitizeSceneOrbScalar("hueOffsetDeg", orb.hueOffsetDeg, fallback.hueOffsetDeg),
    centerX: sanitizeSceneOrbScalar("centerX", orb.centerX, fallback.centerX),
    centerY: sanitizeSceneOrbScalar("centerY", orb.centerY, fallback.centerY),
  };
}

function normalizeSceneOrbSettings(rawSettings) {
  const input = Array.isArray(rawSettings) ? rawSettings : CONFIG.defaults.orbs;
  return input.map((orb, index) => normalizeSceneOrbDef(orb, readDefaultSceneOrbFallback(index)));
}

function toLegacyOrbDef(orb, fallbackOrb = null) {
  const normalized = normalizeSceneOrbDef(orb, fallbackOrb || undefined);
  return {
    id: normalized.id,
    chanId: normalized.chanId,
    bandIds: normalized.bandIds.slice(),
    chirality: normalized.chirality,
    startAngleRad: normalized.startAngleRad,
  };
}

function readSceneOrbRuntimePatch(orb) {
  const patch = {};
  if (!orb || typeof orb !== "object") return patch;

  for (const fieldName of SCENE_ORB_RUNTIME_FIELDS) {
    if (!hasOwn(orb, fieldName)) continue;
    patch[fieldName] = orb[fieldName];
  }

  return patch;
}

function mergeSceneOrbSettingsWithRuntimeFields(rawSettings, runtimeSettings) {
  const next = normalizeSceneOrbSettings(rawSettings);
  const existing = Array.isArray(runtimeSettings) ? runtimeSettings : [];
  return next.map((orb, index) => normalizeSceneOrbDef({
    ...orb,
    ...readSceneOrbRuntimePatch(existing[index]),
  }, orb));
}

export {
  SCENE_ORB_RUNTIME_FIELDS,
  mergeSceneOrbSettingsWithRuntimeFields,
  normalizeSceneOrbDef,
  normalizeSceneOrbSettings,
  readDefaultSceneOrbFallback,
  toLegacyOrbDef,
};
