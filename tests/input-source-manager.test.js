import test from "node:test";
import assert from "node:assert/strict";

import { createSourceState, state } from "../src/js/core/state.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { createInputSourceManager } from "../src/js/audio/input-source-manager.js";

function createAudioState() {
  return {
    isLoaded: false,
    isPlaying: false,
    filename: "",
    transportError: "",
  };
}

function createManagerHarness(overrides = {}) {
  const stateRef = {
    source: createSourceState(),
    audio: createAudioState(),
  };
  const calls = {
    loadFile: [],
    attachMediaStreamSource: [],
    unload: 0,
  };

  const audioEngine = {
    async loadFile(file, requestId, opts) {
      calls.loadFile.push({ file, requestId, opts });
      if (typeof overrides.onLoadFile === "function") {
        return overrides.onLoadFile({ file, requestId, opts, stateRef, calls });
      }
      return true;
    },
    unload() {
      calls.unload += 1;
      if (typeof overrides.onUnload === "function") overrides.onUnload({ stateRef, calls });
    },
    async attachMediaStreamSource(mediaStream, opts) {
      calls.attachMediaStreamSource.push({ mediaStream, opts });
      if (typeof overrides.onAttachMediaStreamSource === "function") {
        return overrides.onAttachMediaStreamSource({ mediaStream, opts, stateRef, calls });
      }
      return true;
    },
    getMediaEl() {
      return overrides.mediaEl || null;
    },
  };

  Object.defineProperty(audioEngine, "_isLoadRequestCurrent", {
    get() {
      return typeof overrides.isLoadRequestCurrent === "function"
        ? overrides.isLoadRequestCurrent
        : null;
    },
  });

  const manager = createInputSourceManager({
    stateRef,
    audioEngine,
    mediaDevices: Object.prototype.hasOwnProperty.call(overrides, "mediaDevices")
      ? overrides.mediaDevices
      : null,
  });

  return { manager, stateRef, calls };
}

function decodePresetHash(hash) {
  const token = hash.startsWith("#p=") ? hash.slice(3) : hash;
  const padLength = (4 - (token.length % 4)) % 4;
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLength);
  return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
}

function createFakeTrack(label = "") {
  const listeners = new Map();
  return {
    label,
    readyState: "live",
    stopCount: 0,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (!listeners.has(type)) return;
      if (!handler || listeners.get(type) === handler) listeners.delete(type);
    },
    stop() {
      this.stopCount += 1;
      this.readyState = "ended";
    },
    emit(type) {
      if (type === "ended") this.readyState = "ended";
      const handler = listeners.get(type);
      if (handler) handler();
    },
  };
}

function createFakeMediaStream({
  audioLabel = "Built-in Microphone",
  audioLabels = null,
  video = false,
  videoLabel = "Camera",
  hasAudio = true,
} = {}) {
  const listeners = new Map();
  const audioTracks = Array.isArray(audioLabels) && audioLabels.length
    ? audioLabels.map((label) => createFakeTrack(label))
    : (hasAudio ? [createFakeTrack(audioLabel)] : []);
  const audioTrack = audioTracks[0] || null;
  const videoTrack = video ? createFakeTrack(videoLabel) : null;
  const tracks = [...audioTracks];
  if (videoTrack) tracks.push(videoTrack);
  return {
    audioTrack,
    audioTracks,
    videoTrack,
    stream: {
      getTracks() { return tracks; },
      getAudioTracks() { return audioTracks; },
      getVideoTracks() { return videoTrack ? [videoTrack] : []; },
      addEventListener(type, handler) {
        listeners.set(type, handler);
      },
      removeEventListener(type, handler) {
        if (!listeners.has(type)) return;
        if (!handler || listeners.get(type) === handler) listeners.delete(type);
      },
      emit(type) {
        const handler = listeners.get(type);
        if (handler) handler();
      },
    },
  };
}

test("state.source exists and starts in the idle none state", () => {
  assert.ok(state.source);
  assert.equal(state.source.kind, "none");
  assert.equal(state.source.status, "idle");
  assert.equal(state.source.sessionActive, false);
  assert.deepEqual(createSourceState().streamMeta, { hasAudio: false, hasVideo: false, audioChannelCount: null });
});

test("input source manager init marks unsupported capabilities when media APIs are absent", () => {
  const { manager, stateRef } = createManagerHarness({ mediaDevices: null });

  manager.init();

  assert.equal(stateRef.source.support.mic, false);
  assert.equal(stateRef.source.support.stream, false);
  assert.equal(stateRef.source.permission.mic, "unsupported");
  assert.equal(stateRef.source.permission.stream, "unsupported");
});

test("activateFile transitions through requesting to active and forwards load arguments", async () => {
  let seenDuringLoad = null;
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {},
    mediaEl: { tagName: "AUDIO" },
    onLoadFile({ stateRef: loadState }) {
      seenDuringLoad = {
        kind: loadState.source.kind,
        status: loadState.source.status,
        label: loadState.source.label,
        sessionActive: loadState.source.sessionActive,
      };
      loadState.audio.isLoaded = true;
      loadState.audio.filename = "demo.wav";
      loadState.audio.transportError = "";
      return true;
    },
  });

  const file = { name: "demo.wav" };
  const result = await manager.activateFile(file, { requestId: 7, autoPlay: false });

  assert.deepEqual(seenDuringLoad, {
    kind: "file",
    status: "requesting",
    label: "demo.wav",
    sessionActive: false,
  });
  assert.equal(calls.loadFile.length, 1);
  assert.equal(calls.loadFile[0].file, file);
  assert.equal(calls.loadFile[0].requestId, 7);
  assert.deepEqual(calls.loadFile[0].opts, { autoPlay: false });
  assert.deepEqual(result, { ok: true, kind: "file", status: "active", label: "demo.wav" });
  assert.equal(stateRef.source.kind, "file");
  assert.equal(stateRef.source.status, "active");
  assert.equal(stateRef.source.sessionActive, true);
  assert.equal(stateRef.source.label, "demo.wav");
});

test("activateFile failure leaves attempted kind in error without a live session", async () => {
  const { manager, stateRef } = createManagerHarness({
    onLoadFile({ stateRef: loadState }) {
      loadState.audio.transportError = "Playback failed: simulated failure.";
      return false;
    },
  });

  const result = await manager.activateFile({ name: "broken.wav" }, { requestId: 3 });

  assert.equal(result.ok, false);
  assert.equal(result.kind, "file");
  assert.equal(result.status, "error");
  assert.equal(stateRef.source.kind, "file");
  assert.equal(stateRef.source.status, "error");
  assert.equal(stateRef.source.sessionActive, false);
  assert.equal(stateRef.source.errorCode, "file-activation-failed");
  assert.equal(stateRef.source.errorMessage, "Playback failed: simulated failure.");
});

test("teardownActiveSource is idempotent and unloads the active session only once", async () => {
  const { manager, stateRef, calls } = createManagerHarness({
    mediaEl: { tagName: "AUDIO" },
    onLoadFile({ stateRef: loadState }) {
      loadState.audio.isLoaded = true;
      return true;
    },
  });

  await manager.activateFile({ name: "loop.wav" }, { requestId: 5 });

  const first = await manager.teardownActiveSource({ reason: "test-reset" });
  const second = await manager.teardownActiveSource({ reason: "test-reset-again" });

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(calls.unload, 1);
  assert.equal(stateRef.source.kind, "none");
  assert.equal(stateRef.source.status, "idle");
  assert.equal(stateRef.source.sessionActive, false);
});

test("activateMic tears down an active file source, attaches the microphone stream, and marks the source active", async () => {
  const micSession = createFakeMediaStream({ audioLabel: "USB Microphone" });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getUserMedia(constraints) {
        assert.deepEqual(constraints, { audio: true });
        return micSession.stream;
      },
      getDisplayMedia() {},
    },
    mediaEl: { tagName: "AUDIO" },
    onLoadFile({ stateRef: loadState }) {
      loadState.audio.isLoaded = true;
      loadState.audio.isPlaying = true;
      loadState.audio.filename = "song.wav";
      return true;
    },
  });

  await manager.activateFile({ name: "song.wav" }, { requestId: 11 });
  const result = await manager.activateMic();

  assert.equal(calls.unload, 1);
  assert.equal(calls.attachMediaStreamSource.length, 1);
  assert.equal(calls.attachMediaStreamSource[0].mediaStream, micSession.stream);
  assert.deepEqual(calls.attachMediaStreamSource[0].opts, {
    kind: "mic",
    label: "USB Microphone",
    monitorOutput: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.kind, "mic");
  assert.equal(result.status, "active");
  assert.equal(stateRef.source.kind, "mic");
  assert.equal(stateRef.source.status, "active");
  assert.equal(stateRef.source.sessionActive, true);
  assert.equal(stateRef.source.permission.mic, "granted");
  assert.equal(stateRef.source.label, "USB Microphone");
  assert.deepEqual(stateRef.source.streamMeta, { hasAudio: true, hasVideo: false, audioChannelCount: null });
});

test("activateMic reports denied microphone permission as a recoverable error", async () => {
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getUserMedia() {
        const err = new Error("Permission denied");
        err.name = "NotAllowedError";
        throw err;
      },
    },
  });

  const result = await manager.activateMic();

  assert.equal(result.ok, false);
  assert.equal(result.kind, "mic");
  assert.equal(result.status, "error");
  assert.equal(result.errorCode, "mic-denied");
  assert.equal(stateRef.source.kind, "mic");
  assert.equal(stateRef.source.status, "error");
  assert.equal(stateRef.source.permission.mic, "denied");
  assert.equal(stateRef.source.sessionActive, false);
  assert.equal(calls.attachMediaStreamSource.length, 0);
});

test("activateStream tears down an active file source, attaches shared stream audio, and marks the source active", async () => {
  const sharedSession = createFakeMediaStream({
    audioLabel: "System Audio",
    video: true,
    videoLabel: "Browser Tab",
  });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      getUserMedia() {},
      async getDisplayMedia(constraints) {
        assert.deepEqual(constraints, { video: true, audio: true });
        return sharedSession.stream;
      },
    },
    mediaEl: { tagName: "AUDIO" },
    onLoadFile({ stateRef: loadState }) {
      loadState.audio.isLoaded = true;
      loadState.audio.isPlaying = true;
      loadState.audio.filename = "song.wav";
      return true;
    },
  });

  await manager.activateFile({ name: "song.wav" }, { requestId: 12 });
  const result = await manager.activateStream();

  assert.equal(calls.unload, 1);
  assert.equal(calls.attachMediaStreamSource.length, 1);
  assert.equal(calls.attachMediaStreamSource[0].mediaStream, sharedSession.stream);
  assert.deepEqual(calls.attachMediaStreamSource[0].opts, {
    kind: "stream",
    label: "Browser Tab",
    monitorOutput: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.kind, "stream");
  assert.equal(result.status, "active");
  assert.equal(stateRef.source.kind, "stream");
  assert.equal(stateRef.source.status, "active");
  assert.equal(stateRef.source.sessionActive, true);
  assert.equal(stateRef.source.permission.stream, "granted");
  assert.equal(stateRef.source.label, "Browser Tab");
  assert.deepEqual(stateRef.source.streamMeta, { hasAudio: true, hasVideo: true, audioChannelCount: null });
});

test("activateStream accepts audio-only display capture and uses the audio track label", async () => {
  const sharedSession = createFakeMediaStream({ audioLabel: "System Mix" });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getDisplayMedia() {
        return sharedSession.stream;
      },
    },
  });

  const result = await manager.activateStream();

  assert.equal(result.ok, true);
  assert.equal(calls.attachMediaStreamSource.length, 1);
  assert.deepEqual(calls.attachMediaStreamSource[0].opts, {
    kind: "stream",
    label: "System Mix",
    monitorOutput: false,
  });
  assert.equal(stateRef.source.kind, "stream");
  assert.equal(stateRef.source.status, "active");
  assert.equal(stateRef.source.label, "System Mix");
  assert.deepEqual(stateRef.source.streamMeta, { hasAudio: true, hasVideo: false, audioChannelCount: null });
});

test("Stream requests supported stereo/fidelity preferences without mandatory constraints", async () => {
  const session = createFakeMediaStream({ video: true });
  let requested;
  const { manager } = createManagerHarness({ mediaDevices: {
    getSupportedConstraints() {
      return { channelCount: true, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    },
    async getDisplayMedia(constraints) { requested = constraints; return session.stream; },
  } });
  assert.equal((await manager.activateStream()).ok, true);
  assert.deepEqual(requested, { video: true, audio: {
    channelCount: { ideal: 2 }, echoCancellation: { ideal: false },
    noiseSuppression: { ideal: false }, autoGainControl: { ideal: false },
  } });
});

test("Stream omits unsupported audio fields and still activates", async () => {
  const session = createFakeMediaStream();
  let requested;
  const { manager } = createManagerHarness({ mediaDevices: {
    getSupportedConstraints() { return { echoCancellation: true, channelCount: false, noiseSuppression: false }; },
    async getDisplayMedia(constraints) { requested = constraints; return session.stream; },
  } });
  assert.equal((await manager.activateStream()).ok, true);
  assert.deepEqual(requested, { video: true, audio: { echoCancellation: { ideal: false } } });
});

test("Stream falls back to audio:true when constraint inspection is missing, empty, or throws", async () => {
  for (const inspection of [undefined, () => ({}), () => null, () => { throw new Error("unavailable"); }]) {
    const session = createFakeMediaStream();
    let requested;
    const { manager } = createManagerHarness({ mediaDevices: {
      ...(inspection ? { getSupportedConstraints: inspection } : {}),
      async getDisplayMedia(constraints) { requested = constraints; return session.stream; },
    } });
    assert.equal((await manager.activateStream()).ok, true);
    assert.deepEqual(requested, { video: true, audio: true });
  }
});

test("Stream stores the actual returned channel count and keeps the original live stream", async () => {
  for (const channelCount of [2, 1, 6]) {
    const session = createFakeMediaStream({ video: true });
    session.audioTrack.getSettings = () => ({ channelCount });
    const { manager, stateRef, calls } = createManagerHarness({ mediaDevices: {
      getSupportedConstraints() { return { channelCount: true }; },
      async getDisplayMedia() { return session.stream; },
    } });
    assert.equal((await manager.activateStream()).ok, true);
    assert.equal(stateRef.source.streamMeta.audioChannelCount, channelCount);
    assert.equal(calls.attachMediaStreamSource[0].mediaStream, session.stream);
    assert.equal(session.audioTrack.stopCount, 0);
    assert.equal(session.videoTrack.stopCount, 0);
  }
});

test("Stream leaves channel count unknown for absent, unavailable, or invalid track settings", async () => {
  for (const settings of [undefined, () => ({}), () => null, () => { throw new Error("unavailable"); },
    ...[0, -1, 1.5, "2", NaN, Infinity].map(channelCount => () => ({ channelCount }))]) {
    const session = createFakeMediaStream();
    if (settings) session.audioTrack.getSettings = settings;
    const { manager, stateRef } = createManagerHarness({ mediaDevices: {
      async getDisplayMedia() { return session.stream; },
    } });
    assert.equal((await manager.activateStream()).ok, true);
    assert.equal(stateRef.source.streamMeta.audioChannelCount, null);
  }
});

test("Stream metadata describes the track selected by MediaStreamAudioSourceNode ID ordering", async () => {
  const session = createFakeMediaStream({ audioLabels: ["Track B", "Track A"] });
  session.audioTracks[0].id = "b"; session.audioTracks[1].id = "a";
  session.audioTracks[0].getSettings = () => ({ channelCount: 1 });
  session.audioTracks[1].getSettings = () => ({ channelCount: 2 });
  const { manager, stateRef } = createManagerHarness({ mediaDevices: {
    async getDisplayMedia() { return session.stream; },
  } });
  await manager.activateStream();
  assert.equal(stateRef.source.streamMeta.audioChannelCount, 2);
});

test("Stream channel metadata resets on file, mic, end, failure, and a new pending session", async () => {
  for (const exit of ["file", "mic", "ended", "denied", "attach-failed", "no-audio", "pending", "unknown-session"]) {
    const first = createFakeMediaStream();
    first.audioTrack.getSettings = () => ({ channelCount: 2 });
    const second = createFakeMediaStream({ hasAudio: exit !== "no-audio" });
    let captures = 0;
    let resolvePending;
    const { manager, stateRef } = createManagerHarness({ mediaDevices: {
      async getUserMedia() { return second.stream; },
      async getDisplayMedia() {
        if (++captures === 1) return first.stream;
        if (exit === "denied") { const err = new Error("denied"); err.name = "NotAllowedError"; throw err; }
        if (exit === "pending") return new Promise(resolve => { resolvePending = resolve; });
        return second.stream;
      },
    }, onAttachMediaStreamSource() {
      if (exit === "attach-failed" && captures > 1) throw new Error("attach failed");
      return true;
    } });
    await manager.activateStream();
    assert.equal(stateRef.source.streamMeta.audioChannelCount, 2, exit);
    if (exit === "file") await manager.activateFile({ name: "next.wav" });
    else if (exit === "mic") await manager.activateMic();
    else if (exit === "ended") { first.audioTrack.emit("ended"); await Promise.resolve(); }
    else if (exit === "pending") {
      const pending = manager.activateStream();
      await Promise.resolve(); await Promise.resolve();
      assert.equal(stateRef.source.streamMeta.audioChannelCount, null);
      await manager.teardownActiveSource();
      resolvePending(second.stream);
      await pending;
    } else await manager.activateStream();
    assert.equal(stateRef.source.streamMeta.audioChannelCount, null, exit);
  }
});

test("activateStream rejects shared streams that do not provide usable audio", async () => {
  const sharedSession = createFakeMediaStream({
    video: true,
    videoLabel: "Slides Window",
    hasAudio: false,
  });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getDisplayMedia() {
        return sharedSession.stream;
      },
    },
  });

  const result = await manager.activateStream();

  assert.equal(result.ok, false);
  assert.equal(result.kind, "stream");
  assert.equal(result.status, "error");
  assert.equal(result.errorCode, "stream-no-audio-track");
  assert.equal(stateRef.source.kind, "stream");
  assert.equal(stateRef.source.status, "error");
  assert.equal(stateRef.source.permission.stream, "granted");
  assert.equal(stateRef.source.errorMessage, "Shared stream did not provide usable audio.");
  assert.equal(calls.attachMediaStreamSource.length, 0);
  assert.equal(sharedSession.videoTrack.stopCount, 1);
});

test("activateStream treats cancelled or denied picker results conservatively", async () => {
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getDisplayMedia() {
        const err = new Error("Permission denied");
        err.name = "NotAllowedError";
        throw err;
      },
    },
  });

  const result = await manager.activateStream();

  assert.equal(result.ok, false);
  assert.equal(result.kind, "stream");
  assert.equal(result.status, "error");
  assert.equal(result.errorCode, "stream-denied-or-cancelled");
  assert.equal(stateRef.source.kind, "stream");
  assert.equal(stateRef.source.status, "error");
  assert.equal(stateRef.source.permission.stream, "unknown");
  assert.equal(stateRef.source.errorMessage, "Stream share was cancelled or denied.");
  assert.equal(calls.attachMediaStreamSource.length, 0);
});

test("activateStream reports blocked stream capture honestly when the browser context forbids it", async () => {
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getDisplayMedia() {
        const err = new Error("Blocked by policy");
        err.name = "SecurityError";
        throw err;
      },
    },
  });

  const result = await manager.activateStream();

  assert.equal(result.ok, false);
  assert.equal(result.kind, "stream");
  assert.equal(result.status, "error");
  assert.equal(result.errorCode, "stream-blocked");
  assert.equal(stateRef.source.kind, "stream");
  assert.equal(stateRef.source.status, "error");
  assert.equal(stateRef.source.permission.stream, "unknown");
  assert.equal(stateRef.source.errorMessage, "Stream capture is blocked in this browser or context.");
  assert.equal(calls.attachMediaStreamSource.length, 0);
});

test("file -> mic -> file switches cleanly through the source manager contract", async () => {
  const micSession = createFakeMediaStream({ audioLabel: "Laptop Mic" });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getUserMedia() {
        return micSession.stream;
      },
    },
    mediaEl: { tagName: "AUDIO" },
    onLoadFile({ stateRef: loadState }) {
      loadState.audio.isLoaded = true;
      loadState.audio.isPlaying = false;
      loadState.audio.filename = "again.wav";
      loadState.audio.transportError = "";
      return true;
    },
  });

  await manager.activateFile({ name: "again.wav" }, { requestId: 18 });
  const micResult = await manager.activateMic();
  const fileResult = await manager.activateFile({ name: "final.wav" }, { requestId: 19 });

  assert.equal(micResult.ok, true);
  assert.equal(fileResult.ok, true);
  assert.equal(micSession.audioTrack.stopCount, 1);
  assert.equal(calls.unload, 2);
  assert.equal(calls.attachMediaStreamSource.length, 1);
  assert.equal(stateRef.source.kind, "file");
  assert.equal(stateRef.source.status, "active");
  assert.equal(stateRef.source.sessionActive, true);
  assert.equal(stateRef.source.label, "final.wav");
});

test("mic -> stream switches cleanly and stops the previous live session once", async () => {
  const micSession = createFakeMediaStream({ audioLabel: "Desk Mic" });
  const streamSession = createFakeMediaStream({
    audioLabel: "System Mix",
    video: true,
    videoLabel: "Browser Tab",
  });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getUserMedia() {
        return micSession.stream;
      },
      async getDisplayMedia() {
        return streamSession.stream;
      },
    },
  });

  const micResult = await manager.activateMic();
  const streamResult = await manager.activateStream();

  assert.equal(micResult.ok, true);
  assert.equal(streamResult.ok, true);
  assert.equal(micSession.audioTrack.stopCount, 1);
  assert.equal(streamSession.audioTrack.stopCount, 0);
  assert.equal(streamSession.videoTrack.stopCount, 0);
  assert.equal(calls.unload, 1);
  assert.equal(calls.attachMediaStreamSource.length, 2);
  assert.deepEqual(calls.attachMediaStreamSource.map((entry) => entry.opts.kind), ["mic", "stream"]);
  assert.equal(stateRef.source.kind, "stream");
  assert.equal(stateRef.source.status, "active");
  assert.equal(stateRef.source.sessionActive, true);
  assert.equal(stateRef.source.label, "Browser Tab");
});

test("stream -> mic switches cleanly and stops the previous shared stream once", async () => {
  const streamSession = createFakeMediaStream({
    audioLabel: "System Mix",
    video: true,
    videoLabel: "Slides Window",
  });
  const micSession = createFakeMediaStream({ audioLabel: "USB Mic" });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getUserMedia() {
        return micSession.stream;
      },
      async getDisplayMedia() {
        return streamSession.stream;
      },
    },
  });

  const streamResult = await manager.activateStream();
  const micResult = await manager.activateMic();

  assert.equal(streamResult.ok, true);
  assert.equal(micResult.ok, true);
  assert.equal(streamSession.audioTrack.stopCount, 1);
  assert.equal(streamSession.videoTrack.stopCount, 1);
  assert.equal(micSession.audioTrack.stopCount, 0);
  assert.equal(calls.unload, 1);
  assert.equal(calls.attachMediaStreamSource.length, 2);
  assert.deepEqual(calls.attachMediaStreamSource.map((entry) => entry.opts.kind), ["stream", "mic"]);
  assert.equal(stateRef.source.kind, "mic");
  assert.equal(stateRef.source.status, "active");
  assert.equal(stateRef.source.sessionActive, true);
  assert.equal(stateRef.source.label, "USB Mic");
});

test("a late microphone grant is stopped and discarded after teardown", async () => {
  const micSession = createFakeMediaStream({ audioLabel: "Race Mic" });
  let resolveGetUserMedia = null;
  const micPromise = new Promise((resolve) => {
    resolveGetUserMedia = resolve;
  });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      getUserMedia() {
        return micPromise;
      },
    },
  });

  const pendingActivation = manager.activateMic();
  assert.equal(stateRef.source.kind, "mic");
  assert.equal(stateRef.source.status, "requesting");

  const tornDown = await manager.teardownActiveSource({ reason: "switch-away-before-grant" });
  resolveGetUserMedia(micSession.stream);
  const result = await pendingActivation;

  assert.equal(tornDown, true);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "mic-activation-cancelled");
  assert.equal(calls.attachMediaStreamSource.length, 0);
  assert.equal(micSession.audioTrack.stopCount, 1);
  assert.equal(stateRef.source.kind, "none");
  assert.equal(stateRef.source.status, "idle");
});

test("a late stream grant is stopped and discarded after teardown", async () => {
  const sharedSession = createFakeMediaStream({
    audioLabel: "System Mix",
    video: true,
    videoLabel: "Shared Screen",
  });
  let resolveGetDisplayMedia = null;
  const streamPromise = new Promise((resolve) => {
    resolveGetDisplayMedia = resolve;
  });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      getDisplayMedia() {
        return streamPromise;
      },
    },
  });

  const pendingActivation = manager.activateStream();
  assert.equal(stateRef.source.kind, "stream");
  assert.equal(stateRef.source.status, "requesting");

  const tornDown = await manager.teardownActiveSource({ reason: "switch-away-before-share" });
  resolveGetDisplayMedia(sharedSession.stream);
  const result = await pendingActivation;

  assert.equal(tornDown, true);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "stream-activation-cancelled");
  assert.equal(calls.attachMediaStreamSource.length, 0);
  assert.equal(sharedSession.audioTrack.stopCount, 1);
  assert.equal(sharedSession.videoTrack.stopCount, 1);
  assert.equal(stateRef.source.kind, "none");
  assert.equal(stateRef.source.status, "idle");
});

test("external microphone end tears down the stream and leaves a recoverable mic error", async () => {
  const micSession = createFakeMediaStream({ audioLabel: "Podcast Mic" });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getUserMedia() {
        return micSession.stream;
      },
    },
  });

  await manager.activateMic();
  micSession.audioTrack.emit("ended");
  await Promise.resolve();

  assert.equal(calls.unload, 1);
  assert.equal(micSession.audioTrack.stopCount, 1);
  assert.equal(stateRef.source.kind, "none");
  assert.equal(stateRef.source.status, "idle");
  assert.equal(stateRef.source.label, "");
  assert.equal(stateRef.source.sessionActive, false);
  assert.equal(stateRef.source.errorCode, "mic-ended");
  assert.equal(stateRef.source.errorMessage, "Microphone input ended. Select Mic to reconnect.");
});

test("stream ignores video-track end while audio remains live", async () => {
  const sharedSession = createFakeMediaStream({
    audioLabel: "System Audio",
    video: true,
    videoLabel: "Browser Tab",
  });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getDisplayMedia() {
        return sharedSession.stream;
      },
    },
  });

  await manager.activateStream();
  sharedSession.videoTrack.emit("ended");
  await Promise.resolve();

  assert.equal(calls.unload, 0);
  assert.equal(stateRef.source.kind, "stream");
  assert.equal(stateRef.source.status, "active");
  assert.equal(stateRef.source.sessionActive, true);
  assert.equal(stateRef.source.errorCode, "");
});

test("stream ends only after all audio tracks have ended", async () => {
  const sharedSession = createFakeMediaStream({
    audioLabels: ["System Audio A", "System Audio B"],
    video: true,
    videoLabel: "Browser Tab",
  });
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getDisplayMedia() {
        return sharedSession.stream;
      },
    },
  });

  await manager.activateStream();
  sharedSession.audioTracks[0].emit("ended");
  await Promise.resolve();

  assert.equal(calls.unload, 0);
  assert.equal(stateRef.source.kind, "stream");
  assert.equal(stateRef.source.status, "active");
  assert.equal(stateRef.source.sessionActive, true);

  sharedSession.audioTracks[1].emit("ended");
  await Promise.resolve();

  assert.equal(calls.unload, 1);
  assert.equal(stateRef.source.kind, "none");
  assert.equal(stateRef.source.status, "idle");
  assert.equal(stateRef.source.label, "");
  assert.equal(stateRef.source.sessionActive, false);
  assert.equal(stateRef.source.errorCode, "stream-ended");
  assert.equal(stateRef.source.errorMessage, "Shared stream ended. Select Stream to share again.");
});

test("external shared stream end tears down the stream, resets live visuals, and leaves a recoverable stream error", async () => {
  const sharedSession = createFakeMediaStream({
    audioLabel: "System Audio",
    video: true,
    videoLabel: "Browser Tab",
  });
  let resetCalls = 0;
  const { manager, stateRef, calls } = createManagerHarness({
    mediaDevices: {
      async getDisplayMedia() {
        return sharedSession.stream;
      },
    },
  });

  manager.init({
    onExternalLiveInputReset() {
      resetCalls += 1;
    },
  });

  await manager.activateStream();
  sharedSession.stream.emit("inactive");
  await Promise.resolve();

  assert.equal(calls.unload, 1);
  assert.equal(sharedSession.audioTrack.stopCount, 1);
  assert.equal(sharedSession.videoTrack.stopCount, 1);
  assert.equal(resetCalls, 1);
  assert.equal(stateRef.source.kind, "none");
  assert.equal(stateRef.source.status, "idle");
  assert.equal(stateRef.source.label, "");
  assert.equal(stateRef.source.sessionActive, false);
  assert.equal(stateRef.source.errorCode, "stream-ended");
  assert.equal(stateRef.source.errorMessage, "Shared stream ended. Select Stream to share again.");
});

test("teardownActiveSource stops stream-backed sessions even when the kind is mic", async () => {
  const stopCounts = { audio: 0, video: 0 };
  const fakeAudioTrack = {
    addEventListener() {},
    removeEventListener() {},
    stop() { stopCounts.audio += 1; },
  };
  const fakeVideoTrack = {
    addEventListener() {},
    removeEventListener() {},
    stop() { stopCounts.video += 1; },
  };
  const fakeMediaStream = {
    getTracks() { return [fakeAudioTrack, fakeVideoTrack]; },
    getAudioTracks() { return [fakeAudioTrack]; },
    getVideoTracks() { return [fakeVideoTrack]; },
  };
  const { manager, stateRef, calls } = createManagerHarness();

  manager.registerFutureStreamSession("mic", fakeMediaStream, { label: "Built-in microphone" });
  const result = await manager.teardownActiveSource({ reason: "mic-session-ended" });

  assert.equal(result, true);
  assert.equal(stopCounts.audio, 1);
  assert.equal(stopCounts.video, 1);
  assert.equal(calls.unload, 1);
  assert.equal(stateRef.source.kind, "none");
  assert.equal(stateRef.source.status, "idle");
});

test("unsupported microphone activation reports unsupported state without mutating file transport fields", async () => {
  const { manager, stateRef, calls } = createManagerHarness({ mediaDevices: null });
  stateRef.audio.isLoaded = true;
  stateRef.audio.isPlaying = true;
  stateRef.audio.filename = "existing.wav";
  stateRef.audio.transportError = "";

  const micResult = await manager.activateMic();

  assert.equal(micResult.status, "unsupported");
  assert.equal(stateRef.source.permission.mic, "unsupported");
  assert.equal(calls.attachMediaStreamSource.length, 0);
  assert.equal(stateRef.audio.isLoaded, true);
  assert.equal(stateRef.audio.isPlaying, true);
  assert.equal(stateRef.audio.filename, "existing.wav");
  assert.equal(stateRef.audio.transportError, "");
});

test("unsupported stream activation reports unsupported state without mutating file transport fields", async () => {
  const { manager, stateRef, calls } = createManagerHarness({ mediaDevices: null });
  stateRef.audio.isLoaded = true;
  stateRef.audio.isPlaying = true;
  stateRef.audio.filename = "existing.wav";
  stateRef.audio.transportError = "";

  const streamResult = await manager.activateStream();

  assert.equal(streamResult.status, "unsupported");
  assert.equal(stateRef.source.permission.stream, "unsupported");
  assert.equal(calls.attachMediaStreamSource.length, 0);
  assert.equal(stateRef.audio.isLoaded, true);
  assert.equal(stateRef.audio.isPlaying, true);
  assert.equal(stateRef.audio.filename, "existing.wav");
  assert.equal(stateRef.audio.transportError, "");
});

test("URL preset serialization excludes runtime source state", () => {
  const previousLocation = globalThis.location;
  const previousHistory = globalThis.history;
  const previousBtoa = globalThis.btoa;
  const previousAtob = globalThis.atob;
  const previousSource = JSON.parse(JSON.stringify(state.source));

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

  state.source.kind = "mic";
  state.source.status = "active";
  state.source.label = "Studio Mic";
  state.source.permission.mic = "granted";
  state.source.permission.stream = "denied";
  state.source.errorCode = "mic-denied";
  state.source.errorMessage = "Microphone permission denied.";
  state.source.sessionActive = true;
  state.source.streamMeta.hasAudio = true;
  state.source.streamMeta.hasVideo = true;
  state.source.streamMeta.audioChannelCount = 2;

  try {
    UrlPreset.writeHashFromPrefs();
    const payload = decodePresetHash(locationStub.hash);
    assert.ok(payload && payload.prefs);
    assert.equal(Object.prototype.hasOwnProperty.call(payload.prefs, "source"), false);
    assert.equal(payload.schema, 10);
    assert.doesNotMatch(JSON.stringify(payload), /audioChannelCount/);
  } finally {
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
    state.source.streamMeta.audioChannelCount = previousSource.streamMeta.audioChannelCount;
    globalThis.location = previousLocation;
    globalThis.history = previousHistory;
    globalThis.btoa = previousBtoa;
    globalThis.atob = previousAtob;
  }
});
