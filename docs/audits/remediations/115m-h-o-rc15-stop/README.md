# Build 115 remediation — stopped at RC-15

Publication follow-up: this report records the autonomous mission stop before publication. The developer subsequently explicitly requested a review PR for the completed work. Review packaging preserves the RC-15 stop and does not claim release readiness. The branch incorporates accepted `main` commit e481e3c, including its additional RC-05 reentrancy regression and closure evidence; no production behavior changed during integration.

**RC-07 through RC-14 are locally CLOSED in eight separate implementation commits. RC-15 remains an unresolved P2 release blocker. The autonomous mission STOPPED at the explicit product-policy condition. No release-readiness PR was created; branch was not pushed; hosted Linux/Windows CI was not invoked. No merge, promotion, renewed acceptance audit or release occurred.**

Current development revision: **v0.1.15m.h.o** (115M.H.O, not release-candidate 115N). Preset schema remains **10**. **115N remains WITHHELD. Build 115 is NOT canonical / NOT shipped.**

Repository: `/workspace/Auralprint1`; local branch: `codex/115m-h-release-blockers`. Starting accepted baseline: `c6b05dcd56e8fa07d45f624c9ff5738f271a278b`, clean v0.1.15m.h.g. The original historical audit and evidence are unchanged. RC-16 through RC-22 remain outside scope and were not fixed.

## Blocker ledger

| Finding | Status | Revision / implementation commit |
| --- | --- | --- |
| RC-01 | CLOSED before this mission | Protected termination coverage retained |
| RC-02 | CLOSED before this mission | Protected Clear/load cancellation coverage retained |
| RC-03 | CLOSED before this mission | Protected live attachment coverage retained |
| RC-04 | CLOSED before this mission | Protected Play ownership coverage retained |
| RC-05 | CLOSED before this mission | Protected deferred EOF coverage retained |
| RC-06 | CLOSED before this mission | Protected retained-export coverage retained |
| RC-07 | CLOSED locally | 115M.H.H — e76044e |
| RC-08 | CLOSED locally | 115M.H.I — 7e1605e |
| RC-09 | CLOSED locally | 115M.H.J — a39d265 |
| RC-10 | CLOSED locally | 115M.H.K — 7f9f562 |
| RC-11 | CLOSED locally | 115M.H.L — f1492e3 |
| RC-12 | CLOSED locally | 115M.H.M — ae46937 |
| RC-13 | CLOSED locally | 115M.H.N — ebbbc9d |
| RC-14 | CLOSED locally | 115M.H.O — 6e78680 |
| RC-15 | OPEN — STOPPED for product-policy decision | No production correction / no revision advance |

## Completed correction evidence

Every correction reproduced the current defect before implementation, defined its narrow contract, added intended-behavior regression coverage, rejected relevant mutations, passed focused tests, the full test suite, the production build and `git diff --check`, and verified schema 10 plus aligned root/source/assertion/artifact versioning. Latest full suite passes all 27 test files, including protected RC-01–RC-06 regressions. Dedicated protected regression files are unchanged; RC-02/RC-05 existing tests were not weakened. The cumulative production diff was reviewed against the accepted baseline; it contains only these corrections and version metadata. Measurement scripts and evidence are optional developer tooling, with no required Playwright dependency or CI/build changes.

| RC | Root cause and production correction | Regression / mutation / native evidence |
| --- | --- | --- |
| 07 | Count 2 reserved floor/top with no interior. CONFIG count limits and shared preset/runtime normalization require integer 3–256; default fallback retained. Files: core/config.js, core/preferences.js, presets/preset-codec.js. | Original URL/energy path and every count across five distributions/three sample rates; import/runtime mutations rejected. Synthetic geometry evidence. |
| 08 | N−1 frequency scale shifted aligned boundaries. audio/band-bank.js now scales by N while preserving inclusive adjacent overlap and clamping. | All supported FFT sizes, four rates, below/at-boundary target controls; scaling/exclusive-overlap mutations rejected. Synthetic FFT vectors. |
| 09 | Codec fabricated positional IDs before collection reservation. presets/preset-codec.js maps legacy input then lets collection own identity/shape repair. | URL/share, opaque and enormous IDs, duplicates, schemas 2–10, Add/Duplicate; premature-normalization mutation rejected. Existing schema and RC-01 tests unchanged/green. |
| 10 | Ring updated before Orb simulation. render/visualizer-runtime.js updates the dependent Ring after Orbs, with original Ring-first drawing order. | Actual Orb variable deltas/wrapping/reorder/pause/reset/zero-Orb controls; lag/draw-order mutations rejected. Existing free-run pause behavior unchanged. |
| 11 | Mixed select retained a concrete option, so choosing it emitted no change. ui/orb-editor.js selects disabled mixed sentinel and blocks sentinel persistence. | All three concrete values, one commit, zero-Orb/idempotence; display/sentinel mutations rejected. Native Chromium keyboard applies each value exactly once. |
| 12 | MIME-only picker/drop filters discarded decodable bytes. ui/ui.js removes filters; index.template.html removes chooser restriction; decoder remains support authority. | Twelve ingress/error regressions and RC-02 controls; independent filter mutations rejected. Native Ogg, empty/generic MIME WAV, ordinary WAV and invalid text through both paths: ten cases, truthful failure. |
| 13 | Pointer-only stacking, absent Queue launcher, destroyed row focus. ui/workspace.js handles visible focus ownership/toggle restoration; ui/ui.js retains row/action focus with neighboring/empty fallback. | Hidden-panel/idempotence/queue/outside-focus controls; panel/launcher/queue mutations rejected. Native desktop/mobile hit testing and seven queue scenarios. Explicitly corrected missing visible-queue precondition in validation without changing historical evidence. |
| 14 | Cancellation/reset/load/init retained drag ownership. audio/scrubber.js terminates it at each boundary. | Five ownership regressions; cancel/reset/load/init mutations rejected. Six native TouchEvent/real-media cases preserve unrelated gestures and fresh seeking. Initial probe had stale post-decode layout coordinates; fixed validation and amended the premature local commit after all checks passed. |

Production paths above are relative to `src/js/` except `src/index.template.html`. Version marker/assertion updates accompany each RC. Full per-RC reports, logs, native JSON/screenshots and mutation results are in `docs/audits/remediations/115m-h-{h..o}-rc{07..14}/`.

## RC-15 — reproduced and measured

Measurement commit source: M.H.O at `6e78680`, after RC-14 completed. Optional scripts execute current production sanitation, Orb/TrailSystem simulation and Renderer, using synthetic full-energy AnalysisFrames. Node v24.19.0 and native Chromium 151.0.7922.173 independently reproduce both historical growth cases.

Sanitation accepts **all 4,096 uniquely identified Orbs**, and timing.maxDeltaTimeSec values **1/30, 120, 1,000,000 and Number.MAX_VALUE** unchanged. No count, active-particle, total-emission or aggregate work budget exists. The emission guard reads the same user-controlled timing maximum as the main timestep clamp; it is not an independent safety bound. At sufficiently large finite imported timing values, multiplication in that guard also evaluates to Infinity; no actual browser-duration claim is made for that extreme input.

After six seconds at 60 Hz with default Orb behavior:

| Orbs | Retained particles / arcs per frame | Emissions per steady frame | Overlap comparisons per steady frame | Chromium update median ms | Native Canvas submission median ms |
| --- | --- | --- | --- | --- | --- |
| 2 | 480 | 8 | 1,920 | 0.90 | 18.60 |
| 8 | 1,920 | 32 | 7,680 | 0.10 | 5.10 |
| 16 | 3,840 | 64 | 15,360 | 0.20 | 5.40 |
| 64 | 15,360 | 256 | 61,440 | 1.00 | 16.90 |
| 256 | 61,440 | 1,024 | 245,760 | 1.50 | 121.70 |

The 256-Orb case reproduces **61,440 particles/arcs and 245,760 overlap comparisons per frame**, in addition to 61,440 expiry visits and trace work. These are production loop counts, not extrapolated GPU measurements.

The one-Orb imported maxDeltaTimeSec=120/ttlSec=600 case, after six-second prehistory, reproduces **28,800 emission calls and 6,912,000 overlap comparisons in a single update**. Measured duration: Node 31.01 ms; Chromium 43.80 ms. Retained particle count afterward is only 240: a memory/particle cap alone would not stop this burst.

Timing limits: one managed host, headless Chromium, 1000×1000 real Canvas, synthetic saturated analysis, three steady samples per count in ascending order. JIT/cold/Canvas variability is visible (the smaller count is sometimes slower). Update instrumentation adds overhead. Native rendering measures synchronous command submission, not GPU completion, end-to-end frames, hardware-general FPS or representative weak-device performance. These measurements demonstrate work growth and cannot select a defensible release threshold.

## Independent invariants and ownership required

| Invariant | Required ownership and independence |
| --- | --- |
| Admission/collection work | Canonical CONFIG safety policy enforced consistently by codec and collection/runtime boundary; bound admitted aggregate base work, including zero-particle Orbs, reconciliation and editor cost. An arbitrary Orb count is not justified by this evidence. |
| Aggregate retention | CONFIG-owned total active-particle/memory budget enforced in ephemeral visual runtime/TrailSystem, independently of imported TTL and emission rate. Per-Orb limits cannot bound an unbounded collection. |
| Per-frame emission work | Independent immutable aggregate emission cap across Orbs, enforced before emission/overlap loops. Must not scale with imported maxDeltaTimeSec; define backlog/discard and fairness semantics. |
| Per-frame scan/render work | Bound expiry visits, overlap scans and Canvas/trace operations through independently bounded inputs or explicit operation budgets. A clock-only watchdog cannot preempt one expensive synchronous operation. Memory bounds alone do not bound emission×history scans. |
| Imported timing | Normalize pathological timing consistently and independently bound simulation/emission safety. Default 1/30 is an existing simulation preference and possible safety-ceiling reference, not evidence for aggregate release budgets. |

Expert configuration is the persisted Orb/rate/lifetime/trace choice. Aggregate safety is whole-scene retention/admission. Frame safety is bounded work in one callback. Imported timing is an independent input that must not define its own safeguard. The four contracts cannot be replaced with MAX_ORBS=8 or another unmeasured magic cap.

## Policy alternatives and tradeoffs — no choice made

1. **Admit expert configuration but apply runtime aggregate budgets.** Preserve schema-10 choices and variable Orb counts; cap retained particles/emissions/work and drop old particles or emission debt fairly. Requires explicit visual-degradation, prioritization, fairness and user-feedback policy. Retaining many zero-particle Orbs still requires a separate admitted base-work bound.
2. **Validate configuration against measured aggregate budgets.** Reject or normalize over-budget scenes at import/Add/edit with a clear explanation. More predictable behavior after admission, but restricts expert combinations and requires a product decision on rejection versus normalization and supported hardware/profile.
3. **Combination.** A defensible admitted aggregate-work ceiling plus independent runtime emission/retention/render guards and timing normalization. Provides protection at both boundaries but still requires budgets, fallback semantics and target-device evidence. It is not permission for a general performance redesign.

No existing architecture/evidence chooses the budgets or these user-visible semantics. agents.md requires weak-hardware safety and CONFIG-owned limits; ROADMAP defers representative resource/performance measurements to Build 117 and specifies no numeric release budgets. Those statements cannot supply missing Build 115 product policy. Under the user's RC-15 special rule and stop conditions, selecting arbitrary values would be guessing, so the mission stopped before implementation.

No RC-15 production changes, chosen caps, regression claiming closure, release-readiness PR or CI completion claim were made. RC-15 remains a P2 release blocker. The eight corrections are local and reviewable; Linux/Windows hosted CI remains pending until an authorized future PR is appropriate.

Reproduce measurements:

```sh
AP_REPORT=work/rc15-node.json node scripts/measure-release-resources.mjs
AP_PLAYWRIGHT_MODULE=<external-playwright-path> AP_REPORT=work/rc15-browser.json node scripts/validate-resource-measurements.cjs
```

The directory for AP_REPORT must exist. Native scripts default to `/usr/bin/chromium`, override AP_CHROMIUM_PATH. Playwright remains optional external tooling.

Evidence formatting: the final cumulative whitespace check identified trailing spaces on blank diagnostic lines in newly captured mutation logs. Those spaces were stripped without changing outcomes or assertions. Historical audit/evidence were not edited. The complete cumulative diff then passed `git diff --check <starting-baseline>`.
