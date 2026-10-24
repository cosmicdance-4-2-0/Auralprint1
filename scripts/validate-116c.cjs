// Optional native Chromium interaction regression. Run after npm run build.
// Playwright is environment tooling; AP_REPORT optionally retains JSON evidence.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const close = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-8 * Math.max(1, Math.abs(a), Math.abs(b)), `${label}: ${a} != ${b}`);

function wav() {
  const rate = 44100, frames = rate * 30, bytes = frames * 4, b = Buffer.alloc(44 + bytes);
  b.write('RIFF'); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < frames; i++) {
    b.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 4);
    b.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 880 * i / rate)), 46 + i * 4);
  }
  return b;
}

async function observe(page) {
  await page.addInitScript(() => {
    const capture = HTMLCanvasElement.prototype.captureStream, create = URL.createObjectURL, play = HTMLMediaElement.prototype.play;
    window.native116c = { canvases: [], blobs: [], media: null };
    HTMLCanvasElement.prototype.captureStream = function (...args) { native116c.canvases.push(this); return capture.apply(this, args); };
    URL.createObjectURL = function (object) {
      const url = create.call(this, object);
      if (object instanceof Blob && object.type.startsWith('video/')) native116c.blobs.push({ object, url });
      return url;
    };
    HTMLMediaElement.prototype.play = function (...args) { if (this instanceof HTMLAudioElement) native116c.media = this; return play.apply(this, args); };
  });
}

async function captureInfo(page, compareViews = false) {
  return page.evaluate(async compare => {
    const canvas = document.querySelector('#c'), observed = native116c, blob = observed.blobs.at(-1);
    if (!blob?.object.size || !observed.canvases.length || observed.canvases.some(c => c !== canvas)) throw Error('export did not capture canonical viewport');
    const video = document.createElement('video'); video.muted = true;
    const wait = (target, event) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error(`${event} timeout`)), 5000);
      target.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
      target.addEventListener('error', () => { clearTimeout(timer); reject(Error('video decode failed')); }, { once: true });
    });
    const metadata = wait(video, 'loadedmetadata'); video.src = blob.url; await metadata;
    const result = { bytes: blob.object.size, mime: blob.object.type, videoWidth: video.videoWidth, videoHeight: video.videoHeight,
      canvasWidth: canvas.width, canvasHeight: canvas.height, canonicalTap: true };
    if (compare) {
      const target = document.createElement('canvas'); target.width = target.height = 64;
      const ctx = target.getContext('2d', { willReadFrequently: true });
      const error = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i += 4) for (let j = 0; j < 3; j++) sum += Math.abs(a[i + j] - b[i + j]); return sum / (a.length / 4 * 3); };
      result.views = [];
      for (const [index, time] of window.viewTimes116c.map((time, index) => [index, time])) {
        const seeked = wait(video, 'seeked'); video.currentTime = time; await seeked;
        ctx.drawImage(video, 0, 0, 64, 64); const pixels = ctx.getImageData(0, 0, 64, 64).data;
        const ownError = error(pixels, window.views116c[index]), otherError = error(pixels, window.views116c[1 - index]);
        if (!(ownError < otherError)) throw Error(`recorded view ${index} disagrees with displayed camera: ${ownError} >= ${otherError}`);
        result.views.push({ time, ownError, otherError });
      }
      result.displayedCameraChangesDecoded = true;
    }
    video.removeAttribute('src'); video.load(); return result;
  }, compareViews);
}

async function setField(page, id, value) { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).press('Tab'); }
async function openCamera(page) { if (!await page.locator('#cameraPanel').isVisible()) await page.locator('#btnOpenCamera').click(); }
async function hideCamera(page) { await page.locator('#btnHideCamera').click(); }
async function mode(page, enabled) { await openCamera(page); await page.locator('#chkCameraInteraction').setChecked(enabled); await hideCamera(page); }
async function readCamera(page) { return page.evaluate(() => test116c ? { ...test116c.state.camera } : null); }
async function tick(page) { await page.evaluate(() => test116c.tick()); }
async function sourceChecks(page, base, dpr) {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  await page.goto(base + '/source');
  await page.evaluate(async () => {
    const { state, setCamera, resetCamera } = await import('/src/js/core/state.js');
    const { preferences, runtime, resolveSettings } = await import('/src/js/core/preferences.js');
    const { onAnimationFrame } = await import('/src/js/main.js');
    const { Spaces } = await import('/src/js/core/spaces.js');
    const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
    const { initOrbs, resetVisualizers } = await import('/src/js/render/orb-runtime.js');
    const { UrlPreset } = await import('/src/js/presets/url-preset.js');
    const { CONFIG } = await import('/src/js/core/config.js');
    const { RecorderEngine } = await import('/src/js/recording/recorder-engine.js');
    let now = 100000; performance.now = () => now;
    AudioEngine.sample = () => ({ ready: true, monoLike: false, bands: Object.fromEntries(['L', 'R', 'C'].map(c => [c, { energy01: .4, rms: .4, timeDomain: Float32Array.of(.5) }])) });
    const tick = () => onAnimationFrame(now);
    tick(); now += 100; tick(); state.time.simPaused = true;
    const snapshot = () => ({ world: { ...state.world }, ringPhase: state.bands.ringPhaseRad,
      orbs: state.orbs.map(o => ({ id: o.id, x: o.xSim, y: o.ySim, angle: o.angleRad, fraction: o.trail.emitAccumulator,
        particles: [...o.trail.particles].map(p => ({ ...p })) })) });
    const backing = (x, y) => { const r = state.canvas.getBoundingClientRect(); return { x: (x - r.left) * state.canvas.width / r.width, y: (y - r.top) * state.canvas.height / r.height }; };
    window.test116c = { state, setCamera, resetCamera, preferences, runtime, resolveSettings, tick, Spaces, AudioEngine, initOrbs,
      resetVisualizers, UrlPreset, CONFIG, RecorderEngine, snapshot, backing, defaults: structuredClone(preferences.orbs), now: () => now };
    test116c.world = state.world; test116c.orbs = [...state.orbs]; test116c.particles = state.orbs.map(o => [...o.trail.particles]);
  });
  assert.equal(await page.locator('#chkCameraInteraction').isChecked(), false);
  const before = await page.evaluate(() => test116c.snapshot());
  await openCamera(page);
  // Native tab sequence enters every control in the camera section.
  await page.locator('#chkCameraInteraction').focus(); const tabIds = [];
  for (let i = 0; i < 25; i++) { const id = await page.evaluate(() => document.activeElement.id); if (!id || !await page.locator('#cameraSection').evaluate((el, id) => el.contains(document.getElementById(id)), id)) break; tabIds.push(id); await page.keyboard.press('Tab'); }
  for (const id of ['numCameraX', 'numCameraY', 'numCameraZoom', 'numCameraRotation', 'chkCameraInteraction', 'btnResetCamera', 'btnCameraPanLeft', 'btnCameraPanRight', 'btnCameraPanUp', 'btnCameraPanDown', 'btnCameraZoomIn', 'btnCameraZoomOut', 'btnCameraRotateCW', 'btnCameraRotateCCW']) assert.ok(tabIds.includes(id), `tab did not reach ${id}`);
  await setField(page, 'numCameraX', 123.456789012345); await setField(page, 'numCameraY', -987.65432109876);
  await setField(page, 'numCameraZoom', 2.345678901234); await setField(page, 'numCameraRotation', 37.123456789);
  let camera = await readCamera(page); close(camera.x, 123.456789012345); close(camera.y, -987.65432109876); close(camera.zoom, 2.345678901234); close(camera.rotationRad, 37.123456789 * Math.PI / 180);
  for (const [id, value] of [['numCameraX', ''], ['numCameraY', '1e309'], ['numCameraZoom', '0'], ['numCameraZoom', '101'], ['numCameraRotation', '']]) {
    const old = await readCamera(page); await setField(page, id, value); assert.deepEqual(await readCamera(page), old); assert.equal(await page.locator('#' + id).getAttribute('aria-invalid'), 'true');
  }
  await page.locator('#btnResetCamera').click(); assert.deepEqual(await readCamera(page), { x: 0, y: 0, zoom: 1, rotationRad: 0 });
  for (const [id, key, sign] of [['btnCameraPanLeft', 'x', -1], ['btnCameraPanRight', 'x', 1], ['btnCameraPanUp', 'y', 1], ['btnCameraPanDown', 'y', -1]]) {
    await page.locator('#btnResetCamera').click(); await page.locator('#' + id).press('Enter'); close((await readCamera(page))[key], 50 * sign);
  }
  await page.locator('#btnResetCamera').click(); await page.locator('#btnCameraZoomIn').press('Space'); close((await readCamera(page)).zoom, 1.1);
  await page.locator('#btnCameraZoomOut').press('Enter'); close((await readCamera(page)).zoom, 1);
  await page.locator('#btnCameraRotateCCW').press('Enter'); close((await readCamera(page)).rotationRad, 5 * Math.PI / 180);
  await page.locator('#btnCameraRotateCW').press('Enter'); close((await readCamera(page)).rotationRad, 0);
  await setField(page, 'numCameraRotation', 90); await page.locator('#btnCameraPanRight').click(); camera = await readCamera(page); close(camera.y, 50); close(camera.x, 0);
  await page.evaluate(() => { const t = test116c; t.setCamera({ x: 12.234567890123, y: -87.65432109, zoom: 1.4567890123, rotationRad: .71234567890123 }); t.tick(); });
  assert.equal(Number(await page.locator('#numCameraX').inputValue()), 12.234567890123);
  await page.locator('#btnResetCamera').click(); await hideCamera(page);
  assert.deepEqual(await page.evaluate(() => test116c.snapshot()), before);

  // Outside mode, ordinary pointer and wheel events are untouched.
  const untouched = await page.evaluate(() => { const c = document.querySelector('#c'); const events = [new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 8, isPrimary: true, clientX: 200, clientY: 200 }), new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -50, clientX: 200, clientY: 200 })]; return events.map(e => { c.dispatchEvent(e); return e.defaultPrevented; }); });
  assert.deepEqual(untouched, [false, false]);
  await mode(page, true);
  // CSS transform deliberately makes DOM rect != client size != backing pixels.
  await page.evaluate(() => { const c = test116c.state.canvas; c.style.cssText = 'position:fixed;inset:auto;left:30px;top:40px;width:600px;height:400px;transform:scale(.8);transform-origin:top left'; test116c.setCamera({ x: 101, y: -203, zoom: 2.5, rotationRad: .71 }); test116c.tick(); });
  const start = { x: 180, y: 160 }, end = { x: 750, y: 480 };
  const anchor = await page.evaluate(p => { const t = test116c, b = t.backing(p.x, p.y); return t.Spaces.screenToSim(b.x, b.y); }, start);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  assert.equal(await page.locator('#c').evaluate(c => c.hasPointerCapture(1)), true);
  await page.mouse.move(end.x, end.y, { steps: 4 }); await tick(page);
  const afterDrag = await page.evaluate(p => { const t = test116c, b = t.backing(p.x, p.y); return t.Spaces.screenToSim(b.x, b.y); }, end);
  close(afterDrag.x, anchor.x, 'rotated drag anchor X'); close(afterDrag.y, anchor.y, 'rotated drag anchor Y');
  await page.mouse.up(); assert.equal(await page.locator('#c').evaluate(c => c.hasPointerCapture(1)), false);
  const released = await readCamera(page); await page.mouse.move(800, 500); assert.deepEqual(await readCamera(page), released);
  // Native captured drags, followed by cancellation/focus-loss/mode-exit signals.
  const endings = [];
  for (const ending of ['cancel', 'window-blur', 'focus-control', 'mode-toggle']) {
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.evaluate(ending => { const c = document.querySelector('#c'); if (ending === 'cancel') c.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })); else if (ending === 'window-blur') window.dispatchEvent(new Event('blur')); else if (ending === 'focus-control') document.querySelector('#btnOpenScene').focus(); else { const control = document.querySelector('#chkCameraInteraction'); control.click(); control.click(); } }, ending);
    const stopped = await readCamera(page); await page.mouse.move(340, 220); assert.deepEqual(await readCamera(page), stopped, ending); await page.mouse.up(); endings.push(ending);
  }
  // Recovery allows a fresh captured pointer drag.
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(200, 170); await page.mouse.up(); assert.notDeepEqual(await readCamera(page), released);
  const wheelPoint = { x: 300, y: 240 };
  const wheelBefore = await page.evaluate(p => { const t = test116c, b = t.backing(p.x, p.y); return { world: t.Spaces.screenToSim(b.x, b.y), zoom: t.state.camera.zoom }; }, wheelPoint);
  await page.mouse.move(wheelPoint.x, wheelPoint.y); await page.mouse.wheel(0, -120); await page.waitForTimeout(30); await tick(page);
  const wheelAfter = await page.evaluate(p => { const t = test116c, b = t.backing(p.x, p.y); return { world: t.Spaces.screenToSim(b.x, b.y), zoom: t.state.camera.zoom }; }, wheelPoint);
  assert.ok(wheelAfter.zoom > wheelBefore.zoom); close(wheelAfter.world.x, wheelBefore.world.x); close(wheelAfter.world.y, wheelBefore.world.y);
  const wheelLimits = await page.evaluate(() => { const t = test116c, c = t.state.canvas, r = c.getBoundingClientRect(); const values = []; for (const deltaY of [-1e7, 1e7]) { c.dispatchEvent(new WheelEvent('wheel', { clientX: r.left + 100, clientY: r.top + 100, deltaY, bubbles: true, cancelable: true })); values.push(t.state.camera.zoom); } return values; });
  assert.deepEqual(wheelLimits, [100, .01]);
  assert.deepEqual(await page.evaluate(() => test116c.snapshot()), before);
  await page.evaluate(() => { const t = test116c; if (t.state.world !== t.world || t.state.orbs.some((o, i) => o !== t.orbs[i] || [...o.trail.particles].some((p, j) => p !== t.particles[i][j]))) throw Error('camera replaced simulation objects'); });
  await page.evaluate(() => { test116c.state.canvas.style.cssText = ''; test116c.tick(); });

  // Canvas-local arrows own panning; ordinary global shortcuts retain ownership.
  await page.evaluate(() => { test116c.originalMedia = test116c.AudioEngine.getMediaEl; test116c.fakeMedia = { currentTime: 10, duration: 30 }; test116c.AudioEngine.getMediaEl = () => test116c.fakeMedia; test116c.resetCamera(); });
  await page.locator('#c').focus(); await page.keyboard.press('ArrowRight'); close((await readCamera(page)).x, 50); assert.equal(await page.evaluate(() => test116c.fakeMedia.currentTime), 10);
  const keyCamera = await readCamera(page); await page.keyboard.press('Control+ArrowRight'); assert.deepEqual(await readCamera(page), keyCamera);
  await page.keyboard.press('Space'); assert.equal(await page.evaluate(() => test116c.state.time.simPaused), false);
  await page.keyboard.press('Space'); assert.equal(await page.evaluate(() => test116c.state.time.simPaused), true);
  await page.keyboard.press('r'); assert.deepEqual(await readCamera(page), keyCamera);
  const panelDisplay = await page.locator('#audioPanel').evaluate(el => getComputedStyle(el).display);
  await page.keyboard.press('h'); assert.notEqual(await page.locator('#audioPanel').evaluate(el => getComputedStyle(el).display), panelDisplay);
  await page.keyboard.press('h'); assert.equal(await page.locator('#audioPanel').evaluate(el => getComputedStyle(el).display), panelDisplay);
  await mode(page, false); await page.locator('#c').focus(); await page.keyboard.press('ArrowRight'); assert.equal(await page.evaluate(() => test116c.fakeMedia.currentTime), 15); assert.deepEqual(await readCamera(page), keyCamera);
  await page.locator('#rngVol').focus(); await page.keyboard.press('ArrowLeft'); assert.equal(await page.evaluate(() => test116c.fakeMedia.currentTime), 15);
  await page.evaluate(() => test116c.AudioEngine.getMediaEl = test116c.originalMedia);
  await mode(page, true);

  const cdp = await page.context().newCDPSession(page), layouts = [];
  for (const [width, height, factor] of [[900, 700, dpr], [700, 900, dpr], [700, 900, dpr === 1 ? 2 : 1]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: factor, mobile: false }); await tick(page);
    const layout = await page.evaluate(() => { const t = test116c, p = t.Spaces.simToScreen(123, -456), q = t.Spaces.screenToSim(p.x, p.y); return { width: t.state.canvas.width, height: t.state.canvas.height, dpr: devicePixelRatio, q, camera: { ...t.state.camera } }; });
    assert.equal(layout.width, width * factor); assert.equal(layout.height, height * factor); close(layout.q.x, 123); close(layout.q.y, -456); assert.deepEqual(layout.camera, keyCamera); layouts.push(layout);
  }
  // Emulated single-touch follows the same pointer path. This is not a physical device check.
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const touchCamera = await readCamera(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 200 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 250, y: 220 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.notDeepEqual(await readCamera(page), touchCamera);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  const populations = [];
  for (const count of [0, 1, Math.min(2, await page.evaluate(() => test116c.defaults.length))]) {
    await page.evaluate(count => { const t = test116c; t.preferences.orbs = structuredClone(t.defaults.slice(0, count)); t.resolveSettings(); t.initOrbs(); t.tick(); }, count);
    for (const paused of [false, true]) {
      await page.evaluate(paused => test116c.state.time.simPaused = paused, paused);
      await openCamera(page); const old = await readCamera(page); await page.locator('#btnCameraPanUp').click(); assert.notDeepEqual(await readCamera(page), old); await hideCamera(page);
    }
    populations.push(count);
  }
  const schema = await page.evaluate(() => { const t = test116c, camera = t.state.camera; t.UrlPreset.writeHashFromPrefs(); const payload = JSON.parse(atob(location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/'))); if (!t.UrlPreset.applyFromLocationHash()) throw Error('schema-12 round trip failed'); t.resolveSettings(); if (t.state.camera !== camera) throw Error('preset reset camera'); return payload; });
  assert.equal(schema.schema, 12); assert.equal('camera' in schema.prefs, false); assert.deepEqual(schema.prefs.sceneCamera, { x: 0, y: 0, zoom: 1, rotationRad: 0 });
  // Deterministic visible geometry on the canonical viewport, recorded across an actual UI pan.
  await page.evaluate(() => {
    const t = test116c; t.preferences.orbs = structuredClone(t.defaults.slice(0, 1)); t.preferences.orbs[0].particles.sizeMaxPx = 20; t.preferences.orbs[0].particles.sizeMinPx = 20; t.preferences.bands.overlay.enabled = true;
    t.resolveSettings(); t.initOrbs(); t.state.time.simPaused = true; t.state.audio.isLoaded = true; t.resetCamera();
    t.state.orbs[0].trail.emitAt(200, 150, t.now() / 1000, { r: 1, g: .2, b: .1 }); t.tick();
    window.sampleView116c = () => { const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d'); ctx.drawImage(t.state.canvas, 0, 0, 64, 64); return [...ctx.getImageData(0, 0, 64, 64).data]; };
    window.views116c = [sampleView116c()]; window.viewTimes116c = [.25]; window.captureStart116c = Date.now(); t.RecorderEngine.setIncludePlaybackAudio(false); const status = t.RecorderEngine.start(); if (status.phase !== 'recording') throw Error(JSON.stringify(status)); window.captureTimer116c = setInterval(t.tick, 30);
  });
  await page.waitForTimeout(650);
  await openCamera(page); await setField(page, 'numCameraX', 1500); await setField(page, 'numCameraZoom', 1.7); await hideCamera(page); await tick(page);
  await page.evaluate(() => { views116c.push(sampleView116c()); viewTimes116c.push((Date.now() - captureStart116c) / 1000 + .25); }); await page.waitForTimeout(650);
  await page.evaluate(() => { clearInterval(captureTimer116c); test116c.RecorderEngine.stop(); });
  await page.waitForFunction(() => test116c.state.recording.lastExportUrl);
  const capture = await captureInfo(page, true); assert.equal(capture.videoWidth, capture.canvasWidth); assert.equal(capture.videoHeight, capture.canvasHeight);
  await cdp.detach();
  return { initialDpr: dpr, controlsKeyboardAndPrecision: true, tabIds, invalidDraftsRejected: true, rotatedPointerCaptureAndCssScaling: true,
    dragTerminations: endings, freshDragRecovery: true, pointerAnchoredWheel: true, wheelLimits, modeOffEventsUntouched: true,
    simulationIdentitiesAndValuesPreserved: true, localArrowsDoNotSeek: true, globalShortcutsAndPanelKeysRetained: true,
    layouts, singleTouchEmulation: true, populations, liveCameraExcludedFromPreset: true, capture };
}

async function distributionChecks(page, url, dpr) {
  await page.goto(url); await page.waitForFunction(() => document.querySelector('#c').width > 0);
  await openCamera(page); await setField(page, 'numCameraX', 77.123456789); await setField(page, 'numCameraZoom', 2.123456789); await setField(page, 'numCameraRotation', 37.5);
  assert.equal(Number(await page.locator('#numCameraX').inputValue()), 77.123456789);
  await page.locator('#chkCameraInteraction').check(); await hideCamera(page);
  // Native DataTransfer/File dispatch exercises the unchanged application drop path.
  const encoded = wav().toString('base64');
  for (const enabled of [true, false]) {
    await mode(page, enabled);
    await page.evaluate(({ encoded, enabled }) => { const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], `116c-${enabled}.wav`, { type: 'audio/wav' })); const c = document.querySelector('#c'); c.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer })); c.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer })); }, { encoded, enabled });
    await page.waitForFunction(() => document.querySelector('#btnPlay').textContent === 'Pause');
  }
  await page.waitForFunction(() => native116c.media && native116c.media.currentTime > .1);
  await mode(page, true);
  if (!await page.locator('#btnPrev').isDisabled()) await page.locator('#btnPrev').click();
  await page.waitForFunction(() => document.querySelector('#btnPrev').disabled && !document.querySelector('#btnNext').disabled);
  const firstTrackUrl = await page.evaluate(() => native116c.media.src);
  await page.locator('#c').focus(); await page.keyboard.press('n');
  await page.waitForFunction(url => native116c.media.src !== url && !native116c.media.paused, firstTrackUrl);
  await page.waitForFunction(() => document.querySelector('#btnNext').disabled && !document.querySelector('#btnPrev').disabled);
  const secondTrackUrl = await page.evaluate(() => native116c.media.src);
  await page.keyboard.press('p');
  await page.waitForFunction(url => native116c.media.src !== url && !native116c.media.paused, secondTrackUrl);
  await page.waitForFunction(() => document.querySelector('#btnPrev').disabled && !document.querySelector('#btnNext').disabled);
  await mode(page, true); await page.locator('#btnPlay').click();
  await page.evaluate(() => { native116c.media.currentTime = 2; });
  const mediaTime = await page.evaluate(() => native116c.media.currentTime);
  await page.locator('#c').focus(); await page.keyboard.press('ArrowRight'); close(await page.evaluate(() => native116c.media.currentTime), mediaTime);
  await openCamera(page); assert.notEqual(Number(await page.locator('#numCameraX').inputValue()), 77.123456789); await hideCamera(page);
  await mode(page, false); await page.locator('#c').focus(); await page.keyboard.press('ArrowRight'); close(await page.evaluate(() => native116c.media.currentTime), mediaTime + 5);
  const scrubber = await page.locator('#scrubberCanvas').boundingBox(); await page.mouse.click(scrubber.x + scrubber.width * .4, scrubber.y + scrubber.height / 2);
  assert.ok(Math.abs(await page.evaluate(() => native116c.media.currentTime) - 12) < 30 / scrubber.width + .01, 'scrubber seek within one client pixel');
  await page.locator('#rngVol').focus(); const panelTime = await page.evaluate(() => native116c.media.currentTime); await page.keyboard.press('ArrowLeft'); close(await page.evaluate(() => native116c.media.currentTime), panelTime);
  await mode(page, true); await page.locator('#btnPlay').click();
  await page.mouse.move(200, 180); await page.mouse.down(); await page.mouse.move(260, 220); await page.mouse.up(); await page.mouse.wheel(0, -100);
  await page.locator('#btnOpenRecord').click(); await page.locator('#chkRecordIncludeAudio').uncheck(); await page.locator('#btnRecordStart').click(); await page.waitForFunction(() => !document.querySelector('#btnRecordStop').disabled);
  await page.waitForTimeout(250); await page.mouse.move(180, 180); await page.mouse.down(); await page.mouse.move(220, 230); await page.mouse.up(); await page.mouse.wheel(0, 150); await page.waitForTimeout(600);
  await page.locator('#btnRecordStop').click(); await page.waitForFunction(() => !document.querySelector('#btnRecordDownloadLast').disabled);
  const capture = await captureInfo(page); assert.equal(capture.videoWidth, 1000 * dpr); assert.equal(capture.videoHeight, 800 * dpr);
  await page.locator('#btnHideRecord').click(); await page.locator('#btnStop').click();
  await openCamera(page); const stoppedX = Number(await page.locator('#numCameraX').inputValue()); await page.locator('#btnCameraPanRight').click(); assert.notEqual(Number(await page.locator('#numCameraX').inputValue()), stoppedX); await page.locator('#btnResetCamera').click(); assert.equal(Number(await page.locator('#numCameraX').inputValue()), 0); assert.equal(Number(await page.locator('#numCameraZoom').inputValue()), 1);
  await page.evaluate(() => document.querySelector('#btnShare').click());
  const payload = await page.evaluate(() => JSON.parse(atob(location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/')))); assert.equal(payload.schema, 12); assert.equal('camera' in payload.prefs, false); assert.deepEqual(payload.prefs.sceneCamera, { x: 0, y: 0, zoom: 1, rotationRad: 0 });
  return { dpr, realStereoPlayback: true, dropsWithModeEnabledAndDisabled: true, canvasKeysDoNotSeek: true, globalTrackNavigation: true, globalSeekAndScrubberPreserved: true, panelKeyboardPriority: true, pausedStoppedAndRunningControls: true, movingCameraRecording: capture, liveCameraExcludedFromPreset: true };
}

(async () => {
  const server = http.createServer((req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (relative === 'favicon.ico') { res.writeHead(204); res.end(); return; }
    if (relative === 'source') {
      res.setHeader('Content-Type', 'text/html'); res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8').replaceAll('__AURALPRINT_VERSION__', version).replace(/<link[^>]+>/g, '')
        .replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>').replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>')); return;
    }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' })[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const report = { version, source: [], distributions: [], errors: [], failedResponses: [], limitations: ['Portable HTML is served over local HTTP; this harness does not test file:// navigation.', 'Chromium Linux only; no Firefox, WebKit, physical touch/orientation or OS file-drag checks.', 'Blur/cancel signals are dispatched to native captured drags; touch and DPR/orientation use CDP emulation.', 'Short recordings validate viewport content/dimensions, not audio fidelity or long-duration recording.'] };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_EXECUTABLE || process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }); report.browser = await browser.version();
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const dpr of [1, 2]) for (const edition of ['source', 'portable', 'hosted']) {
      console.error(`Checking ${edition} DPR ${dpr}`);
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: dpr }); page.setDefaultTimeout(15000); await observe(page);
      page.on('pageerror', error => report.errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); }); page.on('response', response => { if (response.status() >= 400) report.failedResponses.push(response.url()); });
      await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('blob:') ? route.continue() : route.abort());
      try { if (edition === 'source') report.source.push(await sourceChecks(page, base, dpr)); else report.distributions.push({ edition, ...await distributionChecks(page, base + (edition === 'portable' ? `/dist/auralprint_${version.slice(1)}.html` : '/dist/hosted/index.html'), dpr) }); }
      catch (error) { throw Error(`${edition} DPR ${dpr}: ${error.message}`, { cause: error }); }
      finally { await page.close(); }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResponses, []); if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
