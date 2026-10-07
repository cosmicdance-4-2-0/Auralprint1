# 115M.H.F — RC-04 transport ownership

Baseline: `86c653ae733eed9869c37fab5619a60b0ae62b4c` / `v0.1.15m.h.e`.
Target: `v0.1.15m.h.f`. Preset schema: **10**, unchanged.
Audit: PR #26, `docs/audits/2026-10-06_214431_PDT-release-audit.md`, RC-04.

Bug fix only. `playPause()` formerly read mutable module-global `mediaEl` after both `AudioContext.resume()` and `mediaEl.play()`. Clear set it to null; replacement redirected the continuation to another element.

The action now captures `target` by value and checks `mediaEl === target` after each await, before reading paused state, invoking transport, or committing playback/errors. Stale success and rejection return quietly. Current play failures retain truthful errors; the current synchronous Pause branch retains its behavior.

Strict element identity is sufficient: `loadFile()` allocates a fresh `document.createElement("audio")` for every load; private `attachSource()` installs it after teardown; public live attachment installs no media element. Teardown nulls the reference, aborts listeners, releases the old element, and does not reuse it. No public path reinstalls a released element. No transport generation was added.

Regression risk is limited to cancellation of superseded Play work. No schema impact; two identity comparisons, no per-frame work. Production behavior changes only in `src/js/audio/audio-engine.js`; `src/js/core/constants.js` changes version metadata only. UI, source manager, activeLoadRequestId, Mic/Stream generations, RecorderEngine, Queue, scrubber, presets, analysis, visualizers, dependencies, build, and CI are unchanged. RC-05 was not touched.

## Evidence

- Baseline: exact requested sequential `npm ci --cache ./.npm-cache`, `npm test`, `npm run build`, `git diff --check` passed; 326 tests.
- Focused: 13 real-engine regressions cover Clear during delayed resume and play success/rejection; paused/playing replacement during resume and play success/rejection; normal Play/Pause/current failure; no-loaded-element no-op. Assertions instrument canonical writes and element play/pause/paused reads, including equal-value rewrites and preservation of replacement-owned errors.
- Mutation A removes only the post-resume guard; Clear-during-resume and replacement regressions fail. Mutation B removes only the post-play guard; Clear/replacement success/rejection regressions fail. Production restored exactly; 13 regressions then pass.
- Native Chromium: ten scenarios, including the historical `playPause-unload-null-dereference`, stale rejection feedback, resume Clear, six replacement variants, and normal Play/Pause/current failure. Async UI handlers are observed through settlement before asserting results. Native audio playback/context resume is held deterministically; canonical writes are observed after Clear/replacement. No page errors, stale writes, stale errors, false failure toasts, or replacement transport calls.
- Negative browser control: the accepted-baseline AudioEngine reproduces `Cannot read properties of null (reading 'paused')` on the same historical scenario; implementation is restored afterward. Only engine source is swapped; probe version metadata remains target-version metadata.
- RC-02: all 12 Clear/load cancellation regressions pass; no resurrection, stale errors, or queue repopulation. All nine native built-artifact cancellation/ordinary-load/append scenarios pass.
- RC-03: 46 source/graph regressions pass, including all 13 live-source ownership tests and stream-graph/input-source-manager protection. Six native generated-MediaStream scenarios pass.
- Final sequential `npm test`, `npm run build`, `git diff --check`: 339 tests pass; build passes; whitespace clean. Artifact: `dist/auralprint_0.1.15m.h.f.html`.

Playwright/Chromium use existing developer tooling through `RC04_PLAYWRIGHT_MODULE` and `RC04_CHROMIUM_PATH`. No tooling dependency/build/CI changes were made. Historical audit and evidence remain unchanged; corrected evidence is separate here.

## Status

RC-01 CLOSED. RC-06 CLOSED. RC-02 CLOSED. RC-03 CLOSED.
RC-04 awaits hosted Linux/Windows CI before closure. All other unresolved findings remain unresolved. **115N remains WITHHELD.** Broader Build-117 lifecycle/resource hardening stays deferred.
