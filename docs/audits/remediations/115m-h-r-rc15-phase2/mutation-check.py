from pathlib import Path
import subprocess,json
cases=[
 ('per-orb-only',[
  ('src/js/render/particle-governor.js','    if (this.frameActive && this.stats.emissions >= this.policy.maxEmissionsPerFrame) return false;',''),
  ('src/js/render/particle-governor.js','let remaining = this.policy.maxEmissionsPerFrame - this.stats.emissions;','let remaining = Number.MAX_SAFE_INTEGER;')], 'exact aggregate frame limit with 256'),
 ('first-orb-monopoly', [('src/js/render/particle-governor.js','else { tail = trail; head = trail.nextPending; }','else { head = trail; }'),('src/js/render/particle-governor.js','      this.servicePriority(trail);','')], 'one-particle quanta and persistent'),
 ('retain-emission-debt',[
  ('src/js/render/trail-system.js','? this.emitAccumulator % 1 : 0;','? this.emitAccumulator : 0;'),
  ('src/js/render/trail-system.js','this.emitAccumulator = Number.isFinite(total) ? total % 1 : 0;','this.emitAccumulator = Number.isFinite(total) ? total : 0;')], 'denied whole demand'),
 ('missing-retention', [('src/js/render/particle-governor.js','    if (this.heap.length >= this.policy.maxActiveParticles) this.retire(this.heap[0], "evicted");','')], 'exact retention boundaries'),
 ('stale-reset', [('src/js/render/trail-system.js','    while (this.particles.head) this.governor.retire(this.particles.head);','    this.particles = new ParticleList();')], 'lifecycle removal/reset'),
 ('stale-removal', [('src/js/render/particle-governor.js','      if (removed.governor === this) removed.dispose();','')], 'lifecycle removal/reset'),
 ('periodic-cursor-alias', [
  ('src/js/render/particle-governor.js','    for (let trail = this.nextPriority; trail; trail = trail.priorityNext) {','    const start = Math.max(0, this.trails.indexOf(this.nextPriority));\n    for (let i=0;i<this.trails.length;i++) { const trail=this.trails[(start+i)%this.trails.length];'),
  ('src/js/render/particle-governor.js','    let remaining = this.policy.maxEmissionsPerFrame - this.stats.emissions;','    let remaining = this.policy.maxEmissionsPerFrame - this.stats.emissions; let lastServed=null;'),
  ('src/js/render/particle-governor.js','      this.servicePriority(trail);','      lastServed=trail;'),
  ('src/js/render/particle-governor.js','    // Whole demand is never debt.','    if(head) this.nextPriority=head; else if(lastServed) this.nextPriority=this.trails[(this.trails.indexOf(lastServed)+1)%this.trails.length];\n    // Whole demand is never debt.')], 'periodic low-rate'),
 ('admission-bypass', [('src/js/render/particle-governor.js','    if (this.frameActive && this.stats.emissions >= this.policy.maxEmissionsPerFrame) return false;','')], 'admission itself'),
]
Path('work').mkdir(exist_ok=True)
results=[]
for name,changes,pattern in cases:
 originals={path:Path(path).read_text() for path,_,_ in changes}
 try:
  for path,before,after in changes:
   p=Path(path);s=p.read_text();assert before in s,(name,path);p.write_text(s.replace(before,after))
  r=subprocess.run(['node','--test','--test-isolation=none','--test-name-pattern='+pattern,'tests/rc15-phase2.test.js'],capture_output=True,text=True)
  output=r.stdout+r.stderr;Path('work/mutation-'+name+'.log').write_text(output)
  result={'mutation':name,'exitCode':r.returncode,'assertionDetected':r.returncode!=0 and 'AssertionError' in output}
  results.append(result)
 finally:
  for path,original in originals.items():Path(path).write_text(original)
Path('work/mutations.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
assert all(r['assertionDetected'] for r in results)
