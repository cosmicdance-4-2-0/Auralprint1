import { CONFIG } from "../core/config.js";
import { deepClone, deepFreeze } from "../core/utils.js";
import { normalizeSceneOrbSettings } from "./orb-settings.js";
import { BandOverlayVisualizer } from "./visualizers/band-overlay.js";
import { OrbVisualizer } from "./visualizers/orb-visualizer.js";

const REQUIRED_VISUALIZER_METHODS = Object.freeze(["init", "update", "render", "resize", "dispose"]);

const FULL_SURFACE_BOUNDS = deepFreeze({ x: 0.5, y: 0.5, w: 1, h: 1 });
const CENTER_ANCHOR = deepFreeze({ x: 0.5, y: 0.5 });

const ORB_BAND_INDEX_LIMIT = Math.max(0, CONFIG.bandNames.length - 1);

const ORBS_SETTINGS_SCHEMA = deepFreeze({
  kind: "array",
  item: {
    kind: "object",
    fields: {
      id: { type: "string", default: "ORB" },
      chanId: { type: "string", default: "C", enum: ["L", "R", "C"] },
      bandIds: {
        type: "array",
        default: [],
        item: { type: "number", min: 0, max: ORB_BAND_INDEX_LIMIT, step: 1 },
      },
      chirality: { type: "number", default: -1, enum: [-1, 1] },
      startAngleRad: { type: "number", default: 0 },
      hueOffsetDeg: {
        type: "number",
        default: CONFIG.visualizers.orbs.defaults.hueOffsetDeg,
        min: CONFIG.visualizers.orbs.limits.hueOffsetDeg.min,
        max: CONFIG.visualizers.orbs.limits.hueOffsetDeg.max,
        step: CONFIG.visualizers.orbs.limits.hueOffsetDeg.step,
      },
      centerX: {
        type: "number",
        default: CONFIG.visualizers.orbs.defaults.centerX,
        min: CONFIG.visualizers.orbs.limits.centerX.min,
        max: CONFIG.visualizers.orbs.limits.centerX.max,
        step: CONFIG.visualizers.orbs.limits.centerX.step,
      },
      centerY: {
        type: "number",
        default: CONFIG.visualizers.orbs.defaults.centerY,
        min: CONFIG.visualizers.orbs.limits.centerY.min,
        max: CONFIG.visualizers.orbs.limits.centerY.max,
        step: CONFIG.visualizers.orbs.limits.centerY.step,
      },
    },
  },
});

const BAND_OVERLAY_SETTINGS_SCHEMA = deepFreeze({
  kind: "object",
  fields: {
    enabled: { type: "boolean", default: !!CONFIG.defaults.bands.overlay.enabled },
    connectAdjacent: { type: "boolean", default: !!CONFIG.defaults.bands.overlay.connectAdjacent },
    alpha: {
      type: "number",
      default: CONFIG.defaults.bands.overlay.alpha,
      min: CONFIG.limits.bands.overlayAlpha.min,
      max: CONFIG.limits.bands.overlayAlpha.max,
      step: CONFIG.limits.bands.overlayAlpha.step,
    },
    pointSizePx: {
      type: "number",
      default: CONFIG.defaults.bands.overlay.pointSizePx,
      min: CONFIG.limits.bands.pointSizePx.min,
      max: CONFIG.limits.bands.pointSizePx.max,
      step: CONFIG.limits.bands.pointSizePx.step,
    },
    minRadiusFrac: {
      type: "number",
      default: CONFIG.defaults.bands.overlay.minRadiusFrac,
      min: CONFIG.limits.bands.overlayMinRadiusFrac.min,
      max: CONFIG.limits.bands.overlayMinRadiusFrac.max,
      step: CONFIG.limits.bands.overlayMinRadiusFrac.step,
    },
    maxRadiusFrac: {
      type: "number",
      default: CONFIG.defaults.bands.overlay.maxRadiusFrac,
      min: CONFIG.limits.bands.overlayMaxRadiusFrac.min,
      max: CONFIG.limits.bands.overlayMaxRadiusFrac.max,
      step: CONFIG.limits.bands.overlayMaxRadiusFrac.step,
    },
    waveformRadialDisplaceFrac: {
      type: "number",
      default: CONFIG.defaults.bands.overlay.waveformRadialDisplaceFrac,
      min: CONFIG.limits.bands.overlayWaveformRadialDisplaceFrac.min,
      max: CONFIG.limits.bands.overlayWaveformRadialDisplaceFrac.max,
      step: CONFIG.limits.bands.overlayWaveformRadialDisplaceFrac.step,
    },
    lineAlpha: {
      type: "number",
      default: CONFIG.defaults.bands.overlay.lineAlpha,
      min: CONFIG.limits.bands.overlayAlpha.min,
      max: CONFIG.limits.bands.overlayAlpha.max,
      step: CONFIG.limits.bands.overlayAlpha.step,
    },
    lineWidthPx: {
      type: "number",
      default: CONFIG.defaults.bands.overlay.lineWidthPx,
      min: CONFIG.limits.trace.lineWidthPx.min,
      max: CONFIG.limits.trace.lineWidthPx.max,
      step: CONFIG.limits.trace.lineWidthPx.step,
    },
    phaseMode: { type: "string", default: CONFIG.defaults.bands.overlay.phaseMode, enum: ["orb", "free"] },
    ringSpeedRadPerSec: {
      type: "number",
      default: CONFIG.defaults.bands.overlay.ringSpeedRadPerSec,
      min: CONFIG.limits.bands.ringSpeedRadPerSec.min,
      max: CONFIG.limits.bands.ringSpeedRadPerSec.max,
      step: CONFIG.limits.bands.ringSpeedRadPerSec.step,
    },
  },
});

function readConfiguredDefaultNode(type, fallbackNode) {
  const configuredNodes = CONFIG && CONFIG.defaults && CONFIG.defaults.scene && Array.isArray(CONFIG.defaults.scene.nodes)
    ? CONFIG.defaults.scene.nodes
    : [];
  const configuredNode = configuredNodes.find((node) => node && node.type === type) || null;
  return deepFreeze(deepClone(configuredNode || fallbackNode));
}

const BAND_OVERLAY_FALLBACK_NODE = deepFreeze({
  id: "overlay-1",
  type: "bandOverlay",
  enabled: true,
  zIndex: 1,
  bounds: deepClone(FULL_SURFACE_BOUNDS),
  anchor: deepClone(CENTER_ANCHOR),
  settings: deepClone(CONFIG.defaults.bands.overlay),
});

const ORBS_DEFAULT_NODE = readConfiguredDefaultNode("orbs", {
  id: "orbs-1",
  type: "orbs",
  enabled: true,
  zIndex: 0,
  bounds: deepClone(FULL_SURFACE_BOUNDS),
  anchor: deepClone(CENTER_ANCHOR),
  settings: normalizeSceneOrbSettings(CONFIG.defaults.orbs),
});

const BAND_OVERLAY_DEFAULT_NODE = readConfiguredDefaultNode("bandOverlay", BAND_OVERLAY_FALLBACK_NODE);

function cloneMaybe(value) {
  return value == null ? null : deepClone(value);
}

function isVisualizableType(type) {
  return typeof type === "string" && !!type.trim();
}

function isClassConstructor(fn) {
  if (typeof fn !== "function") return false;
  return /^\s*class\b/.test(Function.prototype.toString.call(fn));
}

function createDescriptor(type, implementation, metadata) {
  const safeMetadata = metadata && typeof metadata === "object" ? metadata : {};
  return {
    type,
    implementation: typeof implementation === "function" ? implementation : null,
    capabilities: cloneMaybe(safeMetadata.capabilities),
    settingsSchema: cloneMaybe(safeMetadata.settingsSchema),
    defaultNode: cloneMaybe(safeMetadata.defaultNode),
  };
}

function readDescriptor(descriptor) {
  if (!descriptor) return null;
  return {
    type: descriptor.type,
    implementation: descriptor.implementation,
    capabilities: cloneMaybe(descriptor.capabilities),
    settingsSchema: cloneMaybe(descriptor.settingsSchema),
    defaultNode: cloneMaybe(descriptor.defaultNode),
  };
}

function createInstance(type, implementation, options) {
  try {
    return isClassConstructor(implementation)
      ? new implementation(options)
      : implementation(options);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : String(error);
    const wrapped = new Error(`Failed to create visualizer "${type}": ${message}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

function validateInstance(type, instance) {
  if (!instance || typeof instance !== "object") {
    throw new Error(`Visualizer "${type}" did not return an object instance.`);
  }

  const missingMethods = REQUIRED_VISUALIZER_METHODS.filter((method) => typeof instance[method] !== "function");
  if (missingMethods.length) {
    throw new Error(
      `Visualizer "${type}" is missing required lifecycle methods: ${missingMethods.join(", ")}.`
    );
  }

  return instance;
}

function createVisualizerRegistry() {
  const descriptors = new Map();

  function register(type, implementation = null, metadata = {}) {
    if (!isVisualizableType(type)) throw new Error("Visualizer type must be a non-empty string.");
    if (descriptors.has(type)) throw new Error(`Visualizer type "${type}" is already registered.`);

    const descriptor = createDescriptor(type, implementation, metadata);
    descriptors.set(type, descriptor);
    return readDescriptor(descriptor);
  }

  function has(type) {
    return descriptors.has(type);
  }

  function get(type) {
    return readDescriptor(descriptors.get(type) || null);
  }

  function create(type, options = {}) {
    const descriptor = descriptors.get(type) || null;
    if (!descriptor) throw new Error(`Unknown visualizer type "${type}".`);
    if (typeof descriptor.implementation !== "function") {
      throw new Error(`Visualizer type "${type}" is registered without a runtime implementation.`);
    }

    return validateInstance(type, createInstance(type, descriptor.implementation, options));
  }

  function getCapabilities(type) {
    const descriptor = descriptors.get(type) || null;
    return descriptor ? cloneMaybe(descriptor.capabilities) : null;
  }

  function getSettingsSchema(type) {
    const descriptor = descriptors.get(type) || null;
    return descriptor ? cloneMaybe(descriptor.settingsSchema) : null;
  }

  function getDefaultNode(type) {
    const descriptor = descriptors.get(type) || null;
    return descriptor ? cloneMaybe(descriptor.defaultNode) : null;
  }

  return { register, has, get, create, getCapabilities, getSettingsSchema, getDefaultNode };
}

function registerBuiltInVisualizers(registry) {
  if (!registry || typeof registry.register !== "function") {
    throw new Error("A visualizer registry with a register() method is required.");
  }

  registry.register("orbs", OrbVisualizer, {
    capabilities: {
      runtimeImplemented: true,
      transitional: true,
    },
    settingsSchema: ORBS_SETTINGS_SCHEMA,
    defaultNode: ORBS_DEFAULT_NODE,
  });

  registry.register("bandOverlay", BandOverlayVisualizer, {
    capabilities: {
      runtimeImplemented: true,
      transitional: true,
    },
    settingsSchema: BAND_OVERLAY_SETTINGS_SCHEMA,
    defaultNode: BAND_OVERLAY_DEFAULT_NODE,
  });

  return registry;
}

export { createVisualizerRegistry, registerBuiltInVisualizers };
