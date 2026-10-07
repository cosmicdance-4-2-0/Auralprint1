// Optional native RC-02 regression against the unmodified built HTML.
// Playwright is developer tooling, not a project dependency.
// RC02_PLAYWRIGHT_MODULE, RC02_CHROMIUM_PATH, RC02_ARTIFACT, RC02_REPORT are optional.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.RC02_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const artifact = process.env.RC02_ARTIFACT || path.join(root, 'dist', `auralprint_${version.slice(1)}.html`);

function makeWav() {
  const rate = 44100, frames = rate * 20, wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) wav.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);
  return wav;
}

(async () => {
  const browser = await chromium.launch({
    ...(process.env.RC02_CHROMIUM_PATH ? { executablePath: process.env.RC02_CHROMIUM_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const evidence = [];
  try {
    async function app(mode = '') {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      page.errors = [];
      page.on('pageerror', err => page.errors.push(err.message));
      await page.route('http://rc02.test/**', route => route.fulfill({
        contentType: 'text/html', body: fs.readFileSync(artifact),
      }));
      await page.addInitScript(mode => {
        const probe = window.rc02 = { mode, entered: false, used: false, settled: 0, media: [], graphs: [], created: [], revoked: [] };
        // Observe handler completion instead of racing an already-idle source
        // snapshot against a released native promise.
        const add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
          if ((this.id === 'fileInput' && type === 'change') || (this.id === 'c' && type === 'drop')) {
            const handler = listener;
            listener = function (...args) {
              return Promise.resolve(handler.apply(this, args)).finally(() => { probe.settled++; });
            };
          }
          return add.call(this, type, listener, options);
        };
        const create = document.createElement.bind(document);
        document.createElement = function (...args) {
          const element = create(...args);
          if (args[0] === 'audio') probe.media.push(element);
          return element;
        };
        const createUrl = URL.createObjectURL.bind(URL), revokeUrl = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = blob => { const url = createUrl(blob); probe.created.push(url); return url; };
        URL.revokeObjectURL = url => { probe.revoked.push(url); revokeUrl(url); };
        const NativeContext = AudioContext;
        const source = NativeContext.prototype.createMediaElementSource;
        NativeContext.prototype.createMediaElementSource = function (...args) {
          const node = source.apply(this, args), graph = { connected: true };
          probe.graphs.push(graph);
          const disconnect = node.disconnect.bind(node);
          node.disconnect = (...args) => { graph.connected = false; return disconnect(...args); };
          return node;
        };
        window.AudioContext = class extends NativeContext {
          constructor(...args) { super(...args); if (probe.mode === 'resume') this.suspend(); }
          resume() {
            if (probe.mode !== 'resume' || probe.used) return super.resume();
            probe.used = true; probe.entered = true;
            return new Promise(resolve => {
              probe.release = () => { super.resume().then(resolve); };
            });
          }
        };
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          const result = play.call(this);
          if (probe.mode !== 'play' || probe.used) return result;
          probe.used = true;
          return result.then(() => {
            probe.entered = true;
            return new Promise((resolve, reject) => {
              probe.release = fail => fail
                ? reject(new DOMException('cancelled old playback failure', 'NotSupportedError'))
                : resolve();
            });
          });
        };
      }, mode);
      await page.goto('http://rc02.test/');
      await page.waitForFunction(() => document.getElementById('btnPlay')?.textContent === 'Play');
      await page.locator('#btnToggleQueue').click();
      return page;
    }

    async function ingest(page, names, entry = 'picker') {
      if (entry === 'picker') {
        await page.locator('#fileInput').setInputFiles(names.map(name => ({ name, mimeType: 'audio/wav', buffer: makeWav() })));
      } else {
        await page.evaluate(({ names, bytes }) => {
          const data = new DataTransfer();
          for (const name of names) data.items.add(new File([new Uint8Array(bytes)], name, { type: 'audio/wav' }));
          document.getElementById('c').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
        }, { names, bytes: [...makeWav()] });
      }
    }
    const settled = (page, count = 1) => page.waitForFunction(count => window.rc02.settled >= count, count);
    const idle = page => page.waitForFunction(() => document.getElementById('audioStatus').textContent === 'File mode ready. Load audio files to begin analysis.');
    async function snapshot(page) {
      return page.evaluate(() => ({
        queue: [...document.querySelectorAll('#queueList .q-name')].map(node => node.textContent),
        status: document.getElementById('audioStatus').textContent,
        fileSelector: document.getElementById('btnSourceFile').title,
        playDisabled: document.getElementById('btnPlay').disabled,
        playText: document.getElementById('btnPlay').textContent,
        scrubber: document.getElementById('scrubberTime').textContent,
        media: window.rc02.media.map(el => ({ src: el.getAttribute('src'), paused: el.paused })),
        graphsAttached: window.rc02.graphs.filter(graph => graph.connected).length,
        liveUrls: window.rc02.created.filter(url => !window.rc02.revoked.includes(url)),
        handlersSettled: window.rc02.settled,
      }));
    }
    function assertEmpty(result) {
      assert.deepEqual(result.queue, []);
      assert.equal(result.status, 'File mode ready. Load audio files to begin analysis.');
      assert.equal(result.fileSelector, 'File workflow selected. Load audio files to begin.');
      assert.equal(result.playDisabled, true);
      assert.equal(result.playText, 'Play');
      assert.match(result.scrubber, /no track loaded/);
      assert.ok(result.media.every(el => el.src === null && el.paused));
      assert.equal(result.graphsAttached, 0);
      assert.deepEqual(result.liveUrls, []);
    }
    const cancellations = [
      { name: 'clear-during-context-resume', mode: 'resume' },
      { name: 'clear-during-play-promise', mode: 'play' },
      { name: 'stale-play-failure-after-clear', mode: 'play', reject: true },
      { name: 'multi-file-clear-repopulates-queue', mode: 'play', names: ['A.wav', 'B.wav'] },
      { name: 'drop-batch-clear', mode: 'play', names: ['A.wav', 'B.wav'], entry: 'drop' },
      { name: 'final-removal-during-resume', mode: 'resume', remove: true },
      { name: 'final-removal-during-play', mode: 'play', remove: true },
    ];
    for (const scenario of cancellations) {
      const page = await app(scenario.mode);
      const result = { case: scenario.name };
      try {
        await ingest(page, scenario.names || ['A.wav'], scenario.entry);
        await page.waitForFunction(() => window.rc02.entered);
        if (scenario.remove) await page.locator('#queueList .q-remove').click();
        else await page.locator('#btnClearQueue').click();
        await idle(page);
        result.afterCancellation = await snapshot(page);
        assertEmpty(result.afterCancellation);
        await page.evaluate(fail => {
          for (const media of window.rc02.media) {
            for (const type of ['loadeddata', 'error', 'play', 'pause', 'ended']) media.dispatchEvent(new Event(type));
          }
          window.rc02.release(fail);
        }, !!scenario.reject);
        await settled(page);
        // Also allow the animation loop to render any stale status commit.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        result.afterRelease = await snapshot(page);
        assertEmpty(result.afterRelease);
        assert.deepEqual(page.errors, []);
        result.passed = true;
      } catch (err) { result.passed = false; result.error = err.message; result.observed = await snapshot(page); }
      result.pageErrors = page.errors;
      evidence.push(result);
      await page.close();
    }
    for (const entry of ['picker', 'drop']) {
      const page = await app();
      const result = { case: `ordinary-multi-and-append-${entry}` };
      try {
        await ingest(page, ['A.wav', 'B.wav', 'C.wav'], entry);
        await settled(page);
        await page.waitForFunction(() => document.getElementById('btnPlay').textContent === 'Pause');
        result.loaded = await snapshot(page);
        assert.deepEqual(result.loaded.queue, ['A.wav', 'B.wav', 'C.wav']);
        assert.match(result.loaded.status, /A\.wav/);
        assert.equal(result.loaded.graphsAttached, 1);
        await ingest(page, ['D.wav', 'E.wav'], entry);
        await settled(page, 2);
        result.appended = await snapshot(page);
        assert.deepEqual(result.appended.queue, ['A.wav', 'B.wav', 'C.wav', 'D.wav', 'E.wav']);
        assert.equal(result.appended.media.length, 1);
        assert.equal(result.appended.playText, 'Pause');
        assert.deepEqual(page.errors, []);
        result.passed = true;
      } catch (err) { result.passed = false; result.error = err.message; }
      result.pageErrors = page.errors;
      evidence.push(result);
      await page.close();
    }
  } finally {
    await browser.close();
    const report = { artifact, evidence };
    if (process.env.RC02_REPORT) fs.writeFileSync(process.env.RC02_REPORT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }
  assert.ok(evidence.every(result => result.passed), 'RC-02 browser acceptance failed');
})().catch(err => { console.error(err); process.exitCode = 1; });
