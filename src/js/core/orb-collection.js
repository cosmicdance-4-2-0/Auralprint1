import { CONFIG } from "./config.js";
import { normalizeOrbDef } from "./preferences.js";

const ORB_ID_PATTERN = /^ORB(\d+)$/;

function isValidOrbId(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function allocateOrbId(orbs = []) {
  let maxSuffix = -1n;
  for (const orb of orbs) {
    if (!isValidOrbId(orb && orb.id)) continue;
    const match = ORB_ID_PATTERN.exec(orb.id);
    if (match) {
      const suffix = BigInt(match[1]);
      if (suffix > maxSuffix) maxSuffix = suffix;
    }
  }
  // The exact successor exceeds every used ORB suffix, so it cannot collide.
  // BigInt stays local; persistent identities remain opaque strings.
  return `ORB${maxSuffix + 1n}`;
}

function normalizeOrbCollection(incoming) {
  if (!Array.isArray(incoming)) return [];
  const normalized = [];
  const used = new Set();
  for (let index = 0; index < incoming.length; index++) {
    const fallback = CONFIG.defaults.orbs[index % CONFIG.defaults.orbs.length];
    const candidate = incoming[index];
    const requestedId = candidate && candidate.id;
    const id = isValidOrbId(requestedId) && !used.has(requestedId)
      ? requestedId
      : allocateOrbId([...incoming, ...normalized]);
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
  if (!Array.isArray(orbs)) return null;
  const id = allocateOrbId(orbs);
  const orb = normalizeOrbDef({ ...template, id }, template);
  const insertAt = Number.isInteger(position) ? Math.max(0, Math.min(position, orbs.length)) : orbs.length;
  orbs.splice(insertAt, 0, orb);
  return orb;
}

function duplicateOrb(orbs, sourceId) {
  if (!Array.isArray(orbs)) return null;
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
