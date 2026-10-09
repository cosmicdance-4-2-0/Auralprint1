/* Opt-in F.1 diagnostic. No production file is written or patched. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright'); // Environment tool, not a project dependency.
const root = path.resolve(__dirname, '../../../../..');
const args = process.argv.slice(2);
const contractMode = args.includes('--contracts');
const outputArg = args.indexOf('--output');
const output = outputArg >= 0 ? args[outputArg + 1] : null;
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const artifact = fs.readFileSync(path.join(root, `dist/auralprint_${version.slice(1)}.html`), 'utf8');
function inject(text, marker, replacement) {
  assert.equal(text.split(marker).length, 2, `unique instrumentation marker: ${marker}`);
  return text.replace(marker, replacement);
}
let inspected = inject(artifact, '  main();\n})();',
  '  window.__phase = {state, Queue, UI, AudioEngine, InputSourceManager, RecorderEngine};\n  main();\n})();');
inspected = inject(inspected, '      AudioEngine._isLoadRequestCurrent = (requestId) => requestId === activeLoadRequestId;',
  '      window.__phaseLoad = loadAndPlay; window.__phaseRequestId = () => activeLoadRequestId; window.__phaseRefreshQueue = refreshQueuePanel;\n      AudioEngine._isLoadRequestCurrent = (requestId) => requestId === activeLoadRequestId;');
inspected = inject(inspected, '      get currentIndex() {\n        return _cursor;',
  '      _diagnosticEntries() { return _items.slice(); },\n      get currentIndex() {\n        return _cursor;');
// Generated PCM stereo WAVs: different names, bytes and channel frequencies.
function wav(frequency = 440) {
  const rate = 44100, seconds = 30, count = rate * seconds;
  const b = Buffer.alloc(44 + count * 4);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(count * 4, 40);
  for (let i = 0; i < count; i++) {
    b.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * frequency * i / rate)), 44 + i * 4);
    b.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * frequency * 2 * i / rate)), 46 + i * 4);
  }
  return b;
}
function installFaults({ behaviors, constructorFailure }) {
  const Native = window.AudioContext;
  const f = window.__fault = { behaviors: [...behaviors], constructorFailure, resumes: [], held: [], urls: [], notifications: [], loads: [], activations: [], plays: [], mediaPlayHolds: [], settlements: [], errors: [], liveStreams: [] };
  window.addEventListener('unhandledrejection', e => f.errors.push({ type: 'unhandledrejection', name: e.reason?.name, message: e.reason?.message || String(e.reason) }));
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = create(blob); f.urls.push({ action: 'create', url, name: blob.name || '', bytes: blob.size }); return url; };
  URL.revokeObjectURL = url => { f.urls.push({ action: 'revoke', url }); return revoke(url); };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function(...args) {
    const promise = play.apply(this, args);
    if (!f.holdNextMediaPlay) return promise;
    f.holdNextMediaPlay = false;
    return promise.then(() => new Promise(resolve => f.mediaPlayHolds.push({ resolve })));
  };
  window.AudioContext = class extends Native {
    constructor(...args) {
      if (f.constructorFailure) throw new DOMException('F.1 constructor unavailable', 'NotSupportedError');
      super(...args); f.ctx = this;
      if (f.behaviors.length) f.suspended = this.suspend();
    }
    async resume() {
      const mode = f.behaviors.shift() || 'native';
      f.resumes.push(mode);
      if (f.suspended) { await f.suspended; f.suspended = null; }
      if (mode === 'reject') throw new DOMException('F.1 resume refused', 'InvalidStateError');
      if (mode === 'skip') return; // Force the real attachSource resume boundary.
      if (mode === 'hold') return new Promise((resolve, reject) => f.held.push({
        release: () => Native.prototype.resume.call(this).then(resolve, reject),
        reject: () => reject(new DOMException('F.1 obsolete resume refused', 'InvalidStateError')),
      }));
      return Native.prototype.resume.call(this);
    }
  };
}
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-background-networking', '--autoplay-policy=no-user-gesture-required'] });
  const results = { baseline: '0717e6c82ea5e4a9c08a2650e00730f4d698b3b5', version,
    browser: await browser.version(), mode: 'headless Chromium; native Web Audio and HTMLMediaElement; muted browser output',
    node: process.version, artifactSha256: crypto.createHash('sha256').update(artifact).digest('hex'),
    fixtures: [440, 554, 659].map((frequency, i) => ({ name: `${String.fromCharCode(65 + i)}.wav`, frequency, bytes: wav(frequency).length, sha256: crypto.createHash('sha256').update(wav(frequency)).digest('hex') })),
    scenarios: [], desiredAssertions: [], baselineAssertions: [] };
  let active;
  async function app(behaviors = [], options = {}) {
    const p = await browser.newPage(); active = p; p.setDefaultTimeout(10000);
    p.errors = []; p.consoleErrors = [];
    p.on('pageerror', e => p.errors.push({ name: e.name, message: e.message }));
    p.on('console', m => { if (m.type() === 'error') p.consoleErrors.push(m.text()); });
    await p.route('**/*', r => r.request().url() === 'http://localhost/'
      ? r.fulfill({ contentType: 'text/html', body: options.plain ? artifact : inspected }) : r.abort());
    if (!options.plain) await p.addInitScript(installFaults, { behaviors, constructorFailure: !!options.constructorFailure });
    await p.goto('http://localhost/');
    if (!options.plain) await p.evaluate(() => {
      const a = __phase, f = __fault;
      f.ids = new WeakMap(); f.nextId = 1;
      f.id = object => { if (!object) return null; if (!f.ids.has(object)) f.ids.set(object, f.nextId++); return f.ids.get(object); };
      const notify = a.RecorderEngine.onTransportMutation;
      a.RecorderEngine.onTransportMutation = function(type, details) { f.notifications.push({ type, details }); return notify.call(this, type, details); };
      const load = a.AudioEngine.loadFile;
      a.AudioEngine.loadFile = function(file, requestId, opts) {
        const call = { fileId: f.id(file), name: file.name, requestId, opts, outcome: 'pending' }; f.loads.push(call);
        const promise = load.call(this, file, requestId, opts);
        promise.then(value => { call.outcome = 'fulfilled'; call.value = value; }, error => { call.outcome = 'rejected'; call.error = { name: error.name, message: error.message }; });
        return promise;
      };
      for (const [owner, method, records] of [[a.InputSourceManager, 'activateFile', f.activations], [a.AudioEngine, 'playPause', f.plays]]) {
        const original = owner[method];
        owner[method] = function(...args) {
          const call = { outcome: 'pending', requestId: args[1]?.requestId ?? null }; records.push(call);
          const promise = original.apply(this, args);
          promise.then(value => { call.outcome = 'fulfilled'; call.value = value; }, error => { call.outcome = 'rejected'; call.error = { name: error.name, message: error.message }; });
          return promise;
        };
      }
    });
    return p;
  }
  async function ingest(p, names = ['A.wav', 'B.wav']) {
    await p.locator('#fileInput').setInputFiles(names.map((name, i) => ({ name, mimeType: 'audio/wav', buffer: wav([440,554,659][i % 3]) })));
  }
  const held = p => p.waitForFunction(() => __fault.held.length > 0);
  async function release(p, reject = false) { await p.evaluate(reject => { const h = __fault.held.shift(); if (!h) throw Error('No pending resume'); return reject ? h.reject() : h.release(); }, reject); }
  async function settled(p) { await p.waitForFunction(() => [...__fault.loads, ...__fault.activations, ...__fault.plays].every(x => x.outcome !== 'pending')); await p.evaluate(() => new Promise(resolve => setTimeout(resolve, 0))); }
  async function loaded(p, name) { await p.waitForFunction(name => __phase.state.audio.filename === name && __phase.state.source.status === 'active', name); }
  async function remove(p, index) { await p.evaluate(index => document.querySelectorAll('#queueList .q-remove')[index].click(), index); }
  async function select(p, index) { await p.evaluate(index => document.querySelectorAll('#queueList .queue-item')[index].click(), index); }
  async function snap(p) {
    return p.evaluate(() => {
      const a = __phase, f = __fault, el = a.AudioEngine.getMediaEl();
      return { queue: a.Queue.snapshot(), entries: a.Queue._diagnosticEntries().map(x => ({ entryId: f.id(x), fileId: f.id(x.file), name: x.name })),
        currentFileId: f.id(a.Queue.current()), requestId: __phaseRequestId(), source: structuredClone(a.state.source), audio: { ...a.state.audio },
        media: el ? { id: f.id(el), src: el.src, currentSrc: el.currentSrc, paused: el.paused, currentTime: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : null, readyState: el.readyState, error: el.error?.code || null } : null,
        graph: { ready: a.AudioEngine.sample().ready }, urls: [...f.urls], loads: structuredClone(f.loads), activations: structuredClone(f.activations), plays: structuredClone(f.plays), notifications: structuredClone(f.notifications),
        resumes: [...f.resumes], held: f.held.length, unhandledRejections: [...f.errors], recording: structuredClone(a.state.recording),
        ui: { status: document.querySelector('#audioStatus').textContent, play: document.querySelector('#btnPlay').textContent, scrubber: document.querySelector('#scrubberTime').textContent } };
    });
  }
  function check(kind, name, fn) {
    try { fn(); results[kind].push({ name, passed: true }); }
    catch (e) { results[kind].push({ name, passed: false, assertion: e.toString(), actual: e.actual, expected: e.expected, stack: e.stack }); }
  }
  const desired = (name, fn) => check('desiredAssertions', name, fn);
  const baseline = (name, fn) => { if (!contractMode) check('baselineAssertions', name, fn); };
  async function save(p, name, before, extra = {}) {
    const after = await snap(p); results.scenarios.push({ name, before, after, pageErrors: p.errors, consoleErrors: p.consoleErrors, ...extra }); await p.close(); return after;
  }
  try {
    let p = await app([], { plain: true }); await ingest(p, ['ordinary.wav']);
    await p.waitForFunction(() => document.querySelector('#btnPlay').textContent === 'Pause');
    await p.waitForFunction(() => /0:0[1-9]/.test(document.querySelector('#scrubberTime').textContent));
    const plain = { name: 'ordinary unmodified artifact playback', status: await p.locator('#audioStatus').textContent(), time: await p.locator('#scrubberTime').textContent(), pageErrors: p.errors, consoleErrors: p.consoleErrors };
    results.scenarios.push(plain); baseline('unmodified artifact plays valid WAV without exceptions', () => { assert.match(plain.status, /ordinary.wav/); assert.deepEqual(plain.pageErrors, []); }); await p.close();

    p = await app(['hold']); await ingest(p); await held(p);
    let before = await snap(p); baseline('A genuinely pending before media allocation', () => { assert.equal(before.audio.isLoaded, false); assert.equal(before.media, null); assert.equal(before.source.status, 'requesting'); });
    await remove(p, 0); const removed = await snap(p); await release(p); await settled(p);
    let after = await save(p, 'pending A removed; B remains; initial load resume', before, { afterRemoval: removed });
    baseline('AUD-001 reproduces A playing while Queue selects B', () => { assert.equal(after.queue.items[0].name, 'B.wav'); assert.equal(after.audio.filename, 'A.wav'); assert.equal(after.audio.isPlaying, true); assert.equal(after.currentFileId, after.entries[0].fileId); assert.equal(after.loads[0].fileId, before.currentFileId); assert.equal(removed.requestId, before.requestId); });
    desired('pending removal loads B and preserves autoplay', () => { assert.equal(after.audio.filename, 'B.wav'); assert.equal(after.source.label, 'B.wav'); assert.equal(after.media.paused, false); assert.equal(after.notifications.at(-1).details.filename, 'B.wav'); });

    p = await app(['hold']); await ingest(p); await held(p); await remove(p, 1); await release(p); await loaded(p, 'A.wav');
    after = await save(p, 'noncurrent B removed while A pending'); desired('noncurrent removal leaves A authorized', () => { assert.equal(after.audio.filename, 'A.wav'); assert.equal(after.queue.items[0].name, 'A.wav'); assert.equal(after.audio.isPlaying, true); });
    for (const action of ['final-remove', 'clear']) {
      p = await app(['hold']); await ingest(p, action === 'final-remove' ? ['A.wav'] : ['A.wav','B.wav']); await held(p); before = await snap(p);
      if (action === 'clear') await p.evaluate(() => document.querySelector('#btnClearQueue').click()); else await remove(p, 0);
      await release(p); await settled(p); after = await save(p, `pending ${action}`, before);
      desired(`${action} cannot restore A`, () => { assert.equal(after.queue.length, 0); assert.equal(after.source.kind, 'none'); assert.equal(after.source.status, 'idle'); assert.equal(after.media, null); assert.equal(after.audio.isLoaded, false); assert.equal(after.urls.length, 0); assert.equal(after.notifications.filter(x => x.type === 'track-change-complete').length, 0); });
    }
    for (const playing of [true, false]) {
      p = await app(); await ingest(p); await loaded(p, 'A.wav');
      if (!playing) { await p.evaluate(() => document.querySelector('#btnPlay').click()); await p.waitForFunction(() => !__phase.state.audio.isPlaying); }
      before = await snap(p); await remove(p, 0); await loaded(p, 'B.wav'); after = await save(p, `loaded ${playing ? 'playing' : 'paused'} A removed`, before);
      desired(`loaded removal preserves ${playing ? 'playing' : 'paused'} intent`, () => { assert.equal(after.audio.filename, 'B.wav'); assert.equal(after.audio.isPlaying, playing); assert.equal(after.media.paused, !playing); });
    }
    p = await app(); await ingest(p, ['A.wav','B.wav','C.wav']); await loaded(p, 'A.wav');
    await p.evaluate(async () => { await __fault.ctx.suspend(); __fault.behaviors.push('hold'); });
    await select(p, 1); await held(p); before = await snap(p); await remove(p, 1); await loaded(p, 'C.wav');
    const successorBeforeRelease = await snap(p); await release(p); await settled(p);
    after = await save(p, 'pending autoplay B removed after loaded A teardown; C successor', before, { successorBeforeRelease });
    baseline('pending replacement exposes autoplay versus actual-state distinction', () => { assert.equal(before.source.status, 'requesting'); assert.equal(before.source.label, 'B.wav'); assert.equal(before.audio.isLoaded, true); assert.equal(before.audio.isPlaying, false); assert.equal(before.media, null); assert.equal(before.loads.at(-1).opts.autoPlay, true); assert.equal(after.audio.filename, 'C.wav'); assert.equal(after.loads.at(-1).opts.autoPlay, false); });
    desired('pending replacement removal preserves requested autoplay despite old loaded metadata', () => { assert.equal(after.loads.at(-1).opts.autoPlay, true); assert.equal(after.audio.isPlaying, true); assert.equal(after.media.paused, false); });
    for (const sameObject of [false, true]) {
      p = await app(['hold']); await ingest(p, sameObject ? ['same.wav'] : ['same.wav','same.wav']); await held(p);
      if (sameObject) await p.evaluate(() => document.querySelector('#fileInput').dispatchEvent(new Event('change')));
      before = await snap(p); await remove(p, 0); const during = await snap(p); await release(p); await settled(p); after = await save(p, sameObject ? 'same File object enqueued twice (replayed file-input event)' : 'distinct Files with identical filenames', before, { afterRemoval: during });
      baseline('duplicate entries are distinct objects '+sameObject, () => { assert.notEqual(before.entries[0].entryId, before.entries[1].entryId); if (sameObject) assert.equal(before.entries[0].fileId, before.entries[1].fileId); else assert.notEqual(before.entries[0].fileId, before.entries[1].fileId); });
      desired('duplicate-name/object removal creates successor request '+sameObject, () => { assert.ok(during.requestId > before.requestId); assert.equal(after.loads.at(-1).fileId, after.currentFileId); });
    }
    p = await app(['hold']); await ingest(p); await held(p); before = await snap(p);
    await p.evaluate(() => { __fault.held.shift().reject(); }); await settled(p);
    after = await save(p, 'initial load resume rejects', before);
    baseline('AUD-002 initial rejection remains requesting without error projection', () => { assert.equal(after.source.status, 'requesting'); assert.equal(after.source.errorCode, ''); assert.equal(after.audio.transportError, ''); assert.ok(after.unhandledRejections.length); assert.equal(after.media, null); assert.equal(after.urls.length, 0); });
    desired('current resume failure reaches observable terminal error without UI leak', () => { assert.equal(after.source.status, 'error'); assert.ok(after.source.errorCode); assert.ok(after.source.errorMessage); assert.equal(after.unhandledRejections.length, 0); assert.equal(after.audio.isLoaded, false); assert.equal(after.notifications.at(-1).type, 'track-change-failed'); });

    p = await app([], { constructorFailure: true }); await ingest(p); await settled(p);
    after = await save(p, 'AudioContext constructor throws NotSupportedError');
    baseline('constructor rejection escapes without settlement', () => { assert.equal(after.loads[0].outcome, 'rejected'); assert.equal(after.source.status, 'requesting'); assert.equal(after.media, null); assert.equal(after.urls.length, 0); assert.ok(after.unhandledRejections.length); });
    desired('constructor failure settles current source', () => { assert.equal(after.source.status, 'error'); assert.ok(after.source.errorCode); assert.equal(after.unhandledRejections.length, 0); });

    p = await app(); await ingest(p); await loaded(p, 'A.wav'); await p.evaluate(() => document.querySelector('#btnPlay').click()); await p.waitForFunction(() => !__phase.state.audio.isPlaying);
    await p.evaluate(async () => { await __fault.ctx.suspend(); __fault.behaviors.push('hold'); }); await p.evaluate(() => document.querySelector('#btnPlay').click()); await held(p); before = await snap(p); await release(p, true); await settled(p);
    after = await snap(p); results.scenarios.push({ name: 'resume rejects during Play', before, after, pageErrors: [...p.errors], consoleErrors: [...p.consoleErrors] });
    desired('failed Play retains media and projects recoverable error', () => { assert.equal(after.media.id, before.media.id); assert.equal(after.audio.isLoaded, true); assert.equal(after.audio.isPlaying, false); assert.ok(after.audio.transportError); assert.equal(after.unhandledRejections.length, 0); });
    await p.evaluate(() => document.querySelector('#btnPlay').click()); await p.waitForFunction(() => __phase.state.audio.isPlaying); after = await save(p, 'Play retry after rejection'); desired('Play retry succeeds without reload', () => { assert.equal(after.audio.isPlaying, true); assert.equal(after.audio.transportError, ''); });

    for (const construction of [true, false]) {
      p = await app(construction ? [] : ['reject'], { constructorFailure: construction }); await ingest(p); await settled(p); before = await snap(p);
      await p.evaluate(() => { __fault.constructorFailure = false; }); await select(p, 0); await loaded(p, 'A.wav'); after = await save(p, `valid retry after ${construction ? 'constructor' : 'resume'} failure`, before);
      desired('valid file retry recovers '+construction, () => { assert.equal(after.audio.filename, 'A.wav'); assert.equal(after.source.status, 'active'); assert.equal(after.source.errorCode, ''); assert.equal(after.audio.isPlaying, true); });
    }
    for (const reject of [false, true]) {
      p = await app(['hold']); await ingest(p, ['A.wav','B.wav','C.wav']); await held(p); await select(p, 1); await loaded(p, 'B.wav'); await select(p, 2); await loaded(p, 'C.wav'); before = await snap(p);
      await release(p, reject); await settled(p);
      after = await save(p, `A superseded by B then C; old resume ${reject ? 'rejects' : 'resolves'}`, before);
      desired('latest C survives stale initial resume '+reject, () => { assert.equal(after.audio.filename, 'C.wav'); assert.equal(after.media.id, before.media.id); assert.equal(after.source.label, 'C.wav'); assert.deepEqual(after.notifications, before.notifications); assert.equal(after.unhandledRejections.length, 0); });
    }
    p = await app(['hold','hold']); await ingest(p); await held(p); await select(p, 1); await p.waitForFunction(() => __fault.held.length === 2); before = await snap(p); await remove(p, 0); await release(p); await p.evaluate(() => __fault.held.shift().release()); await loaded(p, 'B.wav');
    after = await save(p, 'A removed after B selection already began', before); desired('removing stale A preserves pending B', () => { assert.equal(after.audio.filename, 'B.wav'); assert.equal(after.queue.items[0].name, 'B.wav'); assert.equal(after.loads[0].value, false); });

    for (const kind of ['mic', 'stream']) {
      p = await app(['hold']);
      await p.evaluate(() => {
        // No device or permission access: returned stream comes from native oscillator graph.
        const make = async () => { const c = __fault.ctx; await AudioContext.prototype.resume.call(c); const destination = c.createMediaStreamDestination(); const oscillator = c.createOscillator(); oscillator.connect(destination); oscillator.start(); __fault.liveStreams.push(destination.stream); return destination.stream; };
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: make, getDisplayMedia: make } });
        __phase.InputSourceManager.init(); __phase.UI.refreshAllUiText();
      });
      await ingest(p); await held(p); await p.evaluate(kind => document.querySelector(kind === 'mic' ? '#btnSourceMic' : '#btnSourceStream').click(), kind);
      await p.waitForFunction(kind => __phase.state.source.kind === kind && __phase.state.source.status === 'active', kind); before = await snap(p); await release(p); await settled(p); after = await save(p, `pending File replaced by ${kind}; synthetic native stream`, before);
      desired('File cannot reclaim '+kind, () => { assert.equal(after.source.kind, kind); assert.equal(after.media, null); assert.equal(after.audio.isLoaded, false); assert.equal(after.graph.ready, true); assert.deepEqual(after.notifications, before.notifications); });
    }
    // Paused pending intent is not exposed by normal File ingestion/row selection.
    p = await app(['hold']); await ingest(p); await held(p); await p.evaluate(() => document.querySelector('#btnClearQueue').click()); await release(p); await settled(p);
    await p.evaluate(async () => { await __fault.ctx.suspend(); __fault.behaviors.push('hold');
      const files = document.querySelector('#fileInput').files; for (const file of files) __phase.Queue.add(file); __phase.Queue.setCursor(0);
      __phaseLoad(files[0], { autoPlay: false }).then(value => __fault.settlements.push(value), e => __fault.settlements.push(e.message)); __phaseRefreshQueue(); });
    await held(p); before = await snap(p); await remove(p, 0); await release(p); await settled(p); after = await save(p, 'pending paused load removed (in-memory loadAndPlay hook)', before);
    desired('pending paused removal loads paused B', () => { assert.equal(after.audio.filename, 'B.wav'); assert.equal(after.audio.isPlaying, false); assert.equal(after.media.paused, true); assert.equal(after.loads.at(-1).opts.autoPlay, false); });

    p = await app(); await p.evaluate(() => { __fault.holdNextMediaPlay = true; }); await ingest(p);
    await p.waitForFunction(() => __fault.mediaPlayHolds.length > 0); before = await snap(p);
    await remove(p, 0); const removedDuringPlay = await snap(p); await p.evaluate(() => __fault.mediaPlayHolds.shift().resolve()); await settled(p);
    after = await save(p, 'pending A removed during load-time native play completion', before, { afterRemoval: removedDuringPlay });
    baseline('load-time play is real but activation has not committed', () => { assert.equal(before.audio.isLoaded, false); assert.equal(before.source.status, 'requesting'); assert.equal(before.media.paused, false); });
    desired('pending removal at media play boundary selects playing B', () => { assert.equal(after.audio.filename, 'B.wav'); assert.equal(after.source.label, 'B.wav'); assert.equal(after.audio.isPlaying, true); });

    p = await app(['skip','hold']); await ingest(p); await held(p); before = await snap(p); await release(p, true); await settled(p);
    after = await save(p, 'current File attachSource resume rejects', before);
    desired('current attach rejection settles through existing guarded path', () => { assert.equal(after.source.status, 'error'); assert.equal(after.source.errorCode, 'file-activation-failed'); assert.ok(after.audio.transportError); assert.equal(after.audio.isLoaded, false); assert.equal(after.unhandledRejections.length, 0); assert.equal(after.activations[0].outcome, 'fulfilled'); assert.equal(after.activations[0].value.ok, false); });

    for (const action of ['clear', 'replace']) {
      p = await app(); await ingest(p); await loaded(p, 'A.wav'); await p.evaluate(() => document.querySelector('#btnPlay').click()); await settled(p);
      await p.evaluate(async () => { await __fault.ctx.suspend(); __fault.behaviors.push('hold'); }); await p.evaluate(() => document.querySelector('#btnPlay').click()); await held(p);
      if (action === 'clear') await p.evaluate(() => document.querySelector('#btnClearQueue').click()); else { await select(p, 1); await loaded(p, 'B.wav'); }
      before = await snap(p); await release(p, true); await settled(p); after = await save(p, `old Play resume rejects after ${action}`, before);
      desired('obsolete Play resume rejection stays silent after '+action, () => { assert.equal(after.media?.id, before.media?.id); assert.deepEqual(after.audio, before.audio); assert.deepEqual(after.source, before.source); assert.equal(after.unhandledRejections.length, 0); });
    }

    // File attachSource performs a second resume but receives no current-owner guard.
    for (const reject of [false, true]) {
      p = await app(['skip','hold']); await ingest(p); await held(p); before = await snap(p); await select(p, 1); await loaded(p, 'B.wav'); const winner = await snap(p);
      await release(p, reject); await settled(p); after = await save(p, `stale File attach resume ${reject ? 'rejects' : 'resolves'} after B wins`, before, { winner });
      desired('stale File attach cannot mutate winner '+reject, () => { assert.equal(after.media?.id, winner.media.id); assert.equal(after.audio.isLoaded, true); assert.equal(after.audio.filename, 'B.wav'); assert.equal(after.audio.transportError, winner.audio.transportError); assert.equal(after.source.label, 'B.wav'); assert.equal(after.unhandledRejections.length, 0); });
    }
  } catch (error) {
    results.infrastructureFailure = { message: error.message, stack: error.stack };
    if (active && !active.isClosed()) { try { results.infrastructureSnapshot = await snap(active); } catch {} }
  } finally { await browser.close(); }
  results.summary = { scenarios: results.scenarios.length, baselineFailures: results.baselineAssertions.filter(x => !x.passed).length,
    desiredFailures: results.desiredAssertions.filter(x => !x.passed).length, infrastructureFailure: !!results.infrastructureFailure };
  if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results.summary, null, 2));
  for (const x of results.desiredAssertions.filter(x => !x.passed)) console.log(`DESIRED CONTRACT FAILED: ${x.name}\n${x.assertion}`);
  if (results.infrastructureFailure) console.error(results.infrastructureFailure);
  process.exitCode = results.summary.infrastructureFailure || results.summary.baselineFailures || (contractMode && results.summary.desiredFailures) ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
