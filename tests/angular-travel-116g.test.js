import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { TAU } from "../src/js/core/constants.js";
import { simulationDeltaSec, visualMotionDeltaSec } from "../src/js/core/timing.js";
import { duplicateOrb } from "../src/js/core/orb-collection.js";
import { Orb } from "../src/js/render/orb.js";
import { ParticleGovernor } from "../src/js/render/particle-governor.js";
import { TrailSystem } from "../src/js/render/trail-system.js";
import { createOrbVisualizer, createVisualizerRuntime } from "../src/js/render/visualizer-runtime.js";

const rgb = { r: .2, g: .4, b: .6 };
function definition(mode = "angular", changes = {}) {
  const def = structuredClone(CONFIG.defaults.orbs[0]);
  def.id = "travel";
  def.trace.lengthMode = mode;
  def.particles = { ...def.particles, emitPerSecond: 60, minPlacementDistanceUnits: 0, ttlSec: 600 };
  return { ...def, ...changes };
}
function step(orb, motionDtSec, nowSec = 1, dtSec = 1 / 60) {
  orb.step(dtSec, nowSec, null, null, 0, null, motionDtSec);
}
function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}
const frame = { dtSec: 1 / 60, motionDtSec: .1, nowSec: 1, simPaused: false,
  analysisFrame: { ready: false, spectrum: { dominantIndex: 0 } } };

test("116G travel: zero motion and discarded/nonfinite deltas never advance travel or phase", () => {
  const orb = new Orb(definition());
  try {
    const angle = orb.angleRad, epoch = orb.angularTravelEpoch;
    for (const delta of [0, visualMotionDeltaSec(.501), visualMotionDeltaSec(3600), NaN, Infinity, -Infinity]) {
      step(orb, delta);
      assert.equal(orb.angularTravelRad, 0);
      assert.equal(orb.angleRad, angle);
      assert.equal(orb.angularTravelEpoch, epoch);
    }
    orb.motion = { angularSpeedRadPerSec: 0 };
    step(orb, .5);
    assert.equal(orb.angularTravelRad, 0);
    assert.equal(orb.angleRad, angle);
  } finally { orb.trail.dispose(); }
});

for (const chirality of [-1, 1]) test(`116G travel: chirality ${chirality}, wraparound and multiple rotations count actual motion`, () => {
  const def = definition("angular", { chirality, startAngleRad: 359 * Math.PI / 180,
    motion: { angularSpeedRadPerSec: Math.PI / 180 } });
  const orb = new Orb(def);
  try {
    step(orb, 1);
    close(orb.angularTravelRad, Math.PI / 180);
    close(orb.angleRad, chirality === 1 ? 0 : 358 * Math.PI / 180);
    // Legacy direct callers can supply an accepted finite multi-revolution step.
    orb.motion = { angularSpeedRadPerSec: TAU };
    step(orb, 3);
    close(orb.angularTravelRad, Math.PI / 180 + 3 * TAU);
    close(orb.angleRad, chirality === 1 ? 0 : 358 * Math.PI / 180);
    assert.equal(orb.trail.particles.at(-1).angularTravelRad, orb.angularTravelRad);
  } finally { orb.trail.dispose(); }
});

test("116G travel: reversals and speed changes affect future distance without cancelling earlier motion", () => {
  const orb = new Orb(definition("angular", { chirality: 1, motion: { angularSpeedRadPerSec: 2 } }));
  try {
    step(orb, .25);
    const epoch = orb.angularTravelEpoch;
    orb.chirality = -1;
    step(orb, .25);
    close(orb.angleRad, orb.startAngleRad);
    assert.equal(orb.angularTravelRad, 1);
    orb.motion = { angularSpeedRadPerSec: 3 };
    step(orb, .5);
    assert.equal(orb.angularTravelRad, 2.5);
    assert.equal(orb.angularTravelEpoch, epoch);
  } finally { orb.trail.dispose(); }
});

test("116G travel: accepted motion uses visible elapsed time, while emission retains its independent bound", () => {
  const orb = new Orb(definition("angular", { chirality: 1, motion: { angularSpeedRadPerSec: 2 } }));
  try {
    let expectedTravel = 0, expectedCount = 0, now = 0;
    for (const elapsed of [.1, .5, .501, 120, 1 / 60]) {
      now += elapsed;
      const motionDtSec = visualMotionDeltaSec(elapsed);
      // Production rebases emission after a motion discontinuity as well.
      const dtSec = motionDtSec ? simulationDeltaSec(elapsed) : 0;
      step(orb, motionDtSec, now, dtSec);
      expectedTravel += 2 * motionDtSec;
      expectedCount += 60 * dtSec;
      close(orb.angularTravelRad, expectedTravel);
    }
    assert.equal(orb.trail.particles.length, Math.floor(expectedCount));
  } finally { orb.trail.dispose(); }
});

test("116G travel: pause freezes angular window while retained particles continue real-time expiry", () => {
  const orb = new Orb(definition("angular", { particles: { ...definition().particles, ttlSec: .1 } }));
  const visualizer = createOrbVisualizer(orb);
  try {
    visualizer.update(frame);
    const travel = orb.angularTravelRad, phase = orb.angleRad, epoch = orb.angularTravelEpoch;
    assert.equal(orb.trail.particles.length, 1);
    visualizer.update({ ...frame, nowSec: 2, motionDtSec: .5, simPaused: true });
    assert.equal(orb.angularTravelRad, travel);
    assert.equal(orb.angleRad, phase);
    assert.equal(orb.angularTravelEpoch, epoch);
    assert.equal(orb.trail.particles.length, 0);
  } finally { orb.trail.dispose(); }
});

test("116G travel: authored phase edits and resetPhase alone do not count a traversal or erase history", () => {
  const def = definition(), orb = new Orb(def);
  try {
    step(orb, .2);
    const phase = orb.angleRad, travel = orb.angularTravelRad, epoch = orb.angularTravelEpoch;
    const tail = orb.trail.particles.tail;
    orb.syncFromDef({ ...def, startAngleRad: Math.PI });
    assert.equal(orb.angleRad, phase);
    assert.equal(orb.angularTravelRad, travel);
    assert.equal(orb.angularTravelEpoch, epoch);
    assert.equal(orb.trail.particles.tail, tail);
    orb.resetPhase();
    assert.equal(orb.angleRad, Math.PI);
    assert.equal(orb.angularTravelRad, travel);
    assert.equal(orb.angularTravelEpoch, epoch);
    assert.equal(orb.trail.particles.tail, tail);
  } finally { orb.trail.dispose(); }
});

for (const reason of ["visuals", "track"]) test(`116G travel: ${reason} reset starts a fresh travel epoch and preserves existing phase semantics`, () => {
  const orb = new Orb(definition()), visualizer = createOrbVisualizer(orb);
  try {
    visualizer.update(frame);
    const phase = orb.angleRad, epoch = orb.angularTravelEpoch;
    visualizer.reset(reason);
    assert.equal(orb.angleRad, reason === "visuals" ? orb.startAngleRad : phase);
    assert.equal(orb.angularTravelRad, 0);
    assert.notEqual(orb.angularTravelEpoch, epoch);
    assert.equal(orb.trail.particles.length, 0);
    step(orb, .1, 2);
    assert.equal(orb.trail.particles.at(-1).angularTravelEpoch, orb.angularTravelEpoch);
  } finally { orb.trail.dispose(); }
});

test("116G stamps: count-only particles keep their original shape, retention, spacing and emission", () => {
  const count = new Orb(definition("count")), angular = new Orb(definition());
  try {
    for (let i = 0; i < 120; i++) {
      step(count, 1 / 60, i / 60);
      step(angular, 1 / 60, i / 60);
    }
    assert.equal(count.trail.particles.length, angular.trail.particles.length);
    assert.equal(count.angularTravelRad, angular.angularTravelRad);
    assert.equal(count.angularTravelEpoch, null);
    const countParticles = Array.from(count.trail.particles);
    const angularParticles = Array.from(angular.trail.particles);
    for (let i = 0; i < countParticles.length; i++) {
      assert.deepEqual(Object.keys(countParticles[i]), ["xSim", "ySim", "bornSec", "rgbStart"]);
      const { angularTravelRad, angularTravelEpoch, ...original } = angularParticles[i];
      assert.deepEqual(original, countParticles[i]);
      assert.equal(angularTravelEpoch, angular.angularTravelEpoch);
      assert.ok(Number.isFinite(angularTravelRad));
    }
    assert.deepEqual(count.trail.governor.getStats(), angular.trail.governor.getStats());
  } finally { count.trail.dispose(); angular.trail.dispose(); }
});

test("116G stamps: count → angular → count → angular never invents metadata or reconnects old epochs", () => {
  const def = definition("count"), orb = new Orb(def);
  try {
    step(orb, .1);
    const unstamped = orb.trail.particles.at(-1), travel = orb.angularTravelRad;
    orb.syncFromDef({ ...def, trace: { ...def.trace, lengthMode: "angular" } });
    const firstEpoch = orb.angularTravelEpoch;
    assert.equal(orb.angularTravelRad, travel);
    assert.equal("angularTravelRad" in unstamped, false);
    step(orb, .1, 2);
    const stamped = orb.trail.particles.at(-1);
    assert.equal(stamped.angularTravelEpoch, firstEpoch);
    orb.syncFromDef(def);
    assert.equal(orb.angularTravelEpoch, null);
    step(orb, .1, 3);
    assert.equal("angularTravelRad" in orb.trail.particles.at(-1), false);
    orb.syncFromDef({ ...def, trace: { ...def.trace, lengthMode: "angular" } });
    assert.notEqual(orb.angularTravelEpoch, firstEpoch);
    step(orb, .1, 4);
    assert.equal(stamped.angularTravelEpoch, firstEpoch);
    assert.equal(orb.trail.particles.at(-1).angularTravelEpoch, orb.angularTravelEpoch);
    assert.equal(orb.trail.particles.length, 4);
  } finally { orb.trail.dispose(); }
});

test("116G stamps: shared governor admits the exact deferred emission snapshot across later mutation and mode changes", () => {
  const def = definition(), orb = new Orb(def), governor = new ParticleGovernor();
  orb.trail.setGovernor(governor); governor.setTrails([orb.trail]);
  try {
    governor.beginFrame();
    step(orb, .2);
    const sampled = { travel: orb.angularTravelRad, epoch: orb.angularTravelEpoch, x: orb.xSim, y: orb.ySim };
    orb.angularTravelRad = 123;
    orb.xSim = 999; orb.ySim = 888;
    orb.syncFromDef({ ...def, trace: { ...def.trace, lengthMode: "count" } });
    orb.syncFromDef(def);
    governor.finishFrame();
    const p = orb.trail.particles.at(-1);
    assert.equal(p.angularTravelRad, sampled.travel);
    assert.equal(p.angularTravelEpoch, sampled.epoch);
    assert.notEqual(p.angularTravelEpoch, orb.angularTravelEpoch);
    assert.equal(p.xSim, sampled.x); assert.equal(p.ySim, sampled.y);
    assert.equal(orb.trail.emission.angularTravelEpoch, null);
    assert.equal(orb.trail.emission.angularTravelRad, 0);
  } finally { governor.dispose(); }
});

test("116G stamps: governor transfers preserve stamps, missing stamps and fractional state", () => {
  const orb = new Orb(definition()), governor = new ParticleGovernor();
  try {
    step(orb, .2);
    orb.trail.emitAt(7, 8, 2, rgb);
    orb.trail.emitAccumulator = .375;
    const before = Array.from(orb.trail.particles);
    orb.trail.setGovernor(governor); governor.setTrails([orb.trail]);
    const after = Array.from(orb.trail.particles);
    assert.deepEqual(after, before);
    assert.equal(after[0].angularTravelEpoch, before[0].angularTravelEpoch);
    assert.equal("angularTravelRad" in after[1], false);
    assert.equal(orb.trail.emitAccumulator, .375);
    assert.equal(governor.activeParticles, 2);
    orb.trail.reset();
    assert.equal(governor.activeParticles, 0);
    assert.equal(orb.trail.emission.angularTravelEpoch, null);
  } finally { governor.dispose(); orb.trail.dispose(); }
});

test("116G stamps: invalid optional stamps are not retained and rejected emissions create no metadata registry", () => {
  const trail = new TrailSystem(), epoch = {};
  try {
    for (const value of [NaN, Infinity, -Infinity, -1, undefined, "1"]) trail.emitAt(0, 0, 1, rgb, value, epoch);
    for (const p of trail.particles) assert.equal("angularTravelRad" in p, false);
    trail.governor.applyPolicy({ maxEmissionsPerFrame: 1, maxActiveParticles: 0 });
    assert.equal(trail.emitAt(0, 0, 1, rgb, 1, epoch), false);
    assert.equal(trail.particles.length, 0);
  } finally { trail.dispose(); }
});

test("116G lifecycle: reconciliation preserves survivors; duplication, removal and disposal own no extra history", () => {
  const defs = [definition()], orb = new Orb(defs[0]);
  const visualizers = createVisualizerRuntime();
  visualizers.rebuild([orb]);
  try {
    visualizers.update(frame);
    const epoch = orb.angularTravelEpoch, travel = orb.angularTravelRad, tail = orb.trail.particles.tail;
    const copyDef = duplicateOrb(defs, orb.id), copy = new Orb(copyDef);
    visualizers.reconcile([copy, orb]);
    assert.equal(orb.angularTravelEpoch, epoch);
    assert.equal(orb.angularTravelRad, travel);
    assert.equal(orb.trail.particles.tail, tail);
    assert.equal(copy.angularTravelRad, 0);
    assert.notEqual(copy.angularTravelEpoch, epoch);
    assert.equal(copy.trail.particles.length, 0);
    visualizers.update({ ...frame, nowSec: 2 });
    visualizers.reconcile([copy]);
    assert.equal(orb.trail.particles.length, 0);
    assert.equal(orb.trail.emission.angularTravelEpoch, null);
    assert.equal(visualizers.getParticleStats().activeParticles, copy.trail.particles.length);
    visualizers.dispose();
    assert.equal(copy.trail.particles.length, 0);
    assert.equal(copy.trail.emission.angularTravelEpoch, null);
    assert.equal(visualizers.getParticleStats().activeParticles, 0);
  } finally { visualizers.dispose(); orb.trail.dispose(); }
});

test("116G precision: compensated summation preserves repeated tiny accepted increments", () => {
  const orb = new Orb(definition("angular", { motion: { angularSpeedRadPerSec: 1 } }));
  try {
    step(orb, 1e6, 0, 0);
    for (let i = 0; i < 10000; i++) step(orb, 1e-12, 0, 0);
    assert.equal(orb.angularTravelRad, 1e6 + 1e-8);
    assert.ok(Number.isFinite(orb.angularTravelCompensation));
  } finally { orb.trail.dispose(); }
});

test("116G precision: finite-domain rebases preserve physical phase and particles without inventing old travel", () => {
  const orb = new Orb(definition("angular", { chirality: 1, motion: { angularSpeedRadPerSec: 1 } }));
  try {
    step(orb, .1);
    const oldParticle = orb.trail.particles.at(-1), oldEpoch = orb.angularTravelEpoch;
    orb.angularTravelRad = Math.sqrt(Number.MAX_SAFE_INTEGER);
    const phase = orb.angleRad;
    step(orb, .2, 2);
    close(orb.angleRad, phase + .2);
    assert.equal(orb.angularTravelRad, 0);
    assert.notEqual(orb.angularTravelEpoch, oldEpoch);
    assert.equal(orb.trail.particles.at(0), oldParticle);
    assert.equal(oldParticle.angularTravelEpoch, oldEpoch);
    assert.equal(orb.trail.particles.at(-1).angularTravelEpoch, orb.angularTravelEpoch);
    for (const corrupt of [Infinity, NaN, -Number.MAX_VALUE]) {
      const epoch = orb.angularTravelEpoch;
      orb.angularTravelRad = corrupt;
      step(orb, .1, 3);
      assert.equal(orb.angularTravelRad, 0);
      assert.notEqual(orb.angularTravelEpoch, epoch);
    }
    step(orb, Number.MAX_VALUE, 4);
    assert.ok(Number.isFinite(orb.angleRad));
    assert.equal(orb.angularTravelRad, 0);
  } finally { orb.trail.dispose(); }
});
