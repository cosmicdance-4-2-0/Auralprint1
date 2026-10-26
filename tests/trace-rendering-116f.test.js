import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { state } from "../src/js/core/state.js";
import { runtime } from "../src/js/core/preferences.js";
import { Spaces } from "../src/js/core/spaces.js";
import { Renderer } from "../src/js/render/renderer.js";
import { Orb } from "../src/js/render/orb.js";
import { TraceRenderGovernor } from "../src/js/render/trace-render-governor.js";
import { createVisualizerRuntime } from "../src/js/render/visualizer-runtime.js";

function canvas() {
  const strokes = [], gradients = [], clips = [], clipArcs = [];
  let path = [];
  const ctx = { globalAlpha: .3, lineWidth: 0, lineCap: "square", lineJoin: "bevel", strokeStyle: "",
    save() {}, restore() {}, fillRect() {}, fill() {}, arc(...args) { clipArcs.push(args); }, rect() {}, closePath() {}, clip(rule) { clips.push(rule); },
    beginPath() { path = []; }, moveTo(x, y) { path.push(["M", x, y]); }, lineTo(x, y) { path.push(["L", x, y]); },
    stroke() { strokes.push({ path, color: this.strokeStyle, width: this.lineWidth, alpha: this.globalAlpha, cap: this.lineCap, join: this.lineJoin }); },
    createLinearGradient(...coords) { const g = { coords, stops: [], addColorStop(offset, color) { this.stops.push([offset, color]); } }; gradients.push(g); return g; },
  };
  return { ctx, strokes, gradients, clips, clipArcs };
}
const red = { r: 1, g: 0, b: 0 }, green = { r: 0, g: 1, b: 0 }, blue = { r: 0, g: 0, b: 1 };
function orbFor(n, trace = {}, id = "test") {
  const def = structuredClone(CONFIG.defaults.orbs[0]);
  def.id = id; Object.assign(def.trace, { numLines: 60, lineColorMode: "fixed", lineAlpha: .4, lineWidthPx: 3 }, trace);
  const orb = new Orb(def);
  for (let i = 0; i < n; i++) orb.trail.emitAt(i * 10, 0, i, [red, green, blue][i % 3]);
  return orb;
}
function withRenderer(fn) {
  const saved = { ctx: state.ctx, dpr: state.dpr, widthPx: state.widthPx, heightPx: state.heightPx, settings: runtime.settings, project: Spaces.simToScreen };
  state.dpr = 2; state.widthPx = state.heightPx = 1000;
  runtime.settings = structuredClone(CONFIG.defaults);
  runtime.settings.visuals.particleColor = "#ffffff";
  runtime.settings.visuals.backgroundColor = "#204060";
  Spaces.simToScreen = (x, y) => Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  try { fn(); } finally { state.ctx = saved.ctx; state.dpr = saved.dpr; state.widthPx = saved.widthPx; state.heightPx = saved.heightPx; runtime.settings = saved.settings; Spaces.simToScreen = saved.project; }
}

test("default/off Trace retains one chronological path, exact legacy modes, alpha and CSS/DPR width", () => withRenderer(() => {
  const orb = orbFor(8, { numLines: 3 });
  try {
    for (const mode of ["fixed", "lastParticle", "dominantBand"]) {
      orb.trace.lineColorMode = mode;
      const c = canvas(); state.ctx = c.ctx;
      assert.equal(Renderer.drawOrb(orb, 8, 0, 0), 0);
      assert.equal(c.strokes.length, 1);
      assert.deepEqual(c.strokes[0].path, [["M", 40, 0], ["L", 50, 0], ["L", 60, 0], ["L", 70, 0]]);
      assert.equal(c.strokes[0].color, mode === "fixed" ? "rgba(255,255,255,0.4)" : (mode === "lastParticle" ? "rgba(0,255,0,0.4)" : "rgba(255,25,25,0.4)"));
      assert.equal(c.strokes[0].width, 6); assert.equal(c.strokes[0].alpha, 1);
      assert.equal(c.strokes[0].cap, "round"); assert.equal(c.strokes[0].join, "round");
      assert.equal(c.gradients.length, 0);
    }
  } finally { orb.trail.dispose(); }
}));

for (const [points, requested, fade] of [[61, 1, 1], [61, 5, 5], [6, 5, 5], [4, 100, 3], [61, 100, 60]]) {
  test(`fade projects visible suffix, oldest ${fade} drawable segments of ${points - 1} (requested ${requested})`, () => withRenderer(() => {
    const orb = orbFor(points, { fadeEnabled: true, fadeSegments: requested });
    try {
      const c = canvas(); state.ctx = c.ctx;
      const reads = [], suffix = orb.trail.particles.suffix;
      orb.trail.particles.suffix = function* (count) { for (const p of suffix.call(this, count)) { reads.push(p.xSim); yield p; } };
      const rendered = Renderer.drawOrb(orb, 61, 0);
      assert.equal(rendered, fade);
      assert.equal(reads.length, Math.min(points, 61), "one historical suffix traversal");
      assert.equal(c.gradients.length, fade);
      assert.equal(c.strokes.length, fade + (fade < points - 1 ? 1 : 0));
      assert.deepEqual(c.gradients[0].stops[0], [0, "rgba(32,64,96,0.4)"]);
      assert.deepEqual(c.gradients.at(-1).stops.at(-1), [1, "rgba(255,255,255,0.4)"]);
      for (let i = 1; i < c.gradients.length; i++) assert.equal(c.gradients[i - 1].stops[1][1], c.gradients[i].stops[0][1], "continuous shared endpoint colors");
      for (const stroke of c.strokes) { assert.equal(stroke.width, 6); assert.equal(stroke.alpha, 1); assert.equal(stroke.cap, "round", "localized clips partition round join coverage"); }
    } finally { orb.trail.dispose(); }
  }));
}

test("fade uses only visible numLines and skips invalid projection gaps without bridging or spending fade positions", () => withRenderer(() => {
  const orb = orbFor(10, { numLines: 5, fadeEnabled: true, fadeSegments: 5 });
  try {
    const c = canvas(); state.ctx = c.ctx;
    const project = Spaces.simToScreen;
    Spaces.simToScreen = (x, y) => x === 60 ? { x: NaN, y } : project(x, y);
    const segments = Renderer.drawOrb(orb, 10, 0);
    assert.equal(segments, 3);
    assert.equal(c.strokes.length, 3);
    assert.deepEqual(c.strokes.map(s => s.path.filter(p => p[1] % 10 === 0).map(p => p.slice(1))), [[[40, 0], [50, 0]], [[70, 0], [80, 0]], [[80, 0], [90, 0]]]);
    assert.deepEqual(c.gradients.at(-1).stops[1], [1, "rgba(255,255,255,0.4)"]);
  } finally { orb.trail.dispose(); }
}));

for (const count of [0, 1]) test(`enhanced Trace with ${count} retained point draws no lines`, () => withRenderer(() => {
  const orb = orbFor(count, { fadeEnabled: true, fadeSegments: 5, lineColorMode: "particleBirth" });
  try { const c = canvas(); state.ctx = c.ctx; assert.equal(Renderer.drawOrb(orb, 1, 0), 0); assert.equal(c.strokes.length, 0); } finally { orb.trail.dispose(); }
}));

test("birth segment belongs to older chronological endpoint and stays stable after palette/audio changes", () => withRenderer(() => {
  const orb = orbFor(4, { lineColorMode: "particleBirth" });
  try {
    const c = canvas(); state.ctx = c.ctx; Renderer.drawOrb(orb, 4, 0);
    assert.deepEqual(c.strokes.map(s => s.color), ["rgba(255,0,0,0.4)", "rgba(0,255,0,0.4)", "rgba(0,0,255,0.4)"]);
    runtime.settings.bands.rainbow.hueOffsetDeg = 120;
    const next = canvas(); state.ctx = next.ctx; Renderer.drawOrb(orb, 4, 99);
    assert.deepEqual(next.strokes.map(s => s.color), c.strokes.map(s => s.color));
    orb.trail.particles.at(1).xSim = NaN;
    const gap = canvas(); state.ctx = gap.ctx; Renderer.drawOrb(orb, 4, 99);
    assert.deepEqual(gap.strokes.map(s => s.color), ["rgba(0,0,255,0.4)"], "gap cannot borrow preceding particle color");
  } finally { orb.trail.dispose(); }
}));

test("birth + fade shares one projection/color pass, original colors and Scene background endpoints", () => withRenderer(() => {
  const orb = orbFor(4, { lineColorMode: "particleBirth", fadeEnabled: true, fadeSegments: 2 });
  try {
    const c = canvas(); state.ctx = c.ctx; assert.equal(Renderer.drawOrb(orb, 4, 200), 3);
    assert.equal(c.gradients.length, 2);
    assert.deepEqual(c.gradients[0].stops, [[0, "rgba(32,64,96,0.4)"], [1, "rgba(144,32,48,0.4)"]]);
    assert.deepEqual(c.gradients[1].stops, [[0, "rgba(16,160,48,0.4)"], [1, "rgba(0,255,0,0.4)"]]);
    assert.equal(c.strokes[2].color, "rgba(0,0,255,0.4)");
  } finally { orb.trail.dispose(); }
}));

test("constrained rendering coalesces groups while preserving full geometry, numLines and all retained nodes", () => withRenderer(() => {
  for (const birth of [false, true]) for (const quota of [0, 1, 2, 5]) {
    const orb = orbFor(61, { fadeEnabled: true, fadeSegments: 5, lineColorMode: birth ? "particleBirth" : "fixed" });
    try {
      const nodes = [...orb.trail.governor.heap];
      const c = canvas(); state.ctx = c.ctx;
      assert.ok(Renderer.drawOrb(orb, 61, 0, quota) <= quota);
      assert.equal(c.strokes.reduce((n, s) => n + s.path.filter(p => p[1] % 10 === 0).length - 1, 0), 60);
      assert.equal(orb.trace.numLines, 60); assert.equal(orb.trail.particles.length, 61);
      assert.deepEqual(orb.trail.governor.heap, nodes);
    } finally { orb.trail.dispose(); }
  }
}));

test("render work is fair across frames, excludes default paths, and resets/disposes without retained participants", () => {
  const orbs = [orbFor(61, { lineColorMode: "particleBirth" }, "a"), orbFor(61, { lineColorMode: "particleBirth" }, "b"), orbFor(61, { lineColorMode: "particleBirth" }, "c"), orbFor(61, {}, "legacy")];
  const g = new TraceRenderGovernor({ maxSegmentStrokesPerFrame: 2 });
  try {
    g.setVisualizers(orbs.map(orb => ({ type: "orb", orb })));
    const grants = [0, 0, 0];
    for (let frame = 0; frame < 3; frame++) {
      g.beginFrame();
      orbs.slice(0, 3).forEach((orb, i) => { grants[i] += g.quotaFor(orb); });
      assert.equal(g.quotaFor(orbs[3]), 0);
      assert.equal(g.getStats().grantedSegmentStrokes, 2);
      assert.equal(g.getStats().requestedSegmentStrokes, 180);
    }
    assert.deepEqual(grants, [2, 2, 2]);
    orbs[1].resetTrail(); g.beginFrame(); assert.equal(g.getStats().activeOrbs, 2);
    g.dispose(); assert.equal(g.entries.length, 0); assert.equal(g.byOrb.size, 0); assert.equal(g.getStats().activeOrbs, 0);
  } finally { for (const orb of orbs) orb.trail.dispose(); }
});

test("runtime frame budget keeps composition order and exposes actual stroke diagnostics through reset/reconcile/zero-Orb lifecycle", () => withRenderer(() => {
  const settingsRef = { settings: structuredClone(CONFIG.defaults) };
  const orbs = Array.from({ length: 16 }, (_, i) => orbFor(61, { lineColorMode: "particleBirth" }, `o${i}`));
  const v = createVisualizerRuntime({ settingsRef, traceRenderingPolicy: { maxSegmentStrokesPerFrame: 32 } });
  try {
    v.rebuild(orbs);
    const order = [], c = canvas(); state.ctx = c.ctx;
    const wrapper = { ...Renderer, drawOrb(orb, ...args) { order.push(orb.id); return Renderer.drawOrb(orb, ...args); } };
    v.render(wrapper, { nowSec: 61, analysisFrame: { spectrum: { dominantIndex: 0 } } });
    assert.deepEqual(order, orbs.map(o => o.id));
    assert.deepEqual(v.getTraceRenderStats(), { maxSegmentStrokesPerFrame: 32, requestedSegmentStrokes: 960, grantedSegmentStrokes: 32, segmentStrokes: 32, activeOrbs: 16, limitedOrbs: 16 });
    assert.equal(c.strokes.length, 32); assert.ok(orbs.every(o => o.trail.particles.length === 61));
    v.reset("track"); assert.equal(v.getTraceRenderStats().segmentStrokes, 0);
    v.reconcile([]); v.render(wrapper, { nowSec: 62, analysisFrame: { spectrum: { dominantIndex: 0 } } });
    assert.equal(v.getTraceRenderStats().activeOrbs, 0);
    v.dispose(); assert.equal(v.getTraceRenderStats().grantedSegmentStrokes, 0);
  } finally { v.dispose(); }
}));


test("runtime candidate refresh waits for Orb definition sync after settings resolution", () => withRenderer(() => {
  const settingsRef = { settings: structuredClone(CONFIG.defaults) };
  const orb = orbFor(61);
  const v = createVisualizerRuntime({ settingsRef });
  const frame = { nowSec: 61, analysisFrame: { spectrum: { dominantIndex: 0 } } };
  try {
    v.rebuild([orb]);
    let c = canvas(); state.ctx = c.ctx; v.render(Renderer, frame);
    assert.equal(v.getTraceRenderStats().activeOrbs, 0);
    for (const mode of ["fade", "particleBirth", "off"]) {
      const def = structuredClone(CONFIG.defaults.orbs[0]);
      def.trace.numLines = 60;
      def.trace.fadeEnabled = mode === "fade";
      def.trace.lineColorMode = mode === "particleBirth" ? "particleBirth" : "fixed";
      settingsRef.settings = structuredClone(settingsRef.settings);
      v.syncSettings(); // matches UI.applyPrefs: resolution precedes Orb sync
      orb.syncFromDef(def);
      c = canvas(); state.ctx = c.ctx; v.render(Renderer, frame);
      assert.equal(v.getTraceRenderStats().activeOrbs, mode === "off" ? 0 : 1);
      assert.equal(c.strokes.length, mode === "fade" ? 6 : mode === "particleBirth" ? 60 : 1);
    }
  } finally { v.dispose(); }
}));

test("enhanced renderer rejects all invalid projection points and falls back safely for missing birth RGB", () => withRenderer(() => {
  const orb = orbFor(3, { lineColorMode: "particleBirth", fadeEnabled: true, fadeSegments: 1 });
  try {
    orb.trail.particles.at(0).rgbStart = null;
    const c = canvas(); state.ctx = c.ctx; Renderer.drawOrb(orb, 3, 50);
    assert.deepEqual(c.gradients[0].stops[1], [1, "rgba(255,255,255,0.4)"]);
    Spaces.simToScreen = () => null;
    const invalid = canvas(); state.ctx = invalid.ctx;
    assert.equal(Renderer.drawOrb(orb, 3, 50), 0);
    assert.equal(invalid.strokes.length, 0);
  } finally { orb.trail.dispose(); }
}));


for (const [label, coordinates] of [
  ["straight", [[0, 0], [10, 0], [20, 0]]],
  ["right angle", [[0, 0], [10, 0], [10, 10]]],
  ["near reversal", [[0, 0], [10, 0], [.0001, .0001]]],
  ["reversal", [[0, 0], [10, 0], [0, 0]]],
  ["collapsed", [[0, 0], [10, 0], [10, 0]]],
]) test(`localized join partition is finite and stroke-bounded at ${label} fade/solid boundary`, () => withRenderer(() => {
  const orb = orbFor(3, { fadeEnabled: true, fadeSegments: 1 });
  try {
    coordinates.forEach(([x, y], i) => { const p = orb.trail.particles.at(i); p.xSim = x; p.ySim = y; });
    const c = canvas(); state.ctx = c.ctx;
    assert.equal(Renderer.drawOrb(orb, 3, 0), 1);
    assert.equal(c.strokes.length, 2);
    assert.ok(c.clips.length <= 4, "at most two localized clips per path");
    assert.ok(c.clips.every(rule => rule === "evenodd"));
    for (const stroke of c.strokes) for (const point of stroke.path) assert.ok(point.slice(1).every(Number.isFinite));
    for (const arc of c.clipArcs) assert.ok(arc.every(Number.isFinite));
  } finally { orb.trail.dispose(); }
}));
