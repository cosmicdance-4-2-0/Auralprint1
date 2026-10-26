import { CONFIG } from "../core/config.js";

function traceSegmentDemand(orb) {
  const trace = orb.trace;
  if (!trace?.lines || (!trace.fadeEnabled && trace.lineColorMode !== "particleBirth")) return 0;
  const segments = Math.max(0, Math.min((orb.trail?.particles?.length || 0) - 1, Math.ceil(trace.numLines)));
  return trace.lineColorMode === "particleBirth" ? segments : Math.min(segments, trace.fadeSegments);
}

// Render-only accounting, independent of particle emission/retention. Entries are
// rebuilt only with Scene/lifecycle changes; frames allocate no scheduling arrays.
class TraceRenderGovernor {
  constructor(policy = CONFIG.traceRendering) {
    const limit = policy.maxSegmentStrokesPerFrame;
    this.limit = Number.isSafeInteger(limit) && limit >= 0 ? limit : CONFIG.traceRendering.maxSegmentStrokesPerFrame;
    this.entries = [];
    this.byOrb = new Map();
    this.rotation = 0;
    this.stats = { maxSegmentStrokesPerFrame: this.limit, requestedSegmentStrokes: 0,
      grantedSegmentStrokes: 0, segmentStrokes: 0, activeOrbs: 0, limitedOrbs: 0 };
  }

  setVisualizers(visualizers) {
    this.entries.length = 0;
    this.byOrb.clear();
    for (const visualizer of visualizers) {
      const orb = visualizer.type === "orb" ? visualizer.orb : null;
      if (!orb || (!orb.trace?.fadeEnabled && orb.trace?.lineColorMode !== "particleBirth")) continue;
      const entry = { orb, demand: 0, quota: 0 };
      this.entries.push(entry);
      this.byOrb.set(orb, entry);
    }
    this.rotation = 0;
    this.clearStats();
  }

  clearStats() {
    const s = this.stats;
    s.requestedSegmentStrokes = s.grantedSegmentStrokes = s.segmentStrokes = s.activeOrbs = s.limitedOrbs = 0;
  }

  beginFrame() {
    this.clearStats();
    const s = this.stats;
    for (const entry of this.entries) {
      entry.demand = traceSegmentDemand(entry.orb);
      if (entry.demand > 0) s.activeOrbs++;
      s.requestedSegmentStrokes += entry.demand;
      entry.quota = 0;
    }
    if (!s.activeOrbs) return;
    // Equal shares bound scheduling to O(active Orbs), even with large limits.
    // Unused short-trace shares are not redistributed. Rotating the remainder
    // prevents composition order from permanently privileging earlier Orbs.
    const share = Math.floor(this.limit / s.activeOrbs);
    const remainder = this.limit % s.activeOrbs;
    const start = this.rotation % s.activeOrbs;
    let activeIndex = 0;
    for (const entry of this.entries) {
      if (!entry.demand) continue;
      const distance = (activeIndex - start + s.activeOrbs) % s.activeOrbs;
      entry.quota = Math.min(entry.demand, share + (distance < remainder ? 1 : 0));
      s.grantedSegmentStrokes += entry.quota;
      if (entry.quota < entry.demand) s.limitedOrbs++;
      activeIndex++;
    }
    this.rotation = (start + Math.max(1, remainder)) % s.activeOrbs;
  }

  quotaFor(orb) { return this.byOrb.get(orb)?.quota || 0; }
  record(strokes) { if (Number.isFinite(strokes) && strokes > 0) this.stats.segmentStrokes += strokes; }
  getStats() { return { ...this.stats }; }
  dispose() { this.setVisualizers([]); }
}

export { TraceRenderGovernor, traceSegmentDemand };
