# 115M.I.F / F.3 — AUD-002 failure settlement

The six deferred AUD-002 correctness contracts now pass against the corrected development build. Current File startup fails observably; stale operations settle silently; a recoverable Play failure retains its loaded File. AUD-001 ownership remains protected. Neither finding is closed: independent F.4 acceptance remains pending. PR [#46](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/46) remains draft, Build **115N WITHHELD**, with no merge, release, tag or automatic F.4 work.

## Verified starting point

- Accepted F.2/local/PR head: `0c188a06673b94ce124579ecd638ff890b161d32`.
- Accepted F.1 ancestor: `5a65a0a6cc100849088a2bee2b0647949ddfbb76`.
- Main remained `0717e6c82ea5e4a9c08a2650e00730f4d698b3b5`; no reconciliation or rebase needed.
- Existing branch: `codex/115m-i-f-aud001-aud002`; starting tree/worktree matched F.2 and was clean. PR was open, draft and unmerged.
- Version stays **`v0.1.15m.i.f`**, schema **10**; neither metadata file nor its assertions changed.

Before editing, the unchanged F.2 runner was executed against a freshly built F.2 artifact. It independently reproduced **exactly six red contracts**, with all 22 ownership contracts green, 28 scenarios, exit 1 and no infrastructure failure. [Baseline summary and failure snapshots](evidence/f2-baseline-summary.json), [actual log](evidence/f2-baseline-native.log). The artifact hash matches accepted F.2 evidence. No historical result file was regenerated.

All **31 F.1/F.2 evidence files** remain byte-identical to the accepted F.2 tree. [Original hash inventory](evidence/prior-evidence-integrity.json). The original Queue entry API, UI request/entry/intent authority, live activation sequence and graph attachment guard are unchanged.

## Implementation and error ownership

Only `audio-engine.js`, `input-source-manager.js` and `ui.js` change in production. No new generation, source representation, lifecycle manager or public interface is introduced.

| Boundary | Settlement and owner |
| --- | --- |
| Engine `loadFile()` context creation / initial resume | Check current File authorization before starting. Catch constructor/resume failures before candidate allocation. A current attempt resets loaded/playing/filename, publishes meaningful transport error and returns false. An obsolete attempt returns false without audio writes or resource creation. |
| Manager `activateFile()` engine await | Existing current false result becomes the established structured `file-activation-failed` result, source `error`, nonempty code/message, no active session and reset stream metadata. An unexpected engine throw/rejection is also guarded: release current engine resources through `unload()`, normalize failed audio projection, then use that same source failure path. A stale rejection returns false before cleanup or writes. |
| Engine `playPause()` context await | Capture installed element. Catch checks element identity before reading it or projecting error. Current failure retains loaded filename, element, source session and graph; `isPlaying` reflects the element's actual paused flag, and transport error is observable. Stale success/rejection is inert. |
| Engine native Play | The existing captured-element guard remains. A narrow try/await/catch also settles a synchronous native Play throw, without adding a microtask before invoking Play. Current media error remains recoverable; superseded work returns before reads/writes. |
| UI shared File helper / callers | Existing `loadAndPlay()` awaits the now-settled manager result, verifies request and entry, and emits exactly one current failure notification/toast. Picker/drop/Next/Prev and fire-and-forget row/removal/shortcut/EOF calls all use this same path. No per-handler failure publishers or blanket catches were added. |
| UI Play button | Capture element before awaiting the engine. A narrow fallback catches an unexpected rejected Play API call and projects a current recoverable transport error. Current-element checks precede fallback writes and post-await toast. An obsolete callback cannot display a newer owner's error as its own. Play failure does not emit `track-change-failed`. |

`describePlaybackError()` keeps its existing media error vocabulary and accepts a private context-failure option. Context errors say `Playback failed: AudioContext could not start: <cause>`, preserving the actual message/name. This avoids describing an AudioContext `NotSupportedError` as an unreadable WAV. Current initial failure has one media-level projection, one source-manager terminal status and one UI/recorder notification. Manager/UI fallback projections run only when their awaited lower-level API unexpectedly rejects, not for already-settled outcomes.

The manager fallback is demonstrated by a synchronous native load-time Play throw after graph installation: its guarded `unload()` releases that current candidate/listeners/URL and the existing structured path settles the source. It is not a generic cleanup framework. Genuine failures are not converted into success, and cancellation does not call `commitFailure()` or invent a recorder failure.

## Recovery and resource contracts

Constructor failure leaves no cached context/candidate; retry constructs normally. Resume failure retains the cached suspended context; retry reuses it. A failed loaded-File Play retains media/session/graph, and a later valid Play clears transport error under the existing successful playback behavior. Selected File retry, different File selection, Clear and live-source switching were exercised. Retry after File replacement acts only on the replacement.

F.2's candidate abort/release, URL ownership, media callback guards, declined attachment outcome and guard before destructive graph replacement remain intact. Startup failure allocates no new media or Blob URL. Stale initial rejection creates/releases nothing; stale Play rejection neither reads the old paused flag nor plays/pauses/unloads either element. Live winners retain their tracks. Native and deterministic tests preserve winner errors as well as loaded/playing state.

RecorderEngine/export implementation is untouched. A real completed retained export survives a failed AudioContext File activation and the established start/failed notifications; its URL/blob/filename/size remain valid. Deferred EOF/recording-finalization locks and existing RC-02/03/04/05/06/19 suites remain green.

### Closed-context inspection

No `AudioContext.close()` call exists in application audio code. Closing the cached context is reachable only through the diagnostic's explicit external in-memory native API call. Native inspection verifies that Play reports unavailable audio while retaining a paused loaded element, and a subsequent File activation fails rather than claiming successful playback on a closed context. Both startup and Play detect `state === 'closed'` and report that reload is required. No global context recreation/lifecycle redesign was introduced. Recovery without reload is verified for the constructor/resume faults in scope; an externally closed context deliberately requires reload.

## Permanent regressions

**45 new default-suite tests**, added in the existing suites:

| File | New tests / assertions |
| --- | --- |
| `tests/file-activation-ownership.test.js` | **17**: current constructor/initial/second-resume failures and retries; initial resolve/reject supersession by Clear/File/Mic/Stream with zero write/resource changes; direct engine controlled outcomes; direct obsolete rejection containment; different File recovery; already-stale constructor never starts; closed-cache diagnosis. Existing second-attachment/callback/resource tests remain unchanged. |
| `tests/input-source-manager.test.js` | **6**: current thrown/rejected engine API becomes structured terminal failure and permits another File; stale rejected engine API after Clear/File/Mic/Stream makes no source/audio writes, unload or shared-track stop. |
| `tests/transport-ownership.test.js` | **7**: current Play-resume failure/retry retains media/session/graph; obsolete rejected resume after Clear/replacement/Mic/Stream makes no old/winner reads or writes; synchronous native Play throw; retry after replacement touches only replacement. Existing ordinary current resume/Play success and RC-04 cases remain green. |
| `tests/targeted-audit.test.js` | **14**: actual picker/drop/Next/Prev/row/N/P/EOF/Repeat One/removal-successor startup failures with selected-entry coherence, exactly one failure notification and retry; current/stale Play API boundary rejection containment; synchronous load-time Play throw with candidate release and structured UI failure. |
| `tests/recording-export.test.js` | **1**: real retained export remains owned/readable through failed File startup and real recorder transition observation. This relevant test addition is the only file beyond the user's four preferred test suites. |

Deferred promises identify actual resume/Play entry and completion. UI helper fixture signals failure/completion directly, including fire-and-forget paths; no arbitrary sleeps establish order. Tests compare actual elements, graphs/resources, source/session/audio/error fields, loser/winner calls and state write spies. Live Play unit tests use the existing future-session registration seam with a controlled stream; expanded native cases independently use actual source-switch buttons and acquisition flow.

## Native verification

Chromium **151.0.7922.173**, headless, native Web Audio/HTMLMediaElement, muted output. Valid deterministic stereo PCM WAVs (30 s, 44.1 kHz, 440/554/659 Hz) are generated locally. No external service or real device permission is used.

- The original **28 scenarios / 28 desired assertions** passed, including all six previously red contracts. Their names/assertions were preserved; no expectation was weakened. [Original-contract summary](evidence/original-contracts-summary.json).
- Expanded verification passed **54/54 assertions across 45 scenarios**, exit 0, no infrastructure failure and no unhandled browser rejection in tested failure/retry paths. [Full snapshots/results](evidence/native-results.json), [actual log](evidence/native.log).
- Previously green **22 F.2 contracts** remain green; the **six original F.3 contracts** are now green. The additional **26 assertions** cover actual drop/navigation/row/shortcut/EOF/repeat/removal failure/retry, stale initial/Play rejection after Mic/Stream, initial rejection after Clear, UI Play API fallback, and native closed-context diagnosis.
- Ordinary unmodified-artifact WAV playback advances media time with zero page errors. The final expanded run's artifact hash was matched to the final rebuilt portable artifact.

Browser fault control is explicit, not a claim of naturally occurring browser failure: localhost HTML interception and in-memory exports of existing module/helper/request references; native context subclass with constructor throw/resume hold/reject/skip; forwarding promise/recorder/URL/error observers; native Play completion hold; actual DOM click/drop/programmatic KeyboardEvent/ended-event dispatch; existing Repeat button; and synthetic mediaDevices returning native oscillator/destination streams. UI fallback cases explicitly replace the Play API with a controlled rejected promise after normal valid loading. Closed-context inspection explicitly calls native `close()`. Production source is never patched to expose diagnostics. The ordinary scenario uses an unmodified artifact. Promise holds/state predicates establish boundaries; one task turn drains error reporting, and advancing native time provides the success control.

One preliminary expanded run timed out because the diagnostic referenced nonexistent `#selRepeat`. This was a runner setup error, not a correctness failure; it was corrected to the actual `#btnRepeat` control. [Setup-failure record](evidence/native-setup-failure.json) preserves the distinction. It is not counted as a pass or acceptance result.

## Negative controls

All **9 F.3 semantic mutations** produced relevant assertion failures in disposable copies, with zero syntax/import/harness failures: constructor settlement bypass; initial resume settlement bypass; File error authorization removed; obsolete initial rejection escapes the engine; current Play error projection removed; obsolete Play rejection escapes; UI Play fallback containment bypass; duplicate File failure notification; and manager fallback error authorization removed. [Runner](diagnostics/negative-controls.py), [actual assertion logs/results](evidence/negative-controls.json).

All **9 accepted F.2 controls** were also re-executed successfully using the original immutable runner. [New F.3-era results](evidence/f2-negative-controls.json). Its original script/results remain untouched. Detection means the correctness assertions fail for a semantic defect; it does not mean broken application behavior is treated as correct. A direct-engine stale rejection test prevents the manager's second guard from masking a broken engine-level settlement contract.

## Commands and final validation

Toolchain: Node **24.19.0**, Python **3.12.14**, esbuild **0.25.12**, environment-supplied Playwright **1.62.1**. No dependency/lockfile/workflow/build-pipeline change. In this managed environment, source `/workspace/auralprint-environment/activate.sh`; the existing local npm cache avoids external installation. Native/subprocess commands used approved execution access.

Focused tests passed **286/286**. Final sequential validation:

```sh
npm ci --offline --cache /workspace/auralprint-environment/npm-cache
npm test
npm run build
python scripts/verify_distribution.py
git diff --check
```

All exit 0. Default suite: **673 tests, 672 passed, zero failed, one established opt-in particle-budget skip**. Portable and hosted distributions build and verify with the same I.F implementation/version and schema 10. Generated output remains ignored/untracked. [Machine-readable validation and artifact hashes](validation.json); logs under `evidence/`. Staged whitespace checking is also performed before committing.

Reproduce opt-in diagnostics after building; write fresh results outside immutable evidence:

```sh
node docs/audits/remediations/115m-i-f-aud001-aud002/f3/diagnostics/native.cjs --contracts --output /tmp/auralprint-f3-native.json
python docs/audits/remediations/115m-i-f-aud001-aud002/f3/diagnostics/negative-controls.py --output /tmp/auralprint-f3-controls.json
python docs/audits/remediations/115m-i-f-aud001-aud002/f2/diagnostics/negative-controls.py --output /tmp/auralprint-f2-controls-on-f3.json
```

Native default/`--contracts` mode exits 0 only when all desired assertions pass and no infrastructure failure occurs. Historical `--f2` compatibility remains, but full-contract mode is the F.3 acceptance check. Mutation runners exit 0 only if every mutation is detected by an assertion without infrastructure error. Do not overwrite committed results.

Final-head Linux/Windows CI is checked after publishing the separate F.3 commit, using PR #46's workflow/job records and their head SHA. Those post-commit results and run links are recorded in the PR and final handoff; this committed validation snapshot does not invent CI success before execution.

## Scope and F.4 gaps

F.3 stops at corrective implementation and targeted verification. Real-device Mic/display permissions, headful/physical audibility, other browsers, separately launched hosted native playback, active native recorder/export integration and independent F.4 release acceptance remain unexecuted. Synthetic native streams do not establish device coverage. An externally closed AudioContext requires reload, as explicitly diagnosed. No unresolved failure remains among the six accepted contracts or other executed correctness cases; these results do not close either audit finding or authorize Build 115N release.

## Exact changed-file inventory

Production: `src/js/audio/audio-engine.js`, `src/js/audio/input-source-manager.js`, `src/js/ui/ui.js`.

Tests: `tests/file-activation-ownership.test.js`, `tests/input-source-manager.test.js`, `tests/transport-ownership.test.js`, `tests/targeted-audit.test.js`, `tests/recording-export.test.js`.

New `f3/` files: `README.md`, `validation.json`, `diagnostics/native.cjs`, `diagnostics/negative-controls.py`; `evidence/prior-evidence-integrity.json`, `evidence/f2-baseline-summary.json`, `evidence/f2-baseline-native.log`, `evidence/original-contracts-summary.json`, `evidence/native-results.json`, `evidence/native.log`, `evidence/native-setup-failure.json`, `evidence/negative-controls.json`, `evidence/f2-negative-controls.json`, `evidence/negative-controls.log`, `evidence/f2-negative-controls.log`, `evidence/focused-tests.log`, `evidence/npm-ci.log`, `evidence/npm-test.log`, `evidence/build.log`, `evidence/distribution.log`.

**115M.I.F / F.3 COMPLETE — FAILURE SETTLEMENT READY FOR INDEPENDENT REVIEW.**
