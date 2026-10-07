import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";

import { allocateOrbId, createOrb, duplicateOrb, normalizeOrbCollection } from "../src/js/core/orb-collection.js";
import { PRESET_SCHEMA_VERSION } from "../src/js/core/constants.js";
import { preferences, replacePreferences, resolveSettings, runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { decodePresetPayload, encodePresetPayload, sanitizePreset } from "../src/js/presets/preset-codec.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { createRuntimeOrb, duplicateRuntimeOrb, initOrbs } from "../src/js/render/orb-runtime.js";
import { VisualizerRuntime } from "../src/js/render/visualizer-runtime.js";

const HUGE_ID = "ORB9007199254740992";
const HUGE_NEXT = "ORB9007199254740993";
const payload = (ids) => ({ schema: 10, prefs: { orbs: ids.map((id) => ({ id })) } });
const idsOf = (orbs) => orbs.map((orb) => orb.id);

test("RC-01: timeout-protected allocation/import gate and direct huge-ID regressions", async (t) => {
  // Run every dangerous boundary in a killable worker BEFORE direct tests.
  // Restoring the Number allocator fails this gate without entering a hanging
  // synchronous unit test. Do not move huge-ID tests outside this guard.
  const collectionUrl = new URL("../src/js/core/orb-collection.js", import.meta.url).href;
  const codecUrl = new URL("../src/js/presets/preset-codec.js", import.meta.url).href;
  const urlPresetUrl = new URL("../src/js/presets/url-preset.js", import.meta.url).href;
  const preferencesUrl = new URL("../src/js/core/preferences.js", import.meta.url).href;
  const worker = new Worker(new URL("data:text/javascript," + encodeURIComponent(`
    import assert from "node:assert/strict";
    import { parentPort } from "node:worker_threads";
    import { allocateOrbId, createOrb, duplicateOrb } from ${JSON.stringify(collectionUrl)};
    import { decodePresetPayload, sanitizePreset } from ${JSON.stringify(codecUrl)};
    import { UrlPreset } from ${JSON.stringify(urlPresetUrl)};
    import { preferences } from ${JSON.stringify(preferencesUrl)};
    const id = ${JSON.stringify(HUGE_ID)};
    parentPort.postMessage("before allocation");
    assert.equal(allocateOrbId([{ id }]), ${JSON.stringify(HUGE_NEXT)});
    const payload = { schema: 10, prefs: { orbs: [{ id }, { id }] } };
    parentPort.postMessage("before sanitation");
    assert.equal(new Set(sanitizePreset(decodePresetPayload(payload)).orbs.map(o => o.id)).size, 2);
    parentPort.postMessage("before URL import");
    globalThis.location = { hash: "#p=" + Buffer.from(JSON.stringify(payload)).toString("base64url") };
    assert.equal(UrlPreset.applyFromLocationHash(), true);
    parentPort.postMessage("before Add");
    assert.equal(createOrb(preferences.orbs).id, "ORB9007199254740994");
    parentPort.postMessage("before Duplicate");
    assert.equal(duplicateOrb(preferences.orbs, id).id, "ORB9007199254740995");
    assert.equal(new Set(preferences.orbs.map(o => o.id)).size, 4);
    parentPort.postMessage("completed");
  `)));
  let timer;
  let phase = "startup";
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Huge-ID worker timed out after 3000 ms (${phase})`)), 3000);
      worker.on("message", (message) => {
        phase = message;
        if (message === "completed") resolve();
      });
      worker.once("error", reject);
      worker.once("exit", (code) => {
        if (phase !== "completed") reject(new Error(`Huge-ID worker exited ${code} (${phase})`));
      });
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }

  for (const [id, expected] of [
    ["ORB9007199254740990", "ORB9007199254740991"],
    ["ORB9007199254740991", HUGE_ID],
    [HUGE_ID, HUGE_NEXT],
    [HUGE_NEXT, "ORB9007199254740994"],
    ["ORB9999999999999999999999999999999999999999", "ORB10000000000000000000000000000000000000000"],
    // Number would overflow to Infinity here; canonical IDs still stay exact.
    ["ORB" + "9".repeat(400), "ORB1" + "0".repeat(400)],
  ]) {
    await t.test(`exact allocation after ${id.length > 60 ? "a 400-digit suffix" : id}`, () => {
      const orbs = [{ id }, { id: "HISTORICAL-Z" }];
      const snapshot = structuredClone(orbs);
      const allocated = allocateOrbId(orbs);
      assert.equal(typeof allocated, "string");
      assert.match(allocated, /^ORB(?:0|[1-9]\d*)$/);
      assert.equal(allocated, expected);
      assert.ok(!idsOf(orbs).includes(allocated));
      assert.deepEqual(orbs, snapshot);
    });
  }

  await t.test("duplicate huge identities repair deterministically without changing order or stealing explicit IDs", () => {
    assert.deepEqual(idsOf(normalizeOrbCollection([{ id: HUGE_ID }, { id: HUGE_ID }])), [HUGE_ID, HUGE_NEXT]);
    const input = [
      { id: HUGE_ID, chanId: "R" },
      { id: HUGE_ID, chanId: "L" },
      { chanId: "C" },
      { id: HUGE_NEXT, chanId: "R" },
      { id: "HISTORICAL-Z", chanId: "L" },
    ];
    const snapshot = structuredClone(input);
    const repaired = normalizeOrbCollection(input);
    assert.deepEqual(idsOf(repaired), [HUGE_ID, "ORB9007199254740994", "ORB9007199254740995", HUGE_NEXT, "HISTORICAL-Z"]);
    assert.deepEqual(repaired.map((orb) => orb.chanId), input.map((orb) => orb.chanId));
    assert.deepEqual(normalizeOrbCollection(input), repaired);
    assert.deepEqual(normalizeOrbCollection(repaired), repaired);
    assert.deepEqual(input, snapshot);
  });

  await t.test("audited schema-10 payload decodes, sanitizes and re-encodes with string identities", () => {
    const input = payload([HUGE_ID, HUGE_ID]);
    const snapshot = structuredClone(input);
    const decoded = decodePresetPayload(input);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.schema, 10);
    const next = sanitizePreset(decoded);
    assert.deepEqual(idsOf(next.orbs), [HUGE_ID, HUGE_NEXT]);
    assert.deepEqual(encodePresetPayload(next), { schema: 10, prefs: next });
    assert.deepEqual(JSON.parse(JSON.stringify(encodePresetPayload(next))).prefs, next);
    assert.equal(PRESET_SCHEMA_VERSION, 10);
    assert.deepEqual(input, snapshot);
  });

  for (const [name, operation] of [["Add", (orbs) => createOrb(orbs)], ["Duplicate", (orbs) => duplicateOrb(orbs, HUGE_ID)]]) {
    await t.test(`${name} after a single huge-ID import preserves the source and creates a distinct ID`, () => {
      const next = sanitizePreset(decodePresetPayload(payload([HUGE_ID])));
      const source = structuredClone(next.orbs[0]);
      const created = operation(next.orbs);
      assert.equal(created.id, HUGE_NEXT);
      assert.deepEqual(idsOf(next.orbs), [HUGE_ID, HUGE_NEXT]);
      assert.deepEqual(next.orbs[0], source);
    });
  }

  await t.test("real URL decode/sanitize/apply accepts huge IDs and supports runtime Add and Duplicate", () => {
    const oldPrefs = structuredClone(preferences);
    const oldSettings = runtime.settings;
    const oldOrbs = [...state.orbs];
    const oldLocation = globalThis.location;
    const oldHistory = globalThis.history;
    const location = { pathname: "/auralprint.html", search: "?rc01=1", hash: "" };
    globalThis.location = location;
    globalThis.history = { replaceState(_state, _title, url) { location.hash = url.slice(url.indexOf("#")); } };
    try {
      for (const ids of [[HUGE_ID], [HUGE_ID, HUGE_ID]]) {
        // Use the raw supported transport, avoiding encode-time pre-sanitation.
        location.hash = "#p=" + Buffer.from(JSON.stringify(payload(ids)), "utf8").toString("base64url");
        assert.equal(UrlPreset.applyFromLocationHash(), true);
        assert.deepEqual(idsOf(preferences.orbs), ids.length === 1 ? [HUGE_ID] : [HUGE_ID, HUGE_NEXT]);
        resolveSettings();
        initOrbs();
        const source = state.orbs[0];
        source.angleRad = 1.25;
        const added = createRuntimeOrb();
        const duplicated = duplicateRuntimeOrb(HUGE_ID);
        assert.match(added.id, /^ORB[1-9]\d*$/);
        assert.match(duplicated.id, /^ORB[1-9]\d*$/);
        assert.equal(new Set(idsOf(preferences.orbs)).size, ids.length + 2);
        assert.equal(state.orbs[0], source);
        assert.equal(source.id, HUGE_ID);
        assert.equal(source.angleRad, 1.25);
        assert.deepEqual(idsOf(runtime.settings.orbs), idsOf(preferences.orbs));
        assert.deepEqual(idsOf(state.orbs), idsOf(preferences.orbs));
        const expected = structuredClone(preferences);
        UrlPreset.writeHashFromPrefs();
        assert.match(location.hash, /^#p=[A-Za-z0-9_-]+$/);
        const encoded = JSON.parse(Buffer.from(location.hash.slice(3), "base64url").toString("utf8"));
        assert.deepEqual(encoded, { schema: 10, prefs: expected });
        assert.equal(UrlPreset.applyFromLocationHash(), true);
        assert.deepEqual(preferences, expected);
      }
    } finally {
      VisualizerRuntime.dispose();
      replacePreferences(oldPrefs);
      runtime.settings = oldSettings;
      state.orbs.length = 0;
      state.orbs.push(...oldOrbs);
      VisualizerRuntime.rebuild(state.orbs);
      globalThis.location = oldLocation;
      globalThis.history = oldHistory;
    }
  });
});
