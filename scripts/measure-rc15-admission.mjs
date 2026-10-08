// Optional pure admission/lifecycle probe. Args: source checkout (default current).
// Run an archived checkpoint in a separate process to compare without resetting.
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const base=resolve(process.argv[2]||'.');
const load=p=>import(pathToFileURL(resolve(base,p)).href);
const {normalizeOrbCollection}=await load('src/js/core/orb-collection.js');
const {decodePresetPayload,sanitizePreset}=await load('src/js/presets/preset-codec.js');
const {Orb}=await load('src/js/render/orb.js');
const {createVisualizerRuntime}=await load('src/js/render/visualizer-runtime.js');
const {CONFIG}=await load('src/js/core/config.js');
const {createAnalysisFrame}=await load('src/js/audio/analysis-frame.js');
const {state}=await load('src/js/core/state.js');
const {runtime}=await load('src/js/core/preferences.js');
const admissionOnly=process.argv.includes("--admission-only");
const results=[];
for(const count of [64,256,1024,4096])for(const mode of ['unique','duplicate','missing','huge-duplicate']){
 const input=Array.from({length:count},(_,i)=>mode==='missing'?{}:{id:mode==='unique'?`OPAQUE-${i}`:mode==='duplicate'?'ORB0':'ORB'+'9'.repeat(400)});
 const start=performance.now();const normalized=normalizeOrbCollection(input);const ms=performance.now()-start;
 if(normalized.length!==count||new Set(normalized.map(o=>o.id)).size!==count)throw Error('Identity normalization mismatch');
 const t=performance.now();normalizeOrbCollection(normalized);const repeatMs=performance.now()-t;
 results.push({count,mode,ms,repeatMs});
}
const malformed=[];
for(const count of (admissionOnly?[4097]:[4097,100000])){
 const input=new Array(count).fill(null),t=performance.now();let code;
 try{const d=decodePresetPayload({schema:10,prefs:{orbs:input}});if(d.ok){sanitizePreset(d);code='accepted';}else code=d.code;}catch(e){code=e.code||e.name;}
 malformed.push({count,ms:performance.now()-t,code});
}
const v=createVisualizerRuntime(),context={dtSec:1/60,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame()};
runtime.settings=structuredClone(CONFIG.defaults);state.widthPx=state.heightPx=1000;state.dpr=1;
const churnStart=performance.now();let peakHeap=0,peakOwners=0;
for(let cycle=0;cycle<(admissionOnly?0:12);cycle++){
 const orbs=normalizeOrbCollection(Array.from({length:4096},(_,i)=>({id:`ORB${i}`}))).map(d=>new Orb(d));
 v.rebuild(orbs);
 for(let frame=0;frame<34;frame++){context.nowSec+=1/60;v.update(context);}
 const g=orbs[0].trail.governor;
 peakHeap=Math.max(peakHeap,g.heap.length);peakOwners=Math.max(peakOwners,g.trails.length);
 v.reconcile(orbs.slice(0,2048).reverse());v.reset('track');
 if(g.heap.length!==0||g.trails.length!==2048)throw Error('Stale reset accounting');
 v.rebuild([]);if(g.heap.length||g.trails.length||g.nextPriority||g.priorityTail)throw Error('Stale rebuild ownership');
}
v.dispose();
console.log(JSON.stringify({version:readFileSync(resolve(base,'version'),'utf8').trim(),nodeVersion:process.version,results,malformed,
 churn:{cycles:admissionOnly?0:12,orbs:4096,framesPerCycle:34,ms:performance.now()-churnStart,peakHeap,peakOwners,finalStats:v.getParticleStats?.()},
 caveat:'Host synchronous Node timings include JIT/GC. Byte parsing before codec admission and native DOM costs are separate; no arbitrary ID-length or encoded-payload-byte policy is introduced.'},null,2));
