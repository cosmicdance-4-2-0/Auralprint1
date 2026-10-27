// Optional 116F evidence: native controls in all editions, plus an isolated
// Canvas workload comparison. Seeded histories are test data, not app hooks.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const baseline = '33b696a94439d17e86ef26c04a416cbc430754d3';
const work = path.resolve(process.env.AP_116F_OUTPUT || path.join(root, 'work/116f'));
const hash = wire => '#p=' + Buffer.from(JSON.stringify(wire)).toString('base64url');
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function reveal(page, selector) {
  const control = page.locator(selector).first();
  await control.evaluate(el => {
    const panel = el.closest('.panel');
    if (panel && getComputedStyle(panel).display === 'none') {
      const name = panel.id === 'scenePanel' ? 'Scene' : panel.id === 'visualizersPanel' ? 'Visualizers' : panel.id === 'audioPanel' ? 'Audio' : 'Queue';
      document.getElementById('btnOpen' + name).click();
    }
    for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
  });
  await control.scrollIntoViewIfNeeded(); return control;
}
async function share(page) {
  await page.evaluate(() => { document.getElementById('sceneStatus').textContent = ''; document.getElementById('btnShare').click(); });
  await page.waitForFunction(() => /^Share link /.test(document.getElementById('sceneStatus').textContent));
  const { decodePrefsFromHash } = await import('../src/js/presets/url-preset.js');
  return decodePrefsFromHash(new URL(page.url()).hash);
}
async function apply(page, wire) {
  await page.evaluate(h => { history.replaceState(null, '', location.pathname + h); document.getElementById('btnApplyUrl').click(); }, hash(wire));
  await frames(page);
}
function wav() {
  const data = Buffer.alloc(44 + 48000 * 2 * 30);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(48000, 24); data.writeUInt32LE(96000, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  for (let i = 44; i < data.length; i += 2) data.writeInt16LE(Math.round(Math.sin(i * .03) * 1000), i);
  return data;
}
async function captureProbe(page) {
  await page.addInitScript(() => {
    const probe = window.capture116f = { mode: 'success', calls: 0, waiting: false };
    const capture = async () => {
      probe.calls++;
      if (probe.mode === 'denied') throw new DOMException('116F synthetic denial', 'NotAllowedError');
      if (probe.mode === 'delayed') { probe.waiting = true; await new Promise(resolve => { probe.release = resolve; }); probe.waiting = false; }
      const context = new AudioContext(), destination = context.createMediaStreamDestination(), oscillator = context.createOscillator();
      oscillator.frequency.value = 220; oscillator.connect(destination); oscillator.start();
      return destination.stream;
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: capture });
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: capture });
  });
}
async function queueControls(page, defaults, encode) {
  const option = structuredClone(defaults); option.audio.clearQueueOnSourceExit = true;
  await apply(page, encode(defaults));
  const count = () => page.locator('#queueList > .queue-item').count();
  const load = async () => {
    await (await reveal(page, '#btnSourceFile')).click();
    await page.locator('#btnLoad').click();
    await page.locator('#fileInput').setInputFiles(['a', 'b'].map(name => ({ name: '116f-' + name + '.wav', mimeType: 'audio/wav', buffer: wav() })));
    await page.waitForFunction(() => document.getElementById('btnPlay').textContent === 'Pause');
    await page.locator('#btnStop').click(); assert.equal(await count(), 2);
  };
  const source = async kind => {
    await (await reveal(page, '#btnSource' + kind)).click();
    if (kind !== 'File') await page.waitForFunction(kind => document.getElementById('btnSource' + kind).title.includes('Live input active'), kind);
    await frames(page);
  };
  await load(); await source('Mic'); assert.equal(await count(), 2, 'Default-off Mic deleted Queue');
  await source('File'); await source('Stream'); assert.equal(await count(), 2, 'Default-off Stream deleted Queue');
  await apply(page, encode(option)); assert.equal(await count(), 2, 'Preset import deleted Queue');
  await source('File'); assert.equal(await count(), 2, 'Returning File deleted Queue');
  await source('Mic'); assert.equal(await count(), 0, 'Successful File to Mic did not clear Queue');
  await load(); await source('Stream'); assert.equal(await count(), 0, 'Successful File to Stream did not clear Queue');
  await load(); await page.evaluate(() => { capture116f.mode = 'denied'; });
  await (await reveal(page, '#btnSourceMic')).click();
  await page.waitForFunction(() => document.getElementById('audioStatus').textContent.toLowerCase().includes('denied'));
  assert.equal(await count(), 2, 'Permission denial deleted Queue');
  await source('File'); await page.evaluate(() => { capture116f.mode = 'delayed'; capture116f.waiting = false; });
  await (await reveal(page, '#btnSourceMic')).click(); await page.waitForFunction(() => capture116f.waiting);
  assert.equal(await count(), 2, 'Pending permission deleted Queue');
  await source('File'); await page.evaluate(() => capture116f.release()); await frames(page);
  assert.equal(await count(), 2, 'Cancelled stale capture deleted Queue');
  await page.evaluate(() => { capture116f.mode = 'success'; });
  return { realFileObjects: true, defaultOffPreserves: true, syntheticMicAndStreamSuccess: true, importOnlyFutureBehavior: true, syntheticPermissionDenial: true, pendingAndCancelledActivation: true, qualification: 'Generated Web Audio MediaStreams replace native permission dialogs; actual AudioEngine attachment and UI source handlers execute.' };
}
async function controls(page, defaults, encode, edition) {
  assert.deepEqual(await share(page), defaults);
  assert.equal(await page.locator('#chkClearQueueOnSourceExit').isChecked(), false);
  assert.equal(await page.locator('input[id$="-fade-trace"]').first().isChecked(), false);
  if (edition === 'source') await page.evaluate(async () => {
    const { state } = await import('/src/js/core/state.js');
    for (let i = 0; i < 12; i++) state.orbs[0].trail.emitAt(i * 5, i * 3, performance.now() / 1000, { r: 1, g: .2, b: .3 });
  });
  const source = await reveal(page, '#chkClearQueueOnSourceExit');
  await source.focus(); await source.press('Space');
  assert.equal((await share(page)).audio.clearQueueOnSourceExit, true);
  const fade = await reveal(page, 'input[id$="-fade-trace"]');
  await fade.focus(); await fade.press('Space');
  let current = await share(page);
  assert.deepEqual(current.orbs.map(orb => orb.trace.fadeEnabled), [true, false]);
  if (edition === 'source') assert.equal(await page.evaluate(async () => {
    const { VisualizerRuntime } = await import('/src/js/render/visualizer-runtime.js');
    return VisualizerRuntime.getTraceRenderStats().requestedSegmentStrokes > 0;
  }), true, 'Individual UI toggle never enabled renderer work');
  assert.equal(await page.locator('#chkFadeTrace').evaluate(el => el.indeterminate), true);
  const length = await reveal(page, 'input[id$="-fade-segments"]');
  await length.focus(); await length.press('ArrowRight');
  current = await share(page); assert.equal(current.orbs[0].trace.fadeSegments, 6);
  assert.match(await length.getAttribute('aria-valuetext'), /6 segments/);
  assert.equal(await page.locator('#valFadeSegments').textContent(), 'mixed');
  await (await reveal(page, 'select[id$="-line-color"]')).selectOption('particleBirth');
  current = await share(page); assert.equal(current.orbs[0].trace.lineColorMode, 'particleBirth');
  assert.equal(await page.locator('#selLineColorMode').inputValue(), '');
  const bulk = await reveal(page, '#chkFadeTrace'); await bulk.focus(); await bulk.press('Space');
  const bulkLength = await reveal(page, '#rngFadeSegments'); await bulkLength.focus(); await bulkLength.press('Home');
  await (await reveal(page, '#selLineColorMode')).selectOption('particleBirth');
  current = await share(page);
  assert.ok(current.orbs.every(orb => orb.trace.fadeEnabled && orb.trace.fadeSegments === 1 && orb.trace.lineColorMode === 'particleBirth'));
  // Preserve focus and ID-owned editor roots when a shared preset reorders Orbs.
  await length.focus();
  await page.evaluate(() => { window.trace116fRoot = document.querySelector('input[id$="-fade-segments"]').closest('.orb-editor-card'); });
  const reordered = structuredClone(current); reordered.orbs.reverse();
  await apply(page, encode(reordered));
  assert.equal(await page.evaluate(() => window.trace116fRoot === document.querySelectorAll('.orb-editor-card')[1]), true);
  assert.equal(await page.evaluate(() => window.trace116fRoot.querySelector('input[id$="-fade-segments"]') === document.activeElement), true);
  assert.deepEqual(await share(page), reordered);
  const diagnostics = await reveal(page, '#btnTraceRenderDiagnostics'); await diagnostics.focus(); await diagnostics.press('Enter');
  const diagnosticsText = await page.locator('#traceRenderDiagnostics').textContent();
  assert.match(diagnosticsText, /Last completed frame: .*color\/fade strokes drawn; .*requested; limit .*Orbs simplified/);
  // Unchanged frame refreshes must not mutate these controls or their readouts.
  await frames(page);
  const mutations = await page.evaluate(async () => {
    let count = 0; const observer = new MutationObserver(records => { count += records.length; });
    for (const el of document.querySelectorAll('[id$="-fade-trace"],[id$="-fade-segments"],#chkFadeTrace,#rngFadeSegments,#chkClearQueueOnSourceExit')) observer.observe(el.parentElement, { subtree: true, attributes: true, characterData: true, childList: true });
    observer.observe(document.getElementById('traceRenderDiagnostics'), { subtree: true, attributes: true, characterData: true, childList: true });
    for (let i = 0; i < 12; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    observer.disconnect(); return count;
  });
  assert.equal(mutations, 0, 'Unchanged frames mutated new controls');
  assert.equal(await page.locator('#traceRenderDiagnostics').textContent(), diagnosticsText);
  await apply(page, encode({ ...structuredClone(defaults), orbs: [] }));
  for (const selector of ['#chkFadeTrace', '#rngFadeSegments', '#selLineColorMode']) assert.equal(await page.locator(selector).isDisabled(), true);
  await apply(page, encode(current));
  assert.equal(await source.isChecked(), true);
  await page.evaluate(() => document.getElementById('btnResetPrefs').click()); await frames(page);
  assert.deepEqual(await share(page), defaults);
  assert.equal(await source.isChecked(), false);
  await apply(page, { schema: 13, prefs: { audio: { volume: .7 }, orbs: [{ id: 'legacy', trace: { lineColorMode: 'fixed' } }] } });
  const legacy = await share(page);
  assert.equal(legacy.audio.clearQueueOnSourceExit, false);
  assert.equal(legacy.orbs[0].trace.fadeEnabled, false); assert.equal(legacy.orbs[0].trace.fadeSegments, 5);
  assert.equal(legacy.orbs[0].trace.lineColorMode, 'fixed');
  return { keyboard: true, individualAndBulk: true, mixed: true, stableIdentityAndFocus: true, requestedDiagnosticsSnapshot: true, zeroOrbs: true, reset: true, legacyImport: true, unchangedFrameDomMutations: mutations };
}

async function canvasEvidence(page) {
  await page.goto(new URL('/probe', page.url()).href);
  return page.evaluate(async skipMeasurements => {
    const { CONFIG } = await import('/src/js/core/config.js');
    const { runtime, resolveSettings, preferences } = await import('/src/js/core/preferences.js');
    const { state } = await import('/src/js/core/state.js');
    const { Orb } = await import('/src/js/render/orb.js');
    const { Renderer } = await import('/src/js/render/renderer.js');
    const { Renderer: BaselineRenderer } = await import('/baseline-renderer.js');
    const { createVisualizerRuntime } = await import('/src/js/render/visualizer-runtime.js');
    const { createVisualizerRuntime: createBaselineRuntime } = await import('/baseline-runtime.js');
    const { createAnalysisFrame } = await import('/src/js/audio/analysis-frame.js');
    const { hsvToRgb01 } = await import('/src/js/core/utils.js');
    Object.assign(preferences, structuredClone(CONFIG.defaults)); resolveSettings();
    state.canvas = document.querySelector('canvas'); state.canvas.width = state.widthPx = 1000; state.canvas.height = state.heightPx = 800; state.dpr = 1;
    state.ctx = state.canvas.getContext('2d');
    runtime.settings.visuals.backgroundColor = '#24384d'; runtime.settings.visuals.particleColor = '#f5c16b';
    const nativeStroke = state.ctx.stroke.bind(state.ctx), nativeClip = state.ctx.clip.bind(state.ctx), nativeGradient = state.ctx.createLinearGradient.bind(state.ctx);
    let strokes = 0, clips = 0, gradients = 0;
    state.ctx.stroke = (...args) => { strokes++; return nativeStroke(...args); };
    state.ctx.clip = (...args) => { clips++; return nativeClip(...args); };
    state.ctx.createLinearGradient = (...args) => { gradients++; return nativeGradient(...args); };
    const frame = { nowSec: 1, analysisFrame: createAnalysisFrame() };
    const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(p * values.length))];
    const build = (count, lines, fade, birth, fadeSegments = 5, budget, factory = createVisualizerRuntime) => {
      const orbs = Array.from({ length: count }, (_, i) => {
        const def = structuredClone(CONFIG.defaults.orbs[i % 2]); def.id = 'evidence-' + i;
        Object.assign(def.trace, { lines: true, numLines: lines, lineAlpha: .85, lineWidthPx: 2, fadeEnabled: fade, fadeSegments, lineColorMode: birth ? 'particleBirth' : 'fixed' });
        Object.assign(def.particles, { sizeMaxPx: .5, sizeMinPx: .5, sizeToMinSec: 2, ttlSec: 600 });
        return new Orb(def);
      });
      const visualizers = factory(budget === undefined ? {} : { traceRenderingPolicy: { maxSegmentStrokesPerFrame: budget } }); visualizers.rebuild(orbs);
      for (let i = 0; i < count; i++) for (let j = 0; j <= lines; j++) {
        const t = j / lines, angle = t * Math.PI * 1.65 + i * .11, r = 160 + i * 13;
        orbs[i].trail.emitAt(Math.cos(angle) * r, Math.sin(angle) * r, 0, hsvToRgb01(t * 280, .85, 1));
      }
      return { orbs, visualizers };
    };
    const measure = async (scene, renderer, label, samples = 50) => {
      const times = [], intervals = [], counts = [], clipCounts = [], gradientCounts = []; let previous = null;
      for (let i = 0; i < 10; i++) scene.visualizers.render(renderer, frame);
      for (let i = 0; i < samples; i++) await new Promise(resolve => requestAnimationFrame(timestamp => {
        if (previous !== null) intervals.push(timestamp - previous); previous = timestamp;
        strokes = clips = gradients = 0; const start = performance.now(); scene.visualizers.render(renderer, frame); times.push(performance.now() - start); counts.push(strokes); clipCounts.push(clips); gradientCounts.push(gradients); resolve();
      }));
      return { label, strokeCalls: [Math.min(...counts), Math.max(...counts)], clipCalls: [Math.min(...clipCounts), Math.max(...clipCounts)], gradientCalls: [Math.min(...gradientCounts), Math.max(...gradientCounts)], canvasSubmitMedianMs: percentile(times, .5), canvasSubmitP95Ms: percentile(times, .95), rafMedianMs: percentile(intervals, .5), rafP95Ms: percentile(intervals, .95), retained: scene.orbs.reduce((sum, orb) => sum + orb.trail.particles.length, 0), diagnostics: scene.visualizers.getTraceRenderStats?.() || scene.visualizers.getRenderStats?.() || null };
    };
    const results = [];
    for (const [label, count, lines, fade, birth, fadeSegments] of skipMeasurements ? [] : [
      ['default-two-orb-settings', 2, 10, false, false], ['mature-default-two-orb-settings', 2, 10, false, false], ['sixteen-legacy', 16, 60, false, false],
      ['sixteen-fade-five', 16, 60, true, false], ['sixteen-birth', 16, 60, false, true],
      ['sixteen-combined', 16, 60, true, true], ['sixteen-limit-birth', 16, 1000, false, true],
      ['sixteen-limit-combined', 16, 1000, true, true, 1000], ['sixteen-limit-combined-fade-five', 16, 1000, true, true, 5],
    ]) {
      const scene = build(count, lines, fade, birth, fadeSegments);
      if (label.includes('default-two-orb-settings')) for (let i = 0; i < scene.orbs.length; i++) {
        scene.orbs[i].trace = structuredClone(CONFIG.defaults.orbs[i].trace);
        scene.orbs[i].particles = structuredClone(CONFIG.defaults.orbs[i].particles);
        if (label.startsWith('mature-')) {
          const orb = scene.orbs[i], count = Math.floor(orb.particles.emitPerSecond * orb.particles.ttlSec); orb.trail.reset();
          for (let j = 0; j < count; j++) {
            const t = j / (count - 1), angle = t * Math.PI * 1.65 + i * .11, radius = 160 + i * 13;
            orb.trail.emitAt(Math.cos(angle) * radius, Math.sin(angle) * radius, frame.nowSec - orb.particles.ttlSec * (1 - t) * .999, hsvToRgb01(t * 280, .85, 1));
          }
        }
      }
      if (!fade && !birth) {
        // Alternate accepted/current order to expose warm-up and temporal noise.
        for (const renderer of [BaselineRenderer, Renderer, Renderer, BaselineRenderer]) results.push(await measure(scene, renderer, label + (renderer === BaselineRenderer ? '/accepted-116e' : '/116f-default-off'), 35));
      } else results.push(await measure(scene, Renderer, label));
      scene.visualizers.dispose();
      for (const orb of scene.orbs) orb.trail.dispose();
    }
    for (const budget of skipMeasurements ? [] : [32, 5, 0]) {
      const scene = build(16, 60, true, true, 5, budget);
      const before = scene.orbs.map(orb => orb.trail.particles.length);
      const result = await measure(scene, Renderer, 'sixteen-combined-budget-' + budget, 35);
      if (result.diagnostics.segmentStrokes > budget) throw Error('Trace rendering exceeded injected budget');
      if (JSON.stringify(scene.orbs.map(orb => orb.trail.particles.length)) !== JSON.stringify(before)) throw Error('Rendering changed retained particles');
      results.push(result); scene.visualizers.dispose(); for (const orb of scene.orbs) orb.trail.dispose();
    }
    // Isolate JavaScript traversal/scheduling overhead from Canvas rasterization.
    // Unlike the real Canvas samples above, this also compares accepted runtime.
    const micro = [], realContext = state.ctx;
    const noop = () => {}; state.ctx = { save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fillRect: noop, arc: noop, fill: noop };
    try {
      for (const [count, lines] of skipMeasurements ? [] : [[2, 10], [16, 60]]) {
        const accepted = build(count, lines, false, false, 5, undefined, createBaselineRuntime), current = build(count, lines, false, false);
        for (const [scene, renderer] of [[accepted, BaselineRenderer], [current, Renderer]]) for (let i = 0; i < 200; i++) scene.visualizers.render(renderer, frame);
        const timings = { accepted116e: [], defaultOff116f: [] }, iterations = 500;
        for (let round = 0; round < 8; round++) for (const key of round % 2 ? ['defaultOff116f', 'accepted116e'] : ['accepted116e', 'defaultOff116f']) {
          const scene = key === 'accepted116e' ? accepted : current, renderer = key === 'accepted116e' ? BaselineRenderer : Renderer;
          const start = performance.now(); for (let i = 0; i < iterations; i++) scene.visualizers.render(renderer, frame);
          timings[key].push((performance.now() - start) / iterations);
        }
        micro.push({ count, lines, iterationsPerSample: iterations, samples: 8, acceptedMedianMs: percentile(timings.accepted116e, .5), defaultOffMedianMs: percentile(timings.defaultOff116f, .5), timings });
        for (const scene of [accepted, current]) { scene.visualizers.dispose(); for (const orb of scene.orbs) orb.trail.dispose(); }
      }
    } finally { state.ctx = realContext; }
    window.render116f = { build, Renderer, frame, state, runtime };
    return { results, javascriptMicrobenchmark: { qualification: 'No-op Canvas context isolates traversal and runtime scheduling; accepted renderer/runtime and current renderer/runtime use the same seeded geometry. This is not a rasterization or FPS measurement.', cases: micro }, policy: CONFIG.traceRendering || CONFIG.traceRenderWork || null, viewport: [1000, 800], dpr: 1, background: runtime.settings.visuals.backgroundColor, observation: 'Headless Linux Chromium; seeded stationary histories; CPU Canvas command-submission and rAF intervals include harness/environment noise. Not GPU completion or an FPS guarantee. Real Canvas accepted/current comparisons hold current VisualizerRuntime constant to isolate renderer changes.' };
  }, process.argv.includes('--seam-only'));
}

(async () => {
  fs.mkdirSync(work, { recursive: true });
  const { CONFIG } = await import('../src/js/core/config.js');
  const { encodePresetPayload } = await import('../src/js/presets/preset-codec.js');
  const acceptedSource = execFileSync('git', ['show', baseline + ':src/js/render/renderer.js'], { cwd: root, encoding: 'utf8' }).replaceAll('"../core/', '"/src/js/core/').replaceAll('"./color-policy.js"', '"/src/js/render/color-policy.js"');
  const acceptedRuntime = execFileSync('git', ['show', baseline + ':src/js/render/visualizer-runtime.js'], { cwd: root, encoding: 'utf8' }).replaceAll('"../core/', '"/src/js/core/').replaceAll('"./particle-governor.js"', '"/src/js/render/particle-governor.js"');
  const server = http.createServer((req, res) => {
    try {
      const pathname = new URL(req.url, 'http://local').pathname;
      if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (pathname === '/baseline-renderer.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(acceptedSource); }
      if (pathname === '/baseline-runtime.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(acceptedRuntime); }
      if (pathname === '/probe') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><meta charset="utf-8"><title>116F Canvas evidence</title><style>body{margin:0;background:#24384d}canvas{display:block}</style><canvas></canvas>'); }
      if (pathname === '/source') { res.setHeader('Content-Type', 'text/html'); return res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8').replaceAll('__AURALPRINT_VERSION__', version).replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>').replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>')); }
      const file = path.resolve(root, '.' + pathname); if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw Error('Missing');
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
    } catch { res.writeHead(404); res.end(); }
  });
  const report = { version, baseline, browser: '', platform: process.platform, editions: [], canvas: null, screenshots: [], errors: [] };
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }); report.browser = browser.version();
    const dprs = (process.env.AP_DPRS || '1,2').split(',').map(Number);
    const editions = [['source', '/source'], ['portable', '/dist/auralprint_' + version.slice(1) + '.html'], ['hosted', '/dist/hosted/index.html']].filter(([name]) => !process.env.AP_116F_EDITIONS || process.env.AP_116F_EDITIONS.split(',').includes(name));
    for (const dpr of process.argv.some(arg => ['--canvas-only', '--seam-only'].includes(arg)) ? [] : dprs) for (const [edition, url] of editions) {
      console.error('116F controls:', edition, 'DPR', dpr);
      const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: dpr });
      await captureProbe(page);
      page.on('pageerror', error => report.errors.push(edition + ': ' + error.message)); page.on('console', message => { if (message.type() === 'error') report.errors.push(edition + ': ' + message.text()); });
      page.on('response', response => { if (response.status() >= 400) report.errors.push(edition + ': HTTP ' + response.status() + ' ' + response.url()); });
      await page.goto(base + url); await page.waitForFunction(() => document.querySelector('input[id$="-fade-trace"]'));
      const controlsResult = await controls(page, CONFIG.defaults, encodePresetPayload, edition);
      const queue = dpr === 1 ? await queueControls(page, CONFIG.defaults, encodePresetPayload) : null;
      report.editions.push({ edition, dpr, ...controlsResult, queue }); await page.close();
    }
    if (!process.argv.includes('--controls-only')) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 } }); await page.goto(base + '/probe');
      report.canvas = await canvasEvidence(page);
      for (const [label, fade, birth, segments] of [['fade-five', true, false, 5], ['particle-birth', false, true, 5], ['combined', true, true, 25]]) {
      await page.evaluate(({ fade, birth, segments }) => { const p = render116f; p.scene = p.build(4, 60, fade, birth, segments); p.scene.visualizers.render(p.Renderer, p.frame); }, { fade, birth, segments });
      if (birth) assert.equal(await page.evaluate(() => {
        const p = render116f, before = p.state.ctx.getImageData(0,0,1000,800).data;
        const hue = p.runtime.settings.bands.rainbow.hueOffsetDeg;
        p.runtime.settings.bands.rainbow.hueOffsetDeg = 180; p.frame.analysisFrame.spectrum.dominantIndex = 127;
        p.scene.visualizers.render(p.Renderer, p.frame); const after = p.state.ctx.getImageData(0,0,1000,800).data;
        p.runtime.settings.bands.rainbow.hueOffsetDeg = hue; p.frame.analysisFrame.spectrum.dominantIndex = 0;
        return before.every((value, index) => value === after[index]);
      }), true, 'Particle Birth Color changed after the current palette/dominant band changed');
      const file = path.join(work, '116f-' + label + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file);
      await page.evaluate(() => { const p = render116f; p.scene.visualizers.dispose(); for (const orb of p.scene.orbs) orb.trail.dispose(); });
      }
      report.canvas.angularBoundary = await page.evaluate(() => {
        const p = render116f; p.scene = p.build(1, 60, true, false, 5); const orb = p.scene.orbs[0]; orb.trail.reset();
        Object.assign(orb.trace, { lineAlpha: .35, lineWidthPx: 6 }); Object.assign(orb.particles, { sizeMaxPx: 0, sizeMinPx: 0 });
        for (const [x, y] of [[-350,120],[-250,120],[-150,120],[-50,120],[50,120],[150,120],[150,20],[250,20]]) orb.trail.emitAt(x, y, 0, { r: 1, g: .2, b: .3 });
        p.scene.visualizers.render(p.Renderer, p.frame);
        const sample = (x, y) => [...p.state.ctx.getImageData(x, y, 1, 1).data];
        return { background: sample(10,10), ordinarySolid: sample(620,340), insideTurn: sample(618,306), outsideTurn: sample(622,302), qualification: 'Right-angle junction at fifth fade segment, line width6 CSS px, alpha .35; inside-turn alpha must match the solid path and the rounded outer edge must cover the gap.' };
      });
      assert.deepEqual(report.canvas.angularBoundary.insideTurn, report.canvas.angularBoundary.ordinarySolid, 'Faded-to-solid bend accumulated alpha');
      assert.notDeepEqual(report.canvas.angularBoundary.outsideTurn, report.canvas.angularBoundary.background, 'Faded-to-solid bend left a gap');
      const seam = path.join(work, '116f-angular-boundary.png'); await page.screenshot({ path: seam, clip: { x: 570, y: 270, width: 120, height: 120 } }); report.screenshots.push(seam);
      await page.evaluate(() => { const p = render116f; p.scene.visualizers.dispose(); for (const orb of p.scene.orbs) orb.trail.dispose(); });
      await page.close();
    }
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    fs.writeFileSync(process.env.AP_REPORT || path.join(work, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
    if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
