"""Optional mutations on isolated copies; production source is never changed."""
from pathlib import Path
from tempfile import TemporaryDirectory
import shutil,json,subprocess
root=Path(__file__).resolve().parents[4]
report_dir=Path(__file__).resolve().parent
mutations=[
 ('capped-orb-motion','src/js/render/orb.js','this.motion.angularSpeedRadPerSec * motionDtSec;','this.motion.angularSpeedRadPerSec * dtSec;'),
 ('unbounded-motion-catchup','src/js/core/timing.js','elapsedSec <= CONFIG.limits.timing.motionDiscontinuitySec ? elapsedSec : 0','true ? elapsedSec : 0'),
 ('unbounded-emission-delta','src/js/main.js','simulationDeltaSec(elapsedSec, runtime.settings.timing?.maxDeltaTimeSec) : 0','elapsedSec : 0'),
 ('full-trail-expiry-scan','src/js/render/trail-system.js','else if (ordered) break;','else if (false) break;'),
 ('incorrect-unordered-early-exit','src/js/render/trail-system.js','const ordered = this.particles.birthOrderMonotonic;','const ordered = true;'),
 ('broken-retirement-ownership','src/js/render/particle-governor.js','node.heapIndex = -1;','node.heapIndex = 0;'),
 ('stale-diagnostics','src/js/ui/scene-panel.js','refreshDiagnostics();\n    if (!settings || settings === lastSettingsRef) return false;','if (!settings || settings === lastSettingsRef) return false;\n    refreshDiagnostics();'),
 ('free-ring-pause-ignored','src/js/render/visualizer-runtime.js','} else if (!simPaused) {','} else {'),
]
results=[]
with TemporaryDirectory(prefix='auralprint-timing-mutations-') as d:
 checkout=Path(d);shutil.copytree(root/'src',checkout/'src');shutil.copytree(root/'tests',checkout/'tests')
 for name,relative,before,after in mutations:
  source=checkout/relative;original=source.read_text();assert before in original,name;source.write_text(original.replace(before,after))
  try:
   run=subprocess.run(['node','--test','--test-isolation=none','tests/rc15-timing-performance.test.js','tests/scene-panel.test.js'],cwd=checkout,text=True,capture_output=True,timeout=60)
   output=run.stdout+run.stderr;lines=output.splitlines()
   if len(lines)>180:lines=lines[:100]+['[Large assertion diff omitted.]']+lines[-80:]
   (report_dir/f'mutation-{name}.log').write_text('\n'.join(line.rstrip() for line in lines)+'\n')
   results.append({'mutation':name,'detected':run.returncode!=0 and ('AssertionError' in output or 'TypeError' in output) and 'SyntaxError' not in output,'exitCode':run.returncode})
  finally:source.write_text(original)
(report_dir/'mutations.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2));assert all(r['detected'] for r in results)
