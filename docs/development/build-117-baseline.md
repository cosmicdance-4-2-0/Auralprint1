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

The external observer wraps the application's normally scheduled `onAnimationFrame`; it preserves native timestamps, scheduling and clocks. Built pacing records callback duration separately from rAF intervals. A balanced interval-only/timed/timed/interval-only comparison on B0-hidden characterizes observer impact; it does not prove zero overhead. There is no extra animation loop or forced delta.

A separately bundled, in-memory diagnostic edition provides Camera, audio sampling, visualizer update, render, UI and scrubber buckets, real media times/populations and L/R/C checks. It is never written into either production edition. Its timings include probes and must remain separate from built pacing; audio sampling does not include the separately executed AnalysisFrame projection. JS heap snapshots exclude DOM/native encoder/GPU memory. B2 verifies surviving card/control/focus identity and the complete final configuration, including unrelated values. Existing protected tests remain the fuller draft/accessibility/fidelity gate.

## Evidence and remaining gates

Local input tests, normal suite, distribution checks and portable/Canon byte equality are recorded with the PR. Native local measurement is blocked: the pinned Chromium download returns a truncated/non-ZIP response. A blocked result records the failure and contains **no fabricated timing samples**. CI and target-device results must be assessed on their own environments.

Outstanding: B3–B7 dense histories, positive Trace fades, camera replay, Queue/source transactions, recording cycles/soak, observer/fidelity review on owner hardware and the exact owner-supplied Hero. Native Safari, physical capture permissions and screen-reader speech remain platform qualifications. Full Stage 0 completion and the Stage 1 contract decisions still require owner review; this harness is not milestone promotion.
