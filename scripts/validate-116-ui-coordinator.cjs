// AUD116-R2-002: native public reinitialization and coordinator ownership gate.
// Run after npm run build. AP_REPRO_ONLY=1/AP_OBSERVE=1 records the baseline.
// Built editions receive only a test export at the end of their existing IIFE;
// no production file is rewritten and no second source UI instance is imported.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(process.env.AP_REPO_ROOT || path.join(__dirname, '..'));
const output = path.resolve(process.env.AP_REPORT || path.join(root, 'work/116-r2-002/native.json'));
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const report = { browser: null, checks: [], failures: [], errors: [], observations: [] };
function check(name, actual, expected) {
  report.checks.push(name);
  try { assert.deepEqual(actual, expected); }
  catch (e) { report.failures.push({ name, actual, expected }); if (!process.env.AP_OBSERVE) throw e; }
}
const exportsCode = 'globalThis.coordinatorTest = { UI, state, preferences, Queue, AudioEngine, InputSourceManager, RecorderEngine, Scrubber, UrlPreset };';
const sourceExports = `<script type="module">
import { UI } from '/src/js/ui/ui.js'; import { state } from '/src/js/core/state.js';
import { preferences } from '/src/js/core/preferences.js'; import { Queue } from '/src/js/audio/queue.js';
import { AudioEngine } from '/src/js/audio/audio-engine.js'; import { InputSourceManager } from '/src/js/audio/input-source-manager.js';
import { RecorderEngine } from '/src/js/recording/recorder-engine.js'; import { Scrubber } from '/src/js/audio/scrubber.js';
import { UrlPreset } from '/src/js/presets/url-preset.js'; ${exportsCode}</script>`;
const server = http.createServer((req, res) => {
  try {
    const p = new URL(req.url, 'http://local').pathname;
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (p === '/source') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8')
        .replaceAll('__AURALPRINT_VERSION__', version)
        .replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>')
        .replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>' + sourceExports));
    }
    const file = path.resolve(root, '.' + p);
    if (!file.startsWith(root + path.sep)) throw Error('path');
    let bytes = fs.readFileSync(file);
    if (p.endsWith('.html')) {
      const html = bytes.toString(), end = html.lastIndexOf('\n})();');
      assert.ok(end > 0, 'built IIFE boundary');
      bytes = html.slice(0, end) + '\n' + exportsCode + html.slice(end);
    }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
function wav(seconds = 20) {
  const b = Buffer.alloc(44 + 48000 * seconds * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(48000, 24); b.writeUInt32LE(96000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(b.length - 44, 40); return b;
}
const audioFile = name => ({ name, mimeType: 'audio/wav', buffer: wav() });
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function counts(cdp) {
  const result = {};
  for (const expression of ['window', 'document', ...['c', 'btnRepeat', 'btnPlay', 'btnStop', 'btnPrev', 'btnNext', 'btnShuffle', 'fileInput', 'btnToggleQueue', 'btnClearQueue', 'btnRecordStart', 'btnRecordCancel', 'selRecordMime', 'rngOmega', 'rngRmsGain', 'clrBg', 'chkBandOverlay', 'btnFitCamera', 'btnToggleWorkspaceLauncher', 'selRecordingProfile'].map(id => `document.getElementById('${id}')`)]) {
    const { result: object } = await cdp.send('Runtime.evaluate', { expression, objectGroup: 'coordinator-listeners' });
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: object.objectId });
    result[expression] = listeners.reduce((a, l) => { a[l.type] = (a[l.type] || 0) + 1; return a; }, {});
  }
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'coordinator-listeners' });
  return result;
}
let browser, activePage;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || undefined, headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  report.browser = browser.version();
  for (const [edition, route] of [['source', '/source'], ['portable', `/dist/auralprint_${version.slice(1)}.html`], ['hosted', '/dist/hosted/index.html']]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); activePage = page; page.setDefaultTimeout(12000);
    page.on('pageerror', e => report.errors.push({ edition, message: e.message }));
    const cdp = await context.newCDPSession(page);
    const ck = (name, actual, expected) => check(edition + ': ' + name, actual, expected);
    await page.goto(`http://127.0.0.1:${server.address().port}${route}`);
    await page.waitForFunction(() => globalThis.coordinatorTest && document.querySelector('.orb-editor-card'));
    await page.locator('#fileInput').setInputFiles(audioFile('A.wav'));
    await page.waitForFunction(() => coordinatorTest.state.audio.isPlaying);
    await page.locator('#btnPlay').click();
    await page.waitForFunction(() => !coordinatorTest.state.audio.isPlaying);
    const repeat = () => page.evaluate(() => coordinatorTest.preferences.audio.repeatMode);
    await page.locator('#btnRepeat').click(); ck('initial Repeat click', await repeat(), 'one');
    await page.locator('#btnRepeat').click(); await page.locator('#btnRepeat').click(); ck('Repeat back to Off', await repeat(), 'none');
    const initialCounts = await counts(cdp);
    await page.evaluate(() => { const t = coordinatorTest; t.originalEnded = t.AudioEngine._onTrackEnded; t.originalGuard = t.AudioEngine._isLoadRequestCurrent; t.UI.wireControls(); });
    await page.locator('#btnRepeat').click();
    const after = await repeat(); ck('second initialization Repeat click', after, 'one');
    report.observations.push({ edition, initialClick: 'one', beforeRewire: 'none', afterOneRewireClick: after });
    for (let i = 0; i < 5; i++) await page.evaluate(() => coordinatorTest.UI.wireControls());
    const rewiredCounts = await counts(cdp);
    report.observations.at(-1).listeners = { before: initialCounts, afterSevenCalls: rewiredCounts };
    ck('listeners remain bounded after seven total calls', rewiredCounts, initialCounts);
    if (process.env.AP_REPRO_ONLY) { await context.close(); continue; }
    ck('EOF callback identity retained', await page.evaluate(() => coordinatorTest.AudioEngine._onTrackEnded === coordinatorTest.originalEnded), true);
    ck('File request guard identity retained', await page.evaluate(() => coordinatorTest.AudioEngine._isLoadRequestCurrent === coordinatorTest.originalGuard), true);
    for (const wanted of ['all', 'none', 'one', 'all', 'none']) {
      await page.locator('#btnRepeat').click(); ck('one Repeat transition to ' + wanted, await repeat(), wanted);
    }
    // Instrument actual owners after the reproduction; wrappers delegate unchanged.
    await page.evaluate(() => {
      const t = coordinatorTest; t.calls = {};
      for (const [owner, method] of [[t.AudioEngine, 'playPause'], [t.AudioEngine, 'stop'], [t.Queue, 'shuffle'], [t.Queue, 'add'], [t.InputSourceManager, 'activateFile'], [t.RecorderEngine, 'onTransportMutation'], [t.Scrubber, 'reset'], [t.UrlPreset, 'applyFromLocationHash']]) {
        const original = owner[method]; owner[method] = function (...args) { t.calls[method] = (t.calls[method] || 0) + 1; return original.apply(this, args); };
      }
    });
    const calls = key => page.evaluate(key => coordinatorTest.calls[key] || 0, key);
    await page.locator('#btnPlay').click(); await page.waitForFunction(() => coordinatorTest.state.audio.isPlaying);
    ck('Play dispatched once', await calls('playPause'), 1);
    await page.locator('#btnPlay').click(); await page.waitForFunction(() => !coordinatorTest.state.audio.isPlaying);
    ck('Pause dispatched once', await calls('playPause'), 2);
    await page.locator('#btnStop').click(); ck('Stop dispatched once', await calls('stop'), 1);
    await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
    ck('hash handler executes once', await calls('applyFromLocationHash'), 1);
    await page.locator('#fileInput').setInputFiles(['B.wav', 'C.wav', 'D.wav'].map(audioFile));
    ck('picker appends each file once', await calls('add'), 3);
    ck('append does not reload/reset active File', [await calls('activateFile'), await calls('reset')], [0, 0]);
    await page.locator('#btnNext').click(); await page.waitForFunction(() => coordinatorTest.state.audio.filename === 'B.wav');
    ck('Next moves once', await page.evaluate(() => coordinatorTest.Queue.currentIndex), 1);
    await page.locator('#btnPrev').click(); await page.waitForFunction(() => coordinatorTest.state.audio.filename === 'A.wav');
    ck('Previous moves once', await page.evaluate(() => coordinatorTest.Queue.currentIndex), 0);
    ck('one load per navigation', await calls('activateFile'), 2);
    await page.locator('#btnShuffle').click(); ck('Shuffle dispatched once', await calls('shuffle'), 1);
    // Queue uses its normal rendered rows; two toggles return to the initial state.
    await page.locator('#btnToggleQueue').click(); ck('Queue opens', await page.locator('#queuePanel').isVisible(), true);
    await page.locator('#queueList .queue-item').nth(2).click();
    await page.waitForFunction(() => coordinatorTest.Queue.currentIndex === 2 && coordinatorTest.state.audio.filename === coordinatorTest.Queue.current().name);
    ck('Queue jump loads once', await calls('activateFile'), 3);
    await page.locator('#queueList .q-remove').last().click(); ck('Queue remove removes once', await page.evaluate(() => coordinatorTest.Queue.length), 3);
    await page.evaluate(() => document.getElementById('btnToggleQueue').click());
    // Keyboard: focus/modifiers/default prevention remain the existing contract.
    const keyboard = await page.evaluate(() => {
      const t = coordinatorTest, canvas = document.getElementById('c'), input = document.getElementById('rngVol');
      const send = (target, code, props = {}) => { const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...props }); target.dispatchEvent(e); return e.defaultPrevented; };
      const before = t.state.time.simPaused, prevented = send(canvas, 'Space'), after = t.state.time.simPaused;
      send(input, 'Space'); const focused = t.state.time.simPaused;
      for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) send(canvas, 'Space', { [modifier]: true });
      const modified = t.state.time.simPaused; send(canvas, 'Space', { shiftKey: true });
      const pre = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }); pre.preventDefault(); canvas.dispatchEvent(pre);
      return { before, prevented, after, focused, modified, shifted: t.state.time.simPaused };
    });
    ck('Space toggles once and prevents default', [keyboard.after, keyboard.prevented], [!keyboard.before, true]);
    ck('focus and modifiers suppress Space', [keyboard.focused, keyboard.modified, keyboard.shifted], [keyboard.after, keyboard.after, keyboard.before]);
    await page.locator('#c').focus(); await page.keyboard.press('KeyP');
    await page.waitForFunction(() => coordinatorTest.Queue.currentIndex === 1 && coordinatorTest.state.audio.filename === coordinatorTest.Queue.current().name);
    await page.keyboard.press('KeyN'); await page.waitForFunction(() => coordinatorTest.Queue.currentIndex === 2 && coordinatorTest.state.audio.filename === coordinatorTest.Queue.current().name);
    ck('N/P each load once', await calls('activateFile'), 5);
    const suppressed = await page.evaluate(() => {
      const t = coordinatorTest, before = t.calls.activateFile;
      for (const code of ['KeyN', 'KeyP']) {
        for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) document.getElementById('c').dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, [modifier]: true }));
        document.getElementById('rngVol').dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      }
      const m = t.AudioEngine.getMediaEl(); m.pause(); m.currentTime = 6;
      const e = new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true, cancelable: true }); document.getElementById('c').dispatchEvent(e);
      return { loads: t.calls.activateFile - before, prevented: e.defaultPrevented, time: m.currentTime };
    });
    ck('N/P focus/modifier suppression and one arrow seek', suppressed, { loads: 0, prevented: true, time: 11 });
    // Natural media EOF, no synthetic ended event; Repeat One then Repeat All.
    for (const [mode, index] of [['one', 2], ['all', 0], ['none', 1]]) {
      const before = await calls('activateFile');
      await page.evaluate(mode => { const t = coordinatorTest; t.preferences.audio.repeatMode = mode; t.UI.applyPrefs(null); const m = t.AudioEngine.getMediaEl(); m.currentTime = m.duration - 0.12; void m.play(); }, mode);
      await page.waitForFunction(n => coordinatorTest.calls.activateFile === n && coordinatorTest.state.audio.isPlaying, before + 1);
      ck('natural EOF policy ' + mode, await page.evaluate(() => coordinatorTest.Queue.currentIndex), index);
      await page.locator('#btnPlay').click();
    }
    // Pending real File activation: hold only its completion, then rewire.
    await page.evaluate(() => {
      const t = coordinatorTest, activate = t.InputSourceManager.activateFile;
      t.InputSourceManager.activateFile = async (...args) => { const result = await activate(...args); t.held = true; await new Promise(r => { t.release = r; }); return result; };
      t.restoreActivation = () => { t.InputSourceManager.activateFile = activate; };
      document.getElementById('btnPrev').click();
    });
    await page.waitForFunction(() => coordinatorTest.held);
    const pending = await page.evaluate(() => {
      const t = coordinatorTest, m = t.AudioEngine.getMediaEl(), entry = t.Queue.currentEntry();
      const guard = t.AudioEngine._isLoadRequestCurrent;
      for (let i = 0; i < 4; i++) t.UI.wireControls();
      return { sameMedia: t.AudioEngine.getMediaEl() === m, sameEntry: t.Queue.currentEntry() === entry, sameGuard: guard === t.AudioEngine._isLoadRequestCurrent };
    });
    ck('rewire retains pending File ownership', pending, { sameMedia: true, sameEntry: true, sameGuard: true });
    const resetBefore = await calls('reset'), mutationBefore = await calls('onTransportMutation');
    await page.evaluate(() => { coordinatorTest.restoreActivation(); coordinatorTest.release(); }); await frames(page);
    ck('rewire does not reset pending File', await calls('reset'), resetBefore);
    ck('pending File completes exactly once after rewiring', await calls('onTransportMutation'), mutationBefore + 1);
    ck('completed File still request-authorized', await page.evaluate(() => coordinatorTest.state.source.status), 'active');
    // Replace coordinator-owned controls independently; surviving listeners stay bounded.
    await page.evaluate(() => {
      const t = coordinatorTest; t.oldRepeat = document.getElementById('btnRepeat'); t.oldPlay = document.getElementById('btnPlay'); t.oldCancel = document.getElementById('btnRecordCancel');
      for (const id of ['btnRepeat', 'btnPlay', 'btnRecordCancel']) { const el = document.getElementById(id); el.replaceWith(el.cloneNode(true)); }
      t.UI.wireControls(); t.UI.refreshAllUiText(); t.preferences.audio.repeatMode = 'none';
    });
    await page.locator('#btnRepeat').click(); ck('replaced Repeat initialized', await repeat(), 'one');
    await page.evaluate(() => coordinatorTest.oldRepeat.click()); ck('detached Repeat loses authority', await repeat(), 'one');
    const playBefore = await calls('playPause'); await page.locator('#btnPlay').click();
    ck('replaced Play initialized once', await calls('playPause'), playBefore + 1);
    await page.evaluate(() => coordinatorTest.oldPlay.click()); ck('detached Play loses authority', await calls('playPause'), playBefore + 1);
    ck('surviving feature and global listener counts', await counts(cdp), initialCounts);
    // Actual native capture through the unchanged RecorderEngine, including
    // reinitialization while recording and independently replaced Cancel.
    await page.waitForFunction(() => coordinatorTest.state.recording.isSupported === true);
    await page.evaluate(() => {
      const t = coordinatorTest;
      for (const method of ['start', 'stop', 'cancel']) {
        const original = t.RecorderEngine[method];
        t.RecorderEngine[method] = function (...args) { const key = 'record:' + method; t.calls[key] = (t.calls[key] || 0) + 1; return original.apply(this, args); };
      }
      document.getElementById('btnRecordStart').click();
    });
    await page.waitForFunction(() => coordinatorTest.state.recording.phase === 'recording');
    // Stop after a delivered native chunk, rather than a timing-sensitive
    // two-frame capture that can correctly terminate with no-captured-chunks.
    await page.waitForFunction(() => coordinatorTest.state.recording.chunkCount > 0);
    await page.evaluate(() => { for (let i = 0; i < 4; i++) coordinatorTest.UI.wireControls(); document.getElementById('btnRecordStop').click(); });
    await page.waitForFunction(() => coordinatorTest.state.recording.phase === 'complete' && !document.getElementById('btnRecordStart').disabled);
    ck('record Start/Stop dispatched once through rewiring', [await calls('record:start'), await calls('record:stop')], [1, 1]);
    ck('native finalization retains an export', await page.evaluate(() => !!coordinatorTest.state.recording.lastExportUrl && coordinatorTest.state.recording.lastExportByteSize > 0), true);
    await page.evaluate(() => { coordinatorTest.exportUrl = coordinatorTest.state.recording.lastExportUrl; document.getElementById('btnRecordStart').click(); });
    await page.waitForFunction(() => coordinatorTest.state.recording.phase === 'recording');
    await page.evaluate(() => { coordinatorTest.oldCancel.disabled = false; coordinatorTest.oldCancel.click(); });
    ck('detached recording Cancel loses authority', await calls('record:cancel'), 0);
    await page.evaluate(() => document.getElementById('btnRecordCancel').click());
    ck('replaced recording Cancel dispatches once', await calls('record:cancel'), 1);
    ck('Cancel preserves prior native export', await page.evaluate(() => coordinatorTest.state.recording.lastExportUrl === coordinatorTest.exportUrl), true);
    // Camera interaction already supports a changed canvas; keep invoking its
    // initializer and verify its old-canvas cleanup alongside coordinator drop.
    await page.evaluate(() => {
      const t = coordinatorTest; t.oldCanvas = t.state.canvas;
      const canvas = t.oldCanvas.cloneNode(true); t.oldCanvas.replaceWith(canvas);
      t.state.canvas = canvas; t.state.ctx = canvas.getContext('2d');
      t.UI.wireControls();
    });
    ck('replacement canvas and feature listeners initialized once', await counts(cdp), initialCounts);
    const oldDrop = await page.evaluate(() => {
      const t = coordinatorTest, before = t.calls.add;
      const d = new DataTransfer(); d.items.add(new File(['invalid'], 'detached.wav', { type: 'audio/wav' }));
      t.oldCanvas.dispatchEvent(new DragEvent('drop', { dataTransfer: d, cancelable: true }));
      return t.calls.add - before;
    }); ck('detached canvas loses drop authority', oldDrop, 0);
    // Drop path and outside-canvas navigation suppression, after every rewire.
    await page.evaluate(() => document.getElementById('btnClearQueue').click());
    const drops = await page.evaluate(() => {
      const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array([0])], 'invalid-drop.wav', { type: 'audio/wav' }));
      const outside = new DragEvent('drop', { dataTransfer: transfer, cancelable: true, bubbles: true }); document.body.dispatchEvent(outside);
      const over = new DragEvent('dragover', { dataTransfer: transfer, cancelable: true, bubbles: true }); document.getElementById('c').dispatchEvent(over);
      return [outside.defaultPrevented, over.defaultPrevented];
    }); ck('drag/drop default prevention', drops, [true, true]);
    const addBefore = await calls('add');
    const transfer = await page.evaluateHandle(base64 => { const d = new DataTransfer(); d.items.add(new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], 'drop.wav', { type: 'audio/wav' })); return d; }, wav(2).toString('base64'));
    await page.locator('#c').dispatchEvent('drop', { dataTransfer: transfer });
    await page.waitForFunction(() => coordinatorTest.state.audio.filename === 'drop.wav' && coordinatorTest.state.audio.isLoaded);
    ck('one ingestion per dropped File', await calls('add'), addBefore + 1);
    await transfer.dispose();
    await context.close();
  }
  check('no page errors', report.errors, []);
})().catch(async e => {
  report.error = { message: e.message, stack: e.stack };
  if (activePage && !activePage.isClosed()) report.diagnostic = await activePage.evaluate(() => ({ recording: coordinatorTest.state.recording, calls: coordinatorTest.calls })).catch(() => null);
  process.exitCode = 1;
}).finally(async () => {
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  await browser?.close(); server.close();
  console.log(JSON.stringify({ browser: report.browser, checks: report.checks.length, failures: report.failures, errors: report.errors, error: report.error, output }, null, 2));
  if (report.failures.length && !process.env.AP_OBSERVE) process.exitCode = 1;
});
