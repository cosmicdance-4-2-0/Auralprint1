import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const repoRoot = process.env.AUDIT_REPO_ROOT || process.cwd();
const source = (relative) => import(pathToFileURL(resolve(repoRoot, relative)).href);
const { CONFIG } = await source('src/js/core/config.js');
const { allocateOrbId, normalizeOrbCollection } = await source('src/js/core/orb-collection.js');
const { encodePresetPayload, decodePresetPayload, sanitizePreset } = await source('src/js/presets/preset-codec.js');
const { UrlPreset } = await source('src/js/presets/url-preset.js');
const { preferences, resolveSettings } = await source('src/js/core/preferences.js');
const { selectOrbAnalysis } = await source('src/js/render/visualizer-runtime.js');
const { Orb } = await source('src/js/render/orb.js');
const { state } = await source('src/js/core/state.js');
const { BandBank } = await source('src/js/audio/band-bank.js');

const log = (label, value) => console.log(label + ': ' + JSON.stringify(value));
const hashFor = (prefs) => '#p=' + Buffer.from(JSON.stringify({ schema: 10, prefs })).toString('base64url');
globalThis.location = { hash: '' };
function importPrefs(prefs) {
  location.hash = hashFor(prefs);
  const ok = UrlPreset.applyFromLocationHash();
  return { ok, orbs: preferences.orbs.map(({ id, chanId, bandIds }) => ({ id, chanId, bandIds })) };
}

const ordinaryAllocated = allocateOrbId([{ id: 'ORB42' }]);
assert.equal(ordinaryAllocated, 'ORB43');
log('normal ID allocation', ordinaryAllocated);
const hugeImported = importPrefs({ orbs: [{ id: 'ORB9007199254740992' }] });
assert.equal(hugeImported.ok, true);
assert.equal(hugeImported.orbs[0].id, 'ORB9007199254740992');
log('huge ID single-Orb URL import', hugeImported);

const identityInput = [{ chanId: 'R' }, { id: 'ORB0', chanId: 'C' }];
const collectionNormalized = normalizeOrbCollection(identityInput).map(({id,chanId})=>({id,chanId}));
assert.deepEqual(collectionNormalized, [{ id: 'ORB1', chanId: 'R' }, { id: 'ORB0', chanId: 'C' }]);
log('direct collection normalization reserves valid future IDs', collectionNormalized);
const identityImported = importPrefs({ orbs: identityInput });
assert.equal(identityImported.ok, true);
assert.equal(identityImported.orbs[1].id, 'ORB1');
assert.equal(identityImported.orbs[1].chanId, 'C');
log('same input through URL preset renumbers the valid Orb', identityImported);

const invalidBands = [null, false, '', [], true];
const importedBands = importPrefs({ orbs: [{ id: 'X', bandIds: invalidBands }] });
assert.equal(importedBands.ok, true);
assert.deepEqual(importedBands.orbs[0].bandIds, [0,1]);
log('malformed band IDs through URL transport', { input: invalidBands, ...importedBands });
const frame = {
  channels: Object.fromEntries(['L','R','C'].map(c=>[c,{energy01:0.9,bandEnergies01:[0,0,...Array(254).fill(0.9)]}])),
};
const selection = selectOrbAnalysis(preferences.orbs[0],frame);
assert.equal(selection.energyOverride01, 0);
log('resulting target response instead of full-channel response', { sanitizedBandIds: preferences.orbs[0].bandIds, channelEnergy01: frame.channels.C.energy01, energyOverride01: selection.energyOverride01, selectedDominantBandIndex: selection.selectedDominantBandIndex });
state.widthPx = state.heightPx = 1000;
const malformedTargetOrb = new Orb(preferences.orbs[0]);
malformedTargetOrb.step(1/60, 1, selection.band, selection.energyOverride01, 0);
const fullBandOrb = new Orb({ ...preferences.orbs[0], bandIds: [] });
const fullSelection = selectOrbAnalysis(fullBandOrb,frame);
fullBandOrb.step(1/60, 1, fullSelection.band, fullSelection.energyOverride01, 0);
assert.equal(malformedTargetOrb.baseRadiusPx, 10);
assert.equal(fullBandOrb.baseRadiusPx, 721);
log('actual Orb.step radius consequence at 1000px', { malformedTargetRadius:malformedTargetOrb.baseRadiusPx, emptySelectionRadius:fullBandOrb.baseRadiusPx });

const analyserBand = { analyser: {minDecibels:-100,maxDecibels:0}, freqDb:new Float32Array(4096).fill(-100) };
analyserBand.freqDb[Math.round(1000 / 24000 * (analyserBand.freqDb.length - 1))] = 0;
function analyzeAtCount(count) {
  const imported = importPrefs({bands:{count},orbs:[]});
  assert.equal(imported.ok, true);
  resolveSettings();
  BandBank.rebuild(22500,48000);
  BandBank.computeEnergiesFromAnalyser(analyserBand,48000,state.bands.energies01);
  return { count:preferences.bands.count, ranges:state.bands.lowHz.map((lo,i)=>[lo,state.bands.highHz[i]===Infinity?'Infinity':state.bands.highHz[i]]), energies:state.bands.energies01 };
}
const count2 = analyzeAtCount(2), count3 = analyzeAtCount(3);
assert.deepEqual(count2.energies,[0,0]);
assert.ok(count3.energies.some(energy=>energy>0));
log('two-band preset loses 1 kHz spectral input',count2);
log('three-band control represents 1 kHz input',count3);

const encoded = encodePresetPayload(structuredClone(CONFIG.defaults));
log('canonical default encode-decode-sanitize stable', JSON.stringify(sanitizePreset(decodePresetPayload(encoded))) === JSON.stringify(encoded.prefs));
assert.deepEqual(sanitizePreset(decodePresetPayload(encoded)), encoded.prefs);
for (const schema of [2,3,4,5,6,7,8,9,10,11]) {
  const supported = decodePresetPayload({schema,prefs:{}}).ok;
  assert.equal(supported, schema <= 10);
  log('schema boundary '+schema, supported);
}
console.log('PASS: all non-hanging observations asserted against actual implementation');
