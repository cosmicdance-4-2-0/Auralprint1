// Optional standalone-artifact regression. Browser tooling is not a dependency.
const {chromium}=require(process.env.AP_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
(async()=>{
  const version=fs.readFileSync('version','utf8').trim();
  const server=http.createServer((req,res)=>{if(req.url.startsWith('/favicon.ico')){res.writeHead(204);res.end();return;}res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(`dist/auralprint_${version.slice(1)}.html`));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  let browser;const results=[],errors=[];
  try{
    browser=await chromium.launch({executablePath:process.env.AP_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    for(const dpr of [1,2]){
      const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:dpr});
      const requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
      await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
      await page.goto(origin);await page.locator('#btnOpenVisualizers').click();
      const selector='[id$="-min-placement-distance"]';
      await page.evaluate(selector=>{const control=document.querySelector(selector);for(let p=control.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;window.spacingControl=control;window.spacingCard=control.closest('.orb-editor-card');},selector);
      const control=page.locator(selector).first();await control.focus();
      assert.equal(await control.getAttribute('min'),'0');assert.equal(await control.getAttribute('max'),'10');assert.equal(await control.getAttribute('step'),'0.1');
      await control.press('ArrowRight');assert.equal(await control.inputValue(),'0.6');
      await control.press('Home');assert.equal(await control.inputValue(),'0');
      assert.equal(await control.getAttribute('aria-valuetext'),'0.0 pixels');
      assert.equal(await page.locator('#valMinPlacementDistance').textContent(),'mixed');
      assert.ok(await page.evaluate(()=>document.activeElement===window.spacingControl));
      const result=await page.evaluate(()=>{
        const bulk=document.querySelector('#rngMinPlacementDistance');bulk.value='2.3';bulk.dispatchEvent(new Event('input',{bubbles:true}));
        const id=window.spacingCard.dataset.orbId;
        document.querySelector(`[data-action="duplicate"][data-orb-id="${id}"]`).click();
        const retained=window.spacingCard===document.querySelector(`.orb-editor-card[data-orb-id="${id}"]`)&&window.spacingControl===window.spacingCard.querySelector('[id$="-min-placement-distance"]');
        document.querySelector('#btnShare').click();
        const payload=JSON.parse(atob(location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/')));
        return {retained,payload,canvasWidth:document.querySelector('#c').width,cssWidth:innerWidth,help:document.getElementById(window.spacingControl.getAttribute('aria-describedby')).textContent,bulkValue:document.querySelector('#valMinPlacementDistance').textContent};
      });
      assert.ok(result.retained);assert.equal(result.payload.schema,10);assert.equal(result.payload.prefs.orbs.length,3);
      assert.ok(result.payload.prefs.orbs.every(orb=>orb.particles.minPlacementDistancePx===2.3));
      assert.equal(result.canvasWidth,result.cssWidth*dpr);assert.equal(result.bulkValue,'2.3 px');
      assert.equal(result.help,"Minimum distance from this Orb's last retained particle before a new particle is placed. 0 disables filtering.");
      assert.equal(requests.filter(url=>!url.startsWith(origin)).length,0);
      assert.ok((await page.title()).includes(version));results.push({dpr,...result,externalRequests:0});await page.close();
    }
    assert.deepEqual(errors,[]);
    const report={version,browser:await browser.version(),verified:['standalone boot with external requests blocked','DPR 1 and 2','keyboard range edits to zero','pixel accessibility value','mixed Bulk state','Bulk edit','duplication','surviving editor and input identity','schema-10 persistence','exact help text'],errors,results};
    fs.writeFileSync(process.env.AP_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({version,browser:report.browser,verified:report.verified,errors},null,2));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
