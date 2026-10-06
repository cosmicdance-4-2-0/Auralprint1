import { preferences, replacePreferences } from "../core/preferences.js";
import { encodePresetPayload, decodePresetPayload, sanitizePreset } from "./preset-codec.js";

/* =============================================================================
   URL hash transport for preset schemas 2–10.
   Migration and sanitation belong to the transport-independent preset codec.
   ========================================================================== */
const UrlPreset = (() => {
  function base64UrlEncode(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    let b64 = btoa(s);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlDecodeToBytes(b64url) {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function encodePrefsToHash(prefs) {
    const payload = encodePresetPayload(prefs);
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    return "#p=" + base64UrlEncode(bytes);
  }

  function decodePrefsFromHash(hash) {
    if (!hash || !hash.startsWith("#p=")) return null;
    const token = hash.slice(3);
    const bytes = base64UrlDecodeToBytes(token);
    const json = new TextDecoder().decode(bytes);
    const obj = JSON.parse(json);
    const decoded = decodePresetPayload(obj);
    return decoded.ok ? decoded : null;
  }

  function applyFromLocationHash() {
    try {
      const decoded = decodePrefsFromHash(location.hash);
      if (!decoded) return false;
      // Replace canonical preferences only. Callers derive runtime settings
      // and synchronize subsystems (AUD-001).
      replacePreferences(sanitizePreset(decoded));
      return true;
    } catch {
      return false;
    }
  }

  function writeHashFromPrefs() {
    const hash = encodePrefsToHash(preferences);
    history.replaceState(null, "", location.pathname + location.search + hash);
  }

  return { applyFromLocationHash, writeHashFromPrefs };
})();

export { UrlPreset };
