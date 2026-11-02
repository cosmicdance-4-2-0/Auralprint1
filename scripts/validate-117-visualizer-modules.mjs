import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFileSync, cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";
import { projectCopy, discard } from "./test-support/watch-harness.mjs";

// Isolated activation seams exist only in disposable builds, never in the app.
const dir = projectCopy();
let browser, server;
const errors = [];
const results = [];
async function build() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/build.mjs"], { cwd: dir, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Proof build exited ${code}`)));
  });
}
try {
  appendFileSync(path.join(dir, "src/js/main.js"), `\nglobalThis.__visualizerModuleProof = {
  getModules: () => visualizerModules,
  isReady: () => state.canvas && state.orbs.length === runtime.settings.orbs.length,
  getSettings: () => runtime.settings, getOrbCount: () => state.orbs.length };\n`);
  cpSync(new URL("../tests/support/visualizer-proof/", import.meta.url), path.join(dir, "src/js/visualizers/proof-marker"), { recursive: true });
  await build();
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const relative = pathname === "/portable" ? `auralprint_${readFileSync(path.join(dir, "version"), "utf8").trim().slice(1)}.html`
      : pathname === "/hosted" ? "hosted/index.html" : `hosted${pathname}`;
    const file = path.resolve(dir, "dist", relative);
    if (!file.startsWith(path.join(dir, "dist") + path.sep) || !existsSync(file)) {
      response.writeHead(404); response.end(); return;
    }
    response.setHeader("Content-Type", ({ ".html": "text/html", ".webmanifest": "application/manifest+json", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml" })[path.extname(file)] ?? "application/octet-stream");
    response.end(readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true, ...(process.env.AP_CHROMIUM_PATH ? { executablePath: process.env.AP_CHROMIUM_PATH } : {}) });
  for (const edition of ["portable", "hosted"]) {
    const page = await browser.newPage();
    page.on("pageerror", error => errors.push(`${edition}: ${error.message}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/${edition}`);
    await page.waitForFunction(() => globalThis.__visualizerModuleProof?.isReady());
    const result = await page.evaluate(() => {
      const { getModules, getSettings, getOrbCount } = globalThis.__visualizerModuleProof;
      const modules = getModules();
      const catalog = modules.catalog;
      const before = JSON.stringify(getSettings());
      const orbCount = getOrbCount();
      const defaultCreations = globalThis.__visualizerProofCreates ?? 0;
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
      const target = canvas.getContext("2d"); target.fillStyle = "#000000"; target.fillRect(0, 0, 64, 64);
      let dpr = 1;
      const host = modules.createHost({ canvas, getDpr: () => dpr,
        project: (x, y) => ({ x: canvas.width / 2 + x * dpr, y: canvas.height / 2 + y * dpr }) });
      const request = (instanceId, colorCss, fail = false) => ({ typeId: "proof-marker", instanceId, settings: { colorCss, fail } });
      const pixel = () => [...target.getImageData(32, 32, 1, 1).data];
      const [identity] = host.reconcile([request("one", "#ff0000")]);
      host.update({ dtSec: 0, motionDtSec: 0, nowSec: 1, simPaused: true, analysisFrame: null });
      host.render({}); const red = pixel();
      const retained = host.reconcile([request("one", "#00ff00")])[0] === identity;
      host.render({}); const green = pixel();
      canvas.width = 0; host.render({});
      const zeroViewportSafe = host.getInstances()[0].status === "active";
      canvas.width = canvas.height = 128; dpr = 2; host.render({});
      const dprInside = [...target.getImageData(64, 67, 1, 1).data];
      const dprOutside = [...target.getImageData(64, 69, 1, 1).data];
      canvas.width = canvas.height = 64; dpr = 1;
      target.fillStyle = "#000000"; target.fillRect(0, 0, 64, 64);
      host.reconcile([request("bad", "#ff0000", true)]); host.render({});
      const failedDraw = pixel();
      host.reconcile([request("bad", "#ff0000", true), request("survivor", "#00ff00")]); host.render({});
      const recovered = pixel();
      const failedStatus = host.getInstances()[0].status;
      const failures = host.getFailures().length;
      const disposed = host.dispose();
      return { types: catalog.types.map(type => type.manifest.typeId), defaultCreations, retained, red, green, zeroViewportSafe, dprInside, dprOutside, failedDraw, recovered, failedStatus, failures, disposed,
        settingsUnchanged: before === JSON.stringify(getSettings()), orbsUnchanged: orbCount === getOrbCount() };
    });
    assert.deepEqual(result.types, ["proof-marker"]);
    assert.equal(result.defaultCreations, 0); assert.equal(result.retained, true);
    assert.deepEqual(result.red, [255, 0, 0, 255]); assert.deepEqual(result.green, [0, 255, 0, 255]);
    assert.equal(result.zeroViewportSafe, true); assert.deepEqual(result.dprInside, [0, 255, 0, 255]); assert.deepEqual(result.dprOutside, [0, 0, 0, 0]);
    assert.deepEqual(result.failedDraw, [0, 0, 0, 255]); assert.deepEqual(result.recovered, [0, 255, 0, 255]);
    assert.equal(result.failedStatus, "suspended"); assert.equal(result.failures, 1); assert.equal(result.disposed, true);
    assert.equal(result.settingsUnchanged, true); assert.equal(result.orbsUnchanged, true);
    results.push({ edition, ...result }); await page.close();
  }
  // Removal must change the real production import graph in both editions.
  rmSync(path.join(dir, "src/js/visualizers/proof-marker"), { recursive: true });
  await build();
  for (const edition of ["portable", "hosted"]) {
    const page = await browser.newPage();
    page.on("pageerror", error => errors.push(`${edition}-removed: ${error.message}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/${edition}`);
    await page.waitForFunction(() => globalThis.__visualizerModuleProof?.isReady());
    assert.equal(await page.evaluate(() => globalThis.__visualizerModuleProof.getModules().catalog.types.length), 0);
    assert.equal(await page.evaluate(() => globalThis.__visualizerProofCreates ?? 0), 0);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: await browser.version(), executable: process.env.AP_CHROMIUM_PATH ?? "Playwright default", results, removedFromBoth: true, errors }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  discard(dir);
}
