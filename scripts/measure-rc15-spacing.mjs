// Optional native-browser probe, following measure-rc15-frame.mjs. Synthetic
// 60 Hz timestamps drive the production callback; captured native performance
// time measures actual work. No runtime hooks enter the distribution.
export async function measureRc15Spacing({scenario, spacing, frames=1200, samples=120}={}) {
  const {CONFIG}=await import('../src/js/core/config.js');
  const {preferences,runtime,replacePreferences,resolveSettings}=await import('../src/js/core/preferences.js');
  const {sanitizePreset}=await import('../src/js/presets/preset-codec.js');
  const {state}=await import('../src/js/core/state.js');
  window.requestAnimationFrame=()=>0;
  const {onAnimationFrame}=await import('../src/js/main.js');
  const {AudioEngine}=await import('../src/js/audio/audio-engine.js');
  const {initOrbs}=await import('../src/js/render/orb-runtime.js');
  const {VisualizerRuntime}=await import('../src/js/render/visualizer-runtime.js');
  const {Renderer}=await import('../src/js/render/renderer.js');
  const {createAnalysisFrame}=await import('../src/js/audio/analysis-frame.js');
  const wav=new ArrayBuffer(44+4800*4),view=new DataView(wav);
  const text=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,wav.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
  view.setUint32(24,48000,true);view.setUint32(28,192000,true);view.setUint16(32,4,true);view.setUint16(34,16,true);
  text(36,'data');view.setUint32(40,wav.byteLength-44,true);
  await AudioEngine.loadFile(new File([wav],'rc15-synthetic-silent-stereo.wav',{type:'audio/wav'}));
  const prefs=structuredClone(CONFIG.defaults),count=scenario==='default-two'?2:16;
  prefs.orbs=Array.from({length:count},(_,i)=>({...structuredClone(CONFIG.defaults.orbs[i%2]),id:`SYNTHETIC-${i}`}));
  for (const orb of prefs.orbs) {
    orb.particles.minPlacementDistancePx=spacing;
    if (count===16) {
      orb.particles.emitPerSecond=1000; orb.particles.ttlSec=60;
      orb.response.minRadiusFrac=orb.response.maxRadiusFrac=scenario==='stationary-overlap'?.01:.1;
      orb.response.waveformRadialDisplaceFrac=0;
      orb.motion.angularSpeedRadPerSec=scenario==='slow-high-demand'?.01:1;
      orb.startAngleRad=0; orb.chirality=1; orb.centerXFrac=orb.centerYFrac=0;
    }
  }
  replacePreferences(sanitizePreset({schema:10,prefs}));resolveSettings();initOrbs();
  const realNow=performance.now.bind(performance),oldNow=performance.now;
  let clockMs=100000, sample=false, callbackCounters;
  performance.now=()=>clockMs;
  const totals={requestedDemand:0,spatiallyRejectedDemand:0,emissions:0,droppedDemand:0,evicted:0,expired:0,placementComparisons:0};
  let requested=0;
  for (const orb of state.orbs) {
    const original=orb.trail.updateAndEmit;
    orb.trail.updateAndEmit=function(...args){
      requested+=Math.floor(this.emitAccumulator%1+args[5].emitPerSecond*args[0]);
      // Canonical motion/radius minima prevent a fully stationary Orb. This
      // explicitly labeled synthetic seam freezes only its sampled emitter.
      if(scenario==='stationary-overlap'){args[2]=0;args[3]=0;}
      return original.apply(this,args);
    };
  }
  const wrap=(object,key,field)=>{
    const original=object[key]; object[key]=function(...args){
      const t=realNow();const result=original.apply(this,args);
      if(sample)callbackCounters[field]=realNow()-t;
      return result;
    };return ()=>{object[key]=original;};
  };
  const restores=[wrap(VisualizerRuntime,'update','visualizerUpdateMs'),wrap(VisualizerRuntime,'render','canvasSubmissionMs')];
  const context={dtSec:1/60,nowSec:0,simPaused:false,analysisFrame:createAnalysisFrame()};
  const timing=[];
  try {
    for(let f=0;f<frames;f++) {
      clockMs=100000+(f+1)*1000/60;requested=0;callbackCounters={};
      sample=f>=frames-samples;
      if(sample){
        state.time.lastTimestampMs=clockMs-1000/60;
        const t=realNow();onAnimationFrame(clockMs);timing.push({...callbackCounters,totalCallbackMs:realNow()-t});
      }else{context.nowSec=clockMs/1000;VisualizerRuntime.update(context);}
      const stats=VisualizerRuntime.getParticleStats();
      if(stats.requestedDemand!==undefined&&stats.requestedDemand!==requested)throw Error('Requested-demand accounting disagrees with independent probe');
      totals.requestedDemand+=requested;
      for(const key of Object.keys(totals).filter(key=>key!=='requestedDemand'))totals[key]+=stats[key]||0;
      if(stats.emissions>512||stats.activeParticles>16384)throw Error('Budget exceeded');
    }
    if(totals.requestedDemand!==totals.emissions+totals.spatiallyRejectedDemand+totals.droppedDemand)throw Error('Demand partition mismatch');
    const quantile=(values,q)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*q)];};
    const timings={};for(const key of ['visualizerUpdateMs','canvasSubmissionMs','totalCallbackMs'])timings[key]={p50:quantile(timing.map(t=>t[key]),.5),p95:quantile(timing.map(t=>t[key]),.95),mean:timing.reduce((n,t)=>n+t[key],0)/timing.length};
    const history=state.orbs.map(orb=>{
      const particles=Array.from(orb.trail.particles),trace=particles.slice(-Math.ceil(orb.trace.numLines)-1);
      const oldest=particles[0],newest=particles.at(-1);
      const angleTravel=list=>list.slice(1).reduce((n,p,i)=>{
        const a=Math.atan2(list[i].ySim,list[i].xSim),b=Math.atan2(p.ySim,p.xSim);
        return n+Math.abs(Math.atan2(Math.sin(b-a),Math.cos(b-a)));
      },0);
      return {id:orb.id,live:particles.length,uniquePositions:new Set(particles.map(p=>`${p.xSim},${p.ySim}`)).size,
        retainedHistorySec:oldest?clockMs/1000-oldest.bornSec:0,
        particleBirthSpanSec:oldest&&newest?newest.bornSec-oldest.bornSec:0,
        traceHistorySec:trace.length>1?trace.at(-1).bornSec-trace[0].bornSec:0,
        traceAngularTravelRad:angleTravel(trace),retainedAngularTravelRad:angleTravel(particles)};
    });
    return {scenario,spacing,count,frames,samples,simulatedSeconds:frames/60,cssViewport:[innerWidth,innerHeight],dpr:state.dpr,
      stationaryEmitterSeam:scenario==='stationary-overlap',
      activeSpacing:runtime.settings.orbs[0].particles.minPlacementDistancePx??null,
      scene:encodeScene(preferences),totals,liveParticles:VisualizerRuntime.getParticleStats().activeParticles,history,timings,timing,
      audioReady:AudioEngine.sample().ready};
  } finally {performance.now=oldNow;restores.forEach(restore=>restore());VisualizerRuntime.dispose();AudioEngine.unload();}
}
function encodeScene(prefs){return {orbs:prefs.orbs,bands:prefs.bands};}
