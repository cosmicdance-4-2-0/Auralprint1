// Optional comparison runner. Playwright/Chromium are environment tools only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.AP_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),baseline=process.env.AP_BASELINE_ROOT;
if(!baseline)throw Error('AP_BASELINE_ROOT must name the accepted H.T worktree');
(async()=>{
  const server=http.createServer((req,res)=>{
    const parts=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean),mode=parts.shift();
    const base=mode==='ht'?baseline:root,relative=parts.join('/');
    if(!relative){
      const template=fs.readFileSync(path.join(base,'src/index.template.html'),'utf8');
      res.setHeader('Content-Type','text/html');res.end(template.replace('__AURALPRINT_VERSION__',fs.readFileSync(path.join(base,'version'),'utf8').trim()).replace(/<link[^>]+>/g,'').replace('<!-- AURALPRINT_INLINE_CSS -->',()=>'<style>'+fs.readFileSync(path.join(root,'.build/auralprint.css'),'utf8')+'</style>'));return;
    }
    const file=relative==='scripts/measure-rc15-budgets.mjs'?path.join(root,relative):path.resolve(base,relative);
    if(!file.startsWith(base+path.sep)&&file!==path.join(root,'scripts/measure-rc15-budgets.mjs')){res.writeHead(403);res.end();return;}
    if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  const report={baseline:'ddbba02cd2b4f05bc12c9814583d33b82a6bef91',version:fs.readFileSync(path.join(root,'version'),'utf8').trim(),method:'Native headless Chromium, fixed synthetic 60 Hz clock, 1080 update-only warmup + 120 instrumented production callbacks per run. Actual native timer measures CPU work; Canvas submission excludes GPU completion. Three fresh-page trials with rotating variant order, viewport 1280x800 DPR 1, generated silent stereo PCM. Synthetic fixtures, not the human scene. Expert policy is 4,096 emissions/update and 65,536 retained particles. Live reduction to at most 8,192 measures canonical resolution plus in-place trimming after the run.',results:[],errors:[]};
  try{
    browser=await chromium.launch({executablePath:process.env.AP_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});report.browser=await browser.version();
    const variants=[{mode:'ht',label:'H.T defaults'},{mode:'hu',label:'H.U defaults'},{mode:'hu',label:'H.U expert',policy:{maxEmissionsPerFrame:4096,maxActiveParticles:65536}}];
    const scenarios=process.env.AP_SCENARIOS?process.env.AP_SCENARIOS.split(','):['default-two','moving-sixteen'];
    for(let trial=0;trial<3;trial++)for(const scenario of scenarios)for(const spacing of [.5,0])for(let i=0;i<3;i++){
      const variant=variants[(i+trial)%3],page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
      page.on('pageerror',e=>report.errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/${variant.mode}/`);
      const result=await page.evaluate(async args=>{const {measureRc15Budgets}=await import('./scripts/measure-rc15-budgets.mjs');return measureRc15Budgets(args);},{scenario,spacing,policy:variant.policy});
      if(scenario==='stationary-overlap'&&!result.history.every(orb=>orb.uniquePositions===1))throw Error('Stationary emitter fixture moved');
      report.results.push({...result,trial,label:variant.label});
      fs.writeFileSync(process.env.AP_REPORT,JSON.stringify(report,null,2)+'\n');
      console.log(JSON.stringify({trial,scenario,spacing,label:variant.label,emissions:result.totals.emissions,live:result.liveParticles,timings:result.timings}));await page.close();
    }
    if(report.errors.length)throw Error(report.errors.join('\n'));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
