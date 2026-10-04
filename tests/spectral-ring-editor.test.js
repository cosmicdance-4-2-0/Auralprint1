import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { createSpectralRingEditorUi } from "../src/js/ui/spectral-ring-editor.js";

function element() {
  const listeners = new Map();
  return {
    value: "", checked: false, disabled: false, textContent: "", options: [], children: [],
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); },
    dispatch(type) { for (const fn of listeners.get(type) || []) fn({ target: this }); },
    appendChild(child) { this.children.push(child); this.options.push(child); },
  };
}

function harness() {
  const keys = ["chkBandOverlay", "valBandOverlay", "chkBandConnect", "valBandConnect", "rngBandAlpha", "valBandAlpha", "rngBandPoint", "valBandPoint", "rngBandOverlayMinRad", "valBandOverlayMinRad", "rngBandOverlayMaxRad", "valBandOverlayMaxRad", "rngBandOverlayWfDisp", "valBandOverlayWfDisp", "rngBandLineAlpha", "valBandLineAlpha", "rngBandLineWidth", "valBandLineWidth", "selRingPhaseMode", "valRingPhaseMode", "rngRingSpeed", "valRingSpeed"];
  const ui = Object.fromEntries(keys.map((key) => [key, element()]));
  ui.spectralRingEditor = { open: false, querySelector: () => ({ focus() {}, scrollIntoView() {} }) };
  const overlay = structuredClone(CONFIG.defaults.bands.overlay);
  const preferences = { bands: { overlay: structuredClone(overlay) } };
  let settings = { bands: { overlay: structuredClone(overlay) } };
  let commits = 0;
  const editor = createSpectralRingEditorUi({ ui, preferences, getSettings: () => settings, commitPreferences: () => { commits += 1; } });
  return { ui, preferences, editor, commits: () => commits, replaceSettings: (next) => { settings = next; } };
}

test("Spectral Ring editor exposes every schema-10 presentation field and owned limits", () => {
  const oldDocument = globalThis.document;
  globalThis.document = { createElement: () => element() };
  try {
    const h = harness(); assert.equal(h.editor.init(), true); assert.equal(h.editor.init(), false);
    const cases = [
      ["chkBandOverlay", "enabled", "change", true], ["chkBandConnect", "connectAdjacent", "change", false],
      ["rngBandAlpha", "alpha", "input", .42], ["rngBandPoint", "pointSizePx", "input", 4],
      ["rngBandOverlayMinRad", "minRadiusFrac", "input", .2], ["rngBandOverlayMaxRad", "maxRadiusFrac", "input", .7],
      ["rngBandOverlayWfDisp", "waveformRadialDisplaceFrac", "input", .3], ["rngBandLineAlpha", "lineAlpha", "input", .6],
      ["rngBandLineWidth", "lineWidthPx", "input", 3], ["selRingPhaseMode", "phaseMode", "change", "orb"],
      ["rngRingSpeed", "ringSpeedRadPerSec", "input", 1.5],
    ];
    for (const [id, field, event, value] of cases) {
      if (typeof value === "boolean") h.ui[id].checked = value; else h.ui[id].value = String(value);
      h.ui[id].dispatch(event); assert.equal(h.preferences.bands.overlay[field], value);
    }
    assert.equal(h.commits(), cases.length);
    assert.equal(h.ui.rngBandLineAlpha.min, String(CONFIG.limits.bands.overlayLineAlpha.min));
    assert.equal(h.ui.rngBandLineWidth.max, String(CONFIG.limits.bands.overlayLineWidthPx.max));
  } finally { globalThis.document = oldDocument; }
});

test("Spectral Ring refresh is runtime-settings reference guarded", () => {
  const oldDocument = globalThis.document; globalThis.document = { createElement: () => element() };
  try {
    const h = harness(); h.editor.init();
    assert.equal(h.editor.refresh(), false);
    const next = { bands: { overlay: { ...CONFIG.defaults.bands.overlay, lineAlpha: .77, lineWidthPx: 5 } } };
    h.replaceSettings(next); assert.equal(h.editor.refresh(), true); assert.equal(h.ui.rngBandLineAlpha.value, "0.77");
    assert.equal(h.editor.refresh(), false);
  } finally { globalThis.document = oldDocument; }
});
