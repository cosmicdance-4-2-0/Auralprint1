# 115M.H.N — RC-13 preserve visible panel and queue keyboard focus ownership

Original RC-13 remediation: local acceptance evidence for `v0.1.15m.h.n`; merged in [PR #35](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/35) with hosted Linux/Windows CI passing.

Root causes: workspace stacking reacted only to pointerdown; Queue Hide restored an absent btnOpenQueue; queue refresh recreated focused row DOM without restoration.

Contract: focusin raises its visible workspace panel; hidden panels cannot seize stacking. Queue Hide snapshots focus ownership before hiding and returns to the actual Queue toggle when no launcher exists; showing from that toggle focuses Hide. Refresh captures row index/action before replacement, then focuses the same row or a removal's successor/predecessor action. Empty/blocked queue falls back to visible Queue Hide. Clear-owned focus similarly moves to Hide; outside focus is not stolen. Production files: `src/js/ui/workspace.js`, `src/js/ui/ui.js`, plus version metadata/assertion. Queue layout, lifecycle, interfaces and persistent state unchanged. Risk: browser focus sequencing and disabled/removed elements.

Regression: RC-13 workspace test covers visible ownership, hidden-panel guard, one-time wiring, actual toggle fallback and outside focus. Two coordinator tests cover middle/last/final removal, row activation, append with outside focus, and Clear. Protected RC-02/RC-05 tests and all full-suite closed regressions pass.

Native evidence: unchanged historical probe reproduced covered Analysis focus at 1280x800 and 375x667 and removal focus loss. Its Queue Hide case did not explicitly open the queue; on the current branch hidden controls cannot acquire focus, so that historical assertion alone is insufficient evidence. The new `scripts/validate-workspace-focus.cjs` asserts a visible queue and real Hide focus, independently reproduces original Hide/removal failure against the M.H.M pre-fix artifact (`baseline-visible-browser.json`), then validates corrected M.H.N. Corrected native cases verify visible hit-tested Analysis focus in both sizes, actual Queue toggle Hide/show roundtrip, successor/predecessor/final removal, row activation, outside focus after append and Clear to Hide. No page errors. Screenshots distinguish baseline covered focus from corrected visible focus. Historical files are unchanged.

Mutation: remove focusin stacking, remove actual-toggle fallback, and remove queue restoration independently fail intended-behavior regressions. Restored before focused/full tests and production build. Optional external Playwright only; default browser `/usr/bin/chromium`.


Acceptance: intended-behavior regressions and focused tests PASS; full `npm test` PASS including protected RC-01–RC-06; production build PASS; `git diff --check` PASS; schema exactly 10. Generated untracked artifact `dist/auralprint_0.1.15m.h.n.html` has matching version metadata. Adjacent logs record reproduction, regression, mutation and final checks.

Post-merge status: PR #35 fixed the demonstrated RC-13 defects and merged RC-07–RC-14 remediation with hosted Linux/Windows CI passing. Post-merge developer review identified an additional focus-restoration edge when Queue remained visible while Audio was hidden: the actual Queue toggle belongs to the hidden Audio panel. [115M.H.P](../115m-h-p-rc13/README.md) closes that edge by restoring focus only to a visible owner, without opening Audio. The original reproduction and PR #35 evidence above remain unchanged.

RC-01–RC-12 and RC-14 are CLOSED; RC-13 closes after acceptance of this review correction, completing RC-01–RC-14 closure. RC-15 remains OPEN P2, blocks release-candidate promotion, and requires explicit release disposition before 115N. Historical audit/evidence are unchanged. Preset schema remains 10. 115N remains WITHHELD. Build 115 is NOT canonical / NOT shipped.
