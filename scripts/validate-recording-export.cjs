// Optional native RC-06 regression. Build first; Playwright is developer tooling.
// RC06_PLAYWRIGHT_MODULE, RC06_CHROMIUM_PATH, and RC06_REPORT are optional.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.RC06_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const artifact = path.join(root, 'dist', `auralprint_${version.slice(1)}.html`);

function makeWav() {
  const rate = 44100, frames = rate * 20, bytes = frames * 2;
  const wav = Buffer.alloc(44 + bytes);
  wav.write('RIFF'); wav.writeUInt32LE(36 + bytes, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(bytes, 40);
  for (let i = 0; i < frames; i++) wav.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return wav;
}

(async () => {
  const browser = await chromium.launch({
    ...(process.env.RC06_CHROMIUM_PATH ? { executablePath: process.env.RC06_CHROMIUM_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://rc06.test/**', route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(artifact) }));
    await page.addInitScript(() => {
      const created = [], revoked = [];
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = blob => {
        const url = create(blob);
        created.push({ url, size: blob.size, type: blob.type });
        return url;
      };
      URL.revokeObjectURL = url => { revoked.push(url); revoke(url); };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) window.rc06.download = { url: this.href, filename: this.download };
        else click.call(this);
      };
      window.rc06 = { created, revoked };
    });
    await page.goto('http://rc06.test/');
    assert.ok((await page.title()).includes(version));
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#btnLoad').click();
    await (await chooser).setFiles({ name: 'rc06.wav', mimeType: 'audio/wav', buffer: makeWav() });
    await page.waitForFunction(() => !document.getElementById('btnRecordStart').disabled);
    const phase = value => page.waitForFunction(expected => document.getElementById('recordPanel').dataset.recordingPhase === expected, value);
    const click = id => page.evaluate(id => document.getElementById(id).click(), id);
    const snapshot = () => page.evaluate(async () => {
      const button = document.getElementById('btnRecordDownloadLast');
      if (button.disabled) throw new Error('retained export is unavailable in UI');
      button.click();
      const { url, filename } = window.rc06.download;
      const blob = await (await fetch(url)).blob();
      return { url, filename, size: blob.size, type: blob.type, meta: document.getElementById('recordExportMeta').textContent };
    });
    await click('btnRecordStart'); await phase('recording');
    await page.waitForTimeout(1100);
    await click('btnRecordStop'); await phase('complete');
    const a = await snapshot();
    assert.ok(a.size > 0);
    await page.evaluate(() => {
      const canvas = document.getElementById('c');
      window.rc06.capture = canvas.captureStream;
      canvas.captureStream = () => { throw new DOMException('injected next-acquisition failure', 'NotSupportedError'); };
    });
    await click('btnRecordStart'); await phase('error');
    const failed = await snapshot();
    assert.deepEqual(failed, a);
    const errorStatus = await page.locator('#recordStatus').textContent();
    assert.match(errorStatus, /error|failed|did not provide/i);
    assert.equal(await page.evaluate(url => window.rc06.revoked.includes(url), a.url), false);
    await page.evaluate(() => { document.getElementById('c').captureStream = window.rc06.capture; });
    await click('btnRecordStart'); await phase('recording');
    assert.deepEqual(await snapshot(), a);
    await page.waitForTimeout(1100);
    await click('btnRecordStop'); await phase('complete');
    const b = await snapshot();
    assert.notEqual(b.url, a.url);
    assert.ok(b.size > 0);
    const ownership = await page.evaluate(async ({ a, b }) => {
      let oldResolves = true;
      try { await fetch(a); } catch { oldResolves = false; }
      return {
        oldResolves, oldRevocations: window.rc06.revoked.filter(url => url === a).length,
        newRevocations: window.rc06.revoked.filter(url => url === b).length,
        newResolves: (await (await fetch(b)).blob()).size > 0,
        created: window.rc06.created.filter(blob => blob.type.startsWith('video/')),
      };
    }, { a: a.url, b: b.url });
    assert.equal(ownership.oldResolves, false);
    assert.equal(ownership.oldRevocations, 1);
    assert.equal(ownership.newRevocations, 0);
    assert.equal(ownership.newResolves, true);
    assert.equal(ownership.created.length, 2);
    assert.deepEqual(errors, []);
    const result = { version, browser: await page.evaluate(() => navigator.userAgent), a, failed, errorStatus, b, ownership, errors };
    if (process.env.RC06_REPORT) fs.writeFileSync(process.env.RC06_REPORT, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
