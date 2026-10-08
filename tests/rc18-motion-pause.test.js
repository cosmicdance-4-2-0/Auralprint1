import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { CONFIG } from "../src/js/core/config.js";
import { simulationDeltaSec, visualMotionDeltaSec } from "../src/js/core/timing.js";
import { createAnalysisFrame, updateAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { Orb } from "../src/js/render/orb.js";
import { createVisualizerRuntime, createSpectralRingVisualizer } from "../src/js/render/visualizer-runtime.js";

for (const phaseMode of ["free", "orb"]) test(`RC-18: production Space/callback freezes ${phaseMode} Ring and Orb while analysis continues`, t => {
  const settings = structuredClone(CONFIG.defaults);
  settings.bands.overlay.phaseMode = phaseMode;
  settings.bands.overlay.ringSpeedRadPerSec = 2;
  const def = settings.orbs[0]; def.startAngleRad = 1; def.chirality = 1;
  def.motion.angularSpeedRadPerSec = 2; def.particles.emitPerSecond = 0;
  const orb = new Orb(def), settingsRef = { settings };
  const stateRef = { time: { lastTimestampMs: null, simPaused: false }, bands: { ringPhaseRad: 1, channels: {} }, orbs: [orb] };
  const v = createVisualizerRuntime({ settingsRef, createSpectralRing: () => createSpectralRingVisualizer({ settingsRef, stateRef }) });
  v.rebuild([orb]);
  let nowMs = 100000, samples = 0, updates = 0, shortcut, lastFrame;
  const context = vm.createContext({
    CONFIG, state: stateRef, runtime: settingsRef, document: { hidden: false }, performance: { now: () => nowMs },
    simulationDeltaSec, visualMotionDeltaSec, requestAnimationFrame() {}, resizeCanvasToDisplaySize() {},
    createAnalysisFrame, updateAnalysisFrame(frame, sample, bands) { updates++; return updateAnalysisFrame(frame, sample, bands); },
    AudioEngine: { sample() { samples++; return { ready: true, bands: { C: { energy01: samples / 100, timeDomain: Float32Array.of(samples) } } }; } },
    VisualizerRuntime: { update(frame) { lastFrame = frame; v.update(frame); }, render() {} },
    Renderer: {}, UI: { refreshAllUiText() {} }, Scrubber: { draw() {} },
    window: { addEventListener(_event, handler) { shortcut = handler; } }, hasFocusedInteractiveTarget: () => false,
  });
  // Execute the real callback and real shortcut body; boot/DOM seams are stubbed.
  const main = readFileSync(new URL("../src/js/main.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/^main\(\);$/m, "").replace(/^export .*;$/m, "");
  vm.runInContext(main, context);
  const ui = readFileSync(new URL("../src/js/ui/ui.js", import.meta.url), "utf8");
  const start = ui.indexOf('window.addEventListener("keydown", (e) => {');
  const end = ui.indexOf("// Track navigation", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(ui.slice(start, end) + "});", context);
  const callback = ms => { nowMs = ms; context.onAnimationFrame(ms); };
  const space = () => { let prevented = false; shortcut({ code: "Space", preventDefault() { prevented = true; } }); assert.equal(prevented, true); };
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
  try {
    callback(100000); callback(100100);
    space(); assert.equal(stateRef.time.simPaused, true);
    const pausedOrb = orb.angleRad, pausedRing = stateRef.bands.ringPhaseRad;
    const energyBefore = lastFrame.analysisFrame.channels.C.energy01, samplesBefore = samples;
    for (let i = 1; i <= 100; i++) callback(100100 + i * 100);
    assert.equal(orb.angleRad, pausedOrb);
    assert.equal(stateRef.bands.ringPhaseRad, pausedRing);
    assert.equal(samples - samplesBefore, 100);
    assert.equal(updates, samples);
    assert.ok(lastFrame.analysisFrame.channels.C.energy01 > energyBefore);
    assert.equal(lastFrame.analysisFrame.channels.C.waveform[0], samples);
    assert.equal(lastFrame.analysisFrame.ready, true);
    assert.equal(v.getParticleStats().emissions, 0);
    space(); callback(110200);
    close(orb.angleRad, pausedOrb + .2);
    close(stateRef.bands.ringPhaseRad, pausedRing + .2);
    if (phaseMode === "orb") assert.equal(stateRef.bands.ringPhaseRad, orb.angleRad);
    t.diagnostic(JSON.stringify({ phaseMode, pausedOrb, pausedRing, samplesDuringPause: 100, resumedOrb: orb.angleRad, resumedRing: stateRef.bands.ringPhaseRad }));
  } finally { v.dispose(); }
});
