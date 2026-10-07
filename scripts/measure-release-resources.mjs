// Optional RC-15 investigation. No limits are chosen or production behavior changed.
import { CONFIG } from '../src/js/core/config.js';
import { runtime } from '../src/js/core/preferences.js';
import { state } from '../src/js/core/state.js';
import { sanitizePreset } from '../src/js/presets/preset-codec.js';
import { normalizeOrbCollection } from '../src/js/core/orb-collection.js';
import { BandBank } from '../src/js/audio/band-bank.js';
import { createAnalysisFrame, updateAnalysisFrame } from '../src/js/audio/analysis-frame.js';
import { createVisualizerRuntime } from '../src/js/render/visualizer-runtime.js';
import { Renderer } from '../src/js/render/renderer.js';
import { Orb } from '../src/js/render/orb.js';
const check = (value, message) => { if (!value) throw new Error(message); };

export function measureReleaseResources({ counts = [2, 8, 16, 64, 256], nativeContext = null } = {}) {
  state.widthPx = state.heightPx = 1000; state.dpr = 1;
  const largeStart = performance.now();
  const large = sanitizePreset({ schema: 10, prefs: { orbs: Array.from({ length: 4096 }, (_, i) => ({ ...structuredClone(CONFIG.defaults.orbs[0]), id: `SAFE-${i}` })) } });
  check(large.orbs.length === 4096, 'large preset no longer reproduces');
  const admission = { requestedOrbs: 4096, acceptedOrbs: large.orbs.length, sanitationMs: performance.now() - largeStart };
  const admittedTiming = [1 / 30, 120, 1e6, Number.MAX_VALUE].map(value => ({ requested: value, accepted: sanitizePreset({ schema: 10, prefs: { timing: { maxDeltaTimeSec: value } } }).timing.maxDeltaTimeSec }));
  const waveform = new Float32Array(8192).fill(1), curves = [];
  for (const count of counts) {
    runtime.settings = structuredClone(CONFIG.defaults); runtime.settings.bands.overlay.enabled = false;
    BandBank.rebuild(22500, 48000);
    state.orbs = normalizeOrbCollection(large.orbs.slice(0, count)).map(def => new Orb(def));
    const visualizers = createVisualizerRuntime(); visualizers.rebuild(state.orbs);
    const frame = updateAnalysisFrame(createAnalysisFrame(), { ready: true, monoLike: false, bands: Object.fromEntries(['L', 'R', 'C'].map(id => [id, { timeDomain: waveform, rms: 1, energy01: 1 }])) }, state.bands);
    const context = { dtSec: 1 / 60, nowSec: 0, simPaused: false, analysisFrame: frame };
    const warmStart = performance.now();
    for (let i = 0; i < 360; i++) { context.nowSec = i / 60; visualizers.update(context); }
    const warmMs = performance.now() - warmStart;
    let emits = 0, overlapComparisons = 0, expiryVisits = 0;
    for (const orb of state.orbs) {
      const originalEmit = orb.trail.emitAt, originalOverlap = orb.trail.removeOverlaps, originalUpdate = orb.trail.updateAndEmit;
      orb.trail.emitAt = function (...args) { emits++; return originalEmit.apply(this, args); };
      orb.trail.removeOverlaps = function (...args) { if (args[2] > 0) overlapComparisons += this.particles.length; return originalOverlap.apply(this, args); };
      orb.trail.updateAndEmit = function (...args) { expiryVisits += this.particles.length; return originalUpdate.apply(this, args); };
    }
    const updates = [];
    for (let i = 0; i < 3; i++) {
      emits = overlapComparisons = expiryVisits = 0; context.nowSec = 6 + i / 60;
      const start = performance.now(); visualizers.update(context);
      updates.push({ ms: performance.now() - start, emits, overlapComparisons, expiryVisits });
    }
    const particles = state.orbs.reduce((n, orb) => n + orb.trail.particles.length, 0);
    const drawCalls = {};
    state.ctx = new Proxy({}, { get: (_target, method) => (..._args) => { drawCalls[method] = (drawCalls[method] || 0) + 1; }, set: () => true });
    const renderStart = performance.now(); visualizers.render(Renderer, context); const instrumentedRenderMs = performance.now() - renderStart;
    check(drawCalls.arc === particles, 'arc/particle ownership mismatch');
    const nativeRenderSubmissionMs = [];
    if (nativeContext) {
      state.ctx = nativeContext;
      for (let i = 0; i < 3; i++) { const start = performance.now(); visualizers.render(Renderer, context); nativeRenderSubmissionMs.push(performance.now() - start); }
    }
    curves.push({ count, warmMs, particles, updates, drawCalls, instrumentedRenderMs, nativeRenderSubmissionMs });
  }
  const burstPrefs = sanitizePreset({ schema: 10, prefs: { timing: { maxDeltaTimeSec: 120 }, orbs: [{ ...structuredClone(CONFIG.defaults.orbs[0]), id: 'BURST', particles: { ...CONFIG.defaults.orbs[0].particles, ttlSec: 600 } }] } });
  runtime.settings = burstPrefs;
  const burstOrb = new Orb(burstPrefs.orbs[0]); const band = { energy01: 1, waveform };
  for (let i = 0; i < 360; i++) burstOrb.step(1 / 60, i / 60, band, null, 0);
  let emits = 0, overlapComparisons = 0;
  const emit = burstOrb.trail.emitAt, overlap = burstOrb.trail.removeOverlaps;
  burstOrb.trail.emitAt = function (...args) { emits++; return emit.apply(this, args); };
  burstOrb.trail.removeOverlaps = function (...args) { if (args[2] > 0) overlapComparisons += this.particles.length; return overlap.apply(this, args); };
  const burstStart = performance.now(); burstOrb.step(120, 126, band, null, 0);
  const burst = { acceptedMaxDeltaTimeSec: burstPrefs.timing.maxDeltaTimeSec, acceptedTtlSec: burstPrefs.orbs[0].particles.ttlSec, emits, overlapComparisons, elapsedMs: performance.now() - burstStart, retainedParticles: burstOrb.trail.particles.length };
  check(emits === 28800 && overlapComparisons > 1e6, 'burst no longer reproduces');
  check(curves.find(x => x.count === 256)?.particles > 50000, 'aggregate case no longer reproduces');
  return { admission, admittedTiming, curves, burst, caveat: 'Synthetic full-energy analysis; counters execute production loops. Instrumented Canvas timings include instrumentation. Native Canvas measurements cover JS command submission, not end-to-end GPU completion or universal FPS. No budget is selected.' };
}

if (typeof window === 'undefined') {
  const fs = await import('node:fs');
  const version = fs.readFileSync(new URL('../version', import.meta.url), 'utf8').trim();
  const result = { version, runtime: process.version, results: measureReleaseResources() };
  if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
