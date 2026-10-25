import { CONFIG } from "../core/config.js";
import { RAD_TO_DEG } from "../core/constants.js";
import { bindConfigRange, readConfigRange, syncConfigRange } from "./config-range.js";

const CONTROL_FIELDS = [
  ["chkBandOverlay", "enabled", "change", true],
  ["chkBandConnect", "connectAdjacent", "change", true],
  ["rngBandAlpha", "alpha", "input"],
  ["rngBandPoint", "pointSizePx", "input"],
  ["rngBandOverlayMinRad", "minRadiusFrac", "input"],
  ["rngBandOverlayMaxRad", "maxRadiusFrac", "input"],
  ["rngBandOverlayWfDisp", "waveformRadialDisplaceFrac", "input"],
  ["rngBandLineAlpha", "lineAlpha", "input"],
  ["rngBandLineWidth", "lineWidthPx", "input"],
  ["selRingPhaseMode", "phaseMode", "change", false, true],
  ["rngRingSpeed", "ringSpeedRadPerSec", "input"],
];

const bindRange = bindConfigRange;

function createSpectralRingEditorUi({ ui, preferences, getSettings, commitPreferences = () => {} } = {}) {
  let initializedOn = null;
  let lastSettingsRef = null;

  function init() {
    if (initializedOn === ui?.spectralRingEditor) return false;
    initializedOn = ui?.spectralRingEditor || null;
    bindRange(ui.rngBandAlpha, CONFIG.limits.bands.overlayAlpha);
    bindRange(ui.rngBandPoint, CONFIG.limits.bands.pointSizePx);
    bindRange(ui.rngBandOverlayMinRad, CONFIG.limits.bands.overlayMinRadiusFrac);
    bindRange(ui.rngBandOverlayMaxRad, CONFIG.limits.bands.overlayMaxRadiusFrac);
    bindRange(ui.rngBandOverlayWfDisp, CONFIG.limits.bands.overlayWaveformRadialDisplaceFrac);
    bindRange(ui.rngBandLineAlpha, CONFIG.limits.bands.overlayLineAlpha);
    bindRange(ui.rngBandLineWidth, CONFIG.limits.bands.overlayLineWidthPx);
    bindRange(ui.rngRingSpeed, CONFIG.limits.bands.ringSpeedRadPerSec, RAD_TO_DEG);

    if (!ui.selRingPhaseMode.options.length) {
      for (const [value, label] of [["orb", "Lock to first Orb phase"], ["free", "Free-run"]]) {
        const option = document.createElement("option");
        option.value = value; option.textContent = label;
        ui.selRingPhaseMode.appendChild(option);
      }
    }
    for (const [control, field, eventName, checkbox, stringValue] of CONTROL_FIELDS) {
      ui[control].addEventListener(eventName, () => {
        if (ui[control].disabled) return;
        const numeric = !checkbox && !stringValue ? readConfigRange(ui[control]) : null;
        if (!checkbox && !stringValue && numeric === null) return;
        preferences.bands.overlay[field] = checkbox
          ? !!ui[control].checked
          : (stringValue ? ui[control].value : numeric);
        commitPreferences(`spectral ring ${field}`);
      });
    }
    refresh();
    return true;
  }

  function refresh(settings = getSettings?.()) {
    if (!settings || settings === lastSettingsRef) return false;
    lastSettingsRef = settings;
    const overlay = settings.bands.overlay;
    ui.chkBandOverlay.checked = !!overlay.enabled;
    ui.valBandOverlay.textContent = overlay.enabled ? "Visible" : "Hidden";
    ui.chkBandConnect.checked = !!overlay.connectAdjacent;
    ui.valBandConnect.textContent = overlay.connectAdjacent ? "On" : "Off";
    for (const [control, output, field, format] of [
      [ui.rngBandAlpha,ui.valBandAlpha,"alpha"], [ui.rngBandPoint,ui.valBandPoint,"pointSizePx",v=>`${v}px`],
      [ui.rngBandOverlayMinRad,ui.valBandOverlayMinRad,"minRadiusFrac"], [ui.rngBandOverlayMaxRad,ui.valBandOverlayMaxRad,"maxRadiusFrac"],
      [ui.rngBandOverlayWfDisp,ui.valBandOverlayWfDisp,"waveformRadialDisplaceFrac"], [ui.rngBandLineAlpha,ui.valBandLineAlpha,"lineAlpha"],
      [ui.rngBandLineWidth,ui.valBandLineWidth,"lineWidthPx",v=>`${v}px`], [ui.rngRingSpeed,ui.valRingSpeed,"ringSpeedRadPerSec",v=>`${v} rad/s`],
    ]) syncConfigRange(control,output,overlay[field],format);
    ui.selRingPhaseMode.value = overlay.phaseMode;
    ui.valRingPhaseMode.textContent = overlay.phaseMode === "orb" ? "First Orb" : "Free-run";
    ui.rngRingSpeed.disabled = overlay.phaseMode === "orb";
    return true;
  }

  function focusEditor() {
    if (!ui?.spectralRingEditor) return false;
    ui.spectralRingEditor.open = true;
    const target = ui.spectralRingEditor.querySelector("summary") || ui.chkBandOverlay;
    target?.scrollIntoView?.({ block: "nearest" });
    target?.focus?.();
    return true;
  }

  return { init, refresh, focusEditor };
}

export { createSpectralRingEditorUi };
