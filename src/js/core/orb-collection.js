import { CONFIG } from "./config.js";
import { normalizeOrbDef } from "./preferences.js";
import { assertOrbAdmission } from "./orb-admission.js";

function isValidOrbId(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function createOrbIdAllocator(orbs) {
  const reserved = new Set();
  for (const orb of orbs) {
    if (isValidOrbId(orb && orb.id)) reserved.add(orb.id);
  }
  // IDs are opaque. Reserve later explicit owners before generating anything;
  // this local cursor probes at most one occupied candidate per reserved ID.
  let cursor = 0;
  return () => {
    let id;
    do { id = `orb-${(cursor++).toString(36)}`; } while (reserved.has(id));
    reserved.add(id);
    return id;
  };
}

function allocateOrbId(orbs = []) {
  return createOrbIdAllocator(orbs)();
}

function normalizeOrbCollection(incoming, fallbackOrbs = CONFIG.defaults.orbs) {
  if (!Array.isArray(incoming)) return [];
  assertOrbAdmission(incoming);
  const normalized = [];
  const used = new Set();
  const nextId = createOrbIdAllocator(incoming);
  for (let index = 0; index < incoming.length; index++) {
    const fallback = fallbackOrbs[index % fallbackOrbs.length];
    const candidate = incoming[index];
    const requestedId = candidate && candidate.id;
    const id = isValidOrbId(requestedId) && !used.has(requestedId)
      ? requestedId
      : nextId();
    const orb = normalizeOrbDef({ ...(candidate && typeof candidate === "object" ? candidate : {}), id }, fallback);
    normalized.push(orb);
    used.add(orb.id);
  }
  return normalized;
}

function findOrbById(orbs, id) {
  return Array.isArray(orbs) ? orbs.find((orb) => orb.id === id) : undefined;
}

function createOrb(orbs, { position, template = CONFIG.defaults.orbs[0] } = {}) {
  if (!Array.isArray(orbs) || orbs.length >= CONFIG.limits.orbs.maxCount) return null;
  const id = allocateOrbId(orbs);
  const orb = normalizeOrbDef({ ...template, id }, template);
  const insertAt = Number.isInteger(position) ? Math.max(0, Math.min(position, orbs.length)) : orbs.length;
  orbs.splice(insertAt, 0, orb);
  return orb;
}

function duplicateOrb(orbs, sourceId) {
  if (!Array.isArray(orbs) || orbs.length >= CONFIG.limits.orbs.maxCount) return null;
  const index = orbs.findIndex((orb) => orb.id === sourceId);
  if (index < 0) return null;
  const id = allocateOrbId(orbs);
  const duplicate = normalizeOrbDef({ ...orbs[index], id }, orbs[index]);
  orbs.splice(index + 1, 0, duplicate);
  return duplicate;
}

function removeOrb(orbs, id) {
  if (!Array.isArray(orbs)) return false;
  const index = orbs.findIndex((orb) => orb.id === id);
  if (index < 0) return false;
  orbs.splice(index, 1);
  return true;
}

export { allocateOrbId, createOrb, duplicateOrb, findOrbById, isValidOrbId, normalizeOrbCollection, removeOrb };
