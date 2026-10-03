import { clamp, hexToRgb01, hsvToRgb01 } from "../core/utils.js";
import { runtime } from "../core/preferences.js";
import { state } from "../core/state.js";
import { BandBank } from "../audio/band-bank.js";

/* =============================================================================
   ColorPolicy
   ========================================================================== */
const ColorPolicy = (() => {
  function resolveBandIndex(index, fallbackIndex = 0) {
    const safeCount = Math.max(1, runtime.settings.bands.count);
    const candidate = Number.isInteger(index) ? index : fallbackIndex;
    return clamp(Number.isInteger(candidate) ? candidate : 0, 0, safeCount - 1);
  }

  function bandRgb01(index, hueOffsetDeg = 0) {
    const s = runtime.settings;
    const n = s.bands.count;
    const hueStep = 360 / n;
    const safeIndex = resolveBandIndex(index, state.bands.dominantIndex);
    const hue = s.bands.rainbow.hueOffsetDeg + hueOffsetDeg + safeIndex * hueStep;
    return hsvToRgb01(hue, s.bands.rainbow.saturation, s.bands.rainbow.value);
  }

  function pickParticleColorRgb01(angleRad, { bandIndex = null, hueOffsetDeg = 0 } = {}) {
    const s = runtime.settings;

    if (s.bands.particleColorSource === "fixed") return hexToRgb01(s.visuals.particleColor);
    if (s.bands.particleColorSource === "angle") {
      return bandRgb01(BandBank.bandIndexFromAngleRad(angleRad), hueOffsetDeg);
    }

    return bandRgb01(resolveBandIndex(bandIndex, state.bands.dominantIndex), hueOffsetDeg); // dominant
  }

  function pickLineColorRgb01(particles, { bandIndex = null, hueOffsetDeg = 0 } = {}) {
    const s = runtime.settings;
    if (s.trace.lineColorMode === "dominantBand") {
      return bandRgb01(resolveBandIndex(bandIndex, state.bands.dominantIndex), hueOffsetDeg);
    }

    if (s.trace.lineColorMode === "lastParticle") {
      const last = particles && particles.length ? particles[particles.length - 1] : null;
      if (last && last.rgbStart) return last.rgbStart;
      return hexToRgb01(s.visuals.particleColor);
    }

    return hexToRgb01(s.visuals.particleColor); // fixed
  }

  return { bandRgb01, pickParticleColorRgb01, pickLineColorRgb01 };
})();

export { ColorPolicy };
