// Optional native RC-15 measurement; no budget or performance guarantee selected.
const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<canvas id="measure" width="1000" height="1000"></canvas>'); return; }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const results = await page.evaluate(async () => { const { measureReleaseResources } = await import('/scripts/measure-release-resources.mjs'); return measureReleaseResources({ nativeContext: document.querySelector('#measure').getContext('2d') }); });
    if (errors.length) throw new Error(errors.join('\n'));
    const result = { version: fs.readFileSync(path.join(root, 'version'), 'utf8').trim(), browser: await browser.version(), results, errors };
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
