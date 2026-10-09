/* F.6 actual portable/hosted HTML bytes; no bundle instrumentation.
 * Native API wrappers forward unchanged except one explicitly held resume.
 * Run after build: node .../distribution.cjs --output fresh-results.json
 */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../../../../..');
const portable = path.join(root, 'dist/auralprint_0.1.15m.i.f.html');
function wav(hz) {
  const n = 44100 * 8, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(44100, 24); b.writeUInt32LE(176400, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) b.writeInt16LE(Math.round(5000 * Math.sin(2 * Math.PI * hz * (c + 1) * i / 44100)), 44 + i * 4 + c * 2);
  return b;
}
function observe() {
  const p = window.__probe = { media: [], contexts: [], urls: [], nodes: [], errors: [], held: null, holdNext: false };
  const create = document.createElement.bind(document);
  document.createElement = function (tag, ...args) {
    const e = create(tag, ...args);
    if (tag.toLowerCase() === 'audio') {
      e.__signals = []; p.media.push(e); const listen = e.addEventListener.bind(e);
      e.addEventListener = function (type, cb, options) { if (options?.signal) e.__signals.push(options.signal); return listen(type, cb, options); };
    } return e;
  };
  const make = URL.createObjectURL.bind(URL), release = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = make(blob); p.urls.push({ type: 'create', url, name: blob.name }); return url; };
  URL.revokeObjectURL = url => { p.urls.push({ type: 'revoke', url }); return release(url); };
  const Native = AudioContext;
  window.AudioContext = class extends Native {
    constructor(...args) { super(...args); p.contexts.push(this); }
    resume() {
      if (p.holdNext) { p.holdNext = false; return new Promise((resolve, reject) => { p.held = () => Native.prototype.resume.call(this).then(resolve, reject); }); }
      return Native.prototype.resume.call(this);
    }
    createMediaElementSource(e) { const node = super.createMediaElementSource(e); p.nodes.push({ node, media: p.media.indexOf(e), disconnect: 0 }); return node; }
  };
  const disconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.disconnect = function (...args) { const n = p.nodes.find(n => n.node === this); if (n) n.disconnect++; return disconnect.apply(this, args); };
  window.addEventListener('unhandledrejection', e => p.errors.push(e.reason?.message || String(e.reason)));
}
async function main() {
  const requests = [], server = http.createServer((req, res) => {
    let name = new URL(req.url, 'http://localhost').pathname;
    const file = name === '/portable.html' ? portable : path.join(root, 'dist/hosted', (name = name.replace(/^\/apps\/auralprint\//, '/')) === '/' ? 'index.html' : name);
    const exists = file.startsWith(path.join(root, 'dist')) && fs.existsSync(file) && fs.statSync(file).isFile();
    requests.push({ path: req.url, status: exists ? 200 : 404 });
    if (!exists) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const result = { phase: 'F.6', applicationSha: '158a782c4af0466bd09a9c11dc9f3db0dd6f780d', browser: await browser.version(),
    portableSha256: crypto.createHash('sha256').update(fs.readFileSync(portable)).digest('hex'), cases: [] };
  const click = (p, id) => p.evaluate(id => document.getElementById(id).click(), id);
  const files = ['A.wav', 'B.wav'].map((name, i) => ({ name, mimeType: 'audio/wav', buffer: wav(i ? 660 : 440) }));
  try {
    for (const url of ['/portable.html', '/', '/apps/auralprint/']) {
      const p = await browser.newPage(); p.setDefaultTimeout(12000); const exceptions = [], consoleErrors = [];
      p.on('pageerror', e => exceptions.push(e.message)); p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      try {
        await p.addInitScript(observe); await p.goto(base + url);
        await p.locator('#fileInput').setInputFiles(files);
        await p.waitForFunction(() => __probe.media[0]?.currentTime > 0.15 && !__probe.media[0].paused);
        await p.evaluate(async () => { await __probe.contexts[0].suspend(); __probe.holdNext = true; });
        await p.evaluate(() => document.querySelectorAll('#queueList .queue-item')[0].click());
        await p.waitForFunction(() => !!__probe.held);
        const pending = await p.evaluate(() => ({ mediaCount: __probe.media.length, status: document.getElementById('audioStatus').textContent }));
        assert.equal(pending.mediaCount, 1, 'initial resume pending; no candidate allocation');
        await p.evaluate(() => document.querySelectorAll('#queueList .q-remove')[0].click());
        await p.waitForFunction(() => __probe.media[1]?.currentTime > 0.15 && !__probe.media[1].paused && /B.wav/.test(document.getElementById('audioStatus').textContent));
        await p.evaluate(() => __probe.held());
        const winning = await p.evaluate(() => ({ mediaCount: __probe.media.length, bSrc: __probe.media[1].src,
          bUrl: __probe.urls.find(x => x.type === 'create' && x.name === 'B.wav').url,
          aReleased: __probe.media[0].getAttribute('src') === null, queueLength: document.querySelectorAll('#queueList .queue-item').length,
          status: document.getElementById('audioStatus').textContent }));
        assert.equal(winning.mediaCount, 2); assert.equal(winning.bSrc, winning.bUrl); assert.equal(winning.aReleased, true); assert.equal(winning.queueLength, 1);
        await click(p, 'btnClearQueue');
        await p.locator('#fileInput').setInputFiles({ name: 'corrupt.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid audio fixture') });
        await p.waitForFunction(() => /unsupported|unreadable|failed/i.test(document.getElementById('audioStatus').textContent));
        const terminal = await p.evaluate(() => {
          const el = __probe.media.at(-1), url = __probe.urls.find(x => x.type === 'create' && x.name === 'corrupt.wav').url;
          return { src: el.getAttribute('src'), paused: el.paused, aborted: el.__signals.every(s => s.aborted),
            revoked: __probe.urls.some(x => x.type === 'revoke' && x.url === url), sourceDisconnected: __probe.nodes.filter(n => n.media === __probe.media.length - 1).every(n => n.disconnect === 1),
            status: document.getElementById('audioStatus').textContent, errors: [...__probe.errors] };
        });
        assert.equal(terminal.src, null); assert.equal(terminal.paused, true); assert.equal(terminal.aborted, true); assert.equal(terminal.revoked, true); assert.equal(terminal.sourceDisconnected, true); assert.deepEqual(terminal.errors, []);
        await click(p, 'btnClearQueue'); await p.locator('#fileInput').setInputFiles(files[0]);
        await p.waitForFunction(() => __probe.media.at(-1)?.currentTime > 0.15 && !__probe.media.at(-1).paused && /Loaded: A.wav/.test(document.getElementById('audioStatus').textContent));
        const assets = await p.evaluate(async () => {
          const checked = [];
          for (const l of document.querySelectorAll('link[href]')) {
            const response = await fetch(l.href); checked.push({ url: l.href, status: response.status });
            if (l.href.endsWith('.webmanifest')) {
              const m = await response.json();
              for (const target of [m.start_url, ...m.icons.map(x => x.src)]) { const u = new URL(target, l.href).href; checked.push({ url: u, status: (await fetch(u)).status }); }
            }
          } return checked;
        });
        assert.ok(assets.every(a => a.status === 200)); assert.deepEqual(exceptions, []); assert.deepEqual(consoleErrors, []);
        result.cases.push({ path: url, passed: true, unchangedHtmlBytes: true, fault: 'One initial native resume held during real selected-row removal', pending, winning, terminal, assets, exceptions, consoleErrors });
      } catch (e) { result.cases.push({ path: url, passed: false, assertion: { message: e.message, actual: e.actual, expected: e.expected, code: e.code }, exceptions, consoleErrors }); }
      finally { await p.close(); }
    }
  } finally {
    result.requests = requests; result.summary = { cases: result.cases.length, passed: result.cases.filter(c => c.passed).length, failed: result.cases.filter(c => !c.passed).length };
    const args = process.argv.slice(2), i = args.indexOf('--output'); if (i >= 0) fs.writeFileSync(args[i + 1], JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result.summary)); await browser.close(); await new Promise(resolve => server.close(resolve)); process.exitCode = result.summary.failed ? 1 : 0;
  }
}
main().catch(error => { console.error(error); process.exitCode = 2; });
