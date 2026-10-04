import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAnalysisPanelUi } from "../src/js/ui/analysis-panel.js";

function el() {
  const listeners=new Map();
  return { value:"", textContent:"", style:{display:"block"}, children:[], options:[], className:"", min:"", max:"", step:"",
    addEventListener(type,fn){const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a)},
    dispatch(type){for(const fn of listeners.get(type)||[])fn({target:this})},
    appendChild(node){this.children.push(node);if(this===node.parentSelect)this.options.push(node);return node},
    append(...nodes){this.children.push(...nodes)},
    listenerCount(type){return (listeners.get(type)||[]).length},
  };
}
function fixture(count=2) {
  const keys=["analysisPanel","analysisStatus","rngRmsGain","valRmsGain","rngSmooth","valSmooth","selFFT","valFFT","selDistMode","valDistMode","inpBandFloorHz","valBandFloorHz","inpBandCeilingHz","valBandCeilingHz","valBandCount","bandMeta","bandDebug","bandTable"];
  const ui=Object.fromEntries(keys.map(k=>[k,el()]));
  ui.selFFT.options=[]; ui.selDistMode.options=[];
  const settings={audio:{rmsGain:1,smoothingTimeConstant:.8,fftSize:2048},bands:{count,floorHz:20,ceilingHz:22500,distributionMode:"erb"}};
  const prefs={audio:{rmsGain:1,smoothingTimeConstant:.8,fftSize:2048,volume:.4},bands:{floorHz:20,ceilingHz:22500,distributionMode:"erb"},orbs:[]};
  return {ui,settings,prefs};
}
function installDocument(){const previous=globalThis.document;globalThis.document={createElement(){return el()}};return()=>{globalThis.document=previous}};

test("Analysis controls initialize idempotently and commit their canonical fields",()=>{
  const restore=installDocument(), {ui,settings,prefs}=fixture(); const commits=[];
  try {
    const panel=createAnalysisPanelUi({ui,getSettings:()=>settings,mutablePreferences:prefs,commitPreferences:(...args)=>commits.push(args),now:()=>1000});
    assert.equal(panel.init(),true); assert.equal(panel.init(),false); assert.equal(ui.rngRmsGain.listenerCount("input"),1);
    ui.rngRmsGain.value="2";ui.rngRmsGain.dispatch("input"); ui.rngSmooth.value="0.5";ui.rngSmooth.dispatch("input");ui.selFFT.value="4096";ui.selFFT.dispatch("change");
    assert.deepEqual({gain:prefs.audio.rmsGain,smooth:prefs.audio.smoothingTimeConstant,fft:prefs.audio.fftSize,volume:prefs.audio.volume},{gain:2,smooth:.5,fft:4096,volume:.4});
    ui.selDistMode.value="bark";ui.selDistMode.dispatch("change");
    assert.equal(prefs.bands.distributionMode,"bark");assert.deepEqual(commits.at(-1)[1],{rebuildBandsOnDefinitionChange:true});
  } finally {restore()}
});

test("frequency edits reject malformed and crossed bounds without coupled mutation",()=>{
  const restore=installDocument(), {ui,settings,prefs}=fixture(); const commits=[];
  try {
    const panel=createAnalysisPanelUi({ui,getSettings:()=>settings,mutablePreferences:prefs,commitPreferences:(...a)=>commits.push(a)});panel.init();
    for(const value of ["0","-1","nope","30000"]){ui.inpBandFloorHz.value=value;ui.inpBandFloorHz.dispatch("change");assert.equal(prefs.bands.floorHz,20)}
    ui.inpBandCeilingHz.value="10";ui.inpBandCeilingHz.dispatch("change");assert.equal(prefs.bands.ceilingHz,22500);
    ui.inpBandFloorHz.value="30";ui.inpBandFloorHz.dispatch("change");assert.equal(prefs.bands.floorHz,30);assert.equal(prefs.bands.ceilingHz,22500);assert.deepEqual(commits.at(-1)[1],{rebuildBandsOnDefinitionChange:true});
    ui.inpBandCeilingHz.value="23000";ui.inpBandCeilingHz.dispatch("change");assert.equal(prefs.bands.ceilingHz,23000);
  } finally {restore()}
});

test("HUD uses AnalysisFrame metadata and active count without rebuilding ordinary refreshes",()=>{
  const restore=installDocument(), {ui,settings,prefs}=fixture(2); let time=1000;
  try {
    const panel=createAnalysisPanelUi({ui,getSettings:()=>settings,mutablePreferences:prefs,now:()=>time,bandColor:()=>({r:1,g:0,b:0})});panel.init();
    const frame={ready:true,spectrum:{energies01:[.25,.8],lowHz:[0,20],highHz:[20,Infinity],dominantIndex:1,dominantName:"Peak",metadata:{sampleRateHz:40000,nyquistHz:20000,configCeilingHz:22500,effectiveCeilingHz:20000}}};
    panel.refresh(frame);assert.equal(ui.bandTable.children.length,8);const first=ui.bandTable.children[0];assert.equal(ui.bandTable.children[3].children[0].style.width,"25%");assert.match(ui.bandDebug.children[0].textContent,/Dominant \[1\] Peak/);assert.match(ui.bandMeta.textContent,/Sample rate: 40\.00 kHz/);assert.match(ui.bandMeta.textContent,/Configured ceiling: 22\.50 kHz/);assert.match(ui.bandMeta.textContent,/Effective ceiling: 20\.00 kHz/);
    time=1200;panel.refresh(frame);assert.equal(ui.bandTable.children[0],first);
    frame.spectrum.metadata.sampleRateHz=null;frame.spectrum.metadata.nyquistHz=null;panel.refresh(frame);assert.match(ui.bandMeta.textContent,/pending audio context/);assert.match(ui.bandMeta.textContent,/Nyquist: n\/a/);
  } finally {restore()}
});

test("template gives migrated controls one Analysis owner",()=>{
  const html=readFileSync(new URL("../src/index.template.html",import.meta.url),"utf8");
  const analysis=html.match(/<div id="analysisPanel"[\s\S]*?<div id="scenePanel"/)?.[0]||"";
  for(const id of ["rngRmsGain","rngSmooth","selFFT","selDistMode","bandDebug","bandMeta","bandTable"]) {assert.match(analysis,new RegExp(`id="${id}"`));assert.equal((html.match(new RegExp(`id="${id}"`,"g"))||[]).length,1)}
  assert.doesNotMatch(analysis,/bandOverlaySection/);
});
