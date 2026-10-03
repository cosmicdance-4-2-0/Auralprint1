import { PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V1, LEGACY_SCHEMA_V2, LEGACY_SCHEMA_V3, LEGACY_SCHEMA_V4, LEGACY_SCHEMA_V5, LEGACY_SCHEMA_V6, LEGACY_SCHEMA_V7 } from "../core/constants.js";
import { clamp, deepClone, isValidHexColor } from "../core/utils.js";
import { CONFIG } from "../core/config.js";
import { preferences, replacePreferences, resolveSettings } from "../core/preferences.js";
import { applySceneNodesToCompatPrefs, deriveSceneNodesFromPreset } from "../render/scene-persistence.js";

/* =============================================================================
   URL Presets (v2/v3/v4/v5 compatible)
   ========================================================================== */
const UrlPreset = (() => {
  const SUPPORTED_SCHEMAS = Object.freeze([
    PRESET_SCHEMA_VERSION,
    8,
    LEGACY_SCHEMA_V7,
    LEGACY_SCHEMA_V6,
    LEGACY_SCHEMA_V5,
    LEGACY_SCHEMA_V4,
    LEGACY_SCHEMA_V3,
    LEGACY_SCHEMA_V2,
    LEGACY_SCHEMA_V1,
  ]);

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
    if (!hash || !hash.startsWith("#p=")) {
      return {
        ok: false,
        code: "missing-hash",
        schema: null,
        migratedFromSchema: null,
        prefs: null,
      };
    }

    try {
      const token = hash.slice(3);
      const bytes = base64UrlDecodeToBytes(token);
      const json = new TextDecoder().decode(bytes);
      const obj = JSON.parse(json);
      if (!obj || !obj.prefs) {
        return {
          ok: false,
          code: "invalid-hash",
          schema: null,
          migratedFromSchema: null,
          prefs: null,
        };
      }

      const schema = Object.prototype.hasOwnProperty.call(obj, "schema")
        ? (Number.isInteger(obj.schema) ? obj.schema : null)
        : LEGACY_SCHEMA_V1;
      if (!SUPPORTED_SCHEMAS.includes(schema)) {
        return {
          ok: false,
          code: "unsupported-schema",
          schema,
          migratedFromSchema: null,
          prefs: null,
        };
      }

      return {
        ok: true,
        code: schema === PRESET_SCHEMA_VERSION ? "preset-applied" : "preset-migrated",
        schema,
        migratedFromSchema: schema === PRESET_SCHEMA_VERSION ? null : schema,
        prefs: obj.prefs,
      };
    } catch {
      return {
        ok: false,
        code: "invalid-hash",
        schema: null,
        migratedFromSchema: null,
        prefs: null,
      };
    }
  }

  function sanitizeAndApply(incoming) {
    // Presets are full configuration snapshots. Always migrate/sanitize from
    // canonical defaults so older or partial payloads cannot inherit live state.
    const source = (incoming && typeof incoming === "object") ? incoming : {};
    const next = deepClone(CONFIG.defaults);

    if (source.visuals) {
      if (isValidHexColor(source.visuals.backgroundColor)) next.visuals.backgroundColor = source.visuals.backgroundColor;
      if (isValidHexColor(source.visuals.particleColor)) next.visuals.particleColor = source.visuals.particleColor;
    }

    if (source.trace) {
      if (typeof source.trace.lines === "boolean") next.trace.lines = source.trace.lines;
      if (Number.isFinite(source.trace.numLines)) {
        const lim = CONFIG.limits.trace.numLines;
        next.trace.numLines = clamp(source.trace.numLines, lim.min, lim.max);
      }
      if (Number.isFinite(source.trace.lineAlpha)) {
        const lim = CONFIG.limits.trace.lineAlpha;
        next.trace.lineAlpha = clamp(source.trace.lineAlpha, lim.min, lim.max);
      }
      if (Number.isFinite(source.trace.lineWidthPx)) {
        const lim = CONFIG.limits.trace.lineWidthPx;
        next.trace.lineWidthPx = clamp(source.trace.lineWidthPx, lim.min, lim.max);
      }
      if (typeof source.trace.lineColorMode === "string") {
        if (["fixed","lastParticle","dominantBand"].includes(source.trace.lineColorMode)) {
          next.trace.lineColorMode = source.trace.lineColorMode;
        }
      }
    }

    if (source.particles) {
      for (const k of ["emitPerSecond","sizeMaxPx","sizeMinPx","sizeToMinSec","ttlSec","overlapRadiusPx"]) {
        if (Number.isFinite(source.particles[k])) {
          const lim = CONFIG.limits.particles[k];
          next.particles[k] = clamp(source.particles[k], lim.min, lim.max);
        }
      }
    }

    if (source.motion) {
      if (Number.isFinite(source.motion.angularSpeedRadPerSec)) {
        const lim = CONFIG.limits.motion.angularSpeedRadPerSec;
        next.motion.angularSpeedRadPerSec = clamp(source.motion.angularSpeedRadPerSec, lim.min, lim.max);
      }
      if (Number.isFinite(source.motion.waveformRadialDisplaceFrac)) {
        const lim = CONFIG.limits.motion.waveformRadialDisplaceFrac;
        next.motion.waveformRadialDisplaceFrac = clamp(source.motion.waveformRadialDisplaceFrac, lim.min, lim.max);
      }
    }

    if (source.audio) {
      if (Number.isFinite(source.audio.rmsGain)) {
        const lim = CONFIG.limits.audio.rmsGain;
        next.audio.rmsGain = clamp(source.audio.rmsGain, lim.min, lim.max);
      }
      if (Number.isFinite(source.audio.minRadiusFrac)) {
        const lim = CONFIG.limits.audio.minRadiusFrac;
        next.audio.minRadiusFrac = clamp(source.audio.minRadiusFrac, lim.min, lim.max);
      }
      if (Number.isFinite(source.audio.maxRadiusFrac)) {
        const lim = CONFIG.limits.audio.maxRadiusFrac;
        next.audio.maxRadiusFrac = clamp(source.audio.maxRadiusFrac, lim.min, lim.max);
      }
      if (Number.isFinite(source.audio.smoothingTimeConstant)) {
        const lim = CONFIG.limits.audio.smoothingTimeConstant;
        next.audio.smoothingTimeConstant = clamp(source.audio.smoothingTimeConstant, lim.min, lim.max);
      }
      if (Number.isFinite(source.audio.fftSize) && CONFIG.limits.audio.fftSizes.includes(source.audio.fftSize)) {
        next.audio.fftSize = source.audio.fftSize;
      }

      if (["none", "one", "all"].includes(source.audio.repeatMode)) next.audio.repeatMode = source.audio.repeatMode;
      else if (typeof source.audio.loop === "boolean") next.audio.repeatMode = source.audio.loop ? "one" : "none";
      if (typeof source.audio.muted === "boolean") next.audio.muted = source.audio.muted;
      if (Number.isFinite(source.audio.volume)) {
        next.audio.volume = clamp(source.audio.volume, CONFIG.ui.volume.min, CONFIG.ui.volume.max);
      }
    }

    if (source.bands) {
      const maxBandCount = Array.isArray(CONFIG.bandNames) && CONFIG.bandNames.length
        ? CONFIG.bandNames.length
        : CONFIG.defaults.bands.count;
      if (Number.isInteger(source.bands.count) && source.bands.count >= 2 && source.bands.count <= maxBandCount) {
        next.bands.count = source.bands.count;
      }
      if (Number.isFinite(source.bands.floorHz) && source.bands.floorHz > 0) {
        next.bands.floorHz = source.bands.floorHz;
      }
      if (Number.isFinite(source.bands.ceilingHz) && source.bands.ceilingHz > 0) {
        next.bands.ceilingHz = source.bands.ceilingHz;
      }

      if (source.bands.rainbow) {
        if (Number.isFinite(source.bands.rainbow.hueOffsetDeg)) {
          const lim = CONFIG.limits.bands.hueOffsetDeg;
          next.bands.rainbow.hueOffsetDeg = clamp(source.bands.rainbow.hueOffsetDeg, lim.min, lim.max);
        }
        if (Number.isFinite(source.bands.rainbow.saturation)) {
          const lim = CONFIG.limits.bands.saturation;
          next.bands.rainbow.saturation = clamp(source.bands.rainbow.saturation, lim.min, lim.max);
        }
        if (Number.isFinite(source.bands.rainbow.value)) {
          const lim = CONFIG.limits.bands.value;
          next.bands.rainbow.value = clamp(source.bands.rainbow.value, lim.min, lim.max);
        }
      }

      if (typeof source.bands.particleColorSource === "string") {
        if (["fixed","dominant","angle"].includes(source.bands.particleColorSource)) {
          next.bands.particleColorSource = source.bands.particleColorSource;
        }
      }

      // New field: distributionMode
      if (typeof source.bands.distributionMode === "string") {
        if (CONFIG.limits.bands.distributionModes.includes(source.bands.distributionMode)) {
          next.bands.distributionMode = source.bands.distributionMode;
        }
      }
      // Legacy migration: logSpacing boolean (schema v7 and below) → distributionMode
      if (typeof source.bands.logSpacing === "boolean" && source.bands.distributionMode == null) {
        next.bands.distributionMode = source.bands.logSpacing ? "log" : "linear";
      }
    }

    if (source.timing) {
      if (Number.isFinite(source.timing.maxDeltaTimeSec) && source.timing.maxDeltaTimeSec > 0) {
        next.timing.maxDeltaTimeSec = source.timing.maxDeltaTimeSec;
      }
    }

    next.bands.ceilingHz = Math.max(next.bands.floorHz, next.bands.ceilingHz);

    if (next.bands && typeof next.bands === "object") delete next.bands.names;

    next.particles.sizeMinPx = Math.min(next.particles.sizeMinPx, next.particles.sizeMaxPx);
    next.particles.ttlSec = Math.max(next.particles.ttlSec, next.particles.sizeToMinSec);
    applySceneNodesToCompatPrefs(next, deriveSceneNodesFromPreset(source));

    replacePreferences(next);
    resolveSettings();
    return true;
  }

  function applyFromLocationHash(hash = location.hash) {
    try {
      const decoded = decodePrefsFromHash(hash);
      if (!decoded.ok) {
        return {
          ok: false,
          code: decoded.code,
          schema: decoded.schema,
          migratedFromSchema: null,
        };
      }

      sanitizeAndApply(decoded.prefs);
      return {
        ok: true,
        code: decoded.code,
        schema: PRESET_SCHEMA_VERSION,
        migratedFromSchema: decoded.migratedFromSchema,
      };
    } catch {
      return {
        ok: false,
        code: "invalid-hash",
        schema: null,
        migratedFromSchema: null,
      };
    }
  }

  function mergeCompatVisualStateIntoSceneNodes(prefsLike) {
    const sceneNodes = prefsLike && prefsLike.scene && Array.isArray(prefsLike.scene.nodes)
      ? deepClone(prefsLike.scene.nodes)
      : deriveSceneNodesFromPreset(prefsLike);
    const orbsIndex = sceneNodes.findIndex((node) => node && node.type === "orbs");
    if (orbsIndex >= 0) {
      const existingOrbSettings = Array.isArray(sceneNodes[orbsIndex].settings)
        ? sceneNodes[orbsIndex].settings
        : [];
      const compatOrbSettings = Array.isArray(prefsLike && prefsLike.orbs) ? prefsLike.orbs : [];
      sceneNodes[orbsIndex] = {
        ...sceneNodes[orbsIndex],
        settings: compatOrbSettings.map((orb, index) => ({
          ...(existingOrbSettings[index] || {}),
          ...deepClone(orb),
        })),
      };
    }

    const overlayIndex = sceneNodes.findIndex((node) => node && node.type === "bandOverlay");
    if (overlayIndex >= 0) {
      const overlaySettings = prefsLike && prefsLike.bands && prefsLike.bands.overlay && typeof prefsLike.bands.overlay === "object"
        ? deepClone(prefsLike.bands.overlay)
        : deepClone(CONFIG.defaults.bands.overlay);
      sceneNodes[overlayIndex] = {
        ...sceneNodes[overlayIndex],
        enabled: !!overlaySettings.enabled,
        settings: overlaySettings,
      };
    }

    return sceneNodes;
  }

  function writeHashFromPrefs() {
    const encodedPrefs = deepClone(preferences);
    if (encodedPrefs.bands && typeof encodedPrefs.bands === "object") delete encodedPrefs.bands.names;
    applySceneNodesToCompatPrefs(
      encodedPrefs,
      mergeCompatVisualStateIntoSceneNodes(encodedPrefs)
    );

    encodedPrefs.scene = {
      nodes: deepClone((encodedPrefs.scene && encodedPrefs.scene.nodes) || []),
    };

    delete encodedPrefs.orbs;
    delete encodedPrefs.overlay;
    delete encodedPrefs.viewTransform;
    delete encodedPrefs.camera;
    delete encodedPrefs.source;
    delete encodedPrefs.queue;
    delete encodedPrefs.playback;
    delete encodedPrefs.recording;
    delete encodedPrefs.runtimeLog;
    delete encodedPrefs.permissions;
    delete encodedPrefs.ui;

    if (encodedPrefs.scene && typeof encodedPrefs.scene === "object") {
      delete encodedPrefs.scene.selectedNodeId;
      delete encodedPrefs.scene.viewTransform;
      delete encodedPrefs.scene.editor;
      delete encodedPrefs.scene.ui;
      delete encodedPrefs.scene.camera;
    }
    if (encodedPrefs.bands && typeof encodedPrefs.bands === "object") {
      delete encodedPrefs.bands.overlay;
    }

    const hash = encodePrefsToHash(encodedPrefs);
    history.replaceState(null, "", location.pathname + location.search + hash);
  }

  return { applyFromLocationHash, writeHashFromPrefs };
})();

export { UrlPreset };
