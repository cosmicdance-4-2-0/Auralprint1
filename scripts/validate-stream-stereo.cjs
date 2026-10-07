// Optional real-browser diagnostic. Requires Playwright and Chromium; it is not
// part of npm test or the app build. Run after npm run build:
// node scripts/validate-stream-stereo.cjs --report=/path/to/report.json
// Add --generator=/path/to/generator.html to try native capture of that tab.
// Add --chromium=/path/to/browser to override Playwright's browser resolution.
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND' || !err.message.startsWith("Cannot find module 'playwright'")) throw err;
  console.error('This optional stereo diagnostic requires an environment with Playwright available. ' +
    'npm test and npm run build do not require Playwright. Run it from a Playwright-enabled developer environment.');
  process.exit(1);
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Stereo diagnostic</title>'); return; }
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'text/plain');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const chromiumPath = option('chromium');
    browser = await chromium.launch({ ...(chromiumPath ? { executablePath: chromiumPath } : {}), headless: true,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream',
        '--auto-select-desktop-capture-source=Stereo Tone Generator', '--auto-select-tab-capture-source-by-title=Stereo Tone Generator'] });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    await page.goto(origin);
    const graph = await page.evaluate(async () => {
      const { resolveSettings } = await import('/src/js/core/preferences.js'); resolveSettings();
      const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
      const splitters = [];
      const original = AudioContext.prototype.createChannelSplitter;
      AudioContext.prototype.createChannelSplitter = function (...args) {
        const s = original.apply(this, args);
        splitters.push({ numberOfOutputs: s.numberOfOutputs, channelCount: s.channelCount,
          channelCountMode: s.channelCountMode, channelInterpretation: s.channelInterpretation });
        return s;
      };
      const ctx = new AudioContext(); await ctx.resume();
      const merger = ctx.createChannelMerger(2), destination = ctx.createMediaStreamDestination();
      merger.connect(destination);
      const left = ctx.createOscillator(), right = ctx.createOscillator();
      left.frequency.value = 440; right.frequency.value = 880;
      const gainL = ctx.createGain(), gainR = ctx.createGain();
      gainL.gain.value = gainR.gain.value = 0.2;
      left.connect(gainL); right.connect(gainR); gainL.connect(merger, 0, 0); gainR.connect(merger, 0, 1);
      left.start(); right.start();
      const settle = async () => { for (let i = 0; i < 35; i++) { AudioEngine.sample(); await new Promise(resolve => setTimeout(resolve, 20)); } };
      const measure = () => {
        const s = AudioEngine.sample();
        const read = band => {
          let peak = 0;
          for (let i = 1; i < band.freqDb.length; i++) if (band.freqDb[i] > band.freqDb[peak]) peak = i;
          const at = hz => band.freqDb[Math.round(hz * band.analyser.fftSize / ctx.sampleRate)];
          return { rms: band.rms, peakHz: peak * ctx.sampleRate / band.analyser.fftSize, db440: at(440), db880: at(880) };
        };
        return { monoLike: s.monoLike, correlation: s.debug.corrLR, L: read(s.bands.L), R: read(s.bands.R), C: read(s.bands.C) };
      };
      await AudioEngine.attachMediaStreamSource(destination.stream, { monitorOutput: false }); await settle();
      const stereo = { settings: destination.stream.getAudioTracks()[0].getSettings(), ...measure() };
      gainR.gain.value = 0; await settle(); const leftOnly = measure();
      gainL.gain.value = 0; gainR.gain.value = 0.2; await settle(); const rightOnly = measure();
      gainL.gain.value = 0.2; gainR.disconnect(merger); gainL.connect(merger, 0, 1);
      await settle(); const dualMono = { settings: destination.stream.getAudioTracks()[0].getSettings(), ...measure() };
      AudioEngine.unload();
      const monoDestination = ctx.createMediaStreamDestination();
      monoDestination.channelCount = 1; monoDestination.channelCountMode = 'explicit'; monoDestination.channelInterpretation = 'discrete';
      gainL.connect(monoDestination); await new Promise(resolve => setTimeout(resolve, 200));
      await AudioEngine.attachMediaStreamSource(monoDestination.stream, { monitorOutput: false }); await settle();
      const monoTrackObservation = { settings: monoDestination.stream.getAudioTracks()[0].getSettings(), ...measure() };
      monoTrackObservation.rightSilent = monoTrackObservation.R.rms < 1e-6;
      AudioEngine.unload();
      // Same frequencies and amplitude through an actual stereo WAV media element.
      const rate = ctx.sampleRate, frames = rate * 4, dataBytes = frames * 4;
      const wav = new ArrayBuffer(44 + dataBytes), view = new DataView(wav);
      const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
      text(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); text(8, 'WAVE'); text(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
      view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
      text(36, 'data'); view.setUint32(40, dataBytes, true);
      for (let i = 0; i < frames; i++) {
        view.setInt16(44 + i * 4, Math.round(0.2 * 32767 * Math.sin(2 * Math.PI * 440 * i / rate)), true);
        view.setInt16(46 + i * 4, Math.round(0.2 * 32767 * Math.sin(2 * Math.PI * 880 * i / rate)), true);
      }
      if (!await AudioEngine.loadFile(new File([wav], 'stereo-440-880.wav', { type: 'audio/wav' }))) throw new Error('WAV playback failed');
      await settle(); const file = measure();
      AudioEngine.unload(); left.stop(); right.stop();
      destination.stream.getTracks().forEach(track => track.stop()); monoDestination.stream.getTracks().forEach(track => track.stop());
      await ctx.close(); AudioContext.prototype.createChannelSplitter = original;
      return { splitters, stereo, leftOnly, rightOnly, dualMono, monoTrackObservation, file };
    });
    const checkStereo = s => {
      assert.equal(s.monoLike, false);
      assert.ok(Math.abs(s.L.peakHz - 440) < 30); assert.ok(Math.abs(s.R.peakHz - 880) < 30);
      assert.ok(s.L.db440 - s.L.db880 > 30); assert.ok(s.R.db880 - s.R.db440 > 30);
      assert.ok(Math.abs((s.C.db440 - s.L.db440) + 6.02) < 1);
      assert.ok(Math.abs((s.C.db880 - s.R.db880) + 6.02) < 1);
    };
    checkStereo(graph.stereo); checkStereo(graph.file);
    assert.equal(graph.stereo.settings.channelCount, 2);
    for (const [s, active, silent] of [[graph.leftOnly, 'L', 'R'], [graph.rightOnly, 'R', 'L']]) {
      assert.equal(s.monoLike, true); assert.ok(s[silent].rms < 1e-6);
      assert.ok(Math.abs(s.C.rms / s[active].rms - 1) < 0.08);
    }
    assert.equal(graph.dualMono.settings.channelCount, 2); assert.equal(graph.dualMono.monoLike, true);
    for (const s of graph.splitters) assert.deepEqual(s, { numberOfOutputs: 2, channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete' });

    const builtPage = await browser.newPage();
    builtPage.on('pageerror', err => pageErrors.push(err.message));
    await builtPage.goto(`${origin}/dist/auralprint_${version.slice(1)}.html`);
    const builtArtifact = { acquisitionStubbed: true, sessions: [] };
    for (const mode of ['stereo', 'dual-mono', 'mono', 'unknown']) {
      await builtPage.evaluate(async mode => {
        const ctx = new AudioContext(); await ctx.resume();
        const streamDestination = ctx.createMediaStreamDestination();
        const merge = ctx.createChannelMerger(2); merge.connect(streamDestination);
        const left = ctx.createOscillator(), right = ctx.createOscillator();
        left.frequency.value = 440; right.frequency.value = 880;
        if (mode === 'mono') { streamDestination.channelCount = 1; merge.disconnect(); left.connect(streamDestination); }
        else { left.connect(merge, 0, 0); (mode === 'dual-mono' ? left : right).connect(merge, 0, 1); }
        left.start(); right.start(); await new Promise(resolve => setTimeout(resolve, 200));
        if (mode === 'unknown') streamDestination.stream.getAudioTracks()[0].getSettings = () => ({});
        window.diagnosticSource = { ctx, left, right, stream: streamDestination.stream };
        navigator.mediaDevices.getDisplayMedia = async request => { window.diagnosticRequest = request; return streamDestination.stream; };
      }, mode);
      await builtPage.locator('#btnSourceStream').click();
      await builtPage.waitForFunction(() => document.querySelector('#audioStatus').textContent.startsWith('Stream live:'));
      await builtPage.waitForTimeout(1000);
      const status = await builtPage.locator('#audioStatus').textContent();
      if (mode === 'unknown') assert.doesNotMatch(status, /Capture:/);
      else assert.match(status, mode === 'mono' ? /Capture: mono \(1ch\)/ : /Capture: 2ch/);
      assert.match(status, mode === 'mono' || mode === 'dual-mono' ? /Bands: mono-ish/ : /Bands: stereo/);
      const request = await builtPage.evaluate(() => window.diagnosticRequest);
      assert.deepEqual(request, { video: true, audio: { channelCount: { ideal: 2 }, echoCancellation: { ideal: false }, noiseSuppression: { ideal: false }, autoGainControl: { ideal: false } } });
      builtArtifact.sessions.push({ mode, status, request });
      await builtPage.locator('#btnSourceFile').click();
      await builtPage.waitForFunction(() => !document.querySelector('#audioStatus').textContent.includes('Capture:'));
      await builtPage.evaluate(async () => { const s = window.diagnosticSource; s.left.stop(); s.right.stop(); await s.ctx.close(); });
    }
    const result = { version, browser: await browser.version(), graph, builtArtifact, nativeDisplay: { attempted: false }, pageErrors };
    if (option('generator')) {
      const source = await browser.newPage();
      await source.route('**/generator.html', route => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(option('generator'), 'utf8') }));
      await source.goto(`${origin}/generator.html`); await source.locator('#toggle').click();
      await source.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Playing'));
      const capture = await browser.newPage(); await capture.goto(origin);
      await capture.evaluate(() => {
        const button = document.createElement('button'); button.id = 'capture'; button.textContent = 'Capture generator'; document.body.append(button);
        button.onclick = async () => {
          try {
            const { InputSourceManager } = await import('/src/js/audio/input-source-manager.js');
            const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
            const { state } = await import('/src/js/core/state.js');
            const { resolveSettings } = await import('/src/js/core/preferences.js'); resolveSettings();
            const activation = await InputSourceManager.activateStream();
            const stream = activation.ok ? AudioEngine.getRecorderTap().ensureStream() : null;
            window.nativeResult = { attempted: true, activation, streamMeta: { ...state.source.streamMeta },
              trackSettings: stream ? stream.getAudioTracks().map(track => track.getSettings()) : [] };
            if (stream) {
              for (let i = 0; i < 35; i++) { AudioEngine.sample(); await new Promise(resolve => setTimeout(resolve, 20)); }
              const sample = AudioEngine.sample();
              const read = band => {
                const rate = band.analyser.context.sampleRate;
                let peak = 0;
                for (let i = 1; i < band.freqDb.length; i++) if (band.freqDb[i] > band.freqDb[peak]) peak = i;
                const at = hz => band.freqDb[Math.round(hz * band.analyser.fftSize / rate)];
                return { rms: band.rms, peakHz: peak * rate / band.analyser.fftSize, db440: at(440), db880: at(880) };
              };
              window.nativeResult.analysis = { monoLike: sample.monoLike, L: read(sample.bands.L), R: read(sample.bands.R), C: read(sample.bands.C) };
              window.nativeResult.preservesStereo = state.source.streamMeta.audioChannelCount === 2 && !sample.monoLike
                && Math.abs(window.nativeResult.analysis.L.peakHz - 440) < 30 && Math.abs(window.nativeResult.analysis.R.peakHz - 880) < 30;
              await InputSourceManager.teardownActiveSource();
            }
          } catch (err) { window.nativeResult = { attempted: true, name: err.name, reason: err.message }; }
        };
      });
      await capture.locator('#capture').click();
      try { await capture.waitForFunction(() => window.nativeResult, null, { timeout: 12000 }); result.nativeDisplay = await capture.evaluate(() => window.nativeResult); }
      catch { result.nativeDisplay = { attempted: true, reason: 'Native display chooser did not complete in headless Chromium' }; }
    }
    assert.deepEqual(pageErrors, []);
    if (option('report')) fs.writeFileSync(option('report'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err); process.exitCode = 1; });
