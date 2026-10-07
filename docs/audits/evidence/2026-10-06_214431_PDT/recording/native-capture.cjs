const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.AUDIT_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.AUDIT_REPO_ROOT || process.cwd());
const outputDir = process.env.AUDIT_OUTPUT_DIR || __dirname;
const chromiumPath = process.env.AUDIT_CHROMIUM_PATH;
(async () => {
  const browser = await chromium.launch({...(chromiumPath ? {executablePath:chromiumPath} : {}),headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('http://recording.audit/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/') return route.fulfill({contentType:'text/html',body:'<!doctype html><canvas id="c" width="400" height="300"></canvas>'});
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + '/') || !fs.existsSync(filename)) return route.fulfill({status:404,body:''});
    await route.fulfill({contentType:'text/javascript',body:fs.readFileSync(filename)});
  });
  await page.goto('http://recording.audit/');
  const result = await page.evaluate(async () => {
    const { RecorderEngine } = await import('/src/js/recording/recorder-engine.js');
    const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
    const { state } = await import('/src/js/core/state.js');
    const { CONFIG } = await import('/src/js/core/config.js');
    const { resolveSettings } = await import('/src/js/core/preferences.js');
    resolveSettings();
    const wait = ms => new Promise(r => setTimeout(r,ms));
    const until = async predicate => { for(let i=0;i<250;i++){if(predicate()) return;await wait(20);}throw new Error('timed out'); };
    const realRecorder = MediaRecorder;
    const nativeRecorders = [];
    window.MediaRecorder = class TrackedRecorder extends realRecorder { constructor(...args) {super(...args);nativeRecorders.push(this);} };
    const ctx = new AudioContext(); await ctx.resume();
    const destination = ctx.createMediaStreamDestination();
    const oscillator = ctx.createOscillator();
    oscillator.frequency.value = 440;
    oscillator.connect(destination);oscillator.start();
    await AudioEngine.attachMediaStreamSource(destination.stream,{kind:'mic',monitorOutput:false});
    Object.assign(state.source,{kind:'mic',status:'active',sessionActive:true});
    state.audio.isLoaded = false;
    const canvas = document.getElementById('c');
    const drawing = canvas.getContext('2d');let n=0;
    const drawInterval = setInterval(()=>{drawing.fillStyle=`hsl(${n++%360},80%,50%)`;drawing.fillRect(0,0,400,300);},16);
    RecorderEngine.init({stateRef:state.recording,getRenderTap:()=>({canvas}),getAudioTap:()=>AudioEngine.getRecorderTap()});
    const support = {...state.recording};
    const supported = CONFIG.recording.preferredMimeTypes.filter(type => realRecorder.isTypeSupported(type));
    const cycles = [];
    for(const mimeType of supported) {
      const start = RecorderEngine.start({mimeType});
      if(!start.ok) {cycles.push({mimeType,start});continue;}
      await wait(1100);
      const stop = RecorderEngine.stop();
      await until(()=>state.recording.phase!=='finalizing');
      const blob = state.recording.lastExportUrl ? await (await fetch(state.recording.lastExportUrl)).blob():null;
      const video = document.createElement('video');
      video.src=state.recording.lastExportUrl||'';
      let videoInfo;
      if(blob) { await Promise.race([new Promise(r=>video.onloadedmetadata=r),wait(2000)]);videoInfo={error:video.error?.message,width:video.videoWidth,height:video.videoHeight,duration:Number.isFinite(video.duration)?video.duration:String(video.duration)}; }
      cycles.push({mimeType,start:{ok:start.ok,code:start.code},stop:{ok:stop.ok,code:stop.code},complete:{...state.recording},blob:blob?{size:blob.size,type:blob.type}:null,videoInfo,nativeMimeType:nativeRecorders.at(-1).mimeType,nativeState:nativeRecorders.at(-1).state,audioTrackState:destination.stream.getAudioTracks()[0].readyState});
      video.removeAttribute('src');video.load();
    }
    const previousExport = {...state.recording};
    const previousBlob = await (await fetch(previousExport.lastExportUrl)).blob();
    const nativeCapture = canvas.captureStream.bind(canvas);
    canvas.captureStream = () => {throw new DOMException('injected capture failure','NotSupportedError');};
    const failedRestart = RecorderEngine.start();
    let previousUrlFetch;
    try {await fetch(previousExport.lastExportUrl);previousUrlFetch='still accessible';}catch(e){previousUrlFetch=e.name;}
    const afterFailedRestart={...state.recording};
    canvas.captureStream=nativeCapture;
    RecorderEngine.start();await wait(500);
    const nativeBeforeDispose = nativeRecorders.at(-1);
    const dispose = RecorderEngine.dispose();
    await wait(1500);
    const afterDispose = {phase:state.recording.phase,nativeState:nativeBeforeDispose.state,tracks:nativeBeforeDispose.stream.getTracks().map(t=>({kind:t.kind,state:t.readyState})),liveInputState:destination.stream.getAudioTracks()[0].readyState};
    nativeBeforeDispose.stop();
    clearInterval(drawInterval);oscillator.stop();destination.stream.getTracks().forEach(t=>t.stop());await ctx.close();
    return {browser:navigator.userAgent,support:{phase:support.phase,availableMimeTypes:support.availableMimeTypes},cycles,failedRestart:{previousExportSize:previousBlob.size,previousUrl:previousExport.lastExportUrl,start:failedRestart,after:afterFailedRestart,previousUrlFetch},dispose,afterDispose};
  });
  assert.equal(errors.length,0);
  assert.ok(result.cycles.length>0,'at least one native MIME candidate must work');
  for(const cycle of result.cycles){assert.equal(cycle.complete.phase,'complete');assert.ok(cycle.blob.size>0);assert.equal(cycle.videoInfo.width,400);assert.equal(cycle.videoInfo.height,300);assert.equal(cycle.nativeState,'inactive');assert.equal(cycle.audioTrackState,'live');}
  assert.ok(result.failedRestart.previousExportSize>0);
  assert.equal(result.failedRestart.start.code,'render-capture-unavailable');
  assert.equal(result.failedRestart.after.lastExportUrl,null,'observed defect: previous valid export is lost on failed restart');
  assert.equal(result.failedRestart.previousUrlFetch,'TypeError','observed defect: previous export URL has been revoked');
  assert.equal(result.afterDispose.phase,'disabled');
  assert.equal(result.afterDispose.nativeState,'recording','observed defect: native recorder still records after public dispose');
  assert.equal(result.afterDispose.liveInputState,'live');
  assert.equal(result.afterDispose.tracks.find(t=>t.kind==='video').state,'ended');
  fs.mkdirSync(outputDir,{recursive:true});
  fs.writeFileSync(path.join(outputDir,'native-capture-results.json'),JSON.stringify({result,errors},null,2));
  console.log(JSON.stringify({browser:result.browser,cycles:result.cycles.map(c=>({mimeType:c.mimeType,phase:c.complete?.phase,size:c.blob?.size,video:c.videoInfo,nativeState:c.nativeState})),failedRestart:{previousExportSize:result.failedRestart.previousExportSize,code:result.failedRestart.start.code,lastExportUrl:result.failedRestart.after.lastExportUrl,previousUrlFetch:result.failedRestart.previousUrlFetch},afterDispose:result.afterDispose,errors},null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
