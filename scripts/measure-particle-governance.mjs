// Optional isolated production probe. Args: source checkout, Orb count, frames.
// --expose-gc enables comparable post-GC heap snapshots, not a memory guarantee.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const base = resolve(process.argv[2] || ".");
const load = path => import(pathToFileURL(resolve(base,path)).href);
const { CONFIG }=await load('src/js/core/config.js');
const { runtime }=await load('src/js/core/preferences.js');
const { state }=await load('src/js/core/state.js');
const { Orb }=await load('src/js/render/orb.js');
const { createVisualizerRuntime }=await load('src/js/render/visualizer-runtime.js');
const { createAnalysisFrame }=await load('src/js/audio/analysis-frame.js');
const { Renderer }=await load('src/js/render/renderer.js');
const count=Number(process.argv[3] || 4096), frames=Number(process.argv[4] || 40);
if (!Number.isInteger(count) || count < 0 || !Number.isInteger(frames) || frames < 1) throw new Error("Expected nonnegative Orb count and positive frame count");
runtime.settings=structuredClone(CONFIG.defaults);state.widthPx=state.heightPx=1000;state.dpr=1;
if (globalThis.gc) globalThis.gc();
const initialHeapBytes=process.memoryUsage().heapUsed;
const orbs=Array.from({length:count},(_,i)=>new Orb({...structuredClone(CONFIG.defaults.orbs[0]),id:`STRESS-${i}`}));
const v=createVisualizerRuntime();v.rebuild(orbs);
const context={dtSec:1/60,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame()};
let emissions=0,expiryVisits=0;
for(const orb of orbs){
 const emit=orb.trail.emitAt,update=orb.trail.updateAndEmit;
 orb.trail.emitAt=function(...args){const r=emit.apply(this,args);if(r!==false)emissions++;return r;};
 orb.trail.updateAndEmit=function(...args){expiryVisits+=this.particles.length;return update.apply(this,args);};
}
const updates=[];const start=performance.now();
for(let i=0;i<frames;i++){
 emissions=expiryVisits=0;context.nowSec=i/60;const t=performance.now();v.update(context);
 updates.push({ms:performance.now()-t,emissions,expiryVisits,...(v.getParticleStats?.()||{})});
}
const simulationMs=performance.now()-start;
const retained=orbs.reduce((n,o)=>n+o.trail.particles.length,0),calls={};
state.ctx=new Proxy({}, {get:(_t,key)=>(...args)=>{calls[key]=(calls[key]||0)+1;},set:()=>true});
const t=performance.now();v.render(Renderer,context);const renderingMs=performance.now()-t;
if (globalThis.gc) globalThis.gc();
const heapUsedBytes=process.memoryUsage().heapUsed;
console.log(JSON.stringify({version:readFileSync(resolve(base,"version"),"utf8").trim(),nodeVersion:process.version,count,frames,simulationMs,retained,updates,calls,renderingMs,initialHeapBytes,heapUsedBytes,heapDeltaBytes:heapUsedBytes-initialHeapBytes,gcAvailable:!!globalThis.gc},null,2));
v.dispose();
