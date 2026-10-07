import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { Orb } from "../src/js/render/orb.js";
import { createVisualizerRuntime } from "../src/js/render/visualizer-runtime.js";
import { createAnalysisFrame } from "../src/js/audio/analysis-frame.js";

test("RC-10: rendered Orb lock uses current-frame first Orb after variable deltas and reconciliation", () => {
  const oldSettings = runtime.settings, oldOrbs = state.orbs;
  const oldPhase = state.bands.ringPhaseRad;
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    runtime.settings.bands.overlay.phaseMode = "orb";
    runtime.settings.bands.overlay.enabled = true;
    const makeOrb = (id, chirality) => {
      const def = structuredClone(CONFIG.defaults.orbs[0]);
      Object.assign(def, { id, chirality, startAngleRad: 6.2 });
      def.motion.angularSpeedRadPerSec = 3;
      def.particles.emitPerSecond = 0;
      return new Orb(def);
    };
    state.orbs = [makeOrb("A", 1), makeOrb("B", -1)];
    const visualizers = createVisualizerRuntime();
    visualizers.rebuild();
    const analysisFrame = createAnalysisFrame();
    let nowSec = 0;
    for (const dtSec of [1 / 30, 0, 1 / 60, 0.21, 0.005]) {
      nowSec += dtSec;
      const context = { dtSec, nowSec, simPaused: false, analysisFrame };
      visualizers.update(context);
      assert.equal(state.bands.ringPhaseRad, state.orbs[0].angleRad);
      const draws = [];
      visualizers.render({
        clearFrame() { draws.push("clear"); },
        drawSpectralRing() { draws.push("ring"); assert.equal(state.bands.ringPhaseRad, state.orbs[0].angleRad); },
        drawOrb(orb) { draws.push(orb.id); },
      }, context);
      assert.deepEqual(draws, ["clear", "ring", "A", "B"]);
    }
    state.orbs.reverse();
    visualizers.reconcile();
    visualizers.update({ dtSec: .1, nowSec: 1, simPaused: false, analysisFrame });
    assert.equal(state.bands.ringPhaseRad, state.orbs[0].angleRad);
    const before = state.orbs[0].angleRad;
    visualizers.update({ dtSec: .1, nowSec: 2, simPaused: true, analysisFrame });
    assert.equal(state.orbs[0].angleRad, before);
    assert.equal(state.bands.ringPhaseRad, before);
    visualizers.reset("visuals");
    assert.equal(state.bands.ringPhaseRad, state.orbs[0].angleRad);
    state.orbs = [];
    visualizers.reconcile();
    const emptyPhase = state.bands.ringPhaseRad;
    visualizers.update({ dtSec: .1, nowSec: 3, simPaused: false, analysisFrame });
    assert.equal(state.bands.ringPhaseRad, emptyPhase);
    visualizers.reset("visuals");
    assert.equal(state.bands.ringPhaseRad, 0);
    runtime.settings.bands.overlay.phaseMode = "free";
    runtime.settings.bands.overlay.ringSpeedRadPerSec = 2;
    visualizers.update({ dtSec: .1, nowSec: 4, simPaused: true, analysisFrame });
    assert.ok(Math.abs(state.bands.ringPhaseRad - .2) < 1e-12);
  } finally { runtime.settings = oldSettings; state.orbs = oldOrbs; state.bands.ringPhaseRad = oldPhase; }
});
