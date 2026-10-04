import { fmt } from "../core/utils.js";
import { RAD_TO_DEG } from "../core/constants.js";
import { CONFIG } from "../core/config.js";
import { preferences, runtime, BAND_NAMES } from "../core/preferences.js";
import { state } from "../core/state.js";
import { BandBank } from "../audio/band-bank.js";
import { createOrbBandPicker, parseBandSelection } from "./orb-band-picker.js";

function formatOrbBandIdsText(ids) { return Array.isArray(ids) && ids.length ? ids.join(", ") : ""; }
function describeOrbBandSelection(ids) { return Array.isArray(ids) && ids.length ? `${ids.length} band${ids.length === 1 ? "" : "s"}` : "full spectrum"; }
function readBulkOrbValue(orbs, group, field) {
  if (!Array.isArray(orbs) || !orbs.length) return { available: false, mixed: false, value: undefined };
  const value = orbs[0][group][field];
  return { available: true, mixed: orbs.some((orb) => orb[group][field] !== value), value };
}
function applyBulkOrbValue(orbs, group, field, value) { if (!Array.isArray(orbs) || !orbs.length) return false; for (const orb of orbs) orb[group][field] = value; return true; }

let nextEditorToken = 0;
function createOrbEditorUi({ ui = state.ui, commitOrbChangeById, commitPreferences, showStatus, createBandPicker = createOrbBandPicker } = {}) {
  const controllers = new Map();
  let initializedOn = null;
  let lastSettingsRef = null;
  let lastBandEdgesRef = null;

  const make = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; };
  const addOption = (select, value, text) => { const option = make("option"); option.value = value; option.textContent = text; select.appendChild(option); };
  function row(token, key, labelText, control, output) {
    const wrapper = make("div", "row"); const label = make("label", "", labelText);
    control.id = `orb-editor-${token}-${key}`; label.htmlFor = control.id; wrapper.append(label, control, output); return wrapper;
  }
  function createController(id) {
    const token = ++nextEditorToken;
    const root = make("details", "orb-card orb-editor-card"); root.dataset.orbId = id;
    const summary = make("summary"); const title = make("span", "orb-editor-title"); const identity = make("span", "section-description"); summary.append(title, identity);
    const body = make("div", "section-body");
    const chan = make("select"), chanValue = make("div", "val"); for (const value of CONFIG.limits.orbs.channels) addOption(chan, value, value);
    body.appendChild(row(token, "channel", "Channel", chan, chanValue));
    const pickerRoot = make("div", "orb-band-picker"); body.appendChild(pickerRoot);
    const exact = make("details", "advanced-control"), exactSummary = make("summary", "", "Exact band indices"), bands = make("input"), bandValue = make("div", "val"), error = make("p", "picker-error");
    bands.type = "text"; bands.spellcheck = false; bands.autocomplete = "off"; bands.placeholder = "e.g. 12, 48";
    error.id = `orb-editor-${token}-band-error`; error.setAttribute("role", "alert"); bands.setAttribute("aria-describedby", error.id);
    const exactRow = row(token, "bands", "Band indices", bands, bandValue); exactRow.querySelector?.("label")?.setAttribute("title", `Comma-separated band indices (0–${BAND_NAMES.length - 1}). Empty = full spectrum energy.`);
    exact.append(exactSummary, exactRow, error); body.appendChild(exact);
    const chir = make("select"), chirValue = make("div", "val"); addOption(chir, "1", "+1 (CCW)"); addOption(chir, "-1", "-1 (CW)"); body.appendChild(row(token, "direction", "Direction", chir, chirValue));
    const hue = make("input"), hueValue = make("div", "val"); hue.type = "range"; bindRange(hue, CONFIG.limits.orbs.hueOffsetDeg); body.appendChild(row(token, "hue", "Hue offset", hue, hueValue));
    const color = make("select"), colorValue = make("div", "val"); for (const item of [["inherit","inherit global"],["dominant","dominant band"],["angle","phase locked (Glitch Mode)"],["fixed","fixed particle color"]]) addOption(color, ...item); body.appendChild(row(token, "color", "Color source", color, colorValue));
    const x = make("input"), xValue = make("div", "val"); x.type = "range"; bindRange(x, CONFIG.limits.orbs.centerXFrac); body.appendChild(row(token, "center-x", "Center X", x, xValue));
    const y = make("input"), yValue = make("div", "val"); y.type = "range"; bindRange(y, CONFIG.limits.orbs.centerYFrac); body.appendChild(row(token, "center-y", "Center Y", y, yValue)); root.append(summary, body);
    const findOrb = () => preferences.orbs.find((orb) => orb.id === id);
    const commit = (field, value, reason) => { const orb = findOrb(); if (!orb) return; orb[field] = value; commitOrbChangeById(id, reason); };
    for (const [control, event, field, read, reason] of [[chan,"change","chanId",c=>c.value,"channel"],[chir,"change","chirality",c=>Number(c.value),"direction"],[hue,"input","hueOffsetDeg",c=>Number(c.value),"hue offset"],[color,"change","colorSource",c=>c.value,"color source"],[x,"input","centerXFrac",c=>Number(c.value),"center X"],[y,"input","centerYFrac",c=>Number(c.value),"center Y"]]) control.addEventListener(event, () => commit(field, read(control), `${id} ${reason}`));
    bands.addEventListener("change", () => { const parsed = parseBandSelection(bands.value); bands.setAttribute("aria-invalid", parsed.error ? "true" : "false"); error.textContent = parsed.error; if (parsed.error) { bandValue.textContent = "Invalid indices"; showStatus(parsed.error); return; } commit("bandIds", parsed.ids, `${id} band indices`); });
    const picker = createBandPicker(pickerRoot, { orbLabel: `Orb ${id}`, onChange(ids) { commit("bandIds", ids, `${id} bands`); }, formatRange: BandBank.formatBandRangeText, describeBank: () => `${preferences.bands.distributionMode.toUpperCase()} distribution · ${BAND_NAMES.length} bands · ${Number.isFinite(state.bands.meta.nyquistHz) ? "ranges limited to the active Nyquist frequency" : "configured ranges; connect audio for the active frequency limit"}` });
    return { id, root, summary, title, identity, chan, chanValue, bands, bandValue, error, chir, chirValue, hue, hueValue, color, colorValue, x, xValue, y, yValue, picker };
  }
  function bindRange(control, limit) { control.min = String(limit.min); control.max = String(limit.max); control.step = String(limit.step); }
  function syncController(c, orb, position) {
    c.title.textContent = `Orb ${position + 1}`; c.identity.textContent = orb.id; c.summary.setAttribute("aria-label", `Edit Orb ${position + 1}, ${orb.id}`);
    c.chan.value = orb.chanId; c.chanValue.textContent = orb.chanId; c.chir.value = String(orb.chirality); c.chirValue.textContent = orb.chirality >= 0 ? "+1" : "-1";
    c.hue.value = String(orb.hueOffsetDeg); c.hueValue.textContent = `${orb.hueOffsetDeg}°`; c.color.value = orb.colorSource; c.colorValue.textContent = orb.colorSource;
    c.x.value = String(orb.centerXFrac); c.xValue.textContent = fmt(orb.centerXFrac, 2); c.y.value = String(orb.centerYFrac); c.yValue.textContent = fmt(orb.centerYFrac, 2);
    if (document.activeElement !== c.bands && c.bands.getAttribute("aria-invalid") !== "true") { c.bands.value = formatOrbBandIdsText(orb.bandIds); c.error.textContent = ""; }
    c.bandValue.textContent = c.bands.getAttribute("aria-invalid") === "true" ? "Invalid indices" : describeOrbBandSelection(orb.bandIds); c.picker?.sync(orb.bandIds);
  }
  function refresh(settings = runtime.settings) {
    const bandEdgesRef = state.bands.lowHz;
    if (settings === lastSettingsRef && bandEdgesRef === lastBandEdgesRef) return controllers;
    lastSettingsRef = settings;
    lastBandEdgesRef = bandEdgesRef;
    const orbs = Array.isArray(settings?.orbs) ? settings.orbs : [];
    for (const [id, controller] of controllers) if (!orbs.some((orb) => orb.id === id)) { controller.root.remove(); controllers.delete(id); }
    orbs.forEach((orb, position) => { let controller = controllers.get(orb.id); if (!controller) { controller = createController(orb.id); controllers.set(orb.id, controller); } syncController(controller, orb, position); ui.orbEditorList.appendChild(controller.root); });
    ui.simStatus.textContent = orbs.length ? `${orbs.length} Orb${orbs.length === 1 ? "" : "s"} in scene` : "No Orbs in scene";
    refreshBulk(orbs); return controllers;
  }
  function refreshBulk(orbs) {
    const bulk = (group, field, control, output, format) => { const model = readBulkOrbValue(orbs, group, field); control.disabled = !model.available; if (!model.available) { output.textContent = "—"; if (control.type === "checkbox") control.indeterminate = false; return; } if (!model.mixed) control.value = String(model.value); output.textContent = model.mixed ? "mixed" : format(model.value); if (control.type === "checkbox") { control.indeterminate = model.mixed; if (!model.mixed) control.checked = !!model.value; } };
    bulk("trace","lines",ui.chkLines,ui.valLines,v=>v?"on":"off"); bulk("trace","numLines",ui.rngNumLines,ui.valNumLines,String); bulk("trace","lineColorMode",ui.selLineColorMode,ui.valLineColorMode,String);
    for (const [g,f,c,o,format] of [["particles","emitPerSecond",ui.rngEmit,ui.valEmit,v=>`${v}/s`],["particles","sizeMaxPx",ui.rngSizeMax,ui.valSizeMax,v=>`${v}px`],["particles","sizeMinPx",ui.rngSizeMin,ui.valSizeMin,v=>`${v}px`],["particles","sizeToMinSec",ui.rngSizeToMin,ui.valSizeToMin,v=>`${fmt(v,1)}s`],["particles","ttlSec",ui.rngTTL,ui.valTTL,v=>`${fmt(v,1)}s`],["particles","overlapRadiusPx",ui.rngOverlap,ui.valOverlap,v=>`${fmt(v,1)}px`],["motion","angularSpeedRadPerSec",ui.rngOmega,ui.valOmega,v=>`${fmt(v,3)} rad/s (${fmt(v*RAD_TO_DEG,1)}°/s)`],["response","waveformRadialDisplaceFrac",ui.rngWfDisp,ui.valWfDisp,v=>fmt(v,3)],["response","minRadiusFrac",ui.rngMinRad,ui.valMinRad,v=>fmt(v,3)],["response","maxRadiusFrac",ui.rngMaxRad,ui.valMaxRad,v=>fmt(v,3)]]) bulk(g,f,c,o,format);
  }
  function init() {
    if (initializedOn === ui.orbEditorList) return false; initializedOn = ui.orbEditorList;
    const bulk = (control,event,group,field,read,reason) => control.addEventListener(event,()=>{ if (applyBulkOrbValue(preferences.orbs,group,field,read(control))) commitPreferences(reason); });
    bulk(ui.chkLines,"change","trace","lines",c=>!!c.checked,"lines"); bulk(ui.rngNumLines,"input","trace","numLines",c=>Number(c.value),"num lines"); bulk(ui.selLineColorMode,"change","trace","lineColorMode",c=>c.value,"line color mode");
    for (const [control,group,field,reason] of [[ui.rngEmit,"particles","emitPerSecond","emit rate"],[ui.rngSizeMax,"particles","sizeMaxPx","size max"],[ui.rngSizeMin,"particles","sizeMinPx","size min"],[ui.rngSizeToMin,"particles","sizeToMinSec","time to min"],[ui.rngTTL,"particles","ttlSec","ttl"],[ui.rngOverlap,"particles","overlapRadiusPx","overlap radius"],[ui.rngOmega,"motion","angularSpeedRadPerSec","angular speed"],[ui.rngWfDisp,"response","waveformRadialDisplaceFrac","orb waveform disp"],[ui.rngMinRad,"response","minRadiusFrac","min radius"],[ui.rngMaxRad,"response","maxRadiusFrac","max radius"]]) bulk(control,"input",group,field,c=>Number(c.value),reason);
    refresh(); return true;
  }
  function focusOrb(id) { const c = controllers.get(id); if (!c) return false; c.root.open = true; c.summary.focus(); c.root.scrollIntoView?.({ block: "nearest" }); return true; }
  return { init, refresh, focusOrb, getController: (id) => controllers.get(id) };
}

export { createOrbEditorUi, formatOrbBandIdsText, describeOrbBandSelection, readBulkOrbValue, applyBulkOrbValue };
