# 115M.H.P — RC-13 Queue focus-restoration review edge

Accepted baseline: main `5f0b3c0af4e818e6b6000f36e4b6b15d47aa8562`, `v0.1.15m.h.o`. Workspace fast-forwarded from `e481e3c`; clean baseline verified before sequential `npm ci --cache ./.npm-cache`, `npm test`, `npm run build`, and `git diff --check`, all PASS. Target development revision: `v0.1.15m.h.p`; preset schema remains exactly 10.

[PR #35](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/35) merged RC-07–RC-14 remediation with hosted Linux and Windows CI passing. It fixed the demonstrated RC-13 defects. Post-merge developer review identified one additional reachable edge: Queue may remain visible while Audio is hidden, but its real toggle lives inside Audio. Queue Hide could therefore attempt to restore focus to a hidden control. The original [RC-13 reproduction and PR #35 evidence](../115m-h-n-rc13/README.md) remain intact.

115M.H.P closes that edge by selecting a visible focus owner through the existing `isPanelVisible()` seam. With visible Audio and an existing Queue toggle, focus returns to `btnToggleQueue`; otherwise it returns to `btnOpenAudio`. The existing launcher helper expands a collapsed launcher, without opening Audio. Queue Hide snapshots focus ownership before hiding; outside focus is preserved. Showing Queue from its real toggle still transfers focus to `btnHideQueue`. Workspace no longer depends on the nonexistent Queue launcher. Two coordinator tests now use the real Audio/Queue controls instead of a synthetic Queue launcher.

Production behavior changes only in `src/js/ui/workspace.js`. Version metadata changes in `version` and `src/js/core/constants.js`, with the current-version assertion in `tests/targeted-audit.test.js`. Regression risk is limited to workspace focus sequencing; no persisted fields or performance behavior change.

Validation:

- Focused workspace suite: 9/9 PASS, including Audio-visible hide/show, Audio-hidden hide, collapsed-launcher recovery, hidden-attribute visibility, missing-toggle fallback, outside focus, stacking, and existing visibility/record controls. [Focused output](focused.log).
- Workspace plus coordinator regressions PASS; coordinator suite 140/140 PASS, retaining row removal/activation and outside-focus controls.
- One focused mutation restores unconditional Queue-hide focus to `btnToggleQueue`. Audio-hidden and collapsed-launcher regressions FAIL as required (four failures, five positive controls pass). Correct implementation restored before final validation. [Mutation output](mutation.log).
- Native Chromium 151.0.7922.173: 11 scenarios PASS, including Audio-hidden Queue Hide with initially expanded/collapsed launcher. Both restore `btnOpenAudio`, `visibleFocus == true`, Audio hidden, Queue hidden, launcher expanded, and an enabled target. Existing Audio-visible hide/show, row removal, row activation, outside-focus, Clear, and panel-stacking controls remain green. No page errors. [Native result](browser.json). Validation ran with the execution environment's network permission because sandbox socket restrictions blocked Chromium launch; validator portability and dependencies remain unchanged.
- Final sequential `npm test`, `npm run build`, `git diff --check`: PASS. Version/schema/artifact assertions PASS: `v0.1.15m.h.p`, schema 10, nonempty `dist/auralprint_0.1.15m.h.p.html` with matching version marker. Generated output remains ignored/untracked.
- Existing hosted Linux and Windows checks are required on the correction PR; their outcomes are reported on its Checks tab. This PR must not be merged by this pass.

Documentation reconciles README/ROADMAP with merged PR #35. The RC-15 / AUD-002 roadmap entry now requires explicit release disposition before 115N while retaining broader Build 117 performance/resource hardening. No RC-15 policy is selected or implemented.

RC-01–RC-12 and RC-14 remain CLOSED. RC-13 closes after this edge correction is accepted, completing RC-01–RC-14 closure. RC-15 remains OPEN P2 and blocks release-candidate promotion; explicit release disposition is required before 115N. 115N remains WITHHELD. Build 115 is NOT canonical / NOT shipped. Historical audit/evidence and RC-15 measurement evidence remain unchanged. Later findings are untouched.
