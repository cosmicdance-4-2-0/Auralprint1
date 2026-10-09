/* Opt-in F.3 correctness diagnostic; F.1/F.2 runners and evidence remain immutable. No production file is written or patched. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('playwright'); // Environment tool, not a project dependency.
const root = path.resolve(__dirname, '../../../../../..');
const args = process.argv.slice(2);
const f2Only = args.includes('--f2');
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
inspected = inject(inspected, '      AudioEngine._isLoadRequestCurrent = isCurrentFileRequest;',
  '      window.__phaseLoad = loadAndPlay; window.__phaseRequestId = () => activeLoadRequestId; window.__phaseRefreshQueue = refreshQueuePanel;\n      AudioEngine._isLoadRequestCurrent = isCurrentFileRequest;');
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
      if (f.constructorFailure) throw new DOMException('F.3 constructor unavailable', 'NotSupportedError');
      super(...args); f.ctx = this;
      if (f.behaviors.length) f.suspended = this.suspend();
    }
    async resume() {
      const mode = f.behaviors.shift() || 'native';
      f.resumes.push(mode);
      if (f.suspended) { await f.suspended; f.suspended = null; }
      if (mode === 'reject') throw new DOMException('F.3 resume refused', 'InvalidStateError');
      if (mode === 'skip') return; // Force the real attachSource resume boundary.
      if (mode === 'hold') return new Promise((resolve, reject) => f.held.push({
        release: () => Native.prototype.resume.call(this).then(resolve, reject),
        reject: () => reject(new DOMException('F.3 obsolete resume refused', 'InvalidStateError')),
      }));
      return Native.prototype.resume.call(this);
    }
  };
}
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox', '--disable-background-networking', '--autoplay-policy=no-user-gesture-required'] });
  const results = { acceptedBaseline: '0717e6c82ea5e4a9c08a2650e00730f4d698b3b5', phase: 'F.3', startingF2: '0c188a06673b94ce124579ecd638ff890b161d32', version,
    browser: await browser.version(), mode: 'headless Chromium; native Web Audio and HTMLMediaElement; muted browser output',
    node: process.version, artifactSha256: crypto.createHash('sha256').update(artifact).digest('hex'),
    fixtures: [440, 554, 659].map((frequency, i) => ({ name: `${String.fromCharCode(65 + i)}.wav`, frequency, bytes: wav(frequency).length, sha256: crypto.createHash('sha256').update(wav(frequency)).digest('hex') })),
    scenarios: [], desiredAssertions: [] };
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
      return { queue: a.Queue.snapshot(), entries: Array.from({ length: a.Queue.length }, (_, i) => a.Queue.entryAt(i)).map(x => ({ entryId: f.id(x), fileId: f.id(x.file), name: x.name })),
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
  const deferredF3 = name => /current resume failure|constructor failure|failed Play retains|latest C survives stale initial resume true|obsolete Play resume rejection/.test(name);
  const desired = (name, fn) => { check('desiredAssertions', name, fn); results.desiredAssertions.at(-1).phase = (name.startsWith('F.3 ') || deferredF3(name)) ? 'F.3' : 'F.2'; };
  async function save(p, name, before, extra = {}) {
    const after = await snap(p); results.scenarios.push({ name, before, after, pageErrors: p.errors, consoleErrors: p.consoleErrors, ...extra }); await p.close(); return after;
  }
  try {
    let p = await app([], { plain: true }); await ingest(p, ['ordinary.wav']);
    await p.waitForFunction(() => document.querySelector('#btnPlay').textContent === 'Pause');
    await p.waitForFunction(() => /0:0[1-9]/.test(document.querySelector('#scrubberTime').textContent));
    const plain = { name: 'ordinary unmodified artifact playback', status: await p.locator('#audioStatus').textContent(), time: await p.locator('#scrubberTime').textContent(), pageErrors: p.errors, consoleErrors: p.consoleErrors };
    results.scenarios.push(plain); desired('unmodified artifact plays valid WAV without exceptions', () => { assert.match(plain.status, /ordinary.wav/); assert.deepEqual(plain.pageErrors, []); }); await p.close();

    p = await app(['hold']); await ingest(p); await held(p);
    let before = await snap(p);
    await remove(p, 0); const removed = await snap(p); await release(p); await settled(p);
    let after = await save(p, 'pending A removed; B remains; initial load resume', before, { afterRemoval: removed });

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

    desired('pending replacement removal preserves requested autoplay despite old loaded metadata', () => { assert.equal(after.loads.at(-1).opts.autoPlay, true); assert.equal(after.audio.isPlaying, true); assert.equal(after.media.paused, false); });
    for (const sameObject of [false, true]) {
      p = await app(['hold']); await ingest(p, sameObject ? ['same.wav'] : ['same.wav','same.wav']); await held(p);
      if (sameObject) await p.evaluate(() => document.querySelector('#fileInput').dispatchEvent(new Event('change')));
      before = await snap(p); await remove(p, 0); const during = await snap(p); await release(p); await settled(p); after = await save(p, sameObject ? 'same File object enqueued twice (replayed file-input event)' : 'distinct Files with identical filenames', before, { afterRemoval: during });

      desired('duplicate-name/object removal creates successor request '+sameObject, () => { assert.ok(during.requestId > before.requestId); assert.equal(after.loads.at(-1).fileId, after.currentFileId); });
    }
    p = await app(['hold']); await ingest(p); await held(p); before = await snap(p);
    await p.evaluate(() => { __fault.held.shift().reject(); }); await settled(p);
    after = await save(p, 'initial load resume rejects', before);

    desired('current resume failure reaches observable terminal error without UI leak', () => { assert.equal(after.source.status, 'error'); assert.ok(after.source.errorCode); assert.ok(after.source.errorMessage); assert.equal(after.unhandledRejections.length, 0); assert.equal(after.audio.isLoaded, false); assert.equal(after.notifications.at(-1).type, 'track-change-failed'); });

    p = await app([], { constructorFailure: true }); await ingest(p); await settled(p);
    after = await save(p, 'AudioContext constructor throws NotSupportedError');

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

    // File attachment must honor the current-owner guard at the second resume.
    for (const reject of [false, true]) {
      p = await app(['skip','hold']); await ingest(p); await held(p); before = await snap(p); await select(p, 1); await loaded(p, 'B.wav'); const winner = await snap(p);
      await release(p, reject); await settled(p); after = await save(p, `stale File attach resume ${reject ? 'rejects' : 'resolves'} after B wins`, before, { winner });
      desired('stale File attach cannot mutate winner '+reject, () => { assert.equal(after.media?.id, winner.media.id); assert.equal(after.audio.isLoaded, true); assert.equal(after.audio.filename, 'B.wav'); assert.equal(after.audio.transportError, winner.audio.transportError); assert.equal(after.source.label, 'B.wav'); assert.equal(after.unhandledRejections.length, 0); });
    }

    // Expanded F.3 checks use actual DOM handlers, with deterministic native resume refusal.
    for (const pathName of ['drop', 'next', 'prev', 'row', 'shortcut-next', 'shortcut-prev', 'eof', 'repeat-one', 'remove-successor']) {
      p = await app(pathName === 'drop' ? ['reject'] : []);
      if (pathName === 'drop') {
        await p.evaluate(base64 => {
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'drop.wav', { type: 'audio/wav' }));
          __phase.state.canvas.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        }, wav().toString('base64'));
      } else {
        await ingest(p); await loaded(p, 'A.wav');
        if (pathName === 'prev' || pathName === 'shortcut-prev') { await select(p, 1); await loaded(p, 'B.wav'); }
        await p.evaluate(async () => { await __fault.ctx.suspend(); __fault.behaviors.push('reject'); });
        if (pathName === 'repeat-one') await p.evaluate(() => document.querySelector('#btnRepeat').click());
        await p.evaluate(pathName => {
          if (pathName === 'next' || pathName === 'prev') document.querySelector(pathName === 'next' ? '#btnNext' : '#btnPrev').click();
          else if (pathName === 'row') document.querySelectorAll('#queueList .queue-item')[1].click();
          else if (pathName === 'shortcut-next' || pathName === 'shortcut-prev') window.dispatchEvent(new KeyboardEvent('keydown', { code: pathName === 'shortcut-next' ? 'KeyN' : 'KeyP', bubbles: true }));
          else if (pathName === 'remove-successor') document.querySelectorAll('#queueList .q-remove')[0].click();
          else {
            __phase.state.recording.phase = 'idle';
            __phase.AudioEngine.getMediaEl().dispatchEvent(new Event('ended'));
          }
        }, pathName);
      }
      await p.waitForFunction(() => __phase.state.source.status === 'error'); await settled(p);
      const failed = await snap(p);
      desired('F.3 actual UI '+pathName+' failure settles exactly once', () => {
        assert.equal(failed.source.errorCode, 'file-activation-failed'); assert.ok(failed.source.errorMessage);
        assert.equal(failed.source.sessionActive, false); assert.equal(failed.audio.isLoaded, false); assert.equal(failed.audio.isPlaying, false);
        assert.equal(failed.media, null); assert.equal(failed.notifications.filter(x => x.type === 'track-change-failed').length, 1);
        assert.equal(failed.notifications.at(-1).details.requestId, failed.loads.at(-1).requestId);
        assert.equal(failed.unhandledRejections.length, 0); assert.deepEqual(p.errors, []);
      });
      const selected = failed.queue.items[failed.queue.cursor].name;
      await select(p, failed.queue.cursor); await loaded(p, selected); await settled(p);
      after = await save(p, 'F.3 actual UI '+pathName+' failure and selected File retry', failed);
      desired('F.3 actual UI '+pathName+' retry recovers', () => { assert.equal(after.source.status, 'active'); assert.equal(after.audio.transportError, ''); assert.equal(after.unhandledRejections.length, 0); });
    }

    for (const kind of ['mic', 'stream']) for (const operation of ['activation', 'play']) {
      p = await app(operation === 'activation' ? ['hold'] : []);
      await p.evaluate(() => {
        const make = async () => {
          const c = __fault.ctx; await AudioContext.prototype.resume.call(c);
          const destination = c.createMediaStreamDestination(), oscillator = c.createOscillator();
          oscillator.connect(destination); oscillator.start(); __fault.liveStreams.push(destination.stream); return destination.stream;
        };
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: make, getDisplayMedia: make } });
        __phase.InputSourceManager.init(); __phase.UI.refreshAllUiText();
      });
      await ingest(p);
      if (operation === 'play') {
        await loaded(p, 'A.wav'); await p.evaluate(() => document.querySelector('#btnPlay').click()); await settled(p);
        await p.evaluate(async () => { await __fault.ctx.suspend(); __fault.behaviors.push('hold'); });
        await p.evaluate(() => document.querySelector('#btnPlay').click());
      }
      await held(p);
      await p.evaluate(kind => document.querySelector(kind === 'mic' ? '#btnSourceMic' : '#btnSourceStream').click(), kind);
      await p.waitForFunction(kind => __phase.state.source.kind === kind && __phase.state.source.status === 'active', kind);
      before = await snap(p); await release(p, true); await settled(p); after = await save(p, 'F.3 obsolete '+operation+' rejection after '+kind, before);
      desired('F.3 obsolete '+operation+' rejection preserves '+kind, () => {
        assert.deepEqual(after.audio, before.audio); assert.deepEqual(after.source, before.source); assert.deepEqual(after.notifications, before.notifications);
        assert.equal(after.media, null); assert.equal(after.graph.ready, true); assert.equal(after.unhandledRejections.length, 0);
        assert.deepEqual(p.errors, []);
      });
    }

    p = await app(['hold']); await ingest(p); await held(p);
    await p.evaluate(() => document.querySelector('#btnClearQueue').click()); before = await snap(p);
    await release(p, true); await settled(p); after = await save(p, 'F.3 initial resume rejection after Clear', before);
    desired('F.3 Clear contains obsolete initial failure without notification', () => {
      assert.deepEqual(after.audio, before.audio); assert.deepEqual(after.source, before.source); assert.equal(after.queue.length, 0);
      assert.equal(after.unhandledRejections.length, 0); assert.equal(after.notifications.filter(x => x.type === 'track-change-failed').length, 0);
    });

    for (const action of ['current', 'replacement']) {
      p = await app(); await ingest(p); await loaded(p, 'A.wav');
      await p.evaluate(() => document.querySelector('#btnPlay').click()); await settled(p); before = await snap(p);
      await p.evaluate(() => {
        // Explicit API fault: expected native context failures are already settled by the engine.
        const original = __phase.AudioEngine.playPause;
        __phase.AudioEngine.playPause = () => new Promise((resolve, reject) => { __fault.unexpectedPlay = { resolve, reject }; });
        __fault.originalPlayPause = original;
        document.querySelector('#btnPlay').click();
      });
      await p.waitForFunction(() => !!__fault.unexpectedPlay);
      if (action === 'replacement') { await select(p, 1); await loaded(p, 'B.wav'); before = await snap(p); }
      await p.evaluate(() => __fault.unexpectedPlay.reject(new Error('injected UI Play boundary rejection')));
      if (action === 'current') await p.waitForFunction(() => __phase.state.audio.transportError.includes('UI Play boundary rejection'));
      await settled(p); after = await save(p, 'F.3 UI Play API rejection '+action, before);
      desired('F.3 UI Play API boundary '+action+' is contained truthfully', () => {
        assert.equal(after.unhandledRejections.length, 0); assert.deepEqual(p.errors, []);
        assert.equal(after.media.id, before.media.id); assert.equal(after.audio.isLoaded, true);
        assert.equal(after.notifications.filter(x => x.type === 'track-change-failed').length, 0);
        if (action === 'current') { assert.ok(after.audio.transportError.includes('UI Play boundary rejection')); assert.equal(after.audio.isPlaying, false); }
        else { assert.deepEqual(after.audio, before.audio); assert.deepEqual(after.source, before.source); }
      });
    }

    p = await app(); await ingest(p); await loaded(p, 'A.wav');
    await p.evaluate(() => document.querySelector('#btnPlay').click()); await settled(p);
    await p.evaluate(async () => { await __fault.ctx.close(); });
    before = await snap(p); await p.evaluate(() => document.querySelector('#btnPlay').click()); await settled(p);
    const closedPlay = await snap(p); await select(p, 1); await p.waitForFunction(() => __phase.state.source.status === 'error'); await settled(p);
    after = await save(p, 'F.3 closed context (external in-memory native close only)', before, { closedPlay });
    desired('F.3 closed context reports unavailable playback without silent recreation', () => {
      assert.equal(closedPlay.media.id, before.media.id); assert.equal(closedPlay.audio.isLoaded, true);
      assert.ok(closedPlay.audio.transportError.includes('closed')); assert.equal(closedPlay.audio.isPlaying, false);
      assert.equal(after.source.status, 'error'); assert.equal(after.audio.isLoaded, false); assert.equal(after.media, null);
      assert.ok(after.audio.transportError.includes('closed')); assert.equal(after.unhandledRejections.length, 0);
    });
  } catch (error) {
    results.infrastructureFailure = { message: error.message, stack: error.stack };
    if (active && !active.isClosed()) { try { results.infrastructureSnapshot = await snap(active); } catch {} }
  } finally { await browser.close(); }
  results.summary = { scenarios: results.scenarios.length,
    desiredFailures: results.desiredAssertions.filter(x => !x.passed).length,
    f2Failures: results.desiredAssertions.filter(x => x.phase === 'F.2' && !x.passed).length,
    f3Failures: results.desiredAssertions.filter(x => x.phase === 'F.3' && !x.passed).length, infrastructureFailure: !!results.infrastructureFailure };
  if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results.summary, null, 2));
  for (const x of results.desiredAssertions.filter(x => !x.passed)) console.log(`DESIRED CONTRACT FAILED: ${x.name}\n${x.assertion}`);
  if (results.infrastructureFailure) console.error(results.infrastructureFailure);
  process.exitCode = results.summary.infrastructureFailure || (f2Only ? results.summary.f2Failures : results.summary.desiredFailures) ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
