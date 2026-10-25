import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../src/js/core/config.js";
import { runtime } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import * as math from "../src/js/audio/band-bank.js";
import { BandBankController } from "../src/js/audio/band-bank-controller.js";

const modes = CONFIG.limits.bands.distributionModes;
const counts = [CONFIG.limits.bands.count.min, 4, 32, CONFIG.limits.bands.count.max];
const maximumNeighbor=new Float64Array([384000]),maximumBits=new BigUint64Array(maximumNeighbor.buffer);
maximumBits[0]-=1n;const belowMaximum=maximumNeighbor[0];maximumBits[0]+=2n;const aboveMaximum=maximumNeighbor[0];
const intervals = [[20,22500],[20,22050],[20,24000],[20,48000],[.125,22500.125],
  [20,384000],[20,belowMaximum],[belowMaximum,384000],[20,aboveMaximum],
  [384000,384000],[Number.MIN_VALUE,22500],
  [Number.MIN_VALUE,Number.MIN_VALUE*8],[22500-1e-10,22500],
  [20,1e307],[1e307,Number.MAX_VALUE],[Number.MIN_VALUE,Number.MAX_VALUE],
  [Number.MAX_VALUE,Number.MAX_VALUE]];

test("AUD-004 scalar converters retain low-frequency precision and explicit inverse limits",()=>{
  for(const [forward,inverse] of [[math.hzToMel,math.melToHz],[math.hzToErb,math.erbToHz]]) {
    for(const hz of [Number.MIN_VALUE,1e-307,1e-100,.125,20,22500,384000,1e307,Number.MAX_VALUE]) {
      const scaled=forward(hz),back=inverse(scaled);
      assert.ok(Number.isFinite(scaled));
      assert.ok(Math.abs(back-hz)<=Math.max(Number.MIN_VALUE*2,hz*3e-12),`${hz} -> ${scaled} -> ${back}`);
    }
    assert.equal(inverse(0),0);
  }
  assert.equal(math.barkToHz(-.53),0);
  const a=new Float64Array([26.28]);new BigUint64Array(a.buffer)[0]-=1n;
  assert.ok(Number.isFinite(math.barkToHz(a[0])));
  assert.ok(Number.isFinite(math.hzToBark(Number.MAX_VALUE)));
});

test("AUD-004 seeded stress: ordered frequencies across binary64 exponents",()=>{
  let seed=0x004116;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let i=0;i<500;i++) {
    const pair=[0,0].map(()=>Math.max(Number.MIN_VALUE,Math.exp(-744+random()*1453)));
    const lo=Math.min(...pair),hi=Math.max(...pair);
    for(const mode of modes) ordered(math.computeInteriorEdges(mode,254,lo,hi),lo,hi);
  }
});

function ordered(edges, lo, hi) {
  assert.equal(edges[0],lo); assert.equal(edges.at(-1),hi);
  edges.forEach((v,i)=>{
    assert.ok(Number.isFinite(v) && v>=lo && v<=hi,`edge ${i}: ${v} in ${lo}..${hi}`);
    if(i) assert.ok(v>=edges[i-1],`edge ${i} reversed`);
  });
}

test("AUD-004 accepted baseline normal-frequency reference results are preserved",()=>{
  // Executed against unmodified accepted 06d114b, n=254, 20..22500 Hz.
  const reference={
    linear:[20,108.50393700787401,2852.1259842519685,11260,19667.87401574803,22411.496062992126,22500],
    log:[20,20.560913555188172,48.46488246550063,670.8203932499366,9285.07358540133,21886.187050596818,22500],
    mel:[19.99999999999993,29.911349251559805,415.1578284538657,3387.0527278223367,14279.045632634457,22184.97091753407,22500.000000000004],
    bark:[19.999999999999996,27.190276494420353,279.27696105201073,1703.449319213313,8104.325031907574,21453.443471640614,22499.999999999967],
    erb:[19.999999999999982,24.46230757933871,210.62906022473865,2149.33495585687,12640.726739402278,22099.58570191398,22500.000000000004],
  };
  for(const mode of modes) {
    const edges=math.computeInteriorEdges(mode,254,20,22500);
    [0,1,32,127,222,253,254].forEach((i,j)=>assert.ok(Math.abs(edges[i]-reference[mode][j])<=reference[mode][j]*3e-12));
  }
});

test("AUD-004 negative control: direct extreme Bark rebuild has finite interior arrays",()=>{
  const previous=runtime.settings;
  try {
    runtime.settings=structuredClone(CONFIG.defaults);
    Object.assign(runtime.settings.bands,{count:256,floorHz:20,ceilingHz:1e307,distributionMode:"bark"});
    math.BandBank.rebuild(1e307);
    assert.equal(state.bands.lowHz.filter(Number.isNaN).length,0);
    assert.equal(state.bands.highHz.filter(Number.isNaN).length,0);
    assert.equal(state.bands.highHz.at(-1),Infinity);
  } finally {runtime.settings=previous;}
});

for(const mode of modes) test(`AUD-004 ${mode}: full binary64 positive domain and bank relationships`,()=>{
  const previous=runtime.settings;
  try {
    for(const count of counts) for(const [lo,hi] of intervals) {
      const edges=math.computeInteriorEdges(mode,count-2,lo,hi);
      ordered(edges,lo,hi);
      runtime.settings=structuredClone(CONFIG.defaults);
      Object.assign(runtime.settings.bands,{count,floorHz:lo,ceilingHz:hi,distributionMode:mode});
      math.BandBank.rebuild(hi);
      assert.deepEqual(state.bands.lowHz,[0,...edges]);
      assert.deepEqual(state.bands.highHz,[lo,...edges.slice(1),Infinity]);
      assert.deepEqual(state.bands.meta,{sampleRateHz:null,nyquistHz:null,effectiveFloorHz:lo,configCeilingHz:hi,effectiveCeilingHz:hi});
      assert.equal(state.bands.energies01,state.bands.channels.C.energies01);
    }
  } finally {runtime.settings=previous;}
});

test("AUD-004 independent 700-digit reference preserves distributions including extreme Bark",()=>{
  const cases=modes.flatMap(mode=>intervals.map(([lo,hi])=>[mode,4,lo,hi]));
  const expected=JSON.parse(execFileSync(process.env.PYTHON || "python3",[fileURLToPath(new URL("helpers/frequency-reference.py",import.meta.url))],{input:JSON.stringify(cases),encoding:"utf8",maxBuffer:1024*1024}));
  cases.forEach(([mode,n,lo,hi],j)=>{
    const actual=math.computeInteriorEdges(mode,n,lo,hi);
    actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[j][i])<=Math.max(Number.MIN_VALUE*8,Math.abs(expected[j][i])*3e-12),`${mode} ${lo}..${hi} edge ${i}: ${v} vs ${expected[j][i]}`));
  });
});

test("AUD-004 helpers reject invalid domains deterministically before publishing a bank",()=>{
  for(const bad of [NaN,Infinity,-Infinity,0,-1]) {
    for(const mode of modes) assert.throws(()=>math.computeInteriorEdges(mode,4,bad,22500),RangeError);
    for(const fn of [math.hzToMel,math.hzToBark,math.hzToErb]) assert.throws(()=>fn(bad),RangeError);
  }
  for(const mode of modes) {
    assert.throws(()=>math.computeInteriorEdges(mode,4,30,20),RangeError);
    for(const n of [0,-1,1.5,NaN,Infinity]) assert.throws(()=>math.computeInteriorEdges(mode,n,20,22500),RangeError);
  }
  for(const fn of [math.melToHz,math.erbToHz]) for(const bad of [-1,NaN,Infinity,Number.MAX_VALUE]) assert.throws(()=>fn(bad),RangeError);
  for(const bad of [-.54,26.28,27,NaN,Infinity]) assert.throws(()=>math.barkToHz(bad),RangeError);
  const previous=runtime.settings,oldLow=state.bands.lowHz;
  try {
    runtime.settings=structuredClone(CONFIG.defaults);runtime.settings.bands.floorHz=0;
    assert.throws(()=>math.BandBank.rebuild(22500),RangeError);
    assert.equal(state.bands.lowHz,oldLow);
  } finally {runtime.settings=previous;}
});

test("AUD-004 Nyquist uses actual positive sample rate and configured ceiling independently",()=>{
  const previous=runtime.settings;
  try {
    runtime.settings=structuredClone(CONFIG.defaults);
    for(const ceiling of [22500,384000]) for(const sample of [null,44100,48000,96000,384000,0,-1,NaN,Infinity]) {
      runtime.settings.bands.ceilingHz=ceiling;
      BandBankController.syncFromSettings();BandBankController.onAudioContextKnown(sample);BandBankController.rebuildNow();
      const valid=Number.isFinite(sample)&&sample>0,expected=valid?Math.min(ceiling,sample/2):ceiling;
      assert.equal(state.bands.meta.effectiveCeilingHz,expected);
      assert.equal(state.bands.meta.sampleRateHz,valid?sample:null);
      assert.equal(runtime.settings.bands.ceilingHz,ceiling);
    }
  } finally {runtime.settings=previous;BandBankController.syncFromSettings();BandBankController.onAudioContextKnown(null);}
});
