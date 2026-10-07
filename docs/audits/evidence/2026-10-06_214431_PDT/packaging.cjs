const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = process.env.AUDIT_REPO_ROOT || process.cwd();
const output = process.env.AUDIT_OUTPUT_DIR || __dirname;
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const file = path.join(root, 'dist', `auralprint_${version.slice(1)}.html`);
(async () => {
  const bytes = fs.readFileSync(file);
  const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    let page = await browser.newPage();
    const exceptions = [];
    page.on('pageerror', e => exceptions.push(e.message));
    let directFileBoot;
    try {
      await page.goto(pathToFileURL(file).href);
      directFileBoot = 'passed';
    } catch (error) {
      if (!error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) throw error;
      directFileBoot = 'environment blocked file URL navigation (ERR_BLOCKED_BY_ADMINISTRATOR)';
    }
    await page.close();
    page = await browser.newPage();
    page.on('pageerror', e => exceptions.push(e.message));
    await page.goto(process.env.AUDIT_APP_URL || `http://127.0.0.1:8000/auralprint_${version.slice(1)}.html`);
    await page.waitForFunction(() => document.querySelector('#c').width > 0 && document.querySelector('#btnPlay').disabled);
    const links = await page.locator('head link').evaluateAll(nodes => nodes.map(n => ({ rel: n.rel, href: n.getAttribute('href') })));
    const missingResources = links.filter(n => n.href?.startsWith('/') && !fs.existsSync(path.join(root, n.href)));
    assert.equal(exceptions.length, 0);
    assert.equal(missingResources.length, 5);
    const result = { version, browser: await browser.version(), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), httpBoot: true, directFileBoot, applicationExceptions: exceptions, rootRelativeMissingResources: missingResources, externalScripts: /<script[^>]+src=/i.test(bytes.toString()), externalStylesheets: /<link[^>]+stylesheet/i.test(bytes.toString()) };
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'packaging-results.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
