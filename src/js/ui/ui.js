import { clamp, fmt, deepClone, rgb01ToCss } from "../core/utils.js";
import { RAD_TO_DEG } from "../core/constants.js";
import { CONFIG } from "../core/config.js";
import { preferences, runtime, resolveSettings, BAND_NAMES, replacePreferences, normalizeOrbDef } from "../core/preferences.js";
import { state } from "../core/state.js";
import { UrlPreset } from "../presets/url-preset.js";
import { BandBankController } from "../audio/band-bank-controller.js";
import { BandBank } from "../audio/band-bank.js";
import { Queue } from "../audio/queue.js";
import { AudioEngine } from "../audio/audio-engine.js";
import { Scrubber } from "../audio/scrubber.js";
import { InputSourceManager } from "../audio/input-source-manager.js";
import { ColorPolicy } from "../render/color-policy.js";
import { RecorderEngine } from "../recording/recorder-engine.js";
import { initOrbs, resetVisualizers, syncOrbsFromSettings } from "../render/orb-runtime.js";
import { primeDomCache } from "./dom-cache.js";
import { createOrbBandPicker, parseBandSelection } from "./orb-band-picker.js";

/* =============================================================================
   UI
   ========================================================================== */
function isFileWorkflowMode(sourceState = state.source) {
  const kind = sourceState && typeof sourceState.kind === "string" ? sourceState.kind : "none";
  // The File side of the selector represents the canonical file workflow,
  // including the idle "no active source" state after leaving a live input.
  return kind === "none" || kind === "file";
}

function hasActiveFileSource(sourceState = state.source, audioState = state.audio) {
  return !!(sourceState && sourceState.kind === "file" && audioState && audioState.isLoaded);
}

function hasMeaningfullyActiveSource(sourceState = state.source) {
  return !!(sourceState && sourceState.status === "active" && sourceState.sessionActive === true);
}

function shouldShowActiveQueueItem(sourceState, audioState, item) {
  return !!(item && item.active && hasActiveFileSource(sourceState, audioState));
}

function readSourceKind(sourceState = state.source) {
  return sourceState && typeof sourceState.kind === "string" ? sourceState.kind : "none";
}

function readSelectedSourceKind(sourceState = state.source) {
  const sourceKind = readSourceKind(sourceState);
  return sourceKind === "mic" || sourceKind === "stream" ? sourceKind : "file";
}

function readSourceStatus(sourceState = state.source) {
  return sourceState && typeof sourceState.status === "string" ? sourceState.status : "idle";
}

function readSourceLabel(kind, sourceState = state.source) {
  const label = sourceState && typeof sourceState.label === "string"
    ? sourceState.label.trim()
    : "";
  if (label) return label;
  if (kind === "mic") return "Microphone";
  if (kind === "stream") return "Shared stream";
  return "";
}

function readFileWorkflowStatusText(audioState, queueLength, currentIndex, bandText, sourceState = state.source) {
  if (audioState.isLoaded) {
    const qLen = queueLength;
    const qPos = qLen > 0 ? clamp(currentIndex + 1, 1, qLen) : 0;
    const playState = audioState.isPlaying ? "Playing" : "Paused";
    const errText = audioState.transportError ? ` - Error: ${audioState.transportError}` : "";
    return `File [${qPos}/${qLen}]: ${audioState.filename} - ${playState} - Bands: ${bandText}${errText}`;
  }
  if (audioState.transportError) return `File mode ready. Last file error: ${audioState.transportError}`;
  if (sourceState && sourceState.kind === "none" && sourceState.errorMessage) {
    return `File mode ready. ${sourceState.errorMessage}`;
  }
  if (queueLength > 0) return "File mode ready. Select a queued file or load audio files.";
  return "File mode ready. Load audio files to begin analysis.";
}

function readLiveSourceStatusText(kind, sourceState, bandText) {
  if (kind === "mic") {
    if (sourceState.status === "requesting") return "Waiting for microphone permission.";
    if (sourceState.status === "active") {
      return `Microphone live: ${readSourceLabel("mic", sourceState)} - Bands: ${bandText}`;
    }
    if (sourceState.errorMessage) return sourceState.errorMessage;
    return "Microphone input is unavailable.";
  }

  if (sourceState.status === "requesting") return "Waiting for stream share permission.";
  if (sourceState.status === "active") {
    return `Stream live: ${readSourceLabel("stream", sourceState)} - Bands: ${bandText}`;
  }
  if (sourceState.errorMessage) return sourceState.errorMessage;
  return "Stream input is unavailable.";
}

function isSourceSwitchLocked(recordingState = state.recording) {
  const phase = recordingState && typeof recordingState.phase === "string"
    ? recordingState.phase
    : "";
  return phase === "recording" || phase === "finalizing";
}

function readSourceSwitchLockText(recordingState = state.recording) {
  return recordingState && recordingState.phase === "finalizing"
    ? "Source changes are unavailable while recording finalizes the current export."
    : "Source changes are unavailable during active recording.";
}

function isFinalizingFileTransportLocked(recordingState = state.recording) {
  return !!(recordingState && recordingState.phase === "finalizing");
}

function readFinalizingFileTransportLockText(controlName = "Track changes") {
  const verb = /s$/i.test(controlName) ? "are" : "is";
  return `${controlName} ${verb} unavailable while recording finalizes the current export.`;
}

function readSourceSelectorCopy({
  sourceState = state.source,
  audioState = state.audio,
  recordingState = state.recording,
  queueLength = Queue.length,
} = {}) {
  const sourceSwitchLocked = isSourceSwitchLocked(recordingState);
  const lockedSwitchText = readSourceSwitchLockText(recordingState);
  const sourceStatus = readSourceStatus(sourceState);
  const selectedSourceKind = readSelectedSourceKind(sourceState);
  const micSupported = !!(sourceState && sourceState.support && sourceState.support.mic);
  const streamSupported = !!(sourceState && sourceState.support && sourceState.support.stream);
  const currentFileLabel = audioState && typeof audioState.filename === "string" && audioState.filename
    ? audioState.filename
    : readSourceLabel("file", sourceState);

  let micText = "Switch to microphone input workflow";
  if (!micSupported) {
    micText = "Microphone capture is unavailable in this browser.";
  } else if (selectedSourceKind === "mic") {
    if (sourceStatus === "requesting") micText = "Microphone workflow selected. Waiting for microphone permission.";
    else if (sourceStatus === "active") micText = "Microphone workflow selected. Live input active.";
    else if (sourceState && sourceState.errorMessage) micText = `Microphone workflow selected. ${sourceState.errorMessage}`;
  }

  let streamText = "Switch to stream share workflow";
  if (!streamSupported) {
    streamText = "Stream capture is unavailable in this browser.";
  } else if (selectedSourceKind === "stream") {
    if (sourceStatus === "requesting") streamText = "Shared stream workflow selected. Waiting for stream share permission.";
    else if (sourceStatus === "active") streamText = "Shared stream workflow selected. Live input active.";
    else if (sourceState && sourceState.errorMessage) streamText = `Shared stream workflow selected. ${sourceState.errorMessage}`;
  }

  return {
    fileText: sourceSwitchLocked
      ? lockedSwitchText
      : (selectedSourceKind !== "file"
        ? "Switch to file playback workflow."
        : (hasActiveFileSource(sourceState, audioState) && currentFileLabel
          ? `File workflow selected. Current file: ${currentFileLabel}.`
          : (queueLength > 0
            ? "File workflow selected. Select a queued file or load audio files."
            : "File workflow selected. Load audio files to begin."))),
    micText: sourceSwitchLocked ? lockedSwitchText : micText,
    streamText: sourceSwitchLocked ? lockedSwitchText : streamText,
    micSupported,
    streamSupported,
  };
}

function readSourceUiModel({
  sourceState = state.source,
  audioState = state.audio,
  recordingState = state.recording,
  queueLength = Queue.length,
  currentIndex = Queue.currentIndex,
  bandText = "n/a",
  recordingStatusText = "",
  hasAudioToast = false,
  audioToastText = "",
} = {}) {
  const sourceKind = readSourceKind(sourceState);
  const fileWorkflowSelected = isFileWorkflowMode(sourceState);
  // The selector expresses the current workflow side, not guaranteed active media.
  // Idle state stays on File so users land back in the canonical file workflow.
  const selectedSourceKind = readSelectedSourceKind(sourceState);
  const sourceSwitchLocked = isSourceSwitchLocked(recordingState);
  const fileTransportMutationLocked = isFinalizingFileTransportLocked(recordingState);
  const disableFileControls = !fileWorkflowSelected;
  const pressedSources = {
    file: selectedSourceKind === "file",
    mic: selectedSourceKind === "mic",
    stream: selectedSourceKind === "stream",
  };

  let computedAudioStatus = "";
  if (selectedSourceKind === "mic") {
    computedAudioStatus = readLiveSourceStatusText("mic", sourceState, bandText);
  } else if (selectedSourceKind === "stream") {
    computedAudioStatus = readLiveSourceStatusText("stream", sourceState, bandText);
  } else {
    computedAudioStatus = readFileWorkflowStatusText(audioState, queueLength, currentIndex, bandText, sourceState);
  }

  const withRecording = recordingStatusText ? `${computedAudioStatus} | ${recordingStatusText}` : computedAudioStatus;
  return {
    selectedSourceKind,
    pressedSources,
    sourceSwitchLocked,
    disableFileControls,
    fileTransportMutationLocked,
    showActiveQueueItem: hasActiveFileSource(sourceState, audioState),
    audioPanelSourceMode: selectedSourceKind,
    audioStatusText: hasAudioToast ? audioToastText : withRecording,
    sourceSelectorCopy: readSourceSelectorCopy({ sourceState, audioState, recordingState, queueLength }),
  };
}

function readBulkOrbValue(orbs, group, field) {
  if (!Array.isArray(orbs) || !orbs.length) return { mixed: false, value: undefined };
  const value = orbs[0][group][field];
  return { mixed: orbs.some((orb) => orb[group][field] !== value), value };
}

function applyBulkOrbValue(orbs, group, field, value) {
  for (const orb of orbs) orb[group][field] = value;
}

const UI = (() => {
  const ui = state.ui;
  let sourceSwitchDispatcher = async () => false;

  function readRecordPanelEdgeVars() {
    const placement = CONFIG.recording && CONFIG.recording.panelPlacement
      ? CONFIG.recording.panelPlacement
      : {};
    const edgeX = placement.edgeX === "left" ? "left" : "right";
    const edgeY = placement.edgeY === "top" ? "top" : "bottom";
    const edgeVars = {
      left: "auto",
      right: "auto",
      top: "auto",
      bottom: "auto",
    };

    edgeVars[edgeX] = edgeX === "left"
      ? "calc(var(--ui-pad) + var(--ui-safe-l))"
      : "calc(var(--ui-pad) + var(--ui-safe-r))";

    if (edgeY === "top") {
      edgeVars.top = "calc(var(--ui-pad) + var(--ui-safe-t))";
    } else if (placement.anchorAboveQueuePanel) {
      edgeVars.bottom = "calc(var(--ui-pad) + var(--ui-safe-b) + var(--ui-queue-clearance))";
    } else if (placement.anchorAboveAudioPanel) {
      edgeVars.bottom = "calc(var(--ui-pad) + var(--ui-safe-b) + var(--ui-audio-h) + var(--ui-gap))";
    } else {
      edgeVars.bottom = "calc(var(--ui-pad) + var(--ui-safe-b))";
    }

    return edgeVars;
  }

  function readRecordLauncherEdgeVars() {
    const placement = CONFIG.recording && CONFIG.recording.launcherPlacement
      ? CONFIG.recording.launcherPlacement
      : {};
    const corner = typeof placement.corner === "string" ? placement.corner : "bottom-right";
    const useLeft = corner.endsWith("left");
    const useTop = corner.startsWith("top");

    return {
      left: useLeft ? "calc(var(--ui-pad) + var(--ui-safe-l))" : "auto",
      right: useLeft ? "auto" : "calc(var(--ui-pad) + var(--ui-safe-r))",
      top: useTop ? "calc(var(--ui-pad) + var(--ui-safe-t))" : "auto",
      bottom: useTop ? "auto" : "calc(var(--ui-pad) + var(--ui-safe-b))",
    };
  }

  function setCssVarsFromConfig() {
    const r = document.documentElement.style;
    r.setProperty("--ui-panel-bg", CONFIG.ui.panelBackgroundRgba);
    r.setProperty("--ui-panel-blur", CONFIG.ui.panelBlurPx + "px");
    r.setProperty("--ui-pad", CONFIG.ui.panelPaddingPx + "px");
    r.setProperty("--ui-gap", CONFIG.ui.panelGapPx + "px");
    r.setProperty("--ui-radius", CONFIG.ui.panelRadiusPx + "px");
    r.setProperty("--ui-audio-h", CONFIG.ui.audioPanelHeightPx + "px");
    r.setProperty("--ui-icon", CONFIG.ui.iconButtonSizePx + "px");

    const recordPanelEdges = readRecordPanelEdgeVars();
    r.setProperty("--ui-record-panel-left", recordPanelEdges.left);
    r.setProperty("--ui-record-panel-right", recordPanelEdges.right);
    r.setProperty("--ui-record-panel-top", recordPanelEdges.top);
    r.setProperty("--ui-record-panel-bottom", recordPanelEdges.bottom);

    const recordLauncherEdges = readRecordLauncherEdgeVars();
    r.setProperty("--ui-record-launcher-left", recordLauncherEdges.left);
    r.setProperty("--ui-record-launcher-right", recordLauncherEdges.right);
    r.setProperty("--ui-record-launcher-top", recordLauncherEdges.top);
    r.setProperty("--ui-record-launcher-bottom", recordLauncherEdges.bottom);

    const recordPanelStyle = CONFIG.recording.panelStyle;
    r.setProperty("--ui-record-panel-shadow-recording", recordPanelStyle.recordingShadowCss);
    r.setProperty("--ui-record-panel-shadow-finalizing", recordPanelStyle.finalizingShadowCss);
    r.setProperty("--ui-record-panel-shadow-complete", recordPanelStyle.completeShadowCss);
    r.setProperty("--ui-record-panel-shadow-error", recordPanelStyle.errorShadowCss);

    const recordLauncherStyle = CONFIG.recording.launcherStyle;
    r.setProperty("--ui-record-launcher-rest-opacity", String(recordLauncherStyle.restOpacity));
    r.setProperty("--ui-record-launcher-border-color", recordLauncherStyle.borderColorRgba);
    r.setProperty("--ui-record-launcher-shadow", recordLauncherStyle.shadowCss);

    r.setProperty("--ui-record-launcher-pulse-period", CONFIG.recording.launcherPulse.periodMs + "ms");
    r.setProperty("--ui-record-launcher-pulse-scale-min", String(CONFIG.recording.launcherPulse.scaleMin));
    r.setProperty("--ui-record-launcher-pulse-scale-max", String(CONFIG.recording.launcherPulse.scaleMax));
    r.setProperty("--ui-record-launcher-pulse-opacity-min", String(CONFIG.recording.launcherPulse.opacityMin));
    r.setProperty("--ui-record-launcher-pulse-opacity-max", String(CONFIG.recording.launcherPulse.opacityMax));
  }

  function syncLoadHintVisibility(sourceState = state.source) {
    if (!ui.loadHint || !hasMeaningfullyActiveSource(sourceState)) return;
    ui.loadHint.classList.add("hidden");
    ui.loadHint.setAttribute("aria-hidden", "true");
  }

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

  function syncWorkspaceLauncherState() {
    syncLauncherControl(ui.openAudio, ui.btnOpenAudio, {
      active: isPanelVisible(ui.audioPanel),
      label: isPanelVisible(ui.audioPanel) ? "Hide audio source panel" : "Show audio source panel",
    });
    syncLauncherControl(ui.openSim, ui.btnOpenSim, {
      active: isPanelVisible(ui.simPanel),
      label: isPanelVisible(ui.simPanel) ? "Hide orbs panel" : "Show orbs panel",
    });
    syncLauncherControl(ui.openBands, ui.btnOpenBands, {
      active: isPanelVisible(ui.bandsPanel),
      label: isPanelVisible(ui.bandsPanel) ? "Hide bands panel" : "Show bands panel",
    });
    syncLauncherControl(ui.openQueue, ui.btnOpenQueue, {
      active: isPanelVisible(ui.queuePanel),
      label: isPanelVisible(ui.queuePanel) ? "Hide queue panel" : "Show queue panel",
    });
    syncLauncherControl(ui.openRecord, ui.btnOpenRecord, {
      visible: !!(state.recording && state.recording.hooksEnabled),
      active: !!ui.recordingPanelVisible,
      label: readRecordingLauncherLabel(state.recording, !!ui.recordingPanelVisible),
    });
  }

  function setWorkspaceLauncherCollapsed(collapsed) {
    ui.workspaceLauncherCollapsed = !!collapsed;
    if (ui.workspaceLauncher) {
      ui.workspaceLauncher.dataset.collapsed = ui.workspaceLauncherCollapsed ? "true" : "false";
    }
    if (ui.btnToggleWorkspaceLauncher) {
      const label = ui.workspaceLauncherCollapsed ? "Expand launcher bar" : "Collapse launcher bar";
      ui.btnToggleWorkspaceLauncher.title = label;
      ui.btnToggleWorkspaceLauncher.setAttribute("aria-label", label);
      ui.btnToggleWorkspaceLauncher.setAttribute("aria-expanded", ui.workspaceLauncherCollapsed ? "false" : "true");
      ui.btnToggleWorkspaceLauncher.textContent = ui.workspaceLauncherCollapsed ? "⌃" : "⌄";
    }
  }

  function toggleWorkspaceLauncherCollapsed() {
    setWorkspaceLauncherCollapsed(!ui.workspaceLauncherCollapsed);
  }

  function bringPanelForward(panel) {
    for (const candidate of [ui.simPanel, ui.bandsPanel, ui.queuePanel, ui.recordPanel]) {
      if (candidate) candidate.classList.toggle("panel-front", candidate === panel);
    }
  }

  function restoreLauncherFocus(button) {
    setWorkspaceLauncherCollapsed(false);
    if (button) button.focus();
  }

  function syncAudioDockHeight() {
    if (!ui.audioPanel || typeof ui.audioPanel.getBoundingClientRect !== "function") return;
    const height = isPanelVisible(ui.audioPanel) ? Math.ceil(ui.audioPanel.getBoundingClientRect().height) : 0;
    if (height === ui.audioDockHeight) return;
    ui.audioDockHeight = height;
    document.documentElement.style.setProperty("--ui-audio-h", `${height}px`);
  }

  function hideQueuePanel() {
    if (!ui.queuePanel) return;
    ui.queuePanel.style.display = "none";
    syncWorkspaceLauncherState();
    if (document.activeElement && ui.queuePanel.contains(document.activeElement)) restoreLauncherFocus(ui.btnOpenQueue);
  }

  function showQueuePanel() {
    if (!ui.queuePanel) return;
    ui.queuePanel.style.display = "block";
    queuePanelRefresher();
    bringPanelForward(ui.queuePanel);
    syncWorkspaceLauncherState();
    if (document.activeElement === ui.btnOpenQueue && ui.btnHideQueue) ui.btnHideQueue.focus();
  }

  function hideAudioPanel() {
    ui.audioPanel.style.display = "none";
    syncAudioDockHeight();
    syncWorkspaceLauncherState();
    if (document.activeElement && ui.audioPanel.contains(document.activeElement)) restoreLauncherFocus(ui.btnOpenAudio);
  }
  function showAudioPanel() {
    ui.audioPanel.style.display = "grid";
    syncAudioDockHeight();
    syncWorkspaceLauncherState();
    if (document.activeElement === ui.btnOpenAudio) ui.btnHideAudio.focus();
  }

  function hideSimPanel() {
    ui.simPanel.style.display = "none";
    syncWorkspaceLauncherState();
    if (document.activeElement && ui.simPanel.contains(document.activeElement)) restoreLauncherFocus(ui.btnOpenSim);
  }
  function showSimPanel() {
    ui.simPanel.style.display = "block";
    bringPanelForward(ui.simPanel);
    syncWorkspaceLauncherState();
    if (document.activeElement === ui.btnOpenSim) ui.btnHideSim.focus();
  }

  function hideBandsPanel() {
    ui.bandsPanel.style.display = "none";
    syncWorkspaceLauncherState();
    if (document.activeElement && ui.bandsPanel.contains(document.activeElement)) restoreLauncherFocus(ui.btnOpenBands);
  }
  function showBandsPanel() {
    ui.bandsPanel.style.display = "block";
    bringPanelForward(ui.bandsPanel);
    syncWorkspaceLauncherState();
    if (document.activeElement === ui.btnOpenBands) ui.btnHideBands.focus();
  }

  // Build 115 keeps recording in the unified launcher bar while preserving the
  // dedicated panel/launcher IDs from Build 113.
  function setRecordPanelVisibility(visible) {
    if (!ui.recordPanel || !ui.openRecord) return;

    const nextVisible = !!visible && !!state.recording.hooksEnabled;
    ui.recordingPanelVisible = nextVisible;
    ui.recordPanel.hidden = !nextVisible;
    ui.recordPanel.setAttribute("aria-hidden", nextVisible ? "false" : "true");
    ui.recordPanel.style.display = nextVisible ? "block" : "none";
    syncWorkspaceLauncherState();
  }

  function hideRecordPanel(options = {}) {
    if (!ui.recordPanel || !ui.openRecord) return;
    const preserveRestoreFlag = !!options.preserveRestoreFlag;
    if (!preserveRestoreFlag) ui.recordingPanelRestoreAfterGlobalHide = false;
    setRecordPanelVisibility(false);
    if (document.activeElement && ui.recordPanel.contains(document.activeElement) && ui.btnOpenRecord) {
      restoreLauncherFocus(ui.btnOpenRecord);
    }
  }

  function showRecordPanel() {
    if (!ui.recordPanel || !ui.openRecord || !state.recording.hooksEnabled) return;
    ui.recordingPanelRestoreAfterGlobalHide = false;
    setRecordPanelVisibility(true);
    bringPanelForward(ui.recordPanel);
    if (document.activeElement === ui.btnOpenRecord && ui.btnHideRecord) ui.btnHideRecord.focus();
  }

  function primeRecordUi() {
    if (!ui.recordPanel || !ui.openRecord) return;
    if (!state.recording.hooksEnabled) ui.recordingPanelRestoreAfterGlobalHide = false;
    const shouldShowPanel = !!state.recording.hooksEnabled && !!ui.recordingPanelVisible;
    setRecordPanelVisibility(shouldShowPanel);
  }

  function togglePanels() {
    const aVisible = ui.audioPanel.style.display !== "none";
    const sVisible = ui.simPanel.style.display !== "none";
    const bVisible = ui.bandsPanel.style.display !== "none";
    const qVisible = ui.queuePanel && ui.queuePanel.style.display !== "none";
    const rVisible = ui.recordPanel && ui.recordPanel.style.display !== "none";

    if (aVisible || sVisible || bVisible || qVisible || rVisible) {
      ui.panelRestoreSnapshot = { audio: aVisible, sim: sVisible, bands: bVisible, queue: qVisible, record: rVisible };
      ui.recordingPanelRestoreAfterGlobalHide = !!rVisible;
      hideAudioPanel(); hideSimPanel(); hideBandsPanel(); hideQueuePanel();
      if (rVisible) hideRecordPanel({ preserveRestoreFlag: true });
    } else {
      const restore = ui.panelRestoreSnapshot || { audio: true };
      if (restore.audio) showAudioPanel();
      if (restore.sim) showSimPanel();
      if (restore.bands) showBandsPanel();
      if (restore.queue) showQueuePanel();
      const shouldRestoreRecordingPanel = !!ui.recordingPanelRestoreAfterGlobalHide;
      ui.recordingPanelRestoreAfterGlobalHide = false;
      if (shouldRestoreRecordingPanel) showRecordPanel();
    }
  }

  // 112 status-lane routing:
  // - sim lane carries sim/config toasts.
  // - audio lane carries transport/audio toasts plus a short recording-state summary.
  const STATUS_DEFAULT_SIM = "Choose an orb to shape its response.";
  const STATUS_DEFAULT_BANDS = "Colors and spectral analysis.";
  let _simStatusToastTimer = null;
  let _audioStatusToastText = "";
  let _audioStatusToastUntilMs = 0;
  let queuePanelRefresher = () => {};

  function simStatusToast(msg, holdMs = 2500) {
    ui.simStatus.textContent = msg;
    if (_simStatusToastTimer) clearTimeout(_simStatusToastTimer);
    _simStatusToastTimer = setTimeout(() => {
      ui.simStatus.textContent = STATUS_DEFAULT_SIM;
      _simStatusToastTimer = null;
    }, holdMs);
  }

  function audioStatusToast(msg, holdMs = 2500) {
    _audioStatusToastText = msg;
    _audioStatusToastUntilMs = performance.now() + holdMs;
  }

  function clearAudioStatusToast() {
    _audioStatusToastText = "";
    _audioStatusToastUntilMs = 0;
  }

  function formatOrbBandIdsText(bandIds) {
    if (!Array.isArray(bandIds) || !bandIds.length) return "";
    return bandIds.join(", ");
  }

  function describeOrbBandSelection(bandIds) {
    if (!Array.isArray(bandIds) || !bandIds.length) return "full spectrum";
    return `${bandIds.length} band${bandIds.length === 1 ? "" : "s"}`;
  }

  function applyOrbPrefChange(orbIndex, reason, { structural = false } = {}) {
    const defaults = CONFIG.defaults.orbs;
    const fallback = defaults[orbIndex % defaults.length];
    if (!Array.isArray(preferences.orbs)) preferences.orbs = deepClone(defaults);
    while (preferences.orbs.length <= orbIndex) {
      preferences.orbs.push(deepClone(defaults[preferences.orbs.length % defaults.length]));
    }
    preferences.orbs[orbIndex] = normalizeOrbDef(preferences.orbs[orbIndex], fallback);
    applyPrefs(reason);
    if (structural) {
      initOrbs();
      resetVisualizers("visuals");
    } else {
      syncOrbsFromSettings();
    }
  }

  function refreshOrbPanelUi(p) {
    const defaults = CONFIG.defaults.orbs;
    const orb0 = (p.orbs && p.orbs[0]) ? p.orbs[0] : defaults[0];
    const orb1 = (p.orbs && p.orbs[1]) ? p.orbs[1] : defaults[1];

    ui.selOrb0Chan.value = orb0.chanId;
    ui.valOrb0Chan.textContent = orb0.chanId;
    ui.selOrb0Chir.value = String(orb0.chirality);
    ui.valOrb0Chir.textContent = orb0.chirality >= 0 ? "+1" : "-1";
    ui.rngOrb0Hue.value = String(orb0.hueOffsetDeg);
    ui.valOrb0Hue.textContent = `${orb0.hueOffsetDeg}°`;
    ui.selOrb0ColorSrc.value = orb0.colorSource;
    ui.valOrb0ColorSrc.textContent = orb0.colorSource;
    ui.rngOrb0CenterX.value = String(orb0.centerXFrac);
    ui.valOrb0CenterX.textContent = fmt(orb0.centerXFrac, 2);
    ui.rngOrb0CenterY.value = String(orb0.centerYFrac);
    ui.valOrb0CenterY.textContent = fmt(orb0.centerYFrac, 2);
    if (document.activeElement !== ui.txtOrb0Bands && ui.txtOrb0Bands.getAttribute("aria-invalid") !== "true") ui.txtOrb0Bands.value = formatOrbBandIdsText(orb0.bandIds);
    ui.valOrb0Bands.textContent = describeOrbBandSelection(orb0.bandIds);

    ui.selOrb1Chan.value = orb1.chanId;
    ui.valOrb1Chan.textContent = orb1.chanId;
    ui.selOrb1Chir.value = String(orb1.chirality);
    ui.valOrb1Chir.textContent = orb1.chirality >= 0 ? "+1" : "-1";
    ui.rngOrb1Hue.value = String(orb1.hueOffsetDeg);
    ui.valOrb1Hue.textContent = `${orb1.hueOffsetDeg}°`;
    ui.selOrb1ColorSrc.value = orb1.colorSource;
    ui.valOrb1ColorSrc.textContent = orb1.colorSource;
    ui.rngOrb1CenterX.value = String(orb1.centerXFrac);
    ui.valOrb1CenterX.textContent = fmt(orb1.centerXFrac, 2);
    ui.rngOrb1CenterY.value = String(orb1.centerYFrac);
    ui.valOrb1CenterY.textContent = fmt(orb1.centerYFrac, 2);
    if (document.activeElement !== ui.txtOrb1Bands && ui.txtOrb1Bands.getAttribute("aria-invalid") !== "true") ui.txtOrb1Bands.value = formatOrbBandIdsText(orb1.bandIds);
    ui.valOrb1Bands.textContent = describeOrbBandSelection(orb1.bandIds);
  }

  function commitOrbBandIdsFromUi(orbIndex, reason) {
    const input = orbIndex === 0 ? ui.txtOrb0Bands : ui.txtOrb1Bands;
    const valEl = orbIndex === 0 ? ui.valOrb0Bands : ui.valOrb1Bands;
    const parsed = parseBandSelection(input.value);
    input.setAttribute("aria-invalid", parsed.error ? "true" : "false");
    const errorEl = document.getElementById(`orb${orbIndex}BandError`);
    if (errorEl) errorEl.textContent = parsed.error;
    if (parsed.error) {
      valEl.textContent = "Invalid indices";
      simStatusToast(parsed.error);
      return;
    }
    preferences.orbs[orbIndex].bandIds = parsed.ids;
    applyOrbPrefChange(orbIndex, reason, { structural: false });
    const normalized = preferences.orbs[orbIndex].bandIds;
    input.value = formatOrbBandIdsText(normalized);
    valEl.textContent = describeOrbBandSelection(normalized);
  }

  function syncOrbBandPickers() {
    if (!ui.orbBandPickers) return;
    // BandBank replaces its edges when distribution/sample rate changes.
    // Reference checks avoid allocating or touching picker DOM on ordinary frames.
    if (ui.orbPickerSettings === runtime.settings && ui.orbPickerEdges === state.bands.lowHz) return;
    ui.orbPickerSettings = runtime.settings;
    ui.orbPickerEdges = state.bands.lowHz;
    ui.orbBandPickers.forEach((picker, index) => {
      if (picker) picker.sync(preferences.orbs[index].bandIds);
      const input = index === 0 ? ui.txtOrb0Bands : ui.txtOrb1Bands;
      if (input) {
        input.setAttribute("aria-invalid", "false");
        input.value = formatOrbBandIdsText(preferences.orbs[index].bandIds);
      }
      const errorEl = document.getElementById(`orb${index}BandError`);
      if (errorEl) errorEl.textContent = "";
    });
  }

  function applyPrefs(reason, options = {}) {
    const { rebuildBandsOnDefinitionChange = false } = options;
    const prevBandDefKey = BandBankController.readBandDefKey(runtime.settings);

    for (let i = 0; i < preferences.orbs.length; i++) {
      preferences.orbs[i] = normalizeOrbDef(preferences.orbs[i], CONFIG.defaults.orbs[i % CONFIG.defaults.orbs.length]);
    }

    resolveSettings();
    syncOrbsFromSettings();

    BandBankController.syncFromSettings();
    const bandDefinitionChanged = BandBankController.readBandDefKey(runtime.settings) !== prevBandDefKey;
    if (rebuildBandsOnDefinitionChange && bandDefinitionChanged) {
      BandBankController.rebuildNow();
    }

    AudioEngine.applyAnalyserSettingsLive();
    AudioEngine.applyPlaybackSettingsLive();
    syncOrbBandPickers();

    if (reason) simStatusToast(`Updated: ${reason}`);
    ui.bandsStatus.textContent = STATUS_DEFAULT_BANDS;
  }


  function resetPrefs() {
    replacePreferences(deepClone(CONFIG.defaults));
    applyPrefs("prefs reset", { rebuildBandsOnDefinitionChange: true });
    initOrbs();
    resetVisualizers("visuals");
  }

  async function shareLink() {
    UrlPreset.writeHashFromPrefs();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      simStatusToast("Share link copied to clipboard.", 4000);
    } catch {
      simStatusToast("Share link written to URL — copy from address bar.", 4000);
    }
  }

  function applyUrlNow() {
    const ok = UrlPreset.applyFromLocationHash();
    if (ok) {
      applyPrefs("applied URL preset", { rebuildBandsOnDefinitionChange: true });
      initOrbs();
      resetVisualizers("visuals");
    } else {
      simStatusToast("No valid preset in URL hash.", 4000);
    }
  }

  function buildBandHudRows() {
    // Builds (or rebuilds) the band HUD rows from scratch.
    // Called by ensureBandHudBuilt() on first use, and by rebuildBandHud()
    // whenever band count changes (future builds that expose band config).
    ui.bandRowEls = [];
    ui.bandTable.innerHTML = "";

    const n = runtime.settings.bands.count;

    for (let i = 0; i < n; i++) {
      const idx = document.createElement("div");
      idx.className = "bandIdx";
      idx.textContent = String(i);

      const name = document.createElement("div");
      name.className = "bandName";
      name.textContent = BAND_NAMES[i] || `Band ${i}`;

      const range = document.createElement("div");
      range.className = "bandRange";
      range.textContent = BandBank.formatBandRangeText(i);

      const bar = document.createElement("div");
      bar.className = "bandBar";

      const fill = document.createElement("div");
      fill.className = "bandFill";
      bar.appendChild(fill);

      ui.bandTable.appendChild(idx);
      ui.bandTable.appendChild(name);
      ui.bandTable.appendChild(range);
      ui.bandTable.appendChild(bar);

      ui.bandRowEls.push({ idx, name, range, fill });
    }

    ui.bandRowsBuilt = true;
    ui.bandHudBandCount = n; // remember what count these rows were built for
  }

  function ensureBandHudBuilt() {
    // Rebuild if never built, or if band count has since changed.
    const n = runtime.settings.bands.count;
    if (!ui.bandRowsBuilt || ui.bandHudBandCount !== n) buildBandHudRows();
  }

  function rebuildBandHud() {
    // Forced rebuild — call this whenever band definition changes.
    // Currently band count is fixed at 256; this is the hook for 115+ when it becomes configurable.
    ui.bandRowsBuilt = false;
    ensureBandHudBuilt();
  }

  function refreshBandHud(analysisFrame = null) {
    ensureBandHudBuilt();

    const s = runtime.settings;
    const n = s.bands.count;
    const spectrum = analysisFrame ? analysisFrame.spectrum : state.bands;

    for (let i = 0; i < n; i++) {
      const e = clamp((spectrum.energies01 && spectrum.energies01[i]) || 0, 0, 1);
      const pct = Math.round(e * 100);

      const c = ColorPolicy.bandRgb01(i);
      const alpha = 0.80;

      ui.bandRowEls[i].fill.style.width = pct + "%";
      ui.bandRowEls[i].fill.style.background = rgb01ToCss(c, alpha);

      const isDom = i === spectrum.dominantIndex;
      ui.bandRowEls[i].name.style.opacity = isDom ? "1.0" : "0.75";
      ui.bandRowEls[i].idx.style.opacity = isDom ? "1.0" : "0.65";
      ui.bandRowEls[i].range.style.opacity = isDom ? "0.96" : "0.72";
      ui.bandRowEls[i].range.textContent = BandBank.formatBandRangeText(i);
    }

    const domIdx = clamp(spectrum.dominantIndex, 0, n - 1);
    const domName = spectrum.dominantName || BAND_NAMES[domIdx] || `Band ${domIdx}`;
    const domRange = BandBank.formatBandRangeText(domIdx);
    ui.bandDebug.textContent = "";
    const span = document.createElement("span");
    span.className = "dominantBadge";
    span.textContent = `Dominant [${domIdx}] ${domName} — ${domRange}`;
    ui.bandDebug.appendChild(span);
  }

  function formatBandMetaHz(hz) {
    if (!Number.isFinite(hz)) return "n/a";
    if (hz >= 1000) return `${fmt(hz / 1000, 2)} kHz`;
    return `${fmt(hz, 1)} Hz`;
  }

  function refreshBandMetaText(analysisFrame = null) {
    const m = analysisFrame ? analysisFrame.spectrum.metadata : state.bands.meta;
    const bandCount = runtime.settings.bands.count;
    const sampleRateText = Number.isFinite(m.sampleRateHz)
      ? formatBandMetaHz(m.sampleRateHz)
      : "pending audio context";
    ui.bandMeta.textContent = `${bandCount} bands • Nyquist ${formatBandMetaHz(m.nyquistHz)} • ceiling configured ${formatBandMetaHz(m.configCeilingHz)}`;
  }

  function collectOperatorFacingControls() {
    // 112 
    // This intentionally excludes buttons and transport-only affordances.
    const selectors = [
      "#audioPanel input",
      "#audioPanel select",
      "#simPanel input",
      "#simPanel select",
      "#bandsPanel input",
      "#bandsPanel select",
      "#recordPanel input",
      "#recordPanel select",
    ];
    const controls = [];
    const seenIds = new Set();
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (!el || !el.id || el.type === "hidden" || el.type === "file") continue;
        if (seenIds.has(el.id)) continue;
        seenIds.add(el.id);
        controls.push(el);
      }
    }
    return controls;
  }

  function findLabelForControl(control) {
    if (!control) return "Control";

    const ownLabel = control.closest("label");
    if (ownLabel) return ownLabel.textContent.replace(/\s+/g, " ").trim();

    const allLabels = document.querySelectorAll("label[for]");
    for (const label of allLabels) {
      if (label.htmlFor === control.id) return label.textContent.replace(/\s+/g, " ").trim();
    }

    const row = control.closest(".row");
    const rowLabel = row ? row.querySelector("label") : null;
    if (rowLabel) return rowLabel.textContent.replace(/\s+/g, " ").trim();

    return control.id;
  }

  function findValueElementForControl(control) {
    if (!control) return null;
    const row = control.closest(".row");
    return row ? row.querySelector(".val") : null;
  }

  function fallbackFeedbackValue(control) {
    if (!control) return "";
    if (control.type === "checkbox") return control.checked ? "on" : "off";
    if (control.type === "color") return String(control.value || "").toLowerCase();
    if (control.tagName === "SELECT") {
      const option = control.options && control.selectedIndex >= 0 ? control.options[control.selectedIndex] : null;
      return option ? option.textContent.trim() : String(control.value || "");
    }
    return String(control.value || "");
  }

  function initConfigTooltips() {
    const controls = collectOperatorFacingControls();
    ui.configTooltipSpecs = controls.map((control) => ({
      control,
      label: findLabelForControl(control),
      valueEl: findValueElementForControl(control),
      staticTitle: (control.getAttribute("title") || "").trim(),
    }));

    ui.configTooltipByControl = new Map();
    for (const spec of ui.configTooltipSpecs) ui.configTooltipByControl.set(spec.control, spec);
  }

  function getConfigTooltipLiveValue(spec) {
    if (!spec || !spec.control) return "";
    const control = spec.control;
    const fromReadout = spec.valueEl && spec.valueEl.textContent
      ? spec.valueEl.textContent.trim()
      : "";
    return fromReadout || fallbackFeedbackValue(control).trim();
  }

  function refreshConfigTooltipForControl(control) {
    if (!control || !ui.configTooltipByControl) return;
    const spec = ui.configTooltipByControl.get(control);
    if (!spec) return;

    const liveValue = getConfigTooltipLiveValue(spec);
    const liveTitle = `${spec.label}: ${liveValue}`;
    control.title = spec.staticTitle ? `${spec.staticTitle}\n${liveTitle}` : liveTitle;
  }

  function refreshConfigTooltips() {
    const specs = Array.isArray(ui.configTooltipSpecs) ? ui.configTooltipSpecs : [];
    for (const spec of specs) refreshConfigTooltipForControl(spec.control);
  }

  function wireConfigTooltipFeedbackEvents() {
    const specs = Array.isArray(ui.configTooltipSpecs) ? ui.configTooltipSpecs : [];
    for (const spec of specs) {
      const control = spec.control;
      if (!control) continue;
      const eventName = (control.type === "checkbox" || control.tagName === "SELECT") ? "change" : "input";
      control.addEventListener(eventName, () => {
        // Apply handlers run in the same event turn. Queue after them so titles
        // reflect the same formatted value text that .val readouts display.
        queueMicrotask(() => refreshConfigTooltipForControl(control));
      });
      control.addEventListener("focus", () => refreshConfigTooltipForControl(control));
      control.addEventListener("mouseenter", () => refreshConfigTooltipForControl(control));
    }
  }

  function formatRecordingElapsedMs(elapsedMs) {
    const totalSec = Math.max(0, Math.floor((Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1000));
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  // Audio status can mention recording state, but recording controls stay
  // anchored to the dedicated record panel and launcher.
  function formatRecordingAudioStatusSummary(recording) {
    if (!recording || !recording.hooksEnabled) return "";
    switch (recording.phase) {
      case "recording":
        return `Rec ${formatRecordingElapsedMs(recording.elapsedMs)}`;
      case "finalizing":
        return "Rec finalizing";
      case "complete":
        return "Export ready";
      case "error":
        return "Rec error";
      case "unsupported":
        return "Rec unavailable";
      default:
        return "";
    }
  }

  function formatRecordingByteCount(byteCount) {
    return Number.isFinite(byteCount) && byteCount > 0
      ? `${Math.round(byteCount)} bytes`
      : "0 bytes";
  }

  function shouldSurfaceRecordingLastMessage(recording) {
    if (!recording || !recording.lastMessage) return false;
    if (recording.phase === "error") return true;
    return [
      "already-recording",
      "not-recording",
      "invalid-mime-type",
      "settings-locked",
      "reset-blocked",
      "unknown-recording-action",
    ].includes(recording.lastCode);
  }

  function readRecordingSourceLabel(sourceState = state.source, audioState = state.audio) {
    if (audioState && audioState.isLoaded) return "file audio";
    if (sourceState && sourceState.sessionActive) {
      const sourceKind = readSourceKind(sourceState);
      if (sourceKind === "mic") return "microphone input";
      if (sourceKind === "stream") return "shared stream";
      if (sourceKind === "file") return "file audio";
    }
    return "source";
  }

  function hasRecordableSource() {
    if (state.audio.isLoaded) return true;
    if (!state.source || state.source.sessionActive !== true) return false;
    return readSourceKind(state.source) === "mic" || readSourceKind(state.source) === "stream";
  }

  function isRecordingAudioCurrentlyUnavailable(recording) {
    if (!recording || recording.phase !== "recording" || recording.includePlaybackAudio === false) return false;
    return !hasRecordableSource();
  }

  function formatRecordingPrimaryStatus(recording) {
    if (!recording || !recording.hooksEnabled) return "Recording disabled";
    if (shouldSurfaceRecordingLastMessage(recording)) return recording.lastMessage;

    const includeAudio = recording.includePlaybackAudio !== false;
    const sourceLabel = readRecordingSourceLabel();
    switch (recording.phase) {
      case "boot-pending":
      case "uninitialized":
        return "Checking recording support";
      case "unsupported":
        return "Recording unavailable";
      case "recording":
        if (isRecordingAudioCurrentlyUnavailable(recording)) return "Recording continues without an active audio source.";
        return includeAudio ? `Recording ${sourceLabel} + video` : "Recording video only";
      case "finalizing":
        return "Finalizing export";
      case "complete":
        return "Latest export ready";
      case "idle":
        if (recording.isSupported !== true) return "Checking recording support";
        if (!hasRecordableSource()) return "Select File, Mic, or Stream to start recording.";
        return includeAudio ? `Ready to record ${sourceLabel} + video` : "Ready to record video only";
      default:
        return recording.lastMessage || "Checking recording support";
    }
  }

  function formatRecordingSupportText(recording) {
    if (!recording || !recording.hooksEnabled || recording.phase === "disabled") {
      return "Recording is disabled by configuration.";
    }
    if (isRecordingAudioCurrentlyUnavailable(recording)) {
      return "Recording continues while no audio source is active.";
    }
    if (recording.isSupported === true) {
      if (!hasRecordableSource()) return "Activate File, Mic, or Stream to include source audio.";
      return recording.includePlaybackAudio !== false
        ? "Canvas + source audio capture available."
        : "Canvas capture available; source audio is off.";
    }
    if (recording.isSupported === null || recording.phase === "boot-pending" || recording.supportProbeStatus === "not-started") {
      return "Checking recording capability.";
    }
    const reason = recording.lastCode || recording.supportProbeStatus || "unsupported";
    return `Unavailable: ${reason}.`;
  }

  function formatRecordingExportMeta(recording) {
    const hasExport = !!recording && !!recording.lastExportUrl && !!recording.lastExportFileName;
    if (!hasExport) return "Latest export: none this session.";
    const byteText = formatRecordingByteCount(recording.lastExportByteSize);
    return `Latest export: ${recording.lastExportFileName} (${byteText})`;
  }

  function readRecordingTimerText(recording) {
    const showCapturedDuration = recording
      && (
        recording.phase === "recording"
        || recording.phase === "finalizing"
        || recording.phase === "complete"
        || (recording.phase === "error" && Number.isFinite(recording.elapsedMs) && recording.elapsedMs > 0)
      );
    return formatRecordingElapsedMs(showCapturedDuration ? recording.elapsedMs : 0);
  }

  function readRecordingLauncherLabel(recording, panelVisible = false) {
    const verb = panelVisible ? "Hide" : "Show";
    if (!recording || !recording.hooksEnabled) return `${verb} recording panel`;
    switch (recording.phase) {
      case "recording":
        return `${verb} recording panel (recording active)`;
      case "finalizing":
        return `${verb} recording panel (finalizing export)`;
      case "unsupported":
        return `${verb} recording panel (recording unavailable)`;
      default:
        return `${verb} recording panel`;
    }
  }

  function syncRecordingMimeOptions(model) {
    if (!ui.selRecordMime) return;
    const availableMimeTypes = Array.isArray(model.recording.availableMimeTypes)
      ? model.recording.availableMimeTypes
      : [];
    const selectedMimeType = model.recording.selectedMimeType || "";
    const optionsKey = `${availableMimeTypes.join("|")}::${selectedMimeType}`;

    if (ui.recordMimeOptionsKey !== optionsKey) {
      ui.selRecordMime.innerHTML = "";
      if (!availableMimeTypes.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Unavailable";
        ui.selRecordMime.appendChild(opt);
      } else {
        for (const mimeType of availableMimeTypes) {
          const opt = document.createElement("option");
          opt.value = mimeType;
          opt.textContent = mimeType;
          opt.selected = mimeType === selectedMimeType;
          ui.selRecordMime.appendChild(opt);
        }
      }
      ui.recordMimeOptionsKey = optionsKey;
    }

    ui.selRecordMime.value = availableMimeTypes.includes(selectedMimeType)
      ? selectedMimeType
      : (availableMimeTypes[0] || "");
  }

  function syncRecordingTargetFpsOptions(model) {
    if (!ui.selRecordTargetFps) return;
    const options = Array.isArray(model.targetFpsOptions) ? model.targetFpsOptions : [];
    const selectedValue = Number.isFinite(model.recording.targetFps) ? model.recording.targetFps : null;
    const optionsKey = `${options.join("|")}::${selectedValue}`;

    if (ui.recordTargetFpsOptionsKey !== optionsKey) {
      ui.selRecordTargetFps.innerHTML = "";
      for (const fps of options) {
        const opt = document.createElement("option");
        opt.value = String(fps);
        opt.textContent = `${fps} fps`;
        opt.selected = fps === selectedValue;
        ui.selRecordTargetFps.appendChild(opt);
      }
      ui.recordTargetFpsOptionsKey = optionsKey;
    }

    ui.selRecordTargetFps.value = options.includes(selectedValue)
      ? String(selectedValue)
      : String(options[0] || "");
  }

  function downloadLastRecording() {
    const recording = state.recording;
    if (!recording || !recording.lastExportUrl || !recording.lastExportFileName) return;
    const a = document.createElement("a");
    a.href = recording.lastExportUrl;
    a.download = recording.lastExportFileName;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function getRecordingUiModel() {
    const recording = state.recording;
    const includeAudio = recording.includePlaybackAudio !== false;
    const hasCompleteExport = !!recording.lastExportUrl && !!recording.lastExportFileName;
    const canEditSettings = recording.hooksEnabled
      && recording.phase !== "recording"
      && recording.phase !== "finalizing";
    const canStartPhase = recording.phase === "idle"
      || recording.phase === "complete"
      || recording.phase === "error";
    return {
      config: CONFIG.recording,
      recording,
      includeAudio,
      panelVisible: !!ui.recordingPanelVisible,
      canStart: recording.hooksEnabled
        && recording.isSupported === true
        && hasRecordableSource()
        && canStartPhase,
      canStop: recording.phase === "recording",
      canDownload: hasCompleteExport,
      canSelectMime: canEditSettings && recording.isSupported === true,
      canToggleIncludeAudio: canEditSettings,
      canSelectTargetFps: canEditSettings,
      timerText: readRecordingTimerText(recording),
      launcherLabel: readRecordingLauncherLabel(recording, !!ui.recordingPanelVisible),
      primaryStatusText: formatRecordingPrimaryStatus(recording),
      supportText: formatRecordingSupportText(recording),
      exportMetaText: formatRecordingExportMeta(recording),
      selectedMimeLabel: recording.selectedMimeType || "n/a",
      resolvedMimeLabel: recording.resolvedMimeType || "n/a",
      includeAudioLabel: includeAudio ? "On" : "Off",
      targetFpsLabel: Number.isFinite(recording.targetFps) ? `${recording.targetFps} fps` : "n/a",
      targetFpsOptions: Array.isArray(CONFIG.recording && CONFIG.recording.targetFpsOptions)
        ? CONFIG.recording.targetFpsOptions.slice()
        : [],
    };
  }

  function syncControlCopy(el, text) {
    if (!el) return;
    if (el.title !== text) el.title = text;
    if (el.getAttribute("aria-label") !== text) el.setAttribute("aria-label", text);
  }

  function readFileModeOnlyAffordanceText(controlName) {
    return `${controlName} is available in File mode only.`;
  }

  function readFinalizingFileTransportAffordanceText(controlName) {
    return readFinalizingFileTransportLockText(controlName);
  }

  function syncSourceSelectorUi(sourceUi = readSourceUiModel()) {
    const sourceSwitchLocked = !!sourceUi.sourceSwitchLocked;
    const sourceSelectorCopy = sourceUi.sourceSelectorCopy || readSourceSelectorCopy();

    if (ui.btnSourceFile) {
      ui.btnSourceFile.setAttribute("aria-pressed", sourceUi.pressedSources.file ? "true" : "false");
      ui.btnSourceFile.disabled = sourceSwitchLocked;
      syncControlCopy(ui.btnSourceFile, sourceSelectorCopy.fileText);
    }
    if (ui.btnSourceMic) {
      ui.btnSourceMic.setAttribute("aria-pressed", sourceUi.pressedSources.mic ? "true" : "false");
      ui.btnSourceMic.disabled = sourceSwitchLocked || !sourceSelectorCopy.micSupported;
      syncControlCopy(ui.btnSourceMic, sourceSelectorCopy.micText);
    }
    if (ui.btnSourceStream) {
      ui.btnSourceStream.setAttribute("aria-pressed", sourceUi.pressedSources.stream ? "true" : "false");
      ui.btnSourceStream.disabled = sourceSwitchLocked || !sourceSelectorCopy.streamSupported;
      syncControlCopy(ui.btnSourceStream, sourceSelectorCopy.streamText);
    }
  }

  function syncFileControlAffordances(sourceUi = readSourceUiModel()) {
    const fileControlsDisabled = !!sourceUi.disableFileControls;
    const fileTransportMutationLocked = !!sourceUi.fileTransportMutationLocked;
    const queueVisible = !!(ui.queuePanel && ui.queuePanel.style.display !== "none");
    const repeatModeText = preferences.audio.repeatMode === "one"
      ? "One"
      : (preferences.audio.repeatMode === "all" ? "All" : "Off");

    syncControlCopy(
      ui.btnLoad,
      fileControlsDisabled
        ? readFileModeOnlyAffordanceText("Load")
        : (fileTransportMutationLocked
          ? readFinalizingFileTransportAffordanceText("Load")
          : "Load audio files into the queue")
    );
    syncControlCopy(
      ui.btnPlay,
      fileControlsDisabled
        ? readFileModeOnlyAffordanceText("Play/Pause")
        : (state.audio.isPlaying ? "Pause current file" : "Play current file")
    );
    syncControlCopy(
      ui.btnStop,
      fileControlsDisabled
        ? readFileModeOnlyAffordanceText("Stop")
        : "Stop current file"
    );
    syncControlCopy(
      ui.btnPrev,
      fileControlsDisabled
        ? readFileModeOnlyAffordanceText("Previous track")
        : (fileTransportMutationLocked
          ? readFinalizingFileTransportAffordanceText("Track changes")
          : (ui.btnPrev && ui.btnPrev.disabled ? "Previous track unavailable" : "Previous track (P)"))
    );
    syncControlCopy(
      ui.btnNext,
      fileControlsDisabled
        ? readFileModeOnlyAffordanceText("Next track")
        : (fileTransportMutationLocked
          ? readFinalizingFileTransportAffordanceText("Track changes")
          : (ui.btnNext && ui.btnNext.disabled ? "Next track unavailable" : "Next track (N)"))
    );
    syncControlCopy(
      ui.btnRepeat,
      fileControlsDisabled
        ? readFileModeOnlyAffordanceText("Repeat")
        : `Repeat queue: ${repeatModeText}`
    );
    syncControlCopy(
      ui.btnShuffle,
      fileControlsDisabled
        ? readFileModeOnlyAffordanceText("Shuffle")
        : "Shuffle queue"
    );
    syncControlCopy(
      ui.btnToggleQueue,
      fileControlsDisabled
        ? readFileModeOnlyAffordanceText("Queue")
        : (queueVisible ? "Hide file queue" : "Show file queue")
    );
    syncControlCopy(
      ui.btnClearQueue,
      fileControlsDisabled
        ? readFileModeOnlyAffordanceText("Clear queue")
        : (fileTransportMutationLocked
          ? readFinalizingFileTransportAffordanceText("Track changes")
          : "Clear file queue")
    );
  }

  function buildRecordingUiSyncKey() {
    const recording = state.recording;
    return [
      recording.lastUpdatedAtMs == null ? "null" : String(recording.lastUpdatedAtMs),
      recording.phase || "",
      recording.includePlaybackAudio ? "1" : "0",
      Number.isFinite(recording.targetFps) ? String(recording.targetFps) : "na",
      recording.selectedMimeType || "",
      recording.resolvedMimeType || "",
      recording.lastExportUrl || "",
      recording.lastExportFileName || "",
      state.audio.isLoaded ? "1" : "0",
      state.source && state.source.kind ? state.source.kind : "none",
      state.source && state.source.sessionActive ? "1" : "0",
      ui.recordingPanelVisible ? "1" : "0",
    ].join("|");
  }

  function buildQueuePanelSyncKey() {
    return [
      Queue.length,
      Queue.currentIndex,
      state.source && state.source.kind ? state.source.kind : "none",
      state.source && state.source.status ? state.source.status : "",
      state.audio && state.audio.isLoaded ? "1" : "0",
      state.audio && state.audio.filename ? state.audio.filename : "",
      isFinalizingFileTransportLocked() ? "1" : "0",
    ].join("|");
  }

  function syncVisibleQueuePanel() {
    const nextSyncKey = buildQueuePanelSyncKey();
    if (!ui.queuePanel || !ui.queueList) {
      ui.queuePanelSyncKey = nextSyncKey;
      return;
    }
    if (ui.queuePanel.style.display === "none") {
      ui.queuePanelSyncKey = nextSyncKey;
      return;
    }
    if (ui.queuePanelSyncKey === nextSyncKey) return;
    queuePanelRefresher();
  }

  function refreshRecordingUi() {
    const model = getRecordingUiModel();
    const recording = model.recording;
    syncSourceSelectorUi();

    // Build 113 record UI reads directly from state.recording. Keep one status authority.
    if (ui.recordPanel && ui.recordPanel.dataset.recordingPhase !== recording.phase) {
      ui.recordPanel.dataset.recordingPhase = recording.phase;
    }
    if (ui.recordPanel) ui.recordPanel.setAttribute("aria-busy", recording.phase === "finalizing" ? "true" : "false");
    if (ui.openRecord && ui.openRecord.dataset.recordingPhase !== recording.phase) {
      ui.openRecord.dataset.recordingPhase = recording.phase;
    }
    if (ui.openRecord) ui.openRecord.classList.toggle("is-recording", recording.phase === "recording");
    if (ui.btnOpenRecord) {
      if (ui.btnOpenRecord.title !== model.launcherLabel) ui.btnOpenRecord.title = model.launcherLabel;
      if (ui.btnOpenRecord.getAttribute("aria-label") !== model.launcherLabel) {
        ui.btnOpenRecord.setAttribute("aria-label", model.launcherLabel);
      }
    }
    syncWorkspaceLauncherState();

    syncRecordingMimeOptions(model);
    syncRecordingTargetFpsOptions(model);

    if (ui.recordTimer && ui.recordTimer.textContent !== model.timerText) {
      ui.recordTimer.textContent = model.timerText;
    }
    if (ui.valRecordMime && ui.valRecordMime.textContent !== model.resolvedMimeLabel) {
      ui.valRecordMime.textContent = model.resolvedMimeLabel;
    }
    if (ui.valRecordPreferredMime && ui.valRecordPreferredMime.textContent !== model.selectedMimeLabel) {
      ui.valRecordPreferredMime.textContent = model.selectedMimeLabel;
    }
    if (ui.valRecordIncludeAudio && ui.valRecordIncludeAudio.textContent !== model.includeAudioLabel) {
      ui.valRecordIncludeAudio.textContent = model.includeAudioLabel;
    }
    if (ui.valRecordTargetFps && ui.valRecordTargetFps.textContent !== model.targetFpsLabel) {
      ui.valRecordTargetFps.textContent = model.targetFpsLabel;
    }

    if (ui.recordStatus && ui.recordStatus.textContent !== model.primaryStatusText) {
      ui.recordStatus.textContent = model.primaryStatusText;
    }

    if (ui.recordSupport && ui.recordSupport.textContent !== model.supportText) {
      ui.recordSupport.textContent = model.supportText;
    }

    if (ui.recordExportMeta && ui.recordExportMeta.textContent !== model.exportMetaText) {
      ui.recordExportMeta.textContent = model.exportMetaText;
    }

    if (ui.chkRecordIncludeAudio) {
      ui.chkRecordIncludeAudio.checked = !!recording.includePlaybackAudio;
      ui.chkRecordIncludeAudio.disabled = !model.canToggleIncludeAudio;
    }
    if (ui.btnRecordStart) ui.btnRecordStart.disabled = !model.canStart;
    if (ui.btnRecordStop) ui.btnRecordStop.disabled = !model.canStop;
    if (ui.btnRecordDownloadLast) ui.btnRecordDownloadLast.disabled = !model.canDownload;
    if (ui.selRecordMime) ui.selRecordMime.disabled = !model.canSelectMime;
    if (ui.selRecordTargetFps) ui.selRecordTargetFps.disabled = !model.canSelectTargetFps;
    syncVisibleQueuePanel();
    ui.recordingUiSyncKey = buildRecordingUiSyncKey();
  }

  function maybeRefreshRecordingUi() {
    const syncKey = buildRecordingUiSyncKey();
    if (ui.recordingUiSyncKey === syncKey) return;
    refreshRecordingUi();
  }

  function dispatchRecordingAction(action, options = {}) {
    let result;

    switch (action) {
      case "support":
        result = RecorderEngine.getSupportStatus();
        break;
      case "start":
        result = RecorderEngine.start(options);
        break;
      case "stop":
        result = RecorderEngine.stop();
        break;
      case "selectMime":
        result = RecorderEngine.selectMimeType(options.mimeType);
        break;
      case "setIncludeAudio":
        result = RecorderEngine.setIncludePlaybackAudio(!!options.enabled);
        break;
      case "setTargetFps":
        result = RecorderEngine.setTargetFps(Number(options.fps));
        break;
      case "reset":
        result = RecorderEngine.reset();
        break;
      default:
        result = {
          ok: false,
          code: "unknown-recording-action",
          message: `Unknown recording action: ${action}`,
          phase: state.recording.phase,
        };
        break;
    }

    refreshRecordingUi();
    return result;
  }

  async function dispatchSourceSwitchAction(kind) {
    return sourceSwitchDispatcher(kind);
  }

  function refreshAllUiText(analysisFrame) {
    const p = preferences;
    maybeRefreshRecordingUi();
    syncOrbBandPickers();

    const bandText = analysisFrame && analysisFrame.ready
      ? (analysisFrame.monoLike ? "mono-ish (L≈R)" : "stereo (L≠R)")
      : "n/a";

    const recordingStatusText = formatRecordingAudioStatusSummary(state.recording);
    const hasAudioToast = performance.now() < _audioStatusToastUntilMs;
    const sourceUi = readSourceUiModel({
      sourceState: state.source,
      audioState: state.audio,
      queueLength: Queue.length,
      currentIndex: Queue.currentIndex,
      bandText,
      recordingStatusText,
      hasAudioToast,
      audioToastText: _audioStatusToastText,
    });
    const fileControlsDisabled = sourceUi.disableFileControls;
    const fileTransportMutationLocked = !!sourceUi.fileTransportMutationLocked;

    ui.audioStatus.textContent = sourceUi.audioStatusText;
    if (ui.audioPanel) ui.audioPanel.dataset.sourceMode = sourceUi.audioPanelSourceMode;
    syncSourceSelectorUi(sourceUi);
    syncLoadHintVisibility(state.source);

    ui.btnLoad.disabled = fileControlsDisabled || fileTransportMutationLocked;
    ui.btnPlay.disabled = fileControlsDisabled || !state.audio.isLoaded;
    ui.btnStop.disabled = fileControlsDisabled || !state.audio.isLoaded;
    ui.btnPlay.textContent = state.audio.isPlaying ? "Pause" : "Play";

    // Manual transport buttons: boundary-aware by default; wrap at boundaries when Repeat=All.
    const repeatAllWrap = preferences.audio.repeatMode === "all" && Queue.length > 1;
    ui.btnPrev.disabled = fileControlsDisabled || fileTransportMutationLocked || !(Queue.canPrev() || repeatAllWrap);
    ui.btnNext.disabled = fileControlsDisabled || fileTransportMutationLocked || !(Queue.canNext() || repeatAllWrap);

    ui.btnRepeat.textContent = `Repeat: ${p.audio.repeatMode === "one" ? "One" : (p.audio.repeatMode === "all" ? "All" : "Off")}`;
    ui.btnRepeat.disabled = fileControlsDisabled;
    ui.btnShuffle.disabled = fileControlsDisabled || Queue.length < 3;
    ui.btnToggleQueue.disabled = fileControlsDisabled;
    ui.btnClearQueue.disabled = fileControlsDisabled || fileTransportMutationLocked || Queue.length === 0;
    syncFileControlAffordances(sourceUi);
    ui.chkMute.checked = !!p.audio.muted;
    ui.rngVol.value = String(p.audio.volume);
    ui.valVol.textContent = fmt(p.audio.volume, 2);

    const bulk = (group, field, control, output, format) => {
      const model = readBulkOrbValue(p.orbs, group, field);
      if (!model.mixed) control.value = String(model.value);
      output.textContent = model.mixed ? "mixed" : format(model.value);
      if (control.type === "checkbox") {
        control.indeterminate = model.mixed;
        if (!model.mixed) control.checked = !!model.value;
      }
      return model;
    };
    bulk("trace", "lines", ui.chkLines, ui.valLines, (v) => v ? "on" : "off");
    bulk("trace", "numLines", ui.rngNumLines, ui.valNumLines, String);
    bulk("trace", "lineColorMode", ui.selLineColorMode, ui.valLineColorMode, String);
    bulk("particles", "emitPerSecond", ui.rngEmit, ui.valEmit, (v) => `${v}/s`);
    bulk("particles", "sizeMaxPx", ui.rngSizeMax, ui.valSizeMax, (v) => `${v}px`);
    bulk("particles", "sizeMinPx", ui.rngSizeMin, ui.valSizeMin, (v) => `${v}px`);
    bulk("particles", "sizeToMinSec", ui.rngSizeToMin, ui.valSizeToMin, (v) => `${fmt(v, 1)}s`);
    bulk("particles", "ttlSec", ui.rngTTL, ui.valTTL, (v) => `${fmt(v, 1)}s`);
    bulk("particles", "overlapRadiusPx", ui.rngOverlap, ui.valOverlap, (v) => `${fmt(v, 1)}px`);
    bulk("motion", "angularSpeedRadPerSec", ui.rngOmega, ui.valOmega, (v) => `${fmt(v, 3)} rad/s (${fmt(v * RAD_TO_DEG, 1)}°/s)`);
    bulk("response", "waveformRadialDisplaceFrac", ui.rngWfDisp, ui.valWfDisp, (v) => fmt(v, 3));

    refreshOrbPanelUi(p);

    ui.rngRmsGain.value = String(p.audio.rmsGain);
    ui.valRmsGain.textContent = fmt(p.audio.rmsGain, 2);

    bulk("response", "minRadiusFrac", ui.rngMinRad, ui.valMinRad, (v) => fmt(v, 3));
    bulk("response", "maxRadiusFrac", ui.rngMaxRad, ui.valMaxRad, (v) => fmt(v, 3));

    ui.rngSmooth.value = String(p.audio.smoothingTimeConstant);
    ui.valSmooth.textContent = fmt(p.audio.smoothingTimeConstant, 2);

    ui.selFFT.value = String(p.audio.fftSize);
    ui.valFFT.textContent = `${p.audio.fftSize}`;

    ui.clrBg.value = p.visuals.backgroundColor;
    ui.valBg.textContent = p.visuals.backgroundColor;

    ui.clrParticle.value = p.visuals.particleColor;
    ui.valParticle.textContent = p.visuals.particleColor;

    ui.selParticleColorSrc.value = p.bands.particleColorSource;
    ui.valParticleSrc.textContent = p.bands.particleColorSource;

    ui.selDistMode.value = p.bands.distributionMode;
    ui.valDistMode.textContent = p.bands.distributionMode;

    ui.chkBandOverlay.checked = !!p.bands.overlay.enabled;
    ui.valBandOverlay.textContent = p.bands.overlay.enabled ? "on" : "off";

    ui.chkBandConnect.checked = !!p.bands.overlay.connectAdjacent;
    ui.valBandConnect.textContent = p.bands.overlay.connectAdjacent ? "on" : "off";

    ui.rngBandAlpha.value = String(p.bands.overlay.alpha);
    ui.valBandAlpha.textContent = fmt(p.bands.overlay.alpha, 2);

    ui.rngBandPoint.value = String(p.bands.overlay.pointSizePx);
    ui.valBandPoint.textContent = `${p.bands.overlay.pointSizePx}px`;

    ui.rngBandOverlayMinRad.value = String(p.bands.overlay.minRadiusFrac);
    ui.valBandOverlayMinRad.textContent = fmt(p.bands.overlay.minRadiusFrac, 3);

    ui.rngBandOverlayMaxRad.value = String(p.bands.overlay.maxRadiusFrac);
    ui.valBandOverlayMaxRad.textContent = fmt(p.bands.overlay.maxRadiusFrac, 3);

    ui.rngBandOverlayWfDisp.value = String(p.bands.overlay.waveformRadialDisplaceFrac);
    ui.valBandOverlayWfDisp.textContent = fmt(p.bands.overlay.waveformRadialDisplaceFrac, 3);

    ui.selRingPhaseMode.value = p.bands.overlay.phaseMode;
    ui.valRingPhaseMode.textContent = p.bands.overlay.phaseMode;

    ui.rngRingSpeed.value = String(p.bands.overlay.ringSpeedRadPerSec);
    ui.valRingSpeed.textContent = `${fmt(p.bands.overlay.ringSpeedRadPerSec, 2)} rad/s`;

    ui.rngHueOff.value = String(p.bands.rainbow.hueOffsetDeg);
    ui.valHueOff.textContent = `${p.bands.rainbow.hueOffsetDeg}°`;

    ui.rngSat.value = String(p.bands.rainbow.saturation);
    ui.valSat.textContent = fmt(p.bands.rainbow.saturation, 2);

    ui.rngVal.value = String(p.bands.rainbow.value);
    ui.valVal.textContent = fmt(p.bands.rainbow.value, 2);

    refreshConfigTooltips();
    refreshRecordingUi();

    refreshBandMetaText(analysisFrame);

    if (analysisFrame && analysisFrame.ready) {
      const nowMs = performance.now();
      const hudIntervalMs = ui.bandHudIntervalMs || 100;
      const bandsPanelVisible = ui.bandsPanel && ui.bandsPanel.style.display !== "none";
      const canRefreshHud = bandsPanelVisible && (nowMs - ui.lastBandHudUpdateMs >= hudIntervalMs);
      if (canRefreshHud) {
        refreshBandHud(analysisFrame);
        ui.lastBandHudUpdateMs = nowMs;
      }
    }
  }

  function resetTrackVisualState() {
    Scrubber.reset();
    resetVisualizers("track");
    state.bands.energies01.fill(0);
    state.bands.dominantIndex = 0;
    state.bands.dominantName = "(none)";
    refreshBandHud();
  }

  function wireControls() {
    primeDomCache();

    ui.orbPickerSettings = null;
    ui.orbPickerEdges = null;
    ui.orbBandPickers = CONFIG.defaults.orbs.map((_, index) => createOrbBandPicker(
      document.getElementById(`orb${index}BandPicker`), {
        orbLabel: `Orb ${index + 1}`,
        onChange(ids) {
          preferences.orbs[index].bandIds = ids;
          applyOrbPrefChange(index, `orb ${index + 1} bands`);
        },
        formatRange: BandBank.formatBandRangeText,
        describeBank: () => `${preferences.bands.distributionMode.toUpperCase()} distribution · ${BAND_NAMES.length} bands · ${Number.isFinite(state.bands.meta.nyquistHz) ? "ranges limited to the active Nyquist frequency" : "configured ranges; connect audio for the active frequency limit"}`,
      }
    ));
    if (ui.audioDockObserver) ui.audioDockObserver.disconnect();
    if (typeof ResizeObserver === "function") {
      ui.audioDockObserver = new ResizeObserver(syncAudioDockHeight);
      ui.audioDockObserver.observe(ui.audioPanel);
    }
    syncAudioDockHeight();

    initConfigTooltips();


    /* -------------------------------------------------------------------------
       clearAudioState() — canonical clean-slate reset for all stop/clear paths.

       3.4 — Clear queue clean-slate audit. Every item the checklist requires:
         ✓ state.audio.isLoaded = false    — set explicitly below
         ✓ state.audio.filename = ""       — set explicitly below
         ✓ state.audio.isPlaying = false   — set explicitly below
         ✓ InputSourceManager teardown     — caller must invoke teardown before this function
         ✓ All orb trails reset            — loop below
         ✓ Scrubber blank                  — Scrubber.reset()
         ✓ Play/Stop buttons disabled      — driven by state.audio.isLoaded in refreshAllUiText
         ✓ Prev/Next buttons disabled      — driven by Queue.canPrev/canNext;
                                             caller must call Queue.clear() first
         ✓ No blob URLs left alive         — revoked by loadeddata/error during track
                                             lifetime; source teardown performs
                                             teardown() and final release safety.
      Build 113 policy: queue clear/unload stays transport-owned here. If recording is
      active, RecorderEngine is notified after transport reset so capture can
      continue without loaded audio, without mutating this reset path.
       Called by: remove-button handler (active track removed, queue now empty)
                  btnClearQueue handler
       Callers must call InputSourceManager.teardownActiveSource() and Queue.clear() before this.
       ------------------------------------------------------------------------- */
    function clearAudioState() {
      state.audio.isLoaded = false;
      state.audio.isPlaying = false;
      state.audio.filename = "";
      state.audio.transportError = "";
      resetTrackVisualState();
    }

    function clearRecoverableIdleSourceError() {
      return typeof InputSourceManager.clearRecoverableIdleError === "function"
        ? InputSourceManager.clearRecoverableIdleError()
        : false;
    }

    function resetEmptyFileWorkflowState(reason) {
      InputSourceManager.teardownActiveSource({ reason });
      clearRecoverableIdleSourceError();
      clearAudioState();
    }

    function toastFinalizingTransportLock() {
      audioStatusToast(readFinalizingFileTransportLockText("Track changes"), 3000);
    }

    /* -------------------------------------------------------------------------
       loadAndPlay — single shared helper for all track-change paths.

       3.1 — Entry-point audit. Every path that changes the current track routes
       through here so trail reset + scrubber reset happen in exactly one place:
         (1) _onTrackEnded repeat policy → loadAndPlay/stop     [auto-advance/repeat]
         (2) fileInput change → loadAndPlay                    [Load button, 1st track]
         (3) drop handler    → loadAndPlay                     [drag-drop, 1st track]
         (4) btnNext click   → Queue.next() → loadAndPlay
         (5) btnPrev click   → Queue.prev() → loadAndPlay
         (6) queue row click → Queue.goTo() → loadAndPlay      [click-to-jump]
         (7) remove handler  → loadAndPlay  (wasActive && nextFile case)
      Build 113 policy: active recording spans track changes through this path.
      Notify RecorderEngine, but do not add recorder-specific transport branching.
       DoD: no trail bleed between tracks; scrubber never shows stale waveform.
       ------------------------------------------------------------------------- */
    let activeLoadRequestId = 0;

    function invalidatePendingTrackLoads() {
      activeLoadRequestId += 1;
    }

    async function switchToMicMode() {
      if (isSourceSwitchLocked()) return false;
      if (state.source.kind === "mic" && (state.source.status === "requesting" || state.source.status === "active")) {
        return false;
      }

      invalidatePendingTrackLoads();
      clearAudioStatusToast();
      clearAudioState();
      hideQueuePanel();
      RecorderEngine.onTransportMutation("audio-unloaded", {
        reason: "switch-to-mic",
      });
      const activation = await InputSourceManager.activateMic();
      RecorderEngine.getSupportStatus();
      refreshQueuePanel();
      return !!(activation && activation.ok);
    }

    async function switchToStreamMode() {
      if (isSourceSwitchLocked()) return false;
      if (state.source.kind === "stream" && (state.source.status === "requesting" || state.source.status === "active")) {
        return false;
      }

      invalidatePendingTrackLoads();
      clearAudioStatusToast();
      clearAudioState();
      hideQueuePanel();
      RecorderEngine.onTransportMutation("audio-unloaded", {
        reason: "switch-to-stream",
      });
      const activation = await InputSourceManager.activateStream();
      RecorderEngine.getSupportStatus();
      refreshQueuePanel();
      return !!(activation && activation.ok);
    }

    async function switchToFileMode() {
      if (isSourceSwitchLocked()) return false;
      if (isFileWorkflowMode(state.source)) {
        const clearedRecoverableIdleError = clearRecoverableIdleSourceError();
        if (clearedRecoverableIdleError) {
          clearAudioStatusToast();
          RecorderEngine.getSupportStatus();
          refreshQueuePanel();
        }
        return clearedRecoverableIdleError;
      }

      invalidatePendingTrackLoads();
      clearAudioStatusToast();
      await InputSourceManager.teardownActiveSource({ reason: "switch-to-file-mode" });
      clearAudioState();
      hideQueuePanel();
      RecorderEngine.onTransportMutation("audio-unloaded", {
        reason: "switch-to-file-mode",
      });
      RecorderEngine.getSupportStatus();
      refreshQueuePanel();
      return true;
    }

    sourceSwitchDispatcher = async (kind) => {
      switch (kind) {
        case "file":
          return switchToFileMode();
        case "mic":
          return switchToMicMode();
        case "stream":
          return switchToStreamMode();
        default:
          return false;
      }
    };

    async function loadAndPlay(file, opts = {}) {
      if (!file) return false;
      const requestId = ++activeLoadRequestId;
      state.audio.transportError = "";
      RecorderEngine.onTransportMutation("track-change-start", {
        requestId,
        filename: file && file.name ? file.name : "",
      });
      // Hard reset visual state immediately on every track switch so no stale
      // waveform/playhead, trail particles, or dominant band state can persist.
      resetTrackVisualState();
      const activation = await InputSourceManager.activateFile(file, {
        requestId,
        autoPlay: opts && opts.autoPlay === false ? false : true,
      });
      if (requestId !== activeLoadRequestId) return false;
      const ok = !!(activation && activation.ok);
      if (!ok) {
        RecorderEngine.onTransportMutation("track-change-failed", {
          requestId,
          filename: file && file.name ? file.name : "",
          error: state.audio.transportError || "",
        });
        audioStatusToast(state.audio.transportError || "Playback failed.", 6000);
        refreshQueuePanel();
        return false;
      }
      Scrubber.loadFile(file); // async — decode in background; playback may be play or paused by opts
      applyPrefs(null);
      RecorderEngine.onTransportMutation("track-change-complete", {
        requestId,
        filename: file && file.name ? file.name : "",
      });
      if (state.audio.transportError) audioStatusToast(state.audio.transportError, 6000);
      else audioStatusToast(`Loaded: ${file.name}`, 2500);
      refreshQueuePanel();
      return true;
    }

    /* Register _onTrackEnded hook once at boot.
       Single source of truth for queue-aware repeat behavior on natural track end.
       The hook survives teardown() intentionally — registered once at boot,
       must persist across track loads. Documented in 111c/111d. */
    AudioEngine._isLoadRequestCurrent = (requestId) => requestId === activeLoadRequestId;

    AudioEngine._onTrackEnded = () => {
      if (isFinalizingFileTransportLocked()) return;
      const mode = preferences.audio.repeatMode;

      if (mode === "one") {
        const file = Queue.current();
        if (file) loadAndPlay(file);
        return;
      }

      if (Queue.canNext()) {
        const file = Queue.next();
        if (file) loadAndPlay(file);
        return;
      }

      if (mode === "all" && Queue.length > 0) {
        const file = Queue.goTo(0);
        if (file) loadAndPlay(file);
        return;
      }
      // mode=none at queue end: playback ends, but active recording continues
      // until the user explicitly stops it.
      RecorderEngine.onTransportMutation("audio-unloaded", {
        reason: "track-ended-no-next",
      });
    };

    function activateQueueRow(trackIndex) {
      if (isFinalizingFileTransportLocked()) {
        toastFinalizingTransportLock();
        return;
      }
      const file = Queue.goTo(trackIndex);
      if (file) loadAndPlay(file);
    }

    /* Queue panel renderer — rebuilds list DOM from Queue.snapshot().
       each row is keyboard-reachable and declared as a button-like activator. */
    function refreshQueuePanel() {
      if (!ui.queueList) return;
      const snap = Queue.snapshot();
      const fileTransportMutationLocked = isFinalizingFileTransportLocked();
      const allowQueueInteraction = isFileWorkflowMode(state.source) && !fileTransportMutationLocked;
      const queueLockText = readFinalizingFileTransportLockText("Track changes");
      const isQueueInteractionBlocked = () => {
        const interactionLocked = isFinalizingFileTransportLocked();
        const canInteract = isFileWorkflowMode(state.source) && !interactionLocked;
        if (canInteract) return false;
        if (interactionLocked) toastFinalizingTransportLock();
        return true;
      };
      ui.queueList.innerHTML = "";
      for (const item of snap.items) {
        const itemIsActive = shouldShowActiveQueueItem(state.source, state.audio, item);
        const row = document.createElement("div");
        row.className = "queue-item" + (itemIsActive ? " active" : "");
        row.title = fileTransportMutationLocked ? `${item.name} - ${queueLockText}` : item.name;
        row.tabIndex = allowQueueInteraction ? 0 : -1;
        row.setAttribute("role", "button");
        row.setAttribute(
          "aria-label",
          allowQueueInteraction
            ? `Play queue item ${item.index + 1}: ${item.name}`
            : `Queue item ${item.index + 1}: ${item.name}. ${fileTransportMutationLocked ? queueLockText : readFileModeOnlyAffordanceText("Queue")}`
        );
        row.setAttribute("aria-current", itemIsActive ? "true" : "false");
        row.setAttribute("aria-disabled", allowQueueInteraction ? "false" : "true");

        const idx = document.createElement("span");
        idx.className = "q-idx";
        idx.textContent = String(item.index + 1);

        const name = document.createElement("span");
        name.className = "q-name";
        name.textContent = item.name;

        const removeBtn = document.createElement("button");
        removeBtn.className = "q-remove";
        removeBtn.textContent = "×";
        removeBtn.title = fileTransportMutationLocked ? queueLockText : "Remove from queue";
        removeBtn.disabled = !allowQueueInteraction;
        removeBtn.addEventListener("keydown", (e) => {
          if (isQueueInteractionBlocked()) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            removeBtn.click();
          }
        });
        removeBtn.addEventListener("click", (e) => {
          if (isQueueInteractionBlocked()) return;
          e.stopPropagation(); // prevent row click-to-jump
          const wasActive = hasActiveFileSource(state.source, state.audio) && Queue.currentIndex === item.index;
          const wasPlaying = state.audio.isPlaying;
          const nextFile = Queue.remove(item.index);
          if (wasActive && nextFile) {
            // Removed active track. Successor is loaded preserving prior play/pause intent.
            loadAndPlay(nextFile, { autoPlay: wasPlaying });
          } else if (Queue.length === 0) {
            // Removed the final queued track — return to the canonical empty File workflow.
            resetEmptyFileWorkflowState(wasActive ? "active-remove-empty-queue" : "remove-empty-queue"); // 3.4 — via shared helper; see clearAudioState() for audit
          }
          if (wasActive && Queue.length === 0) {
            RecorderEngine.onTransportMutation("audio-unloaded", {
              reason: "active-remove-empty-queue",
            });
          }
          // wasActive === false: non-active track removed, playback unaffected.
          refreshQueuePanel();
        });

        row.appendChild(idx);
        row.appendChild(name);
        row.appendChild(removeBtn);

        // Row activation: click or keyboard (Enter/Space) jumps to that track.
        row.addEventListener("click", () => {
          if (isQueueInteractionBlocked()) return;
          activateQueueRow(item.index);
        });
        row.addEventListener("keydown", (e) => {
          if (isQueueInteractionBlocked()) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            activateQueueRow(item.index);
          }
        });

        ui.queueList.appendChild(row);
      }
      ui.queuePanelSyncKey = buildQueuePanelSyncKey();
    }
    queuePanelRefresher = refreshQueuePanel;

    wireConfigTooltipFeedbackEvents();
    setWorkspaceLauncherCollapsed(!!ui.workspaceLauncherCollapsed);
    primeRecordUi();
    refreshRecordingUi();

    if (ui.btnHideRecord) ui.btnHideRecord.addEventListener("click", () => {
      hideRecordPanel();
    });
    if (ui.btnOpenRecord) ui.btnOpenRecord.addEventListener("click", () => {
      if (ui.recordingPanelVisible) hideRecordPanel();
      else showRecordPanel();
    });
    if (ui.btnRecordStart) ui.btnRecordStart.addEventListener("click", () => {
      dispatchRecordingAction("start");
    });
    if (ui.btnRecordStop) ui.btnRecordStop.addEventListener("click", () => {
      dispatchRecordingAction("stop");
    });
    if (ui.selRecordMime) ui.selRecordMime.addEventListener("change", () => {
      dispatchRecordingAction("selectMime", { mimeType: ui.selRecordMime.value });
    });
    if (ui.chkRecordIncludeAudio) ui.chkRecordIncludeAudio.addEventListener("change", () => {
      dispatchRecordingAction("setIncludeAudio", { enabled: ui.chkRecordIncludeAudio.checked });
    });
    if (ui.selRecordTargetFps) ui.selRecordTargetFps.addEventListener("change", () => {
      dispatchRecordingAction("setTargetFps", { fps: Number(ui.selRecordTargetFps.value) });
    });
    if (ui.btnRecordDownloadLast) ui.btnRecordDownloadLast.addEventListener("click", () => {
      downloadLastRecording();
    });

    function toastFileModeOnlyAction() {
      audioStatusToast("Switch to File mode to use file playback controls.", 2500);
    }

    /* Events */
    if (ui.btnSourceFile) ui.btnSourceFile.addEventListener("click", () => {
      dispatchSourceSwitchAction("file");
    });
    if (ui.btnSourceMic) ui.btnSourceMic.addEventListener("click", () => {
      dispatchSourceSwitchAction("mic");
    });
    if (ui.btnSourceStream) ui.btnSourceStream.addEventListener("click", () => {
      dispatchSourceSwitchAction("stream");
    });

    // fileInput.value reset (checklist 3.7): cleared before every picker open so
    // the same file can be loaded a second time. The drag-drop path uses
    // dataTransfer.files directly — it never touches fileInput — so no reset
    // is needed there. This is the only fileInput add path; invariant maintained.
    ui.btnLoad.addEventListener("click", () => {
      if (!isFileWorkflowMode(state.source)) {
        toastFileModeOnlyAction();
        return;
      }
      if (isFinalizingFileTransportLocked()) {
        toastFinalizingTransportLock();
        return;
      }
      ui.fileInput.value = "";
      ui.fileInput.click();
    });

    ui.fileInput.addEventListener("change", async () => {
      if (!isFileWorkflowMode(state.source)) {
        toastFileModeOnlyAction();
        return;
      }
      if (isFinalizingFileTransportLocked()) {
        toastFinalizingTransportLock();
        return;
      }
      const files = Array.from(ui.fileInput.files || []).filter(f => f.type.startsWith("audio/"));
      if (!files.length) return;

      for (const file of files) {
        const wasEmpty = Queue.length === 0;
        const idx = Queue.add(file);
        if (wasEmpty) {
          Queue.setCursor(idx);
          await loadAndPlay(file);
        }
      }
      refreshQueuePanel();
    });

    ui.btnPlay.addEventListener("click", async () => {
      if (!isFileWorkflowMode(state.source)) return;
      await AudioEngine.playPause();
      if (state.audio.transportError) audioStatusToast(state.audio.transportError, 6000);
    });
    ui.btnStop.addEventListener("click", () => {
      if (!isFileWorkflowMode(state.source)) return;
      AudioEngine.stop();
      state.audio.transportError = "";
    });

    function pickManualPrevFile() {
      if (Queue.canPrev()) return Queue.prev();
      if (preferences.audio.repeatMode === "all" && Queue.length > 1) return Queue.goTo(Queue.length - 1);
      return null;
    }

    function pickManualNextFile() {
      if (Queue.canNext()) return Queue.next();
      if (preferences.audio.repeatMode === "all" && Queue.length > 1) return Queue.goTo(0);
      return null;
    }

    ui.btnPrev.addEventListener("click", async () => {
      if (!isFileWorkflowMode(state.source)) return;
      if (isFinalizingFileTransportLocked()) {
        toastFinalizingTransportLock();
        return;
      }
      const file = pickManualPrevFile();
      if (file) await loadAndPlay(file);
    });
    ui.btnNext.addEventListener("click", async () => {
      if (!isFileWorkflowMode(state.source)) return;
      if (isFinalizingFileTransportLocked()) {
        toastFinalizingTransportLock();
        return;
      }
      const file = pickManualNextFile();
      if (file) await loadAndPlay(file);
    });

    ui.btnToggleQueue.addEventListener("click", () => {
      if (!isFileWorkflowMode(state.source)) return;
      if (isPanelVisible(ui.queuePanel)) hideQueuePanel(); else showQueuePanel();
    });
    if (ui.btnOpenQueue) ui.btnOpenQueue.addEventListener("click", () => {
      if (isPanelVisible(ui.queuePanel)) hideQueuePanel(); else showQueuePanel();
    });
    if (ui.btnHideQueue) ui.btnHideQueue.addEventListener("click", hideQueuePanel);
    if (ui.btnTogglePanels) ui.btnTogglePanels.addEventListener("click", togglePanels);
    for (const panel of [ui.simPanel, ui.bandsPanel, ui.queuePanel, ui.recordPanel]) {
      if (panel) panel.addEventListener("pointerdown", () => bringPanelForward(panel));
    }

    ui.btnClearQueue.addEventListener("click", () => {
      if (!isFileWorkflowMode(state.source)) return;
      if (isFinalizingFileTransportLocked()) {
        toastFinalizingTransportLock();
        return;
      }
      // 3.4 — Clear queue clean-slate path. Order matters:
      // Queue.clear() first so Prev/Next disable correctly in next refreshAllUiText.
      // Source teardown before clearAudioState() so no media remains attached.
      Queue.clear();
      resetEmptyFileWorkflowState("queue-cleared"); // sets isLoaded/isPlaying/filename, resets scrubber + trails
      RecorderEngine.onTransportMutation("audio-unloaded", {
        reason: "queue-cleared",
      });
      refreshQueuePanel();
    });

    ui.btnRepeat.addEventListener("click", () => {
      if (!isFileWorkflowMode(state.source)) return;
      const mode = preferences.audio.repeatMode;
      preferences.audio.repeatMode = mode === "none" ? "one" : (mode === "one" ? "all" : "none");
      applyPrefs("repeat");
    });
    if (ui.btnShuffle) {
      ui.btnShuffle.addEventListener("click", () => {
        if (!isFileWorkflowMode(state.source)) return;
        if (Queue.shuffle()) refreshQueuePanel();
      });
    }
    ui.chkMute.addEventListener("change", () => { preferences.audio.muted = !!ui.chkMute.checked; applyPrefs("mute"); });

    ui.rngVol.addEventListener("input", () => {
      preferences.audio.volume = Number(ui.rngVol.value);
      applyPrefs("volume (playback only)");
    });

    if (ui.btnToggleWorkspaceLauncher) ui.btnToggleWorkspaceLauncher.addEventListener("click", toggleWorkspaceLauncherCollapsed);

    ui.btnHideAudio.addEventListener("click", hideAudioPanel);
    ui.btnOpenAudio.addEventListener("click", () => {
      if (isPanelVisible(ui.audioPanel)) hideAudioPanel();
      else showAudioPanel();
    });

    ui.btnHideSim.addEventListener("click", hideSimPanel);
    ui.btnOpenSim.addEventListener("click", () => {
      if (isPanelVisible(ui.simPanel)) hideSimPanel();
      else showSimPanel();
    });

    ui.btnHideBands.addEventListener("click", hideBandsPanel);
    ui.btnOpenBands.addEventListener("click", () => {
      if (isPanelVisible(ui.bandsPanel)) hideBandsPanel();
      else showBandsPanel();
    });

    ui.btnShare.addEventListener("click", shareLink);
    ui.btnApplyUrl.addEventListener("click", applyUrlNow);
    ui.btnResetPrefs.addEventListener("click", resetPrefs);
    ui.btnResetVisuals.addEventListener("click", () => { resetVisualizers("visuals"); simStatusToast("Visuals reset."); });

    ui.chkLines.addEventListener("change", () => { applyBulkOrbValue(preferences.orbs, "trace", "lines", !!ui.chkLines.checked); applyPrefs("lines"); });
    ui.rngNumLines.addEventListener("input", () => { applyBulkOrbValue(preferences.orbs, "trace", "numLines", Number(ui.rngNumLines.value)); applyPrefs("num lines"); });

    ui.selLineColorMode.addEventListener("change", () => {
      applyBulkOrbValue(preferences.orbs, "trace", "lineColorMode", ui.selLineColorMode.value);
      applyPrefs("line color mode");
    });

    for (const [control, group, field, reason] of [[ui.rngEmit,"particles","emitPerSecond","emit rate"],[ui.rngSizeMax,"particles","sizeMaxPx","size max"],[ui.rngSizeMin,"particles","sizeMinPx","size min"],[ui.rngSizeToMin,"particles","sizeToMinSec","time to min"],[ui.rngTTL,"particles","ttlSec","ttl"],[ui.rngOverlap,"particles","overlapRadiusPx","overlap radius"],[ui.rngOmega,"motion","angularSpeedRadPerSec","angular speed"],[ui.rngWfDisp,"response","waveformRadialDisplaceFrac","orb waveform disp"]]) {
      control.addEventListener("input", () => { applyBulkOrbValue(preferences.orbs, group, field, Number(control.value)); applyPrefs(reason); });
    }

    ui.selOrb0Chan.addEventListener("change", () => {
      preferences.orbs[0].chanId = ui.selOrb0Chan.value;
      applyOrbPrefChange(0, "ORB0 channel", { structural: true });
    });
    ui.selOrb0Chir.addEventListener("change", () => {
      preferences.orbs[0].chirality = Number(ui.selOrb0Chir.value);
      applyOrbPrefChange(0, "ORB0 chirality", { structural: true });
    });
    ui.rngOrb0Hue.addEventListener("input", () => {
      preferences.orbs[0].hueOffsetDeg = Number(ui.rngOrb0Hue.value);
      applyOrbPrefChange(0, "ORB0 hue offset", { structural: false });
    });
    ui.selOrb0ColorSrc.addEventListener("change", () => {
      preferences.orbs[0].colorSource = ui.selOrb0ColorSrc.value;
      applyOrbPrefChange(0, "ORB0 color source", { structural: false });
    });
    ui.rngOrb0CenterX.addEventListener("input", () => {
      preferences.orbs[0].centerXFrac = Number(ui.rngOrb0CenterX.value);
      applyOrbPrefChange(0, "ORB0 center X", { structural: false });
    });
    ui.rngOrb0CenterY.addEventListener("input", () => {
      preferences.orbs[0].centerYFrac = Number(ui.rngOrb0CenterY.value);
      applyOrbPrefChange(0, "ORB0 center Y", { structural: false });
    });
    ui.txtOrb0Bands.addEventListener("change", () => {
      commitOrbBandIdsFromUi(0, "ORB0 band indices");
    });
    ui.selOrb1Chan.addEventListener("change", () => {
      preferences.orbs[1].chanId = ui.selOrb1Chan.value;
      applyOrbPrefChange(1, "ORB1 channel", { structural: true });
    });
    ui.selOrb1Chir.addEventListener("change", () => {
      preferences.orbs[1].chirality = Number(ui.selOrb1Chir.value);
      applyOrbPrefChange(1, "ORB1 chirality", { structural: true });
    });
    ui.rngOrb1Hue.addEventListener("input", () => {
      preferences.orbs[1].hueOffsetDeg = Number(ui.rngOrb1Hue.value);
      applyOrbPrefChange(1, "ORB1 hue offset", { structural: false });
    });
    ui.selOrb1ColorSrc.addEventListener("change", () => {
      preferences.orbs[1].colorSource = ui.selOrb1ColorSrc.value;
      applyOrbPrefChange(1, "ORB1 color source", { structural: false });
    });
    ui.rngOrb1CenterX.addEventListener("input", () => {
      preferences.orbs[1].centerXFrac = Number(ui.rngOrb1CenterX.value);
      applyOrbPrefChange(1, "ORB1 center X", { structural: false });
    });
    ui.rngOrb1CenterY.addEventListener("input", () => {
      preferences.orbs[1].centerYFrac = Number(ui.rngOrb1CenterY.value);
      applyOrbPrefChange(1, "ORB1 center Y", { structural: false });
    });
    ui.txtOrb1Bands.addEventListener("change", () => {
      commitOrbBandIdsFromUi(1, "ORB1 band indices");
    });

    ui.rngRmsGain.addEventListener("input", () => { preferences.audio.rmsGain = Number(ui.rngRmsGain.value); applyPrefs("rms gain (analysis)"); });
    ui.rngMinRad.addEventListener("input", () => { applyBulkOrbValue(preferences.orbs, "response", "minRadiusFrac", Number(ui.rngMinRad.value)); applyPrefs("min radius"); });
    ui.rngMaxRad.addEventListener("input", () => { applyBulkOrbValue(preferences.orbs, "response", "maxRadiusFrac", Number(ui.rngMaxRad.value)); applyPrefs("max radius"); });
    ui.rngSmooth.addEventListener("input", () => { preferences.audio.smoothingTimeConstant = Number(ui.rngSmooth.value); applyPrefs("smoothing"); });
    ui.selFFT.addEventListener("change", () => { preferences.audio.fftSize = Number(ui.selFFT.value); applyPrefs("fft size"); });

    ui.clrBg.addEventListener("input", () => { preferences.visuals.backgroundColor = ui.clrBg.value; applyPrefs("background"); });
    ui.clrParticle.addEventListener("input", () => { preferences.visuals.particleColor = ui.clrParticle.value; applyPrefs("particle color"); });

    ui.selParticleColorSrc.addEventListener("change", () => {
      preferences.bands.particleColorSource = ui.selParticleColorSrc.value;
      applyPrefs("particle color source");
    });

    ui.chkBandOverlay.addEventListener("change", () => { preferences.bands.overlay.enabled = !!ui.chkBandOverlay.checked; applyPrefs("band overlay"); });
    ui.chkBandConnect.addEventListener("change", () => { preferences.bands.overlay.connectAdjacent = !!ui.chkBandConnect.checked; applyPrefs("band connect"); });

    ui.rngBandAlpha.addEventListener("input", () => { preferences.bands.overlay.alpha = Number(ui.rngBandAlpha.value); applyPrefs("overlay alpha"); });
    ui.rngBandPoint.addEventListener("input", () => { preferences.bands.overlay.pointSizePx = Number(ui.rngBandPoint.value); applyPrefs("overlay point size"); });
    ui.rngBandOverlayMinRad.addEventListener("input", () => { preferences.bands.overlay.minRadiusFrac = Number(ui.rngBandOverlayMinRad.value); applyPrefs("overlay min radius"); });
    ui.rngBandOverlayMaxRad.addEventListener("input", () => { preferences.bands.overlay.maxRadiusFrac = Number(ui.rngBandOverlayMaxRad.value); applyPrefs("overlay max radius"); });
    ui.rngBandOverlayWfDisp.addEventListener("input", () => { preferences.bands.overlay.waveformRadialDisplaceFrac = Number(ui.rngBandOverlayWfDisp.value); applyPrefs("overlay waveform disp"); });

    ui.selRingPhaseMode.addEventListener("change", () => {
      preferences.bands.overlay.phaseMode = ui.selRingPhaseMode.value;
      applyPrefs("ring phase mode");
    });

    ui.selDistMode.addEventListener("change", () => {
      preferences.bands.distributionMode = ui.selDistMode.value;
      applyPrefs("band distribution mode", { rebuildBandsOnDefinitionChange: true });
    });

    ui.rngRingSpeed.addEventListener("input", () => {
      preferences.bands.overlay.ringSpeedRadPerSec = Number(ui.rngRingSpeed.value);
      applyPrefs("ring speed");
    });

    ui.rngHueOff.addEventListener("input", () => { preferences.bands.rainbow.hueOffsetDeg = Number(ui.rngHueOff.value); applyPrefs("hue offset"); });
    ui.rngSat.addEventListener("input", () => { preferences.bands.rainbow.saturation = Number(ui.rngSat.value); applyPrefs("saturation"); });
    ui.rngVal.addEventListener("input", () => { preferences.bands.rainbow.value = Number(ui.rngVal.value); applyPrefs("value"); });

    /* Drag-drop onto canvas — multi-file entry point.
       All dropped audio files are enqueued. If the queue was empty before the
       drop, the first file starts playing immediately. Additional files append
       silently. Non-audio files are silently ignored. */
    state.canvas.addEventListener("dragover", (e) => {
      e.preventDefault(); // required to allow drop
      e.dataTransfer.dropEffect = "copy";
    });
    state.canvas.addEventListener("drop", async (e) => {
      e.preventDefault();
      if (!isFileWorkflowMode(state.source)) {
        toastFileModeOnlyAction();
        return;
      }
      if (isFinalizingFileTransportLocked()) {
        toastFinalizingTransportLock();
        return;
      }
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("audio/"));
      if (!files.length) return;
      for (const file of files) {
        const wasEmpty = Queue.length === 0;
        const idx = Queue.add(file);
        if (wasEmpty) {
          Queue.setCursor(idx);
          await loadAndPlay(file);
        }
      }
      refreshQueuePanel();
    });

    // Safety net: dropping files outside the canvas should never navigate away.
    // Canvas keeps ownership of the actual queue add/load behavior above.
    window.addEventListener("dragover", (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault();
    });
    window.addEventListener("drop", (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault();
    });

    function hasFocusedInteractiveTarget(event) {
      const target = event.target;
      if (!(target instanceof Element)) return false;
      if (target.closest('input, select, textarea, button, summary, [contenteditable="true"], [role="button"]')) return true;
      return false;
    }

    // Global shortcuts are intentionally suppressed while a control has focus,
    // so typing/adjusting controls never triggers transport/panel side effects.
    window.addEventListener("keydown", (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (hasFocusedInteractiveTarget(e)) return;

      if (e.code === "KeyH") {
        togglePanels();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        state.time.simPaused = !state.time.simPaused;
        return;
      }
      if (e.code === "KeyR") {
        resetVisualizers("visuals");
        return;
      }

      // Track navigation — N: next, P: prev (Repeat=All wraps at boundaries).
      if (e.code === "KeyN") {
        if (!isFileWorkflowMode(state.source)) return;
        if (isFinalizingFileTransportLocked()) {
          toastFinalizingTransportLock();
          return;
        }
        const file = pickManualNextFile();
        if (file) loadAndPlay(file);
        return;
      }
      if (e.code === "KeyP") {
        if (!isFileWorkflowMode(state.source)) return;
        if (isFinalizingFileTransportLocked()) {
          toastFinalizingTransportLock();
          return;
        }
        const file = pickManualPrevFile();
        if (file) loadAndPlay(file);
        return;
      }

      // Seek — arrow keys ±5 seconds, Shift+arrows ±30 seconds.
      // preventDefault stops page scroll.
      if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
        if (!isFileWorkflowMode(state.source)) return;
        e.preventDefault();
        const el = AudioEngine.getMediaEl();
        if (el && Number.isFinite(el.duration)) {
          const step = e.shiftKey ? 30 : 5;
          const delta = (e.code === "ArrowRight" ? step : -step);
          el.currentTime = clamp(el.currentTime + delta, 0, el.duration);
        }
      }
    }, { passive: false });

    window.addEventListener("hashchange", () => {
      const ok = UrlPreset.applyFromLocationHash();
      if (ok) {
        applyPrefs("hash preset loaded", { rebuildBandsOnDefinitionChange: true });
        initOrbs();
        resetVisualizers("visuals");
      }
    });

  } // end wireControls

  return {
    setCssVarsFromConfig,
    wireControls,
    refreshAllUiText,
    refreshRecordingUi,
    getRecordingUiModel,
    dispatchSourceSwitchAction,
    showRecordPanel,
    hideRecordPanel,
    dispatchRecordingAction,
    applyPrefs,
    resetTrackVisualState,
  };
})();

export { UI, isFileWorkflowMode, shouldShowActiveQueueItem, readSourceUiModel, readBulkOrbValue, applyBulkOrbValue };
