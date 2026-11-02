import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { projectCopy, startWatch, outputs, inventory, discard } from "../scripts/test-support/watch-harness.mjs";

test("actual watch adds/removes discovered modules and retains both editions on invalid metadata", { timeout: 90_000 }, async () => {
  const dir = projectCopy();
  const watch = startWatch(dir);
  const version = readFileSync(path.join(dir, "version"), "utf8").trim();
  const destination = path.join(dir, "src/js/visualizers/proof-marker");
  const example = new URL("./support/visualizer-proof/", import.meta.url);
  try {
    await watch.wait(() => watch.successes > 0, "initial discovery build");
    assert.ok(outputs(dir, version).every(html => !html.includes("Static module proof")));
    let before = watch.successes;
    cpSync(example, destination, { recursive: true });
    await watch.wait(() => watch.successes > before && outputs(dir, version).every(html => html.includes("Static module proof")), "directory-only addition in both editions");

    const good = inventory(dir, version);
    before = watch.successes;
    const logOffset = watch.log.length;
    const manifestFile = path.join(destination, "visualizer.json");
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    writeFileSync(manifestFile, "{");
    await watch.wait(() => watch.log.slice(logOffset).includes("Visualizer discovery:"), "invalid metadata failure");
    assert.deepEqual(inventory(dir, version), good);
    assert.equal(watch.successes, before);
    writeFileSync(manifestFile, JSON.stringify({ ...manifest, name: "Recovered module proof" }));
    await watch.wait(() => watch.successes > before && outputs(dir, version).every(html => html.includes("Recovered module proof")), "metadata recovery in both editions");

    before = watch.successes;
    rmSync(destination, { recursive: true });
    await watch.wait(() => watch.successes > before && outputs(dir, version).every(html => !html.includes("proof-marker")), "directory-only removal in both editions");
  } finally { await watch.stop(true); discard(dir); }
});
