// Focused native gate for AUD116-002/003 and editor reorder. No app rewriting.
// AP_REPO_ROOT can point at an isolated baseline; AP_OBSERVE=1 records failures.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { pathToFileURL } = require('node:url');
const { deflateSync } = require('node:zlib');
const { chromium } = require('playwright');
const root = path.resolve(process.env.AP_REPO_ROOT || path.join(__dirname, '..'));
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const results = [], failures = [], errors = [];
function check(name, actual, expected) {
  try { assert.deepEqual(actual, expected); }
  catch (error) { failures.push({ name, actual, expected }); if (!process.env.AP_OBSERVE) throw new Error(name, { cause: error }); }
}
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const click = (page, id) => page.evaluate(id => document.getElementById(id).click(), id);
async function show(page, name) {
  await page.evaluate(name => {
    for (const n of ['Audio','Analysis','Visualizers','Scene','Camera','Queue','Record']) {
      const panel = document.getElementById(n[0].toLowerCase() + n.slice(1) + 'Panel');
      if (panel && (getComputedStyle(panel).display !== 'none') !== (n === name)) document.getElementById('btnOpen' + n).click();
    }
  }, name);
}
async function reveal(page, selector, panel) {
  await show(page, panel);
  const control = page.locator(selector).first();
  await control.evaluate(el => { for (let p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; });
  return control;
}
async function inspect(control) {
  return control.evaluate(el => ({ value: el.value, invalid: el.getAttribute('aria-invalid'), focused: document.activeElement === el,
    text: el.closest('.row')?.querySelector('.val')?.textContent, aria: el.getAttribute('aria-valuetext'),
    error: (el.getAttribute('aria-describedby') || '').split(' ').map(id => document.getElementById(id)).filter(el => el?.getAttribute('role') === 'alert').map(el => el.textContent).join('') }));
}
async function share(page) {
  await page.evaluate(() => { document.getElementById('sceneStatus').textContent = ''; document.getElementById('btnShare').click(); });
  await page.waitForFunction(() => /^Share link /.test(document.getElementById('sceneStatus').textContent));
  const { decodePrefsFromHash } = await import(pathToFileURL(path.join(root, 'src/js/presets/url-preset.js')));
  return decodePrefsFromHash(new URL(page.url()).hash);
}
async function apply(page, prefs, compressed = false) {
  const { encodePresetPayload } = await import(pathToFileURL(path.join(root, 'src/js/presets/preset-codec.js')));
  const json = JSON.stringify(encodePresetPayload(prefs));
  return applyHash(page, compressed ? '#z=' + deflateSync(json).toString('base64url') : '#p=' + Buffer.from(json).toString('base64url'));
}
async function applyHash(page, hash) {
  await page.evaluate(hash => { history.replaceState(null, '', location.pathname + hash); document.getElementById('sceneStatus').textContent = ''; document.getElementById('btnApplyUrl').click(); }, hash);
  await page.waitForFunction(() => /Preset applied|Invalid preset|Unsupported preset/.test(document.getElementById('sceneStatus').textContent));
  await frames(page);
}
async function palette(page, defaults, edition) {
  const prefs = structuredClone(defaults);
  Object.assign(prefs.bands.rainbow, { hueOffsetDeg: 12.5, saturation: .375, value: .425 });
  const fields = [['hueOffsetDeg','rngHueOff',12.5,12,13], ['saturation','rngSat',.375,.37,.38], ['value','rngVal',.425,.42,.43]];
  for (const [key, id, canonical, left, right] of fields) {
    for (const [arrow, expected] of [['ArrowLeft',left], ['ArrowRight',right]]) {
      await apply(page, prefs); const control = await reveal(page, '#' + id, 'Scene');
      const before = await inspect(control), suffix = key === 'hueOffsetDeg' ? '°' : '';
      check(`${edition} ${key} canonical`, (await share(page)).bands.rainbow[key], canonical);
      check(`${edition} ${key} native selection`, Number(before.value), right);
      check(`${edition} ${key} readout`, before.text, `Current ${canonical}${suffix}; slider selection ${right}${suffix} (edit to apply)`);
      check(`${edition} ${key} ARIA`, before.aria, before.text);
      await frames(page); check(`${edition} refresh nonmutation`, await share(page), prefs);
      await control.focus(); await control.press(arrow); await frames(page);
      const after = await share(page), expectedPrefs = structuredClone(prefs); expectedPrefs.bands.rainbow[key] = expected;
      check(`${edition} ${key} first ${arrow}`, after, expectedPrefs);
      const edited = await inspect(control);
      check(`${edition} ${key} edited selection`, Number(edited.value), expected);
      check(`${edition} ${key} edited readout`, edited.text, `${expected}${suffix}`);
      check(`${edition} ${key} edited ARIA`, edited.aria, edited.text);
      results.push({ edition, field: key, arrow, before, after: edited, canonicalAfter: after.bands.rainbow[key] });
      await apply(page, expectedPrefs, true); check(`${edition} edited compressed round-trip`, await share(page), expectedPrefs);
    }
    await apply(page, prefs); const control = await reveal(page, '#' + id, 'Scene');
    await control.scrollIntoViewIfNeeded(); const box = await control.boundingBox();
    await page.mouse.click(box.x + box.width * .713, box.y + box.height / 2); await frames(page);
    const pointerPrefs = await share(page), selected = Number(await control.inputValue());
    const limit = (await import(pathToFileURL(path.join(root, 'src/js/core/config.js')))).CONFIG.limits.sceneColor[key];
    check(`${edition} pointer canonical`, pointerPrefs.bands.rainbow[key], selected);
    check(`${edition} pointer grid`, Math.abs((selected - limit.min) / limit.step - Math.round((selected - limit.min) / limit.step)) < 1e-9, true);
    const expected = structuredClone(prefs); expected.bands.rainbow[key] = selected;
    check(`${edition} pointer isolation`, pointerPrefs, expected);
    check(`${edition} pointer readout/ARIA`, (await inspect(control)).aria, (await inspect(control)).text);
    await apply(page, pointerPrefs, true); check(`${edition} pointer persisted`, await share(page), pointerPrefs);
    await page.reload(); await page.waitForSelector('.orb-editor-card', { state: 'attached' }); check(`${edition} reload persisted`, await share(page), pointerPrefs);
    // The on-grid first key must advance exactly one step.
    const onGrid = await reveal(page, '#' + id, 'Scene'); await onGrid.focus(); await onGrid.press('ArrowLeft'); await frames(page);
    check(`${edition} on-grid first step`, (await share(page)).bands.rainbow[key], Number((selected - limit.step).toFixed(10)));
  }
}
async function rejected(page, selector, panel, draft) {
  const control = await reveal(page, selector, panel); await control.fill(draft); await control.press('Tab');
  check('rejection visible', (await inspect(control)).invalid, 'true'); return control;
}
async function replacements(page, defaults, edition) {
  const bands = '.orb-editor-card input[id$="-bands"]';
  for (const mode of ['reset','plain','compressed']) {
    for (const changed of [false,true]) {
      await apply(page, defaults);
      const controls = [await rejected(page, bands, 'Visualizers', 'invalid'), await rejected(page, '#numWorldWidth', 'Scene', '-1'), await rejected(page, '#numMaxActiveParticles', 'Scene', '-1')];
      // Analysis validation is status based; its existing replacement contract
      // also needs to discard the old rejection message.
      const floor = await reveal(page, '#inpBandFloorHz', 'Analysis'); await floor.fill('-1'); await floor.press('Tab');
      const oldBand = await controls[0].elementHandle();
      const replacement = structuredClone(defaults);
      if (changed && mode !== 'reset') {
        replacement.orbs = [replacement.orbs[0]]; replacement.orbs[0].bandIds = [12,13];
        replacement.world.widthUnits = 2345.5; replacement.particleSafety.maxActiveParticles = 1234;
      }
      if (mode === 'reset') { await click(page, 'btnResetPrefs'); await frames(page); }
      else await apply(page, replacement, mode === 'compressed');
      check(`${edition} ${mode} atomic replacement`, await share(page), replacement);
      const expectedValues = [replacement.orbs[0].bandIds.join(', '), String(replacement.world.widthUnits), String(replacement.particleSafety.maxActiveParticles)];
      for (let i = 0; i < controls.length; i++) {
        const view = await inspect(controls[i]);
        check(`${edition} ${mode} input ${i}`, view.value, expectedValues[i]);
        check(`${edition} ${mode} aria-invalid ${i}`, view.invalid, 'false'); check(`${edition} ${mode} error ${i}`, view.error, '');
        check(`${edition} ${mode} readout ${i}`, /Invalid/.test(view.text), false);
        if (i) check(`${edition} ${mode} scalar readout ${i}`, view.text.includes(expectedValues[i]), true);
        results.push({ edition, mode, changed, field: i, view });
        await controls[i].evaluate(el => { el.dispatchEvent(new Event('blur')); el.dispatchEvent(new Event('change', { bubbles: true })); });
      }
      check(`${edition} ${mode} retained controller`, await controls[0].evaluate((el, old) => el === old, oldBand), true);
      check(`${edition} ${mode} removed controllers`, await page.locator('.orb-editor-card').count(), replacement.orbs.length);
      check(`${edition} ${mode} Analysis error`, await page.locator('#analysisStatus').textContent(), '');
      check(`${edition} ${mode} Orb status cleared`, /Use whole band indices/.test(await page.locator('#visualizerEditStatus').textContent()), false);
      check(`${edition} ${mode} late events`, await share(page), replacement);
    }
  }
  for (const [selector, panel, draft] of [[bands,'Visualizers','7, 9'],[bands,'Visualizers','invalid'],['#numWorldWidth','Scene','1234.5'],['#numWorldWidth','Scene','-1'],['#numMaxActiveParticles','Scene','1234'],['#numMaxActiveParticles','Scene','-1']]) {
    await apply(page, defaults); const control = await reveal(page, selector, panel); await control.fill(draft);
    const before = await inspect(control);
    // A real unrelated edit resolves new settings while the input stays focused.
    await page.evaluate(() => { const input = document.getElementById('rngVol'); input.value = '.37'; input.dispatchEvent(new Event('input', { bubbles: true })); }); await frames(page);
    check(`${edition} unrelated active draft ${selector}`, await inspect(control), before);
    const current = await share(page);
    for (const hash of ['#p=AAAA','#z=AAAA']) { await applyHash(page, hash); check(`${edition} failed import draft`, await inspect(control), before); check(`${edition} failed import atomicity`, await share(page), current); }
    // Successful import cancels even a valid draft that has never lost focus.
    await apply(page, defaults, true);
    const expected = selector === bands ? defaults.orbs[0].bandIds.join(', ') : selector === '#numWorldWidth' ? String(defaults.world.widthUnits) : String(defaults.particleSafety.maxActiveParticles);
    check(`${edition} active replacement`, await control.inputValue(), expected);
    await control.evaluate(el => { el.dispatchEvent(new Event('blur')); el.dispatchEvent(new Event('change', { bubbles: true })); });
    check(`${edition} valid late change fenced`, await share(page), defaults);
  }
  // Delay only the output of the native decoder; a subsequent input intent
  // must supersede it without gaining replacement semantics.
  await apply(page, defaults); const control = await reveal(page, bands, 'Visualizers'); await control.fill('invalid');
  const { encodePresetPayload } = await import(pathToFileURL(path.join(root, 'src/js/presets/preset-codec.js')));
  const target = structuredClone(defaults); target.orbs[0].bandIds = [12,13];
  const hash = '#z=' + deflateSync(JSON.stringify(encodePresetPayload(target))).toString('base64url');
  await page.evaluate(hash => {
    const Native = window.DecompressionStream; window.uiStateGate = { Native };
    window.DecompressionStream = function(format) {
      const native = new Native(format); let gated = false;
      const gate = new TransformStream({ async transform(chunk, controller) { if (!gated) { gated = true; await new Promise(r => { uiStateGate.release = r; }); } controller.enqueue(chunk); }, flush() { uiStateGate.finished = true; } });
      return { readable: native.readable.pipeThrough(gate), writable: native.writable };
    };
    history.replaceState(null, '', location.pathname + hash); document.getElementById('btnApplyUrl').click();
  }, hash);
  await page.waitForFunction(() => typeof uiStateGate.release === 'function'); await control.fill('7, 9');
  await page.evaluate(() => uiStateGate.release()); await page.waitForFunction(() => uiStateGate.finished); await frames(page);
  await page.evaluate(() => { window.DecompressionStream = uiStateGate.Native; });
  check(`${edition} superseded import draft`, await control.inputValue(), '7, 9'); check(`${edition} superseded import Scene`, await share(page), defaults);
}
async function reorder(page, defaults) {
  const fixture = structuredClone(defaults); fixture.orbs = ['A','B','C'].map(id => ({ ...structuredClone(defaults.orbs[0]), id }));
  const orders = [['C','A','B'],['B','C','A'],['C','B','A'],['A','B','C']];
  for (const id of ['A','B','C']) for (const draft of ['invalid','7, 9']) {
    await apply(page, fixture); const selector = `.orb-editor-card[data-orb-id="${id}"] input[id$="-bands"]`;
    const control = await reveal(page, selector, 'Visualizers');
    if (draft === 'invalid') { await control.fill(draft); await control.press('Tab'); }
    await control.fill(draft); await control.evaluate(el => el.setSelectionRange(1,3,'backward'));
    await page.evaluate(async id => {
      const { state } = await import('/src/js/core/state.js'); state.time.simPaused = true;
      const { AudioEngine } = await import('/src/js/audio/audio-engine.js');
      const native = AudioEngine.applyAnalyserSettingsLive;
      window.focusProbe = { id, commits: 0, native, control: document.activeElement, camera: JSON.stringify(state.camera), orbs: state.orbs.slice() };
      AudioEngine.applyAnalyserSettingsLive = function(...args) { focusProbe.commits++; return native.apply(this,args); };
      for (const orb of state.orbs) { orb.trail.emitAt(1,2,performance.now()/1000,{r:1,g:1,b:1}); orb.trail.emitAccumulator = .5; }
      focusProbe.histories = state.orbs.map(orb => ({ orb, head: orb.trail.particles.head, length: orb.trail.particles.length, angle: orb.angleRad }));
      focusProbe.control.addEventListener('blur', () => { focusProbe.blurs = (focusProbe.blurs || 0) + 1; });
    }, id);
    for (const [index, order] of orders.entries()) {
      const observed = await page.evaluate(async order => {
        const { preferences } = await import('/src/js/core/preferences.js'); const { UI } = await import('/src/js/ui/ui.js');
        const { reconcileOrbs } = await import('/src/js/render/orb-runtime.js'); const { state } = await import('/src/js/core/state.js');
        const byId = new Map(preferences.orbs.map(o => [o.id,o])); preferences.orbs = order.map(id => byId.get(id)); UI.applyPrefs(null); reconcileOrbs(); UI.refreshAllUiText();
        const c = focusProbe.control;
        return { order: [...document.querySelectorAll('.orb-editor-card')].map(c => c.dataset.orbId), focused: document.activeElement === c, same: document.querySelector(`.orb-editor-card[data-orb-id="${focusProbe.id}"] input[id$="-bands"]`) === c,
          value: c.value, start: c.selectionStart, end: c.selectionEnd, direction: c.selectionDirection, blurs: focusProbe.blurs || 0,
          invalid: c.getAttribute('aria-invalid') === 'true', error: Boolean(document.getElementById(c.getAttribute('aria-describedby')).textContent),
          histories: focusProbe.histories.every(h => state.orbs.includes(h.orb) && h.orb.trail.particles.head === h.head && h.orb.trail.particles.length === h.length && h.orb.angleRad === h.angle && h.orb.trail.emitAccumulator === .5), camera: JSON.stringify(state.camera) === focusProbe.camera, commits: focusProbe.commits };
      }, order);
      check(`source reorder ${id}/${draft}`, observed, { order, focused:true, same:true, value:draft, start:1, end:3, direction:'backward', blurs:0, invalid:draft==='invalid', error:draft==='invalid', histories:true, camera:true, commits:index + 1 });
      results.push({ edition:'source', reorder:id, draft, observed });
    }
    // Commit the surviving control after another reorder, checking the real
    // coordinator once and the intended identity rather than its old position.
    await page.evaluate(async () => { const { preferences } = await import('/src/js/core/preferences.js'); const { UI } = await import('/src/js/ui/ui.js'); preferences.orbs.reverse(); UI.applyPrefs(null); focusProbe.commits = 0; });
    await control.fill('7, 9'); await control.press('Tab');
    check(`source reordered edit commits once ${id}`,await page.evaluate(()=>focusProbe.commits),1);
    const expected = structuredClone(fixture); expected.orbs.reverse(); expected.orbs.find(o=>o.id===id).bandIds=[7,9];
    check(`source reordered edit targets ${id}`,await share(page),expected);
    await page.evaluate(async () => { const { AudioEngine } = await import('/src/js/audio/audio-engine.js'); AudioEngine.applyAnalyserSettingsLive = focusProbe.native; });
  }
  // Exactly one ordinary band commit after repeated refresh and panel openings.
  await apply(page, fixture); const control = await reveal(page, '.orb-editor-card input[id$="-bands"]', 'Visualizers');
  await page.evaluate(async () => { const { AudioEngine } = await import('/src/js/audio/audio-engine.js'); const native = AudioEngine.applyAnalyserSettingsLive; window.commitProbe = { native, count:0 }; AudioEngine.applyAnalyserSettingsLive = function(...args) { commitProbe.count++; return native.apply(this,args); }; for(let i=0;i<20;i++){document.getElementById('btnHideVisualizers').click();document.getElementById('btnOpenVisualizers').click();} });
  await control.fill('7, 9'); await control.press('Tab'); await control.evaluate(el => { el.dispatchEvent(new Event('blur')); el.dispatchEvent(new Event('change', {bubbles:true})); });
  check('source ordinary edit exactly once', await page.evaluate(() => commitProbe.count), 1);
  await page.evaluate(async () => { const { AudioEngine } = await import('/src/js/audio/audio-engine.js'); AudioEngine.applyAnalyserSettingsLive = commitProbe.native; });
  for (const suffix of ['channel','angular-speed']) {
    const control = await reveal(page, `.orb-editor-card[data-orb-id="A"] [id$="-${suffix}"]`, 'Visualizers'); await control.focus();
    check(`source focused ${suffix} survives reorder`, await control.evaluate(async el => {
      const { preferences } = await import('/src/js/core/preferences.js'); const { UI } = await import('/src/js/ui/ui.js');
      preferences.orbs.reverse(); UI.applyPrefs(null); return document.activeElement === el;
    }), true);
  }
}
async function pickerReplacements(page, defaults, edition) {
  for (const mode of ['reset','plain','compressed']) {
    await apply(page,defaults);
    const first = await reveal(page,'.orb-editor-card .picker-range input','Visualizers');
    const picker = page.locator('.orb-editor-card .orb-band-picker').first();
    const last = picker.locator('.picker-range input').nth(1);
    await first.fill('-1'); await last.fill('7'); await picker.getByRole('button',{name:'Use range',exact:true}).click();
    check(`${edition} picker rejected range`, await first.getAttribute('aria-invalid'),'true');
    const oldError = await picker.locator('.picker-error').textContent();
    await page.evaluate(()=>{const input=document.getElementById('rngVol');input.value='.37';input.dispatchEvent(new Event('input',{bubbles:true}));}); await frames(page);
    check(`${edition} picker ordinary draft`, await first.inputValue(),'-1'); check(`${edition} picker ordinary error`,await picker.locator('.picker-error').textContent(),oldError);
    const replacement = structuredClone(defaults); if(mode!=='reset')replacement.orbs[0].bandIds=[12,13];
    if(mode==='reset'){await click(page,'btnResetPrefs');await frames(page);}else await apply(page,replacement,mode==='compressed');
    const sorted = replacement.orbs[0].bandIds.filter(id=>id<replacement.bands.count).sort((a,b)=>a-b);
    const contiguous = sorted.length && sorted.at(-1)-sorted[0]+1===sorted.length;
    check(`${edition} picker replacement inputs`,[await first.inputValue(),await last.inputValue()],contiguous?[String(sorted[0]),String(sorted.at(-1))]:['','']);
    check(`${edition} picker replacement invalid`,[await first.getAttribute('aria-invalid'),await last.getAttribute('aria-invalid')],['false','false']);
    check(`${edition} picker replacement error`,await picker.locator('.picker-error').textContent(),'');
    await first.evaluate(el=>{el.dispatchEvent(new Event('blur'));el.dispatchEvent(new Event('change',{bubbles:true}));});
    check(`${edition} picker late event nonmutation`,await share(page),replacement);
    await first.fill('7'); await apply(page,replacement,true);
    check(`${edition} picker active valid replacement`,await first.inputValue(),contiguous?String(sorted[0]):'');
    results.push({edition,pickerReplacement:mode,first:await first.inputValue(),last:await last.inputValue()});
  }
}
async function structural(page, defaults, edition) {
  await apply(page, defaults); const id = defaults.orbs.at(-1).id;
  const control = await reveal(page, `.orb-editor-card[data-orb-id="${id}"] input[id$="-bands"]`, 'Visualizers');
  await control.fill('invalid'); const original = await control.elementHandle();
  const reversed = structuredClone(defaults); reversed.orbs.reverse();
  await apply(page, reversed, true);
  check(`${edition} replacement reorder controller/focus`, await control.evaluate((el, old) => el === old && document.activeElement === old, original), true);
  check(`${edition} replacement reorder discards draft`, await control.inputValue(), defaults.orbs.at(-1).bandIds.join(', '));
  const removed = structuredClone(reversed); removed.orbs = removed.orbs.filter(o => o.id !== id);
  await apply(page, removed);
  check(`${edition} removed Orb never refocused`, await page.evaluate(old => !old.isConnected && document.activeElement !== old, original), true);
  await apply(page, defaults); await show(page,'Visualizers');
  await page.evaluate(() => { for(let i=0;i<20;i++){document.getElementById('btnHideVisualizers').click();document.getElementById('btnOpenVisualizers').click();} });
  const before = await share(page); await click(page,'btnVisualizersAddOrb'); await frames(page); const added = await share(page);
  check(`${edition} Add once`, added.orbs.length, before.orbs.length + 1);
  check(`${edition} Add stable survivors`, added.orbs.slice(0,-1), before.orbs);
  await page.locator('[data-action=duplicate]').first().click(); await frames(page); const duplicated = await share(page);
  check(`${edition} Duplicate once`, duplicated.orbs.length, added.orbs.length + 1);
  check(`${edition} unique IDs`, new Set(duplicated.orbs.map(o=>o.id)).size, duplicated.orbs.length);
  page.once('dialog', d=>d.accept()); await page.locator('[data-action=remove]').first().click(); await frames(page);
  check(`${edition} Remove once`, (await share(page)).orbs.length, duplicated.orbs.length - 1);
  const zero = structuredClone(defaults); zero.orbs = []; await apply(page,zero);
  check(`${edition} zero-Orb editors`, await page.locator('.orb-editor-card').count(), 0);
  check(`${edition} zero-Orb Scene`, await share(page), zero); await click(page,'btnVisualizersAddOrb'); await frames(page);
  check(`${edition} Add from zero`, (await share(page)).orbs.length, 1);
}
(async () => {
  const { CONFIG } = await import(pathToFileURL(path.join(root,'src/js/core/config.js')));
  const server = http.createServer((req,res) => {
    try {
      const pathname = new URL(req.url,'http://local').pathname;
      if(pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if(pathname === '/source') { res.setHeader('Content-Type','text/html'); return res.end(fs.readFileSync(path.join(root,'src/index.template.html'),'utf8').replaceAll('__AURALPRINT_VERSION__',version).replace('<!-- AURALPRINT_INLINE_CSS -->',()=>'<style>'+fs.readFileSync(path.join(root,'.build/auralprint.css'),'utf8')+'</style>').replace('<!-- AURALPRINT_INLINE_JS -->','<script type="module" src="/src/js/main.js"></script>')); }
      const file = path.resolve(root,'.'+pathname); if(!file.startsWith(root+path.sep)) throw Error('Invalid resource');
      res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
    } catch(e) { errors.push(`server ${req.url}: ${e.message}`); res.writeHead(404); res.end(); }
  });
  let browser;
  try {
    await new Promise(r=>server.listen(0,'127.0.0.1',r)); browser=await chromium.launch({headless:true,executablePath:process.env.AP_CHROMIUM_PATH});
    for (const [edition, file] of [['source','/source'],['portable',`/dist/auralprint_${version.slice(1)}.html`],['hosted','/dist/hosted/index.html']]) {
      if (process.env.AP_EDITIONS && !process.env.AP_EDITIONS.split(',').includes(edition)) continue;
      const context=await browser.newContext({viewport:{width:1280,height:900}}), page=await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.goto(`http://127.0.0.1:${server.address().port}${file}`); await page.waitForSelector('.orb-editor-card',{state:'attached'}); await frames(page);
      await palette(page,CONFIG.defaults,edition); await replacements(page,CONFIG.defaults,edition);
      await pickerReplacements(page,CONFIG.defaults,edition);
      if(edition === 'source') await reorder(page,CONFIG.defaults);
      await structural(page,CONFIG.defaults,edition);
      console.log(`Completed ${edition}: palette, replacement/draft/atomicity${edition === 'source'?', ordinary native reorder/history/focus':''}`); await context.close();
    }
    check('native console errors',errors,[]);
    const report={completed:true,browser:browser.version(),results,failures,errors};
    if(process.env.AP_REPORT)fs.writeFileSync(process.env.AP_REPORT,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({completed:true,browser:browser.version(),observations:results.length,failures:failures.length,errors}));
    if(failures.length && !process.env.AP_OBSERVE)process.exitCode=1;
  } finally { if(browser)await browser.close(); await new Promise(r=>server.close(r)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
