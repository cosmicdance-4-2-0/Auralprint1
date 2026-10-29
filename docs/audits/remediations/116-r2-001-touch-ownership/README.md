# AUD116-R2-001 — Scrubber initiating-touch ownership

Repository: `cosmicdance-4-2-0/Auralprint1`; branch: `fix/116-r2-001-touch-ownership`.
Verified remote main/base: `c145cb207838e010068d98145b4aeea7a1b67082`, including merged audit PR #94 and accepted ancestor `332d1cd312f0060cd043f1dc48a001c662b3788f`.
Tested implementation/regression commit: `22dad1502a997773ea86900de90869fe9f8973d1`; the following evidence commit changes only this remediation directory.

The Scrubber now retains the initiating contact's identifier from `changedTouches`, seeks only when that identifier changes, and releases ownership only for that contact's end/cancel or existing lifecycle cancellation. Additional canvas starts retain default prevention without seeking or replacing ownership. Production changes are confined to `src/js/audio/scrubber.js`; mouse/button separation and all existing cancellation paths remain intact. Version stays `v0.1.16-candidate`, writer schema 16.

## Independent before/after reproduction

The final extended `scripts/validate-116-scrubber.cjs` was run against a clean worktree of exact remote main and the clean tested commit, using the same harness SHA-256. Each edition loaded a real ten-second WAV into a paused HTMLMediaElement. Trusted Chromium CDP input and delivered touch identifiers were checked independently of the historical R2 harness.

| Native input / expected time | Before: source / portable / hosted | After: source / portable / hosted |
| --- | --- | --- |
| A outside at 10%; B starts on Scrubber at 80% → 8 s | 1 / 1 / 1 s | 8 / 8 / 8 s |
| Move only A to 30% → remain at 8 s | 3 / 3 / 3 s | 8 / 8 / 8 s |
| End A; move B to 60% → 6 s | 3 / 3 / 3 s | 6 / 6 / 6 s |
| Scrubber first at 20%; add/end outside contact; move owner to 60% → 6 s | 2 / 2 / 2 s | 6 / 6 / 6 s |

All four native fixtures (isolated production module, source, portable, hosted) completed: baseline **197 passed / 40 failed**; corrected **237 passed / 0 failed**, with zero page/console errors. Failures include downstream assertions sharing the ownership defect. [Native evidence](native-evidence.json) records every media observation and the primary source touch trace, plus commit/blob/harness provenance.

Coverage includes ordinary single contact, outside-first, Scrubber-first with outside and same-canvas contacts, unrelated movement/end/cancel, owned cancellation/recovery, simultaneous and rapid changes, reset/load/reinitialization, twenty repeated initializations, listener counts, and mouse blur/missing-mouseup/outside-canvas/middle/right-button controls. Source/isolated fixtures exercise public Scrubber lifecycle seams; built editions exercise actual File/Queue reset and load actions. Node tests also cover replacement canvases/windows/documents and multi-contact `changedTouches` ordering. Existing legacy test payloads now carry native identifiers/changed contacts; their expected seeking/default-prevention assertions are unchanged.

## Verification

Node **24.19.0**, Python **3.12.14**, lockfile-installed Playwright **1.64.1** / esbuild **0.25.12**, pinned Chromium headless shell **156.0.8078.4**, Linux. Dependencies were installed with `npm ci --offline --cache /workspace/auralprint-environment/npm-cache`; the documented Playwright headless shell was installed, and available system libraries supported its runs. The environment's activation script supplies the permitted esbuild executable and Python path.

- Focused Node: **294 passed, 0 failed** (drag ownership, coordinator, waveform, targeted audit). New ownership tests independently failed before the fix: **22 passed / 10 failed**.
- `npm test`: **1,502 passed, 0 failed, 1 existing opt-in retention test skipped**. An initial run exposed one legacy touch fixture without `changedTouches`; correcting its payload resolved the failure without changing assertions.
- `npm run build` and `python scripts/verify_distribution.py`: passed; nine packaged files verified.
- `npm run test:browser`, `npm run test:browser:editing`, `npm run test:browser:presets`: passed. Editing covers all 40 sliders in source/portable/hosted; preset checks cover both distributions.
- `node scripts/validate-116-scrubber.cjs`: **237 passed / 0 failed**; focused native run also passed before the full sequence.
- `node scripts/validate-116-candidate.cjs`: passed across six edition/DPR cases and two native Canvas cases.

[Verification evidence](verification.json) retains command results, tested SHA, counts, log hashes and distribution hashes. Required gates ran sequentially on the tested commit. Generated distributions are untracked. Production exclusions, original audit/evidence, dependencies, version/schema, Build 115 Canon and watcher code/tests are unchanged.

To repeat the native comparison, build each checkout using the README bootstrap, then run the corrected validator with `AP_REPO_ROOT=/path/to/checkout AP_REPORT=/path/to/report.json node scripts/validate-116-scrubber.cjs`. Add `--observe` for baseline failure evidence (exit 1 remains intentional). Omit `AP_CHROMIUM_PATH` to use the pinned headless shell.

## Qualifications and review boundary

CDP rejects selective cancellation (`TouchCancel must not have any touch points`); unrelated/owned selective cancellation therefore uses explicit DOM TouchEvents alongside native initiating contacts/moves, with separate Node regressions. Whole-gesture cancellation is native. A simultaneous CDP contact packet produces separate native starts; Node tests additionally cover multiple changed contacts in one event. Blur/focus signals are explicitly dispatched. Scrubber native coverage is DPR 1 over local HTTP; candidate controls additionally cover DPR 2.

Physical touch/OS focus-loss incidence, Windows/macOS, Firefox/WebKit/Safari, direct-file/offline launch and real-device behavior remain unverified. These checks do not certify device interoperability or release acceptance. [Original audit](../../20261029T124331Z_auralprint-116-post-remediation-hostile-2.md) and [native R2 evidence](../../20261029T124331Z_auralprint-116-r2-evidence/README.md) are preserved. AUD116-R2-002 is deferred to its separate PR; AUD116-006 remains unresolved and untouched. Delivery stops at a draft PR; no merge, RC promotion, tag or release.
