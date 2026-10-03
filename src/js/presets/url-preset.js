import { PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V2, LEGACY_SCHEMA_V3, LEGACY_SCHEMA_V4, LEGACY_SCHEMA_V5, LEGACY_SCHEMA_V6, LEGACY_SCHEMA_V7, LEGACY_SCHEMA_V8, LEGACY_SCHEMA_V9 } from "../core/constants.js";
import { clamp, deepClone, isValidHexColor } from "../core/utils.js";
import { CONFIG } from "../core/config.js";
import { preferences, replacePreferences, resolveSettings, sanitizeOrbBandIds, normalizeOrbDef } from "../core/preferences.js";

/* =============================================================================
   URL Presets (v2/v3/v4/v5 compatible)
   ========================================================================== */
const UrlPreset = (() => {
  function base64UrlEncode(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    let b64 = btoa(s);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlDecodeToBytes(b64url) {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function encodePrefsToHash(prefs) {
    const payload = { schema: PRESET_SCHEMA_VERSION, prefs };
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    return "#p=" + base64UrlEncode(bytes);
  }

  function decodePrefsFromHash(hash) {
    if (!hash || !hash.startsWith("#p=")) return null;
    const token = hash.slice(3);
    const bytes = base64UrlDecodeToBytes(token);
    const json = new TextDecoder().decode(bytes);
    const obj = JSON.parse(json);
    if (!obj || !obj.prefs) return null;

    if (![PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V9, LEGACY_SCHEMA_V8, LEGACY_SCHEMA_V7, LEGACY_SCHEMA_V6, LEGACY_SCHEMA_V5, LEGACY_SCHEMA_V4, LEGACY_SCHEMA_V3, LEGACY_SCHEMA_V2].includes(obj.schema)) return null;
    return { schema: obj.schema, prefs: obj.prefs };
  }

  function sanitizeAndApply(decoded) {
    const schema = decoded && Number.isInteger(decoded.schema) ? decoded.schema : PRESET_SCHEMA_VERSION;
    const incoming = decoded && decoded.prefs ? decoded.prefs : decoded;
    // Presets are full configuration snapshots. Always migrate/sanitize from
    // canonical defaults so older or partial payloads cannot inherit live state.
    const next = deepClone(CONFIG.defaults);

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
      const maxBandCount = Array.isArray(CONFIG.bandNames) && CONFIG.bandNames.length
        ? CONFIG.bandNames.length
        : CONFIG.defaults.bands.count;
      if (Number.isInteger(incoming.bands.count) && incoming.bands.count >= 2 && incoming.bands.count <= maxBandCount) {
        next.bands.count = incoming.bands.count;
      }
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
          const lim = CONFIG.limits.trace.lineAlpha;
          next.bands.overlay.lineAlpha = clamp(incoming.bands.overlay.lineAlpha, lim.min, lim.max);
        }
        if (Number.isFinite(incoming.bands.overlay.lineWidthPx)) {
          const lim = CONFIG.limits.trace.lineWidthPx;
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
          const lim = CONFIG.limits.bands.hueOffsetDeg;
          next.bands.rainbow.hueOffsetDeg = clamp(incoming.bands.rainbow.hueOffsetDeg, lim.min, lim.max);
        }
        if (Number.isFinite(incoming.bands.rainbow.saturation)) {
          const lim = CONFIG.limits.bands.saturation;
          next.bands.rainbow.saturation = clamp(incoming.bands.rainbow.saturation, lim.min, lim.max);
        }
        if (Number.isFinite(incoming.bands.rainbow.value)) {
          const lim = CONFIG.limits.bands.value;
          next.bands.rainbow.value = clamp(incoming.bands.rainbow.value, lim.min, lim.max);
        }
      }

      if (typeof incoming.bands.particleColorSource === "string") {
        if (["fixed","dominant","angle"].includes(incoming.bands.particleColorSource)) {
          next.bands.particleColorSource = incoming.bands.particleColorSource;
        }
      }

      // New field: distributionMode
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

    if (incoming.timing) {
      if (Number.isFinite(incoming.timing.maxDeltaTimeSec) && incoming.timing.maxDeltaTimeSec > 0) {
        next.timing.maxDeltaTimeSec = incoming.timing.maxDeltaTimeSec;
      }
    }

    next.bands.ceilingHz = Math.max(next.bands.floorHz, next.bands.ceilingHz);


    if (Array.isArray(incoming.orbs)) {
      // Orb field sanitization rule (enforced on both encode and decode):
      // normalizeOrbDef is the canonical filter — only its returned fields survive
      // into preferences. New fields must be added there first, then here, then
      // in writeHashFromPrefs, then PRESET_SCHEMA_VERSION must be bumped.
      const defaults = CONFIG.defaults.orbs;
      next.orbs = incoming.orbs.map((orb, i) => {
        const mappedOrb = (orb && typeof orb === "object") ? deepClone(orb) : orb;
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
        return normalizeOrbDef(mappedOrb, defaults[i % defaults.length]);
      });
    }

    if (next.bands && typeof next.bands === "object") delete next.bands.names;

    replacePreferences(next);
    resolveSettings();
    return true;
  }

  function applyFromLocationHash() {
    try {
      const decoded = decodePrefsFromHash(location.hash);
      if (!decoded) return false;
      return sanitizeAndApply(decoded);
    } catch {
      return false;
    }
  }

  function writeHashFromPrefs() {
    const encodedPrefs = deepClone(preferences);
    delete encodedPrefs.motion;
    delete encodedPrefs.particles;
    delete encodedPrefs.trace;
    if (encodedPrefs.audio) {
      delete encodedPrefs.audio.minRadiusFrac;
      delete encodedPrefs.audio.maxRadiusFrac;
    }
    if (encodedPrefs.bands && typeof encodedPrefs.bands === "object") delete encodedPrefs.bands.names;

    // Orb field sanitization rule (enforced on both encode and decode):
    // Only the fields returned by normalizeOrbDef are ever written into a preset URL.
    // This means adding a new field to preferences.orbs is NOT enough — it must also
    // be added to normalizeOrbDef's return object, sanitizeAndApply, and trigger a
    // PRESET_SCHEMA_VERSION bump so migration code stays honest.
    if (Array.isArray(encodedPrefs.orbs)) {
      encodedPrefs.orbs = encodedPrefs.orbs.map((orb, i) => {
        const fallback = CONFIG.defaults.orbs[i % CONFIG.defaults.orbs.length];
        return normalizeOrbDef(orb, fallback);
      });
    }

    const hash = encodePrefsToHash(encodedPrefs);
    history.replaceState(null, "", location.pathname + location.search + hash);
  }

  return { applyFromLocationHash, writeHashFromPrefs };
})();

export { UrlPreset };
