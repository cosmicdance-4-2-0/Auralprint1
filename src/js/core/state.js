import { CONFIG } from "./config.js";

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
      audioChannelCount: null,
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

const initialBandEnergies = { L: [], R: [], C: [] };

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

  bands: {
    lowHz: [],
    highHz: [],
    channels: {
      L: { energies01: initialBandEnergies.L },
      R: { energies01: initialBandEnergies.R },
      C: { energies01: initialBandEnergies.C },
    },
    // Canonical global spectrum is the real combined Center analysis.
    energies01: initialBandEnergies.C,
    meta: {
      sampleRateHz: null,
      nyquistHz: null,
      effectiveFloorHz: null,
      configCeilingHz: null,
      effectiveCeilingHz: null,
    },
    dominantIndex: 0,
    dominantName: "",
    ringPhaseRad: 0,
  },

  ui: {
    workspaceLauncherCollapsed: false,
    panelRestoreSnapshot: null,
    audioDockHeight: null,
    audioDockObserver: null,
    orbBandPickers: null,
    orbPickerSettings: null,
    orbPickerEdges: null,
    recordingPanelVisible: !!(CONFIG.recording && CONFIG.recording.defaultPanelVisible),
    recordingPanelRestoreAfterGlobalHide: false,
    recordingUiSyncKey: "",
  }
};

export { createSourceState, createRecordingState, state };
