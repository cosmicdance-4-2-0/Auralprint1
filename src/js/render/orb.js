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
    this.hueOffsetDeg = Number.isFinite(def.hueOffsetDeg) ? def.hueOffsetDeg : 0;
    this.centerX = Number.isFinite(def.centerX) ? def.centerX : 0;
    this.centerY = Number.isFinite(def.centerY) ? def.centerY : 0;
    this.angleRad = this.startAngleRad;

    this.trail = new TrailSystem();

    this.xSim = 0;
    this.ySim = 0;
    this.baseRadiusPx = 0;
    this.radialDispPx = 0;
    this.lastColorBandIndex = null;
  }

  resetPhase() { this.angleRad = this.startAngleRad; }
  resetTrail() { this.trail.reset(); }

  step(dtSec, nowSec, band, options = {}) {
    const s = runtime.settings;
    const energyOverride01 = Number.isFinite(options.energyOverride01) ? options.energyOverride01 : null;
    const colorBandIndex = Number.isInteger(options.colorBandIndex) ? options.colorBandIndex : null;
    const boundsPx = options.boundsPx && typeof options.boundsPx === "object"
      && Number.isFinite(options.boundsPx.x)
      && Number.isFinite(options.boundsPx.y)
      && Number.isFinite(options.boundsPx.width)
      && Number.isFinite(options.boundsPx.height)
      ? {
        x: options.boundsPx.x,
        y: options.boundsPx.y,
        width: Math.max(0, options.boundsPx.width),
        height: Math.max(0, options.boundsPx.height),
      }
      : { x: 0, y: 0, width: state.widthPx, height: state.heightPx };

    this.angleRad += this.chirality * s.motion.angularSpeedRadPerSec * dtSec;
    this.angleRad = ((this.angleRad % TAU) + TAU) % TAU;

    const minDim = Math.min(boundsPx.width, boundsPx.height);
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
    const originScreenX = boundsPx.x + boundsPx.width * 0.5 + this.centerX * boundsPx.width * 0.5;
    const originScreenY = boundsPx.y + boundsPx.height * 0.5 - this.centerY * boundsPx.height * 0.5;
    const originXSim = originScreenX - state.widthPx * 0.5;
    const originYSim = state.heightPx * 0.5 - originScreenY;

    this.xSim = originXSim + radius * Math.cos(this.angleRad);
    this.ySim = originYSim + radius * Math.sin(this.angleRad);

    this.lastColorBandIndex = colorBandIndex;
    const rgbStart = ColorPolicy.pickParticleColorRgb01(this.angleRad, {
      bandIndex: this.lastColorBandIndex,
      hueOffsetDeg: this.hueOffsetDeg,
    });
    this.trail.updateAndEmit(dtSec, nowSec, this.xSim, this.ySim, rgbStart);
  }
}

export { Orb };
