import { clamp } from "../core/utils.js";
import { TAU } from "../core/constants.js";
import { runtime, normalizeOrbChannelId, sanitizeOrbBandIds } from "../core/preferences.js";
import { state } from "../core/state.js";
import { TrailSystem } from "./trail-system.js";
import { ColorPolicy } from "./color-policy.js";

/* =============================================================================
   Orb
   ========================================================================== */
class Orb {
  constructor(def) {
    this.id = def.id;
    this.chanId = normalizeOrbChannelId(def.chanId, def.bandId);
    this.bandIds = sanitizeOrbBandIds(def.bandIds, def.bandNames);
    this.chirality = def.chirality;
    this.startAngleRad = def.startAngleRad;
    this.hueOffsetDeg = def.hueOffsetDeg;
    this.colorSource = def.colorSource;
    this.centerXFrac = def.centerXFrac;
    this.centerYFrac = def.centerYFrac;
    this.angleRad = this.startAngleRad;

    this.trail = new TrailSystem();

    this.xSim = 0;
    this.ySim = 0;
    this.baseRadiusPx = 0;
    this.radialDispPx = 0;
  }

  resetPhase() { this.angleRad = this.startAngleRad; }
  resetTrail() { this.trail.reset(); }

  syncCosmeticFromDef(def) {
    this.hueOffsetDeg = def.hueOffsetDeg;
    this.colorSource = def.colorSource;
    this.centerXFrac = def.centerXFrac;
    this.centerYFrac = def.centerYFrac;
    this.bandIds = sanitizeOrbBandIds(def.bandIds, def.bandNames);
  }

  step(dtSec, nowSec, band, energyOverride01) {
    const s = runtime.settings;

    this.angleRad += this.chirality * s.motion.angularSpeedRadPerSec * dtSec;
    this.angleRad = ((this.angleRad % TAU) + TAU) % TAU;

    const minDim = Math.min(state.widthPx, state.heightPx);
    const minR = minDim * s.audio.minRadiusFrac;
    const maxR = minDim * s.audio.maxRadiusFrac;
    const safeMin = Math.min(minR, maxR);
    const safeMax = Math.max(minR, maxR);

    const energy01 = Number.isFinite(energyOverride01)
      ? clamp(energyOverride01, 0, 1)
      : (band ? band.energy01 : 0);
    this.baseRadiusPx = safeMin + (safeMax - safeMin) * energy01;

    const wf = band ? band.timeDomain : null;
    if (wf && wf.length > 0) {
      const phase01 = this.angleRad / TAU;
      const idx = Math.floor(phase01 * (wf.length - 1));
      const sample = wf[idx];
      this.radialDispPx = this.baseRadiusPx * s.motion.waveformRadialDisplaceFrac * sample;
    } else {
      this.radialDispPx = 0;
    }

    const radius = this.baseRadiusPx + this.radialDispPx;

    this.xSim = radius * Math.cos(this.angleRad) + this.centerXFrac * minDim;
    this.ySim = radius * Math.sin(this.angleRad) + this.centerYFrac * minDim;

    const rgbStart = ColorPolicy.pickParticleColorRgb01(this.angleRad, this);
    this.trail.updateAndEmit(dtSec, nowSec, this.xSim, this.ySim, rgbStart);
  }
}

export { Orb };
