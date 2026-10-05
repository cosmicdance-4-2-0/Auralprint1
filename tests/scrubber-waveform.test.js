import test from "node:test";
import assert from "node:assert/strict";

import { buildWaveformPeaks } from "../src/js/audio/scrubber.js";

function createAudioBuffer(channels) {
  return {
    numberOfChannels: channels.length,
    getChannelData(index) {
      return Float32Array.from(channels[index]);
    },
  };
}

test("non-divisible waveform buckets include a final-sample impulse", () => {
  const samples = Array(13).fill(0);
  samples[12] = 0.9;

  const peaks = buildWaveformPeaks(createAudioBuffer([samples]), 4);

  assert.deepEqual(Array.from(peaks), [0, 0, 0, Math.fround(0.9)]);
});

test("short buffers retain a terminal impulse at the end of the timeline", () => {
  const peaks = buildWaveformPeaks(createAudioBuffer([
    [0, 0, 0, 0, 1],
  ]), 10);

  assert.deepEqual(Array.from(peaks.slice(0, 8)), Array(8).fill(0));
  assert.equal(peaks[peaks.length - 1], 1);
});

test("a middle impulse maps to the corresponding middle waveform region", () => {
  const samples = Array(9).fill(0);
  samples[4] = 0.625;

  const peaks = buildWaveformPeaks(createAudioBuffer([samples]), 6);

  assert.equal(peaks[3], 0.625);
  assert.equal(peaks[0], 0);
  assert.equal(peaks[5], 0);
});

test("multi-channel terminal peaks use absolute magnitude", () => {
  const peaks = buildWaveformPeaks(createAudioBuffer([
    Array(13).fill(0),
    [...Array(12).fill(0), -0.75],
  ]), 4);

  assert.equal(peaks[3], 0.75);
});

test("ordinary long buffers use proportional intervals and peak semantics", () => {
  const peaks = buildWaveformPeaks(createAudioBuffer([
    [0.1, -0.4, 0.2, 0.3, -0.8, 0.5, -0.6, 0.7, -0.2, 0.9],
  ]), 3);

  assert.deepEqual(Array.from(peaks), [
    Math.fround(0.4),
    Math.fround(0.8),
    Math.fround(0.9),
  ]);
});

test("zero-length channel data returns finite zero-filled peaks", () => {
  const peaks = buildWaveformPeaks(createAudioBuffer([[]]), 4);

  assert.ok(peaks instanceof Float32Array);
  assert.equal(peaks.length, 4);
  assert.deepEqual(Array.from(peaks), [0, 0, 0, 0]);
  assert.ok(Array.from(peaks).every(Number.isFinite));
});
