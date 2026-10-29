# Build 116 audit evidence

Audited production commit: `31dd5b2c7f9562602670dd2ebcc334d76c37f099`.
Run from the repository root with Node 24, Python 3.12, locked dependencies and
Chromium at `/usr/bin/chromium`. Native probes need subprocess and localhost access.
These are standalone audit harnesses, not changes to permanent tests or application code.

- `identity-native.cjs`: fresh native Chromium contexts, ordinary/opaque/small controls,
  and a six-second external deadline for the numeric identity case; closes each browser.
- `identity-node.mjs`: default runs 30 small checks. The optional expansion mode must
  run in an externally limited child: `timeout 12s node --max-old-space-size=384
  <path>/identity-node.mjs identity-expansion 20000 4096`. Exit 124 is the recorded
  bounded observation, not proof of an infinite loop or completed allocation.
- `preset-atomic.mjs`: nine small precision/atomicity checks.
- `ui-native.cjs`: palette, reset/import drafts, identity safety and responsive controls.
- `scrubber-native.cjs`: production listeners, real paused media, explicit blur and CDP input.
- `queue-native.cjs`: twelve competing Queue/live source sequences using generated streams.
- `recorder-native.cjs`: native capture/control and explicitly injected cleanup refusal.
- `watch-save-window.mjs`: disposable project, duplicate saves and deliberately delayed
  truncate/write; does not establish the original CI failure's cause.
- `analysis.mjs`, `audio-editions-native.cjs`, `render-{model,runtime,native}` and
  `camera-native.cjs`: independent positive/boundary coverage described in the report.

Most native/model scripts write result files beside themselves. Recorder also writes
temporary videos. To preserve this historical evidence, rerun in a disposable checkout
or change only the harness output location in a disposable copy; do not overwrite the
committed results. Generated distributions and videos are deliberately absent here.
Recorded JSON filenames describe their role; harnesses retain their original output names.
Timing results come from concurrent audit activity and are not device benchmarks.

The original CI excerpt has trailing whitespace normalized for repository checks;
message text, timestamps and diagnostic values are preserved.
