# AUD-001 corrective handoff

Accepted main: `0bbe5172cb4f1ec863bd00eb9e4e32c4e15f744f` (PR #74,
`v0.1.16d`, schema 12). Branch: `codex/aud001-live-input-readiness`.
Implementation: `9f90fcf2f1e505b9f7730fd1aca18981c42d2cb0`.
Reproduction-only commit: `93008ab` (its application code is accepted main).
The PR head also contains this handoff/evidence commit. No merge or release approval.

## Executable defect and correction

On accepted main, `activateMic()` / `activateStream()` admit audio-track membership,
then await `AudioEngine.attachMediaStreamSource()`, which may await context resume.
Only afterward does `registerFutureStreamSession()` install end listeners and
unconditionally commit active state. Stopping a track does not remove it from
`getAudioTracks()`. Earlier termination therefore escapes both checks and listeners;
the UI's valid duplicate-activation guard then prevents an intentional retry.

Before implementation, the two new real-engine Node resume tests failed with
`sessionActive === true` (13 existing ownership tests passed). Native Chromium
reproduced dead input and capture count **1 after another same-button click** in
12 cases: Mic/Stream × capture/registration boundaries × source/portable/hosted.
The delivered harness repeated those failures against a clean accepted-main control.

`InputSourceManager` now uses one session object for acquired pending and committed
resources. It installs lifecycle listeners before awaiting graph setup, checks the
Web Audio ID-selected track's `readyState` and stream activity at admission, uses
the existing engine `isCurrent` guard for readiness plus ownership, and reconciles
again before synchronous commitment. Unselected ended tracks do not veto admission.
Once committed, Stream retains its accepted all-audio-tracks end policy and ignores
video-only termination. Stream channel metadata uses the same selection helper.

End callbacks capture the originating session. Only that current session may
release the engine graph or write recovery state. Cleanup and feedback occur in
one synchronous transition; the exported teardown/end methods remain asynchronous.
Track release is idempotent, listeners are removed before tracks stop, and stale
continuations release only their own session resources. Entering another live
activation also tears down synchronously, preserving latest intent before capture.
Attachment throws keep the existing `*-attach-failed` messages; false attachment
keeps its cancellation result and now clears pending resources/state.

Successful capture followed by termination retains **granted** permission and the
existing `mic-ended` / `stream-ended` idle feedback. No automatic capture occurs.
The existing UI requesting/active duplicate guards and recording locks remain.
AudioEngine, UI, RecorderEngine, transport production code, CONFIG and presets are
unchanged. The original audit and Build 115 artifact/fixtures are unchanged.
AUD-002–AUD-005 are outside this disposition.

## Validation

Linux; Node 24.19.0, npm 11.9.0, Python 3.12.14; Chromium 151.0.7922.173.
Locked offline installation, build, distribution verification and whitespace checks
passed. [Validation summary](validation.json) records counts and protected hashes;
[baseline native cases](baseline-native.jsonl) and [corrected native cases](fixed-native.jsonl)
retain actual source state, track readiness, graph disconnects, capture counts,
recorder upstream identity, status and successor snapshots.

- **91 focused Node tests passed.** Deferred promises cover termination before
  capture, before/during attachment, around commitment, inactive streams, direct
  retry, selected/unselected multi-track readiness, video continuation, partial
  graph failures, teardown, both live race directions and File successors.
  Proxied state asserts **zero writes** from obsolete callbacks/continuations;
  track stop counts, listener removal, graph/tap identity and idempotence are checked.
- **Full suite: 1,200 passed, one existing opt-in retention skip, zero failures.**
- **72 native cases passed over local HTTP:** 24 each in source, portable and
  hosted distributions. Real generated tracks and explicit promise/event ordering
  cover capture/resume/registration/end/inactive boundaries, requesting/active
  duplicate guards, same-button retries, old completion/rejection after newer
  live/File/Clear, and real audio reaching analysis. Six actual recordings verify
  source-switch locks, Recorder Stop preserving live tracks, recoverable source
  end during recording, manual finalization and subsequent retry. No page/console
  errors, unhandled rejections or failed application resources were observed.
- Existing native live ownership (6), File cancellation (9), transport ownership
  (10), finalizing EOF (8), recorder disposal (3), recording export and Stream
  stereo/channel checks passed. RC-04's first run had a transient filename-snapshot
  mismatch; accepted-main control and current rerun both passed all 10 cases.
  RC-02's original numeric-array drop transfer outlasted its 20-second file during
  append; transferring identical bytes as base64 removes that harness timing issue
  without changing application behavior. All 9 cases then passed.

Run the focused tests and native harness after building:

```sh
node --test tests/live-input-readiness.test.js tests/input-source-manager.test.js tests/live-source-ownership.test.js
npm test -- --test-concurrency=2
npm run build
python3 scripts/verify_distribution.py
AP_PLAYWRIGHT_MODULE=/path/to/playwright AP_CHROMIUM_PATH=/path/to/chromium AP_REPORT=/tmp/aud001.json node scripts/validate-aud001.cjs
```

For the original failure, create/build an isolated accepted-main checkout and run
the corrective branch's harness with `AP_REPO_ROOT=/path/to/control` and
`AP_EXPECT_BASELINE=1`. For the failing Node regression, run
`tests/live-source-ownership.test.js` at reproduction-only commit `93008ab`.
Browser tooling remains external; no dependency, delay or polling was added to
the application. The native harness exposes module references only in HTTP
responses; generated distribution files remain unedited.

## Owner check and limitations

1. In a supported browser, select Mic, confirm analysis, and stop/disconnect the
   input. Confirm reconnect feedback; select Mic again directly.
2. Share a tab with audio using Stream, end sharing, then select Stream again.
   Confirm a fresh picker and live analysis. Check video ending independently
   where the capture provider permits it.
3. Make a short recording. Confirm source switching is locked; Stop the recording
   and confirm the input still works. End live input during another recording,
   finalize it manually, then reconnect and inspect both exports.
4. Switch between File/Mic/Stream, Clear a pending request and try rapid alternate
   selections. Confirm the final selection survives, File queue/transport remains
   coherent, and no microphone monitoring is introduced.

These browser streams are synthetic native `MediaStreamTrack` objects generated
by Web Audio/canvas. They do **not** validate physical microphones, real display
sharing, OS permissions or capture-provider behavior. Firefox/WebKit, physical
devices, direct `file://`, long recordings and exported A/V fidelity remain
unqualified. Hosted distribution validation used local HTTP, not deployment.
Owner acceptance remains required before Build 116 release acceptance.
