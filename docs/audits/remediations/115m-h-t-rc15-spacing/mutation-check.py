"""Optional focused mutation probe; restores production source in every outcome."""
from pathlib import Path
import json
import subprocess

root = Path(__file__).resolve().parents[4]
report_dir = Path(__file__).resolve().parent
source = root / 'src/js/render/trail-system.js'
original = source.read_text()
mutations = [
    ('unconditional-duplicates', 'spacingPx > 0 && this.pendingEmissions > 0', 'false && this.pendingEmissions > 0'),
    ('no-dpr-conversion', 'spacingPx * (Number.isFinite(dpr) && dpr > 0 ? dpr : 1)', 'spacingPx'),
    ('reject-exact-threshold', 'dx * dx + dy * dy >= thresholdSquared', 'dx * dx + dy * dy > thresholdSquared'),
    ('compare-oldest-history', 'this.particles.tail?.particle', 'this.particles.head?.particle'),
    ('retain-whole-debt', 'total % 1 : 0', 'total : 0'),
]
results = []
try:
    for name, before, after in mutations:
        assert before in original, name
        source.write_text(original.replace(before, after))
        result = subprocess.run(['node', '--test', '--test-isolation=none', 'tests/rc15-spacing.test.js'], cwd=root, text=True, capture_output=True)
        output = result.stdout + result.stderr
        (report_dir / f'mutation-{name}.log').write_text('\n'.join(line.rstrip() for line in output.splitlines()) + '\n')
        results.append({'mutation': name, 'detected': result.returncode != 0, 'exitCode': result.returncode})
        source.write_text(original)
finally:
    source.write_text(original)
(report_dir / 'mutations.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
assert all(result['detected'] for result in results)
