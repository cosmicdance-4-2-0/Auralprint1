import test from "node:test";
import assert from "node:assert/strict";
import { state, createSourceState } from "../src/js/core/state.js";
import { createInputSourceManager } from "../src/js/audio/input-source-manager.js";

let engineId = 0;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function harness(t) {
  const { AudioEngine: engine } = await import(`../src/js/audio/audio-engine.js?aud001=${engineId++}`);
  const previous = { window: globalThis.window, document: globalThis.document, URL: globalThis.URL,
    audio: state.audio, source: state.source };
  state.audio = { isLoaded: false, isPlaying: false, filename: "", transportError: "" };
  state.source = createSourceState();
  const nodes = [], elements = [], revoked = [], resumeModes = [];
  let context, current = 1;
  const node = (extra = {}) => {
    const value = { connections: [], disconnects: 0,
      connect(to) { this.connections.push(to); },
      disconnect() { this.disconnects++; this.connections = []; }, ...extra };
    nodes.push(value); return value;
  };
  class AudioContext {
    constructor() { context = this; this.state = "suspended"; this.sampleRate = 48000; this.destination = node(); }
    resume() {
      const mode = resumeModes.shift();
      if (mode === "skip") return Promise.resolve();
      if (mode) { mode.entered.resolve(); return mode.promise.then(() => { this.state = "running"; }); }
      this.state = "running"; return Promise.resolve();
    }
    createMediaElementSource(media) { return node({ media }); }
    createMediaStreamSource(stream) { return node({ stream }); }
    createChannelSplitter() { return node(); }
    createGain() { return node({ gain: { value: 1 } }); }
    createAnalyser() { return node({ fftSize: 2048, frequencyBinCount: 1024 }); }
  }
  class MediaElement extends EventTarget {
    constructor() { super(); this.paused = true; this.src = ""; this.currentTime = 0; this.callbacks = []; this.calls = { play: 0, pause: 0, load: 0 }; }
    addEventListener(type, callback, options) {
      this.callbacks.push({ type, callback, signal: options.signal });
      super.addEventListener(type, callback, options);
    }
    play() { this.calls.play++; this.paused = false; this.dispatchEvent(new Event("play")); return Promise.resolve(); }
    pause() { this.calls.pause++; this.paused = true; this.dispatchEvent(new Event("pause")); }
    removeAttribute(name) { if (name === "src") this.src = ""; }
    load() { this.calls.load++; }
  }
  globalThis.window = { AudioContext };
  globalThis.document = { createElement(tag) { assert.equal(tag, "audio"); const el = new MediaElement(); elements.push(el); return el; } };
  globalThis.URL = { createObjectURL() { return `blob:candidate-${elements.length}`; }, revokeObjectURL(url) { revoked.push(url); } };
  engine._isLoadRequestCurrent = id => id === current;
  const streams = {};
  for (const kind of ["mic", "stream"]) {
    const track = Object.assign(new EventTarget(), { readyState: "live", stops: 0,
      stop() { this.stops++; this.readyState = "ended"; }, getSettings() { return { channelCount: 1 }; } });
    streams[kind] = Object.assign(new EventTarget(), {
      getTracks() { return [track]; }, getAudioTracks() { return [track]; }, getVideoTracks() { return []; } });
  }
  const manager = createInputSourceManager({ audioEngine: engine, mediaDevices: {
    async getUserMedia() { return streams.mic; }, async getDisplayMedia() { return streams.stream; },
  } });
  t.after(async () => {
    await manager.teardownActiveSource({ reason: "test-cleanup" });
    state.audio = previous.audio; state.source = previous.source;
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.URL = previous.URL;
  });
  const load = (name, id = current) => manager.activateFile({ name }, { requestId: id });
  function observeWrites() {
    const writes = [];
    for (const key of ["audio", "source"]) state[key] = new Proxy(state[key], {
      set(object, field, value) { writes.push({ key, field, value }); object[field] = value; return true; },
    });
    return writes;
  }
  function holdSecondResume(first = false) {
    const held = { ...deferred(), entered: deferred() };
    if (!first) resumeModes.push("skip");
    resumeModes.push(held); return held;
  }
  return { engine, manager, elements, nodes, revoked, streams, load, observeWrites, holdSecondResume,
    select(id) { current = id; }, get context() { return context; } };
}

for (const outcome of ["resolve", "reject"]) {
  test(`AUD-001: stale second resume ${outcome} cannot replace, play, disconnect or revoke winner`, async t => {
    const h = await harness(t), held = h.holdSecondResume();
    const pending = h.load("A.wav", 1);
    await held.entered.promise;
    const loser = h.elements[0];
    assert.equal(h.engine.getMediaEl(), null);
    h.select(2); assert.equal((await h.load("B.wav", 2)).ok, true);
    const winner = h.engine.getMediaEl(), winnerUrl = winner.src;
    const nodes = h.nodes.map(node => ({ node, disconnects: node.disconnects, connections: [...node.connections] }));
    const before = { audio: { ...state.audio }, source: structuredClone(state.source), calls: { ...winner.calls } };
    const writes = h.observeWrites();
    let ended = 0, errors = 0;
    h.engine._onTrackEnded = () => ended++;
    h.engine._onFilePlaybackError = () => errors++;
    // Dispatch native-shaped events while the old candidate is still unattached.
    for (const type of ["play", "pause", "ended", "error", "loadeddata"]) loser.dispatchEvent(new Event(type));
    assert.deepEqual(writes, [], "pending candidate events cannot make transient stale writes");
    if (outcome === "resolve") held.resolve(); else held.reject(new Error("obsolete attachment failed"));
    assert.equal(await pending, false);
    assert.equal(h.engine.getMediaEl() === winner, true, "authorized winner remains installed");
    assert.deepEqual({ ...state.audio }, before.audio);
    assert.deepEqual(structuredClone({ ...state.source }), before.source);
    assert.deepEqual(writes, [], "stale attachment catch cannot even rewrite equivalent state");
    assert.equal(loser.calls.play, 0);
    assert.equal(loser.calls.pause, 1);
    assert.equal(loser.calls.load, 1);
    assert.equal(loser.src, "");
    assert.ok(loser.callbacks.every(x => x.signal.aborted));
    // A callback already queued before abort still has an ownership guard.
    for (const { callback } of loser.callbacks) callback();
    assert.deepEqual(writes, []);
    assert.equal(ended, 0); assert.equal(errors, 0);
    assert.deepEqual(winner.calls, before.calls);
    assert.equal(winner.src, winnerUrl);
    assert.ok(!h.revoked.includes(winnerUrl), "loser cleanup never revokes winner URL");
    for (const saved of nodes) {
      assert.equal(saved.node.disconnects, saved.disconnects);
      assert.deepEqual(saved.node.connections, saved.connections);
    }
  });
}

for (const kind of ["mic", "stream"]) for (const boundary of ["initial", "attachment"]) {
  test(`AUD-001: pending File ${boundary} cannot reclaim ${kind} or release its tracks`, async t => {
    const h = await harness(t), held = h.holdSecondResume(boundary === "initial");
    const pending = h.load("A.wav"); await held.entered.promise;
    h.select(2);
    const result = await (kind === "mic" ? h.manager.activateMic() : h.manager.activateStream());
    assert.equal(result.ok, true);
    const writes = h.observeWrites(), disconnects = h.nodes.map(n => n.disconnects);
    held.resolve(); assert.equal(await pending, false);
    assert.deepEqual(writes, []);
    assert.equal(state.source.kind, kind); assert.equal(state.source.status, "active");
    assert.equal(h.engine.getMediaEl(), null);
    assert.deepEqual(h.nodes.map(n => n.disconnects), disconnects);
    for (const track of h.streams[kind].getTracks()) { assert.equal(track.stops, 0); assert.equal(track.readyState, "live"); }
  });
}

test("AUD-001: current attachment and callbacks retain ordinary File behavior", async t => {
  const h = await harness(t);
  assert.equal((await h.load("A.wav")).ok, true);
  const media = h.engine.getMediaEl();
  assert.equal(state.audio.isLoaded, true); assert.equal(state.audio.isPlaying, true);
  assert.equal(media.calls.play, 1);
  media.pause(); assert.equal(state.audio.isPlaying, false);
  await media.play(); assert.equal(state.audio.isPlaying, true);
  let ended = 0; h.engine._onTrackEnded = () => ended++;
  media.dispatchEvent(new Event("ended")); assert.equal(ended, 1); assert.equal(state.audio.isPlaying, false);
  media.dispatchEvent(new Event("error"));
  assert.equal(state.audio.isLoaded, false); assert.match(state.audio.transportError, /unsupported/);
});
