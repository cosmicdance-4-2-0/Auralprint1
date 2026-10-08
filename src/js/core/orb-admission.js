import { CONFIG } from "./config.js";

// Count validation only; Orb shape/identity normalization stays in orb-collection.
function assertOrbAdmission(orbs) {
  if (Array.isArray(orbs) && orbs.length > CONFIG.limits.orbs.maxCount) {
    const error = new RangeError(`At most ${CONFIG.limits.orbs.maxCount} Orbs can be admitted.`);
    error.code = "orb-limit-exceeded";
    throw error;
  }
}

function assertRuntimeOrbAdmission(orbs) {
  assertOrbAdmission(orbs);
  const ids = new Set();
  for (const orb of orbs) {
    // Runtime callers supply canonical identities; never repair or renumber here.
    // Repeated ownership would duplicate draws and corrupt intrusive trail queues.
    if (ids.has(orb.id)) throw new RangeError("Runtime Orb identities must be unique.");
    ids.add(orb.id);
  }
}

export { assertOrbAdmission, assertRuntimeOrbAdmission };
