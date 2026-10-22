import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { computeCameraFit } from "../src/js/core/camera-fit.js";
import { worldToViewport } from "../src/js/core/camera-projection.js";

const world = Object.freeze({ referenceSpanUnits: 1000 });
const viewport = Object.freeze({ widthPx: 1200, heightPx: 800, dpr: 1 });
const zoomLimits = CONFIG.limits.camera.zoom;
const rect = Object.freeze({ type: "rect", minX: -1200, minY: -500, maxX: 1200, maxY: 500 });
const options = { primitives: [rect], viewport, world, rotationRad: 0, zoomLimits, paddingCssPx: 20 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
function visible(result, x, y, radiusCssPx = 0, outerPadding = options.paddingCssPx, view = viewport) {
  const point = worldToViewport(x, y, view, world, result.camera);
  assert.ok(point);
  const cssX = point.x / view.dpr, cssY = point.y / view.dpr;
  assert.ok(cssX - radiusCssPx >= outerPadding - 1e-9);
  assert.ok(cssX + radiusCssPx <= view.widthPx / view.dpr - outerPadding + 1e-9);
  assert.ok(cssY - radiusCssPx >= outerPadding - 1e-9);
  assert.ok(cssY + radiusCssPx <= view.heightPx / view.dpr - outerPadding + 1e-9);
}

test("camera fit: exact nominal non-square rectangle fits landscape and portrait viewports", () => {
  const landscape = computeCameraFit(options);
  assert.equal(landscape.fits, true); assert.equal(landscape.limited, false); assert.equal(landscape.reason, null);
  close(landscape.camera.zoom, (1160 / 2400) / .8);
  close(landscape.camera.x, 0); close(landscape.camera.y, 0);
  for (const x of [-1200, 1200]) for (const y of [-500, 500]) visible(landscape, x, y);
  const portraitViewport = { widthPx: 800, heightPx: 1200, dpr: 1 };
  const portrait = computeCameraFit({ ...options, viewport: portraitViewport });
  close(portrait.camera.zoom, (760 / 2400) / .8);
  for (const x of [-1200, 1200]) for (const y of [-500, 500]) visible(portrait, x, y, 0, 20, portraitViewport);
});

test("camera fit: preserves rotation and exactly fits rotated rectangle extents", () => {
  for (const rotationRad of [Math.PI / 2, Math.PI, -.731]) {
    const result = computeCameraFit({ ...options, rotationRad });
    assert.equal(result.camera.rotationRad, rotationRad);
    const width = 2400 * Math.abs(Math.cos(rotationRad)) + 1000 * Math.abs(Math.sin(rotationRad));
    const height = 2400 * Math.abs(Math.sin(rotationRad)) + 1000 * Math.abs(Math.cos(rotationRad));
    close(result.camera.zoom, Math.min(1160 / width, 760 / height) / .8);
    for (const x of [-1200, 1200]) for (const y of [-500, 500]) visible(result, x, y);
  }
});

test("camera fit: union includes off-world circles, points and nominal rectangle with conservative CSS mark padding", () => {
  const primitives = [rect,
    { type: "circle", x: 2400, y: -750, radius: 80, paddingCssPx: 6 },
    { type: "point", x: -1500, y: 1700, paddingCssPx: 12 }];
  const result = computeCameraFit({ ...options, primitives, rotationRad: .47 });
  assert.equal(result.fits, true); assert.equal(result.bounds.marginCssPx, 32);
  for (const x of [-1200, 1200]) for (const y of [-500, 500]) visible(result, x, y);
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    visible(result, 2400 + Math.cos(angle) * 80, -750 + Math.sin(angle) * 80, 6);
  }
  visible(result, -1500, 1700, 12);
});

test("camera fit: circle stays circular under camera rotation instead of rotating an inflated square", () => {
  const primitives = [{ type: "circle", x: 5000, y: -3400, radius: 200, paddingCssPx: 5 }];
  for (const rotationRad of [0, Math.PI / 4, Math.PI / 2, 2.1]) {
    const result = computeCameraFit({ ...options, primitives, rotationRad });
    close(result.camera.x, 5000); close(result.camera.y, -3400);
    close(result.camera.zoom, (750 / 400) / .8);
    close(result.bounds.maxX - result.bounds.minX, 400);
    close(result.bounds.maxY - result.bounds.minY, 400);
  }
});

test("camera fit: DPR changes preserve CSS margins and the same world camera", () => {
  const primitives = [rect, { type: "point", x: 1700, y: -900, paddingCssPx: 9 }];
  const base = computeCameraFit({ ...options, primitives, rotationRad: .825 });
  for (const dpr of [1.25, 2, 3]) {
    const view = { widthPx: viewport.widthPx * dpr, heightPx: viewport.heightPx * dpr, dpr };
    const result = computeCameraFit({ ...options, primitives, rotationRad: .825, viewport: view });
    assert.deepEqual(result, base);
    visible(result, 1700, -900, 9, 20, view);
  }
});

test("camera fit: changing world reference span changes zoom without changing fitted presentation", () => {
  const base = computeCameraFit(options);
  for (const referenceSpanUnits of [100, 2400, 10000]) {
    const geometry = { referenceSpanUnits };
    const result = computeCameraFit({ ...options, world: geometry });
    close(result.camera.zoom, base.camera.zoom * referenceSpanUnits / 1000);
    const a = worldToViewport(1200, 500, viewport, world, base.camera);
    const b = worldToViewport(1200, 500, viewport, geometry, result.camera);
    close(a.x, b.x); close(a.y, b.y);
  }
});

test("camera fit: minimum zoom reports an incomplete fit and maximum zoom reports its framing limit", () => {
  const minimum = computeCameraFit({ ...options, primitives: [{ type: "rect", minX: -1e7, maxX: 1e7, minY: -1e7, maxY: 1e7 }] });
  assert.equal(minimum.camera.zoom, zoomLimits.min); assert.equal(minimum.limited, true);
  assert.equal(minimum.fits, false); assert.equal(minimum.reason, "minimum-zoom");
  const maximum = computeCameraFit({ ...options, primitives: [{ type: "circle", x: 1200, y: -330, radius: .001 }] });
  assert.equal(maximum.camera.zoom, zoomLimits.max); assert.equal(maximum.limited, true);
  assert.equal(maximum.fits, true); assert.equal(maximum.reason, "maximum-zoom");
  close(maximum.camera.x, 1200); close(maximum.camera.y, -330);
});

test("camera fit: screen marks consuming the viewport report that no zoom can provide margins", () => {
  const result = computeCameraFit({ ...options, primitives: [{ type: "point", x: 1500, y: -2500, paddingCssPx: 390 }] });
  assert.equal(result.reason, "screen-margin"); assert.equal(result.fits, false); assert.equal(result.limited, true);
  assert.equal(result.camera.zoom, zoomLimits.min); close(result.camera.x, 1500); close(result.camera.y, -2500);
});

test("camera fit: a point or zero-radius circle centers at maximum zoom", () => {
  for (const primitive of [{ type: "point", x: 75, y: -123 }, { type: "circle", x: 75, y: -123, radius: 0 }]) {
    const result = computeCameraFit({ ...options, primitives: [primitive], rotationRad: -.73 });
    close(result.camera.x, 75); close(result.camera.y, -123);
    assert.equal(result.camera.zoom, zoomLimits.max); assert.equal(result.fits, true);
  }
});

test("camera fit: malformed or collapsed inputs and unrepresentable arithmetic return null without mutation", () => {
  const input = structuredClone(options), original = structuredClone(input);
  const invalid = [undefined, null, {}, { ...options, primitives: [] }, { ...options, primitives: null },
    ...[0, -1, NaN, Infinity, "800"].flatMap(value => [
      { ...options, viewport: { ...viewport, widthPx: value } },
      { ...options, viewport: { ...viewport, heightPx: value } },
      { ...options, viewport: { ...viewport, dpr: value } },
      { ...options, world: { referenceSpanUnits: value } },
    ]),
    { ...options, rotationRad: NaN }, { ...options, paddingCssPx: -1 }, { ...options, paddingCssPx: Infinity },
    { ...options, zoomLimits: { min: 0, max: 1 } }, { ...options, zoomLimits: { min: 2, max: 1 } },
    ...[null, {}, { type: "point", x: NaN, y: 0 }, { type: "circle", x: 0, y: 0, radius: -1 },
      { type: "point", x: 0, y: 0, paddingCssPx: -1 },
      { type: "rect", minX: 1, minY: 0, maxX: 0, maxY: 1 },
      { type: "rect", minX: -Number.MAX_VALUE, minY: 0, maxX: Number.MAX_VALUE, maxY: 1 },
    ].map(primitive => ({ ...options, primitives: [primitive] })),
    { ...options, viewport: { widthPx: Number.MIN_VALUE, heightPx: Number.MIN_VALUE, dpr: 1 }, world: { referenceSpanUnits: Number.MAX_VALUE } },
  ];
  for (const value of invalid) assert.equal(computeCameraFit(value), null);
  assert.ok(computeCameraFit(input)); assert.deepEqual(input, original);
  assert.deepEqual(world, { referenceSpanUnits: 1000 });
});


test("camera fit: accepts a single-pass drawable iterator without materializing retained geometry", () => {
  let visits = 0;
  function* primitives() {
    visits++; yield rect;
    visits++; yield { type: "point", x: 2000, y: -1000, paddingCssPx: 8 };
  }
  const expected = computeCameraFit({ ...options, primitives: [rect, { type: "point", x: 2000, y: -1000, paddingCssPx: 8 }] });
  assert.deepEqual(computeCameraFit({ ...options, primitives: primitives() }), expected);
  assert.equal(visits, 2);
  assert.equal(computeCameraFit({ ...options, primitives: (function* () {})() }), null);
});
