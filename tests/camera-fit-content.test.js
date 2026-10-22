import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { state, setCamera } from "../src/js/core/state.js";
import { preferences, runtime } from "../src/js/core/preferences.js";
import { createWorldGeometry } from "../src/js/core/world-geometry.js";
import { createAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { collectCameraFitContent } from "../src/js/render/camera-fit-content.js";
import { computeCameraFit } from "../src/js/core/camera-fit.js";
import { Orb } from "../src/js/render/orb.js";
import { Renderer } from "../src/js/render/renderer.js";
import { Spaces } from "../src/js/core/spaces.js";
import { encodePresetPayload } from "../src/js/presets/preset-codec.js";

const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
function definition(index = 0) {
  const def = structuredClone(CONFIG.defaults.orbs[0]);
  def.id = `fit-${index}`;
  def.motion.angularSpeedRadPerSec = 0;
  def.particles.emitPerSecond = 0;
  return def;
}
function analysis() {
  const frame = createAnalysisFrame(); frame.ready = true;
  for (const channel of Object.values(frame.channels)) {
    channel.waveform = Float32Array.of(-1, 1, -.25, .75);
    channel.energy01 = .5;
  }
  frame.spectrum.energies01 = Float32Array.of(0, .3, .6, 1);
  return frame;
}
function scene(run) {
  const saved = { world: state.world, orbs: state.orbs, ctx: state.ctx, widthPx: state.widthPx,
    heightPx: state.heightPx, dpr: state.dpr, camera: state.camera, settings: runtime.settings };
  const arcs = [], strokes = [];
  state.world = createWorldGeometry(2400, 1600); state.orbs = [];
  state.widthPx = 1200; state.heightPx = 800; state.dpr = 2;
  state.ctx = { save() {}, restore() {}, beginPath() {}, fill() {}, moveTo() {}, lineTo() {},
    stroke() { strokes.push(this.lineWidth); }, arc(x, y, radius) { arcs.push({ x, y, radius }); } };
  runtime.settings = structuredClone(CONFIG.defaults);
  runtime.settings.bands.count = 4;
  try { return run({ arcs, strokes }); }
  finally {
    for (const orb of state.orbs) orb.trail.dispose();
    Object.assign(state, { world: saved.world, orbs: saved.orbs, ctx: saved.ctx,
      widthPx: saved.widthPx, heightPx: saved.heightPx, dpr: saved.dpr });
    setCamera(saved.camera); runtime.settings = saved.settings;
  }
}
const fit = primitives => computeCameraFit({ primitives, viewport: state,
  world: state.world, rotationRad: .713, zoomLimits: CONFIG.limits.camera.zoom, paddingCssPx: 16 });

test("Fit content includes the centered nominal rectangle with zero Orbs and disabled Ring", () => scene(() => {
  const primitives = [...collectCameraFitContent({ world: state.world, orbs: [], overlay: { enabled: false } })];
  assert.deepEqual(primitives, [{ type: "rect", minX: -1200, minY: -800, maxX: 1200, maxY: 800 }]);
  assert.ok(fit(primitives)?.fits);
}));

for (const count of [1, 16]) {
  test(`Fit content reads ${count} active Orb envelopes and off-world retained points without changing runtime state`, () => scene(() => {
    const frame = analysis();
    state.orbs = Array.from({ length: count }, (_, index) => {
      const orb = new Orb(definition(index));
      orb.centerXFrac = index / 10; orb.centerYFrac = -index / 10;
      orb.step(0, 0, frame.channels.R, 1, 0);
      orb.trail.emitAt(10000 + index, -20000 - index, 0, [1, 0, 0]);
      orb.trail.emitAccumulator = .375;
      return orb;
    });
    const world = state.world, camera = state.camera, settings = runtime.settings;
    const preset = encodePresetPayload(preferences), source = structuredClone(frame);
    const before = state.orbs.map(orb => ({ orb, phase: orb.angleRad, x: orb.xSim, y: orb.ySim,
      fraction: orb.trail.emitAccumulator, particle: orb.trail.particles.at(0),
      history: structuredClone([...orb.trail.particles]), stats: structuredClone(orb.trail.governor.getStats()) }));
    const content = [...collectCameraFitContent({ world, orbs: state.orbs, overlay: { enabled: false }, analysisFrame: frame })];
    assert.equal(content.filter(p => p.type === "circle").length, count);
    const points = content.filter(p => p.type === "point"); assert.equal(points.length, count);
    points.forEach((point, index) => {
      assert.equal(point.x, 10000 + index); assert.equal(point.y, -20000 - index);
      assert.equal(point.paddingCssPx, state.orbs[index].particles.sizeMaxPx);
    });
    assert.ok(fit(content)?.fits);
    assert.equal(state.world, world); assert.equal(state.camera, camera); assert.equal(runtime.settings, settings);
    assert.deepEqual(encodePresetPayload(preferences), preset); assert.deepEqual(frame, source);
    state.orbs.forEach((orb, index) => {
      const row = before[index]; assert.equal(orb, row.orb); assert.equal(orb.angleRad, row.phase);
      assert.equal(orb.xSim, row.x); assert.equal(orb.ySim, row.y); assert.equal(orb.trail.emitAccumulator, row.fraction);
      assert.equal(orb.trail.particles.at(0), row.particle); assert.deepEqual([...orb.trail.particles], row.history);
      assert.deepEqual(orb.trail.governor.getStats(), row.stats);
    });
  }));
}

test("Fit Orb potential bounds enclose actual reversed-radius, phase and waveform geometry", () => scene(() => {
  const def = definition(); def.centerXFrac = .9; def.centerYFrac = -.7;
  def.response = { minRadiusFrac: .8, maxRadiusFrac: .2, waveformRadialDisplaceFrac: .75 };
  const orb = new Orb(def); state.orbs = [orb];
  const envelope = [...collectCameraFitContent({ world: state.world, orbs: [orb] })][1];
  let reached = false;
  for (const energy of [0, .31, 1]) for (const sample of [-1, -.4, 0, 1]) {
    for (const angle of [0, Math.PI / 2, Math.PI, 4.13]) {
      orb.angleRad = angle;
      orb.step(0, 0, { waveform: Float32Array.of(sample), energy01: energy }, null, 0);
      const distance = Math.hypot(orb.xSim - envelope.x, orb.ySim - envelope.y);
      assert.ok(distance <= envelope.radius + 1e-9);
      if (energy === 1 && sample === 1) { close(distance, envelope.radius); reached = true; }
    }
  }
  assert.equal(reached, true);
}));

test("Fit Ring envelope uses its own origin/radii for both phase modes and includes actual CSS mark radii", () => scene(({ arcs, strokes }) => {
  const frame = analysis(), settings = runtime.settings;
  Object.assign(settings.bands.overlay, { enabled: true, connectAdjacent: true,
    minRadiusFrac: .6, maxRadiusFrac: .2, waveformRadialDisplaceFrac: .5, pointSizePx: 3, lineWidthPx: 10 });
  const orb = new Orb(definition()); orb.centerXFrac = 10; orb.centerYFrac = -10;
  orb.trail.emitAt(5000, -6000, 0, [1, 0, 0]); orb.trail.emitAt(5001, -6001, 0, [1, 0, 0]);
  orb.particles = { ...orb.particles, sizeMaxPx: 2, sizeMinPx: 9 };
  orb.trace = { ...orb.trace, lineWidthPx: 12, lines: true }; state.orbs = [orb];
  for (const phaseMode of ["free", "orb"]) {
    settings.bands.overlay.phaseMode = phaseMode;
    const content = [...collectCameraFitContent({ world: state.world, orbs: state.orbs,
      overlay: settings.bands.overlay, analysisFrame: frame })];
    const ring = content.at(-1); assert.equal(ring.x, 0); assert.equal(ring.y, 0);
    assert.equal(ring.paddingCssPx, 5); assert.equal(content[1].paddingCssPx, 6);
    arcs.length = strokes.length = 0; Renderer.drawSpectralRing(frame);
    for (const arc of arcs) {
      const point = Spaces.screenToSim(arc.x, arc.y);
      assert.ok(Math.hypot(point.x, point.y) <= ring.radius + 1e-8);
      assert.ok(arc.radius / state.dpr <= ring.paddingCssPx);
    }
    for (const width of strokes) assert.ok(width / (2 * state.dpr) <= ring.paddingCssPx);
    arcs.length = strokes.length = 0; Renderer.drawOrb(orb, .5, 0);
    for (const arc of arcs) assert.ok(arc.radius / state.dpr <= content[1].paddingCssPx);
    for (const width of strokes) assert.ok(width / (2 * state.dpr) <= content[1].paddingCssPx);
  }
}));

test("Fit content includes observed above-unit producer waveform peaks without mutating analysis", () => scene(() => {
  const frame = analysis(); frame.channels.R.waveform = Float32Array.of(2.5);
  frame.channels.C.waveform = Float32Array.of(-3);
  const orb = new Orb(definition()); state.orbs = [orb];
  const overlay = { ...runtime.settings.bands.overlay, enabled: true };
  const source = structuredClone(frame);
  const nominal = [...collectCameraFitContent({ world: state.world, orbs: [orb], overlay })];
  const observed = [...collectCameraFitContent({ world: state.world, orbs: [orb], overlay, analysisFrame: frame })];
  assert.ok(observed[1].radius > nominal[1].radius); assert.ok(observed.at(-1).radius > nominal.at(-1).radius);
  orb.step(0, 0, frame.channels.R, 1, 0);
  assert.ok(Math.hypot(orb.xSim - observed[1].x, orb.ySim - observed[1].y) <= observed[1].radius + 1e-8);
  assert.deepEqual(frame, source);
}));

test("Fit history traversal is lazy and invalid retained geometry fails the entire fit", () => scene(() => {
  let visits = 0;
  const orb = new Orb(definition()); state.orbs = [orb];
  const particles = orb.trail.particles;
  const iterator = particles[Symbol.iterator].bind(particles);
  particles[Symbol.iterator] = function* () { visits++; yield* iterator(); };
  orb.trail.emitAt(NaN, 20, 0, [1, 0, 0]);
  const content = collectCameraFitContent({ world: state.world, orbs: [orb] });
  assert.equal(visits, 0);
  const camera = state.camera;
  assert.equal(fit(content), null); assert.equal(visits, 1); assert.equal(state.camera, camera);
  assert.equal(orb.trail.particles.length, 1);
}));
