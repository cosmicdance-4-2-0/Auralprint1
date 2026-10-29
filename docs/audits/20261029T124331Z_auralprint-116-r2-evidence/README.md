# Build 116 hostile audit #2 evidence

Application baseline: `332d1cd312f0060cd043f1dc48a001c662b3788f`.
Only new audit scripts/results are in this directory. No implementation, existing
regressions, fixtures, historical evidence, CI or shipped artifacts were edited.

Run from the repository root with its locked dependencies and a completed build.
This environment also needs `source /workspace/auralprint-environment/activate.sh`.
`AP_CHROMIUM_PATH` selects system Chromium; it is not a new browser dependency.

```sh
EVIDENCE=docs/audits/20261029T124331Z_auralprint-116-r2-evidence
AP_CHROMIUM_PATH=/usr/bin/chromium AP_REPORT=work/native-r2.json \
  timeout 150s node --max-old-space-size=256 "$EVIDENCE/native-r2.cjs"
timeout 35s node --max-old-space-size=256 "$EVIDENCE/pure-r2.mjs"
node --max-old-space-size=256 "$EVIDENCE/watch-trace.mjs" 3
AP_WATCH_LOAD=2 AP_WATCH_OUTPUT=work/watch-loaded \
  node --max-old-space-size=256 "$EVIDENCE/watch-trace.mjs" 2
AP_WATCH_GAP_MS=90 AP_WATCH_OUTPUT=work/watch-interrupted \
  node --max-old-space-size=256 "$EVIDENCE/watch-trace.mjs" 1
```

- `native-r2.cjs/json`: actual File playback and trusted Chromium touch events in
  source/portable/hosted; 84 complex source reorders; opaque compressed startup;
  precision near grid boundaries; one public UI reinitialization. A zero exit
  means the probe completed, **not that observed application behavior is correct**.
  The two defect families are recorded with independent expected/observed values.
  The final touch events verify which identifier ended. Reinitialization is an
  explicit public lifecycle-seam challenge, not an ordinary boot path.
- `pure-r2.mjs/json`: raw 12.65 MB compressed import with 4,096 duplicate opaque
  IDs, stable re-encoding, maximum collision reservation, legacy schemas, exact
  schema-16 roundtrips, projection invariants, analysis and resource accounting.
  Node has a 256 MiB V8 heap/deadline; browser JS uses 384 MiB. These do not cap
  total native/browser RSS and are not performance promises.
- `watch-trace.mjs`: reads the unchanged existing watcher integration test,
  instruments **only disposable copies**, retains its assertions and executes
  real esbuild/Python assembly. At most six rounds; 170-second process-group
  deadline on POSIX. Optional CPU workers: at most two, each 32 MiB V8/15 seconds.
  `AP_WATCH_GAP_MS` replaces the ten ordinary duplicate writes with one equivalent
  final-content save paused between open/truncate and write (maximum 200 ms).
  This is a controlled scheduling model, not an observation of CI's writer.
  The child test is expected to fail its assembler-count assertion in that mode;
  the runner itself completes with JSON results. Raw timestamped event logs and
  copied test programs go under `work/`, never into production inputs.
- `watch-results.json`: six ordinary sequences (including two under CPU load),
  plus the final controlled gap's signatures, changed-input hashes, actual Python
  process timing and before/after output hashes. The controlled child's two
  failures are one assertion and its containing test. No historical diagnosis is
  inferred from matching assertion text.
- `ci-evidence.json`: excerpts from both original Ubuntu failures, with run/job,
  attempt and exact SHA; the latest passing identical-SHA rerun stays distinct.
- `inventory.json`: all 65 reachable production modules, imports, exact source
  hashes, esbuild input agreement and packaging/configuration entry points.
- `verification.json`: commands, counts, environment, limits and protected Canon
  identity. Existing validators are reproduced from their repository scripts;
  large stdout/screenshots are intentionally not copied into this directory.
- `reproducible-build.json`: identical hashes for nine files across two builds.
- `platform-probe.json`: direct-file navigation blocked by administrator policy;
  this is an environment limitation, not passing offline/direct-file coverage.

Intermediate harness setup/expected-result mistakes were corrected before the
recorded final native/pure results: closed disclosure/panel focus, near-grid
roundoff policy, collapsed Nyquist intervals and CDP partial-touch-end semantics.
Only final events with the intended identifiers support the touch finding.
No speculative or superseded harness failure is counted as an application defect.
