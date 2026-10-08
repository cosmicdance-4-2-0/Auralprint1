import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Isolated temporary artifacts; npm test does not depend on a production build.
test("RC-20 portable/hosted contracts and isolated failure/mutation controls", t => {
  const script = fileURLToPath(new URL("./rc20_packaging.py", import.meta.url));
  const candidates = [];
  if (process.env.PYTHON) candidates.push([process.env.PYTHON, []]);
  candidates.push(["python", []], ["python3", []]);
  if (process.platform === "win32") candidates.push(["py", ["-3"]]);
  let result;
  for (const [command, prefix] of candidates) {
    result = spawnSync(command, [...prefix, script], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    if (result.error?.code === "ENOENT") continue;
    break;
  }
  t.diagnostic(result.stdout + result.stderr);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, "Python RC-20 packaging assertions failed");
});
