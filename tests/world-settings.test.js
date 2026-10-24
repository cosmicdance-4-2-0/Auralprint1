import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIG } from "../src/js/core/config.js";
import { normalizeWorldSettings } from "../src/js/core/world-settings.js";
import { normalizeOrbDef, preferences, replacePreferences, resolveSettings, runtime } from "../src/js/core/preferences.js";
import { decodePresetPayload, encodePresetPayload, sanitizePreset } from "../src/js/presets/preset-codec.js";

test("116A: world settings normalize each axis from CONFIG without coercion or runtime inheritance", () => {
  const before = structuredClone(CONFIG);
  assert.ok(Object.isFrozen(CONFIG.defaults.world));
  assert.ok(Object.isFrozen(CONFIG.limits.world.widthUnits));
  for (const invalid of [undefined, null, NaN, Infinity, -Infinity, "1200", {}, []]) {
    assert.deepEqual(normalizeWorldSettings({ widthUnits: invalid, heightUnits: 345.25 }), { widthUnits: 1000, heightUnits: 345.25 });
    assert.deepEqual(normalizeWorldSettings({ widthUnits: 123.5, heightUnits: invalid }), { widthUnits: 123.5, heightUnits: 1000 });
  }
  for (const malformed of [null, undefined, 12, [], "bad"]) assert.deepEqual(normalizeWorldSettings(malformed), CONFIG.defaults.world);
  for (const key of ["widthUnits", "heightUnits"]) {
    const limits = CONFIG.limits.world[key];
    for (const [raw, expected] of [[-1, limits.min], [0, limits.min], [1e20, limits.max], [234.567, 234.567]]) {
      assert.equal(normalizeWorldSettings({ [key]: raw })[key], expected);
    }
  }
  assert.deepEqual(CONFIG, before);
});

test("116A: resolution and codec share world normalization and isolate writable preferences", () => {
  const previous = structuredClone(preferences);
  try {
    for (const world of [undefined, { widthUnits: NaN, heightUnits: 0 }, { widthUnits: 2000.5, heightUnits: 750.25 }]) {
      replacePreferences({ ...structuredClone(CONFIG.defaults), world });
      resolveSettings();
      const expected = normalizeWorldSettings(world);
      assert.deepEqual(runtime.settings.world, expected);
      assert.deepEqual(encodePresetPayload(preferences).prefs.world, expected);
      assert.notEqual(runtime.settings.world, preferences.world);
    }
  } finally { replacePreferences(previous); resolveSettings(); }
});

test("116A: published schema-10 fixture migrates all settings and spacing without mutation", () => {
  const old = JSON.parse(readFileSync(new URL("./fixtures/schema-10-full.json", import.meta.url)));
  const snapshot = structuredClone(old);
  const expected = structuredClone(old);
  expected.world = { widthUnits: 1000, heightUnits: 1000 };
  expected.sceneCamera = structuredClone(CONFIG.defaults.sceneCamera);
  for (const orb of expected.orbs) {
    orb.particles.minPlacementDistanceUnits = orb.particles.minPlacementDistancePx;
    delete orb.particles.minPlacementDistancePx;
  }
  const next = sanitizePreset(decodePresetPayload({ schema: 10, prefs: old }));
  assert.deepEqual(next, expected);
  assert.deepEqual(old, snapshot);
  const encoded = encodePresetPayload(next);
  assert.equal(encoded.schema, 12);
  assert.deepEqual(encoded.prefs, expected);
  assert.deepEqual(sanitizePreset(decodePresetPayload(encoded)), expected);
});

test("116A: schemas 2–10 migrate pixel spacing only, with old global and per-Orb ownership intact", () => {
  for (let schema = 2; schema <= 10; schema++) {
    for (const [raw, expected] of [[0, 0], [2.3, 2.3], [-1, 0], [12, 10], [null, .5], ["2.3", .5], [Infinity, .5], [undefined, .5]]) {
      const particles = { minPlacementDistancePx: raw, minPlacementDistanceUnits: 9, overlapRadiusPx: 4 };
      const input = { world: { widthUnits: 42, heightUnits: 42 }, particles, orbs: [{ id: "A", particles }, { id: "B", particles }] };
      const snapshot = structuredClone(input);
      const next = sanitizePreset({ schema, prefs: input });
      assert.deepEqual(next.world, CONFIG.defaults.world, `world field did not exist in schema ${schema}`);
      for (const orb of next.orbs) {
        assert.equal(orb.particles.minPlacementDistanceUnits, expected, `schema ${schema}, input ${raw}`);
        assert.equal("minPlacementDistancePx" in orb.particles, false);
        assert.equal("overlapRadiusPx" in orb.particles, false);
      }
      assert.notEqual(next.orbs[0].particles, next.orbs[1].particles);
      assert.deepEqual(input, snapshot);
    }
  }
  assert.equal(CONFIG.worldGeometry.legacyWorldUnitsPerCssPixel, 1);
});

test("116A: current world-unit fields never inherit the retired pixel alias", () => {
  for (const [value, expected] of [[0, 0], [2.3, 2.3], [undefined, .5], [NaN, .5]]) {
    const orb = { particles: { minPlacementDistanceUnits: value, minPlacementDistancePx: 8 } };
    assert.equal(normalizeOrbDef(orb, CONFIG.defaults.orbs[0]).particles.minPlacementDistanceUnits, expected);
    const payload = encodePresetPayload({ orbs: [orb], world: { widthUnits: 2400.5, heightUnits: 1600.25, camera: { zoom: 2 }, referenceSpanUnits: 7 } });
    assert.deepEqual(payload.prefs.world, { widthUnits: 2400.5, heightUnits: 1600.25 });
    assert.equal(payload.prefs.orbs[0].particles.minPlacementDistanceUnits, expected);
    assert.equal("minPlacementDistancePx" in payload.prefs.orbs[0].particles, false);
    assert.deepEqual(sanitizePreset(payload), payload.prefs);
  }
});

test("116A: all supported schemas decode; future schemas stay rejected", () => {
  for (let schema = 2; schema <= 12; schema++) assert.equal(decodePresetPayload({ schema, prefs: {} }).ok, true);
  for (const schema of [1, 13, "12", 12.5]) assert.deepEqual(decodePresetPayload({ schema, prefs: {} }), { ok: false, code: "unsupported-schema" });
});
