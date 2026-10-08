// Optional RC-19 native validation. No browser dependency is required by CI.
// RC19_PLAYWRIGHT_MODULE, RC19_CHROMIUM_PATH, RC19_REPORT select tooling/output.
// RC19_EXPECT_BASELINE=1 runs the historical active-disposal reproduction only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.RC19_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.RC19_REPO_ROOT || path.join(__dirname, '..'));
const baseline = process.env.RC19_EXPECT_BASELINE === '1';

(async () => {
  const browser = await chromium.launch({
    ...(process.env.RC19_CHROMIUM_PATH ? { executablePath: process.env.RC19_CHROMIUM_PATH } : {}),
    headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const results = [];
  try {
    for (const mode of baseline ? ['live-active'] : ['live-active', 'live-finalizing', 'file-active']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://localhost/**', route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><canvas id="c" width="400" height="300"></canvas>' });
        const filename = path.resolve(root, '.' + pathname);
        if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename)) return route.fulfill({ status: 404 });
        return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(filename) });
      });
      await page.goto('http://localhost/');
      const result = await page.evaluate(async ({ mode, baseline }) => {
        const { RecorderEngine: recorder } = await import('/src/js/recording/recorder-engine.js');
        const { AudioEngine: audio } = await import('/src/js/audio/audio-engine.js');
        const { createInputSourceManager } = await import('/src/js/audio/input-source-manager.js');
        const { state } = await import('/src/js/core/state.js');
        const { resolveSettings } = await import('/src/js/core/preferences.js');
        resolveSettings();
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const until = async predicate => {
          for (let attempt = 0; attempt < 250; attempt++) { if (predicate()) return; await wait(20); }
          throw new Error('bounded native observation timed out');
        };
        const stamp = () => ({ utc: new Date().toISOString(), performanceMs: performance.now() });
        const NativeRecorder = MediaRecorder, NativeContext = AudioContext;
        const natives = [], created = [], revoked = [], graphs = [], taps = [];
        const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = blob => { const url = create(blob); created.push({ url, type: blob.type, size: blob.size }); return url; };
        URL.revokeObjectURL = url => { revoked.push(url); revoke(url); };
        window.MediaRecorder = class extends NativeRecorder {
          constructor(...args) {
            super(...args); natives.push(this); this.stopCalls = 0; this.events = [];
            for (const type of ['dataavailable', 'stop', 'error']) this.addEventListener(type, event => {
              this.events.push({ type, ...stamp(), state: this.state, appPhase: state.recording.phase, bytes: event.data?.size || 0 });
            });
          }
          stop() { this.stopCalls++; return super.stop(); }
        };
        window.AudioContext = class extends NativeContext {
          createMediaStreamSource(stream) {
            const source = super.createMediaStreamSource(stream), disconnect = source.disconnect.bind(source);
            const graph = { disconnects: 0 }; graphs.push(graph);
            source.disconnect = (...args) => { graph.disconnects++; return disconnect(...args); }; return source;
          }
        };
        const generator = new NativeContext(); await generator.resume();
        const destination = generator.createMediaStreamDestination(), oscillator = generator.createOscillator();
        oscillator.connect(destination); oscillator.start();
        const upstream = destination.stream.getAudioTracks()[0], nativeTrackStop = upstream.stop.bind(upstream);
        let upstreamStops = 0;
        upstream.stop = () => { upstreamStops++; nativeTrackStop(); };
        let manager;
        if (mode.startsWith('live')) {
          // Actual production source ownership, with generated native audio in
          // place of permission-dependent microphone acquisition.
          manager = createInputSourceManager({ stateRef: state, audioEngine: audio,
            mediaDevices: { getUserMedia: async () => destination.stream } });
          const activated = await manager.activateMic();
          if (!activated.ok) throw new Error(JSON.stringify(activated));
        } else {
          const rate = 44100, frames = rate * 12, bytes = frames * 2;
          const data = new ArrayBuffer(44 + bytes), view = new DataView(data);
          const ascii = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
          ascii(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
          view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
          view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
          ascii(36, 'data'); view.setUint32(40, bytes, true);
          for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / rate)), true);
          await audio.loadFile(new File([data], 'rc19.wav', { type: 'audio/wav' }));
          if (!state.audio.isLoaded) throw new Error('file playback failed to load');
        }
        const canvas = document.getElementById('c'), context = canvas.getContext('2d');
        let hue = 0, releases = 0;
        const drawing = setInterval(() => { context.fillStyle = `hsl(${hue++ % 360},80%,50%)`; context.fillRect(0, 0, 400, 300); }, 16);
        const init = () => recorder.init({ stateRef: state.recording, getRenderTap: () => ({ canvas }),
          getAudioTap() {
            const tap = audio.getRecorderTap();
            return { ...tap, ensureStream() { const stream = tap.ensureStream(); taps.push(stream); return stream; },
              releaseStream() { releases++; tap.releaseStream(); } };
          } });
        init();
        const start = recorder.start();
        if (!start.ok) throw new Error(JSON.stringify(start));
        await wait(550);
        const native = natives.at(-1), old = { data: native.ondataavailable, stop: native.onstop, error: native.onerror };
        const before = { ...stamp(), nativeState: native.state, phase: state.recording.phase, tracks: native.stream.getTracks().map(track => ({ kind: track.kind, state: track.readyState })) };
        let stop;
        if (mode === 'live-finalizing') stop = recorder.stop();
        const atDispose = { ...stamp(), nativeState: native.state, phase: state.recording.phase };
        const disposition = recorder.dispose();
        const returned = { ...stamp(), nativeState: native.state, phase: state.recording.phase };
        const invokeOld = () => { old.data({ data: new Blob(['stale']) }); old.stop(); old.error({ error: new Error('deliberate old error') }); };
        const disposedSnapshot = JSON.stringify(state.recording);
        invokeOld();
        const staleUnchanged = disposedSnapshot === JSON.stringify(state.recording);
        await wait(1500);
        const after = { ...stamp(), nativeState: native.state, phase: state.recording.phase,
          tracks: native.stream.getTracks().map(track => ({ kind: track.kind, state: track.readyState })),
          upstreamState: upstream.readyState, upstreamStops, sourceAttached: state.source.sessionActive,
          sampleReady: audio.sample().ready, graphDisconnects: graphs[0]?.disconnects,
          playbackPaused: audio.getMediaEl()?.paused, playbackLoaded: state.audio.isLoaded,
          recording: { ...state.recording }, releases, nativeStopCalls: native.stopCalls,
          unchangedAfterNativeEvents: disposedSnapshot === JSON.stringify(state.recording),
          recordingUrls: created.filter(value => value.type.startsWith('video/')) };
        const events = native.events.slice();
        let reinitialized;
        if (!baseline) {
          init();
          const restart = recorder.start(), next = natives.at(-1);
          const newSnapshot = JSON.stringify(state.recording), video = next.stream.getVideoTracks()[0];
          invokeOld();
          const clean = newSnapshot === JSON.stringify(state.recording) && video.readyState === 'live' && next.state === 'recording';
          await wait(600);
          const ordinaryStop = recorder.stop(); await until(() => state.recording.phase !== 'finalizing');
          const exportUrl = state.recording.lastExportUrl;
          const blob = exportUrl ? await (await fetch(exportUrl)).blob() : null;
          const completeSnapshot = JSON.stringify(state.recording); invokeOld();
          reinitialized = { restart: { ok: restart.ok, code: restart.code }, nativeStateAfterStart: 'recording',
            cleanAfterOldCallbacks: clean, ordinaryStop: { ok: ordinaryStop.ok, code: ordinaryStop.code },
            phase: state.recording.phase, nativeStateAfterStop: next.state, nativeStopCalls: next.stopCalls,
            exportBytes: blob?.size || 0, exportType: blob?.type, oldCallbacksPreserveExport: completeSnapshot === JSON.stringify(state.recording),
            upstreamState: upstream.readyState, upstreamStops, playbackPaused: audio.getMediaEl()?.paused };
          recorder.dispose(); recorder.dispose();
          reinitialized.exportRevocations = revoked.filter(url => url === exportUrl).length;
          reinitialized.exportCleared = state.recording.lastExportUrl === null;
        } else if (native.state !== 'inactive') native.stop();
        clearInterval(drawing); recorder.dispose();
        if (manager) await manager.teardownActiveSource({ reason: 'native-test-cleanup' }); else audio.unload();
        oscillator.stop(); nativeTrackStop(); await generator.close();
        return { mode, browser: navigator.userAgent, before, atDispose, disposition, returned, stop,
          staleUnchanged, after, events, reinitialized };
      }, { mode, baseline });
      result.errors = errors;
      assert.deepEqual(errors, []);
      assert.equal(result.before.nativeState, 'recording');
      assert.equal(result.before.tracks.find(track => track.kind === 'audio').state, 'live');
      assert.equal(result.after.phase, 'disabled');
      assert.equal(result.after.nativeState, baseline ? 'recording' : 'inactive');
      assert.equal(result.after.tracks.find(track => track.kind === 'video').state, 'ended');
      assert.equal(result.after.upstreamState, 'live'); assert.equal(result.after.upstreamStops, 0);
      assert.equal(result.after.sampleReady, true); assert.equal(result.after.releases, 1);
      assert.equal(result.after.recording.lastExportUrl, null); assert.equal(result.after.recording.chunkCount, 0);
      assert.equal(result.staleUnchanged, true); assert.equal(result.after.unchangedAfterNativeEvents, true);
      assert.deepEqual(result.after.recordingUrls, []);
      if (mode.startsWith('live')) {
        assert.equal(result.after.sourceAttached, true); assert.equal(result.after.graphDisconnects, 0);
        assert.equal(result.after.tracks.find(track => track.kind === 'audio').state, 'live');
      } else {
        assert.equal(result.after.playbackLoaded, true); assert.equal(result.after.playbackPaused, false);
        assert.equal(result.after.tracks.find(track => track.kind === 'audio').state, 'ended');
      }
      if (!baseline) {
        assert.equal(result.disposition.ok, true); assert.equal(result.after.nativeStopCalls, 1);
        assert.ok(result.events.some(event => event.type === 'stop'));
        const next = result.reinitialized;
        assert.equal(next.restart.ok, true); assert.equal(next.cleanAfterOldCallbacks, true);
        assert.equal(next.phase, 'complete'); assert.equal(next.nativeStateAfterStop, 'inactive');
        assert.equal(next.nativeStopCalls, 1); assert.ok(next.exportBytes > 0);
        assert.equal(next.oldCallbacksPreserveExport, true); assert.equal(next.upstreamStops, 0);
        assert.equal(next.exportRevocations, 1); assert.equal(next.exportCleared, true);
      }
      results.push(result); await page.close();
    }
    const report = { baseline, version: fs.readFileSync(path.join(root, 'version'), 'utf8').trim(), results };
    if (process.env.RC19_REPORT) fs.writeFileSync(process.env.RC19_REPORT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
