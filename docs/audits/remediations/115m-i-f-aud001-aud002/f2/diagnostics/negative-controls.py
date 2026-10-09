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
controls = [
    ('pending-removal-not-authorized', UI,
     'const wasActive = ownsRequest && (wasPending || hasActiveFileSource(state.source, state.audio));',
     'const wasActive = ownsRequest && hasActiveFileSource(state.source, state.audio);',
     'tests/targeted-audit.test.js', 'pending selected removal'),
    ('pending-intent-from-observed-state', UI,
     'const wasPlaying = wasPending ? activeFileRequest.autoPlay : state.audio.isPlaying;',
     'const wasPlaying = state.audio.isPlaying;',
     'tests/targeted-audit.test.js', 'pending replacement removal preserves requested autoplay true'),
    ('entry-authorization-by-filename', UI,
     'activeFileRequest.entry === Queue.currentEntry()',
     'activeFileRequest.entry.name === Queue.currentEntry()?.name',
     'tests/targeted-audit.test.js', 'request guard requires selected entry identity'),
    ('entry-authorization-by-file-reference', UI,
     'activeFileRequest.entry === Queue.currentEntry()',
     'activeFileRequest.entry.file === Queue.currentEntry()?.file',
     'tests/targeted-audit.test.js', 'request guard requires selected entry identity'),
    ('file-attachment-without-owner-guard', ENGINE,
     '}, { isCurrent: isCurrentRequest });', '});',
     'tests/file-activation-ownership.test.js', 'stale second resume'),
    ('stale-attachment-error-commits-state', ENGINE,
     'releaseCandidate();\n      if (!isCurrentRequest()) return false;', 'releaseCandidate();',
     'tests/file-activation-ownership.test.js', 'stale second resume reject'),
    ('declined-candidate-enters-native-play', ENGINE,
     'if (!attached || !isCurrentMedia()) {', 'if (attached && !isCurrentMedia()) {',
     'tests/file-activation-ownership.test.js', 'stale second resume resolve'),
    ('candidate-callbacks-without-owner-guard', ENGINE,
     'if (!isCurrentMedia()) return;', '',
     'tests/file-activation-ownership.test.js', 'stale second resume'),
    ('manager-continuation-without-owner-guard', MANAGER,
     'if (!isLoadRequestCurrent(requestId)) return false;\n\n    const sourceState',
     'const sourceState', 'tests/input-source-manager.test.js', 'stale File continuation'),
]
results = {'phase': 'F.2', 'root': str(ROOT), 'node': subprocess.check_output(['node', '--version'], text=True).strip(), 'controls': []}
for name, file, before, after, suite, pattern in controls:
    with tempfile.TemporaryDirectory(prefix='auralprint-f2-control-') as temporary:
        copy = Path(temporary)
        for directory in ['src', 'tests', 'scripts']:
            shutil.copytree(ROOT / directory, copy / directory)
        for filename in ['version', 'package.json', 'package-lock.json']:
            shutil.copy2(ROOT / filename, copy / filename)
        (copy / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
        target = copy / file
        text = target.read_text()
        expected = 4 if name == 'candidate-callbacks-without-owner-guard' else 1
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
