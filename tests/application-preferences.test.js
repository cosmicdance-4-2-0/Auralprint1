import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { createApplicationPreferences, WAVEFORM_PREFERENCES_KEY } from "../src/js/core/application-preferences.js";
import { preferences, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { encodePresetPayload } from "../src/js/presets/preset-codec.js";

function store(initial = null) {
  let value = initial;
  return { getItem(key) { assert.equal(key, WAVEFORM_PREFERENCES_KEY); return value; },
    setItem(key, next) { assert.equal(key, WAVEFORM_PREFERENCES_KEY); value = next; }, get value() { return value; } };
}
test("AUD-007 application factory default is 8m / Ask, outside scene defaults", () => {
  const app = createApplicationPreferences({storage: () => store()});
  assert.deepEqual(app.initialize(), {selectedProfileId: "8m", aboveProfileBehavior: "ask"});
  assert.equal(Object.hasOwn(CONFIG.defaults, "waveform"), false);
});
for (const id of ["4m", "8m", "15m"]) test(`AUD-007 application ${id} selection survives reload with only two choices persisted`, () => {
  const storage = store(), app = createApplicationPreferences({storage: () => storage});
  app.set({selectedProfileId: id, aboveProfileBehavior: "skip", maxEncodedBytes: Infinity, file: {}});
  assert.deepEqual(createApplicationPreferences({storage: () => storage}).initialize(), {selectedProfileId: id, aboveProfileBehavior: "skip"});
  assert.deepEqual(Object.keys(JSON.parse(storage.value)).sort(), ["aboveProfileBehavior", "selectedProfileId", "version"]);
});
for (const value of ["{", "null", '[]', '{"version":2,"selectedProfileId":"4m"}', '{"version":1,"selectedProfileId":"old","aboveProfileBehavior":"unlimited"}'])
  test(`AUD-007 corrupt/obsolete application preferences fail safely: ${value}`, () => {
    assert.deepEqual(createApplicationPreferences({storage: () => store(value)}).initialize(), {selectedProfileId: "8m", aboveProfileBehavior: "ask"});
  });
test("AUD-007 storage failures preserve in-session selection and notifications", () => {
  const app = createApplicationPreferences({storage() { throw Error("denied"); }}); let calls = 0;
  const unsubscribe = app.subscribe(() => calls++);
  app.set({selectedProfileId: "15m"}); app.set({selectedProfileId: "15m"});
  assert.equal(app.runtime.settings.selectedProfileId, "15m"); assert.equal(calls, 1); unsubscribe();
});
test("AUD-007 edited CONFIG defaults/choices govern independent application runtime", () => {
  const policy = structuredClone(CONFIG.waveform); policy.automaticProfiles.push({id:"custom", approximateMinutes: 10}); policy.defaultProfileId = "custom";
  const app = createApplicationPreferences({policy, storage: () => store()});
  assert.equal(app.initialize().selectedProfileId, "custom");
  assert.equal(app.set({selectedProfileId:"4m"}).selectedProfileId, "4m");
  assert.equal(app.set({selectedProfileId:"retired"}).selectedProfileId, "custom");
});
test("AUD-007 scene reset/resolution/serialization cannot change application selections", () => {
  const app = createApplicationPreferences({storage: () => store()}); app.set({selectedProfileId:"4m", aboveProfileBehavior:"skip"});
  const before = app.runtime.settings;
  replacePreferences(structuredClone(CONFIG.defaults)); resolveSettings(); const payload = encodePresetPayload(preferences);
  assert.equal(app.runtime.settings, before); assert.equal(payload.schema, 14);
  assert.doesNotMatch(JSON.stringify(payload), /selectedProfileId|aboveProfileBehavior|waveform-preferences/);
});
