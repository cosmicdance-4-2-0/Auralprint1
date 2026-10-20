import test from "node:test";
import assert from "node:assert/strict";
import { createWorldGeometry, worldUnitsFromFraction, worldPointFromFractions } from "../src/js/core/world-geometry.js";

test("116A: world dimensions form a frozen reference independent of viewport shape", () => {
  const landscape = createWorldGeometry(2400, 1600);
  const portrait = createWorldGeometry(1600, 2400);
  assert.deepEqual(landscape, { widthUnits: 2400, heightUnits: 1600, referenceSpanUnits: 1600 });
  assert.equal(portrait.referenceSpanUnits, landscape.referenceSpanUnits);
  assert.ok(Object.isFrozen(landscape));
  assert.equal(worldUnitsFromFraction(landscape, .25), 400);
  assert.equal(worldUnitsFromFraction(portrait, .25), 400);
});

test("116A: zero, negative, infinite and non-numeric world dimensions are rejected", () => {
  for (const dimensions of [[0, 100], [-1, 100], [100, 0], [100, -1],
    [Number.NaN, 100], [Infinity, 100], [100, -Infinity], ["100", 100], [null, 100]]) {
    assert.throws(() => createWorldGeometry(...dimensions), RangeError);
  }
});

test("116A: world fractions preserve Orb/Ring reference semantics without clipping", () => {
  const world = createWorldGeometry(1920, 1080);
  assert.equal(worldUnitsFromFraction(world, .4), 432);
  assert.deepEqual(worldPointFromFractions(world, -.95, .5), { xSim: -1026, ySim: 540 });
  // This is outside the nominal half-width and half-height. The world is
  // reference geometry, not a physical boundary.
  assert.deepEqual(worldPointFromFractions(world, 2, -1), { xSim: 2160, ySim: -1080 });
  assert.equal(worldUnitsFromFraction(world, -1.25), -1350);
});

test("116A: malformed fractions and overflowing coordinates fail explicitly", () => {
  const world = createWorldGeometry(1000, 1000);
  for (const f of [Number.NaN, Infinity, -Infinity, undefined, "0.2"]) {
    assert.throws(() => worldUnitsFromFraction(world, f), RangeError);
  }
  assert.throws(() => worldUnitsFromFraction({}, 1), RangeError);
  assert.throws(() => worldUnitsFromFraction(null, 1), RangeError);
  assert.throws(() => worldPointFromFractions(world, 0, Infinity), RangeError);
  assert.throws(() => worldUnitsFromFraction(createWorldGeometry(1e308, 1e308), 2), RangeError);
});

test("116A: neither camera nor canvas dimensions participate in world geometry", () => {
  const world = createWorldGeometry(1024, 1024);
  const x = worldPointFromFractions(world, .75, -.25);
  // Viewport dimensions will be supplied to a later projection stage;
  // changing them has no input path into the world geometry module.
  for (const viewport of [{ widthPx: 640, heightPx: 480, dpr: 1 },
    { widthPx: 3840, heightPx: 2160, dpr: 2 }]) {
    assert.ok(viewport.widthPx > 0 && viewport.dpr > 0);
    assert.deepEqual(worldPointFromFractions(world, .75, -.25), x);
  }
});
