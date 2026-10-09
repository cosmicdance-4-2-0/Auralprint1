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
installed = 'if (isCurrentRequest() && mediaEl === nextMediaEl) {\n        teardown();\n        return;\n      }'
controls = [
    ('hard-decoder-cleanup-removed', ENGINE,
     'if (hardFailure) releaseCandidate();', '// Failed installed media retained.',
     'tests/file-activation-ownership.test.js', 'hard decoder native-error-before-rejection'),
    ('post-transfer-cleanup-removed', ENGINE,
     installed, '// Only local candidate release remains.',
     'tests/file-activation-ownership.test.js', 'first-gain attachment failure'),
    ('current-owner-cleanup-guard-removed', ENGINE,
     'if (isCurrentRequest() && mediaEl === nextMediaEl) {', 'if (true) {',
     'tests/file-activation-ownership.test.js', 'engine media identity protects direct API replacement'),
    ('obsolete-completion-unloads-winner', ENGINE,
     'if (!isCurrentRequest() || mediaEl !== nextMediaEl) {\n      releaseCandidate();',
     'if (!isCurrentRequest() || mediaEl !== nextMediaEl) {\n      teardown();\n      releaseCandidate();',
     'tests/file-activation-ownership.test.js', 'obsolete hard failure cannot clean or rewrite file owner'),
    ('partial-source-reference-retained', ENGINE,
     '    sourceNode = null;', '    // Failed source node reference retained.',
     'tests/file-activation-ownership.test.js', 'first-gain attachment failure'),
    ('current-error-erased-by-cleanup', ENGINE,
     'if (hardFailure) releaseCandidate();', 'if (hardFailure) { releaseCandidate(); state.audio.transportError = ""; }',
     'tests/file-activation-ownership.test.js', 'hard decoder native-error-before-rejection'),
    ('file-failure-notification-duplicated', UI,
     'if (!ok) {\n        RecorderEngine.onTransportMutation("track-change-failed", {',
     'if (!ok) {\n        RecorderEngine.onTransportMutation("track-change-failed", {requestId});\n        RecorderEngine.onTransportMutation("track-change-failed", {',
     'tests/targeted-audit.test.js', 'UI picker hard decoder failure'),
    ('recoverable-play-forced-teardown', ENGINE,
     '// Resume failure does not invalidate the loaded File/session or graph.',
     'teardown(); // Recoverable File wrongly released.',
     'tests/file-activation-ownership.test.js', 'recoverable loaded Play resume failure retains identity'),
    ('partial-analysis-nodes-not-disconnected', ENGINE,
     'try { if (sumGainL) sumGainL.disconnect(); } catch {}', '// Partial sumGainL left connected.',
     'tests/file-activation-ownership.test.js', 'partial-gains attachment failure'),
    ('local-analyser-setup-cleanup-removed', ENGINE,
     'try { a.disconnect(); } catch {}', '// Uninstalled analyser left unreleased.',
     'tests/file-activation-ownership.test.js', 'analyser-setup attachment failure'),
]
results = {'phase': 'F.5', 'root': str(ROOT), 'node': subprocess.check_output(['node', '--version'], text=True).strip(), 'controls': []}
for name, file, before, after, suite, pattern in controls:
    with tempfile.TemporaryDirectory(prefix='auralprint-f5-control-') as temporary:
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
