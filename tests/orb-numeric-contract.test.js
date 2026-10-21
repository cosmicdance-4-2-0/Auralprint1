import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/js/core/config.js';
import { normalizeOrbDef, replacePreferences, resolveSettings, preferences, runtime } from '../src/js/core/preferences.js';
import { sanitizePreset, encodePresetPayload, decodePresetPayload } from '../src/js/presets/preset-codec.js';
import { continuousOrbCases, readNumeric, writeNumeric } from './helpers/orb-numeric-cases.js';
import { Renderer } from '../src/js/render/renderer.js';
import { state } from '../src/js/core/state.js';
import { ParticleList } from '../src/js/render/particle-list.js';

for (const [key,group,field,limits,precise] of continuousOrbCases) {
  test(`AUD-009: ${key} continuous precision, bounds, invalid input and schema-10 roundtrip`, () => {
    const fallback = structuredClone(CONFIG.defaults.orbs[0]);
    // Keep existing dependent constraints satisfied while checking each bound.
    fallback.particles.sizeMaxPx = CONFIG.limits.particles.sizeMaxPx.max;
    fallback.particles.sizeToMinSec = CONFIG.limits.particles.sizeToMinSec.min;
    fallback.particles.ttlSec = CONFIG.limits.particles.ttlSec.max;
    for (const value of [limits.min, limits.min + (limits.max-limits.min)*1e-7, precise, limits.max - (limits.max-limits.min)*1e-7, limits.max]) {
      const incoming=structuredClone(fallback); writeNumeric(incoming,group,field,value);
      const normalized=normalizeOrbDef(incoming,fallback); assert.equal(readNumeric(normalized,group,field),value);
      const prefs=sanitizePreset({schema:11,prefs:{orbs:[incoming]}});
      const payload=encodePresetPayload(prefs); assert.equal(payload.schema,11);
      assert.equal(readNumeric(sanitizePreset(decodePresetPayload(payload)).orbs[0],group,field),value);
    }
    for (const value of [NaN, Infinity, -Infinity, '0.123456', null]) {
      const incoming=structuredClone(fallback); writeNumeric(incoming,group,field,value);
      assert.equal(readNumeric(normalizeOrbDef(incoming,fallback),group,field),readNumeric(fallback,group,field));
    }
  });
}

test('AUD-009: trace count ceil normalization is shared by import, direct changes, encode and renderer', () => {
  const old=structuredClone(preferences),ctx=state.ctx;
  try {
    for(const [raw,expected] of [[15.5,16],[10,10],[11,11],[15,15],[16,16],[999.1,1000],[1000,1000],[9.5,10],[1000.5,1000],[NaN,10],[Infinity,10],['15.5',10]]){
      const fallback=structuredClone(CONFIG.defaults.orbs[0]);fallback.trace.numLines=10;
      const orb=normalizeOrbDef({...fallback,trace:{...fallback.trace,numLines:raw}},fallback);
      assert.equal(orb.trace.numLines,expected);
      const prefs=sanitizePreset({schema:11,prefs:{orbs:[{id:'A',trace:{numLines:raw}}]}});
      assert.equal(prefs.orbs[0].trace.numLines,expected);
      replacePreferences(prefs);resolveSettings();
      assert.equal(runtime.settings.orbs[0].trace.numLines,expected);
      assert.equal(sanitizePreset(decodePresetPayload(encodePresetPayload(preferences))).orbs[0].trace.numLines,expected);
      let lines=0;state.ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){lines++},stroke(){},arc(){},fill(){}};
      const particles=new ParticleList();for(let i=0;i<1100;i++)particles.append({particle:{xSim:i,ySim:0,bornSec:0}});
      Renderer.drawOrb({trail:{particles},particles:orb.particles,trace:{...orb.trace,lines:true,lineColorMode:'fixed'}},0,0);
      assert.equal(lines,expected,'rendered segment count agrees with canonical count');
    }
  }finally{state.ctx=ctx;replacePreferences(old);resolveSettings();}
});

test('AUD-009: unrelated settings preserve precise independent Orb values and inactive targets',()=>{
  const old=structuredClone(preferences);
  try{
    replacePreferences(sanitizePreset({schema:11,prefs:{bands:{count:3},orbs:[{id:'A',bandIds:[0,255],motion:{angularSpeedRadPerSec:.123456},trace:{numLines:15.5}},{id:'B',bandIds:[255],motion:{angularSpeedRadPerSec:.234567},trace:{numLines:17}}]}}));resolveSettings();
    const orbs=structuredClone(preferences.orbs);
    preferences.audio.playbackVolume=.4;resolveSettings();
    assert.deepEqual(preferences.orbs,orbs);assert.deepEqual(runtime.settings.orbs,orbs);
    assert.deepEqual(sanitizePreset(decodePresetPayload(encodePresetPayload(preferences))).orbs,orbs);
  }finally{replacePreferences(old);resolveSettings();}
});
