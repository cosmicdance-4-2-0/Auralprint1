// Optional phase-1 browser regression; Playwright is not a project dependency.
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
(async () => {
  const { CONFIG } = await import('../src/js/core/config.js');
  const prefs = structuredClone(CONFIG.defaults);
  prefs.timing.maxDeltaTimeSec = 120;
  prefs.orbs.forEach(orb => { orb.particles.overlapRadiusPx = 10; });
  const hash = '#p=' + Buffer.from(JSON.stringify({ schema: 10, prefs })).toString('base64url');
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/favicon.ico')) { res.writeHead(204); res.end(); return; }
    res.setHeader('Content-Type','text/html'); res.end(fs.readFileSync('dist/auralprint_0.1.15m.h.q.html'));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath:process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if(msg.type() === 'error') errors.push(msg.text()); });
    page.on('request', request => requests.push(request.url()));
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(origin + '/' + hash);
    await page.waitForFunction(() => document.querySelectorAll('.orb-editor-card').length === 2);
    assert.match(await page.title(), /v0\.1\.15m\.h\.q/);
    const result = await page.evaluate(() => {
      const absent = !document.querySelector('#rngOverlap, #valOverlap, [id*="overlap"], [for*="overlap"]');
      const edit = document.querySelector('[id$="-emit-rate"]');
      edit.value = '300'; edit.dispatchEvent(new Event('input', { bubbles:true }));
      const ttl = document.querySelector('#rngTTL');
      ttl.value = '10'; ttl.dispatchEvent(new Event('input', { bubbles:true }));
      document.querySelector('#btnShare').click();
      const encoded = JSON.parse(atob(location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/')));
      return { absent, encoded, canvasWidth: document.querySelector('#c').width,
        controls: [...document.querySelectorAll('.orb-editor-card input')].map(el => el.id) };
    });
    assert.ok(result.absent);
    assert.equal(result.encoded.schema, 10);
    assert.equal(result.encoded.prefs.timing.maxDeltaTimeSec, 1/30);
    assert.deepEqual(result.encoded.prefs.orbs.map(orb => orb.particles.ttlSec), [10,10]);
    assert.deepEqual(result.encoded.prefs.orbs.map(orb => orb.particles.emitPerSecond), [300,240]);
    assert.ok(result.encoded.prefs.orbs.every(orb => !('overlapRadiusPx' in orb.particles)));
    assert.ok(result.canvasWidth > 0);
    assert.deepEqual(errors, []);
    assert.equal(requests.filter(url => !url.startsWith(origin)).length, 0);
    const report = { version:'v0.1.15m.h.q', browser:await browser.version(),
      verified:['single-file boot on localhost with external requests blocked','schema-10 obsolete overlap import','120-second timing sanitation','no overlap DOM controls/labels','per-Orb emission edit','Bulk lifetime edit','encoded schema remains 10','encoded overlap omitted','canvas initialized','no external asset requests'],
      errors, result };
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({ ...report, result:undefined },null,2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode=1; });
