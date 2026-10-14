// I.2A native integration: production build, served-memory observation only.
// Small native WAV playback/decode; held native result delivery is explicit fault injection.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../../../..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const portable = path.join(root, `dist/auralprint_${version.slice(1)}.html`);
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function observed(html) {
  const marker = '  main();\n})();';
  assert.equal(html.split(marker).length, 2);
  const scrubber = 'return { init, loadFile, reset, draw };';
  assert.equal(html.split(scrubber).length, 2);
  return html.replace(scrubber, 'return { init, loadFile, reset, draw, __snapshot: waveformCoordinator.snapshot, __peaks: () => _waveform };')
    .replace(marker, '  window.__i2a={UI,state,AudioEngine,InputSourceManager,RecorderEngine,Scrubber,Queue,analysisFrame};\n'+marker);
}
function wav(seconds=8, channels=2, terminalOnly=false) {
  const n=44100*seconds, b=Buffer.alloc(44+n*channels*2);
  b.write('RIFF'); b.writeUInt32LE(b.length-8,4); b.write('WAVEfmt ',8);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(channels,22);
  b.writeUInt32LE(44100,24); b.writeUInt32LE(44100*channels*2,28);
  b.writeUInt16LE(channels*2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(b.length-44,40);
  for(let i=0;i<n;i++) for(let c=0;c<channels;c++) {
    const v=terminalOnly?(c===channels-1&&i===n-1?-29490:0):Math.round(8000*Math.sin(2*Math.PI*(440+c*110)*i/44100));
    b.writeInt16LE(v,44+(i*channels+c)*2);
  }
  return b;
}
function observations() {
  window.__obs={reads:[],decodes:[],activeReads:0,maxReads:0,activeDecodes:0,maxDecodes:0,holdRead:false,holdDecode:false,failDecode:false,unhandled:[],releases:[]};
  addEventListener('unhandledrejection',e=>__obs.unhandled.push(String(e.reason)));
  function hold(value,operation) {return new Promise(resolve=>__obs.releases.push(()=>{operation.deliveryHeld=false;resolve(value)}))}
  const read=File.prototype.arrayBuffer;
  File.prototype.arrayBuffer=function() {
    const op={name:this.name,bytes:this.size,loaded:window.__i2a?.state.audio.isLoaded,playing:window.__i2a?.state.audio.isPlaying,nativeCompleted:false,deliveryHeld:false};
    __obs.reads.push(op);__obs.maxReads=Math.max(__obs.maxReads,++__obs.activeReads);
    const p=read.call(this).then(bytes=>{op.nativeCompleted=true;if(__obs.holdRead&&__obs.reads.length===1){op.deliveryHeld=true;return hold(bytes,op)}return bytes});
    return p.finally(()=>__obs.activeReads--);
  };
  const decode=OfflineAudioContext.prototype.decodeAudioData;
  OfflineAudioContext.prototype.decodeAudioData=function(bytes) {
    const op={bytes:bytes.byteLength,nativeInvoked:false,nativeCompleted:false,deliveryHeld:false};
    __obs.decodes.push(op);__obs.maxDecodes=Math.max(__obs.maxDecodes,++__obs.activeDecodes);
    if(__obs.failDecode)return Promise.reject(new Error('controlled optional waveform refusal')).finally(()=>__obs.activeDecodes--);
    op.nativeInvoked=true;
    const p=decode.call(this,bytes).then(buffer=>{
      op.nativeCompleted=true;op.frames=buffer.length;op.channels=buffer.numberOfChannels;op.sampleRate=buffer.sampleRate;
      if(__obs.holdDecode&&__obs.decodes.length===1){op.deliveryHeld=true;return hold(buffer,op)}return buffer;
    });
    return p.finally(()=>__obs.activeDecodes--);
  };
}
(async()=>{
  const server=http.createServer((req,res)=>{
    let filename;
    if(req.url==='/portable')filename=portable;
    else if(req.url.startsWith('/nested/'))filename=path.join(root,'dist/hosted',req.url.slice(8));
    else filename=path.join(root,'dist/hosted',req.url==='/'?'index.html':req.url.slice(1));
    if(!filename.startsWith(root)||!fs.existsSync(filename)){res.writeHead(404);res.end();return}
    const ext=path.extname(filename);res.setHeader('Content-Type',ext==='.html'?'text/html':ext==='.svg'?'image/svg+xml':ext==='.png'?'image/png':ext==='.webmanifest'?'application/manifest+json':'application/octet-stream');
    res.end(ext==='.html'?observed(fs.readFileSync(filename,'utf8')):fs.readFileSync(filename));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const evidence={version,browser:await browser.version(),artifactSha256:hash(portable),environment:'headless Linux Chromium, localhost portable/root/nested. File read and native decoder output delivery can be held by test wrappers. Native completion and delivery settlement are tracked separately. No physical reclamation or whole-browser memory cap claim.',cases:[]};
  async function check(name,fn,url='/portable') {
    const p=await browser.newPage({viewport:{width:1440,height:1000}});p.setDefaultTimeout(15000);
    const errors=[],assets=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('response',r=>{if(r.status()>=400)assets.push({url:r.url(),status:r.status()})});
    try {await p.addInitScript(observations);await p.goto(`http://127.0.0.1:${server.address().port}${url}`);const data=await fn(p);assert.deepEqual(errors,[]);assert.deepEqual(assets,[]);assert.deepEqual(await p.evaluate(()=>__obs.unhandled),[]);evidence.cases.push({name,pass:true,data,pageErrors:errors,failedAssets:assets})}
    catch(e){evidence.cases.push({name,pass:false,error:e.message,pageErrors:errors});throw e}
    finally{await p.close()}
  }
  async function load(p,names=['A.wav'],buffer=wav()) {await p.locator('#fileInput').setInputFiles(names.map(name=>({name,mimeType:'audio/wav',buffer})));await p.waitForFunction(name=>__i2a.state.audio.filename===name&&__i2a.state.audio.isPlaying,names[0])}
  async function next(p,name){await p.locator('#btnNext').click();await p.waitForFunction(name=>__i2a.state.audio.filename===name&&__i2a.state.audio.isPlaying,name);await p.waitForFunction(()=>/waiting for waveform/.test(document.getElementById('scrubberTime').textContent))}
  async function ready(p){await p.waitForFunction(()=>__i2a.Scrubber.__peaks()?.length===512&&!__i2a.Scrubber.__snapshot().occupied)}
  const summary=p=>p.evaluate(()=>({reads:__obs.reads,decodes:__obs.decodes,maxReads:__obs.maxReads,maxDecodes:__obs.maxDecodes,ownership:__i2a.Scrubber.__snapshot(),peakCount:__i2a.Scrubber.__peaks()?.length??0,filename:__i2a.state.audio.filename,playing:__i2a.state.audio.isPlaying,text:document.getElementById('scrubberTime').textContent}));
  async function stable(p){await p.locator('#btnPlay').click();await p.waitForFunction(()=>!__i2a.state.audio.isPlaying);return p.evaluate(()=>{__i2a.Scrubber.draw();const target=document.getElementById('scrubberTime'),observer=new MutationObserver(()=>{});observer.observe(target,{subtree:true,childList:true,characterData:true,attributes:true});for(let i=0;i<1000;i++)__i2a.Scrubber.draw();const changes=observer.takeRecords().length;observer.disconnect();if(changes)throw Error('unchanged waveform status mutated DOM');return {iterations:1000,mutations:changes,text:target.textContent}})}
  try {
    for(const [name,url] of [['portable short native playback/ready','/portable'],['hosted root native playback/ready','/'],['hosted nested native playback/ready','/nested/index.html']]) await check(name,async p=>{
      await load(p);await ready(p);const before=await p.evaluate(()=>__i2a.AudioEngine.getMediaEl().currentTime);await p.waitForFunction(t=>__i2a.AudioEngine.getMediaEl().currentTime>t+.1,before);const row=await summary(p);assert.equal(row.peakCount,512);assert.equal(row.reads[0].loaded,true);assert.equal(row.reads[0].playing,true);return {...row,stableReady:await stable(p)};
    },url);
    await check('native sixth-channel terminal impulse contributes to final bucket',async p=>{await load(p,['six-channel.wav'],wav(2,6,true));await ready(p);const result=await p.evaluate(()=>({channels:__obs.decodes[0].channels,finalPeak:__i2a.Scrubber.__peaks()[511],earlyPeak:__i2a.Scrubber.__peaks()[0],buckets:__i2a.Scrubber.__peaks().length}));assert.equal(result.channels,6);assert.equal(result.buckets,512);assert.ok(result.finalPeak>.89);assert.equal(result.earlyPeak,0);return result});
    await check('A native result held; B/C supersession admits no extra read/decode, only C proceeds',async p=>{
      await p.evaluate(()=>__obs.holdDecode=true);await load(p,['A.wav','B.wav','C.wav']);await p.waitForFunction(()=>__obs.releases.length===1);
      await next(p,'B.wav');await next(p,'C.wav');const blocked=await summary(p);assert.deepEqual(blocked.reads.map(r=>r.name),['A.wav']);assert.equal(blocked.decodes.length,1);assert.equal(blocked.peakCount,0);assert.equal(blocked.ownership.pending,true);
      const stableWaiting=await stable(p);await p.evaluate(()=>__obs.releases.splice(0).forEach(r=>r()));await ready(p);const settled=await summary(p);assert.deepEqual(settled.reads.map(r=>r.name),['A.wav','C.wav']);assert.equal(settled.decodes.length,2);assert.equal(settled.maxReads,1);assert.equal(settled.maxDecodes,1);return {blocked,stableWaiting,settled};
    });
    await check('A native encoded read result held; replacement skips stale decode and admits only C',async p=>{
      await p.evaluate(()=>__obs.holdRead=true);await load(p,['A.wav','B.wav','C.wav']);await p.waitForFunction(()=>__obs.releases.length===1);await next(p,'B.wav');await next(p,'C.wav');const blocked=await summary(p);assert.deepEqual(blocked.reads.map(r=>r.name),['A.wav']);assert.equal(blocked.decodes.length,0);await p.evaluate(()=>__obs.releases.splice(0).forEach(r=>r()));await ready(p);const settled=await summary(p);assert.deepEqual(settled.reads.map(r=>r.name),['A.wav','C.wav']);assert.equal(settled.decodes.length,1);assert.equal(settled.maxReads,1);return {blocked,settled};
    });
    await check('optional native-decode refusal preserves playback, seek and later recovery',async p=>{
      await p.evaluate(()=>__obs.failDecode=true);await load(p);await p.waitForFunction(()=>/waveform unavailable/.test(document.getElementById('scrubberTime').textContent));const box=await p.locator('#scrubberCanvas').boundingBox();await p.locator('#scrubberCanvas').click({position:{x:box.width*.75,y:12}});const failed=await p.evaluate(()=>({loaded:__i2a.state.audio.isLoaded,playing:__i2a.state.audio.isPlaying,error:__i2a.state.audio.transportError,time:__i2a.AudioEngine.getMediaEl().currentTime,duration:__i2a.AudioEngine.getMediaEl().duration,seekFraction:.75}));assert.equal(failed.playing,true);assert.equal(failed.loaded,true);assert.equal(failed.error,'');assert.ok(Math.abs(failed.time-failed.duration*.75)<.2,'native fallback seek must reach requested timeline fraction');const stableUnavailable=await stable(p);await p.evaluate(()=>__obs.failDecode=false);await p.locator('#fileInput').setInputFiles({name:'recovery.wav',mimeType:'audio/wav',buffer:wav()});await p.locator('#btnNext').click();await p.waitForFunction(()=>__i2a.state.audio.filename==='recovery.wav'&&__i2a.state.audio.isPlaying);await ready(p);return {failed,stableUnavailable,recovered:await summary(p)};
    });
    await check('Clear pending native delivery invalidates peaks and pending intent but retains occupancy',async p=>{
      await p.evaluate(()=>__obs.holdDecode=true);await load(p,['A.wav','B.wav']);await p.waitForFunction(()=>__obs.releases.length===1);await next(p,'B.wav');await p.locator('#btnToggleQueue').click();await p.locator('#btnClearQueue').click();const cleared=await summary(p);assert.equal(cleared.ownership.occupied,true);assert.equal(cleared.ownership.pending,false);assert.equal(cleared.peakCount,0);assert.equal(cleared.playing,false);await p.evaluate(()=>__obs.releases.splice(0).forEach(r=>r()));await p.waitForFunction(()=>!__i2a.Scrubber.__snapshot().occupied);const settled=await summary(p);assert.equal(settled.reads.length,1);assert.equal(settled.peakCount,0);return {cleared,settled};
    });
    for(const source of ['mic','stream'])await check(`pending File → ${source} preserves live-source ownership and discards waveform intent`,async p=>{
      await p.evaluate(()=>__obs.holdDecode=true);await load(p,['A.wav','B.wav']);await p.waitForFunction(()=>__obs.releases.length===1);await next(p,'B.wav');
      if(source==='stream')await p.evaluate(()=>navigator.mediaDevices.getDisplayMedia=async()=>{throw Object.assign(Error('Controlled Stream denied'),{name:'NotAllowedError'})});
      await p.locator(source==='mic'?'#btnSourceMic':'#btnSourceStream').click();await p.waitForFunction(kind=>__i2a.state.source.kind===kind&&__i2a.state.source.status===(kind==='mic'?'active':'error'),source);
      const blocked=await summary(p);assert.equal(blocked.ownership.occupied,true);assert.equal(blocked.ownership.pending,false);await p.evaluate(()=>__obs.releases.splice(0).forEach(r=>r()));await p.waitForFunction(()=>!__i2a.Scrubber.__snapshot().occupied);const settled=await summary(p);assert.equal(settled.reads.length,1);assert.equal(settled.peakCount,0);return {blocked,settled,source:await p.evaluate(()=>({kind:__i2a.state.source.kind,status:__i2a.state.source.status,error:__i2a.state.source.errorMessage}))};
    });
    await check('native recording survives File changes while waveform operation remains blocked',async p=>{
      await p.evaluate(()=>__obs.holdDecode=true);await load(p,['A.wav','B.wav','C.wav']);await p.waitForFunction(()=>__obs.releases.length===1);await p.locator('#btnOpenRecord').click();await p.locator('#btnRecordStart').click();await p.waitForFunction(()=>__i2a.state.recording.phase==='recording');await next(p,'B.wav');await next(p,'C.wav');const active=await p.evaluate(()=>({phase:__i2a.state.recording.phase,filename:__i2a.state.audio.filename,readCount:__obs.reads.length,decodeCount:__obs.decodes.length}));assert.equal(active.phase,'recording');assert.equal(active.filename,'C.wav');assert.equal(active.decodeCount,1);await p.locator('#btnRecordStop').click();await p.waitForFunction(()=>__i2a.state.recording.phase==='complete');const exported=await p.evaluate(()=>({bytes:__i2a.state.recording.lastExportByteSize,url:!!__i2a.state.recording.lastExportUrl}));assert.ok(exported.bytes>0);assert.equal(exported.url,true);await p.evaluate(()=>__obs.releases.splice(0).forEach(r=>r()));await ready(p);return {active,exported,settled:await summary(p)};
    });
    await check('browser abortable-reader capability probe (not implemented)',async p=>p.evaluate(async()=>{
      const reader=new FileReader(),events=[];await new Promise((resolve,reject)=>{reader.onabort=()=>events.push({type:'abort',readyState:reader.readyState});reader.onloadend=()=>{events.push({type:'loadend',readyState:reader.readyState});resolve()};reader.onerror=()=>reject(reader.error);reader.readAsArrayBuffer(new Blob([new Uint8Array(65536)]));reader.abort()});if(reader.readyState!==FileReader.DONE||!events.some(e=>e.type==='abort'))throw Error('abort acknowledgement absent');return {events,resultNull:reader.result===null,bytes:65536,productionReader:'File.arrayBuffer unchanged',physicalReleaseClaim:false};
    }));
  } finally {await browser.close();await new Promise(r=>server.close(r));const output=process.argv[2]||path.join(root,'work/i2a-native.json');fs.writeFileSync(output,JSON.stringify(evidence,null,2)+'\n')}
  console.log(JSON.stringify({cases:evidence.cases.length,passed:evidence.cases.filter(c=>c.pass).length,browser:evidence.browser}));
})().catch(e=>{console.error(e);process.exitCode=1});
