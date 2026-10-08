"""Optional focused mutation validation; restores source even on failure.

Run from repository root. Outputs are written only to the supplied directory.
Every accepted kill must contain an ERR_ASSERTION from the RC-19 suite.
"""
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[4]
source = root / 'src/js/recording/recorder-engine.js'
original = source.read_text()
out = pathlib.Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)

def replace_once(text, before, after):
    assert text.count(before) == 1, before
    return text.replace(before, after, 1)

mutations = {
    'original-disposal': subprocess.check_output(['git', 'show', '7f33e0daa835b3131a1ce4f9e0d6e0c519029378:src/js/recording/recorder-engine.js'], cwd=root, text=True),
    'omitted-native-stop': replace_once(original, 'if (recorder && recorder.state !== "inactive") recorder.stop();', 'if (false) recorder.stop();'),
    'accepted-stale-events': original.replace('if (sessionToken !== runtime.sessionToken) return;', '/* mutant accepts stale callbacks */'),
    'double-stop-finalizing': replace_once(original, 'if (recorder && recorder.state !== "inactive") recorder.stop();', 'if (recorder) recorder.stop();'),
    'stop-shared-upstream': replace_once(original, '    runtime.audioStream = null;\n    // Only the audio owner', '    stopStreamTracks(runtime.audioStream);\n    runtime.audioStream = null;\n    // Only the audio owner'),
    'export-during-disposal': replace_once(original, '    runtime.sessionToken += 1;\n    runtime.isDisposed = true;', '    finalizeStoppedRecorder(runtime.sessionToken);\n    runtime.sessionToken += 1;\n    runtime.isDisposed = true;'),
    'reinitialize-token-reuse': replace_once(original, '  function init(options = {}) {', '  function init(options = {}) {\n    runtime.sessionToken = 0;'),
    'stop-failure-reported-success': replace_once(original, '      code = "dispose-stop-failed";', '      code = "disposed";'),
    'stale-timer-accepted': replace_once(original, '      if (sessionToken !== runtime.sessionToken) return;\n      if (runtime.lifecycle.phase', '      /* mutant accepts old timer */\n      if (runtime.lifecycle.phase'),
    'owner-failure-stops-upstream': replace_once(original, '    const audioTap = runtime.audioTap;\n    runtime.audioTap = null;', '    const audioTap = runtime.audioTap;\n    const unsafeStream = runtime.audioStream;\n    runtime.audioTap = null;').replace('        logRecorderException("audio-stream-release-failed", err);', '        stopStreamTracks(unsafeStream);\n        logRecorderException("audio-stream-release-failed", err);'),
}
results = []
try:
    for name, mutant in mutations.items():
        source.write_text(mutant)
        run = subprocess.run(['node', '--test', '--test-isolation=none', '--test-reporter=tap', 'tests/rc19-recorder-disposal.test.js'], cwd=root, text=True, capture_output=True, timeout=30)
        log = run.stdout + run.stderr
        (out / f'mutation-{name}.log').write_text(log)
        killed = run.returncode != 0 and 'ERR_ASSERTION' in log and not any(word in log for word in ['SyntaxError', 'ERR_MODULE_NOT_FOUND', 'ERR_INVALID_URL'])
        results.append({'mutation': name, 'exitCode': run.returncode, 'assertionFailure': 'ERR_ASSERTION' in log, 'killed': killed})
        print(f'{name}: {"KILLED by assertions" if killed else "NOT VERIFIED"}', flush=True)
finally:
    source.write_text(original)
(out / 'mutations.json').write_text(json.dumps(results, indent=2) + '\n')
assert all(result['killed'] for result in results), 'Every mutation must fail a real regression assertion'
