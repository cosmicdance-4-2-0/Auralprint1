// Optional native RC-04 probe using the source app, as in the historical audit.
// Playwright remains developer tooling, outside project dependencies.
// RC04_PLAYWRIGHT_MODULE, RC04_CHROMIUM_PATH, RC04_REPORT select tooling/output.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.RC04_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();

function makeWav() {
  const rate = 44100, frames = rate * 30, wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) wav.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return wav;
}

(async () => {
  const browser = await chromium.launch({
    ...(process.env.RC04_CHROMIUM_PATH ? { executablePath: process.env.RC04_CHROMIUM_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const evidence = [];
  try {
    async function app() {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      page.errors = [];
      page.on('pageerror', error => page.errors.push(error.message));
      await page.route('http://localhost/**', route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/') {
          const html = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8')
            .replace('<!-- AURALPRINT_INLINE_CSS -->', '<link rel="stylesheet" href="/src/css/base.css">')
            .replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>')
            .replaceAll('__AURALPRINT_VERSION__', version);
          return route.fulfill({ contentType: 'text/html', body: html });
        }
        const file = path.resolve(root, `.${pathname}`);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404 });
        return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : 'text/css', body: fs.readFileSync(file) });
      });
      await page.addInitScript(() => {
        const probe = window.rc04 = { settled: 0, ingested: 0, calls: [], writes: [] };
        const add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
          if ((type === 'click' && this.id === 'btnPlay') || (type === 'change' && this.id === 'fileInput')) {
            const original = listener, key = this.id === 'btnPlay' ? 'settled' : 'ingested';
            listener = function (...args) {
              return Promise.resolve(original.apply(this, args)).finally(() => { probe[key]++; });
            };
          }
          return add.call(this, type, listener, options);
        };
        const NativeContext = AudioContext;
        window.AudioContext = class extends NativeContext {
          constructor(...args) { super(...args); probe.context = this; }
        };
      });
      await page.goto('http://localhost/');
      await page.waitForFunction(() => document.getElementById('btnPlay')?.textContent === 'Play');
      await page.locator('#btnToggleQueue').click();
      await upload(page, 'A.wav', 1);
      await page.locator('#btnStop').click();
      return page;
    }

    async function upload(page, name, ingested) {
      await page.locator('#fileInput').setInputFiles({ name, mimeType: 'audio/wav', buffer: makeWav() });
      await page.waitForFunction(count => window.rc04.ingested >= count, ingested);
    }
    async function snapshot(page) {
      return page.evaluate(async () => {
        const { state } = await import('/src/js/core/state.js');
        const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
        const { Queue } = await import('/src/js/audio/queue.js');
        const el = AudioEngine.getMediaEl();
        return { audio: { ...state.audio }, source: structuredClone(state.source), queue: Queue.snapshot(),
          graphReady: AudioEngine.sample().ready, media: el ? { paused: el.paused, src: el.src } : null,
          currentIsReplacement: !!el && el === window.rc04.replacement,
          status: document.getElementById('audioStatus').textContent,
          calls: structuredClone(window.rc04.calls), writes: structuredClone(window.rc04.writes) };
      });
    }
    async function hold(page, boundary, reject) {
      await page.evaluate(async ({ boundary, reject }) => {
        const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
        const probe = window.rc04, target = probe.target = AudioEngine.getMediaEl();
        const play = target.play.bind(target);
        target.play = () => {
          probe.calls.push('A.play');
          const native = play();
          if (boundary === 'resume') return native;
          return native.then(() => {
            probe.entered = true;
            return new Promise((resolve, fail) => {
              probe.release = () => reject ? fail(new Error('obsolete playback failure')) : resolve();
            });
          });
        };
        if (boundary === 'resume') {
          const ctx = probe.context, resume = ctx.resume.bind(ctx);
          await ctx.suspend();
          let held = false;
          ctx.resume = () => {
            if (held) return resume();
            held = true; probe.entered = true;
            return new Promise(resolve => { probe.release = () => resume().then(resolve); });
          };
        }
      }, { boundary, reject });
      await page.locator('#btnPlay').click();
      await page.waitForFunction(() => window.rc04.entered);
    }
    async function observe(page) {
      await page.evaluate(async () => {
        const { state } = await import('/src/js/core/state.js');
        state.audio = new Proxy(state.audio, {
          set(object, key, value) { window.rc04.writes.push({ key, value }); object[key] = value; return true; },
        });
      });
    }
    async function release(page) {
      await page.evaluate(() => window.rc04.release());
      await page.waitForFunction(() => window.rc04.settled >= 1);
    }
    function assertIdle(result) {
      assert.equal(result.media, null); assert.equal(result.graphReady, false);
      assert.deepEqual(result.audio, { isLoaded: false, isPlaying: false, filename: '', transportError: '' });
      assert.equal(result.source.kind, 'none'); assert.equal(result.source.status, 'idle');
      assert.equal(result.source.errorMessage, ''); assert.equal(result.queue.length, 0);
      assert.equal(result.status, 'File mode ready. Load audio files to begin analysis.');
    }
    const cases = [
      { name: 'playPause-unload-null-dereference', boundary: 'play' },
      { name: 'stale-play-rejection-after-clear', boundary: 'play', reject: true },
      { name: 'clear-during-transport-resume', boundary: 'resume' },
      ...['resume', 'play'].flatMap(boundary => [false, true].flatMap(playing =>
        (boundary === 'play' ? [false, true] : [false]).map(reject => ({
          name: `replacement-${playing ? 'playing' : 'paused'}-during-${boundary}-${reject ? 'reject' : 'resolve'}`,
          boundary, playing, reject, replacement: true,
        })))),
    ];
    for (const scenario of cases) {
      const page = await app();
      try {
        await hold(page, scenario.boundary, scenario.reject);
        if (scenario.replacement) {
          await upload(page, 'B.wav', 2);
          await page.locator('#queueList [role="button"]').last().click();
          await page.waitForFunction(async () => {
            const { state } = await import('/src/js/core/state.js');
            return state.audio.filename === 'B.wav' && state.source.status === 'active';
          });
          if (!scenario.playing) await page.locator('#btnStop').click();
          await page.evaluate(async () => {
            const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
            const el = window.rc04.replacement = AudioEngine.getMediaEl();
            for (const method of ['play', 'pause']) {
              const original = el[method].bind(el);
              el[method] = (...args) => { window.rc04.calls.push(`B.${method}`); return original(...args); };
            }
          });
        } else {
          await page.locator('#btnClearQueue').click();
          await page.waitForFunction(() => document.getElementById('audioStatus').textContent.startsWith('File mode ready.'));
        }
        const before = await snapshot(page);
        await observe(page);
        await release(page);
        const after = await snapshot(page);
        assert.deepEqual(after.audio, before.audio); assert.deepEqual(after.source, before.source);
        assert.deepEqual(after.queue, before.queue); assert.deepEqual(after.calls, before.calls);
        assert.deepEqual(after.writes, []); assert.deepEqual(page.errors, []);
        if (scenario.boundary === 'resume') assert.ok(!after.calls.includes('A.play'));
        if (scenario.replacement) {
          assert.equal(after.currentIsReplacement, true); assert.equal(after.graphReady, true);
          assert.equal(after.audio.isPlaying, scenario.playing); assert.equal(after.media.paused, !scenario.playing);
          assert.ok(!after.status.includes('Playback failed'));
        } else assertIdle(after);
        evidence.push({ case: scenario.name, passed: true, before, after, pageErrors: page.errors });
      } catch (error) {
        evidence.push({ case: scenario.name, passed: false, error: error.message, after: await snapshot(page), pageErrors: page.errors });
        throw error;
      } finally { await page.close(); }
    }

    const page = await app();
    try {
      await page.locator('#btnPlay').click();
      await page.waitForFunction(() => window.rc04.settled >= 1);
      const play = await snapshot(page);
      assert.equal(play.audio.isPlaying, true); assert.equal(play.audio.transportError, '');
      await page.locator('#btnPlay').click();
      await page.waitForFunction(() => window.rc04.settled >= 2);
      const pause = await snapshot(page);
      assert.equal(pause.audio.isPlaying, false); assert.equal(pause.media.paused, true);
      await page.evaluate(async () => {
        const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
        AudioEngine.getMediaEl().play = () => Promise.reject(new Error('current playback failure'));
      });
      await page.locator('#btnPlay').click();
      await page.waitForFunction(() => window.rc04.settled >= 3);
      const failure = await snapshot(page);
      assert.equal(failure.audio.isPlaying, false);
      assert.equal(failure.audio.transportError, 'Playback failed: current playback failure');
      assert.equal(failure.status, failure.audio.transportError); assert.deepEqual(page.errors, []);
      evidence.push({ case: 'ordinary-play-pause-current-failure', passed: true, play, pause, failure, pageErrors: page.errors });
    } finally { await page.close(); }
  } finally {
    const report = { version, browser: await browser.version(), scenarios: evidence };
    if (process.env.RC04_REPORT) {
      fs.mkdirSync(path.dirname(process.env.RC04_REPORT), { recursive: true });
      fs.writeFileSync(process.env.RC04_REPORT, JSON.stringify(report, null, 2) + '\n');
    }
    console.log(JSON.stringify(evidence.map(({ case: name, passed }) => ({ case: name, passed })), null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
