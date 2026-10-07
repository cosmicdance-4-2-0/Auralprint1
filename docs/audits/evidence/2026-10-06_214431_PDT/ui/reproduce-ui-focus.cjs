'use strict';

// Read-only browser reproduction against a built repository artifact.
// Run after npm run build:
// AUDIT_REPO_ROOT=/path/to/repo node reproduce-ui-focus.cjs
// Optional: AUDIT_OUTPUT_DIR=/path/to/evidence AUDIT_APP_URL=http://host/app.html
// Requires Playwright and Chromium; no production files are changed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(process.env.AUDIT_REPO_ROOT || process.cwd());
const output = path.resolve(process.env.AUDIT_OUTPUT_DIR || __dirname);
const browserPath = process.env.AUDIT_CHROMIUM_PATH || '/usr/bin/chromium';
const evidence = { auditedRepository: root, cases: [] };
fs.mkdirSync(output, { recursive: true });

function makeWav() {
  const rate = 8000, frames = rate * 60;
  const bytes = Buffer.alloc(44 + frames * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVE', 8); bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(frames * 2, 40);
  return bytes;
}

async function sharePreset(page) {
  // Public Share action serializes canonical preferences into the URL hash.
  const hash = await page.locator('#btnShare').evaluate(button => { button.click(); return location.hash; });
  assert.ok(hash.startsWith('#p='), 'Share should write its preset URL hash.');
  return JSON.parse(Buffer.from(hash.slice(3), 'base64url').toString('utf8'));
}

async function focusSnapshot(page) {
  return page.evaluate(() => {
    const focused = document.activeElement;
    const rect = focused.getBoundingClientRect();
    const samplePoints = [
      [rect.x + 2, rect.y + 2],
      [rect.right - 2, rect.y + 2],
      [rect.x + 2, rect.bottom - 2],
      [rect.right - 2, rect.bottom - 2],
      [rect.x + rect.width / 2, rect.y + rect.height / 2],
    ];
    return {
      id: focused.id, tag: focused.tagName, className: focused.className,
      text: focused.textContent,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      hitSamples: samplePoints.map(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return { x, y, hitId: hit?.id || '', hitClass: hit?.className || '',
          panel: hit?.closest('.panel')?.id || '', visibleFocus: !!hit && focused.contains(hit) };
      }),
      frontPanels: [...document.querySelectorAll('.panel-front')].map(panel => panel.id),
    };
  });
}

(async () => {
  let server, browser;
  try {
    let appUrl = process.env.AUDIT_APP_URL;
    if (!appUrl) {
      const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim().replace(/^v/, '');
      const artifact = path.join(root, 'dist', `auralprint_${version}.html`);
      assert.ok(fs.existsSync(artifact), `Built HTML missing: ${artifact}. Run npm run build first.`);
      const html = fs.readFileSync(artifact);
      server = http.createServer((request, response) => {
        if (request.url === '/app.html') {
          response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(html);
        } else {
          response.writeHead(404); response.end();
        }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      appUrl = `http://127.0.0.1:${server.address().port}/app.html`;
    }
    evidence.appUrl = appUrl;
    browser = await chromium.launch({ executablePath: browserPath, headless: true,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    evidence.browserVersion = browser.version();
    for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 667 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(appUrl);
      await page.locator('#btnOpenAnalysis').click();
      await page.locator('#btnOpenScene').click();
      assert.equal((await focusSnapshot(page)).id, 'btnHideScene');
      for (let step = 0; step < 3; step++) await page.keyboard.press('Shift+Tab');
      const before = await focusSnapshot(page);
      assert.equal(before.id, 'inpBandCeilingHz');
      assert.deepEqual(before.frontPanels, ['scenePanel']);
      assert.ok(before.hitSamples.every(sample => sample.panel === 'scenePanel' && !sample.visibleFocus),
        'Every sampled point of the focused Analysis input should be covered by Settings.');
      const canonicalBefore = (await sharePreset(page)).prefs.bands.ceilingHz;
      const valueBefore = await page.locator('#inpBandCeilingHz').inputValue();
      await page.keyboard.press('ArrowDown');
      const valueAfter = await page.locator('#inpBandCeilingHz').inputValue();
      const after = await focusSnapshot(page);
      assert.notEqual(valueAfter, valueBefore, 'ArrowDown should edit the invisible input.');
      assert.deepEqual(after.frontPanels, ['scenePanel']);
      assert.ok(after.hitSamples.every(sample => sample.panel === 'scenePanel' && !sample.visibleFocus));
      await page.screenshot({ path: path.join(output, `background-focus-${viewport.width}x${viewport.height}.png`) });
      // Number-input edits commit on change/blur. Move focus away through the
      // keyboard, then verify actual canonical state through public Share.
      await page.keyboard.press('Tab');
      const afterBlur = await focusSnapshot(page);
      const canonicalAfter = (await sharePreset(page)).prefs.bands.ceilingHz;
      assert.equal(canonicalBefore, 22500);
      assert.equal(canonicalAfter, 22499, 'Invisible edit should persist after keyboard blur.');
      assert.deepEqual(afterBlur.frontPanels, ['scenePanel']);
      evidence.cases.push({ name: 'keyboard-edits-fully-covered-background-panel', viewport,
        valueBefore, valueAfter, canonicalBefore, canonicalAfter, before, after, afterBlur });
      await page.close();
    }

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(appUrl);
    const buffer = makeWav();
    await page.locator('#fileInput').setInputFiles(['first.wav', 'second.wav', 'third.wav']
      .map(name => ({ name, mimeType: 'audio/wav', buffer })));
    await page.waitForFunction(() => document.querySelectorAll('.queue-item').length === 3);
    assert.equal(await page.locator('#btnOpenQueue').count(), 0, 'Queue launcher is absent.');
    await page.locator('#btnHideQueue').focus();
    await page.keyboard.press('Enter');
    const hiddenQueueFocus = await focusSnapshot(page);
    assert.equal(await page.locator('#queuePanel').isVisible(), false);
    assert.equal(hiddenQueueFocus.tag, 'BODY');
    await page.keyboard.press('Tab');
    const afterHideTab = await focusSnapshot(page);
    assert.equal(afterHideTab.id, 'c');
    evidence.cases.push({ name: 'queue-hide-has-no-launcher-to-restore-focus', hiddenQueueFocus, afterHideTab });

    await page.locator('#btnToggleQueue').click();
    await page.locator('.q-remove').nth(1).focus();
    const beforeRemove = await focusSnapshot(page);
    await page.keyboard.press('Enter');
    const afterRemove = await focusSnapshot(page);
    const remainingItems = await page.locator('.q-name').allTextContents();
    assert.deepEqual(remainingItems, ['first.wav', 'third.wav']);
    assert.equal(afterRemove.tag, 'BODY');
    await page.keyboard.press('Tab');
    const afterRemoveTab = await focusSnapshot(page);
    assert.equal(afterRemoveTab.tag, 'DIV');
    assert.ok(afterRemoveTab.className.includes('queue-item'));
    assert.ok(afterRemoveTab.text.includes('first.wav'), 'Tab returns to the first item rather than the successor.');
    evidence.cases.push({ name: 'queue-removal-discards-focus-and-restarts-row-navigation',
      beforeRemove, afterRemove, remainingItems, afterRemoveTab });
    await page.close();
    evidence.assertionsPassed = true;
    console.log('Confirmed: overlapping-panel focus is invisible at desktop/mobile sizes; queue hiding and removal discard focus.');
  } catch (error) {
    evidence.assertionsPassed = false; evidence.failure = error.stack;
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'ui-focus-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
