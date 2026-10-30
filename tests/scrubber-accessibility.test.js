import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Scrubber } from "../src/js/audio/scrubber.js";
import { AudioEngine } from "../src/js/audio/audio-engine.js";
import { state } from "../src/js/core/state.js";

function harness(t) {
  const previous = { window: globalThis.window, document: globalThis.document,
    audio: { ...state.audio }, source: { ...state.source } };
  const attrs = new Map();
  let writes = 0, seeks = 0, time = 65.25;
  const media = { duration: 125.5, get currentTime() { return time; },
    set currentTime(value) { seeks++; time = value; } };
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const surface = Object.assign(new EventTarget(), { clientWidth: 100, clientHeight: 36,
    getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, width: 100 }),
    getAttribute: name => attrs.get(name) ?? null,
    setAttribute(name, value) { writes++; attrs.set(name, String(value)); } });
  globalThis.window = new EventTarget();
  globalThis.document = Object.assign(new EventTarget(), { getElementById: () => null });
  Object.assign(state.audio, { isLoaded: true });
  Object.assign(state.source, { kind: "file", status: "active" });
  t.mock.method(AudioEngine, "getMediaEl", () => media);
  Scrubber.init(surface);
  t.after(() => { Scrubber.reset(); Object.assign(state.audio, previous.audio);
    Object.assign(state.source, previous.source); globalThis.window = previous.window;
    globalThis.document = previous.document; });
  return { surface, media, attrs, get writes() { return writes; }, get seeks() { return seeks; },
    key(key, options = {}) {
      const event = Object.assign(new Event("keydown", { cancelable: true }), { key, ...options });
      surface.dispatchEvent(event); return event;
    } };
}

test("F-01: template provides named slider semantics; active finite File playback enables Tab", t => {
  const template = readFileSync(new URL("../src/index.template.html", import.meta.url), "utf8");
  const canvas = template.match(/<canvas id="scrubberCanvas"[^>]+>/)[0];
  assert.match(canvas, /role="slider"/);
  assert.match(canvas, /aria-label="Playback position"/);
  const h = harness(t);
  assert.equal(h.attrs.get("tabindex"), "0");
  assert.equal(h.attrs.get("aria-disabled"), "false");
  assert.equal(h.attrs.get("aria-valuemin"), "0");
  assert.equal(h.attrs.get("aria-valuemax"), "125.5");
  assert.equal(h.attrs.get("aria-valuenow"), "65.25");
  assert.equal(h.attrs.get("aria-valuetext"), "1:05 of 2:05");
});

test("F-01: all arrows, Shift steps, Home/End and bounds each seek exactly once", t => {
  const h = harness(t);
  for (const [key, shiftKey, expected] of [
    ["ArrowLeft", false, 60.25], ["ArrowDown", false, 55.25],
    ["ArrowRight", false, 60.25], ["ArrowUp", false, 65.25],
    ["ArrowLeft", true, 35.25], ["ArrowDown", true, 5.25],
    ["ArrowRight", true, 35.25], ["ArrowUp", true, 65.25],
    ["Home", false, 0], ["ArrowLeft", false, 0], ["ArrowDown", true, 0],
    ["End", false, 125.5], ["ArrowUp", true, 125.5], ["ArrowRight", false, 125.5],
  ]) {
    const seeks = h.seeks;
    const event = h.key(key, { shiftKey });
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.cancelBubble, true, "slider owns the event before global transport");
    assert.equal(h.seeks, seeks + 1);
    assert.equal(h.media.currentTime, expected);
    assert.equal(h.attrs.get("aria-valuenow"), String(expected));
  }
  const seeks = h.seeks;
  for (const options of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, {}]) {
    const event = h.key(Object.keys(options).length ? "ArrowRight" : "Tab", options);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(h.seeks, seeks);
});

test("F-01: playback, duration changes, EOF and zero-size presentation keep finite values current", t => {
  const h = harness(t);
  h.surface.clientWidth = 0;
  h.media.currentTime = 73.5; Scrubber.draw();
  assert.equal(h.attrs.get("aria-valuenow"), "73.5");
  assert.equal(h.attrs.get("aria-valuetext"), "1:13 of 2:05");
  h.media.duration = 90; h.media.currentTime = 90; Scrubber.draw();
  assert.equal(h.attrs.get("aria-valuemax"), "90");
  assert.equal(h.attrs.get("aria-valuetext"), "1:30 of 1:30");
  h.media.currentTime = 100; Scrubber.draw();
  assert.equal(h.attrs.get("aria-valuenow"), "90");
  const writes = h.writes;
  for (let i = 0; i < 50; i++) Scrubber.draw();
  assert.equal(h.writes, writes, "unchanged state does not rewrite accessibility attributes");
});

test("F-01: no active File, pending/error source, invalid timeline and Clear discard seek values", t => {
  const h = harness(t);
  const unavailable = () => {
    Scrubber.draw();
    assert.equal(h.attrs.get("tabindex"), "-1");
    assert.equal(h.attrs.get("aria-disabled"), "true");
    for (const name of ["aria-valuemin", "aria-valuemax", "aria-valuenow"]) assert.equal(h.attrs.get(name), "0");
    assert.equal(h.attrs.get("aria-valuetext"), "Playback unavailable");
    const seeks = h.seeks;
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]) h.key(key);
    assert.equal(h.seeks, seeks);
  };
  for (const kind of ["none", "mic", "stream"]) { state.source.kind = kind; unavailable(); }
  state.source.kind = "file";
  for (const status of ["idle", "requesting", "error"]) { state.source.status = status; unavailable(); }
  state.source.status = "active";
  state.audio.isLoaded = false; unavailable(); state.audio.isLoaded = true;
  for (const duration of [NaN, Infinity, 0, -1]) { h.media.duration = duration; unavailable(); }
  h.media.duration = 100; h.media.currentTime = NaN; unavailable();
  h.media.currentTime = 15; Scrubber.draw();
  assert.equal(h.attrs.get("aria-valuenow"), "15");
  Scrubber.reset();
  assert.equal(h.attrs.get("aria-valuenow"), "0", "reset clears the previous timeline before teardown");
  state.source.kind = "none"; state.audio.isLoaded = false; unavailable();
});

test("F-01: replacement media, optional-waveform failure, pointer seeking and repeated init stay independent", async t => {
  const h = harness(t), replacement = { duration: 40, currentTime: 3 };
  Scrubber.reset();
  t.mock.method(AudioEngine, "getMediaEl", () => replacement);
  await Scrubber.loadFile({ size: NaN });
  assert.equal(h.attrs.get("aria-valuemax"), "40");
  assert.equal(h.attrs.get("aria-valuenow"), "3");
  const event = Object.assign(new Event("mousedown"), { clientX: 50, button: 0 });
  h.surface.dispatchEvent(event);
  assert.equal(replacement.currentTime, 20);
  assert.equal(h.attrs.get("aria-valuenow"), "20");
  for (let i = 0; i < 20; i++) Scrubber.init(h.surface);
  h.key("ArrowRight"); assert.equal(replacement.currentTime, 25);
  const next = Object.assign(new EventTarget(), {
    getContext: h.surface.getContext, getAttribute: h.surface.getAttribute, setAttribute: h.surface.setAttribute,
  });
  Scrubber.init(next); h.key("ArrowRight");
  assert.equal(replacement.currentTime, 25, "detached canvas no longer handles keys");
});
