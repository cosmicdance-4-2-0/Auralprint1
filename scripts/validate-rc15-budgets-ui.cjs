// Optional standalone validation; environment browser tooling is not a dependency.
const {chromium}=require(process.env.AP_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
(async()=>{
  const version=fs.readFileSync('version','utf8').trim();
  const server=http.createServer((req,res)=>{if(req.url.startsWith('/favicon.ico')){res.writeHead(204);res.end();return;}res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(`dist/auralprint_${version.slice(1)}.html`));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;const results=[],errors=[];
  try {
    browser=await chromium.launch({executablePath:process.env.AP_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    for(const dpr of [1,2]){
      const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:dpr});
      const requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
      await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
      await page.goto(origin);await page.locator('#btnOpenScene').click();await page.evaluate(()=>document.querySelector('#performanceSection').open=true);
      const live=page.locator('#numMaxActiveParticles'),emissions=page.locator('#numMaxEmissionsPerFrame');
      assert.equal(await live.getAttribute('max'),'1048576');assert.equal(await emissions.getAttribute('max'),'16384');
      assert.equal(await live.inputValue(),'16384');assert.equal(await emissions.inputValue(),'512');
      await page.evaluate(()=>{window.liveControl=document.querySelector('#numMaxActiveParticles');window.orbHost=document.querySelector('#orbEditorList');});
      await live.focus();await live.press('ArrowUp');assert.equal(await live.inputValue(),'16385');
      // Enter commits the keyboard edit through change; tab is also supported.
      await live.press('Enter');assert.equal(await page.locator('#valMaxActiveParticles').textContent(),'Selected: 16385');
      await live.fill('');await live.press('Enter');assert.equal(await live.getAttribute('aria-invalid'),'true');
      assert.match(await page.locator('#maxActiveParticlesError').textContent(),/Enter a whole number/);
      assert.equal(await page.locator('#valMaxActiveParticles').textContent(),'Selected: 16385');
      await live.fill('65536');await live.press('Enter');await emissions.fill('4096');await emissions.press('Enter');
      assert.equal(await page.locator('#valMaxEmissionsPerFrame').textContent(),'Selected: 4096');
      assert.ok(await page.evaluate(()=>document.activeElement===document.querySelector('#numMaxEmissionsPerFrame')&&window.liveControl===document.querySelector('#numMaxActiveParticles')&&window.orbHost===document.querySelector('#orbEditorList')));
      await page.evaluate(()=>document.querySelector('#btnShare').click());
      const payload=await page.evaluate(()=>JSON.parse(atob(location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/'))));
      assert.deepEqual(payload.prefs.particleSafety,{maxEmissionsPerFrame:4096,maxActiveParticles:65536});assert.equal(payload.schema,10);
      assert.ok(payload.prefs.orbs.every(o=>o.particles.minPlacementDistancePx===.5));
      assert.equal('retentionEvictionsTotal' in payload.prefs.particleSafety,false);
      await page.reload();assert.equal(await live.inputValue(),'65536');assert.equal(await emissions.inputValue(),'4096');
      await page.evaluate(()=>{document.querySelector('#btnResetPrefs').click();});assert.equal(await live.inputValue(),'16384');assert.equal(await emissions.inputValue(),'512');
      const zero={...payload,prefs:{...payload.prefs,particleSafety:{maxEmissionsPerFrame:0,maxActiveParticles:0}}};
      await page.goto(origin+'/#p='+Buffer.from(JSON.stringify(zero)).toString('base64url'));await page.reload();assert.equal(await live.inputValue(),'0');assert.equal(await emissions.inputValue(),'0');
      assert.equal(await page.locator('#statParticleLive').textContent(),'0');assert.equal(await page.locator('#statParticleRetentionRetired').textContent(),'0');
      assert.ok((await page.title()).includes(version));assert.equal(requests.filter(u=>!u.startsWith(origin)).length,0);
      results.push({dpr,payload,zeroReload:true,externalRequests:0});await page.close();
    }
    assert.deepEqual(errors,[]);
    const report={version,browser:await browser.version(),verified:['offline standalone boot','DPR 1 and 2','numeric maximum attributes','keyboard ArrowUp and Enter change commit','empty refusal and visible feedback','selected value display','focus/input/host identity','share schema 10 without runtime counters','URL reload','Reset All defaults','zero policy URL reload','actual empty-scene diagnostic counts'],results,errors};
    fs.writeFileSync(process.env.AP_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({version,browser:report.browser,verified:report.verified,errors},null,2));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
