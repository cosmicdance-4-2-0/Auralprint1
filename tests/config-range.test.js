import { canonicalPrefs } from "./helpers/preset-semantics.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/js/core/config.js';
import { selectConfigGrid, isOnConfigGrid } from '../src/js/ui/config-range.js';
import { sliderCases, individualSliders, readPath } from './helpers/step-control-cases.js';
import { sanitizePreset, encodePresetPayload } from '../src/js/presets/preset-codec.js';

for (const {owner,selector,limit} of sliderCases) test(`CONFIG editing grid: ${owner} ${selector}, bounds and stable indices`,()=>{
  const {min,max,step}=limit;
  for (const raw of [min-step,min,min+step/3,min+step*.51,(min+max)/2,max-step/3,max,max+step]) {
    const value=selectConfigGrid(raw,limit),index=(value-min)/step;
    assert.ok(value>=min && value<=max);
    assert.ok(Math.abs(index-Math.round(index)) < 1e-10,`${value} off grid`);
    assert.equal(selectConfigGrid(value,limit),value,'selection is idempotent');
    if (Number.isInteger(min) && Number.isInteger(step)) assert.ok(Number.isInteger(value));
  }
  assert.equal(selectConfigGrid(NaN,limit),null); assert.equal(selectConfigGrid(Infinity,limit),null);
});

test('Orb maximum remains a bound; Ring and designed phase reach exact TAU on their grids',()=>{
  const ring=CONFIG.limits.bands.ringSpeedRadPerSec,phase=CONFIG.limits.orbs.startAngleRad;
  const speed=CONFIG.limits.motion.angularSpeedRadPerSec;
  assert.equal(isOnConfigGrid(speed.max,speed),false);
  assert.equal(selectConfigGrid(speed.max,speed),speed.min+342*speed.step);
  assert.ok(Math.abs(selectConfigGrid(speed.max,speed)*180/Math.PI-171.5)<1e-12);
  assert.equal(isOnConfigGrid(ring.max,ring),true);assert.equal(selectConfigGrid(ring.max,ring),2*Math.PI);
  assert.equal(isOnConfigGrid(phase.max,phase),true);assert.equal(selectConfigGrid(phase.max,phase),phase.max);
  let value=0;
  for(let i=0;i<1000;i++) { value=selectConfigGrid(value+.01,CONFIG.limits.orbs.centerXFrac); assert.ok(isOnConfigGrid(value,CONFIG.limits.orbs.centerXFrac)); }
  assert.equal(value,.95);
});

test('Schemas 10/11/12, defaults and share retain legacy off-grid values; no persistence lattice is introduced',()=>{
  for(const schema of [10,11,12]) {
    const prefs=structuredClone(CONFIG.defaults);
    prefs.audio.rmsGain=.123456;prefs.audio.smoothingTimeConstant=.123456;
    prefs.bands.overlay.pointSizePx=3.456;prefs.bands.overlay.ringSpeedRadPerSec=2*Math.PI;
    for(const item of individualSliders) {
      // Schema 10 uses the historical spacing name, handled separately below.
      if(item.path.at(-1)==='minPlacementDistanceUnits' && schema===10) prefs.orbs[0].particles.minPlacementDistancePx=item.legacy;
      else { let object=prefs;for(const key of item.path.slice(0,-1))object=object[key];object[item.path.at(-1)]=item.legacy; }
    }
    const normalized=sanitizePreset({schema,prefs}),shared=canonicalPrefs(encodePresetPayload(normalized));
    assert.deepEqual(shared,normalized);
    for(const item of individualSliders)assert.equal(readPath(normalized,item.path),item.legacy);
    assert.equal(normalized.audio.rmsGain,.123456);assert.equal(normalized.bands.overlay.pointSizePx,3.456);
    assert.equal(normalized.bands.overlay.ringSpeedRadPerSec,2*Math.PI);
  }
  const defaults=sanitizePreset({schema:12,prefs:{}});
  assert.equal(defaults.orbs[0].motion.angularSpeedRadPerSec,Math.PI/2);
  assert.equal(isOnConfigGrid(Math.PI/2,CONFIG.limits.motion.angularSpeedRadPerSec),true);
});

test('Exact legacy dependency bounds take precedence over floating membership tolerance',()=>{
  const limit=CONFIG.limits.particles.sizeMaxPx;
  assert.equal(selectConfigGrid(1,limit,{min:1.2000000000000002}),1.3);
  assert.equal(selectConfigGrid(2,limit,{max:1.1999999999999997}),1.1);
});

for(const [min,step,index,expected] of [
  [0,1e-7,3,3e-7], [1e-8,1e-7,3,3.1e-7],
  [0,2.5e-7,3,7.5e-7], [0,1.25e-7,3,3.75e-7],
  [0,1e-10,3,3e-10], [-.95,.01,95,0], [.05,.01,8,.13],
]) test(`Decimal grid formatting: min ${min}, step ${step}, index ${index}`,()=>{
  const limit={min,max:1,step},raw=min+index*step;
  const value=selectConfigGrid(raw,limit);
  assert.equal(value,expected);assert.equal(selectConfigGrid(value,limit),value);
  assert.ok(isOnConfigGrid(value,limit),'formatted result remains on its grid');
});

test('High-precision steps retain the index calculation rather than decimal cleanup',()=>{
  for(const step of [1e-11,.10000000000000002,Math.PI/360]) {
    const limit={min:0,max:10,step},expected=3*step;
    assert.equal(selectConfigGrid(expected,limit),expected);
  }
});

test('Index tolerance admits arithmetic and native serialization residue but rejects meaningful off-grid values',()=>{
  assert.ok(isOnConfigGrid(.1+.2,{min:0,max:1,step:.1}));
  // Current sliders reach index 5999; one million also exercises scientific
  // notation grids without treating a fractional index as rounding residue.
  const limit={min:.1,max:200000,step:.1};
  for(const index of [1,179,342,5999,1000000]) {
    const exact=limit.min+index*limit.step;
    const native=Number(exact.toPrecision(15));
    assert.ok(isOnConfigGrid(native,limit),`native residue at ${index}`);
    assert.ok(isOnConfigGrid(exact+Number.EPSILON*Math.max(1,Math.abs(exact)),limit),`arithmetic residue at ${index}`);
    for(const fraction of [1e-6,.001,.25,.5])assert.equal(isOnConfigGrid(exact+fraction*limit.step,limit),false,`fraction ${fraction} at ${index}`);
  }
});
