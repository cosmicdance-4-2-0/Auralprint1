import test from "node:test";
import assert from "node:assert/strict";
import { Scrubber } from "../src/js/audio/scrubber.js";
import { AudioEngine } from "../src/js/audio/audio-engine.js";

function event(type, fraction = null) {
  const e = new Event(type, { cancelable: true });
  e.touches = fraction === null ? [] : [{ clientX: fraction * 100 }];
  return e;
}
function canvas() {
  return Object.assign(new EventTarget(), { clientWidth: 100, clientHeight: 36, width: 100, height: 36,
    getBoundingClientRect: () => ({ left: 0, width: 100 }),
    getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
  });
}

for (const terminal of ["touchcancel", "touchend", "reset", "load", "init"]) {
  test(`RC-14: ${terminal} terminates touch drag ownership before unrelated moves`, async t => {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    const media = { duration: 20, currentTime: 0 };
    t.mock.method(AudioEngine, "getMediaEl", () => media);
    globalThis.window = new EventTarget();
    globalThis.document = { getElementById: () => null };
    let surface = canvas();
    try {
      Scrubber.init(surface);
      const start = event("touchstart", .25); surface.dispatchEvent(start);
      assert.equal(start.defaultPrevented, true); assert.equal(media.currentTime, 5);
      if (terminal === "reset") Scrubber.reset();
      else if (terminal === "load") await Scrubber.loadFile({ arrayBuffer: async () => { throw new Error("decode unavailable"); } });
      else if (terminal === "init") { surface = canvas(); Scrubber.init(surface); }
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
