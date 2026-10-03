import test from "node:test";
import assert from "node:assert/strict";
import { BAND_NAMES } from "../src/js/core/preferences.js";
import { parseBandSelection, bandRangeSelection, matchingBandIndices } from "../src/js/ui/orb-band-picker.js";

test("exact targeting preserves sparse selections and explicitly treats empty input as full spectrum", () => {
  assert.deepEqual(parseBandSelection("3, 7; 7 12").ids, [3, 7, 12]);
  assert.deepEqual(parseBandSelection("  ").ids, []);
  for (const invalid of ["-1", "1.5", "1,nope,2", String(BAND_NAMES.length), "1e2", ",,,"]) {
    assert.equal(parseBandSelection(invalid).ids, null, invalid);
    assert.ok(parseBandSelection(invalid).error);
  }
});

test("range selection validates both bounds without silently clamping or reversing intent", () => {
  assert.deepEqual(bandRangeSelection("12", "15"), [12, 13, 14, 15]);
  assert.deepEqual(bandRangeSelection("0", "0"), [0]);
  assert.equal(bandRangeSelection("0", String(BAND_NAMES.length - 1)).length, BAND_NAMES.length);
  for (const pair of [["", "3"], ["3", ""], ["4", "2"], ["-1", "3"], ["2.5", "3"], ["0", String(BAND_NAMES.length)]]) {
    assert.equal(bandRangeSelection(...pair), null);
  }
});

test("search finds configured names, repeated names, indices, and empty results without changing selection", () => {
  assert.equal(matchingBandIndices("  ").length, BAND_NAMES.length);
  assert.ok(matchingBandIndices("eTeRnAl CoRe").includes(BAND_NAMES.indexOf("Eternal Core")));
  assert.ok(matchingBandIndices("255").includes(255));
  const repeated = BAND_NAMES.map((name, i) => name === "Lunar Reflection" ? i : -1).filter(i => i >= 0);
  assert.deepEqual(matchingBandIndices("Lunar Reflection"), repeated);
  assert.deepEqual(matchingBandIndices("no such band"), []);
});
