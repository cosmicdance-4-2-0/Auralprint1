import { PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V2, LEGACY_SCHEMA_V3, LEGACY_SCHEMA_V4, LEGACY_SCHEMA_V5, LEGACY_SCHEMA_V6, LEGACY_SCHEMA_V7, LEGACY_SCHEMA_V8, LEGACY_SCHEMA_V9, LEGACY_SCHEMA_V10, LEGACY_SCHEMA_V11, LEGACY_SCHEMA_V12 } from "../core/constants.js";
import { clamp, deepClone, isValidHexColor } from "../core/utils.js";
import { normalizeMaxDeltaTimeSec } from "../core/timing.js";
import { normalizeParticleSafety } from "../core/particle-safety.js";
import { normalizeSceneCamera } from "../core/camera-state.js";
import { normalizeWorldSettings } from "../core/world-settings.js";
import { CONFIG } from "../core/config.js";
import { sanitizeOrbBandIds, normalizeBandCount } from "../core/preferences.js";
import { normalizeOrbCollection } from "../core/orb-collection.js";
import { assertOrbAdmission } from "../core/orb-admission.js";
import { assertSupportedBandFrequencies } from "../core/band-frequency.js";
import { compactPreferences, expandCompactPreferences } from "./compact-preset.js";
import { assertPresetStructure } from "./preset-limits.js";
import { SCHEMA_13_BASELINE } from "./schema-13-baseline.js";

// Preset data contract, independent of URL/base64 or application state.
// Schema 10 is published and immutable. Schema 11 adds the authorized world
// reference and explicitly named world-unit placement distance. Schema 12 adds
// only the authored Scene camera. Historical formats and migrations remain
// supported, subject to current CONFIG-supported frequency admission across all
// supported schemas; formerly admitted excessive frequencies may now be rejected.
const SUPPORTED_SCHEMAS = [PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V12, LEGACY_SCHEMA_V11, LEGACY_SCHEMA_V10, LEGACY_SCHEMA_V9, LEGACY_SCHEMA_V8, LEGACY_SCHEMA_V7, LEGACY_SCHEMA_V6, LEGACY_SCHEMA_V5, LEGACY_SCHEMA_V4, LEGACY_SCHEMA_V3, LEGACY_SCHEMA_V2];
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function decodePresetPayload(payload) {
  if (!isRecord(payload) || !isRecord(payload.prefs)) return { ok: false, code: "malformed-payload" };
  if (!SUPPORTED_SCHEMAS.includes(payload.schema)) return { ok: false, code: "unsupported-schema" };
  try {
    assertPresetStructure(payload);
    if (payload.schema === PRESET_SCHEMA_VERSION && Object.keys(payload).some(key => !["schema", "prefs"].includes(key))) return { ok: false, code: "unknown-preset-field" };
    const incoming = payload.schema === PRESET_SCHEMA_VERSION ? expandCompactPreferences(payload.prefs)
      : payload.schema === LEGACY_SCHEMA_V9 ? recoverScene9Preferences(payload.prefs) : payload.prefs;
    assertOrbAdmission(incoming.orbs); assertSupportedBandFrequencies(incoming.bands);
  }
  catch (error) { return { ok: false, code: error.code }; }
  return { ok: true, schema: payload.schema, prefs: payload.prefs };
}

function recoverScene9Preferences(prefs) {
  // Schema 9 was reused for Scene nodes and later top-level visual settings.
  // Recover only current configuration equivalents. Scene bounds/anchors,
  // order, visibility, editor/camera state and node-relative centerX/Y are
  // intentionally discarded; no Scene architecture is restored.
  const nodes = prefs.scene && Array.isArray(prefs.scene.nodes) ? prefs.scene.nodes : [];
  const incoming = { ...prefs };
  if (!hasOwn(prefs, "orbs")) {
    const node = nodes.find((node) => node && node.type === "orbs" && Array.isArray(node.settings));
    if (node) incoming.orbs = node.settings;
  }
  const bands = isRecord(prefs.bands) ? prefs.bands : {};
  if (!hasOwn(bands, "overlay")) {
    const node = nodes.find((node) => node && node.type === "bandOverlay" && isRecord(node.settings));
    if (node) {
      const overlay = { ...node.settings };
      if (typeof node.enabled === "boolean") overlay.enabled = node.enabled;
      incoming.bands = { ...bands, overlay };
    }
  }
  return incoming;
}

function encodePresetPayload(prefs) {
  // A writer must never repair an explicitly supplied out-of-domain frequency.
  // Legacy input sanitation remains a separate decoder/migration policy.
  assertSupportedBandFrequencies(prefs?.bands);
  const bands = prefs?.bands;
  const invalidValue = ["floorHz", "ceilingHz"].some(field => bands && hasOwn(bands, field)
    && (!Number.isFinite(bands[field]) || bands[field] <= 0));
  if (invalidValue || bands?.floorHz > bands?.ceilingHz) {
    const error = new RangeError("Cannot encode invalid band frequencies.");
    error.code = "invalid-frequency";
    throw error;
  }
  // Sanitize on both boundaries: arbitrary preference/runtime additions can
  // never leak through a clone of the mutable preferences object.
  return { schema: PRESET_SCHEMA_VERSION, prefs: compactPreferences(sanitizeCanonicalPreset({ schema: PRESET_SCHEMA_VERSION, prefs })) };
}

function sanitizePreset(decoded) {
  return decoded.schema === PRESET_SCHEMA_VERSION
    ? sanitizeCanonicalPreset({ schema: PRESET_SCHEMA_VERSION, prefs: expandCompactPreferences(decoded.prefs) }, SCHEMA_13_BASELINE)
    : sanitizeCanonicalPreset(decoded);
}

function sanitizeCanonicalPreset(decoded, baseline = CONFIG.defaults) {
  const schema = decoded && Number.isInteger(decoded.schema) ? decoded.schema : PRESET_SCHEMA_VERSION;
  const incoming = schema === LEGACY_SCHEMA_V9
    ? recoverScene9Preferences(decoded.prefs)
    : decoded.prefs;
  assertOrbAdmission(incoming.orbs);
  assertSupportedBandFrequencies(incoming.bands);
  // Presets are full configuration snapshots. Always migrate/sanitize from
  // canonical defaults so older or partial payloads cannot inherit live state.
  const next = deepClone(baseline);
  if (schema >= LEGACY_SCHEMA_V11) next.world = normalizeWorldSettings(incoming.world);
  if (schema >= LEGACY_SCHEMA_V12) {
    const camera = incoming.sceneCamera;
    next.sceneCamera = normalizeSceneCamera(baseline === CONFIG.defaults ? camera : {
      ...camera, zoom: camera.zoom > 0 ? camera.zoom : baseline.sceneCamera.zoom,
    });
  }

  if (incoming.visuals) {
    if (isValidHexColor(incoming.visuals.backgroundColor)) next.visuals.backgroundColor = incoming.visuals.backgroundColor;
    if (isValidHexColor(incoming.visuals.particleColor)) next.visuals.particleColor = incoming.visuals.particleColor;
  }

  if (incoming.audio) {
    if (Number.isFinite(incoming.audio.rmsGain)) {
      const lim = CONFIG.limits.audio.rmsGain;
      next.audio.rmsGain = clamp(incoming.audio.rmsGain, lim.min, lim.max);
    }
    if (Number.isFinite(incoming.audio.smoothingTimeConstant)) {
      const lim = CONFIG.limits.audio.smoothingTimeConstant;
      next.audio.smoothingTimeConstant = clamp(incoming.audio.smoothingTimeConstant, lim.min, lim.max);
    }
    if (Number.isFinite(incoming.audio.fftSize) && CONFIG.limits.audio.fftSizes.includes(incoming.audio.fftSize)) {
      next.audio.fftSize = incoming.audio.fftSize;
    }

    if (["none", "one", "all"].includes(incoming.audio.repeatMode)) next.audio.repeatMode = incoming.audio.repeatMode;
    else if (typeof incoming.audio.loop === "boolean") next.audio.repeatMode = incoming.audio.loop ? "one" : "none";
    if (typeof incoming.audio.muted === "boolean") next.audio.muted = incoming.audio.muted;
    if (Number.isFinite(incoming.audio.volume)) {
      next.audio.volume = clamp(incoming.audio.volume, CONFIG.ui.volume.min, CONFIG.ui.volume.max);
    }
  }

  if (incoming.bands) {
    const count = incoming.bands.count, limits = CONFIG.limits.bands.count;
    next.bands.count = Number.isInteger(count) && count >= limits.min && count <= limits.max
      ? normalizeBandCount(count) : baseline.bands.count;
    if (Number.isFinite(incoming.bands.floorHz) && incoming.bands.floorHz > 0) {
      next.bands.floorHz = incoming.bands.floorHz;
    }
    if (Number.isFinite(incoming.bands.ceilingHz) && incoming.bands.ceilingHz > 0) {
      next.bands.ceilingHz = incoming.bands.ceilingHz;
    }

    if (incoming.bands.overlay) {
      if (typeof incoming.bands.overlay.enabled === "boolean") next.bands.overlay.enabled = incoming.bands.overlay.enabled;
      if (typeof incoming.bands.overlay.connectAdjacent === "boolean") next.bands.overlay.connectAdjacent = incoming.bands.overlay.connectAdjacent;

      if (Number.isFinite(incoming.bands.overlay.alpha)) {
        const lim = CONFIG.limits.bands.overlayAlpha;
        next.bands.overlay.alpha = clamp(incoming.bands.overlay.alpha, lim.min, lim.max);
      }
      if (Number.isFinite(incoming.bands.overlay.pointSizePx)) {
        const lim = CONFIG.limits.bands.pointSizePx;
        next.bands.overlay.pointSizePx = clamp(incoming.bands.overlay.pointSizePx, lim.min, lim.max);
      }
      if (Number.isFinite(incoming.bands.overlay.minRadiusFrac)) {
        const lim = CONFIG.limits.bands.overlayMinRadiusFrac;
        next.bands.overlay.minRadiusFrac = clamp(incoming.bands.overlay.minRadiusFrac, lim.min, lim.max);
      }
      if (Number.isFinite(incoming.bands.overlay.maxRadiusFrac)) {
        const lim = CONFIG.limits.bands.overlayMaxRadiusFrac;
        next.bands.overlay.maxRadiusFrac = clamp(incoming.bands.overlay.maxRadiusFrac, lim.min, lim.max);
      }
      if (Number.isFinite(incoming.bands.overlay.waveformRadialDisplaceFrac)) {
        const lim = CONFIG.limits.bands.overlayWaveformRadialDisplaceFrac;
        next.bands.overlay.waveformRadialDisplaceFrac = clamp(incoming.bands.overlay.waveformRadialDisplaceFrac, lim.min, lim.max);
      }
      if (Number.isFinite(incoming.bands.overlay.lineAlpha)) {
        const lim = CONFIG.limits.bands.overlayLineAlpha;
        next.bands.overlay.lineAlpha = clamp(incoming.bands.overlay.lineAlpha, lim.min, lim.max);
      }
      if (Number.isFinite(incoming.bands.overlay.lineWidthPx)) {
        const lim = CONFIG.limits.bands.overlayLineWidthPx;
        next.bands.overlay.lineWidthPx = clamp(incoming.bands.overlay.lineWidthPx, lim.min, lim.max);
      }

      if (typeof incoming.bands.overlay.phaseMode === "string") {
        if (["orb","free"].includes(incoming.bands.overlay.phaseMode)) {
          next.bands.overlay.phaseMode = incoming.bands.overlay.phaseMode;
        }
      }
      if (Number.isFinite(incoming.bands.overlay.ringSpeedRadPerSec)) {
        const lim = CONFIG.limits.bands.ringSpeedRadPerSec;
        next.bands.overlay.ringSpeedRadPerSec = clamp(incoming.bands.overlay.ringSpeedRadPerSec, lim.min, lim.max);
      }
    }

    if (incoming.bands.rainbow) {
      if (Number.isFinite(incoming.bands.rainbow.hueOffsetDeg)) {
        const lim = CONFIG.limits.sceneColor.hueOffsetDeg;
        next.bands.rainbow.hueOffsetDeg = clamp(incoming.bands.rainbow.hueOffsetDeg, lim.min, lim.max);
      }
      if (Number.isFinite(incoming.bands.rainbow.saturation)) {
        const lim = CONFIG.limits.sceneColor.saturation;
        next.bands.rainbow.saturation = clamp(incoming.bands.rainbow.saturation, lim.min, lim.max);
      }
      if (Number.isFinite(incoming.bands.rainbow.value)) {
        const lim = CONFIG.limits.sceneColor.value;
        next.bands.rainbow.value = clamp(incoming.bands.rainbow.value, lim.min, lim.max);
      }
    }

    if (typeof incoming.bands.particleColorSource === "string") {
      if (CONFIG.limits.sceneColor.particleColorSources.includes(incoming.bands.particleColorSource)) {
        next.bands.particleColorSource = incoming.bands.particleColorSource;
      }
    }

    // Canonical distribution; legacy boolean is input-only.
    if (typeof incoming.bands.distributionMode === "string") {
      if (CONFIG.limits.bands.distributionModes.includes(incoming.bands.distributionMode)) {
        next.bands.distributionMode = incoming.bands.distributionMode;
      }
    }
    // Legacy migration: logSpacing boolean (schema v7 and below) → distributionMode
    if (typeof incoming.bands.logSpacing === "boolean" && incoming.bands.distributionMode == null) {
      next.bands.distributionMode = incoming.bands.logSpacing ? "log" : "linear";
    }
  }

  next.timing.maxDeltaTimeSec = normalizeMaxDeltaTimeSec(incoming.timing?.maxDeltaTimeSec);
  const safety = incoming.particleSafety;
  next.particleSafety = normalizeParticleSafety({
    maxEmissionsPerFrame: Number.isInteger(safety?.maxEmissionsPerFrame) ? safety.maxEmissionsPerFrame : baseline.particleSafety.maxEmissionsPerFrame,
    maxActiveParticles: Number.isInteger(safety?.maxActiveParticles) ? safety.maxActiveParticles : baseline.particleSafety.maxActiveParticles,
  });

  next.bands.ceilingHz = Math.max(next.bands.floorHz, next.bands.ceilingHz);


  if (Array.isArray(incoming.orbs)) {
    // Orb field sanitization rule (enforced on both encode and decode):
    // normalizeOrbDef and normalizeOrbCollection own Orb shape and identity.
    // Future persisted-field changes require a new schema and migration.
    const defaults = baseline.orbs;
    next.orbs = normalizeOrbCollection(incoming.orbs.map((orb, i) => {
      const mappedOrb = (orb && typeof orb === "object") ? { ...orb } : orb;
      if (mappedOrb && !Array.isArray(mappedOrb.bandIds) && Array.isArray(mappedOrb.bandNames)) {
        mappedOrb.bandIds = sanitizeOrbBandIds(undefined, mappedOrb.bandNames);
      }
      if (mappedOrb && typeof mappedOrb === "object") delete mappedOrb.bandNames;
      if (schema <= LEGACY_SCHEMA_V9 && mappedOrb && typeof mappedOrb === "object") {
        const base = defaults[i % defaults.length];
        mappedOrb.motion = { angularSpeedRadPerSec: incoming.motion && incoming.motion.angularSpeedRadPerSec };
        mappedOrb.response = {
          minRadiusFrac: incoming.audio && incoming.audio.minRadiusFrac,
          maxRadiusFrac: incoming.audio && incoming.audio.maxRadiusFrac,
          waveformRadialDisplaceFrac: incoming.motion && incoming.motion.waveformRadialDisplaceFrac,
        };
        mappedOrb.particles = { ...base.particles, ...(incoming.particles || {}) };
        mappedOrb.trace = { ...base.trace, ...(incoming.trace || {}) };
      }
      if (schema <= LEGACY_SCHEMA_V10 && mappedOrb && typeof mappedOrb === "object") {
        // Published schemas retain pixel-valued input. Only migration converts
        // it into schema 11's explicitly named world-unit field; ignore injected
        // world/Units fields in old payloads and never mutate the source object.
        const particles = mappedOrb.particles;
        const legacyPx = particles?.minPlacementDistancePx;
        mappedOrb.particles = { ...particles,
          minPlacementDistanceUnits: Number.isFinite(legacyPx)
            ? legacyPx * CONFIG.worldGeometry.legacyWorldUnitsPerCssPixel
            : CONFIG.defaults.orbs[i % defaults.length].particles.minPlacementDistanceUnits,
        };
        delete mappedOrb.particles.minPlacementDistancePx;
      }
      return mappedOrb;
    }));
  }

  if (next.bands && typeof next.bands === "object") delete next.bands.names;

  return next;
}

export { encodePresetPayload, decodePresetPayload, sanitizePreset };
