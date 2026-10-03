import test from "node:test";
import assert from "node:assert/strict";

import { createVisualizerInventory, createVisualizersPanelUi } from "../src/js/ui/visualizers-panel.js";

function visualizer(type, id, { visible = true, chanId = "C", bandIds = [] } = {}) {
  return { type, id, orb: type === "orb" ? { id, chanId, bandIds } : undefined, isVisible: () => visible };
}

function element() {
  const listeners = new Map();
  return {
    children: [], textContent: "", disabled: false, title: "", className: "", attributes: {},
    addEventListener(type, fn) { const entries = listeners.get(type) || []; entries.push(fn); listeners.set(type, entries); },
    dispatch(type) { for (const fn of listeners.get(type) || []) fn(); },
    setAttribute(name, value) { this.attributes[name] = value; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes.flatMap((node) => node.isFragment ? node.children : [node]); },
  };
}

function installDocument() {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => element(),
    createDocumentFragment() { const node = element(); node.isFragment = true; return node; },
  };
  return () => { globalThis.document = previous; };
}

test("inventory follows runtime order across Band Overlay and zero/one/two/N Orbs", () => {
  const overlay = visualizer("band-overlay", "band-overlay");
  for (const ids of [[], ["ORB0"], ["ORB0", "ORB7"], ["ORB0", "ORB7", "ORB3", "custom-id"]]) {
    const source = [overlay, ...ids.map((id) => visualizer("orb", id))];
    const model = createVisualizerInventory(source);
    assert.equal(model[0].displayName, "Band Overlay");
    assert.deepEqual(model.slice(1).map((item) => item.displayName), ids.map((_, index) => `Orb ${index + 1}`));
    assert.deepEqual(model.slice(1).map((item) => item.id), ids);
    assert.deepEqual(source.slice(1).map((item) => item.id), ids);
  }
});

test("inventory reports lifecycle visibility, Orb targets, and unknown types truthfully", () => {
  const model = createVisualizerInventory([
    visualizer("band-overlay", "band-overlay", { visible: false }),
    visualizer("orb", "L0", { chanId: "L", bandIds: [] }),
    visualizer("orb", "R0", { chanId: "R", bandIds: [3] }),
    visualizer("orb", "C0", { chanId: "C", bandIds: [1, 9] }),
    visualizer("future-glow", "future", { visible: false }),
  ]);
  assert.equal(model[0].visible, false);
  assert.equal(model[0].summary, "Spectral band visualization");
  assert.equal(model[1].summary, "L0 · L · full spectrum");
  assert.equal(model[2].summary, "R0 · R · 1 band");
  assert.equal(model[3].summary, "C0 · C · 2 bands");
  assert.deepEqual(model[4], { id: "future", type: "future-glow", displayName: "Visualizer", visible: false, summary: "future-glow" });
});

test("panel refresh is reference-guarded, responds to replacement, and disables zero-Orb navigation", () => {
  const restore = installDocument();
  let settings = { revision: 1 };
  let collection = [visualizer("band-overlay", "band-overlay")];
  const ui = { visualizerList: element(), visualizersStatus: element(), btnVisualizersOpenOrbs: element() };
  let replacements = 0;
  const replace = ui.visualizerList.replaceChildren.bind(ui.visualizerList);
  ui.visualizerList.replaceChildren = (...nodes) => { replacements += 1; replace(...nodes); };
  try {
    const panel = createVisualizersPanelUi({ ui, getSettings: () => settings, getVisualizers: () => collection });
    panel.refresh(); panel.refresh(); panel.refresh();
    assert.equal(replacements, 1);
    assert.equal(ui.visualizersStatus.textContent, "1 visualizer · 0 Orbs");
    assert.equal(ui.btnVisualizersOpenOrbs.disabled, true);

    settings = { revision: 2 };
    collection = [collection[0], visualizer("orb", "ORB9", { chanId: "R", bandIds: [2, 4] })];
    panel.refresh();
    assert.equal(replacements, 2);
    assert.equal(ui.visualizersStatus.textContent, "2 visualizers · 1 Orb");
    assert.equal(ui.btnVisualizersOpenOrbs.disabled, false);
  } finally { restore(); }
});

test("panel initialization is idempotent and navigation uses injected callbacks once", () => {
  const restore = installDocument();
  let orbsOpened = 0;
  let bandsOpened = 0;
  const ui = {
    visualizerList: element(), visualizersStatus: element(),
    btnVisualizersOpenOrbs: element(), btnVisualizersOpenBandOverlay: element(),
  };
  try {
    const panel = createVisualizersPanelUi({
      ui,
      getSettings: () => ({}),
      getVisualizers: () => [visualizer("band-overlay", "band-overlay"), visualizer("orb", "ORB0")],
      openOrbControls: () => { orbsOpened += 1; },
      openBandOverlayControls: () => { bandsOpened += 1; },
    });
    assert.equal(panel.init(), true);
    assert.equal(panel.init(), false);
    ui.btnVisualizersOpenOrbs.dispatch("click");
    ui.btnVisualizersOpenBandOverlay.dispatch("click");
    assert.equal(orbsOpened, 1);
    assert.equal(bandsOpened, 1);
  } finally { restore(); }
});
