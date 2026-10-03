import {
  preferences,
  resolveSettings,
} from "../core/preferences.js";
import { state } from "../core/state.js";
import { clamp, deepClone } from "../core/utils.js";
import {
  normalizeSceneOrbDef,
  normalizeSceneOrbSettings,
  readDefaultSceneOrbFallback,
} from "./orb-settings.js";
import {
  applySceneNodesToCompatPrefs,
  buildSceneNodeFromLegacy,
  sanitizePersistedSceneNodes,
  sanitizeSettingsForSceneType,
} from "./scene-persistence.js";
import { createVisualizerRegistry, registerBuiltInVisualizers } from "./visualizer.js";
import { IDENTITY_VIEW_TRANSFORM, normalizeViewTransform } from "./view-transform.js";

const SCENE_TYPE_LABELS = Object.freeze({
  orbs: "Orbs",
  bandOverlay: "Band Overlay",
});

const sceneRegistry = createVisualizerRegistry();
registerBuiltInVisualizers(sceneRegistry);

function reindexSceneNodesInCurrentOrder(nodes) {
  return nodes.map((node, index) => ({
    ...node,
    zIndex: index,
  }));
}

function ensureSceneState() {
  if (!state.scene || typeof state.scene !== "object") {
    state.scene = {
      nodes: [],
      selectedNodeId: "",
      viewTransform: IDENTITY_VIEW_TRANSFORM,
    };
  }

  if (!Array.isArray(state.scene.nodes)) state.scene.nodes = [];
  if (typeof state.scene.selectedNodeId !== "string") state.scene.selectedNodeId = "";
  state.scene.viewTransform = normalizeViewTransform(state.scene.viewTransform);
  return state.scene;
}

function sanitizeOrbSettings(rawSettings) {
  return normalizeSceneOrbSettings(rawSettings);
}

function persistScenePreferences(nodes) {
  const nextPrefs = applySceneNodesToCompatPrefs(preferences, nodes);
  resolveSettings();
  return deepClone((nextPrefs.scene && nextPrefs.scene.nodes) || []);
}

function buildSceneNodesFromPreferences() {
  const rawSceneNodes = preferences.scene && Array.isArray(preferences.scene.nodes)
    ? preferences.scene.nodes
    : [];
  return sanitizePersistedSceneNodes(rawSceneNodes, { synthesizeDefaultWhenEmpty: true });
}

function setSceneNodes(nodes, { preserveSelection = false } = {}) {
  const sceneState = ensureSceneState();
  const previousSelection = preserveSelection ? sceneState.selectedNodeId : "";
  sceneState.nodes = sanitizePersistedSceneNodes(nodes);
  sceneState.selectedNodeId = sceneState.nodes.some((node) => node.id === previousSelection)
    ? previousSelection
    : (sceneState.nodes[0] ? sceneState.nodes[0].id : "");
  return readSceneSnapshot();
}

function readSceneRuntime() {
  const sceneState = ensureSceneState();
  if (!sceneState.nodes.length) setSceneNodes(buildSceneNodesFromPreferences(), { preserveSelection: false });
  return sceneState;
}

function readSceneSnapshot() {
  const sceneState = readSceneRuntime();
  return deepClone({
    nodes: sceneState.nodes,
    selectedNodeId: sceneState.selectedNodeId,
    viewTransform: sceneState.viewTransform,
  });
}

function readSceneNodeDisplayName(type) {
  return Object.prototype.hasOwnProperty.call(SCENE_TYPE_LABELS, type) ? SCENE_TYPE_LABELS[type] : type;
}

function readSceneSettingsSchema(type) {
  return sceneRegistry.getSettingsSchema(type);
}

function readSelectedSceneNode() {
  const sceneState = readSceneRuntime();
  const node = sceneState.nodes.find((candidate) => candidate.id === sceneState.selectedNodeId) || null;
  return node ? deepClone(node) : null;
}

function findMutableSceneNode(nodeId) {
  const sceneState = readSceneRuntime();
  return sceneState.nodes.find((node) => node && node.id === nodeId) || null;
}

function selectSceneNode(nodeId) {
  const sceneState = readSceneRuntime();
  if (sceneState.nodes.some((node) => node.id === nodeId)) sceneState.selectedNodeId = nodeId;
  return readSceneSnapshot();
}

function persistSceneNodeSettings(node) {
  if (!node || typeof node !== "object") return null;

  if (node.type === "orbs" || node.type === "bandOverlay") {
    node.settings = sanitizeSettingsForSceneType(node.type, node.settings, { enabled: node.enabled });
  }

  const sceneState = readSceneRuntime();
  sceneState.nodes = persistScenePreferences(sceneState.nodes);
  return node;
}

function replaceSceneNodeSettings(nodeId, nextSettings, { persist = false } = {}) {
  const node = findMutableSceneNode(nodeId);
  if (!node) return null;

  node.settings = sanitizeSettingsForSceneType(node.type, nextSettings, { enabled: node.enabled });
  if (persist) persistSceneNodeSettings(node);
  return deepClone(node);
}

function updateSceneNodeSettings(nodeId, updater, options = {}) {
  const node = findMutableSceneNode(nodeId);
  if (!node) return null;

  const currentSettings = deepClone(node.settings);
  const nextSettings = typeof updater === "function" ? updater(currentSettings) : updater;
  return replaceSceneNodeSettings(nodeId, nextSettings, options);
}

function moveSceneNode(nodeId, delta) {
  const sceneState = readSceneRuntime();
  const currentIndex = sceneState.nodes.findIndex((node) => node.id === nodeId);
  if (currentIndex < 0) return readSceneSnapshot();

  const nextIndex = clamp(currentIndex + delta, 0, sceneState.nodes.length - 1);
  if (nextIndex === currentIndex) return readSceneSnapshot();

  const [node] = sceneState.nodes.splice(currentIndex, 1);
  sceneState.nodes.splice(nextIndex, 0, node);
  sceneState.nodes = persistScenePreferences(reindexSceneNodesInCurrentOrder(sceneState.nodes));
  return readSceneSnapshot();
}

function toggleSceneNodeEnabled(nodeId, nextEnabled = null) {
  const node = findMutableSceneNode(nodeId);
  if (!node) return readSceneSnapshot();

  const enabled = typeof nextEnabled === "boolean" ? nextEnabled : !node.enabled;
  node.enabled = enabled;
  if (node.type === "bandOverlay" && node.settings && typeof node.settings === "object") {
    node.settings = {
      ...node.settings,
      enabled,
    };
  }
  const sceneState = readSceneRuntime();
  sceneState.nodes = persistScenePreferences(sceneState.nodes);

  return readSceneSnapshot();
}

function buildNextOrbId(orbs) {
  let maxIndex = -1;
  for (const orb of orbs) {
    const match = typeof (orb && orb.id) === "string" ? orb.id.match(/(\d+)$/) : null;
    if (!match) continue;
    const nextIndex = Number.parseInt(match[1], 10);
    if (Number.isInteger(nextIndex) && nextIndex > maxIndex) maxIndex = nextIndex;
  }
  return `ORB${maxIndex + 1}`;
}

function createNewOrbSetting(orbs) {
  const fallback = readDefaultSceneOrbFallback(Array.isArray(orbs) ? orbs.length : 0);
  return normalizeSceneOrbDef({
    id: buildNextOrbId(Array.isArray(orbs) ? orbs : []),
  }, fallback);
}

function addSceneOrb(nodeId) {
  return updateSceneNodeSettings(nodeId, (currentSettings) => {
    const next = sanitizeOrbSettings(currentSettings);
    next.push(createNewOrbSetting(next));
    return next;
  }, { persist: true });
}

function removeSceneOrb(nodeId, orbIndex) {
  return updateSceneNodeSettings(nodeId, (currentSettings) => {
    const next = sanitizeOrbSettings(currentSettings);
    if (next.length <= 1) return next;
    if (!Number.isInteger(orbIndex) || orbIndex < 0 || orbIndex >= next.length) return next;
    next.splice(orbIndex, 1);
    return next;
  }, { persist: true });
}

function updateSceneOrb(nodeId, orbIndex, patch = {}) {
  return updateSceneNodeSettings(nodeId, (currentSettings) => {
    const next = sanitizeOrbSettings(currentSettings);
    if (!Number.isInteger(orbIndex) || orbIndex < 0 || orbIndex >= next.length) return next;

    const currentOrb = next[orbIndex];
    const rawPatch = patch && typeof patch === "object" ? patch : {};
    const nextOrb = normalizeSceneOrbDef({
      ...currentOrb,
      ...rawPatch,
    }, currentOrb || readDefaultSceneOrbFallback(orbIndex));

    next[orbIndex] = nextOrb;
    return next;
  }, { persist: true });
}

function resetSceneRuntimeFromPreferences() {
  return setSceneNodes(buildSceneNodesFromPreferences(), { preserveSelection: false });
}

function syncSceneRuntimeFromPreferences() {
  return setSceneNodes(buildSceneNodesFromPreferences(), { preserveSelection: true });
}

function syncSceneNodeFromCompatPreferences(type, { createIfMissing = false } = {}) {
  const sceneNodes = sanitizePersistedSceneNodes(
    preferences.scene && Array.isArray(preferences.scene.nodes) ? preferences.scene.nodes : []
  );
  const nodeIndex = sceneNodes.findIndex((node) => node.type === type);
  if (nodeIndex < 0 && !createIfMissing) return sceneNodes;

  let compatNode = null;
  if (type === "orbs") {
    compatNode = buildSceneNodeFromLegacy("orbs", preferences.orbs);
  } else if (type === "bandOverlay") {
    compatNode = buildSceneNodeFromLegacy("bandOverlay", preferences.bands && preferences.bands.overlay);
  }
  if (!compatNode) return sceneNodes;

  if (nodeIndex >= 0) {
    const existingNode = sceneNodes[nodeIndex];
    sceneNodes[nodeIndex] = {
      ...existingNode,
      enabled: type === "bandOverlay" ? !!(preferences.bands && preferences.bands.overlay && preferences.bands.overlay.enabled) : existingNode.enabled,
      settings: compatNode.settings,
    };
  } else {
    sceneNodes.push(compatNode);
  }

  return persistScenePreferences(sceneNodes);
}

export {
  addSceneOrb,
  moveSceneNode,
  readSceneNodeDisplayName,
  readSceneRuntime,
  readSceneSettingsSchema,
  readSceneSnapshot,
  readSelectedSceneNode,
  removeSceneOrb,
  replaceSceneNodeSettings,
  resetSceneRuntimeFromPreferences,
  selectSceneNode,
  syncSceneNodeFromCompatPreferences,
  syncSceneRuntimeFromPreferences,
  toggleSceneNodeEnabled,
  updateSceneNodeSettings,
  updateSceneOrb,
};
