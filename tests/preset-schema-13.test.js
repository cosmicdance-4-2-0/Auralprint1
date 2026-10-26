import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, cpSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { CONFIG } from '../src/js/core/config.js';
import { SCHEMA_13_BASELINE } from '../src/js/presets/schema-13-baseline.js';
import { encodePresetPayload, decodePresetPayload, sanitizePreset } from '../src/js/presets/preset-codec.js';
import { encodeBandRanges, decodeBandRanges } from '../src/js/presets/compact-preset.js';
import { parsePresetJson, assertPresetStructure } from '../src/js/presets/preset-limits.js';

const full = JSON.parse(readFileSync(new URL('./fixtures/schema-12-full.json', import.meta.url)));
const compact = prefs => ({schema:13,prefs});
const canonical = payload => { const decoded=decodePresetPayload(payload); assert.equal(decoded.ok,true,decoded.code); return sanitizePreset(decoded); };

test('13: every canonical field, precise numbers, empty collections and opaque identities round-trip',()=>{
  for (const prefs of [CONFIG.defaults, full, {...full,orbs:[]}, {...full,orbs:[...full.orbs].reverse()}]) {
    const before=structuredClone(prefs), wire=encodePresetPayload(prefs);
    assert.equal(wire.schema,13);
    assert.deepEqual(canonical(JSON.parse(JSON.stringify(wire))),prefs);
    assert.deepEqual(prefs,before);
  }
});

test('13: defaults omit completely; nested siblings and zero/false/empty survive',()=>{
  assert.deepEqual(encodePresetPayload(CONFIG.defaults),compact({}));
  const wire=compact({orbs:[{id:'opaque-宇宙',bandIds:'',trace:{lines:false,lineAlpha:0}}],
    audio:{volume:0},particleSafety:{maxEmissionsPerFrame:0},bands:{overlay:{enabled:true}}});
  const prefs=canonical(wire);
  assert.equal(prefs.audio.volume,0);assert.equal(prefs.audio.muted,false);
  assert.deepEqual(prefs.orbs[0].bandIds,[]);assert.equal(prefs.orbs[0].trace.lines,false);
  assert.equal(prefs.orbs[0].trace.lineAlpha,0);assert.equal(prefs.orbs[0].trace.numLines,10);
  assert.equal(prefs.particleSafety.maxEmissionsPerFrame,0);
  assert.equal(prefs.particleSafety.maxActiveParticles,16384);
  assert.equal(prefs.bands.overlay.enabled,true);assert.equal(prefs.bands.overlay.alpha,.65);
  assert.deepEqual(canonical(encodePresetPayload(prefs)),prefs);
  assert.deepEqual(canonical(compact({orbs:[]})).orbs,[]);
});

test('13: per-position fallback matches the accepted normalizer, including missing/duplicate IDs',()=>{
  const orbs=[{}, {id:'ORB99'}, {id:'duplicate'}, {id:'duplicate'}, {}];
  assert.deepEqual(canonical(compact({orbs})),sanitizePreset({schema:12,prefs:{orbs}}));
  const prefs=canonical(compact({orbs:Array.from({length:6},(_,i)=>({id:`opaque ${i}`}))}));
  assert.deepEqual(prefs.orbs.map(o=>o.chanId),['R','L','R','L','R','L']);
  assert.deepEqual(prefs.orbs.map(o=>o.startAngleRad),[0,Math.PI,0,Math.PI,0,Math.PI]);
  assert.ok(prefs.orbs.every(o=>o.bandIds.length===0));
});

for (const [ids,text] of [[[], ''],[[143],'143'],[[59,60,61],'59:61'],
  [Array.from({length:71},(_,i)=>59+i),'59:129'],[[59,60,143,150,151,152],'59:60,143,150:152'],
  [[5,4,3,10,11,0,255],'5,4,3,10:11,0,255']]) {
  test(`13 ranges: ${text}`,()=>{
    assert.equal(encodeBandRanges(ids),text);assert.deepEqual(decodeBandRanges(text),ids);
    assert.deepEqual(canonical(compact({orbs:[{id:'X',bandIds:text}]})).orbs[0].bandIds,ids);
  });
}
test('13 ranges: duplicates preserve first occurrence; all permutations survive',()=>{
  assert.deepEqual(decodeBandRanges('3,1:4,0'),[3,1,2,4,0]);
  for(let offset=0;offset<256;offset++) {
    const ids=Array.from({length:256},(_,i)=>(i*73+offset)%256);
    assert.deepEqual(decodeBandRanges(encodeBandRanges(ids)),ids);
  }
});
for (const text of ['01','-1','+1','1.0','1e2',' 1','1 ','1,','1,,2',':2','1:','1:1','2:1',
  '0:256','256','999','1:2:3','９','9'.repeat(10000),'0:255,0:255']) {
  test(`13 rejects malformed/expansive range ${text.slice(0,30)}`,()=>{
    assert.throws(()=>decodeBandRanges(text));
    assert.equal(decodePresetPayload(compact({orbs:[{bandIds:text}]})).ok,false);
  });
}
test('13 rejects numeric arrays, invalid types, unknown keys, prototypes, cycles and accessors',()=>{
  for(const prefs of [{unknown:true},{audio:{volume:'0'}},{audio:{volume:NaN}},
    {audio:{volume:Infinity}},{orbs:[{bandIds:[1,2]}]},{orbs:null},{orbs:[null]},
    {bands:{overlay:[]}},JSON.parse('{"__proto__":{"polluted":true}}'),
    {orbs:[JSON.parse('{"constructor":{"prototype":{"polluted":true}}}')]},
    {audio:Object.create({volume:0})}]) assert.equal(decodePresetPayload(compact(prefs)).ok,false);
  const cycle={};cycle.audio=cycle;assert.equal(decodePresetPayload(compact(cycle)).ok,false);
  let read=false;const accessor={get audio(){read=true;return {};}};
  assert.equal(decodePresetPayload(compact(accessor)).ok,false);assert.equal(read,false);
  assert.equal({}.polluted,undefined);
});
test('13 retains CONFIG admission; legacy arrays never become range strings',()=>{
  assert.equal(decodePresetPayload(compact({orbs:Array(CONFIG.limits.orbs.maxCount+1).fill({})})).code,'orb-limit-exceeded');
  assert.equal(decodePresetPayload(compact({bands:{ceilingHz:384001}})).code,'unsupported-frequency');
  const legacy=sanitizePreset({schema:12,prefs:{orbs:[{bandIds:'59:129'}]}});
  assert.deepEqual(legacy.orbs[0].bandIds,[]);
});
test('13 protocol limits admit maximal canonical collection and band-selection work',()=>{
  const orbs=Array.from({length:CONFIG.limits.orbs.maxCount},(_,i)=>({id:`opaque-${i}`,bandIds:'0:255'}));
  const prefs=canonical(compact({orbs}));assert.equal(prefs.orbs.length,4096);
  assert.equal(prefs.orbs.reduce((n,o)=>n+o.bandIds.length,0),1048576);
  assert.doesNotThrow(()=>parsePresetJson(JSON.stringify(encodePresetPayload(prefs))));
  assert.doesNotThrow(()=>parsePresetJson(JSON.stringify({schema:12,prefs})));
});
test('13 bounds nesting before parsing and direct object complexity',()=>{
  assert.throws(()=>parsePresetJson('['.repeat(17)+'0'+']'.repeat(17)),{code:'preset-too-complex'});
  assert.doesNotThrow(()=>parsePresetJson(JSON.stringify({brackets:'[[[\\"'})));
  let nested={};for(let i=0;i<18;i++)nested={audio:nested};
  assert.throws(()=>assertPresetStructure(nested),{code:'preset-too-complex'});
});
test('13 frozen literal fingerprint and future CONFIG factory-default independence',()=>{
  const digest=createHash('sha256').update(JSON.stringify(SCHEMA_13_BASELINE)).digest('hex');
  assert.equal(digest,'81bc92485e95cd1e1d9446a54b7f2c714e2d341ac3e20ccc54ddfe76fdf70e2b');
  assert.ok(Object.isFrozen(SCHEMA_13_BASELINE.orbs[0].particles));
  const dir=mkdtempSync(join(tmpdir(),'ap-frozen-'));
  try {
    cpSync(new URL('../src',import.meta.url),join(dir,'src'),{recursive:true});
    writeFileSync(join(dir,'package.json'),'{"type":"module"}');
    const path=join(dir,'src/js/core/config.js');
    const source=readFileSync(path,'utf8').replace('volume: 1.0','volume: 0.25')
      .replace('widthUnits: 1000, heightUnits: 1000','widthUnits: 777, heightUnits: 888')
      .replace('sizeMaxPx: 8','sizeMaxPx: 9').replace('const DEFAULT_CAMERA = { x: 0','const DEFAULT_CAMERA = { x: 222');
    writeFileSync(path,source);
    execFileSync(process.execPath,['--input-type=module','-e',`
      import assert from 'node:assert/strict';
      import {CONFIG} from './src/js/core/config.js';
      import {SCHEMA_13_BASELINE as frozen} from './src/js/presets/schema-13-baseline.js';
      import {decodePresetPayload,sanitizePreset} from './src/js/presets/preset-codec.js';
      assert.notEqual(CONFIG.defaults.audio.volume,frozen.audio.volume);
      assert.deepEqual(sanitizePreset(decodePresetPayload({schema:13,prefs:{}})),frozen);
    `],{cwd:dir});
  } finally {rmSync(dir,{recursive:true,force:true});}
});
