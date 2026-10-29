const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
(async () => {
  const server = http.createServer((req,res) => {
    if (req.url === '/') {res.writeHead(200, {'Content-Type':'text/html'});res.end('<!doctype html><link rel="icon" href="data:,"><canvas id="c" width="640" height="360"></canvas>');return;}
    const file = path.join(root, req.url.split('?')[0]);
    try { const content=fs.readFileSync(file);res.writeHead(200, {'Content-Type':file.endsWith('.js')?'application/javascript':'text/plain'});res.end(content);}
    catch {res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  try {
    const page=await browser.newPage();const consoleErrors=[],pageErrors=[];
    page.on('pageerror',err=>pageErrors.push(err.message));page.on('console',m=>{if(m.type()==='error') consoleErrors.push(m.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result=await page.evaluate(async()=>{
      const {createRecorderEngine}=await import('/src/js/recording/recorder-engine.js');
      const {state,createRecordingState}=await import('/src/js/core/state.js');
      const {CONFIG}=await import('/src/js/core/config.js');
      const {AudioEngine}=await import('/src/js/audio/audio-engine.js');
      const {resolveSettings}=await import('/src/js/core/preferences.js');
      resolveSettings();
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const until=async check=>{const end=performance.now()+5000;while(!check()){if(performance.now()>end)throw Error('wait expired');await sleep(20);}};
      const canvas=document.getElementById('c'),ctx=canvas.getContext('2d');
      let turn=0;const draw=setInterval(()=>{ctx.fillStyle=turn++%2?'#ff0066':'#00ccff';ctx.fillRect(0,0,canvas.width,canvas.height);},30);
      const sourceAudio=new AudioContext(),osc=sourceAudio.createOscillator(),dest=sourceAudio.createMediaStreamDestination();
      osc.frequency.value=563;osc.connect(dest);osc.start();await sourceAudio.resume();
      const tracks=[],native=[],urlCreated=[],urlRevoked=[];
      const cap=canvas.captureStream.bind(canvas);canvas.captureStream=fps=>{const stream=cap(fps);tracks.push(...stream.getTracks());return stream;};
      const nativeMediaRecorder=window.MediaRecorder;
      window.MediaRecorder=class extends nativeMediaRecorder {constructor(...args){super(...args);native.push(this);}};
      const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
      URL.createObjectURL=blob=>{const url=create(blob);urlCreated.push({url,bytes:blob.size});return url;};
      URL.revokeObjectURL=url=>{urlRevoked.push(url);return revoke(url);};
      state.audio.isLoaded=true;
      const recording=createRecordingState(),engine=createRecorderEngine();
      const init=()=>engine.init({stateRef:recording,getRenderTap:()=>({canvas}),getAudioTap:()=>({ensureStream:()=>dest.stream,releaseStream(){}})});
      init();const cycles=[];
      for(let i=0;i<3;i++){
        const started=engine.start();await sleep(450);
        if(i===1){canvas.width=320;canvas.height=700;}
        await sleep(450);engine.stop();await until(()=>recording.phase!=='finalizing');
        const snapshot=structuredClone(recording),blob=await(await fetch(recording.lastExportUrl)).blob();
        const bytes = new Uint8Array(await blob.arrayBuffer()); let encoded=''; for(const byte of bytes)encoded+=String.fromCharCode(byte);
        cycles.push({artifact:btoa(encoded)});
        const video=document.createElement('video');video.muted=true;video.src=recording.lastExportUrl;
        await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('export decode failed'));video.load();});
        cycles.push({start:started.ok,phase:snapshot.phase,bytes:blob.size,type:blob.type,nativeState:native.at(-1).state,videoWidth:video.videoWidth,videoHeight:video.videoHeight,renderEnded:tracks.at(-1).readyState,upstreamState:dest.stream.getTracks()[0].readyState});
        video.src='';video.load();
      }
      const retained=recording.lastExportUrl;
      const captureWithTracking=canvas.captureStream;
      canvas.captureStream=()=>{throw new DOMException('injected capture failure','NotSupportedError');};
      const failedStart=engine.start();
      const acquisitionFailure={ok:failedStart.ok,code:failedStart.code,phase:recording.phase,retained:recording.lastExportUrl===retained,retainedBytes:(await(await fetch(retained)).blob()).size,previousRevoked:urlRevoked.includes(retained)};
      canvas.captureStream=captureWithTracking;
      engine.start();await sleep(200);const stale=native.at(-1);engine.cancel();await sleep(100);
      const afterCancel={phase:recording.phase,retained:recording.lastExportUrl===retained,retainedBytes:(await(await fetch(retained)).blob()).size,nativeState:stale.state,renderEnded:tracks.at(-1).readyState,upstreamState:dest.stream.getTracks()[0].readyState};
      engine.start();await sleep(250);const disposing=native.at(-1);const dispose=engine.dispose();await sleep(200);
      const afterDispose={ok:dispose.ok,phase:recording.phase,nativeState:disposing.state,renderEnded:tracks.at(-1).readyState,upstreamState:dest.stream.getTracks()[0].readyState,lastExportUrl:recording.lastExportUrl,oldUrlRevoked:urlRevoked.includes(retained)};
      // Independent fault probe through the actual AudioEngine tap owner. Its native destination
      // track is retained here only to observe whether a refused stop is recognized.
      const rate=44100,frames=rate*5,bytes=new ArrayBuffer(44+frames*2),view=new DataView(bytes);
      const word=(off,s)=>[...s].forEach((c,i)=>view.setUint8(off+i,c.charCodeAt(0)));
      word(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);word(8,'WAVE');word(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,frames*2,true);for(let i=0;i<frames;i++)view.setInt16(44+i*2,Math.round(8000*Math.sin(2*Math.PI*661*i/rate)),true);
      await AudioEngine.loadFile(new File([bytes],'native-audio.wav',{type:'audio/wav'}));
      const recording2=createRecordingState(),engine2=createRecorderEngine();
      engine2.init({stateRef:recording2,getRenderTap:()=>({canvas}),getAudioTap:()=>AudioEngine.getRecorderTap()});
      const controlTrack=AudioEngine.getRecorderTap().ensureStream().getAudioTracks()[0];
      engine2.start();await sleep(450);engine2.stop();await until(()=>recording2.phase!=='finalizing');
      const controlExport=recording2.lastExportUrl;
      const fileCleanupControl={phase:recording2.phase,code:recording2.lastCode,trackState:controlTrack.readyState,exportBytes:recording2.lastExportByteSize};
      const tap=AudioEngine.getRecorderTap().ensureStream(),tapTrack=tap.getAudioTracks()[0],stop=tapTrack.stop.bind(tapTrack);
      tapTrack.stop=()=>{throw new Error('injected tap-track stop refusal');};
      engine2.start();await sleep(450);engine2.stop();await until(()=>recording2.phase!=='finalizing');
      const failedCleanup={phase:recording2.phase,code:recording2.lastCode,recorderEnabled:recording2.recorderEnabled,nativeShutdown:recording2.nativeShutdown,oldTapTrackState:tapTrack.readyState,previousExportReplaced:recording2.lastExportUrl!==controlExport,previousExportRevoked:urlRevoked.includes(controlExport),retry:engine2.start().ok,exportBytes:recording2.lastExportByteSize};
      engine2.cancel();engine2.dispose();stop();
      clearInterval(draw);for(const t of tracks)t.stop();for(const t of dest.stream.getTracks())t.stop();osc.stop();await sourceAudio.close();
      return {cycles,acquisitionFailure,afterCancel,afterDispose,fileCleanupControl,failedCleanup,created:urlCreated.length,revoked:urlRevoked.length};
    });
    const encoded=result.cycles.filter(c=>c.artifact).map(c=>c.artifact);
    result.cycles=result.cycles.filter(c=>!c.artifact);
    encoded.forEach((data,i)=>fs.writeFileSync(path.join(__dirname,`capture-${i}.webm`),Buffer.from(data,'base64')));
    result.consoleErrors=consoleErrors;result.pageErrors=pageErrors;
    fs.writeFileSync(path.join(__dirname,'native.json'),JSON.stringify(result,null,2)+'\n');
    assert.ok(result.cycles.every(c=>c.phase==='complete'&&c.bytes>0&&c.renderEnded==='ended'&&c.upstreamState==='live'));
    assert.equal(result.acquisitionFailure.ok,false);assert.equal(result.acquisitionFailure.code,'render-capture-unavailable');assert.equal(result.acquisitionFailure.retained,true);assert.equal(result.acquisitionFailure.previousRevoked,false);
    assert.equal(result.afterCancel.retained,true);assert.equal(result.afterCancel.nativeState,'inactive');assert.equal(result.afterCancel.renderEnded,'ended');assert.equal(result.afterCancel.upstreamState,'live');
    assert.equal(result.afterDispose.ok,true);assert.equal(result.afterDispose.nativeState,'inactive');assert.equal(result.afterDispose.renderEnded,'ended');assert.equal(result.afterDispose.upstreamState,'live');assert.equal(result.afterDispose.lastExportUrl,null);assert.equal(result.afterDispose.oldUrlRevoked,true);assert.deepEqual(result.pageErrors,[]);
    assert.equal(result.fileCleanupControl.trackState,'ended');assert.equal(result.failedCleanup.oldTapTrackState,'live');assert.equal(result.failedCleanup.recorderEnabled,true);assert.equal(result.failedCleanup.previousExportReplaced,true);assert.equal(result.failedCleanup.previousExportRevoked,true);assert.equal(result.failedCleanup.retry,true);
    console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
