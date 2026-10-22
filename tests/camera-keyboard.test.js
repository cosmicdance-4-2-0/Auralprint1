import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { CONFIG } from "../src/js/core/config.js";
import { state, setCamera, resetCamera } from "../src/js/core/state.js";
import { createWorldGeometry } from "../src/js/core/world-geometry.js";
import { simulationDeltaSec, visualMotionDeltaSec } from "../src/js/core/timing.js";
import { worldToViewport } from "../src/js/core/camera-projection.js";
import { createCameraInteraction } from "../src/js/ui/camera-interaction.js";

function target() {
  const listeners = new Map(), attributes = new Map();
  return {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    count(name) { return listeners.get(name)?.size || 0; },
    emit(name, props = {}) {
      const event = { target: this, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...props };
      for (const fn of listeners.get(name) || []) fn(event);
      return event;
    },
    setAttribute(key, value) { attributes.set(key, String(value)); },
    removeAttribute(key) { attributes.delete(key); },
  };
}

function harness(run) {
  const saved = { camera: state.camera, canvas: state.canvas, world: state.world,
    widthPx: state.widthPx, heightPx: state.heightPx, dpr: state.dpr,
    window: globalThis.window, document: globalThis.document };
  const canvas = target();
  let rectangleReads = 0;
  Object.assign(canvas, { width: 1200, height: 800, rect: { width: 1200, height: 800 },
    getBoundingClientRect() { rectangleReads++; return this.rect; },
    focus() { document.activeElement = canvas; }, hasPointerCapture() { return false; },
  });
  globalThis.window = target(); globalThis.document = { ...target(), hidden: false, activeElement: canvas };
  state.canvas = canvas; state.world = createWorldGeometry(1000, 1000);
  state.widthPx = canvas.width; state.heightPx = canvas.height; state.dpr = 1;
  resetCamera();
  const interaction = createCameraInteraction(); interaction.init(); interaction.setEnabled(true);
  const down = (key, props) => canvas.emit("keydown", { key, ...props });
  const up = key => window.emit("keyup", { key });
  const hold = (keys, intervals) => {
    for (const key of keys) down(key);
    for (const interval of intervals) interaction.tick(interval);
    for (const key of keys) up(key);
    return state.camera;
  };
  try { run({ canvas, interaction, down, up, hold, reads: () => rectangleReads }); }
  finally {
    interaction.dispose();
    Object.assign(state, { canvas: saved.canvas, world: saved.world, widthPx: saved.widthPx,
      heightPx: saved.heightPx, dpr: saved.dpr }); setCamera(saved.camera);
    globalThis.window = saved.window; globalThis.document = saved.document;
  }
}

function close(a, b, tolerance = 1e-9) {
  assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);
}
function cameraClose(a, b) { for (const key of ["x", "y", "zoom", "rotationRad"]) close(a[key], b[key]); }

test("116C.A: keydown and repeats track held state without directly moving the camera", () => harness(({ down, up, interaction }) => {
  const camera = state.camera;
  for (let i = 0; i < 10; i++) {
    const event = down("w", { repeat: i > 0 });
    assert.equal(event.defaultPrevented, true); assert.equal(event.stopped, true);
    assert.equal(state.camera, camera);
  }
  assert.equal(interaction.tick(.05), true);
  close(state.camera.y, 20);
  up("w"); const stopped = state.camera;
  assert.equal(interaction.tick(.05), false); assert.equal(state.camera, stopped);
}));

test("116C.A: WASD and QE keep accepted view axes and camera rotation signs", () => harness(({ hold }) => {
  for (const angle of [0, Math.PI / 2, Math.PI, .723]) {
    for (const [key, h, v] of [["w", 0, 1], ["s", 0, -1], ["a", -1, 0], ["d", 1, 0]]) {
      setCamera({ x: 0, y: 0, rotationRad: angle });
      const camera = hold([key], [.1]);
      close(camera.x, 40 * (h * Math.cos(angle) - v * Math.sin(angle)));
      close(camera.y, 40 * (h * Math.sin(angle) + v * Math.cos(angle)));
    }
  }
  resetCamera(); close(hold(["q"], [.1]).rotationRad, Math.PI / 30);
  resetCamera(); close(hold(["e"], [.1]).rotationRad, Math.PI * 2 - Math.PI / 30);
}));

test("116C.A: diagonal translation normalizes, opposing keys cancel, and combinations turn and move", () => harness(({ hold }) => {
  const straight = hold(["w"], [.1]); resetCamera();
  const diagonal = hold(["w", "d"], [.1]);
  close(Math.hypot(diagonal.x, diagonal.y), Math.hypot(straight.x, straight.y));
  resetCamera(); const before = state.camera;
  assert.equal(hold(["w", "s", "a", "d", "q", "e"], [.1]), before);
  const combined = hold(["w", "q"], [.1]);
  assert.ok(combined.x < 0 && combined.y > 0 && combined.rotationRad > 0);
}));

test("116C.A: simultaneous movement and turning are independent of frame intervals", () => harness(({ hold }) => {
  const frames = [[...Array(120).fill(1 / 120)], [...Array(60).fill(1 / 60)],
    [...Array(20).fill(.05)], [...Array(10).fill(.1)], [...Array(10).fill([.015, .025, .06]).flat()]];
  let expected;
  for (const intervals of frames) {
    setCamera({ x: 12.5, y: -240.25, zoom: 3.7, rotationRad: .237 });
    const camera = hold(["w", "d", "q"], intervals);
    if (expected) cameraClose(camera, expected); else expected = camera;
  }
}));

test("116C.A: pan speed measures CSS-screen pixels across zoom, world scale, DPR and nonuniform CSS scaling", () => harness(({ canvas, hold }) => {
  for (const zoom of [CONFIG.limits.camera.zoom.min, 1, CONFIG.limits.camera.zoom.max]) {
    for (const worldSpan of [1, 1000, 1_000_000]) {
      for (const dpr of [1, 2, 1.25]) {
        for (const [cssWidth, cssHeight] of [[1200, 800], [600, 200]]) {
          state.world = createWorldGeometry(worldSpan, worldSpan);
          state.widthPx = canvas.width = 1200 * dpr;
          state.heightPx = canvas.height = 800 * dpr;
          canvas.rect = { width: cssWidth, height: cssHeight };
          for (const rotationRad of [0, Math.PI / 2, Math.PI, .785]) {
            setCamera({ x: 0, y: 0, zoom, rotationRad });
            const initial = state.camera;
            const camera = hold(["w", "d"], [.1]);
            const projected = worldToViewport(camera.x, camera.y, state, state.world, initial);
            const dxCss = (projected.x - state.widthPx / 2) * cssWidth / state.widthPx;
            const dyCss = (projected.y - state.heightPx / 2) * cssHeight / state.heightPx;
            close(Math.hypot(dxCss, dyCss), CONFIG.camera.keyboard.panSpeedCssPxPerSec * .1);
          }
        }
      }
    }
  }
}));

test("116C.A: Shift boosts movement and rotation and releasing it restores base rates", () => harness(({ down, up, interaction, hold }) => {
  const base = hold(["w", "q"], [.1]); resetCamera();
  down("W", { shiftKey: true }); down("Q", { shiftKey: true });
  interaction.tick(.1); const boosted = state.camera;
  close(boosted.rotationRad, base.rotationRad * CONFIG.camera.keyboard.shiftMultiplier);
  up("w"); up("q"); resetCamera();
  down("w"); down("Shift"); interaction.tick(.1); close(state.camera.y, 120);
  up("Shift"); interaction.tick(.1); close(state.camera.y, 160);
}));

test("116C.A: speed settings have one stable runtime snapshot and reject invalid changes atomically", () => harness(({ interaction, hold }) => {
  const defaults = interaction.getSpeeds(); assert.ok(Object.isFrozen(defaults));
  assert.equal(interaction.getSpeeds(), defaults);
  assert.equal(interaction.setSpeeds({ panSpeedCssPxPerSec: defaults.panSpeedCssPxPerSec }), defaults);
  for (const patch of [null, [], { panSpeedCssPxPerSec: NaN }, { rotationSpeedDegPerSec: Infinity },
    { panSpeedCssPxPerSec: -1 }, { rotationSpeedDegPerSec: 361 }, { zoom: 2 }, { toString: 4 }]) {
    assert.throws(() => interaction.setSpeeds(patch), RangeError);
    assert.equal(interaction.getSpeeds(), defaults);
  }
  interaction.setSpeeds({ panSpeedCssPxPerSec: 640, rotationSpeedDegPerSec: 120 });
  close(hold(["w"], [.1]).y, 80); resetCamera();
  close(hold(["q"], [.1]).rotationRad, Math.PI / 15);
  interaction.setSpeeds({ panSpeedCssPxPerSec: 0, rotationSpeedDegPerSec: 0 });
  const camera = state.camera; assert.equal(hold(["w", "q"], [.1]), camera);
}));

test("116C.A: blur, hidden tabs, mode cancellation and abnormal frames discard held input without debt", () => harness(({ canvas, interaction, down }) => {
  const cancel = [
    () => canvas.emit("blur"), () => window.emit("blur"),
    () => { document.hidden = true; document.emit("visibilitychange"); document.hidden = false; },
    () => { document.activeElement = {}; interaction.tick(.05); document.activeElement = canvas; },
    () => { interaction.setEnabled(false); interaction.setEnabled(true); },
    () => down("Escape"),
    ...[0, -.1, NaN, Infinity, .10001, 10].map(delta => () => interaction.tick(delta)),
  ];
  for (const stop of cancel) {
    interaction.setEnabled(true); down("w"); down("Shift"); stop();
    if (!interaction.isEnabled()) interaction.setEnabled(true);
    const camera = state.camera;
    down("w", { repeat: true }); interaction.tick(.05);
    assert.equal(state.camera, camera, "repeat cannot resume cleared motion");
    down("w"); interaction.tick(.05); close(state.camera.y - camera.y, 20);
  }
}));

test("116C.A: camera mode and real canvas focus own movement; text, transport and browser keys remain unclaimed", () => harness(({ canvas, interaction, down }) => {
  interaction.setEnabled(false);
  for (const key of ["w", "q", "Shift"]) assert.equal(down(key).defaultPrevented, false);
  interaction.setEnabled(true); document.activeElement = {};
  for (const key of ["w", "q", "Shift"]) assert.equal(down(key).defaultPrevented, false);
  document.activeElement = canvas;
  for (const key of ["h", " ", "r", "n", "p", "Tab"]) assert.equal(down(key).stopped, false);
  for (const modifier of ["ctrlKey", "altKey", "metaKey", "isComposing"]) {
    down("w"); const camera = state.camera;
    assert.equal(down("w", { [modifier]: true }).stopped, false);
    interaction.tick(.05); assert.equal(state.camera, camera);
  }
  down("w", { target: {} }); const camera = state.camera;
  interaction.tick(.05); assert.equal(state.camera, camera);
}));

test("116C.A: ticks do not query layout and repeated initialization/disposal retain one listener owner", () => harness(({ canvas, interaction, down, reads }) => {
  down("w"); const before = reads();
  for (let i = 0; i < 60; i++) { interaction.tick(1 / 60); assert.equal(interaction.init(), false); }
  assert.equal(reads(), before);
  assert.equal(canvas.count("keydown"), 1); assert.equal(window.count("keyup"), 1);
  assert.equal(window.count("resize"), 1);
  interaction.dispose(); assert.equal(window.count("keyup"), 0); assert.equal(window.count("resize"), 0);
  interaction.init(); assert.equal(window.count("keyup"), 1); assert.equal(window.count("resize"), 1);
}));

test("116C.A: the production callback advances held camera input before rendering while simulation is paused", () => harness(({ interaction, down }) => {
  const savedTime = state.time;
  state.time = { lastTimestampMs: null, simPaused: false };
  let nowMs = 100000, scheduled = 0;
  const rendered = [], deltas = [];
  const source = readFileSync(new URL("../src/js/main.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/^main\(\);$/m, "").replace(/^export .*;$/m, "");
  const context = vm.createContext({
    CONFIG, state, document, runtime: { settings: CONFIG.defaults }, simulationDeltaSec, visualMotionDeltaSec,
    requestAnimationFrame() { scheduled++; }, resizeCanvasToDisplaySize() {}, performance: { now: () => nowMs },
    createAnalysisFrame() { return {}; }, updateAnalysisFrame() {}, AudioEngine: { sample() { return {}; } },
    VisualizerRuntime: { update() {}, render() { rendered.push(state.camera); } }, Renderer: {},
    UI: { updateCamera(delta) { deltas.push(delta); interaction.tick(delta); }, refreshAllUiText() {} },
    Scrubber: { draw() {} },
  });
  vm.runInContext(source, context);
  const frame = ms => { nowMs = ms; context.onAnimationFrame(ms); };
  try {
    frame(100000); down("w"); frame(100050);
    close(state.camera.y, 20); assert.equal(rendered.at(-1), state.camera);
    state.time.simPaused = true; frame(100100);
    close(state.camera.y, 40); close(deltas.at(-1), .05);
    document.hidden = true; frame(100150); close(deltas.at(-1), 0); close(state.camera.y, 40);
    document.hidden = false; context.rebaseVisualFrameClock(); frame(100200);
    down("w", { repeat: true }); frame(100250); close(state.camera.y, 40);
    down("w"); frame(100300); close(state.camera.y, 60);
    frame(220300); close(deltas.at(-1), 0); close(state.camera.y, 60);
    frame(220350); close(state.camera.y, 60);
    assert.equal(scheduled, rendered.length, "the existing callback owns every scheduled frame");
  } finally { state.time = savedTime; }
}));
