# 115M.H.W — RC-15 cumulative hostile review

**RC-15 remains OPEN P2 pending independent human/GPT acceptance.**

Version `v0.1.15m.h.w`; preset schema **10** unchanged. Build115 is not promoted to115N. This pass prepares one cumulative PR; it does not merge, release, or close RC15.

## Checkpoints and scope

The continuing branch `codex/115m-h-t-rc15-correction` was clean at exact required H.V HEAD/version/schema before any edit. Remote `main` was independently checked with git ls-remote and remains the accepted H.S baseline.

| Stage | Exact checkpoint | Purpose |
| --- | --- | --- |
| H.S accepted merged main | `ec5c6238ffa6c51dd05a03fdcc0209461e21bc44` | Original shared limits after PR37 |
| H.T | `ddbba02cd2b4f05bc12c9814583d33b82a6bef91` | Per-Orb placement eligibility |
| H.U | `beef098c82e3a81698b5f6705b308afad269830d` | User resource policy and diagnostics |
| H.V / this pass starts | `1987bed83daa9108ab7606abc7db564bd3709236` | Motion/age/emission separation and safe prefix expiry |
| H.W / this pass results | Commit introducing this report; `git log -1 --format=%H -- docs/audits/remediations/115m-h-w-rc15-final-review/README.md` | Integrated validation and review packaging |

A commit cannot include its own resulting SHA literally. The file-specific lookup identifies the exact immutable H.W checkpoint after later branch movement; the final handoff and PR identify it explicitly. Isolated exact worktrees supplied every historical control; the continuing branch was never reset or contaminated.

Original failure hypothesis: one sampled Orb position was emitted repeatedly at high configured rates, filling retention with redundant particles, shortening useful trail history and wasting rendering work. H.T prevents those creations cheaply; H.U restores user ownership of artistic resource limits; H.V corrects ordinary slow-frame phase speed and chronological expiry overhead. H.W challenged their combined contracts using actual source, new interaction regressions, negative controls and native rendering/analysis. No additional production algorithm defect was reproduced. The only production-source H.W change is the version header in `core/constants.js`, together with root version metadata. Tests, optional probes, a synthetic preset and this evidence were added; the million-node test became explicit opt-in without reducing its assertions. `agents.md` remains unchanged because H.W adds no canonical contract.

No dependencies, clock-policy change, heap redesign, rendering optimization, adaptive quality, camera, unrelated remediation, README/ROADMAP/CHANGELOG cleanup, or release action was introduced.

## Final ownership and algorithms

Canonical ownership remains **CONFIG → preferences → runtime.settings → state**. Analyzer/AnalysisFrame and L/R/C interfaces, source/recording lifecycle and visualizer composition remain intact. See [acceptance-matrix.md](acceptance-matrix.md) for each promised behavior, implementation, production entry point, positive regression, negative control and limitation.

`orbs[].particles.minPlacementDistancePx`: default.5 CSSpx, range0–10, UI step.1, persisted per Orb. `Orb.step` supplies active DPR. TrailSystem expires by TTL first, prepares genuine rate opportunities, keeps fraction%1, then reads only its retained tail. Threshold is CSSdistance×DPR, squared once; dx²+dy² >= threshold² accepts equality. Nonzero spacing produces at most one candidate per callback; surplus whole opportunities and below-threshold candidates are discarded before the governor constructs its ready ring. No full-trail search, cross-Orb comparison, proximity deletion, extra coordinate cache, or interpolation. Empty trails are eligible at the next real rate opportunity after reset/expiry/eviction. Zero skips the filter entirely and permits dense coincident particles.

Spacing cannot spend service allocation because suppressed owners have no pending candidate. The persistent priority queue retains inactive/unserved owners' places and moves serviced owners to its back. Eligible periodic low-rate demand and later-Orb demand receive service under sustained competition. Whole demand refused for any reason is never debt; fractions survive policy edits and pause.

Persistent `prefs.particleSafety` is `{maxEmissionsPerFrame:512,maxActiveParticles:16384}` by default. CONFIG integer metadata permits emissions0–16384 and retention0–1048576, step1. Shared normalization independently defaults malformed types/nonintegers and clamps valid integers; zero and maxima survive. Unknown fields/counters are stripped. No default-valued hidden ceiling remains: actual tests admit16384/update, retain32768 over two updates, and explicitly retain1048576 in the optional probe.

UI.resolve/apply preferences immediately synchronizes the existing governor; runtime update/render/rebuild/reconcile/reset also synchronize changed settings references. applyPolicy replaces only a normalized frozen snapshot. Raising retention preserves nodes, ordering, fractions, phase and fairness; lowering retires globally oldest bornSec/sequence heap roots through canonical indexed retirement until capacity is satisfied before render. Zero emissions preserves history; zero retention empties it and prevents new retention without stopping motion/Ring/analysis/playback. Raising from zero restores legitimate admissions. Fixed test-policy injection is isolated and absent from production initialization.

ScenePanel owns Performance → Particle Resources numeric controls, explicit labels/help/validation/high-cost warning, change-only commits, and selected-value display. OrbEditor owns individual/Bulk spacing, including mixed values and stable persistent IDs. Focus, controls, editors, listeners, surviving Orb history and governor identity survive valid edits. Diagnostics read actual counters: live, last-update admitted/spacing/budget/rate/zero-retention/TTL, and cumulative retention retirement since runtime initialization. Unchanged text is not rewritten; counters are never presets.

Schema10's H.T/H.U pre-release extensions are explicitly authorized because Build115 is unpublished. Missing development-schema10 and historical2–9 inputs receive defaults; both schema9 layouts retain established precedence/identity migration. Complete fixtures/recursive field inventory round-trip all artistic fields; obsolete overlapRadiusPx remains discarded, never aliased. URL/share/reload/reset/oversized atomic refusal/repeated-import identity tests remain accepted. This is no exception for a published schema.

Main owns visible elapsed motion time, independently capped1/30s emission time, and monotonic real particle age. Ordinary120/60/30/10/5FPS moves at the configured angular speed. CONFIG's .5s discontinuity integrates exactly.5, discards larger/invalid/hidden gaps, rebases foreground/invalid timestamps, and never catches up deferred work. First/rebased callbacks still analyze, age/expire, render and refresh with zero deltas. Paused Orb/free Ring phase and emission freeze while TTL ages; Orb-locked Ring follows current-frame first-Orb phase. Track reset clears trails while preserving phase; visual reset restores designed phase. Long-running phase remains moduloTAU. Legacy direct caller conventions are preserved.

Normal chronological expiry visits the expired prefix plus its first surviving head. A conservative O(1) birth-order flag supports out-of-order direct calls safely with a full-scan fallback until <=1/reset. Equal timestamps are ordered; transfer reconstruction preserves insertion/birth information, re-evaluates the flag and uses the destination governor. Retirement clears list links/owner and heap index. No second expiry structure or full ordering validation was introduced.

## Synthetic full-rotation acceptance

[synthetic-history-schema10.json](synthetic-history-schema10.json) is a reproducible synthetic16-Orb preset, not the human developer's unavailable actual scene. Each Orb has speed.5rad/s, TTL14s, high rate1000/s, spacing.5CSSpx, zero waveform displacement, known fixed radius and start phase; selected budgets512/65536 accommodate useful positions.

Expected lifetime angular coverage is `.5 × 14 = 7 rad`, exceeding one rotation `2π ≈6.283rad`. After20s of visible simulated motion:

| FPS | Actual live particles | Admitted total | TTL retired | Retention evicted | Oldest age(s) | Particle angular history(rad) | Trace angular history(rad) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
|120|26880|38400|11520|0|13.9917|6.9958|4.1667|
|60|13440|19200|5760|0|13.9833|6.9917|6.9917|
|10|2240|3200|960|0|13.9000|6.9500|6.9500|
|5|1120|1600|480|0|13.8000|6.9000|6.9000|

Native source integration verifies each Orb's phase, births, history, counts and actual callback rendering. [native-history.json](native-history.json) retains all16 histories for each FPS; [synthetic-history-60fps.png](synthetic-history-60fps.png) captures the rendered fixture. Unit regressions independently exercise real Orb/runtime/governor at the same speeds/lifetimes. The small missing end interval is discrete sampling, not shortened TTL or retention eviction.

Trace draws the newest `numLines+1` points. At120FPS with1680 retained points/Orb, 1000 segments cover8.333s/4.167rad despite full particle history. At60FPS840 points fit; lower FPS is sparse but covers almost all TTL. No interpolated points are fabricated. Retention eviction, spatial suppression and Trace truncation are three distinct mechanisms.

## Performance methodology and adverse results

See [performance-tables.md](performance-tables.md), [measurement-summary.json](measurement-summary.json), raw [all-checkpoints.json.gz](all-checkpoints.json.gz), [dense-alternating.json](dense-alternating.json), and supplemental [hs-operation-counts.json.gz](hs-operation-counts.json.gz). The two large raw reports use lossless gzip to keep the review diff readable; decompression restores every timing, counter and per-Orb observation. `summarize.py` reads either representation. Existing H.T/H.U/H.V evidence remains unchanged.

The broad run began immediately before the version stamp; its run metadata retains the starting .v label. The H.W production algorithms are identical to H.V, and the final .w header/build are independently verified below. The broad comparison runs11 scenarios ×5 exact source checkpoints ×uninstrumented/profile =110 fresh pages. Shared generated silent stereo PCM,1280×800 CSS viewport,DPR1,16 high-rate Orb definitions (or64/256/1024 stress), radius.1/speed1/TTL60, trace10 and identical Ring configuration. Forced GC occurs before imports/warmup; CDP numeric heap metrics are saved before/after. Ordinary cases use330 update-only warmups plus30 actual callbacks; saturated uses1080+120. The first measured callback therefore includes cold UI/Canvas work; means/tails can include this, while warmup is not claimed equivalent to fully warmed rendering. The separate dense investigation uses180 actual callbacks with90 warmup and90 recorded, five alternating H.U/H.V pairs. No other browser validation ran during the broad comparison. The first dense pair briefly overlapped the explicitly requested million-node unit probe; pairs2–5 had no such validation. Removing that first pair leaves mixed-sign differences, not a consistent20% slowdown.

H.S lacks spacing/new diagnostic causes; H.S/H.T lack expert budgets. Unsupported configurations/populations are marked non-equivalent. Original broad H.S timing records default absent newer diagnostic names to zero; those zeros are **unavailable**, not measured causes. The supplemental H.S pass derives requested opportunities from actual admitted+aggregate drops; it marks unavailable refusal subcauses null. The summary uses these actual supplemental operation counts. Supplemental one-callback timings are not used as performance evidence.

Uninstrumented mode uses exact source without timer wrappers, measuring complete synchronous callback duration. Profile mode uses measurement-only HTTP transforms for analysis/TTL/policy/diagnostic/Renderer particle-vs-Trace timers and method wrappers. Normal Canvas/Trace rendering logic is unchanged. The baseline full-expiry body is extracted into a measurement-only method to time it consistently. Nested inclusive and subtracted timings overlap and cannot be summed; fine-grained zero can mean below~5µs resolution. These are source-module costs, not exact estimates of bundled/transpiled instructions. Production code has no profiling hooks.

The earlier H.V report's dense median11.32→13.63ms remains adverse evidence. The new broad one-trial dense result is also unfavorable: H.U11.510→H.V16.445ms, while functionally identical H.W measures12.895ms. Broad default H.V1.060→H.W1.560ms and stress25626.335→28.245ms similarly worsen despite no H.W algorithm change. Do not infer causality from those single groups.

The more controlled five-pair dense comparison has equal16384 live particles, identical deterministic demand/birth/eviction history, same Orb/Ring/Trace definitions and all-callback warmup:

| Trial | H.U callback p50(ms) | H.V callback p50(ms) |
| --- | ---: | ---: |
|1|11.530|10.625|
|2|15.245|11.395|
|3|11.320|11.905|
|4|11.265|11.735|
|5|11.270|11.200|

Median of medians11.320→11.395ms (+.7%); mean of run means44.180→42.036ms. Differences favor each version across trials, with p95~83–118ms in both. CDP memory metrics do not isolate GC pause duration; raster flush/backpressure, allocations/GC, JIT and shared-host scheduling remain unresolved contributors. A stable attributable20% production regression is **not established**, and neither is statistical certainty about improvement. No speculative renderer/GC optimization was made to conceal unfavorable results.

H.W selected-default moving16:5760 live,5.983s retained history, requested96000/suppressed90240/admitted5760, no retention eviction; uninstrumented callback4.515ms. Saturated20s:.5 spacing,16384 live,17.05s history,19200 admissions/2816 evictions; callback14.320ms. Profiled update .080ms, Canvas particles12.790ms, Trace.155ms, UI.910ms, diagnostics.025ms. H.U saturated expiry inspections11264000 vs H.V/H.W19184, with matched admission/heap work. This demonstrates algorithmic visitation savings; it does not promise comparable callback/FPS gains.

Expert zero-spacing selects4096/131072, produces96000 live after6s with5.983s history and no eviction, vs default zero-spacing16384 live/~1.017s useful history. Expert H.W callback182.125ms, profiled Canvas particle submission175.175ms/update.140ms. The extra artistic workload is actually honored and can be very slow. With only16 Orbs, normal demand~267/frame fits even512; the expert retention budget creates the large population. Separate512-Orb behavioral tests prove actual16384 emissions/update, beyond512.

Large retention100000, minimal expiry: H.W update.070ms/Canvas particles37.620ms/callback38.640ms,5760 expiry inspections across360 updates; H.U36000000. Seeded positions mostly offscreen isolate retained traversal, not a million-particle artwork. Retention100000→8192 retires91808, H.W20.560ms (H.U25.500/H.V24.880ms); expert96000→8192 costs24.905ms. Profiled trims are slower because of wrappers and remain separately recorded.

High-expiration gap is not represented honestly by its near-idle median: the first callback after120s retires100000 particles. H.U first callback141.245ms, H.V104.055ms, H.W165.760ms. Remaining callbacks are near idle. Retirement/heap work can dominate that recovery; no claim of universally faster complete expiry is made. Stress256 H.W UI~6.985ms;1024 zero-emission Orbs callback31.765ms. General UI/Canvas scaling is outside this narrow pass.

Native200-cycle canonical collection/policy churn at exactly16 Orbs/1024 live/no expiry retains16 expiry visits and16 scheduling visits. Fixed50-update batches resolve the small CPU cost: DPR1 per-update median.006→.006ms; DPR2.004→.006ms. Quantization/host/JIT prevents a precise slowdown claim from microseconds. Structural work/owner counts do not grow; no claim of measured GC reclamation.

Canvas times measure synchronous command submission and possible backpressure, **not GPU completion**. One broad trial/five dense pairs are not a hardware survey. Max retention structural usability is explicitly tested; full-million rendering/memory usability remains unverified. Neither fixture reproduces the human preset, and no universal FPS improvement is asserted.

## Tests, negative controls and native validation

195 focused tests PASS,1 optional million test SKIPPED by default (196 total). Eight new focused interactions cover low-rate competition through policy/reorder, TTL rotation at four FPS, repeated owner replacement/churn, unordered transfer/TTL/spacing, and600s modulo/reset. Full `npm test` passes all34 test files, including RC01–RC14, preceding RC15, AnalysisFrame/L/R/C/band targeting, file/mic/stream/mono/source ownership, queue/playback/scrubber, recorder interfaces, composition/Ring and preset transport. Existing regressions were not weakened.

The original full1048576-node boundary test is now `AP_MILLION_STRESS=1` opt-in for hosted CI; its assertions remain intact, including oldest eviction, trim-to-zero and exactly one unexpired-head inspection. It passed explicitly here. Normal CI still proves actual >512 emissions, >16384 live, and large100000 ordered expiry behavior. [focused-tests.log](focused-tests.log), [optional-million.log](optional-million.log), [validation.log](validation.log) retain results.

[mutations.json](mutations.json) records23 detected cumulative isolated-copy mutations: duplicates, DPR omission, equality rejection, wrong historical reference, whole debt, old512/16384 caps, governor recreation, missing trim, stale policy, broken zero, runtime-counter persistence, capped motion, unbounded motion/emission, full expiry scan, unsafe unordered break, stale heap index, stale diagnostic refresh, ignored free Ring pause, youngest eviction, spacing spending allocation and lost priority. Syntax errors are not accepted detections. The initial recreation mutant was killed before a useful assertion; a reduced existing runtime-identity regression detects it normally. TemporaryDirectory copies and finally restoration prevent production contamination, including interrupted runs.

Native final checks PASS:

- [native-clock.json](native-clock.json): actual boot/callback, five FPS/both chiralities, bounded demand, Ring lock, real-age stall retirement, synthetic hidden/visible events through registered listener, pause, live zero policy and stable focus/editor/actual diagnostics; DPR1/2.
- [native-standalone-budgets.json](native-standalone-budgets.json) and [native-standalone-spacing.json](native-standalone-spacing.json): final offline single-file controls, numeric bounds/keyboard/invalid refusal/focus, individual/Bulk mixed and duplication, stable identity, share/reload/reset/zero/schema10; no external requests.
- [native-analysis-churn.json](native-analysis-churn.json): actual file input→queue/loadAndPlay→source manager→playing AudioEngine FFT→main AnalysisFrame at DPR1/2. Generated512Hz left/2048Hz right peaks at distinct bands62/126; combinedC owns spectrum; selected channel/band energies remain correct. Identical L/R yields mono; zero particle limits preserve analysis/playback/Orb motion. Physical mic/tab capture and actual OS suspension are not claimed.
- Native synthetic histories and actual callback draw above; screenshots inspected.

Final required sequence: dependency installation not required (installed locked esbuild, unchanged manifest/lock), `npm test` PASS → `npm run build` PASS → `git diff --check` PASS. [artifact-verification.json](artifact-verification.json) records standalone `auralprint_0.1.15m.h.w.html`,397772 bytes,SHA256 `9cd87f729231ee68116f5e9f0b283cd059160e00c92345dfedfeb9f26cecf454`,inline JS/CSS,version/schema10 and no tracked generated/dependency output. Browser automation remains optional environment tooling, not a production dependency.

## Manual acceptance on the real scene

1. Build/open the PR's versioned standalone, import the human developer's exact16-Orb preset and retain a copy. Confirm Orb IDs/channel/bands/TTL/angular speed/Trace settings and selected budgets.
2. At normal FPS, compare spacing.5 and0 with identical selected budgets/source. Observe diagnostics separately: spatial suppression, budget rejection, retention retirement and TTL. Check zero deliberately restores dense same-position particles.
3. For a known Orb, calculate intended `speed × TTL` coverage; allow one sample interval. Increase retention enough to accommodate useful positions and wait at least one TTL. Check particle history, then separately increase Trace numLines if its suffix limits visible lines. Evicted history cannot return immediately after a budget increase.
4. Lower/raise emission and retention while running; confirm phase/editor focus/history of survivors, immediate oldest trim, zero-emission history survival and zero-retention clearing. Restore defaults; verify share/reload and duplication preserve spacing/budgets.
5. Throttle to10/5FPS: speed remains real elapsed; sparse positions are expected. Pause/hide/resume and test a long gap: no catch-up, old particles age normally, ordinary next callback recovers. Confirm file/mic/stream L/R/C targeting and Recording/queue/scrubber behavior on the user's hardware.
6. Record exact preset/audio/browser/DPR/settings/counters and adverse observations. Independent human/GPT inspection decides artistic acceptance and whether RC15 may close; passing implementation tests alone does not.

## Hosted CI and release-blocker disposition

At commit preparation, hosted Linux/Windows results are **PENDING/UNVERIFIED**: the branch has not yet been pushed or its cumulative PR opened. Existing CI tests/builds/verifies the artifact on ubuntu-latest/windows-latest with Node24/Python3.12. After push/open, actual completed job URLs/status will be reported in the PR and final handoff; local passes are not substituted for hosted CI. This committed snapshot intentionally does not predict future checks.

The [acceptance matrix](acceptance-matrix.md) records PASS/LIMITATION/UNVERIFIED separately. No demonstrated unresolved implementation release blocker/P2 defect remains. Dense attribution, heavy Canvas/UI/trim/recovery costs, conservative unordered fallback, actual human-preset acceptance, real hardware capture/suspension and full-million visual usability remain disclosed. Normal independent-review PR readiness does not mean release readiness. No merge, promotion or RC closure is authorized by these tests.

Optional reproduction (environment Playwright/Chromium, never required dependencies):

```sh
AP_MILLION_STRESS=1 node --test --test-isolation=none tests/rc15-budgets.test.js
python docs/audits/remediations/115m-h-w-rc15-final-review/mutation-check.py
AP_REPORT=/tmp/all.json node scripts/validate-rc15-review.cjs
AP_MODES=hu,hv AP_CASES=dense-sixteen AP_TRIALS=5 AP_PROFILE=0 AP_ALL_CALLBACKS=1 AP_FRAMES=180 AP_SAMPLES=90 AP_REPORT=/tmp/dense.json node scripts/validate-rc15-review.cjs
AP_REPORT=/tmp/analysis.json node scripts/validate-rc15-analysis.cjs
AP_REPORT=/tmp/history.json node scripts/validate-rc15-history.cjs
```

Set `AP_PLAYWRIGHT_MODULE`, `AP_CHROMIUM_PATH` and `AP_REVIEW_ROOTS` JSON mapping of hs/ht/hu/hv/hw isolated checkouts to match the environment. Scripts save evidence only where AP_REPORT specifies. Historical roots must match the exact checkpoints above.
