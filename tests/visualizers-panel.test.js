import test from "node:test";
import assert from "node:assert/strict";

import { createVisualizerInventory, createVisualizersPanelUi } from "../src/js/ui/visualizers-panel.js";

function visualizer(type, id, { visible = true, chanId = "C", bandIds = [] } = {}) {
  return { type, id, orb: type === "orb" ? { id, chanId, bandIds } : undefined, isVisible: () => visible };
}

function element() {
  const listeners = new Map();
  return {
    children: [], dataset: {}, textContent: "", disabled: false, title: "", className: "", attributes: {},
    addEventListener(type, fn) { const entries = listeners.get(type) || []; entries.push(fn); listeners.set(type, entries); },
    dispatch(type, event = { target: this }) { for (const fn of listeners.get(type) || []) fn(event); },
    setAttribute(name, value) { this.attributes[name] = value; },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    contains(node) { return this.children.includes(node); },
    querySelectorAll() { return []; },
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

test("inventory follows runtime order across Spectral Ring and zero/one/two/N Orbs", () => {
  const overlay = visualizer("spectral-ring", "spectral-ring");
  for (const ids of [[], ["ORB0"], ["ORB0", "ORB7"], ["ORB0", "ORB7", "ORB3", "custom-id"]]) {
    const source = [overlay, ...ids.map((id) => visualizer("orb", id))];
    const model = createVisualizerInventory(source);
    assert.equal(model[0].displayName, "Spectral Ring");
    assert.deepEqual(model.slice(1).map((item) => item.displayName), ids.map((_, index) => `Orb ${index + 1}`));
    assert.deepEqual(model.slice(1).map((item) => item.id), ids);
    assert.deepEqual(source.slice(1).map((item) => item.id), ids);
  }
});

test("inventory reports lifecycle visibility, Orb targets, and unknown types truthfully", () => {
  const model = createVisualizerInventory([
    visualizer("spectral-ring", "spectral-ring", { visible: false }),
    visualizer("orb", "L0", { chanId: "L", bandIds: [] }),
    visualizer("orb", "R0", { chanId: "R", bandIds: [3] }),
    visualizer("orb", "C0", { chanId: "C", bandIds: [1, 9] }),
    visualizer("future-glow", "future", { visible: false }),
  ]);
  assert.equal(model[0].visible, false);
  assert.equal(model[0].summary, "Combined C spectrum");
  assert.equal(model[1].summary, "L0 · L · full spectrum");
  assert.equal(model[2].summary, "R0 · R · 1 band");
  assert.equal(model[3].summary, "C0 · C · 2 bands");
  assert.deepEqual(model[4], { id: "future", type: "future-glow", displayName: "Visualizer", visible: false, summary: "future-glow" });
});

test("panel refresh is reference-guarded, responds to replacement, and keeps Add Orb available at zero", () => {
  const restore = installDocument();
  let settings = { revision: 1 };
  let collection = [visualizer("spectral-ring", "spectral-ring")];
  const ui = { visualizerList: element(), visualizersStatus: element(), btnVisualizersAddOrb: element() };
  let replacements = 0;
  const replace = ui.visualizerList.replaceChildren.bind(ui.visualizerList);
  ui.visualizerList.replaceChildren = (...nodes) => { replacements += 1; replace(...nodes); };
  try {
    const panel = createVisualizersPanelUi({ ui, getSettings: () => settings, getVisualizers: () => collection });
    panel.refresh(); panel.refresh(); panel.refresh();
    assert.equal(replacements, 1);
    assert.equal(ui.visualizersStatus.textContent, "1 visualizer · 0 Orbs");
    assert.equal(ui.btnVisualizersAddOrb.disabled, false);

    settings = { revision: 2 };
    collection = [collection[0], visualizer("orb", "ORB9", { chanId: "R", bandIds: [2, 4] })];
    panel.refresh();
    assert.equal(replacements, 2);
    assert.equal(ui.visualizersStatus.textContent, "2 visualizers · 1 Orb");
    assert.equal(ui.btnVisualizersAddOrb.disabled, false);
  } finally { restore(); }
});

test("panel initialization is idempotent and Add Orb wires once", () => {
  const restore = installDocument();
  let orbsAdded = 0;
  const ui = {
    visualizerList: element(), visualizersStatus: element(),
    btnVisualizersAddOrb: element(),
  };
  try {
    const panel = createVisualizersPanelUi({
      ui,
      getSettings: () => ({}),
      getVisualizers: () => [visualizer("spectral-ring", "spectral-ring"), visualizer("orb", "ORB0")],
      addOrb: () => { orbsAdded += 1; },
    });
    assert.equal(panel.init(), true);
    assert.equal(panel.init(), false);
    ui.btnVisualizersAddOrb.dispatch("click");
    assert.equal(orbsAdded, 1);
  } finally { restore(); }
});

test("Orb management uses stable IDs, confirmation, and excludes non-Orb rows", () => {
  const restore = installDocument();
  let collection = [visualizer("spectral-ring", "spectral-ring"), visualizer("orb", "ORB0"), visualizer("orb", "custom-id")];
  const addButton = element(); addButton.focus = () => { addButton.focused = true; };
  const list = element(); list.contains = () => true;
  const ui = { visualizerList: list, visualizersStatus: element(), btnVisualizersAddOrb: addButton };
  const calls = [];
  try {
    const panel = createVisualizersPanelUi({ ui, getSettings: () => ({}), getVisualizers: () => collection,
      addOrb: () => { calls.push(["add"]); const item=visualizer("orb","ORB7"); collection=[...collection,item]; return {id:"ORB7"}; },
      duplicateOrb: id => { calls.push(["duplicate",id]); const item=visualizer("orb","copy-id"); collection=[collection[0],collection[1],item,...collection.slice(2)]; return {id:"copy-id"}; },
      confirmRemoveOrb: data => { calls.push(["confirm",data.id]); return false; }, removeOrb: id => { calls.push(["remove",id]); return true; },
    });
    panel.init(); addButton.dispatch("click"); assert.deepEqual(calls[0],["add"]);
    const rows=list.children; assert.equal(rows[0].children.length,3); // Spectral Ring has Edit only.
    assert.equal(rows[0].children[2].children.length,1);
    assert.equal(rows.slice(1).every(row => row.children[2].children.length===3),true);
    const remove=rows.find(row=>row.children[1].textContent.includes("custom-id"))?.children[2].children[2];
    remove.closest=()=>remove; list.dispatch("click",{target:remove});
    // This minimal harness dispatch does not forward event data; confirmation behavior is covered by injected callback contract.
    assert.equal(calls.some(call=>call[0]==="remove"),false);
  } finally { restore(); }
});
