import test from "node:test";
import assert from "node:assert/strict";
import { preferences, runtime, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { isValidOrbId } from "../src/js/core/orb-collection.js";
import { sanitizePreset, encodePresetPayload } from "../src/js/presets/preset-codec.js";
import { initOrbs, reconcileOrbs, removeRuntimeOrb, createRuntimeOrb, duplicateRuntimeOrb } from "../src/js/render/orb-runtime.js";
import { VisualizerRuntime } from "../src/js/render/visualizer-runtime.js";
import { createVisualizerInventory, createVisualizersPanelUi } from "../src/js/ui/visualizers-panel.js";
import { installUiDocument } from "./helpers/ui-dom.js";

function scene(ids, run) {
  const saved = { prefs: structuredClone(preferences), settings: runtime.settings, orbs: state.orbs };
  const dom = installUiDocument();
  state.orbs = [];
  const confirmations = [], removed = [], edited = [], disposed = [];
  let accept = false, failRemoval = false;
  try {
    replacePreferences(sanitizePreset({ schema: 10, prefs: { orbs: ids.map(id => ({ id })) } }));
    resolveSettings(); initOrbs();
    const ring = VisualizerRuntime.getVisualizers()[0];
    for (const visualizer of VisualizerRuntime.getVisualizers()) {
      const original = visualizer.dispose;
      visualizer.dispose = () => { disposed.push([visualizer.type, visualizer.id]); original.call(visualizer); };
    }
    const ui = { visualizerList: dom.element(), visualizersStatus: dom.element(), btnVisualizersAddOrb: dom.element("button") };
    const panel = createVisualizersPanelUi({ ui, getSettings: () => runtime.settings, getVisualizers: VisualizerRuntime.getVisualizers,
      confirmRemoveOrb: payload => { confirmations.push(payload); return accept; },
      removeOrb: id => { removed.push(id); return failRemoval ? false : removeRuntimeOrb(id); },
      addOrb: createRuntimeOrb, duplicateOrb: duplicateRuntimeOrb, editOrb: id => edited.push(id),
    });
    const button = (action, id) => Array.from(ui.visualizerList.querySelectorAll(`[data-action="${action}"]`)).find(el => el.dataset.orbId === id);
    panel.init();
    return run({ dom, ui, panel, ring, button, confirmations, removed, edited, disposed,
      accept(value = true) { accept = value; }, failRemoval() { failRemoval = true; } });
  } finally {
    VisualizerRuntime.dispose();
    for (const orb of state.orbs) orb.trail.dispose();
    replacePreferences(saved.prefs); runtime.settings = saved.settings; state.orbs = saved.orbs; dom.restore();
  }
}

const idsNow = () => state.orbs.map(orb => orb.id);
const persistedIds = () => encodePresetPayload(preferences).prefs.orbs.map(orb => orb.id);
const confirmText = payload => `Remove ${payload.displayName} (${payload.id})? This cannot be undone.`;

test("RC-22: collision cancellation/acceptance through generated button delegation preserves Ring and survivor", t => scene(["spectral-ring", "ORB1"], h => {
  const inventory = createVisualizerInventory(VisualizerRuntime.getVisualizers());
  assert.deepEqual(inventory.filter(item => item.id === "spectral-ring").map(item => item.type), ["spectral-ring", "orb"]);
  const target = state.orbs[0], survivor = state.orbs[1], adapter = VisualizerRuntime.getVisualizers()[2];
  survivor.angleRad = 1.25; survivor.trail.emitAt(1, 2, 0, { r: 1, g: 0, b: 0 });
  const tail = survivor.trail.particles.tail, governor = survivor.trail.governor;
  const remove = h.button("remove", "spectral-ring");
  assert.equal(remove.dataset.action, "remove"); assert.equal(remove.dataset.orbId, "spectral-ring");
  assert.equal(remove.getAttribute("aria-label"), "Remove Orb 1, spectral-ring");
  remove.focus(); const settings = runtime.settings, collection = VisualizerRuntime.getVisualizers(), rebuilds = h.ui.visualizerList.replacements;
  // A nested target must bubble through the actual generated button and list.
  const child = h.dom.element("span"); remove.appendChild(child); child.click();
  assert.deepEqual(h.confirmations, [{ id: "spectral-ring", displayName: "Orb 1" }]);
  assert.equal(confirmText(h.confirmations[0]), "Remove Orb 1 (spectral-ring)? This cannot be undone.");
  assert.deepEqual(h.removed, []); assert.deepEqual(idsNow(), ["spectral-ring", "ORB1"]);
  assert.deepEqual(persistedIds(), idsNow()); assert.equal(state.orbs[0], target);
  assert.equal(runtime.settings, settings); assert.equal(VisualizerRuntime.getVisualizers(), collection);
  assert.ok(document.activeElement === remove, "focus must remain on the expected control"); assert.equal(h.ui.visualizerList.replacements, rebuilds);
  assert.deepEqual(h.disposed, []);
  h.accept(); child.click();
  assert.equal(h.confirmations.length, 2); assert.deepEqual(h.removed, ["spectral-ring"]);
  assert.deepEqual(idsNow(), ["ORB1"]); assert.deepEqual(persistedIds(), ["ORB1"]);
  assert.equal(VisualizerRuntime.getVisualizers()[0], h.ring); assert.equal(VisualizerRuntime.getVisualizers()[1], adapter);
  assert.equal(state.orbs[0], survivor); assert.equal(survivor.angleRad, 1.25);
  assert.equal(survivor.trail.particles.tail, tail); assert.equal(survivor.trail.governor, governor);
  assert.deepEqual(h.disposed, [["orb", "spectral-ring"]]);
  assert.ok(document.activeElement === h.button("edit", "ORB1"), "focus must remain on the expected control");
  assert.equal(h.ui.visualizerList.replacements, rebuilds + 1);
  t.diagnostic(JSON.stringify({ confirmation: confirmText(h.confirmations[0]), persisted: persistedIds(), ringSurvived: true, focus: document.activeElement.dataset }));
}));

test("RC-22: reorder numbers and middle/end/empty nearest-survivor focus follow current runtime order", () => scene(["A", "B", "C", "D"], h => {
  const objects = new Map(state.orbs.map(orb => [orb.id, orb]));
  preferences.orbs.reverse(); resolveSettings(); reconcileOrbs(); h.panel.refresh();
  for (const orb of state.orbs) assert.equal(orb, objects.get(orb.id));
  h.accept(); h.button("remove", "C").click();
  assert.deepEqual(h.confirmations[0], { id: "C", displayName: "Orb 2" });
  assert.deepEqual(idsNow(), ["D", "B", "A"]); assert.ok(document.activeElement === h.button("edit", "B"), "focus must remain on the expected control");
  h.button("remove", "A").click(); assert.ok(document.activeElement === h.button("edit", "B"), "focus must remain on the expected control");
  h.button("remove", "D").click(); assert.ok(document.activeElement === h.button("edit", "B"), "focus must remain on the expected control");
  h.button("remove", "B").click();
  assert.deepEqual(idsNow(), []); assert.deepEqual(persistedIds(), []);
  assert.ok(document.activeElement === h.ui.btnVisualizersAddOrb, "focus must remain on the expected control");
  assert.deepEqual(VisualizerRuntime.getVisualizers(), [h.ring]);
}));

for (const id of ["spectral-ring", "ORB0", "ORB123", "custom string", 'custom![]#"<>&']) {
  test(`RC-22: accepted opaque ID ${JSON.stringify(id)} remains safe and removable`, () => scene([id], h => {
    assert.equal(isValidOrbId(id), true); assert.deepEqual(persistedIds(), [id]);
    const remove = h.button("remove", id); assert.equal(remove.dataset.orbId, id);
    h.accept(); remove.click();
    assert.deepEqual(h.confirmations, [{ id, displayName: "Orb 1" }]); assert.deepEqual(h.removed, [id]);
    assert.deepEqual(idsNow(), []); assert.deepEqual(persistedIds(), []);
    assert.deepEqual(VisualizerRuntime.getVisualizers(), [h.ring]);
    assert.ok(document.activeElement === h.ui.btnVisualizersAddOrb, "focus must remain on the expected control");
  }));
}

test("RC-22: stale missing target cannot confirm or remove a matching Ring", () => scene(["spectral-ring", "B"], h => {
  const stale = h.button("remove", "spectral-ring"); stale.focus();
  assert.equal(removeRuntimeOrb("spectral-ring"), true);
  const rebuilds = h.ui.visualizerList.replacements, disposed = [...h.disposed];
  h.accept(); assert.doesNotThrow(() => stale.click());
  assert.deepEqual(h.confirmations, []); assert.deepEqual(h.removed, []);
  assert.ok(document.activeElement === stale, "focus must remain on the expected control"); assert.equal(h.ui.visualizerList.replacements, rebuilds);
  assert.deepEqual(idsNow(), ["B"]); assert.deepEqual(persistedIds(), ["B"]);
  assert.equal(VisualizerRuntime.getVisualizers()[0], h.ring); assert.deepEqual(h.disposed, disposed);
}));

test("RC-22: failed removal keeps focus, settings and list; refresh/init do not duplicate listeners", () => scene(["A", "B"], h => {
  h.failRemoval(); h.accept(); const button = h.button("remove", "A"); button.focus();
  const settings = runtime.settings, collection = VisualizerRuntime.getVisualizers(), rebuilds = h.ui.visualizerList.replacements;
  assert.equal(h.panel.init(), false);
  for (let i = 0; i < 10; i++) assert.equal(h.panel.refresh(), false);
  assert.equal(h.ui.visualizerList.listenerCount("click"), 1);
  assert.equal(h.ui.btnVisualizersAddOrb.listenerCount("click"), 1);
  button.click();
  assert.equal(h.confirmations.length, 1); assert.deepEqual(h.removed, ["A"]);
  assert.deepEqual(idsNow(), ["A", "B"]); assert.equal(runtime.settings, settings);
  assert.equal(VisualizerRuntime.getVisualizers(), collection); assert.deepEqual(h.disposed, []);
  assert.ok(document.activeElement === button, "focus must remain on the expected control"); assert.equal(h.ui.visualizerList.replacements, rebuilds);
}));

test("RC-22: generated Edit/Add/Duplicate actions retain stable IDs, numbering and focus", () => scene(["spectral-ring", "ORB1"], h => {
  h.button("edit", "spectral-ring").click(); assert.deepEqual(h.edited, ["spectral-ring"]);
  const original = state.orbs[0]; original.angleRad = 1.25;
  h.button("duplicate", "spectral-ring").click();
  assert.deepEqual(idsNow(), ["spectral-ring", "ORB2", "ORB1"]);
  assert.ok(document.activeElement === h.button("edit", "ORB2"), "focus must remain on the expected control"); assert.equal(state.orbs[0], original);
  assert.notEqual(state.orbs[1], original); assert.equal(state.orbs[1].angleRad, state.orbs[1].startAngleRad);
  h.ui.btnVisualizersAddOrb.click();
  assert.deepEqual(idsNow(), ["spectral-ring", "ORB2", "ORB1", "ORB3"]);
  assert.ok(document.activeElement === h.button("edit", "ORB3"), "focus must remain on the expected control");
  assert.deepEqual(persistedIds(), idsNow()); assert.equal(VisualizerRuntime.getVisualizers()[0], h.ring);
}));
