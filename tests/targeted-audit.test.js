import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { rename, rm } from "node:fs/promises";

import { PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V8 } from "../src/js/core/constants.js";
import { CONFIG } from "../src/js/core/config.js";
import { normalizeOrbDef, preferences, runtime, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { AudioEngine } from "../src/js/audio/audio-engine.js";
import { BandBankController } from "../src/js/audio/band-bank-controller.js";
import { createAnalysisFrame, updateAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { InputSourceManager, createInputSourceManager } from "../src/js/audio/input-source-manager.js";
import { Queue } from "../src/js/audio/queue.js";
import { Scrubber, buildWaveformPeaks } from "../src/js/audio/scrubber.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { RecorderEngine } from "../src/js/recording/recorder-engine.js";
import { initOrbs } from "../src/js/render/orb-runtime.js";
import { VisualizerRuntime } from "../src/js/render/visualizer-runtime.js";
import { UI, readSourceUiModel, shouldShowActiveQueueItem } from "../src/js/ui/ui.js";
import { paths } from "../scripts/build.mjs";
import { prepareWatchBuild } from "../scripts/watch.mjs";

test("development version metadata and schema remain aligned", () => {
  assert.equal(readFileSync(new URL("../version", import.meta.url), "utf8").trim(), "v0.1.15m.h.g");
  assert.match(readFileSync(new URL("../src/js/core/constants.js", import.meta.url), "utf8"), /Auralprint\s+0\.1\.15m\.h\.g\s/);
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

let audioEngineHarnessContext = null;

function createAudioEngineHarness({ contextState = "running", onResume = null } = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousURL = globalThis.URL;
  const previousAudioState = { ...state.audio };
  const previousOnFilePlaybackError = AudioEngine._onFilePlaybackError;
  const revokedUrls = [];
  const connectionLog = [];
  const analysers = [];
  let destinationNode = null;
  const previousContextState = audioEngineHarnessContext?.state;
  const previousResume = audioEngineHarnessContext?.resume;
  const resume = function () {
    if (onResume) return onResume(this);
    this.state = "running";
    return Promise.resolve();
  };
  if (audioEngineHarnessContext) {
    audioEngineHarnessContext.state = contextState;
    audioEngineHarnessContext.resume = resume;
  }

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
      entries.push({ handler, once: !!options.once, signal: options.signal });
      this.listeners.set(type, entries);
    },
    dispatch(type) {
      const entries = [...(this.listeners.get(type) || [])];
      const kept = [];
      for (const entry of entries) {
        if (entry.signal?.aborted) continue;
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
      this.state = contextState;
      this.resume = resume;
      audioEngineHarnessContext = this;
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
      if (audioEngineHarnessContext) {
        audioEngineHarnessContext.state = previousContextState || "running";
        if (previousResume) audioEngineHarnessContext.resume = previousResume;
      }
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
    parentNode: null,
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
      return Promise.all(entries.map(handler => handler({
        preventDefault() {},
        stopPropagation() {},
        target: this,
        currentTarget: this,
        ...event,
      })));
    },
    click() {
      if (this.disabled) return;
      this.dispatch("click");
    },
    appendChild(child) {
      if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((entry) => entry !== child);
      child.parentNode = this;
      this.children.push(child);
      if (child && child.tagName === "OPTION") this.options.push(child);
      return child;
    },
    insertBefore(child, before) {
      if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((entry) => entry !== child);
      child.parentNode = this;
      const index = before ? this.children.indexOf(before) : -1;
      if (index < 0) this.children.push(child);
      else this.children.splice(index, 0, child);
      return child;
    },
    append(...children) {
      for (const child of children) this.appendChild(child);
    },
    replaceChildren(...children) {
      for (const child of [...this.children]) child.remove();
      for (const child of children.flatMap((child) => child && child.isFragment ? [...child.children] : [child])) this.appendChild(child);
    },
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((entry) => entry !== this);
      this.parentNode = null;
    },
    focus() { document.activeElement = this; },
    scrollIntoView() {},
    contains(target) { return target === this || this.children.some((child) => child.contains(target)); },
    closest(selector) {
      if (selector.startsWith(".") && this.className?.split(" ").includes(selector.slice(1))) return this;
      if (selector === "button[data-action]" && this.tagName === "BUTTON" && this.dataset.action) return this;
      return this.parentNode?.closest(selector) || null;
    },
    querySelectorAll(selector) {
      const matches = [];
      for (const child of this.children) {
        if (selector === child.tagName.toLowerCase() || (selector.startsWith(".") && child.className?.split(" ").includes(selector.slice(1))) || (selector === '[data-action="edit"]' && child.dataset.action === "edit")) matches.push(child);
        matches.push(...child.querySelectorAll(selector));
      }
      return matches;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
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
      const tag = id.startsWith("sel") ? "select" : (/^(rng|chk|clr)/.test(id) || id === "fileInput" ? "input" : "div");
      const el = createStubUiElement(tag);
      el.id = id;
      if (id.startsWith("chk")) el.type = "checkbox";
      if (id.startsWith("rng")) el.type = "range";
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

test("Stream status exposes 2ch, mono, and multichannel capture separately from analysed content", () => {
  for (const [audioChannelCount, captureText] of [[2, "2ch"], [1, "mono (1ch)"], [6, "6ch"]]) {
    for (const bandText of ["stereo (L≠R)", "mono-ish (L≈R)"]) {
      const model = readSourceUiModel({
        sourceState: { kind: "stream", status: "active", label: "Browser Tab", streamMeta: { audioChannelCount } },
        bandText,
      });
      assert.equal(model.audioStatusText, `Stream live: Browser Tab - Capture: ${captureText} - Bands: ${bandText}`);
    }
  }
});

test("Stream status retains the existing format when capture channel count is unknown", () => {
  for (const audioChannelCount of [null, undefined, 0, -1, 1.5, "2", NaN]) {
    const model = readSourceUiModel({
      sourceState: { kind: "stream", status: "active", label: "Browser Tab", streamMeta: { audioChannelCount } },
      bandText: "stereo (L≠R)",
    });
    assert.equal(model.audioStatusText, "Stream live: Browser Tab - Bands: stereo (L≠R)");
  }
});

test("inactive Stream and Mic status never expose stale Stream capture metadata", () => {
  for (const sourceState of [
    { kind: "stream", status: "requesting" },
    { kind: "stream", status: "error", errorMessage: "Share failed." },
    { kind: "mic", status: "active", label: "Podcast Mic" },
  ]) {
    assert.doesNotMatch(readSourceUiModel({
      sourceState: { ...sourceState, streamMeta: { audioChannelCount: 2 } },
    }).audioStatusText, /Capture:/);
  }
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
    getElement("btnHideVisualizers").click();
    getElement("btnHideScene").click();
    getElement("btnOpenQueue").click();
    getElement("btnTogglePanels").click();
    assert.equal(getElement("audioPanel").style.display, "none");
    assert.equal(getElement("queuePanel").style.display, "none");
    getElement("btnTogglePanels").click();
    assert.equal(getElement("audioPanel").style.display, "grid");
    assert.equal(getElement("queuePanel").style.display, "block");
    assert.equal(getElement("visualizersPanel").style.display, "none");
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
  const visualizers = template.match(/<div id="visualizersPanel"[\s\S]*?<div id="analysisPanel"/)?.[0] || "";
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
  const source = readFileSync(new URL("../src/js/presets/preset-codec.js", import.meta.url), "utf8");
  assert.match(source, /CONFIG\.limits\.sceneColor\.particleColorSources/);
  for (const field of ["hueOffsetDeg","saturation","value"]) assert.match(source, new RegExp(`CONFIG\\.limits\\.sceneColor\\.${field}`));
  assert.match(source, /CONFIG\.limits\.bands\.overlayLineAlpha/);
  assert.match(source, /CONFIG\.limits\.bands\.overlayLineWidthPx/);
});

async function withSettingsActionHarness(t, run) {
  const harness = createUiWireHarness();
  const previousPrefs = structuredClone(preferences);
  const previousSettings = runtime.settings;
  const previousBands = { ...state.bands };
  const previousOrbs = state.orbs.slice();
  const previousSourceKind = state.source.kind;
  const descriptors = Object.fromEntries(["location", "history", "navigator"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const location = { pathname: "/", search: "", hash: "", href: "https://example.test/" };
  const clipboard = { copied: "", async writeText(url) { this.copied = url; } };
  const globals = {
    location,
    history: { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf("#")); location.href = `https://example.test${url}`; } },
    navigator: { clipboard },
  };
  try {
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    replacePreferences(structuredClone(CONFIG.defaults));
    resolveSettings();
    BandBankController.syncFromSettings();
    BandBankController.rebuildNow();
    initOrbs();
    UI.wireControls();
    UI.applyPrefs(null);
    const statusWrites = {};
    for (const [id, initial] of Object.entries({
      visualizerEditStatus: "Choose a visualizer to shape its response.",
      sceneStatus: "Shared scene settings and preset controls.",
      analysisStatus: "Analysis controls ready.",
      audioStatus: state.ui.audioStatus.textContent,
    })) {
      let status = initial;
      statusWrites[id] = [];
      Object.defineProperty(state.ui[id], "textContent", {
        configurable: true,
        get: () => status,
        set: (message) => { statusWrites[id].push(message); status = message; },
      });
    }
    await run({ ...harness, location, clipboard, statusWrites });
    const editWrites = statusWrites.visualizerEditStatus;
    assert.ok(editWrites.every((message) => !/share link|preset|settings reset|Updated: scene/i.test(message)), `Unexpected Settings message in Visualizers: ${editWrites.join("; ")}`);
  } finally {
    // Drain the coordinator's pending toast handles before restoring its DOM.
    t.mock.timers.tick(10000);
    harness.restore();
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    replacePreferences(previousPrefs);
    runtime.settings = previousSettings;
    BandBankController.syncFromSettings();
    Object.assign(state.bands, previousBands);
    state.orbs.splice(0, state.orbs.length, ...previousOrbs);
    state.source.kind = previousSourceKind;
    VisualizerRuntime.rebuild(state.orbs);
  }
}

function settingsPresetHash(prefs) {
  return `#p=${Buffer.from(JSON.stringify({ schema: PRESET_SCHEMA_VERSION, prefs }), "utf8").toString("base64url")}`;
}

test("Copy Share Link writes the canonical schema-10 hash and reports only in Settings", async (t) => {
  await withSettingsActionHarness(t, async ({ clipboard, location }) => {
    const writeHash = t.mock.method(UrlPreset, "writeHashFromPrefs");
    state.ui.btnShare.click();
    await Promise.resolve();
    assert.equal(writeHash.mock.calls.length, 1);
    assert.equal(decodePresetHash(location.hash).schema, 10);
    assert.equal(clipboard.copied, location.href);
    assert.equal(state.ui.sceneStatus.textContent, "Share link copied to clipboard.");
    assert.equal(state.ui.visualizerEditStatus.textContent, "Choose a visualizer to shape its response.");
  });
});

test("Share clipboard fallback retains the URL and reports only in Settings", async (t) => {
  await withSettingsActionHarness(t, async ({ location }) => {
    delete globalThis.navigator.clipboard;
    state.ui.btnShare.click();
    await Promise.resolve();
    assert.equal(decodePresetHash(location.hash).schema, 10);
    assert.equal(state.ui.sceneStatus.textContent, "Share link written to URL — copy from address bar.");
    assert.equal(state.ui.visualizerEditStatus.textContent, "Choose a visualizer to shape its response.");
  });
});

test("Apply URL Preset uses canonical apply, conditional BandBank rebuild and Settings feedback", async (t) => {
  await withSettingsActionHarness(t, ({ location }) => {
    const next = structuredClone(CONFIG.defaults);
    next.bands.floorHz = 55;
    next.bands.distributionMode = "bark";
    next.visuals.backgroundColor = "#123456";
    next.orbs[0].startAngleRad = 1;
    location.hash = settingsPresetHash(next);
    const rebuild = t.mock.method(BandBankController, "rebuildNow");
    const oldLowHz = state.bands.lowHz;
    state.ui.btnApplyUrl.click();
    assert.equal(preferences.visuals.backgroundColor, "#123456");
    assert.equal(runtime.settings.bands.floorHz, 55);
    assert.equal(runtime.settings.bands.distributionMode, "bark");
    assert.notEqual(state.bands.lowHz, oldLowHz);
    assert.equal(rebuild.mock.calls.length, 1);
    assert.equal(state.orbs[0].angleRad, 1);
    assert.equal(state.ui.sceneStatus.textContent, "Preset applied from URL.");
    assert.equal(state.ui.visualizerEditStatus.textContent, "Choose a visualizer to shape its response.");
    state.ui.btnApplyUrl.click();
    assert.equal(rebuild.mock.calls.length, 1, "unchanged band definition must not rebuild");
  });
});

test("missing and invalid URL presets report only in Settings and retain preferences", async (t) => {
  await withSettingsActionHarness(t, ({ location }) => {
    const previous = structuredClone(preferences);
    for (const hash of ["", "#p=invalid"]) {
      location.hash = hash;
      state.ui.btnApplyUrl.click();
      assert.equal(state.ui.sceneStatus.textContent, "No valid preset in URL.");
      assert.equal(state.ui.visualizerEditStatus.textContent, "Choose a visualizer to shape its response.");
      assert.deepEqual(preferences, previous);
    }
  });
});

test("Reset All Settings restores complete CONFIG defaults and reports only in Settings", async (t) => {
  await withSettingsActionHarness(t, () => {
    preferences.audio.volume = 0.25;
    preferences.visuals.backgroundColor = "#123456";
    preferences.bands.floorHz = 55;
    preferences.orbs[0].motion.angularSpeedRadPerSec = 2;
    UI.applyPrefs(null);
    const rebuild = t.mock.method(BandBankController, "rebuildNow");
    state.ui.btnResetPrefs.click();
    assert.deepEqual(preferences, CONFIG.defaults);
    assert.deepEqual(runtime.settings, CONFIG.defaults);
    assert.equal(rebuild.mock.calls.length, 1);
    assert.equal(state.orbs[0].angleRad, CONFIG.defaults.orbs[0].startAngleRad);
    assert.equal(state.ui.sceneStatus.textContent, "All settings reset.");
    assert.equal(state.ui.visualizerEditStatus.textContent, "Choose a visualizer to shape its response.");
  });
});

test("Scene control commits use Settings feedback while Bulk Orb commits use Visualizers feedback", async (t) => {
  await withSettingsActionHarness(t, ({ statusWrites }) => {
    const controls = [["clrBg", "input", "#123456"], ["clrParticle", "input", "#abcdef"], ["selParticleColorSrc", "change", "angle"], ["rngHueOff", "input", "120"], ["rngSat", "input", "0.5"], ["rngVal", "input", "0.75"]];
    for (const [id, event, value] of controls) {
      state.ui[id].value = value;
      state.ui[id].dispatch(event);
      assert.match(state.ui.sceneStatus.textContent, /^Updated: scene /);
      assert.equal(state.ui.visualizerEditStatus.textContent, "Choose a visualizer to shape its response.");
    }
    assert.equal(runtime.settings.visuals.backgroundColor, "#123456");
    assert.equal(runtime.settings.visuals.particleColor, "#abcdef");
    assert.equal(runtime.settings.bands.particleColorSource, "angle");
    assert.deepEqual(runtime.settings.bands.rainbow, { hueOffsetDeg: 120, saturation: 0.5, value: 0.75 });
    assert.equal(statusWrites.sceneStatus.length, controls.length);
    assert.deepEqual(statusWrites.visualizerEditStatus, []);
    assert.deepEqual(statusWrites.analysisStatus, []);
    assert.deepEqual(statusWrites.audioStatus, []);
    const settingsMessage = state.ui.sceneStatus.textContent;
    state.ui.rngOmega.value = "2";
    state.ui.rngOmega.dispatch("input");
    assert.match(state.ui.visualizerEditStatus.textContent, /^Updated:/);
    assert.equal(state.ui.sceneStatus.textContent, settingsMessage);
    assert.equal(statusWrites.visualizerEditStatus.length, 1);
    assert.equal(statusWrites.sceneStatus.length, controls.length, "bulk edit emits no Scene feedback");
  });
});

test("M.H Analysis edits report only through Analysis, including validation and band rebuild options", async (t) => {
  await withSettingsActionHarness(t, ({ statusWrites }) => {
    const rebuild = t.mock.method(BandBankController, "rebuildNow");
    const controls = [
      ["rngRmsGain", "input", "2", "Updated: rms gain (analysis)"],
      ["rngSmooth", "input", "0.5", "Updated: smoothing"],
      ["selFFT", "change", "4096", "Updated: fft size"],
      ["selDistMode", "change", "bark", "Updated: band distribution mode"],
      ["inpBandFloorHz", "change", "30", "Band floor updated."],
      ["inpBandCeilingHz", "change", "23000", "Configured ceiling updated."],
    ];
    for (const [id, event, value, message] of controls) {
      state.ui[id].value = value;
      const before = statusWrites.analysisStatus.length;
      state.ui[id].dispatch(event);
      assert.ok(statusWrites.analysisStatus.length > before, id);
      assert.equal(state.ui.analysisStatus.textContent, message, id);
      assert.deepEqual(statusWrites.visualizerEditStatus, [], `${id} must never write to Visualizers`);
      assert.deepEqual(statusWrites.sceneStatus, [], `${id} must never write to Scene`);
      assert.deepEqual(statusWrites.audioStatus, [], `${id} must never write to Audio`);
    }
    assert.equal(rebuild.mock.callCount(), 3, "distribution, floor and ceiling retain explicit rebuilds");
    const beforeInvalid = runtime.settings;
    state.ui.inpBandFloorHz.value = "0";
    state.ui.inpBandFloorHz.dispatch("change");
    assert.equal(state.ui.analysisStatus.textContent, "Band floor must be a positive finite number.");
    state.ui.inpBandCeilingHz.value = "10";
    state.ui.inpBandCeilingHz.dispatch("change");
    assert.equal(state.ui.analysisStatus.textContent, "Configured ceiling cannot be below band floor.");
    assert.equal(runtime.settings, beforeInvalid, "invalid input still does not commit");
    assert.deepEqual(statusWrites.visualizerEditStatus, []);
    assert.deepEqual(statusWrites.sceneStatus, []);
    assert.deepEqual(statusWrites.audioStatus, []);
  });
});

test("M.H repeat, mute and volume use the existing Audio toast and restore source status after expiry", async (t) => {
  await withSettingsActionHarness(t, ({ statusWrites }) => {
    let now = 100000;
    t.mock.method(performance, "now", () => now);
    state.source.kind = "file";
    UI.refreshAllUiText();
    const sourceStatus = state.ui.audioStatus.textContent;
    // Expired test toasts stay expired when the real performance clock resumes.
    now = -100000;
    const controls = [
      ["btnRepeat", "click", null, "Updated: repeat"],
      ["chkMute", "change", true, "Updated: mute"],
      ["rngVol", "input", "0.4", "Updated: volume (playback only)"],
    ];
    for (const [id, event, value, message] of controls) {
      if (typeof value === "boolean") state.ui[id].checked = value;
      else if (value !== null) state.ui[id].value = value;
      state.ui[id].dispatch(event);
      UI.refreshAllUiText();
      assert.equal(state.ui.audioStatus.textContent, message, id);
      now += 2499;
      UI.refreshAllUiText();
      assert.equal(state.ui.audioStatus.textContent, message, "existing toast duration is retained");
      now += 1;
      UI.refreshAllUiText();
      assert.equal(state.ui.audioStatus.textContent, sourceStatus, "normal source status resumes after expiry");
      assert.deepEqual(statusWrites.visualizerEditStatus, [], `${id} must never write to Visualizers`);
      assert.deepEqual(statusWrites.sceneStatus, [], `${id} must never write to Scene`);
      assert.deepEqual(statusWrites.analysisStatus, [], `${id} must never write to Analysis`);
    }
  });
});

test("M.H individual Orb and Spectral Ring edits emit only Visualizer feedback", async (t) => {
  await withSettingsActionHarness(t, ({ statusWrites }) => {
    const control = state.ui.orbEditorList.children[0].querySelectorAll("input").find((node) => node.id?.endsWith("angular-speed"));
    control.value = "2";
    control.dispatch("input");
    assert.equal(runtime.settings.orbs[0].motion.angularSpeedRadPerSec, 2);
    assert.equal(statusWrites.visualizerEditStatus.length, 1);
    assert.match(state.ui.visualizerEditStatus.textContent, /^Updated: .* angular speed$/);
    state.ui.rngBandAlpha.value = "0.4";
    state.ui.rngBandAlpha.dispatch("input");
    assert.equal(runtime.settings.bands.overlay.alpha, 0.4);
    assert.equal(statusWrites.visualizerEditStatus.length, 2);
    assert.equal(state.ui.visualizerEditStatus.textContent, "Updated: spectral ring alpha");
    assert.deepEqual(statusWrites.sceneStatus, []);
    assert.deepEqual(statusWrites.analysisStatus, []);
    assert.deepEqual(statusWrites.audioStatus, []);
    t.mock.timers.tick(2500);
    assert.equal(state.ui.visualizerEditStatus.textContent, "Choose a visualizer to shape its response.");
  });
});

test("M.H generic preference application is status-neutral and internal synchronization stays silent", async (t) => {
  await withSettingsActionHarness(t, ({ statusWrites }) => {
    const explicitStatus = t.mock.fn();
    UI.applyPrefs("generic synchronization");
    UI.applyPrefs("non-callable callback", { showStatus: true });
    UI.applyPrefs(null);
    UI.applyPrefs(null, { showStatus: explicitStatus });
    assert.equal(explicitStatus.mock.callCount(), 0);
    for (const [id, writes] of Object.entries(statusWrites)) assert.deepEqual(writes, [], id);
  });
});

test("Settings toasts survive applyPrefs, replace prior timers, and restore the default lane", async (t) => {
  await withSettingsActionHarness(t, () => {
    state.ui.btnApplyUrl.click();
    UI.applyPrefs(null);
    assert.equal(state.ui.sceneStatus.textContent, "No valid preset in URL.");
    t.mock.timers.tick(1000);
    state.ui.btnResetPrefs.click();
    t.mock.timers.tick(3000);
    assert.equal(state.ui.sceneStatus.textContent, "All settings reset.", "old Apply timer must be cancelled");
    t.mock.timers.tick(1000);
    assert.equal(state.ui.sceneStatus.textContent, "Shared scene settings and preset controls.");
    assert.equal(state.ui.visualizerEditStatus.textContent, "Choose a visualizer to shape its response.");
  });
});

test("hashchange preset application also reports through Settings without an Orb toast", async (t) => {
  await withSettingsActionHarness(t, ({ location, dispatchWindow }) => {
    const next = structuredClone(CONFIG.defaults);
    next.visuals.backgroundColor = "#123456";
    location.hash = settingsPresetHash(next);
    dispatchWindow("hashchange");
    assert.equal(runtime.settings.visuals.backgroundColor, "#123456");
    assert.equal(state.ui.sceneStatus.textContent, "Preset applied from URL.");
    assert.equal(state.ui.visualizerEditStatus.textContent, "Choose a visualizer to shape its response.");
  });
});

const MG_BULK_FIELDS = [
  ["rngOmega", "valOmega", "motion", "angularSpeedRadPerSec", "input", 1, 2],
  ["rngMinRad", "valMinRad", "response", "minRadiusFrac", "input", .02, .04],
  ["rngMaxRad", "valMaxRad", "response", "maxRadiusFrac", "input", .7, .9],
  ["rngWfDisp", "valWfDisp", "response", "waveformRadialDisplaceFrac", "input", .1, .2],
  ["chkLines", "valLines", "trace", "lines", "change", false, true],
  ["rngNumLines", "valNumLines", "trace", "numLines", "input", 20, 40],
  ["selLineColorMode", "valLineColorMode", "trace", "lineColorMode", "change", "fixed", "lastParticle"],
  ["rngEmit", "valEmit", "particles", "emitPerSecond", "input", 100, 200],
  ["rngSizeMax", "valSizeMax", "particles", "sizeMaxPx", "input", 7, 9],
  ["rngSizeMin", "valSizeMin", "particles", "sizeMinPx", "input", 1, 2],
  ["rngSizeToMin", "valSizeToMin", "particles", "sizeToMinSec", "input", 2, 4],
  ["rngTTL", "valTTL", "particles", "ttlSec", "input", 10, 12],
  ["rngOverlap", "valOverlap", "particles", "overlapRadiusPx", "input", 1, 3],
];

for (const [controlId, outputId, group, field, event, first, second] of MG_BULK_FIELDS) {
  test(`Visualizers bulk ${group}.${field} reports mixed and applies canonically to every Orb`, async (t) => {
    await withSettingsActionHarness(t, () => {
      preferences.orbs.forEach((orb, i) => { orb[group][field] = i ? second : first; });
      UI.applyPrefs(null);
      assert.equal(state.ui[outputId].textContent, "mixed");
      if (typeof first === "boolean") assert.equal(state.ui[controlId].indeterminate, true);
      const settingsBefore = runtime.settings, runtimeOrbs = [...state.orbs];
      const unrelatedBefore = preferences.orbs.map((orb) => orb.centerXFrac);
      if (typeof first === "boolean") state.ui[controlId].checked = first;
      else state.ui[controlId].value = String(first);
      state.ui[controlId].dispatch(event);
      assert.notEqual(runtime.settings, settingsBefore);
      for (const source of [preferences.orbs, runtime.settings.orbs, state.orbs]) {
        assert.equal(source.length, 2);
        assert.ok(source.every((orb) => orb[group][field] === first), `${group}.${field}`);
      }
      assert.deepEqual(state.orbs, runtimeOrbs, "bulk editing retains live Orb objects");
      assert.deepEqual(preferences.orbs.map((orb) => orb.centerXFrac), unrelatedBefore);
      assert.notEqual(state.ui[outputId].textContent, "mixed");
      assert.notEqual(state.ui[outputId].textContent, "—");
      if (typeof first === "boolean") assert.equal(state.ui[controlId].indeterminate, false);
      assert.match(state.ui.visualizerEditStatus.textContent, /^Updated:/);
      UI.refreshAllUiText();
      assert.match(state.ui.visualizerEditStatus.textContent, /^Updated:/, "refresh retains edit feedback");
    });
  });
}

function hostVisualizerEditors() {
  const ui = state.ui;
  ui.visualizersPanel.append(ui.visualizerList, ui.spectralRingEditor, ui.orbEditorList, ui.btnVisualizersAddOrb, ui.btnResetVisuals);
  ui.spectralRingEditor.append(createStubUiElement("summary"), ui.chkBandOverlay);
  ui.visualizersPanel.style.display = "block";
}
function visualizerAction(action, id) {
  const row = state.ui.visualizerList.children.find((item) => action === "edit-ring"
    ? item.children[0].children[0].textContent === "Spectral Ring"
    : item.children[2]?.children.some((button) => button.dataset.orbId === id));
  return row?.children[2]?.children.find((button) => button.dataset.action === action);
}
function clickVisualizerAction(action, id) {
  const button = visualizerAction(action, id);
  assert.ok(button, `${action} for ${id || "Spectral Ring"}`);
  state.ui.visualizerList.dispatch("click", { target: button });
}

test("Ring and persistent-ID Orb Edit open existing editors inside Visualizers", async (t) => {
  await withSettingsActionHarness(t, () => {
    hostVisualizerEditors(); UI.refreshAllUiText();
    clickVisualizerAction("edit-ring");
    assert.equal(state.ui.spectralRingEditor.open, true);
    assert.equal(document.activeElement, state.ui.spectralRingEditor.querySelector("summary"));
    const root = state.ui.orbEditorList.children[1];
    const nodes = [...state.ui.orbEditorList.children];
    const settingsBefore = runtime.settings;
    clickVisualizerAction("edit", root.dataset.orbId);
    assert.equal(root.open, true);
    assert.equal(document.activeElement, root.querySelector("summary"));
    clickVisualizerAction("edit", root.dataset.orbId);
    assert.deepEqual(state.ui.orbEditorList.children, nodes);
    assert.equal(runtime.settings, settingsBefore, "Edit does not mutate settings");
    assert.equal(state.ui.visualizersPanel.style.display, "block");
    assert.ok(state.ui.visualizersPanel.contains(document.activeElement));
    assert.equal(state.ui.simPanel, undefined);
  });
});

test("collection actions create and remove local editors and recover focus through zero Orbs", async (t) => {
  await withSettingsActionHarness(t, () => {
    hostVisualizerEditors(); UI.refreshAllUiText();
    const originalId = preferences.orbs[0].id;
    const survivor = state.orbs[0]; survivor.angleRad = 3; survivor.emitAccum = .37;
    state.ui.btnVisualizersAddOrb.click();
    const added = preferences.orbs.at(-1);
    assert.ok(state.ui.orbEditorList.children.some((node) => node.dataset.orbId === added.id));
    assert.equal(document.activeElement, visualizerAction("edit", added.id));
    clickVisualizerAction("edit", added.id);
    assert.ok(state.ui.visualizersPanel.contains(document.activeElement));
    clickVisualizerAction("duplicate", added.id);
    const copy = preferences.orbs.find((orb) => orb.id !== added.id && orb.id !== originalId && !CONFIG.defaults.orbs.some((def) => def.id === orb.id));
    assert.ok(copy); assert.notEqual(copy.id, added.id);
    assert.ok(state.ui.orbEditorList.children.some((node) => node.dataset.orbId === copy.id));
    assert.equal(document.activeElement, visualizerAction("edit", copy.id));
    const order = preferences.orbs.map((orb) => orb.id);
    window.confirm = () => false;
    clickVisualizerAction("remove", order[1]);
    assert.deepEqual(preferences.orbs.map((orb) => orb.id), order);
    window.confirm = () => true;
    clickVisualizerAction("remove", order[1]);
    assert.equal(document.activeElement, visualizerAction("edit", order[2]));
    assert.ok(!state.ui.orbEditorList.children.some((node) => node.dataset.orbId === order[1]));
    assert.equal(state.orbs[0], survivor); assert.equal(survivor.angleRad, 3); assert.equal(survivor.emitAccum, .37);
    while (preferences.orbs.length) clickVisualizerAction("remove", preferences.orbs.at(-1).id);
    assert.equal(state.orbs.length, 0); assert.equal(state.ui.orbEditorList.children.length, 0);
    assert.equal(document.activeElement, state.ui.btnVisualizersAddOrb);
    assert.equal(state.ui.visualizerList.children.length, 1);
    for (const [controlId, outputId] of MG_BULK_FIELDS) {
      assert.equal(state.ui[controlId].disabled, true, controlId);
      assert.equal(state.ui[outputId].textContent, "—", outputId);
    }
    state.ui.btnVisualizersAddOrb.click();
    assert.equal(preferences.orbs.length, 1); assert.equal(state.ui.orbEditorList.children.length, 1);
    assert.equal(document.activeElement, visualizerAction("edit", preferences.orbs[0].id));
    for (const [controlId, outputId] of MG_BULK_FIELDS) {
      assert.equal(state.ui[controlId].disabled, false, controlId);
      assert.notEqual(state.ui[outputId].textContent, "mixed", outputId);
      assert.notEqual(state.ui[outputId].textContent, "—", outputId);
    }
  });
});

test("M.C relocated Orb roots, disclosure, picker, focus and scroll survive normal commits", async (t) => {
  await withSettingsActionHarness(t, () => {
    hostVisualizerEditors(); UI.refreshAllUiText();
    const host = state.ui.orbEditorList, root = host.children[0];
    clickVisualizerAction("edit", root.dataset.orbId);
    const motion = root.children[1].children[1]; motion.open = true;
    const picker = root.children[1].children[0].children[1].children[1]; picker.open = true;
    const control = root.querySelectorAll("input").find((node) => node.id?.endsWith("angular-speed"));
    control.focus(); state.ui.visualizersPanel.scrollTop = 432;
    const moves = t.mock.method(host, "insertBefore");
    control.value = "2"; control.dispatch("input"); UI.refreshAllUiText();
    assert.equal(moves.mock.callCount(), 0);
    assert.equal(host.children[0], root); assert.equal(document.activeElement, control);
    assert.equal(root.open, true); assert.equal(motion.open, true); assert.equal(picker.open, true);
    assert.equal(state.ui.visualizersPanel.scrollTop, 432);
  });
});

test("Visualizers tooltip discovery includes Ring, bulk and newly added Orb controls exactly once", async (t) => {
  await withSettingsActionHarness(t, () => {
    hostVisualizerEditors();
    state.ui.chkBandOverlay.id = "chkBandOverlay";
    state.ui.rngOmega.id = "rngOmega";
    state.ui.visualizersPanel.append(state.ui.rngOmega);
    const selectors = [];
    document.querySelectorAll = (selector) => {
      selectors.push(selector);
      if (selector === "#visualizersPanel input") return [...state.ui.orbEditorList.querySelectorAll("input"), state.ui.chkBandOverlay, state.ui.rngOmega];
      if (selector === "#visualizersPanel select") return state.ui.orbEditorList.querySelectorAll("select");
      return [];
    };
    state.ui.btnVisualizersAddOrb.click(); UI.refreshAllUiText();
    const controls = state.ui.configTooltipSpecs.map((spec) => spec.control);
    const newRoot = state.ui.orbEditorList.children.at(-1);
    const newControl = newRoot.querySelectorAll("input").find((node) => node.id?.endsWith("angular-speed"));
    for (const control of [state.ui.chkBandOverlay, state.ui.rngOmega, newControl]) assert.equal(controls.filter((node) => node === control).length, 1);
    assert.ok(selectors.includes("#visualizersPanel input")); assert.ok(!selectors.some((selector) => selector.includes("simPanel")));
    const listener = t.mock.method(newControl, "addEventListener");
    state.ui.btnVisualizersAddOrb.click();
    assert.equal(listener.mock.callCount(), 0, "existing tooltip listeners are retained without duplication");
    UI.refreshAllUiText(); assert.match(newControl.title, /Angular Speed/);
  });
});

test("Visualizers focus round-trip and H/View restore the same layout with local editors", async (t) => {
  await withSettingsActionHarness(t, ({ dispatchWindow }) => {
    hostVisualizerEditors(); UI.refreshAllUiText();
    const roots = [...state.ui.orbEditorList.children];
    roots[0].open = true; roots[0].querySelector("summary").focus();
    state.ui.btnHideVisualizers.click();
    assert.equal(document.activeElement, state.ui.btnOpenVisualizers);
    assert.equal(state.ui.visualizersPanel.style.display, "none");
    state.ui.btnOpenVisualizers.click();
    assert.equal(document.activeElement, state.ui.btnHideVisualizers);
    const panels = [state.ui.audioPanel, state.ui.analysisPanel, state.ui.visualizersPanel, state.ui.scenePanel, state.ui.queuePanel];
    state.ui.analysisPanel.style.display = "none"; state.ui.queuePanel.style.display = "none";
    state.ui.audioPanel.style.display = "grid";
    const before = panels.map((panel) => panel.style.display);
    dispatchWindow("keydown", { code: "KeyH", target: state.canvas });
    assert.ok(panels.every((panel) => panel.style.display === "none"));
    assert.equal("sim" in state.ui.panelRestoreSnapshot, false);
    state.ui.btnTogglePanels.click();
    assert.deepEqual(panels.map((panel) => panel.style.display), before);
    assert.deepEqual(state.ui.orbEditorList.children, roots); assert.equal(roots[0].open, true);
    assert.equal(state.ui.openVisualizers.hidden, false);
  });
});

function rc02Deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function withRc02FileWorkflow(t, options, run) {
  const audio = createAudioEngineHarness(options);
  const previousRequestGuard = AudioEngine._isLoadRequestCurrent;
  const previousEnded = AudioEngine._onTrackEnded;
  const mutations = [];
  const scrubberLoads = [];
  const activations = [];
  t.mock.method(RecorderEngine, "onTransportMutation", (kind, details) => {
    mutations.push({ kind, details });
    return { ok: true };
  });
  t.mock.method(RecorderEngine, "getSupportStatus", () => ({ ok: true }));
  t.mock.method(Scrubber, "loadFile", file => { scrubberLoads.push(file.name); });
  const activateFile = InputSourceManager.activateFile;
  t.mock.method(InputSourceManager, "activateFile", async (...args) => {
    const result = await activateFile(...args);
    activations.push(result);
    return result;
  });
  try {
    await withUiWireHarnessState({
      sourceState: { kind: "none", status: "idle", sessionActive: false, label: "", errorCode: "", errorMessage: "" },
      audioState: { isLoaded: false, isPlaying: false, filename: "", transportError: "" },
      recordingState: { phase: "idle" },
      queueVisible: true,
    }, async ({ getElement }) => {
      const createElement = document.createElement;
      document.createElement = tag => tag === "audio" ? audio.audioEl : createElement(tag);
      function ingest(names, entry = "picker") {
        const files = names.map(createNamedAudioFile);
        if (entry === "drop") return state.canvas.dispatch("drop", { dataTransfer: { files } });
        getElement("fileInput").files = files;
        return getElement("fileInput").dispatch("change");
      }
      try {
        await run({ audio, ingest, getElement, mutations, scrubberLoads, activations });
      } finally {
        await InputSourceManager.teardownActiveSource({ reason: "rc02-test-cleanup" });
      }
    });
  } finally {
    AudioEngine._isLoadRequestCurrent = previousRequestGuard;
    AudioEngine._onTrackEnded = previousEnded;
    audio.restore();
  }
}

function assertRc02Empty() {
  UI.refreshAllUiText();
  assert.deepEqual(Queue.snapshot(), { items: [], cursor: -1, length: 0 });
  assert.deepEqual(state.audio, { isLoaded: false, isPlaying: false, filename: "", transportError: "" });
  assert.equal(state.source.kind, "none");
  assert.equal(state.source.status, "idle");
  assert.equal(state.source.label, "");
  assert.equal(state.source.sessionActive, false);
  assert.equal(state.source.errorCode, "");
  assert.equal(state.source.errorMessage, "");
  assert.equal(state.source.streamMeta.hasAudio, false);
  assert.equal(AudioEngine.getMediaEl(), null);
  assert.equal(AudioEngine.sample().ready, false);
  assert.equal(state.ui.audioStatus.textContent, "File mode ready. Load audio files to begin analysis.");
}

for (const removal of ["clear", "final-remove"]) {
  test(`RC-02: ${removal} during delayed context resume leaves an empty workflow`, async (t) => {
    const entered = rc02Deferred(), resume = rc02Deferred();
    await withRc02FileWorkflow(t, {
      contextState: "suspended",
      onResume(ctx) {
        entered.resolve();
        return resume.promise.then(() => { ctx.state = "running"; });
      },
    }, async ({ ingest, getElement, scrubberLoads, mutations, activations }) => {
      const pending = ingest(["A.wav"]);
      await entered.promise;
      assert.equal(Queue.length, 1);
      if (removal === "clear") await getElement("btnClearQueue").dispatch("click");
      else await getElement("queueList").children[0].children[2].dispatch("click");
      assertRc02Empty();
      const notifications = mutations.length;
      resume.resolve();
      await pending;
      assertRc02Empty();
      assert.deepEqual(activations, [false], "cancelled activation resolves quietly");
      assert.deepEqual(scrubberLoads, []);
      assert.equal(mutations.length, notifications, "no stale recorder transport notification");
    });
  });
}

for (const outcome of ["resolve", "reject"]) {
  test(`RC-02: Clear during delayed load-time play ${outcome} ignores stale commits and callbacks`, async (t) => {
    const entered = rc02Deferred(), play = rc02Deferred();
    await withRc02FileWorkflow(t, {}, async ({ audio, ingest, getElement, scrubberLoads, mutations, activations }) => {
      audio.audioEl.play = () => {
        audio.audioEl.paused = false;
        audio.audioEl.dispatch("play");
        entered.resolve();
        return play.promise;
      };
      const pending = ingest(["A.wav"]);
      await entered.promise;
      assert.equal(AudioEngine.sample().ready, true);
      await getElement("btnClearQueue").dispatch("click");
      assertRc02Empty();
      assert.equal(audio.audioEl.src, "");
      assert.ok(audio.revokedUrls.includes("blob:test-audio"));
      assert.ok(audio.audioEl.releaseCalls.pause > 0);
      assert.ok(audio.audioEl.releaseCalls.load > 0);
      const notifications = mutations.length;
      // Teardown aborts every old listener, including late decode/error/EOF events.
      for (const event of ["loadeddata", "error", "play", "pause", "ended"]) audio.audioEl.dispatch(event);
      assertRc02Empty();
      if (outcome === "reject") play.reject(Object.assign(new Error("old playback failed"), { name: "NotSupportedError" }));
      else play.resolve();
      await pending;
      assertRc02Empty();
      assert.deepEqual(activations, [false]);
      assert.deepEqual(scrubberLoads, []);
      assert.equal(mutations.length, notifications);
    });
  });
}

for (const entry of ["picker", "drop"]) {
  test(`RC-02: two-file ${entry} batch cannot repopulate after Clear`, async (t) => {
    const entered = rc02Deferred(), play = rc02Deferred();
    await withRc02FileWorkflow(t, {}, async ({ audio, ingest, getElement, scrubberLoads }) => {
      let playCalls = 0;
      audio.audioEl.play = () => { playCalls++; entered.resolve(); return play.promise; };
      const pending = ingest(["A.wav", "B.wav"], entry);
      await entered.promise;
      await getElement("btnClearQueue").dispatch("click");
      assertRc02Empty();
      play.resolve();
      await pending;
      assertRc02Empty();
      assert.equal(playCalls, 1, "B never begins an old activation");
      assert.deepEqual(scrubberLoads, []);
    });
  });
}

test("RC-02: ordinary single file still loads, plays, and notifies recording", async (t) => {
  await withRc02FileWorkflow(t, {}, async ({ ingest, scrubberLoads, mutations }) => {
    await ingest(["A.wav"]);
    assert.equal(state.source.kind, "file");
    assert.equal(state.source.status, "active");
    assert.equal(state.source.sessionActive, true);
    assert.deepEqual(state.audio, { isLoaded: true, isPlaying: true, filename: "A.wav", transportError: "" });
    assert.equal(AudioEngine.sample().ready, true);
    assert.equal(Queue.currentIndex, 0);
    assert.deepEqual(scrubberLoads, ["A.wav"]);
    assert.deepEqual(mutations.map(item => item.kind), ["track-change-start", "track-change-complete"]);
  });
});

for (const entry of ["picker", "drop"]) {
  test(`RC-02: ordinary A/B/C ${entry} batch preserves order and first activation`, async (t) => {
    await withRc02FileWorkflow(t, {}, async ({ ingest, scrubberLoads }) => {
      await ingest(["A.wav", "B.wav", "C.wav"], entry);
      assert.deepEqual(Queue.snapshot().items.map(item => item.name), ["A.wav", "B.wav", "C.wav"]);
      assert.equal(Queue.currentIndex, 0);
      assert.equal(state.audio.filename, "A.wav");
      assert.equal(state.audio.isPlaying, true);
      assert.deepEqual(scrubberLoads, ["A.wav"]);
      assert.equal(Queue.next().name, "B.wav");
      assert.equal(Queue.next().name, "C.wav");
    });
  });

  test(`RC-02: ${entry} B/C appends once without replacing active A`, async (t) => {
    await withRc02FileWorkflow(t, {}, async ({ ingest, scrubberLoads, mutations }) => {
      await ingest(["A.wav"]);
      await ingest(["B.wav", "C.wav"], entry);
      assert.deepEqual(Queue.snapshot().items.map(item => item.name), ["A.wav", "B.wav", "C.wav"]);
      assert.equal(Queue.currentIndex, 0);
      assert.equal(state.audio.filename, "A.wav");
      assert.equal(state.audio.isPlaying, true);
      assert.deepEqual(scrubberLoads, ["A.wav"]);
      assert.deepEqual(mutations.map(item => item.kind), ["track-change-start", "track-change-complete"]);
    });
  });
}

test("RC-02: a new user action can load normally after cancellation", async (t) => {
  const entered = rc02Deferred(), play = rc02Deferred();
  await withRc02FileWorkflow(t, {}, async ({ audio, ingest, getElement, scrubberLoads }) => {
    const ordinaryPlay = audio.audioEl.play.bind(audio.audioEl);
    audio.audioEl.play = () => { entered.resolve(); return play.promise; };
    const pending = ingest(["A.wav"]);
    await entered.promise;
    await getElement("btnClearQueue").dispatch("click");
    play.resolve();
    await pending;
    assertRc02Empty();
    audio.audioEl.play = ordinaryPlay;
    await ingest(["new.wav"]);
    assert.equal(state.audio.filename, "new.wav");
    assert.equal(state.audio.isPlaying, true);
    assert.deepEqual(scrubberLoads, ["new.wav"]);
    assert.equal(Queue.length, 1);
  });
});

test("Ring commits retain the singleton editor and truthful inventory visibility", async (t) => {
  await withSettingsActionHarness(t, () => {
    hostVisualizerEditors(); UI.refreshAllUiText();
    const editor = state.ui.spectralRingEditor;
    state.ui.chkBandOverlay.checked = false; state.ui.chkBandOverlay.dispatch("change"); UI.refreshAllUiText();
    assert.equal(preferences.bands.overlay.enabled, false); assert.equal(runtime.settings.bands.overlay.enabled, false);
    assert.equal(VisualizerRuntime.getVisualizers().filter((item) => item.type === "spectral-ring").length, 1);
    assert.equal(state.ui.visualizerList.children[0].children[0].children[1].textContent, "Hidden");
    assert.equal(state.ui.spectralRingEditor, editor);
    clickVisualizerAction("edit-ring"); assert.equal(editor.open, true);
    assert.equal(state.ui.visualizerList.children[0].children[2].children.length, 1);
  });
});

// RC-05 exercises the registered production EOF hook, canonical recording state,
// recurrent UI synchronization, and the existing File activation ownership path.
function rc05End(audio) {
  audio.audioEl.ended = true;
  audio.audioEl.paused = true;
  audio.audioEl.dispatch("ended");
}
const rc05Settle = () => new Promise(resolve => setImmediate(resolve));

for (const [label, names, cursor, repeat, expected, nextCursor] of [
  ["next track", ["A.wav", "B.wav", "C.wav"], 0, "none", "B.wav", 1],
  ["Repeat One", ["A.wav"], 0, "one", "A.wav", 0],
  ["Repeat All", ["A.wav", "B.wav"], 1, "all", "A.wav", 0],
]) {
  test(`RC-05: ${label} defers during finalization and loads/plays exactly once after completion`, async t => {
    await withRc02FileWorkflow(t, {}, async ({ audio, ingest, mutations, scrubberLoads }) => {
      await ingest(names);
      if (cursor) {
        Queue.goTo(cursor);
        await InputSourceManager.activateFile(Queue.current());
      }
      preferences.audio.repeatMode = repeat;
      const owner = Queue.current();
      state.recording.phase = "finalizing";
      rc05End(audio);
      for (let i = 0; i < 3; i++) UI.refreshRecordingUi();
      assert.equal(Queue.current(), owner);
      assert.equal(state.audio.isPlaying, false);
      assert.deepEqual(scrubberLoads, ["A.wav"], "pending EOF cannot load while locked");
      assert.equal(mutations.filter(m => m.kind === "track-change-start").length, 1);
      Object.assign(state.recording, { phase: "complete", lastExportUrl: "blob:valid-export", lastExportByteSize: 123 });
      if (repeat === "one") {
        const current = Queue.current;
        let reads = 0;
        t.mock.method(Queue, "current", () => {
          // Reenter after ownership validation, while the policy selects A.
          if (++reads === 2) UI.refreshRecordingUi();
          return current();
        });
      }
      UI.refreshRecordingUi();
      await rc05Settle();
      assert.equal(Queue.currentIndex, nextCursor);
      assert.equal(state.audio.filename, expected);
      assert.equal(state.audio.isPlaying, true);
      assert.deepEqual(scrubberLoads, ["A.wav", expected]);
      for (let i = 0; i < 5; i++) { UI.refreshRecordingUi(); UI.refreshAllUiText(); }
      await rc05Settle();
      assert.equal(mutations.filter(m => m.kind === "track-change-start").length, 2);
      assert.equal(Queue.currentIndex, nextCursor);
      assert.equal(state.recording.lastExportUrl, "blob:valid-export");
      assert.equal(state.recording.lastExportByteSize, 123);
    });
  });
}

test("RC-05: no-next/repeat-off clears pending ownership before reentrant and repeated refresh", async t => {
  await withRc02FileWorkflow(t, {}, async ({ audio, ingest, mutations, scrubberLoads }) => {
    await ingest(["A.wav"]);
    preferences.audio.repeatMode = "none";
    state.recording.phase = "finalizing";
    rc05End(audio);
    assert.equal(mutations.filter(m => m.kind === "audio-unloaded").length, 0);
    state.recording.phase = "complete";
    const current = Queue.current;
    let nested = false;
    t.mock.method(Queue, "current", () => {
      if (!nested) { nested = true; UI.refreshRecordingUi(); }
      return current();
    });
    for (let i = 0; i < 5; i++) { UI.refreshRecordingUi(); UI.refreshAllUiText(); }
    assert.deepEqual(mutations.filter(m => m.kind === "audio-unloaded"), [
      { kind: "audio-unloaded", details: { reason: "track-ended-no-next" } },
    ]);
    assert.deepEqual(scrubberLoads, ["A.wav"]);
    assert.equal(Queue.currentIndex, 0);
    assert.equal(state.audio.isPlaying, false);
    assert.equal(audio.audioEl.ended, true);
    // Changing repeat later cannot revive a consumed event.
    preferences.audio.repeatMode = "one";
    UI.refreshRecordingUi();
    assert.deepEqual(scrubberLoads, ["A.wav"]);
  });
});

test("RC-05: export failure still releases EOF without overwriting recording error", async t => {
  await withRc02FileWorkflow(t, {}, async ({ audio, ingest, scrubberLoads }) => {
    await ingest(["A.wav", "B.wav"]);
    preferences.audio.repeatMode = "none";
    state.recording.phase = "finalizing";
    rc05End(audio);
    Object.assign(state.recording, { phase: "error", lastCode: "finalize-failed", lastMessage: "export failure" });
    const error = structuredClone(state.recording);
    UI.refreshRecordingUi();
    await rc05Settle();
    assert.equal(state.audio.filename, "B.wav");
    assert.equal(state.audio.isPlaying, true);
    assert.deepEqual(scrubberLoads, ["A.wav", "B.wav"]);
    assert.deepEqual(state.recording, error);
  });
});

for (const change of ["queue-file", "media-element", "live-workflow", "teardown", "clear", "replacement"]) {
  test(`RC-05: stale pending EOF is discarded after ${change}`, async t => {
    await withRc02FileWorkflow(t, {}, async ({ audio, ingest, getElement, scrubberLoads, mutations }) => {
      await ingest(["A.wav", "B.wav", "C.wav"]);
      preferences.audio.repeatMode = "none";
      const file = Queue.current(), media = AudioEngine.getMediaEl();
      state.recording.phase = "finalizing";
      rc05End(audio);
      if (change === "queue-file") Queue.goTo(1);
      if (change === "media-element") t.mock.method(AudioEngine, "getMediaEl", () => ({}));
      if (change === "live-workflow") state.source.kind = "stream";
      if (change === "teardown") await InputSourceManager.teardownActiveSource({ reason: "test-owner-change" });
      state.recording.phase = "complete";
      if (change === "clear") await getElement("btnClearQueue").dispatch("click");
      if (change === "replacement") await getElement("queueList").children[1].dispatch("click");
      await rc05Settle();
      const before = { cursor: Queue.currentIndex, audio: { ...state.audio }, loads: [...scrubberLoads], count: mutations.length };
      UI.refreshRecordingUi();
      await rc05Settle();
      assert.deepEqual({ cursor: Queue.currentIndex, audio: { ...state.audio }, loads: [...scrubberLoads], count: mutations.length }, before);
      // Restoring matching identities must not revive a discarded record.
      if (["queue-file", "media-element", "live-workflow"].includes(change)) {
        Queue.goTo(0); state.source.kind = "file";
        if (change === "media-element") AudioEngine.getMediaEl.mock.restore();
        assert.equal(Queue.current(), file);
        UI.refreshRecordingUi();
        await rc05Settle();
        assert.deepEqual(scrubberLoads, before.loads);
        assert.equal(mutations.length, before.count);
      }
    });
  });
}

for (const [atEof, later, expected] of [["one", "none", "A.wav"], ["none", "one", "B.wav"], ["all", "none", "A.wav"]]) {
  test(`RC-05: repeat ${atEof} is captured at EOF despite later preference ${later}`, async t => {
    await withRc02FileWorkflow(t, {}, async ({ audio, ingest, scrubberLoads }) => {
      await ingest(["A.wav", "B.wav"]);
      if (atEof === "all") { Queue.goTo(1); await InputSourceManager.activateFile(Queue.current()); }
      preferences.audio.repeatMode = atEof;
      state.recording.phase = "finalizing";
      rc05End(audio);
      preferences.audio.repeatMode = later;
      state.recording.phase = "complete";
      // Also covers EOF/finalization between frames without a finalizing UI refresh.
      UI.refreshAllUiText();
      await rc05Settle();
      assert.deepEqual(scrubberLoads, ["A.wav", expected]);
      assert.equal(preferences.audio.repeatMode, later);
    });
  });
}

for (const phase of ["idle", "recording", "complete", "error"]) {
  test(`RC-05: ordinary EOF in ${phase} advances immediately through normal File ownership`, async t => {
    await withRc02FileWorkflow(t, {}, async ({ audio, ingest, scrubberLoads, mutations }) => {
      await ingest(["A.wav", "B.wav"]);
      preferences.audio.repeatMode = "none";
      state.recording.phase = phase;
      rc05End(audio);
      assert.equal(Queue.currentIndex, 1, "queue advances synchronously without UI refresh");
      assert.equal(mutations.filter(m => m.kind === "track-change-start").length, 2);
      await rc05Settle();
      assert.equal(state.audio.filename, "B.wav");
      assert.equal(state.audio.isPlaying, true);
      assert.deepEqual(scrubberLoads, ["A.wav", "B.wav"]);
      assert.equal(state.recording.phase, phase);
    });
  });
}
