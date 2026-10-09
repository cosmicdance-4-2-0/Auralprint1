import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../src/js/core/state.js";
import { createInputSourceManager } from "../src/js/audio/input-source-manager.js";

let engineId = 0;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function harness(t) {
  const { AudioEngine: engine } = await import(`../src/js/audio/audio-engine.js?rc04=${engineId++}`);
  const previous = { window: globalThis.window, document: globalThis.document,
    audio: state.audio, source: structuredClone(state.source) };
  state.audio = { isLoaded: false, isPlaying: false, filename: "", transportError: "" };
  let context;
  const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
  class AudioContext {
    constructor() { context = this; this.state = "running"; this.sampleRate = 48000; this.destination = node(); }
    resume() {
      const pending = this.pendingResume;
      this.pendingResume = null;
      if (pending) {
        pending.entered.resolve();
        return pending.promise.then(() => { this.state = "running"; });
      }
      this.state = "running";
      return Promise.resolve();
    }
    createMediaElementSource() { return node(); }
    createMediaStreamSource() { return node(); }
    createChannelSplitter() { return node(); }
    createGain() { return node({ gain: { value: 1 } }); }
    createAnalyser() { return node({ fftSize: 2048, frequencyBinCount: 1024,
      getFloatTimeDomainData(buffer) { buffer.fill(0); }, getFloatFrequencyData(buffer) { buffer.fill(-100); } }); }
  }
  class MediaElement extends EventTarget {
    constructor() {
      super(); this._paused = true; this.src = ""; this.currentTime = 0;
      this.calls = { play: 0, pause: 0, paused: 0 };
    }
    get paused() { this.calls.paused++; return this._paused; }
    play() {
      this.calls.play++;
      if (this.pendingPlay) {
        this.pendingPlay.entered.resolve();
        return this.pendingPlay.promise;
      }
      this._paused = false;
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    }
    pause() { this.calls.pause++; this._paused = true; this.dispatchEvent(new Event("pause")); }
    removeAttribute(name) { if (name === "src") this.src = ""; }
    load() {}
  }
  globalThis.window = { AudioContext };
  globalThis.document = { createElement(tag) { assert.equal(tag, "audio"); return new MediaElement(); } };
  const manager = createInputSourceManager({ audioEngine: engine });
  t.after(async () => {
    await manager.teardownActiveSource({ reason: "test-cleanup" });
    state.audio = previous.audio;
    Object.assign(state.source, previous.source);
    globalThis.window = previous.window;
    globalThis.document = previous.document;
  });
  async function load(name, playing = false) {
    const file = Object.assign(new Blob(["audio"], { type: "audio/wav" }), { name });
    assert.equal((await manager.activateFile(file, { autoPlay: playing })).ok, true);
    return engine.getMediaEl();
  }
  function holdResume() {
    const held = { ...deferred(), entered: deferred() };
    context.state = "suspended";
    context.pendingResume = held;
    return held;
  }
  function holdPlay(target) {
    return target.pendingPlay = { ...deferred(), entered: deferred() };
  }
  function observeCommits() {
    const writes = [];
    state.audio = new Proxy(state.audio, {
      set(object, key, value) { writes.push({ key, value }); object[key] = value; return true; },
    });
    return writes;
  }
  return { engine, manager, load, holdResume, holdPlay, observeCommits,
    get context() { return context; },
    async clear() {
      await manager.teardownActiveSource({ reason: "clear-queue" });
      // The UI Clear workflow owns these file metadata resets after unload.
      Object.assign(state.audio, { isLoaded: false, isPlaying: false, filename: "", transportError: "" });
    } };
}

function snapshot() { return { audio: { ...state.audio }, source: structuredClone(state.source) }; }
function assertCleared(engine) {
  assert.equal(engine.getMediaEl(), null);
  assert.equal(engine.sample().ready, false);
  assert.deepEqual(state.audio, { isLoaded: false, isPlaying: false, filename: "", transportError: "" });
  assert.equal(state.source.kind, "none");
  assert.equal(state.source.status, "idle");
  assert.equal(state.source.errorMessage, "");
}

for (const outcome of ["resolve", "reject"]) {
  test(`RC-04: Clear during delayed Play ${outcome} leaves the workflow idle without commits`, async t => {
    const h = await harness(t), target = await h.load("A.wav"), held = h.holdPlay(target);
    const pending = h.engine.playPause();
    await held.entered.promise;
    await h.clear();
    assertCleared(h.engine);
    const before = snapshot(), calls = { ...target.calls }, writes = h.observeCommits();
    if (outcome === "reject") held.reject(new Error("obsolete playback failure"));
    else held.resolve();
    await pending;
    assertCleared(h.engine);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(target.calls, calls, "stale target is neither read nor acted on");
    assert.deepEqual(writes, [], "stale success/failure cannot even rewrite canonical values");
  });
}

test("RC-04: Clear during delayed resume never invokes old Play", async t => {
  const h = await harness(t), target = await h.load("A.wav"), held = h.holdResume();
  const pending = h.engine.playPause();
  await held.entered.promise;
  await h.clear();
  const before = snapshot(), calls = { ...target.calls }, writes = h.observeCommits();
  held.resolve();
  await pending;
  assertCleared(h.engine);
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(target.calls, calls);
  assert.equal(target.calls.play, 0);
  assert.deepEqual(writes, []);
});

for (const playing of [false, true]) {
  test(`RC-04: replacement (${playing ? "playing" : "paused"}) during resume retains ownership`, async t => {
    const h = await harness(t), target = await h.load("A.wav"), held = h.holdResume();
    const pending = h.engine.playPause();
    await held.entered.promise;
    const replacement = await h.load("B.wav", playing);
    assert.notEqual(replacement, target, "file loads allocate a fresh element");
    const before = snapshot(), aCalls = { ...target.calls }, bCalls = { ...replacement.calls };
    const writes = h.observeCommits();
    held.resolve();
    await pending;
    assert.equal(h.engine.getMediaEl(), replacement);
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(target.calls, aCalls);
    assert.deepEqual(replacement.calls, bCalls, "replacement is neither read, played nor paused");
    assert.deepEqual(writes, []);
  });
  for (const outcome of ["resolve", "reject"]) {
    test(`RC-04: replacement (${playing ? "playing" : "paused"}) during Play ${outcome} retains ownership`, async t => {
      const h = await harness(t), target = await h.load("A.wav"), held = h.holdPlay(target);
      const pending = h.engine.playPause();
      await held.entered.promise;
      const replacement = await h.load("B.wav", playing);
      // A replacement's own truthful error must also survive a stale result.
      state.audio.transportError = "replacement-owned diagnostic";
      const before = snapshot(), aCalls = { ...target.calls }, bCalls = { ...replacement.calls };
      const writes = h.observeCommits();
      if (outcome === "reject") held.reject(new Error("obsolete playback failure"));
      else { target._paused = !playing; held.resolve(); }
      await pending;
      assert.equal(h.engine.getMediaEl(), replacement);
      assert.deepEqual(snapshot(), before);
      assert.deepEqual(target.calls, aCalls);
      assert.deepEqual(replacement.calls, bCalls);
      assert.deepEqual(writes, []);
    });
  }
}

test("RC-04: ordinary Play succeeds and clears the current playback error", async t => {
  const h = await harness(t), target = await h.load("A.wav");
  state.audio.transportError = "previous error";
  await h.engine.playPause();
  assert.equal(target.calls.play, 1);
  assert.equal(target.paused, false);
  assert.equal(state.audio.isPlaying, true);
  assert.equal(state.audio.transportError, "");
});

test("RC-04: ordinary Pause is synchronous and reflects the current element", async t => {
  const h = await harness(t), target = await h.load("A.wav", true);
  const pending = h.engine.playPause();
  assert.equal(target.calls.pause, 1);
  assert.equal(target.paused, true);
  assert.equal(state.audio.isPlaying, false);
  await pending;
});

test("RC-04: current Play rejection retains truthful playback failure", async t => {
  const h = await harness(t), target = await h.load("A.wav"), held = h.holdPlay(target);
  const pending = h.engine.playPause();
  await held.entered.promise;
  held.reject(new Error("current playback failure"));
  await pending;
  assert.equal(h.engine.getMediaEl(), target);
  assert.equal(state.audio.isLoaded, true);
  assert.equal(state.audio.isPlaying, false);
  assert.equal(state.audio.transportError, "Playback failed: current playback failure");
});

test("RC-04: Play with no loaded element is a quiet no-op", async t => {
  const h = await harness(t), before = snapshot(), writes = h.observeCommits();
  await h.engine.playPause();
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(writes, []);
});

test("AUD-002: current Play resume failure retains File/media/session and retry clears its error", async t => {
  const h = await harness(t), target = await h.load("A.wav"), held = h.holdResume();
  const source = structuredClone(state.source), calls = { ...target.calls };
  const pending = h.engine.playPause(); await held.entered.promise;
  held.reject(new Error("current context resume refused"));
  await assert.doesNotReject(async () => { await pending; });
  assert.equal(h.engine.getMediaEl(), target); assert.deepEqual(state.source, source);
  assert.equal(state.audio.isLoaded, true); assert.equal(state.audio.filename, "A.wav");
  assert.equal(state.audio.isPlaying, false); assert.equal(target._paused, true);
  assert.equal(state.audio.transportError, "Playback failed: AudioContext could not start: current context resume refused");
  assert.equal(target.calls.play, calls.play); assert.equal(target.calls.pause, calls.pause);
  assert.equal(h.engine.sample().ready, true);
  await h.engine.playPause();
  assert.equal(h.engine.getMediaEl(), target); assert.equal(target.calls.play, calls.play + 1);
  assert.equal(state.audio.isPlaying, true); assert.equal(state.audio.transportError, "");
});

for (const action of ["clear", "replacement"]) {
  test(`AUD-002: obsolete Play resume rejects after ${action} without reads or writes`, async t => {
    const h = await harness(t), target = await h.load("A.wav"), held = h.holdResume();
    const pending = h.engine.playPause(); await held.entered.promise;
    let replacement;
    if (action === "clear") await h.clear(); else replacement = await h.load("B.wav", true);
    state.audio.transportError = "winner-owned error";
    const before = snapshot(), calls = { ...target.calls }, winnerCalls = replacement ? { ...replacement.calls } : null;
    const writes = h.observeCommits();
    held.reject(new Error("obsolete resume refused"));
    await assert.doesNotReject(async () => { await pending; }, "obsolete rejection must be contained");
    assert.deepEqual(snapshot(), before); assert.deepEqual(writes, []);
    assert.deepEqual(target.calls, calls, "no obsolete paused read, play or pause");
    if (replacement) assert.deepEqual(replacement.calls, winnerCalls);
  });
}

for (const kind of ["mic", "stream"]) {
  test(`AUD-002: obsolete Play resume rejects after File to ${kind} without touching winner`, async t => {
    const h = await harness(t), target = await h.load("A.wav"), held = h.holdResume();
    const pending = h.engine.playPause(); await held.entered.promise;
    const track = Object.assign(new EventTarget(), { readyState: "live", stops: 0, stop() { this.stops++; } });
    const stream = Object.assign(new EventTarget(), { getTracks() { return [track]; }, getAudioTracks() { return [track]; }, getVideoTracks() { return []; } });
    // Existing manager seam represents the live owner's registered native stream.
    assert.equal(h.manager.registerFutureStreamSession(kind, stream, { label: kind }).ok, true);
    await h.engine.attachMediaStreamSource(stream, { kind });
    const before = snapshot(), calls = { ...target.calls }, writes = h.observeCommits();
    held.reject(new Error("obsolete resume refused"));
    await assert.doesNotReject(async () => { await pending; });
    assert.deepEqual(snapshot(), before); assert.deepEqual(writes, []); assert.deepEqual(target.calls, calls);
    assert.equal(track.stops, 0); assert.equal(h.engine.getMediaEl(), null); assert.equal(h.engine.sample().ready, true);
  });
}

test("AUD-002: synchronous current native Play throw is a recoverable media error", async t => {
  const h = await harness(t), target = await h.load("A.wav");
  t.mock.method(target, "play", () => { throw new Error("native Play threw"); });
  await assert.doesNotReject(() => h.engine.playPause());
  assert.equal(h.engine.getMediaEl(), target); assert.equal(state.audio.isLoaded, true);
  assert.equal(state.audio.isPlaying, false); assert.match(state.audio.transportError, /native Play threw/);
});

test("AUD-002: Play retry after failed resume and File replacement acts only on replacement", async t => {
  const h = await harness(t), old = await h.load("A.wav"), held = h.holdResume();
  const pending = h.engine.playPause(); await held.entered.promise;
  held.reject(new Error("resume refused")); await pending;
  const replacement = await h.load("B.wav"), calls = { ...old.calls };
  assert.equal(state.audio.transportError, "");
  await h.engine.playPause();
  assert.equal(h.engine.getMediaEl(), replacement); assert.equal(state.audio.filename, "B.wav");
  assert.equal(state.audio.isPlaying, true); assert.deepEqual(old.calls, calls);
});
