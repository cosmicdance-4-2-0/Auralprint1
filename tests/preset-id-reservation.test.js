import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePreset, encodePresetPayload } from "../src/js/presets/preset-codec.js";
import { preferences, replacePreferences } from "../src/js/core/preferences.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { createOrb, duplicateOrb } from "../src/js/core/orb-collection.js";

test("RC-09: URL import reserves later explicit identity before missing-ID fallback and sharing", () => {
  const previous = structuredClone(preferences);
  const previousLocation = globalThis.location;
  try {
    const input = [{ chanId: "R" }, { id: "ORB0", chanId: "C" }];
    globalThis.location = { hash: "#p=" + Buffer.from(JSON.stringify({ schema: 10, prefs: { orbs: input } })).toString("base64url") };
    assert.equal(UrlPreset.applyFromLocationHash(), true);
    assert.deepEqual(preferences.orbs.map(({ id, chanId }) => ({ id, chanId })), [{ id: "ORB1", chanId: "R" }, { id: "ORB0", chanId: "C" }]);
    assert.deepEqual(encodePresetPayload(preferences).prefs.orbs, preferences.orbs);
  } finally { replacePreferences(previous); globalThis.location = previousLocation; }
});

test("RC-09: collection owns missing/duplicate repair while valid opaque identities retain configuration", () => {
  const identities = ["ORB0", "ORB", "spectral-ring", "HISTORICAL-Z", "宇宙-🎵", "ORB1e30", "ORB00042", "ORB9007199254740992"];
  for (const schema of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const input = [null, {}, ...identities.map(id => ({ id, chanId: "R", hueOffsetDeg: 37 })), { id: "ORB0", chanId: "L" }, { id: " bad " }];
    const before = structuredClone(input);
    const prefs = sanitizePreset({ schema, prefs: { orbs: input } });
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
    assert.equal(prefs.orbs[0].id, "ORB9007199254740993");
    assert.deepEqual(encodePresetPayload(prefs).prefs.orbs, prefs.orbs);
    const originalIds = prefs.orbs.map(orb => orb.id);
    const added = createOrb(prefs.orbs);
    const duplicate = duplicateOrb(prefs.orbs, "ORB0");
    assert.ok(added && duplicate);
    for (const id of originalIds) assert.ok(prefs.orbs.some(orb => orb.id === id));
    assert.equal(new Set(prefs.orbs.map(orb => orb.id)).size, prefs.orbs.length);
  }
});
