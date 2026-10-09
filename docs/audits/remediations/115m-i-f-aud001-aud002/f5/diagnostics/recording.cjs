/* F.5 configured native recording regression, derived from immutable F.4 runner. Only browser-memory observation/faults.
 * Run after npm run build; --output must point outside immutable evidence.
 * Native recorder, generated WAV, localhost HTTP root/nested and file://.
 */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { chromium, firefox, webkit } = require('playwright');
const root = path.resolve(__dirname, '../../../../../..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const portablePath = path.join(root, `dist/auralprint_${version.slice(1)}.html`);
const portable = fs.readFileSync(portablePath, 'utf8');
function insert(text, marker, replacement) { assert.equal(text.split(marker).length, 2, marker); return text.replace(marker, replacement); }
let observed = insert(portable, '  main();\n})();', '  window.__a = {state, Queue, UI, AudioEngine, InputSourceManager, RecorderEngine, Scrubber};\n  main();\n})();');
observed = insert(observed, '      AudioEngine._isLoadRequestCurrent = isCurrentFileRequest;', '      window.__request = () => activeFileRequest; window.__load = loadAndPlay;\n      AudioEngine._isLoadRequestCurrent = isCurrentFileRequest;');
observed = insert(observed, '      getRecorderTap() {', '      __graph() { return {sourceNode, outputGain, splitter, sumNode, sumGainL, sumGainR, bands, activeUpstream, recorderTapDestination, recorderTapConnectedOutputGain, mediaElAbort, mediaObjectUrl}; },\n      getRecorderTap() {');
observed = insert(observed, '      onAnimationFrame: onAnimationFrame2', '      __runtime: () => runtime2,\n      onAnimationFrame: onAnimationFrame2');
observed = insert(observed,'    const nextAbort = new AbortController();','    const nextAbort = new AbortController(); window.__f.candidates.push({media:nextMediaEl,abort:nextAbort});');
function wav(hz = 440, seconds = 8) {
  const rate = 44100, samples = Math.floor(seconds * rate), b = Buffer.alloc(44 + samples * 4);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples * 4, 40);
  for (let i=0;i<samples;i++) for(let c=0;c<2;c++) b.writeInt16LE(Math.round(7000*Math.sin(2*Math.PI*hz*(c+1)*i/rate)),44+i*4+c*2);
  return b;
}
function instrument() {
  const f = window.__f = {holds:[], modes:[], writes:[], nodes:[], resources:[], events:[], urls:[], errors:[], audio:[], contexts:[], recorders:[], tracks:[],candidates:[]};
  const ids = new WeakMap(); let next=1; f.id=x=>{if(!x)return null;if(!ids.has(x))ids.set(x,next++);return ids.get(x);};
  window.addEventListener('unhandledrejection',e=>f.errors.push({type:'unhandledrejection',name:e.reason?.name,message:e.reason?.message||String(e.reason)}));
  const create=document.createElement.bind(document);document.createElement=function(tag,...args){const el=create(tag,...args);if(tag.toLowerCase()==='audio'){f.audio.push(el);f.resources.push({type:'media-create',id:f.id(el)});}return el;};
  const cr=URL.createObjectURL.bind(URL), rv=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=b=>{const url=cr(b);f.urls.push({action:'create',url,name:b.name||'',size:b.size});return url;};
  URL.revokeObjectURL=url=>{f.urls.push({action:'revoke',url});return rv(url);};
  const disconnect=AudioNode.prototype.disconnect;AudioNode.prototype.disconnect=function(...args){f.resources.push({type:'disconnect',id:f.id(this),destination:f.id(args[0])});return disconnect.apply(this,args);};
  const stop=MediaStreamTrack.prototype.stop;MediaStreamTrack.prototype.stop=function(...args){f.resources.push({type:'track-stop',id:f.id(this)});return stop.apply(this,args);};
  const play=HTMLMediaElement.prototype.play,pause=HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause=function(...args){f.resources.push({type:'pause',id:f.id(this)});return pause.apply(this,args);};
  HTMLMediaElement.prototype.play=function(...args){f.resources.push({type:'play',id:f.id(this)});const mode=f.nextPlay;f.nextPlay=null;
    if(mode==='throw')throw new DOMException('F4 native Play synchronous fault','InvalidStateError');
    if(mode==='reject')return Promise.reject(new DOMException('F4 native Play rejection','NotAllowedError'));
    const p=play.apply(this,args);if(mode==='hold')return p.then(()=>new Promise((resolve,reject)=>{f.playHold={resolve,reject};}));return p;};
  const Native=window.AudioContext;
  window.AudioContext=class extends Native{
    constructor(...args){if(f.constructorFault)throw new DOMException('F4 context constructor refused','NotSupportedError');super(...args);f.contexts.push(this);}
    async resume(){const mode=f.modes.shift();if(mode==='reject')throw new DOMException('F4 context resume refused','InvalidStateError');
      if(mode==='skip')return;
      if(mode==='hold')return new Promise((resolve,reject)=>f.holds.push({resolve:()=>Native.prototype.resume.call(this).then(resolve,reject),reject:()=>reject(new DOMException('F4 obsolete resume refused','InvalidStateError'))}));
      return Native.prototype.resume.call(this);}
    createMediaElementSource(el){const n=super.createMediaElementSource(el);f.nodes.push(n);return n;}
    createGain(){if(f.gainFault){f.gainFault=false;throw new DOMException('F4 allocation refused','NotSupportedError');}const n=super.createGain();f.nodes.push(n);return n;}
  };
  const MR=window.MediaRecorder;
  window.MediaRecorder=class extends MR{constructor(...args){super(...args);f.recorders.push(this);f.tracks.push(...args[0].getTracks());this.addEventListener('dataavailable',e=>f.events.push({type:'data',bytes:e.data.size}));this.addEventListener('stop',()=>f.events.push({type:'native-stop'}));this.addEventListener('error',e=>f.events.push({type:'native-recorder-error',message:e.error?.message}));}};
}
async function main(){
  const requests=[];
  const server=http.createServer((req,res)=>{
    let p=new URL(req.url,'http://localhost').pathname, file;
    if(p==='/observed.html'){res.setHeader('Content-Type','text/html');res.end(observed);return;}
    if(p==='/portable.html')file=portablePath;
    else {p=p.replace(/^\/apps\/auralprint\//,'/');file=path.join(root,'dist/hosted',p==='/'?'index.html':p);}
    if(!file.startsWith(path.join(root,'dist'))||!fs.existsSync(file)||!fs.statSync(file).isFile()){requests.push({url:req.url,status:404});res.writeHead(404);res.end();return;}
    const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'})[ext]||'application/octet-stream');requests.push({url:req.url,status:200});res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-background-networking','--autoplay-policy=no-user-gesture-required']});
  const results={phase:'F.5',startingCommit:'af13017c4950bfda82a0cecd5d350f2b2109fdca',version,browser:await browser.version(),mode:'headless Chromium native media/AudioContext/MediaRecorder, muted output',artifactSha256:crypto.createHash('sha256').update(portable).digest('hex'),cases:[],crossBrowser:{firefox:{path:firefox.executablePath(),available:fs.existsSync(firefox.executablePath())},webkit:{path:webkit.executablePath(),available:fs.existsSync(webkit.executablePath())}}};
  let current;
  async function app(plainUrl){const p=await browser.newPage({viewport:{width:900,height:650}});current=p;p.setDefaultTimeout(12000);p.exceptions=[];p.consoleErrors=[];
    p.on('pageerror',e=>p.exceptions.push({name:e.name,message:e.message}));p.on('console',m=>{if(m.type()==='error')p.consoleErrors.push(m.text());});
    if(!plainUrl)await p.addInitScript(instrument);else await p.addInitScript(()=>{window.__media=[];const c=document.createElement.bind(document);document.createElement=(tag,...a)=>{const e=c(tag,...a);if(tag==='audio')__media.push(e);return e;};});
    await p.goto(plainUrl||base+'/observed.html');
    if(!plainUrl)await p.evaluate(()=>{
      const f=__f;for(const key of ['audio','source'])__a.state[key]=new Proxy(__a.state[key],{set(o,k,v){f.writes.push({owner:key,key:k,value:v});o[k]=v;return true;}});
      const notify=__a.RecorderEngine.onTransportMutation;__a.RecorderEngine.onTransportMutation=function(type,details){f.events.push({type,details});return notify.call(this,type,details);};
    });return p;}
  const files=(names=['A.wav','B.wav','C.wav'],seconds=8)=>names.map((name,i)=>({name,mimeType:'audio/wav',buffer:wav([440,554,659][i%3],seconds)}));
  async function ingest(p,names,seconds){await p.locator('#fileInput').setInputFiles(files(names,seconds));}
  async function click(p,id){await p.evaluate(id=>document.getElementById(id).click(),id);}
  async function row(p,i){await p.evaluate(i=>document.querySelectorAll('#queueList .queue-item')[i].click(),i);}
  async function remove(p,i){await p.evaluate(i=>document.querySelectorAll('#queueList .q-remove')[i].click(),i);}
  async function active(p,name){await p.waitForFunction(name=>__a.state.source.status==='active'&&__a.state.audio.filename===name&&!__request().pending,name);}
  async function failure(p){await p.waitForFunction(()=>__a.state.source.status==='error'&&!__request().pending);}
  async function hold(p,modes=['hold']){await p.evaluate(async modes=>{await __f.contexts[0].suspend();__f.modes.push(...modes);},modes);}
  async function pending(p,count=1){await p.waitForFunction(count=>__f.holds.length>=count,count);}
  async function release(p,index=0,reject=false){await p.evaluate(({index,reject})=>{const h=__f.holds.splice(index,1)[0];if(!h)throw Error('No hold');if(reject)h.reject();else h.resolve();},{index,reject});await p.evaluate(()=>new Promise(r=>setTimeout(r,0)));}
  async function snap(p){return p.evaluate(()=>{const a=__a,f=__f,e=a.AudioEngine.getMediaEl(),g=a.AudioEngine.__graph(),r=a.RecorderEngine.__runtime();return {
    queue:a.Queue.snapshot(),entries:Array.from({length:a.Queue.length},(_,i)=>a.Queue.entryAt(i)).map(x=>({id:f.id(x),file:f.id(x.file),name:x.name})),request:__request()?{id:__request().requestId,entry:f.id(__request().entry),pending:__request().pending,autoPlay:__request().autoPlay}:null,
    source:JSON.parse(JSON.stringify(a.state.source)),audio:{...a.state.audio},media:e?{id:f.id(e),src:e.getAttribute('src'),paused:e.paused,time:e.currentTime,error:e.error?.code||null}:null,
    graph:{ready:a.AudioEngine.sample().ready,source:f.id(g.sourceNode),output:f.id(g.outputGain),tap:f.id(g.recorderTapDestination),tapConnected:f.id(g.recorderTapConnectedOutputGain),abort:g.mediaElAbort?.signal.aborted??null},
    recording:{...a.state.recording},recorder:r.mediaRecorder?{id:f.id(r.mediaRecorder),state:r.mediaRecorder.state}:null,tracks:f.tracks.map(t=>({id:f.id(t),kind:t.kind,state:t.readyState})),resources:[...f.resources],urls:[...f.urls],events:[...f.events],writes:[...f.writes],errors:[...f.errors],ui:document.getElementById('audioStatus').textContent};});}
  async function observe(p){await p.evaluate(()=>{__f.writes.length=0;__f.resources.length=0;__f.events.length=0;__f.urls.length=0;});}
  async function finish(name,p,fn,extra={}){const s=await snap(p);const c={name,...extra,snapshot:s,exceptions:p.exceptions,consoleErrors:p.consoleErrors};try{await fn(s);c.passed=true;}catch(e){c.passed=false;c.assertion={message:e.message,code:e.code,actual:e.actual,expected:e.expected,stack:e.stack};}results.cases.push(c);console.log(name,c.passed?'PASS':'FAIL');await p.close();current=null;return s;}
  async function startRecord(p){await click(p,'btnRecordStart');await p.waitForFunction(()=>__a.state.recording.phase==='recording');await p.waitForFunction(()=>__a.state.recording.chunkCount>0);}
  async function stopRecord(p){await click(p,'btnRecordStop');await p.waitForFunction(()=>__a.state.recording.phase==='complete');}
  try{
    for(const fault of ['corrupt','allocation']){
      const p=await app();const fixture=files(['A.wav','failed.wav','B.wav']);
      if(fault==='corrupt')fixture[1].buffer=Buffer.from('invalid audio fixture');
      await p.locator('#fileInput').setInputFiles(fixture);await active(p,'A.wav');
      await startRecord(p);const start=await snap(p);
      if(fault==='allocation')await p.evaluate(()=>{__f.gainFault=true;});
      await row(p,1);await failure(p);const failed=await snap(p);
      const released=await p.evaluate(()=>{const g=__a.AudioEngine.__graph();return {splitter:!!g.splitter,sumNode:!!g.sumNode,sumGainL:!!g.sumGainL,sumGainR:!!g.sumGainR,bands:g.bands.size,upstream:!!g.activeUpstream,url:g.mediaObjectUrl,candidates:__f.candidates.map(x=>({id:__f.id(x.media),src:x.media.getAttribute('src'),aborted:x.abort.signal.aborted}))};});
      // All assertions below run before recovery, stop, disposal or page closure.
      assert.equal(failed.media,null);assert.equal(failed.graph.source,null);assert.equal(failed.graph.output,null);assert.equal(failed.graph.ready,false);assert.equal(failed.graph.tapConnected,null);
      for(const key of ['splitter','sumNode','sumGainL','sumGainR','upstream'])assert.equal(released[key],false,key);
      assert.equal(released.bands,0);assert.equal(released.url,null);assert.equal(released.candidates.at(-1).src,null);assert.equal(released.candidates.at(-1).aborted,true);
      assert.equal(failed.recorder.id,start.recorder.id);assert.equal(failed.recorder.state,'recording');assert.equal(failed.recording.phase,'recording');assert.equal(failed.graph.tap,start.graph.tap);
      assert.ok(failed.tracks.every(t=>t.state==='live'));assert.ok(!failed.events.some(e=>e.type==='native-stop'));assert.equal(failed.events.filter(e=>e.type==='track-change-failed').length,1);
      assert.equal(failed.source.status,'error');assert.equal(failed.source.sessionActive,false);assert.equal(failed.source.errorMessage,failed.audio.transportError);assert.ok(failed.audio.transportError);
      if(fault==='allocation'){assert.match(failed.audio.transportError,/audio source attachment failed: F4 allocation refused/);assert.doesNotMatch(failed.audio.transportError,/unsupported or unreadable/);}else assert.match(failed.audio.transportError,/unsupported or unreadable/);
      await row(p,2);await active(p,'B.wav');const recovered=await snap(p);
      assert.equal(recovered.recorder.id,start.recorder.id);assert.equal(recovered.graph.tap,start.graph.tap);assert.equal(recovered.graph.tapConnected,recovered.graph.output);assert.equal(recovered.audio.transportError,'');
      const chunks=await p.evaluate(()=>{__a.RecorderEngine.__runtime().mediaRecorder.requestData();return __a.state.recording.chunkCount;});await p.waitForFunction(chunks=>__a.state.recording.chunkCount>chunks,chunks);
      await stopRecord(p);const complete=await snap(p);
      const readExport=()=>p.evaluate(async()=>{const b=await(await fetch(__a.state.recording.lastExportUrl)).blob(),bytes=new Uint8Array(await b.arrayBuffer());return {bytes:b.size,mime:b.type,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join(''),base64:btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(''))};});
      const exportRead=await readExport();const args=process.argv.slice(2),i=args.indexOf('--export-dir');if(i>=0)fs.writeFileSync(path.join(args[i+1],fault+'.webm'),Buffer.from(exportRead.base64,'base64'));delete exportRead.base64;
      assert.ok(exportRead.bytes>0);assert.equal(complete.events.filter(e=>e.type==='native-stop').length,1);assert.ok(complete.tracks.every(t=>t.state==='ended'));
      if(fault==='allocation')await p.evaluate(()=>{__f.gainFault=true;});await row(p,1);await failure(p);const retained=await snap(p),exportAfter=await readExport();delete exportAfter.base64;
      await finish('native recording across '+fault+' activation cleanup/reconnection/stop/export retention',p,s=>{assert.equal(s.media,null);assert.equal(s.graph.ready,false);assert.equal(retained.recording.lastExportUrl,complete.recording.lastExportUrl);assert.deepEqual(exportAfter,exportRead);assert.deepEqual(s.errors,[]);assert.deepEqual(p.exceptions,[]);assert.equal(s.events.filter(e=>e.type==='track-change-failed').length,2);assert.ok(!s.urls.some(e=>e.action==='revoke'&&e.url===complete.recording.lastExportUrl));},{fault,start,failed,released,recovered,complete,exportRead,retained});
    }
  }catch(e){results.infrastructureFailure={message:e.message,stack:e.stack};if(current)try{results.interruptedSnapshot=await snap(current);}catch{}console.error(e);}
  finally{results.requests=requests;results.summary={cases:results.cases.length,passed:results.cases.filter(c=>c.passed).length,failed:results.cases.filter(c=>!c.passed).length,infrastructureFailure:!!results.infrastructureFailure};
    results.summary.failed=results.cases.filter(c=>c.passed===false).length;results.summary.inconclusive=results.cases.filter(c=>c.passed===null).length;
    const args=process.argv.slice(2),i=args.indexOf('--output');if(i>=0)fs.writeFileSync(args[i+1],JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.summary));await browser.close();await new Promise(resolve=>server.close(resolve));process.exitCode=results.summary.failed||results.infrastructureFailure?1:0;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
