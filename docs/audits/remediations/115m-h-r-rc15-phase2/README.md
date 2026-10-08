# Build 115M.H.R — RC-15 phase 2 checkpoint

**RC-15: PARTIAL REMEDIATION — OPEN P2.**

Starting checkpoint: `5b6fd432abdffe1c3a8453b4e3791d2d5a143d4b`, `v0.1.15m.h.q`, on `codex/115m-h-q-rc15`; branch, commit and clean tree verified before edits. Target: `v0.1.15m.h.r`. Prompt-1 code was inspected directly. Schema remains exactly **10**. This is an unpublished implementation checkpoint, not closure, promotion, a final PR or release. Historical audits and phase-1 evidence remain untouched.

## Ownership and immutable policy

`CONFIG.limits.particleSafety` is deeply frozen with **512 maximum emissions per visualizer update** and **16,384 maximum active particles**. These independent initial engineering safeguards do not depend on Orb count, preferences, rates, TTL, imported timing, Canvas dimensions, DPR or refresh rate. They are not persisted or exposed through UI. Optional factory test policies can only tighten these limits; each governor's policy is frozen and non-reassignable. Existing defaults and normalized expert settings are unchanged.

One `ParticleGovernor` belongs to each `VisualizerRuntime`. Orb-owned `TrailSystem` instances retain their particle history and fractional accumulator. Membership is bound at creation/rebuild/reconciliation, separate from replaceable Orb adapters. The runtime starts a shared frame, updates all non-Ring participants, services emission requests, then updates the Ring using current Orb phases. Composition/render order remains unchanged. `main.js` gains no visualizer-specific behavior; audio, AnalysisFrame, source handling, recording and playback are untouched.

Standalone TrailSystem consumers own isolated governors; attaching an existing trail transfers history under the destination ceiling. Production active Orbs share their runtime's governor. The shared admission operation itself checks the frame emission quota, so bypassing the scheduler cannot create a larger in-frame burst. The phase-1 bounded per-Orb guard remains secondary. The independent **1/30-second** simulation ceiling and discarded-stall-time behavior are unchanged.

## Fair access and discarded debt

The governor maintains a persistent intrusive service-priority queue of current trail identities. Each frame it walks that queue once to build a circular ready list, skipping zero-demand trails. It services one particle per eligible trail per turn, removing exhausted requests in constant time. Each service moves that owner to the back of the persistent queue. Unserved and temporarily inactive owners retain their place; new owners join the back. Composition reorder preserves service history. Removal unlinks the owner, including head/tail/wraparound cases.

This provides deterministic equal-quantum access among eligible owners, rather than exact proportional allocation. An unserved owner cannot be overtaken repeatedly by serviced owners: under a finite sustained eligible collection it eventually reaches the front. The scheduler costs O(N + admitted emissions), with additional O(N) frame clearing passes, rather than N scans for every particle. A plain rotating collection cursor can alias with periodic low-rate demand and starve it; the persistent service queue avoids that failure.

At request construction each trail separates whole emissions from the fractional remainder. Only the fraction survives the frame. Whole demand refused by either the secondary guard or aggregate quota is counted and discarded. There is no catch-up queue or overload debt. Malformed rate/accumulator/delta input cannot govern an unbounded loop. Phase, position, response and color still advance without allocation. Paused simulation retains its existing semantics; real-time TTL is applied when trail simulation resumes.

## Oldest-first retention and storage contract

The governor owns an indexed min-heap containing exactly the live particle nodes. Order is real `bornSec`, then monotonically assigned admission sequence for equal timestamps. On a full scene, admission retires the oldest node **before** inserting the new one. Capacity is never exceeded transiently. The single heap length is authoritative accounting; there is no separately cached live count that can drift.

Each trail owns a doubly linked chronological `ParticleList`. Renderer access is `length`, iteration, `at(-1)` for last-particle color, and chronological suffix `slice` for existing trace behavior. Particle payload remains `{ xSim, ySim, bornSec, rgbStart }`; ownership/index/link metadata resides on a separate node. Retirement removes the node from heap and trail, clears links/owner/index, and excludes it from rendering immediately. The narrow renderer change only replaces indexed particle access with iteration; trace drawing and all Canvas work remain otherwise unchanged.

Admission and arbitrary retirement cost O(log P), with P bounded by CONFIG. Existing TTL expiry visits each retained particle once per update, O(P) across the scene, retiring expired nodes through the indexed heap. Different TTLs and nonchronological timestamps do not require a scene-wide search per emission. Configured TTL, size decay, positions, colors and proximity-independent coexistence remain unchanged below the budgets. The extra node, heap entry and maintenance impose measurable memory/CPU overhead, reported below.

## Lifecycle accounting

- Trail clear, visual reset and track reset retire all owned particles and clear fractional/pending demand, preserving established phase reset distinctions.
- Add starts empty. Duplicate copies only canonical configuration, with no live history or emission debt.
- ID/object reconciliation preserves surviving adapters, trail nodes and fractional state. Reorder changes composition only. Removed and same-ID-replaced owners release particles and priority references; disposed trails detach from the scene governor so an externally retained removed Orb cannot retain the active collection.
- Rebuild with the same Orb objects preserves their history. Rebuild with fresh preset-created Orbs releases old owners. Full disposal clears the heap, roster, service queue and diagnostics. Zero Orbs and repeated preset replacements remain valid.
- Governance state stays ephemeral; no counts, queues, budgets or cursors enter preferences or schema-10 presets. `agents.md` adds only the relevant runtime ownership/storage contract.

## Regression and mutation evidence

Focused command (see `focused.log`):

```sh
node --test --test-isolation=none tests/rc15-phase2.test.js tests/rc15-phase1.test.js tests/orb-collection.test.js tests/per-orb-ownership.test.js tests/visualizer-runtime.test.js tests/ring-phase-lock.test.js tests/preset-schema-10.test.js
```

**121 individual tests passed; zero failed/skipped**, including 22 phase-2 tests. Coverage includes 0/1/default/256/4,096 Orbs; extreme rates and invalid numeric inputs; exact shared frame limits; normal 60/120 Hz payload equivalence; pause and long-stall resume; current Ring phase; unequal/intermittent demand; Add/Remove/Reorder; fractional accumulation and overload recovery without a burst; exact retention boundaries and retirement-before-append; timestamp ties and differing TTL; sustained overload; renderer exclusion and trace chronology; resets/reconciliation/rebuild/disposal; 1,500 seeded lifecycle/heap operations compared with an independent oldest-first model. Existing array-assumption tests now use the collection contract and real particle admission; unrelated assertions are retained.

With budget 2, seven continuously eligible Orbs receive exactly four emissions each over fourteen frames. With budget 1, three 60/s Orbs and one 15/s Orb each receive twelve emissions over forty-eight 60 Hz frames. Inactive owners consume no allocation. These cases also cover priority wraparound and dynamic membership.

`python3 docs/audits/remediations/115m-h-r-rc15-phase2/mutation-check.py`, from repository root, restores each file in `finally` and requires a behavioral AssertionError. **Eight of eight mutations rejected** (`mutations.json`, individual logs):

| Mutation | Rejected behavior |
| --- | --- |
| Per-Orb guard alone, shared quotas removed | 1,024 emissions instead of 512 for 256 Orbs |
| First-owner monopolization | Later owners fail equal-service assertions |
| Whole emission debt retained | Accumulator exceeds its required fractional remainder |
| Global retention removed | Capacity exceeded before append |
| Reset drops storage without retirement | Stale heap count differs from live trail count |
| Removal skips release | Removed history still consumes capacity |
| Plain rotating cursor with periodic demand | Low-rate owner receives 0 instead of 12 |
| Admission quota bypass | 513th direct in-frame admission succeeds |

Correct code was restored before full tests/build. Evidence logs have only trailing whitespace stripped. Prompt-1 protections and historical evidence remain intact.

## Sequential validation

Dependencies from the successful phase-1 `npm ci` remain installed; package/lockfile unchanged, so reinstallation was unnecessary. Node **v24.19.0**:

1. `npm test`: **PASS**, 29 process-isolated test files, zero failures/skips (`full-test.log`), including accepted RC-01–RC-14 and Prompt-1 regressions.
2. `npm run build`: **PASS** (`build.log`). Root version/source banner agree at `v0.1.15m.h.r`. `dist/auralprint_0.1.15m.h.r.html` is **381,287 bytes**, with inline JS/CSS and no external script/style assets (`artifact.json`). Schema stays 10 and overlap ownership remains absent.
3. `git diff --check`: **PASS**. Dependencies, local cache and generated distribution/build files remain ignored and untracked. No dependencies were added or upgraded.

Optional Chromium **151.0.7922.173** checks passed with no page errors (`browser.json`, `native-measurements.json`). The single-file smoke preserves phase-1 overlap/UI/preset/timing checks, with external requests blocked on localhost. Direct `file:` navigation remains unvalidated because of browser policy. Independently installed Playwright/Chromium are optional tooling, not project dependencies. Browser execution needed socket/network permissions; no production failure occurred.

## Reproducible resource measurements

`scripts/measure-release-resources.mjs` now records actual emissions, expiry/eviction, live counts, dropped demand, heap comparisons and scheduler visits. Default full-energy synthetic analysis uses 360 warm frames at 60 Hz, then three measured updates. Original Prompt-1 sources were archived into a disposable directory from the required commit; the branch was never reset and historical artifacts were not rewritten:

```sh
mkdir -p work/phase1-reference
git archive 5b6fd432abdffe1c3a8453b4e3791d2d5a143d4b src/js scripts/measure-release-resources.mjs version | tar -x -C work/phase1-reference
AP_REPORT=work/phase1-measurements.json node work/phase1-reference/scripts/measure-release-resources.mjs
AP_REPORT=work/governed-measurements.json node scripts/measure-release-resources.mjs
node scripts/measure-particle-governance.mjs work/phase1-reference 4096 40 > work/phase1-stress.json
node scripts/measure-particle-governance.mjs . 4096 40 > work/governed-stress.json
node --expose-gc scripts/measure-particle-governance.mjs work/phase1-reference 2 360 > work/phase1-small-memory.json
node --expose-gc scripts/measure-particle-governance.mjs . 2 360 > work/governed-small-memory.json
```

Saved raw results accompany this report. Small-scene memory evidence summarizes the final update and heap snapshots in `small-scene-memory.json`. All timings are synchronous host observations including lightweight measurement instrumentation, not universal FPS guarantees.

| Full-energy 360-frame scene | Prompt-1 emissions / live | Governed emissions / live | Median update ms, before → after | Instrumented render ms, before → after |
| --- | --- | --- | --- | --- |
| 2 Orbs | 8 / 2,880 | 8 / 2,880 | 0.329 → 0.241 | 5.448 → 6.462 |
| 8 Orbs | 32 / 11,520 | 32 / 11,520 | 0.052 → 0.157 | 9.909 → 7.695 |
| 16 Orbs | 64 / 23,040 | 64 / 16,384 | 0.117 → 0.188 | 9.888 → 8.163 |
| 64 Orbs | 256 / 92,160 | 256 / 16,384 | 3.751 → 0.382 | 36.180 → 11.782 |
| 256 Orbs | 1,024 / 368,640 | 512 / 16,384 | 5.921 → 0.568 | 122.441 → 14.886 |
| 4,096 Orbs | Separate shorter stress below | 512 / 16,384 | Governed 1.190 | Governed 13.469 |

At 256/4,096 governed Orbs, each sample visits 16,384 particles for expiry, expires zero, evicts 512, and performs 13,824 heap comparisons. Scheduler visits are 768/4,608 respectively (= N + serviced emissions); dropped whole demand is 512/15,872. Additional linear frame/motion/targeting passes are included in measured simulation time.

The matched isolated **4,096-Orb / 40-frame** probe uses a not-ready AnalysisFrame and runs each revision in a fresh Node process. Prompt 1 reaches 655,360 particles and 16,384 final-frame emissions, with 638,976 expiry visits, 19.639 ms final update and 266.960 ms instrumented rendering. Governed code reaches 16,384 particles and 512 final-frame emissions, with 16,384 expiry visits, 512 evictions, 15,872 dropped whole requests, 1.342 ms final update and 20.523 ms instrumented rendering. No-GC heap deltas are recorded but are not comparable steady-state retained memory estimates.

The matched post-GC **2-Orb / 360-frame** memory probe retains the same 2,880 particles in both revisions. Heap deltas are 691,072 bytes before and 997,344 bytes after (about 0.29 MiB additional measured overhead). Final simulation updates are 0.006 / 0.018 ms. Snapshots include probe records/module state; they are not a precise particle-only allocation measurement. The node/heap representation and counters add overhead below budgets; short-run timing also reflects JIT/GC variation.

Optional native Canvas reproduction uses the existing validator and an independently installed Playwright:

```sh
AP_PLAYWRIGHT_MODULE=/path/to/installed/playwright AP_REPORT=work/browser.json node scripts/validate-rc15-phase1.cjs
AP_PLAYWRIGHT_MODULE=/path/to/installed/playwright AP_REPORT=work/native-measurements.json node scripts/validate-resource-measurements.cjs
```

Native Canvas submission medians are approximately **9.3 ms** at 256 Orbs and **17.3 ms** at 4,096 Orbs, despite bounded particle counts. This measures JS command submission, not end-to-end GPU completion. Draw calls still include all Orb traces: 256/4,096 strokes, 2,560/12,288 line segments, and 16,384 particle arcs in these scenes.

## Limits and remaining Prompt-3 work

The budgets deliberately degrade overloaded trails through discarded demand and oldest-first retirement without rewriting persistent settings. They do not prove real-time performance on all hardware. All admitted Orbs still perform motion/targeting and may submit traces; current code accepts 4,096 Orbs. Aggregate rendering work, Orb admission, UI collection costs and final integration remain unresolved for Prompt 3. No drawing budget, batching, automatic quality scaling, Orb cap or extra user-facing controls were implemented.

No material architectural conflict or unresolved phase-2 product decision was found. Thresholds remain provisional for hostile validation. Independently replaceable participants must use the documented trail ownership path; future lifecycle/storage changes must maintain aggregate accounting and priority cleanup. The implementation bounds serviced emissions and retained population, not every visual workload.

**Schema remains 10. RC-15 remains OPEN P2. Build 115 is not declared ready to ship. Stop after this checkpoint.**
