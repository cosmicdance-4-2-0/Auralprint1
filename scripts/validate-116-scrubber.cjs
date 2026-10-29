// AUD116-004 / AUD116-R2-001: production listeners, paused media and trusted CDP input.
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
  workingTree: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  scrubberBlob: execFileSync('git', ['hash-object', 'src/js/audio/scrubber.js'], { cwd: root, encoding: 'utf8' }).trim(),
  harnessSha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  browser: '', platform: process.platform, editions: [], checks: [], failures: [], errors: [],
  qualification: 'Real paused 10-second HTMLMediaElement and production Scrubber. Mouse/touch input is CDP/Playwright; blur/focus and selective touchcancel are explicitly dispatched. CDP only supports cancellation of all contacts. Reinitialization and direct reset/load seams are exercised in source/isolated editions; built editions use public File/Queue reset/load actions. Physical OS focus loss, missing mouseup incidence, physical touch, Windows, Firefox/WebKit and direct-file/offline behavior are not certified.' };
function check(name, actual, expected) {
  report.checks.push(name);
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
    // Count actual active registrations through repeated source-module init.
    const registrations = new Map();
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, handler, options) {
      if (!registrations.has(this)) registrations.set(this, new Map());
      const types = registrations.get(this);
      if (!types.has(type)) types.set(type, new Set());
      types.get(type).add(handler);
      return add.call(this, type, handler, options);
    };
    EventTarget.prototype.removeEventListener = function (type, handler, options) {
      registrations.get(this)?.get(type)?.delete(handler);
      return remove.call(this, type, handler, options);
    };
    window.scrubberListenerCounts = () => [document.getElementById('scrubberCanvas'), window, document]
      .map(target => [...(registrations.get(target)?.values() || [])].reduce((n, handlers) => n + handlers.size, 0));
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
  let box = await canvas.boundingBox();
  const x = f => box.x + box.width * f;
  let y = box.y + box.height / 2;
  const outsideY = box.y > 24 ? box.y - 15 : box.y + box.height + 15;
  const refreshBounds = async () => { box = await canvas.boundingBox(); y = box.y + box.height / 2; };
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

  // CDP touchEnd points name the released contacts; [] releases all contacts.
  // Check the delivered changedTouches as well as media time, independently of
  // the historical R2 harness and without changing production event handlers.
  const point = (id, fraction, yy = y) => ({ id, x: x(fraction), y: yy, radiusX: 1, radiusY: 1, force: 1 });
  const dispatch = async (type, touchPoints) => {
    const length = await page.evaluate(() => scrubberEvents.length);
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    // Chromium may acknowledge coalesced touch input before DOM delivery.
    await page.waitForFunction(({ length, type }) => scrubberEvents.slice(length).some(e => e.type === type),
      { length, type: type.toLowerCase() });
  };
  const lastTouch = () => page.evaluate(() => {
    const e = [...scrubberEvents].reverse().find(e => e.type.startsWith('touch'));
    return { type: e.type, changed: [...e.changedTouches].map(t => t.identifier), prevented: e.defaultPrevented, trusted: e.isTrusted };
  });
  const A = point(11, .1, outsideY), B = point(22, .8), movedA = point(11, .3, outsideY);
  await dispatch('touchStart', [A]);
  await dispatch('touchStart', [A, B]); await at('outside first: B owns initial seek', 8);
  check(edition + ' B is newly changed contact', await lastTouch(), { type: 'touchstart', changed: [22], prevented: true, trusted: true });
  await dispatch('touchMove', [movedA, B]); await at('outside A movement cannot seek stationary B', 8);
  check(edition + ' unrelated move is unconsumed', (await lastTouch()).prevented, false);
  await dispatch('touchEnd', [movedA]);
  check(edition + ' native end identifies A', (await lastTouch()).changed, [11]);
  await dispatch('touchMove', [point(22, .6)]); await at('ending A retains B drag', 6);
  await dispatch('touchEnd', []);

  await dispatch('touchStart', [point(23, .2)]);
  await dispatch('touchStart', [point(23, .2), point(24, .9, outsideY)]);
  check(edition + ' outside contact start is unconsumed', (await lastTouch()).prevented, false);
  await dispatch('touchEnd', [point(24, .9, outsideY)]);
  await dispatch('touchMove', [point(23, .6)]); await at('scrubber first survives outside contact add/end', 6);
  await dispatch('touchEnd', []);

  // CDP rejects selective touchCancel, so supply its DOM payload explicitly
  // while keeping the native initiating contact and native moves.
  await dispatch('touchStart', [point(34, .2)]);
  await page.evaluate(() => {
    const canvas = document.getElementById('scrubberCanvas');
    const other = new Touch({ identifier: 99, target: document.body, clientX: 0, clientY: 0 });
    const owned = new Touch({ identifier: 34, target: canvas, clientX: 0, clientY: 0 });
    window.dispatchEvent(new TouchEvent('touchcancel', { changedTouches: [other], touches: [owned] }));
  });
  await dispatch('touchMove', [point(34, .6)]); await at('unrelated explicit cancel preserves native owner', 6);
  await page.evaluate(() => {
    const owned = new Touch({ identifier: 34, target: document.getElementById('scrubberCanvas'), clientX: 0, clientY: 0 });
    window.dispatchEvent(new TouchEvent('touchcancel', { changedTouches: [owned] }));
  });
  await dispatch('touchMove', [point(34, .8)]); await at('owned explicit cancel ignores subsequent native move', 6);
  await dispatch('touchEnd', []);

  await dispatch('touchStart', [point(31, .2)]);
  await dispatch('touchStart', [point(31, .2), point(32, .9)]); await at('second scrubber contact cannot replace owner', 2);
  await dispatch('touchMove', [point(31, .2), point(32, .7)]); await at('second scrubber contact cannot seek', 2);
  await dispatch('touchEnd', [point(32, .7)]);
  await dispatch('touchMove', [point(31, .5)]); await at('scrubber first survives unrelated end', 5);
  await dispatch('touchCancel', []);
  await move(.8, 0); await at('owned native cancellation retains last seek', 5);
  await dispatch('touchStart', [point(33, .4)]);
  await dispatch('touchMove', [point(33, .6)]); await at('fresh touch after native cancel', 6);
  await dispatch('touchEnd', []);

  // Simultaneous starts/moves and rapid add/end while the owner is stationary.
  await dispatch('touchStart', [point(41, .2), point(42, .8)]);
  check(edition + ' simultaneous start selects one changed contact', Math.abs(await time() - 2) < .05, true);
  await dispatch('touchMove', [point(41, .4), point(42, .7)]); await at('simultaneous move follows initiating contact', 4);
  await dispatch('touchEnd', [point(41, .4)]);
  await dispatch('touchMove', [point(42, .6)]); await at('remaining contact cannot inherit ended owner', 4);
  await dispatch('touchEnd', []);
  await dispatch('touchStart', [point(50, .3)]);
  for (let id = 51; id < 55; id++) {
    await dispatch('touchStart', [point(50, .3), point(id, .9)]);
    await dispatch('touchEnd', [point(id, .9)]);
  }
  await dispatch('touchMove', [point(50, .7)]); await at('rapid unrelated changes retain owner', 7);
  await dispatch('touchEnd', []);

  if (edition === 'source' || edition === 'isolated') {
    // Public module lifecycle seams; built editions below exercise File loading
    // and the UI's reset/unload path without exposing bundled internals.
    for (const terminal of ['reset', 'load', 'init']) {
      await dispatch('touchStart', [point(60, .2)]);
      const counts = await page.evaluate(() => scrubberListenerCounts());
      await page.evaluate(async terminal => {
        const { Scrubber } = await import('/src/js/audio/scrubber.js');
        if (terminal === 'reset') Scrubber.reset();
        if (terminal === 'load') await Scrubber.loadFile({ size: NaN });
        if (terminal === 'init') for (let i = 0; i < 20; i++) Scrubber.init(document.getElementById('scrubberCanvas'));
      }, terminal);
      await refreshBounds();
      check(edition + ' ' + terminal + ' keeps listener counts', await page.evaluate(() => scrubberListenerCounts()), counts);
      await dispatch('touchMove', [point(60, .8)]); await at(terminal + ' cancels active touch', 2);
      check(edition + ' ' + terminal + ' stale touch unconsumed', (await lastTouch()).prevented, false);
      await dispatch('touchEnd', []);
      await dispatch('touchStart', [point(61, .4)]);
      await dispatch('touchMove', [point(61, .6)]); await at(terminal + ' fresh touch recovers', 6);
      await dispatch('touchEnd', []);
    }
  }
  if (edition !== 'isolated') {
    for (const clear of [false, true]) {
      await dispatch('touchStart', [point(70, .2)]);
      if (clear) await page.evaluate(() => document.getElementById('btnClearQueue').click());
      await page.locator('#fileInput').setInputFiles({ name: 'replacement-' + clear + '.wav', mimeType: 'audio/wav', buffer: mediaBytes });
      if (!clear) await page.evaluate(() => document.getElementById('btnNext').click());
      await page.waitForFunction(() => auditMedia && !auditMedia.paused && document.getElementById('btnPlay').textContent === 'Pause');
      await page.evaluate(() => document.getElementById('btnPlay').click());
      await page.waitForFunction(() => auditMedia.paused);
      await refreshBounds();
      const position = await time();
      await dispatch('touchMove', [point(70, .8)]); await at('UI ' + (clear ? 'reset/unload and ' : '') + 'File load abandons old contact', position);
      await dispatch('touchEnd', []);
      await refreshBounds();
      await dispatch('touchStart', [point(71, .4)]);
      await refreshBounds();
      await dispatch('touchMove', [point(71, .6)]); await at('UI File load fresh touch recovers ' + clear, 6);
      await dispatch('touchEnd', []);
    }
  }
  check(edition + ' remains paused', await page.evaluate(() => auditMedia.paused), true);
  entry.events = await page.evaluate(() => scrubberEvents.map(e => ({ type: e.type, trusted: e.isTrusted,
    buttons: e.buttons, prevented: e.defaultPrevented, canvas: e.target.id === 'scrubberCanvas',
    touches: e.touches && [...e.touches].map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY, target: t.target.id })),
    changed: e.changedTouches && [...e.changedTouches].map(t => t.identifier) })));
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
    console.log(JSON.stringify({ report: output, editions: report.editions.map(e => e.edition), checks: report.checks.length, failures: report.failures, errors: report.errors }));
  }
  if (report.failures.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
