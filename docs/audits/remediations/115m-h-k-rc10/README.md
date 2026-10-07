# 115M.H.K — RC-10 synchronize Ring lock to current-frame Orb phase

RC-10 CLOSED by local acceptance evidence. Version `v0.1.15m.h.k`.

Root cause: lifecycle update dispatched in composition order, so Ring read the old Orb phase before Orb.step advanced. Current-branch actual Orb/adapters reproduce 0.1-radian lag in successive 1/30-second frames at 3 rad/s.

Contract: explicit Orb phase lock observes the first current Orb's phase after its simulation update. Composition remains Ring then Orbs in preference order. Runtime updates non-Ring participants in their order, then the dependent Ring; render, reset, reconciliation and interfaces are unchanged. Free-run pause behavior remains the separate existing behavior (RC-18 untouched).

Production file: `src/js/render/visualizer-runtime.js`, plus version metadata/assertion. Risk: lifecycle dispatch ordering. Existing deterministic order scaffolding is updated only for update order; original drawing order is protected unchanged.

Regression: `tests/ring-phase-lock.test.js` uses actual Orbs/adapters with variable deltas, both chiralities, wrapping, first-Orb reordering, pause, visual reset, zero-Orb stability, and free-run control. Observes phase equality at render entry and Ring/A/B draw order. Existing lifecycle, per-Orb ownership/reset/enablement controls pass. Pure simulation evidence suffices; no browser scheduling/rendering claim is needed.

Mutation: restoring composition-order updates fails current-frame phase equality; reversing draw order fails the render-order assertion. Both restored before final verification.


Acceptance: intended-behavior regressions and focused tests PASS; full `npm test` PASS including protected RC-01–RC-06; production build PASS; `git diff --check` PASS; schema exactly 10. Generated untracked artifact `dist/auralprint_0.1.15m.h.k.html` has matching version metadata. Adjacent logs record reproduction, regression, mutation and final checks.

Historical audit/evidence are unchanged. RC-01–RC-06 were CLOSED before this mission. RC-07–RC-10 are locally CLOSED. Remaining mission findings are OPEN. RC-16–RC-22 are untouched. Preset schema remains 10. 115N remains WITHHELD. Build 115 is NOT canonical / NOT shipped. Hosted Linux/Windows CI is reserved for the final PR if all blockers close.
