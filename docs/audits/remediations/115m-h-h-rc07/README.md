# 115M.H.H — RC-07 spectrum coverage

RC-07 CLOSED by local acceptance evidence. Starting accepted baseline: `c6b05dcd56e8fa07d45f624c9ff5738f271a278b`, v0.1.15m.h.g, clean tree. RC-01 through RC-06 were CLOSED before this mission.

Root cause: BandBank reserves floor/top bands; accepted count 2 leaves no interior band. The unchanged historical reproduction passes on the baseline and observes zero energy for the 1 kHz signal, with a count-3 positive control.

Contract: supported counts are integer 3 through 256 (the canonical name table size); invalid counts retain the existing default-fallback policy. Canonical CONFIG owns the limits. Shared count validation is used by preset sanitation and runtime resolution; resolution never mutates preferences. BandBank geometry and FFT mapping are unchanged, keeping RC-08 separate.

Production files: `src/js/core/config.js`, `src/js/core/preferences.js`, `src/js/presets/preset-codec.js`. Version metadata: root `version`, `src/js/core/constants.js`, assertion in `tests/targeted-audit.test.js`.

Regression: `tests/band-count-coverage.test.js` checks the original URL/import/resolve/rebuild/energy path; valid smaller counts and malformed boundary inputs across schemas 2–10; every supported count across five distributions and three sample rates with contiguous coverage. Existing BandBank and URL synchronization positive controls pass. Synthetic frequency evidence suffices for this geometric defect; native decoder behavior is not involved.

Mutation: restoring count-2 import admission fails both the original path and boundary regression; removing runtime validation fails boundary coverage. Both mutations restored before final verification.

Acceptance: focused tests PASS; complete `npm test` PASS (23 files, including all protected RC regressions); production build PASS; `git diff --check` PASS; schema assertion exactly 10; generated untracked artifact `dist/auralprint_0.1.15m.h.h.html` has matching version marker. Logs are adjacent. Initial dependency provisioning was interrupted and then completed sequentially with `npm ci`; the final tests/build ran with the locked installed dependencies.

Historical audit and evidence are unchanged. RC-08 through RC-15 remain OPEN. RC-16 through RC-22 are untouched. Preset schema remains 10. 115N remains WITHHELD. Build 115 is NOT canonical / NOT shipped. Hosted Linux/Windows CI will run on the final PR only if all blockers close.
