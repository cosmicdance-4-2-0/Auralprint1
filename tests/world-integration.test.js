import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { state } from "../src/js/core/state.js";
import { preferences, replacePreferences, resolveSettings, runtime } from "../src/js/core/preferences.js";
import { Spaces, resizeCanvasToDisplaySize } from "../src/js/core/spaces.js";
import { Orb } from "../src/js/render/orb.js";
import { Renderer } from "../src/js/render/renderer.js";
import { createAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { createVisualizerRuntime, VisualizerRuntime } from "../src/js/render/visualizer-runtime.js";
import { initOrbs, reconcileOrbs } from "../src/js/render/orb-runtime.js";
import { sanitizePreset } from "../src/js/presets/preset-codec.js";

function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`); }

function scene(run) {
  const saved = { prefs: structuredClone(preferences), settings: runtime.settings, window: globalThis.window,
    canvas: state.canvas, ctx: state.ctx, widthPx: state.widthPx, heightPx: state.heightPx,
    dpr: state.dpr, world: state.world, orbs: state.orbs, phase: state.bands.ringPhaseRad };
  const arcs = [], strokes = [];
  const ctx = { save() {}, restore() {}, fillRect() {}, beginPath() {}, fill() {}, moveTo() {}, lineTo() {},
    stroke() { strokes.push(this.lineWidth); }, arc(x, y, r) { arcs.push({ x, y, r }); } };
  globalThis.window = { devicePixelRatio: 1 };
  state.canvas = { clientWidth: 1000, clientHeight: 1000 };
  state.ctx = ctx; state.orbs = []; state.bands.ringPhaseRad = 0;
  replacePreferences(structuredClone(CONFIG.defaults)); resolveSettings(); resizeCanvasToDisplaySize();
  const viewport = (width, height, dpr) => {
    Object.assign(state.canvas, { clientWidth: width, clientHeight: height });
    window.devicePixelRatio = dpr;
    resizeCanvasToDisplaySize();
  };
  try { return run({ arcs, strokes, ctx, viewport }); }
  finally {
    VisualizerRuntime.dispose();
    replacePreferences(saved.prefs); resolveSettings(); runtime.settings = saved.settings;
    for (const key of ["canvas", "ctx", "widthPx", "heightPx", "dpr", "world", "orbs"]) state[key] = saved[key];
    state.bands.ringPhaseRad = saved.phase; globalThis.window = saved.window;
  }
}

function definition(overrides = {}) {
  const def = structuredClone(CONFIG.defaults.orbs[0]);
  def.particles.emitPerSecond = 0;
  def.motion.angularSpeedRadPerSec = 0;
  return Object.assign(def, overrides);
}

function analysis() {
  const frame = createAnalysisFrame(); frame.ready = true;
  for (const channel of Object.values(frame.channels)) {
    channel.waveform = Float32Array.of(.5, -.5, .25, -.25);
    channel.energy01 = .5;
  }
  frame.spectrum.energies01 = Float32Array.of(0, .25, .5, 1);
  return frame;
}

test("116A: Orb center, reversed radii, energy and waveform use only the resolved world span", () => scene(() => {
  preferences.world = { widthUnits: 2400, heightUnits: 1600 }; resolveSettings();
  const orb = new Orb(definition({ centerXFrac: .95, centerYFrac: -.95,
    response: { minRadiusFrac: .4, maxRadiusFrac: .2, waveformRadialDisplaceFrac: .25 } }));
  try {
    for (const energy of [0, .5, 1]) {
      orb.step(0, 0, { waveform: Float32Array.of(.5), energy01: energy }, null, 0);
      const radius = 1600 * (.2 + .2 * energy), displacement = radius * .25 * .5;
      close(orb.baseRadiusUnits, radius); close(orb.radialDispUnits, displacement);
      close(orb.xSim, radius + displacement + .95 * 1600);
      close(orb.ySim, -.95 * 1600);
      assert.ok(orb.xSim > state.world.widthUnits / 2, "world dimensions do not clamp positions");
    }
    orb.step(0, 0, { waveform: [], energy01: 1 }, 0, 0);
    assert.equal(orb.baseRadiusUnits, 320); assert.equal(orb.radialDispUnits, 0);
    assert.ok(Object.isFrozen(state.world));
    const world = state.world; resolveSettings(); assert.equal(state.world, world);
  } finally { orb.trail.dispose(); }
}));

test("116A: actual Ring draw coordinates retain world radii/waveform geometry across resize and DPR", () => scene(({ arcs, strokes, viewport }) => {
  preferences.world = { widthUnits: 2400, heightUnits: 1600 };
  preferences.bands.count = 4;
  Object.assign(preferences.bands.overlay, { enabled: true, connectAdjacent: true,
    minRadiusFrac: .4, maxRadiusFrac: .2, waveformRadialDisplaceFrac: .25 }); resolveSettings();
  const frame = analysis(), before = structuredClone(frame), world = state.world;
  const points = [];
  for (const [width, height, dpr] of [[1000, 800, 1], [800, 1000, 1], [1200, 900, 1], [1200, 900, 2]]) {
    viewport(width, height, dpr); arcs.length = strokes.length = 0;
    Renderer.drawSpectralRing(frame);
    assert.equal(arcs.length, 4);
    const scale = Math.min(state.widthPx, state.heightPx) / 1600;
    const row = arcs.map(({ x, y, r }, i) => {
      assert.equal(r, runtime.settings.bands.overlay.pointSizePx * dpr);
      const point = { x: (x - state.widthPx / 2) / scale, y: (state.heightPx / 2 - y) / scale };
      const angle = i * Math.PI / 2;
      const idx = Math.floor(i / 4 * (frame.channels.C.waveform.length - 1));
      const base = 320 + 320 * frame.spectrum.energies01[i];
      const radius = base * (1 + .25 * frame.channels.C.waveform[idx]);
      close(point.x, radius * Math.cos(angle)); close(point.y, radius * Math.sin(angle));
      return point;
    });
    if (points.length) row.forEach((p, i) => { close(p.x, points[0][i].x); close(p.y, points[0][i].y); });
    points.push(row);
    assert.ok(strokes.every(width => width === runtime.settings.bands.overlay.lineWidthPx * dpr));
    assert.equal(state.world, world); assert.equal(state.bands.ringPhaseRad, 0);
  }
  assert.deepEqual(frame, before);
}));

test("116A: resize, orientation, DPR-only changes and zero layout preserve live simulation and history", () => scene(({ viewport }) => {
  preferences.bands.overlay.ringSpeedRadPerSec = .6; resolveSettings();
  initOrbs();
  const frame = { dtSec: 1/60, motionDtSec: .1, nowSec: 0, simPaused: false, analysisFrame: analysis() };
  VisualizerRuntime.update(frame);
  const orbs = [...state.orbs], participants = [...VisualizerRuntime.getVisualizers()];
  const world = state.world, phase = state.bands.ringPhaseRad;
  const snapshots = orbs.map(orb => ({ x: orb.xSim, y: orb.ySim, phase: orb.angleRad,
    radius: orb.baseRadiusUnits, displacement: orb.radialDispUnits,
    history: [...orb.trail.particles], coordinates: structuredClone([...orb.trail.particles]), fraction: orb.trail.emitAccumulator }));
  assert.ok(snapshots.every(s => s.history.length));
  for (const [w, h, dpr] of [[900, 700, 1], [700, 900, 1], [700, 900, 2], [0, 0, 2], [1500, 1100, 1.25]]) {
    viewport(w, h, dpr);
    VisualizerRuntime.update({ ...frame, dtSec: 0, motionDtSec: 0, nowSec: .1 });
    VisualizerRuntime.render(Renderer, { ...frame, nowSec: .1 });
    assert.equal(state.world, world); assert.equal(state.bands.ringPhaseRad, phase);
    orbs.forEach((orb, i) => {
      const s = snapshots[i]; assert.equal(state.orbs[i], orb);
      assert.equal(orb.xSim, s.x); assert.equal(orb.ySim, s.y); assert.equal(orb.angleRad, s.phase);
      assert.equal(orb.baseRadiusUnits, s.radius); assert.equal(orb.radialDispUnits, s.displacement);
      assert.equal(orb.trail.emitAccumulator, s.fraction);
      assert.deepEqual([...orb.trail.particles], s.coordinates);
      [...orb.trail.particles].forEach((p, j) => assert.equal(p, s.history[j]));
    });
    VisualizerRuntime.getVisualizers().forEach((p, i) => assert.equal(p, participants[i]));
  }
}));

test("116A: identical world inputs produce identical placement decisions at every viewport and DPR", () => scene(({ viewport }) => {
  const world = state.world, rows = [];
  for (const [w, h, dpr] of [[800, 600, 1], [2400, 1600, 2], [400, 900, 3]]) {
    viewport(w, h, dpr);
    const def = definition({ response: { minRadiusFrac: 0, maxRadiusFrac: 0, waveformRadialDisplaceFrac: 0 } });
    def.particles.emitPerSecond = 60;
    const orb = new Orb(def), row = [];
    try {
      for (const distance of [0, .49, .5, .99, 1, 1.51]) {
        orb.centerXFrac = distance / world.referenceSpanUnits;
        orb.step(1/60, 0, null, 0, 0);
        row.push(orb.trail.governor.getStats().emissions);
      }
      assert.deepEqual(row, [1, 0, 1, 0, 1, 1]); rows.push(row);
    } finally { orb.trail.dispose(); }
  }
  assert.deepEqual(rows[0], rows[1]); assert.deepEqual(rows[1], rows[2]);
}));

test("116A: world edits and ID reconciliation preserve survivor phase, trail objects and fractional progress", () => scene(() => {
  initOrbs();
  VisualizerRuntime.update({ dtSec: .001, motionDtSec: .1, nowSec: 0, simPaused: false, analysisFrame: analysis() });
  const orb = state.orbs[0]; orb.trail.emitAt(5000, -6000, 0, { r: 1, g: 1, b: 1 });
  const particle = orb.trail.particles.at(0), phase = orb.angleRad, fraction = orb.trail.emitAccumulator;
  const world = state.world;
  preferences.world = { widthUnits: 2400, heightUnits: 1600 };
  preferences.orbs.reverse(); resolveSettings(); reconcileOrbs();
  assert.notEqual(state.world, world);
  assert.equal(state.orbs.find(o => o.id === orb.id), orb);
  assert.equal(orb.angleRad, phase); assert.equal(orb.trail.emitAccumulator, fraction);
  assert.equal(orb.trail.particles.at(0), particle);
  VisualizerRuntime.update({ dtSec: 0, motionDtSec: 0, nowSec: .1, simPaused: false, analysisFrame: analysis() });
  assert.deepEqual([particle.xSim, particle.ySim], [5000, -6000]);
  assert.equal(orb.trail.particles.at(0), particle, "outside-world history is not retired");
  preferences.orbs = []; resolveSettings(); reconcileOrbs();
  assert.equal(state.orbs.length, 0);
  assert.equal(VisualizerRuntime.getVisualizers().length, 1);
}));

test("116A: default fit reproduces legacy fraction framing and CSS presentation sizes", () => scene(({ arcs, strokes, viewport }) => {
  const def = definition({ centerXFrac: .1, centerYFrac: .2,
    response: { minRadiusFrac: .25, maxRadiusFrac: .25, waveformRadialDisplaceFrac: 0 } });
  const orb = new Orb(def);
  orb.trail.emitAt(350, 200, 0, { r: 1, g: 1, b: 1 });
  orb.trail.emitAt(300, 150, 0, { r: 1, g: 1, b: 1 });
  try {
    for (const [w, h, dpr] of [[800, 600, 1], [1600, 900, 2], [600, 1200, 1.5]]) {
      viewport(w, h, dpr); orb.step(0, 0, null, 0, 0);
      const shortSide = Math.min(state.widthPx, state.heightPx), point = Spaces.simToScreen(orb.xSim, orb.ySim);
      close(point.x, state.widthPx / 2 + .35 * shortSide);
      close(point.y, state.heightPx / 2 - .2 * shortSide);
      arcs.length = strokes.length = 0; Renderer.drawOrb(orb, 0, 0);
      assert.ok(arcs.every(p => p.r === def.particles.sizeMaxPx * dpr));
      assert.deepEqual(strokes, [def.trace.lineWidthPx * dpr]);
      const first = Spaces.simToScreen(350, 200); close(arcs[0].x, first.x); close(arcs[0].y, first.y);
    }
  } finally { orb.trail.dispose(); }
}));

test("116A: migrated schema-10 framing preserves offsets, radii and channel waveforms", () => scene(({ viewport }) => {
  const old = { orbs: [{ id: "old", chanId: "R", centerXFrac: -.21, centerYFrac: .33,
    startAngleRad: .75, particles: { minPlacementDistancePx: 2.3 },
    response: { minRadiusFrac: .1, maxRadiusFrac: .7, waveformRadialDisplaceFrac: .2 } }] };
  replacePreferences(sanitizePreset({ schema: 10, prefs: old })); resolveSettings();
  const def = runtime.settings.orbs[0], orb = new Orb(def);
  try {
    for (const [w, h, dpr] of [[800, 600, 1], [600, 900, 2]]) {
      viewport(w, h, dpr); orb.step(0, 0, { waveform: Float32Array.of(-.5), energy01: .4 }, null, 0);
      const short = Math.min(state.widthPx, state.heightPx), radius = short * (.1 + .6 * .4) * .9;
      const screen = Spaces.simToScreen(orb.xSim, orb.ySim);
      close(screen.x, state.widthPx / 2 + radius * Math.cos(.75) - .21 * short);
      close(screen.y, state.heightPx / 2 - radius * Math.sin(.75) - .33 * short);
      assert.equal(def.particles.minPlacementDistanceUnits, 2.3);
    }
  } finally { orb.trail.dispose(); }
}));
