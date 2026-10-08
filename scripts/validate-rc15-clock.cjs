const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.AP_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{const relative=new URL(req.url,'http://localhost').pathname.slice(1);
    if(relative==='favicon.ico'){res.writeHead(204);res.end();return;}
    if(!relative){res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(root,'src/index.template.html'),'utf8').replace('__AURALPRINT_VERSION__',fs.readFileSync(path.join(root,'version'),'utf8').trim()).replace(/<link[^>]+>/g,'').replace('<!-- AURALPRINT_INLINE_CSS -->',()=>'<style>'+fs.readFileSync(path.join(root,'.build/auralprint.css'),'utf8')+'</style>'));return;}
    const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[],results=[];
  try{browser=await chromium.launch({executablePath:process.env.AP_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    for(const dpr of [1,2]){const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:dpr});page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);results.push({dpr,...await page.evaluate(async()=>{const {validateRc15Clock}=await import('./scripts/validate-rc15-clock.mjs');return validateRc15Clock();})});await page.close();}
    if(errors.length)throw Error(errors.join('\n'));const report={version:fs.readFileSync(path.join(root,'version'),'utf8').trim(),browser:await browser.version(),method:'Native production source modules and actual boot/callback. Synthetic timestamps, visibility property and visibility events; no browser timing-policy reimplementation.',results,errors};fs.writeFileSync(process.env.AP_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
