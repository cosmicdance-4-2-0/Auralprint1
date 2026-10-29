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

test("generated IDs use the first free local name without interpreting existing IDs", () => {
  for (const ids of [[], ["ORB0", "ORB1"], ["ORB0", "ORB42"], ["ORB00042", "ORB43"], ["orb-00", "orb-Z", "orb-1e30"]]) {
    const input = defs(ids), before = structuredClone(input);
    assert.equal(allocateOrbId(input), "orb-0");
    assert.deepEqual(input, before);
  }
  assert.equal(allocateOrbId(defs(["orb-0", "orb-2"])), "orb-1");
  assert.equal(allocateOrbId(defs(Array.from({ length: 11 }, (_, i) => `orb-${i.toString(36)}`))), "orb-b");
});

test("opaque string identities remain unchanged and allow Add and Duplicate", () => {
  const ids = ["ORB0", "ORB1", "ORB9007199254740992", "HISTORICAL-Z", "spectral-ring", "CUSTOM-7", "ORB", "ORB1e30", "ORB-1", "宇宙-🎵"];
  const orbs = normalizeOrbCollection(defs(ids));
  assert.deepEqual(orbs.map((orb) => orb.id), ids);
  assert.equal(createOrb(orbs).id, "orb-0");
  assert.equal(duplicateOrb(orbs, "spectral-ring").id, "orb-1");
  assert.equal(orbs.find((orb) => orb.id === "spectral-ring").id, "spectral-ring");
});

test("collection identity repair reserves later explicit identities", () => {
  const incoming = [{ chanId: "R" }, { id: "ORB0", chanId: "C" }, { id: "HISTORICAL-Z", chanId: "C" }];
  const snapshot = structuredClone(incoming);
  const orbs = normalizeOrbCollection(incoming);
  assert.deepEqual(orbs.map((orb) => orb.id), ["orb-0", "ORB0", "HISTORICAL-Z"]);
  assert.deepEqual(orbs.map((orb) => orb.chanId), ["R", "C", "C"]);
  assert.deepEqual(incoming, snapshot);
});

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
  assert.deepEqual(normalized.map((orb) => orb.id), ["ORB0", "orb-0", "custom-id", "orb-1", "orb-2"]);
  assert.equal(new Set(normalized.map((orb) => orb.id)).size, normalized.length);
  assert.notEqual(normalized[0].motion, normalized[1].motion);
  assert.notEqual(normalized[0].bandIds, normalized[1].bandIds);
  assert.deepEqual(CONFIG.defaults.orbs, configSnapshot);
});

test("collection create, duplicate, find, and remove preserve stable identity and deep ownership", () => {
  const orbs = normalizeOrbCollection(defs(["ORB0", "ORB2"]));
  assert.equal(allocateOrbId(orbs), "orb-0");
  const created = createOrb(orbs);
  assert.equal(created.id, "orb-0");
  const duplicate = duplicateOrb(orbs, "ORB0");
  assert.equal(duplicate.id, "orb-1");
  assert.deepEqual(orbs.map((orb) => orb.id), ["ORB0", "orb-1", "ORB2", "orb-0"]);
  for (const key of ["motion", "response", "particles", "trace", "bandIds"]) assert.notEqual(duplicate[key], orbs[0][key]);
  assert.equal(findOrbById(orbs, "ORB2").id, "ORB2");
  assert.equal(removeOrb(orbs, "ORB2"), true);
  assert.equal(removeOrb(orbs, "missing"), false);
  assert.deepEqual(orbs.map((orb) => orb.id), ["ORB0", "orb-1", "orb-0"]);
});

test("later generator-like IDs keep their first owner through deterministic nonmutating repair", () => {
  const input = ["alpha", undefined, "orb-0", "alpha", "orb-2", undefined].map((id, i) => ({
    id, hueOffsetDeg: i + .123456789, chanId: i % 2 ? "R" : "L",
  }));
  const before = structuredClone(input), normalized = normalizeOrbCollection(input);
  assert.deepEqual(normalized.map(orb => orb.id), ["alpha", "orb-1", "orb-0", "orb-3", "orb-2", "orb-4"]);
  assert.deepEqual(normalized.map(orb => [orb.chanId, orb.hueOffsetDeg]), input.map(orb => [orb.chanId, orb.hueOffsetDeg]));
  assert.deepEqual(normalizeOrbCollection(input), normalized);
  assert.deepEqual(normalizeOrbCollection(normalized), normalized);
  assert.deepEqual(input, before);
});

test("invalid IDs repair under the existing validity rule; accepted strings stay exact", () => {
  const invalid = [undefined, null, 0, false, {}, [], "", " ", " padded "];
  const explicit = ["opaque string", "内側-🎵", "orb-00", "orb-a", "spectral-ring"];
  const normalized = normalizeOrbCollection([...invalid, ...explicit].map(id => ({ id })));
  assert.deepEqual(normalized.slice(0, invalid.length).map(orb => orb.id), invalid.map((_, i) => `orb-${i.toString(36)}`));
  assert.deepEqual(normalized.slice(invalid.length).map(orb => orb.id), explicit);
  assert.equal(new Set(normalized.map(orb => orb.id)).size, normalized.length);
  assert.deepEqual(normalizeOrbCollection([{ id: "one" }]).map(orb => orb.id), ["one"]);
});

test("removal and reorder preserve survivors while Add reuses a free local identity", () => {
  const orbs = normalizeOrbCollection([{}, {}, {}]), [a, b, c] = orbs;
  assert.equal(removeOrb(orbs, b.id), true);
  orbs.reverse();
  const added = createOrb(orbs);
  assert.equal(added.id, b.id);
  assert.deepEqual(orbs, [c, a, added]);
  const copy = duplicateOrb(orbs, a.id), snapshot = structuredClone(a);
  const next = createOrb(orbs);
  assert.notEqual(next.id, copy.id);
  assert.deepEqual(a, snapshot);
  assert.equal(new Set(orbs.map(orb => orb.id)).size, orbs.length);
});

test("a full generated namespace collection remains stable and capacity refuses additions", () => {
  const ids = Array.from({ length: CONFIG.limits.orbs.maxCount }, (_, i) => `orb-${i.toString(36)}`);
  const orbs = normalizeOrbCollection(defs(ids));
  assert.deepEqual(orbs.map(orb => orb.id), ids);
  assert.deepEqual(normalizeOrbCollection(orbs), orbs);
  assert.equal(createOrb(orbs), null);
  assert.equal(duplicateOrb(orbs, ids[0]), null);
  assert.equal(allocateOrbId(orbs), `orb-${ids.length.toString(36)}`);
});

test("ID-aware Orb reconciliation preserves survivors and freshens additions across zero/one/N", () => {
  const oldSettings = runtime.settings;
  const oldOrbs = [...state.orbs];
  try {
    runtime.settings = { ...structuredClone(CONFIG.defaults), orbs: defs(["A", "B", "C"]) };
    initOrbs();
    const [a, b, c] = state.orbs;
    a.angleRad = 2; c.angleRad = 3;
    a.trail.emitAt(1, 2, 0, { marker: "a" }); c.trail.emitAccumulator = 7;
    runtime.settings = { ...structuredClone(CONFIG.defaults), orbs: defs(["A", "D", "C"]) };
    reconcileOrbs();
    assert.equal(state.orbs[0], a);
    assert.equal(state.orbs[2], c);
    assert.notEqual(state.orbs[1], b);
    assert.equal(a.angleRad, 2);
    assert.deepEqual(Array.from(a.trail.particles), [{ xSim: 1, ySim: 2, bornSec: 0, rgbStart: { marker: "a" } }]);
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
    a.trail.emitAt(1, 2, 0, { history: "source" });
    a.trail.emitAccumulator = .5;
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
    const createdRuntime = state.orbs.at(-1);
    const createdAdapter = VisualizerRuntime.getVisualizers().at(-1);
    createdRuntime.angleRad = 2.5;
    createdRuntime.trail.emitAt(3, 4, 0, { history: "removed" });
    createdRuntime.trail.emitAccumulator = .75;

    const duplicate = duplicateRuntimeOrb("A");
    assert.ok(duplicate);
    assert.notEqual(duplicate.id, "A");
    assert.deepEqual({ ...duplicate, id: "A" }, { ...preferences.orbs[0], id: "A" });
    assert.equal(state.orbs.find((orb) => orb.id === "A"), a);
    assert.deepEqual(Array.from(a.trail.particles), [{ xSim: 1, ySim: 2, bornSec: 0, rgbStart: { history: "source" } }]);
    assert.deepEqual(Array.from(state.orbs.find((orb) => orb.id === duplicate.id).trail.particles), []);
    assert.equal(state.orbs.find((orb) => orb.id === duplicate.id).trail.emitAccumulator, 0);
    assert.equal(a.trail.emitAccumulator, .5);
    assert.equal(state.orbs.find((orb) => orb.id === "B"), b);
    assert.equal(VisualizerRuntime.getVisualizers().find((v) => v.id === "B"), bAdapter);

    assert.equal(removeRuntimeOrb(created.id), true);
    assert.equal(preferences.orbs.some((orb) => orb.id === created.id), false);
    assert.equal(state.orbs.find((orb) => orb.id === "A"), a);
    assert.equal(VisualizerRuntime.getVisualizers().find((v) => v.id === "A"), aAdapter);
    // Reusing a freed local name must create new ownership after reconciliation.
    const replacement = createRuntimeOrb();
    assert.equal(replacement.id, created.id);
    const replacementRuntime = state.orbs.find((orb) => orb.id === replacement.id);
    assert.notEqual(replacementRuntime, createdRuntime);
    assert.notEqual(replacementRuntime.trail, createdRuntime.trail);
    assert.deepEqual(Array.from(replacementRuntime.trail.particles), []);
    assert.equal(replacementRuntime.trail.emitAccumulator, 0);
    assert.equal(replacementRuntime.angleRad, replacementRuntime.startAngleRad);
    assert.notEqual(VisualizerRuntime.getVisualizers().find((v) => v.id === replacement.id), createdAdapter);
    assert.equal(state.orbs.find((orb) => orb.id === "A"), a);
    assert.equal(VisualizerRuntime.getVisualizers().find((v) => v.id === "A"), aAdapter);
    assert.equal(a.trail.particles.at(0).rgbStart.history, "source");
    assert.equal(a.trail.emitAccumulator, .5);
    assert.equal(state.orbs.find((orb) => orb.id === "B"), b);
    assert.equal(VisualizerRuntime.getVisualizers().find((v) => v.id === "B"), bAdapter);
    assert.equal(b.trail.emitAccumulator, 9);
    assert.deepEqual(Array.from(state.orbs.find((orb) => orb.id === duplicate.id).trail.particles), []);
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
