# 115M.I.F / F.6 — independent final acceptance

**Recommend CLOSE for AUD-001, AUD-002 and F4-CLEANUP-01.** The demonstrated ownership, failure-settlement and failed-activation cleanup contracts hold in this independent review. Recommend human approval and merge review of [PR #46](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/46). The remediation lifecycle is complete; no additional remediation phase is recommended. The PR remains draft and unmerged pending human action. **Build 115N remains WITHHELD** and is a separate release decision.

Audited application: **`158a782c4af0466bd09a9c11dc9f3db0dd6f780d`**, tree **`aa8c1b9e5be42804edf907694577b5d662c4ccaf`**. Branch `codex/115m-i-f-aud001-aud002`; version **v0.1.15m.i.f**; preset schema **10**. F.1–F.5 accepted commits remain in ancestry. GitHub main remains `0717e6c82ea5e4a9c08a2650e00730f4d698b3b5`. Starting application tree was clean and exact; no unrelated commit appeared. Local `origin/main` was an older tracking reference at `3abce4a`; after API/ancestry verification only that reference was advanced to actual main. Application HEAD/tree were not reconciled or replaced. GitHub's release collection is empty; Canon files are unchanged. The connector rejects the tags collection endpoint, so no exhaustive remote tag listing is claimed. No tag or release was created.

## Method and independent architecture assessment

Production source was reconstructed before using historical validation claims. Relevant Queue, UI, manager, engine and recorder paths were inspected, then compared with F.4's failed-current resource evidence, F.5's correction and permanent regressions. Freshly built artifacts were exercised, including new native allocation-boundary and recorder experiments beyond the original first-gain probe. Passing suites are supporting evidence, not substitutes for ownership/resource observations.

| Boundary | Actual authority and resource owner |
| --- | --- |
| Queue | Private fresh `{file,name}` objects identify individual entries. Opaque accessors preserve identity through shifts/shuffle. The cursor selects an entry; filename and File reference are insufficient identities. Queue owns no media or recorder. |
| UI File request | Existing request ID plus selected entry authorize activation. Closure-local pending request retains normalized autoplay; committed removal uses actual playing state. Removal captures identity/intent before mutation and revokes removed ownership before authorizing the successor through the same helper. Clear/source switch invalidate before teardown. |
| Source manager | Checks File authority before and after awaited source teardown, and after engine completion. Owns requesting/active/error sessions and live acquisition sequences/tracks. Current false/exception settles failure; obsolete work cannot commit or release a live winner. |
| Engine startup | Current constructor/initial-resume failure is contained before candidate allocation. Obsolete rejection returns quietly. Closed context reports reload; the application does not close its AudioContext. |
| Local candidate | Owns a native element, URL and listener controller. Before installation, failure/cancellation releases only these local resources. Candidate callbacks require request, installed media identity and nonaborted controller for shared writes. URL callbacks concern only their captured URL. |
| Graph transfer | Second resume can remain outstanding. `attachSource()` checks authority after it and before destructive transfer. Source/media/controller/URL fields transfer to the engine before synchronous `buildGraph()` completes. Partial allocation therefore needs installed-owner cleanup. |
| Failed current activation | `releaseCandidate()` requires both current request and exact installed candidate to call existing teardown. It disconnects source, output, splitter, sum gains and mapped analysers; clears references/bands and aborts/releases media/URL. Local analyser configuration failure disconnects its not-yet-mapped analyser before rethrow. Hard decoder failure captures its error before release. |
| Obsolete candidate | Cannot call global teardown. Already-aborted local candidates skip duplicate media release; stale callbacks and completion are inert. Engine media identity also protects direct replacement without a UI request ID. |
| Loaded Play | Captured current media owns the operation across resume/Play awaits and rejection. Recoverable failure retains media, position, graph and source session, reports truthful paused/error state and can retry. This path does not use failed-activation teardown. |
| Recorder / live tracks | Engine owns the playback graph and tap connection; recorder owns encoding/render lifecycle and retained exports. Invalid output disconnects while the capture destination remains owned for reconnection. Manager owns upstream Mic/Stream tracks. Recorder disposal and source teardown are distinct. UI deferred EOF is request/entry/media scoped, once-only and gated by finalization. |

F.5 corrects the underlying local-versus-installed ownership mistake. It does not simply erase state or rely on a later retry to remove retained resources. Source failure remains manager-owned and exactly-once track failure notification remains UI-owned; no duplicate publisher or additional cancellation mechanism was introduced.

## Finding decisions

### AUD-001 — CLOSE

Original accepted reproduction: removing pending A selected B but left A authorized to play/commit. F.2 corrects entry/request authority, pending intent, manager continuation, graph transfer and callbacks. Fresh immutable native diagnostics pass **28/28 original contracts and 54/54 expanded assertions**. They cover pending initial resume and native Play removal, final removal, Clear, unrelated removal, duplicate filenames/repeated File objects, true/false autoplay, loaded playing/paused successors, A→B→C and File→Mic/Stream.

Fresh F.4 integration additionally preserves the selected entry through earlier/later removal and shuffle, out-of-order completions and obsolete rejection after a newer error. The new F.6 probe holds a real native Play completion after playback starts but before commitment, then replaces it with successful B, failing B, Clear, native synthetic Mic or Stream. Captured old callbacks execute after abortion and the old promise rejects: **zero stale source/audio writes, graph disconnect/play/pause/track operations or recorder notifications**, with winner identity/error/graph unchanged. Native streams remain live. Actual unchanged portable and hosted outputs independently reproduce pending selected removal with B winning.

Permanent production-flow tests and all nine F.2 semantic controls remain sensitive. Relevant residual limits are broader browser/device coverage and nonexhaustive scheduling, not a demonstrated ownership defect.

### AUD-002 — CLOSE

Original accepted constructor/initial-resume/loaded-Play and obsolete rejection defects no longer escape or leave current activation requesting. Native current failures publish meaningful source/audio errors and notify once; retries and alternate selection recover. Existing actual UI picker/drop/Next/Prev/row/keyboard/repeat/EOF/remove-successor cases remain green. Obsolete first/second/Play failures preserve the winner, including its own error, and emit no obsolete toast/notification/rejection.

Three new loaded-Play probes cover rejected resume, rejected native Play and synchronous native Play exception. Exact loaded media, position, ready graph and source session survive, error remains truthful, and retry succeeds without reload or failed track-change notification. Closed context intentionally reports reload; no recreation redesign is required. All nine F.3 semantic controls detect the intended defects.

F.4 withheld broader current-failure acceptance because of the separate cleanup finding. The following resource evidence now resolves that demonstrated gap. No tested transport failure leaks an unexpected browser rejection or exception.

### F4-CLEANUP-01 — CLOSE

Original F.4 evidence remains unchanged: native corrupt WAV and controlled post-transfer first-gain refusal each retained installed or partial engine ownership on F.3 and the historical baseline. F.5 corrected installed/local release, partial-node cleanup and context-specific graph error reporting.

The **unchanged F.4 diagnostic now passes all six cleanup cases**, with six settlement/recovery passes. F.5's stronger runner independently repeats six passes. New F.6 native probes assert immediate cleanup **before Clear, retry or page close** at ten conditions:

1. Actual 21-byte corrupt File selected through the real picker, with native decoder error 4 and no decoder fault injection.
2. Controlled native media source factory refusal before ownership transfer.
3. First gain refusal immediately after source/media transfer.
4. Splitter refusal.
5. Fourth gain refusal after partial gain allocation.
6. First analyser refusal.
7. Third analyser refusal after earlier analysers exist.
8. Analyser FFT configuration refusal before its local node enters the graph map.
9. Fourth connection refusal after earlier connections exist.
10. Late analyser-settings refusal after graph connections, including an active recorder tap connection in the recording probe.

All release installed media/source/output/splitter/sum/analysis references, leave zero bands and `ready:false`, detach/pause media, abort its listeners, release its URL and disconnect every allocated graph-owned node once. Terminal source/session/audio failure remains truthful; notification is exactly once. Valid WAV graph failures report **source attachment and actual controlled cause**, not unsupported media. The graph failures are explicit exception-safety probes, not claims of naturally observed browser allocation failures.

An additional post-commit media-error callback probe confirms existing manager cleanup executes once. Invoking captured callbacks after abortion cannot resurrect state or perform duplicate teardown. Stale-owner and recoverable-Play results above prevent cleanup from broadening into destructive successor or valid-loaded-media release. All ten F.5 semantic controls detect omission/unguarded cleanup, retained graph, erased error, duplicate notification, and forced recoverable-Play teardown.

## Native recording and encoded exports

Two new configured **real MediaRecorder** runs span valid A → corrupt File or late post-transfer graph fault → valid B → native Stop/finalization. Failed resources are observed immediately while the same recorder remains recording, capture tracks remain live, and its tap destination remains owned. The late settings fault is observed **after the new output is actually connected to that tap**, then cleanup removes that connection. B reconnects and advances real playback before finalization. Later File failure preserves each export URL and identical bytes/hash.

Actual export demux/decode confirms VP9 video, Opus audio and both generated **440 Hz A / 660 Hz B** tones. This verifies encoded audio after reconnection rather than relying only on node-reference assertions. [Decoded exports](evidence/independent-export-probes.json) contain actual packet counts, hashes and 80 ms spectral windows; encoded scratch binaries are not committed.

Immutable F.4 integration rerun passes native navigation/removal/pending cancellation/failure/recovery/re-record/disposal; actual recorder finalization locks Next/Prev/row/remove/Clear, and a naturally ending WAV advances exactly once after finalization. Native Mic recording Stop/dispose preserves shared upstream tracks; source teardown owns their release. F.5's two original native recording probes also pass. Synthetic native oscillator streams exercise real Web Audio/MediaRecorder ownership without requesting physical permissions; they are not physical-device evidence.

## Distribution, environment and test quality

Fresh portable HTML under HTTP, hosted `/` and hosted `/apps/auralprint/` all pass real WAV playback/time advancement, **pending** selected removal with B winning, immediate native corrupt-file cleanup, error projection, valid recovery and required metadata/assets resolution. These pages use unchanged built HTML bytes; only forwarding native API observation and one controlled initial resume hold are added at browser initialization. No closure exports or altered bundle flow are used for distribution tests.

Portable SHA-256 **`c085effc684f3fb277fee21f2bb573a8f4b80b4864fc807444b2e068764a66e6`**; hosted HTML **`f14b3a1e26eda39a0b428c8f3d508c9d078fa3c3f05916eb7b96d3e709dd2d14`**. Actual output/asset hashes are recorded. An old ignored I.E artifact exists but was not used as a current build.

Environment: Node **24.19.0**, Python **3.12.14**, esbuild **0.25.12**, environment Playwright **1.62.1**, Chromium **151.0.7922.173**, Linux headless native media/AudioContext/MediaRecorder. Existing cache/tool activation used; no dependency, browser or workflow additions. Automated `file://` is **environment-blocked** by `ERR_BLOCKED_BY_ADMINISTRATOR`; developer-confirmed desktop file use remains separate human evidence. Firefox/WebKit binaries are absent; no new browser installation. Physical audibility/device grants, broader hardware/performance/accessibility and long-session release acceptance are unexecuted, not invented correction blockers.

Permanent tests call production control flow and use deterministic deferred ordering, entry/media identity, state-write spies and separate winner/loser cleanup counts. Their mocks cannot prove real decoder/event behavior, so native probes supply that dimension. All **28/28** F.2/F.3/F.5 mutation controls are rerun in disposable copies and fail through relevant `ERR_ASSERTION` outcomes, **zero import/syntax/harness failures**. No accepted expectation changed. Native graph observation tracks all allocated nodes; terminal resource assertions occur before test teardown. Forwarding wrappers preserve native events/encoding; controlled constructor/resume/Play/graph/callback injections are identified. Read-only in-memory closure getters and observation WeakMap IDs never participate in application authorization.

The preliminary runner caught observation-timing assumptions: source/resources can already be terminal before the next animation-frame DOM update; a post-commit error can also remain behind the existing 2500 ms “Loaded” toast. [Initial assertions](evidence/preliminary-observations.json) are preserved. Final diagnostics retain immediate resource/source assertions and separately require actual error projection without changing timers or weakening expected state. A stale intermediate encoded file was not accepted as new capture evidence; final probes use fresh distinct-tone exports. No production repair followed these runner observations.

## Results, reproduction and integrity

| Check | Fresh F.6 outcome |
| --- | --- |
| Sequential install / default tests / build / distribution / whitespace | All exit 0; **694 tests, 693 pass, zero fail, one established skip** |
| Original/expanded native contracts | **28/28 and 54/54**, 45 scenarios, no infrastructure failure |
| Original F.4 cleanup and stronger F.5 cleanup | Each **6/6**, zero cleanup failures; settlement/recovery pass |
| Existing F.4 integration | **17 pass, zero fail, one file-policy inconclusive** |
| Existing F.5 recording | **2/2** |
| New independent F.6 | **21/21**; cleanup, stale owners, loaded Play and real recording |
| New unchanged distribution checks | **3/3** |
| Actual encoded A/B capture | **2/2** |
| Semantic controls | **28/28 meaningful detections** |

RC-02/03/04/05/06/19/20 protections remain green in the complete suite and relevant native integration. [Acceptance matrix](acceptance-matrix.md), [machine-readable validation](validation.json), [commands](evidence/commands.json), [full suite](evidence/default-suite.log).

```sh
source /workspace/auralprint-environment/activate.sh
npm ci --offline --cache /workspace/auralprint-environment/npm-cache
npm test
npm run build
python scripts/verify_distribution.py
git diff --check
node docs/audits/remediations/115m-i-f-aud001-aud002/f3/diagnostics/native.cjs --contracts --output /tmp/f6-native.json
node docs/audits/remediations/115m-i-f-aud001-aud002/f4/diagnostics/cleanup.cjs --output /tmp/f6-original-cleanup.json
node docs/audits/remediations/115m-i-f-aud001-aud002/f5/diagnostics/cleanup.cjs --output /tmp/f6-cleanup.json
node docs/audits/remediations/115m-i-f-aud001-aud002/f4/diagnostics/integrated.cjs --output /tmp/f6-integration.json --export /tmp/f6-integration.webm
mkdir -p /tmp/f6-exports
node docs/audits/remediations/115m-i-f-aud001-aud002/f5/diagnostics/recording.cjs --output /tmp/f6-recording.json --export-dir /tmp/f6-exports
python docs/audits/remediations/115m-i-f-aud001-aud002/f2/diagnostics/negative-controls.py --output /tmp/f6-f2-controls.json
python docs/audits/remediations/115m-i-f-aud001-aud002/f3/diagnostics/negative-controls.py --output /tmp/f6-f3-controls.json
python docs/audits/remediations/115m-i-f-aud001-aud002/f5/diagnostics/negative-controls.py --output /tmp/f6-f5-controls.json
node docs/audits/remediations/115m-i-f-aud001-aud002/f6/diagnostics/independent.cjs --output /tmp/f6-independent.json --export-dir /tmp/f6-exports
node docs/audits/remediations/115m-i-f-aud001-aud002/f6/diagnostics/distribution.cjs --output /tmp/f6-distribution.json
python docs/audits/remediations/115m-i-f-aud001-aud002/f6/diagnostics/export-probe.py --output /tmp/f6-export.json /tmp/f6-exports/f6-corrupt.webm /tmp/f6-exports/f6-after-tap.webm
```

Write all reproduction outputs outside immutable evidence. Native runner exit 0 means its assertions pass; exit 1 means correctness failure and setup exceptions/exit 2 require separate harness investigation. Mutation runner exit 0 means deliberately wrong disposable implementations were detected, not passed correctness. Existing runners retain historical phase/SHA metadata; the F.6 execution wrapper records current SHA and matching artifact hash. Compact existing-run summaries preserve actual assertions/outcomes; new independent snapshots retain transient write/resource observations.

All **728 original tracked files**, including **90 F.1–F.5 evidence files**, remain byte-identical. [Hash evidence](evidence/integrity.json). No application, permanent test, version/schema, build/dependency/workflow, Canon or historical report changed. Only new `f6/` files are committed: this README, matrix, validation; three opt-in diagnostics; and eleven evidence files. Full inventory is in the matrix. Generated HTML, recordings and scratch work remain ignored/untracked.

Final PR-head Linux/Windows CI is verified after this separate evidence commit is published and recorded in PR metadata/final handoff. This report makes no pre-execution post-commit CI claim.

No additional functional defect is demonstrated. Recommend accepting all three findings for human closure and reviewing PR #46 for merge. Residual limitations belong to broader **115N** acceptance: other AUD findings, applicable real hardware/browser/accessibility/performance/artistic evidence and human release-document approval. No canonical changelog entry, tag, release, merge or 115N promotion is part of F.6.
