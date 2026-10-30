import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const { assertQueueUnchangedDuringPlayback, QUEUE_PLAYBACK_PROGRESS_SECONDS, QUEUE_PLAYBACK_TIMEOUT_MS }
  = createRequire(import.meta.url)("../scripts/validate-116-accessibility.cjs");
// The browser's watchdog clock is simulated; this bounds the regression test itself.
const REGRESSION_TEST_TIMEOUT_MS = 2_000;

function harness() {
  const media = { currentTime: 12.5 }, frames = new Map(), timers = new Map(), observers = [];
  let nextId = 0, now = 0;
  const queue = {};
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.pending = []; this.connected = false; observers.push(this); }
    observe(target, options) {
      assert.equal(target, queue);
      assert.deepEqual({ ...options }, { subtree: true, attributes: true, childList: true, characterData: true });
      this.connected = true;
    }
    takeRecords() { return this.pending.splice(0); }
    disconnect() { this.connected = false; this.pending = []; }
  }
  const context = {
    activeMedia: () => media, MutationObserver,
    document: { getElementById(id) { assert.equal(id, "queueList"); return queue; } },
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, deadline: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  // Serialize the actual page.evaluate callback, preserving its browser/global boundary.
  const page = { evaluate(fn, args) { return runInNewContext(`(${fn.toString()})`, context)(args); } };
  return { page, media, frames, timers, observers,
    frame() {
      const callbacks = [...frames.values()]; frames.clear();
      for (const callback of callbacks) callback(now);
    },
    advanceClock(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) if (timer.deadline <= now) { timers.delete(id); timer.callback(); }
    },
    assertClean() {
      assert.equal(timers.size, 0, "no watchdog remains");
      assert.equal(frames.size, 0, "no animation callback remains");
      assert.equal(observers.length, 1);
      assert.equal(observers[0].connected, false, "observer disconnected");
      assert.equal(observers[0].pending.length, 0);
    },
  };
}

for (const deliverFrames of [true, false]) {
  test(`AUD101-001: frozen playback fails at the watchdog deadline (${deliverFrames ? "RAF delivered" : "RAF absent"})`,
    { timeout: REGRESSION_TEST_TIMEOUT_MS }, async () => {
      const h = harness();
      const failure = assert.rejects(assertQueueUnchangedDuringPlayback(h.page), error => {
        assert.match(error.message, /Queue playback progress timed out/);
        assert.ok(error.message.includes(`after ${QUEUE_PLAYBACK_TIMEOUT_MS} ms`));
        assert.ok(error.message.includes("start=12.5 s, observed=12.5 s"));
        assert.ok(error.message.includes(`targetProgress=${QUEUE_PLAYBACK_PROGRESS_SECONDS} s`));
        assert.ok(error.message.includes(`target=${12.5 + QUEUE_PLAYBACK_PROGRESS_SECONDS} s`));
        return true;
      });
      if (deliverFrames) for (let i = 0; i < 4; i++) h.frame();
      h.advanceClock(QUEUE_PLAYBACK_TIMEOUT_MS - 1);
      assert.equal(h.observers[0].connected, true, "watchdog must not fire before its deadline");
      h.advanceClock(1);
      await failure; h.assertClean();
    });
}

test("AUD101-001: progressing playback waits for the full target and cleans up on success",
  { timeout: REGRESSION_TEST_TIMEOUT_MS }, async () => {
    const h = harness(), start = h.media.currentTime;
    const result = assertQueueUnchangedDuringPlayback(h.page);
    h.media.currentTime = start + QUEUE_PLAYBACK_PROGRESS_SECONDS / 2; h.frame();
    assert.equal(h.observers[0].connected, true);
    assert.equal(h.frames.size, 1, "partial progress schedules another sample");
    h.media.currentTime = start + QUEUE_PLAYBACK_PROGRESS_SECONDS; h.frame();
    await result; h.assertClean();
    h.advanceClock(QUEUE_PLAYBACK_TIMEOUT_MS); h.frame(); h.assertClean();
  });

for (const pending of [false, true]) {
  test(`AUD101-001: Queue mutations still fail the zero-mutation assertion (${pending ? "pending records" : "delivered records"})`,
    { timeout: REGRESSION_TEST_TIMEOUT_MS }, async () => {
      const h = harness();
      const failure = assert.rejects(assertQueueUnchangedDuringPlayback(h.page), {
        code: "ERR_ASSERTION", actual: 1, expected: 0,
      });
      if (pending) h.observers[0].pending.push({ type: "attributes" });
      else h.observers[0].callback([{ type: "attributes" }]);
      h.media.currentTime += QUEUE_PLAYBACK_PROGRESS_SECONDS; h.frame();
      await failure; h.assertClean();
    });
}

test("AUD101-001: sampling errors reject and release the observer and watchdog",
  { timeout: REGRESSION_TEST_TIMEOUT_MS }, async () => {
    const h = harness();
    const failure = assert.rejects(assertQueueUnchangedDuringPlayback(h.page), /media unavailable/);
    Object.defineProperty(h.media, "currentTime", { get() { throw Error("media unavailable"); } });
    h.frame(); await failure; h.assertClean();
  });
