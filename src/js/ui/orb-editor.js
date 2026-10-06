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
function createOrbEditorUi({ ui = state.ui, commitOrbChangeById, commitPreferences, showStatus, onControlsChanged = () => {}, createBandPicker = createOrbBandPicker } = {}) {
  const controllers = new Map();
  let initializedOn = null;
  let lastSettingsRef = null;
  let lastBandEdgesRef = null;

  const make = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; };
  const addOption = (select, value, text) => { const option = make("option"); option.value = value; option.textContent = text; select.appendChild(option); };
  function row(token, key, labelText, control, output, title = "") {
    const wrapper = make("div", "row"); const label = make("label", "", labelText);
    control.id = `orb-editor-${token}-${key}`; label.htmlFor = control.id; if (title) { label.title = title; control.title = title; }
    wrapper.append(label, control, output); return wrapper;
  }
  function section(body, title, open = false) { const root = make("details", "settings-section orb-editor-group"); root.open = open; root.append(make("summary", "", title), body); return root; }
  function range(limit) { const control = make("input"); control.type = "range"; bindRange(control, limit); return control; }
  function rangeField(body, token, key, label, limit, title = "") { const control = range(limit), output = make("div", "val"); body.append(row(token, key, label, control, output, title)); return { control, output }; }
  function selectField(body, token, key, label, options) { const control = make("select"), output = make("div", "val"); for (const item of options) addOption(control, ...item); body.append(row(token, key, label, control, output)); return { control, output }; }
  function checkboxField(body, token, key, label) { const control = make("input"), output = make("div", "val"); control.type = "checkbox"; body.append(row(token, key, label, control, output)); return { control, output }; }

  function createController(id) {
    const token = ++nextEditorToken;
    const root = make("details", "orb-card orb-editor-card"); root.dataset.orbId = id;
    const summary = make("summary"), title = make("span", "orb-editor-title"), identity = make("span", "section-description"); summary.append(title, identity);
    const body = make("div", "orb-editor-body");

    const sourceBody = make("div", "section-body");
    const chanField = selectField(sourceBody, token, "channel", "Channel", CONFIG.limits.orbs.channels.map((value) => [value, value]));
    const pickerRoot = make("div", "orb-band-picker"); sourceBody.appendChild(pickerRoot);
    const exact = make("details", "advanced-control"), exactSummary = make("summary", "", "Exact band indices"), bands = make("input"), bandValue = make("div", "val"), error = make("p", "picker-error");
    bands.type = "text"; bands.spellcheck = false; bands.autocomplete = "off"; bands.placeholder = "e.g. 12, 48";
    error.id = `orb-editor-${token}-band-error`; error.setAttribute("role", "alert"); bands.setAttribute("aria-describedby", error.id);
    exact.append(exactSummary, row(token, "bands", "Band indices", bands, bandValue, `Comma-separated band indices (0–${BAND_NAMES.length - 1}). Empty = full spectrum energy.`), error); sourceBody.appendChild(exact);
    body.append(section(sourceBody, "Source", true));

    const motionBody = make("div", "section-body");
    const xField = rangeField(motionBody, token, "center-x", "Center X", CONFIG.limits.orbs.centerXFrac);
    const yField = rangeField(motionBody, token, "center-y", "Center Y", CONFIG.limits.orbs.centerYFrac);
    const chirField = selectField(motionBody, token, "direction", "Direction", [["1", "+1 (CCW)"], ["-1", "-1 (CW)"]]);
    const phaseField = rangeField(motionBody, token, "phase-offset", "Phase Offset", CONFIG.limits.orbs.startAngleRad, "Starting orbital phase; applied on Reset Visuals.");
    const speedField = rangeField(motionBody, token, "angular-speed", "Angular Speed", CONFIG.limits.motion.angularSpeedRadPerSec);
    body.append(section(motionBody, "Position & Motion"));

    const responseBody = make("div", "section-body");
    const minRadiusField = rangeField(responseBody, token, "min-radius", "Min Radius", CONFIG.limits.orbs.response.minRadiusFrac);
    const maxRadiusField = rangeField(responseBody, token, "max-radius", "Max Radius", CONFIG.limits.orbs.response.maxRadiusFrac);
    const waveformField = rangeField(responseBody, token, "waveform-displacement", "Waveform Displacement", CONFIG.limits.orbs.response.waveformRadialDisplaceFrac);
    body.append(section(responseBody, "Response"));

    const particlesBody = make("div", "section-body");
    const emitField = rangeField(particlesBody, token, "emit-rate", "Emit Rate", CONFIG.limits.particles.emitPerSecond);
    const sizeMinField = rangeField(particlesBody, token, "size-min", "Minimum Size", CONFIG.limits.particles.sizeMinPx);
    const sizeMaxField = rangeField(particlesBody, token, "size-max", "Maximum Size", CONFIG.limits.particles.sizeMaxPx);
    const decayField = rangeField(particlesBody, token, "size-decay", "Size Decay Time", CONFIG.limits.particles.sizeToMinSec);
    const ttlField = rangeField(particlesBody, token, "lifetime", "Lifetime", CONFIG.limits.particles.ttlSec);
    const overlapField = rangeField(particlesBody, token, "overlap", "Overlap Radius", CONFIG.limits.particles.overlapRadiusPx);
    body.append(section(particlesBody, "Particles"));

    const traceBody = make("div", "section-body");
    const linesField = checkboxField(traceBody, token, "lines", "Lines Enabled");
    const numLinesField = rangeField(traceBody, token, "line-count", "Line Count", CONFIG.limits.trace.numLines);
    const alphaField = rangeField(traceBody, token, "line-alpha", "Line Alpha", CONFIG.limits.trace.lineAlpha);
    const widthField = rangeField(traceBody, token, "line-width", "Line Width", CONFIG.limits.trace.lineWidthPx);
    const lineColorField = selectField(traceBody, token, "line-color", "Line Color Mode", [["fixed", "Scene Fixed Particle Color"], ["lastParticle", "Last Particle"], ["dominantBand", "Global Dominant Band"]]);
    body.append(section(traceBody, "Trace"));

    const colorBody = make("div", "section-body");
    const colorHelp = make("p", "section-description", "Inherit Scene uses the Scene default Orb color policy. Targeted inherited Dominant follows the strongest selected band in that Orb's channel.");
    colorBody.appendChild(colorHelp);
    const colorField = selectField(colorBody, token, "color", "Color Source", [["inherit", "Inherit Scene"], ["dominant", "Global Dominant Band"], ["angle", "Orb Phase Palette (Glitch Mode)"], ["fixed", "Scene Fixed Particle Color"]]);
    const hueField = rangeField(colorBody, token, "hue", "Hue Offset", CONFIG.limits.orbs.hueOffsetDeg);
    body.append(section(colorBody, "Color")); root.append(summary, body);

    const findOrb = () => preferences.orbs.find((orb) => orb.id === id);
    const commit = (field, value, reason) => { const orb = findOrb(); if (!orb) return; orb[field] = value; commitOrbChangeById(id, reason); };
    const commitNested = (group, field, value, reason) => { const orb = findOrb(); if (!orb) return; orb[group][field] = value; commitOrbChangeById(id, reason); };
    for (const [control, event, field, read, reason] of [[chanField.control,"change","chanId",c=>c.value,"channel"],[chirField.control,"change","chirality",c=>Number(c.value),"direction"],[phaseField.control,"input","startAngleRad",c=>Number(c.value),"phase offset"],[hueField.control,"input","hueOffsetDeg",c=>Number(c.value),"hue offset"],[colorField.control,"change","colorSource",c=>c.value,"color source"],[xField.control,"input","centerXFrac",c=>Number(c.value),"center X"],[yField.control,"input","centerYFrac",c=>Number(c.value),"center Y"]]) control.addEventListener(event, () => commit(field, read(control), `${id} ${reason}`));
    for (const [field, group, key, reason] of [[speedField,"motion","angularSpeedRadPerSec","angular speed"],[minRadiusField,"response","minRadiusFrac","min radius"],[maxRadiusField,"response","maxRadiusFrac","max radius"],[waveformField,"response","waveformRadialDisplaceFrac","waveform displacement"],[emitField,"particles","emitPerSecond","emit rate"],[sizeMinField,"particles","sizeMinPx","minimum size"],[sizeMaxField,"particles","sizeMaxPx","maximum size"],[decayField,"particles","sizeToMinSec","size decay"],[ttlField,"particles","ttlSec","lifetime"],[overlapField,"particles","overlapRadiusPx","overlap radius"],[numLinesField,"trace","numLines","line count"],[alphaField,"trace","lineAlpha","line alpha"],[widthField,"trace","lineWidthPx","line width"]]) field.control.addEventListener("input", () => commitNested(group, key, Number(field.control.value), `${id} ${reason}`));
    linesField.control.addEventListener("change", () => commitNested("trace", "lines", !!linesField.control.checked, `${id} lines`));
    lineColorField.control.addEventListener("change", () => commitNested("trace", "lineColorMode", lineColorField.control.value, `${id} line color mode`));
    bands.addEventListener("change", () => { const parsed = parseBandSelection(bands.value); bands.setAttribute("aria-invalid", parsed.error ? "true" : "false"); error.textContent = parsed.error; if (parsed.error) { bandValue.textContent = "Invalid indices"; showStatus(parsed.error); return; } commit("bandIds", parsed.ids, `${id} band indices`); });
    const picker = createBandPicker(pickerRoot, { orbLabel: `Orb ${id}`, onChange(ids) { commit("bandIds", ids, `${id} bands`); }, formatRange: BandBank.formatBandRangeText, describeBank: () => `${preferences.bands.distributionMode.toUpperCase()} distribution · ${BAND_NAMES.length} bands · ${Number.isFinite(state.bands.meta.nyquistHz) ? "ranges limited to the active Nyquist frequency" : "configured ranges; connect audio for the active frequency limit"}` });
    return { id, root, summary, title, identity, chan: chanField.control, chanValue: chanField.output, bands, bandValue, error, chir: chirField.control, chirValue: chirField.output, phase: phaseField.control, phaseValue: phaseField.output, hue: hueField.control, hueValue: hueField.output, color: colorField.control, colorValue: colorField.output, x: xField.control, xValue: xField.output, y: yField.control, yValue: yField.output, speed: speedField.control, speedValue: speedField.output, minRadius: minRadiusField.control, minRadiusValue: minRadiusField.output, maxRadius: maxRadiusField.control, maxRadiusValue: maxRadiusField.output, waveform: waveformField.control, waveformValue: waveformField.output, emit: emitField.control, emitValue: emitField.output, sizeMin: sizeMinField.control, sizeMinValue: sizeMinField.output, sizeMax: sizeMaxField.control, sizeMaxValue: sizeMaxField.output, decay: decayField.control, decayValue: decayField.output, ttl: ttlField.control, ttlValue: ttlField.output, overlap: overlapField.control, overlapValue: overlapField.output, lines: linesField.control, linesValue: linesField.output, numLines: numLinesField.control, numLinesValue: numLinesField.output, lineAlpha: alphaField.control, lineAlphaValue: alphaField.output, lineWidth: widthField.control, lineWidthValue: widthField.output, lineColor: lineColorField.control, lineColorValue: lineColorField.output, picker };
  }
  function bindRange(control, limit) { control.min = String(limit.min); control.max = String(limit.max); control.step = String(limit.step); }
  function syncController(c, orb, position) {
    const set = (control, output, value, formatted) => { control.value = String(value); output.textContent = formatted; };
    const setSelect = (control, output, value) => {
      control.value = String(value);
      output.textContent = control.options?.[control.selectedIndex]?.textContent || String(value);
    };
    c.title.textContent = `Orb ${position + 1}`; c.identity.textContent = orb.id; c.summary.setAttribute("aria-label", `Edit Orb ${position + 1}, ${orb.id}`);
    setSelect(c.chan,c.chanValue,orb.chanId); setSelect(c.chir,c.chirValue,orb.chirality);
    const phaseDegrees = fmt(orb.startAngleRad * RAD_TO_DEG, 0);
    set(c.phase,c.phaseValue,orb.startAngleRad,`${phaseDegrees}°`); c.phase.setAttribute("aria-valuetext", `${phaseDegrees} degrees`); set(c.hue,c.hueValue,orb.hueOffsetDeg,`${orb.hueOffsetDeg}°`); setSelect(c.color,c.colorValue,orb.colorSource);
    set(c.x,c.xValue,orb.centerXFrac,fmt(orb.centerXFrac,2)); set(c.y,c.yValue,orb.centerYFrac,fmt(orb.centerYFrac,2)); set(c.speed,c.speedValue,orb.motion.angularSpeedRadPerSec,`${fmt(orb.motion.angularSpeedRadPerSec,3)} rad/s (${fmt(orb.motion.angularSpeedRadPerSec*RAD_TO_DEG,1)}°/s)`);
    set(c.minRadius,c.minRadiusValue,orb.response.minRadiusFrac,fmt(orb.response.minRadiusFrac,3)); set(c.maxRadius,c.maxRadiusValue,orb.response.maxRadiusFrac,fmt(orb.response.maxRadiusFrac,3)); set(c.waveform,c.waveformValue,orb.response.waveformRadialDisplaceFrac,fmt(orb.response.waveformRadialDisplaceFrac,3));
    set(c.emit,c.emitValue,orb.particles.emitPerSecond,`${orb.particles.emitPerSecond}/s`); set(c.sizeMin,c.sizeMinValue,orb.particles.sizeMinPx,`${orb.particles.sizeMinPx}px`); set(c.sizeMax,c.sizeMaxValue,orb.particles.sizeMaxPx,`${orb.particles.sizeMaxPx}px`); set(c.decay,c.decayValue,orb.particles.sizeToMinSec,`${fmt(orb.particles.sizeToMinSec,1)}s`); set(c.ttl,c.ttlValue,orb.particles.ttlSec,`${fmt(orb.particles.ttlSec,1)}s`); set(c.overlap,c.overlapValue,orb.particles.overlapRadiusPx,`${fmt(orb.particles.overlapRadiusPx,1)}px`);
    c.lines.checked = orb.trace.lines; c.lines.indeterminate = false; c.linesValue.textContent = orb.trace.lines ? "on" : "off"; set(c.numLines,c.numLinesValue,orb.trace.numLines,String(orb.trace.numLines)); set(c.lineAlpha,c.lineAlphaValue,orb.trace.lineAlpha,fmt(orb.trace.lineAlpha,2)); set(c.lineWidth,c.lineWidthValue,orb.trace.lineWidthPx,`${orb.trace.lineWidthPx}px`); setSelect(c.lineColor,c.lineColorValue,orb.trace.lineColorMode);
    if (document.activeElement !== c.bands && c.bands.getAttribute("aria-invalid") !== "true") { c.bands.value = formatOrbBandIdsText(orb.bandIds); c.error.textContent = ""; }
    c.bandValue.textContent = c.bands.getAttribute("aria-invalid") === "true" ? "Invalid indices" : describeOrbBandSelection(orb.bandIds); c.picker?.sync(orb.bandIds);
  }
  function refresh(settings = runtime.settings) {
    const bandEdgesRef = state.bands.lowHz; if (settings === lastSettingsRef && bandEdgesRef === lastBandEdgesRef) return controllers;
    lastSettingsRef = settings; lastBandEdgesRef = bandEdgesRef; let controlsChanged = false; const orbs = Array.isArray(settings?.orbs) ? settings.orbs : [];
    for (const [id, controller] of controllers) if (!orbs.some((orb) => orb.id === id)) { controller.root.remove(); controllers.delete(id); controlsChanged = true; }
    orbs.forEach((orb, position) => {
      let controller = controllers.get(orb.id);
      if (!controller) { controller = createController(orb.id); controllers.set(orb.id, controller); controlsChanged = true; }
      syncController(controller, orb, position);
      const currentNode = ui.orbEditorList.children[position];
      if (currentNode !== controller.root) ui.orbEditorList.insertBefore(controller.root, currentNode || null);
    });
    refreshBulk(orbs);
    if (controlsChanged) onControlsChanged();
    return controllers;
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
