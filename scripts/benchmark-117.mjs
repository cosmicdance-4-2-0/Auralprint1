// Opt-in measurement, external to build/watch/runtime. Run after npm run build.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import esbuild from 'esbuild';
import { makeCases, makeWav, protocol, sha256, summarize } from './benchmark-117/inputs.mjs';
import { installObserver } from './benchmark-117/observer.mjs';
import { decodePrefsFromHash } from '../src/js/presets/url-preset.js';
import { createJsBuildOptions, createCssBuildOptions } from './build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
  out: { type: 'string', default: '.build/benchmark-117' },
  cases: { type: 'string', default: 'B0,B1,B2' },
  editions: { type: 'string', default: 'portable,hosted' },
  'prepare-only': { type: 'boolean', default: false },
  quick: { type: 'boolean', default: false },
  headed: { type: 'boolean', default: false },
} });
const out = path.resolve(root, values.out);
// A report must not overwrite a previous experiment, even after a failed run.
await mkdir(out, { recursive: true });
const reportPath = path.join(out, 'results.json');
await writeFile(reportPath, '{}\n', { flag: 'wx' });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const read = file => readFile(path.join(root, file));
const version = (await read('version')).toString().trim();
const artifacts = { portable: `dist/auralprint_${version.slice(1)}.html`, hosted: 'dist/hosted/index.html' };
const editions = values.editions.split(',');
assert.ok(editions.length && editions.every(e => Object.hasOwn(artifacts, e)), 'Unknown edition');
const selected = values.cases.split(',');
const allCases = makeCases();
assert.ok(selected.length && selected.every(id => allCases.some(c => c.group === id || c.id === id)), 'Unknown case');
const cases = allCases.filter(c => selected.includes(c.group) || selected.includes(c.id));
const sampling = values.quick ? { ...protocol, warmupCallbacks: 3, sampledCallbacks: 12, repeats: 1 } : protocol;
const report = {
  format: 'auralprint-117-baseline-v1', status: 'preparing', startedAt: new Date().toISOString(),
  sourceCommit: git('rev-parse', 'HEAD'), integrationReference: git('rev-parse', 'origin/v117_dev'),
  pre117Reference: '8c21846d4433376fc4568bc51810075fb42385c7',
  workingTree: git('status', '--porcelain=v1'),
  version, sampling, measurementClass: values.quick ? 'smoke-only' : 'baseline',
  environment: { os: `${os.type()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length, memoryBytes: os.totalmem(), node: process.version,
    playwright: JSON.parse((await read('node_modules/playwright/package.json')).toString()).version,
    viewport: protocol.viewport, dpr: protocol.dpr, headless: !values.headed },
  artifacts: {}, fixtures: {}, cases, results: [], observerComparison: [],
  exclusions: ['Owner Hero preset and target hardware unavailable',
    'B3-B7 (dense history, Trace, camera replay, Queue/source and recording/soak) remain separate passes',
    'No native Safari, physical permission, screen-reader speech or native/DOM memory certification',
    'Callback duration and rAF interval are distinct; their difference is not GPU time',
    'Instrumented phase timings include observer overhead and must not be pooled with built pacing'],
};
const save = async () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
let browser, server;
try {
  const sourcePaths = git('ls-files', '--', 'src', 'version', 'package.json', 'package-lock.json',
    'scripts/build.mjs', 'scripts/assemble_single_file.py', 'scripts/distribution.py', 'scripts/hosted_site.py').split('\n');
  report.implementationFiles = Object.fromEntries(await Promise.all(sourcePaths.map(async f => [f, sha256(await read(f))])));
  report.implementationSha256 = sha256(JSON.stringify(report.implementationFiles));
  const harnessPaths = ['scripts/benchmark-117.mjs', 'scripts/benchmark-117/inputs.mjs',
    'scripts/benchmark-117/observer.mjs', 'scripts/benchmark-117/diagnostic.mjs'];
  report.harnessFiles = Object.fromEntries(await Promise.all(harnessPaths.map(async f => [f, sha256(await read(f))])));
  const artifactBytes = {};
  for (const [edition, file] of Object.entries(artifacts)) {
    artifactBytes[edition] = await read(file);
    report.artifacts[edition] = { file, sha256: sha256(artifactBytes[edition]), bytes: artifactBytes[edition].length };
  }
  const canon = await read('docs/Canon/0.1.16/auralprint_0.1.16.html');
  report.canon116 = { sha256: sha256(canon), portableIdentical: canon.equals(artifactBytes.portable) };
  // Refuse stale bundles instead of labelling them with the current source hash.
  for (const [options, file] of [[createJsBuildOptions, '.build/auralprint.js'], [createCssBuildOptions, '.build/auralprint.css']]) {
    const fresh = await esbuild.build(options({ write: false, logLevel: 'silent', absWorkingDir: root }));
    assert.equal(fresh.outputFiles[0].text, (await read(file)).toString(), `Stale ${file}; run npm run build`);
  }
  report.freshBundlesVerified = true;
  for (const kind of ['stereo', 'silence']) {
    const bytes = makeWav(kind === 'silence'), filename = `${kind}.wav`;
    await writeFile(path.join(out, filename), bytes, { flag: 'wx' });
    report.fixtures[kind] = { filename, bytes: bytes.length, sha256: sha256(bytes), recipe: protocol.audio };
  }
  report.status = 'prepared'; await save();
  if (values['prepare-only']) {
    console.log(`Prepared ${cases.length} cases and exact WAV inputs: ${reportPath}`);
  } else {
    const { chromium } = await import('playwright');
    const launch = { headless: !values.headed, args: ['--autoplay-policy=no-user-gesture-required'] };
    if (process.env.AP_CHROMIUM_PATH) launch.executablePath = process.env.AP_CHROMIUM_PATH;
    report.environment.launch = launch;
    browser = await chromium.launch(launch);
    report.environment.browser = await browser.version();
    const cdp = await browser.newBrowserCDPSession();
    report.environment.gpu = await cdp.send('SystemInfo.getInfo'); await cdp.detach();
    const compiled = await esbuild.build({ entryPoints: [path.join(root, 'scripts/benchmark-117/diagnostic.mjs')],
      bundle: true, platform: 'browser', format: 'iife', target: ['es2020'], minify: false, write: false });
    const original = (await read('.build/auralprint.js')).toString();
    const portable = artifactBytes.portable.toString();
    assert.equal(portable.split(original).length, 2, 'Production bundle must occur exactly once');
    const diagnosticHtml = portable.replace(original, () => compiled.outputFiles[0].text);
    report.diagnosticArtifactSha256 = sha256(diagnosticHtml);
    server = createServer(async (req, res) => {
      try {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/diagnostic.html') {
          res.setHeader('Content-Type', 'text/html'); return res.end(diagnosticHtml);
        }
        if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
        const file = path.resolve(root, '.' + decodeURIComponent(pathname));
        if (!file.startsWith(path.join(root, 'dist') + path.sep)) { res.writeHead(404); return res.end(); }
        res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : file.endsWith('.json')
          || file.endsWith('.webmanifest') ? 'application/json' : 'application/octet-stream');
        res.end(await readFile(file));
      } catch { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    report.status = 'running'; await save();
    const run = async (spec, edition, repetition, mode, purpose = 'baseline', comparisonPosition = null) => {
      const context = await browser.newContext({ viewport: protocol.viewport, deviceScaleFactor: protocol.dpr });
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(protocol.timeoutMs);
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
      const result = { case: spec.id, edition, repetition, mode, purpose, comparisonPosition, errors };
      // Save a failed run's context as well as successful runs; never erase prior evidence.
      (purpose === 'observer-control' ? report.observerComparison : report.results).push(result);
      try {
        await page.addInitScript(installObserver);
        const appPath = mode === 'buckets' ? '/diagnostic.html' : '/' + artifacts[edition];
        await page.goto(base + appPath + '#p=' + Buffer.from(JSON.stringify(spec.wire)).toString('base64url'));
        await page.waitForFunction(() => window.ap117Observer?.callbacks >= 1);
        result.startup = await page.evaluate(() => ({ scheduledMs: ap117Observer.firstScheduledMs,
          firstCallbackStartMs: ap117Observer.firstCallbackStartMs, firstCallbackEndMs: ap117Observer.firstCallbackEndMs,
          dom: document.querySelectorAll('*').length, controls: document.querySelectorAll('input,select,button,textarea').length,
          navigation: performance.getEntriesByType('navigation')[0]?.toJSON() }));
        // Source changes always go through the actual File ingestion/loadAndPlay UI path.
        if (spec.source !== 'none') {
          await page.locator('#fileInput').setInputFiles(path.join(out, `${spec.source}.wav`));
          await page.waitForFunction(() => document.getElementById('btnPlay').textContent === 'Pause');
        }
        await page.evaluate(spec => {
          if (spec.paused) {
            document.getElementById('c').focus();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
          }
          if (spec.panels === 'hidden') document.getElementById('btnTogglePanels').click();
          if (spec.panels === 'revealed' && getComputedStyle(document.getElementById('visualizersPanel')).display === 'none') {
            document.getElementById('btnOpenVisualizers').click();
          }
        }, spec);
        result.visibility = await page.evaluate(() => Object.fromEntries(
          [...document.querySelectorAll('.panel')].map(el => [el.id, !el.hidden && getComputedStyle(el).display !== 'none'])));
        result.mediaBefore = await page.evaluate(() => {
          const media = ap117Observer.mediaElement;
          return media ? { timeSec: media.currentTime, durationSec: media.duration, paused: media.paused } : null;
        });
        result.before = mode === 'buckets' ? await page.evaluate(() => ap117Diagnostic.snapshot()) : null;
        result.samples = await page.evaluate(async options => {
          let timer;
          try { return await Promise.race([ap117Observer.collect(options),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Application callback sampling timed out')), options.timeoutMs); })]); }
          finally { clearTimeout(timer); }
        }, { warmupCallbacks: sampling.warmupCallbacks, sampledCallbacks: sampling.sampledCallbacks,
          timeoutMs: protocol.timeoutMs, mode });
        result.summary = summarize(result.samples);
        result.mediaAfter = await page.evaluate(() => {
          const media = ap117Observer.mediaElement;
          return media ? { timeSec: media.currentTime, durationSec: media.duration, paused: media.paused } : null;
        });
        if (spec.group === 'B2' && mode === 'callback') result.edits = await measureEdits(page, spec);
        result.after = mode === 'buckets' ? await page.evaluate(() => ap117Diagnostic.snapshot()) : null;
        if (mode === 'buckets') {
          assert.deepEqual(result.after.settings, spec.preferences, 'Resolved settings changed during sampling');
          assert.equal(result.after.paused, spec.paused);
          if (spec.source !== 'none') {
            assert.equal(result.after.analysisReady, true);
            for (const channel of Object.values(result.after.channels)) {
              assert.ok(channel.waveformLength > 0 && channel.energiesLength > 0, 'Missing producer channel');
            }
          }
          if (spec.paused) assert.deepEqual(result.before.angles, result.after.angles, 'Pause moved Orbs');
          if (spec.id === 'B1-orb') assert.equal(result.before.ringPhaseRad, result.after.ringPhaseRad, 'Zero-Orb lock moved Ring');
          if (spec.id === 'B1-free') assert.notEqual(result.before.ringPhaseRad, result.after.ringPhaseRad, 'Free Ring did not progress');
        }
        assert.deepEqual(errors, []);
        result.status = 'passed';
        console.error(`${spec.id} ${edition} ${mode} #${repetition}: p95 interval ${result.summary.intervalMs.p95.toFixed(2)} ms`);
      } catch (error) { result.status = 'failed'; result.failure = String(error.stack || error); throw error; }
      finally { await context.close(); await save(); }
    };
    // Three independent baseline repetitions, no candidate/speedup claim.
    for (let repetition = 1; repetition <= sampling.repeats; repetition++) {
      for (const edition of editions) for (const spec of cases) await run(spec, edition, repetition, 'callback');
    }
    // Separate attribution run: its timings are never pooled with built pacing.
    for (const spec of cases) await run(spec, 'instrumented-portable', 1, 'buckets', 'attribution');
    // Balanced interval-only / timed / timed / interval-only observer comparison.
    const overheadCase = cases.find(c => c.id === 'B0-none-hidden-running');
    if (overheadCase) for (let block = 1; block <= sampling.repeats; block++) {
      for (const [position, mode] of ['interval', 'callback', 'callback', 'interval'].entries()) {
        await run(overheadCase, 'portable', block, mode, 'observer-control', position + 1);
      }
    }
    const offline = await browser.newContext({ offline: true, viewport: protocol.viewport });
    try {
      const page = await offline.newPage(), errors = [], requests = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('request', req => { if (/^https?:/.test(req.url())) requests.push(req.url()); });
      await page.addInitScript(installObserver);
      await page.goto(new URL(artifacts.portable, 'file://' + root).href);
      await page.waitForFunction(() => ap117Observer.callbacks >= 12);
      assert.deepEqual(errors, []); assert.deepEqual(requests, []);
      report.offlinePortable = { directFileLaunch: true, networkDisabled: true, errors, httpRequests: requests };
    } finally { await offline.close(); }
    report.status = 'completed';
    console.log(`Completed measurements: ${reportPath}`);
  }
} catch (error) {
  report.status = browser ? 'failed' : 'blocked'; report.failure = String(error.stack || error);
  console.error(report.failure); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  report.finishedAt = new Date().toISOString(); await save();
}

async function measureEdits(page, spec) {
  const setup = await page.evaluate(async revealed => {
    const start = performance.now();
    // Use the existing inventory Edit action even when the benchmark panel is hidden.
    document.querySelector('[data-action="edit"]').click();
    const card = document.querySelector('.orb-editor-card');
    const hue = card.querySelector('[id$="-hue"]');
    for (let parent = hue.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    if (!revealed) document.getElementById('btnHideVisualizers').click();
    const draft = card.querySelector('[id$="-bands"]');
    if (revealed) for (let parent = draft.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    const focus = revealed ? draft : document.getElementById('c'); focus.focus();
    if (revealed) draft.value = 'pending benchmark draft';
    window.ap117EditRefs = { card, hue, focus, draft, revealed };
    const next = await ap117Observer.nextFrame();
    return { firstUsableEditMs: next.endMs - start, focused: document.activeElement === focus };
  }, spec.panels === 'revealed');
  assert.equal(setup.focused, true);
  const edits = [];
  for (const field of ['volume', 'hue']) for (let i = 0; i < protocol.commitsPerField; i++) {
    if (field === 'hue' && i === 0) await page.evaluate(() => {
      if (ap117EditRefs.revealed) { ap117EditRefs.focus = ap117EditRefs.hue; ap117EditRefs.hue.focus(); }
    });
    const value = field === 'volume' ? (i % 2 ? 0.5 : 1) : (i % 2 ? 30 : 0);
    edits.push(await page.evaluate(async ({ field, value }) => {
      const refs = ap117EditRefs;
      const control = field === 'volume' ? document.getElementById('rngVol') : refs.hue;
      const start = performance.now();
      control.value = String(value); control.dispatchEvent(new Event('input', { bubbles: true }));
      const syncMs = performance.now() - start;
      const next = await ap117Observer.nextFrame();
      return { field, value, syncMs, commitToFrameMs: next.endMs - start,
        stableCard: refs.card === document.querySelector('.orb-editor-card'),
        stableControl: refs.hue === document.querySelector('.orb-editor-card [id$="-hue"]'),
        focusPreserved: document.activeElement === refs.focus,
        draftPreserved: field === 'volume' && refs.revealed ? refs.draft.value === 'pending benchmark draft' : null };
    }, { field, value }));
  }
  assert.ok(edits.every(e => e.stableCard && e.stableControl && e.focusPreserved && e.draftPreserved !== false));
  // Verify the complete configuration, including every unrelated Orb/value.
  await page.evaluate(() => { document.getElementById('sceneStatus').textContent = ''; document.getElementById('btnShare').click(); });
  await page.waitForFunction(() => /^Share link /.test(document.getElementById('sceneStatus').textContent));
  const canonical = await decodePrefsFromHash(new URL(page.url()).hash);
  const expected = structuredClone(spec.preferences);
  expected.audio.volume = 0.5; expected.orbs[0].hueOffsetDeg = 30;
  assert.deepEqual(canonical, expected, 'Edit changed unrelated values');
  return { ...setup, samples: edits, unrelatedValuesPreserved: true };
}
