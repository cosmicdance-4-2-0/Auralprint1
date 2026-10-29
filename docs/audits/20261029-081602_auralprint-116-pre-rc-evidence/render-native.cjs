const fs=require('node:fs'), http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
(async()=>{
 const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/probe'){res.setHeader('content-type','text/html');res.end('<!doctype html><canvas id="view" tabindex="0"></canvas>');return;}const file=path.join(root,name);if(!file.startsWith(root+'/')){res.statusCode=403;res.end();return;}try{res.setHeader('content-type',name.endsWith('.js')?'text/javascript':'text/plain');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); const base='http://127.0.0.1:'+server.address().port;
 let browser;try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage();const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>requests.push({url:r.url(),error:r.failure()}));await page.goto(base+'/probe');
 const result=await page.evaluate(async()=>{
  const {state,setCamera}=await import('/src/js/core/state.js');const {runtime,resolveSettings}=await import('/src/js/core/preferences.js');const {CONFIG}=await import('/src/js/core/config.js');const {Orb}=await import('/src/js/render/orb.js');const {Renderer}=await import('/src/js/render/renderer.js');const {drawFadedTrace}=await import('/src/js/render/trace-fade.js');const {createWorldGeometry}=await import('/src/js/core/world-geometry.js');const {Spaces}=await import('/src/js/core/spaces.js');const {rgb01ToCss}=await import('/src/js/core/utils.js');
  resolveSettings();state.canvas=document.querySelector('canvas');state.ctx=state.canvas.getContext('2d',{willReadFrequently:true});state.world=createWorldGeometry(1000,1000);const ctx=state.ctx;
  const check=(cond,msg)=>{if(!cond)throw Error(msg);};
  const out={browser:navigator.userAgent,fade0Comparisons:0,positiveFadeDraws:0,straightGradientSamples:0,fullHistoryDraws:0};
  const histories={empty:[],single:[[0,0]],two:[[-20,0],[20,0]],straight:Array.from({length:51},(_,i)=>[-250+i*10,0]),gap:[[-200,0],[-100,10],[NaN,NaN],[0,0],[100,-10],[200,0]],duplicates:[[-200,0],[-100,0],[-100,0],[0,0],[100,0],[100,0],[200,0]],sharp:[[-180,0],[0,0],[-160,30],[20,20],[180,0]],reversal:[[-200,0],[0,0],[-200,0],[0,0],[200,0]],self:[[-200,-100],[200,100],[-200,100],[200,-100],[0,0],[200,0]],huge:[[-1e300,0],[0,0],[1e300,0]],tiny:[[-.00001,0],[0,0],[.00001,0]]};
  const pixels=()=>ctx.getImageData(0,0,state.widthPx,state.heightPx).data;
  function clear(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,state.widthPx,state.heightPx);}
  function make(points,fade){const def=structuredClone(CONFIG.defaults.orbs[0]);Object.assign(def.trace,{lines:true,numLines:1000,lineWidthPx:6,lineAlpha:.4,lineColorMode:'fixed',fadeSegments:fade});def.particles.sizeMinPx=def.particles.sizeMaxPx=0;const orb=new Orb(def);for(const [x,y]of points)orb.trail.emitAt(x,y,0,{r:1,g:1,b:1});return orb;}
  for(const dpr of [1,2])for(const viewport of [[32,24],[320,180],[1200,800]])for(const bg of ['#000000','#304050']){
   state.dpr=dpr;state.widthPx=state.canvas.width=viewport[0]*dpr;state.heightPx=state.canvas.height=viewport[1]*dpr;runtime.settings=structuredClone(runtime.settings);runtime.settings.visuals.backgroundColor=bg;runtime.settings.visuals.particleColor='#ffffff';
   for(const camera of [{x:0,y:0,zoom:1,rotationRad:0},{x:70,y:-50,zoom:.7,rotationRad:1.2}]){setCamera(camera);
    for(const [name,points]of Object.entries(histories)){
     const orb=make(points,0);const frozen=Array.from(orb.trail.particles).map(p=>({...p}));clear(bg);Renderer.drawOrb(orb,1,0);const actual=pixels();clear(bg);ctx.save();ctx.globalAlpha=1;ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=6*dpr;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();let first=true;for(const [x,y]of points){const p=Spaces.simToScreen(x,y);if(!p){first=true;continue;}if(first){ctx.moveTo(p.x,p.y);first=false;}else ctx.lineTo(p.x,p.y);}ctx.stroke();ctx.restore();const expected=pixels();check(actual.every((v,i)=>v===expected[i]),'fade0 parity '+name);out.fade0Comparisons++;
     for(const fade of [1,5,10,20]){orb.trace.fadeSegments=fade;clear(bg);Renderer.drawOrb(orb,1,0);out.positiveFadeDraws++;check(Array.from(orb.trail.particles).every((p,i)=>Object.keys(p).every(k=>Object.is(p[k],frozen[i][k]))),'history mutated');}
     orb.trail.dispose();
    }
   }
  }
  state.dpr=1;state.widthPx=state.canvas.width=640;state.heightPx=state.canvas.height=200;state.world=createWorldGeometry(200,200);setCamera({x:0,y:0,zoom:1,rotationRad:0});runtime.settings.visuals.backgroundColor='#204060';runtime.settings.visuals.particleColor='#ffffff';
  for(const fade of [1,5,10,20]){const orb=make(Array.from({length:31},(_,i)=>[-300+i*20,0]),fade);orb.trace.lineAlpha=1;clear('#204060');Renderer.drawOrb(orb,0,0);const data=pixels();for(const index of [0,Math.min(2,fade-1),fade]){const x=20+index*20+10;const p=(100*640+x)*4;const t=Math.min(1,(index+.525)/fade);for(let c=0;c<3;c++){const bg=[32,64,96][c],value=Math.round(bg+(255-bg)*t);check(Math.abs(data[p+c]-value)<5,`gradient color fade${fade} index${index} ${data[p+c]} expected${value}`);}out.straightGradientSamples++;}orb.trail.dispose();}
  for(const dpr of [1,2]){state.dpr=dpr;state.widthPx=state.canvas.width=1000*dpr;state.heightPx=state.canvas.height=700*dpr;for(const fade of [0,1,5,10,20]){const orbs=Array.from({length:16},(_,n)=>make(Array.from({length:1001},(_,j)=>[Math.cos(j*.013+n)*220,Math.sin(j*.013+n)*190]),fade));const started=performance.now();clear('#204060');for(const orb of orbs)Renderer.drawOrb(orb,0,0);const elapsedMs=performance.now()-started;out.fullHistoryDraws++;(out.timings||=[]).push({dpr,orbs:16,pointsEach:1001,fade,elapsedMs});for(const orb of orbs)orb.trail.dispose();}}
  return out;
 });result.pageerrors=errors;result.failedRequests=requests;assert.equal(errors.length,0);assert.equal(requests.length,0);fs.writeFileSync(path.join(__dirname,'native-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
