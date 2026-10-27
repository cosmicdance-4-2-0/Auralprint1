// Optional native 116G verification and reproducible accepted/current Canvas
// comparison. Seeded histories belong to this harness, never application hooks.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = '26b3ed1a72d177278dc8214f43752da1246e1348';
const acceptedRoot = path.resolve(process.env.AP_116G_BASELINE || path.join(root, '../work/116f-baseline'));
const output = path.resolve(process.env.AP_116G_OUTPUT || path.join(root, 'work/116g'));
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const hash = wire => '#p=' + Buffer.from(JSON.stringify(wire)).toString('base64url');
const frames = (page, count = 2) => page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(resolve => requestAnimationFrame(resolve)); }, count);
async function reveal(page, selector) {
  const control = page.locator(selector).first();
  await control.evaluate(el => {
    const panel = el.closest('.panel');
    if (panel && getComputedStyle(panel).display === 'none') document.getElementById(panel.id === 'scenePanel' ? 'btnOpenScene' : 'btnOpenVisualizers').click();
    for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
  });
  await control.scrollIntoViewIfNeeded(); return control;
}
async function apply(page, wire) {
  await page.evaluate(h => { history.replaceState(null, '', location.pathname + h); document.getElementById('btnApplyUrl').click(); }, hash(wire));
  await frames(page);
}
async function share(page) {
  await page.evaluate(() => { document.getElementById('sceneStatus').textContent = ''; document.getElementById('btnShare').click(); });
  await page.waitForFunction(() => /^Share link /.test(document.getElementById('sceneStatus').textContent));
  const { decodePrefsFromHash } = await import('../src/js/presets/url-preset.js');
  return decodePrefsFromHash(new URL(page.url()).hash);
}
async function controls(page, defaults, encode) {
  assert.deepEqual(await share(page), defaults);
  const mode = await reveal(page, 'select[id$="-trace-length-mode"]');
  assert.equal(await mode.inputValue(), 'count');
  await mode.selectOption('angular');
  let current = await share(page);
  assert.deepEqual(current.orbs.map(orb => orb.trace.lengthMode), ['angular', 'count']);
  assert.equal(await page.locator('#selTraceLengthMode').inputValue(), '');
  const span = await reveal(page, 'input[id$="-angular-span-deg"]');
  assert.equal(await span.getAttribute('min'), '1'); assert.equal(await span.getAttribute('max'), '3600');
  await span.fill('1080'); await span.press('Tab');
  current = await share(page); assert.equal(current.orbs[0].trace.angularSpanDeg, 1080);
  assert.equal(current.orbs[1].trace.angularSpanDeg, 360);
  assert.match(await span.getAttribute('aria-valuetext'), /1080 degrees/);
  await span.fill('3601'); await span.press('Tab');
  assert.equal(await span.getAttribute('aria-invalid'), 'true');
  assert.equal((await share(page)).orbs[0].trace.angularSpanDeg, 1080, 'Invalid draft changed the Scene');
  await span.focus();
  await page.evaluate(() => { const control=document.querySelector('select[id$="-line-color"]'); control.value='lastParticle'; control.dispatchEvent(new Event('change',{bubbles:true})); });
  assert.equal(await span.inputValue(),'3601','Unrelated settings edit discarded a focused draft');
  await apply(page,encode(await share(page)));
  assert.equal(await span.inputValue(),'1080','Same-value import failed to replace focused invalid draft');
  assert.equal(await span.getAttribute('aria-invalid'),'false');
  await span.fill('180.5'); await span.press('Tab');
  assert.equal((await share(page)).orbs[0].trace.angularSpanDeg, 180.5, 'Numeric precision lost');
  await span.focus(); await span.press('ArrowUp');
  assert.equal((await share(page)).orbs[0].trace.angularSpanDeg, 181.5);
  await (await reveal(page, '#selTraceLengthMode')).selectOption('angular');
  const bulk = await reveal(page, '#numAngularSpanDeg');
  await bulk.fill('360'); await bulk.press('Tab');
  current = await share(page); assert.ok(current.orbs.every(orb => orb.trace.lengthMode === 'angular' && orb.trace.angularSpanDeg === 360));
  await bulk.fill('3601'); await bulk.press('Tab'); await bulk.focus();
  await page.evaluate(() => { const control=document.getElementById('selLineColorMode'); control.value='fixed'; control.dispatchEvent(new Event('change',{bubbles:true})); });
  assert.equal(await bulk.inputValue(),'3601','Unrelated Bulk edit discarded a focused draft');
  await apply(page,encode(await share(page)));
  assert.equal(await bulk.inputValue(),'360','Same-value import failed to replace Bulk draft');
  current=await share(page);
  await span.focus();
  await page.evaluate(() => { window.angularEditor = document.querySelector('input[id$="-angular-span-deg"]').closest('.orb-editor-card'); });
  const reordered = structuredClone(current); reordered.orbs.reverse(); await apply(page, encode(reordered));
  assert.equal(await page.evaluate(() => angularEditor === document.querySelectorAll('.orb-editor-card')[1]), true);
  assert.equal(await page.evaluate(() => angularEditor.querySelector('input[id$="-angular-span-deg"]') === document.activeElement), true);
  assert.deepEqual(await share(page), reordered);
  const mutations = await page.evaluate(async () => {
    let count = 0; const observer = new MutationObserver(records => { count += records.length; });
    for (const el of document.querySelectorAll('[id$="-trace-length-mode"],[id$="-angular-span-deg"],#selTraceLengthMode,#numAngularSpanDeg')) observer.observe(el.parentElement, { subtree: true, attributes: true, characterData: true, childList: true });
    for (let i = 0; i < 12; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    observer.disconnect(); return count;
  });
  assert.equal(mutations, 0, 'Unchanged frames mutated angular controls');
  await apply(page, encode({ ...structuredClone(defaults), orbs: [] }));
  assert.equal(await page.locator('#selTraceLengthMode').isDisabled(), true); assert.equal(await bulk.isDisabled(), true);
  await apply(page, encode(current));
  await page.evaluate(() => document.getElementById('btnResetPrefs').click()); await frames(page);
  assert.deepEqual(await share(page), defaults);
  await apply(page, { schema: 14, prefs: { audio: { clearQueueOnSourceExit: true }, orbs: [{ id: 'legacy', trace: { fadeEnabled: true, fadeSegments: 7, lineColorMode: 'particleBirth' } }] } });
  const legacy = await share(page);
  assert.equal(legacy.audio.clearQueueOnSourceExit, true);
  assert.deepEqual([legacy.orbs[0].trace.lengthMode, legacy.orbs[0].trace.angularSpanDeg, legacy.orbs[0].trace.fadeEnabled, legacy.orbs[0].trace.fadeSegments, legacy.orbs[0].trace.lineColorMode], ['count', 360, true, 7, 'particleBirth']);
  return { individualAndBulk: true, mixed: true, boundsAndDraftValidation: true, focusedDraftPreservationAndImportReplacement: true, canonicalPrecision: true, keyboardStep: true, stableIdentityAndFocus: true, unchangedFrameDomMutations: mutations, zeroOrbs: true, reset: true, schema14Import: true };
}
async function installCanvasProbe(page) {
  await page.addInitScript(() => {
    const prototype = CanvasRenderingContext2D.prototype;
    const original = Object.fromEntries(['fillRect','beginPath','moveTo','lineTo','stroke','clip','createLinearGradient'].map(key => [key, prototype[key]]));
    const probe = window.angularCanvas = { current: null, last: null, frames: 0, pathLines: 0, path: [] };
    prototype.fillRect = function(...args) {
      if (this.canvas.id === 'c') { probe.last = probe.current; probe.current = { strokes: 0, lines: 0, clips: 0, gradients: 0, widths: [], alphas: [], caps: [], joins: [], styles: [], paths: [] }; probe.frames++; }
      return original.fillRect.apply(this, args);
    };
    prototype.beginPath = function(...args) { probe.pathLines = 0; probe.path=[]; return original.beginPath.apply(this,args); };
    prototype.moveTo = function(...args) { probe.path.push(args.slice(0,2)); return original.moveTo.apply(this,args); };
    prototype.lineTo = function(...args) { probe.pathLines++; probe.path.push(args.slice(0,2)); return original.lineTo.apply(this,args); };
    prototype.stroke = function(...args) {
      if (this.canvas.id === 'c' && probe.current) { probe.current.strokes++; probe.current.paths.push(probe.path.map(point=>point.slice())); probe.current.lines += probe.pathLines; probe.current.widths.push(this.lineWidth); probe.current.alphas.push(this.globalAlpha); probe.current.caps.push(this.lineCap); probe.current.joins.push(this.lineJoin); probe.current.styles.push(typeof this.strokeStyle === 'string' ? this.strokeStyle : 'gradient'); }
      return original.stroke.apply(this,args);
    };
    prototype.clip = function(...args) { if (this.canvas.id === 'c' && probe.current) probe.current.clips++; return original.clip.apply(this,args); };
    prototype.createLinearGradient = function(...args) { if (this.canvas.id === 'c' && probe.current) probe.current.gradients++; return original.createLinearGradient.apply(this,args); };
  });
}
async function emittedRendering(page, defaults, encode, dpr) {
  const scene = structuredClone(defaults); scene.bands.overlay.enabled = false; scene.visuals.backgroundColor = '#24384d';
  scene.orbs = [scene.orbs[0]];
  const orb = scene.orbs[0]; orb.motion.angularSpeedRadPerSec = 3;
  Object.assign(orb.particles, { emitPerSecond: 60, ttlSec: 30, minPlacementDistanceUnits: 0, sizeMaxPx: 0, sizeMinPx: 0 });
  Object.assign(orb.trace, { lines: true, numLines: 60, lengthMode: 'angular', angularSpanDeg: 90, lineColorMode: 'fixed', fadeEnabled: false, lineWidthPx: 3, lineAlpha: .4 });
  await apply(page, encode(scene)); await frames(page, 80);
  await page.locator('#c').focus(); await page.keyboard.press('Space'); await frames(page, 3);
  const angular = await page.evaluate(() => angularCanvas.last);
  assert.equal(angular.strokes, 1, 'Single-color angular did not batch');
  assert.ok(angular.lines >= 2 && angular.lines <= 40, `Unexpected quarter-rotation trace ${angular.lines}`);
  assert.ok(angular.widths.every(width => width === 3 * dpr));
  assert.ok(angular.alphas.every(alpha => alpha === 1));
  assert.ok(angular.caps.every(cap => cap === 'round')); assert.ok(angular.joins.every(join => join === 'round'));
  assert.ok(angular.styles.every(style => /0\.4\)$/.test(style)), 'Trace alpha changed');
  const background = await page.evaluate(() => [...document.getElementById('c').getContext('2d').getImageData(0,0,1,1).data]);
  assert.deepEqual(background,[36,56,77,255]);
  for(const colorMode of ['lastParticle','dominantBand','fixed']){
    await (await reveal(page, 'select[id$="-line-color"]')).selectOption(colorMode); await frames(page, 3);
    assert.equal((await page.evaluate(() => angularCanvas.last)).strokes,1,'Ordinary angular color mode stopped batching');
  }
  await (await reveal(page, 'select[id$="-trace-length-mode"]')).selectOption('count'); await frames(page, 3);
  const count = await page.evaluate(() => angularCanvas.last);
  assert.equal(count.strokes, 1); assert.ok(count.lines > angular.lines, 'Count did not recover unstamped retained history');
  await (await reveal(page, 'select[id$="-trace-length-mode"]')).selectOption('angular'); await frames(page, 3);
  assert.equal((await page.evaluate(() => angularCanvas.last)).strokes, 0, 'Mode re-entry invented eligible history');
  await page.locator('#c').focus(); await page.keyboard.press('Space'); await frames(page, 45);
  await page.keyboard.press('Space'); await frames(page, 3);
  const restamped = await page.evaluate(() => angularCanvas.last); assert.equal(restamped.strokes, 1); assert.ok(restamped.lines >= 2);
  const fade = await reveal(page, 'input[id$="-fade-trace"]'); await fade.check(); await frames(page, 3);
  const selected=restamped.paths[0];
  const nonzeroFadeGroups=selected.slice(1,6).filter((point,index)=>point[0]!==selected[index][0]||point[1]!==selected[index][1]).length;
  const faded = await page.evaluate(() => angularCanvas.last);
  assert.equal(faded.gradients, nonzeroFadeGroups, 'Every nonzero faded segment needs one gradient; duplicate accepted samples use the existing solid-color interpolation');
  assert.equal(faded.strokes, 6, 'Five faded segment groups plus one solid remainder');
  await (await reveal(page, 'select[id$="-line-color"]')).selectOption('particleBirth'); await frames(page, 3);
  const combined = await page.evaluate(() => angularCanvas.last);
  assert.ok(combined.strokes > 5 && combined.strokes <= 60); assert.equal(combined.gradients, nonzeroFadeGroups);
  await fade.uncheck(); await frames(page, 3);
  const birth = await page.evaluate(() => angularCanvas.last); assert.equal(birth.strokes, combined.strokes); assert.equal(birth.gradients, 0);
  return { realFrameEmissions: true, ordinaryColorModesBatched: true, background, nonzeroFadeGroups, angular, count, restamped, faded, combined, birth, qualification: 'Actual application clock, Orb stepping, emission, retention, renderer and mode controls execute without audio; Space pauses motion while retained particles keep aging.' };
}
async function canvasMeasurements(page) {
  return page.evaluate(async ({ onlyBaseline, quick, caseNames, repeats, microOnly }) => {
    const percentile = (values,p) => [...values].sort((a,b) => a-b)[Math.min(values.length-1, Math.floor(values.length*p))];
    const canvas = document.querySelector('canvas'); canvas.width=1000; canvas.height=800;
    const native = canvas.getContext('2d');
    const suites = [];
    for (const [edition,prefix] of onlyBaseline ? [['accepted116f','/accepted']] : [['accepted116f','/accepted'],['116g','']]) {
      const [{CONFIG}, prefs, {state}, {Orb}, {Renderer}, {createVisualizerRuntime}, {createAnalysisFrame}, {hsvToRgb01}, {Spaces}] = await Promise.all([
        import(prefix+'/src/js/core/config.js'),import(prefix+'/src/js/core/preferences.js'),import(prefix+'/src/js/core/state.js'),import(prefix+'/src/js/render/orb.js'),import(prefix+'/src/js/render/renderer.js'),import(prefix+'/src/js/render/visualizer-runtime.js'),import(prefix+'/src/js/audio/analysis-frame.js'),import(prefix+'/src/js/core/utils.js'),import(prefix+'/src/js/core/spaces.js')]);
      Object.assign(prefs.preferences,structuredClone(CONFIG.defaults)); prefs.resolveSettings();
      Object.assign(state,{canvas,ctx:native,widthPx:1000,heightPx:800,dpr:1}); prefs.runtime.settings.visuals.backgroundColor='#24384d'; prefs.runtime.settings.visuals.particleColor='#f5c16b';
      suites.push({edition,CONFIG,prefs,state,Orb,Renderer,createVisualizerRuntime,createAnalysisFrame,hsvToRgb01,Spaces});
    }
    const results=[];
    let cases=[['factory-short',2,10,false,false,false],['factory-mature',2,10,false,false,false],['sixteen-count',16,60,false,false,false],['sixteen-angular',16,60,false,false,true],['sixteen-angular-full',16,60,false,false,true],['sixteen-fade-five',16,60,true,false,false],['sixteen-birth',16,60,false,true,false],['sixteen-combined',16,60,true,true,false],['sixteen-angular-combined',16,60,true,true,true],['sixteen-angular-combined-full',16,60,true,true,true],['sixteen-max-count',16,1000,false,false,false],['sixteen-max-angular',16,1000,false,false,true],['sixteen-max-birth',16,1000,false,true,false],['sixteen-max-combined',16,1000,true,true,false],['sixteen-max-angular-combined',16,1000,true,true,true],['sixteen-max-angular-combined-full',16,1000,true,true,true],['sixteen-angular-budget32',16,60,true,true,true,32],['sixteen-angular-budget5',16,60,true,true,true,5],['sixteen-angular-budget0',16,60,true,true,true,0]];
    if(microOnly)cases=[];
    if(caseNames.length)cases=cases.filter(row=>caseNames.includes(row[0]));
    const iterations = quick ? 10 : 35;
    const build=(s, row)=>{
      const [label,count,lines,fade,birth,angular,budget]=row;
      const orbs=Array.from({length:count},(_,i)=>{
        const def=structuredClone(s.CONFIG.defaults.orbs[i%2]);def.id='evidence-'+i;
        Object.assign(def.trace,{lines:true,numLines:lines,lineAlpha:.85,lineWidthPx:2,fadeEnabled:fade,fadeSegments:5,lineColorMode:birth?'particleBirth':'fixed',lengthMode:angular?'angular':'count',angularSpanDeg:label.endsWith('-full')?3600:360});
        Object.assign(def.particles,{sizeMaxPx:.5,sizeMinPx:.5,sizeToMinSec:2,ttlSec:600}); return new s.Orb(def);
      });
      const visualizers=s.createVisualizerRuntime(budget===undefined?{}:{traceRenderingPolicy:{maxSegmentStrokesPerFrame:budget}});visualizers.rebuild(orbs);
      for(let i=0;i<count;i++){
        const orb=orbs[i],factory=label.startsWith('factory-');
        if(factory){orb.trace=structuredClone(s.CONFIG.defaults.orbs[i].trace);orb.particles=structuredClone(s.CONFIG.defaults.orbs[i].particles);}
        const retained=label==='factory-mature'?Math.floor(orb.particles.emitPerSecond*orb.particles.ttlSec):lines+1;
        for(let j=0;j<retained;j++){
          const t=j/(retained-1),angle=t*Math.PI*1.65+i*.11,radius=160+i*13;
          // 720 degrees of actual seeded travel: angular rows retain the same
          // particles but select their newest 360-degree half, without interpolation.
          const travel=t*Math.PI*4;
          orb.trail.emitAt(Math.cos(angle)*radius,Math.sin(angle)*radius,label==='factory-mature'?1-orb.particles.ttlSec*(1-t)*.999:0,s.hsvToRgb01(t*280,.85,1),angular?travel:undefined,angular?orb.angularTravelEpoch:undefined);
        }
        if(angular)orb.angularTravelRad=Math.PI*4;
      }
      return {orbs,visualizers,frame:{nowSec:1,analysisFrame:s.createAnalysisFrame()}};
    };
    for(const row of cases){
      const available=row[0].startsWith('sixteen-angular')||row[0].includes('max-angular')?suites.filter(s=>s.edition==='116g'):suites;
      for(let repeat=0;repeat<repeats;repeat++)for(const s of repeat%2?[...available].reverse():available){
        const scene=build(s,row),counts={strokes:0,clips:0,gradients:0,projections:0,traversal:0};
        const original={stroke:native.stroke,clip:native.clip,createLinearGradient:native.createLinearGradient,project:s.Spaces.simToScreen};
        native.stroke=function(...args){counts.strokes++;return original.stroke.apply(this,args);};native.clip=function(...args){counts.clips++;return original.clip.apply(this,args);};native.createLinearGradient=function(...args){counts.gradients++;return original.createLinearGradient.apply(this,args);};s.Spaces.simToScreen=function(...args){counts.projections++;return original.project.apply(this,args);};
        for(const orb of scene.orbs){const suffix=orb.trail.particles.suffix;orb.trail.particles.suffix=function*(n){for(const p of suffix.call(this,n)){counts.traversal++;yield p;}};}
        const times=[],intervals=[],observed=[];let previous=null;
        try{
          for(let i=0;i<8;i++)scene.visualizers.render(s.Renderer,scene.frame);
          for(let i=0;i<iterations;i++)await new Promise(resolve=>requestAnimationFrame(timestamp=>{
            if(previous!==null)intervals.push(timestamp-previous);previous=timestamp;for(const key of Object.keys(counts))counts[key]=0;
            const start=performance.now();scene.visualizers.render(s.Renderer,scene.frame);times.push(performance.now()-start);observed.push({...counts});resolve();
          }));
          const summary={edition:s.edition,label:row[0],repeat,samples:iterations,retained:scene.orbs.reduce((n,o)=>n+o.trail.particles.length,0),stampedParticles:scene.orbs.reduce((n,o)=>n+[...o.trail.particles].filter(p=>Object.hasOwn(p,'angularTravelRad')).length,0),canvasSubmitMedianMs:percentile(times,.5),canvasSubmitP95Ms:percentile(times,.95),rafMedianMs:percentile(intervals,.5),rafP95Ms:percentile(intervals,.95),counts:observed[0],diagnostics:scene.visualizers.getTraceRenderStats()};
          if(summary.diagnostics.segmentStrokes>summary.diagnostics.grantedSegmentStrokes)throw Error('Granted detail budget exceeded');
          // Separate untimed read probe makes backward selection work visible
          // without adding property getters to frame-time measurements.
          let backwardLinkReads=0; const links=[];
          for(const orb of scene.orbs)for(let node=orb.trail.particles.head;node;node=node.next){
            let previous=node.prev;links.push([node,()=>previous]);
            Object.defineProperty(node,'prev',{configurable:true,enumerable:true,get(){backwardLinkReads++;return previous;},set(value){previous=value;}});
          }
          try{scene.visualizers.render(s.Renderer,scene.frame);summary.backwardLinkReads=backwardLinkReads;}
          finally{for(const[node,previous]of links)Object.defineProperty(node,'prev',{configurable:true,enumerable:true,writable:true,value:previous()});}
          results.push(summary);
        }finally{Object.assign(native,{stroke:original.stroke,clip:original.clip,createLinearGradient:original.createLinearGradient});s.Spaces.simToScreen=original.project;scene.visualizers.dispose();for(const orb of scene.orbs)orb.trail.dispose();}
      }
    }
    const micro=[];
    const noop=()=>{};
    for(const row of caseNames.length?[]:[['two-count',2,10,false,false,false],['sixteen-count',16,60,false,false,false],['sixteen-angular',16,60,false,false,true],['sixteen-angular-full',16,60,false,false,true],['sixteen-max-count',16,1000,false,false,false],['sixteen-max-angular-full',16,1000,false,false,true],['sixteen-max-combined',16,1000,true,true,false],['sixteen-max-angular-combined-full',16,1000,true,true,true]]){
      for(const s of row[5]?suites.filter(s=>s.edition==='116g'):suites){
        const scene=build(s,row),context=s.state.ctx;
        s.state.ctx={save:noop,restore:noop,beginPath:noop,moveTo:noop,lineTo:noop,stroke:noop,fillRect:noop,arc:noop,fill:noop,rect:noop,closePath:noop,clip:noop,createLinearGradient:()=>({addColorStop:noop})};
        try{
          for(let i=0;i<200;i++)scene.visualizers.render(s.Renderer,scene.frame);
          const times=[],iterations=row[2]>=1000?50:500;
          for(let round=0;round<8;round++){const start=performance.now();for(let i=0;i<iterations;i++)scene.visualizers.render(s.Renderer,scene.frame);times.push((performance.now()-start)/iterations);}
          micro.push({edition:s.edition,label:row[0],iterationsPerSample:iterations,samples:8,medianMs:percentile(times,.5),timings:times});
        }finally{s.state.ctx=context;scene.visualizers.dispose();for(const orb of scene.orbs)orb.trail.dispose();}
      }
    }
    const updates=[];
    for(const row of caseNames.length?[]:[['two-count',2,10,false,false,false],['sixteen-count',16,60,false,false,false],['sixteen-angular',16,60,false,false,true]]){
      for(const s of row[5]?suites.filter(s=>s.edition==='116g'):suites){
        const scene=build(s,row);
        for(const orb of scene.orbs){orb.resetTrail();orb.particles.emitPerSecond=0;}
        Object.assign(scene.frame,{dtSec:1/60,motionDtSec:1/60,simPaused:false});
        try{
          for(let i=0;i<200;i++)scene.visualizers.update(scene.frame);
          const times=[],iterations=500;
          for(let round=0;round<8;round++){const start=performance.now();for(let i=0;i<iterations;i++)scene.visualizers.update(scene.frame);times.push((performance.now()-start)/iterations);}
          updates.push({edition:s.edition,label:row[0],iterationsPerSample:iterations,samples:8,medianMs:percentile(times,.5),timings:times,retained:scene.orbs.reduce((n,o)=>n+o.trail.particles.length,0)});
        }finally{scene.visualizers.dispose();for(const orb of scene.orbs)orb.trail.dispose();}
      }
    }
    const signatures=[];
    if(!caseNames.length)for(const s of suites)for(const angular of s.edition==='116g'?[false,true]:[false]){
      const scene=build(s,[angular?'sixteen-max-angular-combined-full':'sixteen-max-combined',16,1000,true,true,angular]);
      const context=s.state.ctx,events=[],stack=[],values={globalAlpha:1,lineWidth:1,lineCap:'butt',lineJoin:'miter',strokeStyle:'#000000',fillStyle:'#000000'};let gradients=0;
      const record=(name,args=[])=>events.push(JSON.stringify([name,...args]));
      const methods={save(){record('save');stack.push({...values});},restore(){record('restore');Object.assign(values,stack.pop());},
        createLinearGradient(...args){record('createLinearGradient',args);const id=gradients++;return{gradient:id,addColorStop(...stop){record('addColorStop',[id,...stop]);}};}};
      for(const name of ['beginPath','moveTo','lineTo','stroke','fillRect','arc','fill','rect','closePath','clip'])methods[name]=(...args)=>record(name,args);
      s.state.ctx=new Proxy(values,{get(target,key){return methods[key]||target[key];},set(target,key,value){record('set',[key,value?.gradient!==undefined?{gradient:value.gradient}:value]);target[key]=value;return true;}});
      try{
        scene.visualizers.render(s.Renderer,scene.frame);
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(events.join('\n')));
        signatures.push({edition:s.edition,angular,commands:events.length,gradients,sha256:[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')});
      }finally{s.state.ctx=context;scene.visualizers.dispose();for(const orb of scene.orbs)orb.trail.dispose();}
    }
    if(signatures.some(result=>result.sha256!==signatures[0].sha256||result.commands!==signatures[0].commands))throw Error('All-eligible angular changed Canvas command sequence');
    return {results,canvasCommandSignatures:signatures,updateMicrobenchmark:{cases:updates,qualification:'Actual VisualizerRuntime update and Orb motion with zero emission, fixed accepted1/60s motion/emission delta, no rendering/audio workload. Isolates CPU scheduling/travel accumulation; not FPS.'},javascriptMicrobenchmark:{cases:micro,qualification:'No-op Canvas context isolates JS projection, traversal and runtime scheduling; does not measure rasterization or FPS.'},viewport:[1000,800],dpr:1,background:'#24384d',qualification:'Seeded stationary retained histories; accepted116F imports its entire frozen source worktree. Actual Canvas CPU command-submission and rAF intervals are measured, not GPU completion or an FPS guarantee. Angular rows use identical retained geometry with a 360-degree window over 720 degrees of metadata; -full rows select all existing points with a 3600-degree window. Counts.traversal records chronological suffix yields; backwardLinkReads separately counts backward link access in an untimed extra render, including angular boundaries and governor demand. Projections include particle rendering. JS scratch and particle property observations are structural, not a browser heap attribution.'};
  },{onlyBaseline:process.argv.includes('--baseline-only'),quick:process.argv.includes('--quick'),caseNames:(process.env.AP_116G_CASES||'').split(',').filter(Boolean),repeats:Math.max(1,Math.min(10,Number(process.env.AP_116G_REPEATS)||1)),microOnly:process.argv.includes('--micro-only')});
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  if(!process.argv.includes('--controls-only'))assert.equal(execFileSync('git',['-C',acceptedRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),baseline,'Benchmark worktree must match accepted116F');
  const {CONFIG}=await import('../src/js/core/config.js');const {encodePresetPayload}=await import('../src/js/presets/preset-codec.js');
  const server=http.createServer((req,res)=>{
    try{
      const pathname=new URL(req.url,'http://local').pathname;
      if(pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
      if(pathname==='/probe'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><meta charset="utf-8"><title>116G Canvas evidence</title><style>body{margin:0;background:#24384d}canvas{display:block}</style><canvas></canvas>');}
      if(pathname==='/source'){res.setHeader('Content-Type','text/html');return res.end(fs.readFileSync(path.join(root,'src/index.template.html'),'utf8').replaceAll('__AURALPRINT_VERSION__',version).replace('<!-- AURALPRINT_INLINE_CSS -->',()=>'<style>'+fs.readFileSync(path.join(root,'.build/auralprint.css'),'utf8')+'</style>').replace('<!-- AURALPRINT_INLINE_JS -->','<script type="module" src="/src/js/main.js"></script>'));}
      const base=pathname.startsWith('/accepted/')?acceptedRoot:root;const relative=base===acceptedRoot?pathname.slice('/accepted'.length):pathname;const file=path.resolve(base,'.'+relative);
      if(!file.startsWith(base+path.sep)||!fs.statSync(file).isFile())throw Error('Missing');
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
    }catch{res.writeHead(404);res.end();}
  });
  const report={version,baseline,browser:'',platform:process.platform,editions:[],canvas:null,errors:[]};let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
    browser=await chromium.launch({executablePath:process.env.AP_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});report.browser=browser.version();
    const editions=[['source','/source'],['portable','/dist/auralprint_'+version.slice(1)+'.html'],['hosted','/dist/hosted/index.html']].filter(([name])=>!process.env.AP_116G_EDITIONS||process.env.AP_116G_EDITIONS.split(',').includes(name));
    if(!process.argv.includes('--canvas-only')&&!process.argv.includes('--baseline-only')&&!process.argv.includes('--micro-only'))for(const dpr of(process.env.AP_DPRS||'1,2').split(',').map(Number))for(const[edition,url]of editions){
      console.error('116G native:',edition,'DPR',dpr);const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:dpr});await installCanvasProbe(page);
      page.on('pageerror',e=>report.errors.push(edition+': '+e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(edition+': '+m.text());});page.on('response',r=>{if(r.status()>=400)report.errors.push(edition+': HTTP '+r.status()+' '+r.url());});
      await page.goto(base+url);await page.waitForFunction(()=>document.querySelector('select[id$="-trace-length-mode"]'));
      const controlResult=await controls(page,CONFIG.defaults,encodePresetPayload);await page.reload();await frames(page);
      const rendering=await emittedRendering(page,CONFIG.defaults,encodePresetPayload,dpr);report.editions.push({edition,dpr,controls:controlResult,rendering});await page.close();
    }
    if(!process.argv.includes('--controls-only')){const page=await browser.newPage({viewport:{width:1000,height:800}});await page.goto(base+'/probe');report.canvas=await canvasMeasurements(page);await page.close();}
    assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
  }finally{fs.writeFileSync(process.env.AP_REPORT||path.join(output,'browser-report.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
