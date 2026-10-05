import test from "node:test";
import assert from "node:assert/strict";

import { BandBankController } from "../src/js/audio/band-bank-controller.js";
import { CONFIG } from "../src/js/core/config.js";
import { PRESET_SCHEMA_VERSION } from "../src/js/core/constants.js";
import { preferences, replacePreferences, resolveSettings, runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";

function presetHash(prefs) {
  const json = JSON.stringify({ schema: PRESET_SCHEMA_VERSION, prefs });
  return `#p=${Buffer.from(json, "utf8").toString("base64url")}`;
}

function applyLiveBandDefinition() {
  const previousKey = BandBankController.readBandDefKey(runtime.settings);
  resolveSettings();
  BandBankController.syncFromSettings();
  const changed = BandBankController.readBandDefKey(runtime.settings) !== previousKey;
  if (changed) BandBankController.rebuildNow();
  return changed;
}

function withLocationHash(hash, callback) {
  const previousLocation = globalThis.location;
  globalThis.location = { pathname: "/", search: "", hash };
  try {
    return callback();
  } finally {
    globalThis.location = previousLocation;
  }
}

test("live URL preset preserves the old runtime band definition until the canonical apply rebuilds BandBank", () => {
  const previousPrefs = structuredClone(preferences);
  try {
    const definitionA = structuredClone(CONFIG.defaults);
    definitionA.bands.floorHz = 24;
    definitionA.bands.ceilingHz = 16000;
    definitionA.bands.distributionMode = "linear";
    replacePreferences(definitionA);
    resolveSettings();
    BandBankController.syncFromSettings();
    BandBankController.rebuildNow();

    const oldRuntimeBandDefKey = BandBankController.readBandDefKey(runtime.settings);
    const oldLowHzReference = state.bands.lowHz;
    const oldHighHzReference = state.bands.highHz;

    const definitionB = structuredClone(CONFIG.defaults);
    definitionB.bands.floorHz = 55;
    definitionB.bands.ceilingHz = 19500;
    definitionB.bands.distributionMode = "bark";

    withLocationHash(presetHash(definitionB), () => {
      assert.equal(UrlPreset.applyFromLocationHash(), true);
    });

    assert.deepEqual(
      {
        floorHz: preferences.bands.floorHz,
        ceilingHz: preferences.bands.ceilingHz,
        distributionMode: preferences.bands.distributionMode,
      },
      { floorHz: 55, ceilingHz: 19500, distributionMode: "bark" },
    );
    assert.deepEqual(
      {
        floorHz: runtime.settings.bands.floorHz,
        ceilingHz: runtime.settings.bands.ceilingHz,
        distributionMode: runtime.settings.bands.distributionMode,
      },
      { floorHz: 24, ceilingHz: 16000, distributionMode: "linear" },
    );
    assert.equal(BandBankController.readBandDefKey(runtime.settings), oldRuntimeBandDefKey);

    assert.equal(applyLiveBandDefinition(), true);
    assert.notEqual(BandBankController.readBandDefKey(runtime.settings), oldRuntimeBandDefKey);
    assert.notEqual(state.bands.lowHz, oldLowHzReference);
    assert.notEqual(state.bands.highHz, oldHighHzReference);
    assert.equal(state.bands.highHz[0], 55);
    assert.equal(state.bands.lowHz.at(-1), 19500);
    assert.equal(state.bands.meta.configCeilingHz, 19500);
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    BandBankController.syncFromSettings();
    BandBankController.rebuildNow();
  }
});

test("live URL preset with an unchanged band definition avoids a BandBank rebuild", () => {
  const previousPrefs = structuredClone(preferences);
  try {
    const definition = structuredClone(CONFIG.defaults);
    definition.bands.floorHz = 35;
    definition.bands.ceilingHz = 17500;
    definition.bands.distributionMode = "erb";
    replacePreferences(definition);
    resolveSettings();
    BandBankController.syncFromSettings();
    BandBankController.rebuildNow();
    const lowHzReference = state.bands.lowHz;
    const highHzReference = state.bands.highHz;

    const sameDefinitionPreset = structuredClone(definition);
    sameDefinitionPreset.visuals.backgroundColor = "#123456";
    withLocationHash(presetHash(sameDefinitionPreset), () => {
      assert.equal(UrlPreset.applyFromLocationHash(), true);
    });

    assert.equal(applyLiveBandDefinition(), false);
    assert.equal(state.bands.lowHz, lowHzReference);
    assert.equal(state.bands.highHz, highHzReference);
    assert.equal(runtime.settings.visuals.backgroundColor, "#123456");
  } finally {
    replacePreferences(previousPrefs);
    resolveSettings();
    BandBankController.syncFromSettings();
    BandBankController.rebuildNow();
  }
});
