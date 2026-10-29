import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { state } from "../src/js/core/state.js";
import { runtime } from "../src/js/core/preferences.js";
import { Spaces } from "../src/js/core/spaces.js";
import { Renderer } from "../src/js/render/renderer.js";
import { Orb } from "../src/js/render/orb.js";
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
      Renderer.drawOrb(orb, 8, 0);
      assert.equal(c.strokes.length, 1);
      assert.deepEqual(c.strokes[0].path, [["M", 40, 0], ["L", 50, 0], ["L", 60, 0], ["L", 70, 0]]);
      assert.equal(c.strokes[0].color, mode === "fixed" ? "rgba(255,255,255,0.4)" : (mode === "lastParticle" ? "rgba(0,255,0,0.4)" : "rgba(255,25,25,0.4)"));
      assert.equal(c.strokes[0].width, 6); assert.equal(c.strokes[0].alpha, 1);
      assert.equal(c.strokes[0].cap, "round"); assert.equal(c.strokes[0].join, "round");
      assert.equal(c.gradients.length, 0);
    }
  } finally { orb.trail.dispose(); }
}));

for (const [points, requested, fade] of [[61, 1, 1], [61, 5, 5], [61, 10, 10], [61, 20, 20], [6, 5, 5], [4, 20, 3]]) {
  test(`fade projects visible suffix, oldest ${fade} drawable segments of ${points - 1} (requested ${requested})`, () => withRenderer(() => {
    const orb = orbFor(points, { fadeSegments: requested });
    try {
      const c = canvas(); state.ctx = c.ctx;
      const reads = [], suffix = orb.trail.particles.suffix;
      orb.trail.particles.suffix = function* (count) { for (const p of suffix.call(this, count)) { reads.push(p.xSim); yield p; } };
      Renderer.drawOrb(orb, 61, 0);
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
  const orb = orbFor(10, { numLines: 5, fadeSegments: 5 });
  try {
    const c = canvas(); state.ctx = c.ctx;
    const project = Spaces.simToScreen;
    Spaces.simToScreen = (x, y) => x === 60 ? { x: NaN, y } : project(x, y);
    Renderer.drawOrb(orb, 10, 0);
    assert.equal(c.strokes.length, 3);
    assert.deepEqual(c.strokes.map(s => s.path.filter(p => p[1] % 10 === 0).map(p => p.slice(1))), [[[40, 0], [50, 0]], [[70, 0], [80, 0]], [[80, 0], [90, 0]]]);
    assert.deepEqual(c.gradients.at(-1).stops[1], [1, "rgba(255,255,255,0.4)"]);
  } finally { orb.trail.dispose(); }
}));

for (const count of [0, 1]) test(`enhanced Trace with ${count} retained point draws no lines`, () => withRenderer(() => {
  const orb = orbFor(count, { fadeSegments: 5 });
  try { const c = canvas(); state.ctx = c.ctx; Renderer.drawOrb(orb, 1, 0); assert.equal(c.strokes.length, 0); } finally { orb.trail.dispose(); }
}));
