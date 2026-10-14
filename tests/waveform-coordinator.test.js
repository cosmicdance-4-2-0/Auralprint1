import test from "node:test";
import assert from "node:assert/strict";
import { createWaveformCoordinator } from "../src/js/audio/waveform-coordinator.js";
import { extractWaveform } from "../src/js/audio/waveform-extractor.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function harness(t) {
  const files = [], reads = [], decodes = [], updates = [];
  const previous = globalThis.OfflineAudioContext;
  let outstandingDecodes = 0, maxDecodes = 0;
  globalThis.OfflineAudioContext = class {
    constructor(...args) { assert.deepEqual(args, [1, 1, 44100]); }
    decodeAudioData(bytes) {
      const file = files.find(f => f.bytes === bytes);
      decodes.push(file.name);
      maxDecodes = Math.max(maxDecodes, ++outstandingDecodes);
      return file.decode.promise.finally(() => outstandingDecodes--);
    }
  };
  t.after(() => { globalThis.OfflineAudioContext = previous; });
  const coordinator = createWaveformCoordinator({
    extract: extractWaveform,
    onUpdate(status, peaks) { updates.push({ status, peaks }); },
  });
  function file(name, amplitude = .5) {
    const f = { name, bytes: new ArrayBuffer(16), read: deferred(), decode: deferred() };
    f.arrayBuffer = () => { reads.push(name); return f.read.promise; };
    f.pcm = { numberOfChannels: 6, getChannelData: c => {
      const data = new Float32Array(13);
      if (c === 5) data[12] = -amplitude;
      return data;
    } };
    files.push(f); return f;
  }
  async function read(f) { f.read.resolve(f.bytes); await flush(); }
  async function decode(f) { f.decode.resolve(f.pcm); await flush(); }
  return { coordinator, file, reads, decodes, updates, read, decode,
    get maxDecodes() { return maxDecodes; },
    get status() { return updates.at(-1)?.status; },
    get results() { return updates.filter(u => u.status === "ready").map(u => u.peaks); },
  };
}

test("AUD-007 reading A reserves the entire pipeline; B never starts and only C remains pending", async t => {
  const h = harness(t), a = h.file("A"), b = h.file("B"), c = h.file("C", .75);
  const pa = h.coordinator.request(a), pb = h.coordinator.request(b), pc = h.coordinator.request(c);
  assert.deepEqual(h.reads, ["A"], "pending replacement must not start another full read");
  assert.equal(h.status, "waiting");
  assert.equal(h.coordinator.snapshot().pendingGeneration, h.coordinator.snapshot().generation, "only newest pending generation may be retained");
  await pb;
  await h.read(a); await pa;
  assert.deepEqual(h.decodes, [], "stale encoded read must not enter native decoding");
  assert.deepEqual(h.reads, ["A", "C"], "only newest pending request may start");
  await h.read(c); await h.decode(c); await pc;
  assert.equal(h.status, "ready");
  assert.equal(h.results.length, 1);
  assert.equal(h.results[0].length, 512);
  assert.equal(h.results[0][511], .75, "sixth-channel terminal impulse must reach final bucket");
  assert.equal(h.coordinator.snapshot().occupied, false);
});

test("AUD-007 decoding A blocks all B/C work until actual settlement", async t => {
  const h = harness(t), a = h.file("A", .9), b = h.file("B"), c = h.file("C", .25);
  const pa = h.coordinator.request(a); await h.read(a);
  b.read.resolve(b.bytes); c.read.resolve(c.bytes);
  const pb = h.coordinator.request(b), pc = h.coordinator.request(c); await flush();
  assert.deepEqual(h.decodes, ["A"], "second decode cannot start before A settles");
  assert.deepEqual(h.reads, ["A"]);
  await pb;
  await h.decode(a); await pa;
  assert.equal(h.results.length, 0, "stale success must not commit peaks");
  assert.deepEqual(h.reads, ["A", "C"]);
  await h.read(c); await h.decode(c); await pc;
  assert.deepEqual(h.decodes, ["A", "C"]);
  assert.equal(h.maxDecodes, 1);
  assert.equal(h.results.length, 1);
  assert.equal(h.results[0][511], .25);
});

for (const stage of ["read", "decode"]) {
  test(`AUD-007 obsolete ${stage} rejection cannot overwrite C status and C recovers`, async t => {
    const h = harness(t), a = h.file("A"), c = h.file("C");
    const pa = h.coordinator.request(a);
    if (stage === "decode") await h.read(a);
    const pc = h.coordinator.request(c), before = h.updates.length;
    a[stage].reject(new Error("obsolete failure")); await pa; await flush();
    assert.equal(h.updates.slice(before).some(u => u.status === "unavailable"), false,
      "stale rejection must not overwrite current status");
    assert.deepEqual(h.reads, ["A", "C"]);
    await h.read(c); await h.decode(c); await pc;
    assert.equal(h.status, "ready");
  });
  test(`AUD-007 current ${stage} rejection releases the gate for a later File`, async t => {
    const h = harness(t), a = h.file("A"), c = h.file("C");
    const pa = h.coordinator.request(a);
    if (stage === "decode") await h.read(a);
    a[stage].reject(new Error("current failure")); await pa;
    assert.equal(h.status, "unavailable");
    assert.equal(h.coordinator.snapshot().occupied, false, "rejected decoder must release occupied slot");
    const pc = h.coordinator.request(c);
    assert.deepEqual(h.reads, ["A", "C"], "later request must recover after rejection");
    await h.read(c); await h.decode(c); await pc;
    assert.equal(h.status, "ready");
  });
}

for (const stage of ["read", "decode"]) {
  test(`AUD-007 Reset during ${stage} clears intent but retains resource occupancy`, async t => {
    const h = harness(t), a = h.file("A"), b = h.file("B"), c = h.file("C");
    const pa = h.coordinator.request(a);
    if (stage === "decode") await h.read(a);
    const pb = h.coordinator.request(b); h.coordinator.reset(); await pb;
    assert.equal(h.status, "empty");
    assert.equal(h.coordinator.snapshot().pending, false);
    assert.equal(h.coordinator.snapshot().occupied, true, "Reset must retain unsettled occupancy");
    const pc = h.coordinator.request(c);
    assert.deepEqual(h.reads, ["A"], "Reset cannot admit another full read before settlement");
    if (stage === "read") await h.read(a); else await h.decode(a);
    await pa;
    assert.deepEqual(h.reads, ["A", "C"]);
    assert.equal(h.results.length, 0);
    await h.read(c); await h.decode(c); await pc;
  });
  test(`AUD-007 Reset leaves no pending restart after ${stage} settles`, async t => {
    const h = harness(t), a = h.file("A"), b = h.file("B");
    const pa = h.coordinator.request(a);
    if (stage === "decode") await h.read(a);
    const pb = h.coordinator.request(b); h.coordinator.reset();
    if (stage === "read") await h.read(a); else await h.decode(a);
    await pa; await flush();
    assert.deepEqual(h.reads, ["A"], "Reset must discard pending work, never restart B");
    await pb;
    assert.equal(h.status, "empty");
    assert.equal(h.results.length, 0);
    assert.equal(h.coordinator.snapshot().occupied, false);
  });
}

for (const stage of ["read", "decode"]) {
  test(`AUD-007 unresolved ${stage} keeps all repeated replacements bounded`, async t => {
    const h = harness(t), a = h.file("A");
    const pa = h.coordinator.request(a);
    if (stage === "decode") await h.read(a);
    let latest;
    for (let i = 0; i < 100; i++) {
      latest = h.file(`replacement-${i}`);
      h.coordinator.request(latest);
      assert.equal(h.coordinator.snapshot().pending, true);
      assert.equal(h.coordinator.snapshot().pendingGeneration, h.coordinator.snapshot().generation);
    }
    await flush();
    assert.deepEqual(h.reads, ["A"], "unresolved operation must not admit replacement reads");
    assert.deepEqual(h.decodes, stage === "decode" ? ["A"] : []);
    assert.equal(h.status, "waiting");
    // Resolve only for cleanup after the hostile-order observation.
    if (stage === "read") await h.read(a); else await h.decode(a);
    await pa;
    assert.deepEqual(h.reads, ["A", "replacement-99"]);
    await h.read(latest); await h.decode(latest);
  });
}

test("AUD-007 repeated selection of the identical File creates separate generations", async t => {
  const h = harness(t), f = h.file("same File");
  const first = h.coordinator.request(f); await h.read(f);
  const firstGeneration = h.coordinator.snapshot().generation;
  const second = h.coordinator.request(f);
  assert.notEqual(h.coordinator.snapshot().generation, firstGeneration);
  await h.decode(f); await first; await second;
  assert.deepEqual(h.reads, ["same File", "same File"]);
  assert.deepEqual(h.decodes, ["same File", "same File"]);
  assert.equal(h.results.length, 1);
  assert.equal(h.maxDecodes, 1);
});

test("AUD-007 synchronous extractor failure settles and permits later extraction", async () => {
  let calls = 0;
  const updates = [];
  const c = createWaveformCoordinator({ extract() {
    if (++calls === 1) throw new Error("read startup failed");
    return Promise.resolve(new Float32Array(512));
  }, onUpdate: status => updates.push(status) });
  await c.request({}); assert.equal(updates.at(-1), "unavailable");
  await c.request({}); assert.equal(updates.at(-1), "ready");
  assert.equal(c.snapshot().occupied, false);
});

test("AUD-007 presentation reset during admission prevents even the full read", async () => {
  let calls = 0, c;
  c = createWaveformCoordinator({ extract() { calls++; }, onUpdate(status) {
    if (status === "decoding") c.reset();
  } });
  await c.request({});
  assert.equal(calls, 0);
  assert.equal(c.snapshot().occupied, false);
});

test("AUD-007 coordinator rejects stale extractor success independently of extractor checks", async () => {
  const a = deferred(), c = deferred(), updates = [];
  let calls = 0;
  const coordinator = createWaveformCoordinator({
    extract: () => (++calls === 1 ? a.promise : c.promise),
    onUpdate: (status, peaks) => updates.push({ status, peaks }),
  });
  const pa = coordinator.request({}), pc = coordinator.request({});
  a.resolve(new Float32Array([.9])); await pa; await flush();
  assert.equal(updates.some(u => u.status === "ready"), false,
    "coordinator must reject stale success independent of extractor");
  assert.equal(calls, 2);
  c.resolve(new Float32Array([.25])); await pc;
  assert.equal(updates.at(-1).peaks[0], .25);
});
