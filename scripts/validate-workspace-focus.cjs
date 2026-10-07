// Optional native keyboard focus regression; no Playwright project dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = process.env.AP_ARTIFACT_VERSION || fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const defect = process.env.RC13_EXPECT_DEFECT === '1';
const html = fs.readFileSync(path.join(root, 'dist', `auralprint_${version.slice(1)}.html`), 'utf8');
function wav() {
  const rate = 8000, frames = rate * 60, b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * 2, 40); return b;
}
async function snapshot(page) {
  return page.evaluate(() => {
    const focused = document.activeElement, rect = focused.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { id: focused.id, tag: focused.tagName, className: focused.className, rowText: focused.closest('.queue-item')?.textContent || '', frontPanels: [...document.querySelectorAll('.panel-front')].map(p => p.id), hitPanel: hit?.closest('.panel')?.id || '', visibleFocus: !!hit && focused.contains(hit) };
  });
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const cases = [], errors = [];
  try {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 667 }]) {
      const page = await browser.newPage({ viewport }); page.on('pageerror', e => errors.push(e.message));
      await page.route('http://rc13.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
      await page.goto('http://rc13.test/');
      await page.locator('#btnOpenAnalysis').click(); await page.locator('#btnOpenScene').click();
      for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Tab');
      const focused = await snapshot(page);
      assert.equal(focused.id, 'inpBandCeilingHz'); assert.deepEqual(focused.frontPanels, [defect ? 'scenePanel' : 'analysisPanel']); assert.equal(focused.hitPanel, defect ? 'scenePanel' : 'analysisPanel'); assert.equal(focused.visibleFocus, !defect);
      if (process.env.AP_REPORT) await page.screenshot({ path: path.join(path.dirname(process.env.AP_REPORT), `visible-focus-${viewport.width}.png`) });
      cases.push({ kind: 'visible-panel-keyboard-ownership', viewport, focused }); await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); page.on('pageerror', e => errors.push(e.message));
    await page.route('http://rc13.test/**', r => r.fulfill({ contentType: 'text/html', body: html })); await page.goto('http://rc13.test/');
    const payload = name => ({ name, mimeType: 'audio/wav', buffer: wav() });
    await page.locator('#fileInput').setInputFiles(['A.wav', 'B.wav', 'C.wav'].map(payload)); await page.waitForFunction(() => document.querySelectorAll('.queue-item').length === 3 && !document.querySelector('#btnPlay').disabled);
    await page.locator('#btnToggleQueue').click();
    assert.equal(await page.locator('#queuePanel').isVisible(), true);
    await page.locator('#btnHideQueue').focus(); assert.equal((await snapshot(page)).id, 'btnHideQueue');
    await page.keyboard.press('Enter');
    if (defect) {
      assert.equal((await snapshot(page)).tag, 'BODY');
      cases.push({ kind: 'visible-queue-hide-discards-focus', focused: await snapshot(page) });
      await page.locator('#btnToggleQueue').click();
      await page.locator('.q-remove').nth(1).focus(); await page.keyboard.press('Enter');
      assert.equal((await snapshot(page)).tag, 'BODY');
      assert.deepEqual(await page.locator('.q-name').allTextContents(), ['A.wav', 'C.wav']);
      cases.push({ kind: 'visible-queue-removal-discards-focus', focused: await snapshot(page) });
      assert.deepEqual(errors, []);
      const result = { version, browser: await browser.version(), defect, cases, errors };
      if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(result, null, 2) + '\n');
      console.log(JSON.stringify(result, null, 2)); return;
    }
    assert.equal((await snapshot(page)).id, 'btnToggleQueue');
    await page.keyboard.press('Enter'); assert.equal((await snapshot(page)).id, 'btnHideQueue');
    cases.push({ kind: 'queue-hide-show-real-toggle', focused: await snapshot(page) });
    await page.locator('.q-remove').nth(1).focus(); await page.keyboard.press('Enter');
    let focused = await snapshot(page); assert.equal(focused.className, 'q-remove'); assert.ok(focused.rowText.includes('C.wav')); assert.deepEqual(await page.locator('.q-name').allTextContents(), ['A.wav', 'C.wav']);
    cases.push({ kind: 'remove-middle-successor', focused });
    await page.keyboard.press('Enter'); focused = await snapshot(page); assert.equal(focused.className, 'q-remove'); assert.ok(focused.rowText.includes('A.wav'));
    cases.push({ kind: 'remove-last-predecessor', focused });
    await page.keyboard.press('Enter'); assert.equal((await snapshot(page)).id, 'btnHideQueue'); assert.equal(await page.locator('.queue-item').count(), 0);
    cases.push({ kind: 'empty-queue-hide-focus', focused: await snapshot(page) });
    await page.locator('#fileInput').setInputFiles(['A.wav', 'B.wav'].map(payload)); await page.waitForFunction(() => !document.querySelector('#btnPlay').disabled);
    await page.locator('.queue-item').nth(1).focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.queue-item[aria-current="true"] .q-name')?.textContent === 'B.wav');
    focused = await snapshot(page); assert.ok(focused.className.includes('queue-item')); assert.ok(focused.rowText.includes('B.wav'));
    cases.push({ kind: 'activation-retains-row-focus', focused });
    await page.locator('#btnOpenScene').click(); const outside = await snapshot(page);
    await page.locator('#fileInput').setInputFiles([payload('C.wav')]);
    assert.equal((await snapshot(page)).id, outside.id);
    cases.push({ kind: 'refresh-preserves-outside-focus', focused: await snapshot(page) });
    await page.locator('#btnClearQueue').focus(); await page.keyboard.press('Enter');
    assert.equal((await snapshot(page)).id, 'btnHideQueue');
    cases.push({ kind: 'clear-restores-hide-focus', focused: await snapshot(page) });
    assert.deepEqual(errors, []);
    const result = { version, browser: await browser.version(), cases, errors };
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
