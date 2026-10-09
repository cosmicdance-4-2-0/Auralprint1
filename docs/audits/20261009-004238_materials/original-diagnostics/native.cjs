const fs = require('node:fs');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const root='/workspace/Auralprint1';
const version=fs.readFileSync(root+'/version','utf8').trim();
const html=fs.readFileSync(root+`/dist/auralprint_${version.slice(1)}.html`,'utf8');
const instrumented=html.replace('  main();\n})();', '  window.__audit = {state, preferences, runtime, UI, AudioEngine, InputSourceManager, Queue, RecorderEngine, VisualizerRuntime, BandBank, BandBankController, UrlPreset, sanitizePreset, resolveSettings, createVisualizerRuntime, Orb};\n  main();\n})();');
assert.notEqual(html,instrumented);
function wav(seconds=10){const rate=44100,n=rate*seconds,b=Buffer.alloc(44+n*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*4,40);for(let i=0;i<n;i++){b.writeInt16LE(Math.round(9000*Math.sin(2*Math.PI*440*i/rate)),44+i*4);b.writeInt16LE(Math.round(9000*Math.sin(2*Math.PI*880*i/rate)),46+i*4);}return b;}
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-background-networking','--autoplay-policy=no-user-gesture-required']});
const evidence={version,browser:await browser.version(),scenarios:[]};
async function app({instrument=true,viewport={width:1280,height:800},init}={}){
 const page=await browser.newPage({viewport});page.setDefaultTimeout(10000);page.errors=[];page.requests=[];
 page.on('pageerror',e=>page.errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());page.requests.push(u.pathname);if(u.origin==='http://localhost'&&u.pathname==='/')return r.fulfill({contentType:'text/html',body:instrument?instrumented:html});return r.abort();});
 if(init)await page.addInitScript(init);
 await page.goto('http://localhost/');await page.waitForFunction(()=>document.getElementById('btnPlay').textContent==='Play');return page;
}
async function ingest(page,names){await page.locator('#fileInput').setInputFiles(names.map(name=>({name,mimeType:'audio/wav',buffer:wav()})));}
try{
 const plain=await app({instrument:false});await ingest(plain,['ordinary.wav']);await plain.waitForFunction(()=>!document.getElementById('btnPlay').disabled);
 await plain.evaluate(()=>document.getElementById('btnRecordStart').click());await plain.waitForFunction(()=>document.getElementById('recordPanel').dataset.recordingPhase==='recording');
 await plain.waitForTimeout(1100);await plain.evaluate(()=>document.getElementById('btnRecordStop').click());await plain.waitForFunction(()=>document.getElementById('recordPanel').dataset.recordingPhase==='complete');
 evidence.scenarios.push({name:'unmodified built artifact playback and native recording',status:await plain.locator('#recordStatus').textContent(),exportMeta:await plain.locator('#recordExportMeta').textContent(),errors:plain.errors,requestedAssets:plain.requests});await plain.close();
 const pending=await app({init:()=>{const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(...a){super(...a);this.suspend();}resume(){window.pendingEntered=true;return new Promise(resolve=>{window.releasePending=()=>super.resume().then(resolve);});}};}});
 await pending.evaluate(()=>document.getElementById('btnToggleQueue').click());await ingest(pending,['removed-A.wav','surviving-B.wav']);await pending.waitForFunction(()=>window.pendingEntered);
 await pending.locator('#queueList .q-remove').first().click();const before=await pending.evaluate(()=>({queue:__audit.Queue.snapshot(),audio:{...__audit.state.audio},source:{...__audit.state.source}}));
 await pending.evaluate(()=>window.releasePending());await pending.waitForFunction(()=>__audit.state.audio.isLoaded);
 const after=await pending.evaluate(()=>({queue:__audit.Queue.snapshot(),audio:{...__audit.state.audio},source:{...__audit.state.source},src:__audit.AudioEngine.getMediaEl().src}));
 assert.equal(after.audio.filename,'removed-A.wav');assert.equal(after.queue.items[0].name,'surviving-B.wav');evidence.scenarios.push({name:'remove pending current while successor remains',before,after,errors:pending.errors});await pending.close();
 const perf=await app();evidence.scenarios.push({name:'idle UI attribute writes',result:await perf.evaluate(async()=>{const {UI}=__audit;const all=new MutationObserver(()=>{});all.observe(document.body,{subtree:true,attributes:true,childList:true,characterData:true});UI.refreshAllUiText();await Promise.resolve();all.takeRecords();const begin=performance.now();for(let i=0;i<60;i++)UI.refreshAllUiText();const ms=performance.now()-begin;const records=all.takeRecords();all.disconnect();return {refreshes:60,ms,mutations:records.length,titles:records.filter(x=>x.attributeName==='title').length,aria:records.filter(x=>x.attributeName?.startsWith('aria-')).length};}),errors:perf.errors});
 evidence.scenarios.push({name:'non-default band count picker',result:await perf.evaluate(()=>{const a=__audit;a.preferences.bands.count=3;a.UI.applyPrefs(null,{rebuildBandsOnDefinitionChange:true});return {activeCount:a.runtime.settings.bands.count,knownNames:256,band255Range:a.BandBank.formatBandRangeText(255),editorBandLimit:document.querySelector('input[id$="-bands"]').title,bankEdges:a.state.bands.lowHz};})});
 evidence.scenarios.push({name:'focus lost after unrelated settings update',result:await perf.evaluate(()=>{const button=document.querySelector('[data-action="edit"]');document.getElementById('visualizersPanel').style.display='block';button.focus();const before=document.activeElement.dataset.action;__audit.preferences.audio.volume=.8;__audit.UI.applyPrefs(null);__audit.UI.refreshAllUiText();return {before,after:document.activeElement.tagName,oldNodeConnected:button.isConnected};})});
 await perf.close();
 const small=await app({viewport:{width:375,height:667}});evidence.scenarios.push({name:'mobile panel layout',result:await small.evaluate(()=>[...document.querySelectorAll('.panel,.workspace-launcher')].map(n=>({id:n.id,display:getComputedStyle(n).display,rect:n.getBoundingClientRect().toJSON()}))),errors:small.errors});await small.close();
}finally{await browser.close();fs.writeFileSync('/workspace/work/audit/native.json',JSON.stringify(evidence,null,2));}
console.log(JSON.stringify(evidence,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
