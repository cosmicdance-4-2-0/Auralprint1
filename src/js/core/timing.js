import { CONFIG } from "./config.js";

function normalizeMaxDeltaTimeSec(requested) {
  const valid = Number.isFinite(requested) && requested > 0
    ? requested
    : CONFIG.defaults.timing.maxDeltaTimeSec;
  return Math.min(valid, CONFIG.limits.timing.maxDeltaTimeSec);
}

function simulationDeltaSec(elapsedSec, requestedMax) {
  // Discard excess elapsed time; callers keep their real-time clocks.
  if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  return Math.min(elapsedSec, normalizeMaxDeltaTimeSec(requestedMax));
}

// Motion integrates ordinary visible elapsed time independently of emission work.
// Exactly the threshold is ordinary; excess/invalid intervals are discarded.
function visualMotionDeltaSec(elapsedSec) {
  return Number.isFinite(elapsedSec) && elapsedSec > 0 &&
    elapsedSec <= CONFIG.limits.timing.motionDiscontinuitySec ? elapsedSec : 0;
}

export { normalizeMaxDeltaTimeSec, simulationDeltaSec, visualMotionDeltaSec };
