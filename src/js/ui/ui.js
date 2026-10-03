import { clamp, fmt, deepClone, rgb01ToCss } from "../core/utils.js";
import { RAD_TO_DEG } from "../core/constants.js";
import { CONFIG } from "../core/config.js";
import { preferences, runtime, resolveSettings, BAND_NAMES, replacePreferences } from "../core/preferences.js";
import { state } from "../core/state.js";
import { UrlPreset } from "../presets/url-preset.js";
import { BandBankController } from "../audio/band-bank-controller.js";
import { BandBank } from "../audio/band-bank.js";
import { Queue } from "../audio/queue.js";
import { AudioEngine } from "../audio/audio-engine.js";
import { Scrubber } from "../audio/scrubber.js";
import { InputSourceManager } from "../audio/input-source-manager.js";
import { ColorPolicy } from "../render/color-policy.js";
import {
  addSceneOrb,
  moveSceneNode,
  readSceneNodeDisplayName,
  readSceneSettingsSchema,
  readSceneSnapshot,
  readSelectedSceneNode,
  removeSceneOrb,
  resetSceneRuntimeFromPreferences,
  selectSceneNode,
  syncSceneNodeFromCompatPreferences,
  syncSceneRuntimeFromPreferences,
  toggleSceneNodeEnabled,
  updateSceneNodeSettings,
  updateSceneOrb,
} from "../render/scene-runtime.js";
import { isIdentityViewTransform, normalizeViewTransform } from "../render/view-transform.js";
import { RecorderEngine } from "../recording/recorder-engine.js";
import { initOrbs, resetOrbTrails, resetOrbsToDesignedPhases } from "../render/orb-runtime.js";
import { primeDomCache } from "./dom-cache.js";
import {
  appendRuntimeLogEntry,
  buildRuntimeLogUiSyncKey,
  clearRuntimeLog,
  ensureRuntimeLogState,
  markRuntimeLogRead,
} from "./runtime-log.js";
import {
  LAUNCHER_IDS,
  LAUNCHER_TARGETS,
  activateLauncher,
  ensureLauncherForTarget,
  ensurePanelShellState,
  getPanelShellStateSnapshot,
  isTargetOpen,
  readLauncherTarget,
  setPanelTargetOpen,
  toggleGlobalPanelVisibility,
  toggleLauncherCollapsed,
} from "./panel-state.js";

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
      edgeVars.bottom = "calc(var(--ui-pad) + var(--ui-safe-b) + var(--ui-launcher-clearance) + var(--ui-queue-clearance))";
    } else if (placement.anchorAboveAudioPanel) {
      edgeVars.bottom = "calc(var(--ui-pad) + var(--ui-safe-b) + var(--ui-launcher-clearance) + var(--ui-audio-h) + var(--ui-gap))";
    } else {
      edgeVars.bottom = "calc(var(--ui-pad) + var(--ui-safe-b) + var(--ui-launcher-clearance))";
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

  function hideAudioPanel() {
    return closePanelTarget("audioSource", { focusLauncher: true });
  }

  function showAudioPanel() {
    return openPanelTarget("audioSource", {
      focusPanel: document.activeElement === readLauncherButton(readPanelShell().activeLauncherId),
    });
  }

  function hideAnalysisPanel() {
    return closePanelTarget("analysis", { focusLauncher: true });
  }

  function showAnalysisPanel() {
    return openPanelTarget("analysis", {
      focusPanel: document.activeElement === readLauncherButton(readPanelShell().activeLauncherId),
    });
  }

  function hideBankingPanel() {
    return closePanelTarget("banking", { focusLauncher: true });
  }

  function showBankingPanel() {
    return openPanelTarget("banking", {
      focusPanel: document.activeElement === readLauncherButton(readPanelShell().activeLauncherId),
    });
  }

  function hideScenePanel() {
    return closePanelTarget("scene", { focusLauncher: true });
  }

  function showScenePanel() {
    return openPanelTarget("scene", {
      focusPanel: document.activeElement === readLauncherButton(readPanelShell().activeLauncherId),
    });
  }

  function hideWorkspacePanel() {
    return closePanelTarget("workspace", { focusLauncher: true });
  }

  function showWorkspacePanel() {
    return openPanelTarget("workspace", {
      focusPanel: document.activeElement === readLauncherButton(readPanelShell().activeLauncherId),
    });
  }

  function hideRecordPanel() {
    return closePanelTarget("recording", { focusLauncher: true });
  }

  function showRecordPanel() {
    return openPanelTarget("recording", {
      focusPanel: document.activeElement === readLauncherButton(readPanelShell().activeLauncherId),
    });
  }

  function primeRecordUi() {
    syncPanelShellUi();
  }

  function togglePanels() {
    toggleGlobalPanelVisibility(readPanelShell());
    syncPanelShellUi();
  }

  const PANEL_DISPLAY_MODES = Object.freeze({
    audioSource: "grid",
    queue: "block",
    analysis: "block",
    banking: "block",
    scene: "block",
    recording: "block",
    workspace: "block",
    status: "block",
  });

  function readPanelShell() {
    ui.panelShell = ensurePanelShellState(ui.panelShell);
    return ui.panelShell;
  }

  function readPanelElement(targetId) {
    switch (targetId) {
      case "audioSource": return ui.audioPanel;
      case "queue": return ui.queuePanel;
      case "analysis": return ui.analysisPanel;
      case "banking": return ui.bankingPanel;
      case "scene": return ui.scenePanel;
      case "recording": return ui.recordPanel;
      case "workspace": return ui.workspacePanel;
      case "status": return ui.statusPanel;
      default: return null;
    }
  }

  function readLauncherButton(launcherId) {
    return ui.launcherButtons && Object.prototype.hasOwnProperty.call(ui.launcherButtons, launcherId)
      ? ui.launcherButtons[launcherId]
      : null;
  }

  function applyPanelElementVisibility(targetId, visible) {
    const el = readPanelElement(targetId);
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute("aria-hidden", visible ? "false" : "true");
    el.style.display = visible ? PANEL_DISPLAY_MODES[targetId] : "none";
  }

  function focusPreferredPanelControl(targetId) {
    switch (targetId) {
      case "audioSource":
        if (ui.btnHideAudio) ui.btnHideAudio.focus();
        break;
      case "analysis":
        if (ui.btnHideAnalysis) ui.btnHideAnalysis.focus();
        break;
      case "banking":
        if (ui.btnHideBanking) ui.btnHideBanking.focus();
        break;
      case "scene":
        if (ui.btnHideScene) ui.btnHideScene.focus();
        break;
      case "recording":
        if (ui.btnHideRecord) ui.btnHideRecord.focus();
        break;
      case "workspace":
        if (ui.btnHideWorkspace) ui.btnHideWorkspace.focus();
        break;
      case "status":
        if (ui.btnHideStatus) ui.btnHideStatus.focus();
        break;
      default:
        break;
    }
  }

  function focusLauncherForTarget(targetId) {
    const shell = readPanelShell();
    ensureLauncherForTarget(shell, targetId);
    const launcherButton = readLauncherButton(shell.activeLauncherId);
    if (launcherButton) launcherButton.focus();
  }

  function syncLauncherBarUi(recordingPhase = state.recording.phase) {
    const shell = readPanelShell();
    if (ui.launcherBar) {
      ui.launcherBar.dataset.collapsed = shell.launcherCollapsed ? "true" : "false";
      ui.launcherBar.dataset.recordingPhase = recordingPhase || "";
    }

    if (ui.btnLauncherToggle) {
      const expanded = !shell.launcherCollapsed;
      const toggleCopy = expanded ? "Collapse launcher bar" : "Expand launcher bar";
      ui.btnLauncherToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (ui.btnLauncherToggle.title !== toggleCopy) ui.btnLauncherToggle.title = toggleCopy;
      if (ui.btnLauncherToggle.getAttribute("aria-label") !== toggleCopy) {
        ui.btnLauncherToggle.setAttribute("aria-label", toggleCopy);
      }
      ui.btnLauncherToggle.classList.toggle(
        "is-recording-cue",
        shell.launcherCollapsed && state.recording.phase === "recording"
      );
    }

    for (const launcherId of LAUNCHER_IDS) {
      const button = readLauncherButton(launcherId);
      if (!button) continue;
      const targetId = LAUNCHER_TARGETS[launcherId];
      const targetOpen = isTargetOpen(shell, targetId);
      const active = shell.activeLauncherId === launcherId;
      const presentedOpen = targetOpen && active;
      button.dataset.targetOpen = targetOpen ? "true" : "false";
      button.dataset.presentedOpen = presentedOpen ? "true" : "false";
      button.dataset.active = active ? "true" : "false";
      button.dataset.hasUnread = launcherId === "status" && readRuntimeLog().hasUnread ? "true" : "false";
      button.setAttribute("aria-pressed", presentedOpen ? "true" : "false");

      if (launcherId === "recording") {
        button.disabled = !state.recording.hooksEnabled;
        button.classList.toggle("is-recording", state.recording.phase === "recording");
      }
    }
  }

  function syncPanelShellUi() {
    const shell = readPanelShell();
    if (!state.recording.hooksEnabled && isTargetOpen(shell, "recording")) {
      setPanelTargetOpen(shell, "recording", false);
    }

    const statusPanelOpen = isTargetOpen(shell, "status");
    if (statusPanelOpen) markRuntimeLogRead(readRuntimeLog());

    applyPanelElementVisibility("audioSource", isTargetOpen(shell, "audioSource"));
    applyPanelElementVisibility("queue", isTargetOpen(shell, "queue"));
    applyPanelElementVisibility("analysis", isTargetOpen(shell, "analysis"));
    applyPanelElementVisibility("banking", isTargetOpen(shell, "banking"));
    applyPanelElementVisibility("scene", isTargetOpen(shell, "scene"));
    applyPanelElementVisibility("recording", isTargetOpen(shell, "recording") && !!state.recording.hooksEnabled);
    applyPanelElementVisibility("workspace", isTargetOpen(shell, "workspace"));
    applyPanelElementVisibility("status", isTargetOpen(shell, "status"));
    syncLauncherBarUi();
    refreshRuntimeLogUi();
  }

  function openPanelTarget(targetId, options = {}) {
    const shell = readPanelShell();
    if (targetId === "recording" && !state.recording.hooksEnabled) return false;
    if (options.launcherId) shell.activeLauncherId = options.launcherId;
    else ensureLauncherForTarget(shell, targetId);
    const changed = setPanelTargetOpen(shell, targetId, true);
    syncPanelShellUi();
    if (options.focusPanel) focusPreferredPanelControl(targetId);
    return changed;
  }

  function closePanelTarget(targetId, options = {}) {
    const panelEl = readPanelElement(targetId);
    const shouldFocusLauncher = !!options.focusLauncher
      && !!panelEl
      && !!document.activeElement
      && panelEl.contains(document.activeElement);
    const changed = setPanelTargetOpen(readPanelShell(), targetId, false);
    syncPanelShellUi();
    if (shouldFocusLauncher) focusLauncherForTarget(targetId);
    return changed;
  }

  function hideStatusPanel() {
    return closePanelTarget("status", { focusLauncher: true });
  }

  function showStatusPanel() {
    return openPanelTarget("status", {
      focusPanel: document.activeElement === readLauncherButton(readPanelShell().activeLauncherId),
    });
  }

  function handleLauncherActivation(launcherId) {
    if (launcherId === "recording" && !state.recording.hooksEnabled) return false;
    const action = activateLauncher(readPanelShell(), launcherId);
    syncPanelShellUi();
    if (action.ok && action.opened && action.targetId && isTargetOpen(readPanelShell(), action.targetId)) {
      focusPreferredPanelControl(action.targetId);
    }
    return action.ok;
  }

  const STATUS_DEFAULTS = Object.freeze({
    analysis: "Analysis panel: FFT, smoothing, RMS gain.",
    banking: "Banking panel: dominant band, distribution, color policy, and optional detailed inspection.",
    scene: "Scene panel: manage active visualizers and the runtime-only camera hook while keeping legacy visual controls available below.",
    workspace: "Workspace / Presets panel: share, apply URL presets, and reset preferences.",
  });
  const panelStatusToastTimers = Object.create(null);
  let _audioStatusRefreshTimer = null;
  let _audioStatusToastText = "";
  let _audioStatusToastUntilMs = 0;
  let queuePanelRefresher = () => {};

  function readPanelStatusElement(targetId) {
    switch (targetId) {
      case "analysis": return ui.analysisStatus;
      case "banking": return ui.bankingStatus;
      case "scene": return ui.sceneStatus;
      case "workspace": return ui.workspaceStatus;
      default: return null;
    }
  }

  function readRuntimeLog() {
    ui.runtimeLog = ensureRuntimeLogState(ui.runtimeLog);
    return ui.runtimeLog;
  }

  function readRuntimeLogObserver() {
    if (!ui.runtimeLogObserver || typeof ui.runtimeLogObserver !== "object") {
      ui.runtimeLogObserver = {
        sourceSnapshot: null,
        recordingSnapshot: null,
      };
    }
    return ui.runtimeLogObserver;
  }

  function padTimePart(value) {
    return String(value).padStart(2, "0");
  }

  function formatRuntimeLogTime(timestampMs) {
    const date = new Date(Number.isFinite(timestampMs) ? timestampMs : Date.now());
    return `${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}:${padTimePart(date.getSeconds())}`;
  }

  function readRuntimeLogCategoryLabel(category) {
    switch (category) {
      case "source": return "Source";
      case "recording": return "Recording";
      case "workspace": return "Workspace";
      default: return "Runtime";
    }
  }

  function refreshRuntimeLogUi(force = false) {
    const runtimeLog = readRuntimeLog();
    if (!ui.statusLogList || !ui.statusLogEmpty) return;

    const syncKey = buildRuntimeLogUiSyncKey(runtimeLog);
    if (!force && ui.runtimeLogUiSyncKey === syncKey) return;

    ui.statusLogList.innerHTML = "";
    for (const entry of runtimeLog.entries) {
      const item = document.createElement("li");
      item.className = "statusLogEntry";
      item.dataset.level = entry.level;
      item.dataset.category = entry.category;
      if (entry.code) item.dataset.code = entry.code;

      const meta = document.createElement("div");
      meta.className = "statusLogMeta";

      const category = document.createElement("span");
      category.className = "statusLogCategory";
      category.textContent = readRuntimeLogCategoryLabel(entry.category);

      const time = document.createElement("span");
      time.className = "statusLogTime";
      time.textContent = formatRuntimeLogTime(entry.timestampMs);

      meta.appendChild(category);
      meta.appendChild(time);

      const message = document.createElement("div");
      message.className = "statusLogMessage";
      message.textContent = entry.message;

      item.appendChild(meta);
      item.appendChild(message);
      ui.statusLogList.appendChild(item);
    }

    const hasEntries = runtimeLog.entries.length > 0;
    ui.statusLogEmpty.hidden = hasEntries;
    ui.statusLogEmpty.setAttribute("aria-hidden", hasEntries ? "true" : "false");
    ui.statusLogList.hidden = !hasEntries;
    ui.statusLogList.setAttribute("aria-hidden", hasEntries ? "false" : "true");
    if (ui.btnClearStatusLog) ui.btnClearStatusLog.disabled = !hasEntries;

    ui.runtimeLogUiSyncKey = syncKey;
  }

  function appendStatusLogEntry(entry) {
    const appended = appendRuntimeLogEntry(readRuntimeLog(), entry, {
      markUnread: !isTargetOpen(readPanelShell(), "status"),
    });
    if (!appended) return null;
    refreshRuntimeLogUi();
    syncLauncherBarUi();
    return appended;
  }

  function clearStatusLogEntries() {
    clearRuntimeLog(readRuntimeLog());
    ui.runtimeLogUiSyncKey = "";
    refreshRuntimeLogUi(true);
    syncLauncherBarUi();
  }

  function snapshotSourceRuntimeState(sourceState = state.source) {
    const kind = readSourceKind(sourceState);
    return {
      kind,
      status: readSourceStatus(sourceState),
      label: readSourceLabel(kind, sourceState),
      errorCode: sourceState && typeof sourceState.errorCode === "string" ? sourceState.errorCode : "",
      errorMessage: sourceState && typeof sourceState.errorMessage === "string"
        ? sourceState.errorMessage.trim()
        : "",
      sessionActive: !!(sourceState && sourceState.sessionActive),
    };
  }

  function readSourceRuntimeLogLevel(errorCode = "") {
    switch (errorCode) {
      case "mic-denied":
      case "mic-interrupted":
      case "mic-unavailable":
      case "mic-busy":
      case "mic-unsupported":
      case "stream-denied-or-cancelled":
      case "stream-blocked":
      case "stream-interrupted":
      case "stream-unavailable":
      case "stream-busy":
      case "stream-unsupported":
      case "mic-ended":
      case "stream-ended":
        return "warn";
      default:
        return "error";
    }
  }

  function observeSourceRuntimeEvents() {
    const observer = readRuntimeLogObserver();
    const nextSnapshot = snapshotSourceRuntimeState();
    const previousSnapshot = observer.sourceSnapshot;
    observer.sourceSnapshot = nextSnapshot;

    if (!previousSnapshot) return;

    if (
      nextSnapshot.kind === "mic"
      && nextSnapshot.status === "active"
      && nextSnapshot.sessionActive
      && (
        previousSnapshot.kind !== nextSnapshot.kind
        || previousSnapshot.status !== nextSnapshot.status
        || previousSnapshot.label !== nextSnapshot.label
        || previousSnapshot.sessionActive !== nextSnapshot.sessionActive
      )
    ) {
      appendStatusLogEntry({
        level: "info",
        category: "source",
        code: "mic-live",
        message: `Switched to microphone input. Permission granted for ${nextSnapshot.label || "Microphone"}.`,
      });
      return;
    }

    if (
      nextSnapshot.kind === "stream"
      && nextSnapshot.status === "active"
      && nextSnapshot.sessionActive
      && (
        previousSnapshot.kind !== nextSnapshot.kind
        || previousSnapshot.status !== nextSnapshot.status
        || previousSnapshot.label !== nextSnapshot.label
        || previousSnapshot.sessionActive !== nextSnapshot.sessionActive
      )
    ) {
      appendStatusLogEntry({
        level: "info",
        category: "source",
        code: "stream-live",
        message: `Switched to shared stream input: ${nextSnapshot.label || "Shared stream"}.`,
      });
      return;
    }

    const leftLiveWorkflow = nextSnapshot.kind === "none"
      && nextSnapshot.status === "idle"
      && !nextSnapshot.errorCode
      && (previousSnapshot.kind === "mic" || previousSnapshot.kind === "stream")
      && (
        previousSnapshot.sessionActive
        || previousSnapshot.status === "active"
        || previousSnapshot.status === "requesting"
        || previousSnapshot.status === "error"
      );
    if (leftLiveWorkflow) {
      appendStatusLogEntry({
        level: "info",
        category: "source",
        code: "file-workflow",
        message: "Switched to file workflow.",
      });
      return;
    }

    const failureChanged = !!nextSnapshot.errorCode && (
      nextSnapshot.errorCode !== previousSnapshot.errorCode
      || nextSnapshot.errorMessage !== previousSnapshot.errorMessage
      || nextSnapshot.kind !== previousSnapshot.kind
      || nextSnapshot.status !== previousSnapshot.status
    );
    if (!failureChanged) return;

    if (
      nextSnapshot.status === "error"
      || nextSnapshot.status === "unsupported"
      || (nextSnapshot.kind === "none" && nextSnapshot.status === "idle")
    ) {
      appendStatusLogEntry({
        level: readSourceRuntimeLogLevel(nextSnapshot.errorCode),
        category: "source",
        code: nextSnapshot.errorCode,
        message: nextSnapshot.errorMessage || "Source workflow changed.",
      });
    }
  }

  function snapshotRecordingRuntimeState(recording = state.recording) {
    return {
      phase: recording && typeof recording.phase === "string" ? recording.phase : "",
      lastCode: recording && typeof recording.lastCode === "string" ? recording.lastCode : "",
      lastMessage: recording && typeof recording.lastMessage === "string"
        ? recording.lastMessage.trim()
        : "",
      lastExportFileName: recording && typeof recording.lastExportFileName === "string"
        ? recording.lastExportFileName
        : "",
    };
  }

  function observeRecordingRuntimeEvents() {
    const observer = readRuntimeLogObserver();
    const nextSnapshot = snapshotRecordingRuntimeState();
    const previousSnapshot = observer.recordingSnapshot;
    observer.recordingSnapshot = nextSnapshot;

    if (!previousSnapshot) return;
    if (
      nextSnapshot.phase === previousSnapshot.phase
      && nextSnapshot.lastCode === previousSnapshot.lastCode
      && nextSnapshot.lastMessage === previousSnapshot.lastMessage
      && nextSnapshot.lastExportFileName === previousSnapshot.lastExportFileName
    ) {
      return;
    }

    if (nextSnapshot.phase === "recording" && previousSnapshot.phase !== "recording") {
      appendStatusLogEntry({
        level: "info",
        category: "recording",
        code: nextSnapshot.lastCode || "recording-started",
        message: nextSnapshot.lastMessage || "Recording started.",
      });
      return;
    }

    if (nextSnapshot.phase === "finalizing" && previousSnapshot.phase !== "finalizing") {
      appendStatusLogEntry({
        level: "info",
        category: "recording",
        code: nextSnapshot.lastCode || "recording-finalizing",
        message: nextSnapshot.lastMessage || "Finalizing recording export...",
      });
      return;
    }

    if (
      nextSnapshot.phase === "complete"
      && (
        previousSnapshot.phase !== "complete"
        || nextSnapshot.lastExportFileName !== previousSnapshot.lastExportFileName
        || nextSnapshot.lastCode !== previousSnapshot.lastCode
      )
    ) {
      const fileNameSuffix = nextSnapshot.lastExportFileName
        ? ` (${nextSnapshot.lastExportFileName})`
        : "";
      appendStatusLogEntry({
        level: "info",
        category: "recording",
        code: nextSnapshot.lastCode || "recording-complete",
        message: `${nextSnapshot.lastMessage || "Recording export ready."}${fileNameSuffix}`,
      });
      return;
    }

    if (
      nextSnapshot.phase === "error"
      && (
        previousSnapshot.phase !== "error"
        || nextSnapshot.lastCode !== previousSnapshot.lastCode
        || nextSnapshot.lastMessage !== previousSnapshot.lastMessage
      )
    ) {
      appendStatusLogEntry({
        level: "error",
        category: "recording",
        code: nextSnapshot.lastCode || "recording-error",
        message: nextSnapshot.lastMessage || "Recording failed.",
      });
      return;
    }

    const activeWarningCodes = new Set(["audio-unloaded", "track-change-failed"]);
    if (
      (nextSnapshot.phase === "recording" || nextSnapshot.phase === "finalizing")
      && activeWarningCodes.has(nextSnapshot.lastCode)
      && (
        nextSnapshot.lastCode !== previousSnapshot.lastCode
        || nextSnapshot.lastMessage !== previousSnapshot.lastMessage
        || nextSnapshot.phase !== previousSnapshot.phase
      )
    ) {
      appendStatusLogEntry({
        level: "warn",
        category: "recording",
        code: nextSnapshot.lastCode,
        message: nextSnapshot.lastMessage || "Recording source changed.",
      });
    }
  }

  function buildPresetApplyLogEntry(result, options = {}) {
    if (!result || typeof result !== "object") return null;
    if (result.ok) {
      if (result.migratedFromSchema != null) {
        return {
          level: "info",
          category: "workspace",
          code: "preset-migrated",
          message: `Applied preset from schema v${result.migratedFromSchema} using current compatibility rules.`,
        };
      }
      return {
        level: "info",
        category: "workspace",
        code: "preset-applied",
        message: options.source === "boot"
          ? "Applied startup preset from URL hash."
          : "Applied preset from URL hash.",
      };
    }

    if (result.code === "missing-hash" && !options.includeMissingHash) return null;
    if (result.code === "unsupported-schema") {
      return {
        level: "warn",
        category: "workspace",
        code: "preset-unsupported-schema",
        message: result.schema != null
          ? `Preset in URL hash uses unsupported schema v${result.schema}.`
          : "Preset in URL hash uses an unsupported schema.",
      };
    }

    return {
      level: "warn",
      category: "workspace",
      code: result.code || "preset-invalid-hash",
      message: "No valid preset in URL hash.",
    };
  }

  function ingestPresetApplyResult(result, options = {}) {
    const entry = buildPresetApplyLogEntry(result, options);
    if (!entry) return null;
    return appendStatusLogEntry(entry);
  }

  function audioStatusToast(msg, holdMs = 2500) {
    _audioStatusToastText = msg;
    _audioStatusToastUntilMs = performance.now() + holdMs;
  }

  function panelStatusToast(targetId, msg, holdMs = 2500) {
    if (targetId === "audioSource") {
      audioStatusToast(msg, holdMs);
      if (ui.audioStatus) ui.audioStatus.textContent = msg;
      if (_audioStatusRefreshTimer) clearTimeout(_audioStatusRefreshTimer);
      _audioStatusRefreshTimer = setTimeout(() => {
        _audioStatusRefreshTimer = null;
        refreshAllUiText();
      }, holdMs);
      return;
    }

    const statusEl = readPanelStatusElement(targetId);
    const defaultText = Object.prototype.hasOwnProperty.call(STATUS_DEFAULTS, targetId)
      ? STATUS_DEFAULTS[targetId]
      : "";
    if (!statusEl || !defaultText) return;

    statusEl.textContent = msg;
    if (panelStatusToastTimers[targetId]) clearTimeout(panelStatusToastTimers[targetId]);
    panelStatusToastTimers[targetId] = setTimeout(() => {
      statusEl.textContent = defaultText;
      panelStatusToastTimers[targetId] = null;
    }, holdMs);
  }

  function clearAudioStatusToast() {
    _audioStatusToastText = "";
    _audioStatusToastUntilMs = 0;
  }

  function applyPrefs(reason, options = {}) {
    const {
      rebuildBandsOnDefinitionChange = false,
      statusTarget = "scene",
      resetSceneFromPreferences = false,
    } = options;
    const prevBandDefKey = BandBankController.readBandDefKey(runtime.settings);

    preferences.particles.sizeMinPx = Math.min(preferences.particles.sizeMinPx, preferences.particles.sizeMaxPx);
    preferences.particles.ttlSec = Math.max(preferences.particles.ttlSec, preferences.particles.sizeToMinSec);

    resolveSettings();
    if (resetSceneFromPreferences) resetSceneRuntimeFromPreferences();
    else syncSceneRuntimeFromPreferences();

    BandBankController.syncFromSettings();
    const bandDefinitionChanged = BandBankController.readBandDefKey(runtime.settings) !== prevBandDefKey;
    if (rebuildBandsOnDefinitionChange && bandDefinitionChanged) {
      BandBankController.rebuildNow();
    }

    AudioEngine.applyAnalyserSettingsLive();
    AudioEngine.applyPlaybackSettingsLive();

    if (reason) panelStatusToast(statusTarget, `Updated: ${reason}`);
    refreshScenePanel();
  }


  function resetPrefs() {
    replacePreferences(deepClone(CONFIG.defaults));
    applyPrefs("prefs reset", {
      rebuildBandsOnDefinitionChange: true,
      statusTarget: "workspace",
      resetSceneFromPreferences: true,
    });
    initOrbs();
    resetOrbsToDesignedPhases();
  }

  async function shareLink() {
    UrlPreset.writeHashFromPrefs();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      panelStatusToast("workspace", "Share link copied to clipboard.", 4000);
    } catch {
      panelStatusToast("workspace", "Share link written to URL - copy from address bar.", 4000);
    }
  }

  function applyUrlNow() {
    const result = UrlPreset.applyFromLocationHash();
    if (result.ok) {
      applyPrefs("applied URL preset", {
        rebuildBandsOnDefinitionChange: true,
        statusTarget: "workspace",
        resetSceneFromPreferences: true,
      });
      initOrbs();
      resetOrbsToDesignedPhases();
      ingestPresetApplyResult(result, { source: "manual" });
    } else {
      panelStatusToast("workspace", "No valid preset in URL hash.", 4000);
      ingestPresetApplyResult(result, {
        includeMissingHash: true,
        source: "manual",
      });
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
    // Forced rebuild â€” call this whenever band definition changes.
    // Currently band count is fixed at 256; this is the hook for 115+ when it becomes configurable.
    ui.bandRowsBuilt = false;
    if (isBandInspectorOpen()) ensureBandHudBuilt();
  }

  function setTextIfChanged(el, text) {
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
  }

  function isBandInspectorOpen() {
    return !!ui.bandInspectorOpen;
  }

  function setBandInspectorOpen(nextOpen) {
    ui.bandInspectorOpen = !!nextOpen;

    if (ui.bankingPanel) ui.bankingPanel.dataset.inspectorOpen = ui.bandInspectorOpen ? "true" : "false";

    if (ui.btnToggleBandInspector) {
      ui.btnToggleBandInspector.setAttribute("aria-expanded", ui.bandInspectorOpen ? "true" : "false");
      setTextIfChanged(
        ui.btnToggleBandInspector,
        ui.bandInspectorOpen ? "Hide live band inspector" : "Show live band inspector"
      );
    }

    if (ui.bandInspectorPanel) {
      ui.bandInspectorPanel.hidden = !ui.bandInspectorOpen;
      ui.bandInspectorPanel.setAttribute("aria-hidden", ui.bandInspectorOpen ? "false" : "true");
    }
  }

  function refreshDominantBandSummary() {
    const n = runtime.settings.bands.count;
    const hasBandGeometry = n > 0 && state.bands.lowHz.length === n && state.bands.highHz.length === n;

    if (!hasBandGeometry) {
      setTextIfChanged(ui.bandDebug, "No dominant band yet");
      setTextIfChanged(ui.bandDominantRange, "Awaiting analysis");
      setTextIfChanged(ui.bandDominantEnergy, "0% energy");
      return;
    }

    const domIdx = clamp(state.bands.dominantIndex, 0, n - 1);
    const domEnergy = clamp(state.bands.energies01[domIdx] || 0, 0, 1);
    const domPct = Math.round(domEnergy * 100);
    const hasNamedDominant = typeof state.bands.dominantName === "string"
      && state.bands.dominantName.trim()
      && state.bands.dominantName !== "(none)";
    const domName = hasNamedDominant
      ? state.bands.dominantName
      : (BAND_NAMES[domIdx] || `Band ${domIdx}`);

    if (domEnergy <= 0) {
      setTextIfChanged(ui.bandDebug, "No dominant band yet");
      setTextIfChanged(ui.bandDominantRange, "Awaiting analysis");
      setTextIfChanged(ui.bandDominantEnergy, "0% energy");
      return;
    }

    setTextIfChanged(ui.bandDebug, `Dominant band [${domIdx}] ${domName}`);
    setTextIfChanged(ui.bandDominantRange, BandBank.formatBandRangeText(domIdx));
    setTextIfChanged(ui.bandDominantEnergy, domPct === 0 ? "<1% energy" : `${domPct}% energy`);
  }

  function refreshBandHud() {
    refreshDominantBandSummary();
    if (!isBandInspectorOpen()) return;

    ensureBandHudBuilt();

    const s = runtime.settings;
    const n = s.bands.count;

    for (let i = 0; i < n; i++) {
      const e = clamp(state.bands.energies01[i] || 0, 0, 1);
      const pct = Math.round(e * 100);

      const c = ColorPolicy.bandRgb01(i);
      const alpha = 0.80;

      ui.bandRowEls[i].fill.style.width = pct + "%";
      ui.bandRowEls[i].fill.style.background = rgb01ToCss(c, alpha);

      const isDom = i === state.bands.dominantIndex;
      ui.bandRowEls[i].name.style.opacity = isDom ? "1.0" : "0.75";
      ui.bandRowEls[i].idx.style.opacity = isDom ? "1.0" : "0.65";
      ui.bandRowEls[i].range.style.opacity = isDom ? "0.96" : "0.72";
      ui.bandRowEls[i].range.textContent = BandBank.formatBandRangeText(i);
    }
  }

  function readSceneUiModel() {
    const snapshot = readSceneSnapshot();
    const viewTransform = normalizeViewTransform(snapshot.viewTransform);
    const identityViewTransform = isIdentityViewTransform(viewTransform);
    const nodes = snapshot.nodes.map((node, index) => ({
      ...node,
      displayName: readSceneNodeDisplayName(node.type),
      order: index + 1,
      selected: snapshot.selectedNodeId === node.id,
    }));
    const selectedSceneNode = readSelectedSceneNode();
    const selectedNode = selectedSceneNode
      ? {
        ...selectedSceneNode,
        displayName: readSceneNodeDisplayName(selectedSceneNode.type),
        order: Math.max(1, nodes.findIndex((node) => node.id === selectedSceneNode.id) + 1),
        selected: true,
      }
      : null;

    return {
      nodeCount: nodes.length,
      activeCount: nodes.filter((node) => node.enabled).length,
      nodes,
      selectedNode,
      viewTransform,
      camera: {
        mode: identityViewTransform ? "identity" : (viewTransform.mode || "placeholder"),
        modeText: identityViewTransform ? "Identity" : "Placeholder",
        scope: viewTransform.runtimeOnly ? "runtime-only" : "persisted",
        scopeText: viewTransform.runtimeOnly ? "Runtime only" : "Persisted",
        primaryText: identityViewTransform
          ? "Identity ViewTransform active"
          : "Placeholder ViewTransform active",
        noteText: "Camera controls are deferred to Build 116. Build 115 keeps ViewTransform as a runtime-only seam through the compositor.",
        controlsDeferred: true,
      },
    };
  }

  function buildSceneUiSyncKey() {
    return JSON.stringify(readSceneSnapshot());
  }

  function sceneControlId(...parts) {
    return parts
      .map((part) => String(part).replace(/[^a-zA-Z0-9_-]+/g, "-"))
      .join("-");
  }

  function formatSceneFieldValue(value, fieldSchema = null) {
    if (fieldSchema && fieldSchema.type === "boolean") return value ? "on" : "off";
    if (typeof value === "boolean") return value ? "on" : "off";
    if (Number.isFinite(value)) return Number.isInteger(value) ? `${value}` : fmt(value, 3);
    if (value == null || value === "") return "n/a";
    return String(value);
  }

  function formatSceneBandIdsText(bandIds) {
    return Array.isArray(bandIds) && bandIds.length ? bandIds.join(", ") : "";
  }

  function readSceneBandIdsSummaryText(bandIds) {
    const text = formatSceneBandIdsText(bandIds);
    return text || "No explicit band IDs";
  }

  function parseSceneBandIdsInput(value) {
    if (typeof value !== "string" || !value.trim()) return [];
    return value
      .split(",")
      .map((token) => Number(token.trim()))
      .filter((token) => Number.isInteger(token));
  }

  function createSceneInspectorRow({ labelText, controlId, control, valueText }) {
    const row = document.createElement("div");
    row.className = "row";

    const label = document.createElement("label");
    label.textContent = labelText;
    if (controlId) label.setAttribute("for", controlId);

    const value = document.createElement("div");
    value.className = "val";
    value.textContent = valueText;

    row.appendChild(label);
    row.appendChild(control);
    row.appendChild(value);

    return { row, value };
  }

  function commitSceneOverlaySetting(nodeId, fieldName, nextValue, reason) {
    updateSceneNodeSettings(nodeId, (currentSettings) => ({
      ...(currentSettings && typeof currentSettings === "object" ? currentSettings : {}),
      [fieldName]: nextValue,
    }), { persist: true });
    applyPrefs(reason, { statusTarget: "scene" });
    refreshScenePanel(true);
  }

  function commitSceneOrbPatch(nodeId, orbIndex, patch, reason) {
    updateSceneOrb(nodeId, orbIndex, patch);
    applyPrefs(reason, { statusTarget: "scene" });
    refreshScenePanel(true);
  }

  function commitSceneOrbAdd(nodeId) {
    addSceneOrb(nodeId);
    applyPrefs("scene orb added", { statusTarget: "scene" });
    refreshScenePanel(true);
  }

  function commitSceneOrbRemove(nodeId, orbIndex) {
    removeSceneOrb(nodeId, orbIndex);
    applyPrefs("scene orb removed", { statusTarget: "scene" });
    refreshScenePanel(true);
  }

  function appendSceneSchemaField(container, nodeId, fieldName, fieldSchema, fieldValue) {
    if (!container || !fieldSchema || fieldName === "enabled") return;

    const controlId = sceneControlId("scene", nodeId, fieldName);
    const labelText = fieldName
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (letter) => letter.toUpperCase());

    if (fieldSchema.type === "boolean") {
      const input = document.createElement("input");
      input.id = controlId;
      input.type = "checkbox";
      input.checked = !!fieldValue;
      const { row, value } = createSceneInspectorRow({
        labelText,
        controlId,
        control: input,
        valueText: formatSceneFieldValue(input.checked, fieldSchema),
      });
      input.addEventListener("change", () => {
        value.textContent = formatSceneFieldValue(input.checked, fieldSchema);
        commitSceneOverlaySetting(nodeId, fieldName, input.checked, `scene ${labelText.toLowerCase()}`);
      });
      container.appendChild(row);
      return;
    }

    if ((fieldSchema.type === "string" || fieldSchema.type === "number") && Array.isArray(fieldSchema.enum)) {
      const select = document.createElement("select");
      select.id = controlId;
      for (const optionValue of fieldSchema.enum) {
        const option = document.createElement("option");
        option.value = String(optionValue);
        option.textContent = String(optionValue);
        select.appendChild(option);
      }
      select.value = String(fieldValue);
      const { row, value } = createSceneInspectorRow({
        labelText,
        controlId,
        control: select,
        valueText: formatSceneFieldValue(fieldValue, fieldSchema),
      });
      select.addEventListener("change", () => {
        const nextValue = fieldSchema.type === "number" ? Number(select.value) : select.value;
        value.textContent = formatSceneFieldValue(nextValue, fieldSchema);
        commitSceneOverlaySetting(nodeId, fieldName, nextValue, `scene ${labelText.toLowerCase()}`);
      });
      container.appendChild(row);
      return;
    }

    if (fieldSchema.type === "number") {
      const input = document.createElement("input");
      input.id = controlId;
      input.type = "range";
      if (Number.isFinite(fieldSchema.min)) input.min = String(fieldSchema.min);
      if (Number.isFinite(fieldSchema.max)) input.max = String(fieldSchema.max);
      if (Number.isFinite(fieldSchema.step)) input.step = String(fieldSchema.step);
      input.value = String(fieldValue);
      const { row, value } = createSceneInspectorRow({
        labelText,
        controlId,
        control: input,
        valueText: formatSceneFieldValue(Number(input.value), fieldSchema),
      });
      input.addEventListener("input", () => {
        value.textContent = formatSceneFieldValue(Number(input.value), fieldSchema);
      });
      input.addEventListener("change", () => {
        commitSceneOverlaySetting(nodeId, fieldName, Number(input.value), `scene ${labelText.toLowerCase()}`);
      });
      container.appendChild(row);
      return;
    }

    const input = document.createElement("input");
    input.id = controlId;
    input.type = "text";
    input.value = fieldValue == null ? "" : String(fieldValue);
    const { row } = createSceneInspectorRow({
      labelText,
      controlId,
      control: input,
      valueText: formatSceneFieldValue(fieldValue, fieldSchema),
    });
    input.addEventListener("change", () => {
      commitSceneOverlaySetting(nodeId, fieldName, input.value, `scene ${labelText.toLowerCase()}`);
    });
    container.appendChild(row);
  }

  function appendSceneOrbRow(container, { controlId, labelText, valueText, input }) {
    const safeValueText = typeof valueText === "string"
      ? valueText.replace(/\u00C2\u00B0/g, " deg").replace(/\u00B0/g, " deg")
      : valueText;
    const { row } = createSceneInspectorRow({
      labelText,
      controlId,
      control: input,
      valueText: safeValueText,
    });
    container.appendChild(row);
  }

  function renderBandOverlayInspector(node) {
    const fieldsContainer = ui.sceneInspectorFields;
    if (!fieldsContainer) return;

    const hint = document.createElement("div");
    hint.className = "sceneInspectorHint";
    hint.textContent = "This inspector edits the current band overlay node through the visualizer schema. Node enable stays in the list above.";
    fieldsContainer.appendChild(hint);

    const schema = readSceneSettingsSchema(node.type);
    const fieldEntries = Object.entries((schema && schema.fields) || {});
    for (const [fieldName, fieldSchema] of fieldEntries) {
      appendSceneSchemaField(fieldsContainer, node.id, fieldName, fieldSchema, node.settings[fieldName]);
    }
  }

  function renderOrbInspector(node) {
    const fieldsContainer = ui.sceneInspectorFields;
    if (!fieldsContainer) return;

    const hint = document.createElement("div");
    hint.className = "sceneInspectorHint";
    hint.textContent = "Scene panel v1 now exposes per-orb routing, hue phase, and center offsets. In Schema 9 these orb-specific fields persist under scene.nodes settings rather than the legacy root orb list.";
    fieldsContainer.appendChild(hint);

    const orbActions = document.createElement("div");
    orbActions.className = "sceneInspectorActionRow";

    const addOrbButton = document.createElement("button");
    addOrbButton.type = "button";
    addOrbButton.textContent = "Add Orb";
    addOrbButton.addEventListener("click", () => {
      commitSceneOrbAdd(node.id);
    });
    orbActions.appendChild(addOrbButton);
    fieldsContainer.appendChild(orbActions);

    const orbList = document.createElement("div");
    orbList.className = "sceneOrbList";
    fieldsContainer.appendChild(orbList);

    const itemFields = (((readSceneSettingsSchema(node.type) || {}).item || {}).fields) || {};
    const channelOptions = Array.isArray(itemFields.chanId && itemFields.chanId.enum)
      ? itemFields.chanId.enum
      : ["L", "R", "C"];
    const chiralityOptions = Array.isArray(itemFields.chirality && itemFields.chirality.enum)
      ? itemFields.chirality.enum
      : [-1, 1];

    node.settings.forEach((orb, orbIndex) => {
      const card = document.createElement("div");
      card.className = "sceneOrbCard";

      const cardHeader = document.createElement("div");
      cardHeader.className = "sceneOrbCardHeader";

      const title = document.createElement("div");
      title.className = "sceneOrbTitle";
      title.textContent = orb.id || `Orb ${orbIndex + 1}`;
      cardHeader.appendChild(title);

      const removeOrbButton = document.createElement("button");
      removeOrbButton.type = "button";
      removeOrbButton.textContent = "Remove";
      removeOrbButton.disabled = node.settings.length <= 1;
      removeOrbButton.addEventListener("click", () => {
        commitSceneOrbRemove(node.id, orbIndex);
      });
      cardHeader.appendChild(removeOrbButton);
      card.appendChild(cardHeader);

      const idInput = document.createElement("input");
      idInput.id = sceneControlId(node.id, "orb", orbIndex, "id");
      idInput.type = "text";
      idInput.value = orb.id || "";
      idInput.addEventListener("change", () => {
        commitSceneOrbPatch(node.id, orbIndex, { id: idInput.value }, "scene orb id");
      });
      appendSceneOrbRow(card, {
        controlId: idInput.id,
        labelText: "ID",
        valueText: orb.id || "n/a",
        input: idInput,
      });

      const channelSelect = document.createElement("select");
      channelSelect.id = sceneControlId(node.id, "orb", orbIndex, "chanId");
      for (const channel of channelOptions) {
        const option = document.createElement("option");
        option.value = channel;
        option.textContent = channel;
        channelSelect.appendChild(option);
      }
      channelSelect.value = orb.chanId;
      channelSelect.addEventListener("change", () => {
        commitSceneOrbPatch(node.id, orbIndex, { chanId: channelSelect.value }, "scene orb channel");
      });
      appendSceneOrbRow(card, {
        controlId: channelSelect.id,
        labelText: "Channel",
        valueText: orb.chanId,
        input: channelSelect,
      });

      const bandsInput = document.createElement("input");
      bandsInput.id = sceneControlId(node.id, "orb", orbIndex, "bandIds");
      bandsInput.type = "text";
      bandsInput.value = formatSceneBandIdsText(orb.bandIds);
      bandsInput.addEventListener("change", () => {
        commitSceneOrbPatch(node.id, orbIndex, { bandIds: parseSceneBandIdsInput(bandsInput.value) }, "scene orb bands");
      });
      appendSceneOrbRow(card, {
        controlId: bandsInput.id,
        labelText: "Band IDs",
        valueText: readSceneBandIdsSummaryText(orb.bandIds),
        input: bandsInput,
      });

      const chiralitySelect = document.createElement("select");
      chiralitySelect.id = sceneControlId(node.id, "orb", orbIndex, "chirality");
      for (const chirality of chiralityOptions) {
        const option = document.createElement("option");
        option.value = String(chirality);
        option.textContent = Number(chirality) < 0 ? "-1 (CCW)" : "1 (CW)";
        chiralitySelect.appendChild(option);
      }
      chiralitySelect.value = String(orb.chirality);
      chiralitySelect.addEventListener("change", () => {
        commitSceneOrbPatch(node.id, orbIndex, { chirality: Number(chiralitySelect.value) }, "scene orb chirality");
      });
      appendSceneOrbRow(card, {
        controlId: chiralitySelect.id,
        labelText: "Chirality",
        valueText: Number(orb.chirality) < 0 ? "-1 (CCW)" : "1 (CW)",
        input: chiralitySelect,
      });

      const angleInput = document.createElement("input");
      angleInput.id = sceneControlId(node.id, "orb", orbIndex, "startAngleRad");
      angleInput.type = "number";
      angleInput.step = String(itemFields.startAngleRad && itemFields.startAngleRad.step ? itemFields.startAngleRad.step : 0.001);
      angleInput.value = String(orb.startAngleRad);
      angleInput.addEventListener("change", () => {
        commitSceneOrbPatch(node.id, orbIndex, { startAngleRad: Number(angleInput.value) }, "scene orb start angle");
      });
      appendSceneOrbRow(card, {
        controlId: angleInput.id,
        labelText: "Start Angle",
        valueText: `${formatSceneFieldValue(orb.startAngleRad)} rad`,
        input: angleInput,
      });

      const hueInput = document.createElement("input");
      hueInput.id = sceneControlId(node.id, "orb", orbIndex, "hueOffsetDeg");
      hueInput.type = "number";
      if (Number.isFinite(itemFields.hueOffsetDeg && itemFields.hueOffsetDeg.min)) {
        hueInput.min = String(itemFields.hueOffsetDeg.min);
      }
      if (Number.isFinite(itemFields.hueOffsetDeg && itemFields.hueOffsetDeg.max)) {
        hueInput.max = String(itemFields.hueOffsetDeg.max);
      }
      hueInput.step = String(itemFields.hueOffsetDeg && itemFields.hueOffsetDeg.step ? itemFields.hueOffsetDeg.step : 1);
      hueInput.value = String(orb.hueOffsetDeg);
      hueInput.addEventListener("change", () => {
        commitSceneOrbPatch(node.id, orbIndex, { hueOffsetDeg: Number(hueInput.value) }, "scene orb hue offset");
      });
      appendSceneOrbRow(card, {
        controlId: hueInput.id,
        labelText: "Hue Offset",
        valueText: `${formatSceneFieldValue(orb.hueOffsetDeg)}°`,
        input: hueInput,
      });

      const centerXInput = document.createElement("input");
      centerXInput.id = sceneControlId(node.id, "orb", orbIndex, "centerX");
      centerXInput.type = "number";
      if (Number.isFinite(itemFields.centerX && itemFields.centerX.min)) centerXInput.min = String(itemFields.centerX.min);
      if (Number.isFinite(itemFields.centerX && itemFields.centerX.max)) centerXInput.max = String(itemFields.centerX.max);
      centerXInput.step = String(itemFields.centerX && itemFields.centerX.step ? itemFields.centerX.step : 0.01);
      centerXInput.value = String(orb.centerX);
      centerXInput.addEventListener("change", () => {
        commitSceneOrbPatch(node.id, orbIndex, { centerX: Number(centerXInput.value) }, "scene orb center x");
      });
      appendSceneOrbRow(card, {
        controlId: centerXInput.id,
        labelText: "Center X",
        valueText: formatSceneFieldValue(orb.centerX),
        input: centerXInput,
      });

      const centerYInput = document.createElement("input");
      centerYInput.id = sceneControlId(node.id, "orb", orbIndex, "centerY");
      centerYInput.type = "number";
      if (Number.isFinite(itemFields.centerY && itemFields.centerY.min)) centerYInput.min = String(itemFields.centerY.min);
      if (Number.isFinite(itemFields.centerY && itemFields.centerY.max)) centerYInput.max = String(itemFields.centerY.max);
      centerYInput.step = String(itemFields.centerY && itemFields.centerY.step ? itemFields.centerY.step : 0.01);
      centerYInput.value = String(orb.centerY);
      centerYInput.addEventListener("change", () => {
        commitSceneOrbPatch(node.id, orbIndex, { centerY: Number(centerYInput.value) }, "scene orb center y");
      });
      appendSceneOrbRow(card, {
        controlId: centerYInput.id,
        labelText: "Center Y",
        valueText: formatSceneFieldValue(orb.centerY),
        input: centerYInput,
      });

      orbList.appendChild(card);
    });
  }

  function renderSelectedSceneInspector(model) {
    const selectedNode = model.selectedNode;

    if (!selectedNode) {
      if (ui.sceneInspectorEmpty) {
        ui.sceneInspectorEmpty.hidden = false;
        ui.sceneInspectorEmpty.setAttribute("aria-hidden", "false");
      }
      if (ui.sceneInspectorPanel) {
        ui.sceneInspectorPanel.hidden = true;
        ui.sceneInspectorPanel.setAttribute("aria-hidden", "true");
      }
      return;
    }

    if (ui.sceneInspectorEmpty) {
      ui.sceneInspectorEmpty.hidden = true;
      ui.sceneInspectorEmpty.setAttribute("aria-hidden", "true");
    }
    if (ui.sceneInspectorPanel) {
      ui.sceneInspectorPanel.hidden = false;
      ui.sceneInspectorPanel.setAttribute("aria-hidden", "false");
    }

    setTextIfChanged(ui.sceneInspectorTitle, selectedNode.displayName);
    setTextIfChanged(ui.sceneInspectorType, selectedNode.type);
    setTextIfChanged(ui.sceneInspectorNodeId, selectedNode.id);
    setTextIfChanged(ui.sceneInspectorOrder, `${selectedNode.order} of ${model.nodeCount} (z ${selectedNode.zIndex})`);
    setTextIfChanged(ui.sceneInspectorEnabled, selectedNode.enabled ? "Enabled" : "Disabled");

    if (!ui.sceneInspectorFields) return;
    ui.sceneInspectorFields.innerHTML = "";

    if (selectedNode.type === "bandOverlay") {
      renderBandOverlayInspector(selectedNode);
      return;
    }

    if (selectedNode.type === "orbs") renderOrbInspector(selectedNode);
  }

  function refreshScenePanel(force = false) {
    if (!ui.sceneNodeList) return;

    const syncKey = buildSceneUiSyncKey();
    if (!force && ui.sceneUiSyncKey === syncKey) return;

    const model = readSceneUiModel();
    const selectedLabel = model.selectedNode ? model.selectedNode.displayName : "None";

    setTextIfChanged(
      ui.sceneSummaryPrimary,
      model.nodeCount === 1
        ? "1 visualizer in the runtime scene"
        : `${model.nodeCount} visualizers in the runtime scene`
    );
    setTextIfChanged(
      ui.sceneSummaryActive,
      model.activeCount === 1 ? "1 active" : `${model.activeCount} active`
    );
    setTextIfChanged(ui.sceneSummarySelected, selectedLabel);
    setTextIfChanged(ui.sceneCameraPrimary, model.camera.primaryText);
    setTextIfChanged(ui.sceneCameraMode, model.camera.modeText);
    setTextIfChanged(ui.sceneCameraScope, model.camera.scopeText);
    setTextIfChanged(ui.sceneCameraNote, model.camera.noteText);

    if (ui.sceneNodeEmpty) {
      const hasNodes = model.nodeCount > 0;
      ui.sceneNodeEmpty.hidden = hasNodes;
      ui.sceneNodeEmpty.setAttribute("aria-hidden", hasNodes ? "true" : "false");
    }

    ui.sceneNodeList.innerHTML = "";
    for (const node of model.nodes) {
      const row = document.createElement("div");
      row.className = "sceneNodeRow";
      row.dataset.selected = node.selected ? "true" : "false";
      row.dataset.nodeId = node.id;

      const top = document.createElement("div");
      top.className = "sceneNodeRowTop";

      const text = document.createElement("div");
      text.className = "sceneNodeText";

      const title = document.createElement("div");
      title.className = "sceneNodeTitle";
      title.textContent = node.displayName;
      text.appendChild(title);

      const meta = document.createElement("div");
      meta.className = "sceneNodeMeta";
      meta.textContent = `${node.type} · ${node.id} · order ${node.order}/${model.nodeCount} · z ${node.zIndex}`;
      text.appendChild(meta);
      top.appendChild(text);

      const badge = document.createElement("div");
      badge.className = "sceneNodeBadge";
      badge.textContent = node.enabled ? "Enabled" : "Disabled";
      top.appendChild(badge);
      row.appendChild(top);

      const actions = document.createElement("div");
      actions.className = "sceneNodeActions";

      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.textContent = node.selected ? "Selected" : "Inspect";
      selectButton.disabled = node.selected;
      selectButton.addEventListener("click", () => {
        selectSceneNode(node.id);
        refreshScenePanel(true);
      });
      actions.appendChild(selectButton);

      const enabledLabel = document.createElement("label");
      enabledLabel.className = "sceneNodeToggleLabel";

      const enabledInput = document.createElement("input");
      enabledInput.type = "checkbox";
      enabledInput.checked = !!node.enabled;
      enabledInput.addEventListener("change", () => {
        toggleSceneNodeEnabled(node.id, enabledInput.checked);
        panelStatusToast("scene", enabledInput.checked ? `${node.displayName} enabled.` : `${node.displayName} disabled.`);
        refreshScenePanel(true);
      });
      enabledLabel.appendChild(enabledInput);

      const enabledText = document.createElement("span");
      enabledText.textContent = "Enabled";
      enabledLabel.appendChild(enabledText);
      actions.appendChild(enabledLabel);

      const moveBackwardButton = document.createElement("button");
      moveBackwardButton.type = "button";
      moveBackwardButton.textContent = "Move Backward";
      moveBackwardButton.disabled = node.order === 1;
      moveBackwardButton.addEventListener("click", () => {
        moveSceneNode(node.id, -1);
        panelStatusToast("scene", `${node.displayName} moved backward.`);
        refreshScenePanel(true);
      });
      actions.appendChild(moveBackwardButton);

      const moveForwardButton = document.createElement("button");
      moveForwardButton.type = "button";
      moveForwardButton.textContent = "Move Forward";
      moveForwardButton.disabled = node.order === model.nodeCount;
      moveForwardButton.addEventListener("click", () => {
        moveSceneNode(node.id, 1);
        panelStatusToast("scene", `${node.displayName} moved forward.`);
        refreshScenePanel(true);
      });
      actions.appendChild(moveForwardButton);

      row.appendChild(actions);
      ui.sceneNodeList.appendChild(row);
    }

    renderSelectedSceneInspector(model);
    ui.sceneUiSyncKey = syncKey;
  }

  function formatBandMetaHz(hz) {
    if (!Number.isFinite(hz)) return "n/a";
    if (hz >= 1000) return `${fmt(hz / 1000, 2)} kHz`;
    return `${fmt(hz, 1)} Hz`;
  }

  function refreshBandMetaText() {
    const m = state.bands.meta;
    const bandSettings = runtime.settings.bands;
    const nyquistKnown = Number.isFinite(m.nyquistHz);
    const effectiveClamped = Number.isFinite(m.effectiveCeilingHz)
      && m.effectiveCeilingHz < bandSettings.ceilingHz;
    let contextText = "Band count, floor, and ceiling stay read-only in this phase.";
    if (!nyquistKnown) {
      contextText += " Effective ceiling resolves once the audio context is available.";
    } else if (effectiveClamped) {
      contextText += " Effective ceiling is currently clamped to Nyquist.";
    }

    setTextIfChanged(ui.bandMetaCount, `${bandSettings.count}`);
    setTextIfChanged(ui.bandMetaDistribution, bandSettings.distributionMode);
    setTextIfChanged(ui.bandMetaFloor, formatBandMetaHz(bandSettings.floorHz));
    setTextIfChanged(ui.bandMetaCeiling, formatBandMetaHz(bandSettings.ceilingHz));
    setTextIfChanged(
      ui.bandMetaEffectiveCeiling,
      formatBandMetaHz(Number.isFinite(m.effectiveCeilingHz) ? m.effectiveCeilingHz : bandSettings.ceilingHz)
    );
    setTextIfChanged(ui.bandMetaNyquist, nyquistKnown ? formatBandMetaHz(m.nyquistHz) : "pending audio context");
    setTextIfChanged(ui.bandMetaContext, contextText);
  }

  function collectOperatorFacingControls() {
    // 112 
    // This intentionally excludes buttons and transport-only affordances.
    const selectors = [
      "#audioPanel input",
      "#audioPanel select",
      "#analysisPanel input",
      "#analysisPanel select",
      "#bankingPanel input",
      "#bankingPanel select",
      "#scenePanel input",
      "#scenePanel select",
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

  function readRecordingLauncherLabel(recording) {
    if (!recording || !recording.hooksEnabled) return "Show recording panel";
    switch (recording.phase) {
      case "recording":
        return "Show recording panel (recording active)";
      case "finalizing":
        return "Show recording panel (finalizing export)";
      case "unsupported":
        return "Show recording panel (recording unavailable)";
      default:
        return "Show recording panel";
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
      panelVisible: isTargetOpen(readPanelShell(), "recording"),
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
      launcherLabel: readRecordingLauncherLabel(recording),
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
    const queueVisible = isTargetOpen(readPanelShell(), "queue");
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
      isTargetOpen(readPanelShell(), "recording") ? "1" : "0",
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
    if (!isTargetOpen(readPanelShell(), "queue")) {
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
    if (ui.btnLauncherRecording) {
      if (ui.btnLauncherRecording.title !== model.launcherLabel) ui.btnLauncherRecording.title = model.launcherLabel;
      if (ui.btnLauncherRecording.getAttribute("aria-label") !== model.launcherLabel) {
        ui.btnLauncherRecording.setAttribute("aria-label", model.launcherLabel);
      }
    }

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
    observeRecordingRuntimeEvents();
    syncVisibleQueuePanel();
    syncLauncherBarUi(recording.phase);
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

  function refreshAllUiText(bandSnapshot) {
    const p = preferences;
    maybeRefreshRecordingUi();

    const bandText = bandSnapshot && bandSnapshot.ready
      ? (bandSnapshot.monoLike ? "mono-ish (L\u2248R)" : "stereo (L\u2260R)")
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
    refreshScenePanel();
    ui.chkMute.checked = !!p.audio.muted;
    ui.rngVol.value = String(p.audio.volume);
    ui.valVol.textContent = fmt(p.audio.volume, 2);

    ui.chkLines.checked = !!p.trace.lines;
    ui.valLines.textContent = p.trace.lines ? "on" : "off";
    ui.rngNumLines.value = String(p.trace.numLines);
    ui.valNumLines.textContent = `${p.trace.numLines}`;

    ui.selLineColorMode.value = p.trace.lineColorMode;
    ui.valLineColorMode.textContent = p.trace.lineColorMode;

    ui.rngEmit.value = String(p.particles.emitPerSecond);
    ui.valEmit.textContent = `${p.particles.emitPerSecond}/s`;

    ui.rngSizeMax.value = String(p.particles.sizeMaxPx);
    ui.valSizeMax.textContent = `${p.particles.sizeMaxPx}px`;

    ui.rngSizeMin.value = String(p.particles.sizeMinPx);
    ui.valSizeMin.textContent = `${p.particles.sizeMinPx}px`;

    ui.rngSizeToMin.value = String(p.particles.sizeToMinSec);
    ui.valSizeToMin.textContent = `${fmt(p.particles.sizeToMinSec, 1)}s`;

    ui.rngTTL.value = String(p.particles.ttlSec);
    const fadeSec = Math.max(0, p.particles.ttlSec - p.particles.sizeToMinSec);
    ui.valTTL.textContent = `${fmt(p.particles.ttlSec, 1)}s (fade ${fmt(fadeSec, 1)}s)`;

    ui.rngOverlap.value = String(p.particles.overlapRadiusPx);
    ui.valOverlap.textContent = `${fmt(p.particles.overlapRadiusPx, 1)}px`;

    ui.rngOmega.value = String(p.motion.angularSpeedRadPerSec);
    ui.valOmega.textContent = `${fmt(p.motion.angularSpeedRadPerSec, 3)} rad/s (${fmt(p.motion.angularSpeedRadPerSec * RAD_TO_DEG, 1)}Â°/s)`;

    ui.rngWfDisp.value = String(p.motion.waveformRadialDisplaceFrac);
    ui.valWfDisp.textContent = fmt(p.motion.waveformRadialDisplaceFrac, 3);

    ui.rngRmsGain.value = String(p.audio.rmsGain);
    ui.valRmsGain.textContent = fmt(p.audio.rmsGain, 2);

    ui.rngMinRad.value = String(p.audio.minRadiusFrac);
    ui.valMinRad.textContent = fmt(p.audio.minRadiusFrac, 3);

    ui.rngMaxRad.value = String(p.audio.maxRadiusFrac);
    ui.valMaxRad.textContent = fmt(p.audio.maxRadiusFrac, 3);

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
    ui.valHueOff.textContent = `${p.bands.rainbow.hueOffsetDeg}Â°`;

    ui.rngSat.value = String(p.bands.rainbow.saturation);
    ui.valSat.textContent = fmt(p.bands.rainbow.saturation, 2);

    ui.rngVal.value = String(p.bands.rainbow.value);
    ui.valVal.textContent = fmt(p.bands.rainbow.value, 2);

    refreshConfigTooltips();
    observeSourceRuntimeEvents();
    syncPanelShellUi();
    refreshRecordingUi();

    refreshBandMetaText();

    if (bandSnapshot && bandSnapshot.ready) {
      const nowMs = performance.now();
      const hudIntervalMs = ui.bandHudIntervalMs || 100;
      const bankingPanelVisible = isTargetOpen(readPanelShell(), "banking");
      const canRefreshHud = bankingPanelVisible && (nowMs - ui.lastBandHudUpdateMs >= hudIntervalMs);
      if (canRefreshHud) {
        refreshBandHud();
        ui.lastBandHudUpdateMs = nowMs;
      }
    }
  }

  function resetTrackVisualState() {
    Scrubber.reset();
    resetOrbTrails();
    state.bands.energies01.fill(0);
    state.bands.dominantIndex = 0;
    state.bands.dominantName = "(none)";
    refreshBandHud();
  }

  function wireControls() {
    primeDomCache();
    ui.sceneUiSyncKey = "";
    syncSceneRuntimeFromPreferences();
    setBandInspectorOpen(false);

    initConfigTooltips();
    clearAudioStatusToast();
    if (_audioStatusRefreshTimer) {
      clearTimeout(_audioStatusRefreshTimer);
      _audioStatusRefreshTimer = null;
    }
    ui.runtimeLogUiSyncKey = "";
    readRuntimeLogObserver().sourceSnapshot = snapshotSourceRuntimeState();
    readRuntimeLogObserver().recordingSnapshot = snapshotRecordingRuntimeState();
    refreshRuntimeLogUi(true);
    syncLauncherBarUi();
    refreshScenePanel(true);


    /* -------------------------------------------------------------------------
       clearAudioState() â€” canonical clean-slate reset for all stop/clear paths.

       3.4 â€” Clear queue clean-slate audit. Every item the checklist requires:
         âœ“ state.audio.isLoaded = false    â€” set explicitly below
         âœ“ state.audio.filename = ""       â€” set explicitly below
         âœ“ state.audio.isPlaying = false   â€” set explicitly below
         âœ“ InputSourceManager teardown     â€” caller must invoke teardown before this function
         âœ“ All orb trails reset            â€” loop below
         âœ“ Scrubber blank                  â€” Scrubber.reset()
         âœ“ Play/Stop buttons disabled      â€” driven by state.audio.isLoaded in refreshAllUiText
         âœ“ Prev/Next buttons disabled      â€” driven by Queue.canPrev/canNext;
                                             caller must call Queue.clear() first
         âœ“ No blob URLs left alive         â€” revoked by loadeddata/error during track
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
       loadAndPlay â€” single shared helper for all track-change paths.

       3.1 â€” Entry-point audit. Every path that changes the current track routes
       through here so trail reset + scrubber reset happen in exactly one place:
         (1) _onTrackEnded repeat policy â†’ loadAndPlay/stop     [auto-advance/repeat]
         (2) fileInput change â†’ loadAndPlay                    [Load button, 1st track]
         (3) drop handler    â†’ loadAndPlay                     [drag-drop, 1st track]
         (4) btnNext click   â†’ Queue.next() â†’ loadAndPlay
         (5) btnPrev click   â†’ Queue.prev() â†’ loadAndPlay
         (6) queue row click â†’ Queue.goTo() â†’ loadAndPlay      [click-to-jump]
         (7) remove handler  â†’ loadAndPlay  (wasActive && nextFile case)
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
      setPanelTargetOpen(readPanelShell(), "queue", false);
      syncPanelShellUi();
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
      setPanelTargetOpen(readPanelShell(), "queue", false);
      syncPanelShellUi();
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
          appendStatusLogEntry({
            level: "info",
            category: "source",
            code: "file-workflow",
            message: "Switched to file workflow.",
          });
        }
        return clearedRecoverableIdleError;
      }

      invalidatePendingTrackLoads();
      clearAudioStatusToast();
      await InputSourceManager.teardownActiveSource({ reason: "switch-to-file-mode" });
      clearAudioState();
      setPanelTargetOpen(readPanelShell(), "queue", false);
      syncPanelShellUi();
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
      Scrubber.loadFile(file); // async â€” decode in background; playback may be play or paused by opts
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
       The hook survives teardown() intentionally â€” registered once at boot,
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

    /* Queue panel renderer â€” rebuilds list DOM from Queue.snapshot().
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
        removeBtn.textContent = "Ã—";
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
            // Removed the final queued track â€” return to the canonical empty File workflow.
            resetEmptyFileWorkflowState(wasActive ? "active-remove-empty-queue" : "remove-empty-queue"); // 3.4 â€” via shared helper; see clearAudioState() for audit
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
    primeRecordUi();
    refreshRecordingUi();

    if (ui.btnHideRecord) ui.btnHideRecord.addEventListener("click", () => {
      hideRecordPanel();
    });
    if (ui.btnHideStatus) ui.btnHideStatus.addEventListener("click", () => {
      hideStatusPanel();
    });
    if (ui.btnClearStatusLog) ui.btnClearStatusLog.addEventListener("click", () => {
      clearStatusLogEntries();
    });
    if (ui.btnLauncherToggle) ui.btnLauncherToggle.addEventListener("click", () => {
      toggleLauncherCollapsed(readPanelShell());
      syncPanelShellUi();
    });
    for (const launcherId of LAUNCHER_IDS) {
      const launcherButton = readLauncherButton(launcherId);
      if (!launcherButton) continue;
      launcherButton.addEventListener("click", () => {
        handleLauncherActivation(launcherId);
      });
    }
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
    // dataTransfer.files directly â€” it never touches fileInput â€” so no reset
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
      const visible = isTargetOpen(readPanelShell(), "queue");
      setPanelTargetOpen(readPanelShell(), "queue", !visible);
      syncPanelShellUi();
      if (!visible) refreshQueuePanel(); // refresh on open
    });

    ui.btnClearQueue.addEventListener("click", () => {
      if (!isFileWorkflowMode(state.source)) return;
      if (isFinalizingFileTransportLocked()) {
        toastFinalizingTransportLock();
        return;
      }
      // 3.4 â€” Clear queue clean-slate path. Order matters:
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
      applyPrefs("repeat", { statusTarget: "audioSource" });
    });
    if (ui.btnShuffle) {
      ui.btnShuffle.addEventListener("click", () => {
        if (!isFileWorkflowMode(state.source)) return;
        if (Queue.shuffle()) refreshQueuePanel();
      });
    }
    ui.chkMute.addEventListener("change", () => {
      preferences.audio.muted = !!ui.chkMute.checked;
      applyPrefs("mute", { statusTarget: "audioSource" });
    });

    ui.rngVol.addEventListener("input", () => {
      preferences.audio.volume = Number(ui.rngVol.value);
      applyPrefs("volume (playback only)", { statusTarget: "audioSource" });
    });

    ui.btnHideAudio.addEventListener("click", hideAudioPanel);

    if (ui.btnHideAnalysis) ui.btnHideAnalysis.addEventListener("click", hideAnalysisPanel);
    if (ui.btnHideBanking) ui.btnHideBanking.addEventListener("click", hideBankingPanel);
    if (ui.btnHideScene) ui.btnHideScene.addEventListener("click", hideScenePanel);
    if (ui.btnHideWorkspace) ui.btnHideWorkspace.addEventListener("click", hideWorkspacePanel);
    if (ui.btnToggleBandInspector) {
      ui.btnToggleBandInspector.addEventListener("click", () => {
        setBandInspectorOpen(!isBandInspectorOpen());
        if (isBandInspectorOpen()) {
          refreshBandHud();
          ui.lastBandHudUpdateMs = performance.now();
        }
      });
    }

    ui.btnShare.addEventListener("click", shareLink);
    ui.btnApplyUrl.addEventListener("click", applyUrlNow);
    ui.btnResetPrefs.addEventListener("click", resetPrefs);
    ui.btnResetVisuals.addEventListener("click", () => {
      resetOrbsToDesignedPhases();
      panelStatusToast("scene", "Visuals reset.");
    });

    ui.chkLines.addEventListener("change", () => {
      preferences.trace.lines = !!ui.chkLines.checked;
      applyPrefs("lines", { statusTarget: "scene" });
    });
    ui.rngNumLines.addEventListener("input", () => {
      preferences.trace.numLines = Number(ui.rngNumLines.value);
      applyPrefs("num lines", { statusTarget: "scene" });
    });

    ui.selLineColorMode.addEventListener("change", () => {
      preferences.trace.lineColorMode = ui.selLineColorMode.value;
      applyPrefs("line color mode", { statusTarget: "banking" });
    });

    ui.rngEmit.addEventListener("input", () => { preferences.particles.emitPerSecond = Number(ui.rngEmit.value); applyPrefs("emit rate", { statusTarget: "scene" }); });
    ui.rngSizeMax.addEventListener("input", () => { preferences.particles.sizeMaxPx = Number(ui.rngSizeMax.value); applyPrefs("size max", { statusTarget: "scene" }); });
    ui.rngSizeMin.addEventListener("input", () => { preferences.particles.sizeMinPx = Number(ui.rngSizeMin.value); applyPrefs("size min", { statusTarget: "scene" }); });
    ui.rngSizeToMin.addEventListener("input", () => { preferences.particles.sizeToMinSec = Number(ui.rngSizeToMin.value); applyPrefs("time to min", { statusTarget: "scene" }); });
    ui.rngTTL.addEventListener("input", () => { preferences.particles.ttlSec = Number(ui.rngTTL.value); applyPrefs("ttl", { statusTarget: "scene" }); });
    ui.rngOverlap.addEventListener("input", () => { preferences.particles.overlapRadiusPx = Number(ui.rngOverlap.value); applyPrefs("overlap radius", { statusTarget: "scene" }); });

    ui.rngOmega.addEventListener("input", () => { preferences.motion.angularSpeedRadPerSec = Number(ui.rngOmega.value); applyPrefs("angular speed", { statusTarget: "scene" }); });
    ui.rngWfDisp.addEventListener("input", () => { preferences.motion.waveformRadialDisplaceFrac = Number(ui.rngWfDisp.value); applyPrefs("orb waveform disp", { statusTarget: "scene" }); });

    ui.rngRmsGain.addEventListener("input", () => { preferences.audio.rmsGain = Number(ui.rngRmsGain.value); applyPrefs("rms gain (analysis)", { statusTarget: "analysis" }); });
    ui.rngMinRad.addEventListener("input", () => { preferences.audio.minRadiusFrac = Number(ui.rngMinRad.value); applyPrefs("min radius", { statusTarget: "scene" }); });
    ui.rngMaxRad.addEventListener("input", () => { preferences.audio.maxRadiusFrac = Number(ui.rngMaxRad.value); applyPrefs("max radius", { statusTarget: "scene" }); });
    ui.rngSmooth.addEventListener("input", () => { preferences.audio.smoothingTimeConstant = Number(ui.rngSmooth.value); applyPrefs("smoothing", { statusTarget: "analysis" }); });
    ui.selFFT.addEventListener("change", () => { preferences.audio.fftSize = Number(ui.selFFT.value); applyPrefs("fft size", { statusTarget: "analysis" }); });

    ui.clrBg.addEventListener("input", () => { preferences.visuals.backgroundColor = ui.clrBg.value; applyPrefs("background", { statusTarget: "scene" }); });
    ui.clrParticle.addEventListener("input", () => { preferences.visuals.particleColor = ui.clrParticle.value; applyPrefs("particle color", { statusTarget: "scene" }); });

    ui.selParticleColorSrc.addEventListener("change", () => {
      preferences.bands.particleColorSource = ui.selParticleColorSrc.value;
      applyPrefs("particle color source", { statusTarget: "banking" });
    });

    ui.chkBandOverlay.addEventListener("change", () => {
      const enabled = !!ui.chkBandOverlay.checked;
      preferences.bands.overlay.enabled = enabled;
      syncSceneNodeFromCompatPreferences("bandOverlay", { createIfMissing: enabled });
      applyPrefs("band overlay", { statusTarget: "banking" });
    });
    ui.chkBandConnect.addEventListener("change", () => {
      preferences.bands.overlay.connectAdjacent = !!ui.chkBandConnect.checked;
      syncSceneNodeFromCompatPreferences("bandOverlay", { createIfMissing: true });
      applyPrefs("band connect", { statusTarget: "banking" });
    });

    ui.rngBandAlpha.addEventListener("input", () => {
      preferences.bands.overlay.alpha = Number(ui.rngBandAlpha.value);
      syncSceneNodeFromCompatPreferences("bandOverlay", { createIfMissing: true });
      applyPrefs("overlay alpha", { statusTarget: "banking" });
    });
    ui.rngBandPoint.addEventListener("input", () => {
      preferences.bands.overlay.pointSizePx = Number(ui.rngBandPoint.value);
      syncSceneNodeFromCompatPreferences("bandOverlay", { createIfMissing: true });
      applyPrefs("overlay point size", { statusTarget: "banking" });
    });
    ui.rngBandOverlayMinRad.addEventListener("input", () => {
      preferences.bands.overlay.minRadiusFrac = Number(ui.rngBandOverlayMinRad.value);
      syncSceneNodeFromCompatPreferences("bandOverlay", { createIfMissing: true });
      applyPrefs("overlay min radius", { statusTarget: "banking" });
    });
    ui.rngBandOverlayMaxRad.addEventListener("input", () => {
      preferences.bands.overlay.maxRadiusFrac = Number(ui.rngBandOverlayMaxRad.value);
      syncSceneNodeFromCompatPreferences("bandOverlay", { createIfMissing: true });
      applyPrefs("overlay max radius", { statusTarget: "banking" });
    });
    ui.rngBandOverlayWfDisp.addEventListener("input", () => {
      preferences.bands.overlay.waveformRadialDisplaceFrac = Number(ui.rngBandOverlayWfDisp.value);
      syncSceneNodeFromCompatPreferences("bandOverlay", { createIfMissing: true });
      applyPrefs("overlay waveform disp", { statusTarget: "banking" });
    });

    ui.selRingPhaseMode.addEventListener("change", () => {
      preferences.bands.overlay.phaseMode = ui.selRingPhaseMode.value;
      syncSceneNodeFromCompatPreferences("bandOverlay", { createIfMissing: true });
      applyPrefs("ring phase mode", { statusTarget: "banking" });
    });

    ui.selDistMode.addEventListener("change", () => {
      preferences.bands.distributionMode = ui.selDistMode.value;
      applyPrefs("band distribution mode", {
        rebuildBandsOnDefinitionChange: true,
        statusTarget: "banking",
      });
    });

    ui.rngRingSpeed.addEventListener("input", () => {
      preferences.bands.overlay.ringSpeedRadPerSec = Number(ui.rngRingSpeed.value);
      syncSceneNodeFromCompatPreferences("bandOverlay", { createIfMissing: true });
      applyPrefs("ring speed", { statusTarget: "banking" });
    });

    ui.rngHueOff.addEventListener("input", () => { preferences.bands.rainbow.hueOffsetDeg = Number(ui.rngHueOff.value); applyPrefs("hue offset", { statusTarget: "banking" }); });
    ui.rngSat.addEventListener("input", () => { preferences.bands.rainbow.saturation = Number(ui.rngSat.value); applyPrefs("saturation", { statusTarget: "banking" }); });
    ui.rngVal.addEventListener("input", () => { preferences.bands.rainbow.value = Number(ui.rngVal.value); applyPrefs("value", { statusTarget: "banking" }); });

    /* Drag-drop onto canvas â€” multi-file entry point.
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
      if (target.closest('input, select, textarea, button, [contenteditable="true"], [role="button"]')) return true;
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
        resetOrbsToDesignedPhases();
        return;
      }

      // Track navigation â€” N: next, P: prev (Repeat=All wraps at boundaries).
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

      // Seek â€” arrow keys Â±5 seconds, Shift+arrows Â±30 seconds.
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
      const result = UrlPreset.applyFromLocationHash();
      if (result.ok) {
        applyPrefs("hash preset loaded", {
          rebuildBandsOnDefinitionChange: true,
          statusTarget: "workspace",
          resetSceneFromPreferences: true,
        });
        initOrbs();
        resetOrbsToDesignedPhases();
        ingestPresetApplyResult(result, { source: "hashchange" });
      } else {
        ingestPresetApplyResult(result, { source: "hashchange" });
      }
    });

  } // end wireControls

  function getPanelShellModel() {
    const shell = getPanelShellStateSnapshot(readPanelShell());
    return {
      ...shell,
      launcherItems: LAUNCHER_IDS.map((launcherId) => ({
        launcherId,
        targetId: LAUNCHER_TARGETS[launcherId],
        active: shell.activeLauncherId === launcherId,
        hasUnread: launcherId === "status" && readRuntimeLog().hasUnread,
        targetOpen: !!shell.openTargets[LAUNCHER_TARGETS[launcherId]],
        presentedOpen: shell.activeLauncherId === launcherId
          && !!shell.openTargets[LAUNCHER_TARGETS[launcherId]],
      })),
    };
  }

  function getSceneUiModel() {
    return readSceneUiModel();
  }

  return {
    setCssVarsFromConfig,
    wireControls,
    refreshAllUiText,
    refreshRecordingUi,
    getRecordingUiModel,
    getPanelShellModel,
    getSceneUiModel,
    dispatchSourceSwitchAction,
    showRecordPanel,
    hideRecordPanel,
    dispatchRecordingAction,
    ingestPresetApplyResult,
    applyPrefs,
    resetTrackVisualState,
  };
})();

export { UI, isFileWorkflowMode, shouldShowActiveQueueItem, readSourceUiModel };
