import { CONFIG } from "./config.js";

// One rule for persistence, derived runtime settings, and live governor policy.
// Invalid types/nonintegers fall back independently; valid integers clamp.
function normalizeParticleSafety(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalize = key => {
    const limits = CONFIG.limits.particleSafety[key];
    return Number.isInteger(source[key])
      ? Math.max(limits.min, Math.min(limits.max, source[key]))
      : CONFIG.defaults.particleSafety[key];
  };
  return {
    maxEmissionsPerFrame: normalize("maxEmissionsPerFrame"),
    maxActiveParticles: normalize("maxActiveParticles"),
  };
}

export { normalizeParticleSafety };
