# 115M.H.O — RC-14 terminate cancelled touch seek ownership

RC-14 CLOSED by local acceptance evidence. Version `v0.1.15m.h.o`.

Root cause: no touchcancel listener and drag state survived scrubber reset/load/init. Native current-branch reproduction starts at 5 seconds, cancels, then an unrelated move seeks to 15 seconds and is defaultPrevented.

Contract: touchcancel terminates drag just as touchend does; reset, loadFile and init invalidate prior drag ownership. Later unrelated moves neither seek nor intercept. Fresh drag and normal mouse/touch behavior continue through existing handlers. Production file: `src/js/audio/scrubber.js`, plus version metadata/assertion. No event model/pointer redesign, interface or schema change. Risk: cancelling legitimate old gestures at source lifecycle boundaries, which is intentional ownership termination.

Regression: `tests/scrubber-drag-ownership.test.js` covers cancellation, normal end, reset, load (including failed waveform decode), and canvas reinitialization, checking unchanged media time/default handling and successful fresh drag. Existing waveform and closed transport/cancellation tests pass.

Native evidence: `scripts/validate-touch-seek.cjs` uses built HTML with inspection-only exposure, actual 20-second WAV/HTMLMediaElement, and standard synthetic TouchEvents as the audit did. Six corrected cases: cancel from canvas, cancel at window, end, reset, load, ordinary move. Terminated cases retain 5 seconds with defaultPrevented false; ordinary move seeks to 15 seconds and prevents default; fresh drag reaches 12 seconds in every case. No page errors. Physical device gestures were not exercised. External optional Playwright only.

Mutation: removing touchcancel listener or each reset/load/init invalidation independently fails its regression. All restored before focused/full tests/build. Version M.H.O; release-candidate 115N remains withheld.

The initial native probe reused a pre-decode bounding rectangle after asynchronous layout updates, giving an incorrect fresh-gesture coordinate. The corrected probe computes current bounds for each touch; intended time assertions remain unchanged. The prematurely created local commit was amended only after six native cases and final tests/build passed.


Acceptance: intended-behavior regressions and focused tests PASS; full `npm test` PASS including protected RC-01–RC-06; production build PASS; `git diff --check` PASS; schema exactly 10. Generated untracked artifact `dist/auralprint_0.1.15m.h.o.html` has matching version metadata. Adjacent logs record reproduction, regression, mutation and final checks.

Historical audit/evidence are unchanged. RC-01–RC-06 were CLOSED before this mission. RC-07–RC-14 are locally CLOSED. Remaining mission findings are OPEN. RC-16–RC-22 are untouched. Preset schema remains 10. 115N remains WITHHELD. Build 115 is NOT canonical / NOT shipped. Hosted Linux/Windows CI is reserved for the final PR if all blockers close.
