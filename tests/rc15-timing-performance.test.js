import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {CONFIG} from "../src/js/core/config.js";
import {TAU} from "../src/js/core/constants.js";
import {simulationDeltaSec,visualMotionDeltaSec} from "../src/js/core/timing.js";
import {createAnalysisFrame} from "../src/js/audio/analysis-frame.js";
import {state} from "../src/js/core/state.js";
import {runtime} from "../src/js/core/preferences.js";
import {Orb} from "../src/js/render/orb.js";
import {TrailSystem} from "../src/js/render/trail-system.js";
import {ParticleGovernor} from "../src/js/render/particle-governor.js";
import {encodePresetPayload,sanitizePreset} from "../src/js/presets/preset-codec.js";
import {Renderer} from "../src/js/render/renderer.js";
import {createVisualizerRuntime,createSpectralRingVisualizer} from "../src/js/render/visualizer-runtime.js";
const rgb={r:1,g:.5,b:0},particles={...CONFIG.defaults.orbs[0].particles,emitPerSecond:0,ttlSec:1};
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-10,`${message}: ${a} != ${b}`);
const wrap=angle=>((angle%TAU)+TAU)%TAU;

function callbackHarness({chirality=1,ttl=60,spacing=0,rate=1000,budget=1000,phaseMode='free'}={}) {
  const settings=structuredClone(CONFIG.defaults);settings.particleSafety={maxEmissionsPerFrame:budget,maxActiveParticles:131072};
  settings.bands.overlay.phaseMode=phaseMode;settings.bands.overlay.ringSpeedRadPerSec=.75;
  const def=settings.orbs[0];def.chirality=chirality;def.startAngleRad=1;def.motion.angularSpeedRadPerSec=.75;def.particles={...def.particles,ttlSec:ttl,emitPerSecond:rate,minPlacementDistancePx:spacing};
  const orb=new Orb(def),settingsRef={settings},stateRef={time:{lastTimestampMs:null,simPaused:false},bands:{ringPhaseRad:1},orbs:[orb]};
  const v=createVisualizerRuntime({settingsRef,createSpectralRing:()=>createSpectralRingVisualizer({settingsRef,stateRef})});v.rebuild([orb]);
  let nowMs=100000,audioSamples=0,analysisUpdates=0;const frames=[],document={hidden:false};
  const source=readFileSync(new URL('../src/js/main.js',import.meta.url),'utf8').replace(/\r\n/g,'\n').replace(/^import .*;\n/gm,'').replace(/^main\(\);$/m,'').replace(/^export .*;$/m,'');
  const context=vm.createContext({CONFIG,state:stateRef,runtime:settingsRef,simulationDeltaSec,visualMotionDeltaSec,document,requestAnimationFrame(){},resizeCanvasToDisplaySize(){},performance:{now:()=>nowMs},createAnalysisFrame,updateAnalysisFrame(){analysisUpdates++;},AudioEngine:{sample(){audioSamples++;return {}; }},Renderer:{},VisualizerRuntime:{update(f){frames.push({...f});v.update(f);},render(){}},UI:{refreshAllUiText(){}},Scrubber:{draw(){}}});
  vm.runInContext(source,context);
  return {orb,v,stateRef,settingsRef,document,frames,clock(ts,realMs=ts){nowMs=realMs;context.onAnimationFrame(ts);return frames.at(-1);},rebase(){context.rebaseVisualFrameClock();},analysisCounts:()=>({audioSamples,analysisUpdates}),dispose(){v.dispose();}};
}

for(const fps of [120,60,30,10,5])for(const chirality of [-1,1])test(`production callback: ${fps} FPS chirality ${chirality} integrates one second of motion and independent emission delta`,()=>{
  const h=callbackHarness({chirality});
  try {
    h.clock(100000);assert.equal(h.frames[0].dtSec,0);assert.equal(h.frames[0].motionDtSec,0);
    for(let i=1;i<=fps;i++){const f=h.clock(100000+i*1000/fps);close(f.motionDtSec,1/fps,'motion elapsed');assert.ok(f.dtSec<=1/30);close(f.dtSec,Math.min(1/fps,1/30),'bounded emission');assert.ok(h.v.getParticleStats().emissions<=34);}
    close(h.orb.angleRad,1+chirality*.75,'one-second Orb phase');close(h.stateRef.bands.ringPhaseRad,1.75,'one-second free Ring phase');
    assert.deepEqual(h.analysisCounts(),{audioSamples:fps+1,analysisUpdates:fps+1});
    assert.ok(h.orb.trail.emitAccumulator>=0&&h.orb.trail.emitAccumulator<1);
  }finally{h.dispose();}
});

test("motion threshold: frozen CONFIG .5, exact boundary, just above, invalid/negative/zero intervals",()=>{
  assert.equal(CONFIG.limits.timing.motionDiscontinuitySec,.5);assert.ok(Object.isFrozen(CONFIG.limits.timing));
  for(const d of [1/120,1/60,1/30,.1,.2,.5])assert.equal(visualMotionDeltaSec(d),d);
  for(const d of [.500000001,120,0,-1,NaN,Infinity,-Infinity,null,'0.2',undefined])assert.equal(visualMotionDeltaSec(d),0);
  assert.equal(simulationDeltaSec(.2,120),1/30,'independent emission authority remains immutable');
  const h=callbackHarness();
  try {h.clock(100000);h.clock(100500);close(h.orb.angleRad,1.375,'exact threshold integrates');const before=h.orb.angleRad;h.orb.trail.emitAccumulator=.25;
    const gap=h.clock(101000.000001);assert.equal(gap.dtSec,0);assert.equal(gap.motionDtSec,0);assert.equal(h.orb.angleRad,before);assert.equal(h.orb.trail.emitAccumulator,.25);assert.equal(h.v.getParticleStats().emissions,0);
    h.clock(101100.000001);close(h.orb.angleRad,before+.075,'recovery integrates only next ordinary frame');
  }finally{h.dispose();}
});

test("production callback: 120-second stall ages/expires history, retains fractions, no catch-up, recovers",()=>{
  const h=callbackHarness({ttl:1,spacing:.5});
  try {h.clock(100000);h.clock(100100);const retained=h.orb.trail.particles.tail,phase=h.orb.angleRad;h.orb.trail.emitAccumulator=.75;
    const stalled=h.clock(220100);assert.equal(stalled.motionDtSec,0);assert.equal(stalled.dtSec,0);assert.equal(h.orb.angleRad,phase);assert.equal(h.orb.trail.particles.length,0);assert.equal(retained.trail,null);assert.equal(h.v.getParticleStats().expired,1);assert.equal(h.v.getParticleStats().requestedDemand,0);assert.equal(h.orb.trail.emitAccumulator,.75);
    h.clock(220200);close(h.orb.angleRad,phase+.075,'first ordinary recovery frame');assert.equal(h.v.getParticleStats().emissions,1);
    h.clock(220300);close(h.orb.angleRad,phase+.15,'subsequent recovery frame');assert.equal(h.v.getParticleStats().emissions,0,'stationary geometry suppressed with width zero');
  }finally{h.dispose();}
});

test("production callback: hidden/rebased foreground never integrates missed work; invalid timestamps recover",()=>{
  const h=callbackHarness();
  try {h.clock(100000);h.clock(100100);const phase=h.orb.angleRad;
    h.document.hidden=true;h.rebase();h.clock(100200);h.clock(220200);assert.equal(h.orb.angleRad,phase);assert.equal(h.v.getParticleStats().emissions,0);
    h.document.hidden=false;h.rebase();h.clock(220250);assert.equal(h.orb.angleRad,phase,'first foreground frame rebases even when gap is short');h.clock(220350);close(h.orb.angleRad,phase+.075,'foreground ordinary recovery');
    for(const ts of [-1,NaN,Infinity,-Infinity]){const before=h.orb.angleRad;h.clock(ts,220400);assert.equal(h.orb.angleRad,before);assert.equal(h.stateRef.time.lastTimestampMs,null);h.clock(220500);assert.equal(h.orb.angleRad,before);h.clock(220600);close(h.orb.angleRad,before+.075,'invalid-anchor recovery');}
    const before=h.orb.angleRad;h.clock(220600);assert.equal(h.orb.angleRad,before);h.clock(220550);assert.equal(h.orb.angleRad,before,'backward timestamp');h.clock(220650);close(h.orb.angleRad,before+.075,'rebase from backward valid timestamp');
  }finally{h.dispose();}
});

test("Orb lock reads current phase; free Ring/Orb pause freeze while lifetime expires without debt",()=>{
  for(const phaseMode of ['free','orb']){
    const h=callbackHarness({phaseMode,ttl:1,budget:7});
    try {h.clock(100000);h.clock(100100);const phase=h.orb.angleRad,ring=h.stateRef.bands.ringPhaseRad;assert.equal(h.v.getParticleStats().emissions,7);if(phaseMode==='orb')assert.equal(ring,phase);
      h.stateRef.time.simPaused=true;const fraction=h.orb.trail.emitAccumulator;h.clock(100300);assert.equal(h.orb.angleRad,phase);assert.equal(h.stateRef.bands.ringPhaseRad,ring);assert.equal(h.v.getParticleStats().requestedDemand,0);assert.equal(h.orb.trail.emitAccumulator,fraction);
      h.clock(101500);assert.equal(h.orb.trail.particles.length,0);assert.equal(h.v.getParticleStats().expired,7);assert.equal(h.orb.angleRad,phase);
      h.stateRef.time.simPaused=false;h.clock(101600);close(h.orb.angleRad,phase+.075,'pause recovery');assert.equal(h.v.getParticleStats().emissions,7);if(phaseMode==='orb')assert.equal(h.stateRef.bands.ringPhaseRad,h.orb.angleRad);
    }finally{h.dispose();}
  }
});

for(const fps of [5,10])test(`slow ${fps} FPS history spans real TTL motion, fade uses real particle age`,()=>{
  const size=[state.widthPx,state.heightPx,state.dpr],settings=runtime.settings,ctx=state.ctx;state.widthPx=state.heightPx=1000;state.dpr=1;
  const h=callbackHarness({ttl:.6,spacing:.5});h.orb.particles.sizeToMinSec=.1;h.orb.colorSource="fixed";
  try {h.clock(100000);for(let i=1;i<=fps*2;i++)h.clock(100000+i*1000/fps);
    const retained=[...h.orb.trail.particles];assert.ok(retained.length>=2&&retained.length<=Math.ceil(.6*fps)+1);
    const oldest=retained[0],newest=retained.at(-1),age=102-oldest.bornSec;
    assert.ok(age<.6+1e-12&&age>=.6-1/fps-1e-12);const angularSpan=Math.atan2(Math.sin(h.orb.angleRad-Math.atan2(oldest.ySim,oldest.xSim)),Math.cos(h.orb.angleRad-Math.atan2(oldest.ySim,oldest.xSim)));close(angularSpan,.75*age,'retained actual-time angular history');
    assert.ok(newest.bornSec===102);runtime.settings=h.settingsRef.settings;
    const arcs=[],styles=[];state.ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(x,y,r){arcs.push(r);},set fillStyle(v){styles.push(v);}};
    h.orb.trace.lines=false;Renderer.drawOrb(h.orb,102,0);assert.equal(arcs.length,retained.length);const young=arcs.at(-1);close(young,h.orb.particles.sizeMaxPx,'newborn maximum radius');assert.ok(arcs[0]<young);assert.ok(styles[0]!==styles.at(-1),'older particle uses real-age fade');
  }finally{h.dispose();[state.widthPx,state.heightPx,state.dpr]=size;runtime.settings=settings;state.ctx=ctx;}
});

function expiryFixture(times,policy={maxEmissionsPerFrame:512,maxActiveParticles:131072}){
  const g=new ParticleGovernor(policy),t=new TrailSystem();t.setGovernor(g);g.setTrails([t]);for(const born of times)t.emitAt(born,0,born,rgb);return {g,t};
}
function inspect(g,t,now,ttl){g.beginFrame();t.updateAndEmit(0,now,0,0,rgb,{...particles,ttlSec:ttl});g.finishFrame();assert.equal(g.heap.length,t.particles.length);g.heap.forEach((n,i)=>{assert.equal(n.heapIndex,i);assert.equal(n.trail,t);});return g.getStats();}
for(const [times,now,ttl,expired,visits] of [[[],1,1,0,0],[[0],.9,1,0,1],[[0],1,1,1,1],[[0,.5,1],.9,1,0,1],[[0,.5,1],1,1,1,2],[[0,.5,1],1.5,1,2,3],[[0,.5,1],2,1,3,3],[[0,0,0,1],1,1,3,4]])test(`ordered expiry ${JSON.stringify(times)} at ${now}: ${expired} retirements/${visits} age inspections`,()=>{
  const {g,t}=expiryFixture(times),nodes=[...g.heap];try {const s=inspect(g,t,now,ttl);assert.equal(s.expired,expired);assert.equal(s.expiryVisits,visits);assert.equal(t.particles.length,times.length-expired);nodes.filter(n=>now-n.particle.bornSec>=ttl).forEach(n=>{assert.equal(n.heapIndex,-1);assert.equal(n.trail,null);assert.equal(n.prev,null);assert.equal(n.next,null);});assert.equal(t.particles.birthOrderMonotonic,true);}finally{g.dispose();}
});

test("100,000 unexpired ordered particles require one age inspection, including live TTL changes",()=>{
  const {g,t}=expiryFixture([]);try {for(let i=0;i<100000;i++)t.emitAt(i,0,i/100000,rgb);assert.equal(inspect(g,t,1,60).expiryVisits,1);const tail=t.particles.tail;
    let s=inspect(g,t,1,.5);assert.equal(s.expired,50001);assert.equal(s.expiryVisits,50002);assert.equal(t.particles.tail,tail);
    s=inspect(g,t,1,60);assert.equal(s.expired,0);assert.equal(s.expiryVisits,1);s=inspect(g,t,61,60);assert.equal(s.expired,49999);assert.equal(t.particles.tail,null);
  }finally{g.dispose();}
});

test("unordered supported timestamps use safe fallback; transfer/eviction/reset preserve or restore ordering flag",()=>{
  const {g,t}=expiryFixture([10,0,9,1]);try {
    assert.equal(t.particles.birthOrderMonotonic,false);const young=t.particles.head;const s=inspect(g,t,10,2);assert.equal(s.expiryVisits,4);assert.equal(s.expired,2);assert.equal(t.particles.head,young);assert.deepEqual([...t.particles].map(p=>p.bornSec),[10,9]);
    const destination=new ParticleGovernor({maxEmissionsPerFrame:512,maxActiveParticles:5});t.setGovernor(destination);destination.setTrails([t]);assert.equal(t.particles.birthOrderMonotonic,false);assert.equal(inspect(destination,t,11,2).expired,1);assert.equal(t.particles.birthOrderMonotonic,true,'one remaining node is ordered');
    t.emitAt(0,0,0,rgb);assert.equal(t.particles.birthOrderMonotonic,false);destination.applyPolicy({maxEmissionsPerFrame:0,maxActiveParticles:0});assert.equal(t.particles.birthOrderMonotonic,true);assert.equal(t.particles.tail,null);
    destination.applyPolicy({maxEmissionsPerFrame:1,maxActiveParticles:1});t.emitAt(1,0,1,rgb);const retired=t.particles.tail;t.emitAt(2,0,2,rgb);assert.equal(retired.trail,null);assert.equal(t.particles.birthOrderMonotonic,true);t.reset();assert.equal(t.particles.birthOrderMonotonic,true);destination.dispose();
  }finally{g.dispose();t.dispose();}
});

test("different Orb TTLs retire independently, last-tail spacing resumes on empty trail without coordinate cache",()=>{
  const g=new ParticleGovernor({maxEmissionsPerFrame:2,maxActiveParticles:100}),a=new TrailSystem(),b=new TrailSystem();for(const t of [a,b])t.setGovernor(g);g.setTrails([a,b]);a.emitAt(0,0,0,rgb);b.emitAt(0,0,0,rgb);
  try {g.beginFrame();a.updateAndEmit(1/60,1,0,0,rgb,{...particles,emitPerSecond:60,ttlSec:1,minPlacementDistancePx:.5});b.updateAndEmit(1/60,1,0,0,rgb,{...particles,emitPerSecond:60,ttlSec:2,minPlacementDistancePx:.5});g.finishFrame();assert.equal(g.stats.expired,1);assert.equal(g.stats.emissions,1);assert.equal(g.stats.spatiallyRejectedDemand,1);assert.equal(a.particles.tail.particle.bornSec,1);assert.equal(b.particles.tail.particle.bornSec,0);}finally{g.dispose();}
});

test("direct Orb and frame callers retain default delta convention; explicit motion wraps independently",()=>{
  const def=structuredClone(CONFIG.defaults.orbs[0]);def.startAngleRad=6.1;def.motion.angularSpeedRadPerSec=1.5;def.chirality=1;def.particles.emitPerSecond=0;const orb=new Orb(def);
  try {orb.step(.2,1,null,null,0);close(orb.angleRad,wrap(6.4),'legacy supplied delta');orb.step(1/30,2,null,null,0,null,.2);close(orb.angleRad,wrap(6.7),'explicit motion field');}finally{orb.trail.dispose();}
});


test("motion policy is ephemeral; schema-10 budgets/spacing persist with no new timing field",()=>{
  const prefs=structuredClone(CONFIG.defaults);prefs.particleSafety={maxEmissionsPerFrame:16384,maxActiveParticles:1048576};prefs.orbs[0].particles.minPlacementDistancePx=0;
  prefs.timing.motionDtSec=.2;prefs.timing.motionDiscontinuitySec=.5;prefs.orbs[0].particles.overlapRadiusPx=1;
  const payload=encodePresetPayload(prefs);assert.equal(payload.schema,10);assert.deepEqual(payload.prefs.timing,{maxDeltaTimeSec:1/30});assert.deepEqual(payload.prefs.particleSafety,prefs.particleSafety);assert.equal(payload.prefs.orbs[0].particles.minPlacementDistancePx,0);assert.equal('overlapRadiusPx' in payload.prefs.orbs[0].particles,false);assert.deepEqual(sanitizePreset(payload),payload.prefs);
});

test("smaller selected emission delta never slows independent motion",()=>{
  const h=callbackHarness();try{h.settingsRef.settings.timing.maxDeltaTimeSec=.01;h.clock(100000);const f=h.clock(100200);close(f.motionDtSec,.2,'visible motion');assert.equal(f.dtSec,.01);assert.equal(h.v.getParticleStats().emissions,10);close(h.orb.angleRad,1.15,'phase independent of smaller emission maximum');}finally{h.dispose();}
});
