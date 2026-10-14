/* Waveform ownership boundary (AUD-007).
 * Reserve one entire read/decode/reduction pipeline, not just the native decoder.
 * Reset/supersession revoke presentation, never unsettled resource occupancy.
 * A replacement must retain these admission guarantees and adversarial tests.
 * This module owns no playback, Queue, recorder, rendering or admission budgets.
 */
function createWaveformCoordinator({ extract, onUpdate }) {
  let generation = 0;
  let active = null;
  let pending = null;

  const isCurrent = job => job.generation === generation;

  function discardPending() {
    if (!pending) return;
    pending.file = null;
    pending.resolve();
    pending = null;
  }

  function start(job) {
    // Occupancy precedes callbacks and the extractor's initial full-file read.
    active = job;
    void run(job);
  }

  async function run(job) {
    try {
      if (!isCurrent(job)) return;
      onUpdate("decoding", null);
      if (!isCurrent(job)) return;
      const extraction = extract(job.file, { isCurrent: () => isCurrent(job) });
      job.file = null;
      const peaks = await extraction;
      if (isCurrent(job) && peaks) onUpdate("ready", peaks);
    } catch {
      if (isCurrent(job)) onUpdate("unavailable", null);
    } finally {
      // Only underlying extraction settlement releases this slot. No timeout or
      // reset path may do so; decodeAudioData has no per-operation abort handle.
      job.file = null;
      active = null;
      job.resolve();
      const next = pending;
      pending = null;
      if (next) {
        if (isCurrent(next)) start(next);
        else { next.file = null; next.resolve(); }
      }
    }
  }

  function request(file) {
    const requestGeneration = ++generation;
    discardPending();
    return new Promise(resolve => {
      const job = { generation: requestGeneration, file, resolve };
      if (active) {
        pending = job;
        onUpdate("waiting", null);
      } else start(job);
    });
  }

  function reset() {
    generation++;
    discardPending();
    onUpdate("empty", null);
  }

  // Scalar ownership observation only; no File/buffer history or frame polling.
  function snapshot() {
    return {
      occupied: active !== null,
      pending: pending !== null,
      generation,
      activeGeneration: active?.generation ?? null,
      pendingGeneration: pending?.generation ?? null,
    };
  }

  return { request, reset, snapshot };
}

export { createWaveformCoordinator };
