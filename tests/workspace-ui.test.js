import test from "node:test";
import assert from "node:assert/strict";

import { state } from "../src/js/core/state.js";
import { createWorkspaceUi } from "../src/js/ui/workspace.js";

function element(display = "block") {
  const listeners = new Map();
  const classes = new Set();
  return {
    hidden: false,
    style: { display },
    dataset: {},
    attributes: {},
    classes,
    classList: {
      toggle(name, force) { if (force === true) classes.add(name); else if (force === false) classes.delete(name); else if (classes.has(name)) classes.delete(name); else classes.add(name); },
      add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); },
    },
    addEventListener(type, handler) { const list = listeners.get(type) || []; list.push(handler); listeners.set(type, list); },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    contains(target) { return target === this; },
    focus() { globalThis.document.activeElement = this; },
    dispatch(type) { for (const handler of listeners.get(type) || []) handler({ target: this }); },
    listenerCount(type) { return (listeners.get(type) || []).length; },
    getBoundingClientRect() { return { height: 120 }; },
  };
}

test("workspace owns deterministic visibility, restore, focus, record, collapse, and idempotent wiring", () => {
  const previousDocument = globalThis.document;
  const previousHooks = state.recording.hooksEnabled;
  globalThis.document = { activeElement: null, documentElement: { style: { setProperty() {} } } };
  state.recording.hooksEnabled = true;
  const ui = {
    audioPanel: element("grid"), visualizersPanel: element("none"), simPanel: element(), bandsPanel: element(), queuePanel: element(), recordPanel: element(),
    openAudio: element("grid"), openVisualizers: element("grid"), openSim: element("grid"), openBands: element("grid"), openQueue: element("grid"), openRecord: element("grid"),
    btnOpenAudio: element(), btnOpenVisualizers: element(), btnOpenSim: element(), btnOpenBands: element(), btnOpenQueue: element(), btnOpenRecord: element(),
    btnHideAudio: element(), btnHideVisualizers: element(), btnHideSim: element(), btnHideBands: element(), btnHideQueue: element(), btnHideRecord: element(),
    btnTogglePanels: element(), btnToggleWorkspaceLauncher: element(), workspaceLauncher: element(),
    workspaceLauncherCollapsed: true, recordingPanelVisible: true, recordingPanelRestoreAfterGlobalHide: false,
  };
  try {
    const workspace = createWorkspaceUi({ ui, readRecordLauncherLabel: () => "Recording" });
    assert.equal(workspace.init(), true);
    assert.equal(workspace.init(), false);
    assert.equal(ui.btnOpenAudio.listenerCount("click"), 1);
    assert.equal(ui.workspaceLauncher.dataset.collapsed, "true");
    globalThis.document.activeElement = ui.btnOpenVisualizers;
    workspace.showVisualizersPanel();
    assert.equal(ui.visualizersPanel.style.display, "block");
    assert.equal(ui.btnOpenVisualizers.getAttribute("aria-pressed"), "true");
    assert.equal(ui.visualizersPanel.classList.contains("panel-front"), true);
    assert.equal(globalThis.document.activeElement, ui.btnHideVisualizers);
    globalThis.document.activeElement = ui.visualizersPanel;
    workspace.hideVisualizersPanel();
    assert.equal(globalThis.document.activeElement, ui.btnOpenVisualizers);
    workspace.showVisualizersPanel();
    ui.btnOpenAudio.dispatch("click");
    assert.equal(ui.audioPanel.style.display, "none");
    assert.equal(ui.btnOpenAudio.getAttribute("aria-pressed"), "false");
    globalThis.document.activeElement = ui.simPanel;
    workspace.hideSimPanel();
    assert.equal(globalThis.document.activeElement, ui.btnOpenSim);
    assert.equal(ui.workspaceLauncher.dataset.collapsed, "false");
    workspace.togglePanels();
    assert.equal(ui.visualizersPanel.style.display, "none");
    assert.equal(ui.recordPanel.style.display, "none");
    workspace.togglePanels();
    assert.equal(ui.visualizersPanel.style.display, "block");
    assert.equal(ui.recordPanel.style.display, "block");
    workspace.bringPanelForward(ui.bandsPanel);
  } finally {
    state.recording.hooksEnabled = previousHooks;
    globalThis.document = previousDocument;
  }
});
