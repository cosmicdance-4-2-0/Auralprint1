import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";

import { CONFIG } from "../src/js/core/config.js";
import { PRESET_SCHEMA_VERSION } from "../src/js/core/constants.js";
import { normalizeOrbDef, preferences, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { AudioEngine } from "../src/js/audio/audio-engine.js";
import { BandBank } from "../src/js/audio/band-bank.js";
import { InputSourceManager, createInputSourceManager } from "../src/js/audio/input-source-manager.js";
import { Queue } from "../src/js/audio/queue.js";
import { Scrubber, buildWaveformPeaks } from "../src/js/audio/scrubber.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { RecorderEngine } from "../src/js/recording/recorder-engine.js";
import { createCompositor } from "../src/js/render/compositor.js";
import { Orb } from "../src/js/render/orb.js";
import { readSceneSettingsSchema } from "../src/js/render/scene-runtime.js";
import { IDENTITY_VIEW_TRANSFORM, normalizeViewTransform } from "../src/js/render/view-transform.js";
import { createVisualizerRegistry, registerBuiltInVisualizers } from "../src/js/render/visualizer.js";
import { BandOverlayVisualizer } from "../src/js/render/visualizers/band-overlay.js";
import { createPanelShellState, getPanelShellStateSnapshot } from "../src/js/ui/panel-state.js";
import { UI, readSourceUiModel, shouldShowActiveQueueItem } from "../src/js/ui/ui.js";
import { paths } from "../scripts/build.mjs";
import { prepareWatchBuild } from "../scripts/watch.mjs";

function createAudioBuffer(channels) {
  return {
    numberOfChannels: channels.length,
    getChannelData(index) {
      return Float32Array.from(channels[index]);
    },
  };
}

function createArcCaptureContext() {
  const arcs = [];
  return {
    arcs,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    rect() {},
    clip() {},
    fill() {},
    arc(x, y, r) {
      arcs.push({ x, y, r });
    },
    set fillStyle(_value) {},
    set strokeStyle(_value) {},
    set lineWidth(_value) {},
    set lineJoin(_value) {},
    set lineCap(_value) {},
  };
}

function createScrubberHarness() {
  const canvasListeners = new Map();
  const windowListeners = new Map();
  const scrubberTime = { textContent: "" };
  const ctx2d = {
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    save() {},
    restore() {},
    rect() {},
    clip() {},
    arc() {},
    fill() {},
  };
  const canvas = {
    clientWidth: 160,
    clientHeight: 32,
    width: 0,
    height: 0,
    getContext() {
      return ctx2d;
    },
    addEventListener(type, handler) {
      canvasListeners.set(type, handler);
    },
    getBoundingClientRect() {
      return { left: 10, width: 100 };
    },
  };

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;

  globalThis.window = {
    addEventListener(type, handler) {
      windowListeners.set(type, handler);
    },
  };
  globalThis.document = {
    getElementById(id) {
      return id === "scrubberTime" ? scrubberTime : null;
    },
  };

  return {
    canvas,
    canvasListeners,
    scrubberTime,
    windowListeners,
    restore() {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    },
  };
}

function decodePresetHash(hash) {
  const token = hash.startsWith("#p=") ? hash.slice(3) : hash;
  const padLength = (4 - (token.length % 4)) % 4;
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

function encodePresetHashPayload(payload) {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `#p=${b64}`;
}

function snapshotSourceAndAudioState() {
  return {
    source: JSON.parse(JSON.stringify(state.source)),
    audio: { ...state.audio },
  };
}

function snapshotBandState() {
  return structuredClone(state.bands);
}

function restoreBandState(snapshot) {
  state.bands.lowHz = snapshot.lowHz.slice();
  state.bands.highHz = snapshot.highHz.slice();
  state.bands.energies01 = snapshot.energies01.slice();
  state.bands.meta.sampleRateHz = snapshot.meta.sampleRateHz;
  state.bands.meta.nyquistHz = snapshot.meta.nyquistHz;
  state.bands.meta.configCeilingHz = snapshot.meta.configCeilingHz;
  state.bands.meta.effectiveCeilingHz = snapshot.meta.effectiveCeilingHz;
  state.bands.dominantIndex = snapshot.dominantIndex;
  state.bands.dominantName = snapshot.dominantName;
  state.bands.ringPhaseRad = snapshot.ringPhaseRad;
}

function snapshotSceneState() {
  return structuredClone(state.scene);
}

function restoreSceneState(snapshot) {
  if (!snapshot) return;
  state.scene.nodes = structuredClone(Array.isArray(snapshot.nodes) ? snapshot.nodes : []);
  state.scene.selectedNodeId = typeof snapshot.selectedNodeId === "string" ? snapshot.selectedNodeId : "";
  state.scene.viewTransform = structuredClone(snapshot.viewTransform);
}

function primeDominantBandState({ dominantIndex = 42, dominantName = "Test Band", energy = 0.67 } = {}) {
  const bandCount = preferences.bands.count;
  state.bands.lowHz = Array.from({ length: bandCount }, (_value, index) => index * 100);
  state.bands.highHz = Array.from(
    { length: bandCount },
    (_value, index) => (index === bandCount - 1 ? Infinity : (index + 1) * 100)
  );
  state.bands.energies01 = new Array(bandCount).fill(0);
  state.bands.energies01[dominantIndex] = energy;
  state.bands.meta.sampleRateHz = 48000;
  state.bands.meta.nyquistHz = 24000;
  state.bands.meta.configCeilingHz = preferences.bands.ceilingHz;
  state.bands.meta.effectiveCeilingHz = preferences.bands.ceilingHz;
  state.bands.dominantIndex = dominantIndex;
  state.bands.dominantName = dominantName;
}

function primeRealBandAnalysis({ dominantIndex = null, sampleRateHz = 48000, bins = 8192 } = {}) {
  BandBank.rebuild(preferences.bands.ceilingHz, sampleRateHz);

  const nyquistHz = sampleRateHz * 0.5;
  const minDb = -100;
  const maxDb = 0;
  const freqDb = new Float32Array(bins).fill(minDb);

  if (Number.isInteger(dominantIndex)) {
    const lowHz = state.bands.lowHz[dominantIndex];
    const highHzRaw = state.bands.highHz[dominantIndex];
    const highHz = Math.min(nyquistHz, highHzRaw === Infinity ? nyquistHz : highHzRaw);
    const lowBin = Math.max(0, Math.floor((lowHz / nyquistHz) * (bins - 1)));
    const highBin = Math.max(lowBin, Math.ceil((highHz / nyquistHz) * (bins - 1)));

    for (let i = lowBin; i <= highBin; i++) freqDb[i] = maxDb;
  }

  BandBank.computeEnergiesFromCAnalyser({
    freqDb,
    analyser: {
      minDecibels: minDb,
      maxDecibels: maxDb,
    },
  }, sampleRateHz);
}

function snapshotUiState() {
  return {
    ...state.ui,
    panelShell: getPanelShellStateSnapshot(state.ui.panelShell),
    runtimeLog: JSON.parse(JSON.stringify(state.ui.runtimeLog)),
    runtimeLogObserver: JSON.parse(JSON.stringify(state.ui.runtimeLogObserver)),
  };
}

function restoreUiState(snapshot) {
  if (!snapshot) return;
  Object.assign(state.ui, snapshot);
  state.ui.panelShell = createPanelShellState(snapshot.panelShell);
  state.ui.runtimeLog = JSON.parse(JSON.stringify(snapshot.runtimeLog));
  state.ui.runtimeLogObserver = JSON.parse(JSON.stringify(snapshot.runtimeLogObserver));
}

function applySourceAndAudioState(snapshot) {
  state.source.kind = snapshot.source.kind;
  state.source.status = snapshot.source.status;
  state.source.label = snapshot.source.label;
  state.source.permission.mic = snapshot.source.permission.mic;
  state.source.permission.stream = snapshot.source.permission.stream;
  state.source.support.mic = snapshot.source.support.mic;
  state.source.support.stream = snapshot.source.support.stream;
  state.source.errorCode = snapshot.source.errorCode;
  state.source.errorMessage = snapshot.source.errorMessage;
  state.source.sessionActive = snapshot.source.sessionActive;
  state.source.streamMeta.hasAudio = snapshot.source.streamMeta.hasAudio;
  state.source.streamMeta.hasVideo = snapshot.source.streamMeta.hasVideo;
  state.audio.isLoaded = snapshot.audio.isLoaded;
  state.audio.isPlaying = snapshot.audio.isPlaying;
  state.audio.filename = snapshot.audio.filename;
  state.audio.transportError = snapshot.audio.transportError;
}

function renderScrubberTimeText({ sourceState = {}, audioState = {}, mediaEl = null } = {}) {
  const harness = createScrubberHarness();
  const previousGetMediaEl = AudioEngine.getMediaEl;
  const snapshot = snapshotSourceAndAudioState();

  try {
    const nextSource = {
      ...snapshot.source,
      ...sourceState,
      permission: {
        ...snapshot.source.permission,
        ...(sourceState.permission || {}),
      },
      support: {
        ...snapshot.source.support,
        ...(sourceState.support || {}),
      },
      streamMeta: {
        ...snapshot.source.streamMeta,
        ...(sourceState.streamMeta || {}),
      },
    };
    const nextAudio = {
      ...snapshot.audio,
      ...audioState,
    };

    applySourceAndAudioState({
      source: nextSource,
      audio: nextAudio,
    });

    AudioEngine.getMediaEl = () => mediaEl;
    Scrubber.init(harness.canvas);
    Scrubber.reset();

    return harness.scrubberTime.textContent;
  } finally {
    AudioEngine.getMediaEl = previousGetMediaEl;
    applySourceAndAudioState(snapshot);
    harness.restore();
  }
}

function renderLoadHintState({ sourceState = {}, audioState = {}, recordingState = null } = {}) {
  const harness = createUiWireHarness();
  const previous = {
    source: JSON.parse(JSON.stringify(state.source)),
    audio: { ...state.audio },
    recording: JSON.parse(JSON.stringify(state.recording)),
  };

  try {
    const nextSource = {
      ...previous.source,
      ...sourceState,
      permission: {
        ...previous.source.permission,
        ...(sourceState.permission || {}),
      },
      support: {
        ...previous.source.support,
        ...(sourceState.support || {}),
      },
      streamMeta: {
        ...previous.source.streamMeta,
        ...(sourceState.streamMeta || {}),
      },
    };
    const nextAudio = {
      ...previous.audio,
      ...audioState,
    };

    applySourceAndAudioState({
      source: nextSource,
      audio: nextAudio,
    });
    if (recordingState) Object.assign(state.recording, previous.recording, recordingState);

    UI.wireControls();
    UI.refreshAllUiText();

    const loadHint = state.ui.loadHint;
    return {
      hidden: !!(loadHint && loadHint.classList.contains("hidden")),
      ariaHidden: loadHint ? loadHint.getAttribute("aria-hidden") : null,
    };
  } finally {
    applySourceAndAudioState(previous);
    Object.assign(state.recording, previous.recording);
    harness.restore();
  }
}

function createNamedAudioFile(name) {
  return { name, type: "audio/wav" };
}

async function withUiWireHarnessState({
  sourceState = {},
  audioState = {},
  recordingState = null,
  queueNames = [],
  currentIndex = -1,
  queueVisible = false,
  bandSnapshot = null,
  repeatMode = null,
} = {}, run) {
  const harness = createUiWireHarness();
  const previous = {
    source: JSON.parse(JSON.stringify(state.source)),
    audio: { ...state.audio },
    bands: snapshotBandState(),
    scene: snapshotSceneState(),
    recording: JSON.parse(JSON.stringify(state.recording)),
    ui: snapshotUiState(),
    repeatMode: preferences.audio.repeatMode,
  };

  try {
    Queue.clear();
    const nextSource = {
      ...previous.source,
      ...sourceState,
      permission: {
        ...previous.source.permission,
        ...(sourceState.permission || {}),
      },
      support: {
        ...previous.source.support,
        ...(sourceState.support || {}),
      },
      streamMeta: {
        ...previous.source.streamMeta,
        ...(sourceState.streamMeta || {}),
      },
    };
    const nextAudio = {
      ...previous.audio,
      ...audioState,
    };

    applySourceAndAudioState({
      source: nextSource,
      audio: nextAudio,
    });
    Object.assign(state.recording, previous.recording);
    if (recordingState) Object.assign(state.recording, recordingState);
    if (repeatMode !== null) preferences.audio.repeatMode = repeatMode;

    for (const name of queueNames) Queue.add(createNamedAudioFile(name));
    if (currentIndex >= 0) Queue.setCursor(currentIndex);

    state.ui.panelShell = createPanelShellState({
      openTargets: {
        audioSource: true,
        queue: queueVisible,
        analysis: false,
        banking: true,
        scene: true,
        recording: false,
        workspace: false,
        status: false,
      },
    });
    state.ui.recordingUiSyncKey = "";
    state.ui.runtimeLog = {
      entries: [],
      nextId: 1,
      hasUnread: false,
      maxEntries: 64,
    };
    state.ui.runtimeLogUiSyncKey = "";
    state.ui.runtimeLogObserver = {
      sourceSnapshot: null,
      recordingSnapshot: null,
    };

    UI.wireControls();
    UI.refreshRecordingUi();
    UI.refreshAllUiText(bandSnapshot);

    return await run({
      harness,
      getElement: harness.getElement,
    });
  } finally {
    Queue.clear();
    applySourceAndAudioState(previous);
    restoreBandState(previous.bands);
    restoreSceneState(previous.scene);
    Object.assign(state.recording, previous.recording);
    restoreUiState(previous.ui);
    preferences.audio.repeatMode = previous.repeatMode;
    harness.restore();
  }
}

function createAudioEngineHarness() {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousURL = globalThis.URL;
  const previousAudioState = { ...state.audio };
  const previousOnFilePlaybackError = AudioEngine._onFilePlaybackError;
  const revokedUrls = [];
  const connectionLog = [];
  let destinationNode = null;

  function createNode(extra = {}) {
    const node = {
      connections: [],
      connect(target) {
        this.connections.push(target);
        connectionLog.push({ from: this, to: target });
      },
      disconnect() {
        this.connections = [];
      },
      ...extra,
    };
    return node;
  }

  const audioEl = {
    preload: "",
    src: "",
    paused: true,
    currentTime: 0,
    error: null,
    releaseCalls: {
      pause: 0,
      removeSrc: 0,
      load: 0,
    },
    listeners: new Map(),
    addEventListener(type, handler, options = {}) {
      const entries = this.listeners.get(type) || [];
      entries.push({ handler, once: !!options.once });
      this.listeners.set(type, entries);
    },
    dispatch(type) {
      const entries = [...(this.listeners.get(type) || [])];
      const kept = [];
      for (const entry of entries) {
        entry.handler();
        if (!entry.once) kept.push(entry);
      }
      this.listeners.set(type, kept);
    },
    pause() {
      this.releaseCalls.pause += 1;
      this.paused = true;
      this.dispatch("pause");
    },
    play() {
      this.paused = false;
      this.dispatch("play");
      return Promise.resolve();
    },
    removeAttribute(name) {
      if (name === "src") {
        this.releaseCalls.removeSrc += 1;
        this.src = "";
      }
    },
    load() {
      this.releaseCalls.load += 1;
    },
  };

  class FakeAudioContext {
    constructor() {
      this.sampleRate = 48000;
      this.state = "running";
      this.destination = createNode({ kind: "destination" });
      destinationNode = this.destination;
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    createMediaElementSource(mediaElement) {
      return createNode({ mediaElement });
    }
    createMediaStreamSource(mediaStream) {
      return createNode({ mediaStream });
    }
    createGain() {
      return createNode({ gain: { value: 1 } });
    }
    createChannelSplitter() {
      return createNode();
    }
    createAnalyser() {
      return createNode({
        fftSize: 2048,
        smoothingTimeConstant: 0,
        frequencyBinCount: 1024,
        getFloatTimeDomainData(buffer) { buffer.fill(0); },
        getFloatFrequencyData(buffer) { buffer.fill(-100); },
      });
    }
    createMediaStreamDestination() {
      return createNode({
        stream: {
          getTracks() { return []; },
        },
      });
    }
  }

  globalThis.window = { AudioContext: FakeAudioContext };
  globalThis.document = {
    createElement(tag) {
      if (tag !== "audio") throw new Error(`Unexpected element request: ${tag}`);
      return audioEl;
    },
  };
  globalThis.URL = {
    createObjectURL() {
      return "blob:test-audio";
    },
    revokeObjectURL(url) {
      revokedUrls.push(url);
    },
  };

  return {
    audioEl,
    connectionLog,
    get destinationNode() {
      return destinationNode;
    },
    revokedUrls,
    restore() {
      try { AudioEngine.unload(); } catch {}
      AudioEngine._onFilePlaybackError = previousOnFilePlaybackError;
      state.audio.isLoaded = previousAudioState.isLoaded;
      state.audio.isPlaying = previousAudioState.isPlaying;
      state.audio.filename = previousAudioState.filename;
      state.audio.transportError = previousAudioState.transportError;
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.URL = previousURL;
    },
  };
}

function createRecorderHarness() {
  const previousWindow = globalThis.window;
  const previousMediaStream = globalThis.MediaStream;
  const previousMediaRecorder = globalThis.MediaRecorder;
  const previousSource = JSON.parse(JSON.stringify(state.source));
  const previousAudio = { ...state.audio };
  const previousRecording = JSON.parse(JSON.stringify(state.recording));
  const previousUi = snapshotUiState();
  const mediaRecorders = [];

  const videoTrack = { kind: "video", stop() {} };
  const audioTrack = { kind: "audio", stop() {} };

  class FakeMediaStream {
    constructor() {
      this._tracks = [];
    }
    addTrack(track) {
      this._tracks.push(track);
    }
    getTracks() {
      return this._tracks.slice();
    }
    getVideoTracks() {
      return this._tracks.filter((track) => track.kind === "video");
    }
    getAudioTracks() {
      return this._tracks.filter((track) => track.kind === "audio");
    }
  }

  class FakeMediaRecorder {
    static isTypeSupported() {
      return true;
    }
    constructor(stream, options) {
      this.stream = stream;
      this.options = options;
      this.state = "inactive";
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
      mediaRecorders.push(this);
    }
    start() {
      this.state = "recording";
    }
  }

  globalThis.MediaStream = FakeMediaStream;
  globalThis.MediaRecorder = FakeMediaRecorder;
  globalThis.window = {
    ...(previousWindow || {}),
    MediaRecorder: FakeMediaRecorder,
  };

  const renderStream = new FakeMediaStream();
  renderStream.addTrack(videoTrack);
  const audioStream = new FakeMediaStream();
  audioStream.addTrack(audioTrack);
  const renderCanvas = {
    captureStream() {
      return renderStream;
    },
  };
  const audioTap = {
    supportsStreamDestination: true,
    ensureStream() {
      return audioStream;
    },
    releaseStream() {},
  };

  state.audio.isLoaded = false;
  state.audio.isPlaying = false;
  state.audio.filename = "";
  state.audio.transportError = "";
  state.source.kind = "mic";
  state.source.status = "active";
  state.source.label = "Desk Mic";
  state.source.sessionActive = true;
  state.source.permission.mic = "granted";
  state.source.streamMeta.hasAudio = true;
  state.source.streamMeta.hasVideo = false;

  RecorderEngine.init({
    stateRef: state.recording,
    getRenderTap: () => ({ canvas: renderCanvas }),
    getAudioTap: () => audioTap,
    nowMs: () => 0,
  });

  return {
    mediaRecorders,
    renderStream,
    audioStream,
    videoTrack,
    audioTrack,
    restore() {
      try { RecorderEngine.dispose(); } catch {}
      state.source.kind = previousSource.kind;
      state.source.status = previousSource.status;
      state.source.label = previousSource.label;
      state.source.permission.mic = previousSource.permission.mic;
      state.source.permission.stream = previousSource.permission.stream;
      state.source.support.mic = previousSource.support.mic;
      state.source.support.stream = previousSource.support.stream;
      state.source.errorCode = previousSource.errorCode;
      state.source.errorMessage = previousSource.errorMessage;
      state.source.sessionActive = previousSource.sessionActive;
      state.source.streamMeta.hasAudio = previousSource.streamMeta.hasAudio;
      state.source.streamMeta.hasVideo = previousSource.streamMeta.hasVideo;
      state.audio.isLoaded = previousAudio.isLoaded;
      state.audio.isPlaying = previousAudio.isPlaying;
      state.audio.filename = previousAudio.filename;
      state.audio.transportError = previousAudio.transportError;
      Object.assign(state.recording, previousRecording);
      restoreUiState(previousUi);
      globalThis.window = previousWindow;
      globalThis.MediaStream = previousMediaStream;
      globalThis.MediaRecorder = previousMediaRecorder;
    },
  };
}

class UiElementStub {}

function createStubUiElement(tagName = "div") {
  const listeners = new Map();
  const attributes = new Map();
  const classes = new Set();
  let innerHtml = "";

  const element = {
    tagName: String(tagName).toUpperCase(),
    style: { display: "block" },
    dataset: {},
    children: [],
    options: [],
    hidden: false,
    disabled: false,
    checked: false,
    title: "",
    value: "",
    textContent: "",
    tabIndex: 0,
    addEventListener(type, handler) {
      const entries = listeners.get(type) || [];
      entries.push(handler);
      listeners.set(type, entries);
    },
    removeEventListener(type, handler) {
      const entries = listeners.get(type) || [];
      listeners.set(type, entries.filter((entry) => entry !== handler));
    },
    dispatch(type, event = {}) {
      const entries = listeners.get(type) || [];
      for (const handler of entries) {
        handler({
          preventDefault() {},
          stopPropagation() {},
          target: this,
          currentTarget: this,
          ...event,
        });
      }
    },
    click() {
      if (this.disabled) return;
      this.dispatch("click");
    },
    appendChild(child) {
      this.children.push(child);
      if (child && child.tagName === "OPTION") this.options.push(child);
      return child;
    },
    remove() {},
    focus() {},
    contains() {
      return false;
    },
    closest() {
      return null;
    },
    querySelector() {
      return null;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    classList: {
      add(...names) {
        for (const name of names) classes.add(name);
      },
      remove(...names) {
        for (const name of names) classes.delete(name);
      },
      toggle(name, force) {
        if (force === true) {
          classes.add(name);
          return true;
        }
        if (force === false) {
          classes.delete(name);
          return false;
        }
        if (classes.has(name)) {
          classes.delete(name);
          return false;
        }
        classes.add(name);
        return true;
      },
      contains(name) {
        return classes.has(name);
      },
    },
  };
  Object.defineProperty(element, "innerHTML", {
    get() {
      return innerHtml;
    },
    set(value) {
      innerHtml = String(value);
      element.children = [];
      element.options = [];
    },
  });
  return Object.setPrototypeOf(element, UiElementStub.prototype);
}

function createUiWireHarness() {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousElement = globalThis.Element;
  const previousUi = snapshotUiState();
  const previousCanvas = state.canvas;
  const previousPreferences = structuredClone(preferences);
  const previousScene = snapshotSceneState();
  const elements = new Map();
  const windowListeners = new Map();

  function getElement(id) {
    if (!elements.has(id)) {
      const el = createStubUiElement(id === "fileInput" ? "input" : "div");
      if (id === "queuePanel") el.style.display = "none";
      elements.set(id, el);
    }
    return elements.get(id);
  }

  const body = createStubUiElement("body");
  globalThis.Element = UiElementStub;
  globalThis.window = {
    ...(previousWindow || {}),
    addEventListener(type, handler) {
      const entries = windowListeners.get(type) || [];
      entries.push(handler);
      windowListeners.set(type, entries);
    },
  };
  globalThis.document = {
    activeElement: null,
    getElementById(id) {
      return getElement(id);
    },
    createElement(tag) {
      return createStubUiElement(tag);
    },
    body,
    querySelectorAll() {
      return [];
    },
  };
  state.canvas = createStubUiElement("canvas");
  state.scene.nodes = [];
  state.scene.selectedNodeId = "";

  return {
    getElement,
    dispatchWindow(type, event = {}) {
      const entries = windowListeners.get(type) || [];
      for (const handler of entries) {
        handler({
          altKey: false,
          ctrlKey: false,
          metaKey: false,
          preventDefault() {},
          stopPropagation() {},
          target: null,
          currentTarget: globalThis.window,
          ...event,
        });
      }
    },
    restore() {
      replacePreferences(structuredClone(previousPreferences));
      resolveSettings();
      restoreSceneState(previousScene);
      restoreUiState(previousUi);
      state.canvas = previousCanvas;
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Element = previousElement;
    },
  };
}

function readSceneRowAt(index) {
  return state.ui.sceneNodeList.children[index] || null;
}

function readSceneRowActions(row) {
  if (!row || !row.children[1]) return null;
  const actions = row.children[1];
  return {
    selectButton: actions.children[0] || null,
    enabledLabel: actions.children[1] || null,
    enabledInput: actions.children[1] ? actions.children[1].children[0] || null : null,
    moveBackwardButton: actions.children[2] || null,
    moveForwardButton: actions.children[3] || null,
  };
}

function findSceneInspectorRow(labelText) {
  const container = state.ui.sceneInspectorFields;
  const rows = container && Array.isArray(container.children) ? container.children : [];
  return rows.find((row) => row && row.children && row.children[0] && row.children[0].textContent === labelText) || null;
}

function readSceneOrbCardAt(index) {
  const orbList = state.ui.sceneInspectorFields && state.ui.sceneInspectorFields.children
    ? state.ui.sceneInspectorFields.children[2] || null
    : null;
  return orbList && orbList.children ? orbList.children[index] || null : null;
}

function findSceneOrbCardRow(card, labelText) {
  const rows = card && Array.isArray(card.children) ? card.children : [];
  return rows.find((row, index) => (
    index > 0
    && row
    && row.children
    && row.children[0]
    && row.children[0].textContent === labelText
  )) || null;
}

test("normalizeOrbDef preserves fallback routing when chanId and bandIds are omitted", () => {
  const fallback = {
    id: "ORB0",
    chanId: "R",
    bandIds: [4, 5],
    chirality: -1,
    startAngleRad: Math.PI,
  };

  const normalized = normalizeOrbDef({ id: "legacy" }, fallback);

  assert.equal(normalized.chanId, "R");
  assert.deepEqual(normalized.bandIds, [4, 5]);
});

test("normalizeOrbDef still honors explicit incoming routing and band selections", () => {
  const fallback = {
    id: "ORB1",
    chanId: "L",
    bandIds: [1, 2],
    chirality: -1,
    startAngleRad: 0,
  };

  const normalized = normalizeOrbDef({
    id: "custom",
    chanId: "C",
    bandIds: [],
  }, fallback);

  assert.equal(normalized.chanId, "C");
  assert.deepEqual(normalized.bandIds, []);
});

test("Orb uses scene node bounds for radius and origin instead of full-canvas metrics", () => {
  const previousPrefs = structuredClone(preferences);
  const previousWidthPx = state.widthPx;
  const previousHeightPx = state.heightPx;

  try {
    replacePreferences(structuredClone(CONFIG.defaults));
    resolveSettings();
    state.widthPx = 1000;
    state.heightPx = 1000;

    const orb = new Orb({
      id: "BOUNDED",
      chanId: "C",
      bandIds: [],
      chirality: 1,
      startAngleRad: 0,
      hueOffsetDeg: 0,
      centerX: 0.5,
      centerY: -0.5,
    });
    const boundsPx = { x: 100, y: 200, width: 200, height: 100 };

    orb.step(0, 0, {
      energy01: 1,
      timeDomain: null,
    }, {
      boundsPx,
    });

    const screenX = state.widthPx * 0.5 + orb.xSim;
    const screenY = state.heightPx * 0.5 - orb.ySim;

    assert.equal(orb.baseRadiusPx, 80);
    assert.equal(screenX, 330);
    assert.equal(screenY, 275);
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    state.widthPx = previousWidthPx;
    state.heightPx = previousHeightPx;
  }
});

test("Band overlay uses node-local metrics instead of full-canvas ring geometry", () => {
  const previousPrefs = structuredClone(preferences);
  const previousWidthPx = state.widthPx;
  const previousHeightPx = state.heightPx;
  const previousDpr = state.dpr;
  const previousRingPhaseRad = state.bands.ringPhaseRad;

  try {
    replacePreferences(structuredClone(CONFIG.defaults));
    resolveSettings();
    state.widthPx = 1000;
    state.heightPx = 1000;
    state.dpr = 1;
    state.bands.ringPhaseRad = 0;

    const ctx = createArcCaptureContext();
    const node = {
      id: "overlay-1",
      type: "bandOverlay",
      settings: structuredClone(CONFIG.defaults.bands.overlay),
    };
    const boundsPx = { x: 100, y: 150, width: 200, height: 100 };
    const visualizer = new BandOverlayVisualizer({ node });

    visualizer.init({
      ctx,
      widthPx: state.widthPx,
      heightPx: state.heightPx,
      dpr: state.dpr,
      node,
    });
    visualizer.resize(boundsPx);
    visualizer.update({
      analysis: {
        compat: {
          centerWaveform: new Float32Array([0]),
        },
      },
      bands: [
        { energy: 1 },
      ],
    }, 0);
    visualizer.render({
      ctx,
      widthPx: state.widthPx,
      heightPx: state.heightPx,
      dpr: state.dpr,
    }, IDENTITY_VIEW_TRANSFORM);

    assert.equal(ctx.arcs.length, 1);
    assert.deepEqual(ctx.arcs[0], { x: 280, y: 200, r: 3 });
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    state.widthPx = previousWidthPx;
    state.heightPx = previousHeightPx;
    state.dpr = previousDpr;
    state.bands.ringPhaseRad = previousRingPhaseRad;
  }
});

test("built-in visualizer registry exposes only real Build 115 runtime types", () => {
  const registry = createVisualizerRegistry();
  registerBuiltInVisualizers(registry);

  const orbDescriptor = registry.get("orbs");
  const overlayDescriptor = registry.get("bandOverlay");

  assert.equal(registry.has("orbs"), true);
  assert.equal(registry.has("bandOverlay"), true);
  assert.equal(registry.has("legacyRender"), false);
  assert.equal(registry.get("legacyRender"), null);
  assert.equal(orbDescriptor.type, "orbs");
  assert.equal(orbDescriptor.defaultNode.type, "orbs");
  assert.equal(overlayDescriptor.type, "bandOverlay");
  assert.equal(overlayDescriptor.defaultNode.type, "bandOverlay");
});

test("compositor syncScene owns visualizer lifecycle and render ordering honestly", () => {
  const events = [];
  const warnings = [];
  let nextInstanceToken = 1;

  class ProbeVisualizer {
    constructor({ node }) {
      this.node = node;
      this.token = nextInstanceToken++;
      events.push({ type: "construct", id: node.id, token: this.token });
    }

    init({ node }) {
      events.push({ type: "init", id: node.id, token: this.token });
    }

    configure(node) {
      this.node = node;
      events.push({ type: "configure", id: node.id, zIndex: node.zIndex, token: this.token });
    }

    resize(boundsPx) {
      events.push({ type: "resize", id: this.node.id, boundsPx: { ...boundsPx }, token: this.token });
    }

    update(_frame, dtSec) {
      events.push({ type: "update", id: this.node.id, dtSec, token: this.token });
    }

    render(_target, viewTransform) {
      events.push({ type: "render", id: this.node.id, mode: viewTransform.mode, token: this.token });
    }

    dispose() {
      events.push({ type: "dispose", id: this.node.id, token: this.token });
    }
  }

  const registry = createVisualizerRegistry();
  registry.register("probe", ProbeVisualizer);

  const compositor = createCompositor({
    registry,
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  const createNode = ({ id, enabled = true, zIndex = 0, bounds, anchor }) => ({
    id,
    type: "probe",
    enabled,
    zIndex,
    bounds,
    anchor,
  });

  const targetA = { canvas: null, ctx: null, widthPx: 100, heightPx: 80, dpr: 1 };
  compositor.syncScene({
    nodes: [
      createNode({
        id: "a",
        zIndex: 2,
        bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
        anchor: { x: 0.5, y: 0.5 },
      }),
      createNode({
        id: "b",
        zIndex: 1,
        bounds: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
        anchor: { x: 0, y: 0 },
      }),
      createNode({
        id: "c",
        zIndex: 1,
        bounds: { x: 0.75, y: 0.75, w: 0.25, h: 0.25 },
        anchor: { x: 1, y: 1 },
      }),
      createNode({
        id: "skip",
        enabled: false,
        zIndex: 0,
        bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
        anchor: { x: 0.5, y: 0.5 },
      }),
    ],
  }, targetA);
  compositor.update({ ok: true }, 0.25);
  compositor.render(targetA, IDENTITY_VIEW_TRANSFORM);

  assert.deepEqual(events.filter((event) => event.type === "construct").map((event) => event.id), ["a", "b", "c"]);
  assert.deepEqual(events.filter((event) => event.type === "update").map((event) => event.id), ["b", "c", "a"]);
  assert.deepEqual(events.filter((event) => event.type === "render").map((event) => event.id), ["b", "c", "a"]);
  assert.deepEqual(
    events.filter((event) => event.type === "resize").map((event) => ({ id: event.id, boundsPx: event.boundsPx })),
    [
      { id: "a", boundsPx: { x: 0, y: 0, width: 100, height: 80 } },
      { id: "b", boundsPx: { x: 25, y: 20, width: 50, height: 40 } },
      { id: "c", boundsPx: { x: 50, y: 40, width: 25, height: 20 } },
    ]
  );

  events.length = 0;

  const targetB = { canvas: null, ctx: null, widthPx: 200, heightPx: 100, dpr: 2 };
  compositor.syncScene({
    nodes: [
      createNode({
        id: "c",
        zIndex: 3,
        bounds: { x: 0.5, y: 0.5, w: 0.5, h: 1 },
        anchor: { x: 0.5, y: 0.5 },
      }),
      createNode({
        id: "a",
        enabled: false,
        zIndex: 2,
        bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
        anchor: { x: 0.5, y: 0.5 },
      }),
      createNode({
        id: "d",
        zIndex: 1,
        bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
        anchor: { x: 0.5, y: 0.5 },
      }),
    ],
  }, targetB);
  compositor.update({ ok: true }, 0.5);
  compositor.render(targetB, IDENTITY_VIEW_TRANSFORM);

  assert.deepEqual(events.filter((event) => event.type === "construct").map((event) => event.id), ["d"]);
  assert.deepEqual(events.filter((event) => event.type === "dispose").map((event) => event.id).sort(), ["a", "b"]);
  assert.deepEqual(events.filter((event) => event.type === "render").map((event) => event.id), ["d", "c"]);
  assert.deepEqual(
    events.filter((event) => event.type === "resize").map((event) => ({ id: event.id, boundsPx: event.boundsPx })),
    [
      { id: "c", boundsPx: { x: 50, y: 0, width: 100, height: 100 } },
      { id: "d", boundsPx: { x: 0, y: 0, width: 200, height: 100 } },
    ]
  );
  assert.deepEqual(warnings, []);

  events.length = 0;
  compositor.dispose();

  assert.deepEqual(events.filter((event) => event.type === "dispose").map((event) => event.id).sort(), ["c", "d"]);
});

test("buildWaveformPeaks keeps mono peak behavior unchanged", () => {
  const peaks = buildWaveformPeaks(createAudioBuffer([
    [0, 0.5, -0.5, 0],
  ]), 2);

  assert.deepEqual(Array.from(peaks), [0.5, 0.5]);
});

test("buildWaveformPeaks includes non-silent right-channel data", () => {
  const peaks = buildWaveformPeaks(createAudioBuffer([
    [0, 0, 0, 0],
    [0, 0.75, 0, 0],
  ]), 2);

  assert.equal(peaks[0], 0.75);
  assert.equal(peaks[1], 0);
});

test("scrubber touchmove does not cancel window scrolling outside an active drag", () => {
  const harness = createScrubberHarness();
  const originalGetMediaEl = AudioEngine.getMediaEl;
  const mediaEl = { duration: 100, currentTime: 0 };

  try {
    AudioEngine.getMediaEl = () => mediaEl;
    Scrubber.init(harness.canvas);

    let prevented = false;
    harness.windowListeners.get("touchmove")({
      touches: [{ clientX: 70 }],
      preventDefault() { prevented = true; },
    });

    assert.equal(prevented, false);
    assert.equal(mediaEl.currentTime, 0);
  } finally {
    AudioEngine.getMediaEl = originalGetMediaEl;
    harness.restore();
  }
});

test("scrubber active touch drag still prevents default and seeks", () => {
  const harness = createScrubberHarness();
  const originalGetMediaEl = AudioEngine.getMediaEl;
  const mediaEl = { duration: 100, currentTime: 0 };

  try {
    AudioEngine.getMediaEl = () => mediaEl;
    Scrubber.init(harness.canvas);

    let startPrevented = false;
    harness.canvasListeners.get("touchstart")({
      touches: [{ clientX: 60 }],
      preventDefault() { startPrevented = true; },
    });

    let movePrevented = false;
    harness.windowListeners.get("touchmove")({
      touches: [{ clientX: 90 }],
      preventDefault() { movePrevented = true; },
    });
    harness.windowListeners.get("touchend")({});

    assert.equal(startPrevented, true);
    assert.equal(movePrevented, true);
    assert.equal(mediaEl.currentTime, 80);
  } finally {
    AudioEngine.getMediaEl = originalGetMediaEl;
    harness.restore();
  }
});

test("Scrubber.draw keeps the Build 113 idle file copy when no source is active", () => {
  const text = renderScrubberTimeText({
    sourceState: {
      kind: "none",
      status: "idle",
      label: "",
      errorCode: "",
      errorMessage: "",
      sessionActive: false,
      streamMeta: { hasAudio: false, hasVideo: false },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
  });

  assert.equal(text, "--:-- / --:-- • no track loaded");
});

test("Scrubber.draw uses honest microphone copy instead of fake track text", () => {
  assert.equal(renderScrubberTimeText({
    sourceState: {
      kind: "mic",
      status: "requesting",
      label: "Desk Mic",
      errorCode: "",
      errorMessage: "",
      sessionActive: false,
      streamMeta: { hasAudio: false, hasVideo: false },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
  }), "Waiting for microphone permission.");

  assert.equal(renderScrubberTimeText({
    sourceState: {
      kind: "mic",
      status: "active",
      label: "Desk Mic",
      errorCode: "",
      errorMessage: "",
      sessionActive: true,
      streamMeta: { hasAudio: true, hasVideo: false },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
  }), "Microphone input active • live input");

  assert.equal(renderScrubberTimeText({
    sourceState: {
      kind: "mic",
      status: "error",
      label: "Desk Mic",
      errorCode: "mic-denied",
      errorMessage: "Microphone permission denied.",
      sessionActive: false,
      streamMeta: { hasAudio: false, hasVideo: false },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
  }), "Microphone permission denied.");

  assert.equal(renderScrubberTimeText({
    sourceState: {
      kind: "mic",
      status: "unsupported",
      label: "",
      errorCode: "mic-unsupported",
      errorMessage: "",
      sessionActive: false,
      streamMeta: { hasAudio: false, hasVideo: false },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
  }), "Microphone input is unavailable.");
});

test("Scrubber.draw uses honest stream copy instead of fake track text", () => {
  assert.equal(renderScrubberTimeText({
    sourceState: {
      kind: "stream",
      status: "requesting",
      label: "Browser Tab",
      errorCode: "",
      errorMessage: "",
      sessionActive: false,
      streamMeta: { hasAudio: false, hasVideo: true },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
  }), "Waiting for stream share permission.");

  assert.equal(renderScrubberTimeText({
    sourceState: {
      kind: "stream",
      status: "active",
      label: "Browser Tab",
      errorCode: "",
      errorMessage: "",
      sessionActive: true,
      streamMeta: { hasAudio: true, hasVideo: true },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
  }), "Stream input active • live input");

  assert.equal(renderScrubberTimeText({
    sourceState: {
      kind: "stream",
      status: "error",
      label: "Browser Tab",
      errorCode: "stream-ended",
      errorMessage: "Shared stream ended. Select Stream to share again.",
      sessionActive: false,
      streamMeta: { hasAudio: false, hasVideo: false },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
  }), "Shared stream ended. Select Stream to share again.");

  assert.equal(renderScrubberTimeText({
    sourceState: {
      kind: "stream",
      status: "unsupported",
      label: "",
      errorCode: "stream-unsupported",
      errorMessage: "",
      sessionActive: false,
      streamMeta: { hasAudio: false, hasVideo: false },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
  }), "Stream input is unavailable.");
});

test("AudioEngine.loadFile does not tear down the freshly created media element during attach", async () => {
  const harness = createAudioEngineHarness();

  try {
    const ok = await AudioEngine.loadFile({ name: "demo.wav" }, null, { autoPlay: false });

    assert.equal(ok, true);
    assert.equal(harness.audioEl.releaseCalls.pause, 0);
    assert.equal(harness.audioEl.releaseCalls.removeSrc, 0);
    assert.equal(harness.audioEl.releaseCalls.load, 0);
    assert.deepEqual(harness.revokedUrls, []);
    assert.equal(AudioEngine.getMediaEl(), harness.audioEl);
    assert.equal(state.audio.isLoaded, true);
    assert.equal(state.audio.filename, "demo.wav");
  } finally {
    harness.restore();
  }
});

test("AudioEngine.loadFile clears loaded state and reports late file errors after a paused load succeeds", async () => {
  const harness = createAudioEngineHarness();
  const seenErrors = [];

  try {
    AudioEngine._onFilePlaybackError = (details) => {
      seenErrors.push(details);
    };

    const ok = await AudioEngine.loadFile({ name: "broken.wav" }, null, { autoPlay: false });

    assert.equal(ok, true);
    assert.equal(state.audio.isLoaded, true);
    assert.equal(state.audio.filename, "broken.wav");

    harness.audioEl.error = { code: 4 };
    harness.audioEl.dispatch("error");

    assert.equal(state.audio.isLoaded, false);
    assert.equal(state.audio.isPlaying, false);
    assert.equal(state.audio.filename, "");
    assert.equal(state.audio.transportError, "Playback error: unsupported or unreadable audio file.");
    assert.equal(seenErrors.length, 1);
    assert.equal(seenErrors[0].mediaEl, harness.audioEl);
    assert.equal(seenErrors[0].fileName, "broken.wav");
    assert.equal(seenErrors[0].message, "Playback error: unsupported or unreadable audio file.");
  } finally {
    harness.restore();
  }
});

test("deferred file playback errors clear the active file session and block recording restart", async () => {
  const recorderHarness = createRecorderHarness();
  const mediaEl = { tagName: "AUDIO" };
  let unloadCalls = 0;
  const audioEngine = {
    async loadFile(file) {
      state.audio.isLoaded = true;
      state.audio.isPlaying = false;
      state.audio.filename = file.name;
      state.audio.transportError = "";
      return true;
    },
    unload() {
      unloadCalls += 1;
      state.audio.isPlaying = false;
    },
    getMediaEl() {
      return mediaEl;
    },
  };
  const manager = createInputSourceManager({
    stateRef: state,
    audioEngine,
    mediaDevices: {},
  });

  state.audio.isLoaded = false;
  state.audio.isPlaying = false;
  state.audio.filename = "";
  state.audio.transportError = "";
  state.source.kind = "none";
  state.source.status = "idle";
  state.source.label = "";
  state.source.errorCode = "";
  state.source.errorMessage = "";
  state.source.sessionActive = false;
  state.source.streamMeta.hasAudio = false;
  state.source.streamMeta.hasVideo = false;

  try {
    const activation = await manager.activateFile({ name: "broken-late.wav" }, { requestId: 41, autoPlay: false });
    assert.equal(activation.ok, true);
    assert.equal(state.source.kind, "file");
    assert.equal(state.source.status, "active");
    assert.equal(state.source.sessionActive, true);
    assert.equal(state.audio.isLoaded, true);

    const failure = audioEngine._onFilePlaybackError({
      mediaEl,
      fileName: "broken-late.wav",
      message: "Playback error: unsupported or unreadable audio file.",
    });

    assert.equal(unloadCalls, 1);
    assert.equal(failure.ok, false);
    assert.equal(failure.errorCode, "file-playback-error");
    assert.equal(state.source.kind, "file");
    assert.equal(state.source.status, "error");
    assert.equal(state.source.sessionActive, false);
    assert.equal(state.source.errorCode, "file-playback-error");
    assert.equal(state.source.errorMessage, "Playback error: unsupported or unreadable audio file.");
    assert.equal(state.audio.isLoaded, false);
    assert.equal(state.audio.isPlaying, false);
    assert.equal(state.audio.filename, "");
    assert.equal(state.audio.transportError, "Playback error: unsupported or unreadable audio file.");

    const status = RecorderEngine.start();
    assert.equal(status.ok, false);
    assert.equal(status.code, "no-active-source");
  } finally {
    recorderHarness.restore();
  }
});

test("AudioEngine.getRecorderTap reuses active live-stream audio without local playback or lifecycle ownership", async () => {
  const harness = createAudioEngineHarness();
  const liveAudioTrack = {
    kind: "audio",
    stopCount: 0,
    stop() {
      this.stopCount += 1;
    },
  };
  const liveStream = {
    getTracks() {
      return [liveAudioTrack];
    },
    getAudioTracks() {
      return [liveAudioTrack];
    },
    getVideoTracks() {
      return [];
    },
  };

  try {
    await AudioEngine.attachMediaStreamSource(liveStream, {
      kind: "stream",
      label: "Browser Tab",
      monitorOutput: false,
    });

    const tap = AudioEngine.getRecorderTap();
    assert.equal(tap.ensureStream(), liveStream);
    assert.equal(
      harness.connectionLog.some((entry) => entry.to === harness.destinationNode),
      false
    );

    tap.releaseStream();
    assert.equal(liveAudioTrack.stopCount, 0);
  } finally {
    harness.restore();
  }
});

test("readSourceUiModel keeps microphone mode honest about file-only affordances", () => {
  const model = readSourceUiModel({
    sourceState: {
      kind: "mic",
      status: "active",
      label: "Podcast Mic",
      errorMessage: "",
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "should-not-show.wav",
      transportError: "",
    },
    queueLength: 3,
    currentIndex: 1,
    bandText: "mono-ish (L≈R)",
    recordingStatusText: "Recording available.",
  });

  assert.deepEqual(model.pressedSources, {
    file: false,
    mic: true,
    stream: false,
  });
  assert.equal(model.disableFileControls, true);
  assert.equal(model.audioPanelSourceMode, "mic");
  assert.match(model.audioStatusText, /Microphone live: Podcast Mic - Bands: mono-ish/);
  assert.doesNotMatch(model.audioStatusText, /should-not-show\.wav/);
  assert.equal(shouldShowActiveQueueItem({ kind: "mic" }, { isLoaded: false }, { active: true }), false);
});

test("readSourceUiModel keeps stream mode honest about live-source affordances", () => {
  const model = readSourceUiModel({
    sourceState: {
      kind: "stream",
      status: "active",
      label: "Browser Tab",
      errorMessage: "",
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "should-not-show.wav",
      transportError: "",
    },
    queueLength: 4,
    currentIndex: 2,
    bandText: "stereo (L!=R)",
    recordingStatusText: "Recording available.",
  });

  assert.deepEqual(model.pressedSources, {
    file: false,
    mic: false,
    stream: true,
  });
  assert.equal(model.disableFileControls, true);
  assert.equal(model.audioPanelSourceMode, "stream");
  assert.match(model.audioStatusText, /Stream live: Browser Tab - Bands: stereo \(L!=R\)/);
  assert.doesNotMatch(model.audioStatusText, /should-not-show\.wav/);
  assert.equal(shouldShowActiveQueueItem({ kind: "stream" }, { isLoaded: false }, { active: true }), false);
});

test("readSourceUiModel treats File as the idle workflow side without implying an active file source", () => {
  const model = readSourceUiModel({
    sourceState: {
      kind: "none",
      status: "idle",
      label: "",
      errorMessage: "",
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "queued-track.wav",
      transportError: "",
    },
    queueLength: 2,
    currentIndex: 0,
  });

  assert.deepEqual(model.pressedSources, {
    file: true,
    mic: false,
    stream: false,
  });
  assert.equal(model.disableFileControls, false);
  assert.equal(model.audioPanelSourceMode, "file");
  assert.equal(model.showActiveQueueItem, false);
  assert.equal(model.audioStatusText, "File mode ready. Select a queued file or load audio files.");
  assert.equal(model.sourceSelectorCopy.fileText, "File workflow selected. Select a queued file or load audio files.");
  assert.equal(shouldShowActiveQueueItem({ kind: "none" }, { isLoaded: false }, { active: true }), false);
});

test("readSourceUiModel surfaces retained live-input errors after returning to file-workflow idle", () => {
  const model = readSourceUiModel({
    sourceState: {
      kind: "none",
      status: "idle",
      label: "",
      errorCode: "stream-ended",
      errorMessage: "Shared stream ended. Select Stream to share again.",
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
    queueLength: 1,
    currentIndex: 0,
  });

  assert.deepEqual(model.pressedSources, {
    file: true,
    mic: false,
    stream: false,
  });
  assert.equal(model.audioPanelSourceMode, "file");
  assert.equal(model.audioStatusText, "File mode ready. Shared stream ended. Select Stream to share again.");
});

test("URL preset serialization excludes runtime source and recording state", () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const previousSource = JSON.parse(JSON.stringify(state.source));
  const previousAudio = { ...state.audio };
  const previousRecording = JSON.parse(JSON.stringify(state.recording));
  const previousUi = snapshotUiState();

  if (typeof globalThis.btoa !== "function") {
    globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
  }
  if (typeof globalThis.atob !== "function") {
    globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
  }

  const locationStub = {
    pathname: "/",
    search: "",
    hash: "",
  };

  globalThis.location = locationStub;
  globalThis.history = {
    replaceState(_state, _title, url) {
      locationStub.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    },
  };

  state.source.kind = "none";
  state.source.status = "idle";
  state.source.label = "";
  state.source.errorCode = "stream-ended";
  state.source.errorMessage = "Shared stream ended. Select Stream to share again.";
  state.source.sessionActive = false;
  state.source.streamMeta.hasAudio = false;
  state.source.streamMeta.hasVideo = false;

  state.recording.phase = "finalizing";
  state.recording.supportProbeStatus = "supported";
  state.recording.isSupported = true;
  state.recording.includePlaybackAudio = true;
  state.recording.targetFps = 30;
  state.recording.selectedMimeType = "video/webm";
  state.recording.resolvedMimeType = "video/webm";
  state.recording.elapsedMs = 1200;
  state.recording.chunkCount = 3;
  state.recording.lastCode = "finalizing";
  state.recording.lastMessage = "Finalizing recording export...";
  state.ui.runtimeLog.entries = [
    {
      id: 99,
      level: "warn",
      category: "workspace",
      code: "preset-warning",
      message: "This should never serialize into presets.",
      timestampMs: 1234,
    },
  ];
  state.ui.runtimeLog.nextId = 100;
  state.ui.runtimeLog.hasUnread = true;

  try {
    UrlPreset.writeHashFromPrefs();
    const payload = decodePresetHash(locationStub.hash);
    assert.ok(payload && payload.prefs);
    assert.equal(Object.prototype.hasOwnProperty.call(payload.prefs, "source"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload.prefs, "recording"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload.prefs, "runtimeLog"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload.prefs, "ui"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload.prefs, "scene"), true);
    assert.ok(Array.isArray(payload.prefs.scene.nodes));
    assert.equal(Object.prototype.hasOwnProperty.call(payload.prefs.scene, "viewTransform"), false);
  } finally {
    applySourceAndAudioState({ source: previousSource, audio: previousAudio });
    Object.assign(state.recording, previousRecording);
    restoreUiState(previousUi);
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});

test("URL preset round-trips persisted config fields that were previously dropped on decode", () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const previousPrefs = structuredClone(preferences);

  if (typeof globalThis.btoa !== "function") {
    globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
  }
  if (typeof globalThis.atob !== "function") {
    globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
  }

  const locationStub = {
    pathname: "/",
    search: "",
    hash: "",
  };

  globalThis.location = locationStub;
  globalThis.history = {
    replaceState(_state, _title, url) {
      locationStub.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    },
  };

  try {
    preferences.trace.lineAlpha = 0.12;
    preferences.trace.lineWidthPx = 5;
    preferences.bands.count = 128;
    preferences.bands.floorHz = 40;
    preferences.bands.ceilingHz = 18000;
    preferences.bands.overlay.lineAlpha = 0.18;
    preferences.bands.overlay.lineWidthPx = 4;
    preferences.timing.maxDeltaTimeSec = 0.5;

    UrlPreset.writeHashFromPrefs();

    replacePreferences(structuredClone(CONFIG.defaults));
    resolveSettings();

    const result = UrlPreset.applyFromLocationHash();
    assert.equal(result.ok, true);
    assert.equal(result.code, "preset-applied");
    assert.equal(result.schema, PRESET_SCHEMA_VERSION);
    assert.equal(result.migratedFromSchema, null);
    assert.equal(preferences.trace.lineAlpha, 0.12);
    assert.equal(preferences.trace.lineWidthPx, 5);
    assert.equal(preferences.bands.count, 128);
    assert.equal(preferences.bands.floorHz, 40);
    assert.equal(preferences.bands.ceilingHz, 18000);
    assert.equal(preferences.bands.overlay.lineAlpha, 0.18);
    assert.equal(preferences.bands.overlay.lineWidthPx, 4);
    assert.equal(preferences.timing.maxDeltaTimeSec, 0.5);
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});

test("hash-driven preset apply reports through Workspace ownership lanes", async () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const previousPrefs = structuredClone(preferences);
  const locationStub = {
    pathname: "/",
    search: "",
    hash: "",
  };

  if (typeof globalThis.btoa !== "function") {
    globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
  }
  if (typeof globalThis.atob !== "function") {
    globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
  }

  globalThis.location = locationStub;
  globalThis.history = {
    replaceState(_state, _title, url) {
      locationStub.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    },
  };

  try {
    await withUiWireHarnessState({}, ({ harness }) => {
      const sceneStatusBefore = state.ui.sceneStatus.textContent;

      preferences.trace.lineAlpha = 0.12;
      UrlPreset.writeHashFromPrefs();
      assert.match(locationStub.hash, /^#p=/);

      replacePreferences(structuredClone(CONFIG.defaults));
      resolveSettings();

      harness.dispatchWindow("hashchange");

      assert.equal(preferences.trace.lineAlpha, 0.12);
      assert.equal(state.ui.workspaceStatus.textContent, "Updated: hash preset loaded");
      assert.equal(state.ui.sceneStatus.textContent, sceneStatusBefore);
      assert.equal(state.ui.runtimeLog.entries.length, 1);
      assert.equal(state.ui.runtimeLog.entries[0].category, "workspace");
      assert.equal(state.ui.runtimeLog.entries[0].code, "preset-applied");
      assert.match(state.ui.runtimeLog.entries[0].message, /Applied preset from URL hash/);
      assert.equal(state.ui.btnLauncherStatus.dataset.hasUnread, "true");
    });
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});

test("hash-driven preset migration appends a workspace migration notice", async () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousPrefs = structuredClone(preferences);
  const locationStub = {
    pathname: "/",
    search: "",
    hash: encodePresetHashPayload({
      schema: 7,
      prefs: {
        trace: {
          lineAlpha: 0.21,
        },
      },
    }),
  };

  globalThis.location = locationStub;
  globalThis.history = {
    replaceState() {},
  };

  try {
    await withUiWireHarnessState({}, ({ harness }) => {
      replacePreferences(structuredClone(CONFIG.defaults));
      resolveSettings();

      harness.dispatchWindow("hashchange");

      assert.equal(preferences.trace.lineAlpha, 0.21);
      assert.equal(state.ui.runtimeLog.entries.length, 1);
      assert.equal(state.ui.runtimeLog.entries[0].code, "preset-migrated");
      assert.match(state.ui.runtimeLog.entries[0].message, /schema v7/i);
    });
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
  }
});

test("legacy preset fixtures migrate forward into Schema 9 scene nodes", () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const previousPrefs = structuredClone(preferences);
  const locationStub = {
    pathname: "/",
    search: "",
    hash: "",
  };
  const cases = [
    {
      name: "schema 8 root orbs and overlay",
      schema: 8,
      prefs: {
        bands: {
          count: 96,
          floorHz: 30,
          ceilingHz: 16000,
          distributionMode: "mel",
        },
        orbs: [
          { id: "LEGACY_A", chanId: "L", bandIds: [1, 5], chirality: 1, startAngleRad: 0.75 },
        ],
        overlay: {
          enabled: true,
          alpha: 0.42,
          pointSizePx: 6,
        },
      },
      expectedNodeIds: ["orbs-1", "overlay-1"],
      expectedNodeTypes: ["orbs", "bandOverlay"],
      expectedNodeEnabled: [true, true],
    },
    {
      name: "schema 7 legacy flow",
      schema: 7,
      prefs: {
        bands: {
          count: 128,
          floorHz: 48,
          ceilingHz: 18000,
          logSpacing: true,
          overlay: {
            enabled: false,
            lineAlpha: 0.22,
          },
        },
        orbs: [
          { id: "LEGACY_B", chanId: "R", bandIds: [2], chirality: -1, startAngleRad: 1.25 },
        ],
      },
      expectedNodeIds: ["orbs-1", "overlay-1"],
      expectedNodeTypes: ["orbs", "bandOverlay"],
      expectedNodeEnabled: [true, false],
    },
    {
      name: "schema 8 with no visual roots synthesizes the canonical scene",
      schema: 8,
      prefs: {
        trace: {
          lineAlpha: 0.17,
        },
      },
      expectedNodeIds: ["orbs-1", "overlay-1"],
      expectedNodeTypes: ["orbs", "bandOverlay"],
      expectedNodeEnabled: [true, true],
    },
    {
      name: "schema 8 orbs only preserves overlay absence",
      schema: 8,
      prefs: {
        orbs: [
          { id: "LEGACY_ONLY_ORBS", chanId: "C", bandIds: [], chirality: -1, startAngleRad: 0.5 },
        ],
      },
      expectedNodeIds: ["orbs-1"],
      expectedNodeTypes: ["orbs"],
      expectedNodeEnabled: [true],
    },
    {
      name: "schema 8 overlay only preserves orb absence",
      schema: 8,
      prefs: {
        bands: {
          overlay: {
            enabled: true,
            ringSpeedRadPerSec: 0.75,
          },
        },
      },
      expectedNodeIds: ["overlay-1"],
      expectedNodeTypes: ["bandOverlay"],
      expectedNodeEnabled: [true],
    },
    {
      name: "schema 8 overlay without enabled defaults the migrated node on",
      schema: 8,
      prefs: {
        overlay: {
          alpha: 0.25,
          pointSizePx: 4,
        },
      },
      expectedNodeIds: ["overlay-1"],
      expectedNodeTypes: ["bandOverlay"],
      expectedNodeEnabled: [true],
    },
    {
      name: "missing schema follows the legacy schema 1 migration path",
      schema: undefined,
      expectedMigratedFromSchema: 1,
      prefs: {
        trace: {
          lineAlpha: 0.2,
        },
      },
      expectedNodeIds: ["orbs-1", "overlay-1"],
      expectedNodeTypes: ["orbs", "bandOverlay"],
      expectedNodeEnabled: [true, true],
    },
    {
      name: "explicit schema 1 follows the legacy migration path",
      schema: 1,
      prefs: {
        overlay: {
          enabled: false,
          alpha: 0.33,
        },
      },
      expectedNodeIds: ["overlay-1"],
      expectedNodeTypes: ["bandOverlay"],
      expectedNodeEnabled: [false],
    },
  ];

  globalThis.location = locationStub;
  globalThis.history = {
    replaceState(_state, _title, url) {
      locationStub.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    },
  };
  globalThis.btoa = (value) => Buffer.from(value, "utf8").toString("base64");
  globalThis.atob = (value) => Buffer.from(value, "base64").toString("utf8");

  try {
    for (const fixture of cases) {
      replacePreferences(structuredClone(CONFIG.defaults));
      resolveSettings();

      const result = UrlPreset.applyFromLocationHash(encodePresetHashPayload({
        schema: fixture.schema,
        prefs: fixture.prefs,
      }));
      assert.equal(result.ok, true, fixture.name);
      assert.equal(result.schema, PRESET_SCHEMA_VERSION, fixture.name);
      assert.equal(
        result.migratedFromSchema,
        Object.prototype.hasOwnProperty.call(fixture, "expectedMigratedFromSchema")
          ? fixture.expectedMigratedFromSchema
          : fixture.schema,
        fixture.name
      );

      UrlPreset.writeHashFromPrefs();
      const saved = decodePresetHash(locationStub.hash);
      assert.equal(saved.schema, PRESET_SCHEMA_VERSION, fixture.name);
      assert.deepEqual(saved.prefs.scene.nodes.map((node) => node.id), fixture.expectedNodeIds, fixture.name);
      assert.deepEqual(saved.prefs.scene.nodes.map((node) => node.type), fixture.expectedNodeTypes, fixture.name);
      assert.deepEqual(saved.prefs.scene.nodes.map((node) => node.enabled), fixture.expectedNodeEnabled, fixture.name);
      assert.deepEqual(
        saved.prefs.scene.nodes.map((node) => node.zIndex),
        saved.prefs.scene.nodes.map((_node, index) => index),
        fixture.name
      );
      assert.ok(saved.prefs.scene.nodes.every((node) => typeof node.id === "string" && !!node.id), fixture.name);
      assert.ok(saved.prefs.scene.nodes.every((node) => typeof node.type === "string" && !!node.type), fixture.name);
      assert.ok(saved.prefs.scene.nodes.every((node) => typeof node.enabled === "boolean"), fixture.name);
      assert.ok(
        saved.prefs.scene.nodes.every((node) => (
          Object.prototype.hasOwnProperty.call(node, "bounds")
          && JSON.stringify(node.bounds) === JSON.stringify({ x: 0.5, y: 0.5, w: 1, h: 1 })
        )),
        fixture.name
      );
      assert.ok(
        saved.prefs.scene.nodes.every((node) => (
          Object.prototype.hasOwnProperty.call(node, "anchor")
          && JSON.stringify(node.anchor) === JSON.stringify({ x: 0.5, y: 0.5 })
        )),
        fixture.name
      );
      assert.ok(
        saved.prefs.scene.nodes.every((node) => Object.prototype.hasOwnProperty.call(node, "settings")),
        fixture.name
      );
      assert.ok(
        saved.prefs.scene.nodes.every((node) => (
          node.type === "orbs"
            ? Array.isArray(node.settings)
            : !!(node.settings && typeof node.settings === "object")
        )),
        fixture.name
      );
      assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs, "orbs"), false, fixture.name);
      assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs, "overlay"), false, fixture.name);
      assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs.bands, "overlay"), false, fixture.name);
      assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs, "viewTransform"), false, fixture.name);
      assert.equal(Object.prototype.hasOwnProperty.call(saved.prefs.scene, "viewTransform"), false, fixture.name);
      if (fixture.prefs.bands && Number.isInteger(fixture.prefs.bands.count)) {
        assert.equal(saved.prefs.bands.count, fixture.prefs.bands.count, fixture.name);
      }
      if (fixture.prefs.bands && Number.isFinite(fixture.prefs.bands.floorHz)) {
        assert.equal(saved.prefs.bands.floorHz, fixture.prefs.bands.floorHz, fixture.name);
      }
      if (fixture.prefs.bands && Number.isFinite(fixture.prefs.bands.ceilingHz)) {
        assert.equal(saved.prefs.bands.ceilingHz, fixture.prefs.bands.ceilingHz, fixture.name);
      }
      if (fixture.prefs.bands && typeof fixture.prefs.bands.distributionMode === "string") {
        assert.equal(saved.prefs.bands.distributionMode, fixture.prefs.bands.distributionMode, fixture.name);
      }
      if (fixture.schema === 7) {
        assert.equal(saved.prefs.bands.distributionMode, "log", fixture.name);
      }
      if (fixture.name === "schema 8 overlay without enabled defaults the migrated node on") {
        assert.equal(saved.prefs.scene.nodes[0].enabled, true, fixture.name);
        assert.equal(saved.prefs.scene.nodes[0].settings.enabled, true, fixture.name);
      }
      if (fixture.name === "schema 7 legacy flow" || fixture.name === "explicit schema 1 follows the legacy migration path") {
        assert.equal(saved.prefs.scene.nodes.at(-1).enabled, false, fixture.name);
        assert.equal(saved.prefs.scene.nodes.at(-1).settings.enabled, false, fixture.name);
      }
    }

    locationStub.hash = "";
    replacePreferences(structuredClone(CONFIG.defaults));
    resolveSettings();

    const pluginResult = UrlPreset.applyFromLocationHash(encodePresetHashPayload({
      schema: PRESET_SCHEMA_VERSION,
      prefs: {
        scene: {
          nodes: [
            {
              id: "plugin-1",
              type: "spectralPlugin",
              enabled: true,
              zIndex: 0,
              bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
              anchor: { x: 0.5, y: 0.5 },
              settings: { arbitrary: true },
            },
            {
              id: "overlay-1",
              type: "bandOverlay",
              enabled: true,
              zIndex: 1,
              bounds: { x: 0.5, y: 0.5, w: 1, h: 1 },
              anchor: { x: 0.5, y: 0.5 },
              settings: { enabled: true, alpha: 0.61 },
            },
          ],
          viewTransform: {
            mode: "placeholder",
          },
        },
        bands: {
          count: 64,
          floorHz: 42,
          ceilingHz: 12000,
        },
      },
    }));
    assert.equal(pluginResult.ok, true);
    UrlPreset.writeHashFromPrefs();
    const pluginSaved = decodePresetHash(locationStub.hash);
    assert.deepEqual(pluginSaved.prefs.scene.nodes.map((node) => node.type), ["bandOverlay"]);
    assert.equal(pluginSaved.prefs.bands.count, 64);
    assert.equal(pluginSaved.prefs.bands.floorHz, 42);
    assert.equal(pluginSaved.prefs.bands.ceilingHz, 12000);
    assert.equal(Object.prototype.hasOwnProperty.call(pluginSaved.prefs.scene, "viewTransform"), false);
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});

test("invalid hash changes append a workspace warning without mutating prefs", async () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousPrefs = structuredClone(preferences);
  const locationStub = {
    pathname: "/",
    search: "",
    hash: "#p=not-valid",
  };

  globalThis.location = locationStub;
  globalThis.history = {
    replaceState() {},
  };

  try {
    await withUiWireHarnessState({}, ({ harness }) => {
      const lineAlphaBefore = preferences.trace.lineAlpha;

      harness.dispatchWindow("hashchange");

      assert.equal(preferences.trace.lineAlpha, lineAlphaBefore);
      assert.equal(state.ui.runtimeLog.entries.length, 1);
      assert.equal(state.ui.runtimeLog.entries[0].category, "workspace");
      assert.equal(state.ui.runtimeLog.entries[0].code, "invalid-hash");
      assert.match(state.ui.runtimeLog.entries[0].message, /No valid preset in URL hash/);
      assert.equal(state.ui.btnLauncherStatus.dataset.hasUnread, "true");
    });
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
  }
});

test("launcher shell state remains runtime-only and never alters preset hash", () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const previousUi = snapshotUiState();
  const locationStub = {
    pathname: "/",
    search: "",
    hash: "",
  };

  if (typeof globalThis.btoa !== "function") {
    globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
  }
  if (typeof globalThis.atob !== "function") {
    globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
  }

  globalThis.location = locationStub;
  globalThis.history = {
    replaceState(_state, _title, url) {
      locationStub.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    },
  };

  try {
    UrlPreset.writeHashFromPrefs();
    const beforeHash = locationStub.hash;

    state.ui.panelShell = createPanelShellState({
      activeLauncherId: "status",
      launcherCollapsed: true,
      openTargets: {
        audioSource: false,
        queue: false,
        analysis: false,
        banking: false,
        scene: true,
        recording: true,
        workspace: false,
        status: true,
      },
    });

    UrlPreset.writeHashFromPrefs();
    const afterHash = locationStub.hash;

    assert.equal(afterHash, beforeHash);
  } finally {
    restoreUiState(previousUi);
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});

test("launcher bar collapses and expands through the shell chevron", async () => {
  await withUiWireHarnessState({}, () => {
    assert.equal(UI.getPanelShellModel().launcherCollapsed, false);
    assert.equal(state.ui.launcherBar.dataset.collapsed, "false");
    assert.equal(state.ui.btnLauncherToggle.getAttribute("aria-expanded"), "true");

    state.ui.btnLauncherToggle.dispatch("click");

    assert.equal(UI.getPanelShellModel().launcherCollapsed, true);
    assert.equal(state.ui.launcherBar.dataset.collapsed, "true");
    assert.equal(state.ui.btnLauncherToggle.getAttribute("aria-expanded"), "false");

    state.ui.btnLauncherToggle.dispatch("click");

    assert.equal(UI.getPanelShellModel().launcherCollapsed, false);
    assert.equal(state.ui.launcherBar.dataset.collapsed, "false");
    assert.equal(state.ui.btnLauncherToggle.getAttribute("aria-expanded"), "true");
  });
});

test("launchers independently toggle the new Build 115 panel targets", async () => {
  await withUiWireHarnessState({}, () => {
    state.ui.btnLauncherAnalysis.dispatch("click");
    const analysisItem = UI.getPanelShellModel().launcherItems.find((item) => item.launcherId === "analysis");

    assert.equal(UI.getPanelShellModel().activeLauncherId, "analysis");
    assert.equal(UI.getPanelShellModel().openTargets.analysis, true);
    assert.equal(state.ui.btnLauncherAnalysis.dataset.active, "true");
    assert.equal(state.ui.btnLauncherAnalysis.dataset.presentedOpen, "true");
    assert.deepEqual(
      { targetOpen: analysisItem.targetOpen, presentedOpen: analysisItem.presentedOpen },
      { targetOpen: true, presentedOpen: true }
    );
    assert.equal(state.ui.analysisPanel.style.display, "block");

    state.ui.btnLauncherWorkspace.dispatch("click");

    assert.equal(UI.getPanelShellModel().activeLauncherId, "workspace");
    assert.equal(UI.getPanelShellModel().openTargets.workspace, true);
    assert.equal(state.ui.workspacePanel.style.display, "block");
    assert.equal(state.ui.btnLauncherScene.dataset.targetOpen, "true");
    assert.equal(state.ui.btnLauncherScene.dataset.presentedOpen, "false");
    assert.equal(state.ui.btnLauncherWorkspace.dataset.presentedOpen, "true");

    state.ui.btnLauncherScene.dispatch("click");

    assert.equal(UI.getPanelShellModel().activeLauncherId, "scene");
    assert.equal(UI.getPanelShellModel().openTargets.scene, true);
    assert.equal(state.ui.btnLauncherScene.dataset.presentedOpen, "true");
    assert.equal(state.ui.btnLauncherWorkspace.dataset.presentedOpen, "false");
    assert.equal(state.ui.scenePanel.style.display, "block");

    state.ui.btnLauncherScene.dispatch("click");

    assert.equal(UI.getPanelShellModel().openTargets.scene, false);
    assert.equal(state.ui.scenePanel.style.display, "none");

    state.ui.btnLauncherBanking.dispatch("click");
    assert.equal(UI.getPanelShellModel().activeLauncherId, "banking");
    assert.equal(UI.getPanelShellModel().openTargets.banking, true);
    assert.equal(state.ui.btnLauncherBanking.dataset.presentedOpen, "true");
    assert.equal(state.ui.bankingPanel.style.display, "block");

    state.ui.btnLauncherBanking.dispatch("click");
    assert.equal(UI.getPanelShellModel().openTargets.banking, false);
    assert.equal(state.ui.bankingPanel.style.display, "none");
  });
});

test("Scene panel renders the runtime node list and selected visualizer inspector", async () => {
  await withUiWireHarnessState({}, () => {
    const model = UI.getSceneUiModel();

    assert.equal(model.nodeCount, 2);
    assert.deepEqual(model.nodes.map((node) => node.id), ["orbs-1", "overlay-1"]);
    assert.equal(model.selectedNode.id, "orbs-1");
    assert.equal(state.ui.sceneNodeList.children.length, 2);
    assert.equal(state.ui.sceneInspectorPanel.hidden, false);
    assert.equal(state.ui.sceneInspectorEmpty.hidden, true);
    assert.match(state.ui.sceneSummaryPrimary.textContent, /2 visualizers/);
    assert.equal(state.ui.sceneInspectorTitle.textContent, "Orbs");
    assert.equal(state.ui.sceneInspectorType.textContent, "orbs");
  });
});

test("Scene panel exposes the runtime-only identity ViewTransform camera hook honestly", async () => {
  await withUiWireHarnessState({}, () => {
    const model = UI.getSceneUiModel();

    assert.deepEqual(model.viewTransform, IDENTITY_VIEW_TRANSFORM);
    assert.equal(model.camera.mode, "identity");
    assert.equal(model.camera.scope, "runtime-only");
    assert.equal(model.camera.controlsDeferred, true);
    assert.equal(state.scene.viewTransform.mode, "identity");
    assert.deepEqual(state.scene.viewTransform.matrix, [1, 0, 0, 1, 0, 0]);
    assert.equal(state.ui.sceneCameraPrimary.textContent, "Identity ViewTransform active");
    assert.equal(state.ui.sceneCameraMode.textContent, "Identity");
    assert.equal(state.ui.sceneCameraScope.textContent, "Runtime only");
    assert.match(state.ui.sceneCameraNote.textContent, /Build 116/);
  });
});

test("Scene panel persists node enabled state and ordering through explicit controls", async () => {
  await withUiWireHarnessState({}, () => {
    const orbsBefore = structuredClone(preferences.orbs);
    const overlayRow = readSceneRowAt(1);
    const overlayActions = readSceneRowActions(overlayRow);
    overlayActions.enabledInput.checked = false;
    overlayActions.enabledInput.dispatch("change");

    assert.equal(UI.getSceneUiModel().nodes[1].enabled, false);
    assert.equal(preferences.bands.overlay.enabled, false);
    assert.equal(preferences.scene.nodes[1].enabled, false);

    const orbsRow = readSceneRowAt(0);
    const orbsActions = readSceneRowActions(orbsRow);
    orbsActions.enabledInput.checked = false;
    orbsActions.enabledInput.dispatch("change");

    assert.equal(UI.getSceneUiModel().nodes.find((node) => node.id === "orbs-1").enabled, false);
    assert.deepEqual(preferences.orbs, orbsBefore);
    assert.equal(preferences.scene.nodes.find((node) => node.id === "orbs-1").enabled, false);

    const refreshedOverlayRow = readSceneRowAt(1);
    readSceneRowActions(refreshedOverlayRow).moveBackwardButton.dispatch("click");

    assert.deepEqual(UI.getSceneUiModel().nodes.map((node) => node.id), ["overlay-1", "orbs-1"]);
    assert.equal(UI.getSceneUiModel().nodes[0].zIndex, 0);
    assert.equal(UI.getSceneUiModel().nodes[1].zIndex, 1);
    assert.deepEqual(preferences.scene.nodes.map((node) => node.id), ["overlay-1", "orbs-1"]);
  });
});

test("Scene panel bandOverlay node toggle round-trips through Schema 9 scene nodes", async () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const locationStub = {
    pathname: "/",
    search: "",
    hash: "",
  };

  globalThis.location = locationStub;
  globalThis.history = { replaceState(_state, _title, url) { locationStub.hash = new URL(url, "https://example.test").hash; } };
  globalThis.btoa = (value) => Buffer.from(value, "utf8").toString("base64");
  globalThis.atob = (value) => Buffer.from(value, "base64").toString("utf8");

  try {
    await withUiWireHarnessState({}, () => {
      UrlPreset.writeHashFromPrefs();

      const overlayActions = readSceneRowActions(readSceneRowAt(1));
      overlayActions.enabledInput.checked = false;
      overlayActions.enabledInput.dispatch("change");

      UrlPreset.writeHashFromPrefs();
      const payload = decodePresetHash(locationStub.hash);
      const overlayNode = payload.prefs.scene.nodes.find((node) => node.id === "overlay-1");

      assert.equal(UI.getSceneUiModel().nodes[1].enabled, false);
      assert.equal(preferences.bands.overlay.enabled, false);
      assert.equal(overlayNode.enabled, false);
      assert.equal(overlayNode.settings.enabled, false);
      assert.equal(Object.prototype.hasOwnProperty.call(payload.prefs.bands, "overlay"), false);
    });
  } finally {
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});

test("Scene panel band overlay inspector updates live overlay settings", async () => {
  await withUiWireHarnessState({}, () => {
    readSceneRowActions(readSceneRowAt(1)).selectButton.dispatch("click");

    assert.equal(UI.getSceneUiModel().selectedNode.id, "overlay-1");

    const pointSizeRow = findSceneInspectorRow("Point Size Px");
    assert.ok(pointSizeRow);
    pointSizeRow.children[1].value = "7";
    pointSizeRow.children[1].dispatch("change");

    assert.equal(preferences.bands.overlay.pointSizePx, 7);
    assert.equal(UI.getSceneUiModel().selectedNode.settings.pointSizePx, 7);
    assert.equal(state.ui.sceneInspectorTitle.textContent, "Band Overlay");
  });
});

test("Scene panel orb inspector adds, edits, and removes current orb routing entries", async () => {
  await withUiWireHarnessState({}, () => {
    readSceneRowActions(readSceneRowAt(0)).selectButton.dispatch("click");

    const initialOrbCount = preferences.orbs.length;
    const orbActionRow = state.ui.sceneInspectorFields.children[1];
    const addOrbButton = orbActionRow.children[0];
    addOrbButton.dispatch("click");

    assert.equal(preferences.orbs.length, initialOrbCount + 1);

    const newCard = readSceneOrbCardAt(initialOrbCount);
    const idRow = findSceneOrbCardRow(newCard, "ID");
    const channelRow = findSceneOrbCardRow(newCard, "Channel");
    const bandIdsRow = findSceneOrbCardRow(newCard, "Band IDs");
    const chiralityRow = findSceneOrbCardRow(newCard, "Chirality");
    const angleRow = findSceneOrbCardRow(newCard, "Start Angle");
    const hueRow = findSceneOrbCardRow(newCard, "Hue Offset");
    const centerXRow = findSceneOrbCardRow(newCard, "Center X");
    const centerYRow = findSceneOrbCardRow(newCard, "Center Y");

    idRow.children[1].value = "ORB_SCENE";
    idRow.children[1].dispatch("change");
    channelRow.children[1].value = "L";
    channelRow.children[1].dispatch("change");
    bandIdsRow.children[1].value = "1, 3, 7";
    bandIdsRow.children[1].dispatch("change");
    chiralityRow.children[1].value = "1";
    chiralityRow.children[1].dispatch("change");
    angleRow.children[1].value = "1.5";
    angleRow.children[1].dispatch("change");
    hueRow.children[1].value = "120";
    hueRow.children[1].dispatch("change");
    centerXRow.children[1].value = "0.25";
    centerXRow.children[1].dispatch("change");
    centerYRow.children[1].value = "-0.5";
    centerYRow.children[1].dispatch("change");

    const latestOrb = preferences.orbs[preferences.orbs.length - 1];
    const latestSceneOrb = UI.getSceneUiModel().selectedNode.settings[preferences.orbs.length - 1];
    assert.equal(latestOrb.id, "ORB_SCENE");
    assert.equal(latestOrb.chanId, "L");
    assert.deepEqual(latestOrb.bandIds, [1, 3, 7]);
    assert.equal(latestOrb.chirality, 1);
    assert.equal(latestOrb.startAngleRad, 1.5);
    assert.equal(Object.prototype.hasOwnProperty.call(latestOrb, "hueOffsetDeg"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(latestOrb, "centerX"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(latestOrb, "centerY"), false);
    assert.equal(latestSceneOrb.hueOffsetDeg, 120);
    assert.equal(latestSceneOrb.centerX, 0.25);
    assert.equal(latestSceneOrb.centerY, -0.5);
    assert.equal(findSceneOrbCardRow(readSceneOrbCardAt(initialOrbCount), "Hue Offset").children[2].textContent, "120 deg");

    newCard.children[0].children[1].dispatch("click");
    assert.equal(preferences.orbs.length, initialOrbCount);
  });
});

test("Scene panel keeps scene-only orb fields across applyPrefs sync while legacy prefs stay clean", async () => {
  await withUiWireHarnessState({}, () => {
    readSceneRowActions(readSceneRowAt(0)).selectButton.dispatch("click");

    const firstCard = readSceneOrbCardAt(0);
    const hueRow = findSceneOrbCardRow(firstCard, "Hue Offset");
    const centerXRow = findSceneOrbCardRow(firstCard, "Center X");
    const centerYRow = findSceneOrbCardRow(firstCard, "Center Y");

    hueRow.children[1].value = "45";
    hueRow.children[1].dispatch("change");
    centerXRow.children[1].value = "0.2";
    centerXRow.children[1].dispatch("change");
    centerYRow.children[1].value = "-0.3";
    centerYRow.children[1].dispatch("change");

    UI.applyPrefs(null);

    const selectedOrb = UI.getSceneUiModel().selectedNode.settings[0];
    assert.equal(selectedOrb.hueOffsetDeg, 45);
    assert.equal(selectedOrb.centerX, 0.2);
    assert.equal(selectedOrb.centerY, -0.3);
    assert.equal(Object.prototype.hasOwnProperty.call(preferences.orbs[0], "hueOffsetDeg"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(preferences.orbs[0], "centerX"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(preferences.orbs[0], "centerY"), false);
  });
});

test("Schema 9 presets persist scene nodes while runtime-only scene state stays excluded", async () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const locationStub = {
    pathname: "/",
    search: "",
    hash: "",
  };

  globalThis.location = locationStub;
  globalThis.history = { replaceState(_state, _title, url) { locationStub.hash = new URL(url, "https://example.test").hash; } };
  globalThis.btoa = (value) => Buffer.from(value, "utf8").toString("base64");
  globalThis.atob = (value) => Buffer.from(value, "base64").toString("utf8");

  try {
    await withUiWireHarnessState({}, () => {
      assert.equal(PRESET_SCHEMA_VERSION, 9);

      UrlPreset.writeHashFromPrefs();
      const beforeHash = locationStub.hash;
      const beforePayload = decodePresetHash(beforeHash);

      const firstCard = readSceneOrbCardAt(0);
      const hueRow = findSceneOrbCardRow(firstCard, "Hue Offset");
      const centerXRow = findSceneOrbCardRow(firstCard, "Center X");
      const centerYRow = findSceneOrbCardRow(firstCard, "Center Y");

      hueRow.children[1].value = "90";
      hueRow.children[1].dispatch("change");
      centerXRow.children[1].value = "0.4";
      centerXRow.children[1].dispatch("change");
      centerYRow.children[1].value = "-0.4";
      centerYRow.children[1].dispatch("change");

      const orbsActions = readSceneRowActions(readSceneRowAt(0));
      orbsActions.enabledInput.checked = false;
      orbsActions.enabledInput.dispatch("change");
      readSceneRowActions(readSceneRowAt(1)).moveBackwardButton.dispatch("click");
      readSceneRowActions(readSceneRowAt(0)).selectButton.dispatch("click");

      UrlPreset.writeHashFromPrefs();
      const afterHash = locationStub.hash;
      const afterPayload = decodePresetHash(afterHash);
      const orbSchema = readSceneSettingsSchema("orbs");
      const savedSceneOrbNode = afterPayload.prefs.scene.nodes.find((node) => node.id === "orbs-1");

      assert.notEqual(afterHash, beforeHash);
      assert.equal(Object.prototype.hasOwnProperty.call(beforePayload.prefs, "scene"), true);
      assert.equal(Object.prototype.hasOwnProperty.call(afterPayload.prefs, "scene"), true);
      assert.deepEqual(
        Object.keys(orbSchema.item.fields).sort(),
        ["bandIds", "centerX", "centerY", "chanId", "chirality", "hueOffsetDeg", "id", "startAngleRad"]
      );
      assert.deepEqual(afterPayload.prefs.scene.nodes.map((node) => node.id), ["overlay-1", "orbs-1"]);
      assert.equal(savedSceneOrbNode.enabled, false);
      assert.equal(savedSceneOrbNode.settings[0].hueOffsetDeg, 90);
      assert.equal(savedSceneOrbNode.settings[0].centerX, 0.4);
      assert.equal(savedSceneOrbNode.settings[0].centerY, -0.4);
      assert.equal(Object.prototype.hasOwnProperty.call(afterPayload.prefs, "orbs"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(afterPayload.prefs.bands, "overlay"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(preferences.orbs[0], "hueOffsetDeg"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(preferences.orbs[0], "centerX"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(preferences.orbs[0], "centerY"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(orbSchema.item.fields, "camera"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(orbSchema.item.fields, "viewTransform"), false);
    });
  } finally {
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});

test("Scene ViewTransform stays runtime-only and never alters preset hash", async () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const locationStub = {
    pathname: "/",
    search: "",
    hash: "",
  };

  globalThis.location = locationStub;
  globalThis.history = { replaceState(_state, _title, url) { locationStub.hash = new URL(url, "https://example.test").hash; } };
  globalThis.btoa = (value) => Buffer.from(value, "utf8").toString("base64");
  globalThis.atob = (value) => Buffer.from(value, "base64").toString("utf8");

  try {
    await withUiWireHarnessState({}, () => {
      UrlPreset.writeHashFromPrefs();
      const beforeHash = locationStub.hash;
      const beforePayload = decodePresetHash(beforeHash);

      state.scene.viewTransform = normalizeViewTransform({
        mode: "placeholder",
        matrix: [1, 0, 0, 1, 32, -18],
      });

      UrlPreset.writeHashFromPrefs();
      const afterHash = locationStub.hash;
      const afterPayload = decodePresetHash(afterHash);

      assert.equal(afterHash, beforeHash);
      assert.equal(Object.prototype.hasOwnProperty.call(beforePayload.prefs, "scene"), true);
      assert.equal(Object.prototype.hasOwnProperty.call(afterPayload.prefs, "scene"), true);
      assert.equal(Object.prototype.hasOwnProperty.call(beforePayload.prefs.scene, "viewTransform"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(afterPayload.prefs.scene, "viewTransform"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(afterPayload.prefs, "viewTransform"), false);
    });
  } finally {
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});

test("status launcher opens the runtime log drawer and clears unread state", async () => {
  await withUiWireHarnessState({}, () => {
    state.source.kind = "mic";
    state.source.status = "active";
    state.source.label = "Desk Mic";
    state.source.sessionActive = true;
    UI.refreshAllUiText();

    assert.equal(state.ui.runtimeLog.entries.length, 1);
    assert.equal(state.ui.btnLauncherStatus.dataset.hasUnread, "true");

    state.ui.btnLauncherStatus.dispatch("click");

    assert.equal(UI.getPanelShellModel().openTargets.status, true);
    assert.equal(state.ui.statusPanel.style.display, "block");
    assert.equal(state.ui.btnLauncherStatus.dataset.hasUnread, "false");
    assert.equal(state.ui.statusLogList.children.length, 1);
    assert.equal(state.ui.statusLogEmpty.hidden, true);
    assert.match(state.ui.runtimeLog.entries[0].message, /Switched to microphone input/);
  });
});

test("status drawer stays read while open and clear resets the runtime log", async () => {
  await withUiWireHarnessState({}, () => {
    state.ui.btnLauncherStatus.dispatch("click");

    state.source.kind = "stream";
    state.source.status = "active";
    state.source.label = "Browser Tab";
    state.source.sessionActive = true;
    UI.refreshAllUiText();

    assert.equal(state.ui.btnLauncherStatus.dataset.hasUnread, "false");
    assert.equal(state.ui.statusLogList.children.length, 1);

    state.ui.btnClearStatusLog.dispatch("click");

    assert.equal(state.ui.runtimeLog.entries.length, 0);
    assert.equal(state.ui.statusLogList.children.length, 0);
    assert.equal(state.ui.statusLogEmpty.hidden, false);
    assert.equal(state.ui.btnClearStatusLog.disabled, true);
  });
});

test("UI logs external live-input end events into the runtime log", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "stream",
      status: "active",
      label: "Browser Tab",
      sessionActive: true,
      streamMeta: {
        hasAudio: true,
        hasVideo: true,
      },
    },
  }, () => {
    state.source.kind = "none";
    state.source.status = "idle";
    state.source.label = "";
    state.source.errorCode = "stream-ended";
    state.source.errorMessage = "Shared stream ended. Select Stream to share again.";
    state.source.sessionActive = false;
    UI.refreshAllUiText();

    assert.equal(state.ui.runtimeLog.entries.length, 1);
    assert.equal(state.ui.runtimeLog.entries[0].level, "warn");
    assert.equal(state.ui.runtimeLog.entries[0].code, "stream-ended");
    assert.match(state.ui.runtimeLog.entries[0].message, /Shared stream ended/);
  });
});

test("UI logs unsupported microphone outcomes into the runtime log", async () => {
  await withUiWireHarnessState({}, () => {
    state.source.kind = "mic";
    state.source.status = "unsupported";
    state.source.label = "";
    state.source.errorCode = "mic-unsupported";
    state.source.errorMessage = "Microphone capture is unavailable in this browser.";
    state.source.sessionActive = false;
    UI.refreshAllUiText();

    assert.equal(state.ui.runtimeLog.entries.length, 1);
    assert.equal(state.ui.runtimeLog.entries[0].level, "warn");
    assert.equal(state.ui.runtimeLog.entries[0].category, "source");
    assert.equal(state.ui.runtimeLog.entries[0].code, "mic-unsupported");
    assert.match(state.ui.runtimeLog.entries[0].message, /Microphone capture is unavailable/i);
    assert.equal(state.ui.btnLauncherStatus.dataset.hasUnread, "true");
  });
});

test("UI logs unsupported stream outcomes into the runtime log", async () => {
  await withUiWireHarnessState({}, () => {
    state.source.kind = "stream";
    state.source.status = "unsupported";
    state.source.label = "";
    state.source.errorCode = "stream-unsupported";
    state.source.errorMessage = "Stream capture is unavailable in this browser.";
    state.source.sessionActive = false;
    UI.refreshAllUiText();

    assert.equal(state.ui.runtimeLog.entries.length, 1);
    assert.equal(state.ui.runtimeLog.entries[0].level, "warn");
    assert.equal(state.ui.runtimeLog.entries[0].category, "source");
    assert.equal(state.ui.runtimeLog.entries[0].code, "stream-unsupported");
    assert.match(state.ui.runtimeLog.entries[0].message, /Stream capture is unavailable/i);
    assert.equal(state.ui.btnLauncherStatus.dataset.hasUnread, "true");
  });
});

test("UI logs recording lifecycle transitions and active recording warnings once", async () => {
  await withUiWireHarnessState({
    recordingState: {
      hooksEnabled: true,
      phase: "idle",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 40,
    },
  }, () => {
    state.recording.phase = "recording";
    state.recording.lastCode = "recorder-input-audio-video";
    state.recording.lastMessage = "Recording source audio + video.";
    state.recording.lastUpdatedAtMs = 41;
    UI.refreshRecordingUi();

    state.recording.lastCode = "audio-unloaded";
    state.recording.lastMessage = "Recording continues while no audio is currently loaded.";
    state.recording.lastUpdatedAtMs = 42;
    UI.refreshRecordingUi();
    UI.refreshRecordingUi();

    state.recording.phase = "finalizing";
    state.recording.lastCode = "finalizing";
    state.recording.lastMessage = "Finalizing recording export...";
    state.recording.lastUpdatedAtMs = 43;
    UI.refreshRecordingUi();

    state.recording.phase = "complete";
    state.recording.lastCode = "complete";
    state.recording.lastMessage = "Recording export ready.";
    state.recording.lastExportFileName = "auralprint-test.webm";
    state.recording.lastUpdatedAtMs = 44;
    UI.refreshRecordingUi();

    assert.deepEqual(
      state.ui.runtimeLog.entries.map((entry) => entry.code),
      ["complete", "finalizing", "audio-unloaded", "recorder-input-audio-video"]
    );
    assert.match(state.ui.runtimeLog.entries[0].message, /auralprint-test\.webm/);
  });
});

test("repeat control reports through Audio Source ownership after relocation", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "file",
      status: "active",
      label: "demo.wav",
      sessionActive: true,
    },
    audioState: {
      isLoaded: true,
      isPlaying: false,
      filename: "demo.wav",
      transportError: "",
    },
    queueNames: ["demo.wav", "bonus.wav"],
    currentIndex: 0,
    bandSnapshot: {
      ready: true,
      monoLike: false,
    },
    repeatMode: "none",
  }, () => {
    const sceneStatusBefore = state.ui.sceneStatus.textContent;
    const runtimeLogCountBefore = state.ui.runtimeLog.entries.length;

    state.ui.btnRepeat.dispatch("click");

    assert.equal(preferences.audio.repeatMode, "one");
    assert.equal(state.ui.audioStatus.textContent, "Updated: repeat");
    assert.equal(state.ui.sceneStatus.textContent, sceneStatusBefore);
    assert.equal(state.ui.runtimeLog.entries.length, runtimeLogCountBefore);
    assert.equal(state.ui.btnLauncherStatus.dataset.hasUnread, "false");
  });
});

test("Banking defaults to a dominant-band-first summary with inspector details collapsed", async () => {
  await withUiWireHarnessState({}, () => {
    primeRealBandAnalysis({ dominantIndex: 42 });
    state.ui.lastBandHudUpdateMs = -Infinity;

    UI.refreshAllUiText({
      ready: true,
      monoLike: false,
    });

    assert.equal(state.ui.btnToggleBandInspector.getAttribute("aria-expanded"), "false");
    assert.equal(state.ui.bandInspectorPanel.hidden, true);
    assert.equal(state.ui.bandTable.children.length, 0);
    assert.equal(state.bands.dominantIndex, 42);
    assert.equal(state.ui.bandDebug.textContent, `Dominant band [42] ${state.bands.dominantName}`);
    assert.equal(state.ui.bandDominantRange.textContent, BandBank.formatBandRangeText(42));
    assert.notEqual(state.ui.bandDominantEnergy.textContent, "0% energy");
    assert.equal(state.ui.bandMetaCount.textContent, `${preferences.bands.count}`);
    assert.equal(state.ui.bandMetaDistribution.textContent, preferences.bands.distributionMode);
  });
});

test("Banking summary keeps silent frames honest instead of inventing a dominant band", async () => {
  await withUiWireHarnessState({}, () => {
    primeRealBandAnalysis();
    state.ui.lastBandHudUpdateMs = -Infinity;

    UI.refreshAllUiText({
      ready: true,
      monoLike: false,
    });

    assert.equal(state.ui.bandDebug.textContent, "No dominant band yet");
    assert.equal(state.ui.bandDominantRange.textContent, "Awaiting analysis");
    assert.equal(state.ui.bandDominantEnergy.textContent, "0% energy");
  });
});

test("Banking inspector toggle reveals the full live band table on demand", async () => {
  await withUiWireHarnessState({}, () => {
    primeDominantBandState({ dominantIndex: 9, dominantName: "Inspector Test", energy: 0.33 });
    assert.equal(state.ui.bandInspectorPanel.hidden, true);
    assert.equal(state.ui.bandTable.children.length, 0);

    state.ui.btnToggleBandInspector.dispatch("click");

    assert.equal(state.ui.btnToggleBandInspector.getAttribute("aria-expanded"), "true");
    assert.equal(state.ui.bandInspectorPanel.hidden, false);
    assert.equal(state.ui.bandTable.children.length, preferences.bands.count * 4);

    state.ui.btnToggleBandInspector.dispatch("click");

    assert.equal(state.ui.btnToggleBandInspector.getAttribute("aria-expanded"), "false");
    assert.equal(state.ui.bandInspectorPanel.hidden, true);
  });
});

test("line color mode reports through Banking ownership after relocation", async () => {
  await withUiWireHarnessState({}, () => {
    const sceneStatusBefore = state.ui.sceneStatus.textContent;
    const runtimeLogCountBefore = state.ui.runtimeLog.entries.length;

    state.ui.selLineColorMode.value = "fixed";
    state.ui.selLineColorMode.dispatch("change");

    assert.equal(preferences.trace.lineColorMode, "fixed");
    assert.equal(state.ui.bankingStatus.textContent, "Updated: line color mode");
    assert.equal(state.ui.sceneStatus.textContent, sceneStatusBefore);
    assert.equal(state.ui.runtimeLog.entries.length, runtimeLogCountBefore);
  });
});

test("band inspector disclosure remains runtime-only and never alters preset hash", async () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const locationStub = {
    pathname: "/",
    search: "",
    hash: "",
  };

  if (typeof globalThis.btoa !== "function") {
    globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
  }
  if (typeof globalThis.atob !== "function") {
    globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
  }

  globalThis.location = locationStub;
  globalThis.history = {
    replaceState(_state, _title, url) {
      locationStub.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    },
  };

  try {
    await withUiWireHarnessState({}, () => {
      UrlPreset.writeHashFromPrefs();
      const beforeHash = locationStub.hash;

      state.ui.btnToggleBandInspector.dispatch("click");

      UrlPreset.writeHashFromPrefs();
      const afterHash = locationStub.hash;

      assert.equal(state.ui.btnToggleBandInspector.getAttribute("aria-expanded"), "true");
      assert.equal(afterHash, beforeHash);
    });
  } finally {
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});

test("recording cue stays visible on the launcher bar and collapsed chevron while recording", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "file",
      status: "active",
      label: "demo.wav",
      sessionActive: true,
    },
    audioState: {
      isLoaded: true,
      isPlaying: true,
      filename: "demo.wav",
      transportError: "",
    },
    recordingState: {
      hooksEnabled: true,
      phase: "recording",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 32,
    },
  }, () => {
    UI.refreshRecordingUi();

    assert.equal(state.ui.btnLauncherRecording.classList.contains("is-recording"), true);
    assert.equal(state.ui.btnLauncherToggle.classList.contains("is-recording-cue"), false);

    state.ui.btnLauncherToggle.dispatch("click");

    assert.equal(UI.getPanelShellModel().launcherCollapsed, true);
    assert.equal(state.ui.btnLauncherToggle.classList.contains("is-recording-cue"), true);
  });
});

test("UI clears retained live-input errors on explicit file-workflow reset", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "none",
      status: "idle",
      label: "",
      errorCode: "mic-ended",
      errorMessage: "Microphone input ended. Select Mic to reconnect.",
      sessionActive: false,
      streamMeta: { hasAudio: false, hasVideo: false },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
    queueNames: ["archive.wav"],
    currentIndex: -1,
  }, async () => {
    UI.refreshAllUiText();
    assert.equal(state.ui.audioStatus.textContent, "File mode ready. Microphone input ended. Select Mic to reconnect.");

    assert.equal(await UI.dispatchSourceSwitchAction("file"), true);
    UI.refreshAllUiText();

    assert.equal(state.source.errorCode, "");
    assert.equal(state.source.errorMessage, "");
    assert.equal(state.ui.audioStatus.textContent, "File mode ready. Select a queued file or load audio files.");
  });
});

test("UI clears retained live-input errors when Clear Queue resets file workflow to empty", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "none",
      status: "idle",
      label: "",
      errorCode: "stream-ended",
      errorMessage: "Shared stream ended. Select Stream to share again.",
      sessionActive: false,
      streamMeta: { hasAudio: false, hasVideo: false },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
    queueNames: ["archive.wav"],
    currentIndex: -1,
  }, async () => {
    UI.refreshAllUiText();
    assert.equal(state.ui.audioStatus.textContent, "File mode ready. Shared stream ended. Select Stream to share again.");

    state.ui.btnClearQueue.dispatch("click");
    UI.refreshAllUiText();

    assert.equal(Queue.length, 0);
    assert.equal(state.source.errorCode, "");
    assert.equal(state.source.errorMessage, "");
    assert.equal(state.ui.audioStatus.textContent, "File mode ready. Load audio files to begin analysis.");
  });
});

test("UI clears retained live-input errors when removing the last queued file resets file workflow to empty", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "none",
      status: "idle",
      label: "",
      errorCode: "mic-ended",
      errorMessage: "Microphone input ended. Select Mic to reconnect.",
      sessionActive: false,
      streamMeta: { hasAudio: false, hasVideo: false },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "",
      transportError: "",
    },
    queueNames: ["archive.wav"],
    currentIndex: -1,
    queueVisible: false,
  }, async ({ getElement }) => {
    UI.refreshAllUiText();
    assert.equal(state.ui.audioStatus.textContent, "File mode ready. Microphone input ended. Select Mic to reconnect.");

    state.ui.btnToggleQueue.dispatch("click");
    const lastRow = getElement("queueList").children[0];
    const removeBtn = lastRow.children[2];
    removeBtn.dispatch("click");
    UI.refreshAllUiText();

    assert.equal(Queue.length, 0);
    assert.equal(state.source.errorCode, "");
    assert.equal(state.source.errorMessage, "");
    assert.equal(state.ui.audioStatus.textContent, "File mode ready. Load audio files to begin analysis.");
  });
});

test("UI refreshAllUiText keeps file-mode status and selector copy honest in idle and loaded states", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "none",
      status: "idle",
      label: "",
      support: {
        mic: true,
        stream: true,
      },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "queued-track.wav",
      transportError: "",
    },
  }, () => {
    assert.equal(state.ui.audioStatus.textContent, "File mode ready. Load audio files to begin analysis.");
    assert.equal(state.ui.btnSourceFile.title, "File workflow selected. Load audio files to begin.");
    assert.equal(state.ui.btnLoad.title, "Load audio files into the queue");
    assert.equal(state.ui.btnPlay.title, "Play current file");
    assert.equal(state.ui.btnPrev.title, "Previous track unavailable");
    assert.equal(state.ui.btnNext.title, "Next track unavailable");
    assert.equal(state.ui.btnRepeat.title, "Repeat queue: Off");
    assert.equal(state.ui.btnToggleQueue.title, "Show file queue");
    assert.equal(state.ui.btnClearQueue.title, "Clear file queue");
  });

  await withUiWireHarnessState({
    sourceState: {
      kind: "file",
      status: "active",
      label: "demo.wav",
      sessionActive: true,
      support: {
        mic: true,
        stream: true,
      },
    },
    audioState: {
      isLoaded: true,
      isPlaying: false,
      filename: "demo.wav",
      transportError: "",
    },
    queueNames: ["demo.wav", "bonus.wav"],
    currentIndex: 0,
    bandSnapshot: {
      ready: true,
      monoLike: false,
    },
    repeatMode: "all",
  }, () => {
    assert.equal(state.ui.audioStatus.textContent, "File [1/2]: demo.wav - Paused - Bands: stereo (L\u2260R)");
    assert.equal(state.ui.btnSourceFile.title, "File workflow selected. Current file: demo.wav.");
    assert.equal(state.ui.btnPlay.title, "Play current file");
    assert.equal(state.ui.btnPrev.title, "Previous track (P)");
    assert.equal(state.ui.btnNext.title, "Next track (N)");
    assert.equal(state.ui.btnRepeat.title, "Repeat queue: All");
  });
});

test("UI source selector copy reflects support, requesting, active, and error truth", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "none",
      status: "idle",
      support: {
        mic: false,
        stream: false,
      },
    },
  }, () => {
    assert.equal(state.ui.btnSourceMic.disabled, true);
    assert.equal(state.ui.btnSourceMic.title, "Microphone capture is unavailable in this browser.");
    assert.equal(state.ui.btnSourceMic.getAttribute("aria-label"), "Microphone capture is unavailable in this browser.");
    assert.equal(state.ui.btnSourceStream.disabled, true);
    assert.equal(state.ui.btnSourceStream.title, "Stream capture is unavailable in this browser.");
    assert.equal(state.ui.btnSourceFile.title, "File workflow selected. Load audio files to begin.");
  });

  await withUiWireHarnessState({
    sourceState: {
      kind: "mic",
      status: "requesting",
      label: "Microphone",
      support: {
        mic: true,
        stream: true,
      },
      permission: {
        mic: "prompt",
        stream: "unknown",
      },
    },
  }, () => {
    assert.equal(state.ui.btnSourceMic.disabled, false);
    assert.equal(state.ui.btnSourceMic.title, "Microphone workflow selected. Waiting for microphone permission.");
    assert.equal(state.ui.btnSourceMic.getAttribute("aria-label"), "Microphone workflow selected. Waiting for microphone permission.");
  });

  await withUiWireHarnessState({
    sourceState: {
      kind: "stream",
      status: "active",
      label: "Browser Tab",
      sessionActive: true,
      support: {
        mic: true,
        stream: true,
      },
      permission: {
        mic: "unknown",
        stream: "granted",
      },
      streamMeta: {
        hasAudio: true,
        hasVideo: true,
      },
    },
  }, () => {
    assert.equal(state.ui.btnSourceStream.disabled, false);
    assert.equal(state.ui.btnSourceStream.title, "Shared stream workflow selected. Live input active.");
    assert.equal(state.ui.btnSourceStream.getAttribute("aria-label"), "Shared stream workflow selected. Live input active.");
    assert.equal(state.ui.btnSourceFile.title, "Switch to file playback workflow.");
    assert.equal(state.ui.btnSourceFile.getAttribute("aria-label"), "Switch to file playback workflow.");
  });

  await withUiWireHarnessState({
    sourceState: {
      kind: "mic",
      status: "error",
      label: "Microphone",
      errorMessage: "Microphone permission denied.",
      support: {
        mic: true,
        stream: true,
      },
      permission: {
        mic: "denied",
        stream: "unknown",
      },
    },
  }, () => {
    assert.equal(state.ui.btnSourceMic.title, "Microphone workflow selected. Microphone permission denied.");
  });
});

test("UI disables file-only controls with clear file-mode-only affordances in live workflows", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "mic",
      status: "active",
      label: "Podcast Mic",
      sessionActive: true,
      support: {
        mic: true,
        stream: true,
      },
      permission: {
        mic: "granted",
        stream: "unknown",
      },
      streamMeta: {
        hasAudio: true,
        hasVideo: false,
      },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "stale.wav",
      transportError: "",
    },
    bandSnapshot: {
      ready: true,
      monoLike: true,
    },
  }, () => {
    assert.match(state.ui.audioStatus.textContent, /Microphone live: Podcast Mic - Bands: mono-ish/);
    assert.doesNotMatch(state.ui.audioStatus.textContent, /stale\.wav/);
    assert.equal(state.ui.btnSourceFile.title, "Switch to file playback workflow.");
    assert.equal(state.ui.btnSourceFile.getAttribute("aria-label"), "Switch to file playback workflow.");
    assert.equal(state.ui.btnLoad.disabled, true);
    assert.equal(state.ui.btnLoad.title, "Load is available in File mode only.");
    assert.equal(state.ui.btnPlay.disabled, true);
    assert.equal(state.ui.btnPlay.title, "Play/Pause is available in File mode only.");
    assert.equal(state.ui.btnStop.title, "Stop is available in File mode only.");
    assert.equal(state.ui.btnPrev.title, "Previous track is available in File mode only.");
    assert.equal(state.ui.btnNext.title, "Next track is available in File mode only.");
    assert.equal(state.ui.btnRepeat.title, "Repeat is available in File mode only.");
    assert.equal(state.ui.btnShuffle.title, "Shuffle is available in File mode only.");
    assert.equal(state.ui.btnToggleQueue.title, "Queue is available in File mode only.");
    assert.equal(state.ui.btnClearQueue.title, "Clear queue is available in File mode only.");
  });

  await withUiWireHarnessState({
    sourceState: {
      kind: "stream",
      status: "active",
      label: "Browser Tab",
      sessionActive: true,
      support: {
        mic: true,
        stream: true,
      },
      permission: {
        mic: "unknown",
        stream: "granted",
      },
      streamMeta: {
        hasAudio: true,
        hasVideo: true,
      },
    },
    audioState: {
      isLoaded: false,
      isPlaying: false,
      filename: "stale.wav",
      transportError: "",
    },
    bandSnapshot: {
      ready: true,
      monoLike: false,
    },
  }, () => {
    assert.equal(state.ui.audioStatus.textContent, "Stream live: Browser Tab - Bands: stereo (L\u2260R)");
    assert.doesNotMatch(state.ui.audioStatus.textContent, /stale\.wav/);
  });
});

test("first-run load hint hides when a file source becomes active", () => {
  const hintState = renderLoadHintState({
    sourceState: {
      kind: "file",
      status: "active",
      label: "demo.wav",
      sessionActive: true,
    },
    audioState: {
      isLoaded: true,
      isPlaying: false,
      filename: "demo.wav",
      transportError: "",
    },
  });

  assert.equal(hintState.hidden, true);
  assert.equal(hintState.ariaHidden, "true");
});

test("first-run load hint hides when microphone input becomes active", () => {
  const hintState = renderLoadHintState({
    sourceState: {
      kind: "mic",
      status: "active",
      label: "Podcast Mic",
      sessionActive: true,
      support: {
        mic: true,
        stream: false,
      },
      permission: {
        mic: "granted",
        stream: "unknown",
      },
      streamMeta: {
        hasAudio: true,
        hasVideo: false,
      },
    },
  });

  assert.equal(hintState.hidden, true);
  assert.equal(hintState.ariaHidden, "true");
});

test("first-run load hint hides when stream input becomes active", () => {
  const hintState = renderLoadHintState({
    sourceState: {
      kind: "stream",
      status: "active",
      label: "Browser Tab",
      sessionActive: true,
      support: {
        mic: true,
        stream: true,
      },
      permission: {
        mic: "unknown",
        stream: "granted",
      },
      streamMeta: {
        hasAudio: true,
        hasVideo: true,
      },
    },
  });

  assert.equal(hintState.hidden, true);
  assert.equal(hintState.ariaHidden, "true");
});

test("first-run load hint stays visible while microphone permission is still being requested", () => {
  const hintState = renderLoadHintState({
    sourceState: {
      kind: "mic",
      status: "requesting",
      label: "Microphone",
      sessionActive: false,
      support: {
        mic: true,
        stream: false,
      },
      permission: {
        mic: "prompt",
        stream: "unknown",
      },
    },
  });

  assert.equal(hintState.hidden, false);
  assert.equal(hintState.ariaHidden, null);
});

test("first-run load hint stays visible while stream permission is still being requested", () => {
  const hintState = renderLoadHintState({
    sourceState: {
      kind: "stream",
      status: "requesting",
      label: "Shared stream",
      sessionActive: false,
      support: {
        mic: true,
        stream: true,
      },
      permission: {
        mic: "unknown",
        stream: "prompt",
      },
    },
  });

  assert.equal(hintState.hidden, false);
  assert.equal(hintState.ariaHidden, null);
});

test("first-run load hint stays visible after denied live-source activation errors", () => {
  const micHintState = renderLoadHintState({
    sourceState: {
      kind: "mic",
      status: "error",
      label: "Microphone",
      sessionActive: false,
      errorCode: "mic-denied",
      errorMessage: "Microphone permission denied.",
      support: {
        mic: true,
        stream: true,
      },
      permission: {
        mic: "denied",
        stream: "unknown",
      },
    },
  });
  const streamHintState = renderLoadHintState({
    sourceState: {
      kind: "stream",
      status: "error",
      label: "Shared stream",
      sessionActive: false,
      errorCode: "stream-denied-or-cancelled",
      errorMessage: "Stream share was cancelled or denied.",
      support: {
        mic: true,
        stream: true,
      },
      permission: {
        mic: "unknown",
        stream: "unknown",
      },
    },
  });

  assert.equal(micHintState.hidden, false);
  assert.equal(micHintState.ariaHidden, null);
  assert.equal(streamHintState.hidden, false);
  assert.equal(streamHintState.ariaHidden, null);
});

test("first-run load hint stays hidden after a successful live session returns to idle file workflow", () => {
  const harness = createUiWireHarness();
  const previous = {
    source: JSON.parse(JSON.stringify(state.source)),
    audio: { ...state.audio },
    recording: JSON.parse(JSON.stringify(state.recording)),
  };

  try {
    state.source.kind = "stream";
    state.source.status = "active";
    state.source.label = "Browser Tab";
    state.source.sessionActive = true;
    state.source.support.mic = true;
    state.source.support.stream = true;
    state.source.permission.stream = "granted";
    state.source.streamMeta.hasAudio = true;
    state.source.streamMeta.hasVideo = true;
    state.audio.isLoaded = false;
    state.audio.isPlaying = false;
    state.audio.filename = "";
    state.audio.transportError = "";

    UI.wireControls();
    UI.refreshAllUiText();

    assert.equal(state.ui.loadHint.classList.contains("hidden"), true);
    assert.equal(state.ui.loadHint.getAttribute("aria-hidden"), "true");

    state.source.kind = "none";
    state.source.status = "idle";
    state.source.label = "";
    state.source.sessionActive = false;
    state.source.errorCode = "";
    state.source.errorMessage = "";
    state.source.streamMeta.hasAudio = false;
    state.source.streamMeta.hasVideo = false;

    UI.refreshAllUiText();

    assert.equal(state.ui.loadHint.classList.contains("hidden"), true);
    assert.equal(state.ui.loadHint.getAttribute("aria-hidden"), "true");
  } finally {
    applySourceAndAudioState(previous);
    Object.assign(state.recording, previous.recording);
    harness.restore();
  }
});

test("UI keeps queue panel recoverable across live source switches and audio panel hiding", async () => {
  const originalActivateMic = InputSourceManager.activateMic;
  const originalTeardownActiveSource = InputSourceManager.teardownActiveSource;
  const originalOnTransportMutation = RecorderEngine.onTransportMutation;
  const originalGetSupportStatus = RecorderEngine.getSupportStatus;

  InputSourceManager.activateMic = async () => {
    state.source.kind = "mic";
    state.source.status = "active";
    state.source.label = "Podcast Mic";
    state.source.sessionActive = true;
    state.source.support.mic = true;
    state.source.support.stream = true;
    state.source.permission.mic = "granted";
    state.source.streamMeta.hasAudio = true;
    state.source.streamMeta.hasVideo = false;
    return { ok: true };
  };
  InputSourceManager.teardownActiveSource = async () => {
    state.source.kind = "none";
    state.source.status = "idle";
    state.source.label = "";
    state.source.sessionActive = false;
    state.source.errorCode = "";
    state.source.errorMessage = "";
    state.source.streamMeta.hasAudio = false;
    state.source.streamMeta.hasVideo = false;
    return true;
  };
  RecorderEngine.onTransportMutation = () => ({ ok: true });
  RecorderEngine.getSupportStatus = () => ({ ok: true });

  try {
    await withUiWireHarnessState({
      sourceState: {
        kind: "file",
        status: "active",
        label: "demo.wav",
        sessionActive: true,
        support: {
          mic: true,
          stream: true,
        },
      },
      audioState: {
        isLoaded: true,
        isPlaying: false,
        filename: "demo.wav",
        transportError: "",
      },
      queueNames: ["demo.wav", "bonus.wav"],
      currentIndex: 0,
      queueVisible: true,
    }, async () => {
      assert.equal(UI.getPanelShellModel().openTargets.queue, true);
      assert.equal(state.ui.queuePanel.style.display, "block");

      await UI.dispatchSourceSwitchAction("mic");
      assert.equal(UI.getPanelShellModel().openTargets.queue, false);
      assert.equal(state.ui.queuePanel.style.display, "none");

      await UI.dispatchSourceSwitchAction("file");
      UI.refreshAllUiText();
      assert.equal(UI.getPanelShellModel().openTargets.queue, false);
      assert.equal(state.ui.queuePanel.style.display, "none");
      assert.equal(state.ui.audioStatus.textContent, "File mode ready. Select a queued file or load audio files.");
      assert.equal(state.ui.btnSourceFile.title, "File workflow selected. Select a queued file or load audio files.");

      state.ui.btnToggleQueue.dispatch("click");
      assert.equal(UI.getPanelShellModel().openTargets.queue, true);
      state.ui.btnHideAudio.click();
      assert.equal(UI.getPanelShellModel().openTargets.audioSource, false);
      assert.equal(UI.getPanelShellModel().openTargets.queue, false);
      assert.equal(state.ui.queuePanel.style.display, "none");
    });
  } finally {
    InputSourceManager.activateMic = originalActivateMic;
    InputSourceManager.teardownActiveSource = originalTeardownActiveSource;
    RecorderEngine.onTransportMutation = originalOnTransportMutation;
    RecorderEngine.getSupportStatus = originalGetSupportStatus;
  }
});

test("UI finalizing locks destructive file transport actions while leaving non-destructive file controls available", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "file",
      status: "active",
      label: "demo.wav",
      sessionActive: true,
    },
    audioState: {
      isLoaded: true,
      isPlaying: false,
      filename: "demo.wav",
      transportError: "",
    },
    recordingState: {
      hooksEnabled: true,
      phase: "finalizing",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 9,
    },
    queueNames: ["alpha.wav", "beta.wav", "gamma.wav"],
    currentIndex: 1,
    queueVisible: false,
  }, async ({ getElement }) => {
    state.ui.btnToggleQueue.dispatch("click");
    const queueRows = getElement("queueList").children;
    const activeRow = queueRows[1];
    const removeBtn = activeRow.children[2];

    assert.equal(state.ui.btnLoad.disabled, true);
    assert.equal(state.ui.btnPrev.disabled, true);
    assert.equal(state.ui.btnNext.disabled, true);
    assert.equal(state.ui.btnClearQueue.disabled, true);
    assert.match(state.ui.btnLoad.title, /Load is unavailable while recording finalizes/);
    assert.match(state.ui.btnPrev.title, /Track changes are unavailable while recording finalizes/);
    assert.match(state.ui.btnClearQueue.title, /Track changes are unavailable while recording finalizes/);

    assert.equal(state.ui.btnPlay.disabled, false);
    assert.equal(state.ui.btnStop.disabled, false);
    assert.equal(state.ui.btnRepeat.disabled, false);
    assert.equal(state.ui.btnShuffle.disabled, false);
    assert.equal(state.ui.btnToggleQueue.disabled, false);

    assert.equal(activeRow.getAttribute("aria-disabled"), "true");
    assert.match(activeRow.title, /Track changes are unavailable while recording finalizes/);
    assert.equal(removeBtn.disabled, true);
    assert.match(removeBtn.title, /Track changes are unavailable while recording finalizes/);
  });
});

test("UI refreshes an already-open queue when recording enters finalizing", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "file",
      status: "active",
      label: "beta.wav",
      sessionActive: true,
    },
    audioState: {
      isLoaded: true,
      isPlaying: false,
      filename: "beta.wav",
      transportError: "",
    },
    recordingState: {
      hooksEnabled: true,
      phase: "idle",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 20,
    },
    queueNames: ["alpha.wav", "beta.wav", "gamma.wav"],
    currentIndex: 1,
    queueVisible: false,
  }, async ({ getElement }) => {
    const initialQueueNames = Queue.snapshot().items.map((item) => item.name);

    state.ui.btnToggleQueue.dispatch("click");
    state.recording.phase = "finalizing";
    state.recording.lastUpdatedAtMs = 21;
    UI.refreshAllUiText();

    const firstRow = getElement("queueList").children[0];
    const firstRemoveBtn = firstRow.children[2];

    assert.equal(firstRow.getAttribute("aria-disabled"), "true");
    assert.equal(firstRemoveBtn.disabled, true);

    firstRow.dispatch("click");
    firstRemoveBtn.dispatch("click");
    await Promise.resolve();

    assert.equal(Queue.currentIndex, 1);
    assert.deepEqual(Queue.snapshot().items.map((item) => item.name), initialQueueNames);
    assert.equal(state.audio.filename, "beta.wav");
  });
});

test("UI re-enables an already-open queue when recording leaves finalizing", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "file",
      status: "active",
      label: "beta.wav",
      sessionActive: true,
    },
    audioState: {
      isLoaded: true,
      isPlaying: false,
      filename: "beta.wav",
      transportError: "",
    },
    recordingState: {
      hooksEnabled: true,
      phase: "finalizing",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 22,
    },
    queueNames: ["alpha.wav", "beta.wav", "gamma.wav"],
    currentIndex: 1,
    queueVisible: false,
  }, async ({ getElement }) => {
    state.ui.btnToggleQueue.dispatch("click");
    state.recording.phase = "idle";
    state.recording.lastUpdatedAtMs = 23;
    UI.refreshAllUiText();

    const firstRow = getElement("queueList").children[0];
    const firstRemoveBtn = firstRow.children[2];

    assert.equal(firstRow.getAttribute("aria-disabled"), "false");
    assert.equal(firstRemoveBtn.disabled, false);

    firstRemoveBtn.dispatch("click");
    await Promise.resolve();

    assert.deepEqual(Queue.snapshot().items.map((item) => item.name), ["beta.wav", "gamma.wav"]);
    assert.equal(Queue.length, 2);
  });
});

test("UI finalizing blocks destructive file transport interactions and keeps file workflow state stable", async () => {
  await withUiWireHarnessState({
    sourceState: {
      kind: "file",
      status: "active",
      label: "beta.wav",
      sessionActive: true,
    },
    audioState: {
      isLoaded: true,
      isPlaying: false,
      filename: "beta.wav",
      transportError: "",
    },
    recordingState: {
      hooksEnabled: true,
      phase: "finalizing",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 10,
    },
    queueNames: ["alpha.wav", "beta.wav", "gamma.wav"],
    currentIndex: 1,
    queueVisible: false,
  }, async ({ harness, getElement }) => {
    let fileInputClicks = 0;
    state.ui.fileInput.click = () => {
      fileInputClicks += 1;
    };

    state.ui.btnToggleQueue.dispatch("click");
    const queueList = getElement("queueList");
    const queueRows = queueList.children;
    const firstRow = queueRows[0];
    const firstRemoveBtn = firstRow.children[2];
    const initialQueueNames = Queue.snapshot().items.map((item) => item.name);

    state.ui.btnLoad.dispatch("click");
    state.ui.fileInput.files = [createNamedAudioFile("new-track.wav")];
    state.ui.fileInput.dispatch("change");
    state.ui.btnPrev.dispatch("click");
    state.ui.btnNext.dispatch("click");
    state.ui.btnClearQueue.dispatch("click");
    firstRow.dispatch("click");
    firstRemoveBtn.dispatch("click");
    state.canvas.dispatch("drop", {
      dataTransfer: {
        files: [createNamedAudioFile("drop-track.wav")],
      },
    });
    harness.dispatchWindow("keydown", { code: "KeyN" });
    harness.dispatchWindow("keydown", { code: "KeyP" });

    await Promise.resolve();
    UI.refreshAllUiText();

    assert.equal(fileInputClicks, 0);
    assert.equal(Queue.currentIndex, 1);
    assert.deepEqual(Queue.snapshot().items.map((item) => item.name), initialQueueNames);
    assert.equal(state.audio.filename, "beta.wav");
    assert.equal(state.ui.queuePanel.style.display, "block");
    assert.match(state.ui.audioStatus.textContent, /Track changes are unavailable while recording finalizes the current export/);
  });
});

test("UI restores the recording panel after global hide when it was previously visible", async () => {
  await withUiWireHarnessState({
    recordingState: {
      hooksEnabled: true,
      phase: "idle",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 11,
    },
  }, async ({ harness, getElement }) => {
    UI.showRecordPanel();
    assert.equal(UI.getPanelShellModel().openTargets.recording, true);
    assert.equal(getElement("recordPanel").style.display, "block");
    assert.equal(state.ui.btnLauncherRecording.dataset.targetOpen, "true");

    harness.dispatchWindow("keydown", { code: "KeyH" });
    assert.equal(UI.getPanelShellModel().openTargets.recording, false);
    assert.equal(getElement("recordPanel").style.display, "none");
    assert.equal(state.ui.btnLauncherRecording.dataset.targetOpen, "false");

    harness.dispatchWindow("keydown", { code: "KeyH" });
    assert.equal(UI.getPanelShellModel().openTargets.recording, true);
    assert.equal(getElement("recordPanel").style.display, "block");
    assert.equal(state.ui.btnLauncherRecording.dataset.targetOpen, "true");
  });
});

test("UI keeps the recording launcher reachable after global hide when the panel was already hidden", async () => {
  await withUiWireHarnessState({
    recordingState: {
      hooksEnabled: true,
      phase: "idle",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 12,
    },
  }, async ({ harness, getElement }) => {
    UI.hideRecordPanel();
    assert.equal(UI.getPanelShellModel().openTargets.recording, false);
    assert.equal(getElement("recordPanel").style.display, "none");
    assert.equal(state.ui.btnLauncherRecording.disabled, false);
    assert.equal(state.ui.btnLauncherRecording.dataset.targetOpen, "false");

    harness.dispatchWindow("keydown", { code: "KeyH" });
    harness.dispatchWindow("keydown", { code: "KeyH" });

    assert.equal(UI.getPanelShellModel().openTargets.recording, false);
    assert.equal(getElement("recordPanel").style.display, "none");
    assert.equal(state.ui.btnLauncherRecording.disabled, false);
    assert.equal(state.ui.btnLauncherRecording.getAttribute("aria-pressed"), "false");
  });
});

test("UI blocks live-source switching during active recording without touching the active source session", async () => {
  const harness = createUiWireHarness();
  const previous = {
    source: JSON.parse(JSON.stringify(state.source)),
    audio: { ...state.audio },
    recording: JSON.parse(JSON.stringify(state.recording)),
    ui: snapshotUiState(),
  };
  const originalActivateMic = InputSourceManager.activateMic;
  const originalActivateStream = InputSourceManager.activateStream;
  const originalTeardownActiveSource = InputSourceManager.teardownActiveSource;
  let activateMicCalls = 0;
  let activateStreamCalls = 0;
  let teardownCalls = 0;

  InputSourceManager.activateMic = async () => {
    activateMicCalls += 1;
    return { ok: true };
  };
  InputSourceManager.activateStream = async () => {
    activateStreamCalls += 1;
    return { ok: true };
  };
  InputSourceManager.teardownActiveSource = async () => {
    teardownCalls += 1;
    return { ok: true };
  };

  try {
    state.audio.isLoaded = false;
    state.audio.isPlaying = false;
    state.audio.filename = "";
    state.audio.transportError = "";
    state.source.kind = "stream";
    state.source.status = "active";
    state.source.label = "Browser Tab";
    state.source.sessionActive = true;
    state.source.support.stream = true;
    state.source.support.mic = true;
    state.source.permission.stream = "granted";
    state.source.streamMeta.hasAudio = true;
    state.source.streamMeta.hasVideo = true;
    state.recording.hooksEnabled = true;
    state.recording.phase = "recording";
    state.recording.isSupported = true;
    state.recording.includePlaybackAudio = true;
    state.recording.lastUpdatedAtMs = 7;

    UI.wireControls();
    UI.refreshRecordingUi();

    const model = readSourceUiModel({
      sourceState: state.source,
      audioState: state.audio,
      recordingState: state.recording,
    });

    assert.equal(model.sourceSwitchLocked, true);
    assert.equal(state.ui.btnSourceFile.disabled, true);
    assert.equal(state.ui.btnSourceMic.disabled, true);
    assert.equal(state.ui.btnSourceStream.disabled, true);
    assert.match(state.ui.btnSourceMic.title, /Source changes are unavailable/);

    assert.equal(await UI.dispatchSourceSwitchAction("mic"), false);
    assert.equal(await UI.dispatchSourceSwitchAction("stream"), false);
    assert.equal(await UI.dispatchSourceSwitchAction("file"), false);

    assert.equal(activateMicCalls, 0);
    assert.equal(activateStreamCalls, 0);
    assert.equal(teardownCalls, 0);
    assert.equal(state.source.kind, "stream");
    assert.equal(state.source.status, "active");
    assert.equal(state.source.sessionActive, true);
  } finally {
    InputSourceManager.activateMic = originalActivateMic;
    InputSourceManager.activateStream = originalActivateStream;
    InputSourceManager.teardownActiveSource = originalTeardownActiveSource;
    applySourceAndAudioState(previous);
    Object.assign(state.recording, previous.recording);
    restoreUiState(previous.ui);
    harness.restore();
  }
});

test("UI refreshRecordingUi renders source-aware recording copy across file and live workflows", async () => {
  await withUiWireHarnessState({
    recordingState: {
      hooksEnabled: true,
      phase: "idle",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 1,
    },
  }, () => {
    assert.equal(state.ui.recordStatus.textContent, "Select File, Mic, or Stream to start recording.");
    assert.equal(state.ui.recordSupport.textContent, "Activate File, Mic, or Stream to include source audio.");
  });

  await withUiWireHarnessState({
    sourceState: {
      kind: "file",
      status: "active",
      label: "demo.wav",
      sessionActive: true,
    },
    audioState: {
      isLoaded: true,
      isPlaying: false,
      filename: "demo.wav",
      transportError: "",
    },
    recordingState: {
      hooksEnabled: true,
      phase: "idle",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 2,
    },
  }, () => {
    assert.equal(state.ui.recordStatus.textContent, "Ready to record file audio + video");
    assert.equal(state.ui.recordSupport.textContent, "Canvas + source audio capture available.");
  });

  await withUiWireHarnessState({
    sourceState: {
      kind: "mic",
      status: "active",
      label: "Podcast Mic",
      sessionActive: true,
      support: {
        mic: true,
        stream: true,
      },
      permission: {
        mic: "granted",
        stream: "unknown",
      },
      streamMeta: {
        hasAudio: true,
        hasVideo: false,
      },
    },
    recordingState: {
      hooksEnabled: true,
      phase: "idle",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 3,
    },
  }, () => {
    assert.equal(state.ui.recordStatus.textContent, "Ready to record microphone input + video");
    assert.equal(state.ui.recordSupport.textContent, "Canvas + source audio capture available.");
  });

  await withUiWireHarnessState({
    sourceState: {
      kind: "stream",
      status: "active",
      label: "Browser Tab",
      sessionActive: true,
      support: {
        mic: true,
        stream: true,
      },
      permission: {
        mic: "unknown",
        stream: "granted",
      },
      streamMeta: {
        hasAudio: true,
        hasVideo: true,
      },
    },
    recordingState: {
      hooksEnabled: true,
      phase: "idle",
      isSupported: true,
      includePlaybackAudio: true,
      lastUpdatedAtMs: 4,
    },
  }, () => {
    assert.equal(state.ui.recordStatus.textContent, "Ready to record shared stream + video");
    assert.equal(state.ui.recordSupport.textContent, "Canvas + source audio capture available.");
  });

  await withUiWireHarnessState({
    recordingState: {
      hooksEnabled: true,
      phase: "recording",
      isSupported: true,
      includePlaybackAudio: true,
      lastCode: "audio-unloaded",
      lastUpdatedAtMs: 5,
    },
  }, () => {
    assert.equal(state.ui.recordStatus.textContent, "Recording continues without an active audio source.");
    assert.equal(state.ui.recordSupport.textContent, "Recording continues while no audio source is active.");
  });

  await withUiWireHarnessState({
    sourceState: {
      kind: "file",
      status: "active",
      label: "Replay Track",
      sessionActive: true,
      streamMeta: { hasAudio: true, hasVideo: false },
    },
    audioState: {
      isLoaded: true,
      isPlaying: true,
      filename: "replay-track.wav",
      transportError: "",
    },
    recordingState: {
      hooksEnabled: true,
      phase: "recording",
      isSupported: true,
      includePlaybackAudio: true,
      lastCode: "audio-unloaded",
      lastUpdatedAtMs: 6,
    },
  }, () => {
    assert.equal(state.ui.recordStatus.textContent, "Recording file audio + video");
    assert.equal(state.ui.recordSupport.textContent, "Canvas + source audio capture available.");
  });
});

test("RecorderEngine.start allows an active microphone source without file transport state", () => {
  const harness = createRecorderHarness();

  try {
    const status = RecorderEngine.start();

    assert.equal(status.ok, true);
    assert.equal(status.phase, "recording");
    assert.notEqual(status.code, "no-active-source");
  } finally {
    harness.restore();
  }
});

test("RecorderEngine.start merges live stream audio even when no file transport is loaded", () => {
  const harness = createRecorderHarness();

  state.audio.isLoaded = false;
  state.audio.isPlaying = false;
  state.audio.filename = "";
  state.source.kind = "stream";
  state.source.status = "active";
  state.source.label = "Browser Tab";
  state.source.sessionActive = true;
  state.source.permission.stream = "granted";
  state.source.streamMeta.hasAudio = true;
  state.source.streamMeta.hasVideo = true;

  try {
    const status = RecorderEngine.start();

    assert.equal(status.ok, true);
    assert.equal(status.phase, "recording");
    assert.equal(status.code, "recorder-input-audio-video");
    assert.equal(harness.mediaRecorders.length, 1);
    assert.equal(harness.mediaRecorders[0].stream.getVideoTracks().length, 1);
    assert.equal(harness.mediaRecorders[0].stream.getAudioTracks().length, 1);
  } finally {
    harness.restore();
  }
});

test("RecorderEngine.start keeps active stream capture video-only when recording audio is disabled", () => {
  const harness = createRecorderHarness();

  state.audio.isLoaded = false;
  state.audio.isPlaying = false;
  state.audio.filename = "";
  state.source.kind = "stream";
  state.source.status = "active";
  state.source.label = "Browser Tab";
  state.source.sessionActive = true;
  state.source.permission.stream = "granted";
  state.source.streamMeta.hasAudio = true;
  state.source.streamMeta.hasVideo = true;
  state.recording.includePlaybackAudio = false;

  try {
    const status = RecorderEngine.start();

    assert.equal(status.ok, true);
    assert.equal(status.phase, "recording");
    assert.equal(status.code, "recorder-input-video-only");
    assert.equal(harness.mediaRecorders.length, 1);
    assert.equal(harness.mediaRecorders[0].stream.getVideoTracks().length, 1);
    assert.equal(harness.mediaRecorders[0].stream.getAudioTracks().length, 0);
  } finally {
    harness.restore();
  }
});

test("UI.getRecordingUiModel allows active stream sessions to start recording without a loaded file", () => {
  const previous = {
    source: JSON.parse(JSON.stringify(state.source)),
    audio: { ...state.audio },
    recording: JSON.parse(JSON.stringify(state.recording)),
    ui: snapshotUiState(),
  };

  try {
    state.audio.isLoaded = false;
    state.audio.isPlaying = false;
    state.audio.filename = "";
    state.audio.transportError = "";
    state.source.kind = "stream";
    state.source.status = "active";
    state.source.label = "Browser Tab";
    state.source.sessionActive = true;
    state.source.streamMeta.hasAudio = true;
    state.source.streamMeta.hasVideo = true;
    state.recording.hooksEnabled = true;
    state.recording.phase = "idle";
    state.recording.isSupported = true;
    state.recording.includePlaybackAudio = true;
    state.recording.lastUpdatedAtMs = 42;

    UI.refreshRecordingUi();
    const model = UI.getRecordingUiModel();

    assert.equal(model.canStart, true);
    assert.equal(model.primaryStatusText, "Ready to record shared stream + video");
    assert.equal(model.supportText, "Canvas + source audio capture available.");
  } finally {
    applySourceAndAudioState(previous);
    Object.assign(state.recording, previous.recording);
    restoreUiState(previous.ui);
  }
});

test("prepareWatchBuild creates clean build output directories", async () => {
  const targets = [paths.buildDir, paths.distDir];
  const renamed = [];

  for (const target of targets) {
    if (!existsSync(target)) continue;
    const backup = `${target}.bak-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await rename(target, backup);
    renamed.push({ target, backup });
  }

  try {
    for (const target of targets) assert.equal(existsSync(target), false);

    await prepareWatchBuild();

    for (const target of targets) assert.equal(existsSync(target), true);
    assert.equal(existsSync(paths.buildDir), true);
    assert.equal(existsSync(paths.distDir), true);
  } finally {
    for (const target of targets) {
      if (existsSync(target)) await rm(target, { recursive: true, force: true });
    }
    for (const entry of renamed.reverse()) {
      await rename(entry.backup, entry.target);
    }
  }
});
