import { canonicalPrefs, canonicalPayload } from "./helpers/preset-semantics.js";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createOrb, duplicateOrb, normalizeOrbCollection } from "../src/js/core/orb-collection.js";
import { CONFIG } from "../src/js/core/config.js";
import { PRESET_SCHEMA_VERSION } from "../src/js/core/constants.js";
import { preferences, replacePreferences, resolveSettings, runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { decodePresetPayload, encodePresetPayload, sanitizePreset } from "../src/js/presets/preset-codec.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";
import { createRuntimeOrb, duplicateRuntimeOrb, initOrbs } from "../src/js/render/orb-runtime.js";
import { VisualizerRuntime } from "../src/js/render/visualizer-runtime.js";

const HUGE_ID = "ORB9007199254740992";
const OTHER_HUGE_ID = "ORB9007199254740993";
const payload = (ids) => ({ schema: 11, prefs: { orbs: ids.map((id) => ({ id })) } });
const idsOf = (orbs) => orbs.map((orb) => orb.id);

test("RC-01 / AUD116-001: bounded allocation/import gate and huge-ID ownership regressions", async (t) => {
  // Dangerous inputs stay in a separate heap-limited process. Both a completed
  // sentinel and clean exit are required before running direct integration tests.
  const child = spawn(process.execPath, [
    "--max-old-space-size=192",
    fileURLToPath(new URL("../scripts/test-support/orb-id-boundary.mjs", import.meta.url)),
  ], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let phase = "startup", completed = null, output = "", timedOut = false;
  const timeoutMs = 30_000;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
      output = (output + chunk.toString()).slice(-16_384);
    });
    child.on("message", message => {
      if (message.phase) phase = message.phase;
      if (message.completed === true) completed = message;
    });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`Orb identity child timed out after ${timeoutMs} ms (${phase})`));
      else if (code !== 0 || signal || !completed) reject(new Error(`Orb identity child did not complete: exit=${code}, signal=${signal}, phase=${phase}\n${output}`));
      else resolve();
    });
  });
  assert.equal(completed.count, CONFIG.limits.orbs.maxCount);
  assert.ok(completed.cases >= 15);
  t.diagnostic(JSON.stringify(completed));

  // Exact numeric successors were superseded by the owner-approved opaque-ID
  // contract. The child retains all former unsafe-Number/overflow boundaries and
  // adds the 20,000-digit amplification case, preserving identity and termination.
  await t.test("duplicate huge identities repair deterministically without changing order or stealing explicit IDs", () => {
    assert.deepEqual(idsOf(normalizeOrbCollection([{ id: HUGE_ID }, { id: HUGE_ID }])), [HUGE_ID, "orb-0"]);
    const input = [
      { id: HUGE_ID, chanId: "R" },
      { id: HUGE_ID, chanId: "L" },
      { chanId: "C" },
      { id: OTHER_HUGE_ID, chanId: "R" },
      { id: "HISTORICAL-Z", chanId: "L" },
    ];
    const snapshot = structuredClone(input);
    const repaired = normalizeOrbCollection(input);
    assert.deepEqual(idsOf(repaired), [HUGE_ID, "orb-0", "orb-1", OTHER_HUGE_ID, "HISTORICAL-Z"]);
    assert.deepEqual(repaired.map((orb) => orb.chanId), input.map((orb) => orb.chanId));
    assert.deepEqual(normalizeOrbCollection(input), repaired);
    assert.deepEqual(normalizeOrbCollection(repaired), repaired);
    assert.deepEqual(input, snapshot);
  });

  await t.test("historical schema-11 payload decodes, sanitizes and re-encodes with string identities", () => {
    const input = payload([HUGE_ID, HUGE_ID]);
    const snapshot = structuredClone(input);
    const decoded = decodePresetPayload(input);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.schema, 11);
    const next = sanitizePreset(decoded);
    assert.deepEqual(idsOf(next.orbs), [HUGE_ID, "orb-0"]);
    assert.deepEqual(canonicalPayload(encodePresetPayload(next)), { schema: 16, prefs: next });
    assert.deepEqual(canonicalPrefs(JSON.parse(JSON.stringify(encodePresetPayload(next)))), next);
    assert.equal(PRESET_SCHEMA_VERSION, 16);
    assert.deepEqual(input, snapshot);
  });

  for (const [name, operation] of [["Add", (orbs) => createOrb(orbs)], ["Duplicate", (orbs) => duplicateOrb(orbs, HUGE_ID)]]) {
    await t.test(`${name} after a single huge-ID import preserves the source and creates a distinct ID`, () => {
      const next = sanitizePreset(decodePresetPayload(payload([HUGE_ID])));
      const source = structuredClone(next.orbs[0]);
      const created = operation(next.orbs);
      assert.equal(created.id, "orb-0");
      assert.deepEqual(idsOf(next.orbs), [HUGE_ID, "orb-0"]);
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
        assert.deepEqual(idsOf(preferences.orbs), ids.length === 1 ? [HUGE_ID] : [HUGE_ID, "orb-0"]);
        resolveSettings();
        initOrbs();
        const source = state.orbs[0];
        source.angleRad = 1.25;
        const added = createRuntimeOrb();
        const duplicated = duplicateRuntimeOrb(HUGE_ID);
        assert.match(added.id, /^orb-[0-9a-z]+$/);
        assert.match(duplicated.id, /^orb-[0-9a-z]+$/);
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
        assert.deepEqual(canonicalPayload(encoded), { schema: 16, prefs: expected });
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
