import { state } from "../core/state.js";

function createWorkspaceUi({ ui = state.ui, readRecordLauncherLabel = () => "Recording" } = {}) {
  let initializedOn = null;
  let refreshQueuePanel = () => {};

  function isPanelVisible(panel) {
    return !!(panel && !panel.hidden && panel.style.display !== "none");
  }

  function syncLauncherControl(launcher, button, { visible = true, active = false, label = "" } = {}) {
    if (!launcher) return;
    launcher.hidden = !visible;
    launcher.setAttribute("aria-hidden", visible ? "false" : "true");
    launcher.style.display = visible ? "grid" : "none";
    launcher.classList.toggle("is-active", !!active);
    if (!button) return;
    button.setAttribute("aria-pressed", active ? "true" : "false");
    if (label) {
      if (button.title !== label) button.title = label;
      if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
    }
  }

  function syncLauncherState() {
    syncLauncherControl(ui.openAudio, ui.btnOpenAudio, { active: isPanelVisible(ui.audioPanel), label: isPanelVisible(ui.audioPanel) ? "Hide audio source panel" : "Show audio source panel" });
    syncLauncherControl(ui.openAnalysis, ui.btnOpenAnalysis, { active: isPanelVisible(ui.analysisPanel), label: isPanelVisible(ui.analysisPanel) ? "Hide Analysis panel" : "Show Analysis panel" });
    syncLauncherControl(ui.openVisualizers, ui.btnOpenVisualizers, { active: isPanelVisible(ui.visualizersPanel), label: isPanelVisible(ui.visualizersPanel) ? "Hide Visualizers panel" : "Show Visualizers panel" });
    syncLauncherControl(ui.openScene, ui.btnOpenScene, { active: isPanelVisible(ui.scenePanel), label: isPanelVisible(ui.scenePanel) ? "Hide Settings panel" : "Show Settings panel" });
    syncLauncherControl(ui.openRecord, ui.btnOpenRecord, {
      visible: !!state.recording?.hooksEnabled,
      active: !!ui.recordingPanelVisible,
      label: readRecordLauncherLabel(state.recording, !!ui.recordingPanelVisible),
    });
  }

  function setLauncherCollapsed(collapsed) {
    ui.workspaceLauncherCollapsed = !!collapsed;
    if (ui.workspaceLauncher) ui.workspaceLauncher.dataset.collapsed = ui.workspaceLauncherCollapsed ? "true" : "false";
    if (!ui.btnToggleWorkspaceLauncher) return;
    const label = ui.workspaceLauncherCollapsed ? "Expand launcher bar" : "Collapse launcher bar";
    ui.btnToggleWorkspaceLauncher.title = label;
    ui.btnToggleWorkspaceLauncher.setAttribute("aria-label", label);
    ui.btnToggleWorkspaceLauncher.setAttribute("aria-expanded", ui.workspaceLauncherCollapsed ? "false" : "true");
    ui.btnToggleWorkspaceLauncher.textContent = ui.workspaceLauncherCollapsed ? "⌃" : "⌄";
  }

  function toggleLauncherCollapsed() { setLauncherCollapsed(!ui.workspaceLauncherCollapsed); }
  function bringPanelForward(panel) {
    for (const candidate of [ui.visualizersPanel, ui.analysisPanel, ui.scenePanel, ui.queuePanel, ui.recordPanel]) {
      if (candidate) candidate.classList.toggle("panel-front", candidate === panel);
    }
  }
  function restoreLauncherFocus(button) { setLauncherCollapsed(false); if (button) button.focus(); }

  // Audio dock height is panel-shell geometry, so it lives with workspace visibility.
  function syncAudioDockHeight() {
    if (!ui.audioPanel || typeof ui.audioPanel.getBoundingClientRect !== "function") return;
    const height = isPanelVisible(ui.audioPanel) ? Math.ceil(ui.audioPanel.getBoundingClientRect().height) : 0;
    if (height === ui.audioDockHeight) return;
    ui.audioDockHeight = height;
    document.documentElement.style.setProperty("--ui-audio-h", `${height}px`);
  }

  function hideQueuePanel() {
    if (!ui.queuePanel) return;
    const restoreFocus = document.activeElement && ui.queuePanel.contains(document.activeElement);
    ui.queuePanel.style.display = "none";
    syncLauncherState();
    if (restoreFocus) {
      const restoreTarget = isPanelVisible(ui.audioPanel) && ui.btnToggleQueue
        ? ui.btnToggleQueue
        : ui.btnOpenAudio;
      restoreLauncherFocus(restoreTarget);
    }
  }
  function showQueuePanel() { if (!ui.queuePanel) return; ui.queuePanel.style.display = "block"; refreshQueuePanel(); bringPanelForward(ui.queuePanel); syncLauncherState(); if (document.activeElement === ui.btnToggleQueue && ui.btnHideQueue) ui.btnHideQueue.focus(); }
  function hideAudioPanel() { ui.audioPanel.style.display = "none"; syncAudioDockHeight(); syncLauncherState(); if (document.activeElement && ui.audioPanel.contains(document.activeElement)) restoreLauncherFocus(ui.btnOpenAudio); }
  function showAudioPanel() { ui.audioPanel.style.display = "grid"; syncAudioDockHeight(); syncLauncherState(); if (document.activeElement === ui.btnOpenAudio) ui.btnHideAudio.focus(); }
  function hideAnalysisPanel() { if (!ui.analysisPanel) return; ui.analysisPanel.style.display = "none"; syncLauncherState(); if (document.activeElement && ui.analysisPanel.contains(document.activeElement)) restoreLauncherFocus(ui.btnOpenAnalysis); }
  function showAnalysisPanel() { if (!ui.analysisPanel) return; ui.analysisPanel.style.display = "block"; bringPanelForward(ui.analysisPanel); syncLauncherState(); if (document.activeElement === ui.btnOpenAnalysis) ui.btnHideAnalysis.focus(); }
  function hideScenePanel() { ui.scenePanel.style.display = "none"; syncLauncherState(); if (document.activeElement && ui.scenePanel.contains(document.activeElement)) restoreLauncherFocus(ui.btnOpenScene); }
  function showScenePanel() { ui.scenePanel.style.display = "block"; bringPanelForward(ui.scenePanel); syncLauncherState(); if (document.activeElement === ui.btnOpenScene) ui.btnHideScene.focus(); }
  function hideVisualizersPanel() { if (!ui.visualizersPanel) return; ui.visualizersPanel.style.display = "none"; syncLauncherState(); if (document.activeElement && ui.visualizersPanel.contains(document.activeElement)) restoreLauncherFocus(ui.btnOpenVisualizers); }
  function showVisualizersPanel() { if (!ui.visualizersPanel) return; ui.visualizersPanel.style.display = "block"; bringPanelForward(ui.visualizersPanel); syncLauncherState(); if (document.activeElement === ui.btnOpenVisualizers && ui.btnHideVisualizers) ui.btnHideVisualizers.focus(); }

  function setRecordPanelVisibility(visible) {
    if (!ui.recordPanel || !ui.openRecord) return;
    const nextVisible = !!visible && !!state.recording.hooksEnabled;
    ui.recordingPanelVisible = nextVisible;
    ui.recordPanel.hidden = !nextVisible;
    ui.recordPanel.setAttribute("aria-hidden", nextVisible ? "false" : "true");
    ui.recordPanel.style.display = nextVisible ? "block" : "none";
    syncLauncherState();
  }
  function hideRecordPanel(options = {}) { if (!ui.recordPanel || !ui.openRecord) return; if (!options.preserveRestoreFlag) ui.recordingPanelRestoreAfterGlobalHide = false; setRecordPanelVisibility(false); if (document.activeElement && ui.recordPanel.contains(document.activeElement) && ui.btnOpenRecord) restoreLauncherFocus(ui.btnOpenRecord); }
  function showRecordPanel() { if (!ui.recordPanel || !ui.openRecord || !state.recording.hooksEnabled) return; ui.recordingPanelRestoreAfterGlobalHide = false; setRecordPanelVisibility(true); bringPanelForward(ui.recordPanel); if (document.activeElement === ui.btnOpenRecord && ui.btnHideRecord) ui.btnHideRecord.focus(); }
  function primeRecordUi() { if (!ui.recordPanel || !ui.openRecord) return; if (!state.recording.hooksEnabled) ui.recordingPanelRestoreAfterGlobalHide = false; setRecordPanelVisibility(!!state.recording.hooksEnabled && !!ui.recordingPanelVisible); }

  function togglePanels() {
    const visible = { audio: isPanelVisible(ui.audioPanel), visualizers: isPanelVisible(ui.visualizersPanel), analysis: isPanelVisible(ui.analysisPanel), scene: isPanelVisible(ui.scenePanel), queue: isPanelVisible(ui.queuePanel), record: isPanelVisible(ui.recordPanel) };
    if (Object.values(visible).some(Boolean)) {
      ui.panelRestoreSnapshot = visible;
      ui.recordingPanelRestoreAfterGlobalHide = visible.record;
      hideAudioPanel(); hideAnalysisPanel(); hideVisualizersPanel(); hideScenePanel(); hideQueuePanel();
      if (visible.record) hideRecordPanel({ preserveRestoreFlag: true });
      return;
    }
    const restore = ui.panelRestoreSnapshot || { audio: true };
    if (restore.audio) showAudioPanel(); if (restore.analysis) showAnalysisPanel(); if (restore.visualizers) showVisualizersPanel(); if (restore.scene) showScenePanel(); if (restore.queue) showQueuePanel();
    const restoreRecord = !!ui.recordingPanelRestoreAfterGlobalHide;
    ui.recordingPanelRestoreAfterGlobalHide = false;
    if (restoreRecord) showRecordPanel();
  }

  function init({ onRefreshQueuePanel } = {}) {
    if (typeof onRefreshQueuePanel === "function") refreshQueuePanel = onRefreshQueuePanel;
    if (initializedOn === ui.btnToggleWorkspaceLauncher) return false;
    initializedOn = ui.btnToggleWorkspaceLauncher;
    setLauncherCollapsed(!!ui.workspaceLauncherCollapsed);
    primeRecordUi();
    if (ui.btnToggleWorkspaceLauncher) ui.btnToggleWorkspaceLauncher.addEventListener("click", toggleLauncherCollapsed);
    for (const [button, panel, hide, show] of [[ui.btnOpenAudio, ui.audioPanel, hideAudioPanel, showAudioPanel], [ui.btnOpenAnalysis, ui.analysisPanel, hideAnalysisPanel, showAnalysisPanel], [ui.btnOpenVisualizers, ui.visualizersPanel, hideVisualizersPanel, showVisualizersPanel], [ui.btnOpenScene, ui.scenePanel, hideScenePanel, showScenePanel]]) {
      if (button) button.addEventListener("click", () => isPanelVisible(panel) ? hide() : show());
    }
    if (ui.btnHideAudio) ui.btnHideAudio.addEventListener("click", hideAudioPanel);
    if (ui.btnHideAnalysis) ui.btnHideAnalysis.addEventListener("click", hideAnalysisPanel);
    if (ui.btnHideVisualizers) ui.btnHideVisualizers.addEventListener("click", hideVisualizersPanel);
    if (ui.btnHideScene) ui.btnHideScene.addEventListener("click", hideScenePanel);
    if (ui.btnHideQueue) ui.btnHideQueue.addEventListener("click", hideQueuePanel);
    if (ui.btnTogglePanels) ui.btnTogglePanels.addEventListener("click", togglePanels);
    if (ui.btnHideRecord) ui.btnHideRecord.addEventListener("click", hideRecordPanel);
    if (ui.btnOpenRecord) ui.btnOpenRecord.addEventListener("click", () => ui.recordingPanelVisible ? hideRecordPanel() : showRecordPanel());
    for (const panel of [ui.visualizersPanel, ui.analysisPanel, ui.scenePanel, ui.queuePanel, ui.recordPanel]) if (panel) {
      panel.addEventListener("pointerdown", () => bringPanelForward(panel));
      panel.addEventListener("focusin", () => { if (isPanelVisible(panel)) bringPanelForward(panel); });
    }
    if (ui.audioDockObserver) ui.audioDockObserver.disconnect();
    if (typeof ResizeObserver === "function") { ui.audioDockObserver = new ResizeObserver(syncAudioDockHeight); ui.audioDockObserver.observe(ui.audioPanel); }
    syncAudioDockHeight(); syncLauncherState();
    return true;
  }

  return { init, isPanelVisible, syncLauncherState, setLauncherCollapsed, bringPanelForward, hideQueuePanel, showQueuePanel, hideAudioPanel, showAudioPanel, hideAnalysisPanel, showAnalysisPanel, hideVisualizersPanel, showVisualizersPanel, hideScenePanel, showScenePanel, setRecordPanelVisibility, hideRecordPanel, showRecordPanel, primeRecordUi, togglePanels };
}

export { createWorkspaceUi };
