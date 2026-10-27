import { clamp } from "../core/utils.js";
import { TAU } from "../core/constants.js";
import { normalizeOrbChannelId, sanitizeOrbBandIds } from "../core/preferences.js";
import { worldUnitsFromFraction } from "../core/world-geometry.js";
import { state } from "../core/state.js";
import { TrailSystem } from "./trail-system.js";
import { ColorPolicy } from "./color-policy.js";

// Reserve half of binary64's exact-integer significand for sub-radian
// resolution. This is a representation guard, not a configurable history cap.
const MAX_PRECISE_ANGULAR_TRAVEL_RAD = Math.sqrt(Number.MAX_SAFE_INTEGER);

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
    this.motion = def.motion;
    this.response = def.response;
    this.particles = def.particles;
    this.trace = def.trace;
    this.angleRad = this.startAngleRad;
    // Cumulative physical distance within the current runtime epoch. Nothing
    // here is a preference or inferred from wrapped phase / retained particles.
    this.angularTravelRad = 0;
    this.angularTravelCompensation = 0;
    this.angularTravelEpoch = null;
    this.syncAngularTraceMode();

    this.trail = new TrailSystem();

    this.xSim = 0;
    this.ySim = 0;
    this.baseRadiusUnits = 0;
    this.radialDispUnits = 0;
  }

  resetPhase() { this.angleRad = this.startAngleRad; }
  resetTrail() {
    this.trail.reset();
    this.resetAngularTravel();
  }

  syncAngularTraceMode() {
    if (this.trace?.lengthMode === "angular") {
      if (this.angularTravelEpoch === null) this.angularTravelEpoch = {};
    } else {
      this.angularTravelEpoch = null;
    }
  }

  resetAngularTravel() {
    this.angularTravelRad = 0;
    this.angularTravelCompensation = 0;
    this.angularTravelEpoch = this.trace?.lengthMode === "angular" ? {} : null;
  }

  addAngularTravel(distanceRad) {
    // Compensated summation preserves repeated small accepted increments. At a
    // rare precision boundary, begin a fresh epoch at the actual endpoint;
    // particles stay retained but old stamps cannot fabricate compatible travel.
    const adjusted = distanceRad - this.angularTravelCompensation;
    const next = this.angularTravelRad + adjusted;
    if (!Number.isFinite(next) || next < 0 || next > MAX_PRECISE_ANGULAR_TRAVEL_RAD) {
      this.resetAngularTravel();
      return;
    }
    this.angularTravelCompensation = (next - this.angularTravelRad) - adjusted;
    this.angularTravelRad = next;
  }

  syncFromDef(def) {
    this.chanId = normalizeOrbChannelId(def.chanId, def.bandId);
    this.chirality = def.chirality;
    this.startAngleRad = def.startAngleRad;
    this.hueOffsetDeg = def.hueOffsetDeg;
    this.colorSource = def.colorSource;
    this.centerXFrac = def.centerXFrac;
    this.centerYFrac = def.centerYFrac;
    this.bandIds = sanitizeOrbBandIds(def.bandIds, def.bandNames);
    this.motion = def.motion;
    this.response = def.response;
    this.particles = def.particles;
    this.trace = def.trace;
    this.syncAngularTraceMode();
  }

  // Legacy direct callers omit motionDtSec and retain their supplied delta.
  // The application frame loop supplies independently bounded emission/motion.
  step(dtSec, nowSec, band, energyOverride01, globalDominantBandIndex, selectedDominantBandIndex = null, motionDtSec = dtSec) {
    this.syncAngularTraceMode();
    const angleDelta = this.chirality * this.motion.angularSpeedRadPerSec * motionDtSec;
    if (Number.isFinite(angleDelta) && angleDelta !== 0) {
      this.angleRad += angleDelta;
      this.angleRad = ((this.angleRad % TAU) + TAU) % TAU;
      this.addAngularTravel(Math.abs(angleDelta));
    }

    const world = state.world;
    const minR = worldUnitsFromFraction(world, this.response.minRadiusFrac);
    const maxR = worldUnitsFromFraction(world, this.response.maxRadiusFrac);
    const safeMin = Math.min(minR, maxR);
    const safeMax = Math.max(minR, maxR);

    const energy01 = Number.isFinite(energyOverride01)
      ? clamp(energyOverride01, 0, 1)
      : (band ? band.energy01 : 0);
    this.baseRadiusUnits = safeMin + (safeMax - safeMin) * energy01;

    const wf = band ? band.waveform : null;
    if (wf && wf.length > 0) {
      const phase01 = this.angleRad / TAU;
      const idx = Math.floor(phase01 * (wf.length - 1));
      const sample = wf[idx];
      this.radialDispUnits = this.baseRadiusUnits * this.response.waveformRadialDisplaceFrac * sample;
    } else {
      this.radialDispUnits = 0;
    }

    const radius = this.baseRadiusUnits + this.radialDispUnits;

    this.xSim = radius * Math.cos(this.angleRad) + worldUnitsFromFraction(world, this.centerXFrac);
    this.ySim = radius * Math.sin(this.angleRad) + worldUnitsFromFraction(world, this.centerYFrac);

    const rgbStart = ColorPolicy.pickParticleColorRgb01(
      this.angleRad,
      this,
      globalDominantBandIndex,
      selectedDominantBandIndex,
    );
    this.trail.updateAndEmit(dtSec, nowSec, this.xSim, this.ySim, rgbStart, this.particles,
      this.angularTravelRad, this.angularTravelEpoch);
  }
}

export { Orb };
