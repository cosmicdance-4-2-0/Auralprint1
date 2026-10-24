// Optional native compatibility checks. Tooling stays external; run after build.
// AP_HERO_PRESET optionally supplies the owner's external schema-10 JSON. Never
// copy its contents into the repository or report. AP_REPORT saves only results.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const defaults = { x: 0, y: 0, zoom: 1, rotationRad: 0 };
const hash = payload => '#p=' + Buffer.from(JSON.stringify(payload)).toString('base64url');
const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);
const cameraNear = (a, b) => { for (const key of Object.keys(defaults)) near(a[key], b[key]); };
async function read(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  return page.evaluate(() => ({ x: Number(document.querySelector('#numCameraX').value), y: Number(document.querySelector('#numCameraY').value),
    zoom: Number(document.querySelector('#numCameraZoom').value), rotationRad: Number(document.querySelector('#numCameraRotation').value) * Math.PI / 180 }));
}
async function openCamera(page) {
  if (!await page.locator('#cameraPanel').isVisible()) await page.locator('#btnOpenCamera').click();
}
async function edit(page, key, value) { await page.locator('#numCamera' + key).fill(String(value)); await page.locator('#numCamera' + key).press('Tab'); }
async function share(page) {
  await page.evaluate(() => document.querySelector('#btnShare').click());
  return page.evaluate(() => ({ url: location.href, hash: location.hash,
    payload: JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)))) }));
}
async function settle(page, ms = 100) { await page.waitForTimeout(ms); }
async function boot(page, url) {
  await page.goto("about:blank");
  await page.goto(url); await page.waitForFunction(() => document.querySelector('#numCameraX')?.value !== ''); await openCamera(page);
}
async function observe(page, report) {
  page.setDefaultTimeout(20000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) report.failedResponses.push(r.url()); });
  await page.addInitScript(() => {
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      if (callback.name === 'onAnimationFrame' && !window.bootCamera116d) {
        window.bootCamera116d = Object.fromEntries(['X', 'Y', 'Zoom', 'Rotation'].map(key => [key, Number(document.querySelector('#numCamera' + key)?.value)]));
      }
      return raf(callback);
    };
  });
}
(async () => {
  const { CONFIG } = await import(path.join(root, 'src/js/core/config.js'));
  const { sanitizePreset } = await import(path.join(root, 'src/js/presets/preset-codec.js'));
  // Representative stress composition, explicitly distinct from owner artwork.
  const representative = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/schema-10-full.json')));
  representative.bands.count = 256;
  representative.orbs = Array.from({ length: 16 }, (_, i) => {
    const orb = structuredClone(representative.orbs[i % representative.orbs.length]);
    return { ...orb, id: `compatibility-${i}`, chanId: i < 8 ? 'L' : 'R', chirality: i < 8 ? 1 : -1,
      particles: { ...orb.particles, minPlacementDistancePx: 0, emitPerSecond: 1000, ttlSec: 600 } };
  });
  const owner = process.env.AP_HERO_PRESET ? JSON.parse(fs.readFileSync(process.env.AP_HERO_PRESET, 'utf8')) : null;
  const input = owner || { schema: 10, prefs: representative };
  assert.equal(input.schema, 10); assert.equal(input.prefs.orbs.length, 16); assert.equal(input.prefs.bands.count, 256);
  const migrated = sanitizePreset(input);
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (pathname === '/source') { res.setHeader('Content-Type', 'text/html'); return res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8').replaceAll('__AURALPRINT_VERSION__', version).replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>').replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>')); }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const report = { version, ownerArtifactAvailable: !!owner, scene: owner ? 'External owner artifact (contents excluded)' : 'Representative schema-10 16-Orb stress Scene; owner artifact unavailable', editions: [], errors: [], failedResponses: [] };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    report.browser = await browser.version();
    for (const dpr of [1, 2]) for (const edition of ['source', 'portable', 'hosted']) {
      console.error(`116D: ${edition} DPR ${dpr}`);
      const app = base + (edition === 'source' ? '/source' : edition === 'portable' ? `/dist/auralprint_${version.slice(1)}.html` : '/dist/hosted/index.html');
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: dpr }); await observe(page, report);
      let receiver;
      try {
        await boot(page, app + hash(input)); cameraNear(await read(page), defaults);
        const old = await share(page); assert.equal(old.payload.schema, 12); assert.deepEqual(old.payload.prefs, migrated);
        await edit(page, 'X', 123.456789012345); await edit(page, 'Y', -654.987654321098); await edit(page, 'Zoom', 2.345678901234); await edit(page, 'Rotation', 37.1234567890123);
        const authored = await read(page);
        const beforeCapture = await share(page); assert.deepEqual(beforeCapture.payload.prefs.sceneCamera, CONFIG.defaults.sceneCamera);
        await page.locator('#btnSaveSceneView').focus(); await page.keyboard.press('Enter');
        cameraNear(await read(page), authored);
        assert.match(await page.locator('#sceneCameraStatus').innerText(), /saved/);
        const saved = await share(page); cameraNear(saved.payload.prefs.sceneCamera, authored);
        await page.locator('#btnCameraPanRight').click(); await page.locator('#btnCameraRotateCW').click();
        assert.notDeepEqual(await read(page), authored); assert.match(await page.locator('#sceneCameraReadout').innerText(), /differs/);
        assert.deepEqual((await share(page)).payload, saved.payload);
        receiver = await browser.newPage({ viewport: { width: 700, height: 1000 }, deviceScaleFactor: dpr }); await observe(receiver, report);
        await boot(receiver, saved.url); cameraNear(await read(receiver), authored);
        const bootCamera = await receiver.evaluate(() => bootCamera116d);
        near(bootCamera.X, authored.x); near(bootCamera.Y, authored.y); near(bootCamera.Zoom, authored.zoom); near(bootCamera.Rotation * Math.PI / 180, authored.rotationRad);
        // Live controls and held input never rewrite the hash or authored view.
        await receiver.locator('#chkCameraInteraction').check(); await receiver.locator('#c').focus();
        const stableHash = await receiver.evaluate(() => location.hash);
        await receiver.keyboard.down('w'); await receiver.keyboard.down('q'); await settle(receiver, 180);
        await receiver.evaluate(() => document.querySelector('#btnRestoreSceneView').click());
        const restored = await read(receiver); cameraNear(restored, authored);
        await settle(receiver, 180); cameraNear(await read(receiver), authored);
        await receiver.keyboard.up('w'); await receiver.keyboard.up('q');
        assert.equal(await receiver.evaluate(() => location.hash), stableHash);
        await receiver.setViewportSize({ width: 1200, height: 600 });
        const cdp = await receiver.context().newCDPSession(receiver);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 600, deviceScaleFactor: dpr === 1 ? 2 : 1, mobile: false });
        await settle(receiver); cameraNear(await read(receiver), authored);
        assert.deepEqual((await share(receiver)).payload, saved.payload);
        await receiver.locator('#c').focus(); await receiver.keyboard.press('c'); cameraNear(await read(receiver), defaults);
        assert.deepEqual((await share(receiver)).payload, saved.payload);
        await receiver.locator('#btnRestoreSceneView').focus(); await receiver.keyboard.press('Space'); cameraNear(await read(receiver), authored);
        await receiver.locator('#btnFitCamera').click(); assert.deepEqual((await share(receiver)).payload, saved.payload);
        // In-session application uses the same initialization, without relying on hashchange.
        await receiver.locator('#btnApplyUrl').evaluate(e => e.click()); cameraNear(await read(receiver), authored);
        await receiver.evaluate(h => history.replaceState(null, '', location.pathname + h), hash(input));
        await receiver.locator('#btnApplyUrl').evaluate(e => e.click()); cameraNear(await read(receiver), defaults);
        await edit(receiver, 'X', 777); const preInvalid = await read(receiver), preInvalidPrefs = (await share(receiver)).payload;
        await receiver.evaluate(() => history.replaceState(null, '', location.pathname + '#p=invalid'));
        await receiver.locator('#btnApplyUrl').evaluate(e => e.click()); cameraNear(await read(receiver), preInvalid);
        assert.deepEqual((await share(receiver)).payload, preInvalidPrefs);
        // Restore the saved schema 12 a second time, including its complete Scene.
        await boot(receiver, app + saved.hash); cameraNear(await read(receiver), authored);
        assert.deepEqual((await share(receiver)).payload, saved.payload);
        await receiver.locator('#btnResetPrefs').evaluate(e => e.click()); cameraNear(await read(receiver), defaults);
        assert.deepEqual((await share(receiver)).payload.prefs.sceneCamera, CONFIG.defaults.sceneCamera);
        // Exercise a substantially larger address through native history + navigation.
        const large = structuredClone(saved.payload); large.prefs.orbs = Array.from({ length: 256 }, (_, i) => ({ ...structuredClone(large.prefs.orbs[i % 16]), id: `large-${i}` }));
        await boot(receiver, app + hash(large)); const largeResult = await share(receiver); assert.deepEqual(largeResult.payload, large); assert.ok(largeResult.hash.length > 150000);
        report.editions.push({ edition, dpr, schema10Migration: true, captureExplicit: true, startupBeforeFirstFrame: true,
          freshInstanceDifferentAspect: true, restoreStopsHeldInput: true, secondRoundTrip: true, applyAndInvalidAtomicity: true,
          factoryResetDistinct: true, resizeAndDprPreserveAuthored: true, largeUrlChars: largeResult.hash.length });
      } finally { await page.close(); if (receiver) await receiver.close(); }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResponses, []);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report, null, 2) + '\n');
    if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
