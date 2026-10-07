// Optional native keyboard regression; external Playwright is not a dependency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const html = fs.readFileSync(path.join(root, 'dist', `auralprint_${version.slice(1)}.html`), 'utf8');
const expectedDefect = process.env.RC11_EXPECT_DEFECT === '1';
async function modes(page) {
  await page.evaluate(() => document.querySelector('#btnShare').click());
  return page.evaluate(() => JSON.parse(atob(location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/'))).prefs.orbs.map(o => o.trace.lineColorMode));
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const results = [];
  try {
    for (const desired of expectedDefect ? ['dominantBand'] : ['fixed', 'lastParticle', 'dominantBand']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('http://rc11.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
      await page.goto('http://rc11.test/');
      await page.waitForFunction(() => document.querySelector('.orb-editor-card'));
      await page.locator('#btnOpenVisualizers').click();
      const first = page.locator('.orb-editor-card').first();
      await first.locator('> summary').click();
      const control = first.locator('select[id$="line-color"]');
      await control.evaluate(el => el.closest('details').open = true);
      await control.selectOption('fixed');
      const bulk = page.locator('#selLineColorMode');
      await bulk.evaluate(el => { el.closest('details').open = true; window.bulkChanges = 0; el.addEventListener('change', () => window.bulkChanges++); });
      const before = { value: await bulk.inputValue(), readout: await page.locator('#valLineColorMode').innerText(), modes: await modes(page) };
      assert.deepEqual(before.modes, ['fixed', 'dominantBand']);
      assert.equal(before.readout, 'mixed');
      assert.equal(before.value, expectedDefect ? 'dominantBand' : '');
      await bulk.focus(); await bulk.press('Alt+ArrowDown');
      if (desired === 'dominantBand') await bulk.press('End');
      else { await bulk.press('Home'); if (desired === 'lastParticle') await bulk.press('ArrowDown'); }
      await bulk.press('Enter');
      const after = { value: await bulk.inputValue(), modes: await modes(page), changes: await page.evaluate(() => window.bulkChanges) };
      assert.deepEqual(after.modes, expectedDefect ? ['fixed', 'dominantBand'] : [desired, desired]);
      assert.equal(after.changes, expectedDefect ? 0 : 1);
      assert.deepEqual(errors, []);
      results.push({ desired, before, after, errors });
      await page.close();
    }
    const result = { version, browser: await browser.version(), expectedDefect, results };
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
