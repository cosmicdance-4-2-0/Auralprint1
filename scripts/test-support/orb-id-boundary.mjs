// Invoked only by the memory-limited, externally killable Orb identity test.
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { CONFIG } from "../../src/js/core/config.js";
import { allocateOrbId, createOrb, duplicateOrb, normalizeOrbCollection, removeOrb } from "../../src/js/core/orb-collection.js";
import { preferences } from "../../src/js/core/preferences.js";
import { encodePresetPayload } from "../../src/js/presets/preset-codec.js";
import { decodePrefsFromHash, encodePrefsToHash, UrlPreset } from "../../src/js/presets/url-preset.js";

const cap = CONFIG.limits.orbs.maxCount;
const maxGeneratedLength = "orb-".length + cap.toString(36).length;
const numeric = "ORB" + "9".repeat(20_000);
const opaque = "opaque-" + "宇宙🎵".repeat(5_000);
const idsOf = orbs => orbs.map(orb => orb.id);
const phase = name => process.send?.({ phase: name });
let cases = 0;

function bounded(orbs, explicit = new Set()) {
  assert.equal(new Set(idsOf(orbs)).size, orbs.length);
  let generatedCharacters = 0;
  for (const { id } of orbs) {
    if (explicit.has(id)) continue;
    assert.match(id, /^orb-[0-9a-z]+$/);
    assert.ok(id.length <= maxGeneratedLength, `generated ID has ${id.length} characters`);
    generatedCharacters += id.length;
  }
  assert.ok(generatedCharacters <= orbs.length * maxGeneratedLength);
  return generatedCharacters;
}

phase("unsafe-Number boundaries and long explicit identities");
for (const id of [
  "ORB9007199254740990", "ORB9007199254740991", "ORB9007199254740992",
  "ORB9007199254740993", "ORB" + "9".repeat(40), "ORB" + "9".repeat(400), numeric, opaque,
]) {
  const input = Object.freeze([Object.freeze({ id }), Object.freeze({ id: "HISTORICAL-Z" })]);
  assert.equal(allocateOrbId(input), "orb-0");
  const normalized = normalizeOrbCollection(input);
  assert.deepEqual(idsOf(normalized), [id, "HISTORICAL-Z"]);
  assert.deepEqual(normalizeOrbCollection(normalized), normalized);
  const source = structuredClone(normalized[0]);
  const added = createOrb(normalized), duplicate = duplicateOrb(normalized, id);
  assert.equal(added.id, "orb-0");
  assert.equal(duplicate.id, "orb-1");
  assert.deepEqual(normalized[0], source);
  bounded(normalized, new Set([id, "HISTORICAL-Z"]));
  cases++;
}

phase("admitted collection boundaries and negative controls");
for (const [name, input, explicit] of [
  ["ordinary-two", [{ id: "ORB0" }, { id: "ORB1" }], new Set(["ORB0", "ORB1"])],
  ["ordinary-maximum", Array.from({ length: cap }, (_, i) => ({ id: `ORB${i}` })), new Set(Array.from({ length: cap }, (_, i) => `ORB${i}`))],
  ["missing-maximum", Array.from({ length: cap }, () => ({})), new Set()],
  ["numeric-missing-maximum", [{ id: numeric }, ...Array.from({ length: cap - 1 }, () => ({}))], new Set([numeric])],
  ["numeric-duplicates-maximum", Array.from({ length: cap }, () => ({ id: numeric })), new Set([numeric])],
  ["opaque-missing-maximum", [{ id: opaque }, ...Array.from({ length: cap - 1 }, () => ({}))], new Set([opaque])],
]) {
  phase(name);
  for (const orb of input) Object.freeze(orb);
  Object.freeze(input);
  const normalized = normalizeOrbCollection(input);
  assert.equal(normalized.length, input.length);
  const generatedCharacters = bounded(normalized, explicit);
  if (explicit.size === input.length) assert.deepEqual(idsOf(normalized), idsOf(input));
  if (name.startsWith("numeric-")) assert.equal(normalized[0].id, numeric);
  if (name.startsWith("opaque-")) assert.equal(normalized[0].id, opaque);
  assert.deepEqual(normalizeOrbCollection(input), normalized);
  assert.deepEqual(normalizeOrbCollection(normalized), normalized);
  if (normalized.length === cap) {
    assert.equal(createOrb(normalized), null);
    assert.equal(duplicateOrb(normalized, normalized[0].id), null);
  }
  assert.ok(generatedCharacters <= cap * maxGeneratedLength);
  cases++;
}

phase("147-character compressed hostile preset through real URL decoder");
const wire = { schema: 16, prefs: { orbs: [{ id: numeric }, ...Array.from({ length: cap - 1 }, () => ({}))] } };
const hash = "#z=" + deflateSync(JSON.stringify(wire)).toString("base64url");
// The audit's 4096-Orb input produces 147 characters. Allow framing differences
// in supported zlib versions while retaining a compact attack-sized input.
assert.ok(hash.length <= 160, `hostile hash unexpectedly grew to ${hash.length} characters`);
const decoded = await decodePrefsFromHash(hash);
assert.equal(decoded.orbs.length, cap);
assert.equal(decoded.orbs[0].id, numeric);
const generatedCharacters = bounded(decoded.orbs, new Set([numeric]));
assert.deepEqual(normalizeOrbCollection(decoded.orbs), decoded.orbs);
assert.deepEqual(await decodePrefsFromHash(encodePrefsToHash(decoded)), decoded);
const compressedAgain = "#z=" + deflateSync(JSON.stringify(encodePresetPayload(decoded))).toString("base64url");
assert.deepEqual(await decodePrefsFromHash(compressedAgain), decoded);

globalThis.location = { hash };
assert.deepEqual(await UrlPreset.applyFromLocationHashAsync(), { ok: true, stale: false });
assert.deepEqual(preferences, decoded);
const source = structuredClone(preferences.orbs[0]);
assert.equal(createOrb(preferences.orbs), null);
assert.equal(duplicateOrb(preferences.orbs, numeric), null);
// Free two places after the actual import, then use both collection APIs.
assert.equal(removeOrb(preferences.orbs, preferences.orbs.at(-1).id), true);
assert.equal(removeOrb(preferences.orbs, preferences.orbs.at(-1).id), true);
const survivingIds = idsOf(preferences.orbs);
const added = createOrb(preferences.orbs), duplicate = duplicateOrb(preferences.orbs, numeric);
assert.ok(added && duplicate);
assert.notEqual(added.id, duplicate.id);
assert.deepEqual(preferences.orbs[0], source);
for (const id of survivingIds) assert.ok(preferences.orbs.some(orb => orb.id === id));
bounded(preferences.orbs, new Set([numeric]));
assert.deepEqual(await decodePrefsFromHash(encodePrefsToHash(preferences)), preferences);
cases++;

// Sending this sentinel is insufficient on its own: the parent also requires
// clean process exit, so caught errors and premature exits cannot pass the gate.
process.send({ completed: true, cases, count: cap, hashCharacters: hash.length, generatedCharacters, maxGeneratedLength }, () => process.disconnect());
