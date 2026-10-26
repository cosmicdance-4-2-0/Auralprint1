import { preferences, replacePreferences } from "../core/preferences.js";
import { CONFIG } from "../core/config.js";
import { PRESET_SCHEMA_VERSION } from "../core/constants.js";
import { encodePresetPayload, decodePresetPayload, sanitizePreset } from "./preset-codec.js";
import { frequencyLimitMessage } from "../core/band-frequency.js";
import { parsePresetJson, presetError } from "./preset-limits.js";
import { compressDeflate, decompressDeflate } from "./deflate-transport.js";

// #p = Base64URL UTF-8 JSON (schemas 2–13).
// #z = Base64URL zlib-wrapped DEFLATE of schema-13 UTF-8 JSON only.
// The codec owns configuration; this module owns framing and atomic replacement.
function base64UrlEncode(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 8192) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  return btoa(chunks.join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(token, compressed) {
  if (token.length > CONFIG.presets.maxEncodedChars) throw presetError("preset-too-large");
  // Retain historical #p acceptance of padded/standard Base64 as well as URL
  // alphabet. The new #z framing is strictly unpadded Base64URL.
  if (!(compressed ? /^[A-Za-z0-9_-]+$/ : /^[A-Za-z0-9+/_-]+={0,2}$/).test(token)
    || token.replace(/=+$/, "").length % 4 === 1) throw presetError("malformed-payload");
  const max = compressed ? CONFIG.presets.maxCompressedBytes : CONFIG.presets.maxJsonBytes;
  if (Math.floor(token.replace(/=+$/, "").length * 3 / 4) > max) throw presetError("preset-too-large");
  const unpadded = token.replace(/=+$/, "");
  const binary = atob(unpadded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - unpadded.length % 4) % 4));
  if (binary.length > max) throw presetError("preset-too-large");
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function jsonBytes(prefs) {
  const bytes = new TextEncoder().encode(JSON.stringify(encodePresetPayload(prefs)));
  if (bytes.length > CONFIG.presets.maxJsonBytes) throw presetError("preset-too-large");
  return bytes;
}

function encodePrefsToHash(prefs) { return "#p=" + base64UrlEncode(jsonBytes(prefs)); }

async function encodeShareHash(prefs) {
  // Snapshot/sanitize before yielding; later mutations cannot alter this request.
  const bytes = jsonBytes(prefs);
  try {
    const compressed = await compressDeflate(bytes);
    return { hash: "#z=" + base64UrlEncode(compressed), compressed: true, fallback: false };
  } catch {
    return { hash: "#p=" + base64UrlEncode(bytes), compressed: false, fallback: true };
  }
}

function decodeJsonBytes(bytes, compressed) {
  const payload = parsePresetJson(new TextDecoder("utf-8", { fatal: compressed }).decode(bytes));
  if (compressed && payload?.schema !== PRESET_SCHEMA_VERSION) throw presetError("unsupported-compressed-schema");
  const decoded = decodePresetPayload(payload);
  if (!decoded.ok) throw presetError(decoded.code);
  return sanitizePreset(decoded);
}

function decodeUncompressedHash(hash) {
  if (!hash?.startsWith("#p=")) return null;
  return decodeJsonBytes(base64UrlDecode(hash.slice(3), false), false);
}

async function decodePrefsFromHash(hash) {
  if (!hash?.startsWith("#z=")) return decodeUncompressedHash(hash);
  const bytes = base64UrlDecode(hash.slice(3), true);
  return decodeJsonBytes(await decompressDeflate(bytes), true);
}

function validationText(error) {
  if (error.code === "unsupported-frequency") return frequencyLimitMessage();
  if (error.code === "unsupported-compression") return "This browser cannot decompress native DEFLATE presets. Open this link in a supported browser or request an uncompressed schema-13 link.";
  if (error.code === "async-import-required") return "Compressed presets require asynchronous import.";
  if (error.code === "preset-too-large" || error.code === "preset-too-complex" || error.code === "band-work-exceeded") return "Preset exceeds the supported decoding resource limits. Scene unchanged.";
  if (error.code === "unsupported-schema" || error.code === "unsupported-compressed-schema") return "Unsupported preset schema. Scene unchanged.";
  return "Invalid preset in URL. Scene unchanged.";
}

const UrlPreset = (() => {
  let validationMessage = "";
  let generation = 0;
  let shareGeneration = 0;
  const cancelPendingImport = () => { generation++; };
  const signature = () => JSON.stringify(encodePresetPayload(preferences));

  // Existing synchronous #p interfaces remain available for callers that need
  // an explicit uncompressed compatibility link. Async callers use the methods
  // below, which also accept #z without changing legacy migration semantics.
  function applyFromLocationHash() {
    shareGeneration++;
    cancelPendingImport();
    validationMessage = "";
    try {
      if (location.hash?.startsWith("#z=")) throw presetError("async-import-required");
      const next = decodeUncompressedHash(location.hash);
      if (!next) return false;
      replacePreferences(next);
      return true;
    } catch (error) { validationMessage = validationText(error); return false; }
  }

  function applyFromLocationHashAsync() {
    if (!location.hash?.startsWith("#z=")) return Promise.resolve({ ok: applyFromLocationHash(), stale: false });
    shareGeneration++;
    const request = ++generation, hash = location.hash, before = signature();
    validationMessage = "";
    const stale = () => request !== generation || location.hash !== hash || signature() !== before;
    return (async () => {
      try {
        const next = await decodePrefsFromHash(hash);
        if (stale()) return { ok: false, stale: true };
        replacePreferences(next);
        return { ok: true, stale: false };
      } catch (error) {
        if (stale()) return { ok: false, stale: true };
        validationMessage = validationText(error);
        return { ok: false, stale: false };
      }
    })();
  }

  function writeHash(hash) { history.replaceState(null, "", location.pathname + location.search + hash); }
  function writeHashFromPrefs() {
    cancelPendingImport();
    shareGeneration++;
    const hash = encodePrefsToHash(preferences);
    writeHash(hash);
    return hash;
  }

  async function writeCompressedHashFromPrefs() {
    cancelPendingImport();
    const request = ++shareGeneration, before = signature(), originalHash = location.hash;
    const result = await encodeShareHash(preferences);
    if (request !== shareGeneration || signature() !== before || location.hash !== originalHash) return { stale: true };
    writeHash(result.hash);
    return { ...result, stale: false };
  }

  function getValidationMessage() { return validationMessage; }
  return { applyFromLocationHash, applyFromLocationHashAsync, cancelPendingImport,
    writeHashFromPrefs, writeCompressedHashFromPrefs, getValidationMessage };
})();

export { UrlPreset, encodePrefsToHash, encodeShareHash, decodePrefsFromHash };
