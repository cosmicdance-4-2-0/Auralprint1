import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../src/js/core/config.js";
import { allocateOrbId, createOrb, duplicateOrb, findOrbById, normalizeOrbCollection, removeOrb } from "../src/js/core/orb-collection.js";
import { runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { initOrbs, reconcileOrbs } from "../src/js/render/orb-runtime.js";
import { VisualizerRuntime } from "../src/js/render/visualizer-runtime.js";

function defs(ids) {
  return ids.map((id, i) => ({ ...structuredClone(CONFIG.defaults.orbs[i % 2]), id }));
}

test("Orb collection normalization allows zero/one/N, preserves order, and repairs IDs deterministically", () => {
  const configSnapshot = structuredClone(CONFIG.defaults.orbs);
  assert.deepEqual(normalizeOrbCollection([]), []);
  const normalized = normalizeOrbCollection([
    { ...CONFIG.defaults.orbs[0], id: "ORB0" },
    { ...CONFIG.defaults.orbs[1], id: "ORB0" },
    { ...CONFIG.defaults.orbs[0], id: "custom-id" },
    { ...CONFIG.defaults.orbs[1], id: "custom-id" },
    { ...CONFIG.defaults.orbs[0], id: "" },
  ]);
  assert.deepEqual(normalized.map((orb) => orb.id), ["ORB0", "ORB1", "custom-id", "ORB2", "ORB3"]);
  assert.equal(new Set(normalized.map((orb) => orb.id)).size, normalized.length);
  assert.notEqual(normalized[0].motion, normalized[1].motion);
  assert.notEqual(normalized[0].bandIds, normalized[1].bandIds);
  assert.deepEqual(CONFIG.defaults.orbs, configSnapshot);
});

test("collection create, duplicate, find, and remove preserve stable identity and deep ownership", () => {
  const orbs = normalizeOrbCollection(defs(["ORB0", "ORB2"]));
  assert.equal(allocateOrbId(orbs), "ORB3");
  const created = createOrb(orbs);
  assert.equal(created.id, "ORB3");
  const duplicate = duplicateOrb(orbs, "ORB0");
  assert.equal(duplicate.id, "ORB4");
  assert.deepEqual(orbs.map((orb) => orb.id), ["ORB0", "ORB4", "ORB2", "ORB3"]);
  for (const key of ["motion", "response", "particles", "trace", "bandIds"]) assert.notEqual(duplicate[key], orbs[0][key]);
  assert.equal(findOrbById(orbs, "ORB2").id, "ORB2");
  assert.equal(removeOrb(orbs, "ORB2"), true);
  assert.equal(removeOrb(orbs, "missing"), false);
  assert.deepEqual(orbs.map((orb) => orb.id), ["ORB0", "ORB4", "ORB3"]);
});

test("ID-aware Orb reconciliation preserves survivors and freshens additions across zero/one/N", () => {
  const oldSettings = runtime.settings;
  const oldOrbs = [...state.orbs];
  try {
    runtime.settings = { ...structuredClone(CONFIG.defaults), orbs: defs(["A", "B", "C"]) };
    initOrbs();
    const [a, b, c] = state.orbs;
    a.angleRad = 2; c.angleRad = 3;
    a.trail.particles.push({ marker: "a" }); c.trail.emitAccumulator = 7;
    runtime.settings = { ...structuredClone(CONFIG.defaults), orbs: defs(["A", "D", "C"]) };
    reconcileOrbs();
    assert.equal(state.orbs[0], a);
    assert.equal(state.orbs[2], c);
    assert.notEqual(state.orbs[1], b);
    assert.equal(a.angleRad, 2);
    assert.deepEqual(a.trail.particles, [{ marker: "a" }]);
    assert.equal(c.trail.emitAccumulator, 7);
    assert.equal(state.orbs[1].trail.particles.length, 0);
    runtime.settings = { ...structuredClone(CONFIG.defaults), orbs: defs(["C", "A", "D"]) };
    reconcileOrbs();
    assert.deepEqual(state.orbs, [c, a, state.orbs[2]]);
    runtime.settings = { ...structuredClone(CONFIG.defaults), orbs: [] };
    reconcileOrbs();
    assert.equal(state.orbs.length, 0);
    assert.deepEqual(VisualizerRuntime.getVisualizers().map((v) => v.type), ["band-overlay"]);
  } finally {
    VisualizerRuntime.dispose();
    runtime.settings = oldSettings;
    state.orbs.length = 0;
    state.orbs.push(...oldOrbs);
  }
});
