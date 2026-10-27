import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { CONFIG } from '../src/js/core/config.js';
import { normalizeOrbDef, preferences, replacePreferences, resolveSettings, runtime } from '../src/js/core/preferences.js';
import { SCHEMA_13_BASELINE } from '../src/js/presets/schema-13-baseline.js';
import { SCHEMA_14_BASELINE } from '../src/js/presets/schema-14-baseline.js';
import { compactBaseline } from '../src/js/presets/compact-preset.js';
import { encodePresetPayload, decodePresetPayload, sanitizePreset } from '../src/js/presets/preset-codec.js';
import { encodePrefsToHash, encodeShareHash, decodePrefsFromHash, UrlPreset } from '../src/js/presets/url-preset.js';

const wire = prefs => ({schema:14,prefs});
const canonical = payload => {const decoded=decodePresetPayload(payload);assert.equal(decoded.ok,true,decoded.code);return sanitizePreset(decoded);};
const zHash = payload => '#z='+deflateSync(Buffer.from(JSON.stringify(payload))).toString('base64url');
const migrated13 = () => {const expected=structuredClone(SCHEMA_13_BASELINE);expected.audio.clearQueueOnSourceExit=false;for(const orb of expected.orbs)Object.assign(orb.trace,{fadeEnabled:false,fadeSegments:5});return expected;};

test('14 defaults omit entirely and select a distinct frozen baseline',()=>{
  assert.equal(compactBaseline(13),SCHEMA_13_BASELINE);assert.equal(compactBaseline(14),SCHEMA_14_BASELINE);
  assert.notEqual(compactBaseline(13),compactBaseline(14));assert.throws(()=>compactBaseline(15),{code:'unsupported-schema'});
  assert.deepEqual(encodePresetPayload(CONFIG.defaults),wire({}));
  assert.deepEqual(canonical(wire({})),CONFIG.defaults);
  assert.deepEqual(canonical({schema:13,prefs:{}}),migrated13());
  assert.equal(Object.hasOwn(SCHEMA_13_BASELINE.audio,'clearQueueOnSourceExit'),false);
  assert.equal(Object.hasOwn(SCHEMA_13_BASELINE.orbs[0].trace,'fadeEnabled'),false);
});

test('14 Queue and both Trace opt-ins round-trip independently and together in both framings',async()=>{
  for(const audio of [false,true]) for(const fade of [false,true]) for(const mode of ['fixed','lastParticle','dominantBand','particleBirth']) {
    const prefs=structuredClone(CONFIG.defaults);prefs.audio.clearQueueOnSourceExit=audio;
    Object.assign(prefs.orbs[0].trace,{fadeEnabled:fade,fadeSegments:7,lineColorMode:mode});
    prefs.orbs[0].id='opaque-宇宙';prefs.orbs[0].bandIds=[143,59,60,61,0,255];
    prefs.orbs[0].centerXFrac=.123456789012345;prefs.orbs[0].motion.angularSpeedRadPerSec=.123456789012345;
    const before=structuredClone(prefs),payload=encodePresetPayload(prefs);
    assert.equal(payload.schema,14);assert.deepEqual(canonical(payload),prefs);assert.deepEqual(prefs,before);
    assert.deepEqual(await decodePrefsFromHash(encodePrefsToHash(prefs)),prefs);
    const compressed=await encodeShareHash(prefs);assert.equal(compressed.compressed,true);
    assert.deepEqual(await decodePrefsFromHash(compressed.hash),prefs);
    assert.deepEqual(JSON.parse(inflateSync(Buffer.from(compressed.hash.slice(3),'base64url'))),payload);
  }
});

test('14 new defaults are independent deltas; false and selected Fade Length survive',()=>{
  const prefs=structuredClone(CONFIG.defaults);prefs.audio.clearQueueOnSourceExit=true;
  assert.deepEqual(encodePresetPayload(prefs),wire({audio:{clearQueueOnSourceExit:true}}));
  prefs.audio.clearQueueOnSourceExit=false;prefs.orbs[0].trace.fadeEnabled=true;
  const encoded=encodePresetPayload(prefs);
  assert.deepEqual(encoded.prefs.orbs[0],{id:'ORB0',trace:{fadeEnabled:true}});
  assert.deepEqual(encoded.prefs.orbs[1],{id:'ORB1'});
  assert.equal(Object.hasOwn(encoded.prefs.orbs[0].trace,'fadeSegments'),false);
  const selected=canonical(wire({orbs:[{id:'X',trace:{fadeEnabled:false,fadeSegments:27}}]}));
  assert.equal(selected.orbs[0].trace.fadeEnabled,false);assert.equal(selected.orbs[0].trace.fadeSegments,27);
  assert.deepEqual(canonical(wire({orbs:[]})).orbs,[]);
});

test('14 integer Fade Length follows CONFIG bounds without degrading other precision',()=>{
  const limit=CONFIG.limits.trace.fadeSegments;assert.deepEqual(limit,{min:1,max:1000,step:1});
  assert.equal(limit.max,CONFIG.limits.trace.numLines.max);
  for(const [value,expected] of [[-1,1],[0,1],[1,1],[4.49,4],[4.5,5],[5,5],[999,999],[1001,1000]]) {
    const orb=normalizeOrbDef({trace:{fadeSegments:value,lineAlpha:.123456789012345}},CONFIG.defaults.orbs[0]);
    assert.equal(orb.trace.fadeSegments,expected);assert.equal(orb.trace.lineAlpha,.123456789012345);
    assert.equal(canonical(wire({orbs:[{id:'X',trace:{fadeSegments:value}}]})).orbs[0].trace.fadeSegments,expected);
  }
  const normalized=normalizeOrbDef({trace:{fadeSegments:'9',fadeEnabled:'true',lineColorMode:'unknown'}},CONFIG.defaults.orbs[0]);
  assert.equal(normalized.trace.fadeSegments,5);assert.equal(normalized.trace.fadeEnabled,false);assert.equal(normalized.trace.lineColorMode,'dominantBand');
});

test('14 rejects malformed types, unknown/executable fields and future schemas before replacement',async()=>{
  for(const prefs of [{audio:{clearQueueOnSourceExit:1}},{audio:{clearQueueOnSourceExit:'true'}},
    {orbs:[{trace:{fadeEnabled:1}}]},{orbs:[{trace:{fadeSegments:'5'}}]},
    {orbs:[{trace:{fadeSegments:NaN}}]},{orbs:[{trace:{fadeSegments:Infinity}}]},
    {orbs:[{trace:{angularTravel:1}}]},JSON.parse('{"audio":{"__proto__":{"clearQueueOnSourceExit":true}}}')]) {
    assert.equal(decodePresetPayload(wire(prefs)).ok,false);
  }
  assert.equal(decodePresetPayload({schema:15,prefs:{}}).code,'unsupported-schema');
  assert.equal(canonical(wire({orbs:[{trace:{lineColorMode:'future'}}]})).orbs[0].trace.lineColorMode,'dominantBand');
  assert.equal({}.clearQueueOnSourceExit,undefined);
  const saved={prefs:structuredClone(preferences),location:globalThis.location};
  try {
    const active=canonical(wire({audio:{clearQueueOnSourceExit:true},orbs:[]}));replacePreferences(active);resolveSettings();
    const settings=runtime.settings;globalThis.location={hash:zHash(wire({orbs:[{trace:{fadeEnabled:1}}]}))};
    assert.equal((await UrlPreset.applyFromLocationHashAsync()).ok,false);
    assert.deepEqual(preferences,active);assert.equal(runtime.settings,settings);
  } finally {replacePreferences(saved.prefs);resolveSettings();globalThis.location=saved.location;UrlPreset.cancelPendingImport();}
});

test('schemas 2–12 ignore injected 116F behavior and preserve original Trace modes',()=>{
  for(let schema=2;schema<=12;schema++) for(const mode of ['fixed','lastParticle','dominantBand','particleBirth']) {
    const injected={audio:{clearQueueOnSourceExit:true},trace:{lineColorMode:mode,fadeEnabled:true,fadeSegments:999},
      orbs:[{id:'X',trace:{lineColorMode:mode,fadeEnabled:true,fadeSegments:999}}]};
    const before=structuredClone(injected),prefs=canonical({schema,prefs:injected});
    assert.equal(prefs.audio.clearQueueOnSourceExit,false);
    assert.equal(prefs.orbs[0].trace.fadeEnabled,false);assert.equal(prefs.orbs[0].trace.fadeSegments,5);
    assert.equal(prefs.orbs[0].trace.lineColorMode,mode==='particleBirth'?'dominantBand':mode);
    assert.deepEqual(injected,before);
  }
});

test('schema 13 retains unknown-key rejection and former unknown-mode fallback in both framings',async()=>{
  for(const prefs of [{audio:{clearQueueOnSourceExit:true}},{orbs:[{trace:{fadeEnabled:true}}]},
    {orbs:[{trace:{fadeSegments:8}}]}]) assert.equal(decodePresetPayload({schema:13,prefs}).code,'unknown-preset-field');
  const payload={schema:13,prefs:{orbs:[{id:'historical',trace:{lineColorMode:'particleBirth'}}]}};
  const expected=canonical(payload);assert.equal(expected.orbs[0].trace.lineColorMode,'dominantBand');
  assert.equal(expected.orbs[0].trace.fadeEnabled,false);assert.equal(expected.audio.clearQueueOnSourceExit,false);
  assert.deepEqual(await decodePrefsFromHash(zHash(payload)),expected);
  assert.deepEqual(await decodePrefsFromHash('#p='+Buffer.from(JSON.stringify(payload)).toString('base64url')),expected);
});

test('14 never serializes Queue files, names, cursor, source permissions or runtime history',()=>{
  const prefs=structuredClone(CONFIG.defaults);
  prefs.queue={files:[{name:'secret-track.wav',handle:'sensitive'}],cursor:7};prefs.recording={active:true};
  prefs.audio.files=[{name:'secret-track.wav'}];prefs.audio.cursor=7;prefs.audio.permissions={microphone:true};
  prefs.orbs[0].particles.history=[{rgbStart:[1,2,3],time:12}];prefs.orbs[0].trace.angularTravel=999;
  const payload=encodePresetPayload(prefs);assert.deepEqual(payload,wire({}));
  assert.doesNotMatch(JSON.stringify(payload),/secret-track|files|cursor|handle|permissions|history|angularTravel|recording/);
});

test('14 frozen literal fingerprint and both compact baselines survive changed future factory defaults',()=>{
  assert.equal(createHash('sha256').update(JSON.stringify(SCHEMA_14_BASELINE)).digest('hex'),'db50724e0ea914f2b730e61d5d9e4f216de00f7a72c32ef588c8f9eb1f0f7796');
  assert.ok(Object.isFrozen(SCHEMA_14_BASELINE.orbs[0].trace));
  const dir=mkdtempSync(join(tmpdir(),'ap-14-frozen-'));
  try {
    cpSync(new URL('../src',import.meta.url),join(dir,'src'),{recursive:true});writeFileSync(join(dir,'package.json'),'{"type":"module"}');
    const path=join(dir,'src/js/core/config.js');writeFileSync(path,readFileSync(path,'utf8')
      .replace('fadeEnabled: false, fadeSegments: 5','fadeEnabled: true, fadeSegments: 37')
      .replace('clearQueueOnSourceExit: false','clearQueueOnSourceExit: true').replace('volume: 1.0','volume: 0.25')
      .replace('sizeMaxPx: 8','sizeMaxPx: 9').replace('lineColorMode: "dominantBand"','lineColorMode: "particleBirth"'));
    execFileSync(process.execPath,['--input-type=module','-e',`
      import assert from 'node:assert/strict';
      import {CONFIG} from './src/js/core/config.js';
      import {SCHEMA_14_BASELINE as frozen} from './src/js/presets/schema-14-baseline.js';
      import {decodePresetPayload,sanitizePreset} from './src/js/presets/preset-codec.js';
      assert.equal(CONFIG.defaults.audio.clearQueueOnSourceExit,true);
      assert.deepEqual(sanitizePreset(decodePresetPayload({schema:14,prefs:{}})),frozen);
      const old=sanitizePreset(decodePresetPayload({schema:13,prefs:{}}));
      assert.equal(old.audio.clearQueueOnSourceExit,false);assert.equal(old.orbs[0].trace.fadeEnabled,false);
      assert.equal(old.orbs[0].trace.fadeSegments,5);assert.equal(old.orbs[0].trace.lineColorMode,'dominantBand');
      for(let schema=2;schema<=12;schema++) {
        const oldNull=sanitizePreset(decodePresetPayload({schema,prefs:{orbs:[null]}}));
        assert.equal(oldNull.orbs[0].trace.fadeEnabled,false);assert.equal(oldNull.orbs[0].trace.fadeSegments,5);
        assert.equal(oldNull.orbs[0].trace.lineColorMode,'dominantBand');
      }
      const invalid={orbs:[{id:'ORB0',trace:{lineColorMode:'invalid'}}]};
      assert.equal(sanitizePreset(decodePresetPayload({schema:14,prefs:invalid})).orbs[0].particles.sizeMaxPx,8);
      assert.equal(sanitizePreset(decodePresetPayload({schema:14,prefs:invalid})).orbs[0].trace.lineColorMode,'dominantBand');
    `],{cwd:dir});
  } finally {rmSync(dir,{recursive:true,force:true});}
});
