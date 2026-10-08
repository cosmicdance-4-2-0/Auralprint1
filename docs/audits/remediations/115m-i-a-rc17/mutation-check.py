"""Deliberate RC-17 regressions on isolated copies; production is never mutated."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import shutil
import subprocess

report_dir = Path(__file__).resolve().parent
root = report_dir.parents[3]
pref = "src/js/core/preferences.js"
ui = "src/js/ui/orb-editor.js"
orb = "src/js/render/orb.js"
mutations = [
    ("unbounded-persistence", pref,
     "const startAngleRad = normalizeOrbPhaseRad(orb.startAngleRad, fallback.startAngleRad);",
     "const startAngleRad = Number.isFinite(orb.startAngleRad) ? orb.startAngleRad : (Number.isFinite(fallback.startAngleRad) ? fallback.startAngleRad : 0);"),
    ("clamp-instead-of-wrap", pref,
     "const remainder = phase % TAU;", "return Math.max(0, Math.min(TAU, phase));\n  const remainder = phase % TAU;"),
    ("negative-remainder", pref,
     "const wrapped = remainder < 0 ? remainder + TAU : remainder;", "const wrapped = remainder;"),
    ("drop-valid-zero", pref,
     "Number.isFinite(value) ? value : (Number.isFinite(fallback) ? fallback : 0)",
     "Number.isFinite(value) && value !== 0 ? value : (Number.isFinite(fallback) ? fallback : 0)"),
    ("stale-endpoint-thumb", ui,
     "set(c.phase,c.phaseValue,orb.startAngleRad,", "set(c.phase,c.phaseValue,orb.startAngleRad === 0 ? CONFIG.limits.orbs.startAngleRad.max : orb.startAngleRad,"),
    ("integer-degree-readout", ui,
     "const phaseDegrees = formatOrbPhaseDegrees(orb.startAngleRad);", "const phaseDegrees = fmt(orb.startAngleRad * RAD_TO_DEG, 0);"),
    ("radians-in-aria", ui,
     'c.phase.setAttribute("aria-valuetext", `${phaseDegrees} degrees`)',
     'c.phase.setAttribute("aria-valuetext", `${orb.startAngleRad} degrees`)'),
    ("edit-teleports-live-orb", orb,
     "syncFromDef(def) {", "syncFromDef(def) {\n    this.angleRad = def.startAngleRad;"),
    ("visual-reset-ignores-design", orb,
     "resetPhase() { this.angleRad = this.startAngleRad; }", "resetPhase() {}"),
]
results = []
work = root.parent / "work" / "rc17"
work.mkdir(parents=True, exist_ok=True)
with TemporaryDirectory(prefix="mutations-", dir=work) as temp:
    checkout = Path(temp)
    shutil.copytree(root / "src", checkout / "src")
    shutil.copytree(root / "tests", checkout / "tests")
    for name, relative, before, after in mutations:
        path = checkout / relative
        original = path.read_text()
        assert original.count(before) == 1, name
        path.write_text(original.replace(before, after))
        try:
            run = subprocess.run(["node", "--test", "--test-isolation=none", "tests/rc17-designed-phase.test.js", "tests/rc17-phase-editor.test.js"],
                                 cwd=checkout, text=True, capture_output=True, timeout=60)
            output = run.stdout + run.stderr
            (work / f"mutation-{name}.log").write_text(output)
            failures = [line for line in output.splitlines() if line.startswith("✖ RC-17")]
            results.append({"mutation": name, "exitCode": run.returncode,
                            "detected": run.returncode != 0 and "AssertionError" in output and "SyntaxError" not in output,
                            "failedAssertions": failures})
        finally:
            path.write_text(original)
(report_dir / "mutations.json").write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps(results, indent=2))
assert all(r["detected"] for r in results)
