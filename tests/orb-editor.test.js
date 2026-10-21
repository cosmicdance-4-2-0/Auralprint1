import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG } from "../src/js/core/config.js";
import { preferences, runtime, replacePreferences, resolveSettings, normalizeOrbDef } from "../src/js/core/preferences.js";
import { state } from "../src/js/core/state.js";
import { createOrbEditorUi, readBulkOrbValue } from "../src/js/ui/orb-editor.js";

function element(tag="div") { const listeners=new Map(); return { tagName:tag.toUpperCase(), type:"", dataset:{}, children:[], parentNode:null, value:"", textContent:"", disabled:false, checked:false, indeterminate:false, attributes:{}, open:false,
 get options(){return this.tagName==="SELECT"?this.children:undefined}, get selectedIndex(){return this.tagName==="SELECT"?this.children.findIndex(option=>option.value===this.value):-1},
 addEventListener(n,f){const a=listeners.get(n)||[];a.push(f);listeners.set(n,a)}, dispatch(n,details={}){for(const f of listeners.get(n)||[])f({target:this,...details})}, dispatchEvent(event){this.dispatch(event.type,event);return true}, listenerCount(n){return (listeners.get(n)||[]).length}, append(...c){for(const x of c)this.appendChild(x)}, appendChild(c){return this.insertBefore(c,null)}, insertBefore(c,before){if(c.parentNode)c.parentNode.children=c.parentNode.children.filter(x=>x!==c);const index=before?this.children.indexOf(before):-1;if(index<0)this.children.push(c);else this.children.splice(index,0,c);c.parentNode=this;return c}, remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;this.removed=true}, focus(){document.activeElement=this}, scrollIntoView(){}, setAttribute(n,v){this.attributes[n]=String(v)}, getAttribute(n){return this.attributes[n]}, querySelector(){return null} }; }
function ui() { const result={orbEditorList:element()}; for(const [n,t] of [["chkLines","checkbox"],["rngNumLines","range"],["selLineColorMode","select"],["rngEmit","range"],["rngSizeMax","range"],["rngSizeMin","range"],["rngSizeToMin","range"],["rngTTL","range"],["rngMinPlacementDistance","range"],["rngOmega","range"],["rngWfDisp","range"],["rngMinRad","range"],["rngMaxRad","range"]]) { result[n]=element(); result[n].type=t; result[`val${n.replace(/^(chk|rng|sel)/,"")}`]=element(); } return result; }
function orb(id){return {...structuredClone(CONFIG.defaults.orbs[0]),id};}
function harness(ids){ const old=structuredClone(preferences), oldDoc=globalThis.document; globalThis.document={activeElement:null,createElement:element}; replacePreferences({...structuredClone(CONFIG.defaults),orbs:ids.map(orb)});resolveSettings();const view=ui(),calls=[];const editor=createOrbEditorUi({ui:view,commitOrbChangeById:(...x)=>calls.push(x),commitPreferences:(...x)=>calls.push(x),showStatus:()=>{}});return {old,oldDoc,view,calls,editor,restore(){replacePreferences(old);resolveSettings();globalThis.document=oldDoc}}; }

test("dynamic editor supports zero, one, and N Orbs and disables bulk at zero",()=>{for(const ids of [[],["A"],["A","B","C","D","E","F","G"]]){const h=harness(ids);try{h.editor.init();assert.equal(h.editor.refresh().size,ids.length);assert.equal(h.view.orbEditorList.children.length,ids.length);assert.equal(h.view.rngEmit.disabled,ids.length===0);for (const key of ["chkLines","rngNumLines","selLineColorMode","rngEmit","rngSizeMax","rngSizeMin","rngSizeToMin","rngTTL","rngMinPlacementDistance","rngOmega","rngWfDisp","rngMinRad","rngMaxRad"]) assert.equal(h.view[key].disabled,ids.length===0,key);}finally{h.restore()}}});

test("editor reconciliation retains roots by ID, reorders nodes, and replaces only structural changes",()=>{const h=harness(["A","B","C"]);try{h.editor.init();const roots=new Map(["A","B","C"].map(id=>[id,h.editor.getController(id).root]));preferences.orbs=[preferences.orbs[2],preferences.orbs[0],preferences.orbs[1]];resolveSettings();h.editor.refresh();assert.deepEqual(h.view.orbEditorList.children.map(n=>n.dataset.orbId),["C","A","B"]);for(const id of ["A","B","C"])assert.equal(h.editor.getController(id).root,roots.get(id));preferences.orbs.push(orb("D"));resolveSettings();h.editor.refresh();const dRoot=h.editor.getController("D").root;assert.deepEqual(h.view.orbEditorList.children.map(n=>n.dataset.orbId),["C","A","B","D"]);for(const id of ["A","B","C"])assert.equal(h.editor.getController(id).root,roots.get(id));preferences.orbs=preferences.orbs.filter(item=>item.id!=="C");resolveSettings();h.editor.refresh();assert.deepEqual(h.view.orbEditorList.children.map(n=>n.dataset.orbId),["A","B","D"]);assert.equal(h.editor.getController("A").root,roots.get("A"));assert.equal(h.editor.getController("B").root,roots.get("B"));assert.equal(h.editor.getController("C"),undefined);assert.equal(h.editor.getController("D").root,dRoot);}finally{h.restore()}});

test("generated controls commit by persistent ID after reorder and focusOrb is ID based",()=>{const h=harness(["A","B","C"]);try{h.editor.init();preferences.orbs=[preferences.orbs[2],preferences.orbs[0],preferences.orbs[1]];resolveSettings();h.editor.refresh();const a=h.editor.getController("A");a.chan.value="R";a.chan.dispatch("change");assert.deepEqual(h.calls[0].slice(0,1),["A"]);assert.equal(h.editor.focusOrb("A"),true);assert.equal(document.activeElement,a.summary);assert.equal(h.editor.focusOrb("missing"),false);}finally{h.restore()}});

test("bulk helper keeps mixed and zero semantics",()=>{assert.deepEqual(readBulkOrbValue([],"particles","emitPerSecond"),{available:false,mixed:false,value:undefined});assert.equal(readBulkOrbValue([orb("A"),orb("B")],"particles","emitPerSecond").mixed,false);});

test("minimum placement distance controls bind by ID, report world units and mixed state, and retain focus/listeners", () => {
  const h = harness(["A","B"]);
  try {
    h.editor.init(); const a=h.editor.getController("A"), control=a.spacing, root=a.root;
    assert.deepEqual([control.min,control.max,control.step],["0","10","any"]);
    assert.equal(control.value,"0.5"); assert.equal(a.spacingValue.textContent,"0.5 world units");
    assert.equal(control.getAttribute("aria-valuetext"),"0.5 world units");
    const help=a.root.children[1].children.flatMap(group=>group.children).flatMap(node=>node.children).find(node=>node.id===control.getAttribute("aria-describedby"));
    assert.equal(help.textContent,"Minimum distance from this Orb's last retained particle before a new particle is placed. 0 disables filtering.");
    control.focus(); control.value="0"; control.dispatch("input");
    assert.equal(preferences.orbs[0].particles.minPlacementDistanceUnits,0);
    assert.equal(preferences.orbs[1].particles.minPlacementDistanceUnits,.5);
    assert.equal(h.calls.at(-1)[0],"A");
    preferences.orbs.reverse(); resolveSettings(); h.editor.refresh();
    assert.equal(h.editor.getController("A").root,root); assert.equal(h.editor.getController("A").spacing,control);
    assert.equal(document.activeElement,control); assert.equal(a.spacingValue.textContent,"0 world units");
    assert.equal(h.view.valMinPlacementDistance.textContent,"mixed");
    assert.equal(h.view.rngMinPlacementDistance.getAttribute("aria-valuetext"),"mixed");
    assert.equal(h.editor.init(),false); assert.equal(control.listenerCount("input"),1);
    assert.equal(h.view.rngMinPlacementDistance.listenerCount("input"),1);
    h.view.rngMinPlacementDistance.value="2.3"; h.view.rngMinPlacementDistance.dispatch("input");
    assert.ok(preferences.orbs.every(o=>o.particles.minPlacementDistanceUnits===2.3));
    resolveSettings(); h.editor.refresh(); assert.equal(h.view.valMinPlacementDistance.textContent,"2.3 world units");
    const settingsBefore=runtime.settings; h.editor.refresh(settingsBefore);
    assert.equal(h.editor.getController("A").spacing,control); assert.equal(document.activeElement,control);
    preferences.orbs=[]; resolveSettings(); h.editor.refresh();
    assert.equal(h.view.rngMinPlacementDistance.disabled,true); assert.equal(h.view.valMinPlacementDistance.textContent,"—");
    const calls=h.calls.length; h.view.rngMinPlacementDistance.dispatch("input");
    assert.equal(h.calls.length,calls); assert.deepEqual(preferences.orbs,[]);
    const template=readFileSync(new URL("../src/index.template.html",import.meta.url),"utf8");
    assert.match(template,/label for="rngMinPlacementDistance">Minimum Placement Distance/);
    assert.match(template,/id="rngMinPlacementDistance" type="range" aria-describedby="minPlacementDistanceHelp"/);
    const domCache=readFileSync(new URL("../src/js/ui/dom-cache.js",import.meta.url),"utf8");
    assert.match(domCache,/bindRange\(ui.rngMinPlacementDistance, CONFIG.limits.particles.minPlacementDistanceUnits\)/);
  } finally { h.restore(); }
});

test("RC-11: mixed Bulk select represents no concrete value and applies every concrete choice once", () => {
  for (const value of ["fixed", "lastParticle", "dominantBand"]) {
    const h = harness(["A", "B"]);
    try {
      h.editor.init();
      const select = h.view.selLineColorMode;
      preferences.orbs[0].trace.lineColorMode = "fixed";
      resolveSettings(); h.editor.refresh();
      assert.equal(select.value, "");
      assert.equal(h.view.valLineColorMode.textContent, "mixed");
      const sentinel = select.children.find(option => option.value === "");
      assert.equal(sentinel.textContent, "mixed");
      assert.equal(sentinel.disabled, true);
      const before = structuredClone(preferences);
      select.dispatch("change");
      assert.deepEqual(preferences, before);
      assert.equal(h.calls.length, 0);
      select.value = value; select.dispatch("change");
      assert.deepEqual(preferences.orbs.map(orb => orb.trace.lineColorMode), [value, value]);
      assert.equal(h.calls.length, 1);
      resolveSettings(); h.editor.refresh();
      assert.equal(select.value, value);
      assert.notEqual(h.view.valLineColorMode.textContent, "mixed");
      assert.equal(h.editor.init(), false);
      assert.equal(select.children.filter(option => option.value === "").length, 1);
      assert.equal(select.listenerCount("change"), 1);
      preferences.orbs = []; resolveSettings(); h.editor.refresh();
      assert.equal(select.disabled, true);
      select.value = value; select.dispatch("change");
      assert.equal(h.calls.length, 1);
    } finally { h.restore(); }
  }
});

test("refresh synchronizes invalidated content without moving stable roots or disturbing focus",()=>{const h=harness(["A","B","C"]);const oldEdges=state.bands.lowHz;let insertions=0,syncs=0;const insertBefore=h.view.orbEditorList.insertBefore.bind(h.view.orbEditorList);h.view.orbEditorList.insertBefore=(node,before)=>{insertions++;return insertBefore(node,before)};h.editor=createOrbEditorUi({ui:h.view,commitOrbChangeById:()=>{},commitPreferences:()=>{},showStatus:()=>{},createBandPicker:()=>({sync(){syncs++}})});try{h.editor.init();assert.deepEqual({insertions,syncs},{insertions:3,syncs:3});const b=h.editor.getController("B"),root=b.root,emit=b.emit;emit.focus();h.editor.refresh(runtime.settings);assert.deepEqual({insertions,syncs},{insertions:3,syncs:3});preferences.orbs[1].particles.emitPerSecond+=1;resolveSettings();h.editor.refresh(runtime.settings);assert.equal(b.emit.value,String(runtime.settings.orbs[1].particles.emitPerSecond));assert.equal(document.activeElement,emit);assert.equal(h.editor.getController("B").root,root);assert.deepEqual({insertions,syncs},{insertions:3,syncs:6});state.bands.lowHz=[...oldEdges];h.editor.refresh(runtime.settings);assert.equal(document.activeElement,emit);assert.equal(h.editor.getController("B").root,root);assert.deepEqual({insertions,syncs},{insertions:3,syncs:9});h.editor.refresh(runtime.settings);assert.deepEqual({insertions,syncs},{insertions:3,syncs:9});}finally{state.bands.lowHz=oldEdges;h.restore()}});

test("programmatic select synchronization keeps generated readouts aligned with selected options",()=>{const h=harness(["A"]);try{h.editor.init();const c=h.editor.getController("A");for(const [value,label] of [["inherit","Inherit Scene"],["dominant","Global Dominant Band"],["angle","Orb Phase Palette (Glitch Mode)"],["fixed","Scene Fixed Particle Color"]]){preferences.orbs[0].colorSource=value;resolveSettings();h.editor.refresh(runtime.settings);assert.equal(c.color.value,value);assert.equal(c.colorValue.textContent,label);}for(const [value,label] of [["fixed","Scene Fixed Particle Color"],["lastParticle","Last Particle"],["dominantBand","Global Dominant Band"]]){preferences.orbs[0].trace.lineColorMode=value;resolveSettings();h.editor.refresh(runtime.settings);assert.equal(c.lineColor.value,value);assert.equal(c.lineColorValue.textContent,label);}}finally{h.restore()}});

test("every schema-10 Orb setting has a generated writable control",()=>{const h=harness(["unsafe id #1"]);try{h.editor.init();const c=h.editor.getController("unsafe id #1");for(const key of ["chan","bands","chir","phase","hue","color","x","y","speed","minRadius","maxRadius","waveform","emit","sizeMax","sizeMin","decay","ttl","spacing","lines","numLines","lineAlpha","lineWidth","lineColor"])assert.ok(c[key],key);const ids=[c.chan,c.bands,c.chir,c.phase,c.hue,c.color,c.x,c.y,c.speed,c.minRadius,c.maxRadius,c.waveform,c.emit,c.sizeMax,c.sizeMin,c.decay,c.ttl,c.spacing,c.lines,c.numLines,c.lineAlpha,c.lineWidth,c.lineColor].map(x=>x.id);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.every(id=>!id.includes("unsafe id #1")));}finally{h.restore()}});

test("phase is presented accessibly in degrees and commits radians by stable ID",()=>{const h=harness(["A","B","C"]);try{h.editor.init();const a=h.editor.getController("A");for(const [radians,degrees] of [[0,0],[Math.PI/2,90],[Math.PI,180],[Math.PI*1.5,270]]){preferences.orbs[0].startAngleRad=radians;resolveSettings();h.editor.refresh(runtime.settings);assert.equal(a.phase.value,String(radians));assert.equal(a.phaseValue.textContent,`${degrees}°`);assert.equal(a.phase.getAttribute("aria-valuetext"),`${degrees} degrees`);}preferences.orbs=[preferences.orbs[2],preferences.orbs[0],preferences.orbs[1]];resolveSettings();h.editor.refresh();a.phase.value=String(Math.PI);a.phase.dispatch("input");assert.equal(preferences.orbs.find(o=>o.id==="A").startAngleRad,Math.PI);assert.equal(preferences.orbs.find(o=>o.id==="B").startAngleRad,CONFIG.defaults.orbs[0].startAngleRad);assert.equal(h.calls.at(-1)[0],"A");}finally{h.restore()}});

test("nested controls remain independent and canonical normalization refreshes their values",()=>{const h=harness(["A","B"]);try{h.editor=createOrbEditorUi({ui:h.view,showStatus:()=>{},commitPreferences:()=>{},commitOrbChangeById(id){const i=preferences.orbs.findIndex(o=>o.id===id);preferences.orbs[i]=normalizeOrbDef(preferences.orbs[i],CONFIG.defaults.orbs[0]);resolveSettings();}});h.editor.init();const b=h.editor.getController("B");b.speed.value="2.25";b.speed.dispatch("input");b.lineAlpha.value="0.44";b.lineAlpha.dispatch("input");b.lineWidth.value="5";b.lineWidth.dispatch("input");b.sizeMax.value="2";b.sizeMax.dispatch("input");b.sizeMin.value="5";b.sizeMin.dispatch("input");b.decay.value="8";b.decay.dispatch("input");b.ttl.value="1";b.ttl.dispatch("input");h.editor.refresh();const a=preferences.orbs.find(o=>o.id==="A"), normalized=preferences.orbs.find(o=>o.id==="B");assert.equal(a.motion.angularSpeedRadPerSec,CONFIG.defaults.orbs[0].motion.angularSpeedRadPerSec);assert.equal(normalized.motion.angularSpeedRadPerSec,2.25);assert.equal(normalized.trace.lineAlpha,.44);assert.equal(normalized.trace.lineWidthPx,5);assert.equal(normalized.particles.sizeMinPx,2);assert.equal(normalized.particles.ttlSec,8);assert.equal(b.sizeMin.value,"2");assert.equal(b.ttl.value,"8");}finally{h.restore()}});

test("ten arbitrary-ID Orb cards retain independent phase and nested values",()=>{const ids=Array.from({length:10},(_,i)=>`scene orb ${i*7}`),h=harness(ids);try{preferences.orbs.forEach((o,i)=>{o.startAngleRad=(i%2)*Math.PI;o.motion.angularSpeedRadPerSec=.2+i*.1;o.bandIds=[i];});resolveSettings();h.editor.init();assert.equal(h.editor.refresh().size,10);assert.equal(new Set(ids.map(id=>h.editor.getController(id).phase.id)).size,10);const target=h.editor.getController(ids[7]);target.ttl.value="12";target.ttl.dispatch("input");assert.equal(preferences.orbs[7].particles.ttlSec,12);assert.equal(preferences.orbs[6].particles.ttlSec,CONFIG.defaults.orbs[0].particles.ttlSec);}finally{h.restore()}});

test("RC-15 phase 1: individual editor has no overlap controls and stale Bulk controls have no listener", () => {
  const h = harness(["A", "B"]);
  try {
    // Even stale DOM references cannot resurrect the retired Bulk binding.
    h.view.rngOverlap = element("input"); h.view.valOverlap = element();
    h.editor.init(); h.editor.refresh();
    const c = h.editor.getController("A");
    assert.equal(c.overlap, undefined); assert.equal(c.overlapValue, undefined);
    const walk = node => [node, ...node.children.flatMap(walk)];
    assert.ok(walk(c.root).every(node => !/overlap/i.test(`${node.id || ""} ${node.textContent} ${node.htmlFor || ""}`)));
    assert.equal(h.view.rngOverlap.listenerCount("input"), 0);
    const before = structuredClone(preferences);
    h.view.rngOverlap.value = "10"; h.view.rngOverlap.dispatch("input");
    assert.deepEqual(preferences, before); assert.deepEqual(h.calls, []);
    assert.equal(h.view.rngEmit.listenerCount("input"), 1);
    const template = readFileSync(new URL("../src/index.template.html", import.meta.url), "utf8");
    assert.doesNotMatch(template, /rngOverlap|valOverlap|Overlap radius/i);
  } finally { h.restore(); }
});

for (const raw of ['255', '0,255', '0,2']) {
  test(`AUD-003: exact authored entry ${raw} distinguishes active/inactive and preserves other Orb`, () => {
    const h = harness(['A', 'B']);
    try {
      preferences.bands.count = 3; resolveSettings(); h.editor.init();
      const a = h.editor.getController('A'), b = structuredClone(preferences.orbs[1]);
      a.bands.focus(); a.bands.value = raw; a.bands.dispatch('change'); resolveSettings(); h.editor.refresh();
      const selected = raw.split(',').map(Number);
      assert.deepEqual(preferences.orbs[0].bandIds, selected); assert.deepEqual(preferences.orbs[1], b);
      assert.equal(a.bands.getAttribute('aria-invalid'), 'false');
      const active = selected.filter(index => index < 3).length;
      assert.match(a.bandValue.textContent, new RegExp(`${active} active target`));
      assert.match(a.bandValue.textContent, new RegExp(`${selected.length - active} inactive target`));
      assert.match(a.bands.getAttribute('aria-description'), /Authored indices 0–255; active indices 0–2/);
      assert.equal(document.activeElement === a.bands, true);
    } finally { h.restore(); }
  });
}

test('AUD-003: invalid exact draft stays visible through count/setting changes; deliberate correction replaces targets', () => {
  const h = harness(['A', 'B']);
  try {
    preferences.bands.count = 3; preferences.orbs[0].bandIds = [255]; resolveSettings(); h.editor.init();
    const a = h.editor.getController('A'), root = a.root; a.root.open = true; a.root.scrollTop = 321;
    a.bands.value = '0, 256, nope'; a.bands.focus(); a.bands.dispatch('change');
    assert.equal(a.bands.getAttribute('aria-invalid'), 'true'); assert.deepEqual(preferences.orbs[0].bandIds, [255]);
    preferences.bands.count = 32; preferences.audio.muted = true; resolveSettings(); h.editor.refresh();
    assert.equal(a.bands.value, '0, 256, nope'); assert.equal(a.bandValue.textContent, 'Invalid indices');
    assert.equal(h.editor.getController('A').root === root, true); assert.equal(a.root.open, true); assert.equal(a.root.scrollTop, 321);
    assert.equal(document.activeElement === a.bands, true); assert.match(a.bands.getAttribute('aria-description'), /active indices 0–31/);
    a.bands.value = '0, 2'; a.bands.dispatch('change'); resolveSettings(); h.editor.refresh();
    assert.deepEqual(preferences.orbs[0].bandIds, [0, 2]); assert.equal(a.bands.getAttribute('aria-invalid'), 'false');
    assert.match(a.bandValue.textContent, /2 active targets · 0 inactive targets/);
  } finally { h.restore(); }
});

const { continuousOrbCases, readNumeric, writeNumeric } = await import('./helpers/orb-numeric-cases.js');

for (const [key,group,field,limit,value] of continuousOrbCases) {
  test(`AUD-009: ${key} control/readout preserves canonical precision, focus and explicit individual edits`,()=>{
    const h=harness(['A','B']);
    try {
      writeNumeric(preferences.orbs[0],group,field,value);resolveSettings();h.editor.init();
      const c=h.editor.getController('A'),control=c[key],root=c.root,other=structuredClone(preferences.orbs[1]);
      assert.equal(control.step,'any');assert.equal(control.min,String(limit.min));assert.equal(control.max,String(limit.max));
      assert.equal(control.value,String(value));assert.equal(parseFloat(c[`${key}Value`].textContent),value);
      control.focus();root.open=true;
      preferences.audio.playbackVolume=.7;resolveSettings();h.editor.refresh();
      assert.ok(document.activeElement===control);assert.ok(h.editor.getController('A').root===root);assert.equal(root.open,true);
      assert.equal(control.value,String(value));assert.equal(readNumeric(preferences.orbs[0],group,field),value);assert.deepEqual(h.calls,[]);
      control.value=String(value+limit.step/3);control.dispatch('input');
      assert.equal(readNumeric(preferences.orbs[0],group,field),Number(control.value));assert.deepEqual(preferences.orbs[1],other);
      assert.equal(h.calls.at(-1)[0],'A');assert.equal(control.listenerCount('input'),1);assert.equal(control.listenerCount('keydown'),1);
    }finally{h.restore();}
  });
}

test('AUD-009: continuous/integral keyboard increments use CONFIG without snapping imported values',()=>{
  const h=harness(['A','B']);
  try{
    preferences.orbs.forEach(o=>{o.motion.angularSpeedRadPerSec=.123456;o.trace.numLines=16});resolveSettings();h.editor.init();
    const c=h.editor.getController('A');let prevented=0;
    c.speed.dispatch('keydown',{key:'ArrowRight',preventDefault(){prevented++}});
    assert.ok(Math.abs(preferences.orbs[0].motion.angularSpeedRadPerSec-.133456)<1e-15);
    assert.equal(preferences.orbs[1].motion.angularSpeedRadPerSec,.123456);
    assert.equal(c.numLines.step,'1');c.numLines.dispatch('keydown',{key:'ArrowRight',preventDefault(){prevented++}});assert.equal(preferences.orbs[0].trace.numLines,26);
    h.view.rngOmega.dispatch('keydown',{key:'ArrowRight',preventDefault(){prevented++}});assert.ok(preferences.orbs.every(o=>Math.abs(o.motion.angularSpeedRadPerSec-.133456)<1e-15));
    h.view.rngNumLines.dispatch('keydown',{key:'ArrowRight',preventDefault(){prevented++}});assert.ok(preferences.orbs.every(o=>o.trace.numLines===26));
    assert.equal(prevented,4);
    c.speed.value=String(CONFIG.limits.motion.angularSpeedRadPerSec.max);const calls=h.calls.length;c.speed.dispatch('keydown',{key:'ArrowRight',preventDefault(){}});assert.equal(h.calls.length,calls);
    c.speed.dispatch('keydown',{key:'ArrowLeft',ctrlKey:true,preventDefault(){assert.fail('modified shortcuts untouched')}});assert.equal(h.calls.length,calls);
    h.editor.init();assert.equal(h.view.rngOmega.listenerCount('keydown'),1);
  }finally{h.restore();}
});

test('AUD-009: Bulk uniform off-step/mixed values survive unrelated edits and explicit field changes',()=>{
  const h=harness(['A','B']);
  try{
    preferences.orbs.forEach(o=>{o.motion.angularSpeedRadPerSec=.123456;o.trace.numLines=16;o.particles.sizeMaxPx=6.123456});resolveSettings();h.editor.init();
    assert.equal(h.view.rngOmega.step,'any');assert.equal(h.view.rngOmega.value,'.123456'.replace(/^\./,'0.'));assert.equal(parseFloat(h.view.valOmega.textContent),.123456);assert.equal(h.view.rngNumLines.value,'16');
    const speeds=preferences.orbs.map(o=>o.motion.angularSpeedRadPerSec);h.view.rngTTL.value='40.123456';h.view.rngTTL.dispatch('input');resolveSettings();h.editor.refresh();
    assert.deepEqual(preferences.orbs.map(o=>o.motion.angularSpeedRadPerSec),speeds);assert.ok(preferences.orbs.every(o=>o.particles.sizeMaxPx===6.123456));
    preferences.orbs[1].motion.angularSpeedRadPerSec=.234567;resolveSettings();h.editor.refresh();assert.equal(h.view.valOmega.textContent,'mixed');assert.equal(h.view.rngOmega.getAttribute('aria-valuetext'),'mixed');
    const before=structuredClone(preferences.orbs);h.view.rngOmega.focus();preferences.audio.playbackVolume=.3;resolveSettings();h.editor.refresh();assert.deepEqual(preferences.orbs,before);assert.ok(document.activeElement===h.view.rngOmega);
    h.view.rngOmega.value='.345678';h.view.rngOmega.dispatch('input');assert.deepEqual(preferences.orbs.map(o=>o.motion.angularSpeedRadPerSec),[.345678,.345678]);assert.ok(preferences.orbs.every(o=>o.trace.numLines===16));
  }finally{h.restore();}
});
