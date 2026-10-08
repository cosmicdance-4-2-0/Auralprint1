const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.AP_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const server=http.createServer((req,res)=>{const relative=new URL(req.url,'http://localhost').pathname.slice(1);
    if(relative==='favicon.ico'){res.writeHead(204);res.end();return;}
    if(!relative){res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(root,'src/index.template.html'),'utf8').replace('__AURALPRINT_VERSION__',fs.readFileSync(path.join(root,'version'),'utf8').trim()).replace(/<link[^>]+>/g,'').replace('<!-- AURALPRINT_INLINE_CSS -->',()=>'<style>'+fs.readFileSync(path.join(root,'.build/auralprint.css'),'utf8')+'</style>'));return;}
    const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.json')?'application/json':'text/javascript');res.end(fs.readFileSync(file));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[],results=[];
  try{browser=await chromium.launch({executablePath:process.env.AP_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    for(const fps of [120,60,10,5]){const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);results.push(await page.evaluate(async fps=>{const {validateRc15History}=await import('./scripts/validate-rc15-history.mjs');return validateRc15History(fps);},fps));if(fps===60)await page.locator('#c').screenshot({path:path.join(path.dirname(process.env.AP_REPORT),'synthetic-history-60fps.png')});await page.close();}
    if(errors.length)throw Error(errors.join('\n'));const report={version:fs.readFileSync(path.join(root,'version'),'utf8').trim(),browser:await browser.version(),method:'Synthetic 16-Orb configured TTL rotation and independent Trace coverage,actual source callback draw. No interpolation or human preset claim.',results,errors};fs.writeFileSync(process.env.AP_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
