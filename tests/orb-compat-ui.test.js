import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../src/js/core/config.js";
import { preferences, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { createOrbCompatUi, readBulkOrbValue } from "../src/js/ui/orb-compat-ui.js";

function element(type = "text") {
  const listeners = new Map();
  return {
    type, value: "", textContent: "", hidden: false, disabled: false, checked: false, indeterminate: false,
    attributes: {}, children: [], style: {}, className: "", open: false,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(name, handler) { const handlers = listeners.get(name) || []; handlers.push(handler); listeners.set(name, handlers); },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    dispatch(name) { for (const handler of listeners.get(name) || []) handler({ target: this }); },
    listenerCount(name) { return (listeners.get(name) || []).length; },
  };
}

function makeUi() {
  const ui = { simStatus: element(), orbCards: [element(), element()] };
  for (const index of [0, 1]) {
    for (const name of ["Chan", "Chir", "Hue", "ColorSrc", "CenterX", "CenterY", "Bands"]) {
      ui[`${name === "Hue" || name.startsWith("Center") ? "rng" : name === "Bands" ? "txt" : "sel"}Orb${index}${name}`] = element();
      ui[`valOrb${index}${name}`] = element();
    }
  }
  for (const [name, type] of [["chkLines", "checkbox"], ["rngNumLines", "range"], ["selLineColorMode", "select-one"],
    ["rngEmit", "range"], ["rngSizeMax", "range"], ["rngSizeMin", "range"], ["rngSizeToMin", "range"],
    ["rngTTL", "range"], ["rngOverlap", "range"], ["rngOmega", "range"], ["rngWfDisp", "range"],
    ["rngMinRad", "range"], ["rngMaxRad", "range"]]) {
    ui[name] = element(type);
    ui[`val${name.replace(/^(chk|rng|sel)/, "")}`] = element();
  }
  return ui;
}

function orb(index, overrides = {}) {
  const base = structuredClone(CONFIG.defaults.orbs[index % CONFIG.defaults.orbs.length]);
  return { ...base, id: `TEST${index}`, ...overrides };
}

function createHarness(orbs) {
  const previousDocument = globalThis.document;
  const previousPreferences = structuredClone(preferences);
  const previousSettings = structuredClone(state.bands);
  const ids = new Map();
  for (const index of [0, 1]) {
    ids.set(`orb${index}BandPicker`, element());
    ids.set(`orb${index}BandError`, element());
  }
  globalThis.document = {
    activeElement: null,
    createElement: (tag) => element(tag === "input" ? "text" : tag),
    getElementById: (id) => ids.get(id) || null,
  };
  replacePreferences({ ...structuredClone(CONFIG.defaults), orbs: structuredClone(orbs) });
  resolveSettings();
  const calls = { orb: [], prefs: [], status: [] };
  const ui = makeUi();
  const compat = createOrbCompatUi({
    ui,
    commitOrbChange: (...args) => calls.orb.push(args),
    commitPreferences: (...args) => calls.prefs.push(args),
    showStatus: (...args) => calls.status.push(args),
  });
  return {
    ui, ids, calls, compat,
    restore() {
      replacePreferences(previousPreferences);
      resolveSettings();
      Object.assign(state.bands, previousSettings);
      globalThis.document = previousDocument;
    },
  };
}

test("Orb compatibility initialization is idempotent across bulk, fixed-slot, and exact-band controls", () => {
  const h = createHarness([orb(0), orb(1)]);
  try {
    assert.equal(h.compat.init(), true);
    assert.equal(h.compat.init(), false);
    assert.equal(h.ui.rngEmit.listenerCount("input"), 1);
    assert.equal(h.ui.selOrb0Chan.listenerCount("change"), 1);
    assert.equal(h.ui.txtOrb0Bands.listenerCount("change"), 1);
  } finally { h.restore(); }
});

test("zero-Orb refresh is truthful, non-mutating, and bulk interaction is unavailable", () => {
  const h = createHarness([]);
  try {
    h.compat.init();
    const before = structuredClone(preferences);
    h.compat.refresh(preferences);
    assert.equal(h.ui.simStatus.textContent, "No Orbs in scene");
    assert.deepEqual(h.ui.orbCards.map((card) => card.hidden), [true, true]);
    assert.equal(h.ui.rngEmit.disabled, true);
    assert.equal(h.ui.valEmit.textContent, "—");
    assert.deepEqual(readBulkOrbValue([], "particles", "emitPerSecond"), { available: false, mixed: false, value: undefined });
    assert.deepEqual(preferences, before);
    h.ui.rngEmit.value = "99";
    h.ui.rngEmit.dispatch("input");
    assert.equal(preferences.orbs.length, 0);
    assert.equal(h.calls.prefs.length, 0);
  } finally { h.restore(); }
});

test("one-Orb view exposes only slot zero and absent fixed-slot events cannot create slot one", () => {
  const h = createHarness([orb(0, { chanId: "C", hueOffsetDeg: 17 })]);
  try {
    h.compat.init();
    h.compat.refresh(preferences);
    assert.equal(h.ui.simStatus.textContent, "Showing 1 Orb");
    assert.deepEqual(h.ui.orbCards.map((card) => card.hidden), [false, true]);
    assert.equal(h.ui.selOrb0Chan.value, "C");
    assert.equal(h.ui.valOrb0Hue.textContent, "17°");
    h.ui.rngEmit.value = "31";
    h.ui.rngEmit.dispatch("input");
    assert.equal(preferences.orbs[0].particles.emitPerSecond, 31);
    assert.deepEqual(h.calls.prefs, [["emit rate"]]);
    h.ui.selOrb1Chan.value = "L";
    h.ui.selOrb1Chan.dispatch("change");
    assert.equal(preferences.orbs.length, 1);
    assert.equal(h.calls.orb.length, 0);
  } finally { h.restore(); }
});

test("two-Orb refresh maps each canonical Orb to its corresponding compatibility card", () => {
  const h = createHarness([orb(0, { chanId: "L", chirality: 1 }), orb(1, { chanId: "R", chirality: -1 })]);
  try {
    h.compat.init();
    const before = structuredClone(preferences);
    h.compat.refresh(preferences);
    assert.equal(h.ui.simStatus.textContent, "Showing 2 Orbs");
    assert.deepEqual(h.ui.orbCards.map((card) => card.hidden), [false, false]);
    assert.deepEqual([h.ui.valOrb0Chan.textContent, h.ui.valOrb1Chan.textContent], ["L", "R"]);
    assert.deepEqual([h.ui.valOrb0Chir.textContent, h.ui.valOrb1Chir.textContent], ["+1", "-1"]);
    assert.deepEqual(preferences, before);
  } finally { h.restore(); }
});

test("N-Orb refresh shows two cards without mutation while bulk input applies to every Orb", () => {
  const orbs = Array.from({ length: 4 }, (_, index) => orb(index, {
    chanId: index ? "R" : "L",
    motion: { ...orb(index).motion, angularSpeedRadPerSec: index + 1 },
  }));
  const h = createHarness(orbs);
  try {
    h.compat.init();
    const before = structuredClone(preferences);
    h.compat.refresh(preferences);
    assert.equal(h.ui.simStatus.textContent, "Showing 2 of 4 Orbs");
    assert.equal(h.ui.orbCards.length, 2);
    assert.deepEqual([h.ui.valOrb0Chan.textContent, h.ui.valOrb1Chan.textContent], ["L", "R"]);
    assert.equal(h.ui.valOmega.textContent, "mixed");
    assert.deepEqual(preferences, before);
    h.ui.rngOmega.value = "0.75";
    h.ui.rngOmega.dispatch("input");
    assert.deepEqual(preferences.orbs.map((item) => item.motion.angularSpeedRadPerSec), [0.75, 0.75, 0.75, 0.75]);
    assert.deepEqual(h.calls.prefs, [["angular speed"]]);
  } finally { h.restore(); }
});

test("missing-slot band picker callback is a no-op", () => {
  const h = createHarness([orb(0)]);
  try {
    h.compat.init();
    const slotOnePicker = h.ids.get("orb1BandPicker");
    const fullSpectrumButton = slotOnePicker.children[1].children[0];
    fullSpectrumButton.dispatch("click");
    assert.equal(preferences.orbs.length, 1);
    assert.equal(h.calls.orb.length, 0);
  } finally { h.restore(); }
});

test("exact-band text commits valid indices and preserves invalid drafts with feedback", () => {
  const h = createHarness([orb(0, { bandIds: [2] })]);
  try {
    h.compat.init();
    h.ui.txtOrb0Bands.value = "1, 3 3";
    h.ui.txtOrb0Bands.dispatch("change");
    assert.deepEqual(preferences.orbs[0].bandIds, [1, 3]);
    assert.equal(h.ui.txtOrb0Bands.getAttribute("aria-invalid"), "false");
    assert.equal(h.ui.valOrb0Bands.textContent, "2 bands");
    assert.equal(h.calls.orb.length, 1);

    h.ui.txtOrb0Bands.value = "1, nope";
    h.ui.txtOrb0Bands.dispatch("change");
    assert.deepEqual(preferences.orbs[0].bandIds, [1, 3]);
    assert.equal(h.ui.txtOrb0Bands.getAttribute("aria-invalid"), "true");
    assert.equal(h.ui.valOrb0Bands.textContent, "Invalid indices");
    assert.match(h.ids.get("orb0BandError").textContent, /whole band indices/);
    assert.match(h.calls.status[0][0], /whole band indices/);
    assert.equal(h.calls.orb.length, 1);
  } finally { h.restore(); }
});
