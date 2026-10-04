import { hexToRgb01, hsvToRgb01 } from "../core/utils.js";
import { runtime } from "../core/preferences.js";
import { BandBank } from "../audio/band-bank.js";

/* =============================================================================
   ColorPolicy
   ========================================================================== */
const ColorPolicy = (() => {
  function bandRgb01(index, extraHueOffsetDeg = 0) {
    // Scene's shared band palette is consumed by Orbs, Spectral Ring, and the
    // Analysis HUD. extraHueOffsetDeg is an Orb-local addition when supplied.
    const s = runtime.settings;
    const n = s.bands.count;
    const hueStep = 360 / n;
    const hue = s.bands.rainbow.hueOffsetDeg + extraHueOffsetDeg + index * hueStep;
    return hsvToRgb01(hue, s.bands.rainbow.saturation, s.bands.rainbow.value);
  }

  function pickParticleColorRgb01(angleRad, orb = null, globalDominantBandIndex = 0, selectedDominantBandIndex = null) {
    // Resolve the Scene default only for inherit; explicit dominant remains
    // global combined-C while inherited targeted dominant may be channel-local.
    const s = runtime.settings;
    const extraHue = orb && Number.isFinite(orb.hueOffsetDeg) ? orb.hueOffsetDeg : 0;
    const requestedSource = orb?.colorSource || "inherit";
    const source = requestedSource === "inherit" ? s.bands.particleColorSource : requestedSource;

    if (source === "fixed") return hexToRgb01(s.visuals.particleColor);
    if (source === "angle") return bandRgb01(BandBank.bandIndexFromAngleRad(angleRad), extraHue);

    const dominantBandIndex = requestedSource === "inherit" && Number.isInteger(selectedDominantBandIndex)
      ? selectedDominantBandIndex
      : globalDominantBandIndex;
    return bandRgb01(dominantBandIndex, extraHue); // dominant
  }

  function pickLineColorRgb01(particles, dominantBandIndex = 0, lineColorMode = "fixed") {
    // Trace mode is Orb-local; its fixed fallback and palette are Scene-owned.
    const s = runtime.settings;
    if (lineColorMode === "dominantBand") return bandRgb01(dominantBandIndex);

    if (lineColorMode === "lastParticle") {
      const last = particles && particles.length ? particles[particles.length - 1] : null;
      if (last && last.rgbStart) return last.rgbStart;
      return hexToRgb01(s.visuals.particleColor);
    }

    return hexToRgb01(s.visuals.particleColor); // fixed
  }

  return { bandRgb01, pickParticleColorRgb01, pickLineColorRgb01 };
})();

export { ColorPolicy };
