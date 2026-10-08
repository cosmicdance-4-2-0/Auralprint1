const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
function stereoWav() {
  const rate = 44100, frames = rate * 2, b = Buffer.alloc(44 + frames * 4);
  b.write('RIFF'); b.writeUInt32LE(36 + frames * 4, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) { b.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 4); b.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 880 * i / rate)), 46 + i * 4); }
  return b;
}
(async () => {
  const server = http.createServer((req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (!relative) {
      const template = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.end(template.replace('__AURALPRINT_VERSION__', version).replace(/<link[^>]+>/g, '').replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>')); return;
    }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : 'text/javascript'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser; const errors = [], sourceResults = [], missingAssets = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const dpr of [1, 2]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
      await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/');
      sourceResults.push({ dpr, ...await page.evaluate(async () => { const { validateRc16Rc18 } = await import('./scripts/validate-rc16-rc18.mjs'); return validateRc16Rc18(); }) });
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) missingAssets.push({ url: r.url().replace(base, ''), status: r.status() }); });
    const response = await page.goto(`${base}/dist/auralprint_${version.slice(1)}.html`);
    assert.equal(response.status(), 200); assert.ok((await page.title()).includes(version));
    await page.waitForFunction(() => document.querySelector('#c').width > 0);
    const chooser = page.waitForEvent('filechooser'); await page.locator('#btnLoad').click();
    await (await chooser).setFiles({ name: 'rc16-stereo.wav', mimeType: 'audio/wav', buffer: stereoWav() });
    await page.waitForFunction(() => document.querySelector('#btnPlay').textContent === 'Pause');
    await page.waitForFunction(() => /0:01/.test(document.querySelector('#scrubberTime').textContent));
    await page.locator('#btnStop').click();
    const artifact = { httpStatus: response.status(), title: await page.title(), verified: ['standalone boot', 'stereo WAV decode', 'playback', 'advancing scrubber', 'stop'] };
    assert.deepEqual(errors, []);
    const report = { version, browser: await browser.version(), method: 'Native source boot with controlled AudioEngine.sample and performance clock, actual callback/UI/Space, DPR 1/2; unmodified standalone artifact playback smoke.', sourceResults, artifact, pageErrors: errors, missingAssets };
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
