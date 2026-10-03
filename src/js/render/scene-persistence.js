import { CONFIG } from "../core/config.js";
import { clamp, deepClone } from "../core/utils.js";
import { normalizeSceneOrbSettings, readDefaultSceneOrbFallback, toLegacyOrbDef } from "./orb-settings.js";

const SUPPORTED_SCENE_NODE_TYPES = Object.freeze(["orbs", "bandOverlay"]);
const DEFAULT_BOUNDS = Object.freeze({ x: 0.5, y: 0.5, w: 1, h: 1 });
const DEFAULT_ANCHOR = Object.freeze({ x: 0.5, y: 0.5 });

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function readDefaultSceneNodes() {
  const nodes = CONFIG && CONFIG.defaults && CONFIG.defaults.scene && Array.isArray(CONFIG.defaults.scene.nodes)
    ? CONFIG.defaults.scene.nodes
    : [];
  return deepClone(nodes);
}

function readDefaultSceneNode(type) {
  return readDefaultSceneNodes().find((node) => node && node.type === type) || null;
}

function sanitizeSceneScalar(value, fallback, min, max) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return clamp(numeric, min, max);
}

function sanitizeBounds(rawBounds, fallbackBounds = DEFAULT_BOUNDS) {
  const source = rawBounds && typeof rawBounds === "object" ? rawBounds : {};
  const fallback = fallbackBounds && typeof fallbackBounds === "object" ? fallbackBounds : DEFAULT_BOUNDS;
  return {
    x: sanitizeSceneScalar(source.x, Number.isFinite(fallback.x) ? fallback.x : DEFAULT_BOUNDS.x, 0, 1),
    y: sanitizeSceneScalar(source.y, Number.isFinite(fallback.y) ? fallback.y : DEFAULT_BOUNDS.y, 0, 1),
    w: sanitizeSceneScalar(source.w, Number.isFinite(fallback.w) ? fallback.w : DEFAULT_BOUNDS.w, 0, 1),
    h: sanitizeSceneScalar(source.h, Number.isFinite(fallback.h) ? fallback.h : DEFAULT_BOUNDS.h, 0, 1),
  };
}

function sanitizeAnchor(rawAnchor, fallbackAnchor = DEFAULT_ANCHOR) {
  const source = rawAnchor && typeof rawAnchor === "object" ? rawAnchor : {};
  const fallback = fallbackAnchor && typeof fallbackAnchor === "object" ? fallbackAnchor : DEFAULT_ANCHOR;
  return {
    x: sanitizeSceneScalar(source.x, Number.isFinite(fallback.x) ? fallback.x : DEFAULT_ANCHOR.x, 0, 1),
    y: sanitizeSceneScalar(source.y, Number.isFinite(fallback.y) ? fallback.y : DEFAULT_ANCHOR.y, 0, 1),
  };
}

function sanitizeOverlaySettings(rawSettings, { enabled = null } = {}) {
  const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const defaults = CONFIG.defaults.bands.overlay;
  const next = deepClone(defaults);

  next.enabled = typeof enabled === "boolean"
    ? enabled
    : (typeof source.enabled === "boolean" ? source.enabled : !!defaults.enabled);
  if (typeof source.connectAdjacent === "boolean") next.connectAdjacent = source.connectAdjacent;

  if (Number.isFinite(source.alpha)) {
    const lim = CONFIG.limits.bands.overlayAlpha;
    next.alpha = clamp(source.alpha, lim.min, lim.max);
  }
  if (Number.isFinite(source.pointSizePx)) {
    const lim = CONFIG.limits.bands.pointSizePx;
    next.pointSizePx = clamp(source.pointSizePx, lim.min, lim.max);
  }
  if (Number.isFinite(source.minRadiusFrac)) {
    const lim = CONFIG.limits.bands.overlayMinRadiusFrac;
    next.minRadiusFrac = clamp(source.minRadiusFrac, lim.min, lim.max);
  }
  if (Number.isFinite(source.maxRadiusFrac)) {
    const lim = CONFIG.limits.bands.overlayMaxRadiusFrac;
    next.maxRadiusFrac = clamp(source.maxRadiusFrac, lim.min, lim.max);
  }
  if (Number.isFinite(source.waveformRadialDisplaceFrac)) {
    const lim = CONFIG.limits.bands.overlayWaveformRadialDisplaceFrac;
    next.waveformRadialDisplaceFrac = clamp(source.waveformRadialDisplaceFrac, lim.min, lim.max);
  }
  if (Number.isFinite(source.lineAlpha)) {
    const lim = CONFIG.limits.trace.lineAlpha;
    next.lineAlpha = clamp(source.lineAlpha, lim.min, lim.max);
  }
  if (Number.isFinite(source.lineWidthPx)) {
    const lim = CONFIG.limits.trace.lineWidthPx;
    next.lineWidthPx = clamp(source.lineWidthPx, lim.min, lim.max);
  }

  if (typeof source.phaseMode === "string" && ["orb", "free"].includes(source.phaseMode)) {
    next.phaseMode = source.phaseMode;
  }
  if (Number.isFinite(source.ringSpeedRadPerSec)) {
    const lim = CONFIG.limits.bands.ringSpeedRadPerSec;
    next.ringSpeedRadPerSec = clamp(source.ringSpeedRadPerSec, lim.min, lim.max);
  }

  return next;
}

function sanitizeSettingsForSceneType(type, rawSettings, { enabled = null } = {}) {
  switch (type) {
    case "orbs":
      return normalizeSceneOrbSettings(rawSettings);
    case "bandOverlay":
      return sanitizeOverlaySettings(rawSettings, { enabled });
    default:
      return deepClone(rawSettings);
  }
}

function nextUniqueNodeId(candidateId, type, seenIds) {
  const fallbackId = (readDefaultSceneNode(type) || {}).id || `${type}-1`;
  const baseId = typeof candidateId === "string" && candidateId.trim() ? candidateId : fallbackId;
  if (!seenIds.has(baseId)) {
    seenIds.add(baseId);
    return baseId;
  }

  const prefix = `${type}-`;
  let suffix = 1;
  while (seenIds.has(`${prefix}${suffix}`)) suffix += 1;
  const uniqueId = `${prefix}${suffix}`;
  seenIds.add(uniqueId);
  return uniqueId;
}

function sanitizeSceneNode(rawNode, { seenIds = null } = {}) {
  if (!rawNode || typeof rawNode !== "object") return null;

  const type = typeof rawNode.type === "string" ? rawNode.type.trim() : "";
  if (!SUPPORTED_SCENE_NODE_TYPES.includes(type)) return null;

  const fallbackNode = readDefaultSceneNode(type) || {
    id: `${type}-1`,
    enabled: true,
    zIndex: 0,
    bounds: DEFAULT_BOUNDS,
    anchor: DEFAULT_ANCHOR,
    settings: type === "orbs" ? [] : {},
  };
  const enabled = typeof rawNode.enabled === "boolean" ? rawNode.enabled : !!fallbackNode.enabled;
  const node = {
    id: typeof rawNode.id === "string" && rawNode.id.trim()
      ? rawNode.id
      : (typeof fallbackNode.id === "string" ? fallbackNode.id : `${type}-1`),
    type,
    enabled,
    zIndex: Number.isFinite(rawNode.zIndex) ? rawNode.zIndex : (Number.isFinite(fallbackNode.zIndex) ? fallbackNode.zIndex : 0),
    bounds: sanitizeBounds(rawNode.bounds, fallbackNode.bounds),
    anchor: sanitizeAnchor(rawNode.anchor, fallbackNode.anchor),
    settings: sanitizeSettingsForSceneType(type, rawNode.settings, { enabled }),
  };

  if (seenIds) node.id = nextUniqueNodeId(node.id, type, seenIds);
  return node;
}

function reindexSceneNodes(nodes) {
  return nodes.map((node, index) => ({
    ...node,
    zIndex: index,
  }));
}

function sortSceneNodesByPersistedZIndex(nodes) {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) => {
      const zIndexDelta = left.node.zIndex - right.node.zIndex;
      return zIndexDelta || (left.index - right.index);
    })
    .map(({ node }) => node);
}

function sanitizePersistedSceneNodes(rawNodes, { synthesizeDefaultWhenEmpty = false } = {}) {
  const source = Array.isArray(rawNodes) ? rawNodes : [];
  const seenIds = new Set();
  const nodes = source
    .map((node) => sanitizeSceneNode(node, { seenIds }))
    .filter(Boolean);

  if (nodes.length) return reindexSceneNodes(sortSceneNodesByPersistedZIndex(nodes));
  if (!synthesizeDefaultWhenEmpty) return [];

  const defaultSeenIds = new Set();
  return reindexSceneNodes(
    readDefaultSceneNodes()
      .map((node) => sanitizeSceneNode(node, { seenIds: defaultSeenIds }))
      .filter(Boolean)
  );
}

function buildSceneNodeFromLegacy(type, rawSettings) {
  const defaultNode = readDefaultSceneNode(type);
  if (!defaultNode) return null;
  const hasLegacyEnabled = (
    type === "bandOverlay"
    && rawSettings
    && typeof rawSettings === "object"
    && Object.prototype.hasOwnProperty.call(rawSettings, "enabled")
    && typeof rawSettings.enabled === "boolean"
  );
  return sanitizeSceneNode({
    ...defaultNode,
    enabled: type === "bandOverlay"
      ? (hasLegacyEnabled ? rawSettings.enabled : !!defaultNode.enabled)
      : !!defaultNode.enabled,
    settings: rawSettings,
  });
}

function readLegacyOverlaySource(rawPrefs) {
  if (!rawPrefs || typeof rawPrefs !== "object") return null;
  if (hasOwn(rawPrefs, "overlay") && rawPrefs.overlay && typeof rawPrefs.overlay === "object") {
    return rawPrefs.overlay;
  }
  if (
    rawPrefs.bands
    && typeof rawPrefs.bands === "object"
    && hasOwn(rawPrefs.bands, "overlay")
    && rawPrefs.bands.overlay
    && typeof rawPrefs.bands.overlay === "object"
  ) {
    return rawPrefs.bands.overlay;
  }
  return null;
}

function migrateLegacyVisualRootsToSceneNodes(rawPrefs) {
  const nodes = [];
  if (rawPrefs && hasOwn(rawPrefs, "orbs") && Array.isArray(rawPrefs.orbs)) {
    const orbsNode = buildSceneNodeFromLegacy("orbs", rawPrefs.orbs);
    if (orbsNode) nodes.push(orbsNode);
  }

  const overlaySource = readLegacyOverlaySource(rawPrefs);
  if (overlaySource) {
    const overlayNode = buildSceneNodeFromLegacy("bandOverlay", overlaySource);
    if (overlayNode) nodes.push(overlayNode);
  }

  return reindexSceneNodes(nodes);
}

function deriveSceneNodesFromPreset(rawPrefs) {
  if (rawPrefs && rawPrefs.scene && Array.isArray(rawPrefs.scene.nodes)) {
    return sanitizePersistedSceneNodes(rawPrefs.scene.nodes);
  }

  const legacyNodes = migrateLegacyVisualRootsToSceneNodes(rawPrefs);
  if (legacyNodes.length) return legacyNodes;

  return sanitizePersistedSceneNodes([], { synthesizeDefaultWhenEmpty: true });
}

function readDisabledCompatOverlayDefaults() {
  return {
    ...deepClone(CONFIG.defaults.bands.overlay),
    enabled: false,
  };
}

function applySceneNodesToCompatPrefs(targetPrefs, rawSceneNodes) {
  const sceneNodes = sanitizePersistedSceneNodes(rawSceneNodes);
  if (!targetPrefs.scene || typeof targetPrefs.scene !== "object") targetPrefs.scene = {};
  targetPrefs.scene.nodes = sceneNodes;

  const orbsNode = sceneNodes.find((node) => node.type === "orbs") || null;
  const overlayNode = sceneNodes.find((node) => node.type === "bandOverlay") || null;

  targetPrefs.orbs = orbsNode
    ? orbsNode.settings.map((orb, index) => toLegacyOrbDef(orb, readDefaultSceneOrbFallback(index)))
    : [];

  if (!targetPrefs.bands || typeof targetPrefs.bands !== "object") targetPrefs.bands = {};
  targetPrefs.bands.overlay = overlayNode
    ? sanitizeOverlaySettings(overlayNode.settings, { enabled: overlayNode.enabled })
    : readDisabledCompatOverlayDefaults();

  return targetPrefs;
}

export {
  SUPPORTED_SCENE_NODE_TYPES,
  applySceneNodesToCompatPrefs,
  buildSceneNodeFromLegacy,
  deriveSceneNodesFromPreset,
  readDefaultSceneNode,
  readDefaultSceneNodes,
  sanitizeOverlaySettings,
  sanitizePersistedSceneNodes,
  sanitizeSettingsForSceneType,
};
