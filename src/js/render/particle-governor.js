import { normalizeParticleSafety } from "../core/particle-safety.js";

// One instance per VisualizerRuntime; standalone trails own an isolated instance.
// The selected policy is bounded only by CONFIG's documented permissible ranges.
class ParticleGovernor {
  #policy;

  constructor(policy) {
    this.#policy = Object.freeze(normalizeParticleSafety(policy));
    this.heap = [];
    this.trails = [];
    this.nextPriority = null;
    this.priorityTail = null;
    this.sequence = 0;
    this.frameActive = false;
    this.retentionEvictionsTotal = 0;
    this.stats = { emissions: 0, requestedDemand: 0, spatiallyRejectedDemand: 0, placementComparisons: 0,
      budgetRejectedDemand: 0, rateLimitedDemand: 0, retentionRejectedDemand: 0,
      droppedDemand: 0, expired: 0, evicted: 0, expiryVisits: 0, schedulingVisits: 0, heapComparisons: 0 };
  }

  get policy() { return this.#policy; }
  get activeParticles() { return this.heap.length; }

  applyPolicy(policy) {
    const next = normalizeParticleSafety(policy);
    if (next.maxEmissionsPerFrame === this.policy.maxEmissionsPerFrame &&
        next.maxActiveParticles === this.policy.maxActiveParticles) return false;
    this.#policy = Object.freeze(next);
    // Indexed-heap retirement preserves global timestamp/sequence ordering and
    // every surviving trail, fraction, and priority link. Satisfy before render.
    while (this.heap.length > next.maxActiveParticles) this.retire(this.heap[0], "evicted");
    return true;
  }

  appendPriority(trail) {
    trail.priorityPrev = this.priorityTail;
    trail.priorityNext = null;
    if (this.priorityTail) this.priorityTail.priorityNext = trail;
    else this.nextPriority = trail;
    this.priorityTail = trail;
  }

  removePriority(trail) {
    if (trail.priorityPrev) trail.priorityPrev.priorityNext = trail.priorityNext;
    else this.nextPriority = trail.priorityNext;
    if (trail.priorityNext) trail.priorityNext.priorityPrev = trail.priorityPrev;
    else this.priorityTail = trail.priorityPrev;
    trail.priorityPrev = trail.priorityNext = null;
  }

  servicePriority(trail) {
    if (trail === this.priorityTail) return;
    this.removePriority(trail);
    this.appendPriority(trail);
  }

  setTrails(trails) {
    const members = new Set(trails), previous = new Set(this.trails);
    for (const removed of this.trails) {
      if (members.has(removed)) continue;
      this.removePriority(removed);
      if (removed.governor === this) removed.dispose();
    }
    // Preserve survivors' service order across composition reorder. New owners
    // join the back; inactive/unserved owners keep their place, without debt.
    for (const added of trails) if (!previous.has(added)) this.appendPriority(added);
    this.trails = trails;
  }

  beginFrame() {
    for (const key in this.stats) this.stats[key] = 0;
    for (const trail of this.trails) {
      trail.pendingEmissions = 0; trail.nextPending = null; trail.emission.rgbStart = null;
    }
    this.frameActive = true;
  }

  finishFrame() {
    // Eligible trails get one-particle quanta. The persistent service queue
    // leaves unserved/inactive owners in place, avoiding periodic-demand aliasing.
    // Build the ready ring once; each service/removal then costs O(1).
    let head = null, tail = null;
    for (let trail = this.nextPriority; trail; trail = trail.priorityNext) {
      this.stats.schedulingVisits++;
      if (!trail.pendingEmissions) continue;
      if (tail) tail.nextPending = trail;
      else head = trail;
      tail = trail;
    }
    if (tail) tail.nextPending = head;
    let remaining = this.policy.maxActiveParticles > 0
      ? this.policy.maxEmissionsPerFrame - this.stats.emissions : 0;
    while (head && remaining > 0) {
      const trail = head;
      this.stats.schedulingVisits++;
      const e = trail.emission;
      trail.emitAt(e.xSim, e.ySim, e.nowSec, e.rgbStart);
      trail.pendingEmissions--;
      remaining--;
      this.servicePriority(trail);
      if (trail.pendingEmissions === 0) {
        if (trail === tail) head = tail = null;
        else { head = trail.nextPending; tail.nextPending = head; }
        trail.nextPending = null;
      } else { tail = trail; head = trail.nextPending; }
    }
    // Whole demand is never debt. Fractional accumulation lives on each trail.
    for (const trail of this.trails) {
      this.addDropped(trail.pendingEmissions,
        this.policy.maxActiveParticles === 0 ? "retentionRejectedDemand" : "budgetRejectedDemand");
      trail.pendingEmissions = 0;
      trail.nextPending = null;
      trail.emission.rgbStart = null;
    }
    this.frameActive = false;
  }

  addDropped(count, reason = "budgetRejectedDemand") {
    this.stats.droppedDemand = Math.min(Number.MAX_SAFE_INTEGER, this.stats.droppedDemand + count);
    this.stats[reason] = Math.min(Number.MAX_SAFE_INTEGER, this.stats[reason] + count);
  }

  older(a, b) {
    this.stats.heapComparisons++;
    return a.particle.bornSec < b.particle.bornSec ||
      (a.particle.bornSec === b.particle.bornSec && a.sequence < b.sequence);
  }

  swap(a, b) {
    const heap = this.heap;
    const node = heap[a]; heap[a] = heap[b]; heap[b] = node;
    heap[a].heapIndex = a; heap[b].heapIndex = b;
  }

  siftUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.older(this.heap[index], this.heap[parent])) break;
      this.swap(index, parent); index = parent;
    }
    return index;
  }

  siftDown(index) {
    const heap = this.heap;
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1;
      if (child + 1 < heap.length && this.older(heap[child + 1], heap[child])) child++;
      if (!this.older(heap[child], heap[index])) break;
      this.swap(child, index); index = child;
    }
  }

  admit(node) {
    if (this.policy.maxActiveParticles === 0) return false;
    if (this.frameActive && this.stats.emissions >= this.policy.maxEmissionsPerFrame) return false;
    // Retire before insertion, so the ceiling holds throughout admission.
    if (this.heap.length >= this.policy.maxActiveParticles) this.retire(this.heap[0], "evicted");
    node.sequence = this.sequence++;
    node.heapIndex = this.heap.length;
    this.heap.push(node);
    this.siftUp(node.heapIndex);
    if (this.frameActive) this.stats.emissions++;
    return true;
  }

  retire(node, reason = null) {
    const index = node.heapIndex;
    if (index < 0 || this.heap[index] !== node) return;
    const last = this.heap.pop();
    if (index < this.heap.length) {
      this.heap[index] = last; last.heapIndex = index;
      this.siftDown(this.siftUp(index));
    }
    node.trail.particles.unlink(node);
    node.heapIndex = -1;
    if (reason) this.stats[reason]++;
    if (reason === "evicted") this.retentionEvictionsTotal++;
    if (!this.heap.length) this.sequence = 0;
  }

  dispose() {
    for (const trail of this.trails) {
      if (trail.governor === this) trail.dispose();
    }
    while (this.heap.length) this.retire(this.heap[0]);
    this.trails = [];
    this.nextPriority = this.priorityTail = null;
    this.frameActive = false;
    this.sequence = 0;
    this.retentionEvictionsTotal = 0;
    for (const key in this.stats) this.stats[key] = 0;
  }

  getStats() { return { ...this.stats, activeParticles: this.activeParticles,
    retentionEvictionsTotal: this.retentionEvictionsTotal }; }
}

export { ParticleGovernor };
