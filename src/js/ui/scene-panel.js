import { CONFIG } from "../core/config.js";
import { normalizeParticleSafety } from "../core/particle-safety.js";
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

// Owns Scene appearance and scene-wide resource controls. Visibility/rendering stay
// with their respective modules; persistence retains historical schema paths.
function createScenePanelUi({ ui, preferences, getSettings, getParticleStats, commitPreferences = () => {} } = {}) {
  let initializedOn = null;
  let lastSettingsRef = null;
  const resources = [
    ["maxActiveParticles", "numMaxActiveParticles", "valMaxActiveParticles", "maxActiveParticlesError"],
    ["maxEmissionsPerFrame", "numMaxEmissionsPerFrame", "valMaxEmissionsPerFrame", "maxEmissionsPerFrameError"],
  ];
  const diagnosticFields = [
    ["statParticleLive", "activeParticles"], ["statParticleEmitted", "emissions"],
    ["statParticleSpacingRejected", "spatiallyRejectedDemand"], ["statParticleBudgetRejected", "budgetRejectedDemand"],
    ["statParticleRateLimited", "rateLimitedDemand"], ["statParticleRetentionRejected", "retentionRejectedDemand"],
    ["statParticleExpired", "expired"], ["statParticleRetentionRetired", "retentionEvictionsTotal"],
  ];

  function refreshDiagnostics() {
    if (!getParticleStats) return;
    const stats = getParticleStats();
    for (const [id, key] of diagnosticFields) {
      const text = String(stats[key]);
      if (ui[id].textContent !== text) ui[id].textContent = text;
    }
  }

  function init() {
    if (initializedOn === ui?.scenePanel) return false;
    initializedOn = ui?.scenePanel || null;
    for (const [key, inputId, , errorId] of resources) {
      const control = ui[inputId], limits = CONFIG.limits.particleSafety[key];
      bindRange(control, limits);
      control.addEventListener("change", () => {
        // Empty/partial/invalid input must never coerce the saved choice to zero.
        const raw = control.value.trim(), value = raw === "" ? NaN : Number(raw);
        if (!Number.isInteger(value) || value < limits.min || value > limits.max) {
          control.setAttribute("aria-invalid", "true");
          ui[errorId].textContent = `Enter a whole number from ${limits.min} to ${limits.max}.`;
          return;
        }
        control.setAttribute("aria-invalid", "false"); ui[errorId].textContent = "";
        const current = normalizeParticleSafety(preferences.particleSafety);
        if (current[key] === value) { control.value = String(value); return; }
        preferences.particleSafety = { ...current, [key]: value };
        commitPreferences(key === "maxActiveParticles" ? "maximum live particles" : "maximum emissions per update");
      });
    }
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
    refreshDiagnostics();
    if (!settings || settings === lastSettingsRef) return false;
    const previous = lastSettingsRef;
    lastSettingsRef = settings;
    for (const [key, inputId, outputId, errorId] of resources) {
      const control = ui[inputId], value = settings.particleSafety[key];
      const changed = previous?.particleSafety?.[key] !== value;
      if (changed || (document.activeElement !== control && control.getAttribute("aria-invalid") !== "true")) control.value = String(value);
      if (changed) { control.setAttribute("aria-invalid", "false"); ui[errorId].textContent = ""; }
      ui[outputId].textContent = `Selected: ${value}`;
    }
    ui.clrBg.value = settings.visuals.backgroundColor; ui.valBg.textContent = settings.visuals.backgroundColor;
    ui.clrParticle.value = settings.visuals.particleColor; ui.valParticle.textContent = settings.visuals.particleColor;
    ui.selParticleColorSrc.value = settings.bands.particleColorSource;
    ui.valParticleSrc.textContent = ui.selParticleColorSrc.options?.[ui.selParticleColorSrc.selectedIndex]?.textContent || settings.bands.particleColorSource;
    ui.rngHueOff.value = String(settings.bands.rainbow.hueOffsetDeg); ui.valHueOff.textContent = `${settings.bands.rainbow.hueOffsetDeg}°`;
    ui.rngSat.value = String(settings.bands.rainbow.saturation); ui.valSat.textContent = fmt(settings.bands.rainbow.saturation, 2);
    ui.rngVal.value = String(settings.bands.rainbow.value); ui.valVal.textContent = fmt(settings.bands.rainbow.value, 2);
    return true;
  }

  return { init, refresh, refreshDiagnostics };
}

export { createScenePanelUi, SOURCE_LABELS };
