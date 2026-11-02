import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { CONFIG } from '../src/js/core/config.js';
import { makeWav, sha256, protocol, makeCases, admitCase, percentile, summarize } from '../scripts/benchmark-117/inputs.mjs';
import { installObserver } from '../scripts/benchmark-117/observer.mjs';

test('117 fixture bytes pin channel order, PCM scaling, duration and repeatability', () => {
  const stereo = makeWav(), silence = makeWav(true);
  assert.equal(sha256(stereo), '5da5f1559b5a33f939e58512cb5c45e59f8299fa4c530a56a36a47bfe7e3cd84');
  assert.equal(sha256(silence), '3847c20f84388056b5808edea7167bc8e95e365954d44e4e245c2e316df4c71e');
  assert.equal(stereo.toString('ascii', 0, 4), 'RIFF');
  assert.equal(stereo.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(stereo.readUInt16LE(20), 1);
  assert.equal(stereo.readUInt16LE(22), 2);
  assert.equal(stereo.readUInt32LE(24), 48000);
  assert.equal(stereo.readUInt32LE(28), 192000);
  assert.equal(stereo.readUInt16LE(32), 4);
  assert.equal(stereo.readUInt16LE(34), 16);
  assert.equal(stereo.length, 44 + 120 * 48000 * 4);
  assert.equal(stereo.readUInt32LE(40), stereo.length - 44);
  assert.equal(silence.subarray(44).some(Boolean), false);
  for (const n of [0, 1, 137, 12345, 5759999]) for (const [channel, hz] of [[0, 440], [1, 880]]) {
    const expected = Math.round(32767 * 0.25 * Math.sin(2 * Math.PI * hz * n / 48000));
    assert.equal(stereo.readInt16LE(44 + n * 4 + channel * 2), expected);
  }
});

test('117 cases use independent schema-16 settings without legacy fade migration', () => {
  const before = structuredClone(CONFIG.defaults), cases = makeCases();
  assert.equal(cases.length, 20);
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  assert.deepEqual(CONFIG.defaults, before);
  assert.deepEqual(cases.find(c => c.id === 'B0-none-default-running').preferences, before);
  for (const c of cases.filter(c => c.group === 'B1')) assert.equal(c.preferences.orbs.length, 0);
  for (const c of cases.filter(c => c.group === 'B2')) {
    assert.equal(c.preferences.orbs.length, c.count);
    assert.equal(new Set(c.preferences.orbs.map(o => o.id)).size, c.count);
  }
  const fade = structuredClone(before); fade.orbs[0].trace.fadeSegments = 20;
  assert.equal(admitCase({ id: 'fade-proof' }, fade).preferences.orbs[0].trace.fadeSegments, 20);
  cases[0].preferences.audio.volume = 0;
  assert.equal(cases[1].preferences.audio.volume, before.audio.volume);
  const invalid = structuredClone(before); invalid.audio.volume = -1;
  assert.throws(() => admitCase({ id: 'bad-override' }, invalid));
});

test('117 summaries use nearest-rank per-run percentiles, exclude missing data and retain long intervals', () => {
  const unsorted = [100, 2, 1, 3];
  assert.equal(percentile(unsorted, 0.5), 2);
  assert.equal(percentile(unsorted, 0.95), 100);
  assert.deepEqual(unsorted, [100, 2, 1, 3]);
  assert.throws(() => percentile([], 0.5));
  assert.throws(() => percentile([NaN], 0.5));
  const summary = summarize([{ intervalMs: null, callbackMs: null }, ...unsorted.map(intervalMs => ({ intervalMs }))]);
  assert.equal(summary.intervalMs.n, 4);
  assert.equal(summary.longIntervals, 1);
  assert.equal(summary.callbackMs, null);
  assert.equal(summary.longIntervalThresholdMs, protocol.longIntervalMs);
});

function scheduler() {
  let clock = 0, id = 0;
  const scheduled = new Map();
  const context = { performance: { now: () => clock }, Promise, window: null,
    HTMLMediaElement: class { play() { return Promise.resolve('played'); } } };
  context.window = context;
  context.requestAnimationFrame = callback => { scheduled.set(++id, callback); return id; };
  vm.runInNewContext(`(${installObserver.toString()})()`, context);
  return { context, scheduled, advance(ms) { clock += ms; },
    deliver(timestamp) {
      const callbacks = [...scheduled.values()]; scheduled.clear();
      for (const callback of callbacks) callback.call(context, timestamp);
    } };
}

test('117 observer preserves native scheduling, callback receiver/timestamps and warmup boundaries', async () => {
  const s = scheduler(), seen = [];
  function onAnimationFrame(ts) {
    assert.equal(this, s.context);
    seen.push(ts); s.context.requestAnimationFrame(onAnimationFrame); s.advance(2);
  }
  const returned = s.context.requestAnimationFrame(onAnimationFrame);
  assert.equal(returned, 1);
  const collected = s.context.ap117Observer.collect({ warmupCallbacks: 2, sampledCallbacks: 3 });
  assert.throws(() => s.context.ap117Observer.collect({ warmupCallbacks: 1, sampledCallbacks: 1 }));
  for (const ts of [10, 26, 43, 63, 113]) s.deliver(ts);
  const samples = await collected;
  assert.deepEqual(seen, [10, 26, 43, 63, 113]);
  assert.deepEqual(Array.from(samples, x => x.intervalMs), [17, 20, 50]);
  assert.deepEqual(Array.from(samples, x => x.callbackMs), [2, 2, 2]);
  assert.equal(s.scheduled.size, 1, 'Observer scheduled an extra loop');
  assert.equal(s.context.ap117Observer.callbacks, 5);
  const next = s.context.ap117Observer.nextFrame(); s.deliver(130);
  assert.equal((await next).timestampMs, 130);
});

test('117 observer leaves unrelated callbacks and application exceptions intact', () => {
  const s = scheduler(), callback = () => {};
  const id = s.context.requestAnimationFrame(callback);
  assert.equal(s.scheduled.get(id), callback);
  const error = new Error('application failure');
  s.context.requestAnimationFrame(function onAnimationFrame() { throw error; });
  assert.throws(() => s.deliver(1), caught => caught === error);
  assert.equal(s.context.ap117Observer.callbacks, 0);
});

test('117 media-clock observer preserves the native play promise and receiver', async () => {
  const s = scheduler(), media = new s.context.HTMLMediaElement();
  assert.equal(await media.play(), 'played');
  assert.equal(s.context.ap117Observer.mediaElement, media);
});

test('117 interval-only control omits callback timing and diagnostic hooks remain separate', async () => {
  const s = scheduler();
  function onAnimationFrame() { s.context.requestAnimationFrame(onAnimationFrame); s.advance(3); }
  s.context.requestAnimationFrame(onAnimationFrame);
  const untimed = s.context.ap117Observer.collect({ warmupCallbacks: 1, sampledCallbacks: 1, mode: 'interval' });
  s.deliver(0); s.deliver(16);
  assert.equal((await untimed)[0].callbackMs, null);
  let started = 0, ended = 0;
  s.context.ap117Diagnostic = { beginFrame() { started++; }, endFrame() { ended++; return { buckets: { renderMs: 1 } }; } };
  const timed = s.context.ap117Observer.collect({ warmupCallbacks: 1, sampledCallbacks: 1, mode: 'buckets' });
  s.deliver(32); s.deliver(48);
  assert.equal((await timed)[0].buckets.renderMs, 1);
  assert.equal(started, 2); assert.equal(ended, 1);
});
