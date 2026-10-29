import { canonicalPrefs, with116Defaults } from "./helpers/preset-semantics.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIG } from "../src/js/core/config.js";
import { TAU } from "../src/js/core/constants.js";
import { createCameraState, normalizeSceneCamera } from "../src/js/core/camera-state.js";
import { state, setCamera } from "../src/js/core/state.js";
import { preferences, runtime, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { encodePresetPayload, decodePresetPayload, sanitizePreset } from "../src/js/presets/preset-codec.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { saveSceneCamera, restoreSceneCamera } from "../src/js/ui/scene-camera-actions.js";

const authored = { x: 123.456789012345, y: -987.654321098765, zoom: 2.3456789012345, rotationRad: .7135792468013579 };
const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const hash = payload => "#p=" + Buffer.from(JSON.stringify(payload)).toString("base64url");
function scene(run) {
  const saved = { prefs: structuredClone(preferences), settings: runtime.settings, camera: state.camera,
    world: state.world, width: state.widthPx, height: state.heightPx, location: globalThis.location, history: globalThis.history };
  globalThis.location = { pathname: "/", search: "", hash: "" };
  globalThis.history = { replaceState(_s, _t, url) { location.hash = url.slice(url.indexOf("#")); } };
  try { run(); }
  finally {
    replacePreferences(saved.prefs); runtime.settings = saved.settings; setCamera(saved.camera);
    state.world = saved.world; state.widthPx = saved.width; state.heightPx = saved.height;
    globalThis.location = saved.location; globalThis.history = saved.history;
  }
}

test("116D: schema 11 retains every historical field, world dimensions and unit spacing", () => {
  const original = fixture("schema-11-full"), before = structuredClone(original);
  const next = sanitizePreset(decodePresetPayload({ schema: 11, prefs: original }));
  assert.deepEqual(next, with116Defaults({ ...original, sceneCamera: CONFIG.defaults.sceneCamera }));
  assert.deepEqual(original, before);
  const payload = encodePresetPayload(next);
  assert.equal(payload.schema, 16);
  assert.deepEqual(sanitizePreset(decodePresetPayload(payload)), next);
});

test("116D: every old schema ignores injected current cameras and historical camera aliases", () => scene(() => {
  setCamera(authored);
  for (const input of [...fixture("legacy-presets"), fixture("schema-9-scene"),
    { schema: 10, prefs: fixture("schema-10-full") }, { schema: 11, prefs: fixture("schema-11-full") }]) {
    for (const injected of [false, true]) {
      const payload = structuredClone(input);
      if (injected) Object.assign(payload.prefs, { sceneCamera: authored, camera: authored,
        scene: { ...payload.prefs.scene, camera: authored, sceneCamera: authored } });
      location.hash = hash(payload);
      assert.equal(UrlPreset.applyFromLocationHash(), true);
      assert.deepEqual(preferences.sceneCamera, CONFIG.defaults.sceneCamera);
      resolveSettings(); restoreSceneCamera();
      assert.deepEqual(state.camera, CONFIG.camera.defaults);
      assert.notEqual(state.camera, preferences.sceneCamera);
      setCamera(authored);
    }
  }
}));

test("116D: schema 10 keeps pixel-spacing migration and default world despite injected fields", () => {
  const prefs = fixture("schema-10-full");
  prefs.world = { widthUnits: 4321.123, heightUnits: 1234.321 };
  prefs.sceneCamera = authored;
  prefs.orbs[0].particles.minPlacementDistancePx = 2.345678901234;
  prefs.orbs[0].particles.minPlacementDistanceUnits = 9;
  const next = sanitizePreset({ schema: 10, prefs });
  assert.deepEqual(next.world, CONFIG.defaults.world);
  assert.deepEqual(next.sceneCamera, CONFIG.defaults.sceneCamera);
  assert.equal(next.orbs[0].particles.minPlacementDistanceUnits,
    2.345678901234 * CONFIG.worldGeometry.legacyWorldUnitsPerCssPixel);
});

for (const invalid of [undefined, null, false, 4, "camera", [], [authored]]) {
  test(`116D: malformed camera container ${JSON.stringify(invalid)} defaults`, () => {
    assert.deepEqual(normalizeSceneCamera(invalid), CONFIG.defaults.sceneCamera);
    assert.deepEqual(canonicalPrefs(encodePresetPayload({ sceneCamera: invalid })).sceneCamera, CONFIG.defaults.sceneCamera);
  });
}
for (const field of Object.keys(authored)) {
  test(`116D: malformed ${field} defaults independently and strips unknown camera keys`, () => {
    for (const invalid of [undefined, null, false, "1.25", {}, [], NaN, Infinity, -Infinity]) {
      const incoming = { ...authored, [field]: invalid, rotationDeg: 90, heldKeys: ["w"] };
      const camera = sanitizePreset({ schema: 12, prefs: { sceneCamera: incoming } }).sceneCamera;
      assert.deepEqual(camera, { ...authored, [field]: CONFIG.defaults.sceneCamera[field] });
      assert.notEqual(camera, incoming); assert.equal(Object.isFrozen(camera), true);
      assert.deepEqual(canonicalPrefs(encodePresetPayload({ sceneCamera: incoming })).sceneCamera, camera);
    }
  });
}

test("116D: positive extreme zoom clamps to existing CONFIG range; invalid zoom defaults", () => {
  for (const value of [0, -1, -Number.MAX_VALUE]) {
    assert.equal(normalizeSceneCamera({ ...authored, zoom: value }).zoom, CONFIG.defaults.sceneCamera.zoom);
  }
  for (const [value, expected] of [[Number.MIN_VALUE, CONFIG.limits.camera.zoom.min],
    [Number.MAX_VALUE, CONFIG.limits.camera.zoom.max], [CONFIG.limits.camera.zoom.min, CONFIG.limits.camera.zoom.min],
    [CONFIG.limits.camera.zoom.max, CONFIG.limits.camera.zoom.max]]) {
    assert.equal(normalizeSceneCamera({ ...authored, zoom: value }).zoom, expected);
  }
  assert.deepEqual(normalizeSceneCamera({ ...authored, x: Number.MAX_VALUE, y: -Number.MAX_VALUE }),
    { ...authored, x: Number.MAX_VALUE, y: -Number.MAX_VALUE });
});

test("116D: rotation uses live normalization and retains canonical precision through repeated transport", () => {
  for (const rotationRad of [authored.rotationRad, -authored.rotationRad, 0, -0, TAU, -TAU, TAU * 1000 + .123456789,
    Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE]) {
    const camera = normalizeSceneCamera({ ...authored, rotationRad });
    assert.deepEqual(camera, createCameraState({ ...authored, rotationRad }));
    assert.ok(camera.rotationRad >= 0 && camera.rotationRad < TAU);
    let prefs = { sceneCamera: camera };
    for (let i = 0; i < 10; i++) prefs = sanitizePreset(decodePresetPayload(JSON.parse(JSON.stringify(encodePresetPayload(prefs)))));
    assert.deepEqual(prefs.sceneCamera, camera);
  }
});

test("116D: capture, resolve, share and restore keep independent snapshots without viewport dependencies", () => scene(() => {
  replacePreferences(structuredClone(CONFIG.defaults)); resolveSettings();
  state.widthPx = state.heightPx = 0;
  const live = setCamera(authored), world = state.world;
  const saved = saveSceneCamera(); resolveSettings();
  assert.notEqual(saved, live); assert.notEqual(saved, runtime.settings.sceneCamera);
  assert.equal(state.camera, live); assert.equal(state.world, world);
  setCamera({ x: -900, zoom: .1 });
  const wandering = state.camera;
  UrlPreset.writeHashFromPrefs();
  const payload = JSON.parse(Buffer.from(location.hash.slice(3), "base64url"));
  assert.deepEqual(canonicalPrefs(payload).sceneCamera, authored);
  assert.equal(state.camera, wandering);
  // The transport continues to replace preferences only; the caller resolves
  // before explicitly initializing the live view, at startup or in-session.
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  assert.equal(state.camera, wandering);
  resolveSettings(); restoreSceneCamera();
  assert.deepEqual(state.camera, authored); assert.notEqual(state.camera, preferences.sceneCamera);
  assert.deepEqual(preferences.sceneCamera, authored);
  const canonical = encodePresetPayload(preferences);
  setCamera({ rotationRad: 2, x: 800 }); resolveSettings();
  assert.deepEqual(encodePresetPayload(preferences), canonical);
}));

test("116D: preference replacement detaches and normalizes an injected live camera", () => scene(() => {
  const input = { ...structuredClone(CONFIG.defaults), sceneCamera: { ...authored } };
  replacePreferences(input);
  input.sceneCamera.x = 800;
  assert.deepEqual(preferences.sceneCamera, authored);
  assert.notEqual(preferences.sceneCamera, input.sceneCamera);
}));

test("116D: large Scene URL preserves all admitted Orbs, world and authored view", () => scene(() => {
  const prefs = with116Defaults(fixture("schema-12-full")), seed = prefs.orbs[0];
  prefs.orbs = Array.from({ length: 512 }, (_, i) => ({ ...structuredClone(seed), id: `large-宇宙-${i}` }));
  replacePreferences(prefs); UrlPreset.writeHashFromPrefs();
  assert.ok(location.hash.length > 100_000);
  replacePreferences(structuredClone(CONFIG.defaults));
  assert.equal(UrlPreset.applyFromLocationHash(), true);
  assert.deepEqual(preferences, prefs);
}));
