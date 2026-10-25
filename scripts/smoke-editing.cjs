// Mandatory native editing gate, separate from the authored-camera gate.
// Runs actual source/portable/hosted listeners. Observes canonical preferences
// through the real Share action; no application source rewriting or fake ranges.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),version=fs.readFileSync(path.join(root,'version'),'utf8').trim();
const hash=prefs=>'#p='+Buffer.from(JSON.stringify({schema:12,prefs})).toString('base64url');
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const readPath=(object,keys)=>keys.reduce((o,k)=>o[k],object);
const writePath=(object,keys,value)=>{readPath(object,keys.slice(0,-1))[keys.at(-1)]=value;};
const onGrid=(value,{min,max,step})=>Number.isFinite(value)&&value>=min&&value<=max&&Math.abs((value-min)/step-Math.round((value-min)/step))<1e-9;
async function share(page){return page.evaluate(()=>{document.getElementById('btnShare').click();return JSON.parse(atob(location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/'))).prefs;});}
async function apply(page,prefs){await page.evaluate(h=>{history.replaceState(null,'',location.pathname+h);document.getElementById('btnApplyUrl').click();},hash(prefs));await frames(page);}
async function show(page,owner){await page.evaluate(owner=>{
  const panel=owner==='Analysis'?'Analysis':'Visualizers';
  for(const name of ['Audio','Analysis','Visualizers','Scene','Camera','Queue','Record']){
    const element=document.getElementById(name==='Audio'?'audioPanel':name==='Scene'?'scenePanel':name[0].toLowerCase()+name.slice(1)+'Panel');
    const button=document.getElementById('btnOpen'+name);
    if(element&&button&&getComputedStyle(element).display!=='none'&&name!==panel)button.click();
  }
  const element=document.getElementById(panel[0].toLowerCase()+panel.slice(1)+'Panel');
  if(getComputedStyle(element).display==='none')document.getElementById('btnOpen'+panel).click();
},owner);}
async function reveal(page,item){
  await show(page,item.owner);const control=page.locator(item.selector).first();
  await control.evaluate((el,item)=>{
    for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
    const probe=window.editingSmoke;probe.observed ||= new WeakSet();probe.commits ||= [];
    if(!probe.observed.has(el)){
      probe.observed.add(el);el.addEventListener('input',()=>{
        if(el.disabled)return;
        document.getElementById('btnShare').click();
        const prefs=JSON.parse(atob(location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/'))).prefs;
        probe.commits.push({value:item.path.reduce((o,key)=>o[key],prefs),limit:item.limit,selector:item.selector});
      });
    }
  },item);return control;
}
async function inspect(control){return control.evaluate(el=>({value:Number(el.value),min:el.min,max:el.max,step:el.step,invalid:el.validity.stepMismatch,disabled:el.disabled,focused:document.activeElement===el,text:el.parentElement.querySelector('.val').textContent,aria:el.getAttribute('aria-valuetext')}));}
function isolated(before,after,item){const expected=structuredClone(before);const value=readPath(after,item.path);assert.ok(onGrid(value,item.limit),`${item.selector} committed off-grid ${value}`);writePath(expected,item.path,value);if(item.owner==='Bulk')for(let i=1;i<expected.orbs.length;i++)writePath(expected,['orbs',i,...item.path.slice(2)],value);assert.deepEqual(after,expected,`${item.selector} changed unrelated Scene fields`);return value;}
async function committed(page,control,before,item){await frames(page);const after=await share(page),value=isolated(before,after,item),ui=await inspect(control);near(ui.value,value*(item.scale||1));assert.equal(ui.invalid,false);assert.doesNotMatch(ui.text,/Current .*slider selection/);near(parseFloat(ui.text),item.path.at(-1)==='startAngleRad'?value*180/Math.PI:value);assert.ok(ui.aria);return value;}
function wav(){const data=Buffer.alloc(44+48000*2*3);data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(48000,24);data.writeUInt32LE(96000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(data.length-44,40);for(let i=44;i<data.length;i+=2)data.writeInt16LE(Math.round(Math.sin(i*.03)*1000),i);return data;}
async function drafts(page,fixture){
  for(const [id,draft] of [['inpBandFloorHz','37.125'],['inpBandFloorHz',''],['inpBandCeilingHz','22000.125'],['inpBandCeilingHz','']]){
    await apply(page,fixture);await show(page,'Analysis');
    await page.evaluate(()=>{window.editingSmoke.delayFile=true;window.editingSmoke.waiting=false;});
    // A trusted gesture permits native audio; the returned play promise alone
    // is delayed after real playback starts, faithfully delaying load completion.
    await page.evaluate(()=>document.getElementById('btnOpenAudio').click());
    await page.locator('#btnLoad').click();
    const name=id+'-'+(draft?'valid':'invalid')+'.wav';
    await page.locator('#fileInput').setInputFiles({name,mimeType:'audio/wav',buffer:wav()});
    await page.waitForFunction(()=>window.editingSmoke.waiting);await show(page,'Analysis');
    const input=page.locator('#'+id);await input.fill(draft);if(!draft)await input.press('-');
    const draftState=await input.evaluate(el=>({value:el.value,badInput:el.validity.badInput}));
    assert.ok(await input.evaluate(el=>document.activeElement===el));
    await page.evaluate(()=>{const e=document.getElementById('rngVol');e.value='.37';e.dispatchEvent(new Event('input',{bubbles:true}));editingSmoke.release();});
    await page.waitForFunction(name=>document.getElementById('audioStatus').textContent.includes('Loaded: '+name),name);
    await frames(page);
    assert.deepEqual(await input.evaluate(el=>({value:el.value,badInput:el.validity.badInput})),draftState,'File completion lost a focused draft');
    assert.ok(await input.evaluate(el=>document.activeElement===el));
    assert.match(await page.locator('#bandMeta').textContent(),/Sample rate:/);
    assert.equal((await share(page)).bands[id==='inpBandFloorHz'?'floorHz':'ceilingHz'],id==='inpBandFloorHz'?20:22500);
    await input.press('Tab');await frames(page);
    const canonical=(await share(page)).bands[id==='inpBandFloorHz'?'floorHz':'ceilingHz'];
    assert.equal(canonical,draft?Number(draft):id==='inpBandFloorHz'?20:22500);
    await input.dispatchEvent('change');assert.equal((await share(page)).bands[id==='inpBandFloorHz'?'floorHz':'ceilingHz'],canonical);
    // Hiding/revealing and repeated native change cannot restore a rejected draft.
    await page.evaluate(()=>{document.getElementById('btnHideAnalysis').click();document.getElementById('btnOpenAnalysis').click();});await frames(page);
    assert.equal(await input.inputValue(),String(canonical));
  }
  for(const reset of [false,true]){
    await apply(page,fixture);await show(page,'Analysis');
    const input=page.locator('#inpBandFloorHz');await input.fill('43.125');
    const next=structuredClone(fixture);next.bands.floorHz=55.5;
    if(reset)await page.evaluate(()=>document.getElementById('btnResetPrefs').click());else await apply(page,next);
    assert.equal(await input.inputValue(),reset?'20':'55.5','Explicit replacement retained an obsolete draft');
    await input.dispatchEvent('blur');await input.dispatchEvent('change');await input.dispatchEvent('change');
    assert.equal((await share(page)).bands.floorHz,reset?20:55.5,'Late change recommitted a superseded draft');
  }
  await apply(page,fixture);await show(page,'Analysis');
  for(const [id,value] of [['inpBandFloorHz','30000'],['inpBandCeilingHz','10']]){
    const before=await share(page),input=page.locator('#'+id);await input.fill(value);await input.press('Tab');assert.deepEqual(await share(page),before,'Crossed bounds mutated preferences');
  }
}
async function sliders(page,fixture,cases){
  await apply(page,fixture);
  const initial=await share(page);assert.deepEqual(initial,fixture,'Import/share altered legacy values');
  const discovered=await page.evaluate(()=>[...document.querySelectorAll('#visualizersPanel input[type=range],#analysisPanel input[type=range]')].length);
  for(const item of cases){
    const control=await reveal(page,item),ui=await inspect(control);
    assert.deepEqual([ui.min,ui.max,ui.step],[String(item.limit.min*(item.scale||1)),String(item.limit.max*(item.scale||1)),String(item.limit.step*(item.scale||1))],item.selector);
    assert.equal(ui.invalid,false);assert.match(ui.text,/Current .*slider selection .*edit to apply/,item.selector);assert.match(ui.aria,/Current .*slider selection/,item.selector);
    assert.ok(await control.evaluate(el=>{const out=el.parentElement.querySelector('.val');return getComputedStyle(out).whiteSpace==='normal'&&out.scrollWidth<=out.clientWidth+1;}),'Discrepancy readout is clipped');
    assert.equal(readPath(await share(page),item.path),item.legacy,'Refresh quantized import');
  }
  assert.equal(discovered,cases.reduce((sum,item)=>sum+(item.owner==='Orb'?fixture.orbs.length:1),0),'Numeric slider inventory is incomplete');
  for(const item of cases){
    for(const [key,direction] of [['ArrowRight',1],['ArrowLeft',-1]]){
      await apply(page,fixture);const control=await reveal(page,item),before=await share(page);await control.focus();
      await control.press(key);const value=await committed(page,control,before,item);
      const index=(item.legacy-item.limit.min)/item.limit.step;
      const selected=item.limit.min+(direction>0?Math.ceil(index):Math.floor(index))*item.limit.step;
      near(value,selected);assert.ok(await control.evaluate(el=>document.activeElement===el),'Arrow edit lost focus');
    }
    // Native pointer dragging uses the real range, at two non-grid fractions.
    const control=await reveal(page,item);
    for(const fraction of [.373,.827]){
      const before=await share(page);await control.scrollIntoViewIfNeeded();const box=await control.boundingBox();
      await page.mouse.move(box.x+box.width*.2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*fraction,box.y+box.height/2,{steps:3});await page.mouse.up();
      await committed(page,control,before,item);
    }
    for(const key of ['Home','End']){const before=await share(page);await control.focus();await control.press(key);const value=await committed(page,control,before,item);if(item.path.at(-1)==='startAngleRad')assert.equal(value,0,'Phase Home/End must commit endpoint zero');}
    // Bypass HTML sanitation to prove the editing owner validates submissions.
    const before=await share(page);await control.evaluate((el,value)=>{const step=el.step;el.step='any';el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.step=step;},item.legacy*(item.scale||1));
    await committed(page,control,before,item);
  }
  const commits=await page.evaluate(()=>editingSmoke.commits);
  assert.ok(commits.length>cases.length*6,'Missing native input observations');
  for(const commit of commits)assert.ok(onGrid(commit.value,commit.limit),`${commit.selector} intermediate input committed ${commit.value}`);
  // Disabled phase-locked Ring cannot submit even a synthetic input.
  await apply(page,fixture);await page.evaluate(()=>{const mode=document.getElementById('selRingPhaseMode');mode.value='orb';mode.dispatchEvent(new Event('change',{bubbles:true}));});await frames(page);
  const locked=await share(page);assert.equal(await page.locator('#rngRingSpeed').isDisabled(),true);
  await page.locator('#rngRingSpeed').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.deepEqual(await share(page),locked);
}
(async()=>{
  const {CONFIG}=await import('../src/js/core/config.js'),{sliderCases,individualSliders,analysisSliders,ringSliders}=await import('../tests/helpers/step-control-cases.js');
  const fixture=structuredClone(CONFIG.defaults);fixture.orbs=fixture.orbs.slice(0,1);
  for(const item of [...individualSliders,...analysisSliders,...ringSliders])writePath(fixture,item.path,item.legacy);
  fixture.orbs.push({...structuredClone(fixture.orbs[0]),id:'second-orb'});
  const errors=[],results=[];
  const server=http.createServer((req,res)=>{
    try{const pathname=new URL(req.url,'http://local').pathname;if(pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
      if(pathname==='/source'){res.setHeader('Content-Type','text/html');return res.end(fs.readFileSync(path.join(root,'src/index.template.html'),'utf8').replaceAll('__AURALPRINT_VERSION__',version).replace('<!-- AURALPRINT_INLINE_CSS -->',()=>'<style>'+fs.readFileSync(path.join(root,'.build/auralprint.css'),'utf8')+'</style>').replace('<!-- AURALPRINT_INLINE_JS -->','<script type="module" src="/src/js/main.js"></script>'));}
      const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw Error('Invalid resource');
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
    }catch(error){errors.push(`server ${req.url}: ${error.message}`);res.writeHead(404);res.end();}
  });
  let browser;
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
    console.log(`Editing smoke: ${version}, Chromium ${browser.version()}, ${sliderCases.length} sliders`);
    for(const dpr of (process.env.AP_DPRS||'1').split(',').map(Number))for(const [edition,file] of [['source','/source'],['portable',`/dist/auralprint_${version.slice(1)}.html`],['hosted','/dist/hosted/index.html']]){
      const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:dpr}),page=await context.newPage();page.setDefaultTimeout(10000);
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>errors.push(r.url()));page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
      await page.addInitScript(()=>{window.editingSmoke={delayFile:false};const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=async function(...args){const result=await play.apply(this,args);if(editingSmoke.delayFile){editingSmoke.delayFile=false;await new Promise(resolve=>{editingSmoke.release=resolve;editingSmoke.waiting=true;});}return result;};});
      await page.goto(`http://127.0.0.1:${server.address().port}${file}`+hash(fixture));await page.waitForFunction(()=>document.querySelector('input[id$="-angular-speed"]'));await frames(page);
      await drafts(page,fixture);console.log(`PASS ${edition} DPR ${dpr}: delayed real File, valid/invalid drafts, commits, hide/reveal, explicit replacement, late events`);
      await sliders(page,fixture,sliderCases);console.log(`PASS ${edition} DPR ${dpr}: all CONFIG limits/steps, legacy readout/ARIA, arrows, pointer drag, Home/End, owner validation, isolation and Ring lock`);
      assert.deepEqual(errors,[]);results.push({edition,dpr,sliders:sliderCases.length});await context.close();
    }
    if(process.env.AP_REPORT)fs.writeFileSync(process.env.AP_REPORT,JSON.stringify({version,browser:browser.version(),results,errors},null,2)+'\n');
    console.log('PASS editing smoke');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error('FAIL editing smoke:',error);process.exitCode=1;});
