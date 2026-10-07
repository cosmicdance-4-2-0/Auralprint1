// Reproduce confirmed UI audit findings against the unmodified built app.
// Requires externally installed Playwright and Chromium; does not modify source.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const repoRoot = process.env.AUDIT_REPO_ROOT || process.cwd();
const { chromium } = require('playwright');
const appUrl = process.env.AUDIT_APP_URL || 'http://127.0.0.1:8000/auralprint_0.1.15m.h.html';
const outputDir = process.env.AUDIT_OUTPUT_DIR || __dirname;
const browserPath = process.env.AUDIT_CHROMIUM || '/usr/bin/chromium';
function wave() {
  const n = 48000, b = Buffer.alloc(44 + 2*n);
  b.write('RIFF'); b.writeUInt32LE(b.length-8,4); b.write('WAVE',8);
  b.write('fmt ',12); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20);
  b.writeUInt16LE(1,22); b.writeUInt32LE(48000,24); b.writeUInt32LE(96000,28);
  b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(n*2,40);
  for(let i=0;i<n;i++) b.writeInt16LE(Math.round(3000*Math.sin(2*Math.PI*440*i/48000)),44+2*i);
  return b;
}
async function fresh(page, hash='') { await page.goto('about:blank'); await page.goto(appUrl+hash); await page.waitForFunction(()=>document.querySelector('#orbEditorList').children.length>0); }
async function readPreset(page) {
  // Read the public share transport to observe canonical persisted preferences.
  await page.evaluate(()=>document.querySelector('#btnShare').click());
  return page.evaluate(()=>JSON.parse(atob(location.hash.slice(3).replace(/-/g,'+').replace(/_/g,'/'))));
}
async function decode(page, bytes) {
  return page.evaluate(async str=>{
    const bytes=Uint8Array.from(atob(str),c=>c.charCodeAt(0)); const context=new AudioContext();
    const audio=await context.decodeAudioData(bytes.buffer); const result={duration:audio.duration,sampleRate:audio.sampleRate,channels:audio.numberOfChannels}; await context.close(); return result;
  },bytes.toString('base64'));
}
async function model(page) { return page.evaluate(()=>({queueCount:document.querySelector('#queueList').children.length,playDisabled:document.querySelector('#btnPlay').disabled,status:document.querySelector('#audioStatus').textContent})); }
async function drop(page, bytes, mime) {
  return page.evaluate(({data,mime})=>{const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)); const file=new File([bytes],'supported.wav',{type:mime});const transfer=new DataTransfer();transfer.items.add(file);document.querySelector('#c').dispatchEvent(new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));return file.type;},{data:bytes.toString('base64'),mime});
}
(async()=>{
  fs.mkdirSync(outputDir,{recursive:true}); const browser=await chromium.launch({executablePath:browserPath,headless:true,args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}}); const errors=[];page.on('pageerror',error=>errors.push(String(error))); const result={appUrl,browser:await browser.version(),errors};
    await fresh(page); const initialPreset=await readPreset(page);
    await page.locator('#btnOpenVisualizers').click(); const firstOrb=page.locator('.orb-editor-card').first();await firstOrb.locator('> summary').click();await firstOrb.locator('select[id$="line-color"]').evaluate(el=>el.closest('details').open=true);
    await firstOrb.locator('select[id$="line-color"]').selectOption('fixed'); const bulk=page.locator('#selLineColorMode');await bulk.evaluate(el=>el.closest('details').open=true);
    const before={control:await bulk.inputValue(),readout:await page.locator('#valLineColorMode').innerText(),modes:(await readPreset(page)).prefs.orbs.map(o=>o.trace.lineColorMode)};
    assert.equal(before.control,'dominantBand');assert.equal(before.readout,'mixed');assert.deepEqual(before.modes,['fixed','dominantBand']);
    // Real native keyboard selection of the already displayed last option.
    // Playwright.selectOption always dispatches change, even for the same value,
    // so it cannot reproduce this user-visible issue.
    await bulk.focus();await bulk.press('Alt+ArrowDown');await bulk.press('End');await bulk.press('Enter');
    const after={control:await bulk.inputValue(),readout:await page.locator('#valLineColorMode').innerText(),modes:(await readPreset(page)).prefs.orbs.map(o=>o.trace.lineColorMode)};
    assert.deepEqual(after,before);result.bulkMixedSelect={before,after};
    // Positive control: changing to a different displayed option applies all Orbs.
    await bulk.press('Home');const changed=(await readPreset(page)).prefs.orbs.map(o=>o.trace.lineColorMode);assert.deepEqual(changed,['fixed','fixed']);result.bulkMixedSelect.changedOptionModes=changed;
    const ogg=fs.readFileSync(path.join(__dirname,'tone.ogg'));assert.equal(ogg.subarray(0,4).toString(),'OggS');await fresh(page);result.oggDecode=await decode(page,ogg);assert(result.oggDecode.duration>0);
    await page.locator('#fileInput').setInputFiles({name:'tone.ogg',mimeType:'application/ogg',buffer:ogg});await page.waitForTimeout(150);const rejectedOgg={actualMime:await page.locator('#fileInput').evaluate(input=>input.files[0].type),...await model(page)};assert.equal(rejectedOgg.actualMime,'application/ogg');assert.equal(rejectedOgg.queueCount,0);assert.equal(rejectedOgg.playDisabled,true);
    await page.locator('#fileInput').setInputFiles({name:'tone.ogg',mimeType:'audio/ogg',buffer:ogg});await page.waitForFunction(()=>document.querySelector('#queueList').children.length===1&&!document.querySelector('#btnPlay').disabled);const acceptedOgg=await model(page);result.oggMime={rejected:rejectedOgg,accepted:acceptedOgg};
    await fresh(page);const wav=wave();result.wavDecode=await decode(page,wav);assert(result.wavDecode.duration>0);const actualEmpty=await drop(page,wav,'');await page.waitForTimeout(150);const rejectedEmpty={actualMime:actualEmpty,...await model(page)};assert.equal(actualEmpty,'');assert.equal(rejectedEmpty.queueCount,0);assert.equal(rejectedEmpty.playDisabled,true);
    await drop(page,wav,'audio/wav');await page.waitForFunction(()=>document.querySelector('#queueList').children.length===1&&!document.querySelector('#btnPlay').disabled);result.emptyMime={rejected:rejectedEmpty,accepted:await model(page)};
    // Additional verified lower-severity phase readout/control mismatch.
    initialPreset.prefs.orbs[0].startAngleRad=4*Math.PI;await fresh(page,'#p='+Buffer.from(JSON.stringify(initialPreset)).toString('base64url'));const phase=await page.locator('input[id$="phase-offset"]').first().evaluate(el=>({value:Number(el.value),max:Number(el.max),display:el.closest('.row').querySelector('.val').textContent,accessibleValue:el.getAttribute('aria-valuetext')}));assert.equal(phase.display,'720°');assert(phase.value<=phase.max);phase.persisted=(await readPreset(page)).prefs.orbs[0].startAngleRad;assert.equal(phase.persisted,4*Math.PI);result.phase=phase;
    initialPreset.prefs.orbs[0].id='spectral-ring';await fresh(page,'#p='+Buffer.from(JSON.stringify(initialPreset)).toString('base64url'));await page.locator('#btnOpenVisualizers').click();let confirmation='';page.once('dialog',async dialog=>{confirmation=dialog.message();await dialog.accept()});await page.locator('[data-action="remove"]').first().click();const survivors=(await readPreset(page)).prefs.orbs.map(orb=>orb.id);assert(confirmation.startsWith('Remove Spectral Ring (spectral-ring)?'));assert.deepEqual(survivors,['ORB1']);result.reservedIdConfirmation={confirmation,survivors};
    const bankHelp=await page.locator('.orb-band-picker .panel-description').nth(1).textContent();assert(bankHelp.startsWith('Selected bands use the combined spectrum.'));const {selectOrbAnalysis}=await import(pathToFileURL(path.join(repoRoot,'src/js/render/visualizer-runtime.js')).href);const frame={channels:{L:{bandEnergies01:[0.9]},R:{bandEnergies01:[0.1]},C:{bandEnergies01:[0.5]}}};const selections=['L','R','C'].map(chanId=>({chanId,energy:selectOrbAnalysis({chanId,bandIds:[0]},frame).energyOverride01}));assert.deepEqual(selections.map(x=>x.energy),[0.9,0.1,0.5]);result.bandPickerHelp={displayed:bankHelp,actualSelectedEnergy:selections};
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(outputDir,'ui-control-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
