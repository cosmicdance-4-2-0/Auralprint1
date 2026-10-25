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

test('Ring maximum is not an editing index; phase endpoint is exactly TAU and wraps only at its owner',()=>{
  const ring=CONFIG.limits.bands.ringSpeedRadPerSec,phase=CONFIG.limits.orbs.startAngleRad;
  assert.equal(isOnConfigGrid(ring.max,ring),false);assert.equal(selectConfigGrid(ring.max,ring),6.28);
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
    const normalized=sanitizePreset({schema,prefs}),shared=encodePresetPayload(normalized).prefs;
    assert.deepEqual(shared,normalized);
    for(const item of individualSliders)assert.equal(readPath(normalized,item.path),item.legacy);
    assert.equal(normalized.audio.rmsGain,.123456);assert.equal(normalized.bands.overlay.pointSizePx,3.456);
    assert.equal(normalized.bands.overlay.ringSpeedRadPerSec,2*Math.PI);
  }
  const defaults=sanitizePreset({schema:12,prefs:{}});
  assert.equal(defaults.orbs[0].motion.angularSpeedRadPerSec,Math.PI/2);
  assert.equal(isOnConfigGrid(Math.PI/2,CONFIG.limits.motion.angularSpeedRadPerSec),false);
});

test('Exact legacy dependency bounds take precedence over floating membership tolerance',()=>{
  const limit=CONFIG.limits.particles.sizeMaxPx;
  assert.equal(selectConfigGrid(1,limit,{min:1.2000000000000002}),1.3);
  assert.equal(selectConfigGrid(2,limit,{max:1.1999999999999997}),1.1);
});
