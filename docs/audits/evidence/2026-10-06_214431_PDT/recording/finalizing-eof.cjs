const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.AUDIT_PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(process.env.AUDIT_REPO_ROOT || process.cwd());
const outputDir=process.env.AUDIT_OUTPUT_DIR || __dirname;
const chromiumPath=process.env.AUDIT_CHROMIUM_PATH;
const version=fs.readFileSync(path.join(root,'version'),'utf8').trim().replace(/^v/,'');
const built=fs.readFileSync(path.join(root,'dist',`auralprint_${version}.html`),'utf8');
const instrumented=built.replace('  main();\n})();','  main();\n  window.audit = {state, RecorderEngine, AudioEngine, Queue, preferences, UI};\n})();');
assert.notEqual(instrumented,built);
function wav(seconds,hz){const rate=44100,n=rate*seconds,buf=Buffer.alloc(44+n*2);buf.write('RIFF',0);buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)buf.writeInt16LE(Math.round(Math.sin(2*Math.PI*hz*i/rate)*5000),44+i*2);return buf;}
(async()=>{
 const browser=await chromium.launch({...(chromiumPath ? {executablePath:chromiumPath} : {}),headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const result=[];
 for(const mode of ['baseline','recording-across-eof','finalizing-at-eof','native-eof-order']){
  const page=await browser.newPage({viewport:{width:800,height:600}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://recording.audit/**',route=>route.fulfill({contentType:'text/html',body:instrumented}));
  await page.goto('http://recording.audit/');
  await page.evaluate(()=>{const Native=MediaRecorder;window.nativeRecorders=[];window.MediaRecorder=class extends Native{constructor(...args){super(...args);window.nativeRecorders.push(this);}};});
  await page.locator('#fileInput').setInputFiles([{name:'first.wav',mimeType:'audio/wav',buffer:wav(2,440)},{name:'second.wav',mimeType:'audio/wav',buffer:wav(5,880)}]);
  await page.waitForFunction(()=>window.audit.state.audio.isLoaded);
  await page.evaluate(()=>{window.audit.AudioEngine.getMediaEl().pause();window.audit.state.audio.isPlaying=false;});
  if(mode!=='baseline') {
    await page.evaluate(()=>{const a=window.audit;window.startResult=a.RecorderEngine.start();if(!startResult.ok)throw new Error(startResult.message);a.AudioEngine.getMediaEl().play();a.state.audio.isPlaying=true;});
    await page.waitForTimeout(1200);
  }
  await page.evaluate(mode=>{
    const a=window.audit,el=a.AudioEngine.getMediaEl();
    window.events=[];
    if(mode==='finalizing-at-eof'){
      const rec=window.nativeRecorders.at(-1),onstop=rec.onstop;
      rec.onstop=e=>setTimeout(()=>onstop(e),800);
      a.RecorderEngine.stop();
    }
    if(mode==='native-eof-order'){
      el.addEventListener('ended',()=>{window.stopAtEof=a.RecorderEngine.stop();window.events.push({event:'capture-stop-at-eof',phase:a.state.recording.phase});},{capture:true,once:true});
    }
    el.addEventListener('ended',()=>window.events.push({event:'native-ended',phase:a.state.recording.phase,cursor:a.Queue.snapshot().cursor,filename:a.state.audio.filename}),{once:true});
    el.currentTime=el.duration-0.12;el.play();a.state.audio.isPlaying=true;
  },mode);
  await page.waitForTimeout(2000);
  const evidence=await page.evaluate(()=>({queue:window.audit.Queue.snapshot(),audio:{...window.audit.state.audio},recording:{...window.audit.state.recording},mediaEl:{ended:window.audit.AudioEngine.getMediaEl().ended,currentTime:window.audit.AudioEngine.getMediaEl().currentTime,duration:window.audit.AudioEngine.getMediaEl().duration},events:window.events,startResult:window.startResult,stopAtEof:window.stopAtEof}));
  let afterClear,afterStop;
  if(mode==='recording-across-eof'){
    await page.evaluate(()=>document.getElementById('btnClearQueue').click());
    await page.waitForTimeout(250);
    afterClear=await page.evaluate(()=>({phase:window.audit.state.recording.phase,audio:{...window.audit.state.audio},queue:window.audit.Queue.snapshot(),nativeState:window.nativeRecorders.at(-1).state,trackStates:window.nativeRecorders.at(-1).stream.getTracks().map(t=>({kind:t.kind,state:t.readyState}))}));
    await page.evaluate(()=>window.audit.RecorderEngine.stop());
    await page.waitForFunction(()=>window.audit.state.recording.phase==='complete');
    afterStop=await page.evaluate(()=>({phase:window.audit.state.recording.phase,exportSize:window.audit.state.recording.lastExportByteSize,nativeState:window.nativeRecorders.at(-1).state,trackStates:window.nativeRecorders.at(-1).stream.getTracks().map(t=>({kind:t.kind,state:t.readyState}))}));
  }
  result.push({mode,evidence,afterClear,afterStop,errors});
  await page.close();
 }
 assert.equal(result[0].evidence.audio.filename,'second.wav','control: native EOF normally advances the queue');
 assert.equal(result[0].evidence.audio.isPlaying,true);
 const across=result.find(r=>r.mode==='recording-across-eof');
 assert.equal(across.evidence.audio.filename,'second.wav');assert.equal(across.evidence.audio.isPlaying,true);assert.equal(across.evidence.recording.phase,'recording');
 assert.equal(across.afterClear.audio.isLoaded,false);assert.equal(across.afterClear.queue.items.length,0);assert.equal(across.afterClear.phase,'recording');assert.equal(across.afterClear.nativeState,'recording');assert.ok(across.afterClear.trackStates.every(t=>t.state==='live'));
 assert.equal(across.afterStop.phase,'complete');assert.ok(across.afterStop.exportSize>0);assert.equal(across.afterStop.nativeState,'inactive');assert.ok(across.afterStop.trackStates.every(t=>t.state==='ended'));
 for(const entry of result.filter(r=>r.mode==='finalizing-at-eof'||r.mode==='native-eof-order')){
  assert.equal(entry.evidence.recording.phase,'complete','native recording must finalize successfully');
  assert.equal(entry.evidence.audio.filename,'first.wav','observed defect: EOF during finalizing does not advance');
  assert.equal(entry.evidence.queue.cursor,0);
  assert.equal(entry.evidence.audio.isPlaying,false);
  assert.equal(entry.evidence.mediaEl.ended,true);
  assert.ok(entry.evidence.events.some(e=>e.event==='native-ended'&&e.phase==='finalizing'));
 }
 for(const entry of result)assert.deepEqual(entry.errors,[]);
 fs.mkdirSync(outputDir,{recursive:true});
 fs.writeFileSync(path.join(outputDir,'finalizing-eof-results.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result.map(r=>({mode:r.mode,filename:r.evidence.audio.filename,playing:r.evidence.audio.isPlaying,ended:r.evidence.mediaEl.ended,recordingPhase:r.evidence.recording.phase,events:r.evidence.events,errors:r.errors})),null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
