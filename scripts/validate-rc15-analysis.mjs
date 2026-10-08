// Optional native fixture through file-input activation, AudioEngine and the real callback.
export async function validateRc15Analysis(){
 window.requestAnimationFrame=()=>0;
 const {onAnimationFrame}=await import('../src/js/main.js');
 const {state}=await import('../src/js/core/state.js');
 const {UI}=await import('../src/js/ui/ui.js');
 const {AudioEngine}=await import('../src/js/audio/audio-engine.js');
 const {VisualizerRuntime}=await import('../src/js/render/visualizer-runtime.js');
 const {runtime,preferences}=await import('../src/js/core/preferences.js');
 const {selectOrbAnalysis}=await import('../src/js/render/visualizer-runtime.js');
 const assert=(v,m)=>{if(!v)throw Error(m);};
 let frame;const refresh=UI.refreshAllUiText;UI.refreshAllUiText=function(f){frame=f;return refresh(f);};
 const fixture=(mono)=>{const n=48000*4,b=new ArrayBuffer(44+n*4),v=new DataView(b),str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,b.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,48000,true);v.setUint32(28,192000,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*4,true);for(let i=0;i<n;i++){v.setInt16(44+i*4,Math.round(.4*32767*Math.sin(2*Math.PI*512*i/48000)),true);v.setInt16(46+i*4,Math.round(.4*32767*Math.sin(2*Math.PI*(mono?512:2048)*i/48000)),true);}return new File([b],mono?'synthetic-identical-lr.wav':'synthetic-separated-lr.wav',{type:'audio/wav'});};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const activate=async mono=>{document.querySelector('#btnClearQueue').click();const input=document.querySelector('#fileInput'),dt=new DataTransfer();dt.items.add(fixture(mono));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));for(let i=0;i<100&&!state.audio.isPlaying;i++)await wait(20);assert(state.audio.isPlaying,'file activation did not reach canonical playback');await wait(250);for(let i=0;i<10;i++){onAnimationFrame(performance.now());await wait(20);}assert(frame.ready,'real callback did not publish ready analysis');};
 const peak=c=>{const a=frame.channels[c].bandEnergies01;let index=0;for(let i=1;i<a.length;i++)if(a[i]>a[index])index=i;return {index,lowHz:frame.spectrum.lowHz[index],highHz:frame.spectrum.highHz[index],rms:frame.channels[c].rms};};
 try{
 await activate(false);const stereo={L:peak('L'),R:peak('R'),C:peak('C'),monoLike:frame.monoLike};assert(!frame.monoLike,'separated stereo identified as mono');assert(stereo.L.lowHz<=512&&stereo.L.highHz>=512,'left peak not near 512 Hz');assert(stereo.R.lowHz<=2048&&stereo.R.highHz>=2048,'right peak not near 2048 Hz');assert(stereo.L.index!==stereo.R.index,'channel peaks collapsed');assert(frame.spectrum.energies01===frame.channels.C.bandEnergies01,'combined consumer aliases wrong channel');
 for(const c of ['L','R','C']){const s=selectOrbAnalysis({chanId:c,bandIds:[stereo.L.index]},frame);assert(s.band===frame.channels[c],'Orb analysis target is wrong channel');assert(s.energyOverride01===frame.channels[c].bandEnergies01[stereo.L.index],'selected energy is not producer data');}
 const orb=state.orbs[0],g=orb.trail.governor,phase=orb.angleRad;preferences.particleSafety={maxEmissionsPerFrame:0,maxActiveParticles:0};UI.applyPrefs(null);onAnimationFrame(performance.now());assert(orb.trail.governor===g&&g.activeParticles===0,'zero budget lost active governor');assert(frame.ready&&frame.channels.L.rms>.1&&state.audio.isPlaying,'zero particles compromised analysis/playback');assert(orb.angleRad!==phase,'zero particles stopped motion');
 AudioEngine.stop();await activate(true);const mono={L:peak('L'),R:peak('R'),C:peak('C'),monoLike:frame.monoLike};assert(frame.monoLike,'identical stereo did not detect mono');assert(mono.L.index===mono.R.index,'identical input peaks differ');assert(frame.spectrum.metadata.effectiveCeilingHz<=frame.spectrum.metadata.nyquistHz,'effective ceiling exceeds Nyquist');
 AudioEngine.unload();const {validateRc15Churn}=await import('./validate-rc15-churn.mjs');const churn=await validateRc15Churn();
 return {stereo,mono,churn,selectedPolicy:runtime.settings.particleSafety,verified:['actual file-input queue/loadAndPlay activation','playing Web Audio sample/FFT through actual callback','512 Hz left / 2048 Hz right separation','combined C spectrum ownership','selected Orb channels/band energy','zero particle policies preserve audio and motion','identical L/R mono detection','effective Nyquist ceiling'],limitations:['synthetic PCM files; no physical microphone or browser-tab capture','headless browser timing, no OS audio output acceptance']};
 }finally{UI.refreshAllUiText=refresh;AudioEngine.unload();VisualizerRuntime.dispose();}
}
