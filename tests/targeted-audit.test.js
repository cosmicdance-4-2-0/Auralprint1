import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { rename, rm } from "node:fs/promises";

import { PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V8 } from "../src/js/core/constants.js";
import { CONFIG } from "../src/js/core/config.js";
import { normalizeOrbDef, preferences, runtime, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { AudioEngine } from "../src/js/audio/audio-engine.js";
import { createAnalysisFrame, updateAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { InputSourceManager, createInputSourceManager } from "../src/js/audio/input-source-manager.js";
import { Queue } from "../src/js/audio/queue.js";
import { Scrubber, buildWaveformPeaks } from "../src/js/audio/scrubber.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { RecorderEngine } from "../src/js/recording/recorder-engine.js";
import { initOrbs } from "../src/js/render/orb-runtime.js";
import { UI, readSourceUiModel, shouldShowActiveQueueItem } from "../src/js/ui/ui.js";
import { paths } from "../scripts/build.mjs";
import { prepareWatchBuild } from "../scripts/watch.mjs";

test("development version metadata and schema remain aligned", () => {
  assert.equal(readFileSync(new URL("../version", import.meta.url), "utf8").trim(), "v0.1.15m.b");
  assert.match(readFileSync(new URL("../src/js/core/constants.js", import.meta.url), "utf8"), /Auralprint\s+0\.1\.15m\.b/);
  assert.equal(PRESET_SCHEMA_VERSION, 10);
});

test("per-Orb commits use one canonical runtime sync and Orb editor refresh authority", () => {
  const source = readFileSync(new URL("../src/js/ui/ui.js", import.meta.url), "utf8");
  const perOrbCommit = source.match(/function applyOrbPrefChangeById[\s\S]*?\n  \}/u)?.[0] || "";
  const applyPrefs = source.match(/function applyPrefs[\s\S]*?\n  \}/u)?.[0] || "";
  const refreshAll = source.match(/function refreshAllUiText[\s\S]*?\n  \}/u)?.[0] || "";
  assert.equal((perOrbCommit.match(/syncOrbsFromSettings\(\)/g) || []).length, 0);
  assert.equal((applyPrefs.match(/syncOrbsFromSettings\(\)/g) || []).length, 1);
  assert.match(refreshAll, /orbEditorUi\.refresh\(runtime\.settings\)/);
  assert.doesNotMatch(refreshAll, /orbEditorUi\.refresh\(p\)/);
});

function createAudioBuffer(channels) {
  return {
    numberOfChannels: channels.length,
    getChannelData(index) {
      return Float32Array.from(channels[index]);
    },
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

function snapshotSourceAndAudioState() {
  return {
    source: JSON.parse(JSON.stringify(state.source)),
    audio: { ...state.audio },
  };
}

function analysisFrameForUi(monoLike) {
  return updateAnalysisFrame(createAnalysisFrame(), { ready: true, monoLike, bands: {} }, state.bands);
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
    recording: JSON.parse(JSON.stringify(state.recording)),
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
    resolveSettings();

    for (const name of queueNames) Queue.add(createNamedAudioFile(name));
    if (currentIndex >= 0) Queue.setCursor(currentIndex);

    UI.wireControls();
    if (state.ui.queuePanel) state.ui.queuePanel.style.display = queueVisible ? "block" : "none";
    UI.refreshRecordingUi();
    UI.refreshAllUiText(bandSnapshot);

    return await run({
      harness,
      getElement: harness.getElement,
    });
  } finally {
    Queue.clear();
    applySourceAndAudioState(previous);
    Object.assign(state.recording, previous.recording);
    preferences.audio.repeatMode = previous.repeatMode;
    resolveSettings();
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
  const analysers = [];
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
      const analyser = createNode({
        fftSize: 2048,
        smoothingTimeConstant: 0,
        frequencyBinCount: 1024,
        minDecibels: -100,
        maxDecibels: 0,
        frequencyReadCount: 0,
        getFloatTimeDomainData(buffer) { buffer.fill(0); },
        getFloatFrequencyData(buffer) { this.frequencyReadCount += 1; buffer.fill(-100); },
      });
      analysers.push(analyser);
      return analyser;
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
    analysers,
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
  const previousUi = { ...state.ui };
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
      Object.assign(state.ui, previousUi);
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
      this.children = this.children.filter((entry) => entry !== child);
      this.children.push(child);
      if (child && child.tagName === "OPTION") this.options.push(child);
      return child;
    },
    append(...children) {
      for (const child of children) {
        this.children = this.children.filter((entry) => entry !== child);
        this.children.push(child);
      }
    },
    replaceChildren(...children) {
      this.children = children.flatMap((child) => child && child.isFragment ? child.children : [child]);
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
  const previousUi = { ...state.ui };
  const previousCanvas = state.canvas;
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
    createDocumentFragment() {
      const fragment = createStubUiElement("fragment");
      fragment.isFragment = true;
      return fragment;
    },
    body,
    querySelectorAll() {
      return [];
    },
  };
  state.canvas = createStubUiElement("canvas");

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
      Object.assign(state.ui, previousUi);
      state.canvas = previousCanvas;
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.Element = previousElement;
    },
  };
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

test("normalizeOrbDef clamps hue and sanitizes Build 115 orb fields", () => {
  const fallback = CONFIG.defaults.orbs[0];
  const normalized = normalizeOrbDef({
    id: "ORB0",
    chanId: "R",
    hueOffsetDeg: 999,
    colorSource: "bogus",
    centerXFrac: 2,
    centerYFrac: -2,
  }, fallback);

  assert.equal(normalized.hueOffsetDeg, 360);
  assert.equal(normalized.colorSource, "inherit");
  assert.equal(normalized.centerXFrac, CONFIG.limits.orbs.centerXFrac.max);
  assert.equal(normalized.centerYFrac, CONFIG.limits.orbs.centerYFrac.min);
});

test("normalizeOrbDef defaults missing v8 orb fields to Build 115 values", () => {
  const fallback = CONFIG.defaults.orbs[0];
  const normalized = normalizeOrbDef({
    id: "legacy",
    chanId: "L",
    bandIds: [1],
    chirality: 1,
    startAngleRad: 1.5,
  }, fallback);

  assert.equal(normalized.hueOffsetDeg, 0);
  assert.equal(normalized.colorSource, "inherit");
  assert.equal(normalized.centerXFrac, 0);
  assert.equal(normalized.centerYFrac, 0);
});

test("URL preset schema 9 round-trips per-orb Build 115 fields", () => {
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

  const locationStub = { pathname: "/", search: "", hash: "" };
  globalThis.location = locationStub;
  globalThis.history = {
    replaceState(_state, _title, url) {
      locationStub.hash = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    },
  };

  try {
    preferences.orbs[0] = normalizeOrbDef({
      ...preferences.orbs[0],
      hueOffsetDeg: 120,
      colorSource: "angle",
      centerXFrac: 0.1,
      centerYFrac: -0.05,
    }, CONFIG.defaults.orbs[0]);
    preferences.orbs[1] = normalizeOrbDef({
      ...preferences.orbs[1],
      chanId: "C",
      chirality: 1,
      hueOffsetDeg: 240,
    }, CONFIG.defaults.orbs[1]);

    UrlPreset.writeHashFromPrefs();
    const payload = decodePresetHash(locationStub.hash);
    assert.equal(payload.schema, PRESET_SCHEMA_VERSION);
    assert.equal(payload.prefs.orbs[0].hueOffsetDeg, 120);
    assert.equal(payload.prefs.orbs[0].colorSource, "angle");
    assert.equal(payload.prefs.orbs[0].centerXFrac, 0.1);
    assert.equal(payload.prefs.orbs[1].chanId, "C");

    replacePreferences(structuredClone(CONFIG.defaults));
    resolveSettings();
    assert.equal(UrlPreset.applyFromLocationHash(), true);
    assert.equal(preferences.orbs[0].hueOffsetDeg, 120);
    assert.equal(preferences.orbs[0].colorSource, "angle");
    assert.equal(preferences.orbs[1].hueOffsetDeg, 240);
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});

test("UI refreshAllUiText renders generated per-Orb editor cards", async () => {
  await withUiWireHarnessState({}, () => {
    UI.refreshAllUiText();
    assert.equal(state.ui.orbEditorList.children.length, preferences.orbs.length);
    assert.deepEqual(state.ui.orbEditorList.children.map((card) => card.dataset.orbId), preferences.orbs.map((orb) => orb.id));
  });
});

test("UI refreshAllUiText represents the current VisualizerRuntime composition", async () => {
  const previousOrbs = structuredClone(preferences.orbs);
  try {
    preferences.orbs = ["ORB0", "ORB7", "ORB3"].map((id, index) => normalizeOrbDef({
      ...CONFIG.defaults.orbs[index % CONFIG.defaults.orbs.length],
      id,
    }, CONFIG.defaults.orbs[index % CONFIG.defaults.orbs.length]));
    resolveSettings();
    initOrbs();
    await withUiWireHarnessState({}, ({ getElement }) => {
      UI.refreshAllUiText();
      assert.equal(getElement("visualizersStatus").textContent, "4 visualizers · 3 Orbs");
      assert.equal(getElement("visualizerList").children.length, 4);
    });
  } finally {
    preferences.orbs = previousOrbs;
    resolveSettings();
    initOrbs();
  }
});

test("URL preset schema 8 orb payloads migrate to Build 115 defaults", () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousAtob = globalThis.atob;
  const previousPrefs = structuredClone(preferences);

  if (typeof globalThis.atob !== "function") {
    globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
  }

  const v8Prefs = structuredClone(CONFIG.defaults);
  v8Prefs.orbs = CONFIG.defaults.orbs.map((orb) => ({
    id: orb.id,
    chanId: orb.chanId,
    bandIds: [...orb.bandIds],
    chirality: orb.chirality,
    startAngleRad: orb.startAngleRad,
  }));
  const json = JSON.stringify({ schema: LEGACY_SCHEMA_V8, prefs: v8Prefs });
  const b64 = Buffer.from(json, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const locationStub = { pathname: "/", search: "", hash: `#p=${b64}` };
  globalThis.location = locationStub;
  globalThis.history = { replaceState() {} };

  try {
    replacePreferences(structuredClone(CONFIG.defaults));
    resolveSettings();
    assert.equal(UrlPreset.applyFromLocationHash(), true);
    assert.equal(preferences.orbs[0].hueOffsetDeg, 0);
    assert.equal(preferences.orbs[0].colorSource, "inherit");
    assert.equal(preferences.orbs[0].centerXFrac, 0);
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.atob = previousAtob;
  }
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
    const arraysBefore = Object.fromEntries(Object.entries(state.bands.channels).map(([id, value]) => [id, value.energies01]));
    assert.equal(AudioEngine.sample().ready, true);
    assert.deepEqual(harness.analysers.map((analyser) => analyser.frequencyReadCount), [1, 1, 1]);
    AudioEngine.sample();
    assert.deepEqual(harness.analysers.map((analyser) => analyser.frequencyReadCount), [2, 2, 2]);
    for (const id of ["L", "R", "C"]) assert.equal(state.bands.channels[id].energies01, arraysBefore[id]);
    assert.equal(state.bands.energies01, state.bands.channels.C.energies01);
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

  try {
    UrlPreset.writeHashFromPrefs();
    const payload = decodePresetHash(locationStub.hash);
    assert.ok(payload && payload.prefs);
    assert.equal(Object.prototype.hasOwnProperty.call(payload.prefs, "source"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload.prefs, "recording"), false);
  } finally {
    applySourceAndAudioState({ source: previousSource, audio: previousAudio });
    Object.assign(state.recording, previousRecording);
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
    preferences.orbs[0].trace.lineAlpha = 0.12;
    preferences.orbs[0].trace.lineWidthPx = 5;
    preferences.bands.count = 128;
    preferences.bands.floorHz = 40;
    preferences.bands.ceilingHz = 18000;
    preferences.bands.overlay.lineAlpha = 0.18;
    preferences.bands.overlay.lineWidthPx = 4;
    preferences.timing.maxDeltaTimeSec = 0.5;

    UrlPreset.writeHashFromPrefs();

    replacePreferences(structuredClone(CONFIG.defaults));
    resolveSettings();

    const ok = UrlPreset.applyFromLocationHash();
    assert.equal(ok, true);
    assert.equal(preferences.orbs[0].trace.lineAlpha, 0.12);
    assert.equal(preferences.orbs[0].trace.lineWidthPx, 5);
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
    bandSnapshot: analysisFrameForUi(false),
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
    bandSnapshot: analysisFrameForUi(true),
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
    bandSnapshot: analysisFrameForUi(false),
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
      assert.equal(state.ui.queuePanel.style.display, "block");

      await UI.dispatchSourceSwitchAction("mic");
      assert.equal(state.ui.queuePanel.style.display, "none");

      await UI.dispatchSourceSwitchAction("file");
      UI.refreshAllUiText();
      assert.equal(state.ui.queuePanel.style.display, "none");
      assert.equal(state.ui.audioStatus.textContent, "File mode ready. Select a queued file or load audio files.");
      assert.equal(state.ui.btnSourceFile.title, "File workflow selected. Select a queued file or load audio files.");

      state.ui.queuePanel.style.display = "block";
      state.ui.btnHideAudio.click();
      assert.equal(state.ui.queuePanel.style.display, "block");
      state.ui.btnHideQueue.click();
      assert.equal(state.ui.queuePanel.style.display, "none");
      state.ui.btnOpenQueue.click();
      assert.equal(state.ui.queuePanel.style.display, "block");
      assert.equal(state.ui.audioPanel.style.display, "none");
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
    assert.equal(getElement("recordPanel").style.display, "block");
    assert.equal(getElement("openRecord").style.display, "grid");
    assert.equal(getElement("openRecord").classList.contains("is-active"), true);
    assert.equal(getElement("btnOpenRecord").getAttribute("aria-pressed"), "true");

    harness.dispatchWindow("keydown", { code: "KeyH" });
    assert.equal(getElement("recordPanel").style.display, "none");
    assert.equal(getElement("openRecord").style.display, "grid");
    assert.equal(getElement("openRecord").classList.contains("is-active"), false);
    assert.equal(getElement("btnOpenRecord").getAttribute("aria-pressed"), "false");

    harness.dispatchWindow("keydown", { code: "KeyH" });
    assert.equal(getElement("recordPanel").style.display, "block");
    assert.equal(getElement("openRecord").style.display, "grid");
    assert.equal(getElement("openRecord").classList.contains("is-active"), true);
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
    assert.equal(getElement("recordPanel").style.display, "none");
    assert.equal(getElement("openRecord").style.display, "grid");

    harness.dispatchWindow("keydown", { code: "KeyH" });
    harness.dispatchWindow("keydown", { code: "KeyH" });

    assert.equal(getElement("recordPanel").style.display, "none");
    assert.equal(getElement("openRecord").style.display, "grid");
    assert.equal(getElement("openRecord").getAttribute("aria-hidden"), "false");
  });
});

test("UI workspace launcher toggles panels and active states without hiding launchers", async () => {
  await withUiWireHarnessState({}, async ({ getElement }) => {
    assert.equal(getElement("openAudio").style.display, "grid");
    assert.equal(getElement("openAudio").classList.contains("is-active"), true);
    assert.equal(getElement("btnOpenAudio").getAttribute("aria-pressed"), "true");

    getElement("btnOpenAudio").dispatch("click");
    assert.equal(getElement("audioPanel").style.display, "none");
    assert.equal(getElement("openAudio").style.display, "grid");
    assert.equal(getElement("openAudio").classList.contains("is-active"), false);
    assert.equal(getElement("btnOpenAudio").getAttribute("aria-pressed"), "false");

    getElement("btnOpenAudio").dispatch("click");
    assert.equal(getElement("audioPanel").style.display, "grid");
    assert.equal(getElement("openAudio").classList.contains("is-active"), true);
  });
});

test("UI workspace launcher collapse keeps the shell recoverable", async () => {
  await withUiWireHarnessState({}, async ({ getElement }) => {
    const launcher = getElement("workspaceLauncher");
    const toggle = getElement("btnToggleWorkspaceLauncher");

    assert.equal(launcher.dataset.collapsed, "false");
    assert.equal(toggle.getAttribute("aria-expanded"), "true");

    toggle.dispatch("click");
    assert.equal(launcher.dataset.collapsed, "true");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(toggle.title, "Expand launcher bar");

    toggle.dispatch("click");
    assert.equal(launcher.dataset.collapsed, "false");
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.equal(toggle.title, "Collapse launcher bar");
  });
});

function pickerElements(container) {
  const all = [];
  const visit = node => { all.push(node); for (const child of node.children) visit(child); };
  visit(container);
  return all;
}

test("dynamic Orb editor keeps stable card identity across UI refresh", async () => {
  await withUiWireHarnessState({}, () => {
    const roots = [...state.ui.orbEditorList.children];
    UI.refreshAllUiText();
    assert.deepEqual(state.ui.orbEditorList.children, roots);
  });
});

test("dynamic Orb editor does not retain fixed-slot controls", async () => {
  await withUiWireHarnessState({}, ({ getElement }) => {
    assert.equal(state.ui.selOrb0Chan, undefined);
    assert.equal(state.ui.orbEditorList.children.length, preferences.orbs.length);
  });
});

test("global view toggle restores the prior panel selection and disclosure keys do not pause simulation", async () => {
  await withUiWireHarnessState({}, ({ getElement, harness }) => {
    getElement("btnHideSim").click();
    getElement("btnHideScene").click();
    getElement("btnOpenQueue").click();
    getElement("btnTogglePanels").click();
    assert.equal(getElement("audioPanel").style.display, "none");
    assert.equal(getElement("queuePanel").style.display, "none");
    getElement("btnTogglePanels").click();
    assert.equal(getElement("audioPanel").style.display, "grid");
    assert.equal(getElement("queuePanel").style.display, "block");
    assert.equal(getElement("simPanel").style.display, "none");
    assert.equal(getElement("scenePanel").style.display, "none");
    const summary = createStubUiElement("summary");
    summary.closest = selector => selector.split(", ").includes("summary") ? summary : null;
    const paused = state.time.simPaused;
    harness.dispatchWindow("keydown", { code: "Space", target: summary });
    assert.equal(state.time.simPaused, paused);
  });
});

test("UI blocks live-source switching during active recording without touching the active source session", async () => {
  const harness = createUiWireHarness();
  const previous = {
    source: JSON.parse(JSON.stringify(state.source)),
    audio: { ...state.audio },
    recording: JSON.parse(JSON.stringify(state.recording)),
    ui: { ...state.ui },
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
    ui: { ...state.ui },
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
    Object.assign(state.ui, previous.ui);
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

test("Spectral Ring presentation has one Visualizers owner while shared colors live in Scene", () => {
  const template = readFileSync(new URL("../src/index.template.html", import.meta.url), "utf8");
  const visualizers = template.match(/<div id="visualizersPanel"[\s\S]*?<div id="simPanel"/)?.[0] || "";
  const scene = template.slice(template.indexOf('<div id="scenePanel"'), template.indexOf('id="workspaceLauncher"'));
  for (const id of ["chkBandOverlay", "chkBandConnect", "rngBandAlpha", "rngBandPoint", "rngBandOverlayMinRad", "rngBandOverlayMaxRad", "rngBandOverlayWfDisp", "rngBandLineAlpha", "rngBandLineWidth", "selRingPhaseMode", "rngRingSpeed"]) {
    assert.equal((template.match(new RegExp(`id="${id}"`, "g")) || []).length, 1);
    assert.match(visualizers, new RegExp(`id="${id}"`));
    assert.doesNotMatch(scene, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(template, /btnVisualizersOpenBandOverlay|bandOverlaySection/);
  for (const id of ["clrBg", "clrParticle", "selParticleColorSrc", "rngHueOff", "rngSat", "rngVal"]) assert.match(scene, new RegExp(`id="${id}"`));
});

test("115L exposes one Scene color owner and removes the active Bands shell", () => {
  const template = readFileSync(new URL("../src/index.template.html", import.meta.url), "utf8");
  assert.match(template, /id="scenePanel"/); assert.match(template, /id="btnOpenScene"/); assert.match(template, /id="btnHideScene"/);
  assert.doesNotMatch(template, /id="(?:bandsPanel|btnOpenBands|btnHideBands|openBands|bandsStatus)"/);
  const scene = template.slice(template.indexOf('<div id="scenePanel"'), template.indexOf('id="recordPanel"'));
  for (const id of ["clrBg","clrParticle","selParticleColorSrc","rngHueOff","rngSat","rngVal"]) {
    assert.equal((template.match(new RegExp(`id="${id}"`, "g")) || []).length, 1);
    assert.match(scene, new RegExp(`id="${id}"`));
  }
});

test("preset sanitation uses Scene color and Spectral Ring line limit owners", () => {
  const source = readFileSync(new URL("../src/js/presets/url-preset.js", import.meta.url), "utf8");
  assert.match(source, /CONFIG\.limits\.sceneColor\.particleColorSources/);
  for (const field of ["hueOffsetDeg","saturation","value"]) assert.match(source, new RegExp(`CONFIG\\.limits\\.sceneColor\\.${field}`));
  assert.match(source, /CONFIG\.limits\.bands\.overlayLineAlpha/);
  assert.match(source, /CONFIG\.limits\.bands\.overlayLineWidthPx/);
});
