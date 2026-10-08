// Optional browser-only probe of the real production callback. No runtime hooks
// or dependencies are added to the shipped application. Timings include probes.
export async function measureRc15Frame({count=2,maximum=false,warmFrames=360}={}) {
  const {CONFIG}=await import('../src/js/core/config.js');
  const {preferences,runtime,replacePreferences,resolveSettings}=await import('../src/js/core/preferences.js');
  const {sanitizePreset,decodePresetPayload}=await import('../src/js/presets/preset-codec.js');
  const {state}=await import('../src/js/core/state.js');
  // Stop automatic callbacks so the exact production callback can be sampled.
  window.requestAnimationFrame=()=>0;
  const {onAnimationFrame}=await import('../src/js/main.js');
  const {AudioEngine}=await import('../src/js/audio/audio-engine.js');
  const {initOrbs}=await import('../src/js/render/orb-runtime.js');
  const {VisualizerRuntime}=await import('../src/js/render/visualizer-runtime.js');
  const {Renderer}=await import('../src/js/render/renderer.js');
  const {UI}=await import('../src/js/ui/ui.js');
  const {Scrubber}=await import('../src/js/audio/scrubber.js');
  const {createAnalysisFrame}=await import('../src/js/audio/analysis-frame.js');
  // Real Web Audio analyser/FFT and BandBank sample path, with generated silent
  // stereo PCM. No microphone, external asset, playback or recording needed.
  const wav=new ArrayBuffer(44+4800*4),view=new DataView(wav);
  const text=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,wav.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);
  view.setUint32(24,48000,true);view.setUint32(28,192000,true);view.setUint16(32,4,true);view.setUint16(34,16,true);
  text(36,'data');view.setUint32(40,wav.byteLength-44,true);
  await AudioEngine.loadFile(new File([wav],'rc15-silent-stereo.wav',{type:'audio/wav'}));
  const prefs=structuredClone(CONFIG.defaults);
  if(count!==2||maximum){prefs.bands.overlay.enabled=true;prefs.bands.overlay.phaseMode='orb';}
  prefs.orbs=Array.from({length:count},(_,i)=>({...structuredClone(CONFIG.defaults.orbs[i%2]),id:`ORB${i}`}));
  if(maximum)for(const orb of prefs.orbs){
    orb.particles.emitPerSecond=CONFIG.limits.particles.emitPerSecond.max;
    orb.particles.ttlSec=CONFIG.limits.particles.ttlSec.max;
    orb.trace.numLines=CONFIG.limits.trace.numLines.max;
    orb.bandIds=Array.from({length:CONFIG.defaults.bands.count},(_,i)=>i);
  }
  const t=performance.now(),canonical=sanitizePreset(decodePresetPayload({schema:10,prefs}));
  const sanitationMs=performance.now()-t;
  const lifecycleStart=performance.now();replacePreferences(canonical);resolveSettings();initOrbs();
  const runtimeAdmissionMs=performance.now()-lifecycleStart;
  const frame=createAnalysisFrame();
  const activeDescriptor=Object.getOwnPropertyDescriptor(Document.prototype,'activeElement');
  let focusReadMs=0,focusReads=0;
  Object.defineProperty(document,'activeElement',{configurable:true,get(){const t=performance.now();const value=activeDescriptor.get.call(this);focusReadMs+=performance.now()-t;focusReads++;return value;}});
  const query=document.querySelectorAll.bind(document);let labelQueries=0,labelVisits=0;
  document.querySelectorAll=function(selector){const result=query(selector);if(selector==='label[for]'){labelQueries++;labelVisits+=result.length;}return result;};
  const uiStart=performance.now();UI.refreshAllUiText(frame);const initialUiRefreshMs=performance.now()-uiStart;
  const initialLabelDiscovery={queries:labelQueries,visits:labelVisits};
  const initialFocusReads={ms:focusReadMs,count:focusReads};focusReadMs=focusReads=0;
  const context={dtSec:1/60,nowSec:0,simPaused:false,analysisFrame:frame};
  const base=performance.now()/1000-warmFrames/60;
  const warmStart=performance.now();
  for(let f=0;f<warmFrames;f++){context.nowSec=base+f/60;VisualizerRuntime.update(context);}
  const warmMs=performance.now()-warmStart;
  let counters;
  const wrap=(object,key,field)=>{
    const original=object[key];object[key]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{counters[field]=(counters[field]||0)+performance.now()-t;}};
  };
  const governor=state.orbs[0]?.trail.governor;
  wrap(AudioEngine,'sample','analysisSampleMs');wrap(VisualizerRuntime,'update','visualizerUpdateMs');
  wrap(VisualizerRuntime,'render','canvasSubmissionMs');wrap(UI,'refreshAllUiText','uiRefreshMs');wrap(Scrubber,'draw','scrubberDrawMs');
  if(governor){wrap(governor,'retire','retirementMs');wrap(governor,'finishFrame','emissionAllocationMs');}
  for(const orb of state.orbs){
    wrap(orb,'step','orbSimulationAndDemandMs');wrap(orb.trail,'updateAndEmit','trailExpiryAndDemandMs');
    const suffix=orb.trail.particles.suffix;
    orb.trail.particles.suffix=function*(n){for(const p of suffix.call(this,n)){counters.traceVisits++;yield p;}};
  }
  const ctx=state.ctx;
  for(const key of ['arc','lineTo','stroke']){const original=ctx[key];ctx[key]=function(...args){counters[key]++;return original.apply(this,args);};}
  const frames=[];
  for(let f=0;f<5;f++){
    counters={traceVisits:0,arc:0,lineTo:0,stroke:0};
    const stamp=performance.now();state.time.lastTimestampMs=stamp-1000/60;
    const t=performance.now();onAnimationFrame(stamp);const totalFrameMs=performance.now()-t;
    const stats=VisualizerRuntime.getParticleStats();
    const orbTraceSegments=state.orbs.reduce((n,o)=>n+Math.max(0,Math.min(o.trail.particles.length-1,Math.ceil(o.trace.numLines))),0);
    if(stats.emissions>runtime.settings.particleSafety.maxEmissionsPerFrame||stats.activeParticles>runtime.settings.particleSafety.maxActiveParticles)throw Error('Aggregate budget exceeded');
    const ringPoints=runtime.settings.bands.overlay.enabled?CONFIG.defaults.bands.count:0;
    if(counters.arc!==stats.activeParticles+ringPoints||counters.lineTo!==orbTraceSegments+ringPoints)throw Error('Rendering ownership mismatch');
    frames.push({...counters,totalFrameMs,...stats,orbTraceSegments,heapEntries:governor?.heap.length||0,trailOwners:governor?.trails.length||0,
      remainingCallbackMs:totalFrameMs-(counters.analysisSampleMs+counters.visualizerUpdateMs+counters.canvasSubmissionMs+counters.uiRefreshMs+counters.scrubberDrawMs)});
  }
  // Rejection must leave both editor and inventory references/focus intact.
  document.getElementById('btnOpenVisualizers').click();
  const firstCard=document.querySelector('.orb-editor-card');
  const focus=firstCard?.querySelector('summary');focus?.focus();
  if(focus&&document.activeElement!==focus)throw Error('Diagnostic focus target is not visible');
  const oldPrefs=preferences.orbs,oldSettings=runtime.settings,oldAdapters=VisualizerRuntime.getVisualizers();
  const {createRuntimeOrb,duplicateRuntimeOrb}=await import('../src/js/render/orb-runtime.js');
  let refusal=null;
  if(count===CONFIG.limits.orbs.maxCount){
    const before=performance.now();const added=createRuntimeOrb(),duplicate=duplicateRuntimeOrb(preferences.orbs[0].id);
    refusal={ms:performance.now()-before,added,duplicate,focusPreserved:document.activeElement===focus,
      referencesPreserved:preferences.orbs===oldPrefs&&runtime.settings===oldSettings&&VisualizerRuntime.getVisualizers()===oldAdapters&&document.querySelector('.orb-editor-card')===firstCard};
    if(added!==null||duplicate!==null||!refusal.focusPreserved||!refusal.referencesPreserved)throw Error('Ceiling refusal changed scene');
  }
  // A changed settings reference forces real controller reconciliation/sync.
  counters={traceVisits:0,arc:0,lineTo:0,stroke:0};
  const reconcileStart=performance.now();resolveSettings();UI.refreshAllUiText(frame);const changedSettingsUiMs=performance.now()-reconcileStart;
  const changedFocusReads={ms:focusReadMs,count:focusReads};
  const result={count,maximum,ringEnabled:runtime.settings.bands.overlay.enabled,warmFrames,sanitationMs,runtimeAdmissionMs,initialUiRefreshMs,initialLabelDiscovery,initialFocusReads,warmMs,changedSettingsUiMs,changedFocusReads,frames,refusal,
    domNodes:document.querySelectorAll('*').length,editorCards:document.querySelectorAll('.orb-editor-card').length,
    audioReady:AudioEngine.sample().ready,heapUsedBytes:performance.memory?.usedJSHeapSize??null,
    caveat:'Actual production callback with native Canvas and real silent-stereo Web Audio sampling. Nested timing fields overlap; trail timing includes expiry scan plus demand preparation, retirement timing includes heap unlink only. Instrumentation adds cost. Canvas submission is not GPU completion; JS heap snapshot excludes DOM/native memory. Admission/UI are separate one-off operations. Rendering and Orb population are bounded, not frame-rate guaranteed.'};
  VisualizerRuntime.dispose();AudioEngine.unload();
  return result;
}
