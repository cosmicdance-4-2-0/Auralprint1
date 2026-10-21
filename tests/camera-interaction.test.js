import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { state, setCamera, resetCamera } from "../src/js/core/state.js";
import { createWorldGeometry } from "../src/js/core/world-geometry.js";
import { Spaces } from "../src/js/core/spaces.js";
import { createCameraInteraction, clientToCanvas } from "../src/js/ui/camera-interaction.js";

function target() {
  const listeners = new Map(), attributes = new Map();
  return {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    count(name) { return listeners.get(name)?.size || 0; },
    emit(name, props = {}) {
      const event = { target: this, isPrimary: true, pointerId: 1, button: 0, buttons: 1,
        clientX: 300, clientY: 150, deltaMode: 0, deltaY: 120, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...props };
      for (const fn of listeners.get(name) || []) fn(event);
      return event;
    },
    setAttribute(key, value) { attributes.set(key, String(value)); },
    getAttribute(key) { return attributes.get(key) ?? null; },
    removeAttribute(key) { attributes.delete(key); },
  };
}

function harness(run) {
  const saved = { camera: state.camera, canvas: state.canvas, world: state.world,
    widthPx: state.widthPx, heightPx: state.heightPx, dpr: state.dpr,
    window: globalThis.window, document: globalThis.document };
  const canvas = target(), captures = new Set();
  Object.assign(canvas, { width: 2000, height: 1000,
    rect: { left: 100, top: 50, width: 500, height: 250 },
    getBoundingClientRect() { return this.rect; },
    setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); },
    releasePointerCapture(id) { captures.delete(id); this.emit("lostpointercapture", { pointerId: id }); },
    focus() { document.activeElement = canvas; },
  });
  globalThis.window = target(); globalThis.document = { ...target(), hidden: false };
  state.canvas = canvas; state.world = createWorldGeometry(1000, 1000);
  state.widthPx = canvas.width; state.heightPx = canvas.height; state.dpr = 2;
  resetCamera();
  const interaction = createCameraInteraction(); interaction.init();
  const worldAt = (x, y) => { const p = clientToCanvas(canvas, x, y); return Spaces.screenToSim(p.x, p.y); };
  try { run({ canvas, captures, interaction, worldAt }); }
  finally {
    interaction.dispose();
    Object.assign(state, { canvas: saved.canvas, world: saved.world, widthPx: saved.widthPx,
      heightPx: saved.heightPx, dpr: saved.dpr }); setCamera(saved.camera);
    globalThis.window = saved.window; globalThis.document = saved.document;
  }
}

function close(a, b) { assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`); }
function pointClose(a, b) { close(a.x, b.x); close(a.y, b.y); }

test("116C: client mapping uses real rectangle and backing size, including captured positions outside canvas", () => harness(({ canvas }) => {
  assert.deepEqual(clientToCanvas(canvas, 350, 175), { x: 1000, y: 500 });
  assert.deepEqual(clientToCanvas(canvas, -25, 425), { x: -500, y: 1500 });
  canvas.rect = { left: -30, top: 80, width: 800, height: 200 };
  assert.deepEqual(clientToCanvas(canvas, 370, 180), { x: 1000, y: 500 });
  for (const bad of [0, -1, NaN, Infinity]) {
    canvas.rect.width = bad;
    assert.equal(clientToCanvas(canvas, 300, 150), null);
  }
}));

test("116C: mode defaults off and leaves ordinary wheel, pointers, browser modifiers and application keys alone", () => harness(({ canvas, interaction, captures }) => {
  const camera = state.camera;
  for (const event of [canvas.emit("pointerdown"), canvas.emit("wheel"), canvas.emit("keydown", { key: "ArrowLeft" })]) {
    assert.equal(event.defaultPrevented, false); assert.equal(event.stopped, false);
  }
  assert.equal(state.camera, camera); assert.equal(captures.size, 0);
  interaction.setEnabled(true);
  for (const modifier of ["ctrlKey", "altKey", "metaKey"]) {
    for (const kind of ["wheel", "pointerdown", "keydown"]) {
      const event = canvas.emit(kind, { [modifier]: true, key: "ArrowLeft" });
      assert.equal(event.defaultPrevented, false); assert.equal(event.stopped, false);
    }
  }
  for (const key of ["h", " ", "r", "n", "p", "Tab"]) assert.equal(canvas.emit("keydown", { key }).stopped, false);
  assert.equal(state.camera, camera); assert.equal(captures.size, 0);
}));

test("116C: captured primary drag anchors world point under rotated/zoomed views and releases beyond bounds", () => harness(({ canvas, interaction, captures, worldAt }) => {
  interaction.setEnabled(true);
  for (const rotationRad of [0, Math.PI / 2, Math.PI, .73]) {
    for (const zoom of [.01, 2.75, 100]) {
      setCamera({ x: 1200.125, y: -350.5, rotationRad, zoom });
      const anchor = worldAt(300, 150);
      assert.equal(canvas.emit("pointerdown").defaultPrevented, true);
      assert.equal(captures.has(1), true);
      canvas.emit("pointermove", { clientX: 350, clientY: 175 });
      pointClose(worldAt(350, 175), anchor);
      canvas.emit("pointermove", { clientX: 750, clientY: 400 });
      pointClose(worldAt(750, 400), anchor);
      canvas.emit("pointerup", { clientX: 800, clientY: 425, buttons: 0 });
      pointClose(worldAt(800, 425), anchor);
      assert.equal(captures.size, 0);
      const stopped = state.camera;
      canvas.emit("pointermove", { clientX: 900, clientY: 500 });
      assert.equal(state.camera, stopped);
    }
  }
}));

test("116C: drag lifecycle clears capture on cancellation, focus loss, mode exit and missing primary button", () => harness(({ canvas, interaction, captures }) => {
  const exits = [
    () => canvas.emit("pointercancel"),
    () => { captures.delete(1); canvas.emit("lostpointercapture"); },
    () => canvas.emit("blur"), () => window.emit("blur"),
    () => { document.hidden = true; document.emit("visibilitychange"); },
    () => interaction.setEnabled(false),
    () => canvas.emit("pointermove", { buttons: 0 }),
  ];
  for (const exit of exits) {
    document.hidden = false; interaction.setEnabled(true); canvas.emit("pointerdown");
    assert.equal(captures.has(1), true);
    exit();
    assert.equal(captures.size, 0); assert.equal(canvas.getAttribute("data-camera-dragging"), "false");
    const camera = state.camera;
    canvas.emit("pointermove", { clientX: 400 }); assert.equal(state.camera, camera);
    interaction.setEnabled(false); interaction.setEnabled(true);
    canvas.emit("pointerdown"); canvas.emit("pointermove", { clientX: 310 }); canvas.emit("pointerup", { clientX: 310 });
    assert.notEqual(state.camera, camera, "next drag works after focus/mode recovery");
  }
}));

test("116C: extra pointers and unrelated pointer releases do not steal primary touch drag", () => harness(({ canvas, interaction, captures }) => {
  interaction.setEnabled(true);
  canvas.emit("pointerdown", { isPrimary: false, pointerId: 2 }); assert.equal(captures.size, 0);
  canvas.emit("pointerdown", { button: 2 }); assert.equal(captures.size, 0);
  canvas.emit("pointerdown", { pointerType: "touch" });
  const camera = state.camera;
  for (const name of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.emit(name, { pointerId: 2, isPrimary: false, clientX: 400 });
  }
  assert.equal(state.camera, camera); assert.equal(captures.has(1), true);
  canvas.emit("pointermove", { pointerType: "touch", clientX: 400 }); assert.notEqual(state.camera, camera);
}));

test("116C: layout/backing/rotation changes during drag use current projection and invalid views cancel safely", () => harness(({ canvas, interaction, captures, worldAt }) => {
  interaction.setEnabled(true); canvas.emit("pointerdown");
  setCamera({ zoom: 3, rotationRad: 1 });
  canvas.rect = { left: 50, top: 100, width: 800, height: 400 };
  canvas.width = state.widthPx = 1600; canvas.height = state.heightPx = 800;
  const anchor = worldAt(300, 150);
  canvas.emit("pointermove", { clientX: 400, clientY: 250 });
  pointClose(worldAt(400, 250), anchor);
  const camera = state.camera;
  canvas.rect.width = 0; canvas.emit("pointermove", { clientX: 500 });
  assert.equal(state.camera, camera); assert.equal(captures.size, 0);
}));

test("116C: capture failure and unrepresentable motion cannot leave an active drag or corrupt camera", () => harness(({ canvas, interaction, captures }) => {
  interaction.setEnabled(true);
  const capture = canvas.setPointerCapture;
  canvas.setPointerCapture = () => { throw new Error("pointer no longer active"); };
  const camera = state.camera;
  assert.equal(canvas.emit("pointerdown").defaultPrevented, false);
  canvas.emit("pointermove", { clientX: 400 }); assert.equal(state.camera, camera);
  canvas.setPointerCapture = capture;
  setCamera({ x: 1e308, y: 0 });
  canvas.emit("pointerdown"); canvas.emit("pointerup");
  assert.equal(state.camera.x, 1e308); assert.equal(captures.size, 0);
  canvas.emit("pointerdown"); const largeCamera = state.camera;
  canvas.emit("pointermove", { clientX: Infinity });
  assert.equal(state.camera, largeCamera); assert.equal(captures.size, 0);
}));

test("116C: pointer-centered wheel zoom anchors world coordinates across rotation, delta modes and limits", () => harness(({ canvas, interaction, worldAt }) => {
  interaction.setEnabled(true);
  for (const rotationRad of [0, Math.PI / 2, .87]) {
    for (const deltaMode of [0, 1, 2]) {
      setCamera({ x: -123.25, y: 450.125, zoom: 1.23, rotationRad });
      const anchor = worldAt(300, 150), camera = state.camera;
      assert.equal(canvas.emit("wheel", { deltaMode, deltaY: -1 }).defaultPrevented, true);
      assert.ok(state.camera.zoom > camera.zoom); pointClose(worldAt(300, 150), anchor);
      canvas.emit("wheel", { deltaMode, deltaY: 1 }); pointClose(worldAt(300, 150), anchor);
      close(state.camera.zoom, camera.zoom);
      canvas.emit("wheel", { deltaY: -Number.MAX_VALUE });
      assert.equal(state.camera.zoom, CONFIG.limits.camera.zoom.max); pointClose(worldAt(300, 150), anchor);
      canvas.emit("wheel", { deltaY: Number.MAX_VALUE });
      assert.equal(state.camera.zoom, CONFIG.limits.camera.zoom.min); pointClose(worldAt(300, 150), anchor);
    }
  }
  const camera = state.camera;
  for (const props of [{ clientX: -100 }, { deltaY: NaN }, { deltaY: 0 }, { deltaMode: 4 }, { deltaY: Infinity }]) {
    assert.equal(canvas.emit("wheel", props).defaultPrevented, false);
    assert.equal(state.camera, camera);
  }
}));

test("116C: canvas keys own camera actions locally, terminate drag, preserve global seek priority outside mode", () => harness(({ canvas, interaction, captures }) => {
  interaction.setEnabled(true); canvas.emit("pointerdown");
  const event = canvas.emit("keydown", { key: "ArrowRight" });
  assert.equal(event.defaultPrevented, true); assert.equal(event.stopped, true); assert.equal(captures.size, 0);
  assert.equal(state.camera.x, CONFIG.camera.interaction.panStepUnits);
  for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "+", "-", "[", "]", "Home"]) {
    assert.equal(canvas.emit("keydown", { key }).stopped, true);
  }
  assert.deepEqual(state.camera, CONFIG.camera.defaults);
  assert.equal(canvas.emit("keydown", { key: "ArrowLeft", target: {} }).stopped, false);
  assert.equal(canvas.emit("keydown", { key: "ArrowLeft", defaultPrevented: true }).stopped, false);
  canvas.emit("keydown", { key: "Escape" }); assert.equal(interaction.isEnabled(), false);
  assert.equal(canvas.emit("keydown", { key: "ArrowLeft" }).stopped, false);
}));

test("116C: repeated initialization, mode toggles and disposal do not accumulate listeners or captures", () => harness(({ canvas, interaction, captures }) => {
  for (let i = 0; i < 20; i++) { assert.equal(interaction.init(), false); interaction.setEnabled(true); interaction.setEnabled(false); }
  assert.equal(canvas.count("pointerdown"), 1); assert.equal(window.count("blur"), 1);
  interaction.setEnabled(true); canvas.emit("pointerdown"); interaction.dispose();
  assert.equal(captures.size, 0); assert.equal(canvas.count("pointerdown"), 0); assert.equal(window.count("blur"), 0);
  assert.equal(canvas.getAttribute("data-camera-interaction"), null);
  assert.equal(interaction.init(), true); assert.equal(canvas.count("pointerdown"), 1);
  canvas.emit("pointerdown"); canvas.emit("pointermove", { clientX: 400 });
  assert.notEqual(state.camera.x, 0);
}));
