// Optional native integration of the actual production callback and visibility listener.
export async function validateRc15Clock(){
  const realNow=performance.now.bind(performance),oldNow=performance.now;window.requestAnimationFrame=()=>0;
  const {onAnimationFrame}=await import('../src/js/main.js');
  const {CONFIG}=await import('../src/js/core/config.js');
  const {state}=await import('../src/js/core/state.js');
  const {preferences,runtime,replacePreferences,resolveSettings}=await import('../src/js/core/preferences.js');
  const {initOrbs}=await import('../src/js/render/orb-runtime.js');
  const {VisualizerRuntime}=await import('../src/js/render/visualizer-runtime.js');
  const {UI}=await import('../src/js/ui/ui.js');
  let clockMs=100000,hidden=false;const originalHidden=Object.getOwnPropertyDescriptor(document,'hidden');
  performance.now=()=>clockMs;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
  const assert=(condition,message)=>{if(!condition)throw Error(message);};const close=(a,b,message)=>assert(Math.abs(a-b)<1e-10,`${message}: ${a} != ${b}`);
  const callback=(ms,now=ms)=>{clockMs=now;onAnimationFrame(ms);};
  const setup=(fps,chirality,phaseMode='free')=>{
    const prefs=structuredClone(CONFIG.defaults);prefs.orbs=prefs.orbs.slice(0,1);const o=prefs.orbs[0];o.chirality=chirality;o.startAngleRad=1;o.motion.angularSpeedRadPerSec=.75;o.particles.emitPerSecond=1000;o.particles.ttlSec=.6;o.response.minRadiusFrac=o.response.maxRadiusFrac=.1;o.response.waveformRadialDisplaceFrac=0;
    prefs.bands.overlay.phaseMode=phaseMode;prefs.bands.overlay.ringSpeedRadPerSec=.75;
    replacePreferences(prefs);resolveSettings();initOrbs();UI.applyPrefs(null);state.time.lastTimestampMs=null;state.time.simPaused=false;state.bands.ringPhaseRad=1;
    callback(100000);return state.orbs[0];
  };
  const cases=[];
  try {
    for(const fps of [120,60,30,10,5])for(const chirality of [-1,1]){
      const o=setup(fps,chirality);for(let i=1;i<=fps;i++){callback(100000+i*1000/fps);assert(VisualizerRuntime.getParticleStats().requestedDemand<=34,'emission delta exceeds independent bound');}
      close(o.angleRad,1+chirality*.75,'real-time phase');close(state.bands.ringPhaseRad,1.75,'free Ring elapsed phase');
      cases.push({fps,chirality,phase:o.angleRad,ringPhase:state.bands.ringPhaseRad,live:VisualizerRuntime.getParticleStats().activeParticles,historySec:o.trail.particles.head?101-o.trail.particles.head.particle.bornSec:0});
    }
    const orb=setup(10,1,'orb'),governor=orb.trail.governor;callback(100100);close(state.bands.ringPhaseRad,orb.angleRad,'current frame lock');const phase=orb.angleRad,fraction=orb.trail.emitAccumulator;
    callback(220100);assert(orb.angleRad===phase&&governor.activeParticles===0&&governor.stats.emissions===0,'stall catch-up/expiry failure');assert(orb.trail.emitAccumulator===fraction,'stall changed fractional debt');callback(220200);close(orb.angleRad,phase+.075,'stall recovery');
    hidden=true;document.dispatchEvent(new Event('visibilitychange'));assert(state.time.lastTimestampMs===null,'hidden event did not rebase');callback(220300);const hiddenPhase=orb.angleRad;callback(340300);assert(orb.angleRad===hiddenPhase&&governor.stats.emissions===0,'hidden work accumulated');
    hidden=false;document.dispatchEvent(new Event('visibilitychange'));callback(340350);assert(orb.angleRad===hiddenPhase,'foreground first-frame catch-up');callback(340450);close(orb.angleRad,hiddenPhase+.075,'foreground ordinary recovery');
    preferences.bands.overlay.phaseMode='free';UI.applyPrefs(null);state.time.simPaused=true;const pausedPhase=orb.angleRad,pausedRing=state.bands.ringPhaseRad;callback(340550);assert(orb.angleRad===pausedPhase&&state.bands.ringPhaseRad===pausedRing&&governor.stats.requestedDemand===0,'pause changed phase/emission');callback(460550);assert(governor.activeParticles===0,'pause lifetime did not expire');
    state.time.simPaused=false;callback(460650);close(orb.angleRad,pausedPhase+.075,'pause resume');
    document.querySelector('#btnOpenScene').click();document.querySelector('#performanceSection').open=true;
    const control=document.querySelector('#numMaxActiveParticles'),host=document.querySelector('#orbEditorList');control.focus();control.value='0';control.dispatchEvent(new Event('change',{bubbles:true}));assert(orb.trail.governor===governor&&governor.activeParticles===0,'live zero policy integrity');assert(document.activeElement===control&&host===document.querySelector('#orbEditorList'),'live edit lost focus/DOM');
    assert(document.querySelector('#statParticleLive').textContent==='0','stale live diagnostic');assert(Number(document.querySelector('#statParticleRetentionRetired').textContent)===governor.retentionEvictionsTotal,'stale cumulative retirement');
    assert(preferences.particleSafety.maxActiveParticles===0,'budget edit did not persist');
    return {cases,verified:['actual production callback 120/60/30/10/5 FPS, both chiralities','bounded emission delta','current-frame Orb Ring lock','120-second real-age expiry and no catch-up','native registered visibility listener with synthetic hidden/visible events','first foreground callback rebase and next-frame recovery','free Ring/Orb global pause with real-time expiry','live zero policy without governor recreation','focus/editor host retention','accurate live/cumulative diagnostics'],nativeTimerSampleMs:realNow()};
  }finally{performance.now=oldNow;if(originalHidden)Object.defineProperty(document,'hidden',originalHidden);else delete document.hidden;VisualizerRuntime.dispose();}
}
