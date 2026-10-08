# 115M.H.V — timing consistency and measured expiry work

**RC-15: OPEN P2 — CORRECTIVE REMEDIATION IN PROGRESS.**

Prompt 3/4 only. Source `v0.1.15m.h.v`; schema 10 unchanged. No new persistent
fields, release promotion, push, merge, or cumulative PR. Prompt 4 has not begun.

## Baseline and checkpoint

Verified clean continuing branch `codex/115m-h-t-rc15-correction`, HEAD
`beef098c82e3a81698b5f6705b308afad269830d`, source `v0.1.15m.h.u`, schema 10.
Read `agents.md` and actual H.T/H.U implementation. Detached H.U worktree uses
that exact commit. Twenty-four initial baseline profiling runs completed before
production edits; comparisons do not reconstruct historical behavior.

Resulting checkpoint is the commit introducing this report; the exact resulting
SHA is in the review handoff and is independently reproducible after later branch
advancement with:

```sh
git log -1 --format=%H -- docs/audits/remediations/115m-h-v-rc15-timing-performance/README.md
```

A committed report cannot contain its own resulting commit hash as literal text.
No historical audit files were rewritten. Production changes are limited to
`core/config.js`, `core/timing.js`, `main.js`, `render/orb.js`,
`render/visualizer-runtime.js`, `render/particle-list.js`, and
`render/trail-system.js`, plus version metadata. ParticleGovernor and UI policy
implementations remain unchanged. Tests, optional measurement scripts, this
stage's evidence, and narrow canonical timing instructions were added/updated.

## Slow-frame root cause and exact clock contract

H.U used the same capped delta for motion and emission. Particle birth/fade/TTL
used real monotonic time. At 10 FPS, angular motion therefore advanced one-third
of its configured real-time rate; at 5 FPS, one-sixth. Retention policy cannot fix
that mismatch.

The main callback owns three explicit responsibilities:

| Value | Meaning | Consumers |
| --- | --- | --- |
| `dtSec` | Existing emission-work delta, normalized and capped to 1/30 s | Particle demand/fractions, existing workload contract |
| `motionDtSec` | Additive visible elapsed motion time, accepting finite positive intervals through .5 s | Orb angular motion and free Ring phase |
| `nowSec` | One `performance.now()/1000` sample per callback | Particle birth, renderer age/fade, TTL retirement |

Ordinary valid visible callbacks use `motionDtSec = elapsedSec`, and
`dtSec = simulationDeltaSec(elapsedSec, runtime.settings.timing.maxDeltaTimeSec)`.
A smaller selected emission delta never slows motion. Motion applies one angular
increment and wraps normally; no catch-up loop or interpolation exists. Orb
response/waveform position is evaluated at the actual newly sampled phase.
Analysis, AudioEngine sampling, FFT, transport, scrubber, and recording receive no
visual motion delta and retain their interfaces.

`CONFIG.limits.timing.motionDiscontinuitySec = .5` is frozen operational policy,
not a preset/default field or artistic control. Exactly .5 s advances motion;
anything above .5 s discards **both** deltas, without motion/emission debt.
Particles still age/expire against real `nowSec`. This chooses zero demand for the
discontinuity callback, rather than producing one capped catch-up batch.

The timing anchor always rebases. First callbacks use zero deltas but still run
analysis, real-time retirement, rendering, and UI; unlike H.U, they do not return
before those consumers. Zero/backward/nonfinite intervals cannot move or emit.
Negative/nonfinite timestamps clear the anchor; the next valid callback rebases
with zero deltas, then subsequent ordinary intervals integrate normally. A
backward valid nonnegative timestamp rebases at that timestamp with zero deltas.

A named `visibilitychange` listener clears the existing anchor on hide and show;
DOM registration of the same callback is idempotent. Hidden callbacks use zero
deltas. First foreground callbacks rebase, even if the elapsed gap is shorter
than .5 s; subsequent ordinary callbacks resume. No background timer, polling,
visualizer rebuild, or hidden history cache was introduced. Browser-independent
callers without `document` are treated as visible. Real particle age is not
converted to accumulated motion time.

## Ring, pause, and direct callers

Orb adapters pass additive motion time as the optional seventh `Orb.step`
argument; legacy direct callers omit it and retain their supplied `dtSec` phase
convention. Frame consumers similarly default `motionDtSec` to `dtSec`. Direct
module callers own valid supplied elapsed values; the application callback owns
the visibility/discontinuity boundary. No Orb reads clock or DOM state.

Free Ring phase now uses the same motion-time policy and freezes while visual
simulation is paused. Orb lock still copies the current first Orb phase after
Orb updates, including while paused; reordering therefore remains truthful.
Composition stays Ring-before-Orbs independently of update dependencies.

Paused Orb adapters skip phase/response/emission and preserve fractional progress,
but call the expiry operation with real time. Particle history can expire during
pause, as its fade already used real elapsed age. No playback or recorder pause
semantics changed. This narrowly corrects the old free Ring advancing during the
global visual-motion pause. Track/visual resets retain their distinct ownership.

## Chronological expiry and exceptional callers

Normal monotonic callback timestamps produce nondecreasing births per trail.
Same-timestamp demand is ordered by insertion. Oldest-first governor eviction,
live retention trimming, and reconciliation only remove/retain nodes; they do not
reorder births. Transfers preserve insertion order through existing `emitAt`.
Reset/removal/disposal clear nodes through the same ownership path.

The invariant is **not universal**: supported direct/standalone emissions and
existing tests intentionally supply older timestamps after newer ones. Sorting
or rejecting those callers would alter existing behavior. ParticleList instead
tracks `birthOrderMonotonic` conservatively:

- Append compares only new birth time against current tail, setting false on a
  backwards insertion. Same timestamps remain ordered.
- Unlink restores true when <=1 node remains; reset/disposal naturally reaches
  that condition. No additional references are retained.
- A false flag may persist after the offending node is gone until the list
  shrinks/resets. This conservatively trades rare exceptional-case speed for
  correctness; no per-frame ordering validation scan occurs.

`TrailSystem.expireParticles(nowSec, ttlSec)` retires expired nodes through the
existing governor. Ordered trails inspect the expired prefix and stop at the
first unexpired head. Empty trails inspect zero nodes. Unordered trails safely
scan all nodes, so an unexpired newer-born head never shields expired older births
behind it. Normal cost is O(active Orbs + particles expired) age inspections,
plus the existing O(log live particles) indexed-heap removal work. This is not
constant-time total retirement.

The exact `age >= TTL` boundary and existing TTL normalization floor are unchanged.
Live TTL reduction/increase applies to existing history without rebuilding or
changing timestamps. Linked head/tail/length, heap indices, owner links, counters,
and current spacing-tail references remain correct. No second expiry index or
persistent history format was added. Renderer access remains read-only by
contract; mutating a stored particle's birth timestamp externally is unsupported.

Operation-count evidence:

| Case | Age inspections |
| --- | ---: |
| Empty trail | 0 |
| Ordered trail, no expiration | 1 |
| One expired plus a surviving head | 2 |
| Several expired plus a surviving head | expired count + 1 |
| All expired | particle count |
| 100,000 unexpired particles | **1** |
| Full permitted 1,048,576 unexpired particles | **1** |

The 100,000 fixture additionally reduces TTL, retires 50,001 nodes with 50,002
inspections, increases TTL without losing surviving history, and later expires
the remainder. Small exact-boundary and same-timestamp fixtures, independent Orb
TTLs, unordered insertion/transfer, eviction, zero retention, reset, and disposal
have direct assertions. The retained tail is checked after expiry before spacing
eligibility; an empty trail can emit at its old location without a coordinate cache.

## Investigation method and decisions

Optional apparatus: `measure-rc15-timing.mjs` / `validate-rc15-timing.cjs`.
Evidence: `initial-hu-profile.json` (24 pre-edit runs), `native-comparison.json`
(120 runs), `native-saturated.json` (12 runs), and grouped
`measurement-summary.json` (44 summaries). Chromium 146 native headless,
1280×800 DPR1, generated silent stereo PCM. Each group has three fresh-page trials
with rotating H.U/H.V order, both uninstrumented and instrumented callbacks.

Most cases: 330 update-only warmup frames + 30 actual production callbacks, fixed
synthetic 60 Hz (six seconds). Slow cases use 10/5 Hz for 36/72 elapsed seconds.
Suspension injects one 120-second gap into the sampled callbacks. The saturated
case repeats the original 1,080 warmup + 120 callback, 20-second schedule. H.U/H.V
receive identical settings, timestamps, dimensions, DPR, and emission budgets.
Synthetic fixtures do not reproduce the human developer's undisclosed preset.

Instrumentation measures audio sampling, analysis update, Orb motion/response,
particle preparation, expiry inspection/retirement, fairness scheduling,
heap admission/retirement, policy sync, Canvas submission, diagnostic refresh,
whole UI refresh, and total synchronous callback. Timers are measurement-only
wrappers/HTTP source seams; nothing imports them into the app. H.U's inline expiry
is extracted without changing its full-scan behavior only in profiling mode.
Uninstrumented mode uses exact production source and measures only total callback
wall time. Counters remain actual governor state in both modes.

Initial probes evolved during their first trial: some initial heap-call totals
include post-measurement trimming. They are not used for before/after operation
comparisons; both final comparison datasets uniformly exclude those trim calls.

Fine-grained components derived by subtracting nested inclusive timers are
approximate and clamp negative timer noise to zero. Heap admission includes
nested eviction; heap retirement also includes TTL retirement. Do not add these
inclusive columns together. UI includes diagnostics as a subset. Other callback
work includes resize, scrubber, coordinator work, and timer overhead. COOP/COEP
provides roughly 5-microsecond native resolution; 0.000 means below resolution or
no operation, not a proof of zero cost. Raw per-callback data, p95s, means, counts,
and selected policies remain available. Source-module profiling is not a claimed
GPU measurement or exact estimate of bundled/transpiled instruction costs.

Initial profiling demonstrated a 100,000-particle, no-expiration fixture spent
about 2.5 ms median in expiry inspection alone. The old scan visited 36 million
nodes over 360 updates. Policy sync was below median timer resolution; diagnostic
refresh measured about .005–.020 ms. The larger UI refresh and Canvas submission
were far more significant. No evidence isolated Prompt-2's 12.4→14.5 ms callback
change to the governor or diagnostic reads.

Implemented correction: ordered-prefix expiry removes demonstrated unnecessary
visitation. Rejected additional changes: policy normalization was already reference
protected; caching diagnostic snapshots risks stale counters for tiny measured
benefit; scheduler/heap redesign and general UI/rendering work are outside this
narrow correction. No governor recreation, alternate authority, adaptive budget,
quality reduction, hidden emissions ceiling, or particle-history cache was added.

## Before/after metrics

All normal cases use selected budgets 512 emissions/update and 16,384 retained.
Large retention uses 4,096/update and 131,072 retained, with 100,000 seeded particles
and zero per-Orb emission. Its synthetic X-axis positions are mostly offscreen;
this isolates retained traversal rather than modeling a real million-particle
picture. Stationary explicitly freezes sampled emitter coordinates only; canonical
Orb motion otherwise has a positive minimum speed/radius. Other nondefault scenes
use 1,000 emissions/s/Orb, TTL60, radius .1, speed1 rad/s, chirality+1, ten trace
segments, and spacing .5 except dense-sixteen's deliberate zero.

Below: uninstrumented callback medians (median of three run medians) in ms.
Inspection counts cover each entire scheduled run and were identical in all trials.

| Scenario | Orbs | Spacing | H.U live | H.V live | H.U expiry visits | H.V expiry visits | H.U callback p50 | H.V callback p50 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Default two | 2 | .5 | 240 | 240 | 43,320 | 718 | 1.320 | 1.320 |
| Moving sixteen | 16 | .5 | 5,760 | 5,760 | 1,033,920 | 5,744 | 4.890 | 4.910 |
| Dense sixteen | 16 | 0 | 16,384 | 16,384 | 5,386,368 | 5,744 | 11.320 | 13.625 |
| Stationary sixteen | 16 | .5 | 16 | 16 | 5,744 | 5,744 | 1.200 | 1.315 |
| Stress64 | 64 | .5 | 16,384 | 16,384 | 3,792,896 | 22,976 | 16.625 | 15.950 |
| Stress256 | 256 | .5 | 16,384 | 16,384 | 5,365,760 | 91,904 | 21.510 | 24.360 |
| Large retention | 16 | .5 | 100,000 | 100,000 | 36,000,000 | 5,760 | 43.980 | 40.450 |
| Slow10 | 16 | .5 | 5,760 | 5,760 | 1,033,920 | 5,744 | 6.405 | 6.115 |
| Slow5 | 16 | .5 | 4,800 | 4,800 | 1,005,792 | 6,704 | 6.110 | 5.680 |
| Suspension | 16 | .5 | 480 | 464 | 880,800 | 10,992 | 1.390 | 1.635 |
| Saturated20s | 16 | .5 | 16,384 | 16,384 | 11,264,000 | 19,184 | 12.995 | 13.055 |

Suspension's live difference is intentional: H.V emits nothing on the discarded
120-second gap while H.U creates one candidate/Orb. Slow10 and Slow5 have the same
admitted counts and real-time history length but correct movement in H.V:

| Schedule | Elapsed seconds | H.U angular advance (rad) | H.V angular advance (rad) | Mean retained history (s) |
| --- | ---: | ---: | ---: | ---: |
| 10 Hz | 36 | 12 | 36 | 35.9 |
| 5 Hz | 72 | 12 | 72 | 59.8 |

Deterministic nominal one-second tests at 120/60/30/10/5 FPS advance exactly .75 rad
in both chiralities within 1e-10 tolerance, with no ambiguous whole revolution.
Real TTL/fade tests at 5/10 FPS link age to angular history and explicitly allow
one sample interval at the oldest end. They do not fabricate missed intermediate
positions. Visibility/stall cases intentionally omit suspended phase movement.

Instrumented median component examples, ms; raw summary includes all scenarios:

| Case/version | Audio sample | Motion/response/color | Demand prep | Expiry checks | Fair scheduling | Heap admission incl. | Heap retirement incl. | Update | Canvas submit | UI refresh | Diagnostics |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Moving16 H.U | .795 | .020 | .015 | .060 | .005 | .000 | .000 | .140 | 3.070 | .465 | .015 |
| Moving16 H.V | .805 | .020 | .015 | .000 | .005 | .000 | .000 | .055 | 3.180 | .530 | .010 |
| Dense16 H.U | .840 | .025 | .020 | .390 | .040 | .160 | .090 | .730 | 13.090 | .870 | .020 |
| Dense16 H.V | .820 | .020 | .015 | .005 | .040 | .185 | .105 | .280 | 10.620 | .835 | .020 |
| Stress256 H.U | .835 | .200 | .115 | .535 | .055 | .145 | .065 | 1.225 | 9.420 | 7.050 | .020 |
| Stress256 H.V | .835 | .135 | .090 | .030 | .060 | .160 | .090 | .610 | 11.555 | 6.865 | .020 |
| Large H.U | .830 | .040 | .035 | 2.040 | .000 | .000 | .000 | 2.150 | 35.000 | .860 | .015 |
| Large H.V | .835 | .025 | .020 | .000 | .000 | .000 | .000 | .065 | 36.430 | .895 | .015 |
| Saturated H.U | see JSON | see JSON | see JSON | .450 | .005 | .015 | see JSON | .560 | 10.855 | .815 | .020 |
| Saturated H.V | see JSON | see JSON | see JSON | .000 | .005 | .020 | see JSON | .070 | 10.945 | .785 | .020 |

Analysis update typically .005 ms; policy sync median was below resolution.
The nine requested work areas are measured; individual heap swaps/sifts are not
reliably timed separately because that instrumentation would dominate them.
Insertion/retirement call counts and existing actual heap-comparison counts are
recorded instead. Allocation pressure/GC is not isolated by these timers; no
allocation-specific optimization claim is made.

For saturated20s, both versions request 320,000 opportunities, suppress 300,800,
admit 19,200, evict 2,816, expire zero, and finish with 16,384 particles and 17.05 s
mean retained history. Both execute 92,415 heap comparisons and 38,400 scheduling
visits. Aggregate-budget rejection is zero because sixteen eligible candidates
fit even the default emissions policy. The emission ceiling's higher-value
behavior remains proven by H.U's actual 16,384 admissions/update and full million
retention tests, not inferred from this fixture.

Other counts, history durations, expired/evicted totals, refusal causes, heap
operations, policy values, frame samples and p95s are in `measurement-summary.json`
and the raw reports; they are not estimated from configured rates. All ordinary
comparison populations/counters match except the intended suspension difference.

Positive evidence: large-retention update median falls 2.150→.065 ms; saturated
update .560→.070 ms; normal expiry inspections become independent of retained
population. Large uninstrumented callback median improves 43.980→40.450 ms.
Negative evidence: dense-sixteen uninstrumented callback rises 11.320→13.625 ms,
stress256 rises 21.510→24.360 ms, and suspension median rises 1.390→1.635 ms.
Instrumented/uninstrumented callback medians disagree in some groups; Canvas
backpressure/GC/host variance can dwarf update savings. Saturated uninstrumented
12.995→13.055 ms is essentially unchanged despite a large profiled update reduction.
Intervals above .5 s discard motion by explicit policy even if produced by a
sustained exceptionally heavy scene; this stage promises elapsed-time motion
through the authorized ordinary-frame threshold.
No universal FPS improvement or isolated cause for the prior H.T/H.U regression
is established. Larger unchanged user-selected workloads can still be very slow.

Live expert policy increases preserve exact nodes, heap array, priority ownership,
and current governor. Reductions complete before rendering. Uninstrumented
100,000→8,192 reduction retires 91,808 nodes, costing H.U 19.640/19.980/22.450 ms
and H.V 20.605/19.000/21.605 ms. Stress256's 16,384→8,192 costs H.U
3.570/2.940/3.110 ms and H.V 3.775/3.740/3.545 ms. No claim of faster heap trimming
is made. Selected emission/retention ranges and zero semantics remain unchanged.

Measurement limitations: three trials are not a hardware survey; headless shared
host scheduling, raster flushes, GC and timer wrappers affect tails. Some optional
native integration/unit validation ran on the host during portions of the broad
comparison; the matched saturated run had no concurrent browser validation.
Canvas submission is CPU command work/backpressure, **not GPU completion**. Large
retention is a traversal fixture, not a verified full-million Canvas performance
configuration. Neither fixture reproduces the human preset. No FPS adaptation or
hidden budget reduction compensates for unfavorable results.

## Tests, mutations, validation, and Prompt-4 targets

188 focused regressions pass. New deterministic cases execute the actual production
callback in a VM with subsystem seams and real Orb/governor/Ring implementations.
Native booted source-module integration (`native-clock.json`) passes at DPR1/DPR2:
all five frame rates and chiralities, bounded emission, current-frame lock, 120 s
stall retirement and recovery, registered visibility event rebasing with synthetic
hidden/visible events, pause lifetime, live zero budget, focus/editor identity and
truthful live/cumulative diagnostics. Native visibility events are explicitly
simulated, not a claim about OS suspension automation.

Eight isolated-copy mutations detected: capped Orb motion, unbounded phase catch-up,
unbounded slow-frame emissions, full expiry scan, unsafe unordered early exit,
stale retirement heap index, stale diagnostic refresh and ignored free Ring pause.
Retired-node assertions determine expected expiration from birth/TTL independently
of heap-index sign, so stale index mutation is caught. Mutation files/logs are local
to this report; production was never patched by the runner. Diagnostics production
code was not optimized; existing unchanged-write, real-count, listener/focus and
nonpersistence regressions continue to pass.

Prior RC-01–RC-14 and H.T/H.U protections remain. Only expectations contradicted
by explicitly authorized timing changes were updated: discontinuity callbacks now
have zero deltas and still run consumers; free Ring respects global pause. The
independent 1/30 helper, imported ceiling and per-Orb defensive burst tests remain.
The permitted-million retention test now also asserts one unexpired age inspection.
Schema-10 field inventory and complete fixtures are unchanged; new timing policy
is explicitly proven absent from canonical encoding.

All 33 full-suite test files pass. Final sequential validation is recorded in
`validation.log`: dependencies were
already installed, then `npm test`, `npm run build`, `git diff --check`. Standalone
`dist/auralprint_0.1.15m.h.v.html` is verified with inline CSS/JS and no external
script/stylesheets; generated outputs/dependencies remain ignored and untracked.
`artifact-verification.json` records version/schema/hash, and native standalone
budget/UI checks retain the previous controls/persistence/accessibility contract.

Remaining review targets for Prompt 4: human slow-frame visual acceptance, exact
human preset comparison, background lifecycle/clock boundaries under hostile
integration, exceptional unordered fallback longevity, large trim/render/memory
costs, UI scaling at 64/256+ Orbs, and renderer/GC variability. No heap replacement,
Canvas batching, quality adaptation, camera, angular controls, new visualizer,
analysis rewrite, other RC remediation, public CHANGELOG update or general docs
cleanup. Prompt 4 owns integrated hostile validation, release-blocker review,
cumulative PR and hosted CI under its separate authorization.


Optional reproduction (environment-provided Playwright/Chromium; no project dependency):

```sh
AP_BASELINE_ROOT=/path/to/exact-hu-worktree AP_REPORT=/tmp/comparison.json node scripts/validate-rc15-timing.cjs
AP_BASELINE_ROOT=/path/to/exact-hu-worktree AP_CASES=saturated-sixteen AP_REPORT=/tmp/saturated.json node scripts/validate-rc15-timing.cjs
AP_REPORT=/tmp/native-clock.json node scripts/validate-rc15-clock.cjs
python docs/audits/remediations/115m-h-v-rc15-timing-performance/mutation-check.py
```

Set `AP_PLAYWRIGHT_MODULE` and `AP_CHROMIUM_PATH` if environment locations differ.
