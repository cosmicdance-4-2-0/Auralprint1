import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIG } from "../src/js/core/config.js";
import { PRESET_SCHEMA_VERSION } from "../src/js/core/constants.js";
import { normalizeOrbDef, preferences, runtime, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { sanitizePreset, encodePresetPayload } from "../src/js/presets/preset-codec.js";
import { state } from "../src/js/core/state.js";
import { createAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { TrailSystem } from "../src/js/render/trail-system.js";
import { ParticleGovernor } from "../src/js/render/particle-governor.js";
import { Orb } from "../src/js/render/orb.js";
import { createVisualizerRuntime, VisualizerRuntime } from "../src/js/render/visualizer-runtime.js";
import { initOrbs, reconcileOrbs, createRuntimeOrb, duplicateRuntimeOrb, removeRuntimeOrb, resetOrbTrailsForTrack, resetVisualizers } from "../src/js/render/orb-runtime.js";

const rgb = { r: .2, g: .4, b: .6 };
const settings = (overrides = {}) => ({ ...CONFIG.defaults.orbs[0].particles, ...overrides });
function tick(trail, x = 0, y = 0, dt = 1 / 60, now = 0, overrides = {}, dpr = 1) {
  trail.updateAndEmit(dt, now, x, y, rgb, settings(overrides), dpr);
  const stats = trail.governor.getStats();
  assert.equal(stats.requestedDemand, stats.emissions + stats.spatiallyRejectedDemand + stats.droppedDemand);
  return stats;
}
function shared(count, policy) {
  const governor = new ParticleGovernor(policy);
  const trails = Array.from({ length: count }, () => new TrailSystem());
  trails.forEach(t => t.setGovernor(governor)); governor.setTrails(trails);
  return { governor, trails };
}
function consistent(governor) {
  assert.equal(governor.heap.length, governor.trails.reduce((n,t) => n + t.particles.length, 0));
  governor.heap.forEach((node, i) => { assert.equal(node.heapIndex, i); assert.ok(node.trail); });
  for (const trail of governor.trails) {
    let count = 0, prev = null;
    for (let node = trail.particles.head; node; node = node.next) {
      assert.equal(node.prev, prev); assert.equal(node.trail, trail); prev = node; count++;
    }
    assert.equal(trail.particles.tail, prev); assert.equal(trail.particles.length, count);
  }
}

test("spacing default: first emission, repeated position, below/exact/above threshold, and incremental motion", () => {
  const trail = new TrailSystem();
  try {
    assert.equal(tick(trail).emissions, 1);
    const first = trail.particles.tail;
    assert.equal(tick(trail).emissions, 0);
    assert.equal(trail.governor.stats.spatiallyRejectedDemand, 4);
    for (const x of [.1, .2, .3, .49]) assert.equal(tick(trail, x).emissions, 0);
    assert.equal(trail.particles.tail, first, "small moves compare to the retained tail, not last emitter position");
    assert.equal(tick(trail, .5).emissions, 1, "exact threshold accepted");
    assert.equal(tick(trail, 1.01).emissions, 1);
    assert.equal(trail.particles.length, 3);
    assert.equal(first.trail, trail, "spacing never deletes history");
    assert.ok(trail.governor.stats.placementComparisons <= 1);
  } finally { trail.dispose(); }
});

test("spacing uses squared two-dimensional distance and only the most recent retained position", () => {
  const trail = new TrailSystem();
  try {
    tick(trail, 1, 0);
    for (const [x,y] of [[0,1],[-1,0],[0,-1],[1,.01]]) assert.equal(tick(trail,x,y).emissions,1);
    assert.equal(trail.particles.length,5,"returning near an old particle is allowed");
    trail.reset(); tick(trail);
    assert.equal(tick(trail,.3,.399).emissions,0);
    assert.equal(tick(trail,.3,.4).emissions,1,"3-4-5 exact squared threshold");
  } finally { trail.dispose(); }
});

for (const dpr of [1,2]) test(`CSS spacing and production Orb DPR wiring at DPR ${dpr}`, () => {
  const trail = new TrailSystem(), oldSize = [state.widthPx,state.heightPx,state.dpr];
  const def = structuredClone(CONFIG.defaults.orbs[0]); def.motion.angularSpeedRadPerSec = 0;
  def.response = { minRadiusFrac: 0, maxRadiusFrac: 0, waveformRadialDisplaceFrac: 0 };
  const orb = new Orb(def);
  try {
    tick(trail, 0, 0, 1/60, 0, {}, dpr);
    assert.equal(tick(trail, .49*dpr, 0, 1/60, 0, {}, dpr).emissions,0);
    assert.equal(tick(trail, .5*dpr, 0, 1/60, 0, {}, dpr).emissions,1);
    state.widthPx = state.heightPx = 100*dpr; state.dpr = dpr;
    orb.step(1/60,0,null,null,0);
    orb.centerXFrac += .0049; orb.step(1/60,0,null,null,0);
    assert.equal(orb.trail.particles.length,1);
    orb.centerXFrac = def.centerXFrac + .005; orb.step(1/60,0,null,null,0);
    assert.equal(orb.trail.particles.length,2);
  } finally { trail.dispose(); orb.trail.dispose(); [state.widthPx,state.heightPx,state.dpr] = oldSize; }
});

test("stationary trail becomes eligible after TTL expiry, eviction, or explicit reset without a coordinate cache", () => {
  const { governor:g, trails:[a,b] } = shared(2,{maxActiveParticles:1});
  try {
    g.beginFrame(); a.updateAndEmit(1/60,0,2,3,rgb,settings()); g.finishFrame();
    const expired = a.particles.tail;
    g.beginFrame(); a.updateAndEmit(1/60,6,2,3,rgb,settings()); g.finishFrame();
    assert.equal(g.stats.expired,1); assert.equal(g.stats.emissions,1); assert.equal(expired.trail,null);
    const evicted = a.particles.tail;
    b.emitAt(2,3,7,rgb); assert.equal(a.particles.tail,null); assert.equal(evicted.trail,null);
    g.beginFrame(); a.updateAndEmit(1/60,7,2,3,rgb,settings()); g.finishFrame();
    assert.equal(g.stats.emissions,1); assert.equal(a.particles.length,1);
    a.reset(); g.beginFrame(); a.updateAndEmit(1/60,7,2,3,rgb,settings()); g.finishFrame();
    assert.equal(g.stats.emissions,1); consistent(g);
  } finally { g.dispose(); }
});

test("independent Orbs at identical locations admit independently and suppress before shared allocation", () => {
  const { governor:g, trails } = shared(2,{maxEmissionsPerFrame:2});
  try {
    g.beginFrame(); trails.forEach(t => t.updateAndEmit(1/60,0,0,0,rgb,settings()));
    assert.deepEqual(trails.map(t=>t.pendingEmissions),[1,1]);
    assert.equal(g.stats.emissions,0); g.finishFrame();
    assert.equal(g.stats.emissions,2); assert.equal(g.stats.spatiallyRejectedDemand,6); assert.equal(g.stats.droppedDemand,0);
    g.beginFrame(); trails.forEach(t => t.updateAndEmit(1/60,1,0,0,rgb,settings()));
    const priority = g.nextPriority;
    assert.deepEqual(trails.map(t=>t.pendingEmissions),[0,0]); g.finishFrame();
    assert.equal(g.stats.emissions,0); assert.equal(g.stats.droppedDemand,0); assert.equal(g.nextPriority,priority);
  } finally { g.dispose(); }
});

test("many high-rate stationary Orbs cannot consume fairness slots or starve moving eligible Orbs", () => {
  const { governor:g, trails } = shared(18,{maxEmissionsPerFrame:1});
  const stationary = trails.slice(0,16), moving = trails.slice(16);
  try {
    stationary.forEach(t => t.emitAt(0,0,0,rgb));
    for (let f=1;f<=20;f++) {
      g.beginFrame();
      trails.forEach((t,i)=>t.updateAndEmit(1/60,f/60,i<16?0:f,0,rgb,settings({emitPerSecond:1000})));
      assert.ok(stationary.every(t=>t.pendingEmissions===0));
      g.finishFrame(); assert.equal(g.stats.emissions,1); assert.equal(g.stats.droppedDemand,1);
      assert.ok(g.stats.placementComparisons<=18); consistent(g);
    }
    assert.deepEqual(moving.map(t=>t.particles.length),[10,10]);
    assert.ok(stationary.every(t=>t.particles.length===1));
  } finally { g.dispose(); }
});

test("rate below frame rate remains authoritative even after large movement; fractions survive spatial rejection", () => {
  const trail = new TrailSystem();
  try {
    let admitted = 0;
    for (let f=0;f<60;f++) admitted += tick(trail,f*10,0,1/60,f/60,{emitPerSecond:30}).emissions;
    assert.equal(admitted,30); assert.equal(trail.emitAccumulator,0);
    trail.reset();
    assert.equal(tick(trail,0,0,1/60,0,{emitPerSecond:90}).emissions,1); assert.equal(trail.emitAccumulator,.5);
    assert.equal(tick(trail,0,0,1/60,0,{emitPerSecond:90}).emissions,0); assert.equal(trail.emitAccumulator,0);
    assert.equal(tick(trail,0,0,1/60,0,{emitPerSecond:90}).emissions,0); assert.equal(trail.emitAccumulator,.5);
    assert.equal(tick(trail,100,0,1/60,0,{emitPerSecond:30}).emissions,1); assert.equal(trail.emitAccumulator,0);
    for (let f=0;f<1000;f++) tick(trail,100,0,1/60,0,{emitPerSecond:1000});
    assert.ok(trail.emitAccumulator<1);
    assert.equal(tick(trail,200,0,1/60,0,{emitPerSecond:1000}).emissions,1,"no deferred whole debt");
    assert.equal(tick(trail,300,0,0,0,{emitPerSecond:1000}).emissions,0);
  } finally { trail.dispose(); }
});

test("zero fully bypasses comparisons, preserves duplicate rate demand, and obeys both global ceilings", () => {
  const { governor:g, trails } = shared(16,{maxEmissionsPerFrame:7,maxActiveParticles:11});
  try {
    for (let f=0;f<20;f++) {
      g.beginFrame(); trails.forEach(t=>t.updateAndEmit(1/60,f/60,0,0,rgb,settings({minPlacementDistancePx:0})));
      assert.ok(trails.every(t=>t.pendingEmissions===4)); g.finishFrame();
      assert.equal(g.stats.emissions,7); assert.equal(g.stats.requestedDemand,64); assert.equal(g.stats.droppedDemand,57);
      assert.equal(g.stats.spatiallyRejectedDemand,0); assert.equal(g.stats.placementComparisons,0);
      assert.equal(g.activeParticles,Math.min((f+1)*7,11)); consistent(g);
    }
  } finally { g.dispose(); }
});

test("nonzero default still enforces the canonical aggregate ceilings with 1024 useful moving candidates", () => {
  const { governor:g, trails } = shared(1024);
  try {
    for (let f=0;f<34;f++) {
      g.beginFrame(); trails.forEach(t=>t.updateAndEmit(1/60,f/60,f,0,rgb,settings()));
      g.finishFrame();
      assert.equal(g.stats.emissions,512); assert.equal(g.stats.spatiallyRejectedDemand,3072); assert.equal(g.stats.droppedDemand,512);
      assert.equal(g.activeParticles,Math.min((f+1)*512,16384));
      assert.equal(g.stats.evicted,f<32?0:512); consistent(g);
    }
  } finally { g.dispose(); }
});

test("running spacing changes preserve particles and fractions, and paused runtime emits nothing", () => {
  const def = structuredClone(CONFIG.defaults.orbs[0]); const orb = new Orb(def), v = createVisualizerRuntime();
  const frame = { dtSec:1/60,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame() };
  v.rebuild([orb]);
  try {
    v.update(frame); const tail=orb.trail.particles.tail, phase=orb.angleRad;
    orb.trail.emitAccumulator=.5; def.particles.minPlacementDistancePx=0; orb.syncFromDef(def);
    assert.equal(orb.angleRad,phase); assert.equal(orb.trail.particles.tail,tail); assert.equal(orb.trail.emitAccumulator,.5);
    frame.simPaused=true; v.update(frame); assert.equal(v.getParticleStats().requestedDemand,0); assert.equal(orb.trail.particles.tail,tail);
    frame.simPaused=false; v.update(frame); assert.equal(v.getParticleStats().emissions,4); assert.equal(orb.trail.emitAccumulator,.5);
    def.particles.minPlacementDistancePx=10; orb.syncFromDef(def);
    assert.equal(tail.trail,orb.trail); consistent(orb.trail.governor);
  } finally { v.dispose(); }
});

test("schema 10 spacing round trip, absent and invalid values, and obsolete overlap remains unrelated", () => {
  assert.equal(PRESET_SCHEMA_VERSION,10);
  assert.deepEqual(CONFIG.limits.particles.minPlacementDistancePx,{min:0,max:10,step:.1});
  assert.ok(Object.isFrozen(CONFIG.limits.particles.minPlacementDistancePx));
  const prefs=structuredClone(CONFIG.defaults); prefs.orbs[0].particles.minPlacementDistancePx=0; prefs.orbs[1].particles.minPlacementDistancePx=2.3;
  prefs.orbs[0].particles.overlapRadiusPx=10; prefs.orbs[0].particles.spatiallyRejectedDemand=123;
  const encoded=encodePresetPayload(prefs);
  assert.equal(encoded.schema,10); assert.deepEqual(encoded.prefs.orbs.map(o=>o.particles.minPlacementDistancePx),[0,2.3]);
  assert.equal('overlapRadiusPx' in encoded.prefs.orbs[0].particles,false);
  assert.equal('spatiallyRejectedDemand' in encoded.prefs.orbs[0].particles,false);
  assert.deepEqual(sanitizePreset(encoded),encoded.prefs);
  for (const [value,expected] of [[undefined,.5],[null,.5],[NaN,.5],[Infinity,.5],[-Infinity,.5],['0',.5],[{},.5],[-1,0],[11,10],[0,0],[.1,.1]]) {
    const input={id:'A',particles:{minPlacementDistancePx:value,overlapRadiusPx:9}};
    assert.equal(normalizeOrbDef(input,CONFIG.defaults.orbs[0]).particles.minPlacementDistancePx,expected);
    assert.equal(sanitizePreset({schema:10,prefs:{orbs:[input]}}).orbs[0].particles.minPlacementDistancePx,expected);
    const trail=new TrailSystem();
    try { tick(trail,0,0,1/60,0,{minPlacementDistancePx:value}); assert.equal(trail.particles.length,expected===0?4:1); }
    finally { trail.dispose(); }
  }
  const legacy=JSON.parse(readFileSync(new URL('./fixtures/legacy-presets.json',import.meta.url),'utf8'));
  for (const schema of [2,3,4,5,6,7,8,9,10]) {
    const next=sanitizePreset({schema,prefs:{orbs:[{id:'A',chanId:'R',particles:{overlapRadiusPx:7}}],particles:{overlapRadiusPx:8}}});
    assert.equal(next.orbs[0].particles.minPlacementDistancePx,.5); assert.equal(next.orbs[0].chanId,'R');
    assert.equal('overlapRadiusPx' in next.orbs[0].particles,false);
  }
  for (const fixture of legacy) {
    const next=sanitizePreset(fixture);
    assert.ok(next.orbs.every(o=>o.particles.minPlacementDistancePx===.5),`historical schema ${fixture.schema}`);
  }
});

test("canonical creation, duplication, ID reconciliation, preset apply, track/visual reset, rebuild and disposal", () => {
  const oldPrefs=structuredClone(preferences),oldSettings=runtime.settings,oldOrbs=[...state.orbs];
  const frame={dtSec:1/60,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame()};
  try {
    const prefs=structuredClone(CONFIG.defaults); prefs.orbs[0].particles.minPlacementDistancePx=2.3;
    replacePreferences(prefs); resolveSettings(); initOrbs(); VisualizerRuntime.update(frame);
    const source=state.orbs[0],tail=source.trail.particles.tail,phase=source.angleRad;
    const duplicate=duplicateRuntimeOrb(source.id),copy=state.orbs.find(o=>o.id===duplicate.id);
    assert.equal(copy.particles.minPlacementDistancePx,2.3); assert.equal(copy.trail.particles.length,0);
    const added=createRuntimeOrb(); assert.equal(state.orbs.find(o=>o.id===added.id).particles.minPlacementDistancePx,.5);
    preferences.orbs.reverse(); resolveSettings(); reconcileOrbs();
    assert.equal(state.orbs.find(o=>o.id===source.id),source); assert.equal(source.trail.particles.tail,tail); assert.equal(source.angleRad,phase);
    const encoded=encodePresetPayload(preferences); replacePreferences(sanitizePreset(encoded)); resolveSettings(); reconcileOrbs();
    assert.equal(state.orbs.find(o=>o.id===source.id),source); assert.equal(source.trail.particles.tail,tail);
    assert.equal(removeRuntimeOrb(duplicate.id),true); assert.equal(copy.trail.particles.tail,null);
    resetOrbTrailsForTrack(); assert.equal(source.trail.particles.tail,null); assert.equal(tail.trail,null);
    assert.equal(source.angleRad,phase); VisualizerRuntime.update(frame); assert.equal(source.trail.particles.length,1);
    resetVisualizers("visuals"); assert.equal(source.angleRad,source.startAngleRad); assert.equal(source.trail.particles.tail,null);
    VisualizerRuntime.update(frame); const retained=source.trail.particles.tail;
    VisualizerRuntime.rebuild(state.orbs); assert.equal(source.trail.particles.tail,retained);
    const governor=source.trail.governor; consistent(governor); VisualizerRuntime.dispose();
    assert.equal(governor.heap.length,0); assert.equal(retained.trail,null);
    replacePreferences({...structuredClone(CONFIG.defaults),orbs:[]}); resolveSettings(); initOrbs(); VisualizerRuntime.update(frame);
    assert.equal(VisualizerRuntime.getParticleStats().emissions,0); assert.deepEqual(state.orbs,[]);
  } finally { VisualizerRuntime.dispose(); replacePreferences(oldPrefs); runtime.settings=oldSettings; state.orbs=oldOrbs; }
});
