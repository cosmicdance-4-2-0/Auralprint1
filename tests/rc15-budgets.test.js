import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONFIG } from "../src/js/core/config.js";
import { normalizeParticleSafety } from "../src/js/core/particle-safety.js";
import { preferences, runtime, replacePreferences, resolveSettings } from "../src/js/core/preferences.js";
import { sanitizePreset, encodePresetPayload } from "../src/js/presets/preset-codec.js";
import { TrailSystem } from "../src/js/render/trail-system.js";
import { ParticleGovernor } from "../src/js/render/particle-governor.js";
import { Orb } from "../src/js/render/orb.js";
import { createVisualizerRuntime, createSpectralRingVisualizer, VisualizerRuntime } from "../src/js/render/visualizer-runtime.js";
import { createAnalysisFrame } from "../src/js/audio/analysis-frame.js";
import { state } from "../src/js/core/state.js";
import { initOrbs, reconcileOrbs, createRuntimeOrb, duplicateRuntimeOrb, removeRuntimeOrb, resetOrbTrailsForTrack, resetVisualizers } from "../src/js/render/orb-runtime.js";

const defaults = CONFIG.defaults.particleSafety;
const rgb = {r:.2,g:.4,b:.6};
const particles = {...CONFIG.defaults.orbs[0].particles, minPlacementDistancePx:0, emitPerSecond:1000, ttlSec:60};
function scene(count, policy=defaults) {
  const g=new ParticleGovernor(policy), trails=Array.from({length:count},()=>new TrailSystem());
  trails.forEach(t=>t.setGovernor(g)); g.setTrails(trails); return {g,trails};
}
function frame(g,trails,now=0,settings=particles,dt=1/60,x=now*100) {
  g.beginFrame(); trails.forEach(t=>t.updateAndEmit(dt,now,x,0,rgb,settings)); g.finishFrame();
  assert.equal(g.stats.requestedDemand,g.stats.emissions+g.stats.spatiallyRejectedDemand+g.stats.droppedDemand);
  assert.equal(g.stats.droppedDemand,g.stats.budgetRejectedDemand+g.stats.rateLimitedDemand+g.stats.retentionRejectedDemand);
  assert.ok(g.stats.emissions<=g.policy.maxEmissionsPerFrame); consistent(g); return g.getStats();
}
function consistent(g) {
  const nodes=[];
  for(const t of g.trails) {
    let prev=null,count=0;
    for(let n=t.particles.head;n;n=n.next){assert.equal(n.prev,prev);assert.equal(n.trail,t);prev=n;nodes.push(n);count++;}
    assert.equal(t.particles.tail,prev);assert.equal(t.particles.length,count);
  }
  assert.equal(nodes.length,g.activeParticles);assert.ok(nodes.length<=g.policy.maxActiveParticles);
  assert.equal(new Set(nodes).size,nodes.length);
  g.heap.forEach((n,i)=>{assert.equal(n.heapIndex,i);assert.ok(nodes.includes(n));if(i){const p=g.heap[Math.floor((i-1)/2)];assert.ok(p.particle.bornSec<n.particle.bornSec||(p.particle.bornSec===n.particle.bornSec&&p.sequence<n.sequence));}});
}
function ordered(g){return [...g.heap].sort((a,b)=>a.particle.bornSec-b.particle.bornSec||a.sequence-b.sequence);}

test("budgets: one integer normalization contract for sanitation, resolution and active governor",()=>{
  assert.deepEqual(defaults,{maxEmissionsPerFrame:512,maxActiveParticles:16384});
  assert.deepEqual(CONFIG.limits.particleSafety,{maxEmissionsPerFrame:{min:0,max:16384,step:1},maxActiveParticles:{min:0,max:1048576,step:1}});
  for(const input of [undefined,null,[],0,'512',true]) assert.deepEqual(normalizeParticleSafety(input),defaults);
  const old=structuredClone(preferences),settings=runtime.settings;
  try {for(const key of Object.keys(defaults)) {
    const max=CONFIG.limits.particleSafety[key].max;
    for(const [value,expected] of [[undefined,defaults[key]],[null,defaults[key]],[NaN,defaults[key]],[Infinity,defaults[key]],[-Infinity,defaults[key]],['0',defaults[key]],[{},defaults[key]],[.5,defaults[key]],[-1,0],[0,0],[max,max],[Number.MAX_SAFE_INTEGER,max]]) {
      const input={[key]:value,heap:[123],emissions:999}; const normalized=normalizeParticleSafety(input);
      assert.equal(normalized[key],expected); assert.equal(Object.keys(normalized).length,2);
      const sanitized=sanitizePreset({schema:10,prefs:{particleSafety:input}});assert.deepEqual(sanitized.particleSafety,normalized);
      replacePreferences({...structuredClone(CONFIG.defaults),particleSafety:input});resolveSettings();
      assert.deepEqual(runtime.settings.particleSafety,normalized); assert.deepEqual(new ParticleGovernor(input).policy,normalized);
      assert.deepEqual(encodePresetPayload({...sanitized,governor:{heap:[1]},particleSafety:{...normalized,retentionEvictionsTotal:3}}).prefs,sanitized);
    }
  }}finally{replacePreferences(old);runtime.settings=settings;}
});

test("budgets: schema 10 zero/upper limits round trip, historical missing defaults and Orb spacing survive",()=>{
  for(const policy of [{maxEmissionsPerFrame:0,maxActiveParticles:0},{maxEmissionsPerFrame:16384,maxActiveParticles:1048576}]) {
    const prefs=structuredClone(CONFIG.defaults);prefs.particleSafety=policy;prefs.orbs[0].particles.minPlacementDistancePx=0;
    prefs.orbs[0].particles.overlapRadiusPx=9;
    const payload=encodePresetPayload(prefs);assert.equal(payload.schema,10);assert.deepEqual(payload.prefs.particleSafety,policy);
    assert.deepEqual(sanitizePreset(payload),payload.prefs);assert.equal(payload.prefs.orbs[0].particles.minPlacementDistancePx,0);
    assert.equal('overlapRadiusPx' in payload.prefs.orbs[0].particles,false);
  }
  const historical=JSON.parse(readFileSync(new URL('./fixtures/legacy-presets.json',import.meta.url),'utf8'));
  for(const payload of [...historical,...Array.from({length:9},(_,i)=>({schema:i+2,prefs:{}}))]) assert.deepEqual(sanitizePreset(payload).particleSafety,defaults);
});

test("budgets: increasing capacity preserves nodes/fractions/priority; decreasing retires globally oldest with deterministic ties",()=>{
  const {g,trails}=scene(3,{maxEmissionsPerFrame:20,maxActiveParticles:12});
  try {
    for(const [i,time] of [[0,3],[1,1],[2,1],[0,2],[2,4],[1,1]])trails[i].emitAt(i,0,time,rgb);
    trails[0].emitAccumulator=.75;const nodes=ordered(g),heap=g.heap,priority=g.nextPriority;
    assert.equal(g.applyPolicy({maxEmissionsPerFrame:30,maxActiveParticles:40}),true);
    assert.equal(g.heap,heap);assert.deepEqual(ordered(g),nodes);assert.equal(g.nextPriority,priority);assert.equal(trails[0].emitAccumulator,.75);
    assert.equal(g.applyPolicy({maxEmissionsPerFrame:30,maxActiveParticles:3}),true);
    assert.deepEqual(ordered(g),nodes.slice(3));assert.equal(g.retentionEvictionsTotal,3);
    for(const n of nodes.slice(0,3)){assert.equal(n.heapIndex,-1);assert.equal(n.trail,null);assert.equal(n.next,null);assert.equal(n.prev,null);}
    consistent(g);assert.equal(g.applyPolicy(g.policy),false);
    for(let i=0;i<100;i++){g.applyPolicy({maxEmissionsPerFrame:20,maxActiveParticles:i%7});frame(g,trails,i/60);}
  }finally{g.dispose();}
});

test("budgets: zero emissions preserves history; zero retention trims all, refuses safely and recovers without debt",()=>{
  const {g,trails}=scene(2,{maxEmissionsPerFrame:30,maxActiveParticles:50});
  try {
    frame(g,trails);const retained=ordered(g);trails.forEach(t=>t.emitAccumulator=.25);
    g.applyPolicy({maxEmissionsPerFrame:0,maxActiveParticles:50});const stats=frame(g,trails,1/60);
    assert.deepEqual(ordered(g),retained);assert.equal(stats.emissions,0);assert.equal(stats.budgetRejectedDemand,32);
    assert.ok(trails.every(t=>Math.abs(t.emitAccumulator-(.25+1000/60)%1)<1e-10));
    g.applyPolicy({maxEmissionsPerFrame:16384,maxActiveParticles:0});assert.equal(g.activeParticles,0);
    assert.ok(retained.every(n=>n.trail===null));assert.ok(trails.every(t=>t.particles.tail===null));
    const priority=g.nextPriority;for(let i=0;i<5;i++){const s=frame(g,trails,(i+2)/60);assert.equal(s.emissions,0);assert.equal(s.budgetRejectedDemand,0);assert.equal(s.retentionRejectedDemand,s.requestedDemand);assert.ok(s.schedulingVisits<=trails.length);}
    assert.equal(g.nextPriority,priority);assert.equal(trails[0].emitAt(0,0,0,rgb),false);
    g.applyPolicy({maxEmissionsPerFrame:40,maxActiveParticles:100});const s=frame(g,trails,7/60);
    assert.ok(s.emissions>=32&&s.emissions<=34,"no refused whole-particle catch-up");
  }finally{g.dispose();}
});

test("budgets: actual upper-budget admissions exceed both retired immutable ceilings",()=>{
  const {g,trails}=scene(512,{maxEmissionsPerFrame:16384,maxActiveParticles:1048576});
  try {
    // Count/ownership checks avoid quadratic helper traversal in this large fixture.
    for(let f=0;f<2;f++) {
      g.beginFrame();trails.forEach(t=>t.updateAndEmit(1/30,f/30,0,0,rgb,particles));g.finishFrame();
      assert.equal(g.stats.emissions,16384);assert.equal(g.activeParticles,(f+1)*16384);
      assert.equal(g.heap.length,trails.reduce((n,t)=>n+t.particles.length,0));g.heap.forEach((n,i)=>assert.equal(n.heapIndex,i));
      assert.equal(g.stats.spatiallyRejectedDemand,0);
    }
    assert.equal(g.policy.maxActiveParticles,1048576);
    g.applyPolicy({maxEmissionsPerFrame:513,maxActiveParticles:20000});assert.equal(g.activeParticles,20000);
    g.beginFrame();trails.forEach(t=>t.updateAndEmit(1/60,1,0,0,rgb,particles));g.finishFrame();
    assert.equal(g.stats.emissions,513);assert.equal(g.activeParticles,20000);
  }finally{g.dispose();}
});

test("budgets: fairness survives changing/zero budgets, fractions and spacing remain separate eligibility",()=>{
  const {g,trails}=scene(4,{maxEmissionsPerFrame:1,maxActiveParticles:100});
  try {
    const served=new Set();
    for(let f=0;f<4;f++){g.applyPolicy({maxEmissionsPerFrame:f===1?0:1,maxActiveParticles:100});frame(g,trails,f/60);for(const t of trails)if(t.particles.length)served.add(t);}
    frame(g,trails,4/60);assert.equal(served.size,3);assert.ok(trails.every(t=>t.particles.length===1));
    g.applyPolicy({maxEmissionsPerFrame:2,maxActiveParticles:100});
    const s=frame(g,trails,5/60,{...particles,minPlacementDistancePx:.5},1/60,100);
    assert.equal(s.emissions,2);assert.equal(s.budgetRejectedDemand,2);assert.equal(s.spatiallyRejectedDemand,s.requestedDemand-4);
    const stationary=frame(g,trails,6/60,{...particles,minPlacementDistancePx:.5},1/60,100);
    assert.equal(stationary.emissions,2,"the previously unserved eligible owners still get service");
    assert.equal(stationary.budgetRejectedDemand,0);assert.equal(stationary.spatiallyRejectedDemand,stationary.requestedDemand-2);
    assert.equal(frame(g,trails,7/60,{...particles,minPlacementDistancePx:.5},1/60,100).emissions,0);
    assert.equal(frame(g,trails,8/60,particles).emissions,2,"zero spacing restores dense eligible demand");
    const guarded=frame(g,trails,9/60,particles,10);assert.ok(guarded.rateLimitedDemand>0);assert.equal(guarded.spatiallyRejectedDemand,0);
    g.applyPolicy({maxEmissionsPerFrame:100,maxActiveParticles:100});trails.forEach(t=>t.emitAccumulator=0);
    for(let f=0;f<3;f++)assert.equal(frame(g,trails,10+f/60,{...particles,emitPerSecond:15}).emissions,0);
    assert.equal(frame(g,trails,10+3/60,{...particles,emitPerSecond:15}).emissions,4);
  }finally{g.dispose();}
});

function activeRuntime(policy, injection) {
  const settingsRef={settings:{...structuredClone(CONFIG.defaults),particleSafety:policy}};
  const def=structuredClone(CONFIG.defaults.orbs[0]);def.particles.minPlacementDistancePx=0;
  const orb=new Orb(def),v=createVisualizerRuntime({settingsRef,particlePolicy:injection,createSpectralRing:()=>({type:'spectral-ring',update(){},render(){},reset(){},dispose(){},isVisible(){return false;}})});
  v.rebuild([orb]);return {settingsRef,orb,v};
}
const context={dtSec:1/60,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame()};
test("budgets: runtime synchronization preserves governor identity, trim precedes render, injection is isolated",()=>{
  const {settingsRef,orb,v}=activeRuntime({maxEmissionsPerFrame:4,maxActiveParticles:20});
  try {
    v.update(context);const g=orb.trail.governor,heap=g.heap,tail=orb.trail.particles.tail,phase=orb.angleRad;orb.trail.emitAccumulator=.75;
    settingsRef.settings={...settingsRef.settings,particleSafety:{maxEmissionsPerFrame:8,maxActiveParticles:30}};v.syncSettings();
    assert.equal(orb.trail.governor,g);assert.equal(g.heap,heap);assert.equal(orb.trail.particles.tail,tail);assert.equal(orb.angleRad,phase);assert.equal(orb.trail.emitAccumulator,.75);
    settingsRef.settings={...settingsRef.settings,particleSafety:{maxEmissionsPerFrame:1,maxActiveParticles:2}};
    v.render({clearFrame(){assert.equal(g.activeParticles,2);},drawOrb(){assert.equal(g.activeParticles,2);}},context);
    assert.equal(g.retentionEvictionsTotal,2);v.update(context);assert.equal(g.stats.emissions,1);
    const beforePause=orb.angleRad;v.update({...context,simPaused:true});assert.equal(g.stats.emissions,0);assert.equal(orb.angleRad,beforePause);
    v.reconcile([]);settingsRef.settings={...settingsRef.settings,particleSafety:{maxEmissionsPerFrame:0,maxActiveParticles:0}};v.update(context);v.reset('track');v.dispose();v.rebuild([]);assert.deepEqual(g.policy,{maxEmissionsPerFrame:0,maxActiveParticles:0});
  }finally{v.dispose();}
  const injected=activeRuntime({maxEmissionsPerFrame:16384,maxActiveParticles:1048576},{maxEmissionsPerFrame:1,maxActiveParticles:3});
  try {injected.settingsRef.settings.particleSafety={maxEmissionsPerFrame:0,maxActiveParticles:0};injected.v.update(context);assert.equal(injected.v.getParticleStats().emissions,1);assert.deepEqual(injected.orb.trail.governor.policy,{maxEmissionsPerFrame:1,maxActiveParticles:3});}finally{injected.v.dispose();}
});

test("budgets: canonical lifecycle, preset replacement and default reset never restore stale policy",()=>{
  const oldPrefs=structuredClone(preferences),oldSettings=runtime.settings,oldOrbs=[...state.orbs];
  try {
    const p=structuredClone(CONFIG.defaults);p.particleSafety={maxEmissionsPerFrame:3,maxActiveParticles:9};replacePreferences(p);resolveSettings();initOrbs();VisualizerRuntime.update(context);
    const source=state.orbs[0],g=source.trail.governor,tail=source.trail.particles.tail;
    const copy=duplicateRuntimeOrb(source.id),added=createRuntimeOrb();assert.deepEqual(g.policy,p.particleSafety);
    preferences.orbs.reverse();resolveSettings();reconcileOrbs();assert.equal(source.trail.particles.tail,tail);assert.equal(source.trail.governor,g);
    const payload=encodePresetPayload(preferences);payload.prefs.particleSafety={maxEmissionsPerFrame:2,maxActiveParticles:1};replacePreferences(sanitizePreset(payload));resolveSettings();reconcileOrbs();assert.deepEqual(g.policy,payload.prefs.particleSafety);assert.equal(g.activeParticles,1);
    removeRuntimeOrb(copy.id);removeRuntimeOrb(added.id);resetOrbTrailsForTrack();resetVisualizers('visuals');VisualizerRuntime.rebuild(state.orbs);assert.deepEqual(g.policy,payload.prefs.particleSafety);
    VisualizerRuntime.dispose();initOrbs();assert.equal(state.orbs[0].trail.governor,g);assert.deepEqual(g.policy,payload.prefs.particleSafety);
    replacePreferences(structuredClone(CONFIG.defaults));resolveSettings();initOrbs();assert.deepEqual(g.policy,defaults);
    replacePreferences({...structuredClone(CONFIG.defaults),orbs:[],particleSafety:{maxEmissionsPerFrame:0,maxActiveParticles:0}});resolveSettings();initOrbs();VisualizerRuntime.update(context);assert.deepEqual(g.policy,{maxEmissionsPerFrame:0,maxActiveParticles:0});assert.equal(g.activeParticles,0);
  }finally{VisualizerRuntime.dispose();replacePreferences(oldPrefs);runtime.settings=oldSettings;state.orbs=oldOrbs;}
});

test("budgets: full 1,048,576 retention boundary is usable, evicts one oldest and trims safely to zero",()=>{
  const {g,trails}=scene(1,{maxEmissionsPerFrame:16384,maxActiveParticles:1048576}),t=trails[0];
  try {
    // Retention-only admission probe; shared per-update admission is tested above.
    for(let i=0;i<1048576;i++)assert.equal(t.emitAt(i,0,0,rgb),true);
    assert.equal(g.activeParticles,1048576);assert.equal(t.particles.length,1048576);
    const oldest=t.particles.head;assert.equal(t.emitAt(1048576,0,0,rgb),true);
    assert.equal(g.activeParticles,1048576);assert.equal(oldest.trail,null);assert.equal(oldest.heapIndex,-1);assert.equal(g.retentionEvictionsTotal,1);
    assert.equal(t.particles.head.particle.xSim,1);assert.equal(t.particles.tail.particle.xSim,1048576);
    g.applyPolicy({maxEmissionsPerFrame:16384,maxActiveParticles:0});assert.equal(g.activeParticles,0);assert.equal(t.particles.head,null);assert.equal(t.particles.tail,null);assert.equal(g.retentionEvictionsTotal,1048577);
  }finally{g.dispose();}
});


test("budgets: both zero settings leave Orb motion and free Spectral Ring active, pause still refuses emission",()=>{
  const settingsRef={settings:structuredClone(CONFIG.defaults)};settingsRef.settings.particleSafety={maxEmissionsPerFrame:0,maxActiveParticles:0};settingsRef.settings.bands.overlay.ringSpeedRadPerSec=1;
  const orb=new Orb(settingsRef.settings.orbs[0]),stateRef={orbs:[orb],bands:{ringPhaseRad:0}};
  const v=createVisualizerRuntime({settingsRef,createSpectralRing:()=>createSpectralRingVisualizer({settingsRef,stateRef})});v.rebuild([orb]);
  try {const phase=orb.angleRad;v.update(context);assert.notEqual(orb.angleRad,phase);assert.ok(Math.abs(stateRef.bands.ringPhaseRad-1/60)<1e-10);assert.equal(v.getParticleStats().emissions,0);assert.equal(v.getParticleStats().activeParticles,0);v.update({...context,simPaused:true});assert.equal(v.getParticleStats().requestedDemand,0);}
  finally{v.dispose();}
});
