import test from "node:test";
import assert from "node:assert/strict";
import { Scrubber } from "../src/js/audio/scrubber.js";
import { AudioEngine } from "../src/js/audio/audio-engine.js";

function event(type, fraction = null, { button = 0, buttons = /down|move/.test(type) ? 1 : 0 } = {}) {
  const e = new Event(type, { cancelable: true });
  e.touches = fraction === null ? [] : [{ clientX: fraction * 100 }];
  e.clientX = fraction * 100;
  e.button = button;
  e.buttons = buttons;
  return e;
}
function canvas() {
  return Object.assign(new EventTarget(), { clientWidth: 100, clientHeight: 36, width: 100, height: 36,
    getBoundingClientRect: () => ({ left: 0, width: 100 }),
    getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
  });
}

for (const terminal of ["touchcancel", "touchend", "reset", "load", "init", "blur", "hidden"]) {
  test(`RC-14: ${terminal} terminates touch drag ownership before unrelated moves`, async t => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    const media = { duration: 20, currentTime: 0 };
    t.mock.method(AudioEngine, "getMediaEl", () => media);
    globalThis.window = new EventTarget();
    globalThis.document = Object.assign(new EventTarget(), { getElementById: () => null });
    let surface = canvas();
    try {
      Scrubber.init(surface);
      const start = event("touchstart", .25); surface.dispatchEvent(start);
      assert.equal(start.defaultPrevented, true); assert.equal(media.currentTime, 5);
      if (terminal === "reset") Scrubber.reset();
      else if (terminal === "load") await Scrubber.loadFile({ arrayBuffer: async () => { throw new Error("decode unavailable"); } });
      else if (terminal === "init") { surface = canvas(); Scrubber.init(surface); }
      else if (terminal === "hidden") { document.hidden = true; document.dispatchEvent(new Event("visibilitychange")); }
      else window.dispatchEvent(event(terminal));
      const unrelated = event("touchmove", .75); window.dispatchEvent(unrelated);
      assert.equal(unrelated.defaultPrevented, false);
      assert.equal(media.currentTime, 5);
      surface.dispatchEvent(event("touchstart", .5));
      const validMove = event("touchmove", .6); window.dispatchEvent(validMove);
      assert.equal(validMove.defaultPrevented, true); assert.equal(media.currentTime, 12);
      window.dispatchEvent(event("touchend"));
    } finally { Scrubber.reset(); globalThis.window = previousWindow; globalThis.document = previousDocument; }
  });
}

function trackedTarget() {
  const target = new EventTarget(), listeners = new Map();
  const add = target.addEventListener, remove = target.removeEventListener;
  target.addEventListener = (type, handler, options) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
    add.call(target, type, handler, options);
  };
  target.removeEventListener = (type, handler) => {
    listeners.get(type)?.delete(handler);
    remove.call(target, type, handler);
  };
  target.listenerCount = () => [...listeners.values()].reduce((sum, handlers) => sum + handlers.size, 0);
  return target;
}

function mouseHarness(t) {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  let time = 0, seeks = 0;
  const media = { duration: 10, get currentTime() { return time; }, set currentTime(value) { time = value; seeks++; } };
  t.mock.method(AudioEngine, "getMediaEl", () => media);
  const win = trackedTarget(), doc = Object.assign(trackedTarget(), { hidden: false, getElementById: () => null });
  const surface = Object.assign(trackedTarget(), canvas());
  globalThis.window = win; globalThis.document = doc;
  Scrubber.init(surface);
  t.after(() => { Scrubber.reset(); globalThis.window = oldWindow; globalThis.document = oldDocument; });
  return { win, doc, surface, media, get seeks() { return seeks; },
    press(f = .2, options) { surface.dispatchEvent(event("mousedown", f, options)); },
    move(f, options) { win.dispatchEvent(event("mousemove", f, options)); },
  };
}

test("AUD116-004: held mouse drag seeks inside/outside canvas; window mouseup ends ownership", t => {
  const h = mouseHarness(t);
  h.move(.8); assert.equal(h.seeks, 0);
  h.press(); assert.equal(h.media.currentTime, 2);
  h.move(.6); assert.equal(h.media.currentTime, 6);
  h.doc.dispatchEvent(new Event("visibilitychange"));
  h.move(.7); assert.equal(h.media.currentTime, 7, "visible-document notifications retain the drag");
  h.move(1.2); assert.equal(h.media.currentTime, 10);
  h.move(-.2); assert.equal(h.media.currentTime, 0);
  h.move(.4); assert.equal(h.media.currentTime, 4);
  h.win.dispatchEvent(event("mouseup", 1.2));
  h.move(.8); assert.equal(h.media.currentTime, 4);
});

for (const terminal of ["blur", "hidden", "no-buttons", "mouseup", "reset", "load", "init"]) {
  test(`AUD116-004: ${terminal} cancels mouse ownership without seeking; fresh drags recover`, async t => {
    const h = mouseHarness(t);
    for (let cycle = 0; cycle < 4; cycle++) {
      h.press(); assert.equal(h.media.currentTime, 2);
      const seeks = h.seeks;
      if (terminal === "blur") h.win.dispatchEvent(new Event("blur"));
      if (terminal === "hidden") { h.doc.hidden = true; h.doc.dispatchEvent(new Event("visibilitychange")); }
      if (terminal === "no-buttons") h.move(.8, { buttons: 0 });
      if (terminal === "mouseup") h.win.dispatchEvent(event("mouseup", .8));
      if (terminal === "reset") { Scrubber.reset(); Scrubber.reset(); }
      if (terminal === "load") await Scrubber.loadFile({ size: NaN });
      if (terminal === "init") Scrubber.init(h.surface);
      assert.equal(h.seeks, seeks, "cancellation itself must not seek");
      h.doc.hidden = false; h.doc.dispatchEvent(new Event("visibilitychange"));
      h.win.dispatchEvent(new Event("focus"));
      h.move(.8, { buttons: 0 }); h.move(.8);
      assert.equal(h.media.currentTime, 2, "focus/held movement cannot restore abandoned ownership");
      h.press(.4); h.move(.6);
      assert.equal(h.media.currentTime, 6);
      h.win.dispatchEvent(event("mouseup"));
    }
  });
}

for (const [button, buttons] of [[0, 1], [1, 4], [2, 2], [3, 8], [4, 16]]) {
  test(`AUD116-004: button ${button} keeps existing seeking and requires its own held bit`, t => {
    const h = mouseHarness(t);
    h.press(.2, { button, buttons }); h.move(.4, { buttons });
    assert.equal(h.media.currentTime, 4);
    h.move(.8, { buttons: button === 0 ? 2 : 1 });
    assert.equal(h.media.currentTime, 4, "another held button does not own this drag");
    h.move(.8, { buttons }); assert.equal(h.media.currentTime, 4);
  });
}

test("AUD116-004: mouse and touch movement consume only their own initiating gesture", t => {
  const h = mouseHarness(t);
  h.press();
  const unrelatedTouch = event("touchmove", .8); h.win.dispatchEvent(unrelatedTouch);
  assert.equal(unrelatedTouch.defaultPrevented, false); assert.equal(h.media.currentTime, 2);
  h.surface.dispatchEvent(event("touchstart", .3));
  h.move(.8, { buttons: 0 }); assert.equal(h.media.currentTime, 3);
  const touch = event("touchmove", .5, { buttons: 0 }); h.win.dispatchEvent(touch);
  assert.equal(touch.defaultPrevented, true); assert.equal(h.media.currentTime, 5);
  h.win.dispatchEvent(event("touchcancel"));
  h.win.dispatchEvent(event("touchmove", .8)); assert.equal(h.media.currentTime, 5);
});

test("AUD116-004: same/replacement canvas and window/document listener ownership remains bounded", t => {
  const h = mouseHarness(t);
  const initial = [h.surface.listenerCount(), h.win.listenerCount(), h.doc.listenerCount()];
  assert.deepEqual(initial, [2, 6, 1]);
  for (let i = 0; i < 20; i++) Scrubber.init(h.surface);
  assert.deepEqual([h.surface.listenerCount(), h.win.listenerCount(), h.doc.listenerCount()], initial);
  const nextSurface = Object.assign(trackedTarget(), canvas());
  h.press(); h.win.dispatchEvent(new Event("blur"));
  Scrubber.init(nextSurface);
  assert.equal(h.surface.listenerCount(), 0);
  h.surface.dispatchEvent(event("mousedown", .8)); h.move(.8);
  assert.equal(h.media.currentTime, 2);
  nextSurface.dispatchEvent(event("touchstart", .3));
  const nextWin = trackedTarget(), nextDoc = Object.assign(trackedTarget(), { hidden: false, getElementById: () => null });
  globalThis.window = nextWin; globalThis.document = nextDoc;
  Scrubber.init(nextSurface);
  assert.equal(h.win.listenerCount(), 0); assert.equal(h.doc.listenerCount(), 0);
  assert.deepEqual([nextSurface.listenerCount(), nextWin.listenerCount(), nextDoc.listenerCount()], initial);
  nextWin.dispatchEvent(event("touchmove", .8)); assert.equal(h.media.currentTime, 3, "reinit ends touch drag");
  nextSurface.dispatchEvent(event("mousedown", .4));
  h.win.dispatchEvent(new Event("blur")); h.doc.hidden = true; h.doc.dispatchEvent(new Event("visibilitychange"));
  h.win.dispatchEvent(event("mousemove", .9)); h.win.dispatchEvent(event("touchmove", .9));
  h.win.dispatchEvent(event("mouseup")); h.win.dispatchEvent(event("touchcancel"));
  nextWin.dispatchEvent(event("mousemove", .6));
  assert.equal(h.media.currentTime, 6, "old cancellation callbacks must not cancel new window's drag");
});
