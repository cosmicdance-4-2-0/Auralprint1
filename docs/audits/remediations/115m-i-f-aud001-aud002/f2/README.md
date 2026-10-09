# 115M.I.F / F.2 — Queue and File activation ownership

AUD-001 (High) is implementation-corrected for the tested ownership paths. Final closure remains subject to independent F.4 acceptance. AUD-002 (Medium) remains open. This phase fixes only its obsolete File attachment/state-write boundary. Build 115N remains **WITHHELD**. PR [#46](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/46) remains draft; no merge, release or tag is authorized by this evidence.

## Starting point and evidence integrity

- `main` and accepted implementation baseline: `0717e6c82ea5e4a9c08a2650e00730f4d698b3b5`.
- Accepted F.1 evidence/parent commit: `5a65a0a6cc100849088a2bee2b0647949ddfbb76`.
- Branch: `codex/115m-i-f-aud001-aud002`; no rebase or main reconciliation was needed.
- Starting version `v0.1.15m.i.e`; current development version `v0.1.15m.i.f`; preset schema **10**.
- Before implementation, PR #46 was verified open/draft with exactly the accepted F.1 head. Main and PR ancestry were rechecked before publication. F.1 changed documentation/evidence only.
- All **15** original F.1 files, including its runner, logs, results, trace and contracts, were compared byte-for-byte against the accepted commit after validation. [Integrity inventory](evidence/f1-integrity.json) records their original hashes. Nothing in the existing audit, F.1 evidence or canonical shipped builds changed.

The original [F.1 results](../baseline-results.json), [trace](../ownership-trace.md) and [contracts](../regression-contracts.md) remain the baseline record. The new results below describe corrected development code, not a regenerated baseline.

## Ownership change

Queue still owns order and cursor. Its new `entryAt(index)` and `currentEntry()` accessors return existing private entry objects as runtime-only opaque handles. Every `add()` already creates a different object; no new ID sequence, persistence, snapshot fields or return semantics were introduced. Callers must not mutate or serialize the handles. This distinguishes equal names and repeated references to the same File, while surviving index shifts and shuffle.

UI still owns File request authorization through `activeLoadRequestId`. Its closure now retains `{ requestId, entry, autoPlay, pending }`. Autoplay is normalized through the existing `loadAndPlay(file, opts)` interface. The engine's existing request-current hook requires both the numerical request ID and selected entry identity. Clear, source switches and removal invalidate the request record; a new selection replaces it. This record never enters preferences, presets, source metadata or serialization.

Removal captures ownership and intent before Queue mutation. Only the authorized selected pending/loaded entry can cause a replacement load. It invalidates that request before removing the entry, then uses the existing helper for its successor. Pending work contributes requested autoplay; committed work contributes actual playing state. Empty Queue uses the existing idle reset. Removing another entry, including A after B has begun, leaves B authorized even when its index changes.

The manager checks the existing UI authority at File entry and again after `await teardownActiveSource()`. Stale work cannot tear down a newer live owner at entry, publish requesting state after the await, clear its errors/stream metadata, or call the engine. The Mic/Stream activation sequence and resource ownership remain unchanged.

File graph attachment now supplies the same `isCurrent` guard already supported by `attachSource()`. After its resume await, the helper checks authorization **before destructive teardown/graph transfer**. `loadFile()` respects a declined attachment and checks installed element/request ownership before native Play. Its existing attachment catch releases the candidate and commits a structured error only for a still-current request. Current constructor/initial-resume and Play-resume exceptions remain unchanged for F.3.

Candidate cleanup aborts its own listeners before pausing, clearing its source and releasing its URL. If active teardown already aborted/released that candidate, subsequent cancellation does not release it twice. It does not tear down the winner. Shared writes from `error`, `play`, `pause` and `ended` require the current request and installed element. Decode/error callbacks may release their own URL, but clear the engine's URL reference only while still authorized. Already-queued callbacks also consult ownership. Normal current media errors and EOF hooks remain observable.

UI completion/failure notifications require current request **and entry**. Cancellation produces no fabricated `track-change-failed` or obsolete completion. RecorderEngine remains an observer and has no implementation/interface changes. Deferred EOF additionally captures entry identity, preserving the existing file/element/request checks, captured repeat policy, clear-before-consume and finalization lock.

## Permanent regressions

There are **24** added permanent tests, all exercised by ordinary `npm test`:

| Suite | Added coverage |
| --- | --- |
| `tests/queue-entry-ownership.test.js` (2) | Distinct equal-name Files; duplicate File references; removal before/after/current; shuffle/navigation identity; unchanged snapshots and return contracts. |
| `tests/targeted-audit.test.js` (13) | Pending selected removal for distinct/equal-name/same-reference entries; true/false pending successor intent; unrelated earlier/later removal while B loads; A→B→C; native Play completion resolve/reject removal; duplicate-entry deferred EOF; independent entry authorization with unchanged request ID. |
| `tests/input-source-manager.test.js` (2) | File staleness across teardown continuation and stale entry calls against Mic/Stream winners; no obsolete requesting/label writes, engine load or live-track release. |
| `tests/file-activation-ownership.test.js` (7) | Stale second resume resolve/reject; no winner graph disconnect, media replacement, URL revocation, native loser Play or transient state writes; candidate listener/resource cleanup; File→Mic/Stream at initial and attachment resume; ordinary current callbacks. |

The existing UI fixture's new opt-in mode allocates **different media elements and URLs** for every load. Existing fixture behavior is unchanged. Deferred promises signal actual resume/Play boundaries; recorder completion signals the UI completion boundary. No timing sleeps substitute for ordering in these Node regressions. Graph tests use state write spies, direct element equality, node connection/disconnection spies, and separate loser/winner resource assertions.

Direct `Queue.goTo()` instrumentation in two guard tests and the duplicate-entry EOF test isolates entry identity while retaining File/element/request identity. Normal UI selection additionally advances the request ID. This is explicitly an internal seam test, not a claim that normal row selection leaves its request ID unchanged.

Existing RC-02 synchronous batch/Clear, RC-03 live sequencing/release, RC-04 Play/replace/Clear, RC-05 finalization/EOF, RC-06 retained exports and RC-19 terminal disposal coverage all passed in the full suite. No implementation in Scrubber, state, RecorderEngine, recording export, analysis, rendering or resource governance changed.

## Native results and remaining red contracts

Chromium **151.0.7922.173**, headless, native Web Audio/HTMLMediaElement, muted output. Both independent final runs executed **28 scenarios / 28 desired contracts**. Each had **22 F.2 passes, 6 deferred F.3 failures, no infrastructure failure and no unexpected correctness failure**. The `--f2` run exited **0**; the full contract run exited **1**, intentionally.

| Controlled boundary / condition | Corrected observation |
| --- | --- |
| Initial resume holds A; actual UI removal selects B | A never allocates media or completes; B becomes active/playing. |
| Pending replacement B after loaded A teardown; B removed | C retains requested autoplay even though actual `isPlaying` is false. |
| Pending `autoPlay:false` through the in-memory helper hook; removal | B loads paused. The hook controls an existing helper option, not a second loading path. |
| Distinct Files with equal names / exact same File enqueued twice | Different entry handles; removal advances request and authorizes the surviving entry. |
| Unrelated removal / remove stale A after B started / A→B→C success | Surviving selection keeps ownership; only the latest activation commits. |
| Native A.play() has succeeded but its completion is held; remove A | B plays; releasing old completion cannot produce an A notification or restore A. |
| A second attach resume resolves or rejects after B wins | B's exact element, loaded/playing/error state and source survive; no stale rejection leak. |
| Final pending removal / Clear | Queue and File workflow stay idle with no late media restoration. |
| Pending File→Mic/Stream | Native synthetic live graph remains authoritative; no real permissions/devices used. |
| Loaded playing/paused removal and ordinary unmodified WAV activation | Successor preserves actual play/pause intent; ordinary playback time advances. |
| Current attach resume rejects | Existing structured `file-activation-failed` path remains observable, without a rejection leak. |

[Full native snapshots and assertion failures](evidence/native-results.json), [first-run summary](evidence/f2-native-summary.json), and both native logs preserve actual execution. Native snapshots include Queue/entry/File IDs, request ID, source/audio state, element identity/state, graph readiness, URLs, recorder notifications, projected UI, browser exceptions and unhandled rejections. Generated stereo PCM WAVs are deterministic, 30 seconds, 44.1 kHz, using 440/554/659 Hz fixtures; hashes/bytes are in the results.

The six remaining failures are unchanged F.3 work:

1. Current AudioContext constructor throw leaves source `requesting` with no terminal error and leaks a UI rejection.
2. Current initial-load resume rejection does the same.
3. Loaded File Play-resume rejection retains media but exposes no transport error and leaks a rejection.
4. Superseded **initial** resume rejection leaves winning C's state intact but leaks a rejection.
5. Obsolete Play-resume rejection after Clear leaves idle state intact but leaks a rejection.
6. Obsolete Play-resume rejection after replacement leaves B intact but leaks a rejection.

The latter three require the deferred startup/Play settlement and UI rejection-containment work; they are distinct from File **attachment** rejection, corrected here. No general catch, startup error policy or retry redesign was added. Valid retries still work in the diagnostic; error collections on a reused browser page retain the earlier recorded exception, so retry success is not evidence that F.3 settlement is fixed.

## Negative controls

[Runner](diagnostics/negative-controls.py) makes each mutation in a separate disposable temporary copy. All **9/9** were detected by real assertion failures, with no syntax, import or harness failure: pending removal ignores ownership; pending intent uses observed state; entry authorization uses filename; entry authorization uses File reference; File attachment omits its guard; stale attachment catch writes current state; declined candidate enters native Play; candidate callbacks omit ownership checks; manager teardown continuation omits its guard. [Results and full assertion logs](evidence/negative-controls.json).

These isolate semantic defects; they do not alter the source checkout. Removing only the explicit pre-removal increment would still encounter selected-entry and successor-request guards. The removal control therefore disables the pending-owner decision and proves the externally required successor transition fails, rather than asserting an incidental counter increment.

## Reproduction and validation commands

Environment: Node **24.19.0**, Python **3.12.14**, esbuild **0.25.12**, environment-supplied Playwright **1.62.1**. No dependency manifest, lockfile or workflow change. Subprocess/browser execution used approved environment access; dependency installation used the existing offline cache. In this managed workspace source `/workspace/auralprint-environment/activate.sh` to select its configured esbuild/Python tools.

The final baseline validation ran sequentially:

```sh
npm ci --offline --cache /workspace/auralprint-environment/npm-cache
npm test
npm run build
python scripts/verify_distribution.py
git diff --check
```

All exited **0**; staged `git diff --cached --check` also passed. Captured terminal logs normalize trailing blank lines. Full suite: **628 tests, 627 pass, 0 fail, 1 established opt-in particle-budget skip**. Portable and hosted I.F metadata and identical shared implementation passed distribution verification. Distribution hashes are recorded in [validation.json](validation.json) and [distribution log](evidence/distribution.log). `.build/` and `dist/` remain ignored; no distribution is committed.

Run diagnostics separately from the default suite, writing fresh results outside the historical evidence:

```sh
node docs/audits/remediations/115m-i-f-aud001-aud002/f2/diagnostics/native.cjs --f2 --output /tmp/auralprint-f2-native.json
node docs/audits/remediations/115m-i-f-aud001-aud002/f2/diagnostics/native.cjs --contracts --output /tmp/auralprint-full-contracts.json
python docs/audits/remediations/115m-i-f-aud001-aud002/f2/diagnostics/negative-controls.py --output /tmp/auralprint-f2-controls.json
```

The native runner defaults to the full desired-contract mode (also selected by `--contracts`). Exit 1 there represents remaining correctness failures, not a failing default suite. `--f2` still executes and reports **every** assertion but gates exit status on F.2/infrastructure failures. The negative-control runner exits 0 only when every isolated mutation is detected by an assertion, never because broken code is considered correct. Do not overwrite committed result files on rerun.

Every native injected difference is confined to browser memory: localhost HTML interception; export of already-existing module/helper/request/refresh references; native AudioContext subclass with constructor/reject/hold/skip controls; promise observation wrappers returning original promises; native Play completion hold after real playback; object URL/recorder/error observation; replacement media-device providers returning native oscillator-generated streams. No production source is patched to expose diagnostics. The ordinary playback scenario uses the unmodified artifact and no fault instrumentation. `skip` intentionally leaves the context suspended to exercise its real second resume. Scheduling uses promise holds/state predicates; one task turn drains rejection reporting, and ordinary playback waits for advancing native media time.

## Scope, limitations and handoff

F.2 source changes are limited to `queue.js`, `ui.js`, `input-source-manager.js` and `audio-engine.js`. `constants.js` changes only the version header; root version and existing exact-version assertions are synchronized. Schema, persistence, routing, recorder and canonical artifacts are unchanged. No independent generation counter, central transport manager, new Queue or generalized catch framework was added.

F.2 native evidence covers the portable artifact. Hosted packaging/shared code was verified structurally, not separately browser-launched. Real Mic/Stream permissions/devices, interactive/headful playback, native recorder/export integration and the complete F.4 acceptance matrix were not exercised. Candidate callback write/resource fencing has deterministic Node coverage; it is not a claim that every native callback order was exhaustively enumerated. Entry identity after shuffle and unrelated-before removal have permanent tests; native scenarios cover unrelated-after and stale-A-before removal.

F.3 should work at the existing current startup/Play awaits and UI event boundaries using the same authority. Preserve the newly guarded attachment/candidate paths, manager/live sequences and recorder/EOF ownership. Do not weaken the six red contracts or reinterpret retry success as terminal settlement. Remaining risks are browser timing beyond the controlled cases and the explicitly deferred F.3 failures. No unexpected F.2 ownership defect remains in executed cases.

## Exact changed-file inventory

Application ownership: `src/js/audio/queue.js`, `src/js/ui/ui.js`, `src/js/audio/input-source-manager.js`, `src/js/audio/audio-engine.js`.

Exact version synchronization: `version`, `src/js/core/constants.js` (header only), `tests/rc20_packaging.py` (version only), `tests/targeted-audit.test.js` (version assertions plus regressions/fixture extension).

Other permanent tests: `tests/queue-entry-ownership.test.js`, `tests/file-activation-ownership.test.js`, `tests/input-source-manager.test.js`.

New evidence under this `f2/` directory: `README.md`, `validation.json`, `diagnostics/native.cjs`, `diagnostics/negative-controls.py`, `evidence/f1-integrity.json`, `evidence/native-results.json`, `evidence/f2-native-summary.json`, `evidence/negative-controls.json`, `evidence/npm-ci.log`, `evidence/npm-test.log`, `evidence/build.log`, `evidence/distribution.log`, `evidence/focused-tests.log`, `evidence/native-f2.log`, `evidence/native-contracts.log`, `evidence/negative-controls.log`.

**115M.I.F / F.2 COMPLETE — QUEUE AND FILE OWNERSHIP READY FOR REVIEW.**
