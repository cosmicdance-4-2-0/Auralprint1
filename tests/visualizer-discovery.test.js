import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, symlinkSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import esbuild from "esbuild";
import { createVisualizerDiscoveryPlugin, visualizerSnapshotMatches } from "../scripts/visualizer-discovery.mjs";

const example = new URL("./support/visualizer-proof/", import.meta.url);
function project() {
  const root = mkdtempSync(path.join(tmpdir(), "auralprint-discovery-"));
  mkdirSync(path.join(root, "src/js/visualizers"), { recursive: true });
  writeFileSync(path.join(root, "src/js/visualizers/catalog.js"), "export const visualizerTypes=[];");
  return root;
}
function add(root, name, manifest = {}) {
  const directory = path.join(root, "src/js/visualizers", name);
  cpSync(example, directory, { recursive: true });
  writeFileSync(path.join(directory, "visualizer.json"), JSON.stringify({ contractVersion: 1, typeId: name, name, multiplicity: "multiple", capabilities: [], ...manifest }));
  return directory;
}
async function bundle(root, onSnapshot) {
  return esbuild.build({ entryPoints: [path.join(root, "src/js/visualizers/catalog.js")], bundle: true, format: "cjs", write: false, logLevel: "silent",
    plugins: [createVisualizerDiscoveryPlugin({ rootDir: root, onSnapshot })] });
}
function exportsOf(result) {
  const module = { exports: {} };
  Function("module", "exports", result.outputFiles[0].text)(module, module.exports);
  return module.exports.visualizerTypes;
}

test("directory inclusion/removal changes the actual bundled catalog with deterministic ordering", async () => {
  const root = project();
  try {
    assert.deepEqual(exportsOf(await bundle(root)), []);
    add(root, "z-marker"); add(root, "a-marker");
    const types = exportsOf(await bundle(root));
    assert.deepEqual(types.map(type => type.manifest.typeId), ["a-marker", "z-marker"]);
    assert.equal(typeof types[0].createVisualizer, "function");
    rmSync(path.join(root, "src/js/visualizers/a-marker"), { recursive: true });
    assert.deepEqual(exportsOf(await bundle(root)).map(type => type.manifest.typeId), ["z-marker"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const [label, setup] of [
  ["malformed JSON", root => writeFileSync(path.join(add(root, "a"), "visualizer.json"), "{")],
  ["unsupported ABI", root => add(root, "a", { contractVersion: 2 })],
  ["duplicate IDs", root => { add(root, "a"); add(root, "b", { typeId: "a" }); }],
  ["missing dependency", root => add(root, "a", { updateAfter: ["absent"] })],
  ["dependency cycle", root => { add(root, "a", { updateAfter: ["b"] }); add(root, "b", { updateAfter: ["a"] }); }],
  ["missing entry", root => rmSync(path.join(add(root, "a"), "index.js"))],
  ["missing factory export", root => writeFileSync(path.join(add(root, "a"), "index.js"), "export const unrelated=1;")],
  ["symlink module directory", root => { const dir = add(root, "a"); symlinkSync(dir, path.join(root, "src/js/visualizers/linked"), "junction"); }],
]) test(`discovery rejects ${label} before distribution assembly`, async () => {
  const root = project();
  try { setup(root); await assert.rejects(bundle(root)); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("watch snapshots include manifests and directory membership, including newly invalid modules", async () => {
  const root = project(); let snapshot;
  try {
    const directory = add(root, "a");
    await bundle(root, value => { snapshot = value; });
    assert.equal(visualizerSnapshotMatches(snapshot), true);
    writeFileSync(path.join(directory, "visualizer.json"), "{");
    assert.equal(visualizerSnapshotMatches(snapshot), false);
    await assert.rejects(bundle(root, value => { snapshot = value; }));
    mkdirSync(path.join(root, "src/js/visualizers/b"));
    assert.equal(visualizerSnapshotMatches(snapshot), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
