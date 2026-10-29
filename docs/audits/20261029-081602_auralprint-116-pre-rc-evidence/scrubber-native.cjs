const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://localhost/**',route=>{const pathname=new URL(route.request().url()).pathname;if(pathname==='/')return route.fulfill({contentType:'text/html',body:'<canvas id="scrubberCanvas" width="600" height="60" style="width:600px;height:60px"></canvas>'});const file=path.resolve(root,'.'+pathname);return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file)})});
 await page.goto('http://localhost/');await page.evaluate(async()=>{
  const{AudioEngine}=await import('/src/js/audio/audio-engine.js'),{Scrubber}=await import('/src/js/audio/scrubber.js'),{resolveSettings}=await import('/src/js/core/preferences.js');resolveSettings();
  // A real native paused HTMLMediaElement is the production seek target. It is
  // provided through AudioEngine's public read seam, keeping transport logic out.
  const rate=48000,n=rate*10,b=new ArrayBuffer(44+n*2),v=new DataView(b);for(const[s,o]of[['RIFF',0],['WAVEfmt ',8],['data',36]])[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));v.setUint32(4,b.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,n*2,true);
  window.audio=document.createElement('audio');audio.src=URL.createObjectURL(new Blob([b],{type:'audio/wav'}));await new Promise((r,j)=>{audio.onloadedmetadata=r;audio.onerror=j;audio.load()});AudioEngine.getMediaEl=()=>audio;Scrubber.init(document.getElementById('scrubberCanvas'));
 });
 const box=await page.locator('canvas').boundingBox();const x=f=>box.x+box.width*f,y=box.y+30;
 await page.mouse.move(x(.2),y);await page.mouse.down();const before=await page.evaluate(()=>audio.currentTime);
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x(.8),y,buttons:0});const after=await page.evaluate(()=>audio.currentTime);
 await page.mouse.up();await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x(.4),y,buttons:0});const control=await page.evaluate(()=>audio.currentTime);
 const result={before,after,control,paused:await page.evaluate(()=>audio.paused),errors,qualification:'Production Scrubber and real native HTMLMediaElement; public AudioEngine.getMediaEl seam supplies paused file. Blur is explicitly dispatched; subsequent no-button movement is CDP input. Physical OS loss of mouseup is not certified.'};
 assert.equal(before,2);assert.equal(after,8);assert.equal(control,8);assert.equal(result.paused,true);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(__dirname,'scrubber-blur.json'),JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
