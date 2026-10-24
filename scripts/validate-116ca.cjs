// Optional real-RAF Chromium checks. Browser tooling is external to the app.
// npm run build; AP_PLAYWRIGHT_MODULE=/path/to/playwright node scripts/validate-116ca.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const close = (a, b, tolerance = 1e-8, label = '') => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b)), `${label}: ${a} != ${b}`);

function wav() {
  const rate = 22050, frames = rate * 30, bytes = frames * 4, b = Buffer.alloc(44 + bytes);
  b.write('RIFF'); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) b.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * (c ? 660 : 440) * i / rate)), 44 + i * 4 + c * 2);
  return b;
}

async function observe(page) {
  await page.addInitScript(() => {
    const capture = HTMLCanvasElement.prototype.captureStream, create = URL.createObjectURL, play = HTMLMediaElement.prototype.play;
    window.native116ca = { canvases: [], blobs: [], media: null };
    HTMLCanvasElement.prototype.captureStream = function (...args) { native116ca.canvases.push(this); return capture.apply(this, args); };
    URL.createObjectURL = function (object) { const url = create.call(this, object); if (object instanceof Blob && object.type.startsWith('video/')) native116ca.blobs.push({ object, url }); return url; };
    HTMLMediaElement.prototype.play = function (...args) { if (this instanceof HTMLAudioElement) native116ca.media = this; return play.apply(this, args); };
    window.camera116ca = () => window.source116ca ? { ...source116ca.state.camera } : {
      x: Number(document.querySelector('#numCameraX').value), y: Number(document.querySelector('#numCameraY').value),
      zoom: Number(document.querySelector('#numCameraZoom').value), rotationRad: Number(document.querySelector('#numCameraRotation').value) * Math.PI / 180,
    };
    window.frames116ca = duration => new Promise(resolve => {
      const samples = []; let start;
      const frame = timestamp => { start ??= timestamp; samples.push({ timestamp, ...camera116ca() }); if (timestamp - start >= duration) resolve(samples); else requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    });
  });
}

const camera = async page => { await frames(page, 0); return page.evaluate(() => camera116ca()); };
const frames = (page, duration = 120) => page.evaluate(duration => frames116ca(duration), duration);
async function openCamera(page) { if (!await page.locator('#cameraPanel').isVisible()) await page.locator('#btnOpenCamera').click(); }
async function setField(page, id, value) { await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).press('Tab'); }
async function reset(page, { rotation = 0, zoom = 1 } = {}) { await openCamera(page); await page.locator('#btnResetCamera').click(); if (rotation) await setField(page, 'numCameraRotation', rotation); if (zoom !== 1) await setField(page, 'numCameraZoom', zoom); }
async function hold(page, keys, duration = 420) {
  // These speed measurements require ordinary <=100ms native intervals. Keep
  // every existing rate/direction/per-frame assertion; retry only invalid
  // sampling windows, with a bounded count and report evidence. The corrective
  // harness separately verifies capped movement through actual slow frames.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('#c').focus();
    let samples;
    try { for (const key of keys) await page.keyboard.down(key); samples = await frames(page, duration); }
    finally { for (const key of keys.toReversed()) await page.keyboard.up(key); }
    const intervals = samples.slice(1).map((sample, i) => (sample.timestamp - samples[i].timestamp) / 1000);
    if (intervals.every(delta => delta <= .1)) return samples;
    await page.evaluate(probe => { (window.invalidTimingWindows116ca ??= []).push(probe); },
      { keys, duration, attempt: attempt + 1, intervals });
    if (attempt === 2) return samples; // Existing assertions still fail this window.
  }
}
function motion(samples, { speed = 320, zoom = 1, rotation = 0, horizontal = 0, vertical = 1, height = 800 } = {}) {
  assert.ok(samples.length >= 6, `only ${samples.length} real animation samples`);
  const first = samples[0], last = samples.at(-1), seconds = (last.timestamp - first.timestamp) / 1000;
  const pxPerUnit = height / 1000 * zoom, dx = (last.x - first.x) * pxPerUnit, dy = (last.y - first.y) * pxPerUnit;
  const distance = Math.hypot(dx, dy), rate = distance / seconds;
  close(rate, speed, .08, 'CSS pixels per visible second');
  const angle = rotation * Math.PI / 180, norm = Math.hypot(horizontal, vertical);
  close(dx / distance, (horizontal * Math.cos(angle) - vertical * Math.sin(angle)) / norm, .002, 'view-relative X');
  close(dy / distance, (horizontal * Math.sin(angle) + vertical * Math.cos(angle)) / norm, .002, 'view-relative Y');
  assert.ok(new Set(samples.map(s => `${s.x},${s.y}`)).size >= 6, 'held key did not move smoothly over separate RAFs');
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].timestamp - samples[i - 1].timestamp) / 1000;
    assert.ok(dt <= .1, `native frame discontinuity ${dt}s invalidates speed probe`);
    close(Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y) * pxPerUnit / dt, speed, .12, 'per-frame movement');
  }
  return { frames: samples.length, seconds, cssPixelsPerSecond: rate, dx, dy };
}

async function workspaceChecks(page) {
  assert.equal(await page.locator('#scenePanel #cameraSection').count(), 0);
  assert.equal(await page.locator('#cameraPanel #cameraSection').count(), 1);
  assert.deepEqual(await page.evaluate(() => { const seen = new Set(), duplicates = []; for (const e of document.querySelectorAll('[id]')) { if (seen.has(e.id)) duplicates.push(e.id); seen.add(e.id); } return duplicates; }), []);
  await page.locator('#btnOpenCamera').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#cameraPanel').isVisible(), true);
  assert.equal(await page.locator('#btnHideCamera').evaluate(e => e === document.activeElement), true);
  await page.locator('#btnToggleWorkspaceLauncher').click();
  assert.equal(await page.locator('#btnOpenCamera').isVisible(), false);
  await page.locator('#btnHideCamera').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#cameraPanel').isVisible(), false);
  assert.equal(await page.locator('#btnOpenCamera').evaluate(e => e === document.activeElement), true);
  assert.equal(await page.locator('#workspaceLauncher').getAttribute('data-collapsed'), 'false');
  await page.keyboard.press('Enter');
  await page.locator('#numCameraX').focus(); assert.equal(await page.locator('#cameraPanel').evaluate(e => e.classList.contains('panel-front')), true);
  await page.locator('#chkCameraInteraction').check();
  await page.locator('#btnFocusCameraCanvas').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#c').evaluate(e => e === document.activeElement), true);
  const visible = await page.evaluate(() => [...document.querySelectorAll('.panel')].filter(e => getComputedStyle(e).display !== 'none' && !e.hidden).map(e => e.id).sort());
  await page.keyboard.press('h'); assert.equal(await page.locator('#cameraPanel').isVisible(), false);
  assert.equal(await page.locator('#c').getAttribute('data-camera-interaction'), 'true');
  await page.keyboard.press('h');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.panel')].filter(e => getComputedStyle(e).display !== 'none' && !e.hidden).map(e => e.id).sort()), visible);
  // Closing the operational panel preserves both runtime mode and held controls.
  await reset(page); await page.evaluate(() => document.querySelector('#btnHideCamera').click());
  await page.locator('#c').focus(); await page.keyboard.down('w'); await frames(page, 260); await page.keyboard.up('w'); await openCamera(page);
  assert.ok((await camera(page)).y > 0); assert.equal(await page.locator('#chkCameraInteraction').isChecked(), true);
  return { independentPanel: true, noDuplicateIds: true, nativeLauncherFocusAndCollapseRecovery: true, frontStacking: true, hideRestoreSnapshot: visible, hiddenPanelModeAndMovement: true };
}

async function ownershipChecks(page) {
  await reset(page); await page.locator('#chkCameraInteraction').uncheck(); await hold(page, ['w', 'q']); assert.deepEqual(await camera(page), { x: 0, y: 0, zoom: 1, rotationRad: 0 });
  await page.locator('#chkCameraInteraction').check();
  for (const cancellation of ['keyup', 'input-focus', 'window-blur', 'document-hide', 'escape', 'mode-exit']) {
    await reset(page); await page.locator('#c').focus(); await page.keyboard.down('w'); await frames(page, 150);
    if (cancellation === 'keyup') await page.keyboard.up('w');
    else if (cancellation === 'input-focus') await page.locator('#numCameraPanSpeed').focus();
    else if (cancellation === 'window-blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    else if (cancellation === 'document-hide') await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    else if (cancellation === 'escape') await page.keyboard.press('Escape');
    else await page.evaluate(() => document.querySelector('#chkCameraInteraction').click());
    await frames(page, 60); const stopped = await camera(page); await frames(page, 180); assert.deepEqual(await camera(page), stopped, cancellation); await page.keyboard.up('w');
    if (!await page.locator('#chkCameraInteraction').isChecked()) await page.locator('#chkCameraInteraction').check();
    await page.locator('#c').focus(); const refocused = await camera(page); await frames(page, 100); assert.deepEqual(await camera(page), refocused, `${cancellation} resumed stale key on refocus`);
  }
  await reset(page); await page.locator('#numCameraX').focus(); await page.locator('#numCameraX').fill('123.456');
  // Wheel changes the live camera without moving text-entry focus.
  await page.mouse.move(100, 120); await page.mouse.wheel(0, -120); await frames(page, 150);
  assert.equal(await page.locator('#numCameraX').inputValue(), '123.456');
  assert.equal(await page.locator('#numCameraX').evaluate(e => e === document.activeElement), true);
  await page.keyboard.press('Tab');
  await reset(page); await page.locator('#c').focus(); await page.keyboard.press('ArrowRight'); close((await camera(page)).x, 50);
  await page.keyboard.press('+'); close((await camera(page)).zoom, 1.1); await page.keyboard.press('['); assert.ok((await camera(page)).rotationRad > 6);
  await page.keyboard.press('Home'); assert.deepEqual(await camera(page), { x: 0, y: 0, zoom: 1, rotationRad: 0 });
  await page.keyboard.press('Space'); const paused = await page.evaluate(() => source116ca?.state.time.simPaused).catch(() => null);
  const pausedMotion = motion(await hold(page, ['w'])); await page.keyboard.press('Space');
  await page.keyboard.press('r'); assert.ok((await camera(page)).y > 0);
  return { optInCanvasOwnership: true, cancellation: ['keyup', 'input-focus', 'window-blur', 'document-hide', 'escape', 'mode-exit'], draftsStable: true, legacyCameraKeys: true, globalSpaceAndResetPreserved: true, visuallyPaused: paused, pausedMotion };
}

async function sourceChecks(page) {
  await page.evaluate(async () => {
    const { state, setCamera } = await import('/src/js/core/state.js');
    const { preferences, resolveSettings } = await import('/src/js/core/preferences.js');
    const { initOrbs } = await import('/src/js/render/orb-runtime.js');
    const { UI } = await import('/src/js/ui/ui.js');
    window.source116ca = { state, setCamera, preferences, resolveSettings, initOrbs, UI, defaults: structuredClone(preferences.orbs) };
  });
  // Camera observation must never advance or re-own simulation data.
  const invariants = await page.evaluate(() => {
    const t = source116ca; t.preferences.orbs.forEach(o => o.particles.ttlSec = 1000); t.resolveSettings(); t.initOrbs(); t.state.time.simPaused = true;
    t.state.orbs.forEach(o => o.trail.emitAt(123, -456, performance.now() / 1000, { r: .2, g: .3, b: .4 }));
    t.saved = { world: t.state.world, orbs: [...t.state.orbs], particles: t.state.orbs.map(o => [...o.trail.particles]), phases: t.state.orbs.map(o => o.angleRad), positions: t.state.orbs.map(o => [...o.trail.particles].map(p => ({ x: p.xSim, y: p.ySim }))) };
    return t.state.orbs.length;
  });
  await reset(page); await hold(page, ['w', 'q']);
  await page.evaluate(() => {
    const t = source116ca, s = t.saved;
    const result = { world: t.state.world === s.world, orbs: t.state.orbs.map((o, i) => ({ identity: o === s.orbs[i], phase: o.angleRad === s.phases[i], count: o.trail.particles.length === s.particles[i].length, particles: [...o.trail.particles].every((p, j) => p === s.particles[i][j] && p.xSim === s.positions[i][j]?.x && p.ySim === s.positions[i][j]?.y) })) }; if (!result.world || result.orbs.some(o => Object.values(o).some(v => !v))) throw Error('camera altered paused simulation: ' + JSON.stringify(result));
  });
  await page.locator('#numCameraX').focus(); await page.locator('#numCameraX').fill('456.789');
  await page.evaluate(() => source116ca.setCamera({ x: -1234, y: 9876 })); await frames(page);
  assert.equal(await page.locator('#numCameraX').inputValue(), '456.789'); await page.keyboard.press('Tab'); close((await camera(page)).x, 456.789);
  const populations = [];
  for (const count of [0, 1, 2]) {
    await page.evaluate(count => { const t = source116ca; t.preferences.orbs = structuredClone(t.defaults.slice(0, count)); t.resolveSettings(); t.initOrbs(); t.state.time.simPaused = true; }, count);
    await reset(page); populations.push({ count, ...motion(await hold(page, ['w'])) });
  }
  await page.evaluate(() => { const t = source116ca; t.preferences.orbs = structuredClone(t.defaults); t.resolveSettings(); t.initOrbs(); t.state.time.simPaused = false; });
  return { pausedSimulationObjectsAndPhasePreserved: invariants, liveDraftStable: true, populations };
}

async function refreshWorkChecks(page) {
  const outcomes = [];
  for (const hidden of [false, true]) {
    await reset(page); await page.locator('#c').focus();
    if (hidden) await page.evaluate(() => document.querySelector('#btnHideCamera').click());
    await frames(page, 120);
    await page.evaluate(() => {
      const panel = document.querySelector('#cameraPanel'), descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      const counts = { titleWrites: 0, elementChanges: 0, textChanges: 0, inputValueWrites: 0 };
      const observer = new MutationObserver(records => { for (const r of records) {
        if (r.type === 'attributes' && r.attributeName === 'title') counts.titleWrites++;
        if (r.type === 'childList') { counts.elementChanges += [...r.addedNodes, ...r.removedNodes].filter(n => n.nodeType === 1).length; counts.textChanges++; }
      } });
      observer.observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
      Object.defineProperty(HTMLInputElement.prototype, 'value', { ...descriptor, set(value) { if (panel.contains(this)) counts.inputValueWrites++; descriptor.set.call(this, value); } });
      window.refreshProbe116ca = { counts, observer, descriptor };
    });
    await page.keyboard.down('w'); await frames(page, 300); await page.keyboard.up('w');
    const counts = await page.evaluate(() => { const p = refreshProbe116ca; p.observer.disconnect(); Object.defineProperty(HTMLInputElement.prototype, 'value', p.descriptor); return p.counts; });
    assert.equal(counts.titleWrites, 0, 'held motion rebuilt tooltips'); assert.equal(counts.elementChanges, 0, 'held motion rebuilt controls');
    if (hidden) { assert.equal(counts.textChanges, 0, 'hidden camera refreshed text'); assert.equal(counts.inputValueWrites, 0, 'hidden camera refreshed inputs'); }
    outcomes.push({ hidden, ...counts }); await openCamera(page);
  }
  return outcomes;
}

async function playbackAndRecording(page) {
  const encoded = wav().toString('base64');
  for (const enabled of [false, true]) {
    await page.locator('#chkCameraInteraction').setChecked(enabled);
    await page.evaluate(({ encoded, enabled }) => { const dataTransfer = new DataTransfer(); dataTransfer.items.add(new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], `116ca-${enabled}.wav`, { type: 'audio/wav' })); const c = document.querySelector('#c'); c.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer })); c.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer })); }, { encoded, enabled });
    await page.waitForFunction(() => native116ca.media && !native116ca.media.paused);
  }
  await page.waitForFunction(() => native116ca.media.currentTime > .1);
  await reset(page); const playing = motion(await hold(page, ['w']));
  await page.locator('#btnPlay').click(); await reset(page); const audioPaused = motion(await hold(page, ['w']));
  await page.evaluate(() => native116ca.media.currentTime = 2); await page.locator('#c').focus(); await page.keyboard.press('ArrowRight'); close(await page.evaluate(() => native116ca.media.currentTime), 2);
  await page.locator('#chkCameraInteraction').uncheck(); await page.locator('#c').focus(); await page.keyboard.press('ArrowRight'); close(await page.evaluate(() => native116ca.media.currentTime), 7);
  const scrubber = await page.locator('#scrubberCanvas').boundingBox(); await page.mouse.click(scrubber.x + scrubber.width * .4, scrubber.y + scrubber.height / 2); assert.ok(Math.abs(await page.evaluate(() => native116ca.media.currentTime) - 12) < .2);
  await page.locator('#rngVol').focus(); await page.keyboard.press('ArrowLeft'); assert.ok(Math.abs(await page.evaluate(() => native116ca.media.currentTime) - 12) < .2);
  await page.locator('#chkCameraInteraction').check(); await page.locator('#btnPlay').click();
  await page.locator('#c').focus(); await page.keyboard.press('n'); await page.waitForFunction(() => document.querySelector('#btnNext').disabled); await page.keyboard.press('p'); await page.waitForFunction(() => document.querySelector('#btnPrev').disabled);
  await page.locator('#btnStop').click(); await reset(page); const stopped = motion(await hold(page, ['w']));
  await page.locator('#btnPlay').click();
  await page.locator('#btnOpenRecord').click(); await page.locator('#chkRecordIncludeAudio').uncheck(); await page.locator('#btnRecordStart').click(); await page.waitForFunction(() => !document.querySelector('#btnRecordStop').disabled);
  const duringCapture = motion(await hold(page, ['w'], 650));
  await page.locator('#btnRecordStop').click(); await page.waitForFunction(() => !document.querySelector('#btnRecordDownloadLast').disabled);
  const capture = await page.evaluate(async () => {
    const observed = native116ca, canvas = document.querySelector('#c'), blob = observed.blobs.at(-1);
    if (!blob?.object.size || !observed.canvases.length || observed.canvases.some(c => c !== canvas)) throw Error('capture is not canonical viewport');
    const video = document.createElement('video'); video.muted = true;
    const metadata = new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; }); video.src = blob.url; await metadata;
    const result = { bytes: blob.object.size, mime: blob.object.type, width: video.videoWidth, height: video.videoHeight, canvasWidth: canvas.width, canvasHeight: canvas.height, canonicalViewport: true };
    video.removeAttribute('src'); video.load(); return result;
  });
  assert.equal(capture.width, capture.canvasWidth); assert.equal(capture.height, capture.canvasHeight);
  await page.locator('#btnHideRecord').click(); await page.locator('#btnStop').click();
  // Copy Link remains Settings-owned; it includes only the authored camera.
  await page.evaluate(() => document.querySelector('#btnShare').click());
  const payload = await page.evaluate(() => JSON.parse(atob(location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/'))));
  assert.equal(payload.schema, 12); assert.equal('camera' in payload.prefs, false); assert.deepEqual(payload.prefs.sceneCamera, { x: 0, y: 0, zoom: 1, rotationRad: 0 }); assert.doesNotMatch(JSON.stringify(payload), /panSpeed|shiftMultiplier/);
  return { dropsModeOffAndOn: true, playing, audioPaused, stopped, seekingAndScrubberPriority: true, nextPrevious: true, duringCapture, capture, runtimeExcludedFromSchema12: true };
}

async function layoutChecks(page) {
  const layouts = [];
  for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height }); await frames(page); await openCamera(page);
    const layout = await page.locator('#cameraPanel').evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, viewportWidth: innerWidth, viewportHeight: innerHeight, overflow: getComputedStyle(e).overflowY }; });
    assert.ok(layout.x >= 0 && layout.x + layout.width <= width + 1, `camera overflows width ${JSON.stringify(layout)}`);
    assert.ok(layout.y >= 0 && layout.y + layout.height <= height + 1, `camera overflows height ${JSON.stringify(layout)}`);
    assert.ok(layout.scrollWidth <= layout.clientWidth + 1, 'camera has horizontal content overflow');
    const audio = await page.locator('#audioPanel').boundingBox();
    if (audio) assert.ok(layout.y + layout.height <= audio.y + 1, 'camera overlaps the Audio dock');
    await page.locator('#btnFocusCameraCanvas').scrollIntoViewIfNeeded(); await page.locator('#btnFocusCameraCanvas').focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('#c').evaluate(e => e === document.activeElement), true);
    layouts.push({ width, height, ...layout });
    if (height === 390) {
      await page.locator('#btnHideAudio').click(); await frames(page, 60);
      const expanded = await page.locator('#cameraPanel').evaluate(e => e.getBoundingClientRect().height);
      assert.ok(expanded > layout.height, 'hiding Audio did not free camera space');
      await page.locator('#btnOpenAudio').click(); await frames(page, 60);
    }
  }
  await page.setViewportSize({ width: 1000, height: 800 }); await frames(page);
  return layouts;
}

async function check(page, source) {
  await page.waitForFunction(() => document.querySelector('#c').width > 0);
  if (source) await page.evaluate(async () => { const { state } = await import('/src/js/core/state.js'); window.source116ca = { state }; });
  const workspace = await workspaceChecks(page), ownership = await ownershipChecks(page), moves = [];
  for (const rotation of [0, 90, 180, 37.5]) { await reset(page, { rotation }); moves.push({ rotation, ...motion(await hold(page, ['w']), { rotation }) }); }
  for (const [key, horizontal, vertical] of [['s', 0, -1], ['a', -1, 0]]) { await reset(page); moves.push({ key, ...motion(await hold(page, [key]), { horizontal, vertical }) }); }
  for (const zoom of [.01, 1, 100]) { await reset(page, { zoom }); moves.push({ zoom, ...motion(await hold(page, ['d']), { zoom, horizontal: 1, vertical: 0 }) }); }
  await reset(page); const diagonal = motion(await hold(page, ['w', 'd']), { horizontal: 1, vertical: 1 });
  await reset(page); const boost = motion(await hold(page, ['Shift', 'w']), { speed: 960 });
  await reset(page); const rotate = await hold(page, ['q']); close((rotate.at(-1).rotationRad - rotate[0].rotationRad) / ((rotate.at(-1).timestamp - rotate[0].timestamp) / 1000), Math.PI / 3, .08, 'Q rotation rate');
  await reset(page); const clockwise = await hold(page, ['e']); close((clockwise.at(-1).rotationRad - clockwise[0].rotationRad) / ((clockwise.at(-1).timestamp - clockwise[0].timestamp) / 1000), -Math.PI / 3, .08, 'E rotation rate');
  await reset(page); const combination = await hold(page, ['w', 'Shift', 'e']); assert.ok(Math.hypot(combination.at(-1).x - combination[0].x, combination.at(-1).y - combination[0].y) > 100); assert.ok(combination.at(-1).rotationRad < combination[0].rotationRad, 'E should rotate clockwise');
  await setField(page, 'numCameraPanSpeed', 160); await setField(page, 'numCameraRotationSpeed', 30); await reset(page); const customSpeed = motion(await hold(page, ['w']), { speed: 160 }); await reset(page); const customRotation = await hold(page, ['Shift', 'q']); close((customRotation.at(-1).rotationRad - customRotation[0].rotationRad) / ((customRotation.at(-1).timestamp - customRotation[0].timestamp) / 1000), Math.PI / 2, .08, 'custom rotation with Shift'); await setField(page, 'numCameraPanSpeed', 320); await setField(page, 'numCameraRotationSpeed', 60);
  const refreshWork = await refreshWorkChecks(page), sourceState = source ? await sourceChecks(page) : undefined;
  const playback = await playbackAndRecording(page), layouts = await layoutChecks(page);
  return { invalidTimingWindows: await page.evaluate(() => window.invalidTimingWindows116ca || []), workspace, ownership, moves, diagonal, boost, rotationFrames: rotate.length, combinedTranslationRotationShift: true, customSpeed, refreshWork, sourceState, playback, layouts };
}

(async () => {
  const server = http.createServer((req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (relative === 'favicon.ico') { res.writeHead(204); res.end(); return; }
    if (relative === 'source') { res.setHeader('Content-Type', 'text/html'); res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8').replaceAll('__AURALPRINT_VERSION__', version).replace(/<link[^>]+>/g, '').replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>').replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>')); return; }
    const file = path.resolve(root, relative); if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' })[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const report = { version, editions: [], errors: [], failedResponses: [], limitations: ['Linux Chromium over local HTTP, no file://, Firefox, WebKit or physical device validation.', 'Held keys and elapsed movement use native keyboard events and real animation frames; focus/blur and document-hidden cancellation additionally use dispatched lifecycle signals.', 'Short RecorderEngine exports validate canonical viewport dimensions, not audio fidelity or long-duration capture.'] };
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_EXECUTABLE || process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }); report.browser = await browser.version();
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const dpr of [1, 2]) for (const edition of ['source', 'portable', 'hosted']) {
      console.error(`116C.A: ${edition}, DPR ${dpr}`);
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: dpr }); page.setDefaultTimeout(15000); await observe(page);
      page.on('pageerror', error => report.errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); }); page.on('response', response => { if (response.status() >= 400) report.failedResponses.push(response.url()); });
      await page.route('**/*', route => route.request().url().startsWith(base) || route.request().url().startsWith('blob:') ? route.continue() : route.abort());
      try { await page.goto(base + (edition === 'source' ? '/source' : edition === 'portable' ? `/dist/auralprint_${version.slice(1)}.html` : '/dist/hosted/index.html')); report.editions.push({ edition, dpr, ...await check(page, edition === 'source') }); }
      catch (error) { throw Error(`${edition} DPR ${dpr}: ${error.message}`, { cause: error }); }
      finally { await page.close(); }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResponses, []); console.log(JSON.stringify(report, null, 2));
  } finally { if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report, null, 2) + '\n'); if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
