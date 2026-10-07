// Optional native RC-05 probe; Playwright remains outside project dependencies.
// RC05_PLAYWRIGHT_MODULE, RC05_CHROMIUM_PATH, RC05_REPORT select developer tooling.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.RC05_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const artifact = path.join(root, 'dist', `auralprint_${version.slice(1)}.html`);
const built = fs.readFileSync(artifact, 'utf8');
// Same inspection seam as the audit: expose objects without altering product logic.
const inspected = built.replace('  main();\n})();', '  main();\n  window.rc05 = {state, RecorderEngine, AudioEngine, Queue, preferences, UI};\n})();');
assert.notEqual(inspected, built);
function wav(seconds, hz) {
  const rate = 44100, frames = rate * seconds, dataBytes = frames * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF'); b.writeUInt32LE(36 + dataBytes, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(5000 * Math.sin(2 * Math.PI * hz * i / rate)), 44 + i * 2);
  return b;
}
(async () => {
  const browser = await chromium.launch({
    ...(process.env.RC05_CHROMIUM_PATH ? { executablePath: process.env.RC05_CHROMIUM_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const results = [];
  try {
    for (const mode of ['ordinary', 'recording-across-eof', 'delayed-onstop', 'native-eof-order', 'repeat-one', 'repeat-all', 'no-next', 'export-error']) {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://rc05.test/**', route => route.fulfill({ contentType: 'text/html', body: inspected }));
      await page.goto('http://rc05.test/');
      assert.ok((await page.title()).includes(version));
      await page.evaluate(() => {
        const Native = MediaRecorder;
        window.recorders = [];
        window.MediaRecorder = class extends Native { constructor(...args) { super(...args); window.recorders.push(this); } };
        const a = window.rc05, notify = a.RecorderEngine.onTransportMutation;
        window.transitions = []; window.events = [];
        a.RecorderEngine.onTransportMutation = (kind, details) => {
          if (kind === 'track-change-start' || kind === 'audio-unloaded') window.transitions.push({ kind, ...details });
          return notify(kind, details);
        };
      });
      const single = mode === 'repeat-one' || mode === 'no-next';
      await page.locator('#fileInput').setInputFiles([
        { name: 'A.wav', mimeType: 'audio/wav', buffer: wav(10, 440) },
        ...(!single ? [{ name: 'B.wav', mimeType: 'audio/wav', buffer: wav(10, 880) }] : []),
      ]);
      await page.waitForFunction(() => window.rc05.state.audio.isLoaded && window.rc05.state.source.kind === 'file');
      await page.evaluate(() => window.rc05.AudioEngine.getMediaEl().pause());
      if (mode === 'repeat-all') {
        await page.locator('#btnNext').click();
        await page.waitForFunction(() => window.rc05.state.audio.filename === 'B.wav');
        await page.evaluate(() => window.rc05.AudioEngine.getMediaEl().pause());
      }
      if (mode !== 'ordinary') {
        await page.evaluate(() => {
          const result = window.rc05.RecorderEngine.start();
          if (!result.ok) throw new Error(result.message);
        });
        await page.waitForTimeout(1100); // Obtain actual native capture chunks before EOF.
      }
      await page.evaluate(mode => {
        const a = window.rc05, el = a.AudioEngine.getMediaEl();
        a.preferences.audio.repeatMode = mode === 'repeat-one' ? 'one' : mode === 'repeat-all' ? 'all' : 'none';
        window.beforeCount = window.transitions.length;
        if (['delayed-onstop', 'repeat-one', 'repeat-all', 'no-next', 'export-error'].includes(mode)) {
          const rec = window.recorders.at(-1), onstop = rec.onstop;
          rec.onstop = e => setTimeout(() => onstop(e), 800);
          if (mode === 'export-error') {
            const NativeBlob = Blob;
            window.Blob = class extends NativeBlob {
              constructor(parts, options) {
                if (options?.type?.startsWith('video/')) throw new Error('RC05 injected export assembly failure');
                super(parts, options);
              }
            };
          }
          a.RecorderEngine.stop();
        }
        if (mode === 'native-eof-order') {
          el.addEventListener('ended', () => {
            a.RecorderEngine.stop();
            window.events.push({ event: 'capture-stop-at-eof', phase: a.state.recording.phase });
          }, { capture: true, once: true });
        }
        el.addEventListener('ended', () => window.events.push({
          event: 'native-ended', phase: a.state.recording.phase, cursor: a.Queue.currentIndex,
          filename: a.state.audio.filename, ended: el.ended, transitions: window.transitions.length,
        }), { once: true });
        el.currentTime = el.duration - 0.12;
        el.play();
      }, mode);
      await page.waitForFunction(() => window.events.some(e => e.event === 'native-ended'));
      if (!['ordinary', 'recording-across-eof'].includes(mode)) {
        await page.waitForFunction(() => ['complete', 'error'].includes(window.rc05.state.recording.phase));
      }
      const expected = ['repeat-one', 'repeat-all', 'no-next'].includes(mode) ? 'A.wav' : 'B.wav';
      const expectedTransitions = mode === 'no-next' ? 0 : 1;
      if (expectedTransitions) await page.waitForFunction(name => window.rc05.state.audio.filename === name && window.rc05.state.audio.isPlaying, expected);
      const evidence = await page.evaluate(async () => {
        const a = window.rc05;
        for (let i = 0; i < 5; i++) { a.UI.refreshRecordingUi(); a.UI.refreshAllUiText(); }
        const recording = { ...a.state.recording };
        const exportBytes = recording.lastExportUrl ? (await (await fetch(recording.lastExportUrl)).blob()).size : 0;
        return { events: window.events, transitions: window.transitions.slice(window.beforeCount),
          queue: a.Queue.snapshot(), audio: { ...a.state.audio }, recording, exportBytes,
          mediaEnded: a.AudioEngine.getMediaEl().ended, nativeRecorderState: window.recorders.at(-1)?.state };
      });
      assert.equal(evidence.transitions.filter(t => t.kind === 'track-change-start').length, expectedTransitions);
      assert.equal(evidence.audio.filename, expected);
      assert.equal(evidence.audio.isPlaying, mode !== 'no-next');
      assert.equal(evidence.queue.cursor, ['repeat-one', 'repeat-all', 'no-next'].includes(mode) ? 0 : 1);
      if (!['ordinary', 'recording-across-eof'].includes(mode)) {
        const eof = evidence.events.find(e => e.event === 'native-ended');
        assert.equal(eof.phase, 'finalizing'); assert.equal(eof.ended, true);
        assert.equal(eof.transitions, await page.evaluate(() => window.beforeCount), 'no transition during lock');
        assert.equal(evidence.recording.phase, mode === 'export-error' ? 'error' : 'complete');
        if (mode === 'export-error') {
          assert.equal(evidence.recording.lastCode, 'finalize-failed');
          assert.match(evidence.recording.lastMessage, /RC05 injected export/);
        } else assert.ok(evidence.exportBytes > 0);
      }
      if (mode === 'no-next') {
        assert.equal(evidence.mediaEnded, true);
        assert.equal(evidence.transitions.filter(t => t.reason === 'track-ended-no-next').length, 1);
      }
      if (mode === 'recording-across-eof') {
        assert.equal(evidence.recording.phase, 'recording');
        assert.equal(evidence.nativeRecorderState, 'recording');
        await page.evaluate(() => window.rc05.RecorderEngine.stop());
        await page.waitForFunction(() => window.rc05.state.recording.phase === 'complete');
        assert.ok(await page.evaluate(() => window.rc05.state.recording.lastExportByteSize > 0));
      }
      assert.deepEqual(errors, []);
      results.push({ mode, evidence, errors });
      console.log(`${mode}: PASS`);
      await page.close();
    }
    const report = { version, artifact: path.relative(root, artifact), browser: browser.version(), results };
    if (process.env.RC05_REPORT) fs.writeFileSync(process.env.RC05_REPORT, JSON.stringify(report, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
