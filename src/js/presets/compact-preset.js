import { CONFIG } from "../core/config.js";
import { deepClone } from "../core/utils.js";
import { PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V13 } from "../core/constants.js";
import { SCHEMA_16_BASELINE } from "./schema-16-baseline.js";
import { SCHEMA_13_BASELINE } from "./schema-13-baseline.js";
import { presetError, assertPresetStructure } from "./preset-limits.js";
import { assertOrbAdmission } from "../core/orb-admission.js";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

// Select the decoding contract explicitly; never let a new factory default
// or wire schema change the interpretation of an already shared link.
function compactBaseline(schema) {
  if (schema === LEGACY_SCHEMA_V13) return SCHEMA_13_BASELINE;
  if (schema === PRESET_SCHEMA_VERSION) return SCHEMA_16_BASELINE;
  throw presetError("unsupported-schema");
}

// Grammar (ASCII, no whitespace/coercion/leading zeroes):
// selection := "" | item ("," item)*
// item := uint | uint ":" uint ; uint := "0" | [1-9][0-9]{0,2}
// Inclusive ranges must ascend strictly; each endpoint is a supported band ID.
// "" is the wire form of explicit []; missing bandIds inherits the frozen Orb.
function decodeBandRanges(text, budget = { remaining: CONFIG.bandNames.length }) {
  const max = CONFIG.bandNames.length - 1;
  if (typeof text !== "string" || text.length > CONFIG.bandNames.length * 8) throw presetError("invalid-band-range");
  if (text === "") return [];
  const spans = [];
  let work = 0;
  for (const token of text.split(",")) {
    if (!/^(0|[1-9][0-9]{0,2})(?::(0|[1-9][0-9]{0,2}))?$/.test(token)) throw presetError("invalid-band-range");
    const [left, right] = token.split(":");
    const start = Number(left), end = right === undefined ? start : Number(right);
    if (start > max || end > max || (right !== undefined && end <= start)) throw presetError("invalid-band-range");
    work += end - start + 1;
    if (work > CONFIG.bandNames.length || work > budget.remaining) throw presetError("band-work-exceeded");
    spans.push([start, end]);
  }
  // All ranges and total expansion are admitted before allocating the output.
  budget.remaining -= work;
  const out = [], seen = new Set();
  for (const [start, end] of spans) for (let id = start; id <= end; id++) {
    if (!seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

function encodeBandRanges(ids) {
  if (!Array.isArray(ids) || ids.length > CONFIG.bandNames.length) throw presetError("invalid-band-range");
  const unique = [], seen = new Set();
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 0 || id >= CONFIG.bandNames.length) throw presetError("invalid-band-range");
    if (!seen.has(id)) { seen.add(id); unique.push(id); }
  }
  ids = unique;
  const tokens = [];
  for (let i = 0; i < ids.length; i++) {
    const start = ids[i];
    let end = start;
    while (i + 1 < ids.length && ids[i + 1] === end + 1) end = ids[++i];
    tokens.push(end === start ? String(start) : `${start}:${end}`);
  }
  return tokens.join(",");
}

function delta(value, baseline) {
  const out = {};
  for (const key of Object.keys(baseline)) {
    if (key === "orbs") continue;
    const child = value[key], base = baseline[key];
    if (key === "bandIds") {
      if (JSON.stringify(child) !== JSON.stringify(base)) out[key] = encodeBandRanges(child);
    } else if (isRecord(base)) {
      const nested = delta(child, base);
      if (Object.keys(nested).length) out[key] = nested;
    } else if (child !== base) out[key] = child;
  }
  return out;
}

function compactPreferences(canonical, schema = PRESET_SCHEMA_VERSION) {
  const baseline = compactBaseline(schema);
  const out = delta(canonical, baseline);
  // Arrays are replacement collections, never patches by ID. Always carry IDs
  // when present, even if they happen to equal the alternating factory IDs.
  if (JSON.stringify(canonical.orbs) !== JSON.stringify(baseline.orbs)) {
    out.orbs = canonical.orbs.map((orb, index) => ({
      ...delta(orb, baseline.orbs[index % baseline.orbs.length]), id: orb.id,
    }));
  }
  return out;
}

function expand(delta, baseline, budget, orbBaseline) {
  if (!isRecord(delta)) throw presetError("malformed-delta");
  const out = deepClone(baseline);
  for (const key of Object.keys(delta)) {
    if (!hasOwn(baseline, key)) throw presetError("unknown-preset-field");
    const value = delta[key], base = baseline[key];
    if (key === "orbs") {
      if (!Array.isArray(value)) throw presetError("malformed-delta");
      assertOrbAdmission(value);
      out.orbs = value.map((orb, index) => {
        const full = expand(orb, orbBaseline[index % orbBaseline.length], budget, orbBaseline);
        // Identity repair belongs to the canonical collection normalizer; a
        // missing ID must not masquerade as an explicitly requested factory ID.
        if (!hasOwn(orb, "id")) delete full.id;
        return full;
      });
    } else if (key === "bandIds") out[key] = decodeBandRanges(value, budget);
    else if (isRecord(base)) out[key] = expand(value, base, budget, orbBaseline);
    else {
      if (typeof value !== typeof base || (typeof base === "number" && !Number.isFinite(value))) throw presetError("malformed-delta");
      out[key] = value;
    }
  }
  return out;
}

function expandCompactPreferences(prefs, schema = PRESET_SCHEMA_VERSION) {
  assertPresetStructure(prefs);
  const baseline = compactBaseline(schema);
  return expand(prefs, baseline, {
    remaining: CONFIG.limits.orbs.maxCount * CONFIG.bandNames.length,
  }, baseline.orbs);
}

export { compactBaseline, compactPreferences, expandCompactPreferences, encodeBandRanges, decodeBandRanges };
