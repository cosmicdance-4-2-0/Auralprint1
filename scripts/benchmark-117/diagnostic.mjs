// Test-only entry bundled in memory by benchmark-117.mjs; never in a distribution.
import '../../src/js/main.js';
import { runtime, preferences } from '../../src/js/core/preferences.js';
import { state } from '../../src/js/core/state.js';
import { AudioEngine } from '../../src/js/audio/audio-engine.js';
import { VisualizerRuntime } from '../../src/js/render/visualizer-runtime.js';
import { UI } from '../../src/js/ui/ui.js';
import { Scrubber } from '../../src/js/audio/scrubber.js';

let current = {}, frame = null;
for (const [owner, method, bucket] of [
  [UI, 'updateCamera', 'cameraMs'], [AudioEngine, 'sample', 'analysisSampleMs'],
  [VisualizerRuntime, 'update', 'visualizerUpdateMs'], [VisualizerRuntime, 'render', 'renderMs'],
  [UI, 'refreshAllUiText', 'uiMs'], [Scrubber, 'draw', 'scrubberMs'],
]) {
  const original = owner[method];
  owner[method] = function (...args) {
    if (owner === VisualizerRuntime && method === 'update') frame = args[0].analysisFrame;
    const start = performance.now();
    try { return original.apply(this, args); }
    finally { current[bucket] = (current[bucket] || 0) + performance.now() - start; }
  };
}

function snapshot() {
  const media = AudioEngine.getMediaEl();
  let oldest = Infinity, newest = -Infinity;
  for (const orb of state.orbs) {
    const head = orb.trail.particles.head?.particle;
    const tail = orb.trail.particles.tail?.particle;
    if (head) oldest = Math.min(oldest, head.bornSec);
    if (tail) newest = Math.max(newest, tail.bornSec);
  }
  const now = performance.now() / 1000;
  return { mediaTimeSec: media?.currentTime ?? null, sampleRateHz: frame?.spectrum.metadata.sampleRateHz ?? null,
    analysisReady: frame?.ready ?? false,
    channels: Object.fromEntries(['L', 'R', 'C'].map(id => [id, {
      rms: frame?.channels[id].rms ?? null, waveformLength: frame?.channels[id].waveform?.length ?? 0,
      energiesLength: frame?.channels[id].bandEnergies01?.length ?? 0,
    }])),
    particleStats: { ...VisualizerRuntime.getParticleStats() },
    oldestAgeSec: Number.isFinite(oldest) ? now - oldest : null,
    newestAgeSec: Number.isFinite(newest) ? now - newest : null,
    paused: state.time.simPaused, ringPhaseRad: state.bands.ringPhaseRad,
    angles: state.orbs.map(orb => orb.angleRad), world: { ...state.world }, camera: { ...state.camera },
    settings: structuredClone(runtime.settings), preferences: structuredClone(preferences),
    heapUsedBytes: performance.memory?.usedJSHeapSize ?? null };
}
window.ap117Diagnostic = {
  beginFrame() { current = {}; },
  endFrame() {
    const media = AudioEngine.getMediaEl();
    return { buckets: { ...current }, mediaTimeSec: media?.currentTime ?? null,
      activeParticles: VisualizerRuntime.getParticleStats().activeParticles };
  },
  snapshot,
};
