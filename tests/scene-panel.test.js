import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIG } from "../src/js/core/config.js";
import { createScenePanelUi, SOURCE_LABELS } from "../src/js/ui/scene-panel.js";

// Inspect the static template's explicit nesting in JavaScript. This is a
// limited structure reader, not a browser DOM parser; comments and void tags
// must not invent ancestors or hide duplicate IDs.
function readTemplateStructure(html) {
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const nodes = [], stack = [];
  const decodeText = (text) => text.replace(/&(?:#(x[\da-f]+|\d+)|(amp|lt|gt|quot|apos|nbsp));/gi, (_match, code, name) => code
    ? String.fromCodePoint(code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code))
    : ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" })[name.toLowerCase()]);
  for (const [token] of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z](?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/gi)) {
    if (token.startsWith("<!")) continue;
    if (!token.startsWith("<")) {
      for (const node of stack) node.text += decodeText(token);
      continue;
    }
    const tag = token.match(/^<\/?([\w-]+)/)[1].toLowerCase();
    if (token.startsWith("</")) {
      const index = stack.findLastIndex((node) => node.tag === tag);
      if (index >= 0) stack.length = index;
      continue;
    }
    const attrs = {};
    const attributes = token.replace(/^<[\w-]+/, "").slice(0, -1).replace(/\/$/, "");
    for (const [, name, doubleQuoted, singleQuoted, unquoted] of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[name.toLowerCase()] = decodeText(doubleQuoted ?? singleQuoted ?? unquoted ?? "");
    }
    const node = { tag, attrs, ancestors: stack.map((ancestor) => ancestor.attrs.id), text: "" };
    nodes.push(node);
    if (!voidTags.has(tag) && !/\/\s*>$/.test(token)) stack.push(node);
  }
  return nodes;
}
const templateNodes = readTemplateStructure(readFileSync(new URL("../src/index.template.html", import.meta.url), "utf8"));

test("template structure reader retains nested ancestry and duplicate IDs across void tags and comments", () => {
  const nodes = readTemplateStructure(`<!doctype html><div id="scenePanel"><!-- <button id="fake"> -->
    <details><summary>Presets<span>Share &amp; restore</span></summary><input id="control" />
    <button id="action" title="Share > restore">Copy &#83;hare Link</button></details></div>
    <div id='visualizersPanel'><input id='control'><button id='action'>Duplicate</button></div>`);
  assert.ok(!nodes.some((node) => node.attrs.id === "fake"));
  const actions = nodes.filter((node) => node.attrs.id === "action");
  assert.equal(actions.length, 2, "duplicates remain visible to uniqueness assertions");
  assert.deepEqual(actions.map((node) => node.ancestors.filter(Boolean)), [["scenePanel"], ["visualizersPanel"]]);
  assert.equal(actions[0].attrs.title, "Share > restore");
  assert.equal(actions[0].text, "Copy Share Link");
  assert.equal(nodes.find((node) => node.tag === "summary").text, "PresetsShare & restore");
  assert.ok(actions.every((node) => !node.ancestors.includes("control")), "inputs are not ancestors");
});

test("preset buttons exist once under Scene Settings and never under Visualizers", () => {
  for (const [id, label] of [["btnShare", "Copy Share Link"], ["btnApplyUrl", "Apply URL Preset"], ["btnResetPrefs", "Reset All Settings"]]) {
    const matches = templateNodes.filter((node) => node.attrs.id === id);
    assert.equal(matches.length, 1, id);
    assert.ok(matches[0].ancestors.includes("scenePanel"), id);
    assert.ok(!matches[0].ancestors.includes("visualizersPanel"), id);
    assert.equal(matches[0].text, label);
  }
  assert.equal(templateNodes.filter((node) => node.tag === "summary" && node.text.startsWith("Presets")).length, 1);
  assert.ok(!templateNodes.some((node) => node.tag === "summary" && node.text.startsWith("Presets") && node.ancestors.includes("visualizersPanel")));
});

test("Settings copy retains canonical Scene IDs alongside Visualizers", () => {
  const byId = (id) => templateNodes.find((node) => node.attrs.id === id);
  const launcher = byId("btnOpenScene");
  assert.equal(launcher.text, "Settings");
  assert.equal(launcher.attrs["aria-controls"], "scenePanel");
  assert.equal(launcher.attrs.title, "Show Settings panel");
  assert.equal(launcher.attrs["aria-label"], "Show Settings panel");
  assert.ok(launcher.ancestors.includes("openScene"));
  assert.equal(byId("scenePanel").attrs["aria-label"], "Scene Settings");
  assert.equal(byId("btnHideScene").attrs["aria-label"], "Hide Scene Settings panel");
  assert.equal(templateNodes.find((node) => node.tag === "h2" && node.ancestors.includes("scenePanel")).text, "Scene Settings");
  assert.equal(templateNodes.find((node) => node.tag === "h2" && node.ancestors.includes("visualizersPanel")).text, "Visualizers");
  assert.deepEqual(templateNodes.filter((node) => node.tag === "summary" && node.ancestors.includes("scenePanel")).map((node) => node.text), ["Canvas", "Particle Defaults", "Band Palette", "PresetsShare or restore configuration"]);
});

function element(tag = "div") {
  const listeners = new Map();
  return { tagName: tag.toUpperCase(), value: "", textContent: "", children: [],
    get options() { return this.tagName === "SELECT" ? this.children : undefined; },
    get selectedIndex() { return this.tagName === "SELECT" ? this.children.findIndex((option) => option.value === this.value) : -1; },
    addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
    dispatch(name) { for (const fn of listeners.get(name) || []) fn({ target: this }); },
    appendChild(child) { this.children.push(child); return child; }
  };
}
function harness() {
  const ids = ["clrBg","valBg","clrParticle","valParticle","selParticleColorSrc","valParticleSrc","rngHueOff","valHueOff","rngSat","valSat","rngVal","valVal"];
  const ui = Object.fromEntries(ids.map((id) => [id, element(id === "selParticleColorSrc" ? "select" : "div")]));
  ui.scenePanel = element();
  const preferences = structuredClone(CONFIG.defaults);
  let settings = structuredClone(CONFIG.defaults), commits = 0;
  const panel = createScenePanelUi({ ui, preferences, getSettings: () => settings, commitPreferences: () => { commits += 1; } });
  return { ui, preferences, panel, commits: () => commits, replaceSettings(next) { settings = next; } };
}

test("Scene panel initializes idempotently from the canonical source enum", () => {
  const oldDocument = globalThis.document; globalThis.document = { createElement: (tag) => element(tag) };
  try { const h = harness(); assert.equal(h.panel.init(), true); assert.equal(h.panel.init(), false); assert.deepEqual(h.ui.selParticleColorSrc.options.map((o) => o.value), CONFIG.limits.sceneColor.particleColorSources); h.ui.clrBg.value="#123456"; h.ui.clrBg.dispatch("input"); assert.equal(h.preferences.visuals.backgroundColor,"#123456"); assert.equal(h.commits(),1); }
  finally { globalThis.document = oldDocument; }
});

test("Scene refresh is reference guarded and source readouts follow selected labels", () => {
  const oldDocument = globalThis.document; globalThis.document = { createElement: (tag) => element(tag) };
  try { const h=harness(); h.panel.init(); assert.equal(h.panel.refresh(),false); for (const source of CONFIG.limits.sceneColor.particleColorSources) { const next=structuredClone(CONFIG.defaults); next.bands.particleColorSource=source; h.replaceSettings(next); assert.equal(h.panel.refresh(),true); assert.equal(h.ui.selParticleColorSrc.value,source); assert.equal(h.ui.valParticleSrc.textContent,SOURCE_LABELS[source]); assert.equal(h.panel.refresh(),false); } }
  finally { globalThis.document = oldDocument; }
});

test("Scene controls mutate only historical schema-10 fields", () => {
  const oldDocument = globalThis.document; globalThis.document = { createElement: (tag) => element(tag) };
  try { const h=harness(); h.panel.init(); const cases=[["clrParticle","input","#abcdef",()=>h.preferences.visuals.particleColor],["selParticleColorSrc","change","angle",()=>h.preferences.bands.particleColorSource],["rngHueOff","input","120",()=>h.preferences.bands.rainbow.hueOffsetDeg],["rngSat","input","0.5",()=>h.preferences.bands.rainbow.saturation],["rngVal","input","0.75",()=>h.preferences.bands.rainbow.value]]; for(const [id,event,value,read] of cases){h.ui[id].value=value;h.ui[id].dispatch(event);assert.equal(read(),id.startsWith("rng")?Number(value):value);} assert.equal("scene" in h.preferences,false); }
  finally { globalThis.document = oldDocument; }
});

const BULK_CONTROL_IDS = ["rngOmega", "rngMinRad", "rngMaxRad", "rngWfDisp", "chkLines", "rngNumLines", "selLineColorMode", "rngEmit", "rngSizeMax", "rngSizeMin", "rngSizeToMin", "rngTTL", "rngOverlap"];
const RING_CONTROL_IDS = ["chkBandOverlay", "chkBandConnect", "rngBandAlpha", "rngBandPoint", "rngBandOverlayMinRad", "rngBandOverlayMaxRad", "rngBandOverlayWfDisp", "rngBandLineAlpha", "rngBandLineWidth", "selRingPhaseMode", "rngRingSpeed"];

test("Visualizers contains one inventory, Ring editor, Orb editor host, management and all 13 bulk fields", () => {
  for (const id of ["visualizerList", "visualizersStatus", "visualizerEditStatus", "spectralRingEditor", "orbEditorList", "btnVisualizersAddOrb", "btnResetVisuals", ...BULK_CONTROL_IDS, ...RING_CONTROL_IDS]) {
    const matches = templateNodes.filter((node) => node.attrs.id === id);
    assert.equal(matches.length, 1, `${id} must exist exactly once`);
    assert.ok(matches[0].ancestors.includes("visualizersPanel"), `${id} must belong to Visualizers`);
  }
  const bulkControls = templateNodes.filter((node) => ["input", "select"].includes(node.tag) && node.ancestors.includes("visualizersPanel") && !node.ancestors.includes("spectralRingEditor"));
  assert.deepEqual(bulkControls.map((node) => node.attrs.id).sort(), [...BULK_CONTROL_IDS].sort());
  const bulkSections = templateNodes.filter((node) => node.tag === "details" && node.attrs.class?.split(" ").includes("bulk-edit"));
  assert.equal(bulkSections.length, 4);
  assert.ok(bulkSections.every((node) => node.ancestors.includes("visualizersPanel")));
});

test("retired Orbs workspace and escape hatch are absent and every template ID is unique", () => {
  const ids = templateNodes.map((node) => node.attrs.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, "no duplicate control/editor IDs");
  for (const id of ["simPanel", "simStatus", "openSim", "btnOpenSim", "btnHideSim", "btnVisualizersOpenOrbs"]) assert.ok(!ids.includes(id), id);
  const launchers = templateNodes.filter((node) => node.tag === "button" && node.attrs["aria-controls"]);
  assert.equal(launchers.filter((node) => node.text === "Visualizers").length, 1);
  assert.ok(!launchers.some((node) => /Orbs|Orb Editor|Open Orb Controls/.test(node.text)));
  assert.equal(templateNodes.filter((node) => node.attrs.class?.split(" ").includes("spectral-ring-editor")).length, 1);
  for (const id of RING_CONTROL_IDS) assert.ok(templateNodes.find((node) => node.attrs.id === id).ancestors.includes("spectralRingEditor"), id);
});
