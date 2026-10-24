// Optional native Chromium regression; Playwright remains an environment tool.
// Run after npm run build. AP_REPORT optionally saves the detailed result.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();

function wav() {
  const rate = 44100, frames = rate * 8, bytes = frames * 4, b = Buffer.alloc(44 + bytes);
  b.write('RIFF'); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < frames; i++) {
    b.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 4);
    b.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 880 * i / rate)), 46 + i * 4);
  }
  return b;
}

// Observe native capture ownership without introducing a render/capture path.
async function observeCapture(page) {
  await page.addInitScript(() => {
    const capture = HTMLCanvasElement.prototype.captureStream;
    const create = URL.createObjectURL;
    window.capture116b = { canvases: [], blobs: [] };
    HTMLCanvasElement.prototype.captureStream = function (...args) {
      window.capture116b.canvases.push(this);
      return capture.apply(this, args);
    };
    URL.createObjectURL = function (object) {
      const url = create.call(this, object);
      if (object instanceof Blob && object.type.startsWith('video/')) window.capture116b.blobs.push({ object, url });
      return url;
    };
  });
}

async function decodeCapture(page) {
  return page.evaluate(async () => {
    const observed = window.capture116b, canvas = document.querySelector('#c');
    if (!observed.canvases.length || observed.canvases.some(c => c !== canvas)) throw Error('capture left canonical viewport');
    const captured = observed.blobs.at(-1);
    if (!captured?.object.size) throw Error('RecorderEngine did not retain a video export');
    const video = document.createElement('video');
    let timer;
    try {
      const metadata = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(Error('capture metadata timed out')), 5000);
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(Error(`capture decode ${video.error?.code}: ${video.error?.message}`));
      });
      video.src = captured.url; await metadata;
      return { bytes: captured.object.size, mime: captured.object.type,
        videoWidth: video.videoWidth, videoHeight: video.videoHeight,
        canvasWidth: canvas.width, canvasHeight: canvas.height, canonicalTap: true };
    } finally { clearTimeout(timer); video.removeAttribute('src'); video.load(); }
  });
}

async function sourceChecks(page, base, dpr) {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto(base + '/source');
  const initial = await page.evaluate(async () => {
    const { onAnimationFrame } = await import('/src/js/main.js');
    const { state, setCamera, resetCamera } = await import('/src/js/core/state.js');
    const { runtime, preferences, resolveSettings } = await import('/src/js/core/preferences.js');
    const { Spaces, resizeCanvasToDisplaySize } = await import('/src/js/core/spaces.js');
    const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
    const { Renderer } = await import('/src/js/render/renderer.js');
    const { RecorderEngine } = await import('/src/js/recording/recorder-engine.js');
    const { initOrbs } = await import('/src/js/render/orb-runtime.js');
    const { UrlPreset } = await import('/src/js/presets/url-preset.js');
    const { CONFIG } = await import('/src/js/core/config.js');
    let now = 100000; performance.now = () => now;
    AudioEngine.sample = () => ({ ready: true, monoLike: false, bands: Object.fromEntries(['L', 'R', 'C'].map(c =>
      [c, { energy01: .4, rms: .4, timeDomain: Float32Array.of(.5) }])) });
    preferences.world = { widthUnits: 2400, heightUnits: 1600 };
    preferences.bands.overlay.enabled = true;
    preferences.bands.overlay.connectAdjacent = true;
    preferences.bands.overlay.ringSpeedRadPerSec = .6;
    resolveSettings(); initOrbs(); onAnimationFrame(now); now += 100; onAnimationFrame(now);
    state.orbs[0].trail.emitAt(5000, -6000, now / 1000, { r: 1, g: 1, b: 1 });
    const calls = { arcs: [], strokes: [], coordinates: [] };
    for (const name of ['arc', 'stroke', 'moveTo', 'lineTo']) {
      const native = state.ctx[name].bind(state.ctx);
      state.ctx[name] = (...args) => {
        if (!args.every(Number.isFinite)) throw Error('nonfinite Canvas argument');
        if (name === 'arc') calls.arcs.push(args.slice(0, 3));
        if (name === 'stroke') calls.strokes.push(state.ctx.lineWidth);
        if (name === 'moveTo' || name === 'lineTo') calls.coordinates.push(args.slice(0, 2));
        return native(...args);
      };
    }
    const snapshot = () => ({ world: { ...state.world }, ringPhase: state.bands.ringPhaseRad,
      orbs: state.orbs.map(o => ({ id: o.id, x: o.xSim, y: o.ySim, angle: o.angleRad,
        radius: o.baseRadiusUnits, displacement: o.radialDispUnits, fraction: o.trail.emitAccumulator,
        particles: [...o.trail.particles].map(p => ({ ...p })) })) });
    const close = (a, b) => { if (Math.abs(a - b) > 1e-8 * Math.max(1, Math.abs(a), Math.abs(b))) throw Error(`projection mismatch ${a} != ${b}`); };
    window.test116b = { state, runtime, preferences, resolveSettings, Spaces, Renderer, RecorderEngine, UrlPreset,
      CONFIG, resizeCanvasToDisplaySize, setCamera, resetCamera, snapshot, close, calls,
      step() { calls.arcs.length = calls.strokes.length = calls.coordinates.length = 0; onAnimationFrame(now); },
      world: state.world, orbs: [...state.orbs], history: state.orbs.map(o => [...o.trail.particles]) };
    resetCamera(); test116b.step();
    for (const [x, y] of [[0, 0], [125, -200], [5000, -6000]]) {
      const p = Spaces.simToScreen(x, y), scale = Math.min(state.widthPx, state.heightPx) / 1600;
      close(p.x, state.widthPx / 2 + x * scale); close(p.y, state.heightPx / 2 - y * scale);
    }
    return snapshot();
  });
  assert.ok(initial.orbs.every(o => o.particles.length));
  const cameras = await page.evaluate(() => {
    const t = test116b, results = [];
    const before = JSON.stringify(t.snapshot());
    t.step(); const defaultSizes = { radii: t.calls.arcs.map(a => a[2]), widths: [...t.calls.strokes] };
    const ringWorld = t.calls.arcs.slice(0, t.runtime.settings.bands.count).map(a => t.Spaces.screenToSim(a[0], a[1]));
    t.cssSizes = { radii: defaultSizes.radii.map(r => r / devicePixelRatio), widths: defaultSizes.widths.map(w => w / devicePixelRatio) };
    for (const camera of [{ x: 4000, y: -3000, zoom: 1, rotationRad: 0 },
      { x: 0, y: 0, zoom: 1, rotationRad: Math.PI / 2 },
      { x: 0, y: 0, zoom: t.CONFIG.limits.camera.zoom.min, rotationRad: 0 },
      { x: 0, y: 0, zoom: t.CONFIG.limits.camera.zoom.max, rotationRad: 0 },
      { x: -2345.25, y: 6789.5, zoom: 2.75, rotationRad: .71 }]) {
      t.setCamera(camera); t.step();
      if (JSON.stringify(t.snapshot()) !== before) throw Error('camera changed simulation/history');
      if (JSON.stringify(t.calls.arcs.map(a => a[2])) !== JSON.stringify(defaultSizes.radii)) throw Error('camera zoom resized CSS marks');
      if (JSON.stringify(t.calls.strokes) !== JSON.stringify(defaultSizes.widths)) throw Error('camera zoom resized CSS widths');
      t.calls.arcs.slice(0, t.runtime.settings.bands.count).forEach((a, i) => {
        const p = t.Spaces.screenToSim(a[0], a[1]);
        t.close(p.x, ringWorld[i].x); t.close(p.y, ringWorld[i].y);
      });
      if (t.state.world !== t.world) throw Error('camera replaced world');
      t.orbs.forEach((o, i) => {
        if (o !== t.state.orbs[i]) throw Error('camera replaced Orb');
        [...o.trail.particles].forEach((p, j) => { if (p !== t.history[i][j]) throw Error('camera replaced retained particle'); });
      });
      for (const [x, y] of [[0, 0], [120.5, -678.25], [9000, -12000]]) {
        const p = t.Spaces.simToScreen(x, y), q = t.Spaces.screenToSim(p.x, p.y);
        t.close(q.x, x); t.close(q.y, y);
        const dx = x - camera.x, dy = y - camera.y, scale = Math.min(t.state.widthPx, t.state.heightPx) / 1600 * camera.zoom;
        t.close(p.x, t.state.widthPx / 2 + (Math.cos(camera.rotationRad) * dx + Math.sin(camera.rotationRad) * dy) * scale);
        t.close(p.y, t.state.heightPx / 2 - (-Math.sin(camera.rotationRad) * dx + Math.cos(camera.rotationRad) * dy) * scale);
      }
      const particle = t.history[0][0], projected = t.Spaces.simToScreen(particle.xSim, particle.ySim);
      if (!t.calls.arcs.some(a => Math.abs(a[0] - projected.x) < 1e-8 && Math.abs(a[1] - projected.y) < 1e-8)) throw Error('history used different projection');
      results.push({ ...t.state.camera });
    }
    const camera = t.state.camera;
    for (const patch of [{ zoom: 0 }, { x: Infinity }, { rotationRad: NaN }]) {
      let failed = false; try { t.setCamera(patch); } catch (error) { failed = error instanceof RangeError; }
      if (!failed || t.state.camera !== camera) throw Error('invalid camera was not rejected atomically');
    }
    t.UrlPreset.writeHashFromPrefs(); const hash = location.hash;
    const payload = JSON.parse(atob(hash.slice(3).replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.schema !== 12 || "camera" in payload.prefs || JSON.stringify(payload.prefs.sceneCamera) !== JSON.stringify(t.CONFIG.camera.defaults)) throw Error('runtime camera entered preset');
    if (!t.UrlPreset.applyFromLocationHash()) throw Error('URL apply failed');
    t.resolveSettings();
    if (t.state.camera !== camera) throw Error('preset apply changed camera');
    t.resetCamera(); t.step();
    if (JSON.stringify(t.snapshot()) !== before) throw Error('camera reset changed simulation/history');
    if (t.state.camera.x !== 0 || t.state.camera.y !== 0 || t.state.camera.zoom !== 1 || t.state.camera.rotationRad !== 0) throw Error('reset was not deterministic');
    return { cameras: results, cssSizesIndependentOfZoom: true, presetSchema: payload.schema, liveCameraExcludedFromUrl: true, invalidCameraRejected: true };
  });
  const cdp = await page.context().newCDPSession(page), viewports = [];
  await page.evaluate(() => test116b.setCamera({ x: -1500, y: 2200, zoom: 2.5, rotationRad: .3 }));
  for (const [width, height, factor] of [[900, 700, dpr], [700, 900, dpr], [700, 900, dpr === 1 ? 2 : 1]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: factor, mobile: false });
    const result = await page.evaluate(() => {
      const t = test116b; t.step();
      const p = t.Spaces.simToScreen(5000, -6000), q = t.Spaces.screenToSim(p.x, p.y);
      t.close(q.x, 5000); t.close(q.y, -6000);
      const tap = t.Renderer.getRecorderTap();
      if (tap.canvas !== document.querySelector('#c')) throw Error('recorder tap changed canvas');
      if (!t.calls.arcs.some(a => a[2] === t.runtime.settings.bands.overlay.pointSizePx * devicePixelRatio)) throw Error('Ring CSS size lost DPR');
      if (JSON.stringify(t.calls.arcs.map(a => a[2] / devicePixelRatio)) !== JSON.stringify(t.cssSizes.radii)) throw Error('CSS marks changed on DPR-only resize');
      if (JSON.stringify(t.calls.strokes.map(w => w / devicePixelRatio)) !== JSON.stringify(t.cssSizes.widths)) throw Error('CSS widths changed on DPR-only resize');
      return { snapshot: t.snapshot(), camera: { ...t.state.camera }, dpr: devicePixelRatio, width: tap.widthPx, height: tap.heightPx };
    });
    assert.equal(result.dpr, factor); assert.equal(result.width, Math.floor(width * factor));
    assert.equal(result.height, Math.floor(height * factor)); assert.deepEqual(result.snapshot, initial);
    assert.deepEqual(result.camera, { x: -1500, y: 2200, zoom: 2.5, rotationRad: .3 });
    viewports.push({ width, height, dpr: factor, backing: [result.width, result.height] });
  }
  const degenerate = await page.evaluate(() => {
    const t = test116b, canvas = t.state.canvas;
    canvas.style.width = '0px'; canvas.style.height = '0px'; t.step();
    const center = t.Spaces.simToScreen(4000, -9000);
    if (center.x !== 0 || center.y !== 0 || t.Spaces.screenToSim(0, 0) !== null) throw Error('degenerate viewport semantics');
    t.state.widthPx = NaN;
    if (t.Spaces.simToScreen(1, 1) !== null || t.Spaces.screenToSim(1, 1) !== null) throw Error('malformed viewport did not fail explicitly');
    t.Renderer.drawOrb(t.state.orbs[0], 100.1, 0);
    canvas.style.removeProperty('width'); canvas.style.removeProperty('height'); t.resizeCanvasToDisplaySize(); t.step();
    return { zeroForwardCenter: true, zeroInverseNull: true, malformedNull: true, canvasArgumentsFinite: true };
  });
  // Synthetic analysis/callback harness; the shipped editions below use a real WAV.
  await page.evaluate(() => {
    const t = test116b; t.state.audio.isLoaded = true; t.RecorderEngine.setIncludePlaybackAudio(false);
    const status = t.RecorderEngine.start({ mimeType: 'video/webm;codecs=vp8' });
    if (status.phase !== 'recording') throw Error(JSON.stringify(status));
    window.captureTimer116b = setInterval(() => t.step(), 30);
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { clearInterval(window.captureTimer116b); test116b.RecorderEngine.stop(); });
  await page.waitForFunction(() => test116b.state.recording.lastExportUrl);
  const capture = await decodeCapture(page);
  assert.equal(capture.videoWidth, capture.canvasWidth); assert.equal(capture.videoHeight, capture.canvasHeight);
  await cdp.detach();
  return { initialDpr: dpr, defaultMatches116a: true, ...cameras, viewports, degenerate,
    retainedParticles: initial.orbs.map(o => o.particles.length), identitiesAndCoordinatesPreserved: true,
    transformedRecorderEngineCapture: capture };
}

async function distributionChecks(page, url, dpr) {
  await page.goto(url); await page.waitForFunction(() => document.querySelector('#c').width > 0);
  const chooserPromise = page.waitForEvent('filechooser'); await page.locator('#btnLoad').click();
  await (await chooserPromise).setFiles({ name: '116b-stereo.wav', mimeType: 'audio/wav', buffer: wav() });
  await page.waitForFunction(() => document.querySelector('#btnPlay').textContent === 'Pause');
  await page.waitForFunction(() => /0:0[1-9]/.test(document.querySelector('#scrubberTime').textContent));
  await page.locator('#btnOpenRecord').click();
  await page.locator('#chkRecordIncludeAudio').uncheck();
  await page.locator('#btnRecordStart').click();
  await page.waitForFunction(() => !document.querySelector('#btnRecordStop').disabled);
  await page.waitForTimeout(1000); await page.locator('#btnRecordStop').click();
  await page.waitForFunction(() => !document.querySelector('#btnRecordDownloadLast').disabled);
  const capture = await decodeCapture(page);
  assert.equal(capture.videoWidth, capture.canvasWidth); assert.equal(capture.videoHeight, capture.canvasHeight);
  assert.equal(capture.canvasWidth, 1000 * dpr); assert.equal(capture.canvasHeight, 800 * dpr);
  await page.evaluate(() => document.querySelector('#btnShare').click());
  const payload = await page.evaluate(() => JSON.parse(atob(location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/'))));
  assert.equal(payload.schema, 12); assert.equal('camera' in payload.prefs, false); assert.deepEqual(payload.prefs.sceneCamera, { x: 0, y: 0, zoom: 1, rotationRad: 0 });
  await page.locator('#btnStop').click();
  return { dpr, actualStereoWavPlayback: true, runtimeCameraAbsentFromUrl: true, recorderEngineCapture: capture };
}

(async () => {
  const server = http.createServer((req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (relative === 'favicon.ico') { res.writeHead(204); res.end(); return; }
    if (relative === 'source') {
      res.setHeader('Content-Type', 'text/html');
      res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8').replaceAll('__AURALPRINT_VERSION__', version)
        .replace(/<link[^>]+>/g, '').replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>')
        .replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>'));
      return;
    }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const report = { version, source: [], distributions: [], errors: [], failedResponses: [] };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
      args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    report.browser = await browser.version();
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const dpr of [1, 2]) {
      for (const edition of ['source', 'portable', 'hosted']) {
        const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: dpr });
        page.setDefaultTimeout(10000); await observeCapture(page);
        page.on('pageerror', error => report.errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
        page.on('response', response => { if (response.status() >= 400) report.failedResponses.push(response.url()); });
        await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('blob:') ? route.continue() : route.abort());
        try {
          if (edition === 'source') report.source.push(await sourceChecks(page, base, dpr));
          else report.distributions.push({ edition, ...await distributionChecks(page,
            base + (edition === 'portable' ? `/dist/auralprint_${version.slice(1)}.html` : '/dist/hosted/index.html'), dpr) });
        } catch (error) { throw Error(`${edition} DPR ${dpr}: ${error.message}`, { cause: error }); }
        finally { await page.close(); }
      }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResponses, []);
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
