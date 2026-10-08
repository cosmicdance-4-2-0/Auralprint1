"""Optional mutations run on isolated source/test copies; production stays intact."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import shutil
import subprocess

root = Path(__file__).resolve().parents[4]
report_dir = Path(__file__).resolve().parent
mutations = [
    ('old-emission-cap', 'src/js/core/particle-safety.js', 'limits.max,source[key]', 'CONFIG.defaults.particleSafety[key],source[key]'),
    ('old-retention-cap', 'src/js/render/particle-governor.js', 'this.#policy = Object.freeze(normalizeParticleSafety(policy));', 'this.#policy = Object.freeze({...normalizeParticleSafety(policy), maxActiveParticles: Math.min(16384, normalizeParticleSafety(policy).maxActiveParticles)});'),
    ('governor-recreation', 'src/js/render/visualizer-runtime.js', 'const particleGovernor = new ParticleGovernor', 'let particleGovernor = new ParticleGovernor'),
    ('missing-retention-trim', 'src/js/render/particle-governor.js', 'while (this.heap.length > next.maxActiveParticles)', 'while (false && this.heap.length > next.maxActiveParticles)'),
    ('stale-runtime-policy', 'src/js/render/visualizer-runtime.js', 'return particleGovernor.applyPolicy(source);', 'return false;'),
    ('incorrect-zero-retention', 'src/js/render/particle-governor.js', 'if (this.policy.maxActiveParticles === 0) return false;', 'if (false) return false;'),
    ('persist-runtime-counter', 'src/js/presets/preset-codec.js', 'next.particleSafety = normalizeParticleSafety(incoming.particleSafety);', 'next.particleSafety = {...normalizeParticleSafety(incoming.particleSafety), emissions: 0};'),
]
results=[]
with TemporaryDirectory(prefix='auralprint-budget-mutations-') as directory:
    checkout=Path(directory)
    shutil.copytree(root/'src',checkout/'src');shutil.copytree(root/'tests',checkout/'tests')
    for name,relative,before,after in mutations:
        file=checkout/relative;original=file.read_text()
        # The canonical normalizer's formatting can differ; keep its assertion explicit.
        if name=='old-emission-cap':
            before='limits.max, source[key]';after='key === "maxEmissionsPerFrame" ? 512 : limits.max, source[key]'
        assert before in original,(name,before)
        mutated=original.replace(before,after)
        if name=='governor-recreation':mutated=mutated.replace('return particleGovernor.applyPolicy(source);','particleGovernor.dispose(); particleGovernor = new ParticleGovernor(source); return true;')
        file.write_text(mutated)
        try:
            run=subprocess.run(['node','--test','--test-isolation=none','tests/rc15-budgets.test.js'],cwd=checkout,text=True,capture_output=True)
            output=run.stdout+run.stderr
            lines=output.splitlines()
            if len(lines)>160: lines=lines[:100]+['[Large assertion diff omitted; final failure details follow.]']+lines[-60:]
            (report_dir/f'mutation-{name}.log').write_text('\n'.join(line.rstrip() for line in lines)+'\n')
            detected=run.returncode!=0 and ('AssertionError' in output or 'TypeError' in output) and 'SyntaxError' not in output
            results.append({'mutation':name,'detected':detected,'exitCode':run.returncode})
        finally:file.write_text(original)
(report_dir/'mutations.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
assert all(result['detected'] for result in results)
