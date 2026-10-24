import test from "node:test";
import assert from "node:assert/strict";
import { createSourceState } from "../src/js/core/state.js";
import { createInputSourceManager } from "../src/js/audio/input-source-manager.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function events(properties = {}) {
  const listeners = new Map(), saved = [];
  return Object.assign(properties, {
    saved,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn); saved.push(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type) { for (const fn of [...(listeners.get(type) || [])]) fn(); },
    listenerCount() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  });
}

function stream(kind, ids = ["audio"]) {
  const track = (id, type) => events({ id, kind: type, label: id, readyState: "live", stops: 0,
    getSettings: () => ({ channelCount: id === "a" ? 1 : 2 }),
    stop() { this.stops++; this.readyState = "ended"; },
    end(signal = true) { this.readyState = "ended"; if (signal) this.emit("ended"); },
  });
  const audio = ids.map(id => track(id, "audio")), video = kind === "stream" ? [track("video", "video")] : [];
  return events({ active: true, audio, video, getTracks: () => [...audio, ...video], getAudioTracks: () => audio, getVideoTracks: () => video });
}

function harness() {
  const writes = [];
  function observed(value, path = "source") {
    for (const key of Object.keys(value)) if (value[key] && typeof value[key] === "object") value[key] = observed(value[key], `${path}.${key}`);
    return new Proxy(value, { set(object, key, next) { writes.push(`${path}.${String(key)}`); object[key] = next; return true; } });
  }
  const stateRef = { source: observed(createSourceState()), audio: {} };
  const captures = [], graphs = [], calls = { mic: 0, stream: 0, unload: 0 };
  let upstream = null, attachHook = null;
  const engine = {
    async attachMediaStreamSource(mediaStream, options) {
      const install = () => {
        if (!options.isCurrent()) return false;
        const graph = { mediaStream, disconnects: 0 }; graphs.push(graph); upstream = graph; return true;
      };
      return attachHook ? attachHook({ mediaStream, options, install }) : install();
    },
    async loadFile(file) { upstream = { file, disconnects: 0 }; return true; },
    unload() { calls.unload++; if (upstream) upstream.disconnects++; upstream = null; },
  };
  const mediaDevices = Object.fromEntries([["mic", "getUserMedia"], ["stream", "getDisplayMedia"]].map(([kind, api]) => [api, () => {
    calls[kind]++; assert.ok(captures.length, "capture must be explicitly queued"); return captures.shift();
  }]));
  const manager = createInputSourceManager({ stateRef, audioEngine: engine, mediaDevices });
  let resets = 0; manager.init({ onExternalLiveInputReset() { resets++; } });
  return { manager, stateRef, calls, writes, captures, graphs,
    get upstream() { return upstream; }, get resets() { return resets; },
    attach(fn) { attachHook = fn; },
    activate(kind) { return kind === "mic" ? manager.activateMic() : manager.activateStream(); },
  };
}

function released(input) {
  for (const target of [input, ...input.getTracks()]) assert.equal(target.listenerCount(), 0);
  for (const track of input.getTracks()) { assert.equal(track.readyState, "ended"); assert.equal(track.stops, 1); }
}

function idle(h, kind) {
  assert.equal(h.stateRef.source.kind, "none"); assert.equal(h.stateRef.source.status, "idle");
  assert.equal(h.stateRef.source.sessionActive, false); assert.equal(h.stateRef.source.errorCode, `${kind}-ended`);
  assert.equal(h.stateRef.source.errorMessage, kind === "mic" ? "Microphone input ended. Select Mic to reconnect." : "Shared stream ended. Select Stream to share again.");
  assert.equal(h.stateRef.source.permission[kind], "granted");
  assert.deepEqual(h.stateRef.source.streamMeta, { hasAudio: false, hasVideo: false, audioChannelCount: null });
  assert.equal(h.upstream, null); assert.equal(h.resets, 1);
}

for (const kind of ["mic", "stream"]) {
  for (const phase of ["before-capture", "before-attach", "pending-attach", "before-registration", "after-registration", "inactive"]) {
    test(`AUD-001: ${kind} ${phase} recovers and permits exactly one intentional retry`, async () => {
      const h = harness(), input = stream(kind), capture = deferred(), attach = deferred(), entered = deferred();
      h.captures.push(capture.promise);
      h.attach(async ({install}) => {
        if (phase === "before-attach") input.audio[0].end(false);
        if (["pending-attach", "inactive"].includes(phase)) { entered.resolve(); await attach.promise; }
        const installed = install();
        if (phase === "before-registration") input.audio[0].end(false);
        return installed;
      });
      const pending = h.activate(kind);
      if (phase === "before-capture") input.audio[0].end();
      capture.resolve(input);
      if (["pending-attach", "inactive"].includes(phase)) {
        await entered.promise;
        if (phase === "inactive") input.emit("inactive"); else input.audio[0].end();
        // Event-driven recovery releases pending resources before attach settles.
        idle(h, kind); released(input); attach.resolve();
      }
      await pending;
      if (phase === "after-registration") {
        assert.equal(h.stateRef.source.sessionActive, true); input.audio[0].end();
      }
      idle(h, kind); released(input);
      assert.ok(h.graphs.every(graph => graph.disconnects === 1));
      const retry = stream(kind); h.captures.push(retry); h.attach(null);
      assert.equal((await h.activate(kind)).ok, true);
      assert.equal(h.calls[kind], 2); assert.equal(h.stateRef.source.kind, kind);
      assert.equal(h.stateRef.source.status, "active"); assert.equal(h.stateRef.source.sessionActive, true);
      assert.equal(h.stateRef.source.errorCode, ""); assert.equal(h.upstream.mediaStream, retry);
      assert.deepEqual(h.stateRef.source.streamMeta, {hasAudio:true,hasVideo:kind === "stream",audioChannelCount:kind === "stream" ? 2 : null});
      const unloads = h.calls.unload;
      // Removed callbacks may already have been queued by the browser.
      h.writes.length = 0; [input, ...input.getTracks()].flatMap(target => target.saved).forEach(fn => fn());
      assert.deepEqual(h.writes, []); assert.equal(h.calls.unload, unloads); assert.equal(h.upstream.mediaStream, retry);
      await h.manager.teardownActiveSource(); const after = h.calls.unload;
      await h.manager.teardownActiveSource(); assert.equal(h.calls.unload, after); released(retry);
    });
  }

  for (const winner of [kind === "mic" ? "stream" : "mic", "file", "clear"]) for (const reject of [false, true]) {
    test(`AUD-001: pending ${kind} ${reject ? "rejection" : "completion"} cannot write over ${winner}`, async () => {
      const h = harness(), input = stream(kind), gate = deferred(), entered = deferred();
      h.captures.push(input);
      h.attach(async ({install}) => { entered.resolve(); await gate.promise; return install(); });
      const pending = h.activate(kind); await entered.promise; h.attach(null);
      let successor;
      if (winner === "clear") await h.manager.teardownActiveSource();
      else if (winner === "file") await h.manager.activateFile({name:"winner.wav"});
      else { successor = stream(winner); h.captures.push(successor); await h.activate(winner); }
      released(input);
      const upstream = h.upstream, source = JSON.stringify(h.stateRef.source), unloads = h.calls.unload;
      h.writes.length = 0;
      [input, ...input.getTracks()].flatMap(target => target.saved).forEach(fn => fn());
      if (reject) gate.reject(new Error("obsolete failure")); else gate.resolve();
      assert.equal((await pending).errorCode, `${kind}-activation-cancelled`);
      assert.deepEqual(h.writes, []); assert.equal(JSON.stringify(h.stateRef.source), source);
      assert.equal(h.upstream, upstream); assert.equal(h.calls.unload, unloads); released(input);
      if (successor) assert.ok(successor.getTracks().every(track => track.readyState === "live" && track.stops === 0));
    });
  }

  for (const failure of ["throw", "false"]) {
    test(`AUD-001: current ${kind} attach ${failure} releases an installed graph`, async () => {
      const h = harness(), input = stream(kind); h.captures.push(input);
      h.attach(({install}) => { install(); if (failure === "throw") throw new Error("setup failed"); return false; });
      const result = await h.activate(kind);
      assert.equal(result.errorCode, failure === "throw" ? `${kind}-attach-failed` : `${kind}-activation-cancelled`);
      assert.equal(h.stateRef.source.status, failure === "throw" ? "error" : "idle");
      if (failure === "throw") assert.equal(h.stateRef.source.errorMessage, `${kind === "mic" ? "Microphone" : "Stream"} activation failed: setup failed`);
      assert.equal(h.stateRef.source.sessionActive, false); assert.equal(h.stateRef.source.permission[kind], "granted");
      assert.equal(h.upstream, null); assert.equal(h.graphs[0].disconnects, 1); released(input);
    });
  }
}

test("AUD-001: Stream admission checks the ID-selected track, not every audio track", async () => {
  for (const ended of ["a", "z"]) {
    const h = harness(), input = stream("stream", ["z", "a"]);
    input.audio.find(track => track.id === ended).end(false); h.captures.push(input);
    const result = await h.activate("stream");
    assert.equal(result.ok, ended === "z");
    if (ended === "a") { idle(h, "stream"); released(input); assert.equal(h.graphs.length, 0); }
    else { assert.equal(h.upstream.mediaStream, input); assert.equal(h.stateRef.source.streamMeta.audioChannelCount, 1); }
  }
});

test("AUD-001: unselected Stream track can end during attach; active policy still waits for all audio", async () => {
  const h = harness(), input = stream("stream", ["z", "a"]); h.captures.push(input);
  h.attach(({install}) => { input.audio[0].end(); input.video[0].end(); return install(); });
  assert.equal((await h.activate("stream")).ok, true);
  assert.equal(h.stateRef.source.streamMeta.hasVideo, true); assert.equal(h.stateRef.source.streamMeta.audioChannelCount, 1);
  input.audio[1].end(); idle(h, "stream"); released(input);
});

test("AUD-001: selected Stream track ending during attach is rejected even with a live secondary", async () => {
  const h = harness(), input = stream("stream", ["z", "a"]); h.captures.push(input);
  h.attach(({install}) => { input.audio[1].end(false); return install(); });
  assert.equal((await h.activate("stream")).ok, false); idle(h, "stream"); released(input);
});

test("AUD-001: committed Stream keeps its accepted all-audio-tracks end policy", async () => {
  const h = harness(), input = stream("stream", ["z", "a"]); h.captures.push(input);
  await h.activate("stream"); input.audio[1].end();
  assert.equal(h.stateRef.source.status, "active"); assert.equal(h.upstream.mediaStream, input);
  input.audio[0].end(); idle(h, "stream"); released(input);
});

test("AUD-001: capture resolves already inactive despite retained live track membership", async () => {
  const h = harness(), input = stream("stream"); input.active = false; h.captures.push(input);
  await h.activate("stream"); idle(h, "stream"); released(input); assert.equal(h.graphs.length, 0);
});

for (const kind of ["mic", "stream"]) {
  test(`AUD-001: current ${kind} end cannot resume feedback over a same-turn successor`, async () => {
    const h = harness(), input = stream(kind); h.captures.push(input); await h.activate(kind);
    input.audio[0].end();
    const successor = stream(kind); h.captures.push(successor); await h.activate(kind);
    assert.equal(h.stateRef.source.kind, kind); assert.equal(h.stateRef.source.status, "active");
    assert.equal(h.stateRef.source.errorCode, ""); assert.equal(h.upstream.mediaStream, successor);
  });
}

test("AUD-001: same-turn live intents after an existing session preserve latest intent", async () => {
  const h = harness(); h.captures.push(stream("mic")); await h.activate("mic");
  const oldCapture = deferred(), winner = stream("mic"); h.captures.push(oldCapture.promise, winner);
  const old = h.activate("stream"), next = h.activate("mic"); await next;
  const stale = stream("stream"); oldCapture.resolve(stale); await old; released(stale);
  assert.equal(h.stateRef.source.kind, "mic"); assert.equal(h.upstream.mediaStream, winner);
});
