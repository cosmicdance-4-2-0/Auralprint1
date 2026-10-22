import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { runtime, preferences } from "../src/js/core/preferences.js";
import { state, setCamera } from "../src/js/core/state.js";
import { createWorldGeometry } from "../src/js/core/world-geometry.js";
import { fitCamera } from "../src/js/ui/camera-actions.js";

function scene(run) {
  const saved = { camera: state.camera, world: state.world, widthPx: state.widthPx,
    heightPx: state.heightPx, dpr: state.dpr, orbs: state.orbs, settings: runtime.settings };
  state.world = createWorldGeometry(1800, 1000);
  state.widthPx = 1400; state.heightPx = 800; state.dpr = 1;
  state.orbs = [];
  runtime.settings = structuredClone(CONFIG.defaults);
  runtime.settings.bands.overlay.enabled = false;
  try { run(); }
  finally {
    Object.assign(state, { world: saved.world, widthPx: saved.widthPx,
      heightPx: saved.heightPx, dpr: saved.dpr, orbs: saved.orbs });
    runtime.settings = saved.settings; setCamera(saved.camera);
  }
}

test("Fit action commits one camera snapshot, preserves rotation, and fits the world with no drawables", () => scene(() => {
  setCamera({ x: 900, y: -300, zoom: 4, rotationRad: .723 });
  const previous = state.camera, world = state.world, settings = runtime.settings;
  const preset = structuredClone(preferences), time = state.time, audio = state.audio, recording = state.recording;
  const result = fitCamera();
  assert.equal(result.applied, true); assert.equal(result.fits, true);
  assert.notEqual(state.camera, previous); assert.equal(state.camera.rotationRad, previous.rotationRad);
  assert.equal(state.camera.x, 0); assert.equal(state.camera.y, 0);
  assert.ok(state.camera.zoom < 1);
  assert.equal(state.world, world); assert.equal(runtime.settings, settings);
  assert.deepEqual(preferences, preset);
  assert.equal(state.time, time); assert.equal(state.audio, audio); assert.equal(state.recording, recording);
}));

test("Fit traverses retained content only on request; zoom constraints return explicit best framing", () => scene(() => {
  let visits = 0;
  const orb = structuredClone(CONFIG.defaults.orbs[0]);
  orb.trail = { particles: { *[Symbol.iterator]() { visits++; yield { xSim: 1e9, ySim: -2e9 }; } } };
  state.orbs = [orb];
  assert.equal(visits, 0);
  const result = fitCamera();
  assert.equal(visits, 1); assert.equal(result.reason, "minimum-zoom");
  assert.equal(result.applied, true); assert.equal(result.fits, false);
  assert.equal(state.camera.zoom, CONFIG.limits.camera.zoom.min);
  assert.ok(state.camera.x > 1e8); assert.ok(state.camera.y < -1e8);
  assert.equal(orb.trail.particles[Symbol.iterator]().next().value.xSim, 1e9);
}));

test("Fit leaves the view intact for degenerate viewports, invalid geometry and impossible CSS mark margins", () => scene(() => {
  setCamera({ x: 123, y: -456, zoom: 7, rotationRad: 1.234 });
  const camera = state.camera;
  state.widthPx = 0;
  assert.equal(fitCamera().applied, false); assert.equal(state.camera, camera);
  state.widthPx = 1400;
  const orb = structuredClone(CONFIG.defaults.orbs[0]);
  orb.trail = { particles: [{ xSim: NaN, ySim: 100 }] };
  state.orbs = [orb];
  assert.equal(fitCamera().reason, "invalid-geometry"); assert.equal(state.camera, camera);
  orb.trail.particles = [];
  state.heightPx = 20;
  assert.equal(fitCamera().reason, "screen-margin"); assert.equal(state.camera, camera);
}));
