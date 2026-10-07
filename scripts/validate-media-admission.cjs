// Optional native media admission validation; Playwright stays external.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.AP_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version'), 'utf8').trim();
const html = fs.readFileSync(path.join(root, 'dist', `auralprint_${version.slice(1)}.html`), 'utf8');
const ogg = fs.readFileSync(path.join(root, 'docs/audits/evidence/2026-10-06_214431_PDT/ui/tone.ogg'));
function wav() {
  const frames = 48000, b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(48000, 24); b.writeUInt32LE(96000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(3000 * Math.sin(2 * Math.PI * 440 * i / 48000)), 44 + i * 2);
  return b;
}
const cases = [{ name: 'tone.ogg', type: 'application/ogg', data: ogg }, { name: 'unknown', type: '', data: wav() }, { name: 'arbitrary.bin', type: 'application/octet-stream', data: wav() }, { name: 'tone.wav', type: 'audio/wav', data: wav() }, { name: 'invalid.txt', type: 'text/plain', data: Buffer.from('not playable media'), invalid: true }];
const defect = process.env.RC12_EXPECT_DEFECT === '1';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.AP_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const results = [];
  try {
    for (const entry of ['picker', 'drop']) for (const item of defect ? cases.slice(0, 2) : cases) {
      const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('http://rc12.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
      await page.goto('http://rc12.test/'); await page.waitForFunction(() => document.querySelector('.orb-editor-card'));
      const decoded = item.invalid ? null : await page.evaluate(async base64 => { const ctx = new AudioContext(); try { const b = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); const a = await ctx.decodeAudioData(b.buffer); return { duration: a.duration, sampleRate: a.sampleRate }; } finally { await ctx.close(); } }, item.data.toString('base64'));
      if (decoded) assert.ok(decoded.duration > 0);
      const metadata = await page.evaluate(({ entry, name, type, base64 }) => {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0)); const file = new File([bytes], name, { type }); const dt = new DataTransfer(); dt.items.add(file);
        if (entry === 'picker') { const input = document.querySelector('#fileInput'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
        else document.querySelector('canvas').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
        return { actualMime: file.type, accept: document.querySelector('#fileInput').accept };
      }, { entry, name: item.name, type: item.type, base64: item.data.toString('base64') });
      assert.equal(metadata.actualMime, item.type);
      if (defect) await page.waitForTimeout(200);
      else if (item.invalid) await page.waitForFunction(() => /Playback|unsupported|unreadable/i.test(document.querySelector('#audioStatus').textContent));
      else await page.waitForFunction(() => document.querySelector('#queueList').children.length === 1 && !document.querySelector('#btnPlay').disabled);
      const model = await page.evaluate(() => ({ queueCount: document.querySelector('#queueList').children.length, playDisabled: document.querySelector('#btnPlay').disabled, status: document.querySelector('#audioStatus').textContent }));
      assert.equal(model.queueCount, defect ? 0 : 1);
      if (!defect) assert.equal(metadata.accept, '');
      if (item.invalid) { assert.equal(model.playDisabled, true); assert.match(model.status, /Playback|unsupported|unreadable/i); }
      else assert.equal(model.playDisabled, defect);
      assert.deepEqual(errors, []); results.push({ entry, name: item.name, ...metadata, decoded, ...model, errors }); await page.close();
    }
    const result = { version, browser: await browser.version(), defect, results };
    if (process.env.AP_REPORT) fs.writeFileSync(process.env.AP_REPORT, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
