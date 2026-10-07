// Optional native RC-03 regression using real generated MediaStreams and the
// source app, as in the historical audit. No project dependency is added.
// RC03_PLAYWRIGHT_MODULE, RC03_CHROMIUM_PATH, RC03_REPORT select tooling/output.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.RC03_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();

(async () => {
  const browser = await chromium.launch({
    ...(process.env.RC03_CHROMIUM_PATH ? { executablePath: process.env.RC03_CHROMIUM_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const evidence = [];
  try {
    async function app(mode) {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      page.errors = [];
      page.on('pageerror', error => page.errors.push(error.message));
      await page.route('http://localhost/**', async route => {
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
      await page.goto('http://localhost/');
      await page.waitForFunction(() => document.getElementById('btnPlay')?.textContent === 'Play');
      await page.evaluate(async mode => {
        const probe = window.rc03 = { mode, results: {}, graphs: [] };
        const generator = new AudioContext();
        await generator.resume();
        const oscillator = generator.createOscillator();
        const mic = generator.createMediaStreamDestination(), shared = generator.createMediaStreamDestination();
        oscillator.connect(mic); oscillator.connect(shared); oscillator.start();
        const video = document.createElement('canvas').captureStream(1).getVideoTracks()[0];
        probe.streams = { mic: mic.stream, stream: new MediaStream([...shared.stream.getAudioTracks(), video]) };
        navigator.mediaDevices.getUserMedia = async () => probe.streams.mic;
        navigator.mediaDevices.getDisplayMedia = async () => probe.streams.stream;
        const NativeContext = AudioContext;
        window.AudioContext = class extends NativeContext {
          constructor(...args) {
            super(...args);
            this.suspend();
            this.forcedSuspended = mode !== 'normal';
          }
          get state() { return this.forcedSuspended ? 'suspended' : super.state; }
          resume() {
            if (mode !== 'normal' && !probe.entered) {
              probe.entered = true;
              return new Promise((resolve, reject) => {
                probe.release = () => {
                  this.forcedSuspended = false;
                  return mode === 'error'
                    ? reject(new Error('delayed attachment failure'))
                    : super.resume().then(resolve);
                };
              });
            }
            this.forcedSuspended = false;
            return super.resume();
          }
          createMediaStreamSource(stream) {
            const source = super.createMediaStreamSource(stream);
            const graph = { stream, source, disconnects: 0, connections: [] };
            const disconnect = source.disconnect.bind(source), connect = source.connect.bind(source);
            source.disconnect = (...args) => { graph.disconnects++; return disconnect(...args); };
            source.connect = (...args) => { graph.connections.push(args[0]); return connect(...args); };
            probe.graphs.push(graph);
            return source;
          }
        };
        const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
        const { InputSourceManager } = await import('/src/js/audio/input-source-manager.js');
        // Prime the existing passive recorder branch before any live attachment.
        probe.tap = AudioEngine.getRecorderTap().ensureStream();
        for (const [kind, method] of [['mic', 'activateMic'], ['stream', 'activateStream']]) {
          const original = InputSourceManager[method];
          InputSourceManager[method] = async (...args) => {
            const result = await original(...args);
            probe.results[kind] = result;
            return result;
          };
        }
      }, mode);
      return page;
    }

    async function snapshot(page, winner) {
      return page.evaluate(async winner => {
        const { state } = await import('/src/js/core/state.js');
        const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
        const probe = window.rc03;
        const graph = probe.graphs.find(graph => graph.stream === probe.streams[winner]);
        return {
          source: structuredClone(state.source), sampleReady: AudioEngine.sample().ready,
          winningUpstream: AudioEngine.getRecorderTap().ensureStream() === probe.streams[winner],
          winningGraphDisconnects: graph?.disconnects,
          trackStates: Object.fromEntries(Object.entries(probe.streams).map(([kind, stream]) => [kind, stream.getTracks().map(track => track.readyState)])),
          recorderTracks: probe.tap.getTracks().map(track => track.readyState),
          results: structuredClone(probe.results), status: document.getElementById('audioStatus').textContent,
        };
      }, winner);
    }

    function assertWinner(result, winner) {
      assert.equal(result.source.kind, winner);
      assert.equal(result.source.status, 'active');
      assert.equal(result.source.sessionActive, true);
      assert.equal(result.source.errorCode, '');
      assert.equal(result.source.errorMessage, '');
      assert.equal(result.sampleReady, true);
      assert.equal(result.winningUpstream, true);
      assert.equal(result.winningGraphDisconnects, 0);
      assert.ok(result.trackStates[winner].every(state => state === 'live'));
      assert.ok(result.recorderTracks.every(state => state === 'live'));
    }

    for (const [loser, winner] of [['mic', 'stream'], ['stream', 'mic']]) {
      for (const mode of ['resume', 'error', 'normal']) {
        const page = await app(mode);
        const caseName = mode === 'resume'
          ? `cancelled-${loser}-attach-destroys-new-${winner}-graph`
          : `${mode}-${loser}-to-${winner}`;
        try {
          await page.locator(loser === 'mic' ? '#btnSourceMic' : '#btnSourceStream').click();
          await page.waitForFunction(({ mode, loser }) => mode === 'normal' ? !!window.rc03.results[loser] : !!window.rc03.entered, { mode, loser });
          if (mode === 'normal') assertWinner(await snapshot(page, loser), loser);
          await page.locator(winner === 'mic' ? '#btnSourceMic' : '#btnSourceStream').click();
          await page.waitForFunction(winner => !!window.rc03.results[winner], winner);
          const before = await snapshot(page, winner);
          assertWinner(before, winner);
          if (mode !== 'normal') {
            await page.evaluate(() => window.rc03.release());
            await page.waitForFunction(loser => !!window.rc03.results[loser], loser);
          }
          const after = await snapshot(page, winner);
          assertWinner(after, winner);
          assert.deepEqual(after.source, before.source);
          assert.ok(after.trackStates[loser].every(state => state === 'ended'));
          if (mode !== 'normal') assert.equal(after.results[loser].errorCode, `${loser}-activation-cancelled`);
          await page.locator('#btnSourceFile').click();
          await page.waitForFunction(async () => (await import('/src/js/core/state.js')).state.source.kind === 'none');
          const teardown = await snapshot(page, winner);
          assert.equal(teardown.sampleReady, false);
          assert.ok(teardown.trackStates[winner].every(state => state === 'ended'));
          assert.deepEqual(page.errors, []);
          evidence.push({ case: caseName, passed: true, before, after, teardown, errors: page.errors });
        } catch (error) {
          evidence.push({ case: caseName, passed: false, error: error.message, snapshot: await snapshot(page, winner) });
        } finally { await page.close(); }
      }
    }
  } finally {
    const report = { version, browser: browser.version(), generatedMediaStreams: true, evidence };
    if (process.env.RC03_REPORT) {
      fs.mkdirSync(path.dirname(process.env.RC03_REPORT), { recursive: true });
      fs.writeFileSync(process.env.RC03_REPORT, JSON.stringify(report, null, 2) + '\n');
    }
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  }
  assert.equal(evidence.length, 6);
  assert.ok(evidence.every(result => result.passed), 'RC-03 browser scenarios failed');
})().catch(error => { console.error(error); process.exitCode = 1; });
