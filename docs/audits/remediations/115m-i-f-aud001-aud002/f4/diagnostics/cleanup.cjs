/* Opt-in focused acceptance probe. --artifact may name an isolated historical
 * build. Production source is never written. Native corrupt-media failure has
 * no failure injection; graph allocation failure is explicitly injected.
 * Exit 1 means desired cleanup failed, even when settlement/recovery pass.
 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'../../../../../..'),args=process.argv.slice(2);
const option=n=>args.includes(n)?args[args.indexOf(n)+1]:null;
const artifactPath=option('--artifact')||path.join(root,'dist/auralprint_0.1.15m.i.f.html'),original=fs.readFileSync(artifactPath,'utf8');
function replace(t,m,r){assert.equal(t.split(m).length,2,m);return t.replace(m,r);}
let artifact=replace(original,'  main();\n})();','  window.__c={AudioEngine, InputSourceManager, Queue, state, RecorderEngine, UI};\n  main();\n})();');
artifact=replace(artifact,'      getRecorderTap() {','      __resources(){return {sourceNode,outputGain,mediaElAbort,mediaObjectUrl};},\n      getRecorderTap() {');
const wav=Buffer.alloc(44+44100*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(176400,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);for(let i=0;i<44100;i++)for(let j=0;j<2;j++)wav.writeInt16LE(Math.round(4000*Math.sin(2*Math.PI*440*i/44100)),44+i*4+j*2);
function install(){const f=window.__f={urls:[],audio:[],errors:[],disconnects:0,events:[],pauses:0};const cr=URL.createObjectURL.bind(URL),rv=URL.revokeObjectURL.bind(URL);URL.createObjectURL=b=>{const url=cr(b);f.urls.push({type:'create',url,size:b.size});return url;};URL.revokeObjectURL=url=>{f.urls.push({type:'revoke',url});return rv(url);};
  const create=document.createElement.bind(document);document.createElement=(tag,...args)=>{const el=create(tag,...args);if(tag==='audio')f.audio.push(el);return el;};const disc=AudioNode.prototype.disconnect;AudioNode.prototype.disconnect=function(...args){f.disconnects++;return disc.apply(this,args);};const pause=HTMLMediaElement.prototype.pause;HTMLMediaElement.prototype.pause=function(...args){f.pauses++;return pause.apply(this,args);};
  window.addEventListener('unhandledrejection',e=>f.errors.push(e.reason?.message||String(e.reason)));
  const Native=window.AudioContext;window.AudioContext=class extends Native{createGain(){if(f.gainFault){f.gainFault=false;throw new DOMException('F4 controlled graph allocation failure','NotSupportedError');}return super.createGain();}};
}
async function main(){const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(artifact);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});const result={artifactPath,artifactSha256:crypto.createHash('sha256').update(original).digest('hex'),browser:await browser.version(),cases:[]};
  async function snap(p){return p.evaluate(()=>{const c=__c,f=__f,el=c.AudioEngine.getMediaEl(),g=c.AudioEngine.__resources();return {audio:{...c.state.audio},source:JSON.parse(JSON.stringify(c.state.source)),queue:c.Queue.snapshot(),media:el?{src:el.getAttribute('src'),paused:el.paused,error:el.error?.code||null}:null,resources:{sourceNode:!!g.sourceNode,outputGain:!!g.outputGain,abort:g.mediaElAbort?.signal.aborted??null,objectUrl:g.mediaObjectUrl},ready:c.AudioEngine.sample().ready,urls:[...f.urls],disconnects:f.disconnects,pauses:f.pauses,events:[...f.events],errors:[...f.errors]};});}
  for(const fault of ['corrupt','allocation'])for(let iteration=1;iteration<=3;iteration++){
    const p=await browser.newPage();p.setDefaultTimeout(10000);await p.addInitScript(install);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.evaluate(()=>{const notify=__c.RecorderEngine.onTransportMutation;__c.RecorderEngine.onTransportMutation=(type,details)=>{__f.events.push({type,details});return notify(type,details);};});
    if(fault==='allocation')await p.evaluate(()=>{__f.gainFault=true;});
    await p.locator('#fileInput').setInputFiles([{name:fault==='corrupt'?'corrupt.wav':'valid.wav',mimeType:'audio/wav',buffer:fault==='corrupt'?Buffer.from('invalid audio fixture'):wav}]);
    await p.waitForFunction(()=>__c.state.source.status==='error'&&__f.events.some(e=>e.type==='track-change-failed'));const failed=await snap(p);
    // Drain native task delivery before judging retained references, without
    // tearing down or reloading the element in diagnostic cleanup.
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const retained=await snap(p);let cleanupPassed=true,assertion;
    try{assert.equal(retained.media,null);assert.equal(retained.resources.sourceNode,false);assert.equal(retained.resources.outputGain,false);assert.equal(retained.ready,false);}catch(e){cleanupPassed=false;assertion={message:e.message,actual:e.actual,expected:e.expected};}
    // Current error is terminal and exactly once; failure must still be truthful.
    assert.equal(retained.audio.isLoaded,false);assert.equal(retained.audio.isPlaying,false);assert.equal(retained.source.sessionActive,false);assert.equal(retained.events.filter(e=>e.type==='track-change-failed').length,1);assert.deepEqual(errors,[]);assert.deepEqual(retained.errors,[]);
    await p.evaluate(()=>document.getElementById('btnClearQueue').click());const clear=await snap(p);assert.equal(clear.media,null);assert.equal(clear.resources.sourceNode,false);assert.equal(clear.resources.outputGain,false);assert.equal(clear.source.status,'idle');
    await p.locator('#fileInput').setInputFiles([{name:'retry.wav',mimeType:'audio/wav',buffer:wav}]);await p.waitForFunction(()=>__c.state.audio.filename==='retry.wav'&&__c.state.source.status==='active');const recovery=await snap(p);assert.equal(recovery.audio.transportError,'');assert.equal(recovery.ready,true);
    result.cases.push({fault,iteration,cleanupPassed,assertion,failed,retained,clear,recovery,errors});console.log(fault,iteration,'cleanup',cleanupPassed,'clear/recovery PASS');await p.close();
  }
  result.summary={cases:result.cases.length,cleanupPass:result.cases.filter(c=>c.cleanupPassed).length,cleanupFail:result.cases.filter(c=>!c.cleanupPassed).length,settlementAndRecoveryPass:result.cases.length};
  if(option('--output'))fs.writeFileSync(option('--output'),JSON.stringify(result,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));process.exitCode=result.summary.cleanupFail?1:0;
}
main().catch(e=>{console.error(e);process.exitCode=2;});
