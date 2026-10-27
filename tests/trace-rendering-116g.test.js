import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { state } from "../src/js/core/state.js";
import { runtime } from "../src/js/core/preferences.js";
import { Spaces } from "../src/js/core/spaces.js";
import { Orb } from "../src/js/render/orb.js";
import { Renderer } from "../src/js/render/renderer.js";
import { angularTracePointCount } from "../src/js/render/trace-selection.js";
import { TraceRenderGovernor, traceSegmentDemand } from "../src/js/render/trace-render-governor.js";
import { createVisualizerRuntime } from "../src/js/render/visualizer-runtime.js";

const rad = degrees => degrees * Math.PI / 180;
const colors = [{ r: 1, g: 0, b: 0 }, { r: 0, g: 1, b: 0 }, { r: 0, g: 0, b: 1 }];
function orbFor(degrees, trace = {}, current = degrees.at(-1) || 0, id = "angular") {
  const def = structuredClone(CONFIG.defaults.orbs[0]);
  def.id = id;
  Object.assign(def.trace, { lengthMode: "angular", angularSpanDeg: 360, numLines: 60,
    lineColorMode: "fixed", lineAlpha: .4, lineWidthPx: 3 }, trace);
  const orb = new Orb(def);
  orb.angularTravelRad = rad(current);
  orb.angularTravelEpoch ||= {};
  degrees.forEach((travel, index) => {
    orb.trail.emitAt(index * 10, 0, index, colors[index % colors.length]);
    Object.assign(orb.trail.particles.at(-1), {
      angularTravelRad: rad(travel), angularTravelEpoch: orb.angularTravelEpoch,
    });
  });
  return orb;
}
function canvas() {
  const strokes = [], gradients = [], clips = [];
  let path = [];
  const ctx = { globalAlpha: .3, lineWidth: 0, lineCap: "square", lineJoin: "bevel", strokeStyle: "",
    save() {}, restore() {}, fillRect() {}, fill() {}, arc() {}, rect() {}, closePath() {}, clip(rule) { clips.push(rule); },
    beginPath() { path = []; }, moveTo(x, y) { path.push(["M", x, y]); }, lineTo(x, y) { path.push(["L", x, y]); },
    stroke() { strokes.push({ path, color: this.strokeStyle, width: this.lineWidth, alpha: this.globalAlpha,
      cap: this.lineCap, join: this.lineJoin }); },
    createLinearGradient(...coords) { const g = { coords, stops: [], addColorStop(offset, color) { this.stops.push([offset, color]); } }; gradients.push(g); return g; },
  };
  return { ctx, strokes, gradients, clips };
}
function withRenderer(fn) {
  const saved = { ctx: state.ctx, dpr: state.dpr, widthPx: state.widthPx, heightPx: state.heightPx,
    settings: runtime.settings, project: Spaces.simToScreen };
  state.dpr = 2; state.widthPx = state.heightPx = 1000;
  runtime.settings = structuredClone(CONFIG.defaults);
  runtime.settings.visuals.particleColor = "#ffffff";
  runtime.settings.visuals.backgroundColor = "#204060";
  Spaces.simToScreen = (x, y) => Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  try { fn(); } finally {
    Object.assign(state, { ctx: saved.ctx, dpr: saved.dpr, widthPx: saved.widthPx, heightPx: saved.heightPx });
    runtime.settings = saved.settings; Spaces.simToScreen = saved.project;
  }
}

for (const [span, expected] of [[180, 3], [360, 5], [1080, 13]]) {
  test(`${span}° selects only retained points at or inside the current travel boundary`, () => {
    const orb = orbFor(Array.from({ length: 17 }, (_, i) => i * 90), { angularSpanDeg: span });
    try {
      assert.equal(angularTracePointCount(orb), expected);
      orb.angularTravelRad += rad(.01);
      assert.equal(angularTracePointCount(orb), expected - 1, "outside endpoint is excluded, without interpolation");
    } finally { orb.trail.dispose(); }
  });
}

test("selection starts at current Orb travel even when newest emission is older, and obeys the independent line cap", () => {
  const orb = orbFor([0, 90, 180, 270, 360], { angularSpanDeg: 180 }, 450);
  try {
    assert.equal(angularTracePointCount(orb), 2);
    orb.angularTravelRad = rad(600); assert.equal(angularTracePointCount(orb), 0);
    orb.angularTravelRad = rad(360); orb.trace.angularSpanDeg = 1080; orb.trace.numLines = 2;
    assert.equal(angularTracePointCount(orb), 3);
    orb.trace.numLines = 0; assert.equal(angularTracePointCount(orb), 1);
  } finally { orb.trail.dispose(); }
});

test("young, partially evicted, noncontiguous surviving and expired histories use only actual retained points", () => {
  const orb = orbFor([0, 30, 60, 90, 120, 150, 180, 210]);
  try {
    assert.equal(angularTracePointCount(orb), 8, "requested span does not manufacture older history");
    orb.trail.governor.applyPolicy({ ...orb.trail.governor.policy, maxActiveParticles: 5 });
    assert.equal(angularTracePointCount(orb), 5);
    orb.trail.governor.retire(orb.trail.particles.tail.prev);
    assert.equal(angularTracePointCount(orb), 4, "noncontiguous samples remain consecutive retained points");
    orb.trail.expireParticles(8, 3);
    assert.equal(angularTracePointCount(orb), 1);
    orb.trail.expireParticles(10, 3); assert.equal(angularTracePointCount(orb), 0);
  } finally { orb.trail.dispose(); }
});

for (const invalid of [undefined, NaN, Infinity, -1]) {
  test(`missing/invalid stamp ${String(invalid)} is an unknown boundary`, () => {
    const orb = orbFor([0, 30, 60, 90, 120]);
    try {
      orb.trail.particles.at(2).angularTravelRad = invalid;
      assert.equal(angularTracePointCount(orb), 2);
      orb.trail.particles.at(-1).angularTravelRad = invalid;
      assert.equal(angularTracePointCount(orb), 0);
    } finally { orb.trail.dispose(); }
  });
}

test("mixed epochs, future or reversed stamps stop traversal; malformed current travel does not draw", () => {
  for (const edit of [
    p => { p.angularTravelEpoch = {}; },
    p => { p.angularTravelEpoch = null; },
    p => { p.angularTravelRad = rad(200); },
    p => { p.angularTravelRad = rad(110); },
  ]) {
    const orb = orbFor([0, 30, 60, 90, 120]);
    try { edit(orb.trail.particles.at(2)); assert.equal(angularTracePointCount(orb), 2); }
    finally { orb.trail.dispose(); }
  }
  const orb = orbFor([0, 30]);
  try {
    for (const value of [NaN, Infinity, -1]) { orb.angularTravelRad = value; assert.equal(angularTracePointCount(orb), 0); }
    orb.angularTravelRad = rad(30);
    for (const epoch of [null, "invalid epoch", 1]) {
      orb.angularTravelEpoch = epoch;
      assert.equal(angularTracePointCount(orb), 0);
    }
  } finally { orb.trail.dispose(); }
});

test("selection traversal is bounded by line cap and stops at the first angular boundary", () => {
  const orb = orbFor(Array.from({ length: 500 }, (_, i) => i), { numLines: 3 });
  try {
    let visits = 0;
    for (let node = orb.trail.particles.head; node; node = node.next) {
      const particle = node.particle;
      Object.defineProperty(node, "particle", { get() { visits++; return particle; } });
    }
    assert.equal(angularTracePointCount(orb), 4); assert.equal(visits, 4);
    visits = 0; orb.trace.numLines = 1000; orb.trace.angularSpanDeg = 1;
    assert.equal(angularTracePointCount(orb), 2); assert.equal(visits, 3);
  } finally { orb.trail.dispose(); }
});

for (const mode of ["fixed", "lastParticle", "dominantBand"]) {
  test(`angular ${mode} remains one batched path with retained endpoints and existing alpha/DPR`, () => withRenderer(() => {
    const orb = orbFor([0, 90, 180, 270, 360], { angularSpanDeg: 180, lineColorMode: mode });
    try {
      const c = canvas(); state.ctx = c.ctx;
      assert.equal(Renderer.drawOrb(orb, 5, 0), 0);
      assert.equal(c.strokes.length, 1); assert.equal(c.gradients.length, 0); assert.equal(c.clips.length, 0);
      assert.deepEqual(c.strokes[0].path, [["M", 20, 0], ["L", 30, 0], ["L", 40, 0]]);
      assert.equal(c.strokes[0].color, mode === "fixed" ? "rgba(255,255,255,0.4)"
        : mode === "lastParticle" ? "rgba(0,255,0,0.4)" : "rgba(255,25,25,0.4)");
      assert.equal(c.strokes[0].width, 6); assert.equal(c.strokes[0].alpha, 1);
      assert.equal(c.strokes[0].cap, "round"); assert.equal(c.strokes[0].join, "round");
    } finally { orb.trail.dispose(); }
  }));
}

for (const count of [0, 1]) test(`angular history of ${count} points draws no segments`, () => withRenderer(() => {
  const orb = orbFor(Array.from({ length: count }, (_, i) => i));
  try { const c = canvas(); state.ctx = c.ctx; Renderer.drawOrb(orb, 1, 0); assert.equal(c.strokes.length, 0); }
  finally { orb.trail.dispose(); }
}));

test("angular Fade Length 5 begins at the oldest selected drawable segment, after projection gaps", () => withRenderer(() => {
  const orb = orbFor(Array.from({ length: 16 }, (_, i) => i * 30), { angularSpanDeg: 270, fadeEnabled: true, fadeSegments: 5 });
  try {
    const project = Spaces.simToScreen;
    Spaces.simToScreen = (x, y) => x === 80 ? { x: NaN, y } : project(x, y);
    const c = canvas(); state.ctx = c.ctx;
    assert.equal(Renderer.drawOrb(orb, 16, 0), 5);
    assert.equal(c.gradients.length, 5); assert.equal(c.strokes.length, 6);
    assert.deepEqual(c.gradients[0].coords, [60, 0, 70, 0]);
    assert.deepEqual(c.gradients[1].coords, [90, 0, 100, 0], "invalid projected point breaks adjacency and consumes no fade position");
    assert.deepEqual(c.gradients[0].stops[0], [0, "rgba(32,64,96,0.4)"]);
    assert.deepEqual(c.gradients.at(-1).stops[1], [1, "rgba(255,255,255,0.4)"]);
  } finally { orb.trail.dispose(); }
}));

for (const fade of [false, true]) {
  test(`angular Particle Birth Color${fade ? " + fade" : ""} preserves stored colors and selected geometry within every quota`, () => withRenderer(() => {
    const orb = orbFor(Array.from({ length: 13 }, (_, i) => i * 30), {
      angularSpanDeg: 180, lineColorMode: "particleBirth", fadeEnabled: fade, fadeSegments: 5,
    });
    try {
      const particles = [...orb.trail.particles];
      const c = canvas(); state.ctx = c.ctx;
      assert.equal(Renderer.drawOrb(orb, 13, 0), 6);
      assert.equal(c.strokes.length, 6);
      if (fade) {
        assert.equal(c.gradients.length, 5);
        assert.deepEqual(c.gradients[0].stops[0], [0, "rgba(32,64,96,0.4)"]);
      } else assert.deepEqual(c.strokes.map(s => s.color), ["rgba(255,0,0,0.4)", "rgba(0,255,0,0.4)", "rgba(0,0,255,0.4)",
        "rgba(255,0,0,0.4)", "rgba(0,255,0,0.4)", "rgba(0,0,255,0.4)"]);
      runtime.settings.bands.rainbow.hueOffsetDeg = 120;
      const next = canvas(); state.ctx = next.ctx; Renderer.drawOrb(orb, 13, 99);
      const colorValue = stroke => typeof stroke.color === "string" ? stroke.color : stroke.color.stops;
      assert.deepEqual(next.strokes.map(colorValue), c.strokes.map(colorValue));
      for (const quota of [0, 1, 2, 4]) {
        const limited = canvas(); state.ctx = limited.ctx;
        assert.ok(Renderer.drawOrb(orb, 13, 99, quota) <= quota);
        const xs = limited.strokes.flatMap(s => s.path.map(p => p[1]));
        assert.equal(Math.min(...xs), 60); assert.equal(Math.max(...xs), 120);
      }
      assert.deepEqual([...orb.trail.particles], particles, "rendering does not retain, fabricate, retire or emit particles");
    } finally { orb.trail.dispose(); }
  }));
}

test("batched angular mode breaks null and nonfinite projection gaps without joining unknown points", () => withRenderer(() => {
  const orb = orbFor([0, 30, 60, 90, 120]);
  try {
    Spaces.simToScreen = (x, y) => x === 20 ? { x: Infinity, y } : { x, y };
    const c = canvas(); state.ctx = c.ctx; Renderer.drawOrb(orb, 5, 0);
    assert.deepEqual(c.strokes[0].path, [["M", 0, 0], ["L", 10, 0], ["M", 30, 0], ["L", 40, 0]]);
  } finally { orb.trail.dispose(); }
}));

test("governor demand and runtime diagnostics follow angular filtering without exceeding granted detail", () => withRenderer(() => {
  const orbs = Array.from({ length: 16 }, (_, i) => orbFor(Array.from({ length: 61 }, (_, n) => n * 30), {
    angularSpanDeg: 60, lineColorMode: "particleBirth", fadeEnabled: true, fadeSegments: 5,
  }, 1800, `angular-${i}`));
  const settingsRef = { settings: structuredClone(CONFIG.defaults) };
  const v = createVisualizerRuntime({ settingsRef, traceRenderingPolicy: { maxSegmentStrokesPerFrame: 5 } });
  try {
    assert.equal(traceSegmentDemand(orbs[0]), 2);
    v.rebuild(orbs);
    const c = canvas(); state.ctx = c.ctx;
    v.render(Renderer, { nowSec: 61, analysisFrame: { spectrum: { dominantIndex: 0 } } });
    assert.deepEqual(v.getTraceRenderStats(), { maxSegmentStrokesPerFrame: 5, requestedSegmentStrokes: 32,
      grantedSegmentStrokes: 5, segmentStrokes: 5, activeOrbs: 16, limitedOrbs: 16 });
    assert.equal(c.strokes.length, 16, "zero-share Orbs retain the existing one batched fallback");
    orbs[0].angularTravelRad += rad(100);
    const governor = new TraceRenderGovernor({ maxSegmentStrokesPerFrame: 0 });
    governor.setVisualizers([{ type: "orb", orb: orbs[0] }]); governor.beginFrame();
    assert.equal(governor.getStats().requestedSegmentStrokes, 0);
    assert.equal(governor.getStats().activeOrbs, 0); governor.dispose();
  } finally { v.dispose(); }
}));

test("count mode ignores stamps and restores the accepted retained suffix after angular mode", () => withRenderer(() => {
  const orb = orbFor([0, 90, 180, 270, 360], { angularSpanDeg: 180, numLines: 3 });
  try {
    orb.trail.particles.at(2).angularTravelEpoch = {};
    let c = canvas(); state.ctx = c.ctx; Renderer.drawOrb(orb, 5, 0);
    assert.deepEqual(c.strokes[0].path, [["M", 30, 0], ["L", 40, 0]]);
    orb.trace.lengthMode = "count";
    c = canvas(); state.ctx = c.ctx; Renderer.drawOrb(orb, 5, 0);
    assert.deepEqual(c.strokes[0].path, [["M", 10, 0], ["L", 20, 0], ["L", 30, 0], ["L", 40, 0]]);
  } finally { orb.trail.dispose(); }
}));

test("count rendering and demand never inspect angular runtime metadata", () => withRenderer(() => {
  const orb = orbFor([0, 90, 180], { lengthMode: "count", lineColorMode: "particleBirth" });
  try {
    Object.defineProperty(orb, "angularTravelRad", { get() { throw new Error("count path inspected travel"); } });
    assert.equal(traceSegmentDemand(orb), 2);
    const c = canvas(); state.ctx = c.ctx;
    assert.equal(Renderer.drawOrb(orb, 3, 0), 2);
    assert.equal(c.strokes.length, 2);
  } finally { orb.trail.dispose(); }
}));

test("actual runtime emissions and Count → Angular → Count → Angular transitions select only current-epoch samples", () => withRenderer(() => {
  const def = structuredClone(CONFIG.defaults.orbs[0]);
  def.id = "actual-runtime";
  Object.assign(def.trace, { lengthMode: "count", angularSpanDeg: 180, numLines: 3, lineColorMode: "fixed" });
  Object.assign(def.motion, { angularSpeedRadPerSec: Math.PI / 4 });
  Object.assign(def.particles, { emitPerSecond: 30, minPlacementDistanceUnits: 0, ttlSec: 100 });
  const orb = new Orb(def), v = createVisualizerRuntime();
  let tick = 0;
  const update = () => v.update({ dtSec: 1 / 30, motionDtSec: 1, nowSec: ++tick / 30,
    simPaused: false, analysisFrame: { ready: false, spectrum: { dominantIndex: 0 } } });
  const switchMode = lengthMode => orb.syncFromDef({ ...def, trace: { ...def.trace, lengthMode } });
  try {
    v.rebuild([orb]);
    update(); update(); update(); update();
    assert.equal(orb.trail.particles.length, 4);
    assert.ok([...orb.trail.particles].every(p => !("angularTravelRad" in p)));
    switchMode("angular");
    assert.equal(angularTracePointCount(orb), 0);
    update(); update(); update();
    assert.equal(angularTracePointCount(orb), 3);
    assert.ok(Math.abs(orb.angularTravelRad - rad(315)) < 1e-12);
    let c = canvas(); state.ctx = c.ctx; Renderer.drawOrb(orb, tick / 30, 0);
    const selected = [...orb.trail.particles.suffix(3)];
    assert.deepEqual(c.strokes[0].path, selected.map((p, i) => [i ? "L" : "M", p.xSim, p.ySim]));
    switchMode("count");
    c = canvas(); state.ctx = c.ctx; Renderer.drawOrb(orb, tick / 30, 0);
    assert.equal(c.strokes[0].path.length, 4, "retained count history is unchanged");
    switchMode("angular");
    assert.equal(angularTracePointCount(orb), 0, "earlier angular epoch is an unknown boundary");
    update(); update();
    assert.equal(angularTracePointCount(orb), 2);
    assert.equal(orb.trail.particles.length, 9, "mode transitions add no retention or emission");
  } finally { v.dispose(); }
}));
