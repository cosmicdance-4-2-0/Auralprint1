// Read-only selection over the existing retained suffix. Unknown history is a
// boundary, never an invitation to reconstruct or bridge missing travel stamps.
function angularTracePointCount(orb) {
  const trace = orb.trace, particles = orb.trail?.particles;
  const current = orb.angularTravelRad, epoch = orb.angularTravelEpoch;
  const span = trace.angularSpanDeg * Math.PI / 180;
  if (!particles || !epoch || typeof epoch !== "object" || !Number.isFinite(current) || current < 0 ||
      !Number.isFinite(span) || span <= 0) return 0;
  const minimum = current - span;
  const cap = Math.min(particles.length, Math.ceil(trace.numLines) + 1);
  let count = 0, newer = current;
  for (let node = particles.tail; node && count < cap; node = node.prev) {
    const particle = node.particle, travel = particle.angularTravelRad;
    if (particle.angularTravelEpoch !== epoch || !Number.isFinite(travel) ||
        travel < 0 || travel < minimum || travel > newer) break;
    count++;
    newer = travel;
  }
  return count;
}

export { angularTracePointCount };
