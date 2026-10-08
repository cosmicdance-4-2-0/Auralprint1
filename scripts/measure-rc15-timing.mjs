// Optional native probe. All timers/hooks are measurement-only; no production imports it.
export async function measureRc15Timing({scenario='moving-sixteen',spacing=.5,profile=false,frames=360,samples=30,fps=60}={}) {
  const realNow=performance.now.bind(performance),oldNow=performance.now;
  let sampled=false,counters={},clockMs=100000;
  globalThis.__rc15Probe={now:realNow,add(key,ms){if(sampled)counters[key]=(counters[key]||0)+ms;}};
  const {CONFIG}=await import('../src/js/core/config.js');
  const {runtime,preferences,replacePreferences,resolveSettings}=await import('../src/js/core/preferences.js');
  const {state}=await import('../src/js/core/state.js');
  const timingHelpers=await import('../src/js/core/timing.js');
  window.requestAnimationFrame=()=>0;
  const {onAnimationFrame}=await import('../src/js/main.js');
  const {AudioEngine}=await import('../src/js/audio/audio-engine.js');
  const {initOrbs}=await import('../src/js/render/orb-runtime.js');
  const {VisualizerRuntime}=await import('../src/js/render/visualizer-runtime.js');
  const {UI}=await import('../src/js/ui/ui.js');
  const {createAnalysisFrame}=await import('../src/js/audio/analysis-frame.js');
  const wav=new ArrayBuffer(44+4800*4),view=new DataView(wav);
  const text=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,wav.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,48000,true);view.setUint32(28,192000,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,wav.byteLength-44,true);
  await AudioEngine.loadFile(new File([wav],'synthetic-silent-stereo.wav',{type:'audio/wav'}));
  const prefs=structuredClone(CONFIG.defaults),count=scenario==='default-two'?2:scenario==='stress-64'?64:scenario==='stress-256'?256:16;
  prefs.orbs=Array.from({length:count},(_,i)=>({...structuredClone(CONFIG.defaults.orbs[i%2]),id:`SYNTHETIC-${i}`}));
  for(const orb of prefs.orbs){orb.particles.minPlacementDistancePx=spacing;if(count!==2){orb.particles.emitPerSecond=1000;orb.particles.ttlSec=60;orb.response.minRadiusFrac=orb.response.maxRadiusFrac=.1;orb.response.waveformRadialDisplaceFrac=0;orb.motion.angularSpeedRadPerSec=1;orb.startAngleRad=0;orb.chirality=1;}}
  if(scenario==='large-retention'){prefs.particleSafety={maxEmissionsPerFrame:4096,maxActiveParticles:131072};prefs.orbs.forEach(o=>o.particles.emitPerSecond=0);}
  replacePreferences(prefs);resolveSettings();initOrbs();
  const governor=state.orbs[0].trail.governor,selectedPolicy={...governor.policy};
  if(scenario==='large-retention')for(let i=0;i<100000;i++)state.orbs[i%count].trail.emitAt(i,0,100,rgb());
  let admissions=0,retirements=0;
  const restores=[];
  const wrap=(object,key,field,extra)=>{const original=object[key];object[key]=function(...args){const t=realNow();const result=original.apply(this,args);globalThis.__rc15Probe.add(field,realNow()-t);if(extra)extra(args);return result;};restores.push(()=>object[key]=original);};
  if(profile){
    wrap(VisualizerRuntime,'update','visualizerUpdateMs');wrap(VisualizerRuntime,'render','canvasSubmissionMs');wrap(UI,'refreshAllUiText','uiRefreshMs');wrap(AudioEngine,'sample','audioSampleMs');
    wrap(governor,'finishFrame','schedulingInclusiveMs');wrap(governor,'admit','heapAdmissionInclusiveMs',()=>admissions++);
    wrap(governor,'retire','heapRetirementInclusiveMs',()=>retirements++);
    const retire=governor.retire;governor.retire=function(node,reason){const t=realNow();const result=retire.call(this,node,reason);if(reason==='expired')globalThis.__rc15Probe.add('ttlRetirementMs',realNow()-t);return result;};restores.push(()=>governor.retire=retire);
    for(const orb of state.orbs){wrap(orb,'step','orbStepInclusiveMs');wrap(orb.trail,'updateAndEmit','particlePreparationInclusiveMs');if(orb.trail.expireParticles)wrap(orb.trail,'expireParticles','expiryInclusiveMs');}
  }
  if(scenario==='stationary-sixteen')for(const orb of state.orbs){const original=orb.trail.updateAndEmit;orb.trail.updateAndEmit=function(...args){args[2]=args[3]=0;return original.apply(this,args);};restores.push(()=>orb.trail.updateAndEmit=original);}
  performance.now=()=>clockMs;
  const totals={requestedDemand:0,emissions:0,spatiallyRejectedDemand:0,budgetRejectedDemand:0,rateLimitedDemand:0,retentionRejectedDemand:0,expired:0,evicted:0,expiryVisits:0,heapComparisons:0,schedulingVisits:0};
  const context={dtSec:1/fps,motionDtSec:1/fps,nowSec:100,simPaused:false,analysisFrame:createAnalysisFrame()};
  const timings=[],angles=state.orbs.map(o=>o.angleRad),angularAdvance=state.orbs.map(()=>0);
  try {
    for(let f=0;f<frames;f++){
      const elapsed=scenario==='suspension'&&f===frames-samples?120:1/fps;clockMs+=elapsed*1000;
      counters={};sampled=f>=frames-samples;
      context.dtSec=timingHelpers.simulationDeltaSec(elapsed,runtime.settings.timing.maxDeltaTimeSec);
      context.motionDtSec=timingHelpers.visualMotionDeltaSec?timingHelpers.visualMotionDeltaSec(elapsed):context.dtSec;
      if(timingHelpers.visualMotionDeltaSec&&elapsed>CONFIG.limits.timing.motionDiscontinuitySec)context.dtSec=0;
      context.nowSec=clockMs/1000;
      if(sampled){state.time.lastTimestampMs=clockMs-elapsed*1000;const t=realNow();onAnimationFrame(clockMs);counters.totalCallbackMs=realNow()-t;
        if(profile){counters.analysisUpdateMs=Math.max(0,(counters.audioAndAnalysisMs||0)-(counters.audioSampleMs||0));counters.motionResponseMs=Math.max(0,(counters.orbStepInclusiveMs||0)-(counters.particlePreparationInclusiveMs||0));counters.demandPreparationMs=Math.max(0,(counters.particlePreparationInclusiveMs||0)-(counters.expiryInclusiveMs||0));counters.expirationChecksMs=Math.max(0,(counters.expiryInclusiveMs||0)-(counters.ttlRetirementMs||0));counters.fairnessSchedulingMs=Math.max(0,(counters.schedulingInclusiveMs||0)-(counters.heapAdmissionInclusiveMs||0));}
        timings.push({...counters});
      }else VisualizerRuntime.update(context);
      const stats=VisualizerRuntime.getParticleStats();for(const key in totals)totals[key]+=stats[key]||0;
      if(stats.emissions>selectedPolicy.maxEmissionsPerFrame||stats.activeParticles>selectedPolicy.maxActiveParticles)throw Error('Policy violated');
      state.orbs.forEach((o,i)=>{const delta=o.angleRad-angles[i];angularAdvance[i]+=Math.atan2(Math.sin(delta),Math.cos(delta));angles[i]=o.angleRad;});
    }
    const quantile=(array,q)=>{const sorted=[...array].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*q)];};
    const keys=[...new Set(timings.flatMap(t=>Object.keys(t)))],summary={};for(const key of keys){const values=timings.map(t=>t[key]||0);summary[key]={p50:quantile(values,.5),p95:quantile(values,.95),mean:values.reduce((a,b)=>a+b,0)/values.length};}
    const history=state.orbs.map((o,i)=>({id:o.id,live:o.trail.particles.length,historySec:o.trail.particles.head?clockMs/1000-o.trail.particles.head.particle.bornSec:0,angularAdvanceRad:angularAdvance[i],angularSpeedRadPerSec:o.motion.angularSpeedRadPerSec,chirality:o.chirality}));
    const liveParticles=governor.activeParticles,measuredCalls={admissions,retirements};sampled=false;
    const heapRef=governor.heap,beforeIncrease=[...governor.heap],priority=governor.nextPriority;
    preferences.particleSafety={maxEmissionsPerFrame:16384,maxActiveParticles:262144};resolveSettings();VisualizerRuntime.syncSettings();if(governor.heap.length!==beforeIncrease.length||governor.heap!==heapRef||!beforeIncrease.every((n,i)=>governor.heap[i]===n)||governor.nextPriority!==priority)throw Error('Increase lost history/fairness');
    const target=Math.min(liveParticles,8192),beforeRetired=governor.retentionEvictionsTotal;
    preferences.particleSafety={maxEmissionsPerFrame:4096,maxActiveParticles:target};const start=realNow();resolveSettings();VisualizerRuntime.syncSettings();const trimMs=realNow()-start;
    if(governor.activeParticles!==target||state.orbs[0].trail.governor!==governor)throw Error('Trim integrity');
    return {scenario,spacing,profile,count,fps,frames,samples,elapsedSec:(clockMs-100000)/1000,selectedPolicy,liveParticles,totals,heapAdmissionCalls:profile?measuredCalls.admissions:null,heapRetirementCalls:profile?measuredCalls.retirements:null,history,summary,timings,livePolicyChange:{from:liveParticles,to:target,retired:governor.retentionEvictionsTotal-beforeRetired,trimMs},cssViewport:[innerWidth,innerHeight],dpr:state.dpr,stationaryEmitterSeam:scenario==='stationary-sixteen'};
  }finally{performance.now=oldNow;restores.reverse().forEach(f=>f());VisualizerRuntime.dispose();AudioEngine.unload();delete globalThis.__rc15Probe;}
}
function rgb(){return {r:.2,g:.4,b:.6};}
