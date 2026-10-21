// Optional native Chromium regression; Playwright is an environment tool only.
// Run after npm run build. AP_REPORT optionally saves the detailed result.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const hash = payload => '#p=' + Buffer.from(JSON.stringify(payload)).toString('base64url');

async function share(page) {
  return page.evaluate(() => {
    document.querySelector('#btnShare').click();
    return JSON.parse(atob(location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/')));
  });
}

async function setWorld(page, width, height) {
  await page.locator('#btnOpenScene').click();
  for (const [id, value] of [['numWorldWidth', width], ['numWorldHeight', height]]) {
    await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).press('Tab');
    assert.equal(await page.locator('#' + id).getAttribute('aria-invalid'), 'false');
    assert.equal(await page.locator('#' + id).getAttribute('step'), 'any');
  }
}

async function sourceChecks(page, base, dpr) {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto(base + '/source');
  await page.evaluate(async () => {
    const { onAnimationFrame } = await import('/src/js/main.js');
    const { state } = await import('/src/js/core/state.js');
    const { runtime, preferences, resolveSettings } = await import('/src/js/core/preferences.js');
    const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
    const { Renderer } = await import('/src/js/render/renderer.js');
    const { initOrbs } = await import('/src/js/render/orb-runtime.js');
    let now = 100000; performance.now = () => now;
    AudioEngine.sample = () => ({ ready: true, monoLike: false, bands: Object.fromEntries(['L', 'R', 'C'].map(c =>
      [c, { energy01: .4, rms: .4, timeDomain: Float32Array.of(.5) }])) });
    preferences.bands.overlay.enabled = true;
    preferences.bands.overlay.ringSpeedRadPerSec = .6;
    resolveSettings(); initOrbs(); onAnimationFrame(now); now += 100; onAnimationFrame(now);
    state.orbs[0].trail.emitAt(5000, -6000, now / 1000, { r: 1, g: 1, b: 1 });
    const snapshot = () => ({ world: { ...state.world }, ringPhase: state.bands.ringPhaseRad,
      orbs: state.orbs.map(o => ({ id: o.id, x: o.xSim, y: o.ySim, angle: o.angleRad,
        radius: o.baseRadiusUnits, displacement: o.radialDispUnits, fraction: o.trail.emitAccumulator,
        particles: [...o.trail.particles].map(p => ({ ...p })) })) });
    window.test116a = { state, runtime, preferences, Renderer, snapshot, step: () => onAnimationFrame(now),
      world: state.world, orbs: [...state.orbs], history: state.orbs.map(o => [...o.trail.particles]) };
  });
  const before = await page.evaluate(() => test116a.snapshot());
  assert.ok(before.orbs.every(o => o.particles.length > 0));
  const cdp = await page.context().newCDPSession(page), viewports = [];
  for (const [width, height, factor] of [[900, 700, dpr], [700, 900, dpr], [700, 900, dpr === 1 ? 2 : 1]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: factor, mobile: false });
    const result = await page.evaluate(() => {
      const t = test116a; t.step();
      if (t.state.world !== t.world) throw Error('resize replaced world');
      t.orbs.forEach((orb, i) => {
        if (t.state.orbs[i] !== orb) throw Error('resize replaced Orb');
        [...orb.trail.particles].forEach((p, j) => { if (p !== t.history[i][j]) throw Error('resize replaced history'); });
      });
      const tap = t.Renderer.getRecorderTap();
      if (tap.canvas !== document.querySelector('#c')) throw Error('recorder tap changed canvas');
      return { snapshot: t.snapshot(), dpr: devicePixelRatio, width: tap.widthPx, height: tap.heightPx };
    });
    assert.equal(result.dpr, factor); assert.equal(result.width, Math.floor(width * factor));
    assert.equal(result.height, Math.floor(height * factor)); assert.deepEqual(result.snapshot, before);
    viewports.push({ width, height, dpr: factor, backing: [result.width, result.height] });
  }
  await setWorld(page, 2400.5, 1600.25);
  const edited = await page.evaluate(() => {
    const t = test116a;
    if (t.state.orbs[0] !== t.orbs[0] || t.state.orbs[0].trail.particles.at(0) !== t.history[0][0]) throw Error('world UI reset history');
    if (!Object.isFrozen(t.state.world)) throw Error('world descriptor is mutable');
    return { settings: t.runtime.settings.world, preferences: t.preferences.world, state: { ...t.state.world }, snapshot: t.snapshot() };
  });
  assert.deepEqual(edited.preferences, { widthUnits: 2400.5, heightUnits: 1600.25 });
  assert.deepEqual(edited.settings, edited.preferences); assert.equal(edited.state.referenceSpanUnits, 1600.25);
  assert.deepEqual(edited.snapshot.orbs, before.orbs, 'world edit must not rewrite retained/live state');
  const input = page.locator('#numWorldWidth');
  await input.fill('0'); await input.press('Tab'); assert.equal(await input.getAttribute('aria-invalid'), 'true');
  assert.deepEqual((await share(page)).prefs.world, edited.preferences);
  await input.fill('2400.5'); await input.press('Tab');
  const payload = await share(page); assert.equal(payload.schema, 11); assert.deepEqual(payload.prefs.world, edited.preferences);
  await page.goto(base + '/source' + hash(payload));
  assert.equal(await page.locator('#numWorldWidth').inputValue(), '2400.5');
  const old = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/schema-10-full.json')));
  await page.goto(base + '/source' + hash({ schema: 10, prefs: old }));
  const migrated = await share(page);
  assert.equal(migrated.schema, 11); assert.deepEqual(migrated.prefs.world, { widthUnits: 1000, heightUnits: 1000 });
  assert.deepEqual(migrated.prefs.orbs.map(o => o.particles.minPlacementDistanceUnits), [0, .5, 2.3]);
  assert.ok(migrated.prefs.orbs.every(o => !('minPlacementDistancePx' in o.particles)));
  await cdp.detach();
  return { initialDpr: dpr, viewports, editedWorld: edited.preferences, schema10Migration: true,
    retainedParticles: before.orbs.map(o => o.particles.length), identitiesAndCoordinatesPreserved: true };
}

async function distributionChecks(page, url, dpr) {
  await page.goto(url); await page.waitForFunction(() => document.querySelector('#c').width > 0);
  await setWorld(page, 2300.5, 600.25);
  const payload = await share(page);
  assert.equal(payload.schema, 11); assert.deepEqual(payload.prefs.world, { widthUnits: 2300.5, heightUnits: 600.25 });
  await page.goto(url + hash(payload));
  assert.equal(await page.locator('#numWorldWidth').inputValue(), '2300.5');
  assert.equal(await page.locator('#numWorldHeight').inputValue(), '600.25');
  await page.locator('#btnOpenVisualizers').click();
  const spacing = page.locator('input[id$="-min-placement-distance"]').first();
  await spacing.evaluate(control => { for (let p = control.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
  await spacing.focus(); await spacing.press('ArrowRight');
  assert.equal(await spacing.inputValue(), '0.6'); assert.match(await spacing.getAttribute('aria-valuetext'), /world units/);
  assert.equal((await share(page)).prefs.orbs[0].particles.minPlacementDistanceUnits, .6);
  const capture = await page.evaluate(async () => {
    const canvas = document.querySelector('#c'), stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream), chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = reject; });
    try {
      recorder.start(); await new Promise(resolve => setTimeout(resolve, 250)); recorder.stop(); await stopped;
      const blob = new Blob(chunks, { type: recorder.mimeType });
      if (!blob.size) throw Error('empty canvas capture');
      const video = document.createElement('video'), objectUrl = URL.createObjectURL(blob);
      try {
        const metadata = new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
        video.src = objectUrl; await metadata;
        return { bytes: blob.size, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
          canvasWidth: canvas.width, canvasHeight: canvas.height };
      } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(objectUrl); }
    } finally { stream.getTracks().forEach(track => track.stop()); }
  });
  assert.equal(capture.videoWidth, capture.canvasWidth); assert.equal(capture.videoHeight, capture.canvasHeight);
  assert.equal(capture.canvasWidth, 1000 * dpr); assert.equal(capture.canvasHeight, 800 * dpr);
  return { dpr, worldRoundTrip: true, keyboardSpacing: true, capture };
}

(async () => {
  const server = http.createServer((req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (relative === 'favicon.ico') { res.writeHead(204); res.end(); return; }
    if (relative === 'source') {
      res.setHeader('Content-Type', 'text/html');
      res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8').replaceAll('__AURALPRINT_VERSION__', version)
        .replace(/<link[^>]+>/g, '').replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>')
        .replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>'));
      return;
    }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const report = { version, source: [], distributions: [], errors: [], failedResponses: [] };
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    report.browser = await browser.version();
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const dpr of [1, 2]) {
      for (const edition of ['source', 'portable', 'hosted']) {
        const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: dpr });
        page.setDefaultTimeout(10000);
        page.on('pageerror', error => report.errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
        page.on('response', response => { if (response.status() >= 400) report.failedResponses.push(response.url()); });
        await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
        if (edition === 'source') report.source.push(await sourceChecks(page, base, dpr));
        else report.distributions.push({ edition, ...await distributionChecks(page,
          base + (edition === 'portable' ? `/dist/auralprint_${version.slice(1)}.html` : '/dist/hosted/index.html'), dpr) });
        await page.close();
      }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResponses, []);
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
