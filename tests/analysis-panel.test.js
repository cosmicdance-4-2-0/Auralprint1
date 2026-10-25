import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAnalysisPanelUi } from "../src/js/ui/analysis-panel.js";
import { CONFIG } from "../src/js/core/config.js";

function el() {
  const listeners=new Map();
  return { value:"", textContent:"", style:{display:"block"}, children:[], options:[], className:"", min:"", max:"", step:"",
    setAttribute(key,value){this[key]=String(value)}, getAttribute(key){return this[key]},
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

for(const field of ['floorHz','ceilingHz']) test(`AUD-004 ${field}: reject above CONFIG max, preserve drafts/Scene, then accept a fraction`,()=>{
  const restore=installDocument(),{ui,settings,prefs}=fixture();let active=settings,commits=0;
  try {
    const maximum=CONFIG.limits.bands.frequencyHz.max;
    active.bands.ceilingHz=prefs.bands.ceilingHz=maximum;
    const panel=createAnalysisPanelUi({ui,getSettings:()=>active,mutablePreferences:prefs,commitPreferences:()=>{commits++;active=structuredClone(prefs)}});panel.init();
    const input=field==='floorHz'?ui.inpBandFloorHz:ui.inpBandCeilingHz;
    assert.equal(input.max,String(maximum));
    const before=structuredClone(prefs);
    document.activeElement=input;input.value=String(maximum+1);input.dispatch('input');
    active=structuredClone(active);panel.refresh();assert.equal(input.value,String(maximum+1));
    input.dispatch('change');assert.deepEqual(prefs,before);assert.equal(commits,0);assert.equal(input.value,String(before.bands[field]));
    assert.match(ui.analysisStatus.textContent,/384,000 Hz/);
    input.value=field==='floorHz'?'31.125':String(maximum-.125);input.dispatch('input');input.dispatch('change');
    const expected=structuredClone(before);expected.bands[field]=Number(input.value);
    assert.deepEqual(prefs,expected);assert.equal(commits,1);
  } finally {restore();}
});

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
    const frame={ready:true,spectrum:{energies01:[.25,.8],lowHz:[0,20],highHz:[20,Infinity],dominantIndex:1,dominantName:"Peak",metadata:{sampleRateHz:40000,nyquistHz:20000,effectiveFloorHz:20,configCeilingHz:22500,effectiveCeilingHz:20000}}};
    panel.refresh(frame);assert.equal(ui.bandTable.children.length,8);const first=ui.bandTable.children[0];assert.equal(ui.bandTable.children[3].children[0].style.width,"25%");assert.match(ui.bandDebug.children[0].textContent,/Dominant \[1\] Peak/);assert.match(ui.bandMeta.textContent,/Configured floor: 20\.0 Hz/);assert.doesNotMatch(ui.bandMeta.textContent,/Effective floor/);assert.match(ui.bandMeta.textContent,/Sample rate: 40\.00 kHz/);assert.match(ui.bandMeta.textContent,/Configured ceiling: 22\.50 kHz/);assert.match(ui.bandMeta.textContent,/Effective ceiling: 20\.00 kHz/);
    time=1200;panel.refresh(frame);assert.equal(ui.bandTable.children[0],first);
    frame.spectrum.metadata.sampleRateHz=null;frame.spectrum.metadata.nyquistHz=null;panel.refresh(frame);assert.match(ui.bandMeta.textContent,/pending audio context/);assert.match(ui.bandMeta.textContent,/Nyquist: n\/a/);
  } finally {restore()}
});

test("HUD distinguishes configured and effective floor when Nyquist constrains geometry",()=>{
  const restore=installDocument(), {ui,settings,prefs}=fixture(2);
  try {
    settings.bands.floorHz=20000;
    const panel=createAnalysisPanelUi({ui,getSettings:()=>settings,mutablePreferences:prefs,now:()=>1000});panel.init();
    const frame={ready:true,spectrum:{energies01:[0,0],lowHz:[0,16000],highHz:[16000,Infinity],dominantIndex:0,dominantName:"Floor",metadata:{sampleRateHz:32000,nyquistHz:16000,effectiveFloorHz:16000,configCeilingHz:22500,effectiveCeilingHz:16000}}};
    panel.refresh(frame);
    assert.match(ui.bandMeta.textContent,/Configured floor: 20\.00 kHz/);
    assert.match(ui.bandMeta.textContent,/Effective floor: 16\.00 kHz/);
    assert.match(ui.bandMeta.textContent,/Nyquist: 16\.00 kHz/);
  } finally {restore()}
});

test("template gives migrated controls one Analysis owner",()=>{
  const html=readFileSync(new URL("../src/index.template.html",import.meta.url),"utf8");
  const analysis=html.match(/<div id="analysisPanel"[\s\S]*?<div id="scenePanel"/)?.[0]||"";
  for(const id of ["rngRmsGain","rngSmooth","selFFT","selDistMode","bandDebug","bandMeta","bandTable"]) {assert.match(analysis,new RegExp(`id="${id}"`));assert.equal((html.match(new RegExp(`id="${id}"`,"g"))||[]).length,1)}
  assert.doesNotMatch(analysis,/bandOverlaySection/);
});

test('AUD-004 unchanged analysis metadata and HUD do not rewrite text, styles or badge identity',()=>{
  const restore=installDocument(),{ui,settings,prefs}=fixture(2);let time=1000;
  try{
    const panel=createAnalysisPanelUi({ui,getSettings:()=>settings,mutablePreferences:prefs,now:()=>time});panel.init();
    const frame={spectrum:{energies01:[.25,.75],lowHz:[0,20],dominantIndex:1,dominantName:'Peak',metadata:{sampleRateHz:48000,nyquistHz:24000}}};
    panel.refresh(frame);const badge=ui.bandDebug.children[0],rows=[...ui.bandTable.children];let writes=0;
    for(const node of [ui.bandMeta,badge]){let text=node.textContent;Object.defineProperty(node,'textContent',{get:()=>text,set:v=>{writes++;text=v}})}
    for(const row of rows){for(const key of ['width','background','opacity']){let value=row.style[key];Object.defineProperty(row.style,key,{get:()=>value,set:v=>{writes++;value=v}})}if(row.children[0]){const fill=row.children[0];for(const key of ['width','background']){let value=fill.style[key];Object.defineProperty(fill.style,key,{get:()=>value,set:v=>{writes++;value=v}})}}}
    for(let i=0;i<30;i++){time+=200;panel.refresh(frame)}
    assert.equal(writes,0);assert.equal(ui.bandDebug.children[0],badge);assert.deepEqual(ui.bandTable.children,rows);
    frame.spectrum.metadata.sampleRateHz=44100;time+=200;panel.refresh(frame);assert.match(ui.bandMeta.textContent,/44\.10 kHz/);assert.ok(writes>0);
    frame.spectrum.dominantName='Changed';time+=200;panel.refresh(frame);assert.match(badge.textContent,/Changed/);
  }finally{restore()}
});

test('AUD-004 hidden Analysis defers table construction and reveals current metadata and energies',()=>{
  const restore=installDocument(),{ui,settings,prefs}=fixture(2);let time=1000;
  try{
    ui.analysisPanel.style.display='none';
    const panel=createAnalysisPanelUi({ui,getSettings:()=>settings,mutablePreferences:prefs,now:()=>time});panel.init();
    const frame={spectrum:{energies01:[.25,.75],lowHz:[0,20],dominantIndex:1,dominantName:'Current',metadata:{sampleRateHz:48000,nyquistHz:24000}}};
    for(let i=0;i<30;i++){time+=200;panel.refresh(frame)}
    assert.equal(ui.bandTable.children.length,0);assert.match(ui.bandMeta.textContent,/48\.00 kHz/);
    ui.analysisPanel.style.display='block';panel.refresh(frame);assert.equal(ui.bandTable.children.length,8);assert.match(ui.bandDebug.children[0].textContent,/Current/);
    assert.equal(ui.bandTable.children[7].children[0].style.width,'75%');
  }finally{restore()}
});

test('AUD-004 explicit reveal refresh bypasses only the existing HUD interval guard',()=>{
  const restore=installDocument(),{ui,settings,prefs}=fixture(2);
  try{
    const panel=createAnalysisPanelUi({ui,getSettings:()=>settings,mutablePreferences:prefs,now:()=>1000});panel.init();
    const frame={spectrum:{energies01:[.25,.75],lowHz:[0,20],dominantIndex:1,dominantName:'Before',metadata:{}}};panel.refresh(frame);
    frame.spectrum.dominantName='On reveal';frame.spectrum.energies01[0]=.9;
    panel.refresh(frame,true);assert.match(ui.bandDebug.children[0].textContent,/On reveal/);assert.equal(ui.bandTable.children[3].children[0].style.width,'90%');
  }finally{restore()}
});

for(const field of ['floor','ceiling']) for(const draft of ['37.125','','1e','-']) test(`AUD-002: ${field} ${JSON.stringify(draft)} survives refresh and explicit replacement fences late events`,()=>{
  const restore=installDocument(),{ui,settings,prefs}=fixture();let active=settings,commits=0;
  try {
    const panel=createAnalysisPanelUi({ui,getSettings:()=>active,mutablePreferences:prefs,commitPreferences:()=>{commits++;active=structuredClone(prefs)}});panel.init();
    const input=field==='floor'?ui.inpBandFloorHz:ui.inpBandCeilingHz;
    document.activeElement=input;input.value=draft;input.selectionStart=1;input.selectionEnd=3;input.dispatch('input');
    active=structuredClone(active);active.audio.rmsGain=2;panel.refresh(null,true);
    assert.equal(input.value,draft);assert.equal(document.activeElement,input);assert.equal(input.selectionStart,1);assert.equal(input.selectionEnd,3);assert.equal(ui.valRmsGain.textContent,'2');assert.match(ui.bandMeta.textContent,/Configured floor/);
    ui.analysisPanel.style.display='none';panel.refresh();ui.analysisPanel.style.display='block';panel.refresh(null,true);assert.equal(input.value,draft);
    active=structuredClone(active);active.bands.floorHz=55;active.bands.ceilingHz=18000;Object.assign(prefs.bands,active.bands);
    panel.syncControls(active,{replaceDrafts:true});assert.equal(input.value,field==='floor'?'55':'18000');
    input.dispatch('blur');input.dispatch('change');input.dispatch('change');assert.equal(commits,0);
    input.value=field==='floor'?'55.125':'18000.125';input.dispatch('input');input.dispatch('change');input.dispatch('blur');input.dispatch('change');assert.equal(commits,1,'single established change commit; fractional Hz remains admissible');
    for(const invalid of ['', '1e', '-1', field==='floor'?'99999':'1']) { const before=structuredClone(prefs);input.value=invalid;input.dispatch('change');assert.deepEqual(prefs,before);assert.equal(commits,1); }
  }finally{restore()}
});

for(const [id,field] of [['rngRmsGain','rmsGain'],['rngSmooth','smoothingTimeConstant']]) test(`AUD-003: Analysis ${field} preserves import, describes selection and validates its own submission`,()=>{
  const restore=installDocument(),{ui,settings,prefs}=fixture();let commits=0;
  try {
    settings.audio[field]=prefs.audio[field]=.123456;
    const panel=createAnalysisPanelUi({ui,getSettings:()=>settings,mutablePreferences:prefs,commitPreferences:()=>commits++});panel.init();
    assert.equal(ui[id].value,'0.12');assert.match(ui[id].getAttribute('aria-valuetext'),/Current 0.123456; slider selection 0.12/);assert.equal(prefs.audio[field],.123456);
    const before=structuredClone(prefs);ui[id].value='.23789';ui[id].dispatch('input');assert.equal(prefs.audio[field],.24);before.audio[field]=.24;assert.deepEqual(prefs,before);assert.equal(commits,1);
  }finally{restore()}
});
