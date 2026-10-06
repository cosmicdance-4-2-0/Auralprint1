import test from "node:test";
import assert from "node:assert/strict";
import { AudioEngine } from "../src/js/audio/audio-engine.js";

test("Stream graph preserves L/R output indices, Center adaptation, and upstream recorder ownership", async () => {
  const previousWindow = globalThis.window;
  const connections = [], analysers = [];
  let destination;
  function node(extra = {}) {
    return { connect(to, output = 0) { connections.push({ from: this, to, output }); }, disconnect() {}, ...extra };
  }
  class AudioContext {
    constructor() { this.sampleRate = 48000; this.state = "running"; this.destination = destination = node(); }
    createMediaStreamSource(mediaStream) { return node({ mediaStream }); }
    createChannelSplitter(numberOfOutputs) { return node({ kind: "splitter", numberOfOutputs }); }
    createGain() { return node({ gain: { value: 1 } }); }
    createAnalyser() {
      const analyser = node({ fftSize: 2048, frequencyBinCount: 1024,
        minDecibels: -100, maxDecibels: 0, value: 0,
        getFloatTimeDomainData(buffer) { buffer.fill(this.value); },
        getFloatFrequencyData(buffer) { buffer.fill(-100); },
      });
      analysers.push(analyser); return analyser;
    }
  }
  globalThis.window = { AudioContext };
  const track = { stops: 0, stop() { this.stops++; } };
  const stream = { getAudioTracks() { return [track]; } };
  try {
    await AudioEngine.attachMediaStreamSource(stream, { monitorOutput: false });
    const source = connections.find(entry => entry.from.mediaStream === stream).from;
    const splitter = connections.find(entry => entry.from === source && entry.to.kind === "splitter").to;
    assert.equal(splitter.numberOfOutputs, 2);
    const [L, R, C] = analysers;
    const splitConnections = connections.filter(entry => entry.from === splitter);
    assert.deepEqual(splitConnections.filter(entry => entry.to === L || entry.to === R)
      .map(entry => [entry.to === L ? "L" : "R", entry.output]), [["L", 0], ["R", 1]]);
    const gains = splitConnections.filter(entry => entry.to.gain).map(entry => entry.to);
    const sum = connections.find(entry => entry.from === gains[0]).to;
    assert.equal(connections.find(entry => entry.from === gains[1]).to, sum);
    assert.equal(connections.find(entry => entry.from === sum).to, C);
    assert.notEqual(C, L); assert.notEqual(C, R);
    assert.equal(connections.some(entry => entry.to === destination), false);
    assert.deepEqual(gains.map(gain => gain.gain.value), [0.5, 0.5]);
    for (const [left, right, expected] of [[0.25, 0, [1, 0]], [0, 0.25, [0, 1]], [0.25, 0.25, [0.5, 0.5]]]) {
      L.value = left; R.value = right;
      const sample = AudioEngine.sample();
      assert.deepEqual(gains.map(gain => gain.gain.value), expected);
      assert.equal(sample.bands.L.timeDomain[0], left);
      assert.equal(sample.bands.R.timeDomain[0], right);
    }
    const recorderTap = AudioEngine.getRecorderTap();
    assert.equal(recorderTap.ensureStream(), stream);
    recorderTap.releaseStream();
    assert.equal(track.stops, 0);
  } finally { AudioEngine.unload(); globalThis.window = previousWindow; }
});
