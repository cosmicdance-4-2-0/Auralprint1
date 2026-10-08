from pathlib import Path
import subprocess, json
cases=[
 ('proximity-deletion','src/js/render/trail-system.js','    this.particles.push({ xSim, ySim, bornSec: nowSec, rgbStart });','''    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if ((p.xSim-xSim)**2 + (p.ySim-ySim)**2 <= 1) this.particles.splice(i, 1);
    }
    this.particles.push({ xSim, ySim, bornSec: nowSec, rgbStart });''','emitted particles'),
 ('remove-config-ceiling','src/js/core/timing.js','return Math.min(valid, CONFIG.limits.timing.maxDeltaTimeSec);','return valid;','timing ceiling|effective simulation delta|production animation boundary'),
 ('bypass-frame-ceiling','src/js/main.js','simulationDeltaSec(dtSecRaw, runtime.settings.timing?.maxDeltaTimeSec)','Math.min(Math.max(dtSecRaw, 0), runtime.settings.timing.maxDeltaTimeSec)','production animation boundary'),
 ('unbounded-emission-timing','src/js/render/trail-system.js','boundedRate * CONFIG.limits.timing.maxDeltaTimeSec','boundedRate * runtime.settings.timing.maxDeltaTimeSec','per-Orb burst guard'),
 ('unbounded-emission-rate','src/js/render/trail-system.js','Math.ceil(boundedRate * CONFIG.limits.timing.maxDeltaTimeSec)','Math.ceil(particleSettings.emitPerSecond * CONFIG.limits.timing.maxDeltaTimeSec)','per-Orb burst guard'),
]
Path("work").mkdir(exist_ok=True)
results=[]
for name,path,before,after,pattern in cases:
 p=Path(path);original=p.read_text();assert before in original
 try:
  mutant=original.replace(before,after)
  if name=='unbounded-emission-timing': mutant='import { runtime } from "../core/preferences.js";\n'+mutant
  p.write_text(mutant)
  result=subprocess.run(['node','--test','--test-isolation=none','--test-name-pattern='+pattern,'tests/rc15-phase1.test.js'],capture_output=True,text=True)
  Path('work/mutation-'+name+'.log').write_text(result.stdout+result.stderr)
  results.append({'mutation':name,'exitCode':result.returncode,'detected':result.returncode!=0})
 finally:p.write_text(original)
Path('work/mutations.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
assert all(x['detected'] for x in results)
