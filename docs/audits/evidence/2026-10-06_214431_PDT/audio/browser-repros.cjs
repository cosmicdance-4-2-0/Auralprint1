const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = process.env.AUDIT_REPO_ROOT || process.cwd();
const outputDir = process.env.AUDIT_OUTPUT_DIR || __dirname;
const evidence = [];
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/') {
    let html = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
    html = html.replace('<!-- AURALPRINT_INLINE_CSS -->', '<link rel="stylesheet" href="/src/css/base.css">')
      .replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>')
      .replaceAll('__AURALPRINT_VERSION__', 'v0.1.15m.h');
    res.setHeader('Content-Type', 'text/html'); res.end(html); return;
  }
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/plain');
  res.end(fs.readFileSync(file));
});
function makeWav(seconds = 20) {
  const rate = 44100, frames = rate * seconds, b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(0.15 * 32767 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return b;
}
const wav = makeWav();
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.AUDIT_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  async function app() {
    const page = await browser.newPage();
    page.errors = []; page.on('pageerror', err => page.errors.push(err.message));
    await page.goto(origin); await page.waitForFunction(() => document.querySelector('#btnPlay')?.textContent === 'Play');
    return page;
  }
  async function snapshot(page) {
    return page.evaluate(async () => {
      const { state } = await import('/src/js/core/state.js');
      const { Queue } = await import('/src/js/audio/queue.js');
      const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
      return { source: structuredClone(state.source), audio: structuredClone(state.audio), queue: Queue.snapshot(), graphReady: AudioEngine.sample().ready,
        media: AudioEngine.getMediaEl() ? { paused: AudioEngine.getMediaEl().paused, src: AudioEngine.getMediaEl().src } : null,
        status: document.getElementById('audioStatus').textContent };
    });
  }
  async function upload(page, names = ['tone.wav']) {
    await page.locator('#fileInput').setInputFiles(names.map(name => ({ name, mimeType: 'audio/wav', buffer: wav })));
  }
  try {
    {
      const page = await app();
      await page.evaluate(() => {
        const NativeContext = AudioContext;
        window.AudioContext = class extends NativeContext { constructor(...args) { super(...args); this.suspend(); } };
        const original = AudioContext.prototype.resume;
        AudioContext.prototype.resume = function () { window.resumeEntered = true; return new Promise(resolve => { window.releaseResume = () => original.call(this).then(resolve); }); };
      });
      await upload(page);
      await page.waitForFunction(() => window.resumeEntered);
      await page.locator('#btnToggleQueue').click();
      await page.locator('#btnClearQueue').click();
      const afterClear = await snapshot(page);
      await page.evaluate(() => window.releaseResume());
      await page.waitForFunction(async () => { const { state } = await import('/src/js/core/state.js'); return state.source.status !== 'requesting'; });
      const afterRelease = await snapshot(page);
      assert.equal(afterClear.queue.length, 0); assert.equal(afterClear.source.kind, 'none');
      assert.equal(afterRelease.queue.length, 0); assert.equal(afterRelease.source.kind, 'file'); assert.equal(afterRelease.audio.isPlaying, true);
      evidence.push({ case: 'clear-during-context-resume', defectConfirmed: true, afterClear, afterRelease, errors: page.errors });
      await page.close();
    }
    {
      const page = await app();
      await page.evaluate(() => {
        const original = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () { return original.call(this).then(() => { window.playEntered = true; return new Promise(resolve => { window.releasePlay = resolve; }); }); };
      });
      await upload(page);
      await page.waitForFunction(() => window.playEntered);
      await page.locator('#btnToggleQueue').click();
      await page.locator('#btnClearQueue').click();
      const afterClear = await snapshot(page);
      await page.evaluate(() => window.releasePlay());
      await page.waitForFunction(async () => { const { state } = await import('/src/js/core/state.js'); return state.source.kind !== 'none'; });
      const afterRelease = await snapshot(page);
      assert.equal(afterClear.source.kind, 'none'); assert.equal(afterRelease.source.status, 'error'); assert.equal(afterRelease.source.errorCode, 'file-activation-failed');
      evidence.push({ case: 'clear-during-play-promise', defectConfirmed: true, afterClear, afterRelease, errors: page.errors });
      await page.close();
    }
    {
      const page = await app();
      await page.evaluate(() => {
        const original = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () { return original.call(this).then(() => { window.playEntered = true; return new Promise(resolve => { window.releasePlay = resolve; }); }); };
      });
      await upload(page, ['first.wav', 'second.wav']);
      await page.waitForFunction(() => window.playEntered);
      await page.locator('#btnToggleQueue').click();
      await page.locator('#btnClearQueue').click();
      const afterClear = await snapshot(page);
      await page.evaluate(() => window.releasePlay());
      await page.waitForFunction(async () => { const { Queue } = await import('/src/js/audio/queue.js'); return Queue.length === 1; });
      // The second file gets a new held play promise; release it too.
      await page.waitForTimeout(100); await page.evaluate(() => window.releasePlay());
      await page.waitForFunction(async () => { const { state } = await import('/src/js/core/state.js'); return state.audio.filename === 'second.wav'; });
      const afterRelease = await snapshot(page);
      assert.equal(afterClear.queue.length, 0); assert.equal(afterRelease.queue.length, 1); assert.equal(afterRelease.audio.filename, 'second.wav'); assert.equal(afterRelease.audio.isPlaying, true);
      evidence.push({ case: 'multi-file-clear-repopulates-queue', defectConfirmed: true, afterClear, afterRelease, errors: page.errors });
      await page.close();
    }
    {
      const page = await app();
      await upload(page);
      await page.waitForFunction(async () => { const { state } = await import('/src/js/core/state.js'); return state.audio.isLoaded; });
      await page.locator('#btnStop').click();
      await page.evaluate(async () => {
        const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
        const el = AudioEngine.getMediaEl(), original = el.play.bind(el);
        el.play = () => original().then(() => new Promise(resolve => { window.releasePlayPause = resolve; }));
      });
      await page.locator('#btnPlay').click();
      await page.waitForFunction(() => typeof window.releasePlayPause === 'function');
      await page.locator('#btnToggleQueue').click();
      await page.locator('#btnClearQueue').click();
      await page.evaluate(() => window.releasePlayPause());
      await page.waitForTimeout(100);
      assert.ok(page.errors.some(message => message.includes("Cannot read properties of null (reading 'paused')")));
      evidence.push({ case: 'playPause-unload-null-dereference', defectConfirmed: true, after: await snapshot(page), errors: page.errors });
      await page.close();
    }
    {
      const page = await app();
      await page.evaluate(async () => {
        const generatorContext = new AudioContext(); await generatorContext.resume();
        const oscillator = generatorContext.createOscillator(), destination = generatorContext.createMediaStreamDestination();
        oscillator.connect(destination); oscillator.start();
        const destination2 = generatorContext.createMediaStreamDestination(); oscillator.connect(destination2);
        window.micStream = destination.stream; window.streamStream = destination2.stream;
        navigator.mediaDevices.getUserMedia = async () => window.micStream;
        navigator.mediaDevices.getDisplayMedia = async () => window.streamStream;
        const NativeContext = AudioContext;
        window.AudioContext = class extends NativeContext { constructor(...args) { super(...args); this.suspend(); } };
        const original = AudioContext.prototype.resume;
        let count = 0;
        AudioContext.prototype.resume = function () {
          if (++count === 1) { window.firstResumeEntered = true; return new Promise(resolve => { window.releaseFirstResume = () => original.call(this).then(resolve); }); }
          return original.call(this);
        };
      });
      await page.locator('#btnSourceMic').click();
      await page.waitForFunction(() => window.firstResumeEntered);
      await page.locator('#btnSourceStream').click();
      await page.waitForFunction(async () => { const { state } = await import('/src/js/core/state.js'); return state.source.kind === 'stream' && state.source.status === 'active'; });
      const beforeOldAttachResolves = await snapshot(page);
      await page.evaluate(() => window.releaseFirstResume());
      await page.waitForTimeout(150);
      const afterOldAttachResolves = await snapshot(page);
      const trackStates = await page.evaluate(() => ({ mic: window.micStream.getAudioTracks()[0].readyState, stream: window.streamStream.getAudioTracks()[0].readyState }));
      assert.equal(beforeOldAttachResolves.graphReady, true); assert.equal(afterOldAttachResolves.graphReady, false);
      assert.equal(afterOldAttachResolves.source.kind, 'stream'); assert.equal(afterOldAttachResolves.source.status, 'active'); assert.equal(trackStates.stream, 'live');
      evidence.push({ case: 'cancelled-mic-attach-destroys-new-stream-graph', defectConfirmed: true, beforeOldAttachResolves, afterOldAttachResolves, trackStates, errors: page.errors });
      await page.close();
    }
    {
      const page = await app();
      await upload(page);
      await page.waitForFunction(async () => { const { state } = await import('/src/js/core/state.js'); return state.audio.isLoaded; });
      await page.locator('#btnStop').click();
      const result = await page.evaluate(async () => {
        const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
        const canvas = document.getElementById('scrubberCanvas'), rect = canvas.getBoundingClientRect();
        const touch = x => new Touch({ identifier: 1, target: canvas, clientX: rect.left + rect.width * x, clientY: rect.top + 10 });
        canvas.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(0.25)], bubbles: true, cancelable: true }));
        const timeAfterStart = AudioEngine.getMediaEl().currentTime;
        canvas.dispatchEvent(new TouchEvent('touchcancel', { touches: [], bubbles: true, cancelable: true }));
        const move = new TouchEvent('touchmove', { touches: [touch(0.75)], bubbles: true, cancelable: true });
        document.getElementById('btnLoad').dispatchEvent(move);
        return { timeAfterStart, timeAfterCancelledGestureAndUnrelatedMove: AudioEngine.getMediaEl().currentTime, unrelatedMoveDefaultPrevented: move.defaultPrevented };
      });
      assert.ok(result.timeAfterCancelledGestureAndUnrelatedMove > result.timeAfterStart + 5); assert.equal(result.unrelatedMoveDefaultPrevented, true);
      evidence.push({ case: 'touchcancel-leaves-global-seek-drag-active', defectConfirmed: true, result, errors: page.errors });
      await page.close();
    }
  } finally {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'browser-repros.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify(evidence, null, 2));
    await browser.close(); server.close();
  }
})().catch(err => { console.error(err); process.exitCode = 1; server.close(); });
