import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { CONFIG } from '../src/js/core/config.js';
import { normalizeOrbDef, preferences, runtime, replacePreferences, resolveSettings } from '../src/js/core/preferences.js';
import { state } from '../src/js/core/state.js';
import { SCHEMA_13_BASELINE } from '../src/js/presets/schema-13-baseline.js';
import { SCHEMA_16_BASELINE } from '../src/js/presets/schema-16-baseline.js';
import { compactBaseline } from '../src/js/presets/compact-preset.js';
import { encodePresetPayload, decodePresetPayload, sanitizePreset } from '../src/js/presets/preset-codec.js';
import { encodePrefsToHash, encodeShareHash, decodePrefsFromHash, UrlPreset } from '../src/js/presets/url-preset.js';
const wire = prefs => ({schema:16,prefs});
const canonical = payload => {const decoded=decodePresetPayload(payload);assert.equal(decoded.ok,true,decoded.code);return sanitizePreset(decoded);};
const pHash = payload => '#p='+Buffer.from(JSON.stringify(payload)).toString('base64url');
const zHash = payload => '#z='+deflateSync(Buffer.from(JSON.stringify(payload))).toString('base64url');

test('16: distinct frozen defaults omit completely; schema 13 baseline stays unchanged',()=>{
  assert.equal(compactBaseline(13),SCHEMA_13_BASELINE);assert.equal(compactBaseline(16),SCHEMA_16_BASELINE);
  assert.equal(createHash('sha256').update(JSON.stringify(SCHEMA_16_BASELINE)).digest('hex'),'03c5ca187b281f160bc9361944fffb24b4e4a454d464cf50cd1f75d73d43038b');
  assert.ok(Object.isFrozen(SCHEMA_16_BASELINE.orbs[0].trace));
  assert.deepEqual(encodePresetPayload(CONFIG.defaults),wire({}));
  assert.deepEqual(canonical(wire({})),CONFIG.defaults);
  assert.equal(Object.hasOwn(SCHEMA_13_BASELINE.audio,'clearQueueOnSourceExit'),false);
  assert.equal(Object.hasOwn(SCHEMA_13_BASELINE.orbs[0].trace,'fadeSegments'),false);
});
for(const queue of [false,true]) for(const fade of [0,1,20]) for(const mode of ['fixed','lastParticle','dominantBand']) {
  test(`16 round trips Queue ${queue}, fade ${fade}, ${mode} compressed and plain`,async()=>{
    const prefs=structuredClone(CONFIG.defaults);prefs.audio.clearQueueOnSourceExit=queue;
    Object.assign(prefs.orbs[0].trace,{fadeSegments:fade,lineColorMode:mode});
    prefs.orbs[0].id='opaque-宇宙';prefs.orbs[0].bandIds=[143,59,60,61,0,255];prefs.orbs[0].centerXFrac=.123456789012345;
    const before=structuredClone(prefs),payload=encodePresetPayload(prefs);
    assert.deepEqual(canonical(payload),prefs);assert.deepEqual(prefs,before);
    assert.deepEqual(await decodePrefsFromHash(encodePrefsToHash(prefs)),prefs);
    const compressed=await encodeShareHash(prefs);assert.equal(compressed.compressed,true);
    assert.deepEqual(await decodePrefsFromHash(compressed.hash),prefs);
    assert.equal(Object.hasOwn(payload.prefs.orbs[0].trace||{},'fadeSegments'),fade!==0);
  });
}
test('16: finite numeric admission clamps/rounds; malformed wire types reject',()=>{
  assert.deepEqual(CONFIG.limits.trace.fadeSegments,{min:0,max:20,step:1});
  for(const [value,expected] of [[-1,0],[0,0],[1,1],[4.49,4],[4.5,5],[20,20],[21,20],[1e100,20]]) {
    const prefs=canonical(wire({orbs:[{trace:{fadeSegments:value,lineAlpha:.123456789012345}}]}));
    assert.equal(prefs.orbs[0].trace.fadeSegments,expected);assert.equal(prefs.orbs[0].trace.lineAlpha,.123456789012345);
  }
  for(const value of ['5',null,true,[],{},NaN,Infinity]) {
    assert.equal(decodePresetPayload(wire({orbs:[{trace:{fadeSegments:value}}]})).ok,false);
    assert.equal(normalizeOrbDef({trace:{fadeSegments:value}},CONFIG.defaults.orbs[0]).trace.fadeSegments,0);
  }
  for(const prefs of [{audio:{clearQueueOnSourceExit:1}},{orbs:[{trace:{fadeEnabled:false}}]}, {orbs:[{trace:{lengthMode:'angular'}}]}]) assert.equal(decodePresetPayload(wire(prefs)).ok,false);
  assert.equal(canonical(wire({orbs:[{trace:{lineColorMode:'particleBirth'}}]})).orbs[0].trace.lineColorMode,'dominantBand');
});
test('2–13: legacy defaults disable both features and retain their line color semantics',async()=>{
  for(let schema=2;schema<=12;schema++) for(const mode of ['fixed','lastParticle','dominantBand']) {
    const prefs={audio:{clearQueueOnSourceExit:true},trace:{fadeSegments:20,lineColorMode:mode},orbs:[{trace:{fadeSegments:20,lineColorMode:mode}}]};
    const before=structuredClone(prefs),result=canonical({schema,prefs});
    assert.equal(result.audio.clearQueueOnSourceExit,false);assert.equal(result.orbs[0].trace.fadeSegments,0);
    assert.equal(result.orbs[0].trace.lineColorMode,mode);assert.deepEqual(prefs,before);
  }
  for(const hash of [pHash({schema:13,prefs:{}}),zHash({schema:13,prefs:{}})]) assert.deepEqual(await decodePrefsFromHash(hash),CONFIG.defaults);
  for(const prefs of [{audio:{clearQueueOnSourceExit:true}},{orbs:[{trace:{fadeSegments:0}}]}]) assert.equal(decodePresetPayload({schema:13,prefs}).code,'unknown-preset-field');
});
test('16: reserved 14/15, future schemas and malformed imports are atomic in both framings',async()=>{
  const saved={prefs:structuredClone(preferences),location:globalThis.location,camera:structuredClone(state.camera)};
  try {
    const active=structuredClone(CONFIG.defaults);active.audio.clearQueueOnSourceExit=true;active.orbs[0].trace.fadeSegments=20;
    replacePreferences(active);resolveSettings();const settings=runtime.settings,camera=structuredClone(state.camera);
    for(const payload of [{schema:14,prefs:{}},{schema:15,prefs:{}},{schema:17,prefs:{}},wire({orbs:[{trace:{fadeSegments:'5'}}]})]) {
      for(const hash of [pHash(payload),zHash(payload)]) {
        globalThis.location={hash};assert.equal((await UrlPreset.applyFromLocationHashAsync()).ok,false);
        assert.deepEqual(preferences,active);assert.equal(runtime.settings,settings);assert.deepEqual(state.camera,camera);
      }
    }
  } finally {replacePreferences(saved.prefs);resolveSettings();globalThis.location=saved.location;UrlPreset.cancelPendingImport();}
});
test('16: queue contents, permissions and runtime state never export; no second fade switch',()=>{
  const prefs=structuredClone(CONFIG.defaults);prefs.queue={files:[{name:'secret.wav'}],cursor:3};prefs.audio.permissions={microphone:true};prefs.audio.position=12;
  prefs.orbs[0].trace.fadeEnabled=true;prefs.orbs[0].trace.angularTravel=99;
  assert.deepEqual(encodePresetPayload(prefs),wire({}));assert.deepEqual(canonical(wire({orbs:[]})).orbs,[]);
});
test('16: frozen reconstruction survives changed future CONFIG including null legacy Orb fallback',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ap-16-frozen-'));
  try {
    cpSync(new URL('../src',import.meta.url),join(dir,'src'),{recursive:true});writeFileSync(join(dir,'package.json'),'{"type":"module"}');
    const path=join(dir,'src/js/core/config.js');writeFileSync(path,readFileSync(path,'utf8').replace('fadeSegments: 0','fadeSegments: 7').replace('clearQueueOnSourceExit: false','clearQueueOnSourceExit: true').replace('sizeMaxPx: 8','sizeMaxPx: 9'));
    execFileSync(process.execPath,['--input-type=module','-e',`
      import assert from 'node:assert/strict';
      import {SCHEMA_16_BASELINE as frozen} from './src/js/presets/schema-16-baseline.js';
      import {decodePresetPayload,sanitizePreset} from './src/js/presets/preset-codec.js';
      assert.deepEqual(sanitizePreset(decodePresetPayload({schema:16,prefs:{}})),frozen);
      for(let schema=2;schema<=13;schema++) {
        const prefs=schema===13?{}:{orbs:[null]};const result=sanitizePreset(decodePresetPayload({schema,prefs}));
        assert.equal(result.audio.clearQueueOnSourceExit,false);assert.equal(result.orbs[0].trace.fadeSegments,0);
      }
      assert.equal(sanitizePreset(decodePresetPayload({schema:16,prefs:{orbs:[{}]}})).orbs[0].particles.sizeMaxPx,8);
    `],{cwd:dir});
  } finally {rmSync(dir,{recursive:true,force:true});}
});
