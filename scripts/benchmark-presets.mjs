// Numeric measurements only. The optional owner artifact stays outside fixtures.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { compressDeflate } from '../src/js/presets/deflate-transport.js';
import { CONFIG } from '../src/js/core/config.js';
import { sanitizePreset } from '../src/js/presets/preset-codec.js';
import { encodePrefsToHash, encodeShareHash, decodePrefsFromHash } from '../src/js/presets/url-preset.js';

const baseline=()=>structuredClone(CONFIG.defaults);
const canonical=prefs=>sanitizePreset({schema:12,prefs});
const synthetic=(count,targets=false)=>canonical({orbs:Array.from({length:count},(_,i)=>({
  id:`opaque-${(i*29+7)%count}-宇宙`,chanId:i%2?'L':'R',
  bandIds:targets?Array.from({length:i<12?38:37},(_,j)=>j+(i*11)%180):[255-i%256,i%256],
  centerXFrac:(i%9-4)*.1,startAngleRad:(i+.125)*.1234567890123,
  motion:{angularSpeedRadPerSec:.123456789012345+i%7*.1},
  particles:{emitPerSecond:240+i%13,sizeMaxPx:4+i%4},trace:{lines:i%3!==0},
}))});
const minimal=baseline();minimal.visuals.backgroundColor='#123456';
const sparse=baseline();sparse.orbs[0].bandIds=[255,0,47,19,150,151,143];
const precision=JSON.parse(readFileSync(new URL('../tests/fixtures/schema-12-full.json',import.meta.url)));
const maximum=canonical({orbs:Array.from({length:CONFIG.limits.orbs.maxCount},(_,i)=>({id:`max-${i}`,bandIds:Array.from({length:256},(_,j)=>j)}))});
const patterns=synthetic(16);for(const orb of patterns.orbs)orb.bandIds=Array.from({length:256},(_,i)=>(i*73+11)%256);
const corpus=[['Factory defaults',baseline()],['Minimal modified Scene',minimal],['Sparse reordered targets',sparse],
  ['64 independent Orbs',synthetic(64)],['Opaque reordered 16 Orbs',synthetic(16)],['Precision fixture',precision],
  ['16 maximum reordered selections',patterns],['4096 Orbs × 256 bands',maximum],['Synthetic contiguous 16 Orbs / 604 assignments',synthetic(16,true)]];
if(process.env.AP_HERO_PRESET){
  const text=readFileSync(process.env.AP_HERO_PRESET,'utf8').trim();
  const value=text.startsWith('#')?await decodePrefsFromHash(text):(()=>{const parsed=JSON.parse(text);return sanitizePreset(parsed.schema?parsed:{schema:12,prefs:parsed});})();
  corpus.push(['Owner Hero (external, not a fixture)',value]);
}
const results=[];
for(const [name,input] of corpus){
  const prefs=canonical(input),fullJson=JSON.stringify({schema:12,prefs});
  const uncompressed=encodePrefsToHash(prefs),compressed=await encodeShareHash(prefs);
  assert.equal(compressed.compressed,true,'Native DEFLATE unavailable');
  assert.deepEqual(await decodePrefsFromHash(uncompressed),prefs);
  assert.deepEqual(await decodePrefsFromHash(compressed.hash),prefs);
  results.push({name,orbs:prefs.orbs.length,assignments:prefs.orbs.reduce((n,o)=>n+o.bandIds.length,0),
    fullJsonBytes:Buffer.byteLength(fullJson),fullHashChars:3+Buffer.from(fullJson).toString('base64url').length,
    schema13HashChars:uncompressed.length,deflateHashChars:compressed.hash.length});
}
const rejectedInputs=[];
for(const [name,json] of [
  ['Malformed range','{"schema":13,"prefs":{"orbs":[{"bandIds":"1:0"}]}}'],
  ['Expansive range','{"schema":13,"prefs":{"orbs":[{"bandIds":"0:255,0:255"}]}}'],
  ['Injected property','{"schema":13,"prefs":{"__proto__":{"polluted":true}}}'],
  ['Invalid number','{"schema":13,"prefs":{"audio":{"volume":1e400}}}'],
  ['Over-count collection',JSON.stringify({schema:13,prefs:{orbs:Array(CONFIG.limits.orbs.maxCount+1).fill({})}})],
]) {
  const bytes=new TextEncoder().encode(json),plain='#p='+Buffer.from(bytes).toString('base64url');
  const compressed='#z='+Buffer.from(await compressDeflate(bytes)).toString('base64url');
  await assert.rejects(decodePrefsFromHash(plain));await assert.rejects(decodePrefsFromHash(compressed));
  rejectedInputs.push({name,jsonBytes:bytes.length,schema13HashChars:plain.length,deflateHashChars:compressed.length,rejected:true});
}
console.log(JSON.stringify({runtime:process.version,format:'hash lengths include #p=/#z= and unpadded Base64URL overhead',results,rejectedInputs},null,2));
