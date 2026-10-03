import { fmt } from "../core/utils.js";
import { RAD_TO_DEG } from "../core/constants.js";
import { CONFIG } from "../core/config.js";
import { preferences, runtime, BAND_NAMES } from "../core/preferences.js";
import { state } from "../core/state.js";
import { BandBank } from "../audio/band-bank.js";
import { createOrbBandPicker, parseBandSelection } from "./orb-band-picker.js";

function formatOrbBandIdsText(bandIds) { return Array.isArray(bandIds) && bandIds.length ? bandIds.join(", ") : ""; }
function describeOrbBandSelection(bandIds) { return Array.isArray(bandIds) && bandIds.length ? `${bandIds.length} band${bandIds.length === 1 ? "" : "s"}` : "full spectrum"; }
function readBulkOrbValue(orbs, group, field) {
  if (!Array.isArray(orbs) || !orbs.length) return { available: false, mixed: false, value: undefined };
  const value = orbs[0][group][field];
  return { available: true, mixed: orbs.some((orb) => orb[group][field] !== value), value };
}
function applyBulkOrbValue(orbs, group, field, value) { if (!Array.isArray(orbs) || !orbs.length) return false; for (const orb of orbs) orb[group][field] = value; return true; }

function createOrbCompatUi({ ui = state.ui, commitOrbChange, commitPreferences, showStatus } = {}) {
  let initializedOn = null;
  const slotControls = (index) => index === 0 ? {
    chan: ui.selOrb0Chan, chir: ui.selOrb0Chir, hue: ui.rngOrb0Hue, color: ui.selOrb0ColorSrc, x: ui.rngOrb0CenterX, y: ui.rngOrb0CenterY, bands: ui.txtOrb0Bands, bandValue: ui.valOrb0Bands,
  } : {
    chan: ui.selOrb1Chan, chir: ui.selOrb1Chir, hue: ui.rngOrb1Hue, color: ui.selOrb1ColorSrc, x: ui.rngOrb1CenterX, y: ui.rngOrb1CenterY, bands: ui.txtOrb1Bands, bandValue: ui.valOrb1Bands,
  };

  function commitBandIds(index, reason) {
    const orb = preferences.orbs[index];
    if (!orb) return false;
    const controls = slotControls(index);
    const parsed = parseBandSelection(controls.bands.value);
    controls.bands.setAttribute("aria-invalid", parsed.error ? "true" : "false");
    const errorEl = document.getElementById(`orb${index}BandError`);
    if (errorEl) errorEl.textContent = parsed.error;
    if (parsed.error) { controls.bandValue.textContent = "Invalid indices"; showStatus(parsed.error); return false; }
    orb.bandIds = parsed.ids;
    commitOrbChange(index, reason, { structural: false });
    controls.bands.value = formatOrbBandIdsText(preferences.orbs[index].bandIds);
    controls.bandValue.textContent = describeOrbBandSelection(preferences.orbs[index].bandIds);
    return true;
  }

  function syncBandPickers() {
    if (!ui.orbBandPickers) return;
    if (ui.orbPickerSettings === runtime.settings && ui.orbPickerEdges === state.bands.lowHz) return;
    ui.orbPickerSettings = runtime.settings; ui.orbPickerEdges = state.bands.lowHz;
    ui.orbBandPickers.forEach((picker, index) => {
      const orb = preferences.orbs[index];
      if (!orb) return;
      if (picker) picker.sync(orb.bandIds);
      const input = slotControls(index).bands;
      if (input) { input.setAttribute("aria-invalid", "false"); input.value = formatOrbBandIdsText(orb.bandIds); }
      const errorEl = document.getElementById(`orb${index}BandError`);
      if (errorEl) errorEl.textContent = "";
    });
  }

  function refresh(settings = runtime.settings) {
    syncBandPickers();
    const orbs = Array.isArray(settings.orbs) ? settings.orbs : [];
    ui.simStatus.textContent = orbs.length === 0 ? "No Orbs in scene" : (orbs.length > 2 ? `Showing 2 of ${orbs.length} Orbs` : `Showing ${orbs.length} Orb${orbs.length === 1 ? "" : "s"}`);
    ui.orbCards.forEach((card, index) => { card.hidden = index >= orbs.length; });
    orbs.slice(0, 2).forEach((orb, index) => {
      const c = slotControls(index);
      c.chan.value = orb.chanId; (index ? ui.valOrb1Chan : ui.valOrb0Chan).textContent = orb.chanId;
      c.chir.value = String(orb.chirality); (index ? ui.valOrb1Chir : ui.valOrb0Chir).textContent = orb.chirality >= 0 ? "+1" : "-1";
      c.hue.value = String(orb.hueOffsetDeg); (index ? ui.valOrb1Hue : ui.valOrb0Hue).textContent = `${orb.hueOffsetDeg}°`;
      c.color.value = orb.colorSource; (index ? ui.valOrb1ColorSrc : ui.valOrb0ColorSrc).textContent = orb.colorSource;
      c.x.value = String(orb.centerXFrac); (index ? ui.valOrb1CenterX : ui.valOrb0CenterX).textContent = fmt(orb.centerXFrac, 2);
      c.y.value = String(orb.centerYFrac); (index ? ui.valOrb1CenterY : ui.valOrb0CenterY).textContent = fmt(orb.centerYFrac, 2);
      if (document.activeElement !== c.bands && c.bands.getAttribute("aria-invalid") !== "true") c.bands.value = formatOrbBandIdsText(orb.bandIds);
      c.bandValue.textContent = describeOrbBandSelection(orb.bandIds);
    });
    const bulk = (group, field, control, output, format) => {
      const model = readBulkOrbValue(orbs, group, field); control.disabled = !model.available;
      if (!model.available) { output.textContent = "—"; if (control.type === "checkbox") control.indeterminate = false; return; }
      if (!model.mixed) control.value = String(model.value);
      output.textContent = model.mixed ? "mixed" : format(model.value);
      if (control.type === "checkbox") { control.indeterminate = model.mixed; if (!model.mixed) control.checked = !!model.value; }
    };
    bulk("trace", "lines", ui.chkLines, ui.valLines, (v) => v ? "on" : "off"); bulk("trace", "numLines", ui.rngNumLines, ui.valNumLines, String); bulk("trace", "lineColorMode", ui.selLineColorMode, ui.valLineColorMode, String);
    bulk("particles", "emitPerSecond", ui.rngEmit, ui.valEmit, (v) => `${v}/s`); bulk("particles", "sizeMaxPx", ui.rngSizeMax, ui.valSizeMax, (v) => `${v}px`); bulk("particles", "sizeMinPx", ui.rngSizeMin, ui.valSizeMin, (v) => `${v}px`); bulk("particles", "sizeToMinSec", ui.rngSizeToMin, ui.valSizeToMin, (v) => `${fmt(v, 1)}s`); bulk("particles", "ttlSec", ui.rngTTL, ui.valTTL, (v) => `${fmt(v, 1)}s`); bulk("particles", "overlapRadiusPx", ui.rngOverlap, ui.valOverlap, (v) => `${fmt(v, 1)}px`);
    bulk("motion", "angularSpeedRadPerSec", ui.rngOmega, ui.valOmega, (v) => `${fmt(v, 3)} rad/s (${fmt(v * RAD_TO_DEG, 1)}°/s)`); bulk("response", "waveformRadialDisplaceFrac", ui.rngWfDisp, ui.valWfDisp, (v) => fmt(v, 3)); bulk("response", "minRadiusFrac", ui.rngMinRad, ui.valMinRad, (v) => fmt(v, 3)); bulk("response", "maxRadiusFrac", ui.rngMaxRad, ui.valMaxRad, (v) => fmt(v, 3));
  }

  function init() {
    if (initializedOn === ui.txtOrb0Bands) return false;
    initializedOn = ui.txtOrb0Bands;
    ui.orbPickerSettings = null; ui.orbPickerEdges = null;
    ui.orbBandPickers = CONFIG.defaults.orbs.map((_, index) => createOrbBandPicker(document.getElementById(`orb${index}BandPicker`), {
      orbLabel: `Orb ${index + 1}`,
      onChange(ids) { if (!preferences.orbs[index]) return; preferences.orbs[index].bandIds = ids; commitOrbChange(index, `orb ${index + 1} bands`); },
      formatRange: BandBank.formatBandRangeText,
      describeBank: () => `${preferences.bands.distributionMode.toUpperCase()} distribution · ${BAND_NAMES.length} bands · ${Number.isFinite(state.bands.meta.nyquistHz) ? "ranges limited to the active Nyquist frequency" : "configured ranges; connect audio for the active frequency limit"}`,
    }));
    const bulk = (control, event, group, field, read, reason) => control.addEventListener(event, () => {
      if (applyBulkOrbValue(preferences.orbs, group, field, read(control))) commitPreferences(reason);
    });
    bulk(ui.chkLines, "change", "trace", "lines", (c) => !!c.checked, "lines"); bulk(ui.rngNumLines, "input", "trace", "numLines", (c) => Number(c.value), "num lines"); bulk(ui.selLineColorMode, "change", "trace", "lineColorMode", (c) => c.value, "line color mode");
    for (const [control, group, field, reason] of [[ui.rngEmit,"particles","emitPerSecond","emit rate"],[ui.rngSizeMax,"particles","sizeMaxPx","size max"],[ui.rngSizeMin,"particles","sizeMinPx","size min"],[ui.rngSizeToMin,"particles","sizeToMinSec","time to min"],[ui.rngTTL,"particles","ttlSec","ttl"],[ui.rngOverlap,"particles","overlapRadiusPx","overlap radius"],[ui.rngOmega,"motion","angularSpeedRadPerSec","angular speed"],[ui.rngWfDisp,"response","waveformRadialDisplaceFrac","orb waveform disp"],[ui.rngMinRad,"response","minRadiusFrac","min radius"],[ui.rngMaxRad,"response","maxRadiusFrac","max radius"]]) bulk(control, "input", group, field, (c) => Number(c.value), reason);
    for (let index = 0; index < 2; index++) {
      const c = slotControls(index); const reason = `ORB${index}`;
      for (const [control, event, field, read, structural, suffix] of [[c.chan,"change","chanId",(x)=>x.value,true,"channel"],[c.chir,"change","chirality",(x)=>Number(x.value),true,"chirality"],[c.hue,"input","hueOffsetDeg",(x)=>Number(x.value),false,"hue offset"],[c.color,"change","colorSource",(x)=>x.value,false,"color source"],[c.x,"input","centerXFrac",(x)=>Number(x.value),false,"center X"],[c.y,"input","centerYFrac",(x)=>Number(x.value),false,"center Y"]]) control.addEventListener(event, () => { const orb = preferences.orbs[index]; if (!orb) return; orb[field] = read(control); commitOrbChange(index, `${reason} ${suffix}`, { structural }); });
      c.bands.addEventListener("change", () => commitBandIds(index, `${reason} band indices`));
    }
    return true;
  }
  return { init, refresh, syncBandPickers };
}

export { createOrbCompatUi, formatOrbBandIdsText, describeOrbBandSelection, readBulkOrbValue, applyBulkOrbValue };
