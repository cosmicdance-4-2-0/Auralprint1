# 115M.H.L — RC-11 apply any concrete Bulk selection directly from mixed

RC-11 CLOSED by local acceptance evidence. Version `v0.1.15m.h.l`.

Root cause: mixed select retained a concrete selected option; native selection of that displayed value emits no change, preventing apply-to-all. Current-build Chromium baseline reproduces native End/Enter preserving [fixed, dominantBand] with zero change events.

Contract: mixed selection has a disabled empty-value "mixed" option; any concrete option can be selected directly, applying once through the existing commit path. The sentinel cannot enter preferences. Zero-Orb disabling, homogeneous display, listener idempotence and non-select Bulk fields remain unchanged. Production file: `src/js/ui/orb-editor.js`, plus version metadata/assertion. Risk: native selection and accidental sentinel persistence; no schema/interface changes.

Regression: new RC-11 test in `tests/orb-editor.test.js` covers all concrete values, refresh/initialization purity, sentinel rejection, one commit, listener/option uniqueness, and zero-Orb no-op. Existing per-Orb/Bulk ownership tests pass.

Native evidence: optional `scripts/validate-bulk-select.cjs`, external Playwright and system Chromium; corrected build performs real native keyboard selection of fixed, lastParticle and dominantBand from mixed. Each yields [desired, desired] and exactly one change event, with no page errors. Public share transport observes persisted results. No Playwright project dependency added. Browser required sandbox escalation because default shell sandbox blocks Chromium initialization; native probe then ran successfully.

Mutation: restoring retained concrete display fails mixed-state regression; permitting sentinel commits fails the no-mutation guard. Restored before all acceptance checks.

Reproduce: `AP_PLAYWRIGHT_MODULE=<external playwright path> AP_REPORT=<report path> node scripts/validate-bulk-select.cjs`; default Chromium `/usr/bin/chromium`, override `AP_CHROMIUM_PATH`. Baseline mode `RC11_EXPECT_DEFECT=1` is validation-only and requires the pre-fix artifact.


Acceptance: intended-behavior regressions and focused tests PASS; full `npm test` PASS including protected RC-01–RC-06; production build PASS; `git diff --check` PASS; schema exactly 10. Generated untracked artifact `dist/auralprint_0.1.15m.h.l.html` has matching version metadata. Adjacent logs record reproduction, regression, mutation and final checks.

Historical audit/evidence are unchanged. RC-01–RC-06 were CLOSED before this mission. RC-07–RC-11 are locally CLOSED. Remaining mission findings are OPEN. RC-16–RC-22 are untouched. Preset schema remains 10. 115N remains WITHHELD. Build 115 is NOT canonical / NOT shipped. Hosted Linux/Windows CI is reserved for the final PR if all blockers close.
