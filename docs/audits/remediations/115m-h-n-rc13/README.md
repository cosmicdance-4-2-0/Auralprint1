# 115M.H.N — RC-13 preserve visible panel and queue keyboard focus ownership

RC-13 CLOSED by local acceptance evidence. Version `v0.1.15m.h.n`.

Root causes: workspace stacking reacted only to pointerdown; Queue Hide restored an absent btnOpenQueue; queue refresh recreated focused row DOM without restoration.

Contract: focusin raises its visible workspace panel; hidden panels cannot seize stacking. Queue Hide snapshots focus ownership before hiding and returns to the actual Queue toggle when no launcher exists; showing from that toggle focuses Hide. Refresh captures row index/action before replacement, then focuses the same row or a removal's successor/predecessor action. Empty/blocked queue falls back to visible Queue Hide. Clear-owned focus similarly moves to Hide; outside focus is not stolen. Production files: `src/js/ui/workspace.js`, `src/js/ui/ui.js`, plus version metadata/assertion. Queue layout, lifecycle, interfaces and persistent state unchanged. Risk: browser focus sequencing and disabled/removed elements.

Regression: RC-13 workspace test covers visible ownership, hidden-panel guard, one-time wiring, actual toggle fallback and outside focus. Two coordinator tests cover middle/last/final removal, row activation, append with outside focus, and Clear. Protected RC-02/RC-05 tests and all full-suite closed regressions pass.

Native evidence: unchanged historical probe reproduced covered Analysis focus at 1280x800 and 375x667 and removal focus loss. Its Queue Hide case did not explicitly open the queue; on the current branch hidden controls cannot acquire focus, so that historical assertion alone is insufficient evidence. The new `scripts/validate-workspace-focus.cjs` asserts a visible queue and real Hide focus, independently reproduces original Hide/removal failure against the M.H.M pre-fix artifact (`baseline-visible-browser.json`), then validates corrected M.H.N. Corrected native cases verify visible hit-tested Analysis focus in both sizes, actual Queue toggle Hide/show roundtrip, successor/predecessor/final removal, row activation, outside focus after append and Clear to Hide. No page errors. Screenshots distinguish baseline covered focus from corrected visible focus. Historical files are unchanged.

Mutation: remove focusin stacking, remove actual-toggle fallback, and remove queue restoration independently fail intended-behavior regressions. Restored before focused/full tests and production build. Optional external Playwright only; default browser `/usr/bin/chromium`.


Acceptance: intended-behavior regressions and focused tests PASS; full `npm test` PASS including protected RC-01–RC-06; production build PASS; `git diff --check` PASS; schema exactly 10. Generated untracked artifact `dist/auralprint_0.1.15m.h.n.html` has matching version metadata. Adjacent logs record reproduction, regression, mutation and final checks.

Historical audit/evidence are unchanged. RC-01–RC-06 were CLOSED before this mission. RC-07–RC-13 are locally CLOSED. Remaining mission findings are OPEN. RC-16–RC-22 are untouched. Preset schema remains 10. 115N remains WITHHELD. Build 115 is NOT canonical / NOT shipped. Hosted Linux/Windows CI is reserved for the final PR if all blockers close.
