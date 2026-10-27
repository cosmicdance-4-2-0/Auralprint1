import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { CONFIG } from '../src/js/core/config.js';
import { PRESET_SCHEMA_VERSION, LEGACY_SCHEMA_V14 } from '../src/js/core/constants.js';
import { normalizeOrbDef, preferences, replacePreferences, resolveSettings, runtime } from '../src/js/core/preferences.js';
import { SCHEMA_13_BASELINE } from '../src/js/presets/schema-13-baseline.js';
import { SCHEMA_14_BASELINE } from '../src/js/presets/schema-14-baseline.js';
import { SCHEMA_15_BASELINE } from '../src/js/presets/schema-15-baseline.js';
import { compactBaseline, compactPreferences } from '../src/js/presets/compact-preset.js';
import { encodePresetPayload, decodePresetPayload, sanitizePreset } from '../src/js/presets/preset-codec.js';
import { encodePrefsToHash, encodeShareHash, decodePrefsFromHash, UrlPreset } from '../src/js/presets/url-preset.js';

const canonical = payload => { const decoded=decodePresetPayload(payload); assert.equal(decoded.ok,true,decoded.code); return sanitizePreset(decoded); };
const hash = (payload,compressed=false) => {
  const bytes=Buffer.from(JSON.stringify(payload));
  return (compressed?'#z=':'#p=')+(compressed?deflateSync(bytes):bytes).toString('base64url');
};
const migrated = baseline => {
  const prefs=structuredClone(baseline);
  for(const orb of prefs.orbs) Object.assign(orb.trace,{lengthMode:'count',angularSpanDeg:360});
  return prefs;
};

test('15 owns a distinct frozen baseline and emits no default delta',()=>{
  assert.equal(PRESET_SCHEMA_VERSION,15);assert.equal(LEGACY_SCHEMA_V14,14);
  assert.equal(compactBaseline(13),SCHEMA_13_BASELINE);assert.equal(compactBaseline(14),SCHEMA_14_BASELINE);
  assert.equal(compactBaseline(15),SCHEMA_15_BASELINE);assert.ok(Object.isFrozen(SCHEMA_15_BASELINE.orbs[0].trace));
  assert.deepEqual(SCHEMA_15_BASELINE,CONFIG.defaults);
  assert.equal(createHash("sha256").update(JSON.stringify(SCHEMA_15_BASELINE)).digest("hex"),"e14842435f365e9c403eeacc093b094e6d3e436ab1fce938d505024bd39121e1");
  assert.deepEqual(encodePresetPayload(CONFIG.defaults),{schema:15,prefs:{}});
  assert.deepEqual(canonical({schema:15,prefs:{}}),CONFIG.defaults);
  assert.equal(Object.hasOwn(SCHEMA_14_BASELINE.orbs[0].trace,'lengthMode'),false);
  assert.equal(Object.hasOwn(SCHEMA_13_BASELINE.orbs[0].trace,'angularSpanDeg'),false);
  assert.equal(createHash('sha256').update(JSON.stringify(SCHEMA_14_BASELINE)).digest('hex'),'db50724e0ea914f2b730e61d5d9e4f216de00f7a72c32ef588c8f9eb1f0f7796');
});

test('15 round-trips angular lengths and all 116F effects in both transports',async()=>{
  for(const span of [1,180,360,1080,3600,359.1234567890123]) for(const mode of ['fixed','lastParticle','dominantBand','particleBirth']) {
    const prefs=structuredClone(CONFIG.defaults);
    prefs.audio.clearQueueOnSourceExit=true;
    Object.assign(prefs.orbs[0].trace,{lengthMode:'angular',angularSpanDeg:span,fadeEnabled:true,fadeSegments:5,lineColorMode:mode});
    prefs.orbs[0].motion.angularSpeedRadPerSec=.123456789012345;
    prefs.orbs[0].startAngleRad=.987654321098765;
    const before=structuredClone(prefs),wire=encodePresetPayload(prefs);
    assert.deepEqual(wire.prefs.orbs[0].trace,{...(mode==='dominantBand'?{}:{lineColorMode:mode}),fadeEnabled:true,lengthMode:'angular',...(span===360?{}:{angularSpanDeg:span})});
    // The unchanged dominant mode is omitted against the frozen baseline.
    if(mode==='dominantBand') assert.equal(Object.hasOwn(wire.prefs.orbs[0].trace,'lineColorMode'),false);
    assert.deepEqual(canonical(wire),prefs);assert.deepEqual(prefs,before);
    assert.deepEqual(await decodePrefsFromHash(encodePrefsToHash(prefs)),prefs);
    const compressed=await encodeShareHash(prefs);assert.equal(compressed.compressed,true);
    assert.deepEqual(await decodePrefsFromHash(compressed.hash),prefs);
  }
});

test('15 persists the selected span independently from mode and keeps the existing segment cap',()=>{
  const prefs=structuredClone(CONFIG.defaults);
  prefs.orbs[0].trace.angularSpanDeg=180;
  let wire=encodePresetPayload(prefs);
  assert.deepEqual(wire.prefs.orbs,[{id:'ORB0',trace:{angularSpanDeg:180}},{id:'ORB1'}]);
  assert.equal(canonical(wire).orbs[0].trace.lengthMode,'count');
  prefs.orbs[0].trace.angularSpanDeg=360;prefs.orbs[0].trace.lengthMode='angular';
  wire=encodePresetPayload(prefs);
  assert.deepEqual(wire.prefs.orbs,[{id:'ORB0',trace:{lengthMode:'angular'}},{id:'ORB1'}]);
  assert.equal(canonical(wire).orbs[0].trace.numLines,CONFIG.defaults.orbs[0].trace.numLines);
  assert.deepEqual(Object.keys(canonical(wire).orbs[0].trace).filter(key=>/numLines|[mM]ax.*[lL]ine/.test(key)),['numLines']);
});

test('15 angular normalization follows CONFIG bounds and preserves canonical precision',()=>{
  assert.deepEqual(CONFIG.limits.trace.angularSpanDeg,{min:1,max:3600,step:1});
  assert.deepEqual(CONFIG.limits.trace.lengthModes,['count','angular']);
  for(const [raw,value] of [[-1,1],[0,1],[180,180],[3600,3600],[3601,3600],[123.456789012345,123.456789012345]]) {
    const prefs=canonical({schema:15,prefs:{orbs:[{id:'X',trace:{lengthMode:'angular',angularSpanDeg:raw,lineAlpha:.123456789012345}}]}});
    assert.equal(prefs.orbs[0].trace.angularSpanDeg,value);assert.equal(prefs.orbs[0].trace.lengthMode,'angular');
    assert.equal(prefs.orbs[0].trace.lineAlpha,.123456789012345);
  }
  for(const invalid of [undefined,null,NaN,Infinity,'180']) {
    const orb=normalizeOrbDef({trace:{angularSpanDeg:invalid,lengthMode:'unknown'}},CONFIG.defaults.orbs[0]);
    assert.equal(orb.trace.lengthMode,'count');assert.equal(orb.trace.angularSpanDeg,360);
  }
  assert.equal(canonical({schema:15,prefs:{orbs:[{trace:{lengthMode:'future'}}]}}).orbs[0].trace.lengthMode,'count');
});

test('Schema 14 Queue, Fade, Birth Color and all canonical Scene fields survive in both transports',async()=>{
  const prefs=structuredClone(SCHEMA_14_BASELINE);
  prefs.audio.clearQueueOnSourceExit=true;prefs.audio.volume=.123456789012345;
  prefs.sceneCamera={x:123.456,y:-789.123,zoom:2.345,rotationRad:1.234};prefs.world={widthUnits:1234.5,heightUnits:6789.125};
  prefs.orbs.reverse();prefs.orbs[0].id='opaque-宇宙';prefs.orbs[0].bandIds=[255,143,59,60,61,0];
  Object.assign(prefs.orbs[0].trace,{numLines:777,fadeEnabled:true,fadeSegments:37,lineColorMode:'particleBirth'});
  prefs.orbs[0].startAngleRad=.123456789012345;
  const wire={schema:14,prefs:compactPreferences(prefs,14)},expected=migrated(prefs),before=structuredClone(wire);
  assert.deepEqual(canonical(wire),expected);
  for(const compressed of [false,true]) assert.deepEqual(await decodePrefsFromHash(hash(wire,compressed)),expected);
  assert.deepEqual(wire,before);
  for(const schema of [13,14]) for(const field of ['lengthMode','angularSpanDeg']) {
    assert.equal(decodePresetPayload({schema,prefs:{orbs:[{trace:{[field]:field==='lengthMode'?'angular':180}}]}}).code,'unknown-preset-field');
  }
  for(let schema=2;schema<=12;schema++) {
    const old=canonical({schema,prefs:{trace:{lengthMode:'angular',angularSpanDeg:180},orbs:[{trace:{lengthMode:'angular',angularSpanDeg:180}}]}});
    assert.equal(old.orbs[0].trace.lengthMode,'count');assert.equal(old.orbs[0].trace.angularSpanDeg,360);
  }
});

test('15 malformed angular payloads reject atomically and runtime metadata never exports',async()=>{
  const saved={prefs:structuredClone(preferences),location:globalThis.location};
  try {
    const active=structuredClone(CONFIG.defaults);active.audio.volume=.25;replacePreferences(active);resolveSettings();
    const settings=runtime.settings;
    for(const trace of [{lengthMode:1},{lengthMode:null},{angularSpanDeg:'180'},{angularSpanDeg:null},{angularSpanDeg:NaN},{angularSpanDeg:Infinity},{angularTravelRad:1},{angularTravelEpoch:1}]) {
      const wire={schema:15,prefs:{orbs:[{trace}]}};
      assert.equal(decodePresetPayload(wire).ok,false);
      for(const compressed of [false,true]) {
        globalThis.location={hash:hash(wire,compressed)};
        assert.equal((await UrlPreset.applyFromLocationHashAsync()).ok,false);
        assert.deepEqual(preferences,active);assert.equal(runtime.settings,settings);
      }
    }
    const prefs=structuredClone(CONFIG.defaults);
    prefs.orbs[0].angularTravelRad=999;prefs.orbs[0].angularTravelEpoch={};
    prefs.orbs[0].trace.angularTravelRad=999;prefs.orbs[0].particles.angularTravelRad=999;
    assert.deepEqual(encodePresetPayload(prefs),{schema:15,prefs:{}});
  } finally {replacePreferences(saved.prefs);resolveSettings();globalThis.location=saved.location;UrlPreset.cancelPendingImport();}
});

test('13–15 decoding baselines and older angular migration ignore future factory defaults',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ap-15-frozen-'));
  try {
    cpSync(new URL('../src',import.meta.url),join(dir,'src'),{recursive:true});writeFileSync(join(dir,'package.json'),'{"type":"module"}');
    const path=join(dir,'src/js/core/config.js');
    writeFileSync(path,readFileSync(path,'utf8').replace('lengthMode: "count", angularSpanDeg: 360','lengthMode: "angular", angularSpanDeg: 1080'));
    execFileSync(process.execPath,['--input-type=module','-e',`
      import assert from 'node:assert/strict';
      import {CONFIG} from './src/js/core/config.js';
      import {SCHEMA_15_BASELINE} from './src/js/presets/schema-15-baseline.js';
      import {decodePresetPayload,sanitizePreset} from './src/js/presets/preset-codec.js';
      assert.equal(CONFIG.defaults.orbs[0].trace.lengthMode,'angular');
      assert.deepEqual(sanitizePreset(decodePresetPayload({schema:15,prefs:{}})),SCHEMA_15_BASELINE);
      assert.equal(sanitizePreset(decodePresetPayload({schema:15,prefs:{orbs:[{trace:{lengthMode:'unknown'}}]}})).orbs[0].trace.lengthMode,'count');
      for(let schema=2;schema<=14;schema++) {
        for(const prefs of [{},{orbs:[{}]},...(schema<13?[{orbs:[null]}]:[]),...(schema<13?[{orbs:[{trace:{lengthMode:'unknown'}}]}]:[])]) {
          const old=sanitizePreset(decodePresetPayload({schema,prefs}));
          for(const orb of old.orbs) {assert.equal(orb.trace.lengthMode,'count');assert.equal(orb.trace.angularSpanDeg,360);}
        }
      }
    `],{cwd:dir});
  } finally {rmSync(dir,{recursive:true,force:true});}
});
