# 115M.H.U — user-controlled particle resources

**RC-15: OPEN P2 — CORRECTIVE REMEDIATION IN PROGRESS.**

Prompt 2/4 only. Version `v0.1.15m.h.u`; preset schema remains 10. No promotion,
release, push, merge, or cumulative PR. Prompt 3 has not begun.

## Checkpoint and scope

Starting branch: `codex/115m-h-t-rc15-correction`, clean at exact accepted
`ddbba02cd2b4f05bc12c9814583d33b82a6bef91`, source `v0.1.15m.h.t`, schema 10.
The baseline implementation and `agents.md` were inspected. The H.T performance
comparison uses a detached worktree at this exact commit, not a reconstructed
approximation or remote branch. The continuing branch was not reset.

Resulting checkpoint: the commit introducing this report on that same branch.
Its exact immutable SHA is supplied in the review handoff and can always be
resolved with:

```sh
git log -1 --format=%H -- docs/audits/remediations/115m-h-u-rc15-budgets/README.md
```

A commit cannot contain its own resulting SHA as literal committed text. This
file-specific commit lookup identifies this stage even after Prompts 3–4 advance
branch HEAD.

Only scene-wide resource policy, live application, persistence, Settings ownership,
lightweight diagnostics, and their tests/evidence changed. Analyzer interfaces,
L/R/C selection, Orb identity/phase/channel behavior, recording/source lifecycle,
4,096-Orb admission, coordinate architecture, clocks, TTL traversal, indexed heap,
rendering architecture, and placement eligibility remain intact.

## Canonical configuration

```js
preferences.particleSafety = {
  maxEmissionsPerFrame: 512,
  maxActiveParticles: 16384,
};
```

| Field | Minimum | Default | Maximum | Step |
| --- | ---: | ---: | ---: | ---: |
| `maxEmissionsPerFrame` | 0 | 512 | 16,384 | 1 |
| `maxActiveParticles` | 0 | 16,384 | 1,048,576 | 1 |

`CONFIG.defaults.particleSafety` owns selected defaults;
`CONFIG.limits.particleSafety` owns range metadata. The canonical hierarchy is
CONFIG → preferences → `runtime.settings.particleSafety` → governor enforcement.
No additional 512/16,384 cap remains in production.

`core/particle-safety.js` is the shared normalizer for sanitation, preference
resolution, constructor policies, and live changes. Each property independently
accepts only `Number.isInteger`; malformed types, missing values, NaN, infinities,
and fractional numbers fall back to that property's default. Valid integers
clamp to documented min/max. Zero survives. Arrays/null/nonobjects become a
missing object. Unknown properties never enter the returned object. UI numeric
entry validates before mutation and refuses out-of-range/noninteger/empty entries
rather than changing the saved value.

Schema 10's authorized pre-release extension persists only this canonical object
at `prefs.particleSafety`. Missing development schema-10 and historical schemas
2–9 receive defaults. The complete nondefault fixture now exercises both fields
through URL encoding, import, replacement, and independent field round trips.
`minPlacementDistancePx` stays intact; obsolete `overlapRadiusPx` stays discarded.
Heap nodes, service queues, counters, and allocations are never encoded. Reset All
Settings restores CONFIG defaults. This authorization does not permit mutations
of a future published schema 10.

## Live ownership, timing, and retention

`ParticleGovernor.applyPolicy()` replaces a frozen normalized policy snapshot
inside the same governor. It does not rebuild runtime participants, trails,
particle lists, or the heap. Increasing limits preserves every retained node and
chronological order, emitter fractions, and persistent fairness links. Lost
history cannot be reconstructed.

`UI.applyPrefs()` resolves settings and immediately calls
`VisualizerRuntime.syncSettings()`. Rebuild/reconcile/reset, update, and render
also synchronize a changed derived policy reference. Derived settings are replaced
by the existing resolver, so unchanged references avoid per-frame normalization.
A change is enforced before the next render even when render precedes update.
Preset replacement follows the existing preset reset lifecycle; a budget edit
alone never resets phase or history.

A lower retention limit repeatedly retires the indexed heap root through the
existing retirement operation, ordered by birth timestamp then global insertion
sequence. Survivors retain Orb-owned linked-list ownership. Trim completes before
render; no over-cap population is briefly drawn. Work is proportional to the
number retired with existing heap costs; a large reduction can block the callback.
No TTL change, second governor, or preference history rewrite occurs.

Zero emissions prevents scheduler service but preserves existing particles for
normal TTL retirement. Zero retention first retires all retained nodes and then
refuses retention; the scheduler performs no admission loop at zero capacity.
Increasing from zero enables later opportunities. Orb motion, the Ring, analysis,
and playback remain independent. Disposal empties heap/list/priority ownership and
counters; reinitialization applies current settings rather than stale defaults.

Explicit factory `particlePolicy` injection is an isolated fixed test policy,
normalized using the same ranges. Tests can use tiny budgets. Production singleton
initialization does not inject it and always follows derived user settings. Tests
verify that changed user settings cannot accidentally override an explicit test
policy, and that production policy updates do take effect.

## Fairness, spacing, and accounting

Prompt-1 eligibility is unchanged: nonzero spacing compares squared DPR-scaled
CSS distance only to the same Orb's current retained tail and prepares at most one
candidate per callback. Suppression precedes shared scheduling and consumes no
allocation. Zero spacing permits identical-position dense demand. Per-Orb rates
and the independent simulation-delta/defensive-demand limits remain authoritative.

Selected emissions capacity applies to eligible demand through the existing
persistent service queue. Policy changes preserve that queue, including across
Orb reordering. Whole refused demand is discarded in its original update;
fractions survive. No deferred whole-emission catch-up is introduced. At zero
capacity, no owner is falsely advanced as served.

Diagnostics retain the existing requested/admitted/spatial/dropped accounting
and separate dropped demand into `budgetRejectedDemand`, `rateLimitedDemand`,
and `retentionRejectedDemand` (zero capacity). TTL expiration is distinct from
retention eviction. Zero capacity takes precedence over emission-budget rejection
when both policies are zero. For ordinary finite updates:

```text
requested = emitted + spacing suppressed + dropped
dropped = emission-budget rejected + rate/timestep refused + zero-capacity rejected
```

`retentionEvictionsTotal` counts both admission eviction and policy trimming,
resetting on full runtime disposal. Existing `evicted` remains frame-local; a trim
between updates can increment it until the next `beginFrame()`. The UI deliberately
uses the cumulative count so out-of-frame trims remain visible and labels the
scope accurately. Direct low-level history transfers/admission probes are not
per-update emission requests; scheduling owns request/rejection counters.

## Settings UI and accessibility

Settings → Performance → Particle Resources owns two precise number controls:
Maximum Live Particles and Maximum Emissions Per Update. Both take min/max/step
from CONFIG, show actual selected values, and have explicit labels, help/error
associations, visible integer validation, and the authorized high-limit warning.
There is no slider for the million-particle range and no confirmation dialog.
Individual Orb and Bulk Edit ownership are unchanged.

Only committed `change` events mutate preferences; intermediate keystrokes do
not repeatedly commit. Empty/invalid edits retain the saved choice. Wiring is
idempotent, valid edits preserve focus and DOM/editor identity, and unrelated
refreshes preserve focused partial entries. Preset/reset changes reflect active
values through existing Settings refresh.

The compact status area reads the actual governor: current live count; emitted,
spacing suppression, emission-budget rejection, defensive refusal, zero-capacity
rejection, and TTL expiry from the most recent update; and retention retirements
since runtime initialization. Existing UI refresh is reused. Only changed diagnostic
text is written; no extra traversal, telemetry, history, graph, FPS estimator, or
adaptive policy was added.

## Behavioral validation and mutations

Focused production tests cover:

- Strict independent normalization, zeros/maxima, malformed direct inputs,
  historical defaults, canonical stripping, schema-10 round trips and spacing.
- Live capacity increases preserving exact nodes/fractions/heap/priority; oldest
  timestamp and deterministic sequence retirement; repeated reconfiguration with
  heap/list/owner checks; no stale expired/evicted references.
- Zero emission retaining history; zero retention clearing/refusing/recovering
  without debt; zero-Orb lifecycle; motion/Ring with both policies zero; pause.
- **16,384 actual admissions in one update, 32,768 actual retained particles**, then
  lowered capacity 20,000 with **513 actual admissions** in the next update.
- **1,048,576 actual retained particles**, one oldest eviction at the full permitted
  boundary, then safe complete retirement to zero. This is a retention-only
  admission probe; the shared scheduler's per-update maximum is tested separately.
- Dynamic fairness under budgets 1/0/2, spacing suppression before scheduling,
  fractional low-rate emission, independent delta guard, no catch-up debt.
- Runtime/render synchronization, identity preservation, explicit test-policy
  separation, collection create/duplicate/remove/reorder/reconcile, track/visual
  resets, rebuild/disposal/reinitialization, preset replacement and default reset.
- Settings ownership/ranges/labels/help, keyboard-compatible committed edits,
  refusal, focused partial entry, exact readouts, listener identity, unchanged DOM
  writes, diagnostic accuracy, real coordinator share/import/reset reflection.

All 139 focused regressions pass. The full prior spacing, RC-15 phase-2/3, and RC-01–RC-14 suites remain. Prior tests
using numeric CONFIG ceilings now read selected CONFIG defaults; the obsolete
"budgets never persist" assertion was narrowly updated to the authorized selected
policy contract. Existing default-ceiling behavior and immutable policy snapshots
still have behavioral assertions.

Seven isolated-copy mutations were detected: old emission hard cap, old retention
hard cap, governor recreation, missing trim, stale runtime policy, incorrect zero
retention, and runtime counter persistence. See `mutations.json` and individual
logs; enormous failed node-array diffs are explicitly shortened. Mutations never
alter production files. Removing the zero-capacity admission guard is detected by
an invalid heap retirement in the behavioral test, rather than a syntax failure.

Native Chromium standalone validation at DPR 1 and 2 passed: offline boot with
external requests blocked, keyboard ArrowUp/Enter commits, empty refusal/feedback,
selected values, stable focus/input/editor host, share/preset schema 10 without
counters, URL reload, Reset All defaults, zero-policy fresh initialization, and
empty-scene diagnostics. See `native-ui.json`. Existing lifecycle/reset semantics
and analyzer/playback regressions remain in the full suite.

## Comparative measurements

`native-performance.json` preserves all 36 runs and callback samples;
`measurement-summary.json` contains twelve grouped summaries. Optional runners
are `scripts/validate-rc15-budgets.cjs` and `scripts/measure-rc15-budgets.mjs`.

Chromium 146 native headless; viewport 1280×800, DPR 1. Each fresh-page run uses
1,080 update-only warmup frames and 120 instrumented production callbacks with a
fixed synthetic 60 Hz timestamp clock (20 seconds of simulated history). Captured
native `performance.now` measures real CPU work. Three rotating-order trials per
variant/spacing/scenario. All variants use identical scene settings apart from
selected budgets; spacing is compared in separate groups. Generated silent stereo
PCM drives production analysis. The 16-Orb scene is explicitly synthetic: rate
1,000/s per Orb, TTL 60 s, radius .1, angular speed 1 rad/s, ten trace segments.
The two-Orb fixture otherwise retains default settings. **Neither reproduces the
human developer's actual scene/preset.**

D = defaults 512 emissions/update, 16,384 retained; E = expert 4,096/update,
65,536 retained. Counts below are identical in all three trials.

| Scene / spacing | Policy | Requested | Spacing suppressed | Emitted | Budget rejected | Retention evicted | Live | Mean retained history (s) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Two / .5 | H.T D / H.U D / H.U E | 9,600 | 8,800 | 800 | 0 | 0 | 240 | 5.983 |
| Two / 0 | H.T D / H.U D / H.U E | 9,600 | 0 | 9,600 | 0 | 0 | 2,880 | 5.983 |
| Sixteen / .5 | H.T D / H.U D | 320,000 | 300,800 | 19,200 | 0 | 2,816 | 16,384 | 17.050 |
| Sixteen / .5 | H.U E | 320,000 | 300,800 | 19,200 | 0 | 0 | 19,200 | 19.983 |
| Sixteen / 0 | H.T D / H.U D | 320,000 | 0 | 320,000 | 0 | 303,616 | 16,384 | 1.017 |
| Sixteen / 0 | H.U E | 320,000 | 0 | 320,000 | 0 | 254,464 | 65,536 | 4.083 |

TTL expiration: two/.5 = 560, two/0 = 6,720; sixteen = 0. Rate/timestep and
zero-capacity rejection are zero in these runs. The sixteen fixture requests at
most about 267 particles/update, so it cannot saturate even default emission
capacity. Raising that budget alone does not increase these scenes' emissions;
the separate 512-Orb behavioral fixture proves higher scheduling capacity. Greater
retention prevents lost history. Fixed ten-segment trace history is .5 s (two/.5),
.033 s (two/0), .167 s (sixteen/.5), and 0 s (sixteen/0); same-position duplicate
particles still consume trace slots when filtering is deliberately disabled.

Timing table: median across three trials of each run's median; callback p95 is
the median of the three run p95s. All units ms. Governor column measures
`finishFrame` scheduling/admission/retention work, excluding TTL traversal; the
visualizer update includes TTL traversal and Orb updates. Raw means/tails are
retained in the JSON rather than discarded.

| Scene / spacing | Variant | Governor p50 | Update p50 | Canvas submission p50 | Callback p50 | Callback p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Two / .5 | H.T D | 0.0 | 0.0 | 0.3 | 1.1 | 2.7 |
| Two / .5 | H.U D | 0.0 | 0.0 | 0.2 | 1.0 | 2.3 |
| Two / .5 | H.U E | 0.0 | 0.0 | 0.3 | 1.2 | 2.5 |
| Two / 0 | H.T D | 0.0 | 0.0 | 1.5 | 2.5 | 54.8 |
| Two / 0 | H.U D | 0.0 | 0.0 | 1.6 | 2.5 | 55.3 |
| Two / 0 | H.U E | 0.0 | 0.0 | 1.5 | 2.4 | 54.7 |
| Sixteen / .5 | H.T D | 0.0 | 0.4 | 9.6 | 12.4 | 62.2 |
| Sixteen / .5 | H.U D | 0.0 | 0.4 | 11.4 | 14.5 | 64.7 |
| Sixteen / .5 | H.U E | 0.0 | 0.4 | 12.3 | 16.8 | 63.1 |
| Sixteen / 0 | H.T D | 0.1 | 0.5 | 8.9 | 12.2 | 91.6 |
| Sixteen / 0 | H.U D | 0.1 | 0.6 | 8.8 | 12.2 | 90.5 |
| Sixteen / 0 | H.U E | 0.1 | 1.3 | 135.7 | 139.2 | 179.4 |

Higher expert budgets provide measurably longer retained history and can be much
slower. In the sixteen/0 fixture, callback median grows about elevenfold. Default
two-Orb and sixteen/0 medians are close to H.T. **The default sixteen/.5 callback
median is worse by 2.1 ms (~17%)**, despite the unchanged .4 ms update median and
identical particle counts. Per-trial Canvas medians vary substantially, and there
is no renderer change in this stage. This experiment cannot isolate that difference
to policy synchronization or prove a universal default-performance improvement.
Prompt 3 should investigate remaining governor/update cost with controlled timing.

Live reductions use the populated expert scenes through canonical preference
resolution plus `syncSettings`, preserving exact governor, heap array, trail,
fraction, and priority ownership:

| Scene / spacing | Before → after | Retired | Resolution + trim ms (three trials) |
| --- | --- | ---: | --- |
| Sixteen / .5 | 19,200 → 8,192 | 11,008 | 5.4, 3.9, 4.0 |
| Sixteen / 0 | 65,536 → 8,192 | 57,344 | 13.5, 13.8, 13.5 |

Two-Orb reductions lower selected capacity to the existing population, retire
zero, and cost 0–.2 ms. These are synchronous trim costs, not GPU measurements or
predictions for million-particle reductions.

Limitations: native timer quantization is roughly .1 ms, so reported 0.0 medians
mean below that resolution. Headless browser/shared-machine scheduling, GC/raster
flushes, and instrumentation affect results; brief optional UI/test validation
also ran on the host during portions of measurement. Canvas submission measures
CPU command submission/backpressure, **not GPU completion**. These short synthetic
runs do not establish hardware-wide FPS, memory ceilings, long-session stability,
or real-world full-million rendering viability. Upper ranges are permissions,
not performance guarantees. The complete million-particle retention boundary is
covered behaviorally without submitting that population to Canvas.

## Validation and remaining work

Dependencies were already installed by Prompt 1; no manifest/lock changes or new
dependencies. Final sequential validation: `npm test`, `npm run build`, and
`git diff --check`. The versioned standalone artifact is
`dist/auralprint_0.1.15m.h.u.html`; distribution/dependency directories remain
ignored and untracked. `validation.log` and `artifact-verification.json` record
final results, schema/version, inline distribution, and output hash.

Unchanged known limitations and deliberate deferral: real-time vs simulation-time
TTL consistency, full TTL list traversal, indexed-heap costs, million-population
rendering/memory risks, and synchronous large trims. No automatic quality policy,
FPS throttle, renderer batching, heap redesign, angular-motion changes, TTL-loop
optimization, or additional Orb controls. Prompt 3 owns timebase consistency and
measured governor overhead investigation. Prompt 4 owns hostile integration,
cumulative comparisons/document reconciliation, review PR and human acceptance.
RC-15 remains open; Build 115 is not promoted.
