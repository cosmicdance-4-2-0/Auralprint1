// Optional environment tooling; never required by the shipped application.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.AP_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),baseline=process.env.AP_BASELINE_ROOT;
if(!baseline)throw Error('AP_BASELINE_ROOT must identify exact H.U baseline');
function instrument(source,relative){
  if(relative==='src/js/main.js')source=source.replace('updateAnalysisFrame(analysisFrame, AudioEngine.sample(), state.bands);',"const probeAnalysisStart=globalThis.__rc15Probe.now();updateAnalysisFrame(analysisFrame, AudioEngine.sample(), state.bands);globalThis.__rc15Probe.add('audioAndAnalysisMs',globalThis.__rc15Probe.now()-probeAnalysisStart);");
  if(relative==='src/js/render/trail-system.js'&&!source.includes('expireParticles(')){
    const start=source.indexOf('    const ttl = Math.max(0.0001, particleSettings.ttlSec);'),end=source.indexOf('\n    const rate =',start);if(start<0||end<0)throw Error('Unknown baseline expiry seam');
    const body=source.slice(start,end).replace('particleSettings.ttlSec','ttlSec');source=source.slice(0,start)+'    this.expireParticles(nowSec, particleSettings.ttlSec);\n'+source.slice(end);
    source=source.replace('  updateAndEmit(',`  expireParticles(nowSec, ttlSec) {\n    const g=this.governor;\n${body}\n  }\n\n  updateAndEmit(`);
  }
  if(relative==='src/js/render/visualizer-runtime.js')source=source.replace('function syncSettings(settings = settingsRef.settings) {',"function syncSettings(settings = settingsRef.settings) {const probeSyncStart=globalThis.__rc15Probe.now();try {").replace('\n  const syncParticleTrails',"\n  const syncParticleTrails").replace('    return particleGovernor.applyPolicy(source);\n  }',"    return particleGovernor.applyPolicy(source);\n  }finally{globalThis.__rc15Probe.add('policySyncMs',globalThis.__rc15Probe.now()-probeSyncStart);}} ");
  if(relative==='src/js/ui/scene-panel.js')source=source.replace('function refreshDiagnostics() {',"function refreshDiagnostics() {const probeDiagnosticsStart=globalThis.__rc15Probe.now();try {").replace('  }\n\n  function init() {',"  }finally{globalThis.__rc15Probe.add('diagnosticsMs',globalThis.__rc15Probe.now()-probeDiagnosticsStart);}}\n\n  function init() {");
  return source;
}
(async()=>{
  const server=http.createServer((req,res)=>{
    const parts=new URL(req.url,'http://localhost').pathname.split('/').filter(Boolean),mode=parts.shift()||'hu',profile=mode.endsWith('-profile'),base=mode.startsWith('hu')?baseline:root,relative=parts.join('/');
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
    if(!relative){const html=fs.readFileSync(path.join(base,'src/index.template.html'),'utf8');res.setHeader('Content-Type','text/html');res.end(html.replace('__AURALPRINT_VERSION__',fs.readFileSync(path.join(base,'version'),'utf8').trim()).replace(/<link[^>]+>/g,'').replace('<!-- AURALPRINT_INLINE_CSS -->',()=>'<style>'+fs.readFileSync(path.join(root,'.build/auralprint.css'),'utf8')+'</style>'));return;}
    const shared=relative==='scripts/measure-rc15-timing.mjs',file=path.resolve(shared?root:base,relative);if(!file.startsWith((shared?root:base)+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type','text/javascript');let source=fs.readFileSync(file,'utf8');if(profile)source=instrument(source,relative);res.end(source);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
  const report={baseline:'beef098c82e3a81698b5f6705b308afad269830d',version:fs.readFileSync(path.join(root,'version'),'utf8').trim(),method:'Three rotating fresh-page trials; fixed synthetic schedule; 330 update-only warmup plus 30 actual production callbacks, or 1,080 + 120 for saturated-sixteen. Uninstrumented measures only callback duration. Profile mode uses measurement-only HTTP source seams for baseline expiry/analysis/policy/diagnostic timers plus nested method wrappers. COOP/COEP for native timer resolution. Viewport 1280x800 DPR1, generated silent stereo PCM. No human preset. Canvas CPU submission excludes GPU completion.',results:[],errors:[]};
  try{
    browser=await chromium.launch({executablePath:process.env.AP_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});report.browser=await browser.version();
    const cases=(process.env.AP_CASES||'default-two,moving-sixteen,dense-sixteen,stationary-sixteen,stress-64,stress-256,large-retention,slow-10,slow-5,suspension').split(',');const modes=(process.env.AP_MODES||'hu,hv').split(',');
    for(let trial=0;trial<3;trial++)for(const name of cases)for(const profile of [false,true])for(let j=0;j<modes.length;j++){
      const mode=modes[(j+trial)%modes.length],page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/${mode}${profile?'-profile':''}/`);
      const args={scenario:name==='dense-sixteen'||name==='saturated-sixteen'||name.startsWith('slow-')?'moving-sixteen':name,spacing:name==='dense-sixteen'?0:.5,profile,frames:name==='saturated-sixteen'?1200:360,samples:name==='saturated-sixteen'?120:30,fps:name==='slow-10'?10:name==='slow-5'?5:60};
      const result=await page.evaluate(async args=>{const {measureRc15Timing}=await import('./scripts/measure-rc15-timing.mjs');return measureRc15Timing(args);},args);
      report.results.push({...result,case:name,mode,trial});fs.writeFileSync(process.env.AP_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({trial,case:name,mode,profile,live:result.liveParticles,expiryVisits:result.totals.expiryVisits,callback:result.summary.totalCallbackMs,update:result.summary.visualizerUpdateMs}));await page.close();
    }
    if(report.errors.length)throw Error(report.errors.join('\n'));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
