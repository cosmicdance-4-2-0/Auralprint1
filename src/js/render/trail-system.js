import { CONFIG } from "../core/config.js";
import { clamp } from "../core/utils.js";

/* =============================================================================
   TrailSystem
   ========================================================================== */
class TrailSystem {
  constructor() {
    this.particles = []; // { xSim, ySim, bornSec, rgbStart }
    this.emitAccumulator = 0;
  }

  reset() {
    this.particles.length = 0;
    this.emitAccumulator = 0;
  }

  emitAt(xSim, ySim, nowSec, rgbStart) {
    this.particles.push({ xSim, ySim, bornSec: nowSec, rgbStart });
  }

  updateAndEmit(dtSec, nowSec, emitterXSim, emitterYSim, rgbStart, particleSettings) {
    const ttl = Math.max(0.0001, particleSettings.ttlSec);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      if ((nowSec - this.particles[i].bornSec) >= ttl) this.particles.splice(i, 1);
    }

    this.emitAccumulator += particleSettings.emitPerSecond * dtSec;

    // Temporary per-Orb guard. Aggregate allocation belongs to RC-15 phase 2.
    const rateLimit = CONFIG.limits.particles.emitPerSecond;
    const boundedRate = clamp(Number.isFinite(particleSettings.emitPerSecond)
      ? particleSettings.emitPerSecond : CONFIG.defaults.orbs[0].particles.emitPerSecond,
      rateLimit.min, rateLimit.max);
    const maxEmitThisFrame = Math.ceil(boundedRate * CONFIG.limits.timing.maxDeltaTimeSec) + 2;

    let emits = 0;
    while (this.emitAccumulator >= 1 && emits < maxEmitThisFrame) {
      this.emitAt(emitterXSim, emitterYSim, nowSec, rgbStart);
      this.emitAccumulator -= 1;
      emits += 1;
    }
  }
}

export { TrailSystem };
