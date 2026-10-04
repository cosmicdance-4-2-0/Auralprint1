import { CONFIG } from "../core/config.js";
import { fmt } from "../core/utils.js";

const SOURCE_LABELS = {
  fixed: "Fixed Scene Color",
  dominant: "Dominant Band",
  angle: "Orb Phase Palette (Glitch Mode)",
};

function bindRange(control, limit) {
  control.min = String(limit.min);
  control.max = String(limit.max);
  control.step = String(limit.step);
}

// Owns Scene appearance controls only. Workspace visibility and rendering stay
// with their respective modules; persistence retains historical schema paths.
function createScenePanelUi({ ui, preferences, getSettings, commitPreferences = () => {} } = {}) {
  let initializedOn = null;
  let lastSettingsRef = null;

  function init() {
    if (initializedOn === ui?.scenePanel) return false;
    initializedOn = ui?.scenePanel || null;
    bindRange(ui.rngHueOff, CONFIG.limits.sceneColor.hueOffsetDeg);
    bindRange(ui.rngSat, CONFIG.limits.sceneColor.saturation);
    bindRange(ui.rngVal, CONFIG.limits.sceneColor.value);
    if (!ui.selParticleColorSrc.options.length) {
      for (const value of CONFIG.limits.sceneColor.particleColorSources) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = SOURCE_LABELS[value] || value;
        ui.selParticleColorSrc.appendChild(option);
      }
    }
    ui.clrBg.addEventListener("input", () => { preferences.visuals.backgroundColor = ui.clrBg.value; commitPreferences("scene background"); });
    ui.clrParticle.addEventListener("input", () => { preferences.visuals.particleColor = ui.clrParticle.value; commitPreferences("scene fixed particle color"); });
    ui.selParticleColorSrc.addEventListener("change", () => { preferences.bands.particleColorSource = ui.selParticleColorSrc.value; commitPreferences("scene default Orb particle source"); });
    ui.rngHueOff.addEventListener("input", () => { preferences.bands.rainbow.hueOffsetDeg = Number(ui.rngHueOff.value); commitPreferences("scene palette hue offset"); });
    ui.rngSat.addEventListener("input", () => { preferences.bands.rainbow.saturation = Number(ui.rngSat.value); commitPreferences("scene palette saturation"); });
    ui.rngVal.addEventListener("input", () => { preferences.bands.rainbow.value = Number(ui.rngVal.value); commitPreferences("scene palette brightness"); });
    refresh();
    return true;
  }

  function refresh(settings = getSettings?.()) {
    if (!settings || settings === lastSettingsRef) return false;
    lastSettingsRef = settings;
    ui.clrBg.value = settings.visuals.backgroundColor; ui.valBg.textContent = settings.visuals.backgroundColor;
    ui.clrParticle.value = settings.visuals.particleColor; ui.valParticle.textContent = settings.visuals.particleColor;
    ui.selParticleColorSrc.value = settings.bands.particleColorSource;
    ui.valParticleSrc.textContent = ui.selParticleColorSrc.options?.[ui.selParticleColorSrc.selectedIndex]?.textContent || settings.bands.particleColorSource;
    ui.rngHueOff.value = String(settings.bands.rainbow.hueOffsetDeg); ui.valHueOff.textContent = `${settings.bands.rainbow.hueOffsetDeg}°`;
    ui.rngSat.value = String(settings.bands.rainbow.saturation); ui.valSat.textContent = fmt(settings.bands.rainbow.saturation, 2);
    ui.rngVal.value = String(settings.bands.rainbow.value); ui.valVal.textContent = fmt(settings.bands.rainbow.value, 2);
    return true;
  }

  return { init, refresh };
}

export { createScenePanelUi, SOURCE_LABELS };
