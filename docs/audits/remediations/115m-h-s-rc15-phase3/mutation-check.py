from pathlib import Path
import subprocess,json
Path('work').mkdir(exist_ok=True)
cases=[
 ('admission-removed',[('src/js/core/orb-admission.js','orbs.length > CONFIG.limits.orbs.maxCount','false')],'immutable admission policy'),
 ('add-duplicate-unbounded',[('src/js/core/orb-collection.js',' || orbs.length >= CONFIG.limits.orbs.maxCount','')],'Add/Duplicate refuse'),
 ('quadratic-id-repair',[('src/js/core/orb-collection.js',': `ORB${nextSuffix++}`',': allocateOrbId([...incoming, ...normalized])')],'duplicate-heavy repair'),
 ('trace-materialization',[('src/js/render/renderer.js','particles.suffix(neededPts)','particles.slice(Math.max(0, particles.length - neededPts))')],'normal rendering preserves'),
 ('runtime-admission-bypass',[('src/js/render/visualizer-runtime.js','    assertRuntimeOrbAdmission(orbs);','')],'runtime admission fails'),
 ('duplicate-runtime-ownership',[('src/js/core/orb-admission.js','    if (ids.has(orb.id)) throw new RangeError("Runtime Orb identities must be unique.");','')],'runtime admission fails'),
 ('quadratic-tooltip-discovery',[('src/js/ui/ui.js','    const label = labelsById.get(control.id);','    const label = Array.from(document.querySelectorAll("label[for]")).find(label=>label.htmlFor===control.id);')],'tooltip discovery indexes'),
 ('adapter-owned-membership',[('src/js/render/visualizer-runtime.js','particleGovernor.setTrails(orbs\n    .filter(orb => orb.trail?.governor === particleGovernor)\n    .map(orb => orb.trail))','particleGovernor.setTrails(visualizers\n    .filter(v => v.type === "orb" && v.orb?.trail?.governor === particleGovernor)\n    .map(v => v.orb.trail))')],'replaceable Orb lifecycle'),
 ('double-particle-render',[('src/js/render/renderer.js','for (const p of particles)','for (const p of [...particles, ...particles])')],'normal rendering preserves'),
]
results=[]
for name,changes,pattern in cases:
 originals={path:Path(path).read_text() for path,_,_ in changes}
 try:
  for path,before,after in changes:
   p=Path(path);s=p.read_text();assert before in s;(p.write_text(s.replace(before,after)))
  r=subprocess.run(['node','--test','--test-isolation=none','--test-name-pattern='+pattern,('tests/targeted-audit.test.js' if name=='quadratic-tooltip-discovery' else 'tests/rc15-phase3.test.js')],capture_output=True,text=True,timeout=30)
  output=r.stdout+r.stderr;Path('work/mutation-'+name+'.log').write_text(output)
  results.append({'mutation':name,'exitCode':r.returncode,'assertionDetected':r.returncode!=0 and 'AssertionError' in output})
 finally:
  for path,s in originals.items():Path(path).write_text(s)
Path('work/mutations-phase3.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2));assert all(r['assertionDetected'] for r in results)
