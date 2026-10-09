import assert from 'node:assert/strict';
import {CONFIG} from '/workspace/Auralprint1/src/js/core/config.js';
import {runtime} from '/workspace/Auralprint1/src/js/core/preferences.js';
import {state} from '/workspace/Auralprint1/src/js/core/state.js';
import {BandBank} from '/workspace/Auralprint1/src/js/audio/band-bank.js';
import {sanitizePreset} from '/workspace/Auralprint1/src/js/presets/preset-codec.js';
import {selectOrbAnalysis} from '/workspace/Auralprint1/src/js/render/visualizer-runtime.js';
const cases=[];
for(const floor of [20,1e-307,Number.MIN_VALUE]){
runtime.settings=sanitizePreset({schema:10,prefs:{bands:{floorHz:floor,distributionMode:'log'}}});
BandBank.rebuild(22500,48000);
const freqDb=new Float32Array(4096).fill(-50);
BandBank.computeEnergiesFromAnalyser({freqDb,analyser:{minDecibels:-100,maxDecibels:0}},48000,state.bands.energies01);
cases.push({floor:runtime.settings.bands.floorHz,nonFiniteEdges:state.bands.lowHz.filter(x=>!Number.isFinite(x)).length,zeroEnergies:state.bands.energies01.filter(x=>x===0).length,firstEdges:state.bands.lowHz.slice(0,5)});
}
runtime.settings=structuredClone(CONFIG.defaults);BandBank.rebuild(22050,44100);const f=new Float32Array(4096).fill(-40);BandBank.computeEnergiesFromAnalyser({freqDb:f,analyser:{minDecibels:-100,maxDecibels:-30}},44100,state.bands.energies01);cases.push({name:'default ceiling on 44.1 kHz',topRange:BandBank.formatBandRangeText(255),topEnergy:state.bands.energies01[255]});
runtime.settings=sanitizePreset({schema:10,prefs:{bands:{count:3},orbs:[{id:'target-255',chanId:'C',bandIds:[255]}]}});BandBank.rebuild(22500,48000);state.bands.channels.C.energies01.fill(.5);const selection=selectOrbAnalysis(runtime.settings.orbs[0],{channels:{C:{bandEnergies01:state.bands.channels.C.energies01}}});cases.push({name:'count 3 targets 255',target:runtime.settings.orbs[0].bandIds,energy:selection.energyOverride01});assert.equal(selection.energyOverride01,0);
console.log(JSON.stringify(cases,null,2));
