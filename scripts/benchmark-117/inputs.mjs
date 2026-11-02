// Experiment inputs, not application policy. Keep the recipe and hashes with results.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CONFIG } from '../../src/js/core/config.js';
import { encodePresetPayload, decodePresetPayload, sanitizePreset } from '../../src/js/presets/preset-codec.js';

export const protocol = Object.freeze({
  revision: 1, warmupCallbacks: 60, sampledCallbacks: 240, repeats: 3,
  // Reporting threshold only; this is not an acceptance target.
  longIntervalMs: 50, timeoutMs: 120000,
  viewport: { width: 1280, height: 800 }, dpr: 1,
  audio: { seconds: 120, sampleRateHz: 48000, channels: 2, bits: 16,
    amplitude: 0.25, leftHz: 440, rightHz: 880 },
  editCounts: [16, 64, 256], commitsPerField: 20,
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function makeWav(silence = false) {
  const a = protocol.audio, frames = a.seconds * a.sampleRateHz;
  const blockAlign = a.channels * a.bits / 8;
  const wav = Buffer.alloc(44 + frames * blockAlign);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(a.channels, 22);
  wav.writeUInt32LE(a.sampleRateHz, 24); wav.writeUInt32LE(a.sampleRateHz * blockAlign, 28);
  wav.writeUInt16LE(blockAlign, 32); wav.writeUInt16LE(a.bits, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  if (!silence) for (let n = 0; n < frames; n++) {
    for (const [channel, hz] of [[0, a.leftHz], [1, a.rightHz]]) {
      wav.writeInt16LE(Math.round(32767 * a.amplitude * Math.sin(2 * Math.PI * hz * n / a.sampleRateHz)),
        44 + n * blockAlign + channel * 2);
    }
  }
  return wav;
}

export function admitCase(spec, preferences) {
  const wire = encodePresetPayload(preferences);
  assert.equal(wire.schema, 16, 'Review the experiment when the writer schema changes');
  const decoded = decodePresetPayload(wire);
  assert.equal(decoded.ok, true);
  const canonical = sanitizePreset(decoded);
  // Also catch accidental migrations or noncanonical overrides in the recipe.
  assert.deepEqual(canonical, preferences);
  assert.deepEqual(sanitizePreset(decodePresetPayload(encodePresetPayload(canonical))), canonical);
  return { ...spec, wire, preferences: canonical, settingsSha256: sha256(JSON.stringify(canonical)),
    wireSha256: sha256(JSON.stringify(wire)) };
}

export function makeCases() {
  const cases = [];
  for (const source of ['none', 'stereo', 'silence']) {
    for (const panels of ['default', 'hidden']) for (const paused of [false, true]) {
      cases.push(admitCase({ id: `B0-${source}-${panels}-${paused ? 'paused' : 'running'}`,
        group: 'B0', source, panels, paused }, structuredClone(CONFIG.defaults)));
    }
  }
  for (const phaseMode of ['free', 'orb']) {
    const prefs = structuredClone(CONFIG.defaults);
    prefs.orbs = []; prefs.bands.overlay.enabled = true; prefs.bands.overlay.phaseMode = phaseMode;
    prefs.bands.overlay.ringSpeedRadPerSec = 0.5; // Make free-phase progress observable.
    cases.push(admitCase({ id: `B1-${phaseMode}`, group: 'B1', source: 'stereo',
      panels: 'hidden', paused: false }, prefs));
  }
  for (const count of protocol.editCounts) for (const panels of ['hidden', 'revealed']) {
    const prefs = structuredClone(CONFIG.defaults);
    prefs.orbs = Array.from({ length: count }, (_, i) => ({
      ...structuredClone(CONFIG.defaults.orbs[i % CONFIG.defaults.orbs.length]), id: `bench-${i}`,
    }));
    cases.push(admitCase({ id: `B2-${count}-${panels}`, group: 'B2', source: 'none',
      panels, paused: false, count }, prefs));
  }
  return cases;
}

export function percentile(values, p) {
  assert.ok(values.length && values.every(Number.isFinite), 'Need finite nonempty samples');
  assert.ok(p > 0 && p <= 1);
  return [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1];
}

export function summarize(samples, threshold = protocol.longIntervalMs) {
  const metric = key => {
    const values = samples.map(s => s[key]).filter(Number.isFinite);
    return values.length ? { n: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95),
      max: Math.max(...values) } : null;
  };
  return { intervalMs: metric('intervalMs'), callbackMs: metric('callbackMs'),
    longIntervalThresholdMs: threshold,
    longIntervals: samples.filter(s => Number.isFinite(s.intervalMs) && s.intervalMs > threshold).length };
}
