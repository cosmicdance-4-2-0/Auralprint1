// Optional negative controls. Only disposable copies are mutated; the checkout
// and accepted baseline are never edited, even if execution is interrupted.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const output = resolve(process.argv[2] || join(root, "work/rc21-rc22/mutations"));
mkdirSync(output, { recursive: true });
const panel = "src/js/ui/visualizers-panel.js";
const mutations = [
  ["original-help", "src/js/ui/orb-band-picker.js", source => source.replace(/Channel selects both[^"\n]+/, "Selected bands use the combined spectrum. Channel controls the waveform. With no explicit targets, the orb uses its channel’s full-spectrum energy.")],
  ["always-center-targeting", "src/js/render/visualizer-runtime.js", source => source.replace(/const sourceBand = channel === "L"[\s\S]*?analysisFrame.channels.C\);/, "const sourceBand = analysisFrame.channels.C;")],
  ["original-id-only-lookup", panel, source => source.replace('entry.type === "orb" && entry.id === id', 'entry.id === id')],
  ["suppressed-confirmation", panel, source => source.replace('!confirmRemoveOrb({ id, displayName: item.displayName })', 'false')],
  ["broken-cancel", panel, source => source.replace('!confirmRemoveOrb({ id, displayName: item.displayName })', '!(confirmRemoveOrb({ id, displayName: item.displayName }), true)')],
  ["wrong-orb-removal", panel, source => source.replace('if (!removeOrb(id))', 'if (!removeOrb(items.filter(entry => entry.type === "orb").at(-1).id))')],
  ["ring-disposed-on-delete", "src/js/render/visualizer-runtime.js", source => source.replace('if (!overlay) overlay = createSpectralRing();', 'if (!overlay) overlay = createSpectralRing(); else overlay.dispose();')],
  ["broken-survivor-focus", panel, source => source.replace('if (focus) focusEdit(focus.id);', 'if (focus) focusEdit(id);')],
  ["missing-orb-falls-through", panel, source => source.replace('items.find((entry) => entry.type === "orb" && entry.id === id)', '(items.find((entry) => entry.type === "orb" && entry.id === id) || items.find(entry => entry.id === id))')],
];
const results = [];
for (const [name, file, mutate] of mutations) {
  const scratch = mkdtempSync(join(tmpdir(), "rc21-22-mutation-"));
  try {
    cpSync(join(root, "src"), join(scratch, "src"), { recursive: true });
    mkdirSync(join(scratch, "tests/helpers"), { recursive: true });
    for (const test of ["rc21-band-picker-help.test.js", "rc22-orb-removal.test.js", "helpers/ui-dom.js"]) cpSync(join(root, "tests", test), join(scratch, "tests", test));
    writeFileSync(join(scratch, "package.json"), '{"type":"module"}\n');
    const original = readFileSync(join(scratch, file), "utf8"), changed = mutate(original);
    assert.notEqual(changed, original, `${name}: replacement did not match`);
    writeFileSync(join(scratch, file), changed);
    const run = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "tests/rc21-band-picker-help.test.js", "tests/rc22-orb-removal.test.js"], { cwd: scratch, encoding: "utf8" });
    const log = (run.stdout || "") + (run.stderr || "");
    writeFileSync(join(output, `mutation-${name}.log`), log);
    const killed = run.status !== 0 && log.includes("ERR_ASSERTION") && !/SyntaxError|ERR_MODULE_NOT_FOUND/.test(log);
    results.push({ name, killed, exitCode: run.status, failures: Number(log.match(/# fail (\d+)/)?.[1]) });
    assert.equal(killed, true, `${name}: must fail through behavioral assertions`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
writeFileSync(join(output, "mutations.json"), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results, null, 2));
