import { CONFIG } from "./config.js";
import { createPanelShellState } from "../ui/panel-state.js";
import { IDENTITY_VIEW_TRANSFORM } from "../render/view-transform.js";

/* =============================================================================
   App State
   ========================================================================== */
function createSourceState() {
  return {
    kind: "none",
    status: "idle",
    label: "",
    permission: {
      mic: "unknown",
      stream: "unknown",
    },
    support: {
      mic: false,
      stream: false,
    },
    errorCode: "",
    errorMessage: "",
    sessionActive: false,
    streamMeta: {
      hasAudio: false,
      hasVideo: false,
    },
  };
}

function createRecordingState() {
  const hooksEnabled = !!(CONFIG.recording && CONFIG.recording.hooksEnabled);
  const defaultTargetFps = Number.isFinite(CONFIG.recording && CONFIG.recording.targetFps)
    ? CONFIG.recording.targetFps
    : CONFIG.recording.targetFps;
  return {
    hooksEnabled,
    phase: hooksEnabled ? "boot-pending" : "disabled",
    supportProbeStatus: hooksEnabled ? "not-started" : "disabled",
    isSupported: hooksEnabled ? null : false,
    includePlaybackAudio: !!(CONFIG.recording && CONFIG.recording.includePlaybackAudio),
    targetFps: defaultTargetFps,
    availableMimeTypes: [],
    selectedMimeType: null,
    resolvedMimeType: null,
    startedAtMs: null,
    stoppedAtMs: null,
    elapsedMs: 0,
    chunkCount: 0,
    lastExportUrl: null,
    lastExportFileName: "",
    lastExportByteSize: 0,
    lastAction: "none",
    lastCode: hooksEnabled ? "not-initialized" : "hooks-disabled",
    lastMessage: hooksEnabled
      ? "Recording support has not been checked yet."
      : "Recording is disabled by configuration.",
    lastUpdatedAtMs: null,
  };
}

function createRuntimeLogState() {
  return {
    entries: [],
    nextId: 1,
    hasUnread: false,
    maxEntries: 64,
  };
}

function createRuntimeLogObserverState() {
  return {
    sourceSnapshot: null,
    recordingSnapshot: null,
  };
}

function createSceneState() {
  return {
    nodes: [],
    selectedNodeId: "",
    viewTransform: IDENTITY_VIEW_TRANSFORM,
  };
}

const state = {
  canvas: null,
  ctx: null,
  widthPx: 0,
  heightPx: 0,
  dpr: 1,

  time: { lastTimestampMs: null, simPaused: false },

  audio: { isLoaded: false, isPlaying: false, filename: "", transportError: "" },

  orbs: [],

  source: createSourceState(),

  recording: createRecordingState(),

  scene: createSceneState(),

  bands: {
    lowHz: [],
    highHz: [],
    energies01: [],
    meta: {
      sampleRateHz: null,
      nyquistHz: null,
      configCeilingHz: null,
      effectiveCeilingHz: null,
    },
    dominantIndex: 0,
    dominantName: "",
    ringPhaseRad: 0,
  },

  ui: {
    panelShell: createPanelShellState({
      openTargets: {
        recording: !!(CONFIG.recording && CONFIG.recording.defaultPanelVisible),
      },
    }),
    recordingUiSyncKey: "",
    runtimeLog: createRuntimeLogState(),
    runtimeLogUiSyncKey: "",
    runtimeLogObserver: createRuntimeLogObserverState(),
  }
};

export {
  createRecordingState,
  createRuntimeLogObserverState,
  createRuntimeLogState,
  createSceneState,
  createSourceState,
  state,
};
