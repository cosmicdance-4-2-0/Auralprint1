const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
const makeWav=(seconds=10)=>{const rate=48000,n=rate*seconds,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.sin(i*2*Math.PI*440/rate)*1000,44+2*i);return b};
const results=[];
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
  async function app(){
   const page=await browser.newPage({viewport:{width:1200,height:900}});page.setDefaultTimeout(8000);page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
   await page.route('http://localhost/**',route=>{const pathname=new URL(route.request().url()).pathname;if(pathname==='/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'src/index.template.html'),'utf8').replace('<!-- AURALPRINT_INLINE_CSS -->',fs.readdirSync(path.join(root,'src/css')).map(f=>`<link rel="stylesheet" href="/src/css/${f}">`).join('')).replace('<!-- AURALPRINT_INLINE_JS -->','<script type="module" src="/src/js/main.js"></script>').replaceAll('__AURALPRINT_VERSION__','v0.1.16-candidate')});const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+'/')||!fs.existsSync(file))return route.fulfill({status:404});return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream',body:fs.readFileSync(file)})});
   await page.addInitScript(()=>{
    window.audit={captures:[],mode:'success',contexts:[],streams:[]};
    async function capture(){let resolve,reject;const wait=new Promise((yes,no)=>{resolve=yes;reject=no});const call={resolve,reject};audit.captures.push(call);if(audit.mode==='held')await wait;if(audit.mode==='denied')throw new DOMException('audit denial','NotAllowedError');const ctx=new AudioContext(),d=ctx.createMediaStreamDestination(),osc=ctx.createOscillator();osc.connect(d);osc.start();audit.contexts.push(ctx);audit.streams.push(d.stream);call.stream=d.stream;return d.stream;}
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:capture});Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:capture});
   });
   await page.goto('http://localhost/');await page.waitForFunction(()=>document.getElementById('btnPlay')?.textContent==='Play');
   await page.evaluate(async()=>{const p=await import('/src/js/core/preferences.js');p.preferences.audio.clearQueueOnSourceExit=true;p.resolveSettings()});
   return page;
  }
  async function load(page){await page.locator('#fileInput').setInputFiles([{name:'first.wav',mimeType:'audio/wav',buffer:makeWav()},{name:'second.wav',mimeType:'audio/wav',buffer:makeWav()}]);await page.waitForFunction(async()=>{const{state}=await import('/src/js/core/state.js');return state.audio.isLoaded&&state.source.status==='active'&&!document.getElementById('btnStop').disabled});await page.evaluate(()=>document.getElementById('btnStop').click());await page.waitForFunction(async()=>{const{AudioEngine}=await import('/src/js/audio/audio-engine.js');return AudioEngine.getMediaEl()?.paused})}
  async function snap(page){return page.evaluate(async()=>{const{state}=await import('/src/js/core/state.js'),{Queue}=await import('/src/js/audio/queue.js'),{AudioEngine}=await import('/src/js/audio/audio-engine.js');return{source:structuredClone(state.source),audio:{...state.audio},queue:Queue.snapshot(),ready:AudioEngine.sample().ready,tracks:audit.streams.map(s=>s.getTracks().map(t=>t.readyState)),status:document.getElementById('audioStatus').textContent}})}
  async function switchTo(page,kind){await page.evaluate(kind=>{document.getElementById('btnSource'+kind).click()},kind)}
  async function sourceIs(page,kind,status='active'){await page.waitForFunction(async({kind,status})=>{const{state}=await import('/src/js/core/state.js');return state.source.kind===kind&&state.source.status===status},{kind,status})}
  for(const kind of ['Mic','Stream'])for(const scenario of ['success','denied','queue-replaced','file-return','other-source-wins','ended-before-delivery']){
   const page=await app();try{
    await load(page);await page.evaluate(()=>{audit.mode='held'});await switchTo(page,kind);await page.waitForFunction(()=>audit.captures.length===1);
    if(scenario==='denied')await page.evaluate(()=>{audit.mode='denied'});
    if(scenario==='queue-replaced')await page.evaluate(async()=>{const{Queue}=await import('/src/js/audio/queue.js');Queue.clear();Queue.add(new File(['new'],'new.wav'));Queue.setCursor(0)});
    if(scenario==='file-return')await switchTo(page,'File');
    if(scenario==='other-source-wins'){await page.evaluate(()=>{audit.mode='success'});await switchTo(page,kind==='Mic'?'Stream':'Mic');await sourceIs(page,kind==='Mic'?'stream':'mic')}
    if(scenario==='ended-before-delivery'){
     // Hold native graph attachment rather than fabricate a fake track state.
     await page.evaluate(async()=>{const{AudioEngine}=await import('/src/js/audio/audio-engine.js');const attach=AudioEngine.attachMediaStreamSource.bind(AudioEngine);AudioEngine.attachMediaStreamSource=async(s,o)=>{audit.attached=s;await new Promise(r=>audit.releaseAttach=r);return attach(s,o)}});
    }
    await page.evaluate(()=>{audit.captures[0].resolve()});
    if(scenario==='ended-before-delivery'){await page.waitForFunction(()=>audit.attached);await page.evaluate(()=>{for(const t of audit.attached.getTracks()){t.stop();t.dispatchEvent(new Event('ended'))}audit.releaseAttach()});await sourceIs(page,'none','idle')}
    else if(scenario==='success'||scenario==='queue-replaced')await sourceIs(page,kind.toLowerCase());
    else if(scenario==='denied')await sourceIs(page,kind.toLowerCase(),'error');
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const out=await snap(page);assert.equal(out.queue.length,scenario==='success'?0:scenario==='queue-replaced'?1:2);
    if(scenario==='file-return'||scenario==='ended-before-delivery'){assert.equal(out.ready,false);assert.equal(out.source.kind,'none')}
    if(scenario==='other-source-wins'){assert.equal(out.ready,true);assert.equal(out.tracks[1][0],'ended');assert.equal(out.tracks[0][0],'live')}
    if(scenario==='queue-replaced')assert.equal(out.queue.items[0].name,'new.wav');
    assert.deepEqual(page.errors,[]);results.push({case:kind+'/'+scenario,passed:true,result:out});
   }finally{await page.close()}
  }
  const page=await app();try{
   await load(page);
   const scr=page.locator('#scrubberCanvas'),box=await scr.boundingBox();
   await page.mouse.click(box.x+box.width*.5,box.y+box.height*.5,{button:'right'});
   const right=await page.evaluate(async()=>{const{AudioEngine}=await import('/src/js/audio/audio-engine.js');return AudioEngine.getMediaEl().currentTime});
   assert.ok(right>4.5);results.push({case:'scrubber-right-button',passed:true,observedTime:right,classification:'minor seeking behavior; acceptance ambiguous'});
  }finally{await page.close()}
 }finally{fs.writeFileSync(path.join(__dirname,'native-results.json'),JSON.stringify({browser:await browser.version(),results},null,2));await browser.close()}
 console.log(JSON.stringify(results.map(({case:name,passed})=>({case:name,passed}))));
})().catch(e=>{console.error(e);process.exitCode=1});
