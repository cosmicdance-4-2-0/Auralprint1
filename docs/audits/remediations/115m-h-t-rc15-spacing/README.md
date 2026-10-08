# 115M.H.T — Per-Orb minimum particle placement distance

**RC-15: OPEN P2 — CORRECTIVE REMEDIATION IN PROGRESS.**

Revision: `v0.1.15m.h.t`. Preset schema: **10**, retained by explicit developer
authorization for this final pre-release correction. Build 115 is not promoted.
This is Prompt 1 of 4; the subsequent stages are deliberately unimplemented.

Accepted starting baseline: merged `main` commit
`ec5c6238ffa6c51dd05a03fdcc0209461e21bc44` (`v0.1.15m.h.s`, PR #37).
Continuing branch: `codex/115m-h-t-rc15-correction`. No merge, release, or PR.
The checkout initially contained clean, older `e273bba` sources. The workspace
Git proxy was unreachable. Connected GitHub GET access supplied the accepted
commit, missing blobs, and PR #37 history; every blob/tree/commit object was
verified against its original Git SHA, including the signed merge commit.
A detached worktree at that exact commit supplies the H.S benchmark control.
No unrelated working changes were overwritten.

## Behavior and ownership

This is minimum particle **placement distance**, not retired overlap detection.
The former overlap implementation searched historical particles and removed
nearby history. This correction only prevents creation of redundant particles:
it neither searches a trail for proximity nor deletes particles for proximity,
and never compares different Orbs. Ordinary TTL expiration and governor eviction
remain the only spatially unrelated retirement paths.

The setting is `preferences.orbs[].particles.minPlacementDistancePx`, default
**0.5 CSS pixels**. CONFIG owns the range **0–10**, step **0.1**, and the default.
Finite values clamp to CONFIG limits; absent/nonfinite/non-numeric values fall
back to the canonical default (or a valid normalization fallback). Zero is
preserved, including on import, resolution, encoding, duplication, and live edits.
Normalization follows existing numeric control conventions without quantizing
valid imported fractional values to the UI step.

`Orb.step()` passes active `state.dpr` to TrailSystem. Eligibility converts the
CSS threshold to simulation distance by multiplying by DPR, then squares that
threshold once. It compares `dx*dx + dy*dy >= thresholdSquared`; no square root.
Equivalent CSS motion at DPR 1 and 2 makes the same decision. Equality is
accepted; movement below the threshold is suppressed. Invalid DPR defensively
uses 1. The existing device-pixel canvas coordinate architecture is unchanged.

The implementation follows `CONFIG → preferences → runtime.settings → state`.
The renderer still receives the existing chronological ParticleList; its tail
node supplies the same Orb's last *currently retained* particle. There is no new
coordinate history cache or lasting reference to a retired node. Returning near
an older position is allowed when movement from the retained tail is sufficient.

## Eligibility, timing, and fairness

TrailSystem's existing TTL traversal runs first. Its rate accumulator then adds
`rate * dt`, keeps the fractional remainder, and prepares bounded whole demand.
Spacing adds eligibility to those actual whole opportunities: distance alone
cannot cause a low-rate Orb to emit early.

With nonzero spacing, demand is capped at one candidate for the single position
sampled during that callback. If the tail is present, exactly one squared-distance
comparison determines whether that candidate is eligible. If the trail is empty,
the candidate is eligible. Extra whole opportunities and an ineligible candidate
are counted as spatial suppression **before `finishFrame()` constructs its
ready ring**. No interpolation or repeated governor calls are introduced.
The normal spacing comparison costs O(1) per Orb update; preexisting TTL traversal
and heap costs are unchanged and are not included in that spatial complexity claim.

Zero bypasses this entire spatial block, including tail reads and comparisons.
The previous bounded multi-emission demand, one-particle fairness quanta, shared
512-emission ceiling, and 16,384-particle retention ceiling remain authoritative.
The low-level `emitAt()` insertion path also remains unchanged for scheduler and
lifecycle history transfers; production rate eligibility lives in `updateAndEmit()`.

Spatially suppressed trails have zero pending demand, so the scheduler skips
them without consuming a slot or moving their service priority. The existing
service queue continues to serve eligible moving Orbs fairly. Sixteen stationary
high-rate owners cannot starve two moving owners even with a one-emission budget;
the focused test observes equal service for both moving owners.

Every refused whole opportunity is discarded in that callback, whether spatial
or resource-related. Fractional progress remains in `[0,1)` on each trail. A
stationary Orb cannot collect integer emission debt or burst when movement resumes.
Paused simulation continues to skip Orb updates and emits nothing.

Per-frame governor diagnostics add `requestedDemand`, `spatiallyRejectedDemand`,
and `placementComparisons`; existing `emissions` and `droppedDemand` identify
admitted particles and governor drops. The normal valid-demand partition is
`requested = spatiallyRejected + emissions + droppedDemand`. As before,
`droppedDemand` also includes defensive overflow/invalid-time refusal, so it is
not exclusively resource-budget rejection for malformed direct calls. Counters
reset each frame and on disposal, saturate demand counts safely, and never persist.
No diagnostics dashboard or Settings performance UI is added.

## UI and schema contract

Visualizers → Individual Orb → Particles owns the generated
**Minimum Placement Distance** range, with a pixel readout and `aria-valuetext`.
The Bulk Particles template, DOM cache, CONFIG range binding, refresh, and listener
binding are updated together. Both controls use the help text:

> Minimum distance from this Orb's last retained particle before a new particle is placed. 0 disables filtering.

Help is associated with `aria-describedby`. Bulk displays `mixed` when current
Orbs disagree and changes values only on interaction. At zero Orbs it is disabled
and cannot fabricate an Orb. Generated controls bind by persistent Orb ID;
controller roots, input identities, picker state, focus, and idempotent listeners
remain governed by the existing editor reconciliation.

`normalizeOrbDef()` and the codec's existing canonical sanitation/encoding pipeline
own the new field. Missing development schema-10 fields and schemas 2–9 receive
0.5. Obsolete `overlapRadiusPx` is stripped, **never aliased** to placement distance.
Schema-10 non-default fixtures include 0, 0.5, and 2.3 independently; the recursive
field inventory advances from 51 to 52 canonical paths. Historical fixture
expectations include the new default while their original inputs remain unchanged.
The agents.md inventory and narrowly authorized pre-release schema exception are
updated; the public frozen-schema rule after release is retained.

## Lifecycle protection

Construction and Add use the normalized setting. Duplication copies it without
copying live particles or accumulator state. ID reconciliation, reorder, surviving
adapter rebuild, preset application, individual edits, and Bulk edits preserve
surviving Orb phase and history. Updating spacing does not reset either.

Track reset clears trail/accumulator while preserving phase; visual reset clears
history and applies designed phase. Full replacement, removal, and disposal clear
governor/list ownership. The next actual opportunity after reset, expiration, or
eviction sees an empty tail and is eligible at the previous position. Existing
heap/list consistency checks are retained and exercised through these transitions.
No Analyzer/AnalysisFrame, channel targeting, recorder, source, or runtime
composition interface is changed.

## Tests and validation

Behavioral coverage includes empty/same/below/exact/above-threshold placement,
2D squared distance, incremental motion, return near older circular positions,
coincident independent Orbs, TTL and eviction recovery, zero bypass, low/high
rates, fractional progress, no integer debt, paused simulation, pre-scheduler
pending demand, stationary-versus-moving fairness, and both global ceilings.
DPR tests include the production Orb-to-TrailSystem call. Schema round trips,
missing/invalid fields, actual historical fixtures, obsolete overlap, duplication,
reset/rebuild/disposal, editor/Bulk mixed state, focus, listeners, and canonical
live commits are covered.

Previous RC-15 dense-rate/retention assertions keep their exact expected counts;
their fixtures explicitly select zero where dense emission is the behavior under
test. Other prior rendering/admission tests exercise the new default. They were
not weakened to merely assert fewer particles. RC-01–RC-14 suites remain present.

Five source mutations are detected: unconditional duplicate emission, missing DPR
conversion, rejecting equality, comparing the oldest particle, and retaining whole
accumulator debt. `mutation-check.py` restores production source after each run
and in its finalizer. Results and assertion failures are archived here.

Validation evidence:

- Required offline `npm ci` succeeded. Initial sandbox esbuild validation was
  denied with EPERM; the permitted execution retry succeeded using the existing
  cache. No dependency or lockfile changes.
- Focused production/config/editor/preset/previous RC-15 run: **143 tests pass**.
  Additional UI/live-edit/targeted run: **168 tests pass** (overlapping coverage).
- Final `npm test`: **31 test files pass, 0 fail**.
- Final `npm run build` passes; `git diff --check` passes.
- `artifact.json` records standalone bytes, SHA-256, version and schema checks.
- Native standalone Chromium **151.0.7922.173** validates DPR 1/2, keyboard range
  edits to zero, pixel accessibility values, mixed Bulk state, duplication,
  retained editor/input identity, exact help, and schema-10 encoding. External
  requests are blocked; there are no page errors or external asset requests.

## Comparative native measurements

`native-performance.json` records 36 final runs: 4 fixtures × 3 variants × 3
fresh-page trials, with rotating variant order. H.S is the exact accepted worktree,
not a simulated implementation rollback. Scene definitions are checked identical
after removing only the new spacing field. H.T zero reproduces all H.S demand,
live-count, history, and eviction results.

Each run advances 1,200 fixed synthetic 60 Hz frames (20 simulation seconds).
The first 1,080 use update-only warmup; the final 120 call the real production
animation callback with native Canvas submission and silent-stereo Web Audio
sampling. A controlled performance clock supplies synthetic time to production;
a captured native timer measures actual CPU elapsed work. This is a diagnostic
seam, not an application clock change. No browser tooling is a dependency.
The viewport is 1,280×800 CSS pixels, DPR 1.

Fixtures:

- `default-two`: unchanged two-Orb defaults, except the selected spacing value,
  with silent synthetic stereo audio (small minimum radius).
- `slow-high-demand`: 16 Orbs at 1,000/s, TTL 60 s, fixed 0.1 radius fraction,
  no waveform displacement, speed 0.01 rad/s, coincident circles.
- `stationary-overlap`: 16 high-rate Orbs with the same TTL. Canonical radius and
  angular minima otherwise keep an Orb moving, so an explicitly labeled test
  seam freezes each **sampled emitter position** at `(0,0)` before TrailSystem.
  All variants use the same seam; every retained particle is verified stationary.
  An initially mislabeled moving fixture was discarded and this case rerun.
- `moving-sixteen`: 16 Orbs at 1,000/s, TTL 60 s, fixed 0.1 radius fraction,
  no waveform displacement, speed 1 rad/s, coincident circles with independent IDs.

**None reproduces the human developer's actual 16-Orb preset**, which was not
available. These are clearly labeled synthetic fixtures.

Totals below cover all 20 synthetic seconds, not just measured callbacks.
History is average age of the oldest retained particle; trace duration and angular
travel measure the current chronological 10-segment suffix. Stationary history
age describes retention, not moving-path coverage. Timing columns are medians of
three per-trial means or quantiles, not pooled quantiles.

| Fixture | Variant | Requested | Spatial rejected | Admitted | Governor dropped | Live | Evicted | History s | Trace s | Trace rad |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| default-two | H.S | 9,600 | 0 | 9,600 | 0 | 2,880 | 0 | 5.983 | 0.033 | 0.052 |
| default-two | H.T 0.5 px | 9,600 | 8,800 | 800 | 0 | 240 | 0 | 5.983 | 0.500 | 0.785 |
| default-two | H.T 0 px | 9,600 | 0 | 9,600 | 0 | 2,880 | 0 | 5.983 | 0.033 | 0.052 |
| slow-high-demand | H.S | 320,000 | 0 | 320,000 | 0 | 16,384 | 303,616 | 1.017 | 0.000 | 0.000 |
| slow-high-demand | H.T 0.5 px | 320,000 | 319,488 | 512 | 0 | 512 | 0 | 19.983 | 6.333 | 0.063 |
| slow-high-demand | H.T 0 px | 320,000 | 0 | 320,000 | 0 | 16,384 | 303,616 | 1.017 | 0.000 | 0.000 |
| stationary-overlap | H.S | 320,000 | 0 | 320,000 | 0 | 16,384 | 303,616 | 1.017 | 0.000 | 0.000 |
| stationary-overlap | H.T 0.5 px | 320,000 | 319,984 | 16 | 0 | 16 | 0 | 19.983 | 0.000 | 0.000 |
| stationary-overlap | H.T 0 px | 320,000 | 0 | 320,000 | 0 | 16,384 | 303,616 | 1.017 | 0.000 | 0.000 |
| moving-sixteen | H.S | 320,000 | 0 | 320,000 | 0 | 16,384 | 303,616 | 1.017 | 0.000 | 0.000 |
| moving-sixteen | H.T 0.5 px | 320,000 | 300,800 | 19,200 | 0 | 16,384 | 2,816 | 17.050 | 0.167 | 0.167 |
| moving-sixteen | H.T 0 px | 320,000 | 0 | 320,000 | 0 | 16,384 | 303,616 | 1.017 | 0.000 | 0.000 |

| Fixture | Variant | Update mean ms | Canvas mean ms | Callback mean ms | Callback p50 ms | Callback p95 ms |
|---|---|---:|---:|---:|---:|---:|
| default-two | H.S | 0.054 | 6.043 | 7.198 | 2.600 | 55.200 |
| default-two | H.T 0.5 px | 0.028 | 0.385 | 1.694 | 1.000 | 3.600 |
| default-two | H.T 0 px | 0.047 | 5.898 | 7.181 | 2.500 | 55.000 |
| slow-high-demand | H.S | 0.569 | 39.480 | 42.263 | 11.400 | 86.700 |
| slow-high-demand | H.T 0.5 px | 0.037 | 1.018 | 2.638 | 1.300 | 3.400 |
| slow-high-demand | H.T 0 px | 0.594 | 40.482 | 43.615 | 11.600 | 90.900 |
| stationary-overlap | H.S | 0.714 | 41.978 | 45.134 | 13.700 | 96.200 |
| stationary-overlap | H.T 0.5 px | 0.032 | 0.071 | 1.534 | 0.900 | 2.000 |
| stationary-overlap | H.T 0 px | 0.563 | 40.569 | 43.414 | 12.600 | 90.800 |
| moving-sixteen | H.S | 0.622 | 41.266 | 44.221 | 12.800 | 89.700 |
| moving-sixteen | H.T 0.5 px | 0.446 | 30.788 | 33.447 | 13.700 | 62.800 |
| moving-sixteen | H.T 0 px | 0.575 | 40.884 | 43.850 | 12.400 | 89.700 |


### Visual result and unfavorable results

In the silent default scene, 0.5 px reduces placement to roughly 20/s per Orb:
small per-frame movement crosses the threshold every three samples. Live count
falls 2,880 → 240, while the 10-segment trace spans 0.033 → 0.5 s and angular
travel grows 0.052 → 0.785 rad. Particle density and opacity change intentionally;
the configured emission rate remains an upper frequency, subject to eligibility.

Slow movement retains 19.983 s of the measured path instead of 1.017 s, with
512 useful particles rather than 16,384 largely duplicate particles. A stationary
emitter retains one particle per Orb until TTL or eviction makes the empty trail
eligible again. This visibly reduces an overdrawn stationary dot's brightness.

Moving 16-Orb admission falls 320,000 → 19,200 and evictions fall
303,616 → 2,816. The scene **still reaches 16,384 retained particles** and its
60 s TTL still cannot be honored fully: retained history is 17.05 s, improved
from 1.017 s. The trace suffix advances across distinct samples rather than ten
identical points, but there is no interpolation of missed positions.

The moving fixture's median callback is **worse**, 12.8 → 13.7 ms, and median
Canvas submission is 9.1 → 10.2 ms. Its callback mean and p95 improve, but those
do not erase the median regression. H.T zero also has unfavorable variability:
the slow fixture mean rises 42.263 → 43.615 ms; one moving-zero trial has a
54.495 ms mean and 169.3 ms p95 versus that trial's H.S 44.393/89.7 ms.
All individual trials remain in the raw artifact.

Native timer resolution is about 0.1 ms; some update medians round to zero, which
does not establish zero work. Headless rendering, shared-host scheduling, garbage
collection, instrumentation, and brief concurrent validation can affect timings.
Canvas submission is not GPU completion; warmup omits rendering; silent input
does not characterize real audio response. This is **not an FPS measurement**,
and neither universal FPS improvement nor performance on the user's hardware is
claimed. The measurements demonstrate workload/history changes and measured
callback costs only. Benchmarks request at most ~267 emissions per frame, so
governor-budget drops are zero; hostile ceiling/fairness tests provide the separate
over-budget evidence.

## Changed files and reproducibility

Production: `config.js`, `preferences.js`, `constants.js`, `trail-system.js`,
`particle-governor.js` (diagnostic fields only), `orb.js`, `orb-editor.js`,
`dom-cache.js`, `index.template.html`, and codec contract comments.
Metadata: `version`, `agents.md`. Tests: new `rc15-spacing.test.js`, existing
Orb/editor/preset/scene/targeted/RC-15 suites and canonical fixtures.
Optional tools: `measure-rc15-spacing.mjs`, `validate-rc15-spacing.cjs`,
`validate-rc15-spacing-ui.cjs`; this directory owns all evidence.

Native reproduction requires an external Playwright installation and Chromium,
the built `.build/auralprint.css`, and an H.S worktree:

```sh
AP_PLAYWRIGHT_MODULE=/path/to/playwright AP_BASELINE_ROOT=/path/to/hs \
  AP_REPORT=/path/to/report.json node scripts/validate-rc15-spacing.cjs
AP_PLAYWRIGHT_MODULE=/path/to/playwright AP_REPORT=/path/to/ui.json \
  node scripts/validate-rc15-spacing-ui.cjs
python3 docs/audits/remediations/115m-h-t-rc15-spacing/mutation-check.py
```

## Limitations and deliberate deferral

Admission uses one sampled callback position. Fast motion can leave gaps and low
motion can reduce apparent density/brightness; zero remains available for deliberate
dense visuals. A tail evicted by another admission after an Orb has prepared its
demand makes that Orb eligible at the next callback, without stale coordinate state.
This conservative preparation timing does not spend slots or retain emission debt.
Spacing does not guarantee a configured TTL under global retention pressure.

The shared 512/16,384 budgets, heap architecture, fairness policy, 4,096-Orb
admission ceiling, real-time TTL semantics, simulation clock, TTL scan, renderer,
recorder/source lifecycle, and single-file distribution are preserved.
Prompt 2 owns adjustable global budgets/Settings/diagnostics and reconfiguration.
Prompt 3 owns clock consistency, TTL traversal, and measured governor overhead.
Prompt 4 owns integrated hostile validation, cumulative comparison/reconciliation,
and the review PR. No RC-16–RC-22, camera, automatic quality, rendering-engine,
public README/CHANGELOG cleanup, merge, or release work is included.

**RC-15 remains OPEN P2.** This checkpoint is a corrective stage, not resolution.
