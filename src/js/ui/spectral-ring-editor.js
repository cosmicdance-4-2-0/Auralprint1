import { CONFIG } from "../core/config.js";
import { fmt } from "../core/utils.js";

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

function bindRange(element, limit) {
  element.min = String(limit.min);
  element.max = String(limit.max);
  element.step = String(limit.step);
}

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
    bindRange(ui.rngRingSpeed, CONFIG.limits.bands.ringSpeedRadPerSec);

    if (!ui.selRingPhaseMode.options.length) {
      for (const [value, label] of [["orb", "Lock to first Orb phase"], ["free", "Free-run"]]) {
        const option = document.createElement("option");
        option.value = value; option.textContent = label;
        ui.selRingPhaseMode.appendChild(option);
      }
    }
    for (const [control, field, eventName, checkbox, stringValue] of CONTROL_FIELDS) {
      ui[control].addEventListener(eventName, () => {
        preferences.bands.overlay[field] = checkbox
          ? !!ui[control].checked
          : (stringValue ? ui[control].value : Number(ui[control].value));
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
    ui.rngBandAlpha.value = String(overlay.alpha); ui.valBandAlpha.textContent = fmt(overlay.alpha, 2);
    ui.rngBandPoint.value = String(overlay.pointSizePx); ui.valBandPoint.textContent = `${overlay.pointSizePx}px`;
    ui.rngBandOverlayMinRad.value = String(overlay.minRadiusFrac); ui.valBandOverlayMinRad.textContent = fmt(overlay.minRadiusFrac, 3);
    ui.rngBandOverlayMaxRad.value = String(overlay.maxRadiusFrac); ui.valBandOverlayMaxRad.textContent = fmt(overlay.maxRadiusFrac, 3);
    ui.rngBandOverlayWfDisp.value = String(overlay.waveformRadialDisplaceFrac); ui.valBandOverlayWfDisp.textContent = fmt(overlay.waveformRadialDisplaceFrac, 3);
    ui.rngBandLineAlpha.value = String(overlay.lineAlpha); ui.valBandLineAlpha.textContent = fmt(overlay.lineAlpha, 2);
    ui.rngBandLineWidth.value = String(overlay.lineWidthPx); ui.valBandLineWidth.textContent = `${overlay.lineWidthPx}px`;
    ui.selRingPhaseMode.value = overlay.phaseMode;
    ui.valRingPhaseMode.textContent = overlay.phaseMode === "orb" ? "First Orb" : "Free-run";
    ui.rngRingSpeed.value = String(overlay.ringSpeedRadPerSec);
    ui.valRingSpeed.textContent = `${fmt(overlay.ringSpeedRadPerSec, 2)} rad/s`;
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
