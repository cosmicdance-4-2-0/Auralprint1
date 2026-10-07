import { clamp, fmt, deepClone } from "../core/utils.js";
import { CONFIG } from "../core/config.js";
import { preferences, runtime, resolveSettings, replacePreferences, normalizeOrbDef } from "../core/preferences.js";
import { normalizeOrbCollection } from "../core/orb-collection.js";
import { state } from "../core/state.js";
import { UrlPreset } from "../presets/url-preset.js";
import { BandBankController } from "../audio/band-bank-controller.js";
import { Queue } from "../audio/queue.js";
import { AudioEngine } from "../audio/audio-engine.js";
import { Scrubber } from "../audio/scrubber.js";
import { InputSourceManager } from "../audio/input-source-manager.js";
import { ColorPolicy } from "../render/color-policy.js";
import { VisualizerRuntime } from "../render/visualizer-runtime.js";
import { RecorderEngine } from "../recording/recorder-engine.js";
import { createRuntimeOrb, duplicateRuntimeOrb, initOrbs, removeRuntimeOrb, resetVisualizers, syncOrbsFromSettings } from "../render/orb-runtime.js";
import { primeDomCache } from "./dom-cache.js";
import { createWorkspaceUi } from "./workspace.js";
import { createOrbEditorUi } from "./orb-editor.js";
import { createVisualizersPanelUi } from "./visualizers-panel.js";
import { createAnalysisPanelUi } from "./analysis-panel.js";
import { createSpectralRingEditorUi } from "./spectral-ring-editor.js";
import { createScenePanelUi } from "./scene-panel.js";

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
    const channelCount = sourceState.streamMeta?.audioChannelCount;
    const captureText = Number.isInteger(channelCount) && channelCount > 0
      ? ` - Capture: ${channelCount === 1 ? "mono (1ch)" : `${channelCount}ch`}`
      : "";
    return `Stream live: ${readSourceLabel("stream", sourceState)}${captureText} - Bands: ${bandText}`;
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
  let maybeConsumePendingTrackEnd = () => {};

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


  // Status-lane routing:
  // - visualizer edit lane carries Orb and Spectral Ring configuration toasts.
  // - scene lane carries shared Scene settings and preset toasts.
  // - audio lane carries transport/audio toasts plus a short recording-state summary.
  // - analysis lane carries analysis configuration and validation feedback.
  const STATUS_DEFAULT_VISUALIZER_EDIT = "Choose a visualizer to shape its response.";
  const STATUS_DEFAULT_SCENE = "Shared scene settings and preset controls.";
  let _visualizerEditStatusToastTimer = null;
  let _sceneStatusToastTimer = null;
  let _audioStatusToastText = "";
  let _audioStatusToastUntilMs = 0;
  let queuePanelRefresher = () => {};
  const workspace = createWorkspaceUi({ ui, readRecordLauncherLabel: readRecordingLauncherLabel });
  const scenePanelUi = createScenePanelUi({ ui, preferences, getSettings: () => runtime.settings, commitPreferences: (reason) => applyPrefs(reason, { showStatus: sceneStatusToast }) });
  const analysisPanelUi = createAnalysisPanelUi({
    ui,
    commitPreferences: (reason, options = {}) => applyPrefs(reason, { ...options, showStatus: analysisStatus }),
    bandColor: (index) => ColorPolicy.bandRgb01(index),
  });
  const orbEditorUi = createOrbEditorUi({
    ui,
    commitOrbChangeById: applyOrbPrefChangeById,
    commitPreferences: (reason) => applyPrefs(reason, { showStatus: visualizerEditStatusToast }),
    showStatus: visualizerEditStatusToast,
    onControlsChanged: () => { initConfigTooltips(); wireConfigTooltipFeedbackEvents(); },
  });
  const spectralRingEditorUi = createSpectralRingEditorUi({
    ui,
    preferences,
    getSettings: () => runtime.settings,
    commitPreferences: (reason) => applyPrefs(reason, { showStatus: visualizerEditStatusToast }),
  });
  const visualizersPanelUi = createVisualizersPanelUi({
    ui,
    getVisualizers: () => VisualizerRuntime.getVisualizers(),
    getSettings: () => runtime.settings,
    editSpectralRing: () => spectralRingEditorUi.focusEditor(),
    addOrb: () => {
      const created = createRuntimeOrb();
      if (created) { orbEditorUi.refresh(); visualizerEditStatusToast(`Added ${created.id}`); }
      return created;
    },
    editOrb: (id) => orbEditorUi.focusOrb(id),
    duplicateOrb: (id) => {
      const created = duplicateRuntimeOrb(id);
      if (created) { orbEditorUi.refresh(); visualizerEditStatusToast(`Duplicated ${id}`); }
      return created;
    },
    confirmRemoveOrb: ({ displayName, id }) => window.confirm(`Remove ${displayName} (${id})? This cannot be undone.`),
    removeOrb: (id) => { const removed = removeRuntimeOrb(id); if (removed) { orbEditorUi.refresh(); visualizerEditStatusToast(`Removed ${id}`); } return removed; },
  });

  function visualizerEditStatusToast(msg, holdMs = 2500) {
    ui.visualizerEditStatus.textContent = msg;
    if (_visualizerEditStatusToastTimer) clearTimeout(_visualizerEditStatusToastTimer);
    _visualizerEditStatusToastTimer = setTimeout(() => {
      ui.visualizerEditStatus.textContent = STATUS_DEFAULT_VISUALIZER_EDIT;
      _visualizerEditStatusToastTimer = null;
    }, holdMs);
  }

  function sceneStatusToast(msg, holdMs = 2500) {
    ui.sceneStatus.textContent = msg;
    if (_sceneStatusToastTimer !== null) clearTimeout(_sceneStatusToastTimer);
    _sceneStatusToastTimer = setTimeout(() => {
      ui.sceneStatus.textContent = STATUS_DEFAULT_SCENE;
      _sceneStatusToastTimer = null;
    }, holdMs);
  }

  function audioStatusToast(msg, holdMs = 2500) {
    _audioStatusToastText = msg;
    _audioStatusToastUntilMs = performance.now() + holdMs;
  }

  function analysisStatus(msg) {
    if (ui.analysisStatus) ui.analysisStatus.textContent = msg;
  }

  function clearAudioStatusToast() {
    _audioStatusToastText = "";
    _audioStatusToastUntilMs = 0;
  }


  function applyOrbPrefChangeById(id, reason) {
    const orbIndex = preferences.orbs.findIndex((orb) => orb.id === id);
    if (orbIndex < 0) return false;
    const defaults = CONFIG.defaults.orbs;
    preferences.orbs[orbIndex] = normalizeOrbDef(preferences.orbs[orbIndex], defaults[orbIndex % defaults.length]);
    applyPrefs(reason, { showStatus: visualizerEditStatusToast });
    return true;
  }

  function applyPrefs(reason, options = {}) {
    const { rebuildBandsOnDefinitionChange = false, showStatus = null } = options;
    const prevBandDefKey = BandBankController.readBandDefKey(runtime.settings);

    preferences.orbs = normalizeOrbCollection(preferences.orbs);

    resolveSettings();
    syncOrbsFromSettings();

    BandBankController.syncFromSettings();
    const bandDefinitionChanged = BandBankController.readBandDefKey(runtime.settings) !== prevBandDefKey;
    if (rebuildBandsOnDefinitionChange && bandDefinitionChanged) {
      BandBankController.rebuildNow();
    }

    AudioEngine.applyAnalyserSettingsLive();
    AudioEngine.applyPlaybackSettingsLive();
    orbEditorUi.refresh();
    scenePanelUi.refresh(runtime.settings);

    if (reason && typeof showStatus === "function") showStatus(`Updated: ${reason}`);
  }


  function resetPrefs() {
    replacePreferences(deepClone(CONFIG.defaults));
    applyPrefs(null, { rebuildBandsOnDefinitionChange: true });
    initOrbs();
    resetVisualizers("visuals");
    sceneStatusToast("All settings reset.", 4000);
  }

  async function shareLink() {
    UrlPreset.writeHashFromPrefs();
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      sceneStatusToast("Share link copied to clipboard.", 4000);
    } catch {
      sceneStatusToast("Share link written to URL — copy from address bar.", 4000);
    }
  }

  function applyUrlNow() {
    const ok = UrlPreset.applyFromLocationHash();
    if (ok) {
      applyPrefs(null, { rebuildBandsOnDefinitionChange: true });
      initOrbs();
      resetVisualizers("visuals");
      sceneStatusToast("Preset applied from URL.", 4000);
    } else {
      sceneStatusToast("No valid preset in URL.", 4000);
    }
  }

  function collectOperatorFacingControls() {
    // 112 
    // This intentionally excludes buttons and transport-only affordances.
    const selectors = [
      "#audioPanel input",
      "#audioPanel select",
      "#analysisPanel input",
      "#analysisPanel select",
      "#visualizersPanel input",
      "#visualizersPanel select",
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
    const existingSpecs = ui.configTooltipByControl;
    ui.configTooltipSpecs = controls.map((control) => existingSpecs?.get(control) || ({
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
      if (!control || spec.feedbackEventsWired) continue;
      spec.feedbackEventsWired = true;
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
    // Canonical phase unlocks playback after either export completion or error.
    maybeConsumePendingTrackEnd();
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
    workspace.syncLauncherState();

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
    // EOF and finalization can both occur between frames with unchanged UI copy.
    maybeConsumePendingTrackEnd();
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

    orbEditorUi.refresh(runtime.settings);
    visualizersPanelUi.refresh();
    spectralRingEditorUi.refresh(runtime.settings);

    analysisPanelUi.refresh(analysisFrame);
    scenePanelUi.refresh(runtime.settings);

    refreshConfigTooltips();
    refreshRecordingUi();


  }

  function resetTrackVisualState() {
    Scrubber.reset();
    resetVisualizers("track");
    for (const channel of Object.values(state.bands.channels)) channel.energies01.fill(0);
    state.bands.dominantIndex = 0;
    state.bands.dominantName = "(none)";
    analysisPanelUi.refresh();
  }

  function wireControls() {
    primeDomCache();

    orbEditorUi.init();
    spectralRingEditorUi.init();
    scenePanelUi.init();
    visualizersPanelUi.init();

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
      // Revoke file activation ownership before releasing media or resetting state.
      invalidatePendingTrackLoads();
      Queue.clear();
      clearAudioStatusToast();
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
    let pendingTrackEnd = null;

    function invalidatePendingTrackLoads() {
      pendingTrackEnd = null;
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
      workspace.hideQueuePanel();
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
      workspace.hideQueuePanel();
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
      workspace.hideQueuePanel();
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
      pendingTrackEnd = null;
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

    function enqueueFileBatch(files) {
      const wasEmpty = Queue.length === 0;
      const firstIndex = Queue.length;
      // Commit the accepted batch synchronously. No continuation may add files
      // from this user action after Clear or final removal cancels its load.
      for (const file of files) Queue.add(file);
      if (wasEmpty) {
        Queue.setCursor(firstIndex);
        const activation = loadAndPlay(files[0]);
        refreshQueuePanel();
        return activation;
      }
      refreshQueuePanel();
      return true;
    }

    function applyTrackEndedPolicy({ repeatMode: mode }) {

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
    }

    maybeConsumePendingTrackEnd = () => {
      if (!pendingTrackEnd || isFinalizingFileTransportLocked()) return;
      const pending = pendingTrackEnd;
      // Clear before any transition or nested UI refresh can revisit the event.
      pendingTrackEnd = null;
      if (!isFileWorkflowMode()
        || !pending.file || Queue.current() !== pending.file
        || !pending.mediaEl || AudioEngine.getMediaEl() !== pending.mediaEl
        || activeLoadRequestId !== pending.requestId) return;
      applyTrackEndedPolicy(pending);
    };

    AudioEngine._onTrackEnded = () => {
      const context = {
        file: Queue.current(),
        mediaEl: AudioEngine.getMediaEl(),
        repeatMode: preferences.audio.repeatMode,
        requestId: activeLoadRequestId,
      };
      if (isFinalizingFileTransportLocked()) {
        pendingTrackEnd = context;
        return;
      }
      applyTrackEndedPolicy(context);
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
      const focused = document.activeElement;
      const oldRows = Array.from(ui.queueList.children);
      const focusIndex = oldRows.findIndex(row => row.contains(focused));
      const focusWasRemove = focusIndex >= 0 && oldRows[focusIndex].children[2] === focused;
      const clearedFocus = snap.length === 0 && focused === ui.btnClearQueue;
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
      if ((focusIndex >= 0 || clearedFocus) && workspace.isPanelVisible(ui.queuePanel)) {
        const row = ui.queueList.children[Math.min(focusIndex, snap.length - 1)];
        const target = row && allowQueueInteraction
          ? (focusWasRemove ? row.children[2] : row)
          : ui.btnHideQueue;
        target?.focus();
      }
      ui.queuePanelSyncKey = buildQueuePanelSyncKey();
    }
    queuePanelRefresher = refreshQueuePanel;

    wireConfigTooltipFeedbackEvents();
    workspace.init({ onRefreshQueuePanel: refreshQueuePanel });
    analysisPanelUi.init();
    refreshRecordingUi();

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
      const files = Array.from(ui.fileInput.files || []);
      if (!files.length) return;

      await enqueueFileBatch(files);
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
      if (workspace.isPanelVisible(ui.queuePanel)) workspace.hideQueuePanel(); else workspace.showQueuePanel();
    });


    ui.btnClearQueue.addEventListener("click", () => {
      if (!isFileWorkflowMode(state.source)) return;
      if (isFinalizingFileTransportLocked()) {
        toastFinalizingTransportLock();
        return;
      }
      // Cancel file activation, clear queue, then release source and reset state.
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
      applyPrefs("repeat", { showStatus: audioStatusToast });
    });
    if (ui.btnShuffle) {
      ui.btnShuffle.addEventListener("click", () => {
        if (!isFileWorkflowMode(state.source)) return;
        if (Queue.shuffle()) refreshQueuePanel();
      });
    }
    ui.chkMute.addEventListener("change", () => { preferences.audio.muted = !!ui.chkMute.checked; applyPrefs("mute", { showStatus: audioStatusToast }); });

    ui.rngVol.addEventListener("input", () => {
      preferences.audio.volume = Number(ui.rngVol.value);
      applyPrefs("volume (playback only)", { showStatus: audioStatusToast });
    });


    ui.btnShare.addEventListener("click", shareLink);
    ui.btnApplyUrl.addEventListener("click", applyUrlNow);
    ui.btnResetPrefs.addEventListener("click", resetPrefs);
    ui.btnResetVisuals.addEventListener("click", () => { resetVisualizers("visuals"); visualizerEditStatusToast("Visuals reset."); });


    /* Drag-drop onto canvas — multi-file entry point.
       All dropped audio files are enqueued. If the queue was empty before the
       drop, the first file starts playing immediately. Additional files append
       silently. MIME metadata is only a hint; the media decoder owns support
       decisions and reports unsupported/unreadable files through load errors. */
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
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      await enqueueFileBatch(files);
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
        workspace.togglePanels();
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
        applyPrefs(null, { rebuildBandsOnDefinitionChange: true });
        initOrbs();
        resetVisualizers("visuals");
        sceneStatusToast("Preset applied from URL.", 4000);
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
    showRecordPanel: workspace.showRecordPanel,
    hideRecordPanel: workspace.hideRecordPanel,
    dispatchRecordingAction,
    applyPrefs,
    resetTrackVisualState,
  };
})();

export { UI, isFileWorkflowMode, shouldShowActiveQueueItem, readSourceUiModel };
