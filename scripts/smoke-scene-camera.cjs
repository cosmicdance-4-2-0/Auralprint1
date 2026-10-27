// Built-application acceptance gate. Run after npm run build; no source rewriting,
// application actions, audio, or runtime test hooks are used. CONFIG supplies only
// the expected factory camera for the legacy/C assertions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
assert.match(version, /^v[0-9][A-Za-z0-9.\-]*$/);
const timeout = 10_000;
const keys = ['x', 'y', 'zoom', 'rotationRad'];
const authored = { x: 137.25, y: -286.5, zoom: 1.75, rotationRad: 0.73 };
const captured = { x: -319.125, y: 208.75, zoom: 2.125, rotationRad: 1.31 };
const imported = { x: 431.5, y: -157.25, zoom: 0.625, rotationRad: 2.17 };
const world = { widthUnits: 2345.5, heightUnits: 1678.25 };
const hash = payload => '#p=' + Buffer.from(JSON.stringify(payload)).toString('base64url');
const payload = (camera, dimensions = world) => ({ schema: 12, prefs: {
  sceneCamera: camera, world: dimensions, orbs: [], bands: { overlay: { enabled: false } },
} });

function cameraNear(actual, expected, label) {
  for (const key of keys) {
    const a = actual?.[key], b = expected[key];
    assert.ok(Number.isFinite(a) && Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b)),
      `${label}: initial/authored camera mismatch at ${key}: actual=${a}, expected=${b}`);
  }
}

async function read(page) {
  // Hidden Camera controls deliberately skip refresh in production.
  await cameraPanel(page);
  // Keyboard actions refresh controls on the next application frame.
  const frames = await page.evaluate(() => cameraSmoke.frames);
  await page.waitForFunction(previous => cameraSmoke.frames > previous, frames, { timeout });
  return page.evaluate(() => cameraSmoke.read());
}

// The native 116D approach observes the live controls populated by camera UI
// initialization before onAnimationFrame is scheduled. Also sample at the first
// real canvas clear and require it to occur inside that first callback. Never
// wait for the expected camera value: the first snapshot is immutable evidence.
async function observe(page, errors) {
  page.setDefaultTimeout(timeout);
  page.setDefaultNavigationTimeout(timeout);
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', request => errors.push(`request failed: ${request.url()} (${request.failure()?.errorText})`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.addInitScript(() => {
    const number = id => {
      const value = document.getElementById(id)?.value;
      return value === undefined || value === '' ? null : Number(value);
    };
    const read = () => ({
      camera: { x: number('numCameraX'), y: number('numCameraY'), zoom: number('numCameraZoom'),
        rotationRad: number('numCameraRotation') === null ? null : number('numCameraRotation') * Math.PI / 180 },
      world: { widthUnits: number('numWorldWidth'), heightUnits: number('numWorldHeight') },
    });
    const probe = window.cameraSmoke = { read, scheduled: null, firstPaint: null, frames: 0, inFrame: false };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      if (callback.name !== 'onAnimationFrame') return raf(callback);
      if (probe.scheduled === null) probe.scheduled = read();
      return raf(timestamp => {
        probe.inFrame = true;
        try { callback(timestamp); probe.frames++; }
        finally { probe.inFrame = false; }
      });
    };
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.canvas.id === 'c' && probe.firstPaint === null) {
        probe.firstPaint = { ...read(), inFrame: probe.inFrame, priorFrames: probe.frames,
          width: this.canvas.width, height: this.canvas.height };
      }
      return fillRect.apply(this, args);
    };
  });
}

async function boot(browser, url, expectedCamera, expectedWorld, label, errors) {
  // newContext, rather than a new tab in the author's context, excludes storage,
  // permissions and session state from startup/migration/recipient assertions.
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await observe(page, errors);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.cameraSmoke?.frames >= 1 && window.cameraSmoke.firstPaint !== null,
    null, { timeout });
  const first = await page.evaluate(() => ({ scheduled: cameraSmoke.scheduled, paint: cameraSmoke.firstPaint }));
  assert.ok(first.scheduled, `${label}: application frame was never scheduled`);
  cameraNear(first.scheduled.camera, expectedCamera, `${label} before first application frame`);
  cameraNear(first.paint.camera, expectedCamera, `${label} first rendered application frame`);
  assert.deepEqual(first.scheduled.world, expectedWorld, `${label}: startup world configuration`);
  assert.deepEqual(first.paint.world, expectedWorld, `${label}: first-frame world configuration`);
  assert.equal(first.paint.inFrame, true, `${label}: canvas clear outside application callback`);
  assert.equal(first.paint.priorFrames, 0, `${label}: missed the first rendered frame`);
  assert.ok(first.paint.width > 0 && first.paint.height > 0, `${label}: empty viewport`);
  cameraNear((await read(page)).camera, expectedCamera, `${label} live camera`);
  assert.deepEqual(errors, [], `${label}: browser/resource errors`);
  return { context, page };
}

async function show(page, panel, button) {
  const other = panel === '#cameraPanel' ? ['#scenePanel', '#btnOpenScene'] : ['#cameraPanel', '#btnOpenCamera'];
  if (await page.locator(other[0]).isVisible()) await page.locator(other[1]).click();
  if (!await page.locator(panel).isVisible()) await page.locator(button).click();
}

async function cameraPanel(page) { await show(page, '#cameraPanel', '#btnOpenCamera'); }

async function presetsPanel(page) {
  await show(page, '#scenePanel', '#btnOpenScene');
  if (!await page.locator('#btnShare').evaluate(element => element.closest('details').open)) {
    await page.locator('#scenePanel summary').filter({ hasText: 'Presets' }).click();
  }
}

async function share(page) {
  await presetsPanel(page);
  await page.evaluate(() => { document.getElementById('sceneStatus').textContent = ''; });
  await page.locator('#btnShare').click();
  await page.waitForFunction(() => /^Share link /.test(document.getElementById('sceneStatus').textContent));
  const url = page.url();
  assert.ok(new URL(url).hash.startsWith('#z='), 'Copy Share Link did not write a preset URL');
  const { decodePrefsFromHash } = await import('../src/js/presets/url-preset.js');
  return { url, payload: { schema: 15, prefs: await decodePrefsFromHash(new URL(url).hash) } };
}

async function editCamera(page, camera) {
  await cameraPanel(page);
  for (const [field, value] of [['X', camera.x], ['Y', camera.y], ['Zoom', camera.zoom], ['Rotation', camera.rotationRad * 180 / Math.PI]]) {
    const input = page.locator('#numCamera' + field);
    await input.fill(String(value));
    await input.press('Tab');
    assert.equal(await input.getAttribute('aria-invalid'), 'false', `Camera ${field} edit rejected`);
  }
  cameraNear((await read(page)).camera, camera, 'UI camera edit');
}

async function apply(page, value) {
  await presetsPanel(page);
  // replaceState intentionally emits no hashchange: only the actual Apply URL
  // Preset button can initialize the newly supplied camera in this scenario.
  await page.evaluate(h => history.replaceState(null, '', location.pathname + h), hash(value));
  await page.locator('#btnApplyUrl').click();
}

async function hostedResources(page) {
  // Headless Chromium does not automatically request every icon/manifest. Fetch
  // the actual relative references from this built page in the browser as well.
  const resources = await page.evaluate(async timeoutMs => {
    const urls = [...document.querySelectorAll('link[href^="./"]')].map(link => link.href);
    const checked = [];
    for (const url of urls) {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`Hosted resource HTTP ${response.status}: ${url}`);
      if (new URL(url).pathname.endsWith('.webmanifest')) {
        const manifest = await response.json();
        for (const icon of manifest.icons) urls.push(new URL(icon.src, url).href);
      } else {
        await response.arrayBuffer();
      }
      checked.push(new URL(url).pathname);
    }
    return checked;
  }, timeout);
  assert.ok(resources.length > 0, 'Hosted relative resources were not exercised');
  assert.ok(resources.every(resource => resource.startsWith('/hosted/')), 'Hosted resources escaped their relative package');
  console.log(`PASS hosted: ${resources.length} relative HTML/manifest resources fetched in Chromium`);
}

async function exercise(browser, app, edition, defaults, errors) {
  const author = await boot(browser, app + hash(payload(authored)), authored, world, `${edition} schema-12 startup`, errors);
  const page = author.page;
  const initial = await share(page);
  assert.equal(initial.payload.schema, 15);
  assert.deepEqual(initial.payload.prefs.world, world, 'Decoded Scene world');
  cameraNear(initial.payload.prefs.sceneCamera, authored, 'Decoded authored camera');
  assert.deepEqual(initial.payload.prefs.orbs, [], 'Preset was not applied');
  if (edition === 'hosted') await hostedResources(page);
  console.log(`PASS ${edition}: schema-12 authored camera before first rendered frame; nondefault world`);

  await cameraPanel(page);
  await page.locator('#btnCameraPanRight').click();
  await page.locator('#btnCameraRotateCW').click();
  assert.notDeepEqual((await read(page)).camera, authored, 'Live navigation did not move the camera');
  assert.deepEqual((await share(page)).payload, initial.payload, 'Live navigation rewrote authored Scene');
  await cameraPanel(page);
  await page.locator('#btnRestoreSceneView').click();
  cameraNear((await read(page)).camera, authored, 'Restore Scene View');
  console.log(`PASS ${edition}: live/authored ownership, share, restore`);

  await editCamera(page, captured);
  await page.locator('#btnSaveSceneView').click();
  assert.match(await page.locator('#sceneCameraStatus').innerText(), /saved/i);
  const saved = await share(page);
  cameraNear(saved.payload.prefs.sceneCamera, captured, 'Explicit UI Save Current View as Scene View');
  assert.deepEqual({ ...saved.payload.prefs, sceneCamera: initial.payload.prefs.sceneCamera }, initial.payload.prefs,
    'Save changed unrelated Scene configuration');
  const recipient = await boot(browser, saved.url, captured, world, `${edition} fresh recipient`, errors);
  await cameraPanel(recipient.page);
  const recipientHash = new URL(recipient.page.url()).hash;
  await recipient.page.locator('#btnCameraPanLeft').click();
  await recipient.page.locator('#btnCameraRotateCCW').click();
  assert.notDeepEqual((await read(recipient.page)).camera, captured, 'Recipient navigation did not move');
  assert.equal(new URL(recipient.page.url()).hash, recipientHash, 'Recipient navigation rewrote URL');
  assert.deepEqual((await share(recipient.page)).payload, saved.payload, 'Recipient navigation rewrote authored Scene');
  cameraNear((await read(page)).camera, captured, 'Recipient navigation changed author');
  await recipient.context.close();
  console.log(`PASS ${edition}: UI capture, share, isolated fresh recipient and independent navigation`);

  const importedWorld = { widthUnits: 3127.75, heightUnits: 1953.5 };
  await apply(page, payload(imported, importedWorld));
  assert.match(await page.locator('#sceneStatus').innerText(), /Preset applied from URL/);
  cameraNear((await read(page)).camera, imported, 'In-session Apply URL Preset');
  assert.deepEqual((await read(page)).world, importedWorld, 'In-session world resolution');
  const applied = await share(page);
  cameraNear(applied.payload.prefs.sceneCamera, imported, 'In-session authored configuration');
  await cameraPanel(page);
  await page.locator('#btnCameraPanUp').click();
  const beforeInvalid = await read(page);
  assert.notDeepEqual(beforeInvalid.camera, imported);
  // Well-formed transport with an unsupported schema and conspicuously different
  // fields must be rejected atomically, as must malformed encoded transport.
  for (const invalid of [hash({ schema: 999, prefs: { ...payload(authored).prefs, world: { widthUnits: 99, heightUnits: 88 } } }), '#p=invalid']) {
    await presetsPanel(page);
    await page.evaluate(h => history.replaceState(null, '', location.pathname + h), invalid);
    await page.locator('#btnApplyUrl').click();
    assert.match(await page.locator('#sceneStatus').innerText(), /Invalid preset|Unsupported preset/);
    assert.deepEqual(await read(page), beforeInvalid, 'Invalid import partially changed live camera/world');
    assert.deepEqual((await share(page)).payload, applied.payload, 'Invalid import partially changed preferences');
  }
  console.log(`PASS ${edition}: in-session application and invalid-import atomicity`);

  // Keep the existing keyboard owners in the exercised flow without sustained
  // movement, timing guesses, media or stress. C/F must not capture a Scene view.
  await cameraPanel(page);
  await page.locator('#chkCameraInteraction').check();
  await page.locator('#c').focus();
  await page.keyboard.press('c');
  cameraNear((await read(page)).camera, defaults, 'C factory reset');
  await page.keyboard.press('f');
  assert.notDeepEqual((await read(page)).camera, defaults, 'F did not fit the nondefault world');
  assert.deepEqual((await share(page)).payload, applied.payload, 'C/F changed authored Scene');
  await cameraPanel(page);
  await page.locator('#btnRestoreSceneView').click();
  cameraNear((await read(page)).camera, imported, 'Restore after C/F');
  await author.context.close();

  const legacyPrefs = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/schema-11-full.json'), 'utf8'));
  assert.equal(Object.hasOwn(legacyPrefs, 'sceneCamera'), false, 'Legacy fixture unexpectedly has a camera');
  const legacy = await boot(browser, app + hash({ schema: 11, prefs: legacyPrefs }), defaults, legacyPrefs.world,
    `${edition} schema-11 migration`, errors);
  const migrated = await share(legacy.page);
  assert.equal(migrated.payload.schema, 15);
  assert.deepEqual(migrated.payload.prefs.world, legacyPrefs.world, 'Legacy world lost during migration');
  cameraNear(migrated.payload.prefs.sceneCamera, defaults, 'Legacy authored CONFIG defaults');
  await legacy.context.close();
  assert.deepEqual(errors, [], `${edition}: browser/resource errors`);
  console.log(`PASS ${edition}: C/F, restore and isolated schema-11 migration to CONFIG camera defaults`);
}

(async () => {
  const started = performance.now();
  // Read only the canonical defaults for the legacy/C assertions. The startup
  // fixture and all browser actions are independent of application functions.
  const { CONFIG } = await import('../src/js/core/config.js');
  for (const camera of [authored, captured, imported]) for (const key of keys) {
    assert.notEqual(camera[key], CONFIG.camera.defaults[key], `Fixture ${key} must differ from CONFIG`);
  }
  for (const key of Object.keys(world)) assert.notEqual(world[key], CONFIG.defaults.world[key], `Fixture world ${key} must differ from CONFIG`);
  const editions = [['portable', `/auralprint_${version.slice(1)}.html`], ['hosted', '/hosted/index.html']];
  for (const [, file] of editions) assert.ok(fs.statSync(path.join(dist, file)).size > 0, `Build missing: ${file}`);
  const errors = [];
  const server = http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
      if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = path.resolve(dist, '.' + pathname);
      if (!file.startsWith(dist + path.sep) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(fs.readFileSync(file));
    } catch (error) {
      errors.push(`server: ${req.url}: ${error.message}`);
      res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end();
    }
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch({ headless: true, timeout: 30_000, executablePath: process.env.AP_CHROMIUM_PATH });
    console.log(`Scene-camera smoke: ${version}, Chromium ${browser.version()}, portable + hosted HTTP`);
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [edition, file] of editions) await exercise(browser, base + file, edition, CONFIG.camera.defaults, errors);
    assert.deepEqual(errors, [], 'Browser/application resource errors');
    console.log(`PASS scene-camera smoke (${((performance.now() - started) / 1000).toFixed(2)}s)`);
  } catch (error) {
    if (errors.length) console.error(errors.join('\n'));
    throw error;
  } finally {
    try { if (browser) await browser.close(); }
    finally { await new Promise((resolve, reject) => server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve())); }
  }
})().catch(error => { console.error('FAIL scene-camera smoke:', error); process.exitCode = 1; });
