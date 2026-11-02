// Serialized by Playwright before boot. Observe the real scheduled callback;
// never call it ourselves, alter its timestamp, cancel it or create a second loop.
export function installObserver() {
  const nativeRaf = window.requestAnimationFrame.bind(window);
  const probe = window.ap117Observer = {
    callbacks: 0, firstCallbackStartMs: null, firstCallbackEndMs: null,
    firstScheduledMs: null, active: null, waiters: [], last: null,
    nextFrame() { return new Promise(resolve => this.waiters.push(resolve)); },
    collect({ warmupCallbacks, sampledCallbacks, mode = 'callback' }) {
      if (this.active) throw new Error('Overlapping measurement windows');
      if (!Number.isInteger(warmupCallbacks) || warmupCallbacks < 1
        || !Number.isInteger(sampledCallbacks) || sampledCallbacks < 1
        || !['interval', 'callback', 'buckets'].includes(mode)) throw new Error('Invalid sampling window');
      return new Promise(resolve => {
        this.active = { remaining: warmupCallbacks, count: sampledCallbacks, mode,
          previousTs: null, samples: [], resolve };
      });
    },
  };
  // Capture the canonical media element once; read its clock outside timed frames.
  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    probe.mediaElement = this;
    return nativePlay.apply(this, args);
  };
  window.requestAnimationFrame = function (callback) {
    if (callback.name !== 'onAnimationFrame') return nativeRaf(callback);
    if (probe.firstScheduledMs === null) probe.firstScheduledMs = performance.now();
    return nativeRaf(function (timestamp) {
      const first = probe.callbacks === 0;
      const active = probe.active;
      const timed = first || (active && active.mode !== 'interval') || probe.waiters.length > 0;
      const start = timed ? performance.now() : null;
      if (first) probe.firstCallbackStartMs = start;
      if (active?.mode === 'buckets') window.ap117Diagnostic?.beginFrame();
      // A thrown application error remains a thrown application error.
      callback.call(this, timestamp);
      const end = timed ? performance.now() : null;
      probe.callbacks++;
      if (first) probe.firstCallbackEndMs = end;
      probe.last = { timestampMs: timestamp, startMs: start, endMs: end };
      if (active) {
        const previous = active.previousTs;
        active.previousTs = timestamp;
        if (active.remaining > 0) active.remaining--;
        else {
          active.samples.push({ timestampMs: timestamp,
            intervalMs: previous === null ? null : timestamp - previous,
            callbackMs: active.mode === 'interval' ? null : end - start,
            ...(active.mode === 'buckets' ? window.ap117Diagnostic.endFrame() : {}) });
          if (active.samples.length === active.count) {
            probe.active = null; active.resolve(active.samples);
          }
        }
      }
      const waiters = probe.waiters.splice(0);
      for (const resolve of waiters) resolve(probe.last);
    });
  };
}
