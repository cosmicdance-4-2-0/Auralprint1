import test from "node:test";
import assert from "node:assert/strict";
import { createSourceState } from "../src/js/core/state.js";
import { createInputSourceManager } from "../src/js/audio/input-source-manager.js";

let engineId = 0;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function stream(kind) {
  function track(type) {
    return Object.assign(new EventTarget(), {
      id: `${kind}-${type}`, label: `${kind} ${type}`, readyState: "live", stops: 0,
      getSettings() { return { channelCount: 2 }; },
      stop() { this.stops++; this.readyState = "ended"; },
    });
  }
  const audio = track("audio"), video = kind === "stream" ? track("video") : null;
  return Object.assign(new EventTarget(), {
    getTracks() { return video ? [audio, video] : [audio]; },
    getAudioTracks() { return [audio]; },
    getVideoTracks() { return video ? [video] : []; },
  });
}

async function harness(t) {
  // Fresh engine closure per case; use its real attachment, teardown and sample.
  const { AudioEngine: engine } = await import(`../src/js/audio/audio-engine.js?rc03=${engineId++}`);
  const oldWindow = globalThis.window;
  const nodes = [];
  let context;
  function node(extra = {}) {
    const value = {
      connections: [], disconnects: 0,
      connect(to, output = 0) { this.connections.push({ to, output }); },
      disconnect(to) {
        this.disconnects++;
        this.connections = to ? this.connections.filter(entry => entry.to !== to) : [];
      },
      ...extra,
    };
    nodes.push(value);
    return value;
  }
  class AudioContext {
    constructor() {
      context = this;
      this.sampleRate = 48000;
      this.state = "running";
      this.destination = node();
    }
    resume() {
      if (this.pendingResume) {
        const held = this.pendingResume;
        this.pendingResume = null;
        held.entered.resolve();
        return held.promise.then(() => { this.state = "running"; });
      }
      this.state = "running";
      return Promise.resolve();
    }
    createMediaStreamSource(mediaStream) { return node({ mediaStream }); }
    createChannelSplitter() { return node({ splitter: true }); }
    createGain() { return node({ gain: { value: 1 } }); }
    createAnalyser() {
      return node({ fftSize: 2048, frequencyBinCount: 1024,
        minDecibels: -100, maxDecibels: 0,
        getFloatTimeDomainData(buffer) { buffer.fill(0.25); },
        getFloatFrequencyData(buffer) { buffer.fill(-50); },
      });
    }
    createMediaStreamDestination() { return node({ stream: stream("recorder") }); }
  }
  globalThis.window = { AudioContext };
  const streams = { mic: stream("mic"), stream: stream("stream") };
  const stateRef = { source: createSourceState(), audio: {} };
  const manager = createInputSourceManager({ stateRef, audioEngine: engine, mediaDevices: {
    async getUserMedia() { return streams.mic; },
    async getDisplayMedia() { return streams.stream; },
  } });
  // Prime an existing passive recorder branch before the live graph is built.
  const tap = engine.getRecorderTap();
  const tapStream = tap.ensureStream();
  const tapNode = nodes.find(value => value.stream === tapStream);
  t.after(async () => {
    await manager.teardownActiveSource({ reason: "test-cleanup" });
    tap.releaseStream();
    globalThis.window = oldWindow;
  });
  function activate(kind) { return kind === "mic" ? manager.activateMic() : manager.activateStream(); }
  function holdResume() {
    const held = { ...deferred(), entered: deferred() };
    context.state = "suspended";
    context.pendingResume = held;
    return held;
  }
  function assertTracks(kind, expected) {
    for (const track of streams[kind].getTracks()) {
      assert.equal(track.readyState, expected);
      assert.equal(track.stops, expected === "live" ? 0 : 1);
    }
  }
  function assertWinner(kind) {
    assert.equal(stateRef.source.kind, kind);
    assert.equal(stateRef.source.status, "active");
    assert.equal(stateRef.source.sessionActive, true);
    assert.equal(stateRef.source.errorCode, "");
    assert.equal(stateRef.source.errorMessage, "");
    assertTracks(kind, "live");
    assert.equal(engine.sample().ready, true);
    // Existing public recorder seam exposes the exact installed upstream.
    assert.equal(engine.getRecorderTap().ensureStream(), streams[kind]);
    const source = nodes.find(value => value.mediaStream === streams[kind]);
    assert.ok(source.connections.some(entry => entry.to.splitter));
    const output = source.connections.find(entry => entry.to.gain)?.to;
    assert.ok(output.connections.some(entry => entry.to === tapNode));
    assert.equal(tapStream.getTracks()[0].readyState, "live");
    assert.equal(tapStream.getTracks()[0].stops, 0);
    return { source, output };
  }
  return { engine, manager, stateRef, streams, nodes, activate, holdResume, assertTracks, assertWinner };
}

function assertCancelled(result, kind) {
  assert.deepEqual(result, {
    ok: false, kind, status: "idle", errorCode: `${kind}-activation-cancelled`, errorMessage: "",
  });
}

for (const [loser, winner] of [["mic", "stream"], ["stream", "mic"]]) {
  test(`RC-03: stale ${loser} resume cannot destroy winning ${winner} graph`, async t => {
    const h = await harness(t);
    const held = h.holdResume();
    const pending = h.activate(loser);
    await held.entered.promise;
    assert.equal((await h.activate(winner)).ok, true);
    const graph = h.assertWinner(winner);
    const sourceState = structuredClone(h.stateRef.source);
    held.resolve();
    assertCancelled(await pending, loser);
    assert.deepEqual(h.stateRef.source, sourceState);
    assert.deepEqual(h.assertWinner(winner), graph);
    assert.equal(graph.source.disconnects, 0);
    assert.equal(graph.output.disconnects, 0);
    h.assertTracks(loser, "ended");
    assert.equal(h.nodes.some(value => value.mediaStream === h.streams[loser]), false);
  });

  test(`RC-03: stale ${loser} resume rejection cannot commit an attachment error`, async t => {
    const h = await harness(t);
    const held = h.holdResume();
    const pending = h.activate(loser);
    await held.entered.promise;
    assert.equal((await h.activate(winner)).ok, true);
    const graph = h.assertWinner(winner);
    const sourceState = structuredClone(h.stateRef.source);
    held.reject(new Error("delayed attachment failure"));
    assertCancelled(await pending, loser);
    assert.deepEqual(h.stateRef.source, sourceState);
    assert.deepEqual(h.assertWinner(winner), graph);
    h.assertTracks(loser, "ended");
  });

  test(`RC-03 positive control: ordinary ${loser} to ${winner} switch`, async t => {
    const h = await harness(t);
    assert.equal((await h.activate(loser)).ok, true);
    const oldGraph = h.assertWinner(loser);
    assert.equal((await h.activate(winner)).ok, true);
    h.assertWinner(winner);
    h.assertTracks(loser, "ended");
    assert.equal(oldGraph.source.connections.length, 0);
  });
}

for (const kind of ["mic", "stream"]) {
  test(`RC-03 positive control: normal ${kind} graph and explicit File-mode teardown`, async t => {
    const h = await harness(t);
    assert.equal((await h.activate(kind)).ok, true);
    const graph = h.assertWinner(kind);
    assert.equal(await h.manager.teardownActiveSource({ reason: "switch-to-file-mode" }), true);
    h.assertTracks(kind, "ended");
    assert.equal(h.engine.sample().ready, false);
    assert.equal(graph.source.connections.length, 0);
    assert.equal(h.stateRef.source.kind, "none");
    assert.equal(h.stateRef.source.status, "idle");
    assert.equal(h.stateRef.source.sessionActive, false);
  });

  test(`RC-03: explicit teardown cancels pending ${kind} attachment`, async t => {
    const h = await harness(t);
    const held = h.holdResume();
    const pending = h.activate(kind);
    await held.entered.promise;
    await h.manager.teardownActiveSource({ reason: "switch-to-file-mode" });
    const sourceState = structuredClone(h.stateRef.source);
    held.resolve();
    assertCancelled(await pending, kind);
    h.assertTracks(kind, "ended");
    assert.equal(h.engine.sample().ready, false);
    assert.deepEqual(h.stateRef.source, sourceState);
    assert.equal(h.nodes.some(value => value.mediaStream === h.streams[kind]), false);
  });

  test(`RC-03: current ${kind} attachment failure still reports error and releases tracks`, async t => {
    const h = await harness(t);
    const held = h.holdResume();
    const pending = h.activate(kind);
    await held.entered.promise;
    held.reject(new Error("current failure"));
    const result = await pending;
    assert.equal(result.errorCode, `${kind}-attach-failed`);
    assert.equal(h.stateRef.source.status, "error");
    h.assertTracks(kind, "ended");
  });
}

test("RC-03: optional attachment guard also protects a running context", async t => {
  const h = await harness(t);
  await h.activate("stream");
  const graph = h.assertWinner("stream");
  const stateBefore = structuredClone(h.stateRef.source);
  assert.equal(await h.engine.attachMediaStreamSource(h.streams.mic, {
    kind: "mic", isCurrent: () => false,
  }), false);
  assert.deepEqual(h.assertWinner("stream"), graph);
  assert.deepEqual(h.stateRef.source, stateBefore);
  // Attachment does not own track lifetime; the live caller releases its stream.
  h.assertTracks("mic", "live");
  h.streams.mic.getTracks().forEach(track => track.stop());
});
