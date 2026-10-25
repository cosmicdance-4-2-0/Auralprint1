import { CONFIG } from "./config.js";

// Admission is independent of sample rate. Never clip a historical Scene to a
// newly supported domain; reject it before canonical preferences are replaced.
function frequencyLimitMessage() {
  return `Band frequencies must not exceed ${CONFIG.limits.bands.frequencyHz.max.toLocaleString("en-US")} Hz.`;
}
function assertSupportedBandFrequencies(bands) {
  for (const field of ["floorHz", "ceilingHz"]) {
    if (Number.isFinite(bands?.[field]) && bands[field] > CONFIG.limits.bands.frequencyHz.max) {
      const error = new RangeError(frequencyLimitMessage());
      error.code = "unsupported-frequency";
      throw error;
    }
  }
}

export { assertSupportedBandFrequencies, frequencyLimitMessage };
