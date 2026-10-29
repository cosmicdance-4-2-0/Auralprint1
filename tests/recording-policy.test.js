import { canonicalPrefs } from "./helpers/preset-semantics.js";
import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { PRESET_SCHEMA_VERSION } from "../src/js/core/constants.js";
import { defaultSelection, validateSelection, resolveRecordingPolicy, prepareRecordingPolicy, createRecordingPolicySettings } from "../src/js/recording/recording-policy.js";

const choice = (custom = {}, profile = "custom") => ({ profile, custom: { ...defaultSelection().custom, ...custom } });
test("N3 policy: exact decimal Balanced factory and immutable session thresholds", () => {
  assert.deepEqual(resolveRecordingPolicy(), { profile: "balanced", softBytes: 130000000, aggregateBytes: 270000000,
    reserveBytes: 10000000, maxChunks: 1200, durationMs: 300000, warningFraction: .8 });
  const session = prepareRecordingPolicy(resolveRecordingPolicy(), 150000000);
  assert.equal(session.effectiveSoftBytes, 110000000);
  assert.ok(Object.isFrozen(session));
  for (const p of [260000000,270000000,300000000]) assert.throws(() => prepareRecordingPolicy(resolveRecordingPolicy(), p));
});
test("N3 policy: Custom independent Off values, reserve and strict safe integers", () => {
  for (const key of ["softBytes","aggregateBytes","maxChunks","durationMs"]) {
    for (const bad of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,"10",undefined]) {
      assert.equal(validateSelection(choice({[key]:bad})).ok, false, `${key}: ${bad}`);
    }
    assert.equal(validateSelection(choice({[key]:null})).ok, true);
  }
  assert.equal(validateSelection(choice({aggregateBytes:1,softBytes:null})).ok, false);
  assert.equal(validateSelection(choice({aggregateBytes:100,softBytes:91})).ok, false);
  const p=resolveRecordingPolicy(choice({aggregateBytes:100,softBytes:90}));
  assert.equal(p.reserveBytes,10);
  assert.equal(resolveRecordingPolicy(choice({aggregateBytes:null})).reserveBytes,null);
});
test("N3 policy: Unrestricted has no application S/H/R/C/T fallback; technical P remains checked", () => {
  const p=resolveRecordingPolicy(choice({},"unrestricted"));
  for (const k of ["softBytes","aggregateBytes","reserveBytes","maxChunks","durationMs"]) assert.equal(p[k],null);
  assert.equal(prepareRecordingPolicy(p,Number.MAX_SAFE_INTEGER).effectiveSoftBytes,null);
  assert.throws(()=>prepareRecordingPolicy(p,Infinity));
});
function memory() { let raw=null;return {getItem:()=>raw,setItem:(k,v)=>{raw=v;},read:()=>raw}; }
test("N3 storage: local round trip, unknown fields stripped, reset independent of Scene/schema", () => {
  const store=memory(), a=createRecordingPolicySettings({storage:()=>store});
  a.set(choice({durationMs:null},"unrestricted"));
  assert.equal(createRecordingPolicySettings({storage:()=>store}).policy().profile,"unrestricted");
  const raw=JSON.parse(store.read());
  assert.equal(raw.version,CONFIG.recordingResources.storage.version);
  assert.deepEqual(Object.keys(raw).sort(),["custom","profile","version"]);
  raw.blob="never retained";store.setItem("",JSON.stringify(raw));
  const b=createRecordingPolicySettings({storage:()=>store});b.reset();
  assert.equal(b.policy().profile,"balanced");assert.equal(PRESET_SCHEMA_VERSION, 13);
});
test("N3 storage: invalid records fall back truthfully without overwriting; unavailable saving retains Unrestricted", () => {
  for (const raw of ["{",JSON.stringify({version:22}),JSON.stringify({version:1,...choice({maxChunks:0},"unrestricted")})]) {
    let writes=0;const a=createRecordingPolicySettings({storage:()=>({getItem:()=>raw,setItem:()=>writes++})});
    assert.equal(a.policy().profile,"balanced");
    assert.ok(["invalid","unavailable"].includes(a.read().persistence));assert.equal(writes,0);
  }
  const a=createRecordingPolicySettings({storage:()=>{throw Error("denied");}});
  assert.equal(a.set(choice({},"unrestricted")).persistence,"session-only");
  assert.equal(a.policy().profile,"unrestricted");
  const session=prepareRecordingPolicy(a.policy(),0);a.reset();
  assert.equal(session.profile,"unrestricted");assert.equal(a.policy().profile,"balanced");
});
test("N3 policy settings never contaminate Scene presets or URL payload", async () => {
  const { encodePresetPayload } = await import("../src/js/presets/preset-codec.js");
  const { preferences } = await import("../src/js/core/preferences.js");
  const before=JSON.stringify(encodePresetPayload(preferences));
  const settings=createRecordingPolicySettings({storage:()=>memory()});settings.set(choice({},"unrestricted"));
  assert.equal(JSON.stringify(encodePresetPayload(preferences)),before);
  const payload=encodePresetPayload({...preferences,recordingResources:settings.read().selection});
  assert.equal(payload.schema, 13);assert.equal(Object.hasOwn(canonicalPrefs(payload),"recordingResources"),false);
  assert.doesNotMatch(JSON.stringify(payload),/aggregateBytes|softBytes|durationMs|unrestricted/);
});

test("N3F decimal MB and minutes convert exactly at the policy boundary", async () => {
  const { parseResourceInput, selectionFromResourceInputs } = await import("../src/js/recording/recording-policy.js");
  assert.equal(parseResourceInput("softBytes", "130.000001"),130000001);
  assert.equal(parseResourceInput("aggregateBytes", ".000029"),29);
  assert.equal(parseResourceInput("durationMs", "120"),7200000);
  assert.equal(parseResourceInput("durationMs", "0.001"),60);
  assert.equal(parseResourceInput("maxChunks", "1200"),1200);
  const result=selectionFromResourceInputs({profile:"custom",custom:{softBytes:"130.000001",aggregateBytes:"270.000007",maxChunks:"1200",durationMs:"120",warningFraction:.8}});
  assert.equal(result.ok,true);assert.deepEqual(result.selection.custom,{softBytes:130000001,aggregateBytes:270000007,maxChunks:1200,durationMs:7200000,warningFraction:.8});
});
test("N3F arbitrary canonical values and integer safety round-trip without floating-point scaling", async () => {
  const { parseResourceInput, formatResourceInput, optionalFields } = await import("../src/js/recording/recording-policy.js");
  for(const key of optionalFields)for(const value of [1,3,29,300001,130000001,Number.MAX_SAFE_INTEGER]) {
    assert.equal(parseResourceInput(key,formatResourceInput(key,value)),value,`${key}: ${value}`);
  }
  assert.equal(formatResourceInput("softBytes",Number.MAX_SAFE_INTEGER),"9007199254.740991");
  assert.equal(formatResourceInput("durationMs",1),"1/60000");
  assert.equal(formatResourceInput("durationMs",3),"0.00005");
  assert.equal(parseResourceInput("durationMs","9007199254740991/60000"),Number.MAX_SAFE_INTEGER);
});
test("N3F invalid, fractional canonical and overflowing entries are rejected without clamping", async () => {
  const { parseResourceInput } = await import("../src/js/recording/recording-policy.js");
  for(const key of ["softBytes","aggregateBytes","durationMs","maxChunks"]) {
    for(const raw of ["", " ", "0", "-1", "NaN", "Infinity", "1e3", "1,000", "1/0", "1/", "1.2.3", "9".repeat(40), 120, null, undefined]) {
      assert.equal(parseResourceInput(key,raw),null,`${key}: ${raw}`);
    }
  }
  assert.equal(parseResourceInput("softBytes","0.0000001"),null);
  assert.equal(parseResourceInput("durationMs","0.000001"),null);
  assert.equal(parseResourceInput("maxChunks","1.5"),null);
  assert.equal(parseResourceInput("softBytes","9007199254.740992"),null);
  assert.equal(parseResourceInput("durationMs","9007199254740992/60000"),null);
});
test("N3F converted limits retain relationship validation and independent persisted Off states", () => {
  const store=memory(), settings=createRecordingPolicySettings({storage:()=>store});
  const inputs={profile:"custom",custom:{softBytes:"260.000001",aggregateBytes:"270",durationMs:"120",maxChunks:"1200",warningFraction:.8}};
  const bad=settings.setFromInputs(inputs);assert.equal(bad.ok,false);assert.ok(bad.errors.softBytes);
  assert.equal(store.read(),null);
  inputs.custom.softBytes="130";inputs.custom.durationMs=null;
  assert.equal(settings.setFromInputs(inputs).ok,true);
  const reload=createRecordingPolicySettings({storage:()=>store});
  assert.deepEqual(reload.policy(),{profile:"custom",softBytes:130000000,aggregateBytes:270000000,reserveBytes:10000000,maxChunks:1200,durationMs:null,warningFraction:.8});
});
test("N3F every optional control persists Off without changing the other canonical values", () => {
  for(const key of ["softBytes","aggregateBytes","maxChunks","durationMs"]) {
    const store=memory(),settings=createRecordingPolicySettings({storage:()=>store});
    const custom={softBytes:"130",aggregateBytes:"270",maxChunks:"1200",durationMs:"120",warningFraction:null,[key]:null};
    assert.equal(settings.setFromInputs({profile:"custom",custom}).ok,true);
    const reload=createRecordingPolicySettings({storage:()=>store});
    assert.deepEqual(reload.read().selection.custom,{softBytes:130000000,aggregateBytes:270000000,maxChunks:1200,durationMs:7200000,warningFraction:null,[key]:null});
  }
});
