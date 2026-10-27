import test from "node:test";
import assert from "node:assert/strict";
import { Queue } from "../src/js/audio/queue.js";

test("AUD-001: entry handles distinguish identical names and duplicate File references", () => {
  Queue.clear();
  const first = { name: "same.wav" }, second = { name: "same.wav" };
  assert.equal(Queue.add(first), 0);
  assert.equal(Queue.add(second), 1);
  assert.equal(Queue.add(first), 2);
  const entries = [0, 1, 2].map(index => Queue.entryAt(index));
  assert.equal(new Set(entries).size, 3);
  assert.equal(entries[0].file, entries[2].file);
  assert.notEqual(entries[0], entries[2]);
  assert.notEqual(entries[0].file, entries[1].file);
  assert.equal(Queue.goTo(1), second);
  assert.equal(Queue.currentEntry(), entries[1]);
  assert.deepEqual(Queue.snapshot(), { cursor: 1, length: 3, items: [
    { index: 0, name: "same.wav", active: false },
    { index: 1, name: "same.wav", active: true },
    { index: 2, name: "same.wav", active: false },
  ] });
  assert.equal(Queue.remove(0), second);
  assert.equal(Queue.currentIndex, 0);
  assert.equal(Queue.currentEntry(), entries[1]);
  assert.equal(Queue.remove(1), second);
  assert.equal(Queue.currentEntry(), entries[1]);
  assert.equal(Queue.remove(0), null);
  assert.equal(Queue.currentEntry(), null);
  assert.equal(Queue.entryAt(-1), null);
});

test("AUD-001: shuffle and navigation preserve entry handles and method return contracts", t => {
  Queue.clear();
  const file = { name: "duplicate.wav" };
  for (let i = 0; i < 4; i++) Queue.add(file);
  const selected = Queue.entryAt(2);
  assert.equal(Queue.goTo(2), file);
  t.mock.method(Math, "random", () => 0);
  assert.equal(Queue.shuffle(), true);
  assert.equal(Queue.currentEntry(), selected);
  assert.equal(Queue.current(), file);
  assert.equal(Queue.entryAt(Queue.currentIndex), selected);
  Queue.goTo(0);
  assert.equal(Queue.next(), file);
  assert.equal(Queue.currentEntry(), Queue.entryAt(1));
  assert.equal(Queue.prev(), file);
  const successor = Queue.entryAt(1);
  assert.equal(Queue.remove(0), file);
  assert.equal(Queue.currentEntry(), successor);
  Queue.clear();
  assert.equal(Queue.currentEntry(), null);
  assert.equal(Queue.entryAt(0), null);
});

test("116F: Queue mutation revision fences newer runtime content and navigation", () => {
  Queue.clear();
  let revision = Queue.revision;
  const changed = action => { action(); assert.ok(Queue.revision > revision); revision = Queue.revision; };
  const unchanged = action => { action(); assert.equal(Queue.revision, revision); };
  changed(() => Queue.add({ name: "one.wav" }));
  changed(() => Queue.add({ name: "two.wav" }));
  changed(() => Queue.add({ name: "three.wav" }));
  changed(() => Queue.setCursor(0));
  changed(() => Queue.next());
  changed(() => Queue.prev());
  changed(() => Queue.goTo(2));
  changed(() => Queue.shuffle());
  changed(() => Queue.remove(0));
  unchanged(() => Queue.remove(99));
  unchanged(() => Queue.goTo(-1));
  unchanged(() => Queue.setCursor(-1));
  changed(() => Queue.clear());
  unchanged(() => Queue.next());
  unchanged(() => Queue.prev());
  unchanged(() => Queue.shuffle());
  assert.equal(Object.hasOwn(Queue.snapshot(), "revision"), false);
});
