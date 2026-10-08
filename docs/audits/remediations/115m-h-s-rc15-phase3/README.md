# Build 115M.H.S — RC-15 phase 3 implementation for review

**RC-15 remains OPEN P2 pending independent human/GPT acceptance.**

This completes the assigned Codex implementation sequence, not release judgment. No 115N promotion, merge, tag or release is authorized here. The cumulative PR targets `main` for independent review and Linux/Windows CI.

## Baseline and commit sequence

Branch: `codex/115m-h-q-rc15`. Exact clean starting commit/version/branch verified before phase-3 edits:

1. Accepted original `main`: `e273bba5c2a9c0da04f2472395f05c751a799231`, `v0.1.15m.h.p`.
2. Phase 1: `5b6fd432abdffe1c3a8453b4e3791d2d5a143d4b`, `v0.1.15m.h.q` — overlap retirement and independent 1/30-second simulation ceiling.
3. Phase 2 / required phase-3 start: `9eaca31e378afd7f562dd7f51ed186d457428746`, `v0.1.15m.h.r` — aggregate emission/retention, fairness and discarded whole demand.
4. Phase 3: this checkpoint, `v0.1.15m.h.s` — rendering verification, admission safety and integrated lifecycle/UI corrections.

Prior stages were inspected as production code, not accepted solely on their reports. Their commits were preserved; no reset to main or unrelated changes occurred. Earlier remediation reports and the original hostile audit remain historical evidence: [phase 1](../115m-h-q-rc15-phase1/README.md), [phase 2](../115m-h-r-rc15-phase2/README.md).

## Phase-3 changes

- `CONFIG.limits.orbs.maxCount` is deeply frozen at **4,096**, the human-authorized provisional operational ceiling. It is not a creative recommendation or frame-rate guarantee. Existing **512 emissions/update**, **16,384 live particles**, and **1/30-second** timing ceilings are unchanged.
- New `core/orb-admission.js` owns shared count validation. It validates without normalizing or changing IDs. Runtime validation additionally rejects repeated canonical IDs before ownership changes, preventing duplicate draws and intrusive-queue corruption.
- The codec checks counts on decode and before sanitation/migration mapping. Schema 9 uses its existing Scene recovery and top-level precedence; other supported migrations remain intact. Oversized decode returns `orb-limit-exceeded`; sanitation/normalization/replacement raise a coded RangeError. No truncation occurs. URL application returns false and leaves preferences untouched; the existing UI reports that no valid preset was applied.
- Collection normalization checks admission before reading elements. Preference replacement validates before deleting previous keys; settings resolution validates before cloning/replacing the active settings. Orb runtime init/reconcile and VisualizerRuntime rebuild/reconcile validate before construction, synchronization, disposal or history changes. Add/Duplicate at the ceiling return null before ID allocation and trigger no UI refresh/focus move.
- Orb ID repair reserves incoming numeric suffixes once, deduplicating repeated explicit IDs before BigInt parsing. Missing/duplicate identities use successive exact successors. Later explicit IDs, opaque IDs, huge numeric suffixes, first-duplicate ownership, order and repeated-normalization semantics remain unchanged. No per-repair full-collection copy or scan remains. RC-01/RC-09 tests were not weakened.
- `ParticleList.suffix(count)` supplies direct chronological trace traversal. Renderer no longer materializes suffix arrays. Existing suffix `slice` remains available for non-rendering consumers. Finite fractional trace counts retain the existing ceil-to-segment behavior; all normal positions, sizes, fading, color modes and trace line counts remain unchanged.
- Particle membership follows the supplied Orb collection, independently of optional adapter `.orb` metadata. A replacement adapter implementing the canonical lifecycle previously caused its trails to detach into standalone governance: the new regression demonstrated missing shared emissions before the correction. Adapter composition/render ordering and default surviving adapter identity remain unchanged.
- Actual native UI measurements exposed quadratic tooltip label discovery. `ui.js` now builds a temporary first-label association map once per discovery pass, preserving wrapped-label precedence, fallback labels, cached specs/listeners and title feedback. OrbEditor uses a Set for removal membership checks. These are narrowly demonstrated admission dependencies, not virtualization or DOM restructuring. Surviving DOM/controllers/focus remain stable.
- Version/banner advance to `v0.1.15m.h.s`. Schema remains **10**, with the authorized pre-release overlap correction intact. `agents.md` changes only the admission and collection-traversal contract.

No audio/analysis engine, recording/source lifecycle, camera, projection, Canvas batching, automatic quality, second governor, budget UI or unrelated RC finding was changed.

## Operation-level rendering and update model

Let N be admitted Orbs (N ≤ 4,096), P be retained particles (P ≤ 16,384), E be new emissions (E ≤ 512), and B be normalized bands (B ≤ 256).

| Production operation | Independent bound / cost |
| --- | --- |
| Particle drawing | Exactly one iterator visit and arc/fill per retained particle: ≤ P |
| Orb trace segments | Per trail, at most `min(length - 1, ceil(numLines))`, if enabled; sum ≤ P |
| Trace linked traversal | Suffix back-walk ≤ P and chronological forward visits ≤ P in aggregate; no payload array copies |
| Composition/render dispatch | One Ring plus N Orb participants; each Orb drawn once in canonical order |
| Orb motion/response/color | N updates regardless of allocation; selected-energy work ≤ N × B (1,048,576 selected-band reads at the ceiling) |
| Spectral Ring | One B-point construction; ≤ B adjacent segments and B point arcs; current-frame Orb lock remains after Orb updates |
| Total Canvas arcs | Particle arcs plus enabled/ready Ring points: ≤ 16,640 |
| Total Canvas line segments | Orb trace segments plus Ring connections: ≤ 16,640 |
| Governor preparation/scheduling | Linear N passes plus ≤ E service steps; no N scan per emitted particle |
| Expiry | Each retained node visited once across all trails: O(P); up to P indexed removals on a long resume |
| Heap admission/retirement | O(log P) per insertion/removal; ≤ E insertions and capacity evictions per update, in addition to TTL expiry |
| Live bookkeeping | Heap has exactly P entries, no lazy tombstones; roster/service queue has N owners, no detached-owner growth |

The renderer obtains counts/iteration from Orb-owned lists governed by the single scene heap. Admission retirement happens before insertion and unlinks both owners immediately. Trace iteration cannot see retired nodes. Reordering does not move particle history between Orbs. Ring rendering retains its place first in composition while update order respects current Orb phase dependency.

Finite bounds are on JS operations and ownership, not GPU completion or a promised frame time. Existing per-particle projection objects/CSS strings/color interpolation, Orb color/selection objects, iterator results and B-point Ring storage still allocate. Their quantities are bounded by P/N/B. Each admitted emission allocates one particle payload and one metadata node; the scheduler reuses its intrusive ready links. No scene-wide trail conversion or per-particle full-Orb scan is introduced.

## Integrated lifecycle assessment

Tests inspect the actual heap/indexes, lists, priority links and renderer output. Removed/reset nodes have null owner/links and index -1. The heap uses indexed removal/pop, so expiry/eviction/reset do not leave stale entries. A cleared heap resets sequence numbering. Disposal clears roster, priority head/tail, heap and stats; removed trails detach from the scene governor. Existing references to explicitly removed test nodes are held only by the test, not by active governance.

Saturated Add/Remove/Reorder, ID reconciliation, same-object rebuild, replacement with fresh objects, track/visual reset and zero-Orb disposal remain consistent. Surviving histories retain node identity; duplication starts empty and carries no debt. New runtime count/identity rejection preserves previous adapters and particle history. Twelve measured 4,096-Orb turnover cycles, with 34 updates each plus partial removal/reorder/reset/full replacement, peak at 16,384 heap entries and 4,096 owners and end with zero live bookkeeping. Eight additional saturated 256-Orb churn cycles are assertions in the focused suite.

The phase-1 production callback still independently clamps malformed/imported timing and discards elapsed excess. Pause creates no emissions; resumed real timestamps expire old particles without a simulation catch-up queue. Whole refused demand is discarded and fractions remain. Every Orb advances when unpaused, even with no allocation. Repeated schema-10 round-trip strips overlap and runtime governance state; all historical migrations and channel/phase regressions remain passing.

## Focused tests and negative validation

`focused-final.log`: **303 individual tests passed**, zero failed/skipped. Command:

```sh
node --test --test-isolation=none tests/rc15-phase3.test.js tests/rc15-phase2.test.js tests/rc15-phase1.test.js tests/orb-editor.test.js tests/orb-collection.test.js tests/orb-id-termination.test.js tests/preset-id-reservation.test.js tests/preset-schema-10.test.js tests/visualizer-runtime.test.js tests/ring-phase-lock.test.js tests/visualizers-panel.test.js tests/targeted-audit.test.js
```

Nineteen new phase-3 tests cover exact 4,096 and rejected 4,097; zero scenes; early rejection without element/ID reads; both schema-9 forms and top-level precedence; nonmutating URL/preference/settings rejection; refusal preserving runtime history and real panel harness focus/DOM; duplicate-heavy 400-digit suffixes with a linear identity-read assertion; runtime rejection before mutation; particle uniqueness, suffix traversal and segment bounds at 0/2/64/256/1,024/4,096 Orbs; normal rendering sizes/ages/fading/three trace colors/fractional counts; zero-particle motion/Ring phase; saturated turnover; canonical persistence; one-pass tooltip labels/listener identity; and metadata-independent lifecycle adapters.

Run `python3 docs/audits/remediations/115m-h-s-rc15-phase3/mutation-check.py` from repository root. It restores every changed file in `finally` and requires AssertionError rather than syntax/import errors. **Nine of nine mutations detected** (`mutations-phase3.json`, individual logs): removing admission, bypassing Add/Duplicate ceiling, restoring quadratic ID repair, restoring trace array materialization, bypassing runtime admission, allowing repeated runtime IDs, restoring quadratic tooltip labels, restoring adapter-metadata membership, and double-drawing particles. `adapter-negative-before.log` also records the genuine pre-correction adapter failure.

The original phase-2 mutation harness was rerun against integrated source: **eight of eight detected** (`mutations-phase2-recheck.json`), including bypassed global emission/retention, first-Orb monopoly, periodic-demand starvation, whole debt and stale reset/removal accounting. Earlier mutation reports remain unchanged. Correct source was restored before final full tests/build. Captured evidence logs have trailing whitespace stripped only.

## Sequential validation and browser scope

Dependencies installed in phase 1 remain usable; package/lockfile unchanged, so `npm ci` was unnecessary. Node **v24.19.0**:

1. `npm test`: **PASS**, all **30 process-isolated test files**, zero failures/skips (`full-test.log`), including RC-01–RC-14 and both prior RC-15 phases.
2. `npm run build`: **PASS** (`build.log`), matching `v0.1.15m.h.s` root/source metadata and schema 10. The **383,242-byte** `dist/auralprint_0.1.15m.h.s.html` has inline JS/CSS with no external script/style dependency (`artifact.json`).
3. `git diff --check`: **PASS**; dependencies/cache/generated distribution/build remain ignored and untracked. No required dependencies were added.

The initial cumulative PR CI at `2337e1655aee2fc21ecc15035482bf29edc69ad2` passed Linux but failed Windows before the production callback ran: the phase-1 VM harness stripped imports with an LF-only regex, leaving CRLF imports in a nonmodule script (`ci-windows-initial-failure.log`). The harness now normalizes its text and executes every original timing/clock assertion for both LF and CRLF inputs. This is a test portability correction, not an application/timing change. Full local tests/build passed again. It is folded into the phase-3 checkpoint so the branch retains three sequential stages; phase-1/phase-2 commit SHAs and historical evidence remain unchanged. Corrected hosted status is reported by PR checks and the final response.

Optional Chromium **151.0.7922.173** single-file boot/UI/preset/timing checks passed with external requests blocked and no page errors (`browser.json`). Localhost native source-module diagnostics use the production template/CSS and invoke the actual exported production callback with automatic RAF disabled in the disposable test page. Browser policy still blocks direct `file:` navigation; that transport mode is not newly browser-validated. The inlined artifact and absence of external script/style dependencies are verified separately.

## Admission and synchronous-work measurements

New optional diagnostics require only the existing Node runtime; native diagnostics use separately installed Playwright/Chromium, not project dependencies. Original accepted source was archived for comparison without resetting the branch:

```sh
mkdir -p work/original-reference
git archive e273bba5c2a9c0da04f2472395f05c751a799231 src/js version | tar -x -C work/original-reference
node scripts/measure-rc15-admission.mjs work/original-reference --admission-only > work/original-admission.json
node scripts/measure-rc15-admission.mjs > work/admission.json
```

| 4,096-Orb normalization | Original H.P ms | Governed H.S ms |
| --- | ---: | ---: |
| Unique opaque IDs | 7.70 | 14.66 |
| Repeated `ORB0` | 2,294.10 | 9.43 |
| Missing IDs | 938.50 | 6.64 |
| Repeated 400-digit numeric ID | 33,766.93 | 35.97 |

Normal unique-ID normalization has extra validation/reservation overhead; this is not a claim that every scene is faster. The severe duplicate path loses its quadratic scans/copies, proved independently by operation-count tests. A 4,097-entry null scene was accepted by original sanitation in 916.46 ms; current decode rejects it in 0.24 ms. A 100,000-entry null array is rejected in 0.02 ms before Orb processing. JSON/base64 parsing before codec access and total input/ID byte length are not bounded by a newly invented policy; they remain linear/input-dependent work. No opaque-ID length restriction or payload-byte cap is introduced.

The first complete native UI probe exposed 0.592-second initial refresh at 64 Orbs and **8.583 seconds** at 256; it was interrupted while processing the 1,024-Orb scenario, so no pre-fix 1,024/4,096 value is claimed (`before-tooltip-fix-*`). A separate 64-Orb attribution probe measured **1,364 full-label queries / 1,973,708 label entries**, 620.9 ms UI refresh, and only 0.3 ms spent reading focus (`native-label-before.json`). After the index correction, discovery performs one label query: 1,447 entries at 64 and 90,151 at 4,096. The full measured corrected 256-Orb refresh takes **254.2 ms**. These measurements justified the narrow UI changes; unrelated UI redesign was not undertaken.

## Complete native frame measurements

Reproduce with build CSS present and optional tooling:

```sh
AP_PLAYWRIGHT_MODULE=/path/to/installed/playwright AP_REPORT=work/native-frames.json node scripts/validate-rc15-phase3.cjs
AP_COUNTS=2,4096 AP_PLAYWRIGHT_MODULE=/path/to/installed/playwright AP_REPORT=work/native-integration.json node scripts/validate-rc15-phase3.cjs
AP_PLAYWRIGHT_MODULE=/path/to/installed/playwright AP_REPORT=work/browser.json node scripts/validate-rc15-phase1.cjs
```

The frame probe loads generated silent stereo PCM through the actual AudioEngine, then times actual sample/FFT/BandBank work, Orb/trail update, governor allocation/retirement, native Canvas submission, UI and Scrubber inside `onAnimationFrame`. The fixture is intentionally synthetic and does not measure live-input/recording CPU contention. Warm simulation uses 60 Hz deltas with real-compatible historical birth timestamps. Normal larger scenes deliberately enable the Ring; the separate true two-Orb-default run leaves it disabled. Maximum cases use rate 1,000/s, TTL 600, trace count 1,000 and all 256 selected bands. No persistent defaults change.

Primary raw evidence: `native-frames-final.json`, `native-default-two.json`; the former's initial two-Orb row also enabled the Ring and is not presented as the true default case. Final integration reruns are recorded separately. Each median is from five instrumented callbacks, including the first callback and its deferred style/layout work; medians of nested fields are not additive.

| Scene | Sample/analysis ms | Visualizer update ms | Canvas submission ms | UI per callback ms | Total callback median ms | Initial UI refresh ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| True 2-Orb defaults | 0.8 | 0.2 | 3.2 | 0.4 | 5.1 | 2.2 |
| 64 Orbs + Ring | 0.8 | 1.3 | 19.7 | 2.2 | 35.1 | 93.0 |
| 256 Orbs + Ring | 0.8 | 3.5 | 21.0 | 6.6 | 55.7 | 254.2 |
| 1,024 Orbs + Ring | 0.8 | 4.5 | 28.7 | 28.0 | 124.9 | 1,051.1 |
| 4,096 Orbs + Ring | 0.9 | 8.5 | 81.8 | 116.3 | 215.2 | 4,289.9 |
| 64 maximum Orbs + Ring | 1.2 | 1.6 | 31.6 | 2.4 | 54.9 | 82.0 |
| 4,096 maximum Orbs + Ring | 0.9 | 12.8 | 87.0 | 122.2 | 227.3 | 4,509.1 |

Separate nested timings include Orb simulation/demand, trail expiry scan/demand preparation, heap retirement, and allocation. At 4,096 maximum Orbs their medians are 6.9 / 2.6 / 0.3 / 0.8 ms respectively. The trail field includes demand preparation; retirement measures heap unlink work, not the entire expiry scan. Residual callback time includes analysis-view update, sizing/style/layout and other untimed mechanics. Canvas values are command submission, not GPU completion. Instrumentation itself wraps Orb/trail calls, heap retirement, native methods and trace iterators and adds measurable overhead.

All saturated cases retain exactly **16,384** particles with matching heap length. Every overloaded callback emits **512**. At 64 maximum Orbs, trace forward visits are 16,384 and trace segments 16,320. At 4,096 Orbs, trace visits are 16,384 and trace segments 12,288; enabled Ring adds 256 arcs/segments, giving 16,640 arcs and 12,544 line segments. No particle is drawn twice. TTL expiry and heap replacement have separate counters in raw evidence.

The 4,096-Orb DOM has **636,528 nodes**; JS heap snapshots are approximately 64 MB for ordinary settings and 91 MB with all selected bands. Snapshots are not post-GC retained-memory guarantees and exclude DOM/native/renderer memory. Changed-settings refresh costs 625.8 ms ordinary / 1,492.8 ms maximum in these probes. Admission/reconciliation and initial UI construction are separate one-off operations, not hidden inside the simulation-only timing. Initial full callbacks reach approximately **602–609 ms**; subsequent measured ceiling callbacks still take **148–241 ms**. These slow results are preserved, not treated as an FPS guarantee.

After the final adapter-independent membership correction, `native-integration.json` repeats actual default two-Orb and 4,096-Orb production callbacks with no page errors. Median totals are **5.1 / 213.2 ms**; initial UI refresh is **2.3 / 4,333.2 ms**. At 4,096, heap/live and emission ceilings remain exact, and refusal preserves focus/references. This final-source check agrees with the main measurement's expensive-but-completing classification.

Native Add/Duplicate refusal at 4,096 completes in 0.1–0.4 ms and preserves the focused visible editor summary, preference/settings references, visualizer collection and editor node. An initial diagnostic tried focusing an input inside a collapsed editor and failed its own visibility assumption; the corrected probe explicitly opens Visualizers and verifies focus before testing refusal. This was a test-fixture error, not a source defect.

## Safety classification, limitations and review boundary

1. **Algorithmically bounded:** N/P/E/B independently limit the production loops, heap ownership and trace/particle commands. Oversized scenes are rejected before avoidable Orb normalization/allocation/UI construction. No second rendering governor is needed for these bounds.
2. **Expensive but recoverable on the measured host:** The ceiling remains an expert stress population, with multi-second initial DOM construction and roughly 0.2-second callbacks. The operations complete, reference/focus refusal checks pass, and turnover does not grow stale accounting. This is not evidence of responsiveness or adequate FPS on weak hardware. No lower ceiling was substituted.
3. **Verified pathological paths corrected:** Duplicate-heavy huge-ID normalization took about 34 seconds in the original revision, and full-label-per-control discovery prevented completion of the original 1,024-Orb native UI probe. The measured fixes target those multiplicative algorithms without broad redesign.

No unresolved implementation blocker was established after these corrections on this host. Human/GPT hostile review may judge the provisional 4,096 policy or memory/UI costs unsuitable for release. Rendering optimizations, fewer DOM writes, editor virtualization and quality recommendations remain future performance work unless review establishes a concrete release-blocking failure; none is claimed solved here. Payload byte size and platform rasterization/device limits are outside these operation-count guarantees. Direct file navigation and other hardware remain unverified. Hosted CI status belongs in the PR/final report, not fabricated local evidence.

The cumulative PR must state these limits and the schema-10 pre-release exception. **RC-15 remains OPEN P2. Build 115 is not declared ready to ship. Independent acceptance is the next step.**
