import { CONFIG } from "../core/config.js";
import { normalizeMinPlacementDistancePx } from "../core/preferences.js";
import { ParticleGovernor } from "./particle-governor.js";
import { ParticleList } from "./particle-list.js";

class TrailSystem {
  constructor() {
    this.particles = new ParticleList();
    this.emitAccumulator = 0;
    this.pendingEmissions = 0;
    this.nextPending = null;
    this.priorityPrev = this.priorityNext = null;
    this.emission = { xSim: 0, ySim: 0, nowSec: 0, rgbStart: null };
    this.governor = new ParticleGovernor();
    this.standalone = true;
    this.governor.setTrails([this]);
  }

  setGovernor(governor) {
    if (this.governor === governor) return;
    // Lifecycle-only transfer: preserve history, admit each particle under the
    // destination ceiling. Normal active reconciliation never transfers survivors.
    const history = Array.from(this.particles);
    const fraction = this.emitAccumulator;
    const previous = this.governor;
    this.reset();
    this.governor = governor;
    previous.setTrails(previous.trails.filter(trail => trail !== this));
    this.standalone = false;
    this.emitAccumulator = Number.isFinite(fraction) && fraction >= 0 ? fraction % 1 : 0;
    for (const p of history) this.emitAt(p.xSim, p.ySim, p.bornSec, p.rgbStart);
  }

  reset() {
    while (this.particles.head) this.governor.retire(this.particles.head);
    this.emitAccumulator = 0;
    this.pendingEmissions = 0;
    this.nextPending = null;
    this.emission.rgbStart = null;
  }

  dispose() {
    this.reset();
    // No disposed trail keeps the scene's governor/other trails reachable.
    this.governor = new ParticleGovernor();
    this.standalone = true;
    this.governor.setTrails([this]);
  }

  emitAt(xSim, ySim, nowSec, rgbStart) {
    if (!Number.isFinite(nowSec)) return;
    const node = { particle: { xSim, ySim, bornSec: nowSec, rgbStart }, trail: this,
      prev: null, next: null, heapIndex: -1, sequence: 0 };
    if (!this.governor.admit(node)) return false;
    this.particles.append(node);
    return true;
  }

  updateAndEmit(dtSec, nowSec, emitterXSim, emitterYSim, rgbStart, particleSettings, dpr = 1) {
    if (this.standalone) this.governor.beginFrame();
    const g = this.governor;
    const ttl = Math.max(0.0001, particleSettings.ttlSec);
    for (let node = this.particles.head; node;) {
      const next = node.next;
      g.stats.expiryVisits++;
      if ((nowSec - node.particle.bornSec) >= ttl) g.retire(node, "expired");
      node = next;
    }

    const rate = Number.isFinite(particleSettings.emitPerSecond)
      ? Math.max(0, Math.min(particleSettings.emitPerSecond, CONFIG.limits.particles.emitPerSecond.max)) : 0;
    const delta = Number.isFinite(dtSec) && dtSec > 0 ? dtSec : 0;
    const fraction = Number.isFinite(this.emitAccumulator) && this.emitAccumulator >= 0
      ? this.emitAccumulator % 1 : 0;
    const total = fraction + rate * delta;
    // Retain the phase-1 secondary bound; overflow/invalid demand never controls a loop.
    const maximum = Math.ceil(rate * CONFIG.limits.timing.maxDeltaTimeSec) + 2;
    const whole = Number.isFinite(total) ? Math.floor(total) : Number.MAX_SAFE_INTEGER;
    this.emitAccumulator = Number.isFinite(total) ? total % 1 : 0;
    this.pendingEmissions = Number.isFinite(nowSec) && g.frameActive ? Math.min(whole, maximum) : 0;
    g.stats.requestedDemand = Math.min(Number.MAX_SAFE_INTEGER, g.stats.requestedDemand + whole);
    g.addDropped(whole - this.pendingEmissions, "rateLimitedDemand");
    const spacingPx = normalizeMinPlacementDistancePx(particleSettings.minPlacementDistancePx);
    if (spacingPx > 0 && this.pendingEmissions > 0) {
      // One sampled position per callback: extra whole opportunities are redundant.
      // Read only this Orb's current retained tail, after TTL retirement. No cache
      // survives reset/eviction, and proximity never deletes historical particles.
      const last = this.particles.tail?.particle;
      const threshold = spacingPx * (Number.isFinite(dpr) && dpr > 0 ? dpr : 1);
      const thresholdSquared = threshold * threshold;
      let eligible = true;
      if (last) {
        const dx = emitterXSim - last.xSim, dy = emitterYSim - last.ySim;
        g.stats.placementComparisons++;
        eligible = dx * dx + dy * dy >= thresholdSquared;
      }
      const candidate = eligible ? 1 : 0;
      g.stats.spatiallyRejectedDemand = Math.min(Number.MAX_SAFE_INTEGER,
        g.stats.spatiallyRejectedDemand + this.pendingEmissions - candidate);
      this.pendingEmissions = candidate;
    }
    this.emission.xSim = emitterXSim; this.emission.ySim = emitterYSim;
    this.emission.nowSec = nowSec; this.emission.rgbStart = rgbStart;
    if (this.standalone) g.finishFrame();
  }
}

export { TrailSystem };
