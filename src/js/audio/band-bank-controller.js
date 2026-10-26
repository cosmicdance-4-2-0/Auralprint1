import { CONFIG } from "../core/config.js";
import { runtime } from "../core/preferences.js";
import { BandBank } from "./band-bank.js";

/* =============================================================================
   BandBankController — synchronizes band settings and actual sample rate,
   applies the Nyquist ceiling, and coordinates BandBank rebuilds.
   ========================================================================== */
const BandBankController = (() => {
  const bandConfig = {
    count: CONFIG.defaults.bands.count,
    floorHz: CONFIG.defaults.bands.floorHz,
    configCeilingHz: CONFIG.defaults.bands.ceilingHz,
    distributionMode: CONFIG.defaults.bands.distributionMode,
  };

  let sampleRateHz = null;

  function readBandDefKey(sourceSettings) {
    const s = sourceSettings || runtime.settings;
    return [s.bands.count, s.bands.floorHz, s.bands.ceilingHz, s.bands.distributionMode].join("|");
  }

  function syncFromSettings(sourceSettings) {
    const s = sourceSettings || runtime.settings;
    bandConfig.count = s.bands.count;
    bandConfig.floorHz = s.bands.floorHz;
    bandConfig.configCeilingHz = s.bands.ceilingHz;
    bandConfig.distributionMode = s.bands.distributionMode;
  }

  function getNyquistHz() {
    return Number.isFinite(sampleRateHz) ? sampleRateHz * 0.5 : null;
  }

  function getEffectiveCeilingHz() {
    const nyquistHz = getNyquistHz();
    return Number.isFinite(nyquistHz)
      ? Math.min(bandConfig.configCeilingHz, nyquistHz)
      : bandConfig.configCeilingHz;
  }

  function onAudioContextKnown(nextSampleRateHz) {
    const wasKnown = Number.isFinite(sampleRateHz);
    const prevEffective = getEffectiveCeilingHz();

    sampleRateHz = Number.isFinite(nextSampleRateHz) && nextSampleRateHz > 0 ? nextSampleRateHz : null;

    const nextEffective = getEffectiveCeilingHz();
    const becameKnown = !wasKnown && Number.isFinite(sampleRateHz);
    const effectiveChanged = nextEffective !== prevEffective;

    return becameKnown || effectiveChanged;
  }

  function rebuildNow() {
    BandBank.rebuild(getEffectiveCeilingHz(), sampleRateHz);
  }

  return {
    syncFromSettings,
    readBandDefKey,
    onAudioContextKnown,
    rebuildNow,
  };
})();

export { BandBankController };
