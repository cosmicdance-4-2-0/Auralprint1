import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { CONFIG } from '../../../src/js/core/config.js';
import { decodePresetPayload, sanitizePreset, encodePresetPayload } from '../../../src/js/presets/preset-codec.js';
import { decodePrefsFromHash, encodePrefsToHash, UrlPreset } from '../../../src/js/presets/url-preset.js';
import { preferences, replacePreferences, resolveSettings, runtime } from '../../../src/js/core/preferences.js';
import { normalizeOrbCollection, createOrb, duplicateOrb } from '../../../src/js/core/orb-collection.js';

const mode=process.argv[2]||'normal';
if(mode==='identity-expansion') {
  const digits=Number(process.argv[3]||2000), count=Number(process.argv[4]||4096);
  const payload={schema:16,prefs:{orbs:[{id:'ORB'+'9'.repeat(digits)},...Array.from({length:count-1},()=>({}))]}};
  const json=JSON.stringify(payload), hash='#z='+deflateSync(json).toString('base64url');
  const started=performance.now();
  const prefs=await decodePrefsFromHash(hash);
  const durationMs=performance.now()-started;
  const identityCharacters=prefs.orbs.reduce((n,orb)=>n+orb.id.length,0);
  console.log(JSON.stringify({digits,count,inputJsonBytes:Buffer.byteLength(json),hashChars:hash.length,identityCharacters,maxJsonBytes:CONFIG.presets.maxJsonBytes,durationMs:Math.round(durationMs),uniqueIds:new Set(prefs.orbs.map(o=>o.id)).size,memoryMiB:Math.round(process.memoryUsage().heapUsed/1024/1024)}));
  if(identityCharacters>CONFIG.presets.maxJsonBytes) {
    try {encodePrefsToHash(prefs);console.log('share unexpectedly succeeded');}
    catch(error){console.log('share rejected:',error.code);}
  }
  process.exit(0);
}
let cases=0;
for (const schema of [2,3,4,5,6,7,8,9,10,11,12,13,16]) {
  const input={schema,prefs:{orbs:[]}};
  const before=JSON.stringify(input); const decoded=decodePresetPayload(input);
  assert.equal(decoded.ok,true);const prefs=sanitizePreset(decoded);assert.deepEqual(prefs.orbs,[]);assert.equal(JSON.stringify(input),before);
  assert.deepEqual(await decodePrefsFromHash(encodePrefsToHash(prefs)),prefs);cases++;
}
for(const schema of [14,15,-1,17,'16']) assert.equal(decodePresetPayload({schema,prefs:{}}).ok,false);
for(const schema of [13,16]) {
  for(const prefs of [{unknown:true},{orbs:[{unknown:true}]},{orbs:[{bandIds:'256'}]},{orbs:[{bandIds:'2:1'}]},{orbs:[{bandIds:'00'}]},{orbs:[{bandIds:'0:255,0'}]},{orbs:Array.from({length:4097},()=>({}))}]) assert.equal(decodePresetPayload({schema,prefs}).ok,false);
  const p=sanitizePreset(decodePresetPayload({schema,prefs:{orbs:[{id:'ORB9007199254740992'},{},{id:'ORB9007199254740993'},{id:'ORB9007199254740992'}]}}));
  assert.deepEqual(p.orbs.map(o=>o.id),['ORB9007199254740992','ORB9007199254740994','ORB9007199254740993','ORB9007199254740995']);cases++;
}
for(const schema of [2,3,4,5,6,7,8,9,10]) {
 const prefs=sanitizePreset(decodePresetPayload({schema,prefs:{sceneCamera:{x:500},world:{widthUnits:2500},orbs:[{id:'X',particles:{minPlacementDistancePx:2.345,minPlacementDistanceUnits:999}}],particles:{minPlacementDistancePx:2.345}}}));
 assert.equal(prefs.sceneCamera.x,0);assert.equal(prefs.world.widthUnits,CONFIG.defaults.world.widthUnits);assert.equal(prefs.orbs[0].particles.minPlacementDistanceUnits,2.345);cases++;
}
const old=structuredClone(preferences);globalThis.location={hash:''};
try {
 const input={schema:16,prefs:{audio:{volume:0.25},orbs:[]}};
 location.hash='#z='+deflateSync(JSON.stringify(input)).toString('base64url');
 const pending=UrlPreset.applyFromLocationHashAsync();preferences.audio.volume=.75;
 assert.deepEqual(await pending,{ok:false,stale:true});assert.equal(preferences.audio.volume,.75);cases++;
 const before=structuredClone(preferences),view=runtime.settings;
 for(const hash of ['#p=',' #p=AA','#p=A','#z=%%%%','#p='+Buffer.from('{"schema":14,"prefs":{}}').toString('base64url')]) {
  location.hash=hash;assert.equal((await UrlPreset.applyFromLocationHashAsync()).ok,false);assert.deepEqual(preferences,before);assert.equal(runtime.settings,view);cases++;
 }
}finally{replacePreferences(old);resolveSettings();UrlPreset.cancelPendingImport();}
console.log(JSON.stringify({ordinaryChecksPassed:cases}));
