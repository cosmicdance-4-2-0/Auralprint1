import { bindConfigRange, readConfigRange, syncConfigRange, selectConfigGrid } from "./config-range.js";
import { fmt } from "../core/utils.js";
import { RAD_TO_DEG } from "../core/constants.js";
import { CONFIG } from "../core/config.js";
import { preferences, runtime, BAND_NAMES } from "../core/preferences.js";
import { state } from "../core/state.js";
import { BandBank } from "../audio/band-bank.js";
import { createOrbBandPicker, parseBandSelection, describeBandTargets } from "./orb-band-picker.js";

function formatOrbBandIdsText(ids) { return Array.isArray(ids) && ids.length ? ids.join(", ") : ""; }
function describeOrbBandSelection(ids) { return Array.isArray(ids) && ids.length ? `${ids.length} band${ids.length === 1 ? "" : "s"}` : "full spectrum"; }
function readBulkOrbValue(orbs, group, field) {
  if (!Array.isArray(orbs) || !orbs.length) return { available: false, mixed: false, value: undefined };
  const value = orbs[0][group][field];
  return { available: true, mixed: orbs.some((orb) => orb[group][field] !== value), value };
}
function applyBulkOrbValue(orbs, group, field, value) { if (!Array.isArray(orbs) || !orbs.length) return false; for (const orb of orbs) orb[group][field] = value; return true; }

// Keep dependent legacy values intact: restrict only the deliberately edited
// field to grid indices satisfying the existing size/lifetime relationship.
function editingBounds(orbs, group, field) {
  if (group !== "particles" || !orbs.length || orbs.some(orb => !orb)) return {};
  if (field === "sizeMinPx") return { max: Math.min(...orbs.map(orb => orb.particles.sizeMaxPx)) };
  if (field === "sizeMaxPx") return { min: Math.max(...orbs.map(orb => orb.particles.sizeMinPx)) };
  if (field === "sizeToMinSec") return { max: Math.min(...orbs.map(orb => orb.particles.ttlSec)) };
  if (field === "ttlSec") return { min: Math.max(...orbs.map(orb => orb.particles.sizeToMinSec)) };
  return {};
}

function formatOrbPhaseDegrees(radians) {
  const degrees = radians * RAD_TO_DEG;
  const whole = Math.round(degrees);
  if (whole < 360 && (radians === whole / RAD_TO_DEG || radians === selectConfigGrid(radians, CONFIG.limits.orbs.startAngleRad))) return String(whole);
  // Keep ordinary fractions readable; retain full precision if rounding would
  // describe a fractional phase as an exact integer (especially 360 degrees).
  const readable = Number(degrees.toPrecision(12));
  return String(Number.isInteger(readable) && readable !== degrees ? degrees : readable);
}

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
    exact.append(exactSummary, row(token, "bands", "Band indices", bands, bandValue, `Comma-separated band indices (0–${BAND_NAMES.length - 1}). Empty = full spectrum energy. Indices outside the active bank are kept inactive.`), error); sourceBody.appendChild(exact);
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
    const spacingField = rangeField(particlesBody, token, "min-placement-distance", "Minimum Placement Distance (world units)", CONFIG.limits.particles.minPlacementDistanceUnits);
    const spacingHelp = make("p", "section-description", "Minimum distance from this Orb's last retained particle before a new particle is placed. 0 disables filtering.");
    spacingHelp.id = `orb-editor-${token}-min-placement-distance-help`;
    spacingField.control.setAttribute("aria-describedby", spacingHelp.id);
    particlesBody.appendChild(spacingHelp);
    body.append(section(particlesBody, "Particles"));

    const traceBody = make("div", "section-body");
    const linesField = checkboxField(traceBody, token, "lines", "Lines Enabled");
    const numLinesField = rangeField(traceBody, token, "line-count", "Line Count", CONFIG.limits.trace.numLines);
    const alphaField = rangeField(traceBody, token, "line-alpha", "Line Alpha", CONFIG.limits.trace.lineAlpha);
    const widthField = rangeField(traceBody, token, "line-width", "Line Width", CONFIG.limits.trace.lineWidthPx);
    const fadeSegmentsField = rangeField(traceBody, token, "fade-segments", "Fade Length", CONFIG.limits.trace.fadeSegments);
    const fadeHelp = make("p", "section-description", "Fade the oldest visible Trace segments toward the Scene background. Fade Length is measured in segments and cannot exceed the visible Trace.");
    fadeHelp.id = `orb-editor-${token}-fade-help`;
    fadeSegmentsField.control.setAttribute("aria-describedby", fadeHelp.id);
    traceBody.appendChild(fadeHelp);
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
    for (const [control, event, field, read, reason] of [[chanField.control,"change","chanId",c=>c.value,"channel"],[chirField.control,"change","chirality",c=>Number(c.value),"direction"],[phaseField.control,"input","startAngleRad",c=>readConfigRange(c),"phase offset"],[hueField.control,"input","hueOffsetDeg",c=>Number(c.value),"hue offset"],[colorField.control,"change","colorSource",c=>c.value,"color source"],[xField.control,"input","centerXFrac",c=>Number(c.value),"center X"],[yField.control,"input","centerYFrac",c=>Number(c.value),"center Y"]]) control.addEventListener(event, () => { const value = control.type === "range" ? readConfigRange(control) : read(control); if (value !== null) commit(field, value, `${id} ${reason}`); });
    for (const [field, group, key, reason] of [[speedField,"motion","angularSpeedRadPerSec","angular speed"],[minRadiusField,"response","minRadiusFrac","min radius"],[maxRadiusField,"response","maxRadiusFrac","max radius"],[waveformField,"response","waveformRadialDisplaceFrac","waveform displacement"],[emitField,"particles","emitPerSecond","emit rate"],[sizeMinField,"particles","sizeMinPx","minimum size"],[sizeMaxField,"particles","sizeMaxPx","maximum size"],[decayField,"particles","sizeToMinSec","size decay"],[ttlField,"particles","ttlSec","lifetime"],[spacingField,"particles","minPlacementDistanceUnits","minimum placement distance"],[numLinesField,"trace","numLines","line count"],[fadeSegmentsField,"trace","fadeSegments","fade length"],[alphaField,"trace","lineAlpha","line alpha"],[widthField,"trace","lineWidthPx","line width"]]) field.control.addEventListener("input", () => { const value = readConfigRange(field.control, editingBounds([findOrb()], group, key)); if (value !== null) commitNested(group, key, value, `${id} ${reason}`); });
    linesField.control.addEventListener("change", () => commitNested("trace", "lines", !!linesField.control.checked, `${id} lines`));
    lineColorField.control.addEventListener("change", () => commitNested("trace", "lineColorMode", lineColorField.control.value, `${id} line color mode`));
    bands.addEventListener("change", () => {
      const parsed = parseBandSelection(bands.value, BAND_NAMES.length);
      bands.setAttribute("aria-invalid", parsed.error ? "true" : "false"); error.textContent = parsed.error;
      if (parsed.error) { bandValue.textContent = "Invalid indices"; showStatus(parsed.error); return; }
      bandValue.textContent = describeBandTargets(parsed.ids, runtime.settings.bands.count);
      // A delayed change after replacement (or an already committed edit) reads
      // the canonical control value and must not commit the same targets again.
      const orb = findOrb();
      if (!orb || (parsed.ids.length === orb.bandIds.length && parsed.ids.every((value, index) => value === orb.bandIds[index]))) return;
      commit("bandIds", parsed.ids, `${id} band indices`);
    });
    const picker = createBandPicker(pickerRoot, { orbLabel: `Orb ${id}`, onChange(ids) { bands.value = formatOrbBandIdsText(ids); bands.setAttribute("aria-invalid", "false"); error.textContent = ""; commit("bandIds", ids, `${id} bands`); }, formatRange: BandBank.formatBandRangeText, getActiveCount: () => runtime.settings.bands.count, describeBank: () => `${runtime.settings.bands.distributionMode.toUpperCase()} distribution · ${runtime.settings.bands.count} active bands · ${Number.isFinite(state.bands.meta.nyquistHz) ? "ranges limited to the active Nyquist frequency" : "configured ranges; connect audio for the active frequency limit"}` });
    return { id, root, summary, title, identity, chan: chanField.control, chanValue: chanField.output, bands, bandValue, error, chir: chirField.control, chirValue: chirField.output, phase: phaseField.control, phaseValue: phaseField.output, hue: hueField.control, hueValue: hueField.output, color: colorField.control, colorValue: colorField.output, x: xField.control, xValue: xField.output, y: yField.control, yValue: yField.output, speed: speedField.control, speedValue: speedField.output, minRadius: minRadiusField.control, minRadiusValue: minRadiusField.output, maxRadius: maxRadiusField.control, maxRadiusValue: maxRadiusField.output, waveform: waveformField.control, waveformValue: waveformField.output, emit: emitField.control, emitValue: emitField.output, sizeMin: sizeMinField.control, sizeMinValue: sizeMinField.output, sizeMax: sizeMaxField.control, sizeMaxValue: sizeMaxField.output, decay: decayField.control, decayValue: decayField.output, ttl: ttlField.control, ttlValue: ttlField.output, spacing: spacingField.control, spacingValue: spacingField.output, fadeSegments: fadeSegmentsField.control, fadeSegmentsValue: fadeSegmentsField.output, lines: linesField.control, linesValue: linesField.output, numLines: numLinesField.control, numLinesValue: numLinesField.output, lineAlpha: alphaField.control, lineAlphaValue: alphaField.output, lineWidth: widthField.control, lineWidthValue: widthField.output, lineColor: lineColorField.control, lineColorValue: lineColorField.output, picker };
  }
  const bindRange = (control, limit) => bindConfigRange(control, limit,
    limit === CONFIG.limits.orbs.startAngleRad || limit === CONFIG.limits.motion.angularSpeedRadPerSec ? RAD_TO_DEG : 1);
  function syncController(c, orb, position, { replaceDrafts = false } = {}) {
    const set = syncConfigRange;
    const setSelect = (control, output, value) => {
      control.value = String(value);
      output.textContent = control.options?.[control.selectedIndex]?.textContent || String(value);
    };
    c.title.textContent = `Orb ${position + 1}`; c.identity.textContent = orb.id; c.summary.setAttribute("aria-label", `Edit Orb ${position + 1}, ${orb.id}`);
    setSelect(c.chan,c.chanValue,orb.chanId); setSelect(c.chir,c.chirValue,orb.chirality);
    set(c.phase,c.phaseValue,orb.startAngleRad,v=>`${formatOrbPhaseDegrees(v)}°`);
    c.phase.setAttribute("aria-valuetext", c.phaseValue.textContent.replaceAll("°", " degrees"));
    set(c.hue,c.hueValue,orb.hueOffsetDeg,v=>`${v}°`); setSelect(c.color,c.colorValue,orb.colorSource);
    set(c.x,c.xValue,orb.centerXFrac); set(c.y,c.yValue,orb.centerYFrac);
    set(c.speed,c.speedValue,orb.motion.angularSpeedRadPerSec,v=>`${v} rad/s (${fmt(v*RAD_TO_DEG,1)}°/s)`);
    set(c.minRadius,c.minRadiusValue,orb.response.minRadiusFrac); set(c.maxRadius,c.maxRadiusValue,orb.response.maxRadiusFrac); set(c.waveform,c.waveformValue,orb.response.waveformRadialDisplaceFrac);
    set(c.emit,c.emitValue,orb.particles.emitPerSecond,v=>`${v}/s`); set(c.sizeMin,c.sizeMinValue,orb.particles.sizeMinPx,v=>`${v}px`); set(c.sizeMax,c.sizeMaxValue,orb.particles.sizeMaxPx,v=>`${v}px`); set(c.decay,c.decayValue,orb.particles.sizeToMinSec,v=>`${v}s`); set(c.ttl,c.ttlValue,orb.particles.ttlSec,v=>`${v}s`);
    set(c.spacing,c.spacingValue,orb.particles.minPlacementDistanceUnits,v=>`${v} world units`);
    c.lines.checked = orb.trace.lines; c.lines.indeterminate = false; c.linesValue.textContent = orb.trace.lines ? "on" : "off";
    set(c.fadeSegments,c.fadeSegmentsValue,orb.trace.fadeSegments,v=>v === 0 ? "Off" : `${v} segment${v === 1 ? "" : "s"}`);
    set(c.numLines,c.numLinesValue,orb.trace.numLines); set(c.lineAlpha,c.lineAlphaValue,orb.trace.lineAlpha); set(c.lineWidth,c.lineWidthValue,orb.trace.lineWidthPx,v=>`${v}px`); setSelect(c.lineColor,c.lineColorValue,orb.trace.lineColorMode);
    if (replaceDrafts || (document.activeElement !== c.bands && c.bands.getAttribute("aria-invalid") !== "true")) { c.bands.value = formatOrbBandIdsText(orb.bandIds); c.bands.setAttribute("aria-invalid", "false"); c.error.textContent = ""; }
    c.bandValue.textContent = c.bands.getAttribute("aria-invalid") === "true" ? "Invalid indices" : describeBandTargets(orb.bandIds, runtime.settings.bands.count);
    c.bands.setAttribute("aria-description", `Authored indices 0–${BAND_NAMES.length - 1}; active indices 0–${runtime.settings.bands.count - 1}. Higher authored indices stay inactive until the band count increases. Editing this field explicitly replaces all targets; blank uses full spectrum.`); c.picker?.sync(orb.bandIds, { replaceDrafts });
  }
  function refresh(settings = runtime.settings, { replaceDrafts = false } = {}) {
    const bandEdgesRef = state.bands.lowHz; if (!replaceDrafts && settings === lastSettingsRef && bandEdgesRef === lastBandEdgesRef) return controllers;
    lastSettingsRef = settings; lastBandEdgesRef = bandEdgesRef; let controlsChanged = false; const orbs = Array.isArray(settings?.orbs) ? settings.orbs : [];
    const ids = new Set(orbs.map(orb => orb.id));
    for (const [id, controller] of controllers) if (!ids.has(id)) { controller.root.remove(); controllers.delete(id); controlsChanged = true; }
    orbs.forEach((orb, position) => {
      let controller = controllers.get(orb.id);
      if (!controller) { controller = createController(orb.id); controllers.set(orb.id, controller); controlsChanged = true; }
      syncController(controller, orb, position, { replaceDrafts });
    });
    // Moving a focused subtree with insertBefore disconnects native focus. Keep
    // that card connected and order its siblings around it, from right to left.
    let focusedRoot = document.activeElement;
    while (focusedRoot && focusedRoot.parentNode !== ui.orbEditorList) focusedRoot = focusedRoot.parentNode;
    let next = null;
    for (let position = orbs.length - 1; position >= 0; position--) {
      const root = controllers.get(orbs[position].id).root;
      if (root !== focusedRoot && (root.parentNode !== ui.orbEditorList || root.nextElementSibling !== next)) ui.orbEditorList.insertBefore(root, next);
      next = root;
    }
    refreshBulk(orbs);
    if (controlsChanged) onControlsChanged();
    return controllers;
  }
  function refreshBulk(orbs) {
    const bulk = (group, field, control, output, format) => {
      const model = readBulkOrbValue(orbs, group, field);
      control.disabled = !model.available;
      if (!model.available) {
        output.textContent = "—";
        if (control.type === "range") control.setAttribute("aria-valuetext", "No Orbs");
        if (control.type === "checkbox") control.indeterminate = false;
        return;
      }
      if (control.type === "range") {
        // Mixed values have no single canonical value. Keep a valid selection,
        // and make its purpose explicit without retaining an obsolete baseline.
        const selection = syncConfigRange(control, output, model.mixed ? null : model.value, format);
        if (model.mixed) {
          output.textContent = "mixed";
          control.setAttribute("aria-valuetext", `mixed; slider selection ${format(selection)}`);
        }
      } else {
        control.value = model.mixed && control === ui.selLineColorMode ? "" : String(model.value);
        output.textContent = model.mixed ? "mixed" : format(model.value);
      }
      if (control.type === "checkbox") { control.indeterminate = model.mixed; if (!model.mixed) control.checked = !!model.value; }
    };
    bulk("trace","fadeSegments",ui.rngFadeSegments,ui.valFadeSegments,v=>v === 0 ? "Off" : `${v} segment${v === 1 ? "" : "s"}`);
    bulk("trace","lines",ui.chkLines,ui.valLines,v=>v?"on":"off"); bulk("trace","numLines",ui.rngNumLines,ui.valNumLines,String); bulk("trace","lineColorMode",ui.selLineColorMode,ui.valLineColorMode,String);
    for (const [g,f,c,o,format] of [["particles","emitPerSecond",ui.rngEmit,ui.valEmit,v=>`${v}/s`],["particles","sizeMaxPx",ui.rngSizeMax,ui.valSizeMax,v=>`${v}px`],["particles","sizeMinPx",ui.rngSizeMin,ui.valSizeMin,v=>`${v}px`],["particles","sizeToMinSec",ui.rngSizeToMin,ui.valSizeToMin,v=>`${v}s`],["particles","ttlSec",ui.rngTTL,ui.valTTL,v=>`${v}s`],["particles","minPlacementDistanceUnits",ui.rngMinPlacementDistance,ui.valMinPlacementDistance,v=>`${v} world units`],["motion","angularSpeedRadPerSec",ui.rngOmega,ui.valOmega,v=>`${v} rad/s (${fmt(v*RAD_TO_DEG,1)}°/s)`],["response","waveformRadialDisplaceFrac",ui.rngWfDisp,ui.valWfDisp,v=>String(v)],["response","minRadiusFrac",ui.rngMinRad,ui.valMinRad,v=>String(v)],["response","maxRadiusFrac",ui.rngMaxRad,ui.valMaxRad,v=>String(v)]]) bulk(g,f,c,o,format);
  }
  function init() {
    if (initializedOn === ui.orbEditorList) return false; initializedOn = ui.orbEditorList;
    const mixedOption = make("option", "", "mixed");
    mixedOption.value = "";
    mixedOption.disabled = true;
    ui.selLineColorMode.appendChild(mixedOption);
    const bulk = (control,event,group,field,read,reason) => control.addEventListener(event,()=>{ if (control.disabled || (control === ui.selLineColorMode && control.value === "")) return; const value = control.type === "range" ? readConfigRange(control, editingBounds(preferences.orbs, group, field)) : read(control); if (value !== null && applyBulkOrbValue(preferences.orbs,group,field,value)) commitPreferences(reason); });
    bindRange(ui.rngFadeSegments, CONFIG.limits.trace.fadeSegments);
    bulk(ui.rngFadeSegments,"input","trace","fadeSegments",c=>Number(c.value),"fade length");
    bindRange(ui.rngNumLines, CONFIG.limits.trace.numLines);
    bulk(ui.chkLines,"change","trace","lines",c=>!!c.checked,"lines"); bulk(ui.rngNumLines,"input","trace","numLines",c=>Number(c.value),"num lines"); bulk(ui.selLineColorMode,"change","trace","lineColorMode",c=>c.value,"line color mode");
    for (const [control,group,field,reason] of [[ui.rngEmit,"particles","emitPerSecond","emit rate"],[ui.rngSizeMax,"particles","sizeMaxPx","size max"],[ui.rngSizeMin,"particles","sizeMinPx","size min"],[ui.rngSizeToMin,"particles","sizeToMinSec","time to min"],[ui.rngTTL,"particles","ttlSec","ttl"],[ui.rngMinPlacementDistance,"particles","minPlacementDistanceUnits","minimum placement distance"],[ui.rngOmega,"motion","angularSpeedRadPerSec","angular speed"],[ui.rngWfDisp,"response","waveformRadialDisplaceFrac","orb waveform disp"],[ui.rngMinRad,"response","minRadiusFrac","min radius"],[ui.rngMaxRad,"response","maxRadiusFrac","max radius"]]) {
      bindRange(control, group === "response" ? CONFIG.limits.orbs.response[field] : CONFIG.limits[group][field]);
      bulk(control,"input",group,field,c=>Number(c.value),reason);
    }
    refresh(); return true;
  }
  function focusOrb(id) { const c = controllers.get(id); if (!c) return false; c.root.open = true; c.summary.focus(); c.root.scrollIntoView?.({ block: "nearest" }); return true; }
  return { init, refresh, focusOrb, getController: (id) => controllers.get(id) };
}

export { createOrbEditorUi, formatOrbBandIdsText, describeOrbBandSelection, readBulkOrbValue, applyBulkOrbValue };
