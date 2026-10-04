import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../src/js/core/config.js";
import { allocateOrbId, createOrb, duplicateOrb, findOrbById, normalizeOrbCollection, removeOrb } from "../src/js/core/orb-collection.js";
import { preferences, replacePreferences, resolveSettings, runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { createRuntimeOrb, duplicateRuntimeOrb, initOrbs, reconcileOrbs, removeRuntimeOrb, resetVisualizers, syncOrbsFromSettings } from "../src/js/render/orb-runtime.js";
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
    assert.deepEqual(VisualizerRuntime.getVisualizers().map((v) => v.type), ["spectral-ring"]);
  } finally {
    VisualizerRuntime.dispose();
    runtime.settings = oldSettings;
    state.orbs.length = 0;
    state.orbs.push(...oldOrbs);
  }
});

test("runtime collection APIs mutate preferences and reconcile Orbs and adapters by stable ID", () => {
  const oldPreferences = structuredClone(preferences);
  const oldOrbs = [...state.orbs];
  try {
    replacePreferences({ ...structuredClone(CONFIG.defaults), orbs: defs(["A", "B"]) });
    resolveSettings();
    initOrbs();
    const [a, b] = state.orbs;
    a.angleRad = 1.25;
    a.trail.particles.push({ history: "source" });
    b.trail.emitAccumulator = 9;
    const [, aAdapter, bAdapter] = VisualizerRuntime.getVisualizers();

    const created = createRuntimeOrb();
    assert.equal(preferences.orbs.at(-1), created);
    assert.equal(runtime.settings.orbs.at(-1).id, created.id);
    assert.equal(state.orbs.length, 3);
    assert.equal(VisualizerRuntime.getVisualizers().length, 4);
    assert.equal(state.orbs[0], a);
    assert.equal(a.angleRad, 1.25);
    assert.equal(VisualizerRuntime.getVisualizers()[1], aAdapter);

    const duplicate = duplicateRuntimeOrb("A");
    assert.ok(duplicate);
    assert.notEqual(duplicate.id, "A");
    assert.deepEqual({ ...duplicate, id: "A" }, { ...preferences.orbs[0], id: "A" });
    assert.equal(state.orbs.find((orb) => orb.id === "A"), a);
    assert.deepEqual(a.trail.particles, [{ history: "source" }]);
    assert.deepEqual(state.orbs.find((orb) => orb.id === duplicate.id).trail.particles, []);
    assert.equal(state.orbs.find((orb) => orb.id === "B"), b);
    assert.equal(VisualizerRuntime.getVisualizers().find((v) => v.id === "B"), bAdapter);

    assert.equal(removeRuntimeOrb(created.id), true);
    assert.equal(preferences.orbs.some((orb) => orb.id === created.id), false);
    assert.equal(state.orbs.find((orb) => orb.id === "A"), a);
    assert.equal(VisualizerRuntime.getVisualizers().find((v) => v.id === "A"), aAdapter);
    assert.equal(removeRuntimeOrb("unknown"), false);
    assert.equal(state.orbs.find((orb) => orb.id === "B"), b);
    for (const id of [...preferences.orbs.map((orb) => orb.id)]) assert.equal(removeRuntimeOrb(id), true);
    assert.deepEqual(preferences.orbs, []);
    assert.deepEqual(state.orbs, []);
    assert.deepEqual(VisualizerRuntime.getVisualizers().map((v) => v.type), ["spectral-ring"]);
  } finally {
    VisualizerRuntime.dispose();
    replacePreferences(oldPreferences);
    resolveSettings();
    state.orbs.length = 0;
    state.orbs.push(...oldOrbs);
  }
});

test("designed phase sync does not teleport live phase until Reset Visuals", () => {
  const old = structuredClone(preferences);
  try {
    replacePreferences({ ...structuredClone(CONFIG.defaults), orbs: defs(["A"]) });
    resolveSettings(); initOrbs();
    state.orbs[0].angleRad = 1.234;
    preferences.orbs[0].startAngleRad = Math.PI;
    resolveSettings(); syncOrbsFromSettings();
    assert.equal(state.orbs[0].startAngleRad, Math.PI);
    assert.equal(state.orbs[0].angleRad, 1.234);
    resetVisualizers("visuals");
    assert.equal(state.orbs[0].angleRad, Math.PI);
  } finally { replacePreferences(old); resolveSettings(); initOrbs(); }
});

test("ten differently targeted Orbs reset and advance in same-phase groups", () => {
  const old = structuredClone(preferences);
  try {
    const scene = defs(Array.from({ length: 10 }, (_, i) => `group-${i}`));
    scene.forEach((orb, i) => { orb.bandIds = [i * 3]; orb.startAngleRad = i < 5 ? Math.PI / 4 : Math.PI; orb.chirality = i < 5 ? 1 : -1; orb.motion.angularSpeedRadPerSec = i < 5 ? .5 : .75; });
    replacePreferences({ ...structuredClone(CONFIG.defaults), orbs: scene }); resolveSettings(); initOrbs();
    state.orbs.forEach((orb, i) => { orb.angleRad = i / 10; }); resetVisualizers("visuals");
    assert.ok(state.orbs.slice(0,5).every(orb=>orb.angleRad===Math.PI/4)); assert.ok(state.orbs.slice(5).every(orb=>orb.angleRad===Math.PI));
    state.orbs.forEach(orb=>orb.step(.1,1,null,0,0));
    assert.ok(state.orbs.slice(0,5).every(orb=>orb.angleRad===state.orbs[0].angleRad)); assert.ok(state.orbs.slice(5).every(orb=>orb.angleRad===state.orbs[5].angleRad));
  } finally { replacePreferences(old); resolveSettings(); initOrbs(); }
});
