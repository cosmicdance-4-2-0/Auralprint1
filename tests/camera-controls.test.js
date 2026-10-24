import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { RAD_TO_DEG } from "../src/js/core/constants.js";
import { state, setCamera, resetCamera } from "../src/js/core/state.js";
import { createWorldGeometry } from "../src/js/core/world-geometry.js";
import { viewportToWorld } from "../src/js/core/camera-projection.js";
import { panCamera, rotateCamera, zoomCamera } from "../src/js/ui/camera-actions.js";
import { createCameraControlsUi } from "../src/js/ui/camera-controls.js";

function element() {
  const listeners = new Map(), attrs = new Map();
  return { value: "", checked: false, disabled: false, textContent: "",
    setAttribute(key, value) { attrs.set(key, String(value)); }, getAttribute(key) { return attrs.get(key); },
    addEventListener(key, callback) { const values = listeners.get(key) || []; values.push(callback); listeners.set(key, values); },
    dispatch(key, values = {}) { const event = { preventDefault() { this.defaultPrevented = true; }, ...values }; for (const callback of listeners.get(key) || []) callback(event); return event; },
    listenerCount(key) { return (listeners.get(key) || []).length; },
  };
}
function harness() {
  const ids = ["btnSaveSceneView", "btnRestoreSceneView", "sceneCameraReadout", "sceneCameraStatus", "cameraSection", "chkCameraInteraction", "valCameraInteraction", "btnCameraPanLeft", "btnCameraPanRight", "btnCameraPanUp", "btnCameraPanDown", "btnCameraZoomIn", "btnCameraZoomOut", "btnCameraRotateCW", "btnCameraRotateCCW", "btnResetCamera", "btnFitCamera", "btnFocusCameraCanvas"];
  for (const name of ["X", "Y", "Zoom", "Rotation", "PanSpeed", "RotationSpeed"]) ids.push(`numCamera${name}`, `valCamera${name}`, `camera${name}Error`);
  const ui = Object.fromEntries(ids.map(id => [id, element()]));
  let enabled = false, cancellations = 0;
  let speeds = Object.freeze({panSpeedCssPxPerSec: 320, rotationSpeedDegPerSec: 60});
  const interaction = { getSpeeds: () => speeds, setSpeeds(patch) { speeds = Object.freeze({...speeds, ...patch}); }, isEnabled: () => enabled, setEnabled(value) { enabled = value; }, cancelDrag() { cancellations++; }, cancelInput() { cancellations++; } };
  const controls = createCameraControlsUi({ ui, interaction });
  return { ui, controls, interaction, cancellations: () => cancellations };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test("116C actions pan along rotated view axes without rounding camera precision", () => {
  try {
    setCamera({ x: 12.345678901234, y: -98.765432109876, zoom: 2.75, rotationRad: Math.PI / 2 });
    const start = state.camera;
    assert.equal(panCamera(1, 0), true);
    close(state.camera.x, start.x); close(state.camera.y, start.y + CONFIG.camera.interaction.panStepUnits);
    panCamera(0, 1); close(state.camera.x, start.x - CONFIG.camera.interaction.panStepUnits);
    assert.equal(state.camera.zoom, start.zoom); assert.equal(state.camera.rotationRad, start.rotationRad);
    rotateCamera(-1); close(state.camera.rotationRad, Math.PI / 2 - CONFIG.camera.interaction.rotationStepDeg / RAD_TO_DEG);
  } finally { resetCamera(); }
});

test("116C pointer zoom preserves its world anchor under combined camera transform and limits", () => {
  const saved = { world: state.world, widthPx: state.widthPx, heightPx: state.heightPx };
  try {
    state.world = createWorldGeometry(2400, 1600); state.widthPx = 1333; state.heightPx = 987;
    setCamera({ x: 147.123456789, y: -260.987654321, zoom: 1.23456789, rotationRad: .713 });
    const point = { x: 777.25, y: 333.75 }, before = viewportToWorld(point.x, point.y, state, state.world, state.camera);
    for (const factor of [1.6, 1e99, 1e-99, 3.1]) {
      assert.equal(zoomCamera(factor, point), true);
      const after = viewportToWorld(point.x, point.y, state, state.world, state.camera);
      close(after.x, before.x); close(after.y, before.y);
    }
    const camera = state.camera;
    for (const factor of [0, -1, NaN, Infinity]) { assert.equal(zoomCamera(factor, point), false); assert.equal(state.camera, camera); }
    assert.equal(zoomCamera(2, { x: NaN, y: 0 }), false); assert.equal(state.camera, camera);
    state.widthPx = 0; assert.equal(zoomCamera(2, point), false); assert.equal(state.camera, camera);
    assert.equal(panCamera(NaN, 0), false); assert.equal(rotateCamera(Infinity), false); assert.equal(state.camera, camera);
  } finally { Object.assign(state, saved); resetCamera(); }
});

test("116C controls preserve fractional values, reject malformed drafts and normalize rotation only on edit", () => {
  const h = harness();
  try {
    setCamera({ x: .123456789012345, y: -1.123456789012345, zoom: 1.234567890123, rotationRad: .123456789012345 });
    const imported = state.camera;
    assert.equal(h.controls.init(), true); assert.equal(h.controls.init(), false);
    for (const name of ["X", "Y", "Zoom", "Rotation"]) {
      assert.equal(h.ui[`numCamera${name}`].step, "any");
      assert.equal(h.ui[`numCamera${name}`].listenerCount("change"), 1);
    }
    h.ui.numCameraRotation.dispatch("change"); assert.equal(state.camera, imported);
    for (const [name, values] of [["X", ["", "-", "NaN", "Infinity", "0x10", "1e999"]], ["Zoom", ["0", "-1", "100.01", ".009", "hello"]], ["Rotation", ["1.2.3", "Infinity"]]]) {
      for (const value of values) {
        const input = h.ui[`numCamera${name}`]; input.value = value; input.dispatch("change");
        assert.equal(state.camera, imported); assert.equal(input.getAttribute("aria-invalid"), "true");
        assert.ok(h.ui[`camera${name}Error`].textContent);
      }
    }
    h.ui.numCameraX.value = "-765.1234567890123"; h.ui.numCameraX.dispatch("change"); assert.equal(state.camera.x, -765.1234567890123);
    assert.equal(h.ui.numCameraX.getAttribute("aria-invalid"), "false"); assert.equal(h.ui.numCameraY.value, String(imported.y));
    h.ui.numCameraRotation.value = "-450.125"; h.ui.numCameraRotation.dispatch("change");
    close(state.camera.rotationRad * RAD_TO_DEG, 269.875); assert.match(h.ui.valCameraRotation.textContent, /degrees/);
    assert.match(h.ui.valCameraX.textContent, /world units/);
  } finally { resetCamera(); }
});

test("116C controls follow authoritative replacements and all button/keyboard paths without simulation ownership", () => {
  const h = harness();
  const saved = { world: state.world, orbs: state.orbs, source: state.source, audio: state.audio, time: state.time };
  try {
    resetCamera(); h.controls.init();
    h.ui.btnCameraPanRight.dispatch("click"); assert.equal(state.camera.x, CONFIG.camera.interaction.panStepUnits);
    h.ui.btnCameraPanLeft.dispatch("click"); assert.equal(state.camera.x, 0);
    h.ui.btnCameraPanUp.dispatch("click"); assert.equal(state.camera.y, CONFIG.camera.interaction.panStepUnits);
    h.ui.btnCameraPanDown.dispatch("click"); assert.equal(state.camera.y, 0);
    h.ui.btnCameraZoomIn.dispatch("click"); assert.equal(state.camera.zoom, CONFIG.camera.interaction.zoomFactor);
    h.ui.btnCameraZoomOut.dispatch("click"); close(state.camera.zoom, 1);
    h.ui.btnCameraRotateCCW.dispatch("click"); close(state.camera.rotationRad * RAD_TO_DEG, CONFIG.camera.interaction.rotationStepDeg);
    h.ui.btnCameraRotateCW.dispatch("click"); close(state.camera.rotationRad, 0);
    const event = h.ui.numCameraY.dispatch("keydown", { key: "ArrowUp" }); assert.equal(event.defaultPrevented, true);
    assert.equal(state.camera.y, CONFIG.camera.interaction.panStepUnits);
    h.ui.numCameraX.value = "200.123456789";
    h.ui.numCameraX.dispatch("keydown", { key: "ArrowUp" });
    assert.equal(state.camera.x, 200.123456789 + CONFIG.camera.interaction.panStepUnits);
    const unchanged = state.camera;
    h.ui.numCameraX.value = "-";
    h.ui.numCameraX.dispatch("keydown", { key: "ArrowUp" });
    assert.equal(state.camera, unchanged); assert.equal(h.ui.numCameraX.getAttribute("aria-invalid"), "true");
    h.ui.numCameraX.dispatch("keydown", { key: "ArrowUp", ctrlKey: true }); assert.equal(state.camera, unchanged);
    h.ui.chkCameraInteraction.checked = true; h.ui.chkCameraInteraction.dispatch("change"); assert.equal(h.interaction.isEnabled(), true);
    h.interaction.setEnabled(false); h.controls.refresh(); assert.equal(h.ui.chkCameraInteraction.checked, false); assert.equal(h.ui.valCameraInteraction.textContent, "Camera mode off");
    setCamera({ zoom: CONFIG.limits.camera.zoom.max, x: .987654321012345 }); h.controls.refresh();
    assert.equal(h.ui.numCameraX.value, ".987654321012345".replace(/^\./, "0.")); assert.equal(h.ui.btnCameraZoomIn.disabled, true);
    h.ui.btnResetCamera.dispatch("click"); assert.deepEqual(state.camera, CONFIG.camera.defaults);
    for (const [key, value] of Object.entries(saved)) assert.equal(state[key], value, key);
    assert.ok(h.cancellations() > 0);
  } finally { resetCamera(); }
});


test("116C.A: live camera refresh preserves focused drafts and skips hidden-panel work", () => {
  const h = harness(), previousDocument = globalThis.document;
  try {
    resetCamera(); globalThis.document = { activeElement: null };
    h.ui.cameraPanel = { style: { display: "block" } };
    h.controls.init();
    document.activeElement = h.ui.numCameraX;
    h.ui.numCameraX.value = "-";
    h.ui.numCameraX.dispatch("change");
    const error = h.ui.cameraXError.textContent;
    setCamera({ x: 777, y: 456 }); h.controls.refresh();
    assert.equal(h.ui.numCameraX.value, "-");
    assert.equal(h.ui.numCameraX.getAttribute("aria-invalid"), "true");
    assert.equal(h.ui.cameraXError.textContent, error);
    assert.equal(h.ui.valCameraX.textContent, "777 world units");
    assert.equal(h.ui.numCameraY.value, "456");
    h.controls.refresh(true); assert.equal(h.ui.numCameraX.value, "-");
    document.activeElement = null; h.ui.numCameraX.dispatch("blur");
    assert.equal(h.ui.numCameraX.value, "-");
    assert.equal(h.ui.numCameraX.getAttribute("aria-invalid"), "true");
    h.ui.numCameraX.value = "777"; h.ui.numCameraX.dispatch("change");
    assert.equal(h.ui.numCameraX.getAttribute("aria-invalid"), "false");
    h.ui.cameraPanel.style.display = "none";
    setCamera({ x: 999 }); assert.equal(h.controls.refresh(), false);
    assert.equal(h.ui.numCameraX.value, "777");
    h.ui.cameraPanel.style.display = "block"; h.controls.refresh();
    assert.equal(h.ui.numCameraX.value, "999");
  } finally { globalThis.document = previousDocument; resetCamera(); }
});

test("116C.A: speed controls are CONFIG bounded runtime actions and focus returns to canvas", () => {
  const h = harness(), previousCanvas = state.canvas;
  try {
    h.controls.init(); h.controls.init();
    for (const [name, key, value] of [["PanSpeed", "panSpeedCssPxPerSec", 640], ["RotationSpeed", "rotationSpeedDegPerSec", 120]]) {
      const input = h.ui[`numCamera${name}`], limits = CONFIG.limits.camera[key];
      assert.equal(input.min, String(limits.min)); assert.equal(input.max, String(limits.max));
      assert.equal(input.step, String(limits.step)); assert.equal(input.listenerCount("change"), 1);
      input.value = String(value); input.dispatch("change");
      assert.equal(h.interaction.getSpeeds()[key], value);
      for (const invalid of ["-", "Infinity", String(limits.max + 1), String(limits.min - 1)]) {
        input.value = invalid; input.dispatch("change");
        assert.equal(h.interaction.getSpeeds()[key], value);
        assert.equal(input.getAttribute("aria-invalid"), "true");
      }
    }
    let focused = 0; state.canvas = { focus(options) { assert.equal(options.preventScroll, true); focused++; } };
    h.ui.btnFocusCameraCanvas.dispatch("click"); assert.equal(focused, 1);
    assert.equal(h.ui.btnFocusCameraCanvas.listenerCount("click"), 1);
  } finally { state.canvas = previousCanvas; resetCamera(); }
});
