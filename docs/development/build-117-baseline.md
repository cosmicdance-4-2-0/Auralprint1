# Build 117 baseline harness

Reference: `v117_dev` `e6533e86330c13afaa9ca4168c078875f533c0cf`, including merged PR #107. Application/build inputs match pre-117 `main` `8c21846d`. Canon 116 remains the behavior reference; this pass keeps `version` at `v0.1.16` and schema 16.

This is the isolated **B0/B1/B2** pass from the [architecture checkpoint](build-117-stage-0-1-checkpoint.md#3-reproducible-benchmark-plan-measurement-implementation-pending). It does not approve the Visualizer contract or close all Stage 0 device/lifecycle coverage.

## Baseline completion ledger

**Reviewed November 2, 2026:** accepted `v117_dev` is `dfb57e59b7d22a94be1c768ffc905141ec274ad3` (merged #108). The [preparation checkpoint](build-117-architecture-preparation.md#reference-and-scope) records independently checked source/artifact identity. PR #109 is excluded and on hold. The original B0–B2 observations below remain unchanged; this ledger adds no new browser measurements.

| Coverage | Evidence at the accepted source | Remaining acceptance work |
| --- | --- | --- |
| Canon/source provenance | Canon hash verified; all 93 implementation-file hashes in the archived result match this source | Pin source, harness and exact artifacts for every new run; moving `main` is not a reference identifier |
| B0 factory; B1 zero-Orb Ring; B2 editor scaling | Raw software-Chromium reference and separate pinned-browser CI evidence below | Retain environment/observer qualifications; these cases do not cover either core's entire architecture |
| B3 particles/aging | Recipe only; executable harness currently supports B0–B2 | Initial populations 1,000/8,000/16,384; TTL 6/60/600; aging-only and churn; actual admission/age/population history, reset and retention behavior |
| B4 Trace | Recipe only | Identical 16 × 1,001-point histories, Fade 0/5/20; joins/overlaps, native pixels and capture parity; callback and rAF costs |
| B5 Camera/viewport/DPR | Recipe and protected correctness tests; no new workload measurements | B0/B4 at both declared viewports and DPR 1/2; world/history and CSS-size invariance, Fit and authored/live separation; gestures separately |
| B6 Queue/waveform/sources | Recipe and existing regression tests | Same-File identity at 100/1,000/5,000 entries; task latency/peaks/occupancy; native capability and injected failure results distinguished |
| B7 recording/lifetime | Recipe and existing regression tests | Matched supported format; five capture cycles and separate 60-minute soak; prior export, owned cleanup, actual finalization and memory limitations |
| Owner Hero | No exact supplied preset in this reference | Preserve supplied preset/audio hashes and configuration; no invented substitute |
| Representative devices | Software worker evidence; historical owner functional reports are separate | Record actual device/browser/backend, narrow/touch and capture/accessibility coverage. Native Safari and unavailable devices remain untested |

**Stage 0 is open.** Owner review must accept the complete reference or explicitly record each qualification. Unit tests, a successful harness run, documentation completion or acceptance of one workload cannot promote the whole stage. Modularity, behavioral parity and speed remain separate criteria.

## Next measurement assignments and stop points

Use the existing [B3–B7 recipes](build-117-stage-0-1-checkpoint.md#3-reproducible-benchmark-plan-measurement-implementation-pending); keep their numerical choices as recorded experiment inputs, not application policy or device performance targets. The next coding assignment is **B3/B4 harness preparation and evidence**, followed by separately reviewable B5, B6 and B7 passes. This document prepares those assignments; it does not implement them.

1. **B3/B4 setup review, before collecting timings:** freeze canonical schema-16 settings, seeded geometry/birth-time hashes, selected resource policy, source/panel state, setup order and observation class. `TrailSystem.emitAt()` uses owned retention admission but does not exercise ordinary spacing/fair emission scheduling; report that distinction. Seed outside an active governor frame and verify admitted counts; measure normal emission separately. Aging continues through warmup, so initial population is never reported as a steady-state population.
2. **Resolve artifact access honestly:** the current in-memory diagnostic entry can reach runtime objects; the shipped bundle does not expose a public history-seeding API. A seeded diagnostic run must identify its modified artifact and remain diagnostic evidence. Pair it with normal built-artifact pacing under public controls, or propose and review another setup method with its cost. Do not add a production test hook, patch Canon, force clocks or relabel diagnostic timings as shipped-artifact pacing.
3. **Review B3/B4 results before B5:** include raw pacing, seeded-history assertions, native pixel comparisons and observer overhead. Freeze/step deterministic time only in a separately labelled fidelity test; real-time pacing runs retain native clocks. A missing comparison or unsupported setup remains unverified, not a performance result.
4. **B5:** reuse the reviewed histories and pose recipe, saving actual applied poses and resize/DPR events. Programmatic viewport/Camera replay does not establish physical touch behavior.
5. **B6:** separate Queue/task timing, optional waveform occupancy and real permission/source transitions. Preserve request/entry identity and winning-source cleanup; injected denied/no-track cases do not certify a browser's native capture capability.
6. **B7:** preserve the specified Stop/Cancel schedule and previous export across cycles. Record requested and actual codec/FPS/dimensions, source changes, cleanup outcome and policy-triggered Stops. Do not coerce an unsupported codec into a supposedly comparable run or infer total memory from encoded bytes/JS heap.

Each assignment stops at an evidence review and a bounded PR. Production migration, source fixes, new policies and renderer changes need their own authorized pass. Hero/device work can proceed independently; unavailable hardware does not block synthetic workload preparation.

### Evidence required for each workload

| Record | Required content |
| --- | --- |
| Identity | Exact release/source/harness commits, dirty state/diff where applicable, edition and actual artifact hashes; preserve existing archives |
| Inputs | Audio bytes/hash and position, full canonical settings plus schema-16 round-trip/hash, actual sample rate/FFT/bands, histories/populations, Camera, viewport/DPR, visibility and source/recording state |
| Environment | OS/device, browser/version, headless/headed, rendering backend, actual codec/capture support; unknown fields explicit |
| Observation class | Unmodified built pacing, instrumented attribution, observer control, deterministic fidelity, injected lifecycle test or physical-device observation; never pool these |
| Samples | Raw callback durations and rAF intervals, elapsed/media times, admitted/retained populations, per-run nearest-rank p50/p95, stated long-interval threshold and counts, failures and timeouts |
| Cost and parity | Observer/control comparison, allocations/JS heap with native/GPU/DOM exclusions, expected/actual lifecycle ownership, pixel/task/capture checks and unexplained differences |
| Disposition | Repetitions and variability; pass/fail/unverified per criterion; owner-approved exception only when explicitly granted; remaining evidence and next stop |

Use the implemented 60-warmup/240-sample/three-repetition protocol for reference pacing unless a workload-specific duration is declared and justified; B7 needs its longer schedule. For later candidate comparisons, balance baseline/candidate order using the checkpoint plan and report the exact order. Compare identical workloads/environments/editions, retaining both the fixed 116 reference and the immediate pre-change 117 reference. A short `--quick` run remains smoke evidence. No FPS or memory acceptance threshold is invented here.

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
