import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.env.AUDIT_REPO_ROOT || process.cwd();
const outputDirectory = process.env.AUDIT_OUTPUT_DIR || path.dirname(fileURLToPath(import.meta.url));
const fromRepo = (relative) => import(pathToFileURL(path.join(root, relative)).href);
const { CONFIG } = await fromRepo('src/js/core/config.js');
const { runtime } = await fromRepo('src/js/core/preferences.js');
const { state } = await fromRepo('src/js/core/state.js');
const { BandBank } = await fromRepo('src/js/audio/band-bank.js');
const { Orb } = await fromRepo('src/js/render/orb.js');
const { Renderer } = await fromRepo('src/js/render/renderer.js');
const { createVisualizerRuntime, selectOrbAnalysis } = await fromRepo('src/js/render/visualizer-runtime.js');
const { createAnalysisFrame, updateAnalysisFrame } = await fromRepo('src/js/audio/analysis-frame.js');
const { normalizeOrbCollection } = await fromRepo('src/js/core/orb-collection.js');
const { sanitizePreset } = await fromRepo('src/js/presets/preset-codec.js');

const evidence = {};
runtime.settings = structuredClone(CONFIG.defaults);
state.widthPx = state.heightPx = 1000;
state.dpr = 1;

// Real adapters and Orb implementation, using a valid max-speed Orb.
const def = normalizeOrbCollection([{ ...structuredClone(CONFIG.defaults.orbs[0]), id: 'PHASE', chirality: 1, motion: { angularSpeedRadPerSec: 3 } }])[0];
state.orbs = [new Orb(def)];
runtime.settings.bands.overlay.phaseMode = 'orb';
runtime.settings.bands.overlay.enabled = true;
const visualizers = createVisualizerRuntime();
visualizers.rebuild(state.orbs);
let frame = createAnalysisFrame();
const phaseFrames = [];
for (let index = 0; index < 2; index++) {
  visualizers.update({ dtSec: 1 / 30, nowSec: index / 30, simPaused: false, analysisFrame: frame });
  const actualOrb = state.orbs[0].angleRad;
  const actualRing = state.bands.ringPhaseRad;
  assert.ok(Math.abs((actualOrb - actualRing) - 0.1) < 1e-12);
  phaseFrames.push({ actualOrb, actualRing, lagRadians: actualOrb - actualRing });
}
evidence.ringLock = { dtSec: 1 / 30, speedRadPerSec: 3, frames: phaseFrames, lagDegrees: 0.1 * 180 / Math.PI };

// The same pause flag wired by Space freezes Orb motion but leaves free-run Ring motion active.
runtime.settings.bands.overlay.phaseMode = 'free';
runtime.settings.bands.overlay.ringSpeedRadPerSec = 2;
state.bands.ringPhaseRad = 1;
const pausedOrbAngle = state.orbs[0].angleRad;
visualizers.update({ dtSec: 1 / 30, nowSec: 1, simPaused: true, analysisFrame: frame });
assert.equal(state.orbs[0].angleRad, pausedOrbAngle);
assert.ok(Math.abs(state.bands.ringPhaseRad - (1 + 2 / 30)) < 1e-12);
evidence.pausedMotion = { simPaused: true, orbBefore: pausedOrbAngle, orbAfter: state.orbs[0].angleRad, ringBefore: 1, ringAfter: state.bands.ringPhaseRad };

// Keep floor, ceil, inclusive membership, clamp, and dB normalization unchanged;
// the reference differs solely in mapping Hz to FFT bin coordinates with bins.
const coordinateCases = [];
for (const fftSize of [256, 8192]) {
  BandBank.rebuild(22500, 48000);
  const bins = fftSize / 2;
  const nyquist = 24000;
  const loHz = state.bands.lowHz[255];
  const spike = Math.floor(loHz / nyquist * (bins - 1));
  const freqDb = new Float32Array(bins).fill(-100);
  freqDb[spike] = -30;
  BandBank.computeEnergiesFromAnalyser({ freqDb, analyser: { minDecibels: -100, maxDecibels: -30 } }, 48000, state.bands.channels.C.energies01);
  const correctedLoBin = Math.min(bins - 1, Math.floor(loHz / nyquist * bins));
  const correctedHiBin = Math.min(bins - 1, Math.ceil(nyquist / nyquist * bins));
  let sum = 0;
  for (let bin = correctedLoBin; bin <= correctedHiBin; bin++) sum += Math.max(0, Math.min(1, (freqDb[bin] + 100) / 70));
  const referenceEnergy = sum / (correctedHiBin - correctedLoBin + 1);
  frame = updateAnalysisFrame(createAnalysisFrame(), { ready: true, monoLike: true, bands: {} }, state.bands);
  const selection = selectOrbAnalysis({ chanId: 'C', bandIds: [255] }, frame);
  assert.equal(referenceEnergy, 0);
  assert.ok(state.bands.channels.C.energies01[255] > 0);
  assert.equal(selection.energyOverride01, state.bands.channels.C.energies01[255]);
  coordinateCases.push({ fftSize, sampleRate: 48000, spike, actualBinCenterHz: spike * 48000 / fftSize, configuredBandLowHz: loHz, currentLoBin: spike, correctedLoBin, actualEnergy: selection.energyOverride01, referenceEnergy });
}
evidence.fftCoordinate = coordinateCases;

// Verify accepted collection growth through the actual preset sanitizer.
const largePreset = sanitizePreset({ schema: 10, prefs: { orbs: Array.from({ length: 4096 }, (_, index) => ({ ...structuredClone(CONFIG.defaults.orbs[0]), id: `SAFE-${index}` })) } });
assert.equal(largePreset.orbs.length, 4096);
runtime.settings = structuredClone(CONFIG.defaults);
runtime.settings.bands.overlay.enabled = false;
const normalized = normalizeOrbCollection(largePreset.orbs.slice(0, 256));
state.orbs = normalized.map((orb) => new Orb(orb));
visualizers.rebuild(state.orbs);
const waveform = new Float32Array(8192).fill(1);
frame = updateAnalysisFrame(createAnalysisFrame(), { ready: true, monoLike: false, bands: Object.fromEntries(['L', 'R', 'C'].map((channel) => [channel, { timeDomain: waveform, rms: 1, energy01: 1 }])) }, state.bands);
const resourceStart = performance.now();
for (let index = 0; index < 360; index++) visualizers.update({ dtSec: 1 / 60, nowSec: index / 60, simPaused: false, analysisFrame: frame });
const updateElapsedMs = performance.now() - resourceStart;
const totalParticles = state.orbs.reduce((sum, orb) => sum + orb.trail.particles.length, 0);
assert.ok(totalParticles > 50000);
const drawCalls = {};
state.ctx = new Proxy({}, { get(_target, method) { return (..._args) => { drawCalls[method] = (drawCalls[method] || 0) + 1; }; }, set() { return true; } });
const drawStart = performance.now();
visualizers.render(Renderer, { nowSec: 6, analysisFrame: frame });
const instrumentedRenderElapsedMs = performance.now() - drawStart;
assert.equal(drawCalls.arc, totalParticles);
evidence.resources = { sanitizedRequestedOrbs: 4096, sanitizedAcceptedOrbs: largePreset.orbs.length, simulatedOrbs: normalized.length, simulatedSeconds: 6, totalParticles, particleArcsPerFrame: drawCalls.arc, estimatedOverlapComparisonsPerFrame: totalParticles * 4, updateElapsedMs, instrumentedRenderElapsedMs, caveat: 'Stub Canvas records work counts; these timings do not measure browser/GPU frame latency.' };

// A finite valid preset value also removes the per-frame emission guard.
const longFramePreset = sanitizePreset({ schema: 10, prefs: { timing: { maxDeltaTimeSec: 120 }, orbs: [{ ...structuredClone(CONFIG.defaults.orbs[0]), id: 'BURST', particles: { ...CONFIG.defaults.orbs[0].particles, ttlSec: 600 } }] } });
runtime.settings = longFramePreset;
const burstOrb = new Orb(longFramePreset.orbs[0]);
for (let index = 0; index < 360; index++) burstOrb.step(1 / 60, index / 60, { energy01: 1, waveform }, null, 0);
let emits = 0, overlapComparisons = 0;
const emitAt = burstOrb.trail.emitAt;
const removeOverlaps = burstOrb.trail.removeOverlaps;
burstOrb.trail.emitAt = function (...args) { emits++; return emitAt.apply(this, args); };
burstOrb.trail.removeOverlaps = function (...args) { overlapComparisons += this.particles.length; return removeOverlaps.apply(this, args); };
const burstStart = performance.now();
burstOrb.step(120, 126, { energy01: 1, waveform }, null, 0);
const burstElapsedMs = performance.now() - burstStart;
assert.equal(emits, 28800);
assert.ok(overlapComparisons > 1000000);
evidence.longFrameBurst = { sanitizedMaxDeltaTimeSec: longFramePreset.timing.maxDeltaTimeSec, elapsedInputSec: 120, emittedCallsOneOrb: emits, overlapComparisonsOneOrb: overlapComparisons, burstElapsedMs };

await mkdir(outputDirectory, { recursive: true });
const result = { auditedCodeTimestampUtc: new Date().toISOString(), assertionsPassed: true, evidence };
await writeFile(path.join(outputDirectory, 'render-analysis-results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
