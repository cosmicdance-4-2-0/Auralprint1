// AUD116-004: production listeners + paused native media + trusted CDP input.
// AP_REPO_ROOT / AP_SCRUBBER_EDITIONS=isolated permit an exact baseline run.
// --observe records failing expectations without concealing the nonzero result.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(process.env.AP_REPO_ROOT || path.join(__dirname, '..'));
const output = path.resolve(process.env.AP_REPORT || path.join(root, 'work/aud004/native.json'));
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const report = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  browser: '', platform: process.platform, editions: [], failures: [], errors: [],
  qualification: 'Real paused 10-second HTMLMediaElement and production Scrubber. Mouse/touch input is CDP/Playwright; blur and focus signals are explicitly dispatched, as in the original audit. Headless tab switching did not deliver native blur. Physical OS focus loss, missing mouseup incidence, physical touch, Windows, Firefox/WebKit and direct-file/offline behavior are not certified.' };
function check(name, actual, expected) {
  try { assert.deepEqual(actual, expected); }
  catch (error) { report.failures.push({ name, actual, expected }); if (!process.argv.includes('--observe')) throw new Error(name, { cause: error }); }
}
function wav() {
  const b = Buffer.alloc(44 + 48000 * 10 * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(48000, 24); b.writeUInt32LE(96000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
  return b;
}
const mediaBytes = wav();
const server = http.createServer((req, res) => {
  try {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (pathname === '/ten.wav') { res.setHeader('Content-Type', 'audio/wav'); return res.end(mediaBytes); }
    if (pathname === '/isolated') {
      res.setHeader('Content-Type', 'text/html');
      return res.end('<!doctype html><title>Scrubber native regression</title><canvas id="scrubberCanvas" width="600" height="60" style="width:600px;height:60px;touch-action:none"></canvas>');
    }
    if (pathname === '/source') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8')
        .replaceAll('__AURALPRINT_VERSION__', version)
        .replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>')
        .replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>'));
    }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});

async function run(page, edition, base) {
  const entry = { edition, observations: [], events: [] }; report.editions.push(entry);
  await page.addInitScript(() => {
    window.scrubberEvents = [];
    for (const type of ['mousedown', 'mousemove', 'mouseup', 'blur', 'focus', 'touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      window.addEventListener(type, e => scrubberEvents.push(e));
    }
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) { window.auditMedia = this; return play.apply(this, args); };
  });
  const file = edition === 'portable' ? '/dist/auralprint_' + version.slice(1) + '.html' : edition === 'hosted' ? '/dist/hosted/index.html' : '/' + edition;
  await page.goto(base + file);
  if (edition === 'isolated') {
    await page.evaluate(async () => {
      const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
      const { Scrubber } = await import('/src/js/audio/scrubber.js');
      const { resolveSettings } = await import('/src/js/core/preferences.js'); resolveSettings();
      window.auditMedia = document.createElement('audio');
      auditMedia.src = URL.createObjectURL(await (await fetch('/ten.wav')).blob());
      await new Promise((resolve, reject) => { auditMedia.onloadedmetadata = resolve; auditMedia.onerror = reject; auditMedia.load(); });
      AudioEngine.getMediaEl = () => auditMedia; Scrubber.init(document.getElementById('scrubberCanvas'));
    });
  } else {
    await page.waitForFunction(() => document.querySelector('.orb-editor-card'));
    await page.evaluate(() => { const panel = document.getElementById('audioPanel'); if (getComputedStyle(panel).display === 'none') document.getElementById('btnOpenAudio').click(); });
    await page.locator('#fileInput').setInputFiles({ name: 'aud004-ten.wav', mimeType: 'audio/wav', buffer: mediaBytes });
    await page.waitForFunction(() => window.auditMedia && !auditMedia.paused && document.getElementById('btnPlay').textContent === 'Pause');
    await page.locator('#btnPlay').click(); await page.waitForFunction(() => auditMedia.paused);
    await page.evaluate(() => { auditMedia.currentTime = 0; });
  }
  const canvas = page.locator('#scrubberCanvas'); await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox(), x = f => box.x + box.width * f, y = box.y + box.height / 2;
  const outsideY = box.y > 24 ? box.y - 15 : box.y + box.height + 15;
  const cdp = await page.context().newCDPSession(page);
  const time = () => page.evaluate(() => auditMedia.currentTime);
  async function at(name, expected) {
    const actual = await time(); entry.observations.push({ name, actual, expected });
    check(edition + ' ' + name, Math.abs(actual - expected) < .05, true);
  }
  const move = (fraction, buttons = 1, yy = y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x(fraction), y: yy, buttons });
  const press = async (fraction = .2) => { await page.mouse.move(x(fraction), y); await page.mouse.down(); };
  check(edition + ' native media', await page.evaluate(() => auditMedia instanceof HTMLMediaElement && auditMedia.duration === 10 && auditMedia.paused), true);

  await press(); await at('original initial press', 2);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await at('blur itself does not seek', 2);
  await move(.8, 0); await at('original abandoned movement', 2);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await move(.8, 0); await at('focus does not restore drag', 2);
  await page.mouse.up();
  await press(); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await move(.8, 1); await at('blur cancels before released-button fallback', 2); await page.mouse.up();
  await press(.3); await move(.6); await at('fresh held drag', 6);
  await move(.7, 1, outsideY); await at('held drag outside canvas', 7);
  await page.mouse.move(x(.7), outsideY); await page.mouse.up();
  await move(.9, 0); await at('mouseup outside ends drag', 7);

  await press(); await move(.8, 0); await at('missing mouseup without blur', 2);
  await move(.9, 1); await at('held bit cannot resurrect cancelled drag', 2); await page.mouse.up();
  for (let i = 0; i < 4; i++) {
    await press(); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await move(.8, 0); await at('consecutive cancel ' + i, 2); await page.mouse.up();
    await press(.4); await move(.5); await at('consecutive recovery ' + i, 5); await page.mouse.up();
  }
  for (const [button, buttons] of [['middle', 4], ['right', 2]]) {
    await page.mouse.move(x(.2), y); await page.mouse.down({ button });
    await move(.4, buttons); await at(button + ' held drag retains existing behavior', 4);
    await move(.8, 1); await at(button + ' initiating bit required', 4);
    await page.mouse.up({ button });
  }
  // CDP-generated touch events keep native buttons semantics independent of touch.
  const touch = (type, fraction) => cdp.send('Input.dispatchTouchEvent', { type,
    touchPoints: fraction == null ? [] : [{ x: x(fraction), y, id: 1 }] });
  await touch('touchStart', .2); await at('touch press', 2);
  await touch('touchMove', .6); await at('touch move', 6);
  await touch('touchEnd'); await move(.8, 0); await at('touchend ends drag', 6);
  await touch('touchStart', .3); await touch('touchCancel'); await move(.8, 0); await at('touchcancel ends drag', 3);
  check(edition + ' remains paused', await page.evaluate(() => auditMedia.paused), true);
  entry.events = await page.evaluate(() => scrubberEvents.map(e => ({ type: e.type, trusted: e.isTrusted,
    buttons: e.buttons, prevented: e.defaultPrevented, canvas: e.target.id === 'scrubberCanvas' })));
  check(edition + ' native held mouse semantics', entry.events.some(e => e.type === 'mousemove' && e.trusted && e.buttons === 1), true);
  check(edition + ' native released mouse semantics', entry.events.some(e => e.type === 'mousemove' && e.trusted && e.buttons === 0), true);
  check(edition + ' native touch preventDefault', entry.events.some(e => e.type === 'touchmove' && e.trusted && e.prevented), true);
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || undefined, headless: true,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    report.browser = browser.version();
    for (const edition of (process.env.AP_SCRUBBER_EDITIONS || 'isolated,source,portable,hosted').split(',')) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, hasTouch: true });
      page.on('pageerror', e => report.errors.push({ edition, message: e.message }));
      page.on('console', m => { if (m.type() === 'error') report.errors.push({ edition, message: m.text() }); });
      await run(page, edition, 'http://127.0.0.1:' + server.address().port); await page.close();
    }
    check('unexpected console/page errors', report.errors, []);
  } finally {
    if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ report: output, editions: report.editions.map(e => e.edition), failures: report.failures, errors: report.errors }));
  }
  if (report.failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
