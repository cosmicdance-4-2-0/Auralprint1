# 115M.H.M — RC-12 admit media candidates consistently to real decoder validation

RC-12 CLOSED by local acceptance evidence. Version `v0.1.15m.h.m`.

Root cause: picker and drop silently filtered File.type by audio/ prefix; picker additionally restricted the chooser by the same MIME hint. Current-build native Chromium reproduces decoder-successful Ogg (application/ogg) and exact empty-MIME WAV rejection through both entry paths.

Contract: browser File MIME and filename cannot establish decoder support. Both paths enqueue supplied files through the existing batch/load path, where the real media decoder determines playability and reports truthful failure. The picker permits selecting candidates regardless of MIME/extension. No new format whitelist or decoder introduced. Production files: `src/js/ui/ui.js` (remove both MIME filters), `src/index.template.html` (remove accept restriction), plus version metadata/assertion. Risk: unsupported files now become visible queued load failures, which are explicitly tested; cancellation/generation ownership is unchanged.

Regression: 12 RC-12 cases in `tests/targeted-audit.test.js` exercise both ingress handlers, empty/application/ogg/octet-stream/video/mp4/audio/wav metadata, one activation and canonical queue state, and truthful NotSupportedError state and UI feedback. Existing RC-02 batch cancellation/order and all closed regressions remain green.

Native evidence: `scripts/validate-media-admission.cjs` uses real Chromium File/DataTransfer, native AudioContext decoding and HTMLMediaElement playback. Ogg application/ogg, unknown-name empty MIME WAV, arbitrary-name octet-stream WAV and ordinary audio/wav each load through picker and drop. Invalid text bytes admitted as text/plain fail truthfully, retain one queue entry, disable Play and show unsupported/unreadable status. Ten corrected cases pass with no page errors; four baseline defect cases reproduce. External optional Playwright only, no project dependency.

Mutation: reinstating each MIME filter independently fails that entry's admission regressions. Both restored and focused/full tests/build rerun afterward. Native data-dependent failures remain owned by the unchanged decoder/load path.


Acceptance: intended-behavior regressions and focused tests PASS; full `npm test` PASS including protected RC-01–RC-06; production build PASS; `git diff --check` PASS; schema exactly 10. Generated untracked artifact `dist/auralprint_0.1.15m.h.m.html` has matching version metadata. Adjacent logs record reproduction, regression, mutation and final checks.

Historical audit/evidence are unchanged. RC-01–RC-06 were CLOSED before this mission. RC-07–RC-12 are locally CLOSED. Remaining mission findings are OPEN. RC-16–RC-22 are untouched. Preset schema remains 10. 115N remains WITHHELD. Build 115 is NOT canonical / NOT shipped. Hosted Linux/Windows CI is reserved for the final PR if all blockers close.
