// Optional comparison runner. Playwright/Chromium are environment tools only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.AP_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),baseline=process.env.AP_BASELINE_ROOT;
if(!baseline)throw Error('AP_BASELINE_ROOT must name the accepted H.S worktree');
(async()=>{
  const server=http.createServer((req,res)=>{
    const parts=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean),mode=parts.shift();
    const base=mode==='hs'?baseline:root,relative=parts.join('/');
    if(!relative){
      const template=fs.readFileSync(path.join(base,'src/index.template.html'),'utf8');
      res.setHeader('Content-Type','text/html');res.end(template.replace('__AURALPRINT_VERSION__',fs.readFileSync(path.join(base,'version'),'utf8').trim()).replace(/<link[^>]+>/g,'').replace('<!-- AURALPRINT_INLINE_CSS -->',()=>'<style>'+fs.readFileSync(path.join(root,'.build/auralprint.css'),'utf8')+'</style>'));return;
    }
    const file=relative==='scripts/measure-rc15-spacing.mjs'?path.join(root,relative):path.resolve(base,relative);
    if(!file.startsWith(base+path.sep)&&file!==path.join(root,'scripts/measure-rc15-spacing.mjs')){res.writeHead(403);res.end();return;}
    if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const report={baseline:'ec5c6238ffa6c51dd05a03fdcc0209461e21bc44',version:fs.readFileSync(path.join(root,'version'),'utf8').trim(),method:'Native headless Chromium, fixed synthetic 60 Hz clock, 1080 update-only warmup + 120 instrumented production callbacks per run. Actual native timer measures CPU work; Canvas submission excludes GPU completion. Three fresh-page trials with rotating variant order, viewport 1280x800 DPR 1, generated silent stereo PCM. Synthetic fixtures, not the human scene. Stationary-overlap explicitly freezes the sampled emitter at (0,0) because canonical motion/radius minima otherwise keep an Orb moving.',results:[],errors:[]};
  try{
    browser=await chromium.launch({executablePath:process.env.AP_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});report.browser=await browser.version();
    const variants=[{mode:'hs',spacing:0,label:'H.S'},{mode:'ht',spacing:.5,label:'H.T 0.5 px'},{mode:'ht',spacing:0,label:'H.T 0 px'}];
    const scenarios=process.env.AP_SCENARIOS?process.env.AP_SCENARIOS.split(','):['default-two','slow-high-demand','stationary-overlap','moving-sixteen'];
    for(let trial=0;trial<3;trial++)for(const scenario of scenarios)for(let i=0;i<3;i++){
      const variant=variants[(i+trial)%3],page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
      page.on('pageerror',e=>report.errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/${variant.mode}/`);
      const result=await page.evaluate(async args=>{const {measureRc15Spacing}=await import('./scripts/measure-rc15-spacing.mjs');return measureRc15Spacing(args);},{scenario,spacing:variant.spacing});
      if(scenario==='stationary-overlap'&&!result.history.every(orb=>orb.uniquePositions===1))throw Error('Stationary emitter fixture moved');
      report.results.push({...result,trial,label:variant.label});
      fs.writeFileSync(process.env.AP_REPORT,JSON.stringify(report,null,2)+'\n');
      console.log(JSON.stringify({trial,scenario,label:variant.label,emissions:result.totals.emissions,live:result.liveParticles,timings:result.timings}));await page.close();
    }
    if(report.errors.length)throw Error(report.errors.join('\n'));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
