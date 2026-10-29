// Focused feature-candidate evidence: native controls in all editions and
// Canvas workload comparison. Seeded histories are test data, not app hooks.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const baseline = '33b696a94439d17e86ef26c04a416cbc430754d3';
const work = path.resolve(process.env.AP_116_OUTPUT || path.join(root, 'work/116-candidate'));
const hash = wire => '#p=' + Buffer.from(JSON.stringify(wire)).toString('base64url');
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function reveal(page, selector) {
  const control = page.locator(selector).first();
  await control.evaluate(el => {
    const panel = el.closest('.panel');
    if (panel && getComputedStyle(panel).display === 'none') {
      const name = panel.id === 'scenePanel' ? 'Scene' : panel.id === 'visualizersPanel' ? 'Visualizers' : panel.id === 'audioPanel' ? 'Audio' : 'Queue';
      document.getElementById('btnOpen' + name).click();
    }
    for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
  });
  await control.scrollIntoViewIfNeeded(); return control;
}
async function share(page) {
  await page.evaluate(() => { document.getElementById('sceneStatus').textContent = ''; document.getElementById('btnShare').click(); });
  await page.waitForFunction(() => /^Share link /.test(document.getElementById('sceneStatus').textContent));
  const { decodePrefsFromHash } = await import('../src/js/presets/url-preset.js');
  return decodePrefsFromHash(new URL(page.url()).hash);
}
async function apply(page, wire) {
  await page.evaluate(h => { history.replaceState(null, '', location.pathname + h); document.getElementById('btnApplyUrl').click(); }, hash(wire));
  await frames(page);
}
function wav() {
  const data = Buffer.alloc(44 + 48000 * 2 * 30);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(48000, 24); data.writeUInt32LE(96000, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  for (let i = 44; i < data.length; i += 2) data.writeInt16LE(Math.round(Math.sin(i * .03) * 1000), i);
  return data;
}
async function captureProbe(page) {
  await page.addInitScript(() => {
    const probe = window.capture116f = { mode: 'success', calls: 0, waiting: false };
    const capture = async () => {
      probe.calls++;
      if (probe.mode === 'denied') throw new DOMException('116F synthetic denial', 'NotAllowedError');
      if (probe.mode === 'delayed') { probe.waiting = true; await new Promise(resolve => { probe.release = resolve; }); probe.waiting = false; }
      const context = new AudioContext(), destination = context.createMediaStreamDestination(), oscillator = context.createOscillator();
      oscillator.frequency.value = 220; oscillator.connect(destination); oscillator.start();
      return destination.stream;
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: capture });
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: capture });
  });
}
async function queueControls(page, defaults, encode) {
  const option = structuredClone(defaults); option.audio.clearQueueOnSourceExit = true;
  await apply(page, encode(defaults));
  const count = () => page.locator('#queueList > .queue-item').count();
  const load = async () => {
    await (await reveal(page, '#btnSourceFile')).click();
    await page.locator('#btnLoad').click();
    await page.locator('#fileInput').setInputFiles(['a', 'b'].map(name => ({ name: '116f-' + name + '.wav', mimeType: 'audio/wav', buffer: wav() })));
    await page.waitForFunction(() => document.getElementById('btnPlay').textContent === 'Pause');
    await page.locator('#btnStop').click(); assert.equal(await count(), 2);
  };
  const source = async kind => {
    await (await reveal(page, '#btnSource' + kind)).click();
    if (kind !== 'File') await page.waitForFunction(kind => document.getElementById('btnSource' + kind).title.includes('Live input active'), kind);
    await frames(page);
  };
  await load(); await source('Mic'); assert.equal(await count(), 2, 'Default-off Mic deleted Queue');
  await source('File'); await source('Stream'); assert.equal(await count(), 2, 'Default-off Stream deleted Queue');
  await apply(page, encode(option)); assert.equal(await count(), 2, 'Preset import deleted Queue');
  await source('File'); assert.equal(await count(), 2, 'Returning File deleted Queue');
  await source('Mic'); assert.equal(await count(), 0, 'Successful File to Mic did not clear Queue');
  await load(); await source('Stream'); assert.equal(await count(), 0, 'Successful File to Stream did not clear Queue');
  await load(); await page.evaluate(() => { capture116f.mode = 'denied'; });
  await (await reveal(page, '#btnSourceMic')).click();
  await page.waitForFunction(() => document.getElementById('audioStatus').textContent.toLowerCase().includes('denied'));
  assert.equal(await count(), 2, 'Permission denial deleted Queue');
  await source('File'); await page.evaluate(() => { capture116f.mode = 'delayed'; capture116f.waiting = false; });
  await (await reveal(page, '#btnSourceMic')).click(); await page.waitForFunction(() => capture116f.waiting);
  assert.equal(await count(), 2, 'Pending permission deleted Queue');
  await source('File'); await page.evaluate(() => capture116f.release()); await frames(page);
  assert.equal(await count(), 2, 'Cancelled stale capture deleted Queue');
  await page.evaluate(() => { capture116f.mode = 'success'; });
  return { realFileObjects: true, defaultOffPreserves: true, syntheticMicAndStreamSuccess: true, importOnlyFutureBehavior: true, syntheticPermissionDenial: true, pendingAndCancelledActivation: true, qualification: 'Generated Web Audio MediaStreams replace native permission dialogs; actual AudioEngine attachment and UI source handlers execute.' };
}
async function controls(page, defaults, encode) {
  assert.deepEqual(await share(page), defaults);
  assert.equal(await page.locator('#chkClearQueueOnSourceExit').isChecked(), false);
  assert.equal(await page.locator('input[id$="-fade-trace"],#chkFadeTrace').count(), 0);
  const source = await reveal(page, '#chkClearQueueOnSourceExit'); await source.focus(); await source.press('Space');
  assert.equal((await share(page)).audio.clearQueueOnSourceExit, true);
  const length = await reveal(page, 'input[id$="-fade-segments"]');
  assert.equal(await length.inputValue(), '0'); assert.equal(await length.getAttribute('aria-valuetext'), 'Off');
  await length.focus(); await length.press('ArrowRight');
  let current = await share(page); assert.deepEqual(current.orbs.map(o=>o.trace.fadeSegments),[1,0]);
  assert.equal(await length.getAttribute('aria-valuetext'), '1 segment');
  assert.equal(await page.locator('#valFadeSegments').textContent(), 'mixed');
  const before = structuredClone(current); await frames(page); assert.deepEqual(await share(page),before);
  const bulk = await reveal(page, '#rngFadeSegments'); await bulk.focus(); await bulk.press('End');
  current = await share(page); assert.ok(current.orbs.every(o=>o.trace.fadeSegments===20));
  assert.equal(await bulk.getAttribute('aria-valuetext'), '20 segments');
  await length.focus(); await page.evaluate(()=>{window.traceRoot=document.querySelector('input[id$="-fade-segments"]').closest('.orb-editor-card');});
  const reordered=structuredClone(current);reordered.orbs.reverse();await apply(page,encode(reordered));
  assert.equal(await page.evaluate(()=>traceRoot===document.querySelectorAll('.orb-editor-card')[1]),true);
  assert.equal(await page.evaluate(()=>traceRoot.querySelector('input[id$="-fade-segments"]')===document.activeElement),true);
  assert.deepEqual(await share(page),reordered);
  const mutations=await page.evaluate(async()=>{
    let count=0;const observer=new MutationObserver(records=>{count+=records.length;});
    for(const el of document.querySelectorAll('[id$="-fade-segments"],#rngFadeSegments,#chkClearQueueOnSourceExit'))observer.observe(el.parentElement,{subtree:true,attributes:true,characterData:true,childList:true});
    for(let i=0;i<12;i++)await new Promise(resolve=>requestAnimationFrame(resolve));observer.disconnect();return count;
  }); assert.equal(mutations,0);
  await apply(page,encode({...structuredClone(defaults),orbs:[]}));assert.equal(await bulk.isDisabled(),true);
  await apply(page,encode(current));await page.evaluate(()=>document.getElementById('btnResetPrefs').click());await frames(page);
  assert.deepEqual(await share(page),defaults);
  await apply(page,{schema:13,prefs:{orbs:[{id:'legacy',trace:{lineColorMode:'fixed'}}]}});
  const legacy=await share(page);assert.equal(legacy.audio.clearQueueOnSourceExit,false);assert.equal(legacy.orbs[0].trace.fadeSegments,0);
  for(const schema of [14,15]){await apply(page,{schema,prefs:{audio:{volume:0},orbs:[]}});assert.deepEqual(await share(page),legacy);}
  return {keyboard:true,individualAndBulk:true,mixedUncommitted:true,stableIdentityAndFocus:true,zeroOrbs:true,reset:true,legacyImport:true,reservedSchemaAtomic:true,unchangedFrameDomMutations:mutations};
}

async function canvasEvidence(page,dpr) {
  await page.goto(new URL('/probe',page.url()).href);
  return page.evaluate(async dpr=>{
    const {CONFIG}=await import('/src/js/core/config.js');
    const {preferences,runtime,resolveSettings}=await import('/src/js/core/preferences.js');
    const {state,setCamera}=await import('/src/js/core/state.js');
    const {Orb}=await import('/src/js/render/orb.js');
    const {Renderer}=await import('/src/js/render/renderer.js');
    const {Renderer:Baseline}=await import('/baseline-renderer.js');
    const {Renderer:ReferenceF}=await import('/f-renderer.js');
    Object.assign(preferences,structuredClone(CONFIG.defaults));resolveSettings();
    state.canvas=document.querySelector('canvas');state.canvas.style.width='1000px';state.canvas.style.height='800px';
    state.canvas.width=state.widthPx=1000*dpr;state.canvas.height=state.heightPx=800*dpr;state.dpr=dpr;
    state.ctx=state.canvas.getContext('2d',{willReadFrequently:true});
    runtime.settings.visuals.particleColor='#f5c16b';
    const methods=['stroke','clip','createLinearGradient','beginPath','moveTo','lineTo'];let counts={};
    for(const key of methods){const native=state.ctx[key].bind(state.ctx);state.ctx[key]=(...args)=>{counts[key]=(counts[key]||0)+1;return native(...args);};}
    const shapes={
      partial:[[-100,0],[0,0],[100,0]],
      right:[[-350,120],[-250,120],[-150,120],[-50,120],[50,120],[150,120],[150,20],[250,20]],
      sharp:[[-240,0],[-120,0],[-220,20],[-100,100],[0,0],[100,0]],
      reversal:[[-240,0],[-100,0],[-240,0],[-100,0],[40,0],[40,100]],
      gap:[[-250,0],[-150,0],[NaN,NaN],[-50,60],[50,60],[150,60]],
      overlap:[[-200,80],[100,-80],[100,80],[-200,-80],[-200,80],[100,-80]],
      suffix:Array.from({length:75},(_,i)=>[Math.cos(i*.15)*220,Math.sin(i*.15)*180])
    };
    const make=(points,mode='fixed',fade=0,id='probe')=>{
      const def=structuredClone(CONFIG.defaults.orbs[0]);def.id=id;
      Object.assign(def.trace,{numLines:60,lineAlpha:.35,lineWidthPx:6,lineColorMode:mode,fadeSegments:fade});
      Object.assign(def.particles,{sizeMaxPx:0,sizeMinPx:0,ttlSec:600});const orb=new Orb(def);
      // Invalid points represent retained data that cannot be projected; injection is test-only.
      for(const [x,y]of points){orb.trail.emitAt(0,0,0,{r:1,g:.2,b:.3});const p=orb.trail.particles.at(orb.trail.particles.length-1);p.xSim=x;p.ySim=y;}
      return orb;
    };
    const draw=(renderer,orbs,reference=false)=>{
      counts={};renderer.clearFrame();for(const orb of orbs)renderer.drawOrb(reference?{...orb,trace:{...orb.trace,fadeEnabled:orb.trace.fadeSegments>0}}:orb,1,0,20);
      return {...counts};
    };
    const pixels=()=>state.ctx.getImageData(0,0,state.widthPx,state.heightPx).data;
    const assert=(condition,message)=>{if(!condition)throw Error(message);};
    let zeroCases=0,positiveCases=0;
    for(const background of ['#000000','#24384d'])for(const camera of [{x:0,y:0,zoom:1,rotationRad:0},{x:31,y:-27,zoom:1.3,rotationRad:.37}]) {
      runtime.settings.visuals.backgroundColor=background;setCamera(camera);
      for(const [name,points]of Object.entries(shapes))for(const mode of ['fixed','lastParticle','dominantBand']){
        const orb=make(points,mode);const history=[...orb.trail.particles].map(p=>[p.xSim,p.ySim,p.bornSec]);
        try{
          const acceptedCounts=draw(Baseline,[orb]),accepted=pixels();const currentCounts=draw(Renderer,[orb]),current=pixels();
          assert(JSON.stringify(acceptedCounts)===JSON.stringify(currentCounts),'Fade 0 draw counts differ: '+name);
          assert(accepted.every((value,i)=>value===current[i]),'Fade 0 pixels differ: '+name);zeroCases++;
          for(const fade of [1,5,10,20]){
            orb.trace.fadeSegments=fade;const expectedCounts=draw(ReferenceF,[orb],true),expected=pixels();
            const actualCounts=draw(Renderer,[orb]),actual=pixels();
            assert(JSON.stringify(expectedCounts)===JSON.stringify(actualCounts),'F join counts differ: '+name+'/'+fade);
            assert(expected.every((value,i)=>value===actual[i]),'F join pixels differ: '+name+'/'+fade);
            positiveCases++;
          }
          assert(history.every((p,i)=>p.every((value,j)=>Object.is(value,[...orb.trail.particles][i][['xSim','ySim','bornSec'][j]]))),'Renderer mutated history');
        }finally{orb.trail.dispose();}
      }
    }
    const defaultScenes=[];
    runtime.settings.visuals.backgroundColor=CONFIG.defaults.visuals.backgroundColor;
    runtime.settings.visuals.particleColor=CONFIG.defaults.visuals.particleColor;setCamera(CONFIG.defaults.sceneCamera);
    for(const mature of [false,true]){
      const orbs=CONFIG.defaults.orbs.map(def=>new Orb(structuredClone(def)));
      for(let i=0;i<orbs.length;i++){
        const orb=orbs[i],n=mature?Math.floor(orb.particles.emitPerSecond*orb.particles.ttlSec):12;
        for(let j=0;j<n;j++)orb.trail.emitAt(Math.cos(j*.03+i)*200,Math.sin(j*.03+i)*180,1-orb.particles.ttlSec*(1-j/n)*.999,{r:1,g:.2,b:.3});
      }
      try{
        const acceptedCounts=draw(Baseline,orbs),accepted=pixels();
        if(mature)window.fadeZeroReference=state.canvas.toDataURL('image/png');
        const currentCounts=draw(Renderer,orbs),current=pixels();
        if(mature)window.fadeZeroCurrent=state.canvas.toDataURL('image/png');
        assert(JSON.stringify(acceptedCounts)===JSON.stringify(currentCounts),'Factory draw counts differ');
        assert(accepted.every((value,i)=>value===current[i]),'Factory pixels differ');
        defaultScenes.push({mature,retained:orbs.reduce((n,o)=>n+o.trail.particles.length,0),calls:currentCounts,pixelDifferences:0});
      }finally{for(const orb of orbs)orb.trail.dispose();}
    }
    runtime.settings.visuals.particleColor='#f5c16b';
    // Existing F 90-degree inside-turn pixel, retained under the numeric contract.
    runtime.settings.visuals.backgroundColor='#24384d';setCamera({x:0,y:0,zoom:1,rotationRad:0});
    const seam=make(shapes.right,'fixed',5);draw(Renderer,[seam]);
    const sample=(x,y)=>[...state.ctx.getImageData(x*dpr,y*dpr,1,1).data];
    const boundary={background:sample(10,10),solid:sample(620,340),inside:sample(618,306),outside:sample(622,302)};
    assert(JSON.stringify(boundary.solid)===JSON.stringify(boundary.inside),'Faded-solid seam accumulated alpha');
    assert(JSON.stringify(boundary.outside)!==JSON.stringify(boundary.background),'Faded-solid seam left gap');seam.trail.dispose();
    // Full ordinary Scene and configured Orb-count limit. Rendering never retires history.
    const multiple=[];
    for(const [count,points,fade]of [[2,75,0],[16,1001,20],[CONFIG.limits.orbs.maxCount,2,20]]){
      const orbs=Array.from({length:count},(_,i)=>make(Array.from({length:points},(_,j)=>[Math.cos(j*.1+i*.01)*200,Math.sin(j*.1+i*.01)*180]),'fixed',fade,'limit-'+i));
      for(const orb of orbs)orb.trace.numLines=Math.min(CONFIG.limits.trace.numLines.max,Math.max(CONFIG.limits.trace.numLines.min,points-1));
      try{const calls=draw(Renderer,orbs);assert(calls.stroke===count*(Math.min(fade,points-1)+(points-1>fade?1:0)),'Multi-Orb stroke count');
        assert(orbs.every(o=>o.trail.particles.length===points),'Multi-Orb history changed');multiple.push({orbs:count,points,fade,calls});
      }finally{for(const orb of orbs)orb.trail.dispose();}
    }
    // Leave a reviewable native canvas with the four positive values.
    const gallery=[1,5,10,20].map((fade,i)=>make(Array.from({length:61},(_,j)=>[Math.cos(j*.08)*120-300+i*200,Math.sin(j*.08)*120]),'fixed',fade,'gallery-'+i));
    draw(Renderer,gallery);for(const orb of gallery)orb.trail.dispose();
    return {dpr,zeroCases,positiveCases,pixelDifferences:0,zeroReference:'accepted 116E renderer',positiveReference:'116F single-color join handling, constrained here to 1/5/10/20',defaultScenes,boundary,multiple};
  },dpr);
}
(async () => {
  fs.mkdirSync(work, { recursive: true });
  const { CONFIG } = await import('../src/js/core/config.js');
  const { encodePresetPayload } = await import('../src/js/presets/preset-codec.js');
  const acceptedSource = execFileSync('git', ['show', baseline + ':src/js/render/renderer.js'], { cwd: root, encoding: 'utf8' }).replaceAll('"../core/', '"/src/js/core/').replaceAll('"./color-policy.js"', '"/src/js/render/color-policy.js"');
  const refSource = file => execFileSync('git',['show','2b53501fe09a9a87688c02487f7e5849f866a51d:'+file],{cwd:root,encoding:'utf8'}).replaceAll('"../core/','"/src/js/core/').replaceAll('"./color-policy.js"','"/src/js/render/color-policy.js"').replaceAll('"./trace-segments.js"','"/f-trace.js"');
  const fRenderer=refSource('src/js/render/renderer.js'),fTrace=refSource('src/js/render/trace-segments.js');
  const server = http.createServer((req, res) => {
    try {
      const pathname = new URL(req.url, 'http://local').pathname;
      if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (pathname === '/baseline-renderer.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(acceptedSource); }
      if (pathname === '/f-renderer.js' || pathname === '/f-trace.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(pathname === '/f-renderer.js' ? fRenderer : fTrace); }
      if (pathname === '/probe') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><meta charset="utf-8"><title>116 candidate Canvas evidence</title><style>body{margin:0;background:#24384d}canvas{display:block}</style><canvas></canvas>'); }
      if (pathname === '/source') { res.setHeader('Content-Type', 'text/html'); return res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8').replaceAll('__AURALPRINT_VERSION__', version).replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>').replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>')); }
      const file = path.resolve(root, '.' + pathname); if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw Error('Missing');
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
    } catch { res.writeHead(404); res.end(); }
  });
  const report = { version, baseline, browser: '', platform: process.platform, editions: [], canvas: null, screenshots: [], errors: [] };
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }); report.browser = browser.version();
    const dprs = (process.env.AP_DPRS || '1,2').split(',').map(Number);
    const editions = [['source', '/source'], ['portable', '/dist/auralprint_' + version.slice(1) + '.html'], ['hosted', '/dist/hosted/index.html']].filter(([name]) => !process.env.AP_116_EDITIONS || process.env.AP_116_EDITIONS.split(',').includes(name));
    for (const dpr of process.argv.includes('--canvas-only') ? [] : dprs) for (const [edition, url] of editions) {
      console.error('116 candidate controls:', edition, 'DPR', dpr);
      const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: dpr });
      await captureProbe(page);
      page.on('pageerror', error => report.errors.push(edition + ': ' + error.message)); page.on('console', message => { if (message.type() === 'error') report.errors.push(edition + ': ' + message.text()); });
      page.on('response', response => { if (response.status() >= 400) report.errors.push(edition + ': HTTP ' + response.status() + ' ' + response.url()); });
      await page.goto(base + url); await page.waitForFunction(() => document.querySelector('input[id$="-fade-segments"]'));
      const controlsResult = await controls(page, CONFIG.defaults, encodePresetPayload, edition);
      const queue = dpr === 1 ? await queueControls(page, CONFIG.defaults, encodePresetPayload) : null;
      report.editions.push({ edition, dpr, ...controlsResult, queue }); await page.close();
    }
    if (!process.argv.includes('--controls-only')) {
      report.canvas=[];
      for(const dpr of dprs){
        const page=await browser.newPage({viewport:{width:1000,height:800},deviceScaleFactor:dpr});await page.goto(base+'/probe');
        page.on('pageerror',error=>report.errors.push(error.message));
        console.error('116 candidate native Canvas: DPR',dpr);
        report.canvas.push(await canvasEvidence(page,dpr));
        for(const [label,key]of [['reference','fadeZeroReference'],['current','fadeZeroCurrent']]){
          const data=await page.evaluate(key=>window[key],key),file=path.join(work,'fade0-'+label+'-dpr'+dpr+'.png');
          fs.writeFileSync(file,Buffer.from(data.split(',')[1],'base64'));report.screenshots.push(file);
        }
        const file=path.join(work,'trace-fades-dpr'+dpr+'.png');await page.screenshot({path:file});report.screenshots.push(file);await page.close();
      }
    }
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fs.writeFileSync(process.env.AP_REPORT || path.join(work, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
    if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
