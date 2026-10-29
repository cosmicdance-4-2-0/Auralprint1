// Optional AP_BROWSER_ENGINES=chromium,firefox,webkit; only Chromium is mandatory
// in CI. Uses real built-app controls and native codecs, without source rewriting.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {deflateSync}=require('node:zlib');
const playwright=require('playwright');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),version=fs.readFileSync(path.join(root,'version'),'utf8').trim();
const zHash=wire=>'#z='+deflateSync(Buffer.from(JSON.stringify(wire))).toString('base64url');
const pHash=prefs=>'#p='+Buffer.from(JSON.stringify({schema:12,prefs})).toString('base64url');
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function observe(context){await context.addInitScript(()=>{
  window.compactSmoke={scheduled:null};
  const read=()=>({x:Number(document.getElementById('numCameraX').value),y:Number(document.getElementById('numCameraY').value),zoom:Number(document.getElementById('numCameraZoom').value),rotationRad:Number(document.getElementById('numCameraRotation').value)*Math.PI/180});
  const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>{
    if(callback.name==='onAnimationFrame'&&compactSmoke.scheduled===null)compactSmoke.scheduled=read();return raf(callback);
  };
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(){throw new Error('clipboard denied for acceptance probe');}}});
});}
async function ready(page,url){await page.goto(url);await page.waitForFunction(()=>window.compactSmoke?.scheduled!=null);await frames(page);}
async function share(page){
  await page.evaluate(()=>{document.getElementById('sceneStatus').textContent='';document.getElementById('btnShare').click();});
  await page.waitForFunction(()=>/^Share link /.test(document.getElementById('sceneStatus').textContent));
  assert.match(await page.locator('#sceneStatus').textContent(),/copy from address bar/);
  return new URL(page.url()).hash;
}
async function apply(page,hash){await page.evaluate(hash=>{
  history.replaceState(null,'',location.pathname+hash);document.getElementById('sceneStatus').textContent='';document.getElementById('btnApplyUrl').click();
},hash);await page.waitForFunction(()=>/Preset applied|Invalid preset|cannot decompress|resource limits|Unsupported preset/.test(document.getElementById('sceneStatus').textContent));await frames(page);}
function cameraNear(actual,expected){for(const key of Object.keys(expected))assert.ok(Math.abs(actual[key]-expected[key])<=1e-12*Math.max(1,Math.abs(expected[key])),`${key}: ${actual[key]} != ${expected[key]}`);}
async function delayDecode(page){await page.evaluate(()=>{
  const Native=window.DecompressionStream;
  window.compactSmoke.restore=()=>{window.DecompressionStream=Native;};
  window.compactSmoke.finished=false;
  window.DecompressionStream=function(format){
    const native=new Native(format);
    let yielded=false, gated=false;
    const gate=new TransformStream({async transform(chunk,controller){if(chunk.byteLength){yielded=true;if(!gated){gated=true;await new Promise(resolve=>{compactSmoke.release=resolve;});}}controller.enqueue(chunk);},flush(){if(yielded)compactSmoke.finished=true;}});
    return {readable:native.readable.pipeThrough(gate),writable:native.writable};
  };
});}
(async()=>{
  const {CONFIG}=await import('../src/js/core/config.js');
  const {sanitizePreset,encodePresetPayload}=await import('../src/js/presets/preset-codec.js');
  const {decodePrefsFromHash}=await import('../src/js/presets/url-preset.js');
  let prefs=sanitizePreset({schema:12,prefs:{world:{widthUnits:2345.5,heightUnits:1678.25},
    sceneCamera:{x:137.25,y:-286.5,zoom:1.75,rotationRad:.73},audio:{volume:.71234567890123},
    orbs:Array.from({length:16},(_,i)=>({id:`opaque-${(i*7+3)%16}-宇宙`,chanId:i%2?'L':'R',
      bandIds:i%3===0?[255,0,71,72,19]:Array.from({length:38},(_,j)=>59+j),startAngleRad:.1234567890123+i*.17,trace:{lines:i%3!==0}}))}});
  if(process.env.AP_HERO_PRESET)prefs=await decodePrefsFromHash(fs.readFileSync(process.env.AP_HERO_PRESET,'utf8').trim());
  const initial=zHash(encodePresetPayload(prefs)),errors=[],results=[],browsers=[],links=[];
  const server=http.createServer((req,res)=>{
    try{const url=new URL(req.url,'http://local');if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
      const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw Error('Missing resource');
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
    }catch{res.writeHead(404);res.end();}
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
    for(const name of (process.env.AP_BROWSER_ENGINES||'chromium').split(',')){
      const browser=await playwright[name].launch({headless:true,...(name==='chromium'&&process.env.AP_CHROMIUM_PATH?{executablePath:process.env.AP_CHROMIUM_PATH}:{})});browsers.push({name,browser});
      for(const [edition,file] of [['portable',`/dist/auralprint_${version.slice(1)}.html`],['hosted','/dist/hosted/index.html']]){
        const context=await browser.newContext({viewport:{width:1280,height:900}});await observe(context);
        context.on('page',page=>{page.on('pageerror',e=>errors.push(`${name}/${edition}: ${e.message}`));page.on('console',m=>{if(m.type()==='error')errors.push(`${name}/${edition}: ${m.text()}`);});});
        const page=await context.newPage(),app=base+file;await ready(page,app+initial);
        cameraNear(await page.evaluate(()=>compactSmoke.scheduled),prefs.sceneCamera);
        const link=await share(page);assert.match(link,/^#z=/);assert.deepEqual(await decodePrefsFromHash(link),prefs);
        links.push({engine:name,edition,hash:link});
        // In-session invalid and unavailable operations preserve the whole Scene.
        await apply(page,'#z=AAAA');assert.deepEqual(await decodePrefsFromHash(await share(page)),prefs);
        await page.evaluate(()=>{compactSmoke.native=window.DecompressionStream;window.DecompressionStream=undefined;});
        await apply(page,initial);assert.match(await page.locator('#sceneStatus').textContent(),/cannot decompress native DEFLATE/);
        const fallback=await share(page);assert.match(fallback,/^#p=/);assert.match(await page.locator('#sceneStatus').textContent(),/Uncompressed schema-16/);
        assert.deepEqual(await decodePrefsFromHash(fallback),prefs);
        await page.evaluate(()=>{window.DecompressionStream=compactSmoke.native;});
        // Deliberately suspend native output, then let a reset/new import/edit win.
        for(const action of ['reset','newer-import','user-edit','user-camera']){
          await apply(page,pHash(prefs));await delayDecode(page);
          await page.evaluate(hash=>{history.replaceState(null,'',location.pathname+hash);document.getElementById('btnApplyUrl').click();},zHash(encodePresetPayload(CONFIG.defaults)));
          await page.waitForFunction(()=>typeof compactSmoke.release==='function');
          if(action==='reset')await page.evaluate(()=>document.getElementById('btnResetPrefs').click());
          else if(action==='newer-import')await apply(page,pHash(prefs));
          else if(action==='user-camera')await page.evaluate(()=>{const input=document.getElementById('numCameraX');input.value='321.125';input.dispatchEvent(new Event('change',{bubbles:true}));});
          else await page.evaluate(()=>{const input=document.getElementById('rngVol');input.value='.5';input.dispatchEvent(new Event('input',{bubbles:true}));});
          await page.evaluate(()=>compactSmoke.release());await page.waitForFunction(()=>compactSmoke.finished);await frames(page);
          await page.evaluate(()=>{compactSmoke.restore();delete compactSmoke.release;});
          const expected=action==='reset'?CONFIG.defaults:action==='user-edit'?{...prefs,audio:{...prefs.audio,volume:.5}}:prefs;
          assert.deepEqual(await decodePrefsFromHash(await share(page)),expected,`${name} stale ${action}`);
          if(action==='user-camera')assert.equal(await page.locator('#numCameraX').inputValue(),'321.125');
        }
        // An uncompressed compatibility link still initializes exactly.
        await apply(page,pHash(prefs));assert.deepEqual(await decodePrefsFromHash(await share(page)),prefs);
        results.push({engine:name,version:browser.version(),edition,cases:['compressed-first-frame','share-reopen','clipboard-denied','invalid-active-scene','unsupported-decompression','uncompressed-fallback','stale-reset','stale-newer-import','stale-user-edit','stale-user-camera','legacy-12']});
        await context.close();
        const unsupported=await browser.newContext();await observe(unsupported);
        await unsupported.addInitScript(()=>{window.DecompressionStream=undefined;});
        const unsupportedPage=await unsupported.newPage();await ready(unsupportedPage,app+initial);
        cameraNear(await unsupportedPage.evaluate(()=>compactSmoke.scheduled),CONFIG.defaults.sceneCamera);
        assert.match(await unsupportedPage.locator('#sceneStatus').textContent(),/cannot decompress native DEFLATE/);
        assert.deepEqual(await decodePrefsFromHash(await share(unsupportedPage)),CONFIG.defaults);
        await unsupported.close();
      }
    }
    // Links produced by each native engine must initialize and re-share through
    // every other engine. Byte-for-byte compressed equality is never asserted.
    const interoperability=[];
    for(const {name,browser} of browsers)for(const link of links){
      const context=await browser.newContext();await observe(context);const page=await context.newPage();
      await ready(page,base+`/dist/auralprint_${version.slice(1)}.html`+link.hash);
      cameraNear(await page.evaluate(()=>compactSmoke.scheduled),prefs.sceneCamera);
      assert.deepEqual(await decodePrefsFromHash(await share(page)),prefs);
      interoperability.push({producer:link.engine,producerEdition:link.edition,consumer:name});await context.close();
    }
    const offline=[];
    if(process.env.AP_CHECK_OFFLINE==='1')for(const {name,browser} of browsers){
      const context=await browser.newContext({offline:true});await observe(context);const page=await context.newPage();
      try {
        await ready(page,pathToFileURL(path.join(root,`dist/auralprint_${version.slice(1)}.html`)).href+initial);
        cameraNear(await page.evaluate(()=>compactSmoke.scheduled),prefs.sceneCamera);
        assert.deepEqual(await decodePrefsFromHash(await share(page)),prefs);
        offline.push({engine:name,portableFile:true,networkDisabled:true,status:'passed'});
      } catch(error) {
        offline.push({engine:name,status:error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')?'blocked':'failed',reason:error.message.split('\n')[0].split(' at file:')[0]});
      } finally {await context.close();}
    }
    assert.deepEqual(errors,[]);
    const report={version,platform:process.platform,results,interoperability,offline,errors};
    if(process.env.AP_REPORT)fs.writeFileSync(process.env.AP_REPORT,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
    assert.ok(!offline.some(result=>result.status==='failed'),'Optional offline check failed; see report');
  }finally{for(const {browser} of browsers)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
