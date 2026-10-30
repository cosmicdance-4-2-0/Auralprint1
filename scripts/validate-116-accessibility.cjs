// Native Chromium controls against production source, portable and hosted editions.
// Run after npm run build. Evidence stays under work/ unless AP_REPORT is supplied.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const output = path.resolve(process.env.AP_REPORT || path.join(root, 'work/116-accessibility/native.json'));
const QUEUE_PLAYBACK_PROGRESS_SECONDS = .15;
// Allow slow CI five seconds to advance 150 ms; the watchdog must not depend on RAF.
const QUEUE_PLAYBACK_TIMEOUT_MS = 5_000;
const report = { version, browser: '', cases: [], errors: [],
  qualification: 'Linux headless Chromium; trusted keyboard/mouse input and real WAV playback over local HTTP. Mic/Stream use generated MediaStreams, unavailable metadata is injected, and the finalization lock is projected through production UI in the source edition. Physical touch, OS permission dialogs, screen-reader speech, Windows, Firefox and Safari are not certified.' };
function wav(seconds) {
  const rate = 8000, b = Buffer.alloc(44 + rate * seconds * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
  return b;
}
const payload = (name, duration = 80) => ({ name, mimeType: 'audio/wav', buffer: wav(duration) });
const server = http.createServer((req, res) => {
  try {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (pathname === '/source') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8')
        .replaceAll('__AURALPRINT_VERSION__', version)
        .replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>')
        .replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>'));
    }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function unavailable(slider) {
  assert.equal(await slider.getAttribute('aria-disabled'), 'true');
  assert.equal(await slider.getAttribute('tabindex'), '-1');
  for (const key of ['min', 'max', 'now']) assert.equal(await slider.getAttribute('aria-value' + key), '0');
  assert.equal(await slider.getAttribute('aria-valuetext'), 'Playback unavailable');
}
async function visibleFocus(locator) {
  assert.equal(await locator.evaluate(el => el === document.activeElement && el.matches(':focus-visible')
    && getComputedStyle(el).outlineStyle === 'solid' && parseFloat(getComputedStyle(el).outlineWidth) > 0), true);
}
// Self-contained for page.evaluate(); Node regressions exercise the same callback.
function observeQueuePlaybackProgress({ progressSeconds, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const media = activeMedia(), start = media.currentTime, target = start + progressSeconds;
    let count = 0, frameId = null, timeoutId = null, settled = false;
    const observer = new MutationObserver(records => { count += records.length; });
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (frameId !== null) cancelAnimationFrame(frameId);
      count += observer.takeRecords().length;
      observer.disconnect();
      if (error) reject(error); else resolve(count);
    }
    function sample() {
      frameId = null;
      if (settled) return;
      try {
        if (media.currentTime >= target) finish();
        else frameId = requestAnimationFrame(sample);
      } catch (error) { finish(error); }
    }
    try {
      observer.observe(document.getElementById('queueList'), { subtree: true, attributes: true, childList: true, characterData: true });
      timeoutId = setTimeout(() => {
        try {
          finish(new Error(`Queue playback progress timed out after ${timeoutMs} ms: start=${start} s, observed=${media.currentTime} s, targetProgress=${progressSeconds} s, target=${target} s`));
        } catch (error) { finish(error); }
      }, timeoutMs);
      frameId = requestAnimationFrame(sample);
    } catch (error) { finish(error); }
  });
}
async function assertQueueUnchangedDuringPlayback(page) {
  const mutations = await page.evaluate(observeQueuePlaybackProgress, {
    progressSeconds: QUEUE_PLAYBACK_PROGRESS_SECONDS, timeoutMs: QUEUE_PLAYBACK_TIMEOUT_MS,
  });
  assert.equal(mutations, 0);
}
async function run(page, edition, width, base) {
  const entry = { edition, width, checks: [] }; report.cases.push(entry);
  const checked = name => entry.checks.push(name);
  await page.addInitScript(() => {
    const media = [], descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
    window.seekWrites = 0; window.playCalls = 0;
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { ...descriptor,
      set(value) { window.seekWrites++; return descriptor.set.call(this, value); } });
    const create = document.createElement.bind(document);
    document.createElement = function (tag, ...rest) {
      const el = create(tag, ...rest); if (tag === 'audio') media.push(el); return el;
    };
    window.activeMedia = () => media.findLast(el => el.getAttribute('src'));
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = async function (...args) {
      window.playCalls++;
      if (window.holdNextPlay) { window.holdNextPlay = false; await new Promise(resolve => { window.releasePlay = resolve; }); }
      return play.apply(this, args);
    };
    const capture = async () => {
      const ctx = new AudioContext(), destination = ctx.createMediaStreamDestination();
      (window.captureContexts ??= []).push(ctx); return destination.stream;
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: capture });
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: capture });
  });
  const file = edition === 'portable' ? '/dist/auralprint_' + version.slice(1) + '.html'
    : edition === 'hosted' ? '/dist/hosted/index.html' : '/source';
  await page.goto(base + file);
  await page.waitForFunction(() => document.querySelector('.orb-editor-card'));
  if (!await page.locator('#audioPanel').isVisible()) await page.locator('#btnOpenAudio').click();
  const slider = page.getByRole('slider', { name: 'Playback position', exact: true });
  assert.equal(await slider.count(), 1); await unavailable(slider); checked('named unavailable slider');
  await page.evaluate(() => { window.holdNextPlay = true; });
  await page.locator('#fileInput').setInputFiles(payload('same.wav'));
  await page.waitForFunction(() => window.releasePlay);
  await frames(page); await unavailable(slider); checked('pending File has no stale values');
  await page.evaluate(() => window.releasePlay());
  await page.waitForFunction(() => document.getElementById('btnPlay').textContent === 'Pause'
    && document.getElementById('scrubberCanvas').getAttribute('aria-disabled') === 'false');
  await page.locator('#btnPlay').click(); await frames(page);
  assert.equal(await slider.getAttribute('aria-valuemin'), '0');
  assert.equal(await slider.getAttribute('aria-valuemax'), '80');
  assert.equal(await slider.getAttribute('aria-disabled'), 'false');
  // Reverse Tab from the following native control reaches the canvas slider.
  await page.locator('#btnWaveformOptions').focus(); await page.keyboard.press('Shift+Tab');
  await visibleFocus(slider); checked('Tab reachability and visible slider focus');
  await page.evaluate(() => { activeMedia().currentTime = 40; window.seekWrites = 0; });
  for (const [key, expected] of [['ArrowLeft', 35], ['ArrowDown', 30], ['ArrowRight', 35], ['ArrowUp', 40],
    ['Shift+ArrowLeft', 10], ['Shift+ArrowDown', 0], ['Shift+ArrowRight', 30], ['Shift+ArrowUp', 60],
    ['Home', 0], ['ArrowLeft', 0], ['End', 80], ['ArrowRight', 80]]) {
    await page.evaluate(() => { window.seekWrites = 0; });
    await page.keyboard.press(key); await frames(page);
    assert.equal(await page.evaluate(() => activeMedia().currentTime), expected, key);
    assert.equal(await page.evaluate(() => seekWrites), 1, 'duplicate or missing seek: ' + key);
    assert.equal(await slider.getAttribute('aria-valuenow'), String(expected));
  }
  assert.equal(await slider.getAttribute('aria-valuetext'), '1:20 of 1:20'); checked('all slider keys, Shift, bounds and single seeks');
  await page.keyboard.press('n'); await page.keyboard.press('h');
  assert.equal(await page.locator('#audioPanel').isVisible(), true);
  assert.equal(await slider.getAttribute('aria-valuemax'), '80'); checked('focused slider suppresses global shortcuts');
  await page.evaluate(() => { activeMedia().currentTime = 40; window.seekWrites = 0; });
  await page.locator('#c').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowLeft');
  assert.equal(await page.evaluate(() => activeMedia().currentTime), 15);
  assert.equal(await page.evaluate(() => seekWrites), 2); checked('global Left/Right seeking retained');
  await page.evaluate(() => { Object.defineProperty(activeMedia(), 'duration', { configurable: true, value: NaN }); });
  await frames(page); await unavailable(slider);
  await page.evaluate(() => { delete activeMedia().duration; }); await frames(page);
  assert.equal(await slider.getAttribute('aria-valuemax'), '80'); checked('unavailable duration resets and recovers');

  await page.locator('#fileInput').setInputFiles([payload('same.wav', 90), payload('same.wav', 100)]);
  await page.locator('#btnToggleQueue').click();
  assert.equal(await page.locator('.queue-item > button.q-play + button.q-remove').count(), 3);
  assert.equal(await page.locator('.queue-item[role], .queue-item[tabindex], .queue-item button button').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Play queue item 2: same.wav', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Remove queue item 2: same.wav', exact: true }).count(), 1);
  await page.locator('#btnHideQueue').focus(); await page.keyboard.press('Tab');
  await visibleFocus(page.locator('.q-play').nth(0)); await page.keyboard.press('Tab');
  await visibleFocus(page.locator('.q-remove').nth(0)); await page.keyboard.press('Tab');
  await visibleFocus(page.locator('.q-play').nth(1)); checked('sibling buttons, distinct names and native Tab order');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => activeMedia()?.duration === 90 && document.querySelector('.q-play[aria-current="true"] .q-idx')?.textContent === '2'
    && document.getElementById('scrubberCanvas').getAttribute('aria-disabled') === 'false');
  await frames(page); await visibleFocus(page.locator('.q-play').nth(1));
  await page.locator('#btnPlay').click();
  await page.evaluate(() => { window.selectedMedia = activeMedia(); window.savedPlayCalls = playCalls; });
  await page.locator('.q-remove').nth(0).focus(); await page.keyboard.press('Space');
  assert.equal(await page.locator('.q-play').count(), 2);
  assert.equal(await page.evaluate(() => activeMedia() === selectedMedia && playCalls === savedPlayCalls && activeMedia().paused), true);
  await visibleFocus(page.locator('.q-remove').nth(0)); checked('Space removes once without selecting/playing; successor focus');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => activeMedia()?.duration === 100 && document.getElementById('btnPlay').textContent === 'Play'
    && document.getElementById('scrubberCanvas').getAttribute('aria-disabled') === 'false');
  assert.equal(await page.evaluate(() => activeMedia().paused), true);
  await frames(page); await visibleFocus(page.locator('.q-remove').nth(0)); checked('active removal hands off paused intent and focus');
  await page.keyboard.press('Shift+Tab'); await visibleFocus(page.locator('.q-play'));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('btnPlay').textContent === 'Pause'
    && document.getElementById('scrubberCanvas').getAttribute('aria-disabled') === 'false');
  await frames(page); checked('native Space activates Play');
  await assertQueueUnchangedDuringPlayback(page); checked('ordinary playback causes zero Queue DOM/ARIA writes');
  assert.ok(Number(await slider.getAttribute('aria-valuenow')) > 0); checked('playback updates slider');
  const layout = await page.locator('.queue-item').evaluate(row => {
    const play = row.querySelector('.q-play'), name = row.querySelector('.q-name'), remove = row.querySelector('.q-remove');
    const r = row.getBoundingClientRect(), p = play.getBoundingClientRect(), n = name.getBoundingClientRect(), x = remove.getBoundingClientRect();
    return { rowHeight: r.height, playHeight: p.height, indexWidth: row.querySelector('.q-idx').getBoundingClientRect().width,
      filenameOffset: n.left - r.left, gap: x.left - p.right, right: r.right - x.right, truncation: getComputedStyle(name).textOverflow };
  });
  assert.equal(layout.indexWidth, 28); assert.equal(layout.filenameOffset, 34);
  assert.equal(layout.gap, 6); assert.equal(layout.right, 0); assert.equal(layout.truncation, 'ellipsis');
  assert.ok(layout.playHeight >= layout.rowHeight); entry.layout = layout; checked('row layout, filename truncation and full-height Play target');
  await page.screenshot({ path: path.join(path.dirname(output), `${edition}-${width}.png`) });
  if (edition === 'source') {
    await page.evaluate(async () => {
      const { UI } = await import('/src/js/ui/ui.js'); const { state } = await import('/src/js/core/state.js');
      state.recording.phase = 'finalizing'; UI.refreshAllUiText();
    });
    assert.equal(await page.locator('.q-play').isDisabled(), true); assert.equal(await page.locator('.q-remove').isDisabled(), true);
    await page.evaluate(() => { document.querySelector('.q-remove').click(); document.querySelector('.q-play').click(); });
    assert.equal(await page.locator('.q-play').count(), 1);
    await page.evaluate(async () => {
      const { UI } = await import('/src/js/ui/ui.js'); const { state } = await import('/src/js/core/state.js');
      const { Scrubber } = await import('/src/js/audio/scrubber.js');
      state.recording.phase = 'idle';
      for (let i = 0; i < 20; i++) { UI.wireControls(); Scrubber.init(document.getElementById('scrubberCanvas')); }
      UI.refreshAllUiText();
    });
    await page.locator('#btnPlay').click();
    await slider.focus(); await page.evaluate(() => { activeMedia().currentTime = 40; window.seekWrites = 0; });
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => activeMedia().currentTime === 45 && seekWrites === 1), true);
    checked('finalization lock and repeated UI/scrubber initialization');
  }
  for (const kind of ['Mic', 'Stream']) {
    await page.locator('#btnSource' + kind).click();
    await page.waitForFunction(kind => document.getElementById('btnSource' + kind).title.includes('Live input active'), kind);
    await frames(page); await unavailable(slider);
    await page.locator('#btnSourceFile').click(); await frames(page); await unavailable(slider);
    await page.locator('#btnToggleQueue').click(); await page.locator('.q-play').click();
    await page.waitForFunction(() => document.getElementById('btnPlay').textContent === 'Pause');
  }
  checked('Mic/Stream and idle File expose no stale seek values');
  await page.evaluate(() => { activeMedia().currentTime = activeMedia().duration - .05; });
  await page.waitForFunction(() => activeMedia().ended);
  await frames(page);
  assert.equal(await slider.getAttribute('aria-valuenow'), await slider.getAttribute('aria-valuemax')); checked('natural EOF updates position');
  await page.locator('.q-remove').focus(); await page.keyboard.press('Enter'); await frames(page);
  await unavailable(slider); assert.equal(await page.locator('.q-play').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'btnHideQueue'); checked('final-item clearing and Hide focus');
  const longName = 'Long recording session '.repeat(40) + '.wav';
  await page.locator('#fileInput').setInputFiles(payload(longName));
  await page.waitForFunction(() => document.getElementById('scrubberCanvas').getAttribute('aria-disabled') === 'false');
  await frames(page);
  const name = page.locator('.q-name');
  assert.equal(await name.textContent(), longName);
  const truncation = await page.evaluate(() => {
    const el = document.querySelector('.q-name');
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });
  assert.ok(truncation.scroll > truncation.client, JSON.stringify(truncation));
  assert.equal(await page.locator('.queue-item').getAttribute('title'), longName); checked('full filename retained with actual visual truncation');
  await page.locator('#btnClearQueue').focus(); await page.keyboard.press('Space'); await frames(page);
  await unavailable(slider); assert.equal(await page.evaluate(() => document.activeElement.id), 'btnHideQueue'); checked('Clear resets slider and preserves focus');
}
module.exports = { assertQueueUnchangedDuringPlayback, QUEUE_PLAYBACK_PROGRESS_SECONDS, QUEUE_PLAYBACK_TIMEOUT_MS };
if (require.main === module) (async () => {
  let browser;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    report.browser = browser.version();
    for (const edition of ['source', 'portable', 'hosted']) for (const width of [1280, 375]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.on('pageerror', e => report.errors.push({ edition, width, message: e.message }));
      page.on('console', m => { if (m.type() === 'error') report.errors.push({ edition, width, message: m.text() }); });
      await run(page, edition, width, 'http://127.0.0.1:' + server.address().port); await page.close();
    }
    assert.deepEqual(report.errors, []);
  } finally {
    if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ report: output, browser: report.browser, cases: report.cases.map(c => ({ edition: c.edition, width: c.width, checks: c.checks.length })), errors: report.errors }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
