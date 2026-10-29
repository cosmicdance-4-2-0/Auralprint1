// AUD116-001: native URL decoding and packaged startup, isolated per case.
// Each child and Chromium renderer have a bounded heap. The external deadline
// kills the process group; only an explicit completed result counts as a pass.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { deflateSync } = require('node:zlib');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');

const root = path.resolve(process.env.AP_REPO_ROOT || path.join(__dirname, '..'));
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const longNumeric = 'ORB' + '9'.repeat(20000);
const longOpaque = 'opaque-' + 'x'.repeat(20000);
const hashFor = orbs => '#z=' + deflateSync(JSON.stringify({ schema: 16, prefs: { orbs } })).toString('base64url');
const specs = [
  { name: 'ordinary-two', mode: 'decoder', orbs: [{ id: 'ORB0' }, { id: 'ORB1' }] },
  { name: 'ordinary-explicit-4096', mode: 'decoder', count: 4096, explicit: true },
  { name: 'ordinary-repair-4096', mode: 'decoder', count: 4096, firstId: 'ORB9' },
  { name: 'opaque-long-repair-4096', mode: 'decoder', count: 4096, firstId: longOpaque },
  { name: 'numeric-long-repair-two', mode: 'decoder', count: 2, firstId: longNumeric },
  { name: 'numeric-long-repair-4096', mode: 'decoder', count: 4096, firstId: longNumeric },
  { name: 'numeric-long-explicit', mode: 'decoder', orbs: [{ id: longNumeric }] },
  { name: 'opaque-long-explicit', mode: 'decoder', orbs: [{ id: longOpaque }] },
  { name: 'later-reservation', mode: 'decoder', orbs: [{ id: 'alpha' }, {}, { id: 'orb-0' }, { id: 'alpha' }, { id: 'orb-2' }, {}] },
  ...['source', 'portable', 'hosted'].flatMap(edition => [
    { name: edition + '-ordinary-startup', mode: 'startup', edition, orbs: [{ id: 'ORB0' }, { id: 'ORB1' }] },
    { name: edition + '-long-repaired-startup', mode: 'startup', edition, count: 2, firstId: longNumeric },
  ]),
];

function inputFor(spec, maximum) {
  return spec.orbs || Array.from({ length: spec.count || maximum }, (_, i) => spec.explicit ? { id: `ORB${i}` } : i ? {} : { id: spec.firstId });
}

async function isolated(spec) {
  const started = performance.now();
  const child = spawn(process.execPath, ['--max-old-space-size=384', __filename, '--case', spec.name], {
    env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], detached: process.platform !== 'win32',
  });
  let stdout = '', stderr = '', expired = false, browserPid, phase = 'child startup';
  child.on('message', message => {
    if (Number.isInteger(message.browserPid)) browserPid = message.browserPid;
    if (typeof message.phase === 'string') phase = message.phase;
  });
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => {
    expired = true;
    // Playwright launches Chromium in its own process group. Track that group
    // explicitly so a wedged renderer cannot survive the driver's deadline.
    if (browserPid) {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(browserPid), '/T', '/F']);
      else { try { process.kill(-browserPid, 'SIGKILL'); } catch {} }
    }
    if (process.platform === 'win32') child.kill('SIGKILL');
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  }, 30000);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    assert.equal(expired, false, `${spec.name}: external 30-second deadline (${phase}); no completed result\n${stderr}\n${stdout}`);
    assert.equal(result.code, 0, `${spec.name}: child ${result.code}/${result.signal}\n${stderr}\n${stdout}`);
    const value = JSON.parse(stdout);
    assert.equal(value.completed, true, `${spec.name}: missing completion marker`);
    return { ...value, wallMs: Math.round(performance.now() - started) };
  } finally { clearTimeout(timer); }
}

async function runCase(spec) {
  const phase = name => process.send?.({ phase: name });
  const errors = [];
  const server = http.createServer((req, res) => {
    try {
      const pathname = new URL(req.url, 'http://local').pathname;
      if (pathname === '/probe') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><link rel="icon" href="data:,">'); }
      if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (pathname === '/source') {
        res.setHeader('Content-Type', 'text/html');
        return res.end(fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8')
          .replaceAll('__AURALPRINT_VERSION__', version)
          .replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(path.join(root, '.build/auralprint.css'), 'utf8') + '</style>')
          .replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>'));
      }
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep)) throw Error('Invalid resource');
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' })[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch (error) { errors.push(`server ${req.url}: ${error.message}`); res.writeHead(404); res.end(); }
  });
  let browser, browserServer;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    phase('Chromium launch');
    browserServer = await chromium.launchServer({ headless: true, ...(process.env.AP_CHROMIUM_PATH ? { executablePath: process.env.AP_CHROMIUM_PATH } : {}), args: ['--js-flags=--max-old-space-size=384'] });
    process.send?.({ browserPid: browserServer.process().pid });
    phase('Chromium connection');
    browser = await chromium.connect(browserServer.wsEndpoint());
    phase('browser context');
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.setDefaultTimeout(20000);
    const base = `http://127.0.0.1:${server.address().port}`;
    const { CONFIG } = await import(pathToFileURL(path.join(root, 'src/js/core/config.js')));
    const input = inputFor(spec, CONFIG.limits.orbs.maxCount), hash = hashFor(input);
    let observed;
    if (spec.mode === 'decoder') {
      phase('decoder page navigation');
      await page.goto(base + '/probe');
      phase('URL decode, invariant and round-trip checks');
      observed = await page.evaluate(async ({ hash, input }) => {
        const check = (value, message) => { if (!value) throw Error(message); };
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const { decodePrefsFromHash, encodeShareHash, UrlPreset } = await import('/src/js/presets/url-preset.js');
        const { normalizeOrbCollection, createOrb, duplicateOrb } = await import('/src/js/core/orb-collection.js');
        const { preferences } = await import('/src/js/core/preferences.js');
        const { CONFIG } = await import('/src/js/core/config.js');
        const started = performance.now(), decoded = await decodePrefsFromHash(hash);
        const durationMs = performance.now() - started, ids = decoded.orbs.map(o => o.id);
        check(decoded.orbs.length === input.length, 'Orb count changed');
        check(new Set(ids).size === ids.length, 'Duplicate normalized identities');
        const reserved = new Set(input.filter(o => typeof o.id === 'string' && o.id.length && o.id.trim() === o.id).map(o => o.id));
        const seen = new Set(), generated = [];
        input.forEach((orb, index) => {
          if (reserved.has(orb.id) && !seen.has(orb.id)) { check(ids[index] === orb.id, 'Explicit ID ownership changed'); seen.add(orb.id); }
          else { check(!reserved.has(ids[index]), 'Generated ID stole a later explicit identity'); generated.push(ids[index]); }
        });
        const bound = 4 + Math.max(1, Math.max(0, ids.length - 1).toString(36).length);
        check(generated.every(id => /^orb-[0-9a-z]+$/.test(id) && id.length <= bound), 'Generated identity amplification');
        check(same(normalizeOrbCollection(decoded.orbs), decoded.orbs), 'Normalization is not idempotent');
        check(same((await decodePrefsFromHash(hash)).orbs, decoded.orbs), 'Normalization is not deterministic');
        const share = await encodeShareHash(decoded);
        check(share.compressed, 'Native compressed encoding unavailable');
        check(same(await decodePrefsFromHash(share.hash), decoded), 'Re-encoding changed canonical Scene');
        history.replaceState(null, '', hash);
        const imported = await UrlPreset.applyFromLocationHashAsync();
        check(imported.ok && !imported.stale, 'Actual URL import did not commit');
        check(same(preferences, decoded), 'URL import changed canonical Scene');
        // At capacity, remove only trailing Orbs before checking Add/Duplicate.
        // The imported explicit source and all remaining identities stay fixed.
        const working = structuredClone(preferences.orbs);
        while (working.length > CONFIG.limits.orbs.maxCount - 2) working.pop();
        const survivors = JSON.stringify(working), sourceId = working[0].id;
        const added = createOrb(working), duplicated = duplicateOrb(working, sourceId);
        check(added && duplicated && added.id !== duplicated.id && duplicated.id !== sourceId, 'Add/Duplicate identity failure');
        check([added.id, duplicated.id].every(id => /^orb-[0-9a-z]+$/.test(id) && id.length <= 4 + working.length.toString(36).length), 'Add/Duplicate identity amplification');
        check(same(working.filter(o => o !== added && o !== duplicated), JSON.parse(survivors)), 'Add/Duplicate changed survivors');
        check(new Set(working.map(o => o.id)).size === working.length, 'Post-import Add/Duplicate collision');
        check(same(await decodePrefsFromHash((await encodeShareHash({ ...decoded, orbs: working })).hash), { ...decoded, orbs: working }), 'Post-edit reimport changed Scene');
        return { count: ids.length, durationMs: Math.round(durationMs), identityCharacters: ids.reduce((n, id) => n + id.length, 0), maxGeneratedLength: Math.max(0, ...generated.map(id => id.length)), generatedCount: generated.length, postImportAddDuplicate: true, nativeCompressedRoundTrip: true };
      }, { hash, input });
    } else {
      phase('application startup');
      await context.addInitScript(() => {
        window.orbIdProbe = { scheduled: false, firstScheduledIds: null };
        const raf = requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => {
          if (callback.name === 'onAnimationFrame' && !orbIdProbe.scheduled) {
            orbIdProbe.firstScheduledIds = Array.from(document.querySelectorAll('.orb-editor-card'), card => card.dataset.orbId);
            orbIdProbe.scheduled = true;
          }
          return raf(callback);
        };
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText() { throw Error('Probe clipboard denial'); } } });
      });
      const file = spec.edition === 'source' ? '/source' : spec.edition === 'portable' ? `/dist/auralprint_${version.slice(1)}.html` : '/dist/hosted/index.html';
      await page.goto(base + file + hash);
      await page.waitForFunction(() => orbIdProbe.scheduled);
      phase('application share, actions and reload');
      const share = async () => {
        await page.evaluate(() => { document.getElementById('sceneStatus').textContent = ''; document.getElementById('btnShare').click(); });
        await page.waitForFunction(() => /^Share link /.test(document.getElementById('sceneStatus').textContent));
        const { decodePrefsFromHash } = await import(pathToFileURL(path.join(root, 'src/js/presets/url-preset.js')));
        return decodePrefsFromHash(new URL(page.url()).hash);
      };
      const prefs = await share();
      assert.equal(prefs.orbs[0].id, input[0].id);
      assert.equal(prefs.orbs.length, input.length);
      assert.equal(new Set(prefs.orbs.map(o => o.id)).size, input.length);
      assert.deepEqual(await page.evaluate(() => orbIdProbe.firstScheduledIds), prefs.orbs.map(o => o.id), 'Startup identities were not complete before the first application frame was scheduled');
      if (!input[1].id) assert.equal(prefs.orbs[1].id, 'orb-0');
      // Real delegated buttons must create fresh opaque IDs in built editions.
      await page.evaluate(() => document.querySelector('[data-action="duplicate"]').click());
      const duplicated = await share();
      assert.equal(duplicated.orbs.length, input.length + 1);
      assert.match(duplicated.orbs[1].id, /^orb-[0-9a-z]+$/);
      assert.equal(duplicated.orbs[0].id, prefs.orbs[0].id);
      assert.deepEqual(duplicated.orbs.filter((_, index) => index !== 1), prefs.orbs);
      await page.evaluate(() => document.getElementById('btnVisualizersAddOrb').click());
      const added = await share();
      assert.deepEqual(added.orbs.slice(0, -1), duplicated.orbs);
      assert.match(added.orbs.at(-1).id, /^orb-[0-9a-z]+$/);
      assert.equal(new Set(added.orbs.map(o => o.id)).size, added.orbs.length);
      await page.reload();
      await page.waitForFunction(() => orbIdProbe.scheduled);
      assert.deepEqual(await share(), added);
      observed = { count: input.length, startupBeforeFirstFrame: true, delegatedDuplicate: true, delegatedAdd: true, reloadRoundTrip: true };
      if (spec.edition === 'source' && spec.name === 'source-ordinary-startup') {
        observed.reconciliation = await page.evaluate(async () => {
          const check = (value, message) => { if (!value) throw Error(message); };
          const { preferences } = await import('/src/js/core/preferences.js');
          const { state } = await import('/src/js/core/state.js');
          const { UI } = await import('/src/js/ui/ui.js');
          const { reconcileOrbs, duplicateRuntimeOrb, removeRuntimeOrb } = await import('/src/js/render/orb-runtime.js');
          const { VisualizerRuntime } = await import('/src/js/render/visualizer-runtime.js');
          const sourceId = preferences.orbs.at(-1).id;
          const source = state.orbs.find(orb => orb.id === sourceId);
          const card = Array.from(document.querySelectorAll('.orb-editor-card')).find(card => card.dataset.orbId === sourceId);
          const control = card.querySelector('select');
          document.getElementById('visualizersPanel').style.display = 'block';
          for (let parent = control.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
          control.focus();
          check(document.activeElement === control, 'Native focus setup failed');
          const objects = new Map(state.orbs.map(orb => [orb.id, orb]));
          const adapters = new Map(VisualizerRuntime.getVisualizers().filter(v => v.type === 'orb').map(v => [v.id, v]));
          const channels = new Map(preferences.orbs.map(orb => [orb.id, orb.chanId]));
          check(source.trail.emitAt(1, 2, performance.now() / 1000, { r: 1, g: 0, b: 0 }), 'History marker admission failed');
          source.trail.emitAccumulator = .75;
          const trail = source.trail, particles = trail.particles;
          const history = Array.from(particles);
          const historyPreserved = () => particles.length === history.length && Array.from(particles).every((particle, index) => particle === history[index]);
          preferences.orbs.reverse(); UI.applyPrefs(null); reconcileOrbs();
          check(state.orbs.every(orb => objects.get(orb.id) === orb), 'Reorder rebuilt surviving runtime Orbs');
          check(VisualizerRuntime.getVisualizers().filter(v => v.type === 'orb').every(v => adapters.get(v.id) === v), 'Reorder changed adapters');
          check(source.trail === trail && trail.particles === particles && trail.emitAccumulator === .75 && historyPreserved(), 'Reorder transferred history');
          check(Array.from(document.querySelectorAll('.orb-editor-card')).find(el => el.dataset.orbId === sourceId) === card && card.querySelector('select') === control, 'Reorder rebuilt editor DOM');
          const focusPreserved = document.activeElement === control;
          control.value = 'L'; control.dispatchEvent(new Event('change', { bubbles: true }));
          check(preferences.orbs.find(orb => orb.id === sourceId).chanId === 'L', 'Surviving editor changed the wrong Orb');
          check(preferences.orbs.filter(orb => orb.id !== sourceId).every(orb => orb.chanId === channels.get(orb.id)), 'Surviving editor changed another Orb');
          const duplicate = duplicateRuntimeOrb(sourceId), fresh = state.orbs.find(orb => orb.id === duplicate.id);
          check(fresh !== source && fresh.trail !== trail && fresh.trail.particles.length === 0, 'Duplicate inherited source history');
          const removedId = preferences.orbs.at(-1).id;
          check(removeRuntimeOrb(removedId), 'Removal failed');
          check(state.orbs.find(orb => orb.id === sourceId) === source && source.trail === trail && historyPreserved(), 'Removal transferred surviving history');
          return { runtimeObjects: true, trailOwnership: true, adapterIdentity: true, editorDomIdentity: true, editorTargetsIntendedOrb: true, independentDuplicateHistory: true, removePreservesSurvivors: true,
            // Native insertBefore focus loss also reproduces at accepted baseline.
            // It is recorded separately; this result does not claim focus passes.
            focusPreserved };
        });
      }
    }
    assert.deepEqual(errors, []);
    phase('checks completed');
    return { name: spec.name, completed: true, browser: browser.version(), inputJsonBytes: Buffer.byteLength(JSON.stringify({ schema: 16, prefs: { orbs: input } })), hashChars: hash.length, ...observed };
  } finally {
    phase('browser cleanup');
    if (browser) await browser.close();
    if (browserServer) await browserServer.close();
    phase('HTTP cleanup');
    await new Promise(resolve => server.close(resolve));
    phase('cleanup completed');
  }
}

(async () => {
  if (process.argv[2] === '--case') {
    const spec = specs.find(spec => spec.name === process.argv[3]);
    assert.ok(spec, 'Unknown case');
    console.log(JSON.stringify(await runCase(spec)));
    return;
  }
  const report = { completed: false, root, results: [] };
  const save = () => { if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report, null, 2) + '\n'); };
  try {
    for (const spec of specs.filter(spec => !process.env.AP_ORB_CASE || spec.name === process.env.AP_ORB_CASE)) {
      report.results.push(await isolated(spec)); save();
    }
    assert.ok(report.results.length, 'No matching cases');
    report.completed = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { report.failure = error.message; throw error; }
  finally { save(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
