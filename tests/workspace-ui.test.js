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

test("RC-13: visible focus owns panel stacking and Queue Hide restores the real toggle", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { activeElement: null, documentElement: { style: { setProperty() {} } } };
  const ui = {};
  for (const key of ["audioPanel", "analysisPanel", "scenePanel", "visualizersPanel", "queuePanel", "recordPanel", "btnToggleWorkspaceLauncher", "btnToggleQueue", "btnHideQueue"]) ui[key] = element();
  const workspace = createWorkspaceUi({ ui });
  try {
    workspace.init();
    assert.equal(workspace.init(), false);
    for (const key of ["analysisPanel", "scenePanel", "visualizersPanel", "queuePanel", "recordPanel"]) {
      ui[key].dispatch("focusin");
      assert.equal(ui[key].classList.contains("panel-front"), true);
      assert.equal(ui[key].listenerCount("focusin"), 1);
      for (const other of ["analysisPanel", "scenePanel", "visualizersPanel", "queuePanel", "recordPanel"]) {
        assert.equal(ui[other].classList.contains("panel-front"), key === other);
      }
    }
    ui.scenePanel.style.display = "none";
    ui.scenePanel.dispatch("focusin");
    assert.equal(ui.recordPanel.classList.contains("panel-front"), true);
    document.activeElement = ui.queuePanel;
    workspace.hideQueuePanel();
    assert.equal(document.activeElement, ui.btnToggleQueue);
    workspace.showQueuePanel();
    assert.equal(document.activeElement, ui.btnHideQueue);
    document.activeElement = ui.btnToggleWorkspaceLauncher;
    workspace.hideQueuePanel();
    assert.equal(document.activeElement, ui.btnToggleWorkspaceLauncher);
  } finally { globalThis.document = previousDocument; }
});

test("workspace owns deterministic visibility, restore, focus, record, collapse, and idempotent wiring", () => {
  const previousDocument = globalThis.document;
  const previousHooks = state.recording.hooksEnabled;
  globalThis.document = { activeElement: null, documentElement: { style: { setProperty() {} } } };
  state.recording.hooksEnabled = true;
  const ui = {
    audioPanel: element("grid"), analysisPanel: element("none"), visualizersPanel: element("none"), scenePanel: element("none"), queuePanel: element(), recordPanel: element(),
    openAudio: element("grid"), openAnalysis: element("grid"), openVisualizers: element("grid"), openScene: element("grid"), openQueue: element("grid"), openRecord: element("grid"),
    btnOpenAudio: element(), btnOpenAnalysis: element(), btnOpenVisualizers: element(), btnOpenScene: element(), btnOpenQueue: element(), btnOpenRecord: element(),
    btnHideAudio: element(), btnHideAnalysis: element(), btnHideVisualizers: element(), btnHideScene: element(), btnHideQueue: element(), btnHideRecord: element(),
    btnTogglePanels: element(), btnToggleWorkspaceLauncher: element(), workspaceLauncher: element(),
    workspaceLauncherCollapsed: true, recordingPanelVisible: true, recordingPanelRestoreAfterGlobalHide: false,
  };
  try {
    const workspace = createWorkspaceUi({ ui, readRecordLauncherLabel: () => "Recording" });
    assert.equal(workspace.init(), true);
    assert.equal(workspace.init(), false);
    assert.equal(ui.btnOpenAudio.listenerCount("click"), 1);
    assert.equal(ui.workspaceLauncher.dataset.collapsed, "true");
    assert.equal(ui.btnOpenScene.title, "Show Settings panel");
    assert.equal(ui.btnOpenScene.getAttribute("aria-label"), "Show Settings panel");
    assert.equal(ui.btnOpenScene.getAttribute("aria-pressed"), "false");
    globalThis.document.activeElement = ui.btnOpenScene;
    ui.btnOpenScene.dispatch("click");
    assert.equal(ui.scenePanel.style.display, "block");
    assert.equal(ui.btnOpenScene.title, "Hide Settings panel");
    assert.equal(ui.btnOpenScene.getAttribute("aria-label"), "Hide Settings panel");
    assert.equal(ui.btnOpenScene.getAttribute("aria-pressed"), "true");
    assert.equal(ui.scenePanel.classList.contains("panel-front"), true);
    assert.equal(globalThis.document.activeElement, ui.btnHideScene);
    globalThis.document.activeElement = ui.scenePanel;
    ui.btnHideScene.dispatch("click");
    assert.equal(globalThis.document.activeElement, ui.btnOpenScene);
    assert.equal(ui.btnOpenScene.title, "Show Settings panel");
    assert.equal(ui.btnOpenScene.getAttribute("aria-label"), "Show Settings panel");
    ui.btnOpenScene.dispatch("click");
    globalThis.document.activeElement = ui.btnOpenAnalysis;
    workspace.showAnalysisPanel();
    assert.equal(ui.analysisPanel.style.display, "block");
    assert.equal(ui.btnOpenAnalysis.getAttribute("aria-pressed"), "true");
    assert.equal(ui.analysisPanel.classList.contains("panel-front"), true);
    assert.equal(globalThis.document.activeElement, ui.btnHideAnalysis);
    globalThis.document.activeElement = ui.analysisPanel;
    workspace.hideAnalysisPanel();
    assert.equal(globalThis.document.activeElement, ui.btnOpenAnalysis);
    workspace.showAnalysisPanel();
    globalThis.document.activeElement = ui.btnOpenVisualizers;
    workspace.showVisualizersPanel();
    assert.equal(ui.analysisPanel.style.display, "block");
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
    assert.equal(ui.workspaceLauncher.dataset.collapsed, "false");
    workspace.togglePanels();
    assert.equal(ui.analysisPanel.style.display, "none");
    assert.equal(ui.visualizersPanel.style.display, "none");
    assert.equal(ui.recordPanel.style.display, "none");
    assert.equal(ui.scenePanel.style.display, "none");
    assert.equal(ui.panelRestoreSnapshot.scene, true);
    assert.deepEqual(Object.keys(ui.panelRestoreSnapshot).sort(), ["analysis", "audio", "queue", "record", "scene", "visualizers"]);
    assert.equal(workspace.showSimPanel, undefined);
    assert.equal(workspace.hideSimPanel, undefined);
    assert.equal(ui.btnOpenScene.title, "Show Settings panel");
    workspace.togglePanels();
    assert.equal(ui.visualizersPanel.style.display, "block");
    assert.equal(ui.recordPanel.style.display, "block");
    assert.equal(ui.scenePanel.style.display, "block");
    assert.equal(ui.btnOpenScene.title, "Hide Settings panel");
    workspace.bringPanelForward(ui.scenePanel);
  } finally {
    state.recording.hooksEnabled = previousHooks;
    globalThis.document = previousDocument;
  }
});

test("Record restore remains eligible only while hooks are enabled", () => {
  const previousDocument = globalThis.document, previousHooks = state.recording.hooksEnabled;
  globalThis.document = { activeElement: null, documentElement: { style: { setProperty() {} } } };
  const ui = { audioPanel: element("grid"), scenePanel: element("none"), visualizersPanel: element("block"), recordPanel: element("block"), openRecord: element(), recordingPanelVisible: true };
  try {
    state.recording.hooksEnabled = true;
    const workspace = createWorkspaceUi({ ui });
    workspace.togglePanels(); assert.equal(ui.recordingPanelRestoreAfterGlobalHide, true);
    state.recording.hooksEnabled = false;
    workspace.togglePanels();
    assert.equal(ui.visualizersPanel.style.display, "block"); assert.equal(ui.audioPanel.style.display, "grid");
    assert.equal(ui.recordPanel.style.display, "none"); assert.equal(ui.recordingPanelVisible, false);
    assert.equal(ui.recordingPanelRestoreAfterGlobalHide, false);
  } finally { globalThis.document = previousDocument; state.recording.hooksEnabled = previousHooks; }
});
