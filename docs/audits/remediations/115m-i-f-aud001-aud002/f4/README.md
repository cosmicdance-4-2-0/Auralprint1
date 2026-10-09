# 115M.I.F / F.4 — independent integrated acceptance

**Acceptance FAILED. AUD-001: CLOSE. AUD-002: REOPEN. Hold draft PR #46.**

The original pending-removal defect and all six deferred constructor/resume rejection contracts are corrected in executed cases. Fresh execution passes the prior 54 native assertions and 18 semantic mutation controls. However, independently added current-failure cleanup assertions fail: native decoder rejection retains a failed media/graph owner, and a controlled graph-allocation exception retains partial engine ownership. These violate this phase's invariant III (failed current activation releases locally owned resources). Closing AUD-002 against that complete acceptance contract would be premature. No repair is made by this evidence commit.

Build **115N remains WITHHELD**. Acceptance of these two findings is separate from whole-release acceptance. No merge, ready-for-review promotion, release, tag, canonical changelog edit or unrelated audit disposition occurs.

## Audited baseline and method

Audited application commit: **`b6a3aa7989cf5ed54fde5012781a1809edaef5b3`**, tree **`f83e063a8c4cdf98acfffb8b195c635e6045e84d`**. Existing branch `codex/115m-i-f-aud001-aud002`; PR [#46](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/46) was open/draft/unmerged at that head. It contains accepted F.1 `5a65a0a6cc100849088a2bee2b0647949ddfbb76` and F.2 `0c188a06673b94ce124579ecd638ff890b161d32`. Main remains accepted `0717e6c82ea5e4a9c08a2650e00730f4d698b3b5`. The starting worktree was clean and tree-exact; no extra commit/reconciliation was needed. Version **v0.1.15m.i.f**, preset schema **10**, unchanged.

Production Queue/UI/manager/engine/Scrubber/state/recorder code was reconstructed first, then compared with the historical audit, phase reports/contracts, structured results and permanent tests. Prior claims were treated as secondary evidence. Fresh builds, independent browser experiments and isolated baseline comparison determine the conclusions below. This is targeted acceptance, not an audit of all release findings.

Environment: Node 24.19.0, Python 3.12.14, esbuild 0.25.12, environment-supplied Playwright 1.62.1, Chromium 151.0.7922.173 on Linux. Native headless Web Audio, HTMLMediaElement, canvas capture and MediaRecorder run with muted browser output. No new dependency or browser download. Existing local npm cache and `/workspace/auralprint-environment/activate.sh` supply approved tooling; subprocess/browser execution used approved access.

## Independent ownership reconstruction

| Production boundary | Actual authority and outstanding work |
| --- | --- |
| Queue (`queue.js`) | Owns fresh `{file,name}` entry objects and integer cursor. `entryAt/currentEntry` expose opaque runtime handles; shuffle preserves selected object and remove shifts indices. Names/File references are not entry identity. Queue selects data; it never loads media or owns a recorder. |
| UI File helper (`ui.js:1277`, `1370`) | Increments existing `activeLoadRequestId`; captures `{requestId,entry,autoPlay,pending}`. Authorization requires ID and selected entry. All File controls use this helper. Requested autoplay stays in this closure until commitment; loaded removal uses actual playback. Clear/source switch revoke authority before teardown. Removal captures entry/intent before Queue mutation and authorizes a successor through the same helper. |
| Manager (`input-source-manager.js:439`) | Checks File guard at entry and after asynchronous teardown, publishes requesting, awaits engine, rechecks before terminal failure/session commit. Its live sequence owns Mic/Stream acquisitions and track cleanup. Teardown currently performs its work synchronously despite returning a promise; the caller's await still yields. |
| Engine (`audio-engine.js:294`) | Initial context construction/resume catches current failure before media/URL allocation; stale catch returns without writes. Candidate gets separate native element, URL, controller and callbacks. `attachSource` awaits resume, checks current authorization before destructive transfer, then installs media/graph. Native Play may remain pending after graph transfer and play events before File/source commitment. |
| Engine callbacks / cleanup | Installed callback writes require request, media identity and nonaborted controller. Candidate callbacks may revoke their own URL; they cannot revoke the winner's distinct URL or update winner references. Teardown aborts installed listeners and clears graph/media before native release. Stale local release handles only the candidate. The current failure exceptions below occur after transfer or hard media rejection, rather than stale cancellation. |
| Play (`audio-engine.js:420`, UI button) | Captures installed media. Resume success and catch consult element identity before old reads/writes/play/pause. A current recoverable failure retains loaded media/session/graph and projects error; successful native Play event clears it. UI fallback/post-await toast is similarly element-scoped. |
| Scrubber | Owns independent OfflineAudioContext decode and existing decode token; reset invalidates pending arrayBuffer/decode continuations. Decode never owns transport selection or playback errors. |
| Recorder / EOF | Recorder observes authorized start/complete/failed/unloaded and owns native encoding/render tracks/export lifecycle. AudioEngine owns a passive output tap and reconnects it on graph rebuild; manager owns live tracks. Native stop finalizes through recorder's existing token. UI captures request/entry/File/media/repeat for deferred EOF, consumes once after finalization, and refuses Queue transport controls while locked. |

No additional cancellation counter, persisted state, central transport owner or source representation was found. No stale operation in executed ownership experiments modified the winner, its error, graph, URL, recorder terminal notifications or live tracks.

One existing projection nuance remains: replacement teardown resets actual playing but can retain old loaded/filename metadata while the new source is requesting and no media is installed. F.2 explicitly handles this through its pending request/intent, and the historical evidence already identifies it. Do not interpret those pending audio flags as media ownership. No new activation or cancellation failure was established from that transient projection; future UI loading-status policy may clarify it independently.

## AUD-001 — CLOSE

**Original defect:** accepted F.1 native A/B reproduction selected B after pending A removal, yet A later became active/playing and emitted completion. Loaded-state removal classification omitted pending ownership.

**Corrective boundary:** opaque entry identity plus existing UI request authority, captured autoplay, pre-mutation removal invalidation, manager continuation guard, guarded graph transfer, candidate/callback release and guarded completion/EOF.

**Fresh evidence:** immutable F.3 runner passes all original 28 and expanded 54 assertions. Additional native cases preserve selected B across earlier/later removals and shuffle, resolve C before stale B rejection with zero writes/graph operations/notifications, and preserve a newer C failure after old initial/attachment/Play rejection. Native Play-completion removal, final removal, Clear, equal filenames/repeated File entries, true/false intent, loaded playing/paused successors and File→Mic/Stream are re-executed by the existing runner. See [native rerun](evidence/existing-native-summary.json), [independent results](evidence/integrated-results.json), [matrix](acceptance-matrix.md).

**Recorder/resources:** active native recording spans Next, loaded removal and pending removal; the removed request emits no terminal completion/failure after successor ownership. Capture graph reconnects to the winner; recording survives current resume failure/recovery. Stop/export/disposal and shared live-track ownership remain correct in the new native cases. Permanent identity/no-write/resource tests plus nine F.2 mutations remain sensitive.

**Closure recommendation:** CLOSE the original pending-removal/obsolete ownership finding for the demonstrated intended behavior. Cross-browser/device coverage and exhaustive callback-order proof are not claimed. The separately confirmed current-failure cleanup defect below does not demonstrate removed/stale work gaining authority.

## AUD-002 — REOPEN for failed-current cleanup

**Original symptoms are corrected:** current constructor/initial-resume attempts leave requesting, publish nonempty source/transport error, return controlled failure without allocation/leaked rejection, and recover. Loaded Play-resume failure retains media/session/graph, reports error and retries. Obsolete first/second/Play rejection is quiet, including after Clear/live replacement and after a new owner has reported its own error. Exactly-once current File notification and cancellation silence pass. Externally closed context reports reload; the application contains no AudioContext close path. No lifecycle redesign is warranted by that explicit nonrecoverable case.

**Newly demonstrated acceptance gap F4-CLEANUP-01:** controlled failure can settle state truthfully while retaining failed engine ownership. Severity **Medium**, confidence **high** in executed branches; resource retention is bounded to the current failed graph until a later transport action, not a demonstrated unbounded leak or audible playback of invalid data.

| Reproduction | Actual terminal state | Intended invariant III |
| --- | --- | --- |
| Select a 21-byte invalid `corrupt.wav` through real file input. Native decoder rejects with media error 4; no failure injection. | Source `file/error`, inactive session, audio unloaded/not-playing, one failed notification, no rejection. Engine still returns the failed element with Blob src and native `paused:false`; graph `ready:true`, source/output nodes retained, listeners un-aborted. URL is revoked by error callback, but media/graph are not released. No claim of audible invalid audio. | Unrecoverably failed activation relinquishes its media/listeners/graph; no retained failed active descriptor or ready graph. |
| Select a valid WAV; inject a single NotSupportedError at native createGain after native media source creation/ownership transfer. | Structured source/audio failure and one notification. Local candidate URL/src/listeners release succeeds, but engine still references that released element and native source node; graph is partial/not-ready. Error text says unsupported audio although fixture is valid. | Release the still-current installed/partial graph, retain meaningful failure and preserve other resource owners. |

Both cases reproduced **three times each on F.3**, and **three times each on isolated pre-correction `0717e6c`**, with six cleanup assertion failures per build and all six terminal settlement/Clear/recovery checks passing. Thus this is a **pre-existing adjacent/shared current-failure cleanup gap**, not evidence the six original resume contracts remain red or a regression introduced by F.2/F.3. The native decoder case establishes real production behavior; graph-allocation refusal is controlled branch evidence, not a measured naturally occurring browser failure rate. [Current](evidence/cleanup-current.json), [historical](evidence/cleanup-historical.json), [assertion log](evidence/cleanup.log).

**Exact source boundary:** `AudioEngine.attachSource():268–280` installs source/media before `buildGraph`. `loadFile():389–396` releases only the candidate and returns false on attach exception, leaving transferred engine references/partial nodes. `loadFile():409–417` returns false for hard decoder/NotSupportedError failure without unloading the installed graph. Manager `activateFile():486–495` commits a structured failure for returned false; only its thrown/rejected fallback at `470–481` performs unload. Early media error hook cannot clean up via manager `handleFilePlaybackError` because the File session has not committed yet. Later error on an already committed session follows a different teardown path.

**Why it blocks:** the F.4 contract explicitly requires all genuine current File activation failures to release locally owned resources, including native media setup/rejection. Green constructor/resume tests prove those paths, not complete failure cleanup. AUD-002 closure is withheld against this broader authorized terminal-outcome contract; its original startup/rejection correction remains valid evidence. This is a demonstrated failed assertion, not missing cross-browser evidence.

**Minimum correction recommendation, not implementation:** authorize a narrow owner-checked release of installed/partial failed File resources before controlled false settlement. Preserve local-only cleanup for stale candidates, winning graph/URL/live tracks, recorder tap ownership, exactly-once notification and recoverable loaded Play. Add regressions for current hard native decoder failure and post-transfer graph construction exception *before harness teardown*, plus retry/Clear/recording/retained-export controls. Prefer the engine's existing ownership/release seams; no new manager architecture or recorder policy is needed. Graph-allocation error messaging should retain its actual cause rather than blaming valid media.

## Native recording and distributions

Three new native recording cases pass:

1. Configured canvas + audio recording spans navigation, loaded removal, pending cancellation, current resume failure and recovery without native recorder stop. Capture reconnects; export is retained across a later transport error, a new recording replaces it, and active disposal releases recorder-owned render/audio tap resources while valid playback survives.
2. Actual native data/stop delivery, with only the application's onstop callback held, establishes finalizing. Next/Prev/row/removal/Clear cannot mutate Queue. A **naturally ending 2.5-second WAV** defers EOF; release finalizes a nonempty export and advances once to B. No synthetic ended event or fake recorder substitutes for this case.
3. Synthetic native Mic source recorded by real MediaRecorder: Stop and active disposal leave the upstream audio track live; File-mode source teardown ends it. Recorder-owned video tracks end. No real device/permission coverage is claimed.

Export probe confirms **VP9 video and Opus audio**, nonempty native packets, bytes and SHA-256. [Encoded-export evidence](evidence/native-export-probe.json). Configured 30 fps/audio/MIME policy is unchanged; no fake MediaRecorder is used.

Fresh **portable HTTP**, **hosted `/`**, and **hosted `/apps/auralprint/`** independently load/play WAVs, advance native time and remove A to playing B. Required linked metadata/assets, manifest icons and start URL fetch with status 200 at hosted paths. No unexpected page/console errors in these successful cases. The portable page's embedded JS/CSS has no missing dependency. Output hashes are [recorded](evidence/distribution.json), portable SHA-256 `a64bc33627928f9c1f9a1f82fa020ebfe4adb9418463831caa17d8531883f041`.

Automated **file:// is INCONCLUSIVE**: Chromium navigation reports `ERR_BLOCKED_BY_ADMINISTRATOR` before the app runs. No bypass was attempted; this is not Auralprint failure. Developer-confirmed successful desktop file use is preserved as human evidence. Firefox/WebKit binaries are absent; no downloads/installations were made. Physical audibility, real Mic/display grants, other browsers and long/heavy stress remain unexecuted, with no universal compatibility claim.

## Test quality and sensitivity

F.2/F.3 tests call production Queue/UI/manager/engine functions, use deterministic entered/deferred signals, distinct entry/media references and no-write/resource spies. Their mocks are appropriate for ownership but dispatch play events synchronously and ordinarily cannot reproduce native decoder readiness/error ordering. Manager stubs isolate settlement; they do not prove engine cleanup. Some test cleanup runs manager teardown afterward, which cannot substitute for observing resources at the failed terminal boundary. The new probes snapshot **before Clear/retry/page close**, then independently check recovery; diagnostic teardown does not conceal retention.

All **18/18** immutable F.2/F.3 mutation controls are re-executed in disposable copies and detected through actual assertion failures, with zero syntax/import/harness errors. Their sensitivity is meaningful within their specified seams, but no accepted control targets the hard-failure/partial-graph cleanup branches. The new failing opt-in contracts expose that gap without weakening or modifying default tests.

Browser instrumentation exports existing closure references and read-only graph/recorder getters only in memory. Forwarding native element/URL/node/track/notification observers and state proxies expose transient operations. The two distribution modes remain unmodified artifacts with only passive element observation. Explicit faults: suspended native resume holds/rejects/skip, current native Play throw/rejection, one graph factory throw, synthetic native mediaDevices, and held recorder application onstop callback. Successful ordinary playback and real encoding validate the setup. Identity handles are observation-only WeakMap IDs, never authorization state. No production checkout instrumentation or new dependencies.

Preliminary runner limitations are preserved in [preliminary observations](evidence/preliminary-observations.json): a ~48 ms recording produced no nonempty chunks and correctly finalized as an error while still advancing deferred EOF; the harness initially waited only for complete. The successful finalization probe waits for actual chunk data. A source-switch test initially clicked a still-disabled button immediately after disposal; the final test waits for actual UI re-enablement. Neither runner timing assumption was repaired in application code. Final independent run has **18 cases: 15 pass, two cleanup fail, one file-policy inconclusive, no infrastructure failure**.

## Validation and reproduction

Sequential `npm ci` (existing offline cache), `npm test`, `npm run build`, Python distribution verification and `git diff --check` all exit 0. Default suite **673 tests / 672 pass / zero fail / one established opt-in skip**. RC-02/03/04/05/06/19/20 remain green. Portable/hosted packaging passes. Default-suite success is reported separately from the deliberately red independent acceptance contracts.

```sh
source /workspace/auralprint-environment/activate.sh
npm ci --offline --cache /workspace/auralprint-environment/npm-cache
npm test
npm run build
python scripts/verify_distribution.py
git diff --check
node docs/audits/remediations/115m-i-f-aud001-aud002/f3/diagnostics/native.cjs --contracts --output /tmp/f4-existing-native.json
python docs/audits/remediations/115m-i-f-aud001-aud002/f2/diagnostics/negative-controls.py --output /tmp/f4-f2-controls.json
python docs/audits/remediations/115m-i-f-aud001-aud002/f3/diagnostics/negative-controls.py --output /tmp/f4-f3-controls.json
node docs/audits/remediations/115m-i-f-aud001-aud002/f4/diagnostics/integrated.cjs --output /tmp/f4-integrated.json --export /tmp/f4-export.webm
node docs/audits/remediations/115m-i-f-aud001-aud002/f4/diagnostics/cleanup.cjs --output /tmp/f4-cleanup.json
ffprobe -v error -count_packets -show_streams -show_format -of json /tmp/f4-export.webm
```

Existing native/negative runners exit 0. New integrated runner exits **1** for the two cleanup contract failures; file policy is separate/inconclusive. Cleanup runner exits **1** for the six repeated cleanup failures, despite successful settlement/recovery. Exit 2 or infrastructureFailure means a runner error, never acceptance. Write fresh output outside committed evidence. Historical comparison: extract `git archive 0717e6c` into a disposable directory, link existing node_modules, build with the same tooling, then run `cleanup.cjs --artifact <isolated dist/auralprint_0.1.15m.i.e.html> --output <fresh-json>`; no mutation of accepted checkout or evidence.

All **689 original tracked files**, including all **51 F.1/F.2/F.3 remediation files**, remain byte-identical. [Integrity](evidence/integrity.json). Application, tests, metadata, dependency/build/workflow files, canonical artifacts and historical audit are unchanged. Generated distributions and scratch encoded export are not committed. [Machine-readable validation](validation.json) distinguishes all execution outcomes and artifact hashes.

Final PR-head Linux/Windows CI is verified after publishing this separate evidence commit; actual run links/results are recorded in PR metadata and final handoff. This committed report makes no pre-execution claim about post-commit CI. Green evidence-only CI cannot override the red independent cleanup acceptance.

## Exact changed-file inventory and release recommendation

Only **19 new files** under `f4/`: `README.md`, `acceptance-matrix.md`, `validation.json`, `diagnostics/integrated.cjs`, `diagnostics/cleanup.cjs`; `evidence/integrity.json`, `evidence/existing-native-summary.json`, `evidence/f2-controls.json`, `evidence/f3-controls.json`, `evidence/integrated-results.json`, `evidence/cleanup-current.json`, `evidence/cleanup-historical.json`, `evidence/native-export-probe.json`, `evidence/preliminary-observations.json`, `evidence/command-results.json`, `evidence/default-suite.log`, `evidence/distribution.json`, `evidence/native.log`, `evidence/cleanup.log`.

**HOLD PR #46 in draft.** A separately authorized narrow cleanup correction and fresh acceptance are required before recommending the combined correction for human merge review. AUD-001 closure recommendation stands; AUD-002 closure is withheld. No repairs or automatic corrective phase follow this report.

Build 115N independently requires disposition of other AUD findings, accessibility, real-world hardware/browser acceptance, performance/resource policies and final release-document approval. Passing either correction would not authorize release or change Canon.

**115M.I.F / F.4 FAILED — CORRECTIVE WORK REQUIRED.**
