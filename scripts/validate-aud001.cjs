// AUD-001 native UI regression. Run after build with external Playwright/Chromium.
// AP_PLAYWRIGHT_MODULE, AP_CHROMIUM_PATH, AP_REPORT select tooling/output.
// AP_EXPECT_BASELINE=1 asserts the original dead-input/blocked-retry defect.
// HTTP-only instrumentation exposes existing module references, without changing
// lifecycle logic; generated files on disk are never edited.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const baseline = process.env.AP_EXPECT_BASELINE === '1';
const expose = 'window.aud001App = { state, AudioEngine, InputSourceManager, RecorderEngine };';
const instrument = js => {
  assert.ok(js.endsWith('  main();\n})();\n'), 'expected unminified build entry');
  return js.replace(/  main\(\);\n\}\)\(\);\n$/, `  ${expose}\n  main();\n})();\n`);
};

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (pathname === '/source') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8')
        .replaceAll('__AURALPRINT_VERSION__', version)
        .replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>')
        .replace('<!-- AURALPRINT_INLINE_JS -->', `<script type="module">
          import {state} from '/src/js/core/state.js';
          import {AudioEngine} from '/src/js/audio/audio-engine.js';
          import {InputSourceManager} from '/src/js/audio/input-source-manager.js';
          import {RecorderEngine} from '/src/js/recording/recorder-engine.js';
          ${expose}
          await import('/src/js/main.js');</script>`));
    }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    let body = fs.readFileSync(file);
    if (file.endsWith('.html')) body = body.toString().replace(/<script>([\s\S]*?)<\/script>/g, (all, js) => js.includes('  main();\n})();') ? '<script>' + instrument(js.trimStart()) + '</script>' : all);
    if (file.endsWith('.js') && pathname.startsWith('/dist/')) body = instrument(body.toString());
    res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const report = { version, baseline, syntheticNativeStreams: true, cases: [], errors: [], failedResources: [] };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    report.browser = browser.version();
    async function open(edition, kind, phase) {
      const page = await browser.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', e => report.errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      page.on('response', r => { if (r.status() >= 400) report.failedResources.push(r.url()); });
      page.on('requestfailed', r => report.failedResources.push(r.url() + ': ' + r.failure()?.errorText));
      const url = base + (edition === 'source' ? '/source' : edition === 'portable' ? `/dist/auralprint_${version.slice(1)}.html` : '/dist/hosted/index.html');
      await page.goto(url); await page.waitForFunction(() => !!window.aud001App && document.querySelector('#btnPlay')?.textContent === 'Play');
      await page.evaluate(async ({kind, phase}) => {
        const p = window.aud001 = { kind, phase, calls: {mic:0, stream:0}, results: [], graphs: [], streams: [], callbacks: [] };
        const defer = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
        p.capture = defer(); p.resume = defer();
        const NativeContext = AudioContext;
        p.generator = new NativeContext(); await p.generator.resume();
        const oscillator = p.generator.createOscillator(); oscillator.frequency.value = 440; oscillator.start();
        p.make = sourceKind => {
          const dest = p.generator.createMediaStreamDestination(); oscillator.connect(dest);
          const tracks = dest.stream.getAudioTracks();
          if (sourceKind === 'stream') tracks.push(document.createElement('canvas').captureStream().getVideoTracks()[0]);
          const stream = new MediaStream(tracks); p.streams.push(stream);
          for (const target of [stream, ...stream.getTracks()]) {
            const add = target.addEventListener.bind(target);
            target.addEventListener = (type, callback, ...args) => { if (type === 'ended' || type === 'inactive') p.callbacks.push(callback); return add(type, callback, ...args); };
          }
          return stream;
        };
        p.first = p.make(kind);
        p.end = async (signal = true) => {
          // Drain native inactivity before releasing acquisition/attachment.
          // Stream video may deliberately keep the stream itself active.
          const inactive = p.first.active && !p.first.getVideoTracks().some(t => t.readyState === 'live')
            ? new Promise(resolve => p.first.addEventListener('inactive', resolve, {once:true})) : Promise.resolve();
          p.first.getAudioTracks().forEach(track => { track.stop(); if (signal) track.dispatchEvent(new Event('ended')); });
          await inactive;
        };
        for (const [sourceKind, api] of [['mic','getUserMedia'], ['stream','getDisplayMedia']]) navigator.mediaDevices[api] = () => {
          p.calls[sourceKind]++;
          if (sourceKind === kind && p.calls[sourceKind] === 1) return phase === 'capture' ? p.capture.promise : Promise.resolve(p.first);
          return Promise.resolve(p.make(sourceKind));
        };
        window.AudioContext = class extends NativeContext {
          constructor(...args) { super(...args); this.held = ['resume','inactive','race','reject'].includes(phase); }
          get state() { return this.held ? 'suspended' : super.state; }
          async resume() {
            if (this.held) { this.held = false; p.entered = true; await p.resume.promise; }
            return super.resume();
          }
          createMediaStreamSource(stream) {
            const source = super.createMediaStreamSource(stream), disconnect = source.disconnect.bind(source);
            const graph = {stream, disconnects:0}; p.graphs.push(graph);
            source.disconnect = (...args) => { graph.disconnects++; return disconnect(...args); };
            return source;
          }
        };
        const { AudioEngine: engine, InputSourceManager: manager } = aud001App;
        const attach = engine.attachMediaStreamSource;
        engine.attachMediaStreamSource = async (...args) => {
          const result = await attach(...args);
          if (phase === 'registration' && args[0] === p.first) await p.end();
          return result;
        };
        for (const method of ['activateMic','activateStream']) {
          const original = manager[method];
          manager[method] = async (...args) => { const result = await original(...args); p.results.push(result); return result; };
        }
        p.snapshot = () => ({ source: structuredClone(aud001App.state.source), audio: { filename: aud001App.state.audio.filename, isLoaded: aud001App.state.audio.isLoaded },
          calls: {...p.calls}, ready: engine.sample().ready, rms: engine.sample().rmsL,
          tracks: p.first.getTracks().map(t => t.readyState), graphs: p.graphs.map(g => ({first:g.stream===p.first,disconnects:g.disconnects})),
          upstream: p.streams.indexOf(engine.getRecorderTap().ensureStream()),
          status: document.querySelector('#audioStatus').textContent });
      }, {kind, phase});
      return page;
    }
    const button = kind => kind === 'mic' ? '#btnSourceMic' : '#btnSourceStream';
    const snapshot = page => page.evaluate(() => aud001.snapshot());
    for (const edition of ['source','portable','hosted']) for (const kind of ['mic','stream']) {
      for (const phase of baseline ? ['capture','registration'] : ['capture','resume','registration','inactive','normal']) {
        const page = await open(edition, kind, phase);
        try {
          await page.locator(button(kind)).click();
          if (phase === 'capture') {
            await page.waitForFunction(kind => aud001.calls[kind] === 1, kind);
            await page.evaluate(async () => { await aud001.end(); aud001.capture.resolve(aud001.first); });
          } else if (phase === 'resume' || phase === 'inactive') {
            await page.waitForFunction(() => aud001.entered);
            await page.evaluate(phase => {
              if (phase === 'inactive') aud001.first.dispatchEvent(new Event('inactive'));
              else aud001.end(false);
              aud001.resume.resolve();
            }, phase);
          }
          await page.waitForFunction(() => aud001.results.length === 1);
          if (phase === 'normal') {
            await page.waitForFunction(() => aud001App.AudioEngine.sample().rmsL > 0.01);
            assert.equal((await snapshot(page)).source.sessionActive, true);
            await page.evaluate(() => aud001.end());
          }
          const before = await snapshot(page);
          if (baseline) {
            assert.equal(before.source.status, 'active'); assert.equal(before.source.sessionActive, true);
            assert.equal(before.tracks[0], 'ended');
          } else {
            assert.equal(before.source.kind, 'none'); assert.equal(before.source.status, 'idle'); assert.equal(before.source.sessionActive, false);
            assert.equal(before.source.errorCode, `${kind}-ended`); assert.equal(before.source.permission[kind], 'granted');
            assert.equal(before.ready, false); assert.ok(before.tracks.every(s => s === 'ended'));
            assert.ok(before.graphs.every(g => g.disconnects > 0));
          }
          await page.locator(button(kind)).click();
          // A frame barrier observes the actual click handler without delay guesses.
          await page.evaluate(() => new Promise(requestAnimationFrame));
          if (!baseline) await page.waitForFunction(() => aud001.results.length === 2);
          const retry = await snapshot(page);
          assert.equal(retry.calls[kind], baseline ? 1 : 2);
          if (!baseline) {
            assert.equal(retry.source.status, 'active'); assert.equal(retry.source.sessionActive, true); assert.equal(retry.upstream, 1);
            await page.waitForFunction(() => aud001App.AudioEngine.sample().rmsL > 0.01);
          }
          report.cases.push({edition,kind,phase,before,retry,passed:true});
        } finally { await page.close(); }
      }
      if (baseline) continue;
      for (const winner of [kind === 'mic' ? 'stream' : 'mic', 'file', 'clear']) for (const reject of [false,true]) {
        const page = await open(edition, kind, reject ? 'reject' : 'race');
        try {
          await page.locator(button(kind)).click(); await page.waitForFunction(() => aud001.entered);
          if (winner === 'file') {
            const wav = Buffer.alloc(44 + 48000 * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8);
            wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(48000,24);
            wav.writeUInt32LE(96000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
            await page.locator('#fileInput').setInputFiles({name:'aud001.wav',mimeType:'audio/wav',buffer:wav});
            await page.waitForFunction(() => aud001App.state.source.kind === 'file' && aud001App.state.source.status === 'active');
          } else if (winner === 'clear') {
            await page.evaluate(() => aud001App.InputSourceManager.teardownActiveSource({reason:'aud001-clear'}));
          } else {
            await page.locator(button(winner)).click(); await page.waitForFunction(() => aud001.results.length === 1);
          }
          const before = await snapshot(page);
          await page.evaluate(reject => {
            aud001.end(); aud001.callbacks.forEach(callback => callback());
            if (reject) aud001.resume.reject(new Error('obsolete resume failure')); else aud001.resume.resolve();
          }, reject);
          await page.waitForFunction(winner => aud001.results.length === (winner === 'file' || winner === 'clear' ? 1 : 2), winner);
          const after = await snapshot(page);
          assert.deepEqual(after.source,before.source); assert.deepEqual(after.audio,before.audio); assert.equal(after.upstream,before.upstream);
          assert.equal(after.ready,before.ready); assert.ok(after.tracks.every(s => s === 'ended'));
          assert.ok(after.graphs.every(g => !g.first && g.disconnects === 0));
          report.cases.push({edition,kind,winner,reject,before,after,passed:true});
        } finally { await page.close(); }
      }
    }
    assert.deepEqual(report.errors,[]); assert.deepEqual(report.failedResources,[]);
  } finally {
    if (process.env.AP_REPORT) { fs.mkdirSync(path.dirname(process.env.AP_REPORT),{recursive:true}); fs.writeFileSync(process.env.AP_REPORT,JSON.stringify(report,null,2)+'\n'); }
    console.log(JSON.stringify({browser:report.browser,baseline,cases:report.cases.length,errors:report.errors,failedResources:report.failedResources}));
    if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode=1; });
