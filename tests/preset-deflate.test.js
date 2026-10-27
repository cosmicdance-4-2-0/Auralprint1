import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../src/js/core/config.js';
import { preferences, replacePreferences, runtime } from '../src/js/core/preferences.js';
import { state } from '../src/js/core/state.js';
import { encodePresetPayload, sanitizePreset } from '../src/js/presets/preset-codec.js';
import { collectBoundedStream } from '../src/js/presets/deflate-transport.js';
import { UrlPreset, encodeShareHash, encodePrefsToHash, decodePrefsFromHash } from '../src/js/presets/url-preset.js';

const zHash=payload=>'#z='+deflateSync(Buffer.from(JSON.stringify(payload))).toString('base64url');
async function scene(run) {
  const saved={prefs:structuredClone(preferences),location:globalThis.location,history:globalThis.history};
  globalThis.location={hash:'',pathname:'/portable.html',search:'?test'};
  globalThis.history={replaceState(_s,_t,url){location.hash=url.slice(url.indexOf('#'));}};
  try {await run();} finally {replacePreferences(saved.prefs);globalThis.location=saved.location;globalThis.history=saved.history;UrlPreset.cancelPendingImport();}
}
async function api(name,value,run) {const old=globalThis[name];globalThis[name]=value;try {await run();}finally {globalThis[name]=old;}}

test('DEFLATE native writer and Node zlib interoperate semantically in both directions',async()=>{
  const prefs=sanitizePreset({schema:12,prefs:{world:{widthUnits:2345.123456789},sceneCamera:{x:-112.125,rotationRad:.7135792468013579},
    orbs:[{id:'opaque-宇宙',bandIds:[59,60,61,2,143,150,151,152]},{id:'ORB99999999999999999999',chanId:'L'}]}});
  const result=await encodeShareHash(prefs);assert.equal(result.compressed,true);assert.match(result.hash,/^#z=[A-Za-z0-9_-]+$/);
  assert.deepEqual(JSON.parse(inflateSync(Buffer.from(result.hash.slice(3),'base64url'))),encodePresetPayload(prefs));
  assert.deepEqual(await decodePrefsFromHash(result.hash),prefs);
  assert.deepEqual(await decodePrefsFromHash(zHash(encodePresetPayload(prefs))),prefs);
  assert.deepEqual(await decodePrefsFromHash(encodePrefsToHash(prefs)),prefs);
});

test('missing, format-rejecting and asynchronously failing compression operations fall back to uncompressed current schema',async()=>{
  for(const name of ['CompressionStream','DecompressionStream']) {
    for(const value of [undefined,class {constructor(){throw new TypeError('format unsupported');}},
      class {constructor(){return new TransformStream({transform(){throw new Error('operation failed');}});}}]) {
      await api(name,value,async()=>{
        const result=await encodeShareHash(CONFIG.defaults);
        assert.equal(result.fallback,true);assert.equal(result.compressed,false);assert.match(result.hash,/^#p=/);
        assert.equal(JSON.parse(Buffer.from(result.hash.slice(3),'base64url')).schema,15);
        assert.deepEqual(await decodePrefsFromHash(result.hash),CONFIG.defaults);
      });
    }
  }
});
test('a compression operation that silently emits invalid bytes is never published',async()=>{
  await api('CompressionStream',class {constructor(){return new TransformStream();}},async()=>{
    assert.equal((await encodeShareHash(CONFIG.defaults)).fallback,true);
  });
});

test('compressed imports are atomic when unsupported, corrupt, truncated or wrong-schema',async()=>scene(async()=>{
  const active=sanitizePreset({schema:12,prefs:{world:{widthUnits:4321},sceneCamera:{x:123},orbs:[]}});
  replacePreferences(active);const camera=state.camera,settings=runtime.settings,world=state.world;
  const hash=zHash(encodePresetPayload(CONFIG.defaults));
  await api('DecompressionStream',undefined,async()=>{
    location.hash=hash;assert.equal((await UrlPreset.applyFromLocationHashAsync()).ok,false);
    assert.match(UrlPreset.getValidationMessage(),/cannot decompress native DEFLATE/);
    assert.deepEqual(preferences,active);
  });
  const bytes=Buffer.from(hash.slice(3),'base64url');const corrupt=Buffer.from(bytes);corrupt[corrupt.length-1]^=1;
  for(const bad of ['#z=%%%','#z=','#z=AAAA','#z='+bytes.subarray(0,-2).toString('base64url'),
    '#z='+corrupt.toString('base64url'),zHash({schema:12,prefs:{}}),zHash({schema:13,prefs:{orbs:[{bandIds:'0:999'}]}})]) {
    location.hash=bad;const result=await UrlPreset.applyFromLocationHashAsync();assert.equal(result.ok,false);
    assert.deepEqual(preferences,active);assert.equal(state.camera,camera);assert.equal(runtime.settings,settings);assert.equal(state.world,world);
  }
  location.hash=hash;assert.equal((await UrlPreset.applyFromLocationHashAsync()).ok,true);
  assert.deepEqual(preferences,CONFIG.defaults);
}));

test('bounded stream cancels on the first excess chunk without consuming its remainder',async()=>{
  let cancelled=false,pulls=0;
  const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(5));},cancel(){cancelled=true;}});
  await assert.rejects(collectBoundedStream(stream,8),{code:'preset-too-large'});
  assert.equal(cancelled,true);assert.ok(pulls<=3);
});

test('actual native inflation and encoded/compressed/JSON limits reject before replacement',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'ap-deflate-limits-'));
  try {
    cpSync(new URL('../src',import.meta.url),join(dir,'src'),{recursive:true});writeFileSync(join(dir,'package.json'),'{"type":"module"}');
    const path=join(dir,'src/js/core/config.js');let source=readFileSync(path,'utf8')
      .replace('maxJsonBytes: 64 * 1024 * 1024','maxJsonBytes: 4096')
      .replace('maxCompressedBytes: 64 * 1024 * 1024 + 64 * 1024','maxCompressedBytes: 1024')
      .replace('maxEncodedChars: Math.ceil((64 * 1024 * 1024 + 64 * 1024) / 3) * 4','maxEncodedChars: 5500')
      .replace('maxStructureNodes: 2_000_000','maxStructureNodes: 200');
    writeFileSync(path,source);
    const isolated=await import(pathToFileURL(join(dir,'src/js/presets/url-preset.js')).href);
    const prefsModule=await import(pathToFileURL(join(dir,'src/js/core/preferences.js')).href);
    await scene(async()=>{
      const before=structuredClone(prefsModule.preferences);
      for(const hash of ['#z='+deflateSync(Buffer.alloc(4097,32)).toString('base64url'),
        '#z='+Buffer.alloc(1025).toString('base64url'),'#p='+'A'.repeat(5501),
        '#p='+Buffer.alloc(4097,32).toString('base64url'),
        zHash({schema:13,prefs:{orbs:Array.from({length:101},(_,i)=>({id:`X${i}`}))}})]) {
        location.hash=hash;assert.equal((await isolated.UrlPreset.applyFromLocationHashAsync()).ok,false);
        assert.match(isolated.UrlPreset.getValidationMessage(),/resource limits/);
        assert.deepEqual(prefsModule.preferences,before);
      }
    });
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('pending older decode cannot overwrite newer import, reset or direct preference edit',async()=>scene(async()=>{
  const target=sanitizePreset({schema:12,prefs:{audio:{volume:.25},orbs:[]}});
  for(const change of [()=>{location.hash=encodePrefsToHash(CONFIG.defaults);return UrlPreset.applyFromLocationHashAsync();},
    ()=>{UrlPreset.cancelPendingImport();replacePreferences(structuredClone(CONFIG.defaults));},
    ()=>{preferences.audio.volume=.75;},()=>{location.hash='#other';}]) {
    replacePreferences(structuredClone(CONFIG.defaults));location.hash=zHash(encodePresetPayload(target));
    const pending=UrlPreset.applyFromLocationHashAsync();await change();const expected=structuredClone(preferences);
    const result=await pending;assert.equal(result.stale,true);assert.deepEqual(preferences,expected);
  }
}));

test('share snapshots before awaiting, preserves pathname/search, and cancels stale writes',async()=>scene(async()=>{
  replacePreferences(structuredClone(CONFIG.defaults));
  const pending=UrlPreset.writeCompressedHashFromPrefs();preferences.audio.volume=.5;
  assert.equal((await pending).stale,true);assert.equal(location.hash,'');
  const result=await UrlPreset.writeCompressedHashFromPrefs();assert.equal(result.compressed,true);
  assert.deepEqual(await decodePrefsFromHash(location.hash),preferences);
  assert.equal(location.pathname,'/portable.html');assert.equal(location.search,'?test');
  // Live camera intent cancels an import, but Share still captures the authored
  // Scene independently of movement that changes no persistent preferences.
  const moving=UrlPreset.writeCompressedHashFromPrefs();UrlPreset.cancelPendingImport();
  assert.equal((await moving).stale,false);
}));
