import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ParticleGovernor } from '../../../src/js/render/particle-governor.js';
import { TrailSystem } from '../../../src/js/render/trail-system.js';
import { worldToViewport, viewportToWorld } from '../../../src/js/core/camera-projection.js';
import { createCameraState } from '../../../src/js/core/camera-state.js';
import { createWorldGeometry } from '../../../src/js/core/world-geometry.js';
import { computeCameraFit } from '../../../src/js/core/camera-fit.js';
import { simulationDeltaSec, visualMotionDeltaSec } from '../../../src/js/core/timing.js';
let seed=0xa116cafe; const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const result={seed:'0xa116cafe',particleFrames:0,particleLifecycleTransitions:0,projectionCases:0,fitCases:0};
const governor=new ParticleGovernor({maxActiveParticles:100,maxEmissionsPerFrame:40});
let trails=Array.from({length:20},()=>new TrailSystem());
for(const t of trails)t.setGovernor(governor); governor.setTrails([...trails]);
let now=0;
function validate(){
 const particles=new Set(); let total=0;
 for(const trail of trails){let prev=null,count=0;for(let node=trail.particles.head;node;node=node.next){assert.equal(node.prev,prev); assert.equal(node.trail,trail); assert.equal(governor.heap[node.heapIndex],node);assert(!particles.has(node));particles.add(node);prev=node;count++;}assert.equal(prev,trail.particles.tail);assert.equal(count,trail.particles.length);total+=count;}
 assert.equal(total,governor.activeParticles); assert(total<=governor.policy.maxActiveParticles);
 for(let i=1;i<governor.heap.length;i++){const a=governor.heap[Math.floor((i-1)/2)],b=governor.heap[i]; assert(a.particle.bornSec<b.particle.bornSec||(a.particle.bornSec===b.particle.bornSec&&a.sequence<b.sequence));}
 const priorities=[];let prev=null;for(let t=governor.nextPriority;t;t=t.priorityNext){assert(!priorities.includes(t));assert.equal(t.priorityPrev,prev);priorities.push(t);prev=t;}assert.equal(prev,governor.priorityTail);assert.equal(priorities.length,trails.length);assert(trails.every(t=>priorities.includes(t)));
}
for(let frame=0;frame<10000;frame++){
 now+=random()*.1;
 if(frame%7===0)governor.applyPolicy({maxActiveParticles:Math.floor(random()*150),maxEmissionsPerFrame:Math.floor(random()*50)});
 if(frame%29===0){const remove=Math.floor(random()*trails.length);const removed=trails[remove];trails=trails.filter(t=>t!==removed);governor.setTrails([...trails]);assert.equal(removed.particles.length,0);assert.notEqual(removed.governor,governor);result.particleLifecycleTransitions++;const fresh=new TrailSystem();fresh.setGovernor(governor);trails.splice(Math.floor(random()*(trails.length+1)),0,fresh);governor.setTrails([...trails]);}
 if(frame%17===0){trails.reverse();governor.setTrails([...trails]);}
 governor.beginFrame();for(const t of trails){t.updateAndEmit(random()*.04,now,random()*30,random()*30,{r:1,g:0,b:0},{emitPerSecond:Math.floor(random()*1001),ttlSec:random()*3+.01,minPlacementDistanceUnits:random()<.5?0:random()*10});}governor.finishFrame();assert(governor.stats.emissions<=governor.policy.maxEmissionsPerFrame);validate();result.particleFrames++;
}
governor.dispose();assert.equal(governor.activeParticles,0);assert(trails.every(t=>t.particles.length===0));
for(let i=0;i<10000;i++){
 const world=createWorldGeometry(1+random()*999999,1+random()*999999);const camera=createCameraState({x:(random()-.5)*1e9,y:(random()-.5)*1e9,zoom:.01+random()*99.99,rotationRad:(random()-.5)*Math.PI*2000});const viewport={widthPx:1+random()*10000,heightPx:1+random()*10000};const p={x:camera.x+(random()-.5)*1e6,y:camera.y+(random()-.5)*1e6};const screen=worldToViewport(p.x,p.y,viewport,world,camera);assert(screen);const back=viewportToWorld(screen.x,screen.y,viewport,world,camera);assert(back);const tolerance=1e-10*Math.max(1,Math.abs(p.x),Math.abs(p.y),Math.abs(camera.x),Math.abs(camera.y),world.referenceSpanUnits);assert(Math.abs(back.x-p.x)<=tolerance&&Math.abs(back.y-p.y)<=tolerance);result.projectionCases++;
 const primitives=Array.from({length:8},()=>({type:'circle',x:(random()-.5)*2e6,y:(random()-.5)*2e6,radius:random()*1e5,paddingCssPx:random()*12})); const dpr=i%2+1;const fit=computeCameraFit({primitives,viewport:{...viewport,dpr},world,rotationRad:camera.rotationRad,zoomLimits:{min:.01,max:100},paddingCssPx:16});assert(fit); if(fit.fits){for(const p of primitives){const q=worldToViewport(p.x,p.y,viewport,world,fit.camera);const r=p.radius*Math.min(viewport.widthPx,viewport.heightPx)/world.referenceSpanUnits*fit.camera.zoom+p.paddingCssPx*dpr;const eps=1e-5;assert(q.x-r>=16*dpr-eps&&q.y-r>=16*dpr-eps&&q.x+r<=viewport.widthPx-16*dpr+eps&&q.y+r<=viewport.heightPx-16*dpr+eps);}}result.fitCases++;
}
assert.equal(simulationDeltaSec(1e300,1e300),1/30);assert.equal(visualMotionDeltaSec(.5),.5);assert.equal(visualMotionDeltaSec(.500001),0);assert.equal(visualMotionDeltaSec(NaN),0);
console.log(JSON.stringify(result,null,2));fs.writeFileSync(new URL('./model-results.json',import.meta.url),JSON.stringify(result,null,2));
