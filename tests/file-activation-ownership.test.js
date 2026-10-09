import test from "node:test";
import assert from "node:assert/strict";
import { state, createSourceState } from "../src/js/core/state.js";
import { createInputSourceManager } from "../src/js/audio/input-source-manager.js";
import { readFile } from "node:fs/promises";

let engineId = 0;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function harness(t, { constructorFailure = false, observeResources = false } = {}) {
  let moduleUrl = `../src/js/audio/audio-engine.js?aud001=${engineId++}`;
  if (observeResources) {
    // Read-only test instrumentation; production graph/control flow is intact.
    const sourceUrl = new URL("../src/js/audio/audio-engine.js", import.meta.url);
    let source = await readFile(sourceUrl, "utf8");
    source = source.replace(/from "(\.\.?\/[^\"]+)"/g, (_, path) => `from "${new URL(path, sourceUrl)}"`);
    assert.equal(source.split("    getRecorderTap() {").length, 2);
    source = source.replace("    getRecorderTap() {", "    __resources() { return {sourceNode, outputGain, splitter, sumNode, sumGainL, sumGainR, bands, activeUpstream, mediaElAbort, mediaObjectUrl}; },\n    getRecorderTap() {");
    moduleUrl = `data:text/javascript;base64,${Buffer.from(source + `\n// test ${engineId}`).toString("base64")}`;
  }
  const { AudioEngine: engine } = await import(moduleUrl);
  const previous = { window: globalThis.window, document: globalThis.document, URL: globalThis.URL,
    audio: state.audio, source: state.source };
  state.audio = { isLoaded: false, isPlaying: false, filename: "", transportError: "" };
  state.source = createSourceState();
  const nodes = [], elements = [], revoked = [], resumeModes = [];
  let context, current = 1;
  const faults = { constructorFailure, constructorCalls: 0 };
  const allocate = kind => { if (faults.allocate) faults.allocate(kind); };
  const node = (extra = {}) => {
    const value = { connections: [], disconnects: 0,
      connect(to) { if (faults.connect) faults.connect(this, to); this.connections.push(to); },
      disconnect() { this.disconnects++; this.connections = []; }, ...extra };
    nodes.push(value); return value;
  };
  class AudioContext {
    constructor() {
      faults.constructorCalls++;
      if (faults.constructorFailure) throw Object.assign(new Error("constructor refused"), { name: "NotSupportedError" });
      context = this; this.state = "suspended"; this.sampleRate = 48000; this.destination = node({ kind: "destination" });
    }
    resume() {
      const mode = resumeModes.shift();
      if (mode === "skip") return Promise.resolve();
      if (mode) { mode.entered.resolve(); return mode.promise.then(() => { this.state = "running"; }); }
      this.state = "running"; return Promise.resolve();
    }
    createMediaElementSource(media) { allocate("source"); return node({ kind: "source", media }); }
    createMediaStreamSource(stream) { return node({ kind: "live", stream }); }
    createChannelSplitter() { allocate("splitter"); return node({ kind: "splitter" }); }
    createGain() { allocate("gain"); return node({ kind: "gain", gain: { value: 1 } }); }
    createAnalyser() {
      allocate("analyser");
      const a = node({ kind: "analyser", fftSize: 2048, frequencyBinCount: 1024,
        getFloatTimeDomainData(b) { b.fill(0); }, getFloatFrequencyData(b) { b.fill(-100); } });
      if (faults.analyserSetup) faults.analyserSetup(a);
      return a;
    }
    createMediaStreamDestination() {
      const track = { stops: 0, stop() { this.stops++; } };
      return node({ kind: "tap", stream: { getTracks() { return [track]; }, getAudioTracks() { return [track]; } } });
    }
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
  globalThis.document = { createElement(tag) { assert.equal(tag, "audio"); const el = new MediaElement(); elements.push(el); faults.media?.(el); return el; } };
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
  const load = (name, id = current, options = {}) => manager.activateFile({ name }, { requestId: id, ...options });
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
  return { engine, manager, elements, nodes, revoked, streams, load, observeWrites, holdSecondResume, faults,
    queueResume(mode) { resumeModes.push(mode); },
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

for (const fault of ["constructor", "initial-resume", "attachment-resume"]) {
  test(`AUD-002: current ${fault} failure settles once and permits valid retry`, async t => {
    const h = await harness(t, { constructorFailure: fault === "constructor" });
    let held;
    if (fault !== "constructor") held = h.holdSecondResume(fault === "initial-resume");
    const pending = h.load("A.wav");
    if (held) { await held.entered.promise; held.reject(new Error("resume refused")); }
    const result = await pending;
    assert.equal(result.ok, false); assert.equal(result.errorCode, "file-activation-failed");
    assert.ok(result.errorMessage);
    assert.equal(state.source.kind, "file"); assert.equal(state.source.status, "error");
    assert.equal(state.source.sessionActive, false);
    assert.equal(state.source.streamMeta.hasAudio, false); assert.equal(state.source.streamMeta.hasVideo, false);
    assert.equal(state.audio.isLoaded, false); assert.equal(state.audio.isPlaying, false);
    assert.equal(state.audio.filename, ""); assert.ok(state.audio.transportError);
    assert.equal(h.engine.getMediaEl(), null); assert.equal(h.engine.sample().ready, false);
    if (fault !== "attachment-resume") {
      assert.equal(h.elements.length, 0); assert.equal(h.revoked.length, 0, "startup allocated no media/URL");
    } else {
      assert.equal(h.elements.length, 1); assert.equal(h.elements[0].src, "");
      assert.ok(h.elements[0].callbacks.every(x => x.signal.aborted));
    }
    const cached = h.context;
    h.faults.constructorFailure = false;
    h.select(2);
    assert.equal((await h.load("A.wav", 2)).ok, true);
    assert.equal(state.source.status, "active"); assert.equal(state.source.errorCode, "");
    assert.equal(state.audio.filename, "A.wav"); assert.equal(state.audio.isLoaded, true);
    assert.equal(state.audio.isPlaying, true); assert.equal(state.audio.transportError, "");
    if (cached) assert.equal(h.context, cached, "resume retry reuses the existing context");
  });
}

for (const winner of ["clear", "file", "mic", "stream"]) for (const outcome of ["resolve", "reject"]) {
  test(`AUD-002: obsolete initial resume ${outcome} after ${winner} settles without writes or resources`, async t => {
    const h = await harness(t), held = h.holdSecondResume(true);
    const pending = h.load("obsolete.wav"); await held.entered.promise;
    h.select(2);
    if (winner === "clear") await h.manager.teardownActiveSource({ reason: "clear" });
    else if (winner === "file") assert.equal((await h.load("winner.wav", 2)).ok, true);
    else assert.equal((await (winner === "mic" ? h.manager.activateMic() : h.manager.activateStream())).ok, true);
    state.audio.transportError = "winner-owned error";
    const media = h.engine.getMediaEl(), calls = media ? { ...media.calls } : null;
    const before = { audio: { ...state.audio }, source: structuredClone(state.source), resources: h.elements.length };
    const disconnects = h.nodes.map(n => n.disconnects), revokes = [...h.revoked], writes = h.observeWrites();
    if (outcome === "reject") held.reject(new Error("obsolete resume refused")); else held.resolve();
    let result;
    await assert.doesNotReject(async () => { result = await pending; }, "obsolete startup rejection must settle");
    assert.equal(result, false);
    assert.deepEqual(writes, []);
    assert.deepEqual({ ...state.audio }, before.audio);
    assert.deepEqual({ ...state.source }, before.source);
    assert.equal(h.engine.getMediaEl(), media);
    if (media) assert.deepEqual(media.calls, calls);
    assert.equal(h.elements.length, before.resources, "obsolete startup cannot allocate a candidate");
    assert.deepEqual(h.revoked, revokes); assert.deepEqual(h.nodes.map(n => n.disconnects), disconnects);
    if (winner === "mic" || winner === "stream") for (const track of h.streams[winner].getTracks()) assert.equal(track.stops, 0);
  });
}

test("AUD-002: engine constructor failure is a controlled false outcome before media allocation", async t => {
  const h = await harness(t, { constructorFailure: true });
  let result;
  await assert.doesNotReject(async () => { result = await h.engine.loadFile({ name: "A.wav" }, 1); });
  assert.equal(result, false); assert.equal(state.audio.isLoaded, false);
  assert.match(state.audio.transportError, /AudioContext could not start: constructor refused/);
  assert.equal(h.elements.length, 0); assert.equal(h.revoked.length, 0);
});

test("AUD-002: engine initial resume failure is a controlled false outcome", async t => {
  const h = await harness(t), held = h.holdSecondResume(true);
  const pending = h.engine.loadFile({ name: "A.wav" }, 1);
  await held.entered.promise; held.reject(new Error("initial resume refused"));
  let result;
  await assert.doesNotReject(async () => { result = await pending; });
  assert.equal(result, false); assert.equal(state.audio.isLoaded, false); assert.equal(state.audio.isPlaying, false);
  assert.equal(state.audio.transportError, "Playback failed: AudioContext could not start: initial resume refused");
  assert.equal(h.elements.length, 0); assert.equal(h.engine.getMediaEl(), null);
});

test("AUD-002: failure followed by different File retains only its new resources", async t => {
  const h = await harness(t), held = h.holdSecondResume(true);
  const pending = h.load("A.wav"); await held.entered.promise; held.reject(new Error("refused"));
  assert.equal((await pending).ok, false);
  h.select(2); assert.equal((await h.load("B.wav", 2)).ok, true);
  assert.equal(state.audio.filename, "B.wav"); assert.equal(state.source.label, "B.wav");
  assert.equal(h.elements.length, 1); assert.equal(h.engine.getMediaEl(), h.elements[0]);
  assert.deepEqual(h.revoked, []);
});

test("AUD-002: already stale constructor request never starts context creation", async t => {
  const h = await harness(t, { constructorFailure: true }); h.select(2);
  const writes = h.observeWrites();
  assert.equal(await h.engine.loadFile({ name: "obsolete.wav" }, 1), false);
  assert.equal(h.faults.constructorCalls, 0); assert.deepEqual(writes, []);
});

test("AUD-002: closed cached context reports failure without pretending retry recreated it", async t => {
  const h = await harness(t); assert.equal((await h.load("A.wav")).ok, true);
  const cached = h.context; cached.state = "closed"; h.select(2);
  assert.equal((await h.load("B.wav", 2)).ok, false);
  assert.equal(state.source.status, "error"); assert.equal(state.audio.isLoaded, false);
  assert.match(state.audio.transportError, /AudioContext is closed/);
  assert.equal(h.context, cached); assert.equal(h.faults.constructorCalls, 1);
});

test("AUD-002: direct engine obsolete initial rejection returns false without escaping", async t => {
  const h = await harness(t), held = h.holdSecondResume(true);
  const pending = h.engine.loadFile({ name: "A.wav" }, 1);
  await held.entered.promise; h.select(2);
  assert.equal((await h.load("B.wav", 2)).ok, true);
  const media = h.engine.getMediaEl(), writes = h.observeWrites();
  held.reject(new Error("obsolete initial resume refused"));
  let result;
  await assert.doesNotReject(async () => { result = await pending; });
  assert.equal(result, false); assert.deepEqual(writes, []);
  assert.equal(h.engine.getMediaEl(), media); assert.equal(state.audio.filename, "B.wav");
});

function assertFailedResourcesReleased(h, media) {
  // Observe the terminal boundary before retry, Clear or the harness's teardown.
  assert.equal(h.engine.getMediaEl() === null, true, "failed media is not installed");
  assert.equal(h.engine.sample().ready, false, "failed graph is not ready");
  const resources = h.engine.__resources();
  for (const key of ["sourceNode", "outputGain", "splitter", "sumNode", "sumGainL", "sumGainR", "activeUpstream", "mediaElAbort", "mediaObjectUrl"]) {
    assert.equal(resources[key] === null, true, `${key} reference released`);
  }
  assert.equal(resources.bands.size, 0);
  assert.equal(media.src, "");
  assert.equal(media.calls.pause, 1); assert.equal(media.calls.load, 1);
  assert.ok(media.callbacks.every(x => x.signal.aborted));
  assert.equal(h.revoked.filter(x => x === "blob:candidate-1").length, 1);
  for (const n of h.nodes.filter(x => !["destination", "tap"].includes(x.kind))) {
    assert.equal(n.disconnects, 1, `allocated ${n.kind} disconnected once`);
    assert.deepEqual(n.connections, []);
  }
  assert.equal(state.source.status, "error"); assert.equal(state.source.sessionActive, false);
  assert.equal(state.source.errorCode, "file-activation-failed");
  assert.ok(state.source.errorMessage); assert.equal(state.source.errorMessage, state.audio.transportError);
  assert.equal(state.audio.isLoaded, false); assert.equal(state.audio.isPlaying, false);
  assert.equal(state.audio.filename, "");
}

for (const boundary of ["before-transfer", "first-gain", "partial-gains", "partial-analysers", "analyser-setup", "connected-graph"]) {
  test(`F4-CLEANUP-01: ${boundary} attachment failure releases all owned nodes before retry`, async t => {
    const h = await harness(t, { observeResources: true });
    let gains = 0, analysers = 0;
    const refuse = () => { throw Object.assign(new Error(`${boundary} allocation refused`), { name: "NotSupportedError" }); };
    h.faults.allocate = kind => {
      if (kind === "gain") gains++;
      if (kind === "analyser") analysers++;
      if ((boundary === "before-transfer" && kind === "source") ||
          (boundary === "first-gain" && gains === 1) ||
          (boundary === "partial-gains" && gains === 4) ||
          (boundary === "partial-analysers" && analysers === 2)) refuse();
    };
    if (boundary === "analyser-setup") h.faults.analyserSetup = a => {
      Object.defineProperty(a, "fftSize", { set: refuse });
    };
    if (boundary === "connected-graph") h.faults.connect = (_, to) => { if (to === h.context.destination) refuse(); };
    assert.equal((await h.load("valid.wav")).ok, false);
    const failed = h.elements[0]; assertFailedResourcesReleased(h, failed);
    assert.match(state.audio.transportError, /audio source attachment failed/);
    assert.match(state.audio.transportError, new RegExp(`${boundary} allocation refused`));
    assert.doesNotMatch(state.audio.transportError, /unsupported or unreadable/);
    const calls = { ...failed.calls }, writes = h.observeWrites();
    for (const { callback } of failed.callbacks) callback();
    assert.deepEqual(writes, [], "callbacks queued before abort cannot resurrect failure");
    assert.deepEqual(failed.calls, calls);
    h.faults.allocate = h.faults.analyserSetup = h.faults.connect = null;
    h.select(2); assert.equal((await h.load("valid.wav", 2)).ok, true);
    assert.notEqual(h.engine.getMediaEl(), failed); assert.equal(state.audio.transportError, "");
  });
}

for (const ordering of ["native-error-before-rejection", "play-rejection-only"]) {
  test(`F4-CLEANUP-01: hard decoder ${ordering} cleans installed owner before any recovery`, async t => {
    const h = await harness(t, { observeResources: true }), held = { ...deferred(), entered: deferred() };
    let hooks = 0;
    h.manager.init();
    const errorHook = h.engine._onFilePlaybackError;
    h.engine._onFilePlaybackError = payload => { hooks++; return errorHook(payload); };
    h.faults.media = media => {
      media.play = () => { media.calls.play++; media.paused = false; held.entered.resolve(); return held.promise; };
    };
    const pending = h.load("corrupt.wav"); await held.entered.promise;
    const media = h.engine.getMediaEl(); assert.equal(media, h.elements[0]);
    if (ordering === "native-error-before-rejection") {
      media.error = { code: 4 }; media.dispatchEvent(new Event("error"));
      assert.equal(state.source.status, "requesting", "manager has not committed a File session");
    }
    held.reject(Object.assign(new Error("native decoder refused"), { name: "NotSupportedError" }));
    assert.equal((await pending).ok, false);
    assertFailedResourcesReleased(h, media); assert.match(state.audio.transportError, /unsupported or unreadable/);
    const before = { ...media.calls }, writes = h.observeWrites();
    for (const { callback } of media.callbacks) callback();
    assert.deepEqual(writes, []); assert.deepEqual(media.calls, before);
    assert.equal(hooks, ordering === "native-error-before-rejection" ? 1 : 0);
    // Later explicit Clear remains idempotent for the already released owner.
    await h.manager.teardownActiveSource({ reason: "clear" });
    assert.deepEqual(media.calls, before); assert.equal(state.source.status, "idle");
    h.faults.media = null; h.select(2); assert.equal((await h.load("B.wav", 2)).ok, true);
  });
}

test("F4-CLEANUP-01: native error after File session commitment uses manager cleanup once", async t => {
  const h = await harness(t, { observeResources: true });
  h.manager.init();
  assert.equal((await h.load("A.wav", 1, { autoPlay: false })).ok, true);
  const media = h.engine.getMediaEl(); media.error = { code: 4 }; media.dispatchEvent(new Event("error"));
  assert.equal(h.engine.getMediaEl() === null, true); assert.equal(h.engine.sample().ready, false);
  assert.equal(media.calls.pause, 1); assert.equal(media.calls.load, 1);
  assert.equal(state.source.errorCode, "file-playback-error");
  assert.equal(state.source.errorMessage, state.audio.transportError);
  const before = { ...media.calls }, writes = h.observeWrites();
  for (const { callback } of media.callbacks) callback();
  assert.deepEqual(writes, []); assert.deepEqual(media.calls, before);
});

for (const winner of ["file", "failed-file", "clear", "mic", "stream"]) {
  test(`F4-CLEANUP-01: obsolete hard failure cannot clean or rewrite ${winner} owner`, async t => {
    const h = await harness(t, { observeResources: true }), held = { ...deferred(), entered: deferred() };
    h.faults.media = media => {
      media.play = () => { media.calls.play++; held.entered.resolve(); return held.promise; };
    };
    const pending = h.load("A.wav"); await held.entered.promise;
    const loser = h.engine.getMediaEl(); h.select(2); h.faults.media = null;
    if (winner === "clear") await h.manager.teardownActiveSource({ reason: "clear" });
    else if (winner === "failed-file") {
      h.faults.allocate = kind => { if (kind === "gain") throw new Error("winner graph failed"); };
      assert.equal((await h.load("B.wav", 2)).ok, false);
    } else if (winner === "file") assert.equal((await h.load("B.wav", 2)).ok, true);
    else assert.equal((await (winner === "mic" ? h.manager.activateMic() : h.manager.activateStream())).ok, true);
    const media = h.engine.getMediaEl(), calls = media ? { ...media.calls } : null;
    const before = { audio: { ...state.audio }, source: structuredClone(state.source), loserCalls: { ...loser.calls }, revokes: [...h.revoked] };
    const nodes = h.nodes.map(n => ({ n, disconnects: n.disconnects, connections: [...n.connections] }));
    const writes = h.observeWrites();
    loser.error = { code: 4 };
    for (const { callback } of loser.callbacks) callback();
    held.reject(Object.assign(new Error("obsolete decoder refused"), { name: "NotSupportedError" }));
    assert.equal(await pending, false); assert.deepEqual(writes, []);
    assert.equal(h.engine.getMediaEl() === media, true); if (media) assert.deepEqual(media.calls, calls);
    assert.deepEqual({ ...state.audio }, before.audio); assert.deepEqual({ ...state.source }, before.source);
    assert.deepEqual(loser.calls, before.loserCalls, "already aborted loser is not released twice");
    assert.ok(h.revoked.slice(before.revokes.length).every(url => url === "blob:candidate-1"));
    for (const saved of nodes) {
      assert.equal(saved.n.disconnects, saved.disconnects); assert.deepEqual(saved.n.connections, saved.connections);
    }
    if (["mic", "stream"].includes(winner)) for (const track of h.streams[winner].getTracks()) assert.equal(track.stops, 0);
  });
}

test("F4-CLEANUP-01: failed File releases output but retains recorder tap for valid reconnection", async t => {
  const h = await harness(t, { observeResources: true }); assert.equal((await h.load("A.wav")).ok, true);
  const tap = h.engine.getRecorderTap(), stream = tap.ensureStream(), tapNode = h.nodes.find(n => n.kind === "tap");
  h.select(2); h.faults.allocate = kind => { if (kind === "gain") throw new Error("graph refused"); };
  assert.equal((await h.load("broken.wav", 2)).ok, false);
  assert.equal(h.engine.getMediaEl() === null, true); assert.equal(h.engine.sample().ready, false);
  assert.equal(stream.getTracks()[0].stops, 0); assert.equal(tapNode.disconnects, 0);
  assert.ok(h.nodes.every(n => !n.connections.includes(tapNode)), "no invalid output remains connected to capture");
  h.faults.allocate = null; h.select(3); assert.equal((await h.load("B.wav", 3)).ok, true);
  assert.equal(h.engine.getRecorderTap().ensureStream(), stream);
  assert.equal(h.nodes.filter(n => n.connections.includes(tapNode)).length, 1);
  assert.equal(stream.getTracks()[0].stops, 0);
  tap.releaseStream(); assert.equal(stream.getTracks()[0].stops, 1);
});

test("F4-CLEANUP-01: recoverable loaded Play resume failure retains identity, graph and position", async t => {
  const h = await harness(t, { observeResources: true }); assert.equal((await h.load("A.wav")).ok, true);
  const media = h.engine.getMediaEl(); media.pause(); media.currentTime = 12.5;
  const nodes = h.nodes.map(n => n.disconnects), revokes = [...h.revoked];
  const held = h.holdSecondResume(true); h.context.state = "suspended";
  const pending = h.engine.playPause(); await held.entered.promise; held.reject(new Error("resume retryable")); await pending;
  assert.equal(h.engine.getMediaEl() === media, true); assert.equal(media.currentTime, 12.5);
  assert.equal(state.audio.isLoaded, true); assert.equal(state.source.status, "active");
  assert.match(state.audio.transportError, /resume retryable/); assert.equal(h.engine.sample().ready, true);
  assert.deepEqual(h.nodes.map(n => n.disconnects), nodes); assert.deepEqual(h.revoked, revokes);
  await h.engine.playPause(); assert.equal(h.engine.getMediaEl() === media, true);
  assert.equal(state.audio.isPlaying, true); assert.equal(state.audio.transportError, "");
});

test("F4-CLEANUP-01: engine media identity protects direct API replacement without a UI request ID", async t => {
  const h = await harness(t, { observeResources: true }), held = { ...deferred(), entered: deferred() };
  h.faults.media = media => {
    media.play = () => { media.calls.play++; held.entered.resolve(); return held.promise; };
  };
  const pending = h.engine.loadFile({ name: "A.wav" }); await held.entered.promise;
  const loser = h.engine.getMediaEl();
  assert.equal(await h.engine.attachMediaStreamSource(h.streams.mic, { kind: "mic" }), true);
  const winner = h.engine.__resources(), nodes = h.nodes.map(n => n.disconnects), writes = h.observeWrites();
  loser.error = { code: 4 }; held.reject(Object.assign(new Error("obsolete decoder"), { name: "NotSupportedError" }));
  assert.equal(await pending, false); assert.deepEqual(writes, []);
  assert.equal(h.engine.__resources().sourceNode === winner.sourceNode, true);
  assert.equal(h.engine.__resources().outputGain === winner.outputGain, true);
  assert.deepEqual(h.nodes.map(n => n.disconnects), nodes);
  assert.equal(h.streams.mic.getTracks()[0].stops, 0);
});
