import test from "node:test";
import assert from "node:assert/strict";

import { BandBank } from "../src/js/audio/band-bank.js";
import { CONFIG } from "../src/js/core/config.js";
import { runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";

function analyserBand(db) {
  return {
    analyser: { minDecibels: -100, maxDecibels: 0 },
    freqDb: new Float32Array(16).fill(db),
  };
}

test("BandBank rebuild owns distinct reusable L/R/C arrays and replaces all on definition changes", () => {
  const previous = runtime.settings;
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    runtime.settings.bands.count = 4;
    BandBank.rebuild(20000, 48000);
    const first = Object.fromEntries(Object.entries(state.bands.channels).map(([id, value]) => [id, value.energies01]));
    assert.notEqual(first.L, first.R);
    assert.notEqual(first.L, first.C);
    assert.notEqual(first.R, first.C);
    assert.equal(state.bands.energies01, first.C);

    runtime.settings.bands.count = 6;
    BandBank.rebuild(18000, 48000);
    for (const id of ["L", "R", "C"]) {
      assert.notEqual(state.bands.channels[id].energies01, first[id]);
      assert.equal(state.bands.channels[id].energies01.length, 6);
    }
    assert.equal(state.bands.energies01, state.bands.channels.C.energies01);
  } finally {
    runtime.settings = previous;
  }
});

test("channel-neutral BandBank computation writes only its target and global dominant is set from C", () => {
  const previous = runtime.settings;
  try {
    runtime.settings = structuredClone(CONFIG.defaults);
    runtime.settings.bands.count = 4;
    BandBank.rebuild(20000, 48000);
    const { L, R, C } = state.bands.channels;
    BandBank.computeEnergiesFromAnalyser(analyserBand(-90), 48000, L.energies01);
    BandBank.computeEnergiesFromAnalyser(analyserBand(-50), 48000, R.energies01);
    const cDominant = BandBank.computeEnergiesFromAnalyser(analyserBand(-10), 48000, C.energies01);
    assert.ok(L.energies01.every((value) => Math.abs(value - 0.1) < 1e-6));
    assert.ok(R.energies01.every((value) => Math.abs(value - 0.5) < 1e-6));
    assert.ok(C.energies01.every((value) => Math.abs(value - 0.9) < 1e-6));
    BandBank.updateGlobalDominant(cDominant);
    assert.equal(state.bands.dominantIndex, cDominant);
    assert.equal(state.bands.energies01, C.energies01);
  } finally {
    runtime.settings = previous;
  }
});
