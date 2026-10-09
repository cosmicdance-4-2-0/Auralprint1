# 115M.I.E documentation integrity review

## Baseline and scope

Accepted GitHub main: **`a198b14b087da6b855041c3a23acb550a156ff4e`**; PR #43 verified merged at that SHA. An older clean local checkout was not treated as authoritative. Branch: `codex/115m-i-e-documentation-reconciliation`. Development **`v0.1.15m.i.d → v0.1.15m.i.e`**, preset schema **10** unchanged. Classification: documentation/release-preparation correctness; regression risk is inaccurate claims or broken navigation, with metadata-only production changes and no runtime performance impact.

Inspected: README, ROADMAP, agents.md, canonical changelog, root version/constants, full CONFIG/preferences/codec, relevant AnalysisFrame/BandBank/controller, Orb/collection/runtime/timing/trail/governor/renderer, UI/editor/workspace/Scene/Analysis, AudioEngine/source/transport/scrubber, recorder ownership, template/build/distribution/verifier/CI, canonical HTML 110–114, October 6 audit, accepted remediation narratives/matrix/performance evidence, and accepted Build 115 commits/PR merge records. Canonical 113/114 executable control flow supplies both release-delta baselines; comments/changelog alone do not prove behavior.

## Contradictions and ownership decisions

- README/ROADMAP still describe H.O/H.P and RC-15 as open, repeat obsolete baseline SHA/CI/test narratives, and omit accepted portable/hosted packaging. Current corrective review/merge is complete through RC-22; 115N remains withheld.
- Fixed default particle ceilings and one capped visual clock are superseded by selected budgets and separate motion/emission/age clocks. Broader performance/artistic acceptance remains necessary despite corrected resource governance.
- agents.md's “color ownership remains a later stage” contradicts completed Scene ownership. Replaced with existing shared/local ownership rules and references; moved the premature End of Contract marker after the already-binding Ring/Scene sections. No policy/exception was weakened or added.
- README owns identity/bootstrap and concise Build 115 Goal/Scope/DoD/Status. ROADMAP owns capabilities, stages, dependencies, gates and existing future builds/deferrals. Development history owns chronology/decisions/current RC ledger; release-delta draft owns internal review of both shipped baselines. Canonical changelog owns shipped-product differences; reports/evidence own immutable observations.

Moved from README: detailed M.H.E/F/G/P source/transport/Queue narratives, revision-by-revision RC status, optional probe selectors, counts and CI snapshots. Development history summarizes each decision, links accepted PRs/reports and retains diagnostic instructions. Existing Builds 111–114 milestone entries and 116–120 scope are preserved verbatim; Build 110's overview/history row remains.

Moved from ROADMAP: repeated H.O/H.P starting status, H.A–P closure chronology, F.A/H.A/I.A/J.A retrospectives, M.H.B infrastructure diary, retained-export/cancellation/attachment/Play/EOF/Queue details, K/L transitional panel history. Stage ownership and future acceptance criteria remain. Known deferrals separate closed corrections from existing future performance, UX, Camera and band work; partial allocation/refresh improvements do not erase remaining AUD-012 work.

Historical material remains traceable in [development history](build-115.md), linked accepted commits/PRs and original evidence. RC-01's report is absent from the baseline tree but available at its accepted historical commit; its link is pinned. RC-02/03 correction narratives live in PR #30/#31 with native JSON in-tree; RC-06's correction/validation lives in PR #29 and later native protection, not fabricated remediation README paths. No restored/deleted/moved evidence files.

## Release status and unresolved decisions

Public canonical release: **Release 3 / Build 113**. Build 114: **internally shipped**. Build 115: **unshipped/noncanonical; 115N WITHHELD**. The [RC ledger](build-115.md#audit-disposition-index) accounts for all original priorities (one P1, fourteen P2, seven P3), accepted corrections and residual limits. RC-18 is independently verified after incidental H.V correction.

RC-15's H.W report/PR says open pending independent acceptance at its historical snapshot. PRs #37/#38 are merged, subsequent accepted RC-16 material retains prior RC-01–15 acceptance, and this task explicitly establishes the accepted corrective baseline. Current docs describe **closed corrective review/merge**, not completed exact-human-preset/artistic or device acceptance. GitHub PR #38 has no separate review/comment transcript establishing those broader gates. They remain explicit 115N uncertainties; no historical status is rewritten or human shipment approval inferred.

Remaining review: exact human scene, constrained hardware/expert/max-count costs, browsers/assistive technology/physical touch, real capture/permissions/media, external-player exported fidelity, long recordings/downloads, blocked direct `file://` launch, maskable artwork, and final public comparison/editorial baseline. The [release-delta draft](build-115-release-delta.md) distinguishes static verified baseline paths from complete retired-device reproduction; no final notes or release number is chosen. No newly demonstrated functional defect was corrected opportunistically.

## Validation

Local environment: Node 24.19.0 / npm 11.9.0 / Python 3.12.14. Commands ran sequentially, with logs in external scratch rather than committed historical evidence.

| Check | Result |
| --- | --- |
| Documentation structure / status consistency | PASS: concise README Build 115 Goal/Scope/DoD/Status, no appended revision diary; roadmap separates corrective closure from withheld acceptance; two explicit delta baselines |
| Relative links / Markdown fragments | PASS: 135 references across all six changed Markdown files; targets exist and Markdown fragments resolve; existing milestone/future text preserved |
| Accepted RC history | PASS: 22 corrective commit references are ancestors of accepted main; mapped PR merge records fetched independently; original priority totals retained |
| Version / schema / production scope | PASS: root/banner/exact assertions aligned at I.E; schema 10; all tracked application files byte-identical to baseline except the checked banner replacement; test changes only version literals |
| Protected files | UNCHANGED: canonical changelog and Canon 110–114 artifacts, all original audit/remediation/evidence files, branding, dependencies, build/scripts and CI |
| Locked install | PASS: `npm ci --cache /workspace/work/115mie/npm-cache`, two packages, unchanged lockfile |
| `npm test` | PASS: 603 passed, zero failed, one existing opt-in million-particle stress skip; 23 Python packaging assertions pass |
| `npm run build` | PASS: both portable and hosted outputs contain I.E and share bundled JS/CSS |
| `python scripts/verify_distribution.py` | PASS: all nine distributable files, package-relative metadata, source icon integrity and shared application contracts |
| `git diff --check` / output tracking | PASS: no whitespace errors; dependencies/build/dist remain untracked |
| Hosted Linux/Windows CI | PASS: Ubuntu and Windows on implementation head `571e59146f893aa1ba8cc8d19ed29dc9ea0c4535`, [run 37858895230](https://github.com/cosmicdance-4-2-0/Auralprint1/actions/runs/37858895230); all required install/test/build/package/tracking/whitespace steps succeeded |

This report-only follow-up records hosted evidence without changing validated implementation/tests. Final-head CI and the final SHA are recorded in [PR #44](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/44) and the handoff after both jobs complete; a commit cannot embed its own resulting SHA.

The first sandbox test attempt reported `spawnSync python EPERM` even after Python's 23 assertions completed successfully. The unchanged full suite passed with native child-process access; build used the same execution access. No source/test workaround was introduced. No new browser/device/direct-file acceptance is claimed by this documentation-only validation.

## Changed-file inventory

- `README.md`
- `ROADMAP.md`
- `agents.md`
- `docs/development/build-115.md`
- `docs/development/build-115-release-delta.md`
- `docs/development/115m-i-e-documentation-review.md`
- `version`
- `src/js/core/constants.js` — banner only
- `tests/targeted-audit.test.js` — exact current-version assertion only
- `tests/rc20_packaging.py` — distribution fixture version only

No dependency, schema, CONFIG/preferences/codec, UI/audio/source/recorder/renderer/governor, entry-point, build/asset behavior, unrelated test assertion, tag or release change is included.
