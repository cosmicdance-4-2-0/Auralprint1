import { canonicalPrefs } from "./helpers/preset-semantics.js";
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePreset, encodePresetPayload, decodePresetPayload } from "../src/js/presets/preset-codec.js";
import { preferences, replacePreferences } from "../src/js/core/preferences.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { createOrb, duplicateOrb } from "../src/js/core/orb-collection.js";

test("RC-09: URL import reserves later explicit identity before missing-ID fallback and sharing", () => {
  const previous = structuredClone(preferences);
  const previousLocation = globalThis.location;
  try {
    const input = [{ chanId: "R" }, { id: "orb-0", chanId: "C" }];
    globalThis.location = { hash: "#p=" + Buffer.from(JSON.stringify({ schema: 10, prefs: { orbs: input } })).toString("base64url") };
    assert.equal(UrlPreset.applyFromLocationHash(), true);
    assert.deepEqual(preferences.orbs.map(({ id, chanId }) => ({ id, chanId })), [{ id: "orb-1", chanId: "R" }, { id: "orb-0", chanId: "C" }]);
    assert.deepEqual(canonicalPrefs(encodePresetPayload(preferences)).orbs, preferences.orbs);
  } finally { replacePreferences(previous); globalThis.location = previousLocation; }
});

for (const schema of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16]) {
  test(`RC-09: schema ${schema} repair preserves explicit identity, configuration and stable sharing`, () => {
    const identities = ["ORB0", "ORB1", "ORB", "spectral-ring", "HISTORICAL-Z", "宇宙-🎵", "ORB1e30", "ORB00042", "ORB9007199254740992", "ORB" + "9".repeat(400), "orb-0", "orb-2"];
    // Compact formats reject null records; retain legacy null repair coverage.
    const input = [schema < 13 ? null : {}, {}, ...identities.map(id => ({ id, chanId: "R", hueOffsetDeg: 37 })), { id: "ORB0", chanId: "L" }, { id: " bad " }];
    const before = structuredClone(input);
    const decoded = decodePresetPayload({ schema, prefs: { orbs: input } });
    assert.equal(decoded.ok, true, decoded.code);
    const prefs = sanitizePreset(decoded);
    assert.deepEqual(input, before);
    assert.equal(new Set(prefs.orbs.map(orb => orb.id)).size, input.length);
    for (let i = 0; i < identities.length; i++) {
      const orb = prefs.orbs[i + 2];
      assert.equal(orb.id, identities[i]);
      assert.equal(orb.chanId, "R");
      assert.equal(orb.hueOffsetDeg, 37);
    }
    assert.equal(prefs.orbs.at(-2).chanId, "L");
    assert.notEqual(prefs.orbs.at(-2).id, "ORB0");
    for (const index of [0, 1, input.length - 2, input.length - 1]) {
      assert.match(prefs.orbs[index].id, /^orb-[0-9a-z]+$/);
      assert.ok(!identities.includes(prefs.orbs[index].id));
      assert.ok(prefs.orbs[index].id.length <= 5);
    }
    assert.deepEqual(sanitizePreset(decoded), prefs);
    assert.deepEqual(canonicalPrefs(encodePresetPayload(prefs)), prefs);
    const originalIds = prefs.orbs.map(orb => orb.id);
    const added = createOrb(prefs.orbs);
    const duplicate = duplicateOrb(prefs.orbs, "ORB0");
    assert.ok(added && duplicate);
    assert.deepEqual(prefs.orbs.filter(orb => originalIds.includes(orb.id)).map(orb => orb.id), originalIds);
    assert.equal(new Set(prefs.orbs.map(orb => orb.id)).size, prefs.orbs.length);
    assert.deepEqual(canonicalPrefs(encodePresetPayload(prefs)), prefs);
  });
}
