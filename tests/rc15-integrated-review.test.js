import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG} from '../src/js/core/config.js';
import {state} from '../src/js/core/state.js';
import {Orb} from '../src/js/render/orb.js';
import {TrailSystem} from '../src/js/render/trail-system.js';
import {ParticleGovernor} from '../src/js/render/particle-governor.js';
import {createVisualizerRuntime} from '../src/js/render/visualizer-runtime.js';
import {createAnalysisFrame} from '../src/js/audio/analysis-frame.js';
const rgb={r:1,g:0,b:0},p={...CONFIG.defaults.orbs[0].particles,emitPerSecond:1000,minPlacementDistancePx:0,ttlSec:60};
function owners(g){
 const nodes=new Set(),priorities=new Set();let prev=null;
 for(let t=g.nextPriority;t;t=t.priorityNext){assert.ok(!priorities.has(t));priorities.add(t);assert.equal(t.priorityPrev,prev);prev=t;}
 assert.equal(prev,g.priorityTail);assert.deepEqual(priorities,new Set(g.trails));
 for(const t of g.trails){let last=null,count=0;for(let n=t.particles.head;n;n=n.next){assert.equal(n.prev,last);assert.equal(n.trail,t);assert.ok(!nodes.has(n));nodes.add(n);last=n;count++;}assert.equal(last,t.particles.tail);assert.equal(count,t.particles.length);assert.equal(t.nextPending,null);assert.equal(t.pendingEmissions,0);}
 assert.equal(nodes.size,g.heap.length);g.heap.forEach((n,i)=>{assert.ok(nodes.has(n));assert.equal(n.heapIndex,i);if(i){const parent=g.heap[(i-1)>>1];assert.ok(parent.particle.bornSec<n.particle.bornSec||(parent.particle.bornSec===n.particle.bornSec&&parent.sequence<n.sequence));}});
}
function trails(count,policy){const g=new ParticleGovernor(policy),ts=Array.from({length:count},()=>new TrailSystem());ts.forEach(t=>t.setGovernor(g));g.setTrails(ts);return {g,ts};}
function prepare(g,ts,f){g.beginFrame();ts.forEach((t,i)=>t.updateAndEmit(1/60,f/60,f,0,rgb,i===0?{...p,emitPerSecond:2}:p));g.finishFrame();owners(g);}
test('integrated: eligible low-rate demand survives sustained competition, reorder and live policy changes without debt',()=>{
 const {g,ts}=trails(16,{maxEmissionsPerFrame:1,maxActiveParticles:20000});let eligible=0,served=0,maxMisses=0,misses=0;
 try{for(let f=1;f<=1800;f++){if(f%100===0){g.applyPolicy({maxEmissionsPerFrame:f%200?2:1,maxActiveParticles:20000});g.setTrails([...ts].reverse());}const before=ts[0].particles.length;const opportunity=Math.floor(ts[0].emitAccumulator+2/60)>0;if(opportunity)eligible++;prepare(g,ts,f);if(ts[0].particles.length>before){served++;misses=0;}else if(opportunity){misses++;maxMisses=Math.max(maxMisses,misses);}assert.ok(g.stats.emissions<=g.policy.maxEmissionsPerFrame);assert.ok(ts.every(t=>t.emitAccumulator>=0&&t.emitAccumulator<1));}
 assert.ok(eligible>50);assert.equal(served,eligible,'low-rate owner has priority before each next periodic opportunity');assert.equal(maxMisses,0);
 g.applyPolicy({maxEmissionsPerFrame:0,maxActiveParticles:20000});prepare(g,ts,1801);assert.equal(g.stats.emissions,0);g.applyPolicy({maxEmissionsPerFrame:16384,maxActiveParticles:20000});prepare(g,ts,1802);assert.ok(g.stats.emissions<=16*17,'no deferred catch-up');
 }finally{g.dispose();}
});
for(const fps of [120,60,10,5])test(`integrated synthetic 16-Orb history: ${fps} FPS covers TTL rotation; Trace suffix remains independent`,()=>{
 const old={width:state.widthPx,height:state.heightPx,dpr:state.dpr};state.widthPx=1280;state.heightPx=800;state.dpr=1;
 const settings=structuredClone(CONFIG.defaults);settings.particleSafety={maxEmissionsPerFrame:512,maxActiveParticles:65536};settings.orbs=Array.from({length:16},(_,i)=>({...structuredClone(settings.orbs[i%2]),id:`history-${i}`,startAngleRad:0,chirality:1}));
 for(const d of settings.orbs){d.motion.angularSpeedRadPerSec=.5;d.response.minRadiusFrac=d.response.maxRadiusFrac=.2;d.response.waveformRadialDisplaceFrac=0;d.particles={...d.particles,emitPerSecond:1000,ttlSec:14,minPlacementDistancePx:.5};d.trace={...d.trace,numLines:1000,lines:true};}
 const orbs=settings.orbs.map(d=>new Orb(d)),v=createVisualizerRuntime({settingsRef:{settings},createSpectralRing:()=>({id:'ring',type:'spectral-ring',update(){},dispose(){},isVisible(){return false;}})});v.rebuild(orbs);const frame={dtSec:Math.min(1/fps,1/30),motionDtSec:1/fps,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame()};let evicted=0,expired=0,emitted=0;
 try{for(let f=1;f<=20*fps;f++){frame.nowSec=f/fps;v.update(frame);const s=v.getParticleStats();evicted+=s.evicted;expired+=s.expired;emitted+=s.emissions;}const g=orbs[0].trail.governor;owners(g);assert.equal(evicted,0);assert.ok(expired>0);assert.equal(emitted,20*fps*16);
 for(const o of orbs){assert.ok(Math.abs(o.angleRad-(10%(2*Math.PI)))<1e-9);const head=o.trail.particles.head.particle,tail=o.trail.particles.tail.particle,history=tail.bornSec-head.bornSec;assert.ok(history>=14-2/fps-1e-9&&history<14);assert.ok(history*.5>2*Math.PI,'particle history covers a full revolution');const suffix=[...o.trail.particles.suffix(o.trace.numLines+1)],traceHistory=suffix.at(-1).bornSec-suffix[0].bornSec;
 if(fps===120){assert.ok(traceHistory*.5<2*Math.PI,'1000 segments cover only a partial rotation at 120 FPS');assert.equal(suffix.length,1001);}else{assert.ok(traceHistory*.5>2*Math.PI);assert.equal(suffix.length,o.trail.particles.length);}
 const stepAngle=Math.atan2(Math.sin(.5/fps),Math.cos(.5/fps));assert.ok(stepAngle>0,'sparse low-FPS history contains sampled positions, without interpolation');}
 }finally{v.dispose();Object.assign(state,{widthPx:old.width,heightPx:old.height,dpr:old.dpr});}
});
test('integrated: 200 lifecycle/policy churn cycles preserve survivors, release replaced owners and retain bounded scheduling work',()=>{
 const settingsRef={settings:structuredClone(CONFIG.defaults)},v=createVisualizerRuntime({settingsRef});let orbs=Array.from({length:16},(_,i)=>new Orb({...structuredClone(CONFIG.defaults.orbs[0]),id:`churn-${i}`,particles:{...p}}));v.rebuild(orbs);const g=orbs[0].trail.governor,heap=g.heap,ctx={dtSec:1/60,motionDtSec:1/60,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame()};const visits=[];
 try{for(let c=0;c<200;c++){
 settingsRef.settings={...settingsRef.settings,particleSafety:{maxEmissionsPerFrame:256,maxActiveParticles:2048}};v.update({...ctx,nowSec:c});const survivor=orbs[0],tail=survivor.trail.particles.tail,phase=survivor.angleRad,removed=orbs.at(-1),removedNodes=[...g.heap].filter(n=>n.trail===removed.trail);
 const replacement=new Orb({...structuredClone(CONFIG.defaults.orbs[0]),id:removed.id,particles:{...p}});orbs=[survivor,...orbs.slice(1,-1).reverse(),replacement];v.reconcile(orbs);assert.equal(survivor.trail.particles.tail,tail);assert.equal(survivor.angleRad,phase);assert.equal(survivor.trail.governor,g);assert.equal(g.heap,heap);assert.ok(removedNodes.every(n=>n.trail===null&&n.prev===null&&n.next===null&&n.heapIndex===-1));assert.equal(removed.trail.priorityPrev,null);assert.equal(removed.trail.priorityNext,null);
 settingsRef.settings={...settingsRef.settings,particleSafety:{maxEmissionsPerFrame:256,maxActiveParticles:1024}};v.render({clearFrame(){assert.ok(g.activeParticles<=1024);},drawOrb(o){for(const p of o.trail.particles)assert.ok(Number.isFinite(p.bornSec));},drawSpectralRing(){}},ctx);owners(g);
 if(c%10===0){v.reset(c%20?'track':'visuals');assert.equal(g.activeParticles,0);}v.update({...ctx,nowSec:c+.1});owners(g);visits.push(g.stats.schedulingVisits);assert.ok(g.stats.schedulingVisits<=16+256);
 }
 assert.equal(Math.max(...visits),Math.min(...visits),'comparable demand has constant scheduling visit count after churn');v.reconcile([]);owners(g);assert.equal(g.activeParticles,0);assert.equal(g.nextPriority,null);v.dispose();assert.equal(g.heap.length,0);assert.equal(g.trails.length,0);
 }finally{v.dispose();}
});
test('integrated: unordered transfer, TTL edits, oldest trim and empty-tail spacing preserve ownership',()=>{
 const source=new TrailSystem(),g=new ParticleGovernor({maxEmissionsPerFrame:1,maxActiveParticles:4});for(const born of [10,0,9,1])source.emitAt(born,0,born,rgb);source.emitAccumulator=.75;source.setGovernor(g);g.setTrails([source]);assert.equal(source.particles.birthOrderMonotonic,false);assert.equal(source.emitAccumulator,.75);
 try{source.expireParticles(10,2);assert.deepEqual([...source.particles].map(p=>p.bornSec),[10,9]);owners(g);g.applyPolicy({maxEmissionsPerFrame:1,maxActiveParticles:1});assert.deepEqual([...source.particles].map(p=>p.bornSec),[10]);assert.equal(source.particles.birthOrderMonotonic,true);source.expireParticles(11,1);assert.equal(source.particles.length,0);g.beginFrame();source.updateAndEmit(1/60,11,10,0,rgb,{...p,minPlacementDistancePx:.5});assert.equal(source.pendingEmissions,1);g.finishFrame();assert.equal(g.stats.emissions,1);owners(g);
 }finally{g.dispose();}
});
test('integrated: long-running phase modulo stays finite; track reset keeps phase and visual reset restores design',()=>{
 const settings=structuredClone(CONFIG.defaults);settings.orbs[0].particles.emitPerSecond=0;settings.orbs[0].motion.angularSpeedRadPerSec=1.5;settings.orbs[0].chirality=-1;const o=new Orb(settings.orbs[0]),v=createVisualizerRuntime({settingsRef:{settings}});v.rebuild([o]);const ctx={dtSec:1/30,motionDtSec:.2,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame()};
 try{for(let f=1;f<=3000;f++){ctx.nowSec=f*.2;v.update(ctx);assert.ok(o.angleRad>=0&&o.angleRad<2*Math.PI);}const expected=((o.startAngleRad-900)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);assert.ok(Math.abs(o.angleRad-expected)<1e-9);const phase=o.angleRad;v.reset('track');assert.equal(o.angleRad,phase);v.reset('visuals');assert.equal(o.angleRad,o.startAngleRad);assert.equal(o.trail.particles.length,0);
 }finally{v.dispose();}
});
