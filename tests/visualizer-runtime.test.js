import test from "node:test";
import assert from "node:assert/strict";

import { TAU } from "../src/js/core/constants.js";
import {
  BAND_OVERLAY_VISUALIZER_ID,
  createBandOverlayVisualizer,
  createOrbVisualizer,
  createVisualizerRuntime,
} from "../src/js/render/visualizer-runtime.js";

function frame(overrides = {}) {
  return {
    dtSec: 0.25,
    nowSec: 10,
    simPaused: false,
    analysisFrame: {
      ready: true,
      channels: {
        L: { waveform: Float32Array.from([0.1]), energy01: 0.1 },
        R: { waveform: Float32Array.from([0.2]), energy01: 0.2 },
        C: { waveform: Float32Array.from([0.3]), energy01: 0.3 },
      },
      spectrum: { energies01: [0.2, 0.6], dominantIndex: 1 },
    },
    ...overrides,
  };
}

function fakeOrb(id, overrides = {}) {
  return {
    id,
    chanId: "L",
    bandIds: [],
    startAngleRad: 0.5,
    angleRad: 1,
    trail: { particles: [] },
    step() {},
    resetPhase() { this.angleRad = this.startAngleRad; },
    resetTrail() {},
    ...overrides,
  };
}

function overlayHarness({ enabled = true, phaseMode = "free", speed = 2, orbs = [] } = {}) {
  return {
    settingsRef: { settings: { bands: { overlay: {
      enabled, phaseMode, ringSpeedRadPerSec: speed,
    } } } },
    stateRef: { bands: { ringPhaseRad: 1 }, orbs },
  };
}

test("current visualizers have stable identities and deterministic overlay-before-orb composition", () => {
  const order = [];
  const runtime = createVisualizerRuntime({
    createBandOverlay: () => ({
      id: BAND_OVERLAY_VISUALIZER_ID, type: "band-overlay", isEnabled: () => true,
      update: () => order.push("update:overlay"), render: () => order.push("render:overlay"),
      reset() {}, dispose() {},
    }),
    createOrb: (orb) => ({
      id: orb.id, type: "orb", orb, isEnabled: () => true,
      update: () => order.push(`update:${orb.id}`), render: () => order.push(`render:${orb.id}`),
      reset() {}, dispose() {},
    }),
  });
  const orbs = [fakeOrb("ORB0"), fakeOrb("ORB1")];
  runtime.rebuild(orbs);
  assert.deepEqual(runtime.getVisualizers().map(({ id, type }) => ({ id, type })), [
    { id: BAND_OVERLAY_VISUALIZER_ID, type: "band-overlay" },
    { id: "ORB0", type: "orb" },
    { id: "ORB1", type: "orb" },
  ]);
  runtime.update(frame());
  runtime.render({ clearFrame: () => order.push("clear") }, frame());
  assert.deepEqual(order, [
    "update:overlay", "update:ORB0", "update:ORB1",
    "clear", "render:overlay", "render:ORB0", "render:ORB1",
  ]);
});

test("Orb adapter consumes AnalysisFrame routing and preserves pause and selected-band semantics", () => {
  const calls = [];
  const orb = fakeOrb("ORB0", {
    chanId: "R",
    bandIds: [0, 1],
    step(...args) { calls.push(args); },
  });
  const visualizer = createOrbVisualizer(orb);
  assert.equal(visualizer.id, orb.id);
  assert.equal(visualizer.type, "orb");
  visualizer.update(frame({ simPaused: true }));
  assert.equal(calls.length, 0);
  const context = frame();
  visualizer.update(context);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2], context.analysisFrame.channels.R);
  assert.equal(calls[0][3], 0.4);
  assert.equal(calls[0][4], 1);
});

test("Band Overlay updates while simulation is paused and preserves free and orb phase modes", () => {
  const free = overlayHarness();
  const freeVisualizer = createBandOverlayVisualizer(free);
  freeVisualizer.update(frame({ simPaused: true }));
  assert.equal(free.stateRef.bands.ringPhaseRad, 1.5);

  const carrier = fakeOrb("ORB0", { angleRad: 2.25 });
  const locked = overlayHarness({ phaseMode: "orb", orbs: [carrier] });
  createBandOverlayVisualizer(locked).update(frame({ simPaused: true }));
  assert.equal(locked.stateRef.bands.ringPhaseRad, 2.25);

  const wrapped = overlayHarness({ speed: -20 });
  createBandOverlayVisualizer(wrapped).update(frame());
  assert.ok(wrapped.stateRef.bands.ringPhaseRad >= 0);
  assert.ok(wrapped.stateRef.bands.ringPhaseRad < TAU);
});

test("Band Overlay enablement controls render without introducing separate state", () => {
  let draws = 0;
  let renderedFrame = null;
  const disabledHarness = overlayHarness({ enabled: false });
  const runtime = createVisualizerRuntime({
    createBandOverlay: () => createBandOverlayVisualizer(disabledHarness),
    createOrb: createOrbVisualizer,
  });
  runtime.rebuild([]);
  runtime.render({ clearFrame() {}, drawBandOverlay() { draws++; } }, frame());
  assert.equal(draws, 0);
  disabledHarness.settingsRef.settings.bands.overlay.enabled = true;
  const context = frame();
  runtime.render({ clearFrame() {}, drawBandOverlay(value) { draws++; renderedFrame = value; } }, context);
  assert.equal(draws, 1);
  assert.equal(renderedFrame, context.analysisFrame);
  assert.equal(renderedFrame.channels.C.waveform, context.analysisFrame.channels.C.waveform);
  assert.equal(renderedFrame.spectrum.energies01, context.analysisFrame.spectrum.energies01);
});

test("visuals and track resets retain their distinct phase and trail contracts", () => {
  let trailResets = 0;
  const orb = fakeOrb("ORB0", {
    startAngleRad: 0.75,
    angleRad: 2,
    resetTrail() { trailResets++; },
  });
  const harness = overlayHarness({ orbs: [orb] });
  const runtime = createVisualizerRuntime({
    createBandOverlay: () => createBandOverlayVisualizer(harness),
    createOrb: createOrbVisualizer,
  });
  runtime.rebuild([orb]);
  runtime.reset("track");
  assert.equal(trailResets, 1);
  assert.equal(orb.angleRad, 2);
  assert.equal(harness.stateRef.bands.ringPhaseRad, 1);
  runtime.reset("visuals");
  assert.equal(trailResets, 2);
  assert.equal(orb.angleRad, 0.75);
  assert.equal(harness.stateRef.bands.ringPhaseRad, 0.75);
});

test("rebuild disposes old participants exactly once and wraps only current Orb objects", () => {
  const disposed = [];
  const runtime = createVisualizerRuntime({
    createBandOverlay: () => ({
      id: "band-overlay", type: "band-overlay", isEnabled: () => true,
      update() {}, render() {}, reset() {}, dispose() { disposed.push("overlay"); },
    }),
    createOrb: (orb) => ({
      id: orb.id, type: "orb", orb, isEnabled: () => true,
      update() {}, render() {}, reset() {}, dispose() { disposed.push(orb); },
    }),
  });
  const oldOrb = fakeOrb("old");
  const currentOrb = fakeOrb("current");
  runtime.rebuild([oldOrb]);
  runtime.rebuild([currentOrb]);
  assert.deepEqual(disposed, ["overlay", oldOrb]);
  assert.equal(runtime.getVisualizers()[1].orb, currentOrb);
  assert.notEqual(runtime.getVisualizers()[1].orb, oldOrb);
});
