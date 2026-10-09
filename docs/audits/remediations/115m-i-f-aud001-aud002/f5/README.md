# 115M.I.F / F.5 — failed File activation cleanup

F4-CLEANUP-01 is implementation-corrected in the executed cases. **Independent F.6 acceptance remains required.** Draft [PR #46](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/46) remains open, unmerged and draft. No finding is closed by this phase. Build **115N remains WITHHELD**.

Starting accepted F.4 commit: **`af13017c4950bfda82a0cecd5d350f2b2109fdca`**, tree `684bc69deac4a17fe35827905129ef63fa7fe6de`. Its application is accepted F.3 `b6a3aa7989cf5ed54fde5012781a1809edaef5b3`, descended from accepted F.2 `0c188a06673b94ce124579ecd638ff890b161d32` and F.1 `5a65a0a6cc100849088a2bee2b0647949ddfbb76`. Main remains `0717e6c82ea5e4a9c08a2650e00730f4d698b3b5`; starting worktree clean and tree-exact. Branch `codex/115m-i-f-aud001-aud002`. Version **v0.1.15m.i.f**, schema **10**, unchanged.

## Reproduction before correction

Freshly built accepted F.4 code and executed its immutable `f4/diagnostics/cleanup.cjs` before editing. All **six cleanup assertions failed** (three repetitions per case); all six terminal-settlement/Clear/recovery checks passed. [Baseline snapshots](evidence/baseline-cleanup.json), [actual log](evidence/baseline-cleanup.log). Exit **1** indicates reproduced cleanup defects, not failed diagnostic setup. No previous report or artifact was overwritten.

Native corrupt-media case uses the same **21-byte invalid WAV** through actual File input, with no injected decoder fault. At terminal source error, failed media remained installed, graph ready, source/output nodes retained and listener controller un-aborted. URL revocation and truthful flags/notification did not release engine ownership.

Graph case uses valid generated WAV and an explicitly injected `NotSupportedError` at native `createGain()` after media/source-node transfer. Candidate src/listeners/URL were released, but installed engine media/source references survived. Message incorrectly blamed unsupported media. This establishes that branch, not a naturally observed browser allocation failure rate. The historical baseline comparison remains immutable in F.4.

## Ownership correction

Only production file changed: [`audio-engine.js`](../../../../../src/js/audio/audio-engine.js). Its existing `releaseCandidate()` now distinguishes:

| Resource owner | Release outcome |
| --- | --- |
| Current request and exact installed candidate media | Invoke existing `teardown()` once and return. This releases transferred/partially constructed engine ownership. |
| Uninstalled temporary candidate | Abort local listeners; release only its local media/URL. |
| Superseded candidate | It cannot invoke engine teardown. Already-aborted candidates skip duplicate media release; remaining local release cannot touch winner graph/URL/tracks. |

The installed branch requires **both existing request authorization and media-element identity**. No new identity, request counter, lifecycle state or registry. `loadFile()` attachment catch reuses this release before its existing current-error guard and projection. Its hard decoder failure branch now releases after capturing/projecting the truthful terminal outcome. Teardown does not clear `state.audio.transportError`; manager retains source/session failure settlement and UI retains its exactly-once notification. No manager/UI production change or duplicate publisher is needed.

Teardown now explicitly disconnects engine-owned sum gains and mapped analysers as well as the existing source/splitter/sum/output nodes. Completed analyser bands enter the existing map individually so an exception allocating a later band cannot strand an earlier one. An analyser that throws during its own configuration/buffer allocation disconnects locally before rethrow because it has not entered that map. This changes allocation-failure cleanup, not channel routing or analysis settings/algorithms.

File attachment exceptions use a context-specific description that preserves the cause: `Playback failed: audio source attachment failed: <cause>`. A graph `NotSupportedError` no longer claims the valid WAV is unreadable. Media decode vocabulary, initial AudioContext failure description and interruption description remain distinct. Second attachment-resume failures still retain their actual cause in the attachment outcome.

Native media error **before** activation settlement can report audio failure while no manager session exists. The subsequent hard failure releases installed resources and returns false; manager commits one File failure and UI emits one failed transition. Native error **after** session commitment still uses the existing manager-owned `handleFilePlaybackError()` unload/settlement. Queued callbacks remain request/media/controller guarded after abort, so they cannot resurrect ownership or create another failure.

Recoverable `playPause()` behavior is unchanged. Loaded File identity, position, graph, session and recorder tap survive a current resume/Play refusal; retry clears error under existing behavior. No catch-to-unload strategy was introduced.

## Immediate resource evidence

[F.5 cleanup runner](diagnostics/cleanup.cjs) is a separate copy of F.4 with stronger read-only observation and unchanged original cleanup assertions. It records exact candidate media and installed source identity at graph construction, every allocated native node/disconnection, controller state, URL creation/revocation, terminal source/audio state and recorder mutations. Snapshot assertions execute **before Clear, retry or page disposal**.

| Native condition | Cleanup | Terminal error / notification | Recovery |
| --- | --- | --- | --- |
| Real invalid WAV, three repetitions | **3/3 pass**: media/source/output/partial graph references absent, bands empty, readiness false; detached/paused media and aborted listeners; each allocated node disconnected once | Truthful unreadable-media error in source and audio; inactive File session; exactly one failed transition; no exception/rejection | Explicit Clear and valid File succeed |
| Controlled post-transfer graph refusal, three repetitions | **3/3 pass** with same ownership release; source node disconnected and URL revoked | Actual allocation cause preserved, no unsupported-media claim; exactly one failure; no exception/rejection | Clear and valid File succeed |

Total **six cleanup passes, zero failures**, six settlement/recovery passes, exit **0**. [Snapshots](evidence/cleanup-results.json), [log](evidence/cleanup.log). Candidate/installed media release is once-only in these probes; native callbacks may revoke their own already-released URL, but never a winner URL.

Permanent spies additionally challenge obsolete hard failures after successful B, failed B, Clear, Mic and Stream. They observe zero stale source/audio writes, no winner disconnect/play/pause/revoke, no live-track stop and no duplicate loser release. Direct engine API replacement without a UI request ID proves the media identity guard independently of request IDs.

## Recorder integration

[Native runner](diagnostics/recording.cjs), derived from the F.4 infrastructure, uses configured real **MediaRecorder**, native canvas capture and Web Audio. Two cases pass:

1. Start recording valid A; select actual invalid WAV; assert immediate failed resource release while the **same recorder remains recording**, capture tracks stay live, tap destination stays owned and invalid output connection is absent. Select valid B, verify tap reconnection, request actual native chunk delivery, then Stop/finalize.
2. Repeat with valid media and controlled post-transfer graph refusal during active recording.

Both finalize nonempty native WebM exports. A further File failure retains each export URL and identical bytes/hash. No unintended native stop, fabricated successful failed track change, duplicate failure or lost export. [Lifecycle snapshots](evidence/native-recording-results.json), [log](evidence/recording.log), [ffprobe evidence](evidence/native-export-probes.json). Exports contain **VP9/Opus**, respectively **36/19** and **35/18** video/audio packets. Encoded scratch files are not tracked.

Engine teardown disconnects the invalid output path while preserving recorder-owned tap destination/tracks. Valid replacement reconnects through existing `syncRecorderTapConnection()`. No RecorderEngine implementation/interface, native recording policy, retained export ownership or live-track ownership change. Existing RC-05 finalization lock/deferred EOF and RC-19 disposal tests remain green in the full suite; their original F.4 native evidence is preserved. F.5 does not claim to repeat F.6 independent finalization acceptance.

## Permanent regressions and sensitivity

**21 new permanent tests** across existing suites:

- `tests/file-activation-ownership.test.js`: 17 cases for pre-transfer, first-gain, partial-gains, partial-analysers, local analyser setup and connected graph failures; immediate media/source/output/band/URL/listener cleanup and meaningful cause; pre/post-commit native error ordering; exactly-once local release; five stale winner conditions and queued callbacks; tap reconnection; loaded Play recovery/position; direct API media ownership. Retries and Clear occur only after failed-resource assertions.
- `tests/targeted-audit.test.js`: two production UI picker/drop cases prove hard failure cleanup, selected Queue coherence, no Scrubber/successful transition, exactly one failure and row retry through the established helper.
- `tests/recording-export.test.js`: two retained-export cases exercise real engine/manager decoder and graph cleanup with existing recorder export harness and byte retention.

The F.5 resource harness adds only a **read-only getter to an in-memory copy** of production engine source and resolves its imports to the same real modules. Runtime control flow is unchanged; no production debug interface. Native runners likewise export closure/getter references in browser memory, forward native observations and identify explicit fault injections. Original unmodified-artifact playback remains part of the immutable F.3 suite. Synthetic Mic/Stream coverage is labeled and never presented as real device coverage.

All **10/10 new semantic negative controls** fail through the intended assertion, with zero import/syntax/harness failures: omitted hard-decoder cleanup, omitted installed attachment cleanup, removed owner guard, obsolete completion unloading winner, retained source reference, erased current error, duplicate failure notification, forced recoverable-Play teardown, undisconnected partial sum gain and unreleased local analyser. [Runner](diagnostics/negative-controls.py), [actual failures](evidence/f5-controls.json). Disposable copies only. Compact boolean identity assertions avoid Node's large EventTarget/data-URL diagnostic serialization; identity contracts are unchanged.

All immutable **9/9 F.2 + 9/9 F.3** semantic controls were independently rerun and remain meaningful. [F.2](evidence/f2-controls.json), [F.3](evidence/f3-controls.json). No expectation changes or historical control edits.

## Validation and commands

Supported environment: Node **24.19.0**, Python **3.12.14**, esbuild **0.25.12**, environment-supplied Playwright **1.62.1**, Chromium **151.0.7922.173**, headless/muted. No dependency/browser download or manifest/workflow change. Existing offline npm cache and environment activation supply tooling.

Sequential install/full tests/build/distribution/whitespace checks all exit **0**. Default suite **694 tests: 693 pass, zero fail, one established opt-in skip**. All RC-02/03/04/05/06/19/20 protections pass. [Commands](evidence/command-results.json), [suite](evidence/default-suite.log). Portable and hosted outputs freshly built and verified with unchanged I.F/schema-10 metadata. [Artifact hashes](evidence/distribution.json); portable SHA-256 **`c085effc684f3fb277fee21f2bb573a8f4b80b4864fc807444b2e068764a66e6`**.

Immutable F.3 native runner freshly passes **28/28 original contracts and 54/54 expanded assertions**, 45 scenarios, no infrastructure failure, exit **0**. [Every assertion](evidence/existing-native-summary.json). Its original phase labels are historical runner metadata; this report identifies the fresh F.5 execution and current artifact hash. The native cleanup, recording and accepted-contract runs share the exact fresh build hash.

```sh
source /workspace/auralprint-environment/activate.sh
npm ci --offline --cache /workspace/auralprint-environment/npm-cache
npm test
npm run build
python scripts/verify_distribution.py
git diff --check
node docs/audits/remediations/115m-i-f-aud001-aud002/f5/diagnostics/cleanup.cjs --output /tmp/f5-cleanup.json
mkdir -p /tmp/f5-exports
node docs/audits/remediations/115m-i-f-aud001-aud002/f5/diagnostics/recording.cjs --output /tmp/f5-recording.json --export-dir /tmp/f5-exports
ffprobe -v error -count_packets -show_streams -show_format -of json /tmp/f5-exports/corrupt.webm
ffprobe -v error -count_packets -show_streams -show_format -of json /tmp/f5-exports/allocation.webm
node docs/audits/remediations/115m-i-f-aud001-aud002/f3/diagnostics/native.cjs --contracts --output /tmp/f5-existing-native.json
python docs/audits/remediations/115m-i-f-aud001-aud002/f2/diagnostics/negative-controls.py --output /tmp/f5-f2-controls.json
python docs/audits/remediations/115m-i-f-aud001-aud002/f3/diagnostics/negative-controls.py --output /tmp/f5-f3-controls.json
python docs/audits/remediations/115m-i-f-aud001-aud002/f5/diagnostics/negative-controls.py --output /tmp/f5-controls.json
```

Native runners exit 0 for passing contracts, 1 for desired assertion failures, and a setup exception/infrastructureFailure must be treated as harness failure. Mutation runner exit 0 means every **deliberately wrong disposable implementation** was detected, not that its correctness contracts passed. Write reproduction outputs outside historical committed evidence.

## Integrity, inventory and handoff

All **70 F.1–F.4 evidence files remain byte-identical**; original 708 tracked files differ only in the engine and three test suites above. [Hash inventory](evidence/integrity.json). Version, schema, Queue/UI/manager/recorder implementations, other production modules, build/dependency/workflow files, Canon and original audits are unchanged.

Exact inventory: four modified existing files listed above; **20 new files** under `f5/`: `README.md`, `validation.json`; `diagnostics/cleanup.cjs`, `diagnostics/recording.cjs`, `diagnostics/negative-controls.py`; `evidence/baseline-cleanup.json`, `evidence/baseline-cleanup.log`, `evidence/cleanup-results.json`, `evidence/cleanup.log`, `evidence/native-recording-results.json`, `evidence/recording.log`, `evidence/native-export-probes.json`, `evidence/existing-native-summary.json`, `evidence/f2-controls.json`, `evidence/f3-controls.json`, `evidence/f5-controls.json`, `evidence/command-results.json`, `evidence/default-suite.log`, `evidence/distribution.json`, `evidence/integrity.json`.

Final-head Linux/Windows CI is checked **after** this separate commit is published and reported in PR metadata/final handoff. This committed report makes no pre-execution CI claim.

No cleanup defect remains in executed scenarios. Limits: Chromium/Linux only; no installed Firefox/WebKit or real device grants, physical audibility or long-session stress. Controlled graph faults do not prove a browser's native allocation-failure frequency; arbitrary failure of the cleanup primitives themselves is not exhaustively injected. Direct file navigation remains subject to the F.4 documented environment restriction. No universal compatibility claim.

**Keep PR #46 draft pending F.6 independent acceptance**, which should challenge cleanup/late callbacks/winner isolation, actual recorder reconnection and integrated portable/hosted behavior against this implementation. Do not close AUD-002/F4-CLEANUP-01 or promote Build 115N from this phase. Other AUD findings, accessibility, real hardware/browser compatibility, performance/resource policies and release-document approval remain separate release work.

**115M.I.F / F.5 COMPLETE — FAILED-ACTIVATION CLEANUP READY FOR INDEPENDENT REVIEW.**
