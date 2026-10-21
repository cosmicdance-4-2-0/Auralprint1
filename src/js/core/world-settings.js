import { CONFIG } from "./config.js";
import { clamp } from "./utils.js";

function normalizeWorldSettings(incoming) {
  const normalized = {};
  for (const key of ["widthUnits", "heightUnits"]) {
    const value = incoming?.[key];
    const limits = CONFIG.limits.world[key];
    normalized[key] = Number.isFinite(value)
      ? clamp(value, limits.min, limits.max)
      : CONFIG.defaults.world[key];
  }
  return normalized;
}

export { normalizeWorldSettings };
