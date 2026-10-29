const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('../../../node_modules/playwright');
const root = path.resolve(__dirname, '../../..');
const errors=[], results={};
const server=http.createServer((req,res)=>{
  try {
    const pathname=new URL(req.url,'http://local').pathname;
    if(pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(pathname==='/source'){
      res.setHeader('Content-Type','text/html');
      res.end(fs.readFileSync(path.join(root,'src/index.template.html'),'utf8').replaceAll('__AURALPRINT_VERSION__','v0.1.16-candidate').replace('<!-- AURALPRINT_INLINE_CSS -->','<link rel="stylesheet" href="/src/css/base.css">').replace('<!-- AURALPRINT_INLINE_JS -->','<script type="module" src="/src/js/main.js"></script>')); return;
    }
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw Error('Invalid resource');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
  } catch(e){res.writeHead(404);res.end();errors.push('server '+req.url+': '+e.message);}
});
const frames=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const readPrefs=page=>page.evaluate(async()=>structuredClone((await import('/src/js/core/preferences.js')).preferences));
async function reveal(page,selector){await page.locator(selector).first().evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});await frames(page);}
async function show(page,name){await page.evaluate(name=>{for(const n of ['Audio','Analysis','Visualizers','Scene','Camera']){const panel=document.getElementById(n[0].toLowerCase()+n.slice(1)+'Panel'),b=document.getElementById('btnOpen'+n);if((getComputedStyle(panel).display!=='none')!==(n===name))b.click();}},name);await frames(page);}
async function reset(page){await show(page,'Scene');await reveal(page,'#btnResetPrefs');await page.locator('#btnResetPrefs').click();await frames(page);}
async function inspect(page,selector){return page.locator(selector).first().evaluate(el=>({value:el.value,invalid:el.getAttribute('aria-invalid'),focused:document.activeElement===el,readout:el.closest('.row')?.querySelector('.val')?.textContent,error:el.getAttribute('aria-describedby')?.split(' ').map(id=>document.getElementById(id)?.textContent)}));}
(async()=>{
  let browser;
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
    results.browser=browser.version();
    const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
    page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:'+server.address().port+'/source');await page.waitForFunction(()=>document.querySelector('input[id$="-bands"]'));await frames(page);
    await show(page,'Visualizers');const band='input[id$="-bands"]';await reveal(page,band);await page.locator(band).first().fill('invalid');await page.locator(band).first().press('Tab');
    results.bandBeforeReset=await inspect(page,band+':first-of-type');
    await reset(page);await show(page,'Visualizers');await reveal(page,band);results.bandAfterReset=await inspect(page,band+':first-of-type');results.canonicalBands=(await readPrefs(page)).orbs[0].bandIds;
    const next=await readPrefs(page);next.orbs[0].bandIds=[12,13];const imported='#p='+Buffer.from(JSON.stringify({schema:12,prefs:next})).toString('base64url');
    await show(page,'Scene');await reveal(page,'#btnApplyUrl');await page.evaluate(h=>history.replaceState(null,'',location.pathname+h),imported);await page.locator('#btnApplyUrl').click();await frames(page);
    await show(page,'Visualizers');await reveal(page,band);results.bandAfterImport={control:await inspect(page,band),canonical:(await readPrefs(page)).orbs[0].bandIds};
    await page.locator('.orb-editor-card').first().locator('.orb-band-picker button').first().click();await frames(page);results.bandAfterChooserControl={control:await inspect(page,band),canonical:(await readPrefs(page)).orbs[0].bandIds};
    await show(page,'Scene');await reveal(page,'#numWorldWidth');await page.locator('#numWorldWidth').fill('-1');await page.locator('#numWorldWidth').press('Tab');results.worldBeforeReset=await inspect(page,'#numWorldWidth');await reset(page);await reveal(page,'#numWorldWidth');results.worldAfterReset=await inspect(page,'#numWorldWidth');results.canonicalWorld=(await readPrefs(page)).world;
    await reveal(page,'#numMaxActiveParticles');await page.locator('#numMaxActiveParticles').fill('-1');await page.locator('#numMaxActiveParticles').press('Tab');await reset(page);await reveal(page,'#numMaxActiveParticles');results.resourcesAfterReset=await inspect(page,'#numMaxActiveParticles');
    await reset(page);
    const h='#p='+Buffer.from(JSON.stringify({schema:12,prefs:{bands:{rainbow:{hueOffsetDeg:12.5,saturation:0.375,value:0.425}}}})).toString('base64url');
    await page.evaluate(h=>history.replaceState(null,'',location.pathname+h),h);await reveal(page,'#btnApplyUrl');await page.locator('#btnApplyUrl').click();await frames(page);await reveal(page,'#rngHueOff');
    results.sceneColorBefore={canonical:(await readPrefs(page)).bands.rainbow,controls:[]};
    for(const id of ['rngHueOff','rngSat','rngVal'])results.sceneColorBefore.controls.push({id,...await inspect(page,'#'+id),nativeAria:await page.locator('#'+id).getAttribute('aria-valuetext')});
    await page.locator('#rngHueOff').focus();await page.locator('#rngHueOff').press('ArrowRight');await frames(page);results.sceneHueAfterArrow={canonical:(await readPrefs(page)).bands.rainbow,control:await inspect(page,'#rngHueOff')};
    results.layouts=[];
    for(const viewport of [{width:320,height:568},{width:375,height:667},{width:667,height:375},{width:568,height:320},{width:375,height:260}]){
      await page.setViewportSize(viewport);await frames(page);
      for(const name of ['Visualizers','Analysis','Scene','Camera','Audio']){
        await show(page,name);if(name!=='Audio')await page.evaluate(()=>document.getElementById('btnOpenAudio').click());await page.evaluate(name=>{const p=document.getElementById(name[0].toLowerCase()+name.slice(1)+'Panel');for(const d of p.querySelectorAll('details'))d.open=true;},name);await frames(page);
        results.layouts.push(await page.evaluate(({name,viewport})=>{const panel=document.getElementById(name[0].toLowerCase()+name.slice(1)+'Panel'),r=panel.getBoundingClientRect();return {name,viewport,panel:{x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth},documentOverflow:document.documentElement.scrollWidth>innerWidth,visibleControls:[...panel.querySelectorAll('button,input,select')].filter(el=>{const e=el.getBoundingClientRect();return e.height>0&&e.width>0}).length};},{name,viewport}));
      }
    }
    await page.setViewportSize({width:1280,height:900});await reset(page);await show(page,'Visualizers');
    const remove=page.locator('[data-action=remove]').first();await remove.focus();page.once('dialog',d=>d.accept());await remove.press('Enter');await frames(page);results.focusAfterRemove=await page.evaluate(()=>({id:document.activeElement.id,action:document.activeElement.dataset.action,orb:document.activeElement.dataset.orbId}));
    const applyPrefs=async prefs=>{await show(page,'Scene');await reveal(page,'#btnApplyUrl');const h='#p='+Buffer.from(JSON.stringify({schema:12,prefs})).toString('base64url');await page.evaluate(h=>history.replaceState(null,'',location.pathname+h),h);await page.locator('#btnApplyUrl').click();await frames(page);};
    const zero=await readPrefs(page);zero.orbs=[];await applyPrefs(zero);await show(page,'Visualizers');results.zeroOrbs=await page.evaluate(()=>({editors:document.querySelectorAll('.orb-editor-card').length,inventory:document.getElementById('visualizersStatus').textContent,disabledBulk:[...document.querySelectorAll('.bulk-edit input,.bulk-edit select')].every(el=>el.disabled)}));
    await page.locator('#btnVisualizersAddOrb').click();await frames(page);results.addFromZero=(await readPrefs(page)).orbs.length;
    let identity=await readPrefs(page);identity.orbs[0].id='spectral-ring';identity.orbs.push({...structuredClone(identity.orbs[0]),id:'<img src=x onerror=alert(1)>'});await applyPrefs(identity);await show(page,'Visualizers');
    results.identitySafe=await page.evaluate(()=>({unexpectedImages:document.querySelectorAll('#visualizerList img,#orbEditorList img').length,ids:[...document.querySelectorAll('#orbEditorList input[id]')].slice(0,3).map(el=>el.id)}));
    page.once('dialog',async d=>{results.identityPrompt=d.message();await d.accept();});await page.locator('[data-action=remove]').first().click();await frames(page);results.identityAfterRemove={orbs:(await readPrefs(page)).orbs.map(o=>o.id),ringRows:await page.locator('[data-action=edit-ring]').count()};
    const beforeToggle=(await readPrefs(page)).orbs.length;await page.evaluate(()=>{for(let i=0;i<20;i++){document.getElementById('btnHideVisualizers').click();document.getElementById('btnOpenVisualizers').click();}});await frames(page);await page.locator('[data-action=duplicate]').first().click();await frames(page);results.oneDuplicateAfter20Toggles=(await readPrefs(page)).orbs.length-beforeToggle;
    results.errors=errors;fs.writeFileSync(path.join(__dirname,'native-ui.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
    await context.close();
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
