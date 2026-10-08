import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { TAU, RAD_TO_DEG } from "../src/js/core/constants.js";
import { preferences, runtime, replacePreferences, resolveSettings, normalizeOrbDef } from "../src/js/core/preferences.js";
import { sanitizePreset } from "../src/js/presets/preset-codec.js";
import { createOrbEditorUi } from "../src/js/ui/orb-editor.js";

// Fast generated-editor ownership checks. This DOM deliberately does not claim
// native range sanitation; scripts/validate-rc17.cjs proves that in Chromium.
function element(tag = "div") {
  const listeners = new Map();
  return { tagName: tag.toUpperCase(), type: "", dataset: {}, children: [], value: "", textContent: "", attributes: {},
    get options() { return this.tagName === "SELECT" ? this.children : undefined; },
    get selectedIndex() { return this.children.findIndex(c => c.value === this.value); },
    addEventListener(name, fn) { const handlers = listeners.get(name) || []; handlers.push(fn); listeners.set(name, handlers); },
    count(name) { return (listeners.get(name) || []).length; },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
    setAttribute(key, value) { this.attributes[key] = String(value); },
    getAttribute(key) { return this.attributes[key]; },
    append(...children) { for (const child of children) this.appendChild(child); },
    appendChild(child) { return this.insertBefore(child, null); },
    insertBefore(child, before) { child.remove(); const i = before ? this.children.indexOf(before) : -1;
      if (i < 0) this.children.push(child); else this.children.splice(i, 0, child); child.parentNode = this; return child; },
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; },
    focus() { document.activeElement = this; }, scrollIntoView() {}, querySelector() { return null; },
  };
}
function withEditor(callback) {
  const saved = { prefs: structuredClone(preferences), settings: runtime.settings, document: globalThis.document };
  globalThis.document = { createElement: element, activeElement: null };
  const view = { orbEditorList: element() };
  for (const name of ["chkLines", "rngNumLines", "selLineColorMode", "rngEmit", "rngSizeMax", "rngSizeMin",
    "rngSizeToMin", "rngTTL", "rngMinPlacementDistance", "rngOmega", "rngWfDisp", "rngMinRad", "rngMaxRad"]) {
    view[name] = element(); view[name].type = name.startsWith("chk") ? "checkbox" : "range";
    view["val" + name.replace(/^(chk|rng|sel)/, "")] = element();
  }
  replacePreferences(sanitizePreset({ schema: 10, prefs: { orbs: [{ id: "A", startAngleRad: 4 * Math.PI },
    { id: "B", startAngleRad: -Math.PI / 2 }, { id: "C", startAngleRad: 5 * Math.PI / 2 }] } }));
  resolveSettings(); let editor; const commits = [];
  editor = createOrbEditorUi({ ui: view, createBandPicker: () => ({ sync() {} }), showStatus() {}, commitPreferences() {},
    commitOrbChangeById(id) {
      commits.push(id); const i = preferences.orbs.findIndex(o => o.id === id);
      preferences.orbs[i] = normalizeOrbDef(preferences.orbs[i], CONFIG.defaults.orbs[i % 2]);
      resolveSettings(); editor.refresh();
    } });
  try { editor.init(); callback({ editor, commits, view }); }
  finally { replacePreferences(saved.prefs); runtime.settings = saved.settings; globalThis.document = saved.document; }
}
function assertUi(controller, expected) {
  assert.equal(Number(controller.phase.value), expected);
  assert.equal(controller.phase.min, "0"); assert.equal(controller.phase.max, String(TAU));
  assert.equal(controller.phase.step, "any");
  const degrees = controller.phaseValue.textContent.slice(0, -1);
  assert.equal(controller.phase.getAttribute("aria-valuetext"), `${degrees} degrees`);
  assert.ok(Math.abs(Number(degrees) - expected * RAD_TO_DEG) < 1e-12);
  assert.notEqual(controller.phaseValue.textContent, "360°");
}

test("RC-17 UI: generated controls reflect imported canonical design, fractional values and shared display/ARIA", () => withEditor(({ editor }) => {
  for (const [id, expected, text] of [["A", 0, "0°"], ["B", 3 * Math.PI / 2, "270°"], ["C", Math.PI / 2, "90°"]]) {
    const c = editor.getController(id); assertUi(c, expected); assert.equal(c.phaseValue.textContent, text);
  }
  for (const phase of [.5 / RAD_TO_DEG, 1.5 / RAD_TO_DEG, 57.2958 / RAD_TO_DEG,
    359.5 / RAD_TO_DEG, TAU - Number.EPSILON * 4, Number.MIN_VALUE]) {
    preferences.orbs[0].startAngleRad = phase; resolveSettings(); editor.refresh(); assertUi(editor.getController("A"), phase);
    assert.equal(preferences.orbs[0].startAngleRad, phase, "rendering must not quantize preferences");
  }
}));

test("RC-17 UI: native endpoint input resynchronizes in the same commit, stable IDs/focus/listeners survive reorder and replacement", () => withEditor(({ editor, commits }) => {
  const c = editor.getController("A"), input = c.phase, root = c.root; input.focus();
  preferences.orbs.reverse(); resolveSettings(); editor.refresh();
  assert.equal(editor.getController("A").phase, input); assert.equal(document.activeElement, input);
  input.value = String(TAU); input.dispatchEvent(new Event("input"));
  assert.deepEqual(commits, ["A"]); assertUi(c, 0);
  assert.equal(preferences.orbs.find(o => o.id === "A").startAngleRad, 0);
  assert.equal(preferences.orbs.find(o => o.id === "C").startAngleRad, Math.PI / 2);
  const replacement = sanitizePreset({ schema: 10, prefs: { orbs: [{ id: "A", startAngleRad: 1.5 / RAD_TO_DEG },
    { id: "NEW", startAngleRad: -Math.PI / 2 }] } });
  replacePreferences(replacement); resolveSettings(); editor.refresh();
  assert.equal(editor.getController("A").root, root); assert.equal(document.activeElement, input);
  assertUi(c, 1.5 / RAD_TO_DEG); assertUi(editor.getController("NEW"), 3 * Math.PI / 2);
  assert.equal(editor.getController("B"), undefined);
  assert.equal(editor.init(), false); for (let i = 0; i < 5; i++) { resolveSettings(); editor.refresh(); }
  assert.equal(input.count("input"), 1); assert.equal(input.count("keydown"), 1);
  input.value = String(2.5 / RAD_TO_DEG); input.dispatchEvent(new Event("input"));
  assert.deepEqual(commits, ["A", "A"]); assertUi(c, 2.5 / RAD_TO_DEG);
}));

test("RC-17 UI: Arrow keys move one degree while preserving imported fractions and synchronizing endpoint zero", () => withEditor(({ editor, commits }) => {
  const c = editor.getController("A");
  const first = new Event("keydown", { cancelable: true }); first.key = "ArrowRight";
  c.phase.dispatchEvent(first);
  assert.equal(preferences.orbs[0].startAngleRad, CONFIG.limits.orbs.startAngleRad.step);
  assert.equal(c.phaseValue.textContent, "1°"); assert.equal(c.phase.getAttribute("aria-valuetext"), "1 degrees");
  commits.length = 0;
  preferences.orbs[0].startAngleRad = 1.5 / RAD_TO_DEG; resolveSettings(); editor.refresh();
  for (const [key, expected] of [["ArrowRight", 2.5], ["ArrowUp", 3.5], ["ArrowLeft", 2.5], ["ArrowDown", 1.5]]) {
    const event = new Event("keydown", { cancelable: true }); event.key = key; c.phase.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.ok(Math.abs(Number(c.phase.value) * RAD_TO_DEG - expected) < 1e-12);
    assertUi(c, preferences.orbs[0].startAngleRad);
  }
  assert.equal(commits.length, 4);
  preferences.orbs[0].startAngleRad = 359.5 / RAD_TO_DEG; resolveSettings(); editor.refresh();
  const right = new Event("keydown", { cancelable: true }); right.key = "ArrowRight"; c.phase.dispatchEvent(right);
  assertUi(c, 0); assert.equal(preferences.orbs[0].startAngleRad, 0);
}));
