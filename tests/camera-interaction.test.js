import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { state, setCamera, resetCamera } from "../src/js/core/state.js";
import { createWorldGeometry } from "../src/js/core/world-geometry.js";
import { Spaces } from "../src/js/core/spaces.js";
import { preferences } from "../src/js/core/preferences.js";
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

const touch = (canvas, name, id, x, y, props = {}) => canvas.emit(name, {
  pointerType: "touch", pointerId: id, isPrimary: id === 11, clientX: x, clientY: y, ...props,
});
function pair(canvas) {
  touch(canvas, "pointerdown", 11, 260, 130);
  touch(canvas, "pointerdown", 22, 380, 180);
}
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

test("116 touch: one finger uses inverse pan and second nonprimary canvas touch acquires without changing pose", () => harness(({ canvas, interaction, captures, worldAt }) => {
  interaction.setEnabled(true);
  setCamera({ x: 120, y: -80, zoom: 2, rotationRad: .73 });
  const anchor = worldAt(260, 130);
  assert.equal(touch(canvas, "pointerdown", 11, 260, 130).defaultPrevented, true);
  touch(canvas, "pointermove", 11, 270, 140);
  pointClose(worldAt(270, 140), anchor);
  const camera = state.camera;
  assert.equal(touch(canvas, "pointerdown", 22, 380, 180).defaultPrevented, true);
  assert.equal(state.camera, camera); assert.deepEqual([...captures], [11, 22]);
  touch(canvas, "pointermove", 22, 380, 180);
  assert.equal(state.camera, camera, "stationary second contact does not replace the pose");
}));

test("116 touch: simultaneous pan/pinch/twist preserves midpoint and both finger anchors across projection geometries", () => harness(({ canvas, interaction, worldAt }) => {
  interaction.setEnabled(true);
  for (const dpr of [1, 2]) for (const rotationRad of [0, Math.PI / 2, .713, 6.27]) {
    for (const [width, height, cssWidth, cssHeight] of [[1200, 700, 600, 350], [700, 1200, 500, 250]]) {
      canvas.width = state.widthPx = width * dpr; canvas.height = state.heightPx = height * dpr;
      canvas.rect = { left: 100, top: 50, width: cssWidth, height: cssHeight }; state.dpr = dpr;
      setCamera({ x: 271.25, y: -310.125, zoom: 1.25, rotationRad });
      pair(canvas);
      let points = [{ x: 260, y: 130 }, { x: 380, y: 180 }];
      const original = state.camera, firstAnchor = worldAt(260, 130), secondAnchor = worldAt(380, 180);
      const initial = points.map(p => clientToCanvas(canvas, p.x, p.y));
      const assignments = [];
      // Observe the state setter boundary: each valid move publishes one whole
      // pose, never an intermediate zoom-only or rotation-only replacement.
      let live = state.camera;
      Object.defineProperty(state, "camera", { configurable: true, get: () => live,
        set(value) { assignments.push(value); live = value; } });
      try {
        for (const [index, point] of [[0, { x: 240, y: 140 }], [1, { x: 420, y: 230 }]]) {
          const beforeMid = midpoint(...points), anchor = worldAt(beforeMid.x, beforeMid.y);
          points[index] = point;
          touch(canvas, "pointermove", index ? 22 : 11, point.x, point.y);
          const afterMid = midpoint(...points);
          pointClose(worldAt(afterMid.x, afterMid.y), anchor);
        }
        assert.equal(assignments.length, 2);
        for (const value of assignments) {
          assert.deepEqual(Object.keys(value).sort(), ["rotationRad", "x", "y", "zoom"]);
          assert.ok(Object.isFrozen(value)); assert.ok(Object.values(value).every(Number.isFinite));
        }
      } finally { Object.defineProperty(state, "camera", { configurable: true, enumerable: true, writable: true, value: live }); }
      pointClose(worldAt(points[0].x, points[0].y), firstAnchor);
      pointClose(worldAt(points[1].x, points[1].y), secondAnchor);
      const final = points.map(p => clientToCanvas(canvas, p.x, p.y));
      close(state.camera.zoom, original.zoom * Math.hypot(final[1].x - final[0].x, final[1].y - final[0].y)
        / Math.hypot(initial[1].x - initial[0].x, initial[1].y - initial[0].y));
      interaction.cancelDrag();
    }
  }
}));

test("116 touch: two-finger translation and clockwise twist move the visible scene in the fingers' direction", () => harness(({ canvas, interaction, worldAt }) => {
  interaction.setEnabled(true);
  pair(canvas); const camera = state.camera, anchor = worldAt(320, 155);
  touch(canvas, "pointermove", 11, 280, 140); touch(canvas, "pointermove", 22, 400, 190);
  close(state.camera.zoom, camera.zoom); close(state.camera.rotationRad, camera.rotationRad);
  pointClose(worldAt(340, 165), anchor);
  interaction.cancelDrag(); resetCamera();
  touch(canvas, "pointerdown", 11, 300, 150); touch(canvas, "pointerdown", 22, 400, 150);
  const markedWorld = worldAt(400, 150);
  touch(canvas, "pointermove", 22, 300, 250);
  close(state.camera.rotationRad, Math.PI / 2); close(state.camera.zoom, 1);
  pointClose(Spaces.simToScreen(markedWorld.x, markedWorld.y), clientToCanvas(canvas, 300, 250));
}));

test("116 touch: zoom clamps at CONFIG bounds while moving midpoint stays anchored and reversals recover", () => harness(({ canvas, interaction, worldAt }) => {
  interaction.setEnabled(true);
  for (const [zoom, x, expected] of [[90, 600, CONFIG.limits.camera.zoom.max], [.011, 310, CONFIG.limits.camera.zoom.min]]) {
    setCamera({ x: 100, y: -200, zoom, rotationRad: .5 });
    touch(canvas, "pointerdown", 11, 300, 150); touch(canvas, "pointerdown", 22, 400, 150);
    const anchor = worldAt(350, 150);
    touch(canvas, "pointermove", 22, x, 150);
    assert.equal(state.camera.zoom, expected); pointClose(worldAt((300 + x) / 2, 150), anchor);
    touch(canvas, "pointermove", 22, (300 + x) / 2, 150);
    if (expected === CONFIG.limits.camera.zoom.max) close(state.camera.zoom, expected / 2);
    else assert.equal(state.camera.zoom, expected);
    pointClose(worldAt((300 + (300 + x) / 2) / 2, 150), anchor);
    interaction.cancelDrag();
  }
}));

test("116 touch: wrapped pair angles cross both sides of pi without a full-turn discontinuity", () => harness(({ canvas, interaction }) => {
  interaction.setEnabled(true);
  for (const sign of [1, -1]) {
    setCamera({ x: 0, y: 0, zoom: 1, rotationRad: sign > 0 ? 6.28 : .003 });
    touch(canvas, "pointerdown", 11, 400, 160);
    touch(canvas, "pointerdown", 22, 300, 160 + sign);
    const before = state.camera;
    touch(canvas, "pointermove", 22, 300, 160 - sign);
    const expected = (before.rotationRad + sign * 2 * Math.atan(.01) + Math.PI * 2) % (Math.PI * 2);
    close(state.camera.rotationRad, expected); close(state.camera.zoom, before.zoom);
    interaction.cancelDrag();
  }
}));

test("116 touch: either finger can lift, pan without a jump and acquire a new second contact", () => harness(({ canvas, interaction, captures, worldAt }) => {
  interaction.setEnabled(true);
  for (const released of [11, 22]) {
    pair(canvas);
    touch(canvas, "pointermove", 11, 240, 140); touch(canvas, "pointermove", 22, 410, 200);
    const survivor = released === 11 ? 22 : 11, x = survivor === 11 ? 240 : 410, y = survivor === 11 ? 140 : 200;
    const camera = state.camera;
    touch(canvas, "pointerup", released, released === 11 ? 240 : 410, released === 11 ? 140 : 200, { buttons: 0 });
    assert.equal(state.camera, camera); assert.deepEqual([...captures], [survivor]);
    const anchor = worldAt(x, y);
    touch(canvas, "pointermove", survivor, x, y); assert.equal(state.camera, camera);
    touch(canvas, "pointermove", survivor, x + 10, y + 15); pointClose(worldAt(x + 10, y + 15), anchor);
    const panned = state.camera;
    touch(canvas, "pointerdown", 33, 350, 150); assert.equal(state.camera, panned); assert.equal(captures.size, 2);
    touch(canvas, "pointermove", 33, 360, 160); assert.notEqual(state.camera, panned);
    interaction.cancelDrag();
  }
}));

test("116 touch: cancellation, lost capture and missing buttons rebase either survivor", () => harness(({ canvas, interaction, captures, worldAt }) => {
  interaction.setEnabled(true);
  for (const id of [11, 22]) for (const name of ["pointercancel", "lostpointercapture", "pointermove"]) {
    pair(canvas); touch(canvas, "pointermove", 11, 270, 140); touch(canvas, "pointermove", 22, 390, 200);
    if (name === "lostpointercapture") captures.delete(id);
    const camera = state.camera;
    touch(canvas, name, id, 999, 999, { buttons: 0 }); assert.equal(state.camera, camera);
    const survivor = id === 11 ? 22 : 11, x = survivor === 11 ? 270 : 390, y = survivor === 11 ? 140 : 200;
    assert.deepEqual([...captures], [survivor]);
    const anchor = worldAt(x, y);
    touch(canvas, "pointermove", survivor, x + 15, y + 5); pointClose(worldAt(x + 15, y + 5), anchor);
    interaction.cancelDrag();
  }
}));

test("116 touch: third contacts and mixed pointer streams cannot acquire, move, end or replace owned touches", () => harness(({ canvas, interaction, captures }) => {
  interaction.setEnabled(true); pair(canvas);
  const camera = state.camera;
  for (const pointerType of ["touch", "mouse", "pen", undefined]) {
    for (const name of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) {
      assert.equal(touch(canvas, name, 33, 400, 220, { pointerType, isPrimary: true }).defaultPrevented, false);
      assert.equal(state.camera, camera); assert.deepEqual([...captures], [11, 22]);
    }
  }
  interaction.cancelDrag();
  for (const pointerType of ["mouse", "pen"]) {
    canvas.emit("pointerdown", { pointerType });
    assert.equal(touch(canvas, "pointerdown", 22, 380, 180).defaultPrevented, false);
    assert.deepEqual([...captures], [1]);
    canvas.emit("pointermove", { pointerType, clientX: 320 });
    assert.notEqual(state.camera, camera); interaction.cancelDrag();
  }
}));

test("116 touch: disabled mode never updates, captures or prevents touch defaults", () => harness(({ canvas, interaction, captures }) => {
  interaction.setEnabled(true); pair(canvas); interaction.setEnabled(false);
  const camera = state.camera;
  for (const id of [11, 22, 33]) for (const name of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) {
    assert.equal(touch(canvas, name, id, 350, 180).defaultPrevented, false);
    assert.equal(state.camera, camera); assert.equal(captures.size, 0);
  }
}));

test("116 touch: focus/visibility/mode/control cancellation releases all owned captures and recovers", () => harness(({ canvas, interaction, captures }) => {
  const exits = [() => canvas.emit("blur"), () => window.emit("blur"),
    () => { document.hidden = true; document.emit("visibilitychange"); document.hidden = false; },
    () => interaction.setEnabled(false), () => interaction.cancelInput(), () => interaction.cancelDrag(),
    ...["w", "ArrowRight", "Home", "c", "f", "Escape"].map(key => () => canvas.emit("keydown", { key })),
    () => canvas.emit("wheel")];
  for (const exit of exits) {
    interaction.setEnabled(true); pair(canvas); assert.equal(captures.size, 2); exit();
    assert.equal(captures.size, 0);
    const camera = state.camera;
    touch(canvas, "pointermove", 11, 300, 150); touch(canvas, "pointermove", 22, 400, 200); assert.equal(state.camera, camera);
    interaction.setEnabled(true); pair(canvas); touch(canvas, "pointermove", 22, 400, 200);
    assert.notEqual(state.camera, camera); interaction.cancelInput();
  }
}));

test("116 touch: acquiring touch clears held keyboard motion without per-frame gesture work", () => harness(({ canvas, interaction }) => {
  interaction.setEnabled(true); canvas.focus(); canvas.emit("keydown", { key: "w" });
  assert.equal(interaction.tick(.05), true);
  pair(canvas); const camera = state.camera;
  assert.equal(interaction.tick(.05), false); assert.equal(state.camera, camera);
}));

test("116 touch: coincident fingers and invalid geometry recover without partial pose changes or origin resets", () => harness(({ canvas, interaction, captures }) => {
  interaction.setEnabled(true); setCamera({ x: 789, y: -345, zoom: 2, rotationRad: .73 });
  touch(canvas, "pointerdown", 11, 300, 150); touch(canvas, "pointerdown", 22, 300, 150);
  const camera = state.camera;
  touch(canvas, "pointermove", 22, 320, 150); assert.equal(state.camera, camera);
  touch(canvas, "pointermove", 22, 330, 160); assert.notEqual(state.camera, camera);
  touch(canvas, "pointermove", 22, 300, 150); const collapsed = state.camera;
  touch(canvas, "pointermove", 22, 320, 150); assert.equal(state.camera, collapsed);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    touch(canvas, "pointermove", 22, invalid, 170); assert.equal(state.camera, collapsed); assert.equal(captures.size, 0);
    pair(canvas);
  }
  const valid = state.camera; canvas.rect.width = 0;
  touch(canvas, "pointermove", 22, 400, 180); assert.equal(state.camera, valid); assert.equal(captures.size, 0);
}));

test("116 touch: unrepresentable translation rejects the complete pose and can recover on the next update", () => harness(({ canvas, interaction }) => {
  interaction.setEnabled(true); state.world = { referenceSpanUnits: 1e308 };
  canvas.width = state.widthPx = 500; canvas.height = state.heightPx = 250;
  setCamera({ x: 1.7e308, y: 0, zoom: 1, rotationRad: 0 });
  touch(canvas, "pointerdown", 11, 340, 175); touch(canvas, "pointerdown", 22, 360, 175);
  const camera = state.camera;
  touch(canvas, "pointermove", 22, 345, 175.1);
  assert.equal(state.camera, camera, "no partial zoom/rotation before overflowing translation");
  state.world = createWorldGeometry(1000, 1000); setCamera({ x: 0, y: 0 });
  touch(canvas, "pointermove", 22, 210, 180); assert.notEqual(state.camera.zoom, camera.zoom);
}));

test("116 touch: capture failures, synchronous cancellation and release exceptions do not retain ownership", () => harness(({ canvas, interaction, captures }) => {
  interaction.setEnabled(true); touch(canvas, "pointerdown", 11, 260, 130);
  const capture = canvas.setPointerCapture, release = canvas.releasePointerCapture;
  canvas.setPointerCapture = () => { throw Error("capture unavailable"); };
  const camera = state.camera;
  assert.equal(touch(canvas, "pointerdown", 22, 380, 180).defaultPrevented, false);
  assert.deepEqual([...captures], [11]); assert.equal(state.camera, camera);
  canvas.setPointerCapture = capture; touch(canvas, "pointerdown", 22, 380, 180);
  captures.add(99); const released = [];
  canvas.releasePointerCapture = function (id) {
    released.push(id); release.call(this, id); interaction.cancelInput();
    touch(canvas, "pointerdown", 33, 350, 170);
  };
  interaction.cancelInput(); assert.deepEqual(released, [11, 22]); assert.deepEqual([...captures], [99]);
  canvas.releasePointerCapture = () => { throw Error("detached capture"); };
  pair(canvas); assert.doesNotThrow(() => interaction.cancelInput());
  const stopped = state.camera; touch(canvas, "pointermove", 11, 280, 150); assert.equal(state.camera, stopped);
  canvas.releasePointerCapture = release; captures.clear(); pair(canvas);
  touch(canvas, "pointermove", 22, 410, 190); assert.notEqual(state.camera, stopped);
}));

test("116 touch: canvas replacement and repeated disposal remove both captures and every listener", () => harness(({ canvas, interaction, captures }) => {
  interaction.setEnabled(true); pair(canvas);
  const replacement = { ...target(), width: canvas.width, height: canvas.height,
    getBoundingClientRect: () => canvas.rect, focus() { document.activeElement = this; },
    setPointerCapture(id) { captures.add(id); }, hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id) };
  state.canvas = replacement; assert.equal(interaction.init(), true);
  assert.equal(captures.size, 0); assert.equal(canvas.count("pointerdown"), 0); assert.equal(window.count("blur"), 1);
  const camera = state.camera;
  touch(canvas, "pointermove", 22, 400, 200); assert.equal(state.camera, camera);
  for (let i = 0; i < 10; i++) {
    pair(replacement); assert.equal(captures.size, 2);
    interaction.dispose(); interaction.dispose(); assert.equal(captures.size, 0);
    assert.equal(replacement.count("pointerdown"), 0); assert.equal(window.count("blur"), 0);
    interaction.init(); assert.equal(replacement.count("pointerdown"), 1);
  }
}));

test("116 touch: navigation preserves authored Scene, world, visual history, analysis, transport and recording owners", () => harness(({ canvas, interaction }) => {
  const prefs = structuredClone(preferences), scene = preferences.sceneCamera;
  const fields = ["world", "orbs", "bands", "audio", "source", "time", "recording"];
  const snapshots = fields.map(key => structuredClone(state[key])), identities = fields.map(key => state[key]);
  interaction.setEnabled(true); pair(canvas);
  touch(canvas, "pointermove", 11, 230, 150); touch(canvas, "pointermove", 22, 410, 210);
  touch(canvas, "pointerup", 11, 230, 150); touch(canvas, "pointermove", 22, 420, 220);
  assert.notDeepEqual(state.camera, CONFIG.camera.defaults);
  assert.deepEqual(preferences, prefs); assert.equal(preferences.sceneCamera, scene);
  fields.forEach((key, i) => { assert.equal(state[key], identities[i], key); assert.deepEqual(state[key], snapshots[i], key); });
}));

test("116 touch: degenerate projection skips the complete pair update and rebases before recovery", () => harness(({ canvas, interaction }) => {
  interaction.setEnabled(true); pair(canvas);
  setCamera({ x: 125, y: -375, zoom: 3, rotationRad: .52 });
  const camera = state.camera, width = state.widthPx;
  state.widthPx = 0; touch(canvas, "pointermove", 22, 410, 210); assert.equal(state.camera, camera);
  state.widthPx = width;
  touch(canvas, "pointermove", 22, 410, 210); assert.equal(state.camera, camera, "invalid interval does not accumulate motion");
  touch(canvas, "pointermove", 22, 420, 220); assert.notEqual(state.camera, camera);
}));

test("116 touch: mouse and pen keep captured pan across wheel zoom and retain primary-button admission", () => harness(({ canvas, interaction, captures, worldAt }) => {
  interaction.setEnabled(true);
  for (const pointerType of ["mouse", "pen"]) {
    canvas.emit("pointerdown", { pointerType, isPrimary: false }); assert.equal(captures.size, 0);
    canvas.emit("pointerdown", { pointerType }); canvas.emit("wheel", { deltaY: -50 });
    assert.deepEqual([...captures], [1]);
    const anchor = worldAt(300, 150);
    canvas.emit("pointermove", { pointerType, clientX: 320, clientY: 170 }); pointClose(worldAt(320, 170), anchor);
    canvas.emit("pointerup", { pointerType, clientX: 320, clientY: 170, buttons: 0 }); assert.equal(captures.size, 0);
  }
}));
