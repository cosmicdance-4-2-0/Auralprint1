// Optional real-browser regression for the 116C.A corrective pass.
// Browser tooling remains external. Run after npm run build; AP_REPORT saves JSON.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);
const cameraNear = (a, b) => { for (const key of ['x', 'y', 'zoom', 'rotationRad']) near(a[key], b[key]); };
function wav() {
  const rate = 22050, frames = rate * 45, bytes = frames * 4, b = Buffer.alloc(44 + bytes);
  b.write('RIFF'); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) b.writeInt16LE(Math.round(18000 * Math.sin(2 * Math.PI * (c ? 660 : 440) * i / rate)), 44 + i * 4 + c * 2);
  return b;
}
async function representativeHero() {
  const { CONFIG } = await import(path.join(root, 'src/js/core/config.js'));
  const { encodePresetPayload } = await import(path.join(root, 'src/js/presets/preset-codec.js'));
  const prefs = structuredClone(CONFIG.defaults), seed = prefs.orbs[0];
  prefs.world = { widthUnits: 2400, heightUnits: 900 };
  prefs.orbs = Array.from({ length: 16 }, (_, i) => ({ ...structuredClone(seed), id: `native-hero-${i}`, chanId: ['C', 'L', 'R'][i % 3],
    chirality: i % 2 ? -1 : 1, startAngleRad: i * Math.PI / 8, centerXFrac: (i % 4 - 1.5) * .3, centerYFrac: (Math.floor(i / 4) - 1.5) * .25,
    motion: { angularSpeedRadPerSec: .4 + i * .07 }, response: { minRadiusFrac: .1, maxRadiusFrac: .7 + (i % 4) * .08, waveformRadialDisplaceFrac: .4 },
    particles: { ...seed.particles, ttlSec: 600, emitPerSecond: 300, minPlacementDistanceUnits: 0, sizeMaxPx: 8, sizeMinPx: 3 },
  }));
  prefs.bands.overlay = { ...prefs.bands.overlay, enabled: true, minRadiusFrac: .3, maxRadiusFrac: 1, waveformRadialDisplaceFrac: .6, pointSizePx: 5, lineWidthPx: 4 };
  const payload = encodePresetPayload(prefs);
  return { prefs, hash: '#p=' + Buffer.from(JSON.stringify(payload)).toString('base64url') };
}
async function observe(page) {
  await page.addInitScript(() => {
    window.nativeCorrective = { frames: [], probe: false, previousTimestamp: null, keys: [], canvases: [], blobs: [], media: null };
    window.readCameraCorrective = () => window.sourceCorrective ? { ...sourceCorrective.state.camera } : {
      x: Number(document.querySelector('#numCameraX')?.value), y: Number(document.querySelector('#numCameraY')?.value),
      zoom: Number(document.querySelector('#numCameraZoom')?.value), rotationRad: Number(document.querySelector('#numCameraRotation')?.value) * Math.PI / 180,
    };
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => raf(timestamp => {
      if (callback.name !== 'onAnimationFrame') return callback(timestamp);
      const o = nativeCorrective, recording = o.probe && o.activeKey, before = recording ? readCameraCorrective() : null;
      const elapsed = o.previousTimestamp === null ? 0 : (timestamp - o.previousTimestamp) / 1000;
      o.previousTimestamp = timestamp; callback(timestamp);
      if (recording) o.frames.push({ timestamp, elapsed, before, after: readCameraCorrective() });
    });
    window.waitFramesCorrective = duration => new Promise(resolve => { let start; const f = timestamp => { start ??= timestamp; if (timestamp - start >= duration) resolve(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
    window.addEventListener('keydown', e => { if (nativeCorrective.probe) { nativeCorrective.keys.push({ key: e.key.toLowerCase(), repeat: e.repeat }); if (['w', 'd', 'q'].includes(e.key.toLowerCase())) nativeCorrective.activeKey = e.key.toLowerCase(); } }, true);
    window.addEventListener('keyup', e => { if (nativeCorrective.activeKey === e.key.toLowerCase()) nativeCorrective.activeKey = null; }, true);
    const capture = HTMLCanvasElement.prototype.captureStream, create = URL.createObjectURL, play = HTMLMediaElement.prototype.play;
    HTMLCanvasElement.prototype.captureStream = function (...args) { nativeCorrective.canvases.push(this); return capture.apply(this, args); };
    URL.createObjectURL = function (object) { const url = create.call(this, object); if (object instanceof Blob && object.type.startsWith('video/')) nativeCorrective.blobs.push({ object, url }); return url; };
    HTMLMediaElement.prototype.play = function (...args) { if (this instanceof HTMLAudioElement) nativeCorrective.media = this; return play.apply(this, args); };
  });
}
const waitFrames = (page, duration = 80) => page.evaluate(duration => waitFramesCorrective(duration), duration);
async function readCamera(page) { await waitFrames(page, 0); return page.evaluate(() => readCameraCorrective()); }
async function openCamera(page) { if (!await page.locator('#cameraPanel').isVisible()) await page.locator('#btnOpenCamera').click(); await page.locator('#numCameraX').focus(); }
async function field(page, id, value) { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).press('Tab'); }
async function reset(page, rotation = 0) { await openCamera(page); await page.locator('#btnResetCamera').click(); if (rotation) await field(page, 'numCameraRotation', rotation); await page.locator('#c').focus(); }
async function loadAudio(page) {
  const encoded = wav().toString('base64');
  await page.evaluate(encoded => { const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], 'representative-16-orb.wav', { type: 'audio/wav' })); document.querySelector('#c').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer })); }, encoded);
  await page.waitForFunction(() => nativeCorrective.media && !nativeCorrective.media.paused && nativeCorrective.media.currentTime > .15);
}
async function slowHeldChecks(page) {
  const checks = [];
  for (const key of ['w', 'd', 'q']) {
    await reset(page); await page.evaluate(() => { nativeCorrective.frames = []; nativeCorrective.keys = []; nativeCorrective.probe = true; });
    await page.keyboard.down(key);
    const stalls = [];
    try {
      for (const blockMs of [120, 180, 300, 700]) {
        await waitFrames(page, 140);
        const block = await page.evaluate(ms => { const camera = readCameraCorrective(), start = performance.now(); while (performance.now() - start < ms) {} return { before: camera, blockedMs: performance.now() - start }; }, blockMs);
        await waitFrames(page, 180); const recovered = await readCamera(page);
        const delta = key === 'q' ? ((recovered.rotationRad - block.before.rotationRad + Math.PI * 2) % (Math.PI * 2)) : Math.hypot(recovered.x - block.before.x, recovered.y - block.before.y);
        assert.ok(delta > (key === 'q' ? .08 : 15), `${key} failed to resume after ${blockMs}ms without a new keydown`);
        stalls.push({ ...block, afterRecovery: recovered });
      }
    } finally { await page.keyboard.up(key); await page.evaluate(() => nativeCorrective.probe = false); }
    const data = await page.evaluate(() => ({ frames: nativeCorrective.frames, keys: nativeCorrective.keys }));
    assert.deepEqual(data.keys.filter(e => e.key === key), [{ key, repeat: false }], 'motion depended on repeat/reacquisition');
    const slow = data.frames.filter(f => f.elapsed > .1 && f.elapsed <= .5), discontinuities = data.frames.filter(f => f.elapsed > .5);
    assert.ok(slow.length >= 3, 'missing real120–300ms callback intervals'); assert.ok(discontinuities.length >= 1, 'missing real suspension-size interval');
    const scale = 800 / 900; let largestStep = 0;
    for (const frame of data.frames) {
      const actual = key === 'q' ? ((frame.after.rotationRad - frame.before.rotationRad + Math.PI * 2) % (Math.PI * 2)) * 180 / Math.PI : Math.hypot(frame.after.x - frame.before.x, frame.after.y - frame.before.y) * scale;
      const expected = (frame.elapsed > 0 && frame.elapsed <= .5 ? Math.min(frame.elapsed, .1) : 0) * (key === 'q' ? 60 : 320);
      try { near(actual, expected, .00001); } catch (error) { throw Error(`${key} frame ${JSON.stringify(frame)}: ${error.message}`); } largestStep = Math.max(largestStep, actual);
    }
    const stopped = await readCamera(page); await waitFrames(page, 120); cameraNear(await readCamera(page), stopped);
    checks.push({ key, onlyOneNativeKeydown: true, frames: data.frames.length, observedSlowIntervals: slow.map(f => f.elapsed), observedDiscontinuities: discontinuities.map(f => f.elapsed), largestStep, stalls });
  }
  return checks;
}
function potentialPrimitives(prefs, retained = []) {
  const span = Math.min(prefs.world.widthUnits, prefs.world.heightUnits), primitives = [];
  for (const x of [-prefs.world.widthUnits / 2, prefs.world.widthUnits / 2]) for (const y of [-prefs.world.heightUnits / 2, prefs.world.heightUnits / 2]) primitives.push({ x, y, radius: 0 });
  let mark = 0;
  for (const orb of prefs.orbs) {
    primitives.push({ x: orb.centerXFrac * span, y: orb.centerYFrac * span, radius: Math.max(orb.response.minRadiusFrac, orb.response.maxRadiusFrac) * span * (1 + Math.abs(orb.response.waveformRadialDisplaceFrac)) });
    mark = Math.max(mark, orb.particles.sizeMaxPx, orb.particles.sizeMinPx, orb.trace.lines ? orb.trace.lineWidthPx / 2 : 0);
  }
  const ring = prefs.bands.overlay;
  if (ring.enabled) { primitives.push({ x: 0, y: 0, radius: Math.max(ring.minRadiusFrac, ring.maxRadiusFrac) * span * (1 + Math.abs(ring.waveformRadialDisplaceFrac)) }); mark = Math.max(mark, ring.pointSizePx, ring.connectAdjacent ? ring.lineWidthPx / 2 : 0); }
  for (const point of retained) primitives.push({ ...point, radius: 0 });
  return { primitives, marginCssPx: 16 + mark, span };
}
function assertFit(camera, prefs, retained = [], width = 1000, height = 800) {
  const { primitives, marginCssPx, span } = potentialPrimitives(prefs, retained), scale = Math.min(width, height) / span * camera.zoom;
  const cos = Math.cos(camera.rotationRad), sin = Math.sin(camera.rotationRad); let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of primitives) {
    const dx = p.x - camera.x, dy = p.y - camera.y, x = width / 2 + (dx * cos + dy * sin) * scale, y = height / 2 - (-dx * sin + dy * cos) * scale, r = p.radius * scale;
    minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r); minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r);
  }
  assert.ok(minX >= marginCssPx - 1e-6 && minY >= marginCssPx - 1e-6 && maxX <= width - marginCssPx + 1e-6 && maxY <= height - marginCssPx + 1e-6, `fit clipped envelope ${JSON.stringify({ minX, maxX, minY, maxY, marginCssPx, camera })}`);
  return { minX, maxX, minY, maxY, marginCssPx };
}
async function sourceAccess(page) {
  await page.evaluate(async () => {
    const { state, setCamera } = await import('/src/js/core/state.js');
    const { preferences, runtime, resolveSettings } = await import('/src/js/core/preferences.js');
    const { initOrbs } = await import('/src/js/render/orb-runtime.js');
    const { Spaces } = await import('/src/js/core/spaces.js');
    const { UI } = await import('/src/js/ui/ui.js');
    window.sourceCorrective = { state, setCamera, preferences, runtime, resolveSettings, initOrbs, Spaces, UI };
  });
  assert.equal(await page.evaluate(() => sourceCorrective.state.orbs.length), 16);
}
async function fitChecks(page, prefs, source) {
  await page.locator('#c').focus(); await page.keyboard.press('Space');
  const retained = source ? [{ x: 3500, y: -2200 }, { x: -2800, y: 1900 }] : [];
  if (source) await page.evaluate(points => {
    const t = sourceCorrective; if (!t.state.time.simPaused) throw Error('expected visual pause');
    points.forEach((p, i) => t.state.orbs[i].trail.emitAt(p.x, p.y, performance.now() / 1000, { r: 1, g: .4, b: .2 }));
    t.saved = { world: t.state.world, orbs: [...t.state.orbs], phases: t.state.orbs.map(o => o.angleRad), fractions: t.state.orbs.map(o => o.trail.emitAccumulator), particles: t.state.orbs.map(o => [...o.trail.particles]), positions: t.state.orbs.map(o => [...o.trail.particles].map(p => ({ x: p.xSim, y: p.ySim }))) };
  }, retained);
  const fits = [];
  for (const rotation of [0, 90, 37.5]) {
    await reset(page, rotation); await page.keyboard.press('f'); const shortcut = await readCamera(page); near(shortcut.rotationRad, rotation * Math.PI / 180);
    fits.push({ rotation, camera: shortcut, bounds: assertFit(shortcut, prefs, retained) });
    await openCamera(page); await page.locator('#btnFitCamera').click(); cameraNear(await readCamera(page), shortcut);
  }
  // Fit is one operation and clears old movement; it does not turn into tracking.
  await page.locator('#c').focus(); await page.keyboard.down('w'); await waitFrames(page, 100); await page.keyboard.press('Shift+f'); const fitHeld = await readCamera(page); await waitFrames(page, 180); cameraNear(await readCamera(page), fitHeld); await page.keyboard.up('w');
  assertFit(fitHeld, prefs, retained); await page.keyboard.down('w'); await waitFrames(page, 100); await page.keyboard.press('Shift+c'); cameraNear(await readCamera(page), { x: 0, y: 0, zoom: 1, rotationRad: 0 }); await waitFrames(page, 180); cameraNear(await readCamera(page), { x: 0, y: 0, zoom: 1, rotationRad: 0 }); await page.keyboard.up('w');
  await page.keyboard.press('f'); const beforeModifiers = await readCamera(page);
  for (const keys of ['Control+c', 'Meta+c', 'Control+f', 'Meta+f']) { await page.keyboard.press(keys); cameraNear(await readCamera(page), beforeModifiers); }
  await openCamera(page); await page.locator('#chkCameraInteraction').uncheck(); await page.locator('#c').focus(); await page.keyboard.press('c'); await page.keyboard.press('f'); cameraNear(await readCamera(page), beforeModifiers); await page.locator('#chkCameraInteraction').check();
  await page.locator('#numCameraX').focus(); await page.keyboard.press('c'); await page.keyboard.press('f'); cameraNear(await readCamera(page), beforeModifiers);
  if (source) await page.evaluate(() => {
    const t = sourceCorrective, s = t.saved; if (t.state.world !== s.world || t.state.orbs.some((o, i) => o !== s.orbs[i] || o.angleRad !== s.phases[i] || o.trail.emitAccumulator !== s.fractions[i] || [...o.trail.particles].some((p, j) => p !== s.particles[i][j] || p.xSim !== s.positions[i][j].x || p.ySim !== s.positions[i][j].y))) throw Error('fit/reset changed paused simulation objects or values');
  });
  const fixed = await readCamera(page); await page.setViewportSize({ width: 1200, height: 700 }); await waitFrames(page); cameraNear(await readCamera(page), fixed); await page.locator('#c').focus(); await page.keyboard.press('f'); const resizedFit = await readCamera(page); assertFit(resizedFit, prefs, retained, 1200, 700); await page.setViewportSize({ width: 1000, height: 800 }); await waitFrames(page);
  // Extreme aspect ratio reaches the existing minimum zoom and must report it.
  await page.locator('#btnOpenScene').click(); await field(page, 'numWorldWidth', 1_000_000); await field(page, 'numWorldHeight', 1); await openCamera(page); await page.locator('#btnFitCamera').click(); near((await readCamera(page)).zoom, .01);
  const status = await page.locator('#cameraFitStatus').textContent(); assert.match(status, /minimum|limit|cannot|won.t|fit/i); assert.ok(status.trim().length > 10); assert.equal(await page.locator('#cameraFitStatus').isVisible(), true);
  await page.locator('#btnHideCamera').click(); assert.equal(await page.locator('#cameraFitStatus').isVisible(), true);
  await page.locator('#btnHideScene').click(); await page.locator('#btnOpenScene').click(); await field(page, 'numWorldWidth', prefs.world.widthUnits); await field(page, 'numWorldHeight', prefs.world.heightUnits); await page.locator('#btnHideScene').click(); await openCamera(page); await page.locator('#btnFitCamera').click();
  const zeroOrbs = source ? await page.evaluate(() => { const t = sourceCorrective; t.originals = structuredClone(t.preferences.orbs); t.preferences.orbs = []; t.resolveSettings(); t.initOrbs(); return true; }) : false;
  if (source) {
    await reset(page, 21); await page.keyboard.press('f'); const noOrbs = { ...prefs, orbs: [] }; assertFit(await readCamera(page), noOrbs);
    await page.evaluate(() => { const t = sourceCorrective; t.preferences.orbs = t.originals; t.resolveSettings(); t.initOrbs(); }); await page.keyboard.press('f');
  }
  return { fits, shortcutMatchesButton: true, cClearsHeldAndResets: true, fClearsHeldOneShot: true, ctrlMetaAndFocusOwnership: true, resizedFit, minimumZoomStatus: status, statusVisibleWithPanelHidden: true, zeroOrbs, pausedSimulationPreserved: source };
}
async function recordingChecks(page) {
  await openCamera(page); await page.locator('#btnFitCamera').click(); await page.locator('#btnOpenRecord').click(); await page.locator('#chkRecordIncludeAudio').uncheck(); await page.locator('#btnRecordStart').click(); await page.waitForFunction(() => !document.querySelector('#btnRecordStop').disabled);
  const authoredDuringRecording = await readCamera(page);
  await page.locator('#btnSaveSceneView').evaluate(button => button.click());
  cameraNear(await readCamera(page), authoredDuringRecording);
  assert.equal(await page.locator('#btnRecordStop').isDisabled(), false);
  await waitFrames(page, 180); await page.locator('#c').focus(); const before = await readCamera(page); await page.keyboard.down('w'); await waitFrames(page, 650); await page.keyboard.up('w'); const after = await readCamera(page); assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 0); await waitFrames(page, 150);
  await page.locator('#btnRestoreSceneView').evaluate(button => button.click());
  cameraNear(await readCamera(page), authoredDuringRecording);
  assert.equal(await page.locator('#btnRecordStop').isDisabled(), false);
  await page.locator('#btnRecordStop').click(); await page.waitForFunction(() => !document.querySelector('#btnRecordDownloadLast').disabled);
  const capture = await page.evaluate(async () => {
    const o = nativeCorrective, canvas = document.querySelector('#c'), blob = o.blobs.at(-1); if (!blob?.object.size || o.canvases.some(c => c !== canvas)) throw Error('not a canonical recorder export');
    const video = document.createElement('video'); video.muted = true;
    const wait = name => new Promise((resolve, reject) => { video.addEventListener(name, resolve, { once: true }); video.addEventListener('error', reject, { once: true }); });
    const metadata = wait('loadedmetadata'); video.src = blob.url; await metadata;
    const sample = document.createElement('canvas'); sample.width = sample.height = 64; const ctx = sample.getContext('2d', { willReadFrequently: true }), images = [];
    for (const time of [.1, .8]) { const seeked = wait('seeked'); video.currentTime = time; await seeked; ctx.drawImage(video, 0, 0, 64, 64); images.push(ctx.getImageData(0, 0, 64, 64).data); }
    let difference = 0; for (let i = 0; i < images[0].length; i += 4) for (let c = 0; c < 3; c++) difference += Math.abs(images[0][i + c] - images[1][i + c]); difference /= 64 * 64 * 3;
    const result = { bytes: blob.object.size, mime: blob.object.type, width: video.videoWidth, height: video.videoHeight, canvasWidth: canvas.width, canvasHeight: canvas.height, canonicalViewport: true, authoringDuringRecording: true, decodedFrameDifference: difference };
    video.removeAttribute('src'); video.load(); return result;
  });
  assert.equal(capture.width, capture.canvasWidth); assert.equal(capture.height, capture.canvasHeight); assert.ok(capture.decodedFrameDifference > .05, 'held camera movement absent from decoded video');
  await page.locator('#btnHideRecord').click(); return capture;
}
async function lifecycleChecks(page) {
  for (const cancellation of ['blur', 'hide', 'focus', 'mode', 'escape']) {
    await reset(page); await page.keyboard.down('w'); await waitFrames(page, 100);
    if (cancellation === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else if (cancellation === 'hide') await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    else if (cancellation === 'focus') await page.locator('#numCameraPanSpeed').focus();
    else if (cancellation === 'mode') await page.evaluate(() => document.querySelector('#chkCameraInteraction').click());
    else await page.keyboard.press('Escape');
    const stopped = await readCamera(page); await waitFrames(page, 160); cameraNear(await readCamera(page), stopped); await page.keyboard.up('w');
    if (!await page.locator('#chkCameraInteraction').isChecked()) await page.locator('#chkCameraInteraction').check(); await page.locator('#c').focus(); await waitFrames(page, 100); cameraNear(await readCamera(page), stopped);
  }
  return ['blur', 'hide', 'focus', 'mode', 'escape'];
}
(async () => {
  const hero = await representativeHero();
  const server = http.createServer((req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (relative === 'favicon.ico') { res.writeHead(204); res.end(); return; }
    if (relative === 'source') { res.setHeader('Content-Type', 'text/html'); res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8').replaceAll('__AURALPRINT_VERSION__', version).replace(/<link[^>]+>/g, '').replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>').replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>')); return; }
    const file = path.resolve(root, relative); if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' })[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const report = { version, editions: [], errors: [], failedResponses: [], scene: 'Representative16-Orb composition constructed through canonical schema12; not an owner-provided preset.', limitations: ['Linux Chromium via local HTTP; no physical device, Firefox/WebKit or file:// coverage.', 'Visible slow frames are genuine synchronous main-thread stalls while a native key remains down; blur/hiding additionally use lifecycle signal injection.', 'Short recordings test decoded camera movement and canonical viewport dimensions, not audio fidelity or long-duration limits.'] };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_EXECUTABLE || process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }); report.browser = await browser.version();
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const dpr of [1, 2]) for (const edition of ['source', 'portable', 'hosted']) {
      console.error(`116C.A corrective: ${edition}, DPR${dpr}`); const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: dpr }); page.setDefaultTimeout(15000); await observe(page);
      page.on('pageerror', error => report.errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); }); page.on('response', response => { if (response.status() >= 400) report.failedResponses.push(response.url()); });
      await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('blob:') ? route.continue() : route.abort());
      try {
        await page.goto(base + (edition === 'source' ? '/source' : edition === 'portable' ? `/dist/auralprint_${version.slice(1)}.html` : '/dist/hosted/index.html') + hero.hash); await page.waitForFunction(() => document.querySelector('#c').width > 0);
        if (edition === 'source') await sourceAccess(page); await openCamera(page); await page.locator('#chkCameraInteraction').check(); await loadAudio(page);
        const held = await slowHeldChecks(page), fit = await fitChecks(page, hero.prefs, edition === 'source'), recording = await recordingChecks(page), lifecycle = await lifecycleChecks(page);
        report.editions.push({ edition, dpr, held, fit, recording, lifecycle });
      } catch (error) { throw Error(`${edition} DPR${dpr}: ${error.message}`, { cause: error }); }
      finally { await page.close(); }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResponses, []); console.log(JSON.stringify(report, null, 2));
  } finally { if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report, null, 2) + '\n'); if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
