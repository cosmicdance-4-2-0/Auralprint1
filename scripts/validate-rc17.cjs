// Optional native Chromium evidence. Uses externally available Playwright;
// intentionally not an npm dependency or part of the required Node test suite.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const baseline = process.argv.includes('--baseline');
const expectDefect = baseline || process.argv.includes('--expect-defect');
// Chromium serializes range doubles to about 15 significant decimal digits,
// including with step=any. Require agreement at that native precision; preserve
// exact canonical persistence separately. This is not a degree snapping tolerance.
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-14, `${a} != ${b}`);
const hash = radians => '#p=' + Buffer.from(JSON.stringify({ schema: 10, prefs: {
  orbs: [{ id: 'phase-probe', startAngleRad: radians, motion: { angularSpeedRadPerSec: 2 } }]
} })).toString('base64url');
const inspect = el => ({ rawValue: el.value, value: Number(el.value), min: el.min, max: el.max, step: el.step,
  degrees: Number(el.value) * 180 / Math.PI, display: el.closest('.row').querySelector('.val').textContent,
  accessibleValue: el.getAttribute('aria-valuetext'), stepMismatch: el.validity.stepMismatch });
async function share(page) {
  await page.evaluate(() => document.querySelector('#btnShare').click());
  return page.evaluate(() => JSON.parse(atob(location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/'))));
}
(async () => {
  const server = http.createServer((req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (!relative) {
      const template = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.end(template.replaceAll('__AURALPRINT_VERSION__', version).replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>').replace('<!-- AURALPRINT_INLINE_CSS -->',
        () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>')); return;
    }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : 'text/javascript'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const report = { version, baseline, method: 'Actual URL import, boot-generated Orb editor, public Share transport; native Chromium at DPR 1/2.', rows: [], pageErrors: [] };
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    report.browser = await browser.version();
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const dpr of [1, 2]) {
      for (const standalone of [false, true]) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: dpr });
        // Freeze scheduling only: native DOM, actual boot/listeners and consumers run.
        await page.addInitScript(() => {
          window.requestAnimationFrame = () => 0;
          window.__rc17Listeners = new WeakMap();
          const add = EventTarget.prototype.addEventListener;
          EventTarget.prototype.addEventListener = function (...args) {
            const listeners = window.__rc17Listeners.get(this) || [];
            listeners.push(args[0]); window.__rc17Listeners.set(this, listeners);
            return add.apply(this, args);
          };
        });
        page.on('pageerror', e => report.pageErrors.push(e.message));
        const app = base + (standalone ? `/dist/auralprint_${version.slice(1)}.html` : '/');
        await page.goto(app + hash(4 * Math.PI));
        const phase = page.locator('input[id$="-phase-offset"]').first();
        const defect = await phase.evaluate(inspect);
        defect.persisted = (await share(page)).prefs.orbs[0].startAngleRad;
        if (expectDefect) {
          assert.equal(defect.persisted, 4 * Math.PI);
          assert.equal(defect.display, '720°'); assert.equal(defect.accessibleValue, '720 degrees');
          assert.ok(defect.value <= Number(defect.max)); assert.notEqual(defect.value, defect.persisted);
        } else {
          assert.equal(defect.persisted, 0); assert.equal(defect.value, 0);
          assert.equal(defect.display, '0°'); assert.equal(defect.accessibleValue, '0 degrees');
        }
        const fractional = [];
        for (const radians of [Math.PI / 360, Math.PI / 120, 57.2958 * Math.PI / 180,
          359.5 * Math.PI / 180, 2 * Math.PI - Number.EPSILON * 4, -Math.PI / 2, 5 * Math.PI / 2]) {
          await page.goto(app + hash(radians));
          const native = await phase.evaluate(inspect);
          native.input = radians; native.persisted = (await share(page)).prefs.orbs[0].startAngleRad;
          if (!expectDefect) {
            close(native.value, native.persisted);
            assert.equal(native.step, 'any'); assert.equal(native.stepMismatch, false);
            assert.equal(native.accessibleValue, native.display.slice(0, -1) + ' degrees');
            assert.ok(Math.abs(parseFloat(native.display) - native.degrees) < 1e-10);
            assert.notEqual(native.display, '360°');
          }
          fractional.push(native);
        }
        const row = { dpr, standalone, defect, fractional };
        if (!baseline && !expectDefect) {
          // Additional lifecycle/native interaction checks are in the source harness.
          if (!standalone) row.lifecycle = await page.evaluate(async () => {
            const { validateRc17 } = await import('./scripts/validate-rc17.mjs'); return validateRc17();
          });
          await page.goto('about:blank');
          await page.goto(app + hash(Math.PI / 120));
          await page.locator('#btnOpenVisualizers').click();
          await phase.evaluate(el => { for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
          await phase.focus(); await phase.press('ArrowRight');
          const keyboard = await phase.evaluate(inspect);
          assert.ok(Math.abs(keyboard.degrees - 2.5) < 1e-10);
          close(keyboard.value, (await share(page)).prefs.orbs[0].startAngleRad);
          row.keyboard = keyboard;
          await phase.press('End');
          const endpoint = await phase.evaluate(inspect);
          assert.equal(endpoint.value, 0); assert.equal(endpoint.display, '0°');
          assert.equal(endpoint.accessibleValue, '0 degrees');
          assert.equal((await share(page)).prefs.orbs[0].startAngleRad, 0);
          row.endpoint = endpoint;
          // Real pointer-originated native input, with the same synchronous commit.
          await phase.click({ position: { x: (await phase.boundingBox()).width / 2, y: 8 } });
          const pointer = await phase.evaluate(inspect);
          close(pointer.value, (await share(page)).prefs.orbs[0].startAngleRad);
          assert.equal(pointer.accessibleValue, pointer.display.slice(0, -1) + ' degrees');
          row.pointer = pointer;
          if (standalone && process.env.AP_SCREENSHOTS_DIR) {
            await page.goto('about:blank'); await page.goto(app + hash(359.5 * Math.PI / 180));
            await page.locator('#btnOpenVisualizers').click();
            await phase.evaluate(el => { for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
            const file = `native-phase-dpr${dpr}.png`;
            await phase.locator('..').screenshot({ path: path.join(process.env.AP_SCREENSHOTS_DIR, file) });
            row.thumbScreenshot = file;
          }
          await page.evaluate(() => document.querySelector('#btnResetPrefs').click());
          const defaults = await share(page);
          assert.deepEqual(defaults.prefs.orbs.map(o => o.startAngleRad), [0, Math.PI]);
          row.resetAll = defaults.prefs.orbs.map(o => o.startAngleRad);
        }
        report.rows.push(row); await page.close();
      }
      if (!expectDefect) {
      // Unmodified standalone, normal scheduling: actual import, designed UI
      // stability while live motion runs, visual reset button and media smoke.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: dpr });
      page.on('pageerror', e => report.pageErrors.push(e.message));
      await page.goto(`${base}/dist/auralprint_${version.slice(1)}.html` + hash(Math.PI / 120));
      const phase = page.locator('input[id$="-phase-offset"]').first();
      assert.equal((await phase.evaluate(inspect)).display, '1.5°');
      await page.evaluate(() => document.querySelector('#btnResetVisuals').click());
      const frames = 44100 * 2, wav = Buffer.alloc(44 + frames * 4);
      wav.write('RIFF'); wav.writeUInt32LE(36 + frames * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
      wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(44100, 24);
      wav.writeUInt32LE(176400, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 4, 40);
      for (let i = 0; i < frames; i++) { wav.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / 44100)), 44 + i * 4); wav.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 880 * i / 44100)), 46 + i * 4); }
      await page.locator('#fileInput').setInputFiles({ name: 'rc17-stereo.wav', mimeType: 'audio/wav', buffer: wav });
      await page.waitForFunction(() => document.querySelector('#btnPlay').textContent === 'Pause');
      await page.waitForFunction(() => /0:01/.test(document.querySelector('#scrubberTime').textContent));
      assert.equal((await phase.evaluate(inspect)).display, '1.5°', 'designed UI must not follow animated phase');
      await page.locator('#btnStop').click();
      report.rows.push({ dpr, standalone: true, normalScheduling: true,
        verified: ['unmodified standalone boot/import', 'Reset Visuals button', 'stereo WAV decode/playback', 'advancing scrubber', 'designed readout stays fixed during motion', 'stop'] });
      await page.close();
      }
    }
    assert.deepEqual(report.pageErrors, []);
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
