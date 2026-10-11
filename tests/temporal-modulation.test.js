import test from "node:test";
import assert from "node:assert/strict";
import { computeOrbSpeedOffset } from "../src/js/render/temporal-modulation.js";

const config = { enabled: true, targetOrbId: "ORB0", sourceChannel: "C", sourceFeature: "flux01", maxSpeedOffsetRadPerSec: 1.5 };
const features = { ready: true, channels: { C: { flux01: 0.6 }, L: { flux01: 0.1 } } };

test("the selected target Orb receives a bounded, source-specific transient offset", () => {
  assert.ok(Math.abs(computeOrbSpeedOffset({ id: "ORB0" }, features, config) - 0.9) < 1e-10);
  assert.equal(computeOrbSpeedOffset({ id: "ORB1" }, features, config), 0);
  assert.ok(Math.abs(computeOrbSpeedOffset({ id: "ORB0" }, features, { ...config, sourceChannel: "L" }) - 0.15) < 1e-10);
  assert.equal(computeOrbSpeedOffset({ id: "ORB0" }, { ready: true, channels: { C: { flux01: 5 } } }, config), 1.5);
});

test("disabled, unready, missing or invalid signals cause no modulation", () => {
  assert.equal(computeOrbSpeedOffset({ id: "ORB0" }, features, { ...config, enabled: false }), 0);
  assert.equal(computeOrbSpeedOffset({ id: "ORB0" }, { ready: false, channels: features.channels }, config), 0);
  assert.equal(computeOrbSpeedOffset({ id: "ORB0" }, { ready: true, channels: {} }, config), 0);
  assert.equal(computeOrbSpeedOffset({ id: "ORB0" }, { ready: true, channels: { C: { flux01: NaN } } }, config), 0);
  assert.equal(computeOrbSpeedOffset({ id: "ORB0" }, features, { ...config, maxSpeedOffsetRadPerSec: -10 }), 0);
});
