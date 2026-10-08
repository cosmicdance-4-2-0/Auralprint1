// Optional native Chromium evidence. No project dependency on Playwright.
// Run after build. RC20_PLAYWRIGHT_MODULE / RC20_CHROMIUM_PATH select external tools.
// RC20_REPORT selects a JSON evidence file (default prints to stdout).
const { chromium } = require(process.env.RC20_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const portable = path.join(root, 'dist', `auralprint_${version.slice(1)}.html`);
const hosted = path.join(root, 'dist/hosted');
const mime = { '.html': 'text/html', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function wav() {
  const rate = 44100, frames = rate * 12, bytes = frames * 4, b = Buffer.alloc(44 + bytes);
  b.write('RIFF'); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < frames; i++) {
    b.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 4);
    b.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 880 * i / rate)), 46 + i * 4);
  }
  return b;
}

async function audioControls(page) {
  await page.waitForFunction(() => document.querySelector('#c').width > 0 && document.querySelector('#btnPlay').disabled);
  const image = () => page.locator('#c').evaluate(c => c.toDataURL());
  const before = await image();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#btnLoad').click();
  await (await chooser).setFiles({ name: 'rc20-stereo.wav', mimeType: 'audio/wav', buffer: wav() });
  await page.waitForFunction(() => document.querySelector('#btnPlay').textContent === 'Pause' && !document.querySelector('#btnPlay').disabled);
  await page.waitForFunction(() => /0:0[1-9]/.test(document.querySelector('#scrubberTime').textContent));
  const time = await page.locator('#scrubberTime').textContent();
  assert.notEqual(await image(), before, 'Visualizer canvas must change after audio load');
  const pixels = await page.locator('#c').evaluate(c => {
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 30) colored++;
    return { width: c.width, height: c.height, colored };
  });
  assert.ok(pixels.colored > 100, 'Canvas must contain rendered visualizers');
  await page.locator('#btnPlay').click();
  await page.waitForFunction(() => document.querySelector('#btnPlay').textContent === 'Play');
  await page.locator('#btnPlay').click();
  await page.waitForFunction(() => document.querySelector('#btnPlay').textContent === 'Pause');
  await page.locator('#c').focus(); await page.keyboard.press('Space'); await page.keyboard.press('Space');
  await page.locator('#btnStop').click();
  await page.waitForFunction(() => document.querySelector('#btnPlay').textContent === 'Play');
  return { stereoWavLoaded: true, playbackAndScrubber: time, visualizers: pixels, pauseResumeStop: true, spaceShortcutActivated: true };
}

(async () => {
  const serverRequests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost').pathname;
    const prefix = '/apps/auralprint/';
    let file;
    if (url === '/portable.html') file = portable;
    else {
      const relative = url.startsWith(prefix) ? url.slice(prefix.length) : url.slice(1);
      file = path.resolve(hosted, relative || 'index.html');
    }
    const permitted = file === portable || file.startsWith(hosted + path.sep);
    const ok = permitted && fs.existsSync(file) && fs.statSync(file).isFile();
    const type = ok ? mime[path.extname(file)] || 'application/octet-stream' : 'text/plain';
    serverRequests.push({ url, status: ok ? 200 : 404, mime: type });
    res.writeHead(ok ? 200 : 404, { 'Content-Type': type });
    res.end(ok ? fs.readFileSync(file) : 'Resource not in package');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const report = { version, modes: [], scope: 'Unmodified final artifacts; local HTTP root/subdirectory and actual file launch. No installability or hosted offline-cache claim.' };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.RC20_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    report.browser = await browser.version();
    const modes = [
      { name: 'portable-http', url: origin + '/portable.html', portable: true },
      { name: 'hosted-root', url: origin + '/index.html' },
      { name: 'hosted-subdirectory', url: origin + '/apps/auralprint/index.html' },
      { name: 'portable-file', url: pathToFileURL(portable).href, portable: true },
    ];
    for (const mode of modes) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const row = { mode: mode.name, url: mode.url, requests: [], responses: [], console: [], pageErrors: [], failedRequests: [] };
      report.modes.push(row);
      page.on('request', request => row.requests.push({ url: request.url(), type: request.resourceType() }));
      page.on('response', response => row.responses.push({ url: response.url(), status: response.status(), mime: response.headers()['content-type'] || null }));
      page.on('requestfailed', request => row.failedRequests.push({ url: request.url(), reason: request.failure().errorText }));
      page.on('pageerror', error => row.pageErrors.push(error.message));
      page.on('console', message => row.console.push({ type: message.type(), text: message.text() }));
      if (mode.name === 'portable-file') await context.setOffline(true);
      try {
        const response = await page.goto(mode.url, { waitUntil: 'networkidle' });
        row.launch = 'success'; row.entryStatus = response.status();
      } catch (error) {
        if (mode.name !== 'portable-file' || !/ERR_BLOCKED_BY_ADMINISTRATOR/.test(error.message)) throw error;
        row.launch = 'environment blocked local-file navigation (ERR_BLOCKED_BY_ADMINISTRATOR)';
        await context.close(); continue;
      }
      row.title = await page.title();
      assert.equal(row.title, `Auralprint - Waveform Analysis Tool - ${version}`);
      const links = await page.locator('head link').evaluateAll(els => els.map(e => ({ rel: e.rel, href: e.getAttribute('href'), resolved: e.href, type: e.type })));
      if (mode.portable) {
        assert.equal(links.length, 1); assert.ok(links[0].href.startsWith('data:image/svg+xml;base64,'));
        row.embeddedFavicon = await page.evaluate(async href => { const i = new Image(); i.src = href; await i.decode(); return { width: i.naturalWidth, height: i.naturalHeight, mime: 'image/svg+xml', decoded: true }; }, links[0].href);
        assert.ok(row.embeddedFavicon.width > 0);
      } else {
        row.linkProbes = [];
        for (const link of links) {
          assert.ok(link.href.startsWith('./'));
          const result = await page.evaluate(async link => {
            const response = await fetch(link.resolved);
            const result = { ...link, status: response.status, mime: response.headers.get('content-type') };
            if (link.rel === 'manifest') result.manifest = await response.json();
            else { const image = new Image(); image.src = link.resolved; await image.decode(); result.dimensions = [image.naturalWidth, image.naturalHeight]; }
            return result;
          }, link);
          assert.equal(result.status, 200);
          assert.equal(result.mime, mime[path.extname(new URL(result.resolved).pathname)]);
          row.linkProbes.push(result);
        }
        const declared = row.linkProbes.find(link => link.rel === 'manifest');
        const packageUrl = new URL('./', mode.url).href;
        row.manifestResolution = { url: declared.resolved, startUrl: new URL(declared.manifest.start_url, declared.resolved).href,
          scope: new URL(declared.manifest.scope, declared.resolved).href, icons: [] };
        assert.equal(row.manifestResolution.startUrl, packageUrl + 'index.html');
        assert.equal(row.manifestResolution.scope, packageUrl);
        for (const icon of declared.manifest.icons) {
          const url = new URL(icon.src, declared.resolved).href;
          assert.ok(url.startsWith(packageUrl));
          const result = await page.evaluate(async url => { const r = await fetch(url); const i = new Image(); i.src = url; await i.decode(); return { url, status: r.status, mime: r.headers.get('content-type'), dimensions: [i.naturalWidth, i.naturalHeight] }; }, url);
          assert.equal(result.status, 200); assert.equal(result.mime, icon.type); assert.equal(result.dimensions.join('x'), icon.sizes);
          row.manifestResolution.icons.push(result);
        }
        const cdp = await context.newCDPSession(page);
        row.chromiumManifest = await cdp.send('Page.getAppManifest');
        assert.equal(row.chromiumManifest.url, declared.resolved);
        assert.deepEqual(row.chromiumManifest.errors, []);
        await cdp.detach();
      }
      row.application = await audioControls(page);
      assert.deepEqual(row.pageErrors, []); assert.deepEqual(row.failedRequests, []);
      assert.ok(row.responses.every(r => r.status < 400));
      const network = row.requests.filter(r => /^https?:/.test(r.url));
      if (mode.portable) assert.deepEqual(network.map(r => r.url), mode.name === 'portable-file' ? [] : [mode.url]);
      else assert.ok(network.every(r => r.url.startsWith(new URL('./', mode.url).href)), 'Request escaped hosted deployment prefix');
      await context.close();
    }
    report.serverRequests = serverRequests;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    if (process.env.RC20_REPORT) fs.writeFileSync(process.env.RC20_REPORT, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
