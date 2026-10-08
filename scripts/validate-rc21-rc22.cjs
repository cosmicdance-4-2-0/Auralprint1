// Optional native Chromium validation, external Playwright only (no npm dependency).
// Source mode inspects live production objects; standalone mode uses public DOM
// and Share persistence without exposing or altering the bundled runtime.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.AP_REPO_ROOT || path.join(__dirname, '..'));
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const baseline = process.argv.includes('--baseline');
const hash = ids => '#p=' + Buffer.from(JSON.stringify({ schema: 10, prefs: { orbs: ids.map(id => ({ id, chanId: 'L', bandIds: [0] })) } })).toString('base64url');
const report = { version, baseline, method: 'Native generated Visualizers UI; controlled window.confirm interception; source live runtime plus unchanged standalone public Share transport.', rows: [], pageErrors: [] };
async function persisted(page) {
  await page.locator('#btnShare').evaluate(el => el.click());
  return page.evaluate(() => JSON.parse(atob(location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/'))).prefs.orbs);
}
async function focus(page) { return page.evaluate(() => ({ action: document.activeElement?.dataset.action, id: document.activeElement?.dataset.orbId, control: document.activeElement?.id })); }
async function capture(page) {
  await page.evaluate(async () => {
    const { state } = await import('/src/js/core/state.js');
    const { VisualizerRuntime } = await import('/src/js/render/visualizer-runtime.js');
    window.__probe = { state, runtime: VisualizerRuntime, ring: VisualizerRuntime.getVisualizers()[0], orbs: [...state.orbs], disposed: [] };
    for (const v of VisualizerRuntime.getVisualizers()) {
      const dispose = v.dispose;
      v.dispose = function () { window.__probe.disposed.push([this.type, this.id]); return dispose.call(this); };
    }
  });
}
async function live(page) {
  return page.evaluate(() => {
    const p = window.__probe;
    return { ids: p.state.orbs.map(o => o.id), ringSurvived: p.runtime.getVisualizers()[0] === p.ring,
      survivorSame: p.state.orbs.includes(p.orbs.at(-1)), disposed: p.disposed };
  });
}
(async () => {
  const server = http.createServer((req, res) => {
    const relative = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (!relative) {
      const css = process.env.AP_CSS_PATH || path.join(root, '.build/auralprint.css');
      const template = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.end(template.replaceAll('__AURALPRINT_VERSION__', version)
        .replace('<!-- AURALPRINT_INLINE_JS -->', '<script type="module" src="/src/js/main.js"></script>')
        .replace('<!-- AURALPRINT_INLINE_CSS -->', () => '<style>' + fs.readFileSync(css, 'utf8') + '</style>')); return;
    }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html' : 'text/javascript'); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    report.browser = await browser.version();
    for (const standalone of baseline ? [false] : [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      // Freeze frame scheduling so Cancel can prove unchanged object/focus state.
      await page.addInitScript(() => {
        window.requestAnimationFrame = () => 0;
        window.__confirmations = []; window.__accept = false;
        window.confirm = text => { window.__confirmations.push(text); return window.__accept; };
      });
      page.on('pageerror', e => report.pageErrors.push(e.message));
      const app = `http://127.0.0.1:${server.address().port}` + (standalone ? `/dist/auralprint_${version.slice(1)}.html` : '/');
      const load = async ids => { await page.goto('about:blank'); await page.goto(app + hash(ids)); await page.locator('#btnOpenVisualizers').click(); };
      await load(['spectral-ring', 'ORB1']);
      if (!standalone) await capture(page);
      const remove = page.locator('[data-action="remove"]').first();
      assert.equal(await remove.getAttribute('data-orb-id'), 'spectral-ring');
      assert.equal(await remove.getAttribute('data-action'), 'remove');
      await remove.focus(); await remove.press('Enter'); // native keyboard activation, Cancel
      const expected = `Remove ${baseline ? 'Spectral Ring' : 'Orb 1'} (spectral-ring)? This cannot be undone.`;
      const cancel = { text: await page.evaluate(() => window.__confirmations[0]), ids: (await persisted(page)).map(o => o.id), focus: await focus(page) };
      assert.equal(cancel.text, expected); assert.deepEqual(cancel.ids, ['spectral-ring', 'ORB1']);
      assert.deepEqual({ action: cancel.focus.action, id: cancel.focus.id }, { action: 'remove', id: 'spectral-ring' });
      if (!standalone) { cancel.live = await live(page); assert.deepEqual(cancel.live.disposed, []); assert.equal(cancel.live.ringSurvived, true); }
      await page.evaluate(() => { window.__accept = true; }); await remove.click();
      const accepted = { text: await page.evaluate(() => window.__confirmations[1]), ids: (await persisted(page)).map(o => o.id), focus: await focus(page) };
      assert.equal(accepted.text, expected); assert.deepEqual(accepted.ids, ['ORB1']);
      assert.deepEqual({ action: accepted.focus.action, id: accepted.focus.id }, { action: 'edit', id: 'ORB1' });
      assert.equal(await page.locator('[data-action="edit-ring"]').count(), 1);
      assert.equal(await page.evaluate(() => window.__confirmations.length), 2);
      if (!standalone) { accepted.live = await live(page); assert.deepEqual(accepted.live.disposed, [['orb', 'spectral-ring']]); assert.equal(accepted.live.ringSurvived, true); assert.equal(accepted.live.survivorSame, true); }
      const help = await page.locator('.orb-band-picker .panel-description').nth(1).textContent();
      if (baseline) assert.match(help, /^Selected bands use the combined spectrum/);
      else { assert.match(help, /channel.*both.*waveform.*band energ/i); assert.match(help, /selected bands.*that channel.s energy/i); assert.match(help, /no bands selected.*full-spectrum energy/i); }
      const row = { standalone, cancel, accepted, help };
      if (!standalone) {
        row.channels = await page.evaluate(async () => {
          const { selectOrbAnalysis } = await import('/src/js/render/visualizer-runtime.js');
          const channels = { L: { energy01: .8, waveform: [.75], bandEnergies01: [.9, .7] }, R: { energy01: .2, waveform: [-.5], bandEnergies01: [.1, .3] }, C: { energy01: .6, waveform: [.25], bandEnergies01: [.5, .4] } };
          return ['L', 'R', 'C'].map(chanId => ({ chanId, selections: [[0], [0, 1], []].map(bandIds => {
            const s = selectOrbAnalysis({ chanId, bandIds }, { channels });
            if (s.band !== channels[chanId]) throw Error('channel changed');
            return { bands: bandIds, energy: s.energyOverride01, waveform: s.band.waveform, full: s.band.energy01 };
          }) }));
        });
        assert.deepEqual(row.channels.map(c => c.selections[0].energy), [.9, .1, .5]);
      }
      if (!baseline) {
        // Ordinary generated Orb editor: selected bands and clearing targets keep L ownership.
        await page.locator('[data-action="edit"]').click();
        const card = page.locator('.orb-editor-card').first();
        await card.locator('.band-chooser').evaluate(el => { for (let p = el; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
        await card.locator('.picker-band input').nth(1).check();
        let orb = (await persisted(page))[0]; assert.equal(orb.chanId, 'L'); assert.deepEqual(orb.bandIds, [0, 1]);
        await card.getByRole('button', { name: /use full spectrum/ }).click();
        orb = (await persisted(page))[0]; assert.equal(orb.chanId, 'L'); assert.deepEqual(orb.bandIds, []);
        row.picker = { selected: [0, 1], cleared: orb.bandIds, channel: orb.chanId };
        await page.locator('[data-action="duplicate"]').click();
        assert.deepEqual((await persisted(page)).map(o => o.id), ['ORB1', 'ORB2']);
        assert.equal((await focus(page)).id, 'ORB2');
        await page.locator('#btnVisualizersAddOrb').click();
        assert.deepEqual((await persisted(page)).map(o => o.id), ['ORB1', 'ORB2', 'ORB3']);
        assert.equal((await focus(page)).id, 'ORB3');
        row.addDuplicate = { ids: ['ORB1', 'ORB2', 'ORB3'], focus: await focus(page) };
        // Normal ID after source-driven canonical reorder; middle survivor focus.
        if (!standalone) {
          await page.evaluate(async () => {
            const { preferences, resolveSettings } = await import('/src/js/core/preferences.js');
            const { reconcileOrbs } = await import('/src/js/render/orb-runtime.js');
            const { UI } = await import('/src/js/ui/ui.js');
            preferences.orbs.reverse(); resolveSettings(); reconcileOrbs(); UI.applyPrefs(null);
            for (let i = 0; i < 10; i++) UI.refreshAllUiText();
          });
          await page.locator('[data-action="remove"]').nth(1).click();
          assert.equal(await page.evaluate(() => window.__confirmations.at(-1)), 'Remove Orb 2 (ORB2)? This cannot be undone.');
          assert.equal((await focus(page)).id, 'ORB1');
          row.reorder = { ids: (await persisted(page)).map(o => o.id), focus: await focus(page) };
          // Click a stale generated Remove while only the same-ID Ring survives.
          await load(['spectral-ring']); await capture(page);
          await page.evaluate(async () => { const { removeRuntimeOrb } = await import('/src/js/render/orb-runtime.js'); removeRuntimeOrb('spectral-ring'); });
          await page.evaluate(() => { window.__accept = true; }); await page.locator('[data-action="remove"]').click();
          assert.deepEqual(await page.evaluate(() => window.__confirmations), []);
          assert.equal((await live(page)).ringSurvived, true); row.missingTarget = { confirmations: [], live: await live(page) };
        }
        await load(['custom string', 'custom![]#"<>&']);
        await page.evaluate(() => { window.__accept = true; });
        await page.locator('[data-action="remove"]').first().click();
        assert.equal(await page.evaluate(() => window.__confirmations[0]), 'Remove Orb 1 (custom string)? This cannot be undone.');
        await page.locator('[data-action="remove"]').click();
        assert.deepEqual(await persisted(page), []); assert.equal((await focus(page)).control, 'btnVisualizersAddOrb');
        assert.equal(await page.locator('[data-action="edit-ring"]').count(), 1);
        row.opaqueEmpty = { ids: [], focus: await focus(page), ringRowSurvives: true };
      }
      report.rows.push(row); await page.close();
    }
    assert.deepEqual(report.pageErrors, []);
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
