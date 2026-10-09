/* F.6 opt-in acceptance. Production files are never written.
 * Native invalid media is not fault-injected. Other faults and read-only
 * browser-memory instrumentation are recorded explicitly in each result.
 * Run after build; --output and --export-dir select fresh evidence paths.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../../../../..');
const args = process.argv.slice(2);
const option = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
const portablePath = path.join(root, 'dist/auralprint_0.1.15m.i.f.html');
const portable = fs.readFileSync(portablePath, 'utf8');
function insert(text, marker, addition) {
  assert.equal(text.split(marker).length, 2, marker);
  return text.replace(marker, addition);
}
let observed = insert(portable, '  main();\n})();',
  '  window.__acceptance = {state, Queue, AudioEngine, InputSourceManager, RecorderEngine};\n  main();\n})();');
observed = insert(observed, '      getRecorderTap() {',
  '      __inspection() { return {sourceNode, outputGain, splitter, sumNode, sumGainL, sumGainR, bands, activeUpstream, mediaStream, mediaElAbort, mediaObjectUrl, recorderTapDestination, recorderTapConnectedOutputGain}; },\n      getRecorderTap() {');
observed = insert(observed, '    const nextAbort = new AbortController();',
  '    const nextAbort = new AbortController(); window.__audit.candidates.push({media:nextMediaEl, controller:nextAbort});');
observed = insert(observed, '      AudioEngine._isLoadRequestCurrent = isCurrentFileRequest;',
  '      window.__requestInspection = () => activeFileRequest;\n      AudioEngine._isLoadRequestCurrent = isCurrentFileRequest;');
observed = insert(observed, '      onAnimationFrame: onAnimationFrame2',
  '      __inspection: () => runtime2,\n      onAnimationFrame: onAnimationFrame2');

function wav(seconds = 8, hz = 440) {
  const rate = 44100, frames = Math.floor(rate * seconds), b = Buffer.alloc(44 + frames * 4);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
    b.writeInt16LE(Math.round(5000 * Math.sin(2 * Math.PI * hz * (c + 1) * i / rate)), 44 + i * 4 + c * 2);
  }
  return b;
}
const fixture = name => ({ name, mimeType: 'audio/wav', buffer: wav(8, name === 'B.wav' ? 660 : 440) });
const corrupt = { name: 'corrupt.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid audio fixture') };

function instrument() {
  const a = window.__audit = { media: [], candidates: [], nodes: [], contexts: [], urls: [],
    operations: [], writes: [], notifications: [], errors: [], nativeErrors: [], holds: [],
    resumeModes: [], recorders: [], capturedTracks: [], fault: null };
  const ids = new WeakMap(); let next = 1;
  a.id = value => { if (!value) return null; if (!ids.has(value)) ids.set(value, next++); return ids.get(value); };
  const NativeContext = window.AudioContext; a.NativeContext = NativeContext;
  function fail() {
    const fault = a.fault; fault.hit = true;
    const app = window.__acceptance, g = app?.AudioEngine.__inspection();
    a.failureBoundary = { code: fault.code, media: a.id(app?.AudioEngine.getMediaEl()),
      source: a.id(g?.sourceNode), output: a.id(g?.outputGain),
      tapConnected: a.id(g?.recorderTapConnectedOutputGain) };
    throw new DOMException(`F6 controlled ${fault.code} failure`, 'NotSupportedError');
  }
  a.arm = code => { a.fault = { code, hit: false, gain: 0, analyser: 0, connect: 0 }; };
  function before(kind) {
    const f = a.fault; if (!f || f.hit) return;
    if (kind in f) f[kind]++;
    if ((f.code === 'before-transfer' && kind === 'source') ||
        (f.code === 'gain-first' && kind === 'gain' && f.gain === 1) ||
        (f.code === 'gain-partial' && kind === 'gain' && f.gain === 4) ||
        (f.code === 'splitter' && kind === 'splitter') ||
        (f.code === 'analyser-first' && kind === 'analyser' && f.analyser === 1) ||
        (f.code === 'analyser-partial' && kind === 'analyser' && f.analyser === 3)) fail();
  }
  const add = (node, kind) => { a.nodes.push({ node, kind, disconnectAll: 0, destinations: new Set() }); return node; };
  window.AudioContext = class extends NativeContext {
    constructor(...args) { super(...args); a.contexts.push(this); }
    resume() {
      const mode = a.resumeModes.shift();
      if (mode === 'reject') return Promise.reject(new DOMException('F6 resume refused', 'InvalidStateError'));
      if (mode === 'hold') return new Promise((resolve, reject) => a.holds.push({ kind: 'resume',
        resolve: () => NativeContext.prototype.resume.call(this).then(resolve, reject), reject }));
      return NativeContext.prototype.resume.call(this);
    }
    createMediaElementSource(media) { before('source'); return add(super.createMediaElementSource(media), 'source'); }
    createMediaStreamSource(stream) { return add(super.createMediaStreamSource(stream), 'live-source'); }
    createGain() { before('gain'); return add(super.createGain(), 'gain'); }
    createChannelSplitter(...args) { before('splitter'); return add(super.createChannelSplitter(...args), 'splitter'); }
    createMediaStreamDestination() { return add(super.createMediaStreamDestination(), 'tap'); }
    createAnalyser() {
      before('analyser'); const node = add(super.createAnalyser(), 'analyser');
      const fft = Object.getOwnPropertyDescriptor(AnalyserNode.prototype, 'fftSize');
      const smooth = Object.getOwnPropertyDescriptor(AnalyserNode.prototype, 'smoothingTimeConstant');
      let smoothWrites = 0;
      Object.defineProperty(node, 'fftSize', { get: () => fft.get.call(node), set(value) {
        if (a.fault?.code === 'analyser-config' && !a.fault.hit) fail();
        fft.set.call(node, value);
      } });
      Object.defineProperty(node, 'smoothingTimeConstant', { get: () => smooth.get.call(node), set(value) {
        smoothWrites++;
        if (a.fault?.code === 'after-tap' && !a.fault.hit && smoothWrites === 2) fail();
        smooth.set.call(node, value);
      } });
      return node;
    }
  };
  const connect = AudioNode.prototype.connect, disconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.connect = function (...args) {
    const f = a.fault;
    if (f && !f.hit && f.code === 'partial-connect' && ++f.connect === 4) fail();
    const result = connect.apply(this, args);
    a.nodes.find(x => x.node === this)?.destinations.add(a.id(args[0]));
    a.operations.push({ type: 'connect', node: a.id(this), destination: a.id(args[0]) }); return result;
  };
  AudioNode.prototype.disconnect = function (...args) {
    const result = disconnect.apply(this, args), n = a.nodes.find(x => x.node === this);
    if (n) { if (!args.length) { n.disconnectAll++; n.destinations.clear(); } else n.destinations.delete(a.id(args[0])); }
    a.operations.push({ type: 'disconnect', node: a.id(this), destination: a.id(args[0]) }); return result;
  };
  const create = document.createElement.bind(document);
  document.createElement = function (tag, ...args) {
    const el = create(tag, ...args);
    if (tag.toLowerCase() === 'audio') {
      a.media.push(el); el.__callbacks = [];
      const listen = el.addEventListener.bind(el);
      el.addEventListener = function (type, callback, options) {
        if (options?.signal) this.__callbacks.push({ type, callback, signal: options.signal });
        return listen(type, callback, options);
      };
      listen('error', () => a.nativeErrors.push({ media: a.id(el), code: el.error?.code }));
    }
    return el;
  };
  const play = HTMLMediaElement.prototype.play, pause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.play = function (...args) {
    a.operations.push({ type: 'play', media: a.id(this) });
    const mode = a.playMode; a.playMode = null;
    if (mode === 'throw') throw new DOMException('F6 native Play synchronous refusal', 'InvalidStateError');
    if (mode === 'reject') return Promise.reject(new DOMException('F6 native Play refusal', 'NotAllowedError'));
    const result = play.apply(this, args);
    if (mode === 'hold') return result.then(() => new Promise((resolve, reject) => a.holds.push({ kind: 'play', resolve, reject })));
    return result;
  };
  HTMLMediaElement.prototype.pause = function (...args) { a.operations.push({ type: 'pause', media: a.id(this) }); return pause.apply(this, args); };
  const makeUrl = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = makeUrl(blob); a.urls.push({ type: 'create', url, name: blob.name || '', bytes: blob.size }); return url; };
  URL.revokeObjectURL = url => { a.urls.push({ type: 'revoke', url }); return revoke(url); };
  const stop = MediaStreamTrack.prototype.stop;
  MediaStreamTrack.prototype.stop = function (...args) { a.operations.push({ type: 'track-stop', track: a.id(this) }); return stop.apply(this, args); };
  const NativeRecorder = window.MediaRecorder;
  window.MediaRecorder = class extends NativeRecorder {
    constructor(stream, ...args) { super(stream, ...args); a.recorders.push(this); a.capturedTracks.push(...stream.getTracks());
      this.addEventListener('stop', () => a.notifications.push({ type: 'native-recorder-stop' })); }
  };
  window.addEventListener('unhandledrejection', e => a.errors.push({ name: e.reason?.name, message: e.reason?.message || String(e.reason) }));
}

async function main() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/observed.html') { res.setHeader('Content-Type', 'text/html'); res.end(observed); return; }
    const relative = url.pathname.replace(/^\/apps\/auralprint\//, '/');
    const file = url.pathname === '/portable.html' ? portablePath : path.join(root, 'dist/hosted', relative === '/' ? 'index.html' : relative);
    if (!file.startsWith(path.join(root, 'dist')) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' })[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const results = { phase: 'F.6', auditedCommit: '158a782c4af0466bd09a9c11dc9f3db0dd6f780d', browser: await browser.version(),
    artifactSha256: crypto.createHash('sha256').update(portable).digest('hex'), cases: [] };
  const click = (p, id) => p.evaluate(id => document.getElementById(id).click(), id);
  const row = (p, index) => p.evaluate(i => document.querySelectorAll('#queueList .queue-item')[i].click(), index);
  const active = (p, name) => p.waitForFunction(name => __acceptance.state.source.status === 'active' && __acceptance.state.audio.filename === name && !__requestInspection().pending, name);
  const failed = p => p.waitForFunction(() => __acceptance.state.source.status === 'error' && !__requestInspection().pending);
  const ingest = (p, files) => p.locator('#fileInput').setInputFiles(files);
  async function page() {
    const p = await browser.newPage(); p.setDefaultTimeout(12000); p.exceptions = []; p.consoleErrors = [];
    p.on('pageerror', e => p.exceptions.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.consoleErrors.push(m.text()); });
    await p.addInitScript(instrument); await p.goto(base + '/observed.html');
    await p.evaluate(() => {
      for (const field of ['audio', 'source']) __acceptance.state[field] = new Proxy(__acceptance.state[field], {
        set(object, key, value) { __audit.writes.push({ field, key, value }); object[key] = value; return true; } });
      const notify = __acceptance.RecorderEngine.onTransportMutation;
      __acceptance.RecorderEngine.onTransportMutation = function (type, details) { __audit.notifications.push({ type, details }); return notify.call(this, type, details); };
    }); return p;
  }
  async function snapshot(p) {
    return p.evaluate(() => {
      const app = __acceptance, a = __audit, g = app.AudioEngine.__inspection(), el = app.AudioEngine.getMediaEl();
      const r = app.RecorderEngine.__inspection(), request = __requestInspection();
      return { audio: { ...app.state.audio }, source: structuredClone({ ...app.state.source }), queue: app.Queue.snapshot(),
        entry: a.id(app.Queue.currentEntry()), request: request ? { id: request.requestId, entry: a.id(request.entry), pending: request.pending, autoPlay: request.autoPlay } : null,
        media: el ? { id: a.id(el), src: el.getAttribute('src'), time: el.currentTime, paused: el.paused } : null,
        graph: Object.fromEntries(['sourceNode','outputGain','splitter','sumNode','sumGainL','sumGainR','activeUpstream','mediaStream','mediaElAbort','recorderTapDestination','recorderTapConnectedOutputGain'].map(k => [k, a.id(g[k])])),
        ready: app.AudioEngine.sample().ready, bands: g.bands.size, objectUrl: g.mediaObjectUrl,
        candidates: a.candidates.map(c => ({ id: a.id(c.media), src: c.media.getAttribute('src'), paused: c.media.paused,
          aborted: c.controller.signal.aborted, callbacks: c.media.__callbacks.map(x => ({ type: x.type, aborted: x.signal.aborted })) })),
        nodes: a.nodes.map(n => ({ id: a.id(n.node), kind: n.kind, disconnectAll: n.disconnectAll, destinations: [...n.destinations] })),
        urls: [...a.urls], operations: [...a.operations], writes: [...a.writes], notifications: [...a.notifications], errors: [...a.errors], nativeErrors: [...a.nativeErrors], failureBoundary: a.failureBoundary,
        recorder: r.mediaRecorder ? { id: a.id(r.mediaRecorder), state: r.mediaRecorder.state } : null,
        recording: { ...app.state.recording }, capturedTracks: a.capturedTracks.map(t => ({ id: a.id(t), kind: t.kind, state: t.readyState })),
        upstreamTracks: a.upstream ? a.upstream.getTracks().map(t => ({ id: a.id(t), state: t.readyState })) : [], uiError: document.getElementById('audioStatus').textContent };
    });
  }
  function cleanup(s, expectedCode = 'file-activation-failed', assertUi = true) {
    assert.equal(s.media, null); assert.equal(s.ready, false); assert.equal(s.bands, 0); assert.equal(s.objectUrl, null);
    for (const field of ['sourceNode','outputGain','splitter','sumNode','sumGainL','sumGainR','activeUpstream','mediaStream','mediaElAbort','recorderTapConnectedOutputGain']) assert.equal(s.graph[field], null, field);
    assert.equal(s.source.status, 'error'); assert.equal(s.source.errorCode, expectedCode); assert.equal(s.source.sessionActive, false);
    assert.equal(s.audio.isLoaded, false); assert.equal(s.audio.isPlaying, false); assert.ok(s.audio.transportError);
    assert.equal(s.source.errorMessage, s.audio.transportError);
    if (assertUi) assert.match(s.uiError, /failed|error|unreadable|unsupported/i);
    const c = s.candidates.at(-1); assert.equal(c.src, null); assert.equal(c.paused, true); assert.equal(c.aborted, true); assert.ok(c.callbacks.every(x => x.aborted));
    assert.deepEqual(s.errors, []);
  }
  async function run(name, fn) {
    let p;
    try { p = await page(); const details = await fn(p); assert.deepEqual(p.exceptions, []); results.cases.push({ name, passed: true, ...details, exceptions: p.exceptions, consoleErrors: p.consoleErrors }); console.log(name, 'PASS'); }
    catch (e) { results.cases.push({ name, passed: false, assertion: { message: e.message, actual: e.actual, expected: e.expected, code: e.code }, snapshot: p ? await snapshot(p).catch(() => null) : null }); console.error(name, e); }
    finally { if (p) await p.close(); }
  }
  async function synthesizeLive(p) {
    await p.evaluate(async () => {
      const ctx = new __audit.NativeContext(), dest = ctx.createMediaStreamDestination(), oscillator = ctx.createOscillator();
      oscillator.connect(dest); oscillator.start(); await ctx.resume(); __audit.upstream = dest.stream; __audit.liveContext = ctx;
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => dest.stream, getDisplayMedia: async () => dest.stream, getSupportedConstraints: () => ({}) } });
    });
  }
  try {
    for (const boundary of ['corrupt','before-transfer','gain-first','splitter','gain-partial','analyser-first','analyser-partial','analyser-config','partial-connect','after-tap']) {
      await run('terminal cleanup at ' + boundary, async p => {
        if (boundary !== 'corrupt') await p.evaluate(code => __audit.arm(code), boundary);
        await ingest(p, [boundary === 'corrupt' ? corrupt : fixture('valid.wav')]); await failed(p);
        const terminal = await snapshot(p); cleanup(terminal, 'file-activation-failed', false);
        await p.waitForFunction(() => /error|failed|unreadable|unsupported/i.test(document.getElementById('audioStatus').textContent));
        const projected = await snapshot(p); cleanup(projected);
        assert.equal(terminal.notifications.filter(e => e.type === 'track-change-failed').length, 1);
        assert.ok(terminal.nodes.every(n => n.disconnectAll === 1 && n.destinations.length === 0));
        assert.ok(terminal.urls.some(x => x.type === 'revoke' && x.url === terminal.urls.find(x => x.type === 'create').url));
        if (boundary === 'corrupt') assert.ok(terminal.nativeErrors.some(e => e.code === 4));
        else { assert.match(terminal.audio.transportError, /audio source attachment failed/); assert.match(terminal.audio.transportError, new RegExp(boundary)); assert.doesNotMatch(terminal.audio.transportError, /unsupported or unreadable/); }
        // Read-only captured callbacks model callbacks queued before abortion.
        await p.evaluate(() => { __audit.writes.length = 0; for (const c of __audit.media.at(-1).__callbacks) c.callback(); });
        const queued = await snapshot(p); assert.deepEqual(queued.writes, []); cleanup(queued);
        if (boundary === 'corrupt') { await click(p, 'btnClearQueue'); await ingest(p, [fixture('recovery.wav')]); await active(p, 'recovery.wav'); }
        else { await row(p, 0); await active(p, 'valid.wav'); }
        const retry = await snapshot(p); assert.equal(retry.ready, true); assert.equal(retry.audio.transportError, '');
        return { boundary, primaryFaultInjected: boundary !== 'corrupt', terminal, projectedUiError: projected.uiError, queuedCallbacks: { writes: queued.writes, notifications: queued.notifications }, retry: { media: retry.media, source: retry.source, ready: retry.ready } };
      });
    }
    await run('installed File native error callback releases once', async p => {
      await ingest(p, [fixture('A.wav')]); await active(p, 'A.wav'); const before = await snapshot(p);
      // Explicit event injection exercises committed-session error routing; the
      // primary corrupt-media test above uses the real decoder instead.
      await p.evaluate(() => __acceptance.AudioEngine.getMediaEl().dispatchEvent(new Event('error'))); await failed(p);
      const terminal = await snapshot(p); cleanup(terminal, 'file-playback-error', false);
      // A committed File still has the configured 2500ms "Loaded" toast.
      // Observe resources immediately; separately wait for normal status
      // projection after that toast, without changing application timers.
      await p.waitForFunction(() => /error|unreadable|unsupported/i.test(document.getElementById('audioStatus').textContent));
      const projected = await snapshot(p); cleanup(projected, 'file-playback-error');
      assert.ok(terminal.nodes.every(n => n.disconnectAll === 1));
      const operations = terminal.operations.length;
      await p.evaluate(() => { for (const c of __audit.media.at(-1).__callbacks) c.callback(); });
      const after = await snapshot(p); assert.equal(after.operations.length, operations); assert.equal(after.notifications.filter(e => e.type === 'track-change-failed').length, 0);
      return { before: { media: before.media, source: before.source }, terminal, projectedUiError: projected.uiError, callbackInjection: 'Synthetic error event on a committed native element; then captured queued callbacks' };
    });
    for (const winner of ['file','failed-file','clear','mic','stream']) await run('obsolete Play completion and callbacks after ' + winner, async p => {
      await ingest(p, [fixture('start.wav'), fixture('A.wav'), fixture('B.wav')]); await active(p, 'start.wav');
      await p.evaluate(() => { __audit.playMode = 'hold'; }); await row(p, 1); await p.waitForFunction(() => __audit.holds.some(h => h.kind === 'play'));
      const pending = await snapshot(p); assert.equal(pending.request.pending, true); const loser = pending.media.id;
      if (winner === 'clear') await click(p, 'btnClearQueue');
      else if (winner === 'file') { await row(p, 2); await active(p, 'B.wav'); }
      else if (winner === 'failed-file') { await p.evaluate(() => __audit.arm('gain-first')); await row(p, 2); await failed(p); }
      else { await synthesizeLive(p); await click(p, winner === 'mic' ? 'btnSourceMic' : 'btnSourceStream'); await p.waitForFunction(kind => __acceptance.state.source.kind === kind && __acceptance.state.source.status === 'active', winner); }
      const before = await snapshot(p);
      await p.evaluate(loser => {
        const a = __audit; a.writes.length = 0; a.operations.length = 0; a.notifications.length = 0; a.urls.length = 0;
        const el = a.media.find(el => a.id(el) === loser); for (const c of el.__callbacks) c.callback();
        const i = a.holds.findIndex(h => h.kind === 'play'); a.holds.splice(i, 1)[0].reject(new DOMException('F6 obsolete hard decoder rejection', 'NotSupportedError'));
      }, loser);
      await p.waitForFunction(() => __audit.holds.length === 0);
      await p.evaluate(() => new Promise(resolve => queueMicrotask(() => queueMicrotask(resolve))));
      const after = await snapshot(p); assert.deepEqual(after.writes, []); assert.deepEqual(after.operations, []); assert.deepEqual(after.notifications, []);
      assert.deepEqual(after.audio, before.audio); assert.deepEqual(after.source, before.source); assert.deepEqual(after.graph, before.graph);
      assert.equal(after.media?.id || null, before.media?.id || null); assert.deepEqual(after.nodes, before.nodes);
      const loserUrl = pending.urls.find(x => x.type === 'create' && x.name === 'A.wav').url;
      assert.ok(after.urls.every(x => x.type === 'revoke' && x.url === loserUrl)); assert.deepEqual(after.errors, []);
      if (winner === 'mic' || winner === 'stream') assert.ok(after.upstreamTracks.every(t => t.state === 'live'));
      return { winner, nativePlayPromiseHeld: true, pending: { request: pending.request, media: pending.media }, before, after };
    });
    for (const mode of ['resume','reject','throw']) await run('recoverable loaded Play ' + mode, async p => {
      await ingest(p, [fixture('A.wav')]); await active(p, 'A.wav'); await click(p, 'btnPlay');
      await p.waitForFunction(() => __acceptance.AudioEngine.getMediaEl().paused && !__acceptance.state.audio.isPlaying);
      await p.evaluate(() => { __acceptance.AudioEngine.getMediaEl().currentTime = 0.4; }); const before = await snapshot(p);
      if (mode === 'resume') await p.evaluate(async () => { await __audit.contexts[0].suspend(); __audit.resumeModes.push('reject'); });
      else await p.evaluate(mode => { __audit.playMode = mode; }, mode);
      await click(p, 'btnPlay'); await p.waitForFunction(() => !!__acceptance.state.audio.transportError); const failure = await snapshot(p);
      assert.equal(failure.media.id, before.media.id); assert.equal(failure.media.time, before.media.time); assert.equal(failure.media.paused, true);
      assert.deepEqual(failure.graph, before.graph); assert.deepEqual(failure.source, before.source); assert.equal(failure.ready, true); assert.equal(failure.audio.isLoaded, true);
      assert.equal(failure.notifications.filter(e => e.type === 'track-change-failed').length, 0);
      await click(p, 'btnPlay'); await p.waitForFunction(() => __acceptance.state.audio.isPlaying && !__acceptance.state.audio.transportError);
      const retry = await snapshot(p); assert.equal(retry.media.id, before.media.id); assert.equal(retry.ready, true);
      return { mode, before: { media: before.media, graph: before.graph, source: before.source }, failure, retry: { media: retry.media, audio: retry.audio } };
    });
    for (const fault of ['corrupt','after-tap']) await run('native recorder survives ' + fault + ' cleanup and retains export', async p => {
      await ingest(p, [fixture('A.wav'), fault === 'corrupt' ? corrupt : fixture('failed.wav'), fixture('B.wav')]); await active(p, 'A.wav');
      await click(p, 'btnRecordStart'); await p.waitForFunction(() => __acceptance.state.recording.phase === 'recording' && __acceptance.state.recording.chunkCount > 0);
      const start = await snapshot(p); if (fault !== 'corrupt') await p.evaluate(() => __audit.arm('after-tap'));
      await row(p, 1); await failed(p); const terminal = await snapshot(p); cleanup(terminal, 'file-activation-failed', false);
      await p.waitForFunction(() => /error|failed|unreadable|unsupported/i.test(document.getElementById('audioStatus').textContent));
      const projected = await snapshot(p); cleanup(projected);
      assert.ok(terminal.nodes.filter(n => n.kind !== 'tap').every(n => n.disconnectAll === 1 && !n.destinations.length));
      assert.equal(terminal.recorder.id, start.recorder.id); assert.equal(terminal.recorder.state, 'recording'); assert.equal(terminal.graph.recorderTapDestination, start.graph.recorderTapDestination);
      assert.ok(terminal.capturedTracks.every(t => t.state === 'live')); assert.ok(!terminal.notifications.some(e => e.type === 'native-recorder-stop'));
      if (fault === 'after-tap') { assert.ok(terminal.failureBoundary.tapConnected); assert.equal(terminal.failureBoundary.tapConnected, terminal.failureBoundary.output); }
      await row(p, 2); await active(p, 'B.wav'); const recovered = await snapshot(p);
      assert.equal(recovered.graph.recorderTapDestination, start.graph.recorderTapDestination); assert.equal(recovered.graph.recorderTapConnectedOutputGain, recovered.graph.outputGain); assert.equal(recovered.ready, true);
      // Observe native B playback advancing before finalizing its capture.
      // A/B use distinct generated frequencies, enabling export verification.
      await p.waitForFunction(() => __acceptance.AudioEngine.getMediaEl().currentTime >= 0.3);
      const count = await p.evaluate(() => { __acceptance.RecorderEngine.__inspection().mediaRecorder.requestData(); return __acceptance.state.recording.chunkCount; });
      await p.waitForFunction(count => __acceptance.state.recording.chunkCount > count, count);
      await click(p, 'btnRecordStop'); await p.waitForFunction(() => __acceptance.state.recording.phase === 'complete'); const complete = await snapshot(p);
      const read = () => p.evaluate(async () => {
        const blob = await (await fetch(__acceptance.state.recording.lastExportUrl)).blob(), bytes = new Uint8Array(await blob.arrayBuffer());
        return { bytes: bytes.length, type: blob.type, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join(''), base64: btoa(Array.from(bytes, x => String.fromCharCode(x)).join('')) };
      });
      const exported = await read(); assert.ok(exported.bytes > 0);
      if (option('--export-dir')) fs.writeFileSync(path.join(option('--export-dir'), 'f6-' + fault + '.webm'), Buffer.from(exported.base64, 'base64')); delete exported.base64;
      assert.equal(complete.notifications.filter(e => e.type === 'native-recorder-stop').length, 1); assert.ok(complete.capturedTracks.every(t => t.state === 'ended'));
      if (fault !== 'corrupt') await p.evaluate(() => __audit.arm('after-tap')); await row(p, 1); await failed(p);
      const retained = await snapshot(p), readAgain = await read(); delete readAgain.base64;
      assert.equal(retained.recording.lastExportUrl, complete.recording.lastExportUrl); assert.deepEqual(readAgain, exported);
      return { fault, start, terminal, projectedUiError: projected.uiError, recovered: { media: recovered.media, graph: recovered.graph, ready: recovered.ready, recorder: recovered.recorder }, complete, retained: { recording: retained.recording, audio: retained.audio }, exported };
    });
  } finally {
    results.summary = { cases: results.cases.length, passed: results.cases.filter(c => c.passed).length, failed: results.cases.filter(c => !c.passed).length };
    if (option('--output')) fs.writeFileSync(option('--output'), JSON.stringify(results, null, 2) + '\n');
    console.log(JSON.stringify(results.summary)); await browser.close(); await new Promise(resolve => server.close(resolve));
    process.exitCode = results.summary.failed ? 1 : 0;
  }
}
main().catch(error => { console.error(error); process.exitCode = 2; });
