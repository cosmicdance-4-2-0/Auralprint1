"""Disposable semantic mutations of the actual coordinator, no original-source edits.
Each original positive control must pass; mutant must fail the named assertion.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[5]
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'work/negative-controls.json'
work = Path(tempfile.mkdtemp(prefix='auralprint-aud007-mutations-'))
source = (root / 'src/js/audio/waveform-coordinator.js').read_text()
controls = [
 ('reset-release', 'Reset during decode clears intent', 'Reset must retain unsettled occupancy',
  [('function reset() {\n    generation++;', 'function reset() {\n    active = null;\n    generation++;')]),
 ('overlap', 'decoding A blocks all B/C', 'second decode cannot start before A settles',
  [('if (active) {', 'if (false && active) {')]),
 ('fifo', 'reading A reserves the entire pipeline', 'only newest pending request may start',
  [('let pending = null;', 'let pending = null;\n  const queue = [];'),
   ('pending.file = null;\n    pending.resolve();', 'queue.push({ ...pending });\n    pending.resolve();'),
   ('const next = pending;', 'const next = queue.shift() || pending;'),
   ('if (isCurrent(next)) start(next);', 'if (next) start(next);'),
   ('active = job;\n    void run(job);', 'generation = job.generation;\n    active = job;\n    void run(job);')]),
 ('stale-success', 'coordinator rejects stale extractor success', 'coordinator must reject stale success independent of extractor',
  [('if (isCurrent(job) && peaks)', 'if (peaks)')]),
 ('stale-rejection', 'obsolete decode rejection', 'stale rejection must not overwrite current status',
  [('if (isCurrent(job)) onUpdate("unavailable", null);', 'onUpdate("unavailable", null);')]),
 ('reset-restart', 'Reset leaves no pending restart after decode', 'Reset must discard pending work, never restart B',
  [('function reset() {\n    generation++;\n    discardPending();', 'function reset() {')]),
 ('reject-stuck', 'current decode rejection releases the gate', 'rejected decoder must release occupied slot',
  [('} catch {\n      if (isCurrent(job))', '} catch {\n      job.failed = true;\n      if (isCurrent(job))'),
   ('active = null;\n      job.resolve();', 'if (!job.failed) active = null;\n      job.resolve();')]),
]
results = []
for name, pattern, assertion, edits in controls:
 target = work / name
 target.mkdir(parents=True, exist_ok=True)
 (target/'src/js/audio').mkdir(parents=True, exist_ok=True)
 (target/'tests').mkdir(exist_ok=True)
 (target/'package.json').write_text('{"type":"module"}\n')
 for filename in ['waveform-coordinator.js', 'waveform-extractor.js']:
  shutil.copy2(root/'src/js/audio'/filename, target/'src/js/audio'/filename)
 shutil.copy2(root/'tests/waveform-coordinator.test.js', target/'tests/waveform-coordinator.test.js')
 cmd = ['node', '--test', '--test-isolation=none', '--test-name-pattern='+pattern, 'tests/waveform-coordinator.test.js']
 positive = subprocess.run(cmd, cwd=target, capture_output=True, text=True, timeout=15)
 mutated = source
 for old, new in edits:
  assert mutated.count(old) == 1, (name, old, mutated.count(old))
  mutated = mutated.replace(old, new)
 (target/'src/js/audio/waveform-coordinator.js').write_text(mutated)
 negative = subprocess.run(cmd, cwd=target, capture_output=True, text=True, timeout=15)
 text = negative.stdout + negative.stderr
 passed = positive.returncode == 0 and negative.returncode != 0 and assertion in text and 'ERR_ASSERTION' in text and 'cancelledByParent' not in text
 row = {'name':name, 'positiveExit':positive.returncode, 'mutantExit':negative.returncode, 'expectedAssertion':assertion, 'pass':passed,
        'mutation':edits, 'mutantOutput':text}
 results.append(row)
 if not passed: print(json.dumps(row, indent=2))
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({'originalSourceModified':False, 'cases':results, 'passed':sum(r['pass'] for r in results)}, indent=2)+'\n')
shutil.rmtree(work)
assert all(r['pass'] for r in results), 'semantic negative control failed'
print(json.dumps({'pass':True, 'controls':len(results)}))
