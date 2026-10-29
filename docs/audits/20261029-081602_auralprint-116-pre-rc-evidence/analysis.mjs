import assert from 'node:assert/strict';
import { CONFIG } from '../../../src/js/core/config.js';
import { preferences, resolveSettings, runtime } from '../../../src/js/core/preferences.js';
import { state } from '../../../src/js/core/state.js';
import { computeInteriorEdges, BandBank } from '../../../src/js/audio/band-bank.js';
import { BandBankController } from '../../../src/js/audio/band-bank-controller.js';
import { createAnalysisFrame, updateAnalysisFrame } from '../../../src/js/audio/analysis-frame.js';
const pairs=[[Number.MIN_VALUE,Number.MIN_VALUE*2],[Number.MIN_VALUE,384000],[1e-300,1e-200],[.000001,.000002],[20,20],[20,22500],[100000,384000],[384000,384000]];
let edgeCases=0,bankCases=0;
for(const mode of CONFIG.limits.bands.distributionModes)for(const [low,high]of pairs)for(const count of [1,2,254]){
 const e=computeInteriorEdges(mode,count,low,high);
 assert.equal(e.length,count+1);assert.equal(e[0],low);assert.equal(e.at(-1),high);
 for(let i=0;i<e.length;i++)assert.ok(Number.isFinite(e[i])&&e[i]>=low&&e[i]<=high&&(i===0||e[i]>=e[i-1]));edgeCases++;
}
for(const mode of CONFIG.limits.bands.distributionModes)for(const [floorHz,ceilingHz]of pairs){
 Object.assign(preferences.bands,{floorHz,ceilingHz,distributionMode:mode});resolveSettings();BandBankController.syncFromSettings();
 for(const rate of [8000,44100,48000,96000,768000]){
  BandBankController.onAudioContextKnown(rate);BandBankController.rebuildNow();
  assert.equal(state.bands.meta.effectiveCeilingHz,Math.min(ceilingHz,rate/2));
  assert.equal(state.bands.lowHz.length,256);assert.equal(state.bands.highHz.at(-1),Infinity);
  const bins=new Float32Array(128).fill(-100);bins[8]=-30;
  const energies=new Array(256);BandBank.computeEnergiesFromAnalyser({freqDb:bins,analyser:{minDecibels:-100,maxDecibels:-30}},rate,energies);
  assert.ok(energies.every(e=>Number.isFinite(e)&&e>=0&&e<=1));bankCases++;
 }
}
const frame=createAnalysisFrame(),sample={ready:true,monoLike:false,bands:{L:{timeDomain:new Float32Array([1,2]),rms:0.2,energy01:0.4},R:{timeDomain:new Float32Array([3,4]),rms:0.3,energy01:0.6},C:{timeDomain:new Float32Array([2,3]),rms:0.25,energy01:0.5}}};
updateAnalysisFrame(frame,sample,state.bands);assert.equal(frame.channels.L.waveform,sample.bands.L.timeDomain);assert.equal(frame.spectrum.energies01,state.bands.channels.C.energies01);
const producer=JSON.stringify(sample);updateAnalysisFrame(frame,null,state.bands);assert.equal(frame.ready,false);assert.equal(frame.channels.L.waveform,null);assert.equal(frame.channels.C.energy01,0);assert.equal(JSON.stringify(sample),producer);
console.log(JSON.stringify({edgeCases,bankCases,analysisFrameReferenceAndInvalidation:true}));
