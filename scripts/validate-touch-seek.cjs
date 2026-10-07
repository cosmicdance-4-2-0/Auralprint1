// Optional native TouchEvent regression; physical mobile gestures are not claimed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const built = fs.readFileSync(path.join(root, 'dist', `auralprint_${version.slice(1)}.html`), 'utf8');
const html = built.replace('  main();\n})();', '  main();\n  window.rc14 = {AudioEngine, Scrubber};\n})();');
assert.notEqual(html, built);
const defect = process.env.RC14_EXPECT_DEFECT === '1';
function wav() {
  const rate = 8000, frames = rate * 20, b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * 2, 40); return b;
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }); const results = [];
  try {
    for (const mode of defect ? ['cancel-canvas'] : ['cancel-canvas', 'cancel-window', 'end', 'reset', 'load', 'ordinary']) {
      const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('http://rc14.test/**', r => r.fulfill({ contentType: 'text/html', body: html })); await page.goto('http://rc14.test/');
      await page.locator('#fileInput').setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: wav() }); await page.waitForFunction(() => !document.querySelector('#btnPlay').disabled);
      await page.locator('#btnStop').click();
      const result = await page.evaluate(async mode => {
        const a = window.rc14, el = a.AudioEngine.getMediaEl(), canvas = document.querySelector('#scrubberCanvas');
        const touch = frac => { const bounds = canvas.getBoundingClientRect(); return new Touch({ identifier: 1, target: canvas, clientX: bounds.left + bounds.width * frac, clientY: bounds.top + 10 }); };
        const event = (type, frac) => new TouchEvent(type, { touches: frac === null ? [] : [touch(frac)], bubbles: true, cancelable: true });
        canvas.dispatchEvent(event('touchstart', .25)); const startTime = el.currentTime;
        if (mode === 'cancel-canvas') canvas.dispatchEvent(event('touchcancel', null));
        if (mode === 'cancel-window') window.dispatchEvent(event('touchcancel', null));
        if (mode === 'end') window.dispatchEvent(event('touchend', null));
        if (mode === 'reset') a.Scrubber.reset();
        if (mode === 'load') await a.Scrubber.loadFile(new File(['invalid'], 'waveform-failure'));
        const move = event('touchmove', .75); document.querySelector('#btnLoad').dispatchEvent(move);
        const afterTime = el.currentTime;
        // A fresh valid drag must still work after every terminal path.
        canvas.dispatchEvent(event('touchstart', .5)); window.dispatchEvent(event('touchmove', .6)); window.dispatchEvent(event('touchend', null));
        return { startTime, afterTime, intercepted: move.defaultPrevented, freshDragTime: el.currentTime };
      }, mode);
      assert.ok(Math.abs(result.startTime - 5) < .1);
      assert.equal(result.intercepted, defect || mode === 'ordinary');
      assert.ok(Math.abs(result.afterTime - (defect || mode === 'ordinary' ? 15 : 5)) < .1);
      assert.ok(Math.abs(result.freshDragTime - 12) < .1);
      assert.deepEqual(errors, []); results.push({ mode, ...result, errors }); await page.close();
    }
    const result = { version, browser: await browser.version(), defect, results };
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
