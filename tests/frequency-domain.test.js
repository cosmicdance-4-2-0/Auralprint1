import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { preferences, replacePreferences, resolveSettings, runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { decodePresetPayload, encodePresetPayload, sanitizePreset } from "../src/js/presets/preset-codec.js";
import { UrlPreset } from "../src/js/presets/url-preset.js";

// Adjacent binary64 values, independent of an arbitrary decimal epsilon.
function adjacent(x,delta) { const a=new Float64Array([x]),b=new BigUint64Array(a.buffer);b[0]+=BigInt(delta);return a[0]; }
const max=384000;
const hash=payload=>"#p="+Buffer.from(JSON.stringify(payload)).toString("base64url");

test("AUD-004 CONFIG owns maximum; fractional/default/exact and adjacent limits",()=>{
  assert.equal(CONFIG.limits.bands.frequencyHz.max,max);
  assert.equal(CONFIG.defaults.bands.floorHz,20);assert.equal(CONFIG.defaults.bands.ceilingHz,22500);
  for(const [floorHz,ceilingHz] of [[20,22500],[.125,22500.125],[max,max],[20,adjacent(max,-1)],[Number.MIN_VALUE,max]]) {
    const input=structuredClone(CONFIG.defaults);Object.assign(input.bands,{floorHz,ceilingHz});
    const encoded=encodePresetPayload(input),decoded=decodePresetPayload(encoded);
    assert.equal(encoded.schema,12);assert.equal(decoded.ok,true);
    assert.deepEqual(sanitizePreset(decoded),input);
  }
});

for(const schema of [2,3,4,5,6,7,8,9,10,11,12]) test(`AUD-004 schema ${schema}: domain rejection preserves decoder shape and legacy migration`,()=>{
  for(const field of ["floorHz","ceilingHz"]) for(const value of [adjacent(max,1),1e307,Number.MAX_VALUE]) {
    const payload={schema,prefs:{bands:{[field]:value}}};
    assert.deepEqual(decodePresetPayload(payload),{ok:false,code:"unsupported-frequency"});
    assert.throws(()=>sanitizePreset(payload),error=>error.code==="unsupported-frequency");
    assert.throws(()=>encodePresetPayload(payload.prefs),error=>error.code==="unsupported-frequency");
  }
  const valid={schema,prefs:{bands:{floorHz:.25,ceilingHz:max}}};
  assert.equal(decodePresetPayload(valid).ok,true);
  assert.equal(sanitizePreset(valid).bands.ceilingHz,max);
  if(schema===9) for(const scene of [undefined,{nodes:[{type:"bandOverlay",settings:{enabled:true}}]}]) {
    const legacy={...valid,prefs:{...valid.prefs,scene}};
    assert.equal(sanitizePreset(decodePresetPayload(legacy)).bands.floorHz,.25);
    legacy.prefs.bands.ceilingHz=1e307;
    assert.deepEqual(decodePresetPayload(legacy),{ok:false,code:"unsupported-frequency"});
  }
});

test("AUD-004 failed URL import is atomic; subsequent import/share preserves independent owners",()=>{
  const previous=structuredClone(preferences),oldLocation=globalThis.location,oldHistory=globalThis.history;
  try {
    replacePreferences(structuredClone(CONFIG.defaults));resolveSettings();
    const before=structuredClone(preferences),settings=runtime.settings,camera=state.camera;
    const invalid=structuredClone(before);invalid.bands.ceilingHz=1e307;invalid.world.widthUnits=12345;invalid.sceneCamera.x=123;invalid.orbs=[];
    globalThis.location={hash:hash({schema:12,prefs:invalid}),pathname:"/",search:""};
    assert.equal(UrlPreset.applyFromLocationHash(),false);
    assert.deepEqual(preferences,before);assert.equal(runtime.settings,settings);assert.equal(state.camera,camera);
    globalThis.history={replaceState(_a,_b,url){location.hash=url.slice(url.indexOf("#"));}};
    UrlPreset.writeHashFromPrefs();assert.deepEqual(JSON.parse(Buffer.from(location.hash.slice(3),"base64url")).prefs,before);
    const valid=structuredClone(before);Object.assign(valid.bands,{floorHz:31.125,ceilingHz:max,distributionMode:"bark"});
    valid.world.widthUnits=12345;valid.sceneCamera.x=123;
    location.hash=hash({schema:12,prefs:valid});assert.equal(UrlPreset.applyFromLocationHash(),true);
    assert.deepEqual(preferences,valid);UrlPreset.writeHashFromPrefs();
    assert.deepEqual(JSON.parse(Buffer.from(location.hash.slice(3),"base64url")).prefs,valid);
  } finally {globalThis.location=oldLocation;globalThis.history=oldHistory;replacePreferences(previous);resolveSettings();}
});
