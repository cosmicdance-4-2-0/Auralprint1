const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('../../../node_modules/playwright');
const root=path.resolve(__dirname,'../../..');
const out={};
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname;
  if(name==='/probe'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><canvas></canvas>');return;}
  const file=path.resolve(root,'.'+decodeURIComponent(name));
  if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r)});
 let browser;
 try{
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});out.browser=browser.version();
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/probe');
  out.audio=await page.evaluate(async()=>{
   const {resolveSettings,preferences}=await import('/src/js/core/preferences.js'),{AudioEngine}=await import('/src/js/audio/audio-engine.js'),{state}=await import('/src/js/core/state.js'),{BandBankController}=await import('/src/js/audio/band-bank-controller.js');
   preferences.audio.smoothingTimeConstant=.01;resolveSettings();BandBankController.syncFromSettings();BandBankController.rebuildNow();
   const ctx=new AudioContext({sampleRate:48000}),merger=ctx.createChannelMerger(2),destination=ctx.createMediaStreamDestination();
   const oscillators=[];for(const [channel,hz]of [[0,375],[1,1125]]){const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=hz;gain.gain.value=.25;osc.connect(gain).connect(merger,0,channel);osc.start();oscillators.push(osc);}
   merger.connect(destination);await ctx.resume();await AudioEngine.attachMediaStreamSource(destination.stream,{kind:'stream',monitorOutput:false});
   const summaries=[];
   for(let i=0;i<4;i++){
    await new Promise(r=>setTimeout(r,150));const frame=AudioEngine.sample();const rate=state.bands.meta.sampleRateHz;
    const channels={};for(const id of ['L','R','C']){const b=frame.bands[id];let peak=0;for(let k=1;k<b.freqDb.length;k++)if(b.freqDb[k]>b.freqDb[peak])peak=k;channels[id]={rms:b.rms,peakHz:peak*rate/(b.freqDb.length*2),bandEnergiesFinite:state.bands.channels[id].energies01.every(x=>Number.isFinite(x)&&x>=0&&x<=1)};}
    summaries.push({rate,channels});
   }
   AudioEngine.unload();const after=AudioEngine.sample();for(const osc of oscillators)osc.stop();for(const track of destination.stream.getTracks())track.stop();await ctx.close();
   return {summaries,readyAfterUnload:after.ready};
  });
  const last=out.audio.summaries.at(-1);assert.ok(Math.abs(last.channels.L.peakHz-375)<15);assert.ok(Math.abs(last.channels.R.peakHz-1125)<15);assert.ok(last.channels.L.rms>.1&&last.channels.R.rms>.1&&last.channels.C.rms>.07);assert.ok(Object.values(last.channels).every(c=>c.bandEnergiesFinite));assert.equal(out.audio.readyAfterUnload,false);assert.deepEqual(errors,[]);await page.close();
  out.editions=[];
  for(const dpr of [1,2])for(const edition of ['portable','hosted']){
   const context=await browser.newContext({viewport:{width:375,height:667},deviceScaleFactor:dpr});const p=await context.newPage(),events={errors:[],failed:[],external:[]};
   p.on('pageerror',e=>events.errors.push(e.message));p.on('requestfailed',r=>events.failed.push({url:r.url(),error:r.failure()?.errorText}));p.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('data:'))events.external.push(r.url())});
   const file=edition==='portable'?'dist/auralprint_0.1.16-candidate.html':'dist/hosted/index.html';
   await p.goto('http://127.0.0.1:'+server.address().port+'/'+file);await p.waitForFunction(()=>document.getElementById('btnPlay')?.textContent==='Play');
   await context.setOffline(true);await p.locator('#btnOpenCamera').click();await p.locator('#btnResetCamera').click();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const state=await p.evaluate(()=>({width:document.getElementById('c').width,height:document.getElementById('c').height,overflow:document.documentElement.scrollWidth>innerWidth,camera:document.getElementById('numCameraX').value}));
   assert.ok(state.width>0&&state.height>0);assert.equal(state.overflow,false);assert.deepEqual(events.errors,[]);assert.deepEqual(events.external,[]);
   out.editions.push({edition,dpr,offlineInteraction:true,state,...events});await context.close();
  }
  const context=await browser.newContext(),filePage=await context.newPage();
  try{await filePage.goto('file://'+path.join(root,'dist/auralprint_0.1.16-candidate.html'),{timeout:10000});await filePage.waitForFunction(()=>document.getElementById('btnPlay')?.textContent==='Play',{},{timeout:5000});out.directFile={boot:true};}catch(e){out.directFile={boot:false,error:e.message.split('\n')[0]};}finally{await context.close();}
 }finally{fs.writeFileSync(path.join(__dirname,'native-audit.json'),JSON.stringify(out,null,2)+'\n');if(browser)await browser.close();await new Promise(r=>server.close(r));}
 console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
