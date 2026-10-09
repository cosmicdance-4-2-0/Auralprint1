# F.1 provisional regression contracts

Baseline `0717e6c82ea5e4a9c08a2650e00730f4d698b3b5`; findings remain open:
AUD-001 High and AUD-002 Medium. These are intended invariants, not changed
expectations for the production baseline. The opt-in diagnostic executes real
browser code and records each assertion failure. It is outside default test
discovery. Promote correctness assertions during F.2/F.3; do not promote the
historical-defect assertions as ordinary permanent passing tests.

## Outcome invariants

- Successful current File: selected entry's File supplies the current media URL,
  engine graph is ready, source active session/label and audio filename agree,
  loaded/playing reflect the actual media, and recorder completion refers to the
  authorized request. Equal display names alone cannot establish agreement.
- Cancelled/stale work: no current state/error write, graph replacement, old
  playback, winner URL revocation/unload, successor cursor mutation or obsolete
  recorder terminal notification. Obsolete errors must not leak at the event boundary.
- Failed current activation: recoverable terminal failure with nonempty meaningful
  error code/message, not requesting; not falsely loaded/playing; selection still
  identifies attempted entry; local resources released without touching another
  owner; exactly one current failure notification; no unhandled rejection. Valid
  retry or selection of another File must work without reload.
- Failed Play: retain the still-owned loaded element/graph/session if usable,
  report meaningful transport error, remain actually paused, no unhandled rejection;
  successful retry clears the current playback error. Superseded Play stays silent.

For permanent stale-operation tests, instrument writes as RC-04 already does:
assert **no writes**, not just final equality. Spy native play/pause/load/revoke/
disconnect on loser and winner separately. Native snapshots alone do not prove
absence of transient writes between snapshots.

## AUD-001 matrix

All native removal actions use the existing `.q-remove` click handler, including
the internally started paused case. Resume holds use deferred promises. Results
refer to scenario names in `baseline-results.json`'s `native.scenarios`.

| Scenario | Baseline observation | Required permanent correctness assertions / reachability |
| --- | --- | --- |
| Pending A removed; B survives | **Red**: Queue selects B; request ID unchanged; A becomes active/playing. | No new A media/play/commit after removal; successor request owns B; source/media/audio/Queue agree; only B completion. Ordinary picker/UI path; native coverage required. |
| Pending requested autoplay | **Red** at initial resume and native play completion. Initial `isPlaying` is false despite request true. | B inherits true, rather than deriving false from pending actual state; assert true option, actual play and authoritative B. |
| Pending replacement B after loaded A teardown; remove B with C surviving | **Red intent**: old `isLoaded=true`/A filename survive while media is null and B requests autoplay; removal starts C but passes false from actual `isPlaying`. | Assert cancellation of B and C ownership **plus** `autoPlay:true`/actual playing. Do not treat correct cancellation alone as preservation of pending intent. Ordinary selection/removal handlers, controlled real context suspension. |
| Pending paused load | **Red**: removed A commits loaded/paused; B remains selected without a successor load. | B inherits false, remains loaded/paused, no autoplay. Normal ingestion and rows always request true; diagnostic uses an in-memory hook to call the real shared helper with false. Permanent UI harness may use that reachable internal contract; do not invent a paused user control. |
| Loaded playing A removed | Green native control: B playing. | Retain this control; match new B element/entry and true intent; no A events after teardown. |
| Loaded paused A removed | Green native control: B paused. | Retain loaded status and false intent; do not regress into autoplay. |
| Pending A final entry removed | Green at initial resume: idle, no media/URL allocation, no obsolete complete. | Assert empty cursor -1, source none/idle, all audio fields reset, no late creation or notification. Repeat resolve/reject at attachment/play boundaries in later phases. |
| B removed while A pending | Green: A continues authorized. | Request ID unchanged; correct A File and playback; only removed entry gone. |
| Clear while A pending | Green initial-resume control; RC-02 also covers load-time media play resolve/reject. | Synchronous batch fully gone; no re-addition, later File/media/error/callback/recording mutation, URL ownership clean. |
| A superseded by B then C | Initial resume resolve green; reject leaves C coherent but leaks error (**red** silence contract). | Only C commits; no old resources allocated at early stale guard; no obsolete error. Native state + deterministic no-write test. |
| A removed after B selection begins | Green: two held resumes, stale A returns false, B wins and cursor decrements to 0. | Removing A must not cancel B, regardless of A's earlier pending operation. |
| Distinct Files with identical names | **Red**: removed File remains loaded under surviving equal-name entry. | Compare entry and File object identity, request ID and Blob provenance; assert successor request despite equal filenames. Ordinary multi-file input. |
| Same File object in two entries | **Red**: same File reference, different private entry objects; no successor request. | Remove only targeted entry; remaining entry must be independently authorized, even though both File/name match. Diagnostic replays the same File-input change event, preserving actual ingestion behavior; exact object reuse is controlled instrumentation. |
| Pending File replaced by Mic/Stream | Green at initial resume, for both kinds. | File cannot reclaim ownership; live graph stays ready, no File element/complete; tracks remain live until live owner tears down. Native streams are oscillator-generated; no device permissions. Repeat second-resume resolve/reject with deterministic harness in F.2/F.3. |
| Pending removal during native play completion | **Red**: actual element plays while `isLoaded=false`, source requesting; removal still misses request. | Treat pending activation as owned independently of actual playing; stop/release removed candidate, B uses requested true, no A terminal notification. |

Requested intent lives in the current helper/manager/engine options. No Queue API,
source state or audio state exposes it. F.2's minimum interface contract is that
removal can identify its authorized entry/request and retain its normalized intent
until replacement/cancellation. Use the existing UI request authority. No new
generation counter or persisted field is justified by this evidence.

## AUD-002 matrix

| Case / exact fault boundary | Actual baseline outcome | Required assertions |
| --- | --- | --- |
| A: AudioContext constructor throws `NotSupportedError` before any element/URL | Engine **rejects**, manager **rejects**, File UI promise unhandled; source requesting, errors empty, selected A retained. | Current terminal failure and meaningful projection; media/graph/resources absent; no UI rejection; retry works. |
| B: first load resume rejects `InvalidStateError` before media allocation | Engine/manager **reject**, source requesting, no errors/terminal recorder notification; suspended context retained. | Same settlement, no false loaded/playing, selection coherent; retry with valid resume. |
| C: loaded paused A; context suspended; Play resume rejects | Play promise **rejects**; A remains loaded/paused with active session, empty transport error, UI rejection. | Retain A media identity and usable graph, report current transport error; successful retry plays and clears it. |
| D1: A first resume held; B then C win; A rejects late | C source/media/audio preserved; A still causes unhandled browser error. | No winner writes/resources changes and no obsolete UI error or rejection. |
| D2: File's second resume in `attachSource` held; B wins; old resume resolves | Attachment replaces B with A before late UI guard; A subsequently locally released; engine points at released A while source/filename retain B. | Guard before destructive teardown, no A play, winner element/graph/URL preserved; no current projections from loser. |
| D3: same second-resume hold, old resume rejects | Attach catch **returns false**; manager suppresses stale source commit, but catch clears B audio metadata and publishes obsolete transport error; native B media still plays. | Test ID before error writes; local candidate cleanup only; winner loaded/playing/error unchanged; no obsolete notifications/rejections. |
| D4: Play resume held, then Clear/replacement; old resume rejects | Current idle/B state preserved but unhandled error leaks. | Silent resolved/cancelled operation; no target/current mutation and no user-facing error. Existing RC-04 covers fulfilled resume and media-play rejection, not this rejected resume. |
| E: failure then retry | Native constructor-failure retry, initial-resume retry and Play retry all recover without reload. | Keep these controls, plus selecting another File after failure; preserve Queue entry ownership and clear current error on successful retry. Closed-context retry remains unexecuted. |
| F: ordinary success | Unmodified artifact plays generated valid WAV and advances scrubber with zero page errors. | Require this positive control for any fault harness; instrumented loaded/remove and retries also use native decoding/playback. |
| Current second attach resume rejects | Existing catch returns false, manager returns structured `file-activation-failed`, source error and transport error visible, failed recorder notification, no unhandled rejection. | Preserve existing terminal handling while extending startup coverage; assert URL candidate cleanup and no retained owned media. |

Every correctness diagnostic must have its own bounded completion signal and
capture assertion failures. A timeout is an infrastructure/inconclusive result,
not a successful reproduction. A baseline-mode exit 0 means historical behavior
was reproduced and the runner completed; it never means desired correctness passed.
`--contracts` exits 1 on this baseline because correctness assertions fail.

## Prior protections and promotion recommendations

| Protection | Assertions actually inspected | Exposure / additional assertions |
| --- | --- | --- |
| RC-02 (`targeted-audit.test.js:3610–3879`) | Production UI/manager/engine via a mock browser; final removal/Clear during resume; load-time play resolve/reject + old callbacks; synchronous picker/drop batches; ordinary and retry controls. | Its resume-removal test uses only A, so empty reset succeeds; no surviving B case. Add pending selected removal with B/C and autoplay/paused intent; preserve synchronous batch assertions. |
| RC-03 (`live-source-ownership.test.js:135–234`; manager tests) | Both live→live stale attachment success/reject, no winner disconnect, stale acquired tracks ended; current failure; optional guard on running context; late grants discarded. | File attachment supplies no guard. Reuse optional guard without changing manager track ownership. Add File↔live at both File resume boundaries; no winner track shutdown. |
| RC-04 (`transport-ownership.test.js`) | Clear/replacement during fulfilled resume; media Play resolve/reject; winner/loser method calls and state write spies; ordinary Play/Pause/current media-play error. | Rejected context resume is absent. Add current/stale resume rejects and retained current media recovery. Do not replace no-write assertions with final-state equality. |
| RC-05 (`targeted-audit.test.js:3897–4072`) | Deferred EOF once after finalization; captured repeat; exported failure still releases EOF; stale File/element/source/request and reentrancy; ordinary EOF. | Removal must invalidate old deferred EOF before replacement; ensure no double advance and successor intent is not overwritten. Duplicate File reference needs entry-distinguishing assertion. |
| RC-06 (`recording-export.test.js`) | Retain completed A across failed B acquisition/start/native error/finalization/stop; commit B before revoking A; reset retention/disposal clearing. | Transport error settlement must not reset recorder exports or dispose recorder. Add retained export equality around failed File activation and cancelled replacement. |
| RC-19 (`rc19-recorder-disposal.test.js`) | Terminal native stop/queued and synchronous callbacks; exact owned releases; failure status; reinit; failed acquisition; tap teardown without disturbing playback; no shared upstream fallback shutdown. | File cleanup may disconnect recorder output branch but must not acquire track ownership, stop shared live tracks, fabricate exports or revive disposed recorder. Keep all existing disposal assertions. |

`input-source-manager.test.js:160–217` proves requesting→active and a **returned
false** failure from its stubbed engine. It does not prove thrown/rejected engine
failure settlement. Most diagnostics are suitable for deterministic Node/UI
harness promotion into the named suites, but browser-native constructor/resume,
valid decoding, actual media play and error event-boundary coverage must remain
as dedicated opt-in/native regression checks. F.4 owns the broader integrated
and cross-browser verification; F.1 does not claim it completed.

## Unexecuted cases

No real Mic/display permissions, external streams/services, headful/device audibility,
Firefox/WebKit, naturally occurring browser resume refusal, closed-context retry,
large-file stress, active native recording during these fault races, post-attachment
synthetic decoder/EOF event dispatch, or comprehensive UI caller failure matrix
(drop/Next/Prev/shortcut/EOF failures) was executed. Their relevant source paths
were inspected. No results are fabricated for them.
