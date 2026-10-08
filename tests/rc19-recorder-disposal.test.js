import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRecordingState, state } from "../src/js/core/state.js";
import { resolveSettings } from "../src/js/core/preferences.js";
import { createInputSourceManager } from "../src/js/audio/input-source-manager.js";

// Inspect private retention without adding a production API or replacing logic.
const engineUrl = new URL("../src/js/recording/recorder-engine.js", import.meta.url);
const source = readFileSync(engineUrl, "utf8")
  .replace('"../core/config.js"', JSON.stringify(new URL("../src/js/core/config.js", import.meta.url).href))
  .replace('"../core/state.js"', JSON.stringify(new URL("../src/js/core/state.js", import.meta.url).href))
  .replace("    init,", `    inspect: () => ({ pendingChunks: runtime.pendingChunks.length,
      mediaRecorder: runtime.mediaRecorder, renderStream: runtime.renderStream,
      audioStream: runtime.audioStream, audioTap: runtime.audioTap,
      mergedStream: runtime.mergedStream, timerIntervalId: runtime.timerIntervalId,
      completedBlob: runtime.completedBlob }),
    init,`);
const observedDir = mkdtempSync(join(tmpdir(), "rc19-"));
const observedFile = join(observedDir, "recorder-engine.mjs");
writeFileSync(observedFile, source);
after(() => rmSync(observedDir, { recursive: true, force: true }));
const { RecorderEngine: engine } = await import(pathToFileURL(observedFile).href);
let audioId = 0;

async function harness(t, mode = "live") {
  const saved = Object.fromEntries(["window", "MediaRecorder", "MediaStream", "setInterval", "clearInterval"].map(key => [key, globalThis[key]]));
  const oldAudio = { ...state.audio }, oldSource = { ...state.source };
  const urls = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const recording = createRecordingState();
  const faults = Object.create(null), recorders = [], renderTracks = [], tapTracks = [], nodes = [];
  const timers = new Map(), retainedTimers = [], created = [], revoked = [];

  let releases = 0, acquisitions = 0, timerId = 0, clock = 1000;
  function track(kind) {
    return Object.assign(new EventTarget(), { kind, readyState: "live", stops: 0,
      getSettings: () => ({ channelCount: 2 }),
      stop() { this.stops++; this.readyState = "ended"; },
    });
  }
  class Stream {
    constructor(tracks = []) { this.tracks = tracks; }
    addTrack(track) { this.tracks.push(track); }
    getTracks() { return this.tracks.slice(); }
    getVideoTracks() { return this.tracks.filter(track => track.kind === "video"); }
    getAudioTracks() { return this.tracks.filter(track => track.kind === "audio"); }
  }
  class NativeRecorder {
    static isTypeSupported() { return true; }
    constructor(stream) {
      if (faults.constructor) throw new Error("constructor refused");
      this.stream = stream; this.state = "inactive"; this.stops = 0;
      recorders.push(this);
      for (const name of ["ondataavailable", "onstop", "onerror"]) {
        let value = null;
        Object.defineProperty(this, name, { get: () => value, set(next) {
          if (next === null && faults.handler === name) throw new Error(`cannot detach ${name}`);
          value = next;
        } });
      }
    }
    start() { if (faults.start) throw new Error("start refused"); this.state = "recording"; }
    handlers() { return { data: this.ondataavailable, stop: this.onstop, error: this.onerror }; }
    stop() {
      this.stops++;
      if (this.state === "inactive") throw new DOMException("inactive", "InvalidStateError");
      if (faults.stop) {
        if (faults.inactiveOnThrow) this.state = "inactive";
        throw new Error("stop refused");
      }
      this.state = "inactive";
      this.queued = this.handlers();
      if (faults.sync) this.deliver(this.queued);
    }
    deliver(handlers = this.queued) {
      handlers?.data?.({ data: new Blob(["native tail"]) });
      handlers?.stop?.();
    }
    data(text) { this.ondataavailable?.({ data: new Blob([text]) }); }
    error() {
      // Native fatal errors terminate recording before queuing error/stop events.
      this.state = "inactive";
      this.onerror?.({ error: new Error("native fatal error") });
    }
  }
  function node(extra = {}) {
    const value = { connections: [], disconnects: 0,
      connect(to, output = 0) { this.connections.push({ to, output }); },
      disconnect(to) { this.disconnects++; this.connections = to ? this.connections.filter(x => x.to !== to) : []; }, ...extra };
    nodes.push(value); return value;
  }
  class Context {
    constructor() { this.state = "running"; this.sampleRate = 48000; this.destination = node(); }
    createMediaStreamSource(stream) { return node({ stream, source: true }); }
    createMediaElementSource(mediaEl) { return node({ mediaEl, source: true }); }
    createGain() { return node({ gain: { value: 1 } }); }
    createChannelSplitter() { return node(); }
    createAnalyser() { return node({ fftSize: 2048, frequencyBinCount: 1024,
      minDecibels: -100, maxDecibels: 0,
      getFloatTimeDomainData: buffer => buffer.fill(0.25),
      getFloatFrequencyData: buffer => buffer.fill(-50) }); }
    createMediaStreamDestination() {
      const audio = track("audio"); tapTracks.push(audio);
      return node({ stream: new Stream([audio]) });
    }
  }
  Object.assign(globalThis, { window: { AudioContext: Context, MediaRecorder: NativeRecorder }, MediaRecorder: NativeRecorder, MediaStream: Stream,
    setInterval(fn) { const id = ++timerId; timers.set(id, fn); retainedTimers.push(fn); return id; },
    clearInterval(id) { timers.delete(id); } });
  URL.createObjectURL = blob => { const url = urls.create.call(URL, blob); created.push(url); return url; };
  URL.revokeObjectURL = url => { revoked.push(url); urls.revoke.call(URL, url); };
  resolveSettings();
  const { AudioEngine: audio } = await import(`../src/js/audio/audio-engine.js?rc19=${audioId++}`);
  const upstreamTrack = track("audio"), upstream = new Stream([upstreamTrack]);
  const playback = { paused: false, pauseCalls: 0, src: "existing-file", pause() { this.pauseCalls++; this.paused = true; }, removeAttribute() {}, load() {} };
  let manager;
  if (mode === "live") {
    manager = createInputSourceManager({ stateRef: state, audioEngine: audio,
      mediaDevices: { getUserMedia: async () => upstream } });
    assert.equal((await manager.activateMic()).ok, true);
  } else {
    await audio.attachSource({ kind: "file", sourceType: "media-element", mediaEl: playback });
    state.audio.isLoaded = true; state.audio.isPlaying = true;
  }
  const graph = nodes.find(value => value.source);
  const graphBefore = () => nodes.map(value => ({ node: value, connections: value.connections.slice(), disconnects: value.disconnects }));
  const canvas = { captureStream() {
    acquisitions++;
    if (faults.capture) throw new Error("capture refused");
    const video = track("video"); renderTracks.push(video); return new Stream([video]);
  } };
  const init = () => engine.init({ stateRef: recording, getRenderTap: () => ({ canvas }),
    getAudioTap() {
      const tap = audio.getRecorderTap();
      return { ...tap, releaseStream() { releases++; if (faults.release) throw new Error("owner cleanup refused"); tap.releaseStream(); } };
    }, nowMs: () => clock });
  init();
  t.after(async () => {
    faults.handler = null; faults.release = false;
    engine.dispose();
    if (manager) await manager.teardownActiveSource({ reason: "test-cleanup" });
    else audio.unload();
    for (const url of created) urls.revoke.call(URL, url);
    Object.assign(globalThis, saved); URL.createObjectURL = urls.create; URL.revokeObjectURL = urls.revoke;
    Object.assign(state.audio, oldAudio); Object.assign(state.source, oldSource);
  });
  const start = () => { const result = engine.start(); assert.equal(result.ok, true, JSON.stringify(result)); return recorders.at(-1); };
  return { recording, faults, recorders, renderTracks, tapTracks, timers, retainedTimers,
    created, revoked, upstreamTrack, audio, playback, graph, graphBefore, init, start,
    advanceClock() { clock += 1000; },
    get releases() { return releases; }, get acquisitions() { return acquisitions; } };
}

function assertReleased(h) {
  assert.deepEqual(engine.inspect(), { pendingChunks: 0, mediaRecorder: null, renderStream: null,
    audioStream: null, audioTap: null, mergedStream: null, timerIntervalId: null, completedBlob: null });
  assert.equal(h.timers.size, 0);
  assert.ok(h.renderTracks.every(track => track.stops === 1 && track.readyState === "ended"));
  assert.equal(h.recording.phase, "disabled");
  assert.equal(h.recording.chunkCount, 0); assert.equal(h.recording.lastExportUrl, null);
}
function invokeOld(old) {
  old.data({ data: new Blob(["stale chunk"]) }); old.stop(); old.error({ error: new Error("stale error") });
}

test("RC-19: uninitialized and idle disposal are safe and acquire no resources", async t => {
  assert.equal(engine.dispose().ok, true);
  const h = await harness(t);
  assert.equal(engine.dispose().ok, true); assertReleased(h);
  assert.equal(h.recorders.length, 0); assert.equal(h.acquisitions, 0); assert.equal(h.releases, 0);
  assert.equal(engine.getSupportStatus().phase, "disabled");
  assert.equal(engine.start().phase, "disabled");
});

for (const sync of [false, true]) {
  test(`RC-19: active disposal stops native encoding once (${sync ? "synchronous" : "queued"} events) and preserves live owner`, async t => {
    const h = await harness(t); h.faults.sync = sync;
    const recorder = h.start(), old = recorder.handlers(); recorder.data("discard");
    assert.equal(engine.inspect().pendingChunks, 1); assert.equal(h.timers.size, 1);
    assert.equal(engine.dispose().ok, true);
    assert.equal(recorder.state, "inactive"); assert.equal(recorder.stops, 1);
    assertReleased(h); assert.equal(h.releases, 1);
    assert.equal(h.upstreamTrack.stops, 0); assert.equal(h.upstreamTrack.readyState, "live");
    assert.equal(state.source.sessionActive, true); assert.equal(h.audio.sample().ready, true);
    assert.equal(h.graph.disconnects, 0);
    assert.equal(h.audio.getRecorderTap().ensureStream().getAudioTracks()[0], h.upstreamTrack);
    assert.equal(recorder.ondataavailable, null); assert.equal(recorder.onstop, null); assert.equal(recorder.onerror, null);
    const status = { ...h.recording }; invokeOld(old); recorder.deliver();
    h.retainedTimers.forEach(fn => fn());
    assert.deepEqual(h.recording, status); assertReleased(h); assert.deepEqual(h.created, []);
    assert.equal(engine.dispose().ok, true); assert.equal(recorder.stops, 1); assert.equal(h.releases, 1);
  });
}

test("RC-19: normal Stop then disposal fences queued completion without double native stop", async t => {
  const h = await harness(t), recorder = h.start(); recorder.data("discard");
  const old = recorder.handlers(); assert.equal(engine.stop().ok, true);
  assert.equal(h.recording.phase, "finalizing"); assert.equal(recorder.state, "inactive");
  engine.dispose(); assert.equal(recorder.stops, 1); assertReleased(h);
  const status = { ...h.recording }; recorder.deliver(); invokeOld(old);
  assert.deepEqual(h.recording, status); assert.deepEqual(h.created, []); assertReleased(h);
});

test("RC-19: inactive backend is not stopped unnecessarily", async t => {
  const h = await harness(t), recorder = h.start(); recorder.state = "inactive";
  engine.dispose(); assert.equal(recorder.stops, 0); assertReleased(h);
});

test("RC-19: explicit reinit creates a clean session immune to old callbacks and queued timers", async t => {
  const h = await harness(t), first = h.start(), old = first.handlers(); first.data("discard first");
  engine.dispose(); h.init(); const next = h.start(); next.data("new session");
  const status = { ...h.recording }, current = engine.inspect();
  h.advanceClock(); invokeOld(old); h.retainedTimers[0](); first.deliver();
  assert.deepEqual(h.recording, status); assert.deepEqual(engine.inspect(), current);
  assert.equal(next.state, "recording"); assert.equal(next.stops, 0); assert.equal(h.timers.size, 1);
  assert.equal(h.renderTracks[1].stops, 0); assert.equal(h.releases, 1);
  engine.stop(); next.onstop();
  assert.equal(h.recording.phase, "complete");
  assert.equal(await (await fetch(h.recording.lastExportUrl)).text(), "new session");
  const complete = { ...h.recording }; invokeOld(old); assert.deepEqual(h.recording, complete);
  assert.equal(h.created.length, 1); engine.dispose(); assertReleased(h);
  assert.deepEqual(h.revoked, h.created); engine.dispose(); assert.deepEqual(h.revoked, h.created);
});

for (const inactiveOnThrow of [false, true]) {
  test(`RC-19: native stop exception reports failure with actual ${inactiveOnThrow ? "inactive" : "recording"} state and still cleans up`, async t => {
    const h = await harness(t), recorder = h.start(), old = recorder.handlers();
    h.faults.stop = true; h.faults.inactiveOnThrow = inactiveOnThrow;
    const result = engine.dispose();
    assert.equal(result.ok, false); assert.equal(result.code, "dispose-stop-failed");
    assert.match(result.message, inactiveOnThrow ? /inactive/ : /recording.*not confirmed/i);
    assert.equal(recorder.state, inactiveOnThrow ? "inactive" : "recording");
    assert.equal(recorder.stops, 1); assertReleased(h); assert.equal(h.upstreamTrack.stops, 0);
    const status = { ...h.recording }; invokeOld(old); assert.deepEqual(h.recording, status);
    assert.equal(engine.getSupportStatus().code, "dispose-stop-failed");
    assert.equal(engine.dispose().ok, false); assert.equal(recorder.stops, 1);
    assert.equal(h.created.length, 0); h.faults.stop = false; h.init();
    const next = h.start(); invokeOld(old); assert.equal(next.state, "recording");
    assert.equal(h.recording.phase, "recording");
  });
}

for (const handler of ["ondataavailable", "onstop", "onerror"]) {
  test(`RC-19: exceptional ${handler} detachment still fences callbacks and releases remaining ownership`, async t => {
    const h = await harness(t), recorder = h.start(), old = recorder.handlers(); h.faults.handler = handler;
    const result = engine.dispose();
    assert.equal(result.ok, false); assert.equal(result.code, "dispose-cleanup-failed");
    assert.equal(recorder.state, "inactive"); assert.equal(recorder.stops, 1); assertReleased(h);
    for (const name of ["ondataavailable", "onstop", "onerror"].filter(name => name !== handler)) assert.equal(recorder[name], null);
    const status = { ...h.recording }; invokeOld(old); assert.deepEqual(h.recording, status);
    assert.equal(h.upstreamTrack.stops, 0); assert.equal(h.created.length, 0);
  });
}

test("RC-19: throwing audio-owner cleanup never falls back to stopping shared upstream tracks", async t => {
  const h = await harness(t), recorder = h.start(); h.faults.release = true;
  const result = engine.dispose(); assert.equal(result.ok, false); assert.equal(result.code, "dispose-cleanup-failed");
  assert.equal(recorder.state, "inactive"); assertReleased(h);
  assert.equal(h.upstreamTrack.stops, 0); assert.equal(h.audio.sample().ready, true);
});

test("RC-19: file playback tap is released by AudioEngine without disturbing playback or analysis", async t => {
  const h = await harness(t, "file"), recorder = h.start();
  const ownedAudio = recorder.stream.getAudioTracks()[0]; assert.equal(ownedAudio, h.tapTracks[0]);
  const before = h.graphBefore(); engine.dispose(); assertReleased(h);
  assert.equal(ownedAudio.stops, 1); assert.equal(ownedAudio.readyState, "ended"); assert.equal(h.releases, 1);
  assert.equal(h.playback.pauseCalls, 0); assert.equal(h.playback.paused, false);
  assert.equal(h.audio.getMediaEl(), h.playback); assert.equal(state.audio.isLoaded, true);
  assert.equal(state.audio.isPlaying, true); assert.equal(h.audio.sample().ready, true);
  for (const entry of before.filter(entry => entry.node.source || typeof entry.node.getFloatTimeDomainData === "function")) {
    assert.equal(entry.node.disconnects, entry.disconnects); assert.deepEqual(entry.node.connections, entry.connections);
  }
  engine.dispose(); assert.equal(ownedAudio.stops, 1); assert.equal(h.acquisitions, 1);
});

for (const fault of ["capture", "constructor", "start"]) {
  test(`RC-19: failed ${fault} acquisition/start then disposal creates no export or native stop`, async t => {
    const h = await harness(t); h.faults[fault] = true;
    assert.equal(engine.start().ok, false); assert.equal(h.recording.phase, "error");
    assert.equal(engine.dispose().ok, true); assertReleased(h);
    assert.ok(h.recorders.every(recorder => recorder.stops === 0));
    assert.equal(h.upstreamTrack.stops, 0); assert.deepEqual(h.created, []);
  });
}

test("RC-19: native error then dispose is terminal and cannot resurrect an export", async t => {
  const h = await harness(t), recorder = h.start(), old = recorder.handlers(); recorder.data("discard"); recorder.error();
  assert.equal(h.recording.phase, "error"); engine.dispose(); assertReleased(h);
  const status = { ...h.recording }; invokeOld(old); assert.deepEqual(h.recording, status);
  assert.equal(recorder.stops, 0); assert.equal(h.upstreamTrack.stops, 0); assert.deepEqual(h.created, []);
});
