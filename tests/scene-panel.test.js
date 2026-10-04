import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { createScenePanelUi, SOURCE_LABELS } from "../src/js/ui/scene-panel.js";

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
