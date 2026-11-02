# Build 117 baseline harness

Reference: `v117_dev` `e6533e86330c13afaa9ca4168c078875f533c0cf`, including merged PR #107. Application/build inputs match pre-117 `main` `8c21846d`. Canon 116 remains the behavior reference; this pass keeps `version` at `v0.1.16` and schema 16.

This is the isolated **B0/B1/B2** pass from the [architecture checkpoint](build-117-stage-0-1-checkpoint.md#3-reproducible-benchmark-plan-measurement-implementation-pending). It does not approve the Visualizer contract or close all Stage 0 device/lifecycle coverage.

## Run

After the [normal sequential checks](../../README.md#developer-bootstrap) and Playwright browser installation:

```sh
node scripts/benchmark-117.mjs --out .build/benchmark-117-reference
```

Use a fresh output directory for each experiment; an existing `results.json` is never overwritten. The directory contains exact WAV inputs and `results.json`. `--prepare-only` creates/verifies inputs without launching a browser. `--quick` exercises the harness with 3 warmup/12 sampled callbacks and one repetition; its output is **smoke evidence**, never a baseline. Optional `--cases B0,B1,B2` (or individual IDs), `--editions portable,hosted`, `--headed`, and `AP_CHROMIUM_PATH` select explicit subsets/browser configuration. Record the actual backend; software and hardware rendering are separate environments.

The separate [benchmark workflow](../../.github/workflows/benchmark-117.yml) exercises the new harness before a complete B0/B1/B2 run, using the existing Ubuntu Chromium setup. It uploads raw JSON for both successful and failed runs. It does not modify the production build or impose FPS thresholds.

## Inputs and measurement

| Input | Fixed recipe |
| --- | --- |
| Audio | 120-second 48-kHz stereo PCM16 WAV; amplitude 0.25, zero initial phase, L=440 Hz/R=880 Hz; matching silence. SHA-256 values are pinned in the harness tests and each result. Actual audio-context sample rate is recorded separately. |
| B0 | Factory preferences; no source/stereo/silence × default/hidden panels × running/paused. |
| B1 | Zero Orbs, enabled Ring; free/Orb phase mode, requested speed 0.5 rad/s to expose free-phase progress. Stereo File, hidden panels. |
| B2 | 16/64/256 alternating factory-derived Orbs, unique IDs; hidden/revealed panel. Twenty volume 1/0.5 commits, then twenty first-Orb hue 0/30 commits through actual controls. |
| Sampling | 60 delivered warmup callbacks plus 240 sampled callbacks per window; three independent repetitions in each built edition. Nearest-rank p50/p95 and intervals over 50 ms, a reporting threshold rather than an acceptance target. |

Each case stores full canonical settings, the schema-16 wire payload and their hashes. Inputs round-trip through the actual writer/reader without legacy migration. Source/artifact/harness hashes, working-tree state, OS/CPU/GPU/backend/browser, viewport/DPR and raw samples stay with results. No candidate comparison or speedup is claimed by baseline-only repetitions.

The external observer wraps the application's normally scheduled `onAnimationFrame`; it preserves native timestamps, scheduling and clocks. Built pacing records callback duration separately from rAF intervals. A balanced interval-only/timed/timed/interval-only comparison on B0-hidden characterizes observer impact; it does not prove zero overhead. Control windows carry their block/position in `observerComparison` and stay separate from baseline/attribution results. There is no extra animation loop or forced delta.

A separately bundled, in-memory diagnostic edition provides Camera, audio sampling, visualizer update, render, UI and scrubber buckets, real media times/populations and L/R/C checks. It is never written into either production edition. Its timings include probes and must remain separate from built pacing; audio sampling does not include the separately executed AnalysisFrame projection. JS heap snapshots exclude DOM/native encoder/GPU memory. B2 verifies surviving card/control/focus identity and the complete final configuration, including unrelated values. Existing protected tests remain the fuller draft/accessibility/fidelity gate.

## Evidence and remaining gates

The [raw local reference](117-baseline-20261102/chromium153.json.gz) and [checksum](117-baseline-20261102/SHA256SUMS) contain 120 built pacing runs (20 cases × 2 editions × 3 repetitions), 20 attribution windows and 12 observer controls: 36,480 sampled callbacks and 1,440 editor commits. All completed without application/resource errors or failed invariants. Network-disabled direct portable launch passed. `npm test`: **1,555 passed, zero failed, one existing opt-in skip**; build/distribution verification passed and portable output matched Canon 116 byte for byte.

Environment: Linux worker, Chromium **153.0.8010.0**, 1280×800 CSS pixels/DPR 1, software Canvas/compositing; no GPU identity exposed. CPU/memory fields are OS-reported, not a native-memory or container-quota measurement. A temporary `@sparticuz/chromium` 153.0.0 executable supplied this browser; project dependencies are unchanged. The pinned Chromium 156 download still returns a non-ZIP response locally. [CI](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/108/checks) uses its pinned browser in a separate environment.

Representative **portable** results below are medians of three per-run nearest-rank percentiles, not pooled samples. B0 uses stereo File audio; B2 uses no source, as defined above. These rows characterize different workloads and establish no speedup.

| Case | Callback p50 / p95, ms | rAF interval p50 / p95, ms | Startup DOM elements |
| --- | --- | --- | --- |
| B0 stereo, default panels | 1.9 / 2.6 | 16.7 / 16.8 | 914 |
| B0 stereo, hidden panels | 1.6 / 2.1 | 16.7 / 16.8 | 914 |
| B1 free Ring / zero Orbs | 2.0 / 2.8 | 16.7 / 16.7 | 584 |
| B2 16 Orbs, revealed | 1.7 / 3.3 | 16.7 / 16.8 | 3,224 |
| B2 64 Orbs, revealed | 5.5 / 11.6 | 16.7 / 33.3 | 11,144 |
| B2 256 Orbs, revealed | 12.8 / 15.1 | 33.4 / 50.1 | 42,824 |

| Revealed B2 scene | Synchronous volume commit p95, ms | Synchronous hue commit p95, ms |
| --- | --- | --- |
| 16 Orbs | 5.0 | 4.6 |
| 64 Orbs | 14.2 | 13.8 |
| 256 Orbs | 41.9 | 44.1 |

Observer-control p95 intervals were 16.7 ms in all six interval-only windows and 16.7–16.8 ms in the six timed windows. No pacing difference was resolved here; this does not establish zero observer overhead or certify dense workloads.

**Archive provenance:** production inputs are unchanged from `e6533e8`/Canon 116. The raw record preserves its local WIP commit/dirty-state declaration; its four harness hashes match remote `43cfefe`. That revision predates reporting-only purpose labels: `results[0:120]` are built baseline runs, `[120:140]` attribution, `[140:146]` timed controls; `observerComparison` holds the six interval-only controls. The current writer labels/groups all controls explicitly. The archived bytes are unchanged.

Windows/Ubuntu CI pass on code head `1e894190`. The [pinned Chromium 156 benchmark](https://github.com/cosmicdance-4-2-0/Auralprint1/actions/runs/41397312584) also completed all 152 full windows and its separate smoke run on `43cfefe`; its uploaded JSON was downloaded and checked. These results remain a separate environment from the table above. The reporting-label revision and final documentation checks are tracked in PR #108. Passing runs do not resolve the historical Watcher duplicate-save, child-survival or Windows rename causes.

Outstanding: B3–B7 dense histories, positive Trace fades, camera replay, Queue/source transactions, recording cycles/soak, observer/fidelity review on owner hardware and the exact owner-supplied Hero. Native Safari, physical capture permissions and screen-reader speech remain platform qualifications. Full Stage 0 completion and the Stage 1 contract decisions still require owner review; this harness is not milestone promotion.
