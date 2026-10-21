import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { TAU } from "../src/js/core/constants.js";
import { createCameraState } from "../src/js/core/camera-state.js";
import { worldToViewport, viewportToWorld } from "../src/js/core/camera-projection.js";
import { createWorldGeometry } from "../src/js/core/world-geometry.js";
import { state, setCamera, resetCamera } from "../src/js/core/state.js";

const defaults = createCameraState();
const world = createWorldGeometry(2400, 1600);
const viewport = { widthPx: 1200, heightPx: 800 };
function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (tolerance ${tolerance})`);
}
function pointNear(actual, expected, tolerance) {
  assert.ok(actual, "a finite projection exists");
  near(actual.x, expected.x, tolerance); near(actual.y, expected.y, tolerance);
}

test("116B: default camera exactly preserves the 116A centered short-side fit", () => {
  for (const geometry of [world, createWorldGeometry(1600, 2400), createWorldGeometry(1000, 1000)]) {
    for (const view of [viewport, { widthPx: 800, heightPx: 1200 }, { widthPx: 3210, heightPx: 1430 }]) {
      for (const [x, y] of [[0, 0], [250, -100], [-12345.678, 98765.432]]) {
        const scale = Math.min(view.widthPx, view.heightPx) / geometry.referenceSpanUnits;
        assert.deepEqual(worldToViewport(x, y, view, geometry, defaults), {
          x: view.widthPx * .5 + x * scale,
          y: view.heightPx * .5 - y * scale,
        });
      }
    }
  }
});

test("116B: camera translation is in world units and is unrestricted by world bounds", () => {
  const camera = createCameraState({ ...defaults, x: 50000, y: -75000 });
  assert.deepEqual(worldToViewport(camera.x, camera.y, viewport, world, camera), { x: 600, y: 400 });
  assert.deepEqual(worldToViewport(50200, -74900, viewport, world, camera), { x: 700, y: 350 });
  assert.deepEqual(viewportToWorld(700, 350, viewport, world, camera), { x: 50200, y: -74900 });
});

test("116B: positive camera rotation turns the stationary scene clockwise", () => {
  const camera = createCameraState({ ...defaults, rotationRad: Math.PI / 2 });
  pointNear(worldToViewport(200, 0, viewport, world, camera), { x: 600, y: 500 });
  pointNear(worldToViewport(0, 200, viewport, world, camera), { x: 700, y: 400 });
  pointNear(viewportToWorld(600, 500, viewport, world, camera), { x: 200, y: 0 });
  const negative = createCameraState({ ...defaults, rotationRad: -Math.PI / 2 });
  pointNear(worldToViewport(200, 0, viewport, world, negative), { x: 600, y: 300 });
});

test("116B: zoom and combined translation/rotation compose around camera position", () => {
  const camera = createCameraState({ x: 8000, y: -6000, zoom: 4, rotationRad: Math.PI / 2 });
  pointNear(worldToViewport(8200, -5900, viewport, world, camera), { x: 800, y: 800 });
  pointNear(viewportToWorld(800, 800, viewport, world, camera), { x: 8200, y: -5900 });
  for (const zoom of [CONFIG.limits.camera.zoom.min, 1, CONFIG.limits.camera.zoom.max]) {
    const c = createCameraState({ ...defaults, zoom });
    pointNear(worldToViewport(200, 100, viewport, world, c), { x: 600 + 100 * zoom, y: 400 - 50 * zoom });
  }
});

test("116B: forward/inverse round trips include non-square geometry, off-world points and supported zoom extremes", () => {
  let seed = 116;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (const geometry of [createWorldGeometry(1, 1000000), world, createWorldGeometry(4321.5, 123.75)]) {
    for (const view of [viewport, { widthPx: 300, heightPx: 1200 }, { widthPx: 2400, heightPx: 1600 }]) {
      for (const zoom of [CONFIG.limits.camera.zoom.min, .625, CONFIG.limits.camera.zoom.max]) {
        for (let i = 0; i < 25; i++) {
          const camera = createCameraState({ x: (random() - .5) * 1e6, y: (random() - .5) * 1e6,
            zoom, rotationRad: (random() - .5) * TAU * 10 });
          const x = (random() - .5) * 1e6, y = (random() - .5) * 1e6;
          const projected = worldToViewport(x, y, view, geometry, camera);
          const tolerance = 1e-10 * Math.max(1, Math.abs(x), Math.abs(y), Math.abs(camera.x),
            Math.abs(camera.y), geometry.referenceSpanUnits);
          pointNear(viewportToWorld(projected.x, projected.y, view, geometry, camera), { x, y }, tolerance);
          const screen = { x: random() * view.widthPx * 4 - view.widthPx, y: random() * view.heightPx * 4 - view.heightPx };
          const restored = viewportToWorld(screen.x, screen.y, view, geometry, camera);
          const screenTolerance = 1e-10 * Math.max(1, view.widthPx, view.heightPx,
            Math.abs(camera.x * Math.min(view.widthPx, view.heightPx) / geometry.referenceSpanUnits * zoom),
            Math.abs(camera.y * Math.min(view.widthPx, view.heightPx) / geometry.referenceSpanUnits * zoom));
          pointNear(worldToViewport(restored.x, restored.y, view, geometry, camera), screen, screenTolerance);
        }
      }
    }
  }
});

test("116B: backing resize/orientation and DPR scaling leave camera/world untouched", () => {
  const camera = createCameraState({ x: 200, y: -300, zoom: 3.5, rotationRad: .71 });
  const before = structuredClone(camera), geometry = structuredClone(world);
  const one = worldToViewport(100, 400, viewport, world, camera);
  const two = worldToViewport(100, 400, { widthPx: 2400, heightPx: 1600, dpr: 2 }, world, camera);
  pointNear(two, { x: one.x * 2, y: one.y * 2 });
  const portrait = { widthPx: 800, heightPx: 1200, dpr: 1 };
  const p = worldToViewport(100, 400, portrait, world, camera);
  pointNear(viewportToWorld(p.x, p.y, portrait, world, camera), { x: 100, y: 400 });
  assert.deepEqual(camera, before); assert.deepEqual(world, geometry);
});

test("116B: zero-size viewports collapse only the forward view and never fabricate an inverse origin", () => {
  for (const view of [{ widthPx: 0, heightPx: 0 }, { widthPx: 0, heightPx: 600 }, { widthPx: 800, heightPx: 0 }]) {
    const camera = createCameraState({ x: 100, y: -200, zoom: 100, rotationRad: .5 });
    assert.deepEqual(worldToViewport(500, 700, view, world, camera), { x: view.widthPx / 2, y: view.heightPx / 2 });
    assert.equal(viewportToWorld(0, 0, view, world, camera), null);
  }
});

test("116B: malformed viewport, coordinates, world and camera inputs return null", () => {
  for (const view of [null, {}, { widthPx: -1, heightPx: 800 }, { widthPx: 1200, heightPx: NaN },
    { widthPx: Infinity, heightPx: 800 }, { widthPx: "1200", heightPx: 800 }]) {
    assert.equal(worldToViewport(0, 0, view, world, defaults), null);
    assert.equal(viewportToWorld(0, 0, view, world, defaults), null);
  }
  for (const value of [NaN, Infinity, -Infinity, null, "10", undefined]) {
    for (const operation of [worldToViewport, viewportToWorld]) {
      assert.equal(operation(value, 0, viewport, world, defaults), null);
      assert.equal(operation(0, value, viewport, world, defaults), null);
      assert.equal(operation(0, 0, viewport, { referenceSpanUnits: value }, defaults), null);
      for (const key of ["x", "y", "zoom", "rotationRad"]) {
        assert.equal(operation(0, 0, viewport, world, { ...defaults, [key]: value }), null);
      }
    }
  }
  for (const zoom of [0, -.1, CONFIG.limits.camera.zoom.min / 2, CONFIG.limits.camera.zoom.max * 2]) {
    assert.equal(worldToViewport(0, 0, viewport, world, { ...defaults, zoom }), null);
    assert.equal(viewportToWorld(0, 0, viewport, world, { ...defaults, zoom }), null);
  }
});

test("116B: unrepresentable arithmetic returns null rather than NaN or Infinity", () => {
  const huge = createCameraState({ ...defaults, x: -Number.MAX_VALUE });
  assert.equal(worldToViewport(Number.MAX_VALUE, 0, viewport, world, huge), null);
  assert.equal(worldToViewport(1, 0, viewport, { referenceSpanUnits: Number.MIN_VALUE }, defaults), null);
  assert.equal(viewportToWorld(1, 0, viewport, { referenceSpanUnits: Number.MIN_VALUE }, defaults), null);
  const tiny = { widthPx: Number.MIN_VALUE, heightPx: Number.MIN_VALUE };
  assert.equal(worldToViewport(0, 0, tiny, world, defaults), null);
  assert.equal(viewportToWorld(0, 0, tiny, world, defaults), null);
  assert.equal(viewportToWorld(Number.MAX_VALUE, Number.MAX_VALUE, viewport, world,
    createCameraState({ ...defaults, zoom: CONFIG.limits.camera.zoom.min })), null);
});

test("116B: runtime camera updates are atomic, frozen, validated and deterministically reset", () => {
  const saved = state.camera;
  try {
    assert.deepEqual(resetCamera(), CONFIG.camera.defaults);
    const moved = setCamera({ x: 9000000, y: -7000000, rotationRad: -Math.PI / 2 });
    assert.deepEqual(moved, { x: 9000000, y: -7000000, zoom: 1, rotationRad: 3 * Math.PI / 2 });
    assert.ok(Object.isFrozen(moved));
    assert.throws(() => { moved.zoom = 20; }, TypeError);
    setCamera({ zoom: CONFIG.limits.camera.zoom.min });
    assert.deepEqual(moved, { x: 9000000, y: -7000000, zoom: 1, rotationRad: 3 * Math.PI / 2 });
    assert.equal(setCamera({ rotationRad: Number.MAX_VALUE }).rotationRad < TAU, true);
    assert.equal(setCamera({ rotationRad: -Number.MIN_VALUE }).rotationRad, 0);
    for (const patch of [null, [], 1, undefined, { unknown: 1 }, { x: NaN }, { y: Infinity },
      { rotationRad: "1" }, { zoom: 0 }, { zoom: 101 }, { x: 123, y: undefined }]) {
      const before = state.camera;
      assert.throws(() => setCamera(patch), RangeError);
      assert.equal(state.camera, before, "a rejected update preserves the authoritative snapshot");
    }
    for (let i = 0; i < 3; i++) {
      setCamera({ x: i * 1e10, y: -i * 1e10, zoom: 100, rotationRad: 18 });
      assert.deepEqual(resetCamera(), CONFIG.camera.defaults);
    }
    assert.ok(Object.isFrozen(CONFIG.camera.defaults));
    assert.equal(Object.hasOwn(CONFIG.defaults, "camera"), false);
  } finally { state.camera = saved; }
});
