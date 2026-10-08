// Adapt only RC-16/RC-18 blocks from the original audit; historical files stay intact.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.env.AUDIT_REPO_ROOT || fileURLToPath(new URL("../../../../", import.meta.url));
const source = relative => import(pathToFileURL(resolve(root, relative)));
const { CONFIG } = await source("src/js/core/config.js");
const { preferences, runtime } = await source("src/js/core/preferences.js");
const { UrlPreset } = await source("src/js/presets/url-preset.js");
const { Orb } = await source("src/js/render/orb.js");
const { state } = await source("src/js/core/state.js");
const { createVisualizerRuntime, selectOrbAnalysis } = await source("src/js/render/visualizer-runtime.js");
const input = [null, false, "", [], true];
globalThis.location = { hash: "#p=" + Buffer.from(JSON.stringify({ schema: 10, prefs: { orbs: [{ id: "X", bandIds: input }] } })).toString("base64url") };
assert.equal(UrlPreset.applyFromLocationHash(), true);
const frame = { ready: true, spectrum: { dominantIndex: 0 }, channels: Object.fromEntries(["L", "R", "C"].map(c => [c, { energy01: .9, bandEnergies01: [0, 0, ...Array(254).fill(.9)] }])) };
state.widthPx = state.heightPx = 1000;
const radius = def => {
  const orb = new Orb(def), selection = selectOrbAnalysis(orb, frame);
  orb.step(1 / 60, 1, selection.band, selection.energyOverride01, 0);
  const value = orb.baseRadiusPx; orb.trail.dispose(); return value;
};
const rc16 = { input, bandIds: preferences.orbs[0].bandIds, radius: radius(preferences.orbs[0]), emptyControlRadius: radius({ ...preferences.orbs[0], bandIds: [] }) };
runtime.settings = structuredClone(CONFIG.defaults);
runtime.settings.bands.overlay.phaseMode = "free";
runtime.settings.bands.overlay.ringSpeedRadPerSec = 2;
state.bands.ringPhaseRad = 1;
const def = structuredClone(CONFIG.defaults.orbs[0]); def.startAngleRad = 1; def.particles.emitPerSecond = 0;
state.orbs = [new Orb(def)];
const v = createVisualizerRuntime(); v.rebuild();
v.update({ dtSec: 1 / 30, nowSec: 1, simPaused: true, analysisFrame: frame });
const rc18 = { simPaused: true, orbBefore: 1, orbAfter: state.orbs[0].angleRad, ringBefore: 1, ringAfter: state.bands.ringPhaseRad };
v.dispose();
console.log(JSON.stringify({ rc16, rc18 }, null, 2));
if (process.argv.includes("--expect-rc16-defect")) {
  assert.deepEqual(rc16.bandIds, [0, 1]); assert.equal(rc16.radius, 10);
} else {
  assert.deepEqual(rc16.bandIds, []); assert.equal(rc16.radius, 721); assert.equal(rc16.emptyControlRadius, 721);
}
if (process.argv.includes("--expect-rc18-defect")) assert.ok(Math.abs(rc18.ringAfter - (1 + 2 / 30)) < 1e-12);
else { assert.equal(rc18.ringAfter, 1); assert.equal(rc18.orbAfter, 1); }
