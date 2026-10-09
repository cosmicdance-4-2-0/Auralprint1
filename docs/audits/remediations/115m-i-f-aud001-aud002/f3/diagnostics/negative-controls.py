#!/usr/bin/env python3
"""Opt-in semantic mutations in disposable copies; never edit the checkout."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[6]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path)
args = parser.parse_args()

UI = 'src/js/ui/ui.js'
ENGINE = 'src/js/audio/audio-engine.js'
MANAGER = 'src/js/audio/input-source-manager.js'
startup_guard = '// Startup has not allocated a candidate. Only the current File may fail.\n      if (!isCurrentRequest()) return false;'
play_guard = 'if (mediaEl !== target) return;\n      // Resume failure'
play_projection = '// Resume failure does not invalidate the loaded File/session or graph.\n      state.audio.isPlaying = !target.paused;\n      state.audio.transportError = describePlaybackError(err, { contextFailure: true });'
ui_boundary = '// Contain an unexpected engine rejection at this UI boundary without\n        // unloading a recoverable File or reporting an obsolete operation.'
controls = [
    ('constructor-settlement-bypassed', ENGINE, startup_guard,
     'if (err.name === "NotSupportedError") throw err;\n      ' + startup_guard,
     'tests/file-activation-ownership.test.js', 'engine constructor failure is a controlled'),
    ('initial-resume-settlement-bypassed', ENGINE, startup_guard,
     'if (err.name !== "NotSupportedError") throw err;\n      ' + startup_guard,
     'tests/file-activation-ownership.test.js', 'engine initial resume failure is a controlled'),
    ('file-error-authorization-removed', ENGINE, startup_guard,
     '// Startup error writes without current request authorization.',
     'tests/file-activation-ownership.test.js', 'obsolete initial resume reject after file'),
    ('obsolete-initial-rejection-escapes-engine', ENGINE, startup_guard,
     '// Startup\n      if (!isCurrentRequest()) throw err;',
     'tests/file-activation-ownership.test.js', 'direct engine obsolete initial rejection'),
    ('current-play-error-projection-removed', ENGINE, play_projection,
     '// Resume failure\n      state.audio.isPlaying = !target.paused;\n      state.audio.transportError = "";',
     'tests/transport-ownership.test.js', 'current Play resume failure retains File'),
    ('obsolete-play-rejection-escapes', ENGINE, play_guard,
     'if (mediaEl !== target) throw err;\n      // Resume failure',
     'tests/transport-ownership.test.js', 'obsolete Play resume rejects after clear'),
    ('ui-play-rejection-containment-bypassed', UI, ui_boundary, 'throw err;',
     'tests/targeted-audit.test.js', 'UI Play rejection boundary current'),
    ('file-failure-notification-duplicated', UI,
     'if (!ok) {\n        RecorderEngine.onTransportMutation("track-change-failed", {',
     'if (!ok) {\n        RecorderEngine.onTransportMutation("track-change-failed", { requestId, filename: file.name, error: state.audio.transportError });\n        RecorderEngine.onTransportMutation("track-change-failed", {',
     'tests/targeted-audit.test.js', 'UI picker current startup failure'),
    ('manager-error-authorization-removed', MANAGER,
     'if (!isLoadRequestCurrent(requestId)) return false;\n      audioEngine.unload();',
     'audioEngine.unload();',
     'tests/input-source-manager.test.js', 'manager contains obsolete engine rejection'),
]
results = {'phase': 'F.3', 'root': str(ROOT), 'node': subprocess.check_output(['node', '--version'], text=True).strip(), 'controls': []}
for name, file, before, after, suite, pattern in controls:
    with tempfile.TemporaryDirectory(prefix='auralprint-f3-control-') as temporary:
        copy = Path(temporary)
        for directory in ['src', 'tests', 'scripts']:
            shutil.copytree(ROOT / directory, copy / directory)
        for filename in ['version', 'package.json', 'package-lock.json']:
            shutil.copy2(ROOT / filename, copy / filename)
        (copy / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
        target = copy / file
        text = target.read_text()
        expected = 1
        if text.count(before) != expected:
            raise RuntimeError(f'{name}: expected {expected} unique semantic markers, got {text.count(before)}')
        target.write_text(text.replace(before, after))
        command = ['node', '--test', '--test-reporter=tap', f'--test-name-pattern={pattern}', suite]
        process = subprocess.run(command, cwd=copy, text=True, capture_output=True, timeout=60)
        log = process.stdout + process.stderr
        detected = process.returncode == 1 and 'ERR_ASSERTION' in log and 'not ok' in log
        infrastructure = any(token in log for token in ['SyntaxError:', 'ReferenceError:', 'TypeError:', 'ERR_MODULE_NOT_FOUND', 'cancelledByParent'])
        result = {'name': name, 'file': file, 'mutation': {'before': before, 'after': after},
                  'command': command, 'exitStatus': process.returncode, 'detectedByAssertion': detected,
                  'infrastructureFailure': infrastructure, 'log': log}
        results['controls'].append(result)
        print(f'{name}: exit={process.returncode}, assertion={detected}, infrastructure={infrastructure}', flush=True)
results['summary'] = {'controls': len(controls), 'meaningfulDetections': sum(x['detectedByAssertion'] and not x['infrastructureFailure'] for x in results['controls'])}
if args.output:
    args.output.write_text(json.dumps(results, indent=2) + '\n')
raise SystemExit(0 if results['summary']['meaningfulDetections'] == len(controls) else 1)
