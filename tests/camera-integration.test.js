import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { state, setCamera, resetCamera } from "../src/js/core/state.js";
import { preferences, replacePreferences, resolveSettings, runtime } from "../src/js/core/preferences.js";
import { Spaces, resizeCanvasToDisplaySize } from "../src/js/core/spaces.js";
import { Orb } from "../src/js/render/orb.js";
import { Renderer } from "../src/js/render/renderer.js";
import { createAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { createVisualizerRuntime } from "../src/js/render/visualizer-runtime.js";
import { encodePresetPayload, sanitizePreset } from "../src/js/presets/preset-codec.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { panCamera, rotateCamera, zoomCamera } from "../src/js/ui/camera-actions.js";

const cameras = [
  { x: 0, y: 0, zoom: 1, rotationRad: 0 },
  { x: 1200, y: -900, zoom: 1, rotationRad: 0 },
  { x: 0, y: 0, zoom: 1, rotationRad: Math.PI / 2 },
  { x: 0, y: 0, zoom: .01, rotationRad: 0 },
  { x: 0, y: 0, zoom: 100, rotationRad: 0 },
  { x: -1300, y: 1700, zoom: 2.75, rotationRad: -.73 },
];

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= 1e-8, `${actual} != ${expected}`);
}

function pointClose(actual, expected) {
  assert.ok(actual, "projection is defined");
  close(actual.x, expected.x); close(actual.y, expected.y);
}

function analysis() {
  const frame = createAnalysisFrame(); frame.ready = true;
  for (const channel of Object.values(frame.channels)) {
    channel.waveform = Float32Array.of(.5, -.5, .25, -.25);
    channel.energy01 = .5;
    channel.bandEnergies01 = Float32Array.of(.1, .3, .7, .9);
  }
  frame.spectrum.energies01 = Float32Array.of(0, .25, .5, 1);
  return frame;
}

function scene(run) {
  const keys = ["canvas", "ctx", "widthPx", "heightPx", "dpr", "world", "orbs"];
  const saved = Object.fromEntries(keys.map(key => [key, state[key]]));
  Object.assign(saved, { prefs: structuredClone(preferences), settings: runtime.settings,
    camera: state.camera, phase: state.bands.ringPhaseRad, window: globalThis.window,
    location: globalThis.location, history: globalThis.history });
  const arcs = [], strokes = [], lines = [], moves = [], rectangles = [];
  const finite = values => values.forEach(value => assert.ok(Number.isFinite(value), `nonfinite canvas argument ${value}`));
  const ctx = { save() {}, restore() {}, beginPath() {}, fill() {},
    fillRect(...values) { finite(values); rectangles.push(values); },
    moveTo(x, y) { finite([x, y]); moves.push({ x, y }); },
    lineTo(x, y) { finite([x, y]); lines.push({ x, y }); },
    stroke() { finite([this.lineWidth]); strokes.push(this.lineWidth); },
    arc(x, y, r) { finite([x, y, r]); arcs.push({ x, y, r }); } };
  globalThis.window = { devicePixelRatio: 1 };
  state.canvas = { clientWidth: 1000, clientHeight: 800 };
  state.ctx = ctx; state.orbs = []; state.bands.ringPhaseRad = 0;
  replacePreferences(structuredClone(CONFIG.defaults));
  preferences.world = { widthUnits: 2400, heightUnits: 1600 };
  preferences.bands.count = 4;
  Object.assign(preferences.bands.overlay, { enabled: true, connectAdjacent: true,
    minRadiusFrac: .2, maxRadiusFrac: .4, waveformRadialDisplaceFrac: .25 });
  resolveSettings(); resetCamera(); resizeCanvasToDisplaySize();
  const engine = createVisualizerRuntime();
  const viewport = (width, height, dpr) => {
    Object.assign(state.canvas, { clientWidth: width, clientHeight: height });
    window.devicePixelRatio = dpr; resizeCanvasToDisplaySize();
  };
  const clearDraws = () => {
    for (const list of [arcs, strokes, lines, moves, rectangles]) list.length = 0;
  };
  try { return run({ arcs, strokes, lines, moves, rectangles, viewport, engine, clearDraws }); }
  finally {
    engine.dispose();
    replacePreferences(saved.prefs); resolveSettings(); runtime.settings = saved.settings;
    for (const key of keys) state[key] = saved[key];
    setCamera(saved.camera); state.bands.ringPhaseRad = saved.phase;
    globalThis.window = saved.window; globalThis.location = saved.location; globalThis.history = saved.history;
  }
}

function snapshot(orb) {
  return { x: orb.xSim, y: orb.ySim, phase: orb.angleRad,
    centerXFrac: orb.centerXFrac, centerYFrac: orb.centerYFrac,
    radius: orb.baseRadiusUnits, displacement: orb.radialDispUnits,
    history: structuredClone([...orb.trail.particles]), fraction: orb.trail.emitAccumulator };
}

test("116B: camera changes and reset preserve actual Orb, Ring, analysis and retained history", () => scene(({ engine, arcs, viewport, clearDraws }) => {
  state.orbs = runtime.settings.orbs.map(def => new Orb(def)); engine.rebuild();
  const frame = { dtSec: 1 / 60, motionDtSec: .13, nowSec: 0, simPaused: false, analysisFrame: analysis() };
  engine.update(frame);
  const beforeAnalysis = structuredClone(frame.analysisFrame), world = state.world;
  const orbs = [...state.orbs], participants = [...engine.getVisualizers()];
  const phase = state.bands.ringPhaseRad;
  const snapshots = orbs.map(snapshot), identities = orbs.map(orb => [...orb.trail.particles]);
  assert.ok(identities.every(history => history.length > 0));
  const ringWorld = [];
  for (const camera of [...cameras, null]) {
    if (camera) setCamera(camera); else resetCamera();
    for (const [width, height, dpr] of [[1000, 800, 1], [800, 1000, 1], [800, 1000, 2]]) {
      viewport(width, height, dpr); clearDraws();
      const still = { ...frame, dtSec: 0, motionDtSec: 0, nowSec: .1 };
      engine.update(still); engine.render(Renderer, still);
      assert.equal(state.world, world); assert.equal(state.bands.ringPhaseRad, phase);
      assert.deepEqual(frame.analysisFrame, beforeAnalysis);
      orbs.forEach((orb, i) => {
        assert.equal(state.orbs[i], orb); assert.deepEqual(snapshot(orb), snapshots[i]);
        [...orb.trail.particles].forEach((particle, j) => assert.equal(particle, identities[i][j]));
      });
      engine.getVisualizers().forEach((participant, i) => assert.equal(participant, participants[i]));
      const row = arcs.slice(0, 4).map(p => Spaces.screenToSim(p.x, p.y));
      assert.equal(row.length, 4);
      if (!ringWorld.length) ringWorld.push(...row);
      else row.forEach((point, i) => pointClose(point, ringWorld[i]));
    }
  }
  assert.deepEqual(state.camera, CONFIG.camera.defaults);
}));

test("116B: camera-independent placement, dense emission and fractional progress use world inputs", () => scene(() => {
  for (const spacing of [.5, 0]) {
    const rows = [];
    for (const camera of cameras) {
      setCamera(camera);
      const def = structuredClone(runtime.settings.orbs[0]);
      def.motion.angularSpeedRadPerSec = 0;
      def.response = { minRadiusFrac: 0, maxRadiusFrac: 0, waveformRadialDisplaceFrac: 0 };
      Object.assign(def.particles, { emitPerSecond: 150, minPlacementDistanceUnits: spacing });
      const orb = new Orb(def), row = [];
      try {
        for (const [index, distance] of [0, .49, .5, .99, 1, 1.51].entries()) {
          orb.centerXFrac = distance / state.world.referenceSpanUnits;
          orb.step(1 / 60, index / 60, null, 0, 0);
          const stats = orb.trail.governor.getStats();
          row.push({ emissions: stats.emissions, rejected: stats.spatiallyRejectedDemand,
            fraction: orb.trail.emitAccumulator, history: structuredClone([...orb.trail.particles]) });
        }
      } finally { orb.trail.dispose(); }
      assert.deepEqual(row.map(r => r.emissions), spacing ? [1, 0, 1, 0, 1, 1] : [2, 3, 2, 3, 2, 3]);
      rows.push(row);
    }
    for (const row of rows.slice(1)) assert.deepEqual(row, rows[0]);
  }
}));

test("116C: interactive actions leave running and paused Orb simulation, history and emission decisions identical", () => scene(() => {
  const definition = structuredClone(runtime.settings.orbs[0]);
  Object.assign(definition.particles, { emitPerSecond: 150, minPlacementDistanceUnits: .5 });
  const control = new Orb(definition), manipulated = new Orb(definition), frame = analysis();
  const retained = [];
  try {
    for (let index = 0; index < 18; index++) {
      const before = snapshot(manipulated);
      const particles = [...manipulated.trail.particles];
      panCamera(index % 2 ? -1 : 1, index % 3 ? 1 : -1);
      rotateCamera(index % 2 ? 1 : -1);
      zoomCamera(index % 2 ? 1 / 1.1 : 1.1, { x: 230, y: 510 });
      if (index % 5 === 0) resetCamera();
      assert.deepEqual(snapshot(manipulated), before);
      [...manipulated.trail.particles].forEach((particle, i) => assert.equal(particle, particles[i]));
      const paused = index >= 8 && index <= 11;
      for (const orb of [control, manipulated]) {
        if (paused) orb.trail.expireParticles(index / 60, orb.particles.ttlSec);
        else orb.step(1 / 60, index / 60, frame.channels.C, .5, 1 / 60);
      }
      assert.deepEqual(snapshot(manipulated), snapshot(control), `frame ${index}, paused=${paused}`);
      assert.deepEqual(manipulated.trail.governor.getStats(), control.trail.governor.getStats());
      retained.push(manipulated.trail.particles.length);
    }
    assert.ok(retained.some(count => count > 0));
  } finally { control.trail.dispose(); manipulated.trail.dispose(); }
}));

test("116B: historical and newly emitted particles, Trace and Ring share projection with CSS-sized marks", () => scene(({ arcs, strokes, lines, moves, viewport, clearDraws }) => {
  const def = structuredClone(runtime.settings.orbs[0]);
  def.motion.angularSpeedRadPerSec = 0; def.particles.emitPerSecond = 60;
  const orb = new Orb(def);
  const frame = analysis();
  orb.trail.emitAt(5000, -6000, 0, { r: 1, g: 1, b: 1 });
  const historical = orb.trail.particles.at(0);
  try {
    for (const [width, height, dpr] of [[1000, 800, 1], [800, 1000, 2], [1100, 750, 1.25]]) {
      viewport(width, height, dpr);
      for (const camera of cameras) {
        setCamera(camera);
        const priorCount = orb.trail.particles.length;
        orb.centerXFrac += .1;
        orb.step(1 / 60, 0, frame.channels.C, .5, 0);
        assert.equal(orb.trail.particles.length, priorCount + 1);
        const particles = [...orb.trail.particles];
        assert.equal(particles[0], historical);
        assert.deepEqual([historical.xSim, historical.ySim], [5000, -6000]);
        clearDraws(); Renderer.drawOrb(orb, 0, 0);
        assert.equal(arcs.length, particles.length);
        arcs.forEach((draw, i) => {
          pointClose(draw, Spaces.simToScreen(particles[i].xSim, particles[i].ySim));
          assert.equal(draw.r / dpr, def.particles.sizeMaxPx);
        });
        assert.deepEqual(strokes, [def.trace.lineWidthPx * dpr]);
        const suffix = particles.slice(-Math.min(particles.length, Math.ceil(def.trace.numLines) + 1));
        pointClose(moves[0], Spaces.simToScreen(suffix[0].xSim, suffix[0].ySim));
        lines.forEach((draw, i) => pointClose(draw, Spaces.simToScreen(suffix[i + 1].xSim, suffix[i + 1].ySim)));
        clearDraws(); Renderer.drawSpectralRing(frame);
        assert.equal(arcs.length, 4);
        assert.ok(arcs.every(draw => draw.r / dpr === runtime.settings.bands.overlay.pointSizePx));
        assert.deepEqual(strokes, Array(4).fill(runtime.settings.bands.overlay.lineWidthPx * dpr));
        arcs.forEach((draw, i) => {
          const angle = i * Math.PI / 2;
          const index = Math.floor(i / 4 * (frame.channels.C.waveform.length - 1));
          const base = 320 + 320 * frame.spectrum.energies01[i];
          const radius = base * (1 + .25 * frame.channels.C.waveform[index]);
          pointClose(draw, Spaces.simToScreen(radius * Math.cos(angle), radius * Math.sin(angle)));
        });
      }
    }
  } finally { orb.trail.dispose(); }
}));

test("116B: camera stays runtime-only across schema-11 encoding, URL replacement and legacy migration", () => scene(() => {
  setCamera(cameras.at(-1)); let camera = state.camera;
  assert.equal("camera" in preferences, false); assert.equal("camera" in runtime.settings, false);
  assert.equal("camera" in CONFIG.defaults, false);
  const encodedBefore = encodePresetPayload(preferences);
  resetCamera(); assert.deepEqual(encodePresetPayload(preferences), encodedBefore);
  camera = setCamera(camera);
  const location = { pathname: "/auralprint.html", search: "?check=116b", hash: "" };
  globalThis.location = location;
  globalThis.history = { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf("#")); } };
  preferences.camera = { ...camera };
  UrlPreset.writeHashFromPrefs();
  const payload = JSON.parse(Buffer.from(location.hash.slice(3), "base64url").toString("utf8"));
  assert.equal(payload.schema, 11); assert.equal("camera" in payload.prefs, false);
  assert.deepEqual(Object.keys(payload.prefs).sort(), ["audio", "bands", "orbs", "particleSafety", "timing", "visuals", "world"]);
  assert.equal(UrlPreset.applyFromLocationHash(), true); resolveSettings();
  assert.equal(state.camera, camera);
  assert.equal("camera" in preferences, false); assert.equal("camera" in runtime.settings, false);
  for (let schema = 2; schema <= 11; schema++) {
    const incoming = { ...structuredClone(CONFIG.defaults), camera: { ...camera }, scene: { camera: { ...camera } } };
    const prefs = sanitizePreset({ schema, prefs: incoming });
    assert.equal("camera" in prefs, false); assert.equal("scene" in prefs, false);
    replacePreferences(prefs); resolveSettings();
    assert.equal(state.camera, camera, `schema ${schema} application preserves runtime camera`);
  }
}));

test("116B: recorder tap remains the canonical resized viewport for every camera", () => scene(({ viewport }) => {
  const canvas = state.canvas;
  for (const [width, height, dpr] of [[1000, 800, 1], [800, 1000, 2], [1200, 900, 1.25]]) {
    viewport(width, height, dpr);
    for (const camera of cameras) {
      setCamera(camera);
      assert.deepEqual(Renderer.getRecorderTap(), { canvas, widthPx: Math.floor(width * dpr),
        heightPx: Math.floor(height * dpr), dpr });
      assert.equal(Renderer.getRecorderTap().canvas, canvas);
    }
  }
}));

test("116B: native resize rejects malformed layout and DPR without touching world or camera", () => scene(({ viewport }) => {
  setCamera(cameras.at(-1));
  const camera = state.camera, world = state.world;
  for (const [width, height, dpr, expectedWidth, expectedHeight, expectedDpr] of [
    [1000, 800, 2, 2000, 1600, 2],
    [1000, 800, NaN, 1000, 800, 1],
    [1000, 800, 0, 1000, 800, 1],
    [1000, 800, -1, 1000, 800, 1],
    [1000, 800, Infinity, 1000, 800, 1],
    [1000, 800, "2", 1000, 800, 1],
    [1000, 800, Number.MAX_VALUE, 1000, 800, 1],
    [NaN, 800, 2, 0, 1600, 2],
    [1000, -1, 2, 2000, 0, 2],
    ["1000", 800, 2, 0, 1600, 2],
    [1000, Infinity, 2, 2000, 0, 2],
    [Number.MAX_VALUE, 800, 2, 0, 1600, 2],
    [0, 0, 1.5, 0, 0, 1.5],
    [1000, 800, 1.25, 1250, 1000, 1.25],
  ]) {
    viewport(width, height, dpr);
    assert.deepEqual([state.widthPx, state.heightPx, state.dpr], [expectedWidth, expectedHeight, expectedDpr]);
    assert.deepEqual([state.canvas.width, state.canvas.height], [expectedWidth, expectedHeight]);
    assert.equal(state.world, world); assert.equal(state.camera, camera);
    assert.deepEqual(Spaces.centerPx(), { x: expectedWidth / 2, y: expectedHeight / 2 });
  }
}));

test("116B: degenerate and malformed viewports and unrepresentable projections never draw nonfinite coordinates", () => scene(({ engine, arcs, lines, moves, rectangles, clearDraws }) => {
  const orb = new Orb(runtime.settings.orbs[0]); state.orbs = [orb]; engine.rebuild();
  orb.trail.emitAt(-Number.MAX_VALUE, 1, 0, { r: 1, g: 1, b: 1 });
  orb.trail.emitAt(10, 20, 0, { r: 1, g: 1, b: 1 });
  const before = snapshot(orb), world = state.world;
  const frame = { nowSec: 0, analysisFrame: analysis() };
  for (const [width, height] of [[0, 800], [1000, 0], [0, 0]]) {
    state.widthPx = width; state.heightPx = height;
    clearDraws(); engine.render(Renderer, frame);
    assert.equal(Spaces.screenToSim(0, 0), null);
    assert.deepEqual(Spaces.simToScreen(10, 20), { x: width / 2, y: height / 2 });
    assert.deepEqual(snapshot(orb), before); assert.equal(state.world, world);
  }
  for (const [width, height] of [[NaN, 800], [1000, Infinity], [-1, 800], [1000, "800"]]) {
    state.widthPx = width; state.heightPx = height;
    clearDraws(); Renderer.clearFrame(); engine.render(Renderer, frame);
    assert.equal(arcs.length, 0); assert.equal(lines.length, 0); assert.equal(moves.length, 0);
    assert.equal(rectangles.length, 0);
    assert.deepEqual(snapshot(orb), before); assert.equal(state.world, world);
  }
  state.widthPx = state.heightPx = 1000;
  setCamera({ x: Number.MAX_VALUE, y: 0, zoom: CONFIG.limits.camera.zoom.max });
  clearDraws(); engine.render(Renderer, frame);
  assert.equal(arcs.length, 0); assert.equal(lines.length, 0); assert.equal(moves.length, 0);
  assert.deepEqual(snapshot(orb), before);
}));
