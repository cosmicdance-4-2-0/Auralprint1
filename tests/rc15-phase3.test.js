import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/js/core/config.js';
import { preferences, runtime, replacePreferences, resolveSettings } from '../src/js/core/preferences.js';
import { normalizeOrbCollection, createOrb, duplicateOrb } from '../src/js/core/orb-collection.js';
import { decodePresetPayload, sanitizePreset, encodePresetPayload } from '../src/js/presets/preset-codec.js';
import { UrlPreset } from '../src/js/presets/url-preset.js';
import { state } from '../src/js/core/state.js';
import { createAnalysisFrame } from '../src/js/audio/analysis-frame.js';
import { Orb } from '../src/js/render/orb.js';
import { createVisualizerRuntime, VisualizerRuntime } from '../src/js/render/visualizer-runtime.js';
import { initOrbs, reconcileOrbs, createRuntimeOrb, duplicateRuntimeOrb } from '../src/js/render/orb-runtime.js';
import { Renderer } from '../src/js/render/renderer.js';
import { ColorPolicy } from '../src/js/render/color-policy.js';

const cap = CONFIG.limits.orbs.maxCount;
const color = { r:.2,g:.4,b:.6 };
const defs = (count, spacing = .5) => normalizeOrbCollection(Array.from({length:count},(_,i)=>({id:`ORB${i}`,particles:{minPlacementDistancePx:spacing}})));
const overLimit = error => error instanceof RangeError && error.code === 'orb-limit-exceeded';
function scene(count, spacing = .5) {
  const orbs=defs(count, spacing).map(d=>new Orb(d)), v=createVisualizerRuntime();v.rebuild(orbs);
  const context={dtSec:1/60,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame()};
  return {orbs,v,context};
}
function canvas() {
  const calls={},arcs=[],points=[],styles={},strokes=[],fills=[];
  const ctx=new Proxy(styles,{ get:(_t,key)=>(...args)=>{
    calls[key]=(calls[key]||0)+1;
    if(key==='arc')arcs.push(args);
    if(key==='moveTo'||key==='lineTo')points.push([key,...args]);
    if(key==='stroke')strokes.push(styles.strokeStyle);
    if(key==='fill')fills.push(styles.fillStyle);
  },set:(t,key,value)=>{t[key]=value;return true;}});
  return {ctx,calls,arcs,points,strokes,fills};
}
function savedEnvironment() {
  const prefs=structuredClone(preferences),settings=runtime.settings,orbs=state.orbs,ctx=state.ctx;
  const dimensions=[state.widthPx,state.heightPx,state.dpr],phase=state.bands.ringPhaseRad;
  runtime.settings=structuredClone(CONFIG.defaults);state.widthPx=state.heightPx=100;state.dpr=1;
  return ()=>{replacePreferences(prefs);runtime.settings=settings;state.orbs=orbs;state.ctx=ctx;[state.widthPx,state.heightPx,state.dpr]=dimensions;state.bands.ringPhaseRad=phase;};
}

test('RC-15 phase 3: immutable admission policy accepts zero and exactly 4096; rejects 4097 before element access',()=>{
  assert.equal(cap,4096);assert.ok(Object.isFrozen(CONFIG.limits.orbs));
  assert.throws(()=>{CONFIG.limits.orbs.maxCount=8192;},TypeError);
  assert.deepEqual(normalizeOrbCollection([]),[]);
  const exact=defs(cap);assert.equal(exact.length,cap);
  assert.equal(decodePresetPayload({schema:10,prefs:{orbs:exact}}).ok,true);
  assert.equal(sanitizePreset({schema:10,prefs:{orbs:exact}}).orbs.length,cap);
  const oversized=new Array(cap+1);Object.defineProperty(oversized,0,{get(){throw Error('must not normalize oversized elements');}});
  assert.throws(()=>normalizeOrbCollection(oversized),overLimit);
  assert.throws(()=>sanitizePreset({schema:10,prefs:{orbs:oversized}}),overLimit);
  assert.throws(()=>encodePresetPayload({orbs:oversized}),overLimit);
  assert.deepEqual(decodePresetPayload({schema:10,prefs:{orbs:oversized}}),{ok:false,code:'orb-limit-exceeded'});
});

test('RC-15 phase 3: admission rejection includes both schema-9 forms, respecting top-level precedence',()=>{
  const oversized=new Array(cap+1),node={type:'orbs',settings:oversized};
  for(const prefs of [{orbs:oversized},{scene:{nodes:[node]}}]){
    assert.equal(decodePresetPayload({schema:9,prefs}).code,'orb-limit-exceeded');
    assert.throws(()=>sanitizePreset({schema:9,prefs}),overLimit);
  }
  const prefs={orbs:[],scene:{nodes:[node]}};
  assert.equal(decodePresetPayload({schema:9,prefs}).ok,true);
  assert.deepEqual(sanitizePreset({schema:9,prefs}).orbs,[]);
  for(const schema of [2,3,4,5,6,7,8,9,10]){
    assert.equal(decodePresetPayload({schema,prefs:{orbs:oversized}}).code,'orb-limit-exceeded');
    assert.equal(sanitizePreset({schema,prefs:{orbs:[]}}).orbs.length,0);
  }
});

test('RC-15 phase 3: oversized import/replacement/resolution preserves prior preferences and runtime references',()=>{
  const restore=savedEnvironment(),oldLocation=globalThis.location;
  try{
    const p=structuredClone(preferences),prefOrbs=preferences.orbs,settings=runtime.settings;
    const oversized=Array.from({length:cap+1},()=>({id:'ORB0'}));
    assert.throws(()=>replacePreferences({...p,orbs:oversized}),overLimit);
    assert.deepEqual(preferences,p);assert.equal(preferences.orbs,prefOrbs);
    globalThis.location={hash:'#p='+Buffer.from(JSON.stringify({schema:10,prefs:{orbs:oversized}})).toString('base64url')};
    assert.equal(UrlPreset.applyFromLocationHash(),false);
    assert.deepEqual(preferences,p);assert.equal(preferences.orbs,prefOrbs);assert.equal(runtime.settings,settings);
    preferences.orbs=oversized;assert.throws(resolveSettings,overLimit);assert.equal(runtime.settings,settings);
    preferences.orbs=prefOrbs;
  }finally{restore();globalThis.location=oldLocation;}
});

test('RC-15 phase 3: Add/Duplicate refuse at cap before reading identities; no persistent or runtime change',()=>{
  const restore=savedEnvironment();
  try{
    const collection=new Array(cap);Object.defineProperty(collection,0,{get(){assert.fail('allocation must not scan at cap');}});
    assert.equal(createOrb(collection),null);assert.equal(duplicateOrb(collection,'ORB0'),null);
    replacePreferences({...structuredClone(CONFIG.defaults),orbs:defs(cap)});resolveSettings();initOrbs();
    const source=state.orbs[0];source.angleRad=1.25;source.trail.emitAt(1,2,0,color);source.trail.emitAccumulator=.5;
    const node=source.trail.particles.head,prefRef=preferences.orbs,settings=runtime.settings,adapters=VisualizerRuntime.getVisualizers();
    assert.equal(createRuntimeOrb(),null);assert.equal(duplicateRuntimeOrb(source.id),null);
    assert.equal(preferences.orbs,prefRef);assert.equal(runtime.settings,settings);assert.equal(VisualizerRuntime.getVisualizers(),adapters);
    assert.equal(state.orbs[0],source);assert.equal(source.angleRad,1.25);assert.equal(source.trail.particles.head,node);assert.equal(source.trail.emitAccumulator,.5);
    const under=defs(cap-1),ids=under.map(o=>o.id);const added=createOrb(under);
    assert.equal(added.id,`ORB${cap-1}`);assert.deepEqual(under.slice(0,-1).map(o=>o.id),ids);assert.equal(duplicateOrb(under,ids[0]),null);
  }finally{VisualizerRuntime.dispose();restore();}
});

test('RC-15 phase 3: duplicate-heavy repair is linear in identity reads and preserves late IDs/huge suffixes',()=>{
  let reads=0;const huge='ORB'+'9'.repeat(400);
  const input=Array.from({length:cap},(_,i)=>({get id(){reads++;return i===cap-1?'HISTORICAL-Z':huge;},chanId:i%2?'L':'R',hueOffsetDeg:37}));
  const normalized=normalizeOrbCollection(input);
  assert.ok(reads<=20*cap,`identity reads ${reads} exceed linear reservation bound`);
  assert.equal(normalized[0].id,huge);assert.equal(normalized[1].id,'ORB1'+'0'.repeat(400));
  assert.equal(normalized.at(-1).id,'HISTORICAL-Z');assert.equal(new Set(normalized.map(o=>o.id)).size,cap);
  assert.ok(normalized.every((o,i)=>o.chanId===(i%2?'L':'R')&&o.hueOffsetDeg===37));
  assert.deepEqual(normalizeOrbCollection(normalized),normalized);
  const late=normalizeOrbCollection([{}, {id:'ORB00042'},{id:'ORB43'},{id:'opaque-🎵'},{id:'ORB43'},{}]);
  assert.deepEqual(late.map(o=>o.id),['ORB44','ORB00042','ORB43','opaque-🎵','ORB45','ORB46']);
});

test('RC-15 phase 3: runtime admission fails before disposal, construction, synchronization or history loss',()=>{
  const restore=savedEnvironment(),s=scene(2);
  try{
    s.orbs[0].trail.emitAt(1,2,0,color);const node=s.orbs[0].trail.particles.head,adapters=s.v.getVisualizers();
    const oversized=new Array(cap+1);Object.defineProperty(oversized,0,{get(){throw Error('must not instantiate');}});
    for(const operation of [s.v.rebuild,s.v.reconcile]){
      assert.throws(()=>operation(oversized),overLimit);assert.equal(s.v.getVisualizers(),adapters);assert.equal(s.orbs[0].trail.particles.head,node);
      assert.throws(()=>operation([s.orbs[0],s.orbs[0]]),/identities must be unique/);assert.equal(s.v.getVisualizers(),adapters);
    }
    state.orbs=s.orbs;runtime.settings={...runtime.settings,orbs:oversized};
    for(const operation of [initOrbs,reconcileOrbs]){assert.throws(operation,overLimit);assert.equal(state.orbs,s.orbs);assert.equal(state.orbs[0].trail.particles.head,node);}
    runtime.settings.orbs=[{id:'A'},{id:'A'}];assert.throws(reconcileOrbs,/identities must be unique/);
  }finally{s.v.dispose();restore();}
});

test('RC-15 phase 3: normal rendering preserves coordinates, size/age/fade, chronological suffix and trace colors without arrays',()=>{
  const restore=savedEnvironment(),s=scene(1);
  try{
    const orb=s.orbs[0];orb.particles={...orb.particles,sizeMaxPx:8,sizeMinPx:2,sizeToMinSec:2,ttlSec:6};
    for(let i=0;i<5;i++)orb.trail.emitAt(i,2*i,i,color);
    orb.trail.particles.slice=()=>{assert.fail('render must not materialize trail arrays');};
    for(const mode of ['fixed','lastParticle','dominantBand']){
      orb.trace={...orb.trace,numLines:2,lineColorMode:mode};const c=canvas();state.ctx=c.ctx;
      Renderer.drawOrb(orb,5,0);
      assert.deepEqual(c.arcs.map(a=>a.slice(0,3)),[[50,50,2],[51,48,2],[52,46,2],[53,44,2],[54,42,5]]);
      assert.deepEqual(c.points,[['moveTo',52,46],['lineTo',53,44],['lineTo',54,42]]);
      assert.equal(c.strokes[0],`rgba(${Math.round(ColorPolicy.pickLineColorRgb01(orb.trail.particles,0,mode).r*255)},${Math.round(ColorPolicy.pickLineColorRgb01(orb.trail.particles,0,mode).g*255)},${Math.round(ColorPolicy.pickLineColorRgb01(orb.trail.particles,0,mode).b*255)},${orb.trace.lineAlpha})`);
      assert.deepEqual(c.fills,['rgba(13,25,38,1)','rgba(26,51,77,1)','rgba(38,77,115,1)','rgba(51,102,153,1)','rgba(51,102,153,1)']);
      assert.equal(c.calls.arc,5);assert.equal(c.calls.lineTo,2);
    }
    // Fractional imported line counts keep the phase-2 ceil-to-segment behavior.
    orb.trace.numLines=2.5;const c=canvas();state.ctx=c.ctx;Renderer.drawOrb(orb,5,0);assert.equal(c.calls.lineTo,3);
    assert.deepEqual(Array.from(orb.trail.particles.suffix(2)).map(p=>p.xSim),[3,4]);
    assert.equal(orb.trail.particles.length,5);
  }finally{s.v.dispose();restore();}
});

for(const count of [0,2,64,256,1024,4096])test(`RC-15 phase 3: aggregate arcs/trace traversal bounded with ${count} Orbs at maximum traces`,()=>{
  const restore=savedEnvironment(),s=scene(count);
  try{
    state.orbs=s.orbs;runtime.settings.bands.overlay.enabled=true;s.context.analysisFrame.ready=true;
    for(const channel of Object.values(s.context.analysisFrame.channels))channel.waveform=new Float32Array(16);
    s.context.analysisFrame.spectrum.energies01=new Float32Array(CONFIG.defaults.bands.count);
    let suffixVisits=0,backSteps=0;
    for(const orb of s.orbs){
      orb.trace.numLines=CONFIG.limits.trace.numLines.max;
      const list=orb.trail.particles,suffix=list.suffix;
      list.slice=()=>{throw Error('whole-trail materialization');};
      list.suffix=function*(n){backSteps+=Math.max(0,Math.min(this.length,n)-1);for(const p of suffix.call(this,n)){suffixVisits++;yield p;}};
    }
    if(count)for(let i=0;i<CONFIG.defaults.particleSafety.maxActiveParticles+1;i++)s.orbs[i%count].trail.emitAt(i,0,0,color);
    const c=canvas();state.ctx=c.ctx;s.v.render(Renderer,s.context);
    const live=count?CONFIG.defaults.particleSafety.maxActiveParticles:0;
    const traceSegments=s.orbs.reduce((n,o)=>n+Math.max(0,Math.min(o.trail.particles.length-1,o.trace.numLines)),0);
    assert.equal(c.calls.arc,live+256);assert.equal(c.calls.lineTo||0,traceSegments+256);
    assert.ok(traceSegments<=live);assert.ok(suffixVisits<=live);assert.ok(backSteps<=live);
    assert.equal(c.arcs.slice(256).length,live);assert.equal(new Set(c.arcs.slice(256).map(a=>a[0])).size,live);
    assert.equal(s.v.getParticleStats().activeParticles,live);
  }finally{s.v.dispose();restore();}
});

test('RC-15 phase 3: zero-particle ceiling scene still updates all Orbs and current Ring phase with finite work',()=>{
  const restore=savedEnvironment(),s=scene(cap);
  try{
    state.orbs=s.orbs;runtime.settings.bands.overlay.phaseMode='orb';
    for(const orb of s.orbs)orb.particles.emitPerSecond=0;
    s.v.update(s.context);assert.ok(s.orbs.every(o=>o.angleRad!==o.startAngleRad));
    assert.equal(state.bands.ringPhaseRad,s.orbs[0].angleRad);assert.equal(s.v.getParticleStats().emissions,0);
    assert.equal(s.v.getParticleStats().schedulingVisits,cap);
    const c=canvas();state.ctx=c.ctx;s.v.render(Renderer,s.context);assert.equal(c.calls.arc||0,0);assert.equal(c.calls.lineTo||0,0);
  }finally{s.v.dispose();restore();}
});

test('RC-15 phase 3: saturated churn/reorder/reset/replacement leaves no stale heap, trail or allocation ownership',()=>{
  // Saturated retention/lifecycle probe deliberately disables placement filtering.
  const restore=savedEnvironment(),s=scene(256,0);
  try{
    let removedNodes=[];
    for(let cycle=0;cycle<8;cycle++){
      for(let f=0;f<34;f++){s.context.nowSec+=1/60;s.v.update(s.context);assert.equal(s.v.getParticleStats().emissions,512);}
      const g=s.orbs[0].trail.governor;assert.equal(g.heap.length,16384);
      const survivors=s.orbs.slice(1).reverse(),node=survivors[0].trail.particles.head;
      const removed=s.orbs[0];for(let n=removed.trail.particles.head;n;n=n.next)removedNodes.push(n);
      s.orbs=[...survivors,new Orb(defs(1,0)[0])];s.orbs.at(-1).id=`NEW-${cycle}`;s.v.reconcile(s.orbs);
      assert.equal(s.orbs[0].trail.particles.head,node);assert.equal(removed.trail.particles.length,0);assert.notEqual(removed.trail.governor,g);
      assert.equal(g.heap.length,s.orbs.reduce((n,o)=>n+o.trail.particles.length,0));
      const queue=[];for(let t=g.nextPriority;t;t=t.priorityNext){assert.ok(!queue.includes(t));queue.push(t);}
      assert.equal(queue.length,s.orbs.length);assert.ok(!queue.includes(removed.trail));
      for(const n of g.heap)assert.equal(g.heap[n.heapIndex],n);
      s.v.reset(cycle%2?'track':'visuals');assert.equal(g.heap.length,0);assert.equal(g.sequence,0);
      assert.ok(s.orbs.every(o=>o.trail.particles.length===0&&o.trail.emitAccumulator===0));
      s.orbs=defs(256,0).map(d=>new Orb(d));s.v.rebuild(s.orbs);assert.equal(g.trails.length,256);assert.equal(g.heap.length,0);
      assert.ok(removedNodes.every(n=>n.trail===null&&n.prev===null&&n.next===null&&n.heapIndex===-1));
    }
    s.v.dispose();assert.equal(s.v.getVisualizers().length,0);assert.equal(s.v.getParticleStats().activeParticles,0);
    s.v.rebuild([]);s.v.update(s.context);assert.equal(s.v.getParticleStats().schedulingVisits,0);
  }finally{s.v.dispose();restore();}
});

test('RC-15 phase 3: governed preset round-trip keeps schema 10 and omits live state/obsolete overlap',()=>{
  const s=scene(2);
  try{
    s.v.update(s.context);const prefs={...structuredClone(CONFIG.defaults),orbs:s.orbs};
    prefs.orbs[0].particles.overlapRadiusPx=10;prefs.orbs[0].activeParticles=99;
    const encoded=encodePresetPayload(prefs),again=encodePresetPayload(sanitizePreset(decodePresetPayload(encoded)));
    assert.deepEqual(again,encoded);assert.equal(encoded.schema,10);
    const json=JSON.stringify(encoded);for(const field of ['overlapRadiusPx','governor','emitAccumulator','priorityNext','activeParticles','heapIndex'])assert.ok(!json.includes(field));
    assert.equal(encoded.prefs.orbs.length,2);
  }finally{s.v.dispose();}
});

test('RC-15 phase 3: replaceable Orb lifecycle adapters share governance without depending on extra adapter metadata',()=>{
  const restore=savedEnvironment();
  // Adapter governance probe deliberately requests dense emissions.
  const orbs=defs(256,0).map(d=>new Orb(d));
  const v=createVisualizerRuntime({createOrb:orb=>({id:orb.id,type:'orb',isVisible:()=>true,
    update:context=>orb.step(context.dtSec,context.nowSec,null,null,0),render:(renderer,c)=>renderer.drawOrb(orb,c.nowSec,0),reset:()=>orb.resetTrail(),dispose(){}})});
  try{
    v.rebuild(orbs);const context={dtSec:1/60,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame()};
    v.update(context);assert.equal(v.getParticleStats().emissions,512);
    assert.equal(orbs.reduce((n,o)=>n+o.trail.particles.length,0),512);
    const node=orbs[0].trail.particles.head;v.reconcile([...orbs].reverse());assert.equal(orbs[0].trail.particles.head,node);
    v.reset('track');assert.equal(v.getParticleStats().activeParticles,0);
    v.dispose();assert.ok(orbs.every(o=>o.trail.particles.length===0));
  }finally{v.dispose();restore();}
});
