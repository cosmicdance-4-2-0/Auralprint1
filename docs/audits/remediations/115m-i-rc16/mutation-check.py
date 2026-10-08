"""Focused mutations on isolated copies; never modify production source."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import shutil
import subprocess

report_dir = Path(__file__).resolve().parent
root = report_dir.parents[3]
mutations = [
    ("permissive-coercion", "src/js/core/preferences.js",
     'const n = v;\n      if (typeof n !== "number" || !Number.isInteger(n)) continue;',
     'const n = Number(v);\n      if (!Number.isInteger(n)) continue;'),
    ("drop-valid-zero", "src/js/core/preferences.js", 'if (n < 0 || n >= bandCount)', 'if (n <= 0 || n >= bandCount)'),
    ("reject-all-targets", "src/js/core/preferences.js", 'const n = v;', 'const n = NaN;'),
    ("free-ring-pause-ignored", "src/js/render/visualizer-runtime.js", '} else if (!simPaused) {', '} else {'),
]
results = []
(root / "work").mkdir(exist_ok=True)
with TemporaryDirectory(prefix="auralprint-rc16-mutations-", dir=root / "work") as temp:
    checkout = Path(temp)
    shutil.copytree(root / "src", checkout / "src")
    shutil.copytree(root / "tests", checkout / "tests")
    for name, relative, before, after in mutations:
        path = checkout / relative
        original = path.read_text()
        assert original.count(before) == 1, name
        path.write_text(original.replace(before, after))
        try:
            run = subprocess.run(["node", "--test", "--test-isolation=none", "tests/rc16-band-references.test.js", "tests/rc18-motion-pause.test.js"],
                                 cwd=checkout, text=True, capture_output=True, timeout=60)
            output = run.stdout + run.stderr
            (report_dir / f"mutation-{name}.log").write_text("\n".join(line.rstrip() for line in output.splitlines()) + "\n")
            results.append({"mutation": name, "exitCode": run.returncode,
                            "detected": run.returncode != 0 and "AssertionError" in output and "SyntaxError" not in output})
        finally:
            path.write_text(original)
(report_dir / "mutations.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results, indent=2))
assert all(r["detected"] for r in results)
