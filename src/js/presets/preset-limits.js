import { CONFIG } from "../core/config.js";

function presetError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// Bound lexical nesting before JSON.parse can construct a deeply nested tree.
// Strings (including escaped quotes) do not participate in the depth count.
function parsePresetJson(json) {
  if (new TextEncoder().encode(json).length > CONFIG.presets.maxJsonBytes) throw presetError("preset-too-large");
  let depth = 0, inString = false, escaped = false;
  for (const char of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "{" || char === "[") {
      if (++depth > CONFIG.presets.maxStructureDepth) throw presetError("preset-too-complex");
    } else if (char === "}" || char === "]") depth--;
  }
  const payload = JSON.parse(json);
  assertPresetStructure(payload);
  return payload;
}

// Also protects direct codec callers, including cycles/non-JSON object graphs.
function assertPresetStructure(payload) {
  let nodes = 0;
  const seen = new Set();
  function visit(value, depth) {
    if (++nodes > CONFIG.presets.maxStructureNodes || depth > CONFIG.presets.maxStructureDepth) throw presetError("preset-too-complex");
    if (value === null || typeof value !== "object") return;
    if (seen.has(value)) throw presetError("malformed-payload");
    seen.add(value);
    const proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw presetError("malformed-payload");
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) throw presetError("malformed-payload");
      visit(descriptor.value, depth + 1);
    }
    seen.delete(value);
  }
  visit(payload, 0);
}

export { presetError, parsePresetJson, assertPresetStructure };
