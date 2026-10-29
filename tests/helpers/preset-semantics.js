import { decodePresetPayload, sanitizePreset } from '../../src/js/presets/preset-codec.js';

// Existing configuration regressions compare canonical meaning. Wire omission
// and range grammar are asserted independently in preset-schema-13/16.test.js.
function canonicalPrefs(payload) {
  const decoded = decodePresetPayload(payload);
  if (!decoded.ok) throw new Error(`Invalid test payload: ${decoded.code}`);
  return sanitizePreset(decoded);
}
function canonicalPayload(payload) { return { schema: payload.schema, prefs: canonicalPrefs(payload) }; }
function canonicalHash(hash) { return canonicalPayload(JSON.parse(Buffer.from(hash.slice(3), 'base64url').toString('utf8'))); }
// Historical fixtures remain immutable. Add only the 116 migration defaults
// when comparing their full canonical result with the current Scene shape.
function with116Defaults(prefs) {
  const next = structuredClone(prefs);
  next.audio = { ...next.audio, clearQueueOnSourceExit: false };
  next.orbs = next.orbs.map(orb => ({ ...orb, trace: { ...orb.trace, fadeSegments: 0 } }));
  return next;
}
export { canonicalPrefs, canonicalPayload, canonicalHash, with116Defaults };
