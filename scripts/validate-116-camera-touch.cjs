// Focused native Pointer Events gate. Build first; AP_REPORT retains evidence.
// Test-only exports observe the existing source/built instances; production files
// and listeners are unchanged. CDP input is trusted; selective cancel/blur is injected.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const exportsCode = 'window.touchTest = { state, preferences, UI, Spaces, AudioEngine, Queue, RecorderEngine };';
const sourceExports = `<script type="module">
import { state } from '/src/js/core/state.js'; import { preferences } from '/src/js/core/preferences.js';
import { UI } from '/src/js/ui/ui.js'; import { Spaces } from '/src/js/core/spaces.js';
import { AudioEngine } from '/src/js/audio/audio-engine.js'; import { Queue } from '/src/js/audio/queue.js';
import { RecorderEngine } from '/src/js/recording/recorder-engine.js'; ${exportsCode}</script>`;
const report = { version, browser: '', editions: [], errors: [], failedResponses: [],
  limitations: ['Linux Chromium over local HTTP, DPR/CSS/touch emulation; no physical iOS Safari or Android acceptance.',
    'Simulation is paused and particle age is frozen for retained-history identity/value comparisons.',
    'Selective pointercancel, visibility and blur signals are injected into trusted captured gestures.',
    'Historical recording validators cover encoded viewport capture; this gate observes actual renderer arcs and live Camera controls.'] };
const near = (a, b, label = '') => assert.ok(Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b)), `${label}: ${a} != ${b}`);
const pointNear = (a, b) => { near(a.x, b.x, 'anchor X'); near(a.y, b.y, 'anchor Y'); };
const poseNear = (a, b) => { for (const key of ['x', 'y', 'zoom', 'rotationRad']) near(a[key], b[key], key); };
const point = (id, x, y) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 });
const middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function read(page) {
  await frames(page);
  return page.evaluate(() => {
    const camera = { ...touchTest.state.camera };
    const controls = { x: Number(document.querySelector('#numCameraX').value), y: Number(document.querySelector('#numCameraY').value),
      zoom: Number(document.querySelector('#numCameraZoom').value), rotationRad: Number(document.querySelector('#numCameraRotation').value) * Math.PI / 180 };
    return { camera, controls };
  }).then(({ camera, controls }) => { poseNear(controls, camera); return camera; });
}
async function worldAt(page, p) {
  return page.evaluate(p => {
    const { state, Spaces } = touchTest, c = state.canvas, r = c.getBoundingClientRect();
    return Spaces.screenToSim((p.x - r.left) * c.width / r.width, (p.y - r.top) * c.height / r.height);
  }, p);
}
async function edit(page, field, value) {
  await page.locator('#numCamera' + field).fill(String(value)); await page.locator('#numCamera' + field).press('Tab');
}
const server = http.createServer((req, res) => {
  try {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (pathname === '/source') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8').replaceAll('__AURALPRINT_VERSION__', version)
        .replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>')
        .replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>' + sourceExports));
    }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) throw Error('path');
    let bytes = fs.readFileSync(file);
    if (file.endsWith('.html')) {
      const html = bytes.toString(), end = html.lastIndexOf('\n})();');
      assert.ok(end > 0, 'built IIFE boundary'); bytes = html.slice(0, end) + '\n' + exportsCode + html.slice(end);
    }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
async function run(page, cdp, url, edition, dpr) {
  await page.goto(url); await page.waitForFunction(() => window.touchTest && document.querySelector('#numCameraX').value !== '');
  await page.locator('#btnOpenCamera').click();
  await page.evaluate(() => {
    const t = touchTest; t.state.time.simPaused = true;
    const fixedNow = performance.now(); performance.now = () => fixedNow;
    // Nonuniform CSS scaling deliberately differs from client/backing dimensions.
    t.state.canvas.style.cssText = 'position:fixed;inset:auto;left:40px;top:30px;width:720px;height:440px;transform:scale(.8,.7);transform-origin:top left';
    window.touchEvents = []; window.touchArcs = []; window.touchCaptureRequests = [];
    const capture = t.state.canvas.setPointerCapture.bind(t.state.canvas);
    t.state.canvas.setPointerCapture = id => { touchCaptureRequests.push(id); return capture(id); };
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      if (this.canvas === t.state.canvas) { touchArcs.push(args.slice(0, 2)); if (touchArcs.length > 2000) touchArcs.splice(0, 1000); }
      return arc.apply(this, args);
    };
    for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
      t.state.canvas.addEventListener(name, e => touchEvents.push({ name, id: e.pointerId, type: e.pointerType,
        primary: e.isPrimary, trusted: e.isTrusted, prevented: e.defaultPrevented, x: e.clientX, y: e.clientY }));
    }
    window.touchSnapshot = () => ({ prefs: structuredClone(t.preferences), world: { ...t.state.world },
      orbs: t.state.orbs.map(o => ({ id: o.id, x: o.xSim, y: o.ySim, angle: o.angleRad, fraction: o.trail.emitAccumulator,
        particles: [...o.trail.particles].map(p => ({ ...p })) })), ring: t.state.bands.ringPhaseRad,
      audio: { ...t.state.audio }, source: structuredClone(t.state.source), queue: t.Queue.snapshot(), recording: { ...t.state.recording } });
  });
  await frames(page); await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const dispatch = async (type, points) => { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points }); await frames(page); };
  let A = point(11, 210, 150), B = point(22, 370, 170);
  const modeOff = await read(page);
  await dispatch('touchStart', [A]); await dispatch('touchMove', [point(11, 230, 165)]); await dispatch('touchEnd', []);
  await dispatch('touchStart', [A]); await dispatch('touchStart', [A, B]); await dispatch('touchEnd', []);
  poseNear(await read(page), modeOff);
  assert.equal(await page.evaluate(() => touchEvents.some(e => e.prevented)), false);
  await cdp.send('Emulation.resetPageScaleFactor');
  await page.locator('#chkCameraInteraction').press('Space');
  await edit(page, 'X', 123.25); await edit(page, 'Y', -321.5); await edit(page, 'Zoom', 1.7); await edit(page, 'Rotation', 37.5);
  await page.evaluate(() => { touchEvents.length = 0; });
  // A single touch anchors the existing inverse pan.
  const oneAnchor = await worldAt(page, A);
  await dispatch('touchStart', [A]); A = point(11, 230, 165); await dispatch('touchMove', [A]);
  pointNear(await worldAt(page, A), oneAnchor);
  const beforeAddition = await read(page);
  await dispatch('touchStart', [A, B]); poseNear(await read(page), beforeAddition);
  const starts = await page.evaluate(() => touchEvents.filter(e => e.name === 'pointerdown'));
  assert.equal(starts.length, 2); assert.equal(starts[0].primary, true); assert.equal(starts[1].primary, false);
  assert.ok(starts.every(e => e.trusted && e.prevented));
  const ownedIds = starts.map(e => e.id);
  assert.deepEqual(await page.evaluate(ids => ids.map(id => touchTest.state.canvas.hasPointerCapture(id)), ownedIds), [true, true]);
  const anchor = await worldAt(page, middle(A, B)), anchorA = await worldAt(page, A), anchorB = await worldAt(page, B);
  await page.evaluate(p => {
    const t = touchTest, world = t.Spaces.screenToSim(p.x, p.y);
    t.marker = world; t.state.orbs[0].trail.emitAt(world.x, world.y, performance.now() / 1000, { r: 1, g: .1, b: .2 });
    t.identities = { world: t.state.world, orbs: [...t.state.orbs], particles: t.state.orbs.map(o => [...o.trail.particles]) };
  }, await page.evaluate(p => {
    const c = touchTest.state.canvas, r = c.getBoundingClientRect(); return { x: (p.x - r.left) * c.width / r.width, y: (p.y - r.top) * c.height / r.height };
  }, A));
  const protectedBefore = await page.evaluate(() => touchSnapshot());
  A = point(11, 190, 170); B = point(22, 420, 260);
  await dispatch('touchMove', [A, B]);
  const combined = await read(page); assert.ok(combined.zoom > beforeAddition.zoom); assert.ok(combined.rotationRad > beforeAddition.rotationRad);
  pointNear(await worldAt(page, middle(A, B)), anchor); pointNear(await worldAt(page, A), anchorA); pointNear(await worldAt(page, B), anchorB);
  // A real Renderer arc follows the seeded world particle after manipulation.
  const drawn = await page.evaluate(() => {
    const p = touchTest.Spaces.simToScreen(touchTest.marker.x, touchTest.marker.y);
    return { expected: p, closest: Math.min(...touchArcs.slice(-100).map(a => Math.hypot(a[0] - p.x, a[1] - p.y))) };
  });
  near(drawn.closest, 0, 'renderer particle follows camera');
  const third = point(33, 510, 200);
  await dispatch('touchStart', [A, B, third]); await dispatch('touchMove', [A, B, point(33, 540, 250)]);
  poseNear(await read(page), combined);
  const thirdEvent = await page.evaluate(() => touchEvents.filter(e => e.name === 'pointerdown').at(-1));
  assert.equal(thirdEvent.prevented, false);
  // Direct touch has browser-owned implicit capture; check explicit application
  // acquisition rather than treating that native capture as Camera ownership.
  assert.equal(await page.evaluate(id => touchCaptureRequests.includes(id), thirdEvent.id), false);
  await dispatch('touchEnd', [point(33, 540, 250)]); poseNear(await read(page), combined);
  await dispatch('touchEnd', [A]); poseNear(await read(page), combined);
  const survivorAnchor = await worldAt(page, B); B = point(22, 440, 275); await dispatch('touchMove', [B]);
  pointNear(await worldAt(page, B), survivorAnchor); await dispatch('touchEnd', []);
  // Opposite removal order, selective cancellation, real lost capture and focus/control cancellation.
  const lifecycle = [];
  for (const ending of ['second-up', 'first-cancel', 'second-cancel', 'lost-first', 'lost-second', 'blur', 'hidden', 'mode', 'reset', 'fit', 'restore', 'key']) {
    A = point(11, 210, 150); B = point(22, 370, 170);
    await page.evaluate(() => { touchEvents.length = 0; });
    await dispatch('touchStart', [A]); await dispatch('touchStart', [A, B]);
    const ids = await page.evaluate(() => touchEvents.filter(e => e.name === 'pointerdown').map(e => e.id));
    const before = await read(page);
    if (ending === 'second-up') await dispatch('touchEnd', [B]);
    else await page.evaluate(({ ending, ids }) => {
      const c = touchTest.state.canvas;
      if (ending.endsWith('cancel')) c.dispatchEvent(new PointerEvent('pointercancel', { pointerId: ids[ending.startsWith('first') ? 0 : 1] }));
      else if (ending.startsWith('lost')) c.releasePointerCapture(ids[ending === 'lost-first' ? 0 : 1]);
      else if (ending === 'blur') window.dispatchEvent(new Event('blur'));
      else if (ending === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden;
      } else if (ending === 'mode') { document.querySelector('#chkCameraInteraction').click(); document.querySelector('#chkCameraInteraction').click(); }
      else if (ending === 'key') c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      else document.querySelector({ reset: '#btnResetCamera', fit: '#btnFitCamera', restore: '#btnRestoreSceneView' }[ending]).click();
    }, { ending, ids });
    const survivor = ending === 'second-up' || ending === 'second-cancel' || ending === 'lost-second' ? A : B;
    const single = ['second-up', 'first-cancel', 'second-cancel', 'lost-first', 'lost-second'].includes(ending);
    const stopped = await read(page); if (single) poseNear(stopped, before);
    const world = await worldAt(page, survivor), moved = point(survivor.id, survivor.x + 25, survivor.y + 15);
    await dispatch('touchMove', single ? [moved] : [point(11, 240, 175), point(22, 410, 220)]);
    if (single) pointNear(await worldAt(page, moved), world); else poseNear(await read(page), stopped);
    await dispatch('touchEnd', []); lifecycle.push(ending);
  }
  assert.deepEqual(await page.evaluate(() => touchSnapshot()), protectedBefore);
  assert.equal(await page.evaluate(() => {
    const t = touchTest, i = t.identities;
    return t.state.world === i.world && t.state.orbs.every((o, j) => o === i.orbs[j]
      && [...o.trail.particles].every((p, k) => p === i.particles[j][k]));
  }), true);
  // Native pinch boundaries and angle wrap with an off-center midpoint.
  const boundaries = [];
  for (const [zoom, endX, expected] of [[90, 550, 100], [.011, 215, .01]]) {
    await edit(page, 'Zoom', zoom); await edit(page, 'Rotation', 0);
    A = point(11, 210, 150); B = point(22, 370, 150);
    await dispatch('touchStart', [A]); await dispatch('touchStart', [A, B]);
    const anchor = await worldAt(page, middle(A, B)); B = point(22, endX, 150);
    await dispatch('touchMove', [A, B]); const pose = await read(page);
    near(pose.zoom, expected); pointNear(await worldAt(page, middle(A, B)), anchor); boundaries.push(pose.zoom);
    await dispatch('touchEnd', []);
  }
  await edit(page, 'Zoom', 1); await edit(page, 'Rotation', 359.5);
  A = point(11, 400, 170); B = point(22, 250, 172);
  await dispatch('touchStart', [A]); await dispatch('touchStart', [A, B]);
  const wrapAnchor = await worldAt(page, middle(A, B)); B = point(22, 250, 168);
  await dispatch('touchMove', [A, B]); const wrapped = await read(page);
  assert.ok(wrapped.rotationRad < .1); pointNear(await worldAt(page, middle(A, B)), wrapAnchor); await dispatch('touchCancel', []);
  // Native reinitialization retains one interaction listener.
  await page.evaluate(() => { touchTest.UI.wireControls(); touchTest.UI.wireControls(); });
  const { result: object } = await cdp.send('Runtime.evaluate', { expression: 'document.querySelector("#c")' });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: object.objectId });
  // One production listener plus this gate's one observational listener per pointer event.
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) {
    assert.equal(listeners.filter(l => l.type === type).length, 2, type);
  }
  return { edition, dpr, trustedNonprimarySecondContact: true, modeOffUnconsumed: true, oneFingerAnchor: true,
    combined, midpointAndEndpointAnchors: true, rendererParticle: drawn, thirdContactIgnored: true,
    lifecycle, boundaries, wrappedRotation: wrapped.rotationRad, protectedStateAndIdentities: true, stableListeners: true };
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    report.browser = browser.version();
    for (const dpr of [1, 2]) for (const [edition, route] of [['source', '/source'], ['portable', `/dist/auralprint_${version.slice(1)}.html`], ['hosted', '/dist/hosted/index.html']]) {
      console.error(`Camera touch: ${edition} DPR ${dpr}`);
      const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: dpr, hasTouch: true });
      page.setDefaultTimeout(10000);
      page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      page.on('response', r => { if (r.status() >= 400) report.failedResponses.push(r.url()); });
      const cdp = await page.context().newCDPSession(page);
      try { report.editions.push(await run(page, cdp, `http://127.0.0.1:${server.address().port}${route}`, edition, dpr)); }
      finally { await page.close(); }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResponses, []); report.passed = true;
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report, null, 2) + '\n');
    if (browser) await browser.close(); await new Promise(r => server.close(r));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
