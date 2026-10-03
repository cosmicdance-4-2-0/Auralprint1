import { hexToRgb01, hsvToRgb01 } from "../core/utils.js";
import { runtime } from "../core/preferences.js";
import { state } from "../core/state.js";
import { BandBank } from "../audio/band-bank.js";

/* =============================================================================
   ColorPolicy
   ========================================================================== */
const ColorPolicy = (() => {
  function bandRgb01(index, extraHueOffsetDeg = 0) {
    const s = runtime.settings;
    const n = s.bands.count;
    const hueStep = 360 / n;
    const hue = s.bands.rainbow.hueOffsetDeg + extraHueOffsetDeg + index * hueStep;
    return hsvToRgb01(hue, s.bands.rainbow.saturation, s.bands.rainbow.value);
  }

  function resolveParticleColorSource(orb) {
    const s = runtime.settings;
    if (!orb || orb.colorSource === "inherit") return s.bands.particleColorSource;
    return orb.colorSource;
  }

  function pickParticleColorRgb01(angleRad, orb = null) {
    const s = runtime.settings;
    const extraHue = orb && Number.isFinite(orb.hueOffsetDeg) ? orb.hueOffsetDeg : 0;
    const source = resolveParticleColorSource(orb);

    if (source === "fixed") return hexToRgb01(s.visuals.particleColor);
    if (source === "angle") return bandRgb01(BandBank.bandIndexFromAngleRad(angleRad), extraHue);

    return bandRgb01(state.bands.dominantIndex, extraHue); // dominant
  }

  function pickLineColorRgb01(particles) {
    const s = runtime.settings;
    if (s.trace.lineColorMode === "dominantBand") return bandRgb01(state.bands.dominantIndex);

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
