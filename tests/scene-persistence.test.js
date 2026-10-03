import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../src/js/core/config.js";
import { PRESET_SCHEMA_VERSION } from "../src/js/core/constants.js";
import { preferences, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { sanitizePersistedSceneNodes } from "../src/js/render/scene-persistence.js";
import { normalizeViewTransform } from "../src/js/render/view-transform.js";

function encodePresetHashPayload(payload) {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `#p=${b64}`;
}

function decodePresetHash(hash) {
  const token = hash.startsWith("#p=") ? hash.slice(3) : hash;
  const padLength = (4 - (token.length % 4)) % 4;
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

function snapshotSceneState() {
  return structuredClone(state.scene);
}

function restoreSceneState(snapshot) {
  state.scene.nodes = structuredClone(Array.isArray(snapshot?.nodes) ? snapshot.nodes : []);
  state.scene.selectedNodeId = typeof snapshot?.selectedNodeId === "string" ? snapshot.selectedNodeId : "";
  state.scene.viewTransform = structuredClone(snapshot?.viewTransform);
}

function createHistoryStub(locationStub) {
  return {
    replaceState(_state, _title, url) {
      locationStub.hash = new URL(url, "https://example.test").hash;
    },
  };
}

test("sanitizePersistedSceneNodes honors persisted zIndex before canonical reindexing", () => {
  const sceneNodes = sanitizePersistedSceneNodes([
    {
      id: "overlay-1",
      type: "bandOverlay",
      enabled: true,
      zIndex: 4,
      bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
      anchor: { x: 0.5, y: 0.5 },
      settings: { enabled: true, alpha: 0.61, pointSizePx: 6 },
    },
    {
      id: "orbs-1",
      type: "orbs",
      enabled: false,
      zIndex: -3,
      bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
      anchor: { x: 0.5, y: 0.5 },
      settings: [
        {
          id: "ORB_A",
          chanId: "L",
          bandIds: [1, 3],
          chirality: -1,
          startAngleRad: 0.25,
          hueOffsetDeg: 120,
          centerX: 0.25,
          centerY: -0.15,
        },
      ],
    },
    {
      id: "overlay-2",
      type: "bandOverlay",
      enabled: false,
      zIndex: 4,
      bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
      anchor: { x: 0.5, y: 0.5 },
      settings: { enabled: false, alpha: 0.2 },
    },
  ]);

  assert.deepEqual(sceneNodes.map((node) => node.id), ["orbs-1", "overlay-1", "overlay-2"]);
  assert.deepEqual(sceneNodes.map((node) => node.zIndex), [0, 1, 2]);
  assert.equal(sceneNodes[0].enabled, false);
  assert.equal(sceneNodes[0].settings[0].hueOffsetDeg, 120);
  assert.equal(sceneNodes[0].settings[0].centerX, 0.25);
  assert.equal(sceneNodes[1].settings.alpha, 0.61);
  assert.equal(sceneNodes[2].settings.enabled, false);
});

test("Schema 9 preset imports honor persisted zIndex and save back canonically", () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const previousPrefs = structuredClone(preferences);
  const previousScene = snapshotSceneState();
  const locationStub = {
    pathname: "/",
    search: "",
    hash: "",
  };

  globalThis.location = locationStub;
  globalThis.history = createHistoryStub(locationStub);
  globalThis.btoa = (value) => Buffer.from(value, "utf8").toString("base64");
  globalThis.atob = (value) => Buffer.from(value, "base64").toString("utf8");

  try {
    replacePreferences(structuredClone(CONFIG.defaults));
    resolveSettings();

    const result = UrlPreset.applyFromLocationHash(encodePresetHashPayload({
      schema: PRESET_SCHEMA_VERSION,
      prefs: {
        scene: {
          nodes: [
            {
              id: "overlay-1",
              type: "bandOverlay",
              enabled: true,
              zIndex: 9,
              bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
              anchor: { x: 0.5, y: 0.5 },
              settings: { enabled: true, alpha: 0.61, pointSizePx: 6 },
            },
            {
              id: "orbs-1",
              type: "orbs",
              enabled: false,
              zIndex: -4,
              bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
              anchor: { x: 0.5, y: 0.5 },
              settings: [
                {
                  id: "ORB_A",
                  chanId: "L",
                  bandIds: [1, 3],
                  chirality: -1,
                  startAngleRad: 0.25,
                  hueOffsetDeg: 120,
                  centerX: 0.25,
                  centerY: -0.15,
                },
              ],
            },
          ],
        },
        bands: {
          count: 96,
          floorHz: 32,
          ceilingHz: 16000,
        },
      },
    }));

    assert.equal(result.ok, true);
    assert.deepEqual(preferences.scene.nodes.map((node) => node.id), ["orbs-1", "overlay-1"]);
    assert.deepEqual(preferences.scene.nodes.map((node) => node.zIndex), [0, 1]);
    assert.equal(preferences.scene.nodes[0].enabled, false);
    assert.equal(preferences.scene.nodes[0].settings[0].hueOffsetDeg, 120);
    assert.equal(preferences.scene.nodes[0].settings[0].centerX, 0.25);
    assert.equal(preferences.scene.nodes[1].settings.alpha, 0.61);

    state.scene.viewTransform = normalizeViewTransform({
      mode: "placeholder",
      matrix: [1, 0, 0, 1, 14, -7],
    });

    UrlPreset.writeHashFromPrefs();
    const saved = decodePresetHash(locationStub.hash);

    assert.equal(saved.schema, PRESET_SCHEMA_VERSION);
    assert.deepEqual(saved.prefs.scene.nodes.map((node) => node.id), ["orbs-1", "overlay-1"]);
    assert.deepEqual(saved.prefs.scene.nodes.map((node) => node.zIndex), [0, 1]);
    assert.equal(saved.prefs.scene.nodes[0].enabled, false);
    assert.equal(saved.prefs.scene.nodes[0].settings[0].hueOffsetDeg, 120);
    assert.equal(saved.prefs.scene.nodes[1].settings.alpha, 0.61);
    assert.equal(saved.prefs.bands.count, 96);
    assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs.scene, "viewTransform"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs, "ui"), false);
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    restoreSceneState(previousScene);
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});

test("legacy Schema 8 presets round-trip into Schema 9 without runtime-only leaks", () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const previousPrefs = structuredClone(preferences);
  const previousScene = snapshotSceneState();
  const locationStub = {
    pathname: "/",
    search: "",
    hash: "",
  };

  globalThis.location = locationStub;
  globalThis.history = createHistoryStub(locationStub);
  globalThis.btoa = (value) => Buffer.from(value, "utf8").toString("base64");
  globalThis.atob = (value) => Buffer.from(value, "base64").toString("utf8");

  try {
    replacePreferences(structuredClone(CONFIG.defaults));
    resolveSettings();

    const result = UrlPreset.applyFromLocationHash(encodePresetHashPayload({
      schema: 8,
      prefs: {
        bands: {
          count: 96,
          floorHz: 30,
          ceilingHz: 16000,
        },
        orbs: [
          { id: "LEGACY_A", chanId: "L", bandIds: [1, 5], chirality: 1, startAngleRad: 0.75 },
        ],
        overlay: {
          enabled: false,
          alpha: 0.42,
          pointSizePx: 6,
        },
      },
    }));

    assert.equal(result.ok, true);
    assert.equal(result.schema, PRESET_SCHEMA_VERSION);
    assert.equal(result.migratedFromSchema, 8);
    assert.deepEqual(preferences.scene.nodes.map((node) => node.id), ["orbs-1", "overlay-1"]);
    assert.deepEqual(preferences.scene.nodes.map((node) => node.zIndex), [0, 1]);

    state.scene.viewTransform = normalizeViewTransform({
      mode: "placeholder",
      matrix: [1, 0, 0, 1, 20, -12],
    });

    UrlPreset.writeHashFromPrefs();
    const saved = decodePresetHash(locationStub.hash);

    assert.equal(saved.schema, PRESET_SCHEMA_VERSION);
    assert.deepEqual(saved.prefs.scene.nodes.map((node) => node.id), ["orbs-1", "overlay-1"]);
    assert.deepEqual(saved.prefs.scene.nodes.map((node) => node.zIndex), [0, 1]);
    assert.equal(saved.prefs.scene.nodes[1].enabled, false);
    assert.equal(saved.prefs.scene.nodes[1].settings.enabled, false);
    assert.equal(saved.prefs.scene.nodes[1].settings.alpha, 0.42);
    assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs, "orbs"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs, "overlay"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs.bands, "overlay"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs.scene, "viewTransform"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs, "source"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs, "recording"), false);
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    restoreSceneState(previousScene);
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});
