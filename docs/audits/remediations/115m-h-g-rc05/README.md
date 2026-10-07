# 115M.H.G — RC-05 correction report

RC-05 is CLOSED after local validation and hosted Linux/Windows CI passed ([PR #33](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/33)). The source/transport lifecycle cluster is closed; broader Build-117 lifecycle/performance hardening remains separate future work. Historical release audit PR #26 and its evidence are unchanged. RC-07 and all other unresolved findings remain outside this correction. 115N remains WITHHELD.

| Field | Result |
| --- | --- |
| Baseline | `b5304658ebbb53995f99cf49cc95dd861b792839`, `v0.1.15m.h.f`; clean tree; `npm ci --cache ./.npm-cache`, `npm test`, `npm run build`, `git diff --check` passed sequentially. Initial sandbox network restriction was resolved with the supported network permission; no dependency/infrastructure changes or offline install. |
| Version | `v0.1.15m.h.g` |
| Schema | Exactly 10 |
| Root cause | AudioEngine delivers native `ended` to the UI hook, which previously returned during finalizing and discarded the event. Recorder completion/error updates canonical phase but previously retained no event to replay. This was UI transport event loss. |
| Deferred EOF ownership design | One runtime-only pending context in the UI File transport closure; Queue and RecorderEngine remain generic. |
| Pending context fields | File object, media element, repeat mode at EOF, existing `activeLoadRequestId` value (`requestId`). No persisted IDs/schema fields. |
| Unlock detection | Existing recording UI synchronization attempts consumption when canonical phase is no longer finalizing, before its refresh cache check and during direct recording refresh. O(1), no timers/events added; handles finalization entirely between frames. |
| Repeat mode semantics | Captured at EOF. Subsequent preference changes cannot redefine it. Repeat control unchanged. |
| Stale ownership validation | Still File workflow, same non-null Queue File and media element, same existing load request ID. Mismatches clear quietly. Canonical invalidation/reset/source-switch and load seams also clear. |
| Exactly-once mechanism | Clear pending ownership before validation or transition; normal and deferred events use one policy, normal `loadAndPlay()`, and existing cancellation guards. |
| Next track during finalize | PASS: A stays current/ended during lock; B loads/plays once after completion. Three-track regression proves no second advancement. Native capture export remains fetchable/nonempty. |
| Repeat One | PASS: A reloads/plays once after unlock; native browser and Node regression. |
| Repeat All | PASS: B wraps to A once after unlock; native browser and Node regression. |
| No-next repeat off | PASS: A stays ended, no reload, exactly one original `audio-unloaded` notification; pending clears even through nested/repeated refreshes. |
| Finalization failure | PASS: native export assembly error releases pending EOF to B; truthful `error`/`finalize-failed` state/message remains intact. |
| Stale pending EOF | PASS: queue File, media element, live workflow, teardown, Clear, and explicit replacement; restoring identities does not revive discarded EOF. |
| Repeated refresh | PASS: multiple recording/all-UI refreshes, nested synchronization, and subsequent repeat edit cannot replay consumed EOF. |
| Ordinary EOF | PASS: idle/complete/error immediately advance; native positive control. |
| Recording across EOF | PASS: immediate advance in recording; native MediaRecorder stays recording across transition and subsequently exports successfully. |
| Historical browser repro | Unchanged audit script rerun on baseline with outputs saved separately here as `baseline-browser.json`: both schedules reproduce lost advance; controls pass. |
| Native EOF ordering | PASS on corrected built HTML: delayed native onstop (800 ms) and capture-phase Stop Recording before application EOF hook; both observe actual native ended during finalizing, complete export, one B transition, no page errors. Probe only exposes built objects for inspection as the audit did. |
| Mutation A | Rejected: restoring event loss fails required next-track regression. See `mutation-A.log`, `mutations.json`. |
| Mutation B | Rejected: omitting consume clear causes duplicate Repeat One reload/play during reentrant refresh after ownership validation; no-next also detects repeated policy notifications. See `mutation-B.log`. Correct implementation restored and focused tests rerun. |
| RC-02 regression | PASS: 12 Node tests and nine native browser scenarios, existing cancellation/load ownership untouched. |
| RC-04 regression | PASS: 13 Node tests and ten native browser scenarios, existing Play/Clear/replacement ownership untouched. |
| RC-06 regression | PASS: 16 Node tests and native retention/replacement probe, successful A survives failed acquisition and B capture, B replaces/revokes A once. |
| Production files changed | `src/js/ui/ui.js`; version marker only in `src/js/core/constants.js`. Supporting changes: version, current-version assertion/18 tests, optional RC-05 browser probe, README/ROADMAP/new remediation evidence. |
| RecorderEngine changed | No |
| AudioEngine changed | No |
| Queue changed | No |
| Unrelated findings touched | None; historical audit/evidence untouched. |
| Focused tests | 18 RC-05 PASS; RC-05 + RC-02 combined 30 PASS. |
| Full tests | `npm test` PASS across all 22 test files; per-file detailed execution confirms 357 individual tests PASS (`test-counts.json`). |
| Build | `npm run build` PASS |
| Artifact | `dist/auralprint_0.1.15m.h.g.html`, generated and untracked |
| git diff --check | PASS |
| Linux CI | PASS — hosted `Test and build (ubuntu-latest)` on PR #33 |
| Windows CI | PASS — hosted `Test and build (windows-latest)` on PR #33 |
| RC-01 | CLOSED |
| RC-02 | CLOSED |
| RC-03 | CLOSED |
| RC-04 | CLOSED |
| RC-05 | CLOSED |
| RC-06 | CLOSED |
| 115N status | WITHHELD |

New evidence is in this directory. Native RC-05 rerun: build, then `RC05_CHROMIUM_PATH=/usr/bin/chromium RC05_REPORT=work/rc05-browser.json node scripts/validate-finalizing-eof.cjs`. Use `RC05_PLAYWRIGHT_MODULE` if Playwright is elsewhere. Playwright/browsers remain optional tooling outside repository dependencies and CI.
