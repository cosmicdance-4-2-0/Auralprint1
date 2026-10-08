# 115M.I.B — RC-19 native recorder disposal

RC-19 is corrected and awaiting independent review. Version **v0.1.15m.i.b**;
preset schema **10**, unchanged. **Build 115N remains WITHHELD.**

## Verified baseline and scope

Accepted GitHub `main` and the clean initial checkout both resolved to
`7f33e0daa835b3131a1ce4f9e0d6e0c519029378`, version `v0.1.15m.i.a`.
`git ls-remote origin refs/heads/main` verified the remote head. PR #40 was
MERGED at `2026-10-08T12:27:35Z`, with that same merge commit. Branch:
`codex/115m-i-b-rc19`, created directly from the accepted SHA. No stale revision
or unrelated working changes were used or overwritten.

Read before production edits: `agents.md`, the original
[release audit](../../2026-10-06_214431_PDT-release-audit.md), its preserved
[native capture script](../../evidence/2026-10-06_214431_PDT/recording/native-capture.cjs)
and [results](../../evidence/2026-10-06_214431_PDT/recording/native-capture-results.json),
RecorderEngine's disposal/session release/native release/Stop/finalization/token
paths, AudioEngine's recorder tap and source attachment, and InputSourceManager's
source lifecycle. Historical audit evidence is unchanged.

This is a narrowly scoped resource lifecycle bug fix. Regression risks are native
callback timing, retained export ownership, and shared audio tracks. No CONFIG
values, persisted fields, schema migrations, dependencies, formats, UI, source
attachment design, or audio graph topology change. Cleanup stays bounded by the
existing capture resources. The RC-01–RC-18 remediation commits and regression
suites are present on the accepted ancestry; all remain in the full test suite.

## Original defect reproduced before production editing

The original native reproducer was run on the accepted baseline, adapting only
its two superseded RC-06 defect assertions to the already accepted export-retention
behavior. It retained the actual native MediaRecorder reference, waited 1.5 s
following public disposal, and demonstrated:

| Observation | Accepted baseline | Corrected live recording |
| --- | --- | --- |
| Native state before disposal | recording | recording |
| App phase after disposal | disabled | disabled |
| Native state after bounded observation | recording | inactive |
| Recorder-owned video track | ended | ended |
| Shared upstream audio track | live | live |
| Upstream audio stop calls | not instrumented in original adaptation | 0 |

See [original adaptation output](baseline/native-capture-results.json). The
focused regression suite also failed **9 of 17 assertions** against the baseline,
then passed all 17 with the correction; see [baseline assertions](baseline-focused.log).

A subsequent same-script comparison used a detached worktree at the exact
accepted commit. [Timestamped baseline](baseline-native-timed.json) observed native
`recording` at `2026-10-08T19:19:53.448Z` before disposal and still `recording`
at `2026-10-08T19:19:54.952Z`, 1503.7 ms after entering disposal. This confirms the
short-window lifecycle defect, **not indefinite activity or post-GC leak duration**.
The harness explicitly stops that retained native recorder after observation.

## Ownership graph

```text
InputSourceManager ──owns──> microphone / browser-tab source MediaStream tracks
        │ attaches borrowed source to
        v
AudioEngine ──owns──> processing, playback, analysis graph
        │ getRecorderTap().ensureStream()
        ├─ live: returns the upstream stream; releaseStream() preserves it
        └─ file: dedicated MediaStreamDestination; releaseStream() disconnects
                 only the recorder branch and stops its dedicated audio tracks
        │ borrowed audio track references
        v
RecorderEngine ──owns──> native MediaRecorder + session tokens + handlers
        ├─ recorder render capture stream and video tracks
        ├─ merged MediaStream wrapper (shared audio references, not ownership)
        ├─ recording interval, chunks, session bookkeeping
        └─ completed Blob and retained export URL
```

RecorderEngine never iterates the merged stream to stop tracks. It stops only its
render capture and delegates audio cleanup to the captured audio-owner descriptor.
The preexisting fallback that stopped audio tracks when `releaseStream()` threw
was directly unsafe for shared upstream tracks; it is removed. A throwing owner
callback produces a failed cleanup disposition without transferring ownership.
No audio tracks are cloned. AudioEngine and InputSourceManager production code
are unchanged.

## Disposal, ordinary Stop, and shutdown order

Ordinary `stop()` is the existing user finalization path: request native stop,
accept final data and `onstop`, assemble an export, then replace the retained URL
only after successful commit. `dispose()` is terminal abort and does not call
that public Stop operation or initiate export assembly.

Disposal performs this sequence:

1. Preserve the previous disposition on repeated disposal, without repeating cleanup.
2. Increment `sessionToken`, mark disposed, and disable initialization before native callbacks can run.
3. Request native `stop()` only if a retained recorder is not already inactive.
4. Inspect actual native state, recording a truthful shutdown failure if stop throws or inactivity is not established.
5. Invalidate again through existing session release; clear the recording interval.
6. Drop the native application reference and attempt each handler detachment independently.
7. Drop merged-stream glue; stop render tracks; invoke the audio owner's release callback.
8. Discard pending chunks/times/MIME/stop bookkeeping and completed Blob; revoke the retained export URL.
9. Clear tap dependencies and publish disabled status with zero transient/export metadata.

The native request precedes capture-track release. Chromium changed recorder
state to inactive before `dispose()` returned, while final data/stop events arrived
later. No native stop call was added to shared `releaseActiveSession()`, which
also runs after ordinary successful finalization and errors.

## Session fencing and lifecycle states

`ondataavailable`, `onstop`, and `onerror` retain their existing session-token
checks. They are invalidated **before** native stop; nulling handlers is additional
cleanup, not the stale-event defense. Recorder timer callbacks now also capture
the owning token, so an already queued old tick cannot update or clear a new
session's interval.

- Uninitialized/idle: safe disposal, no native request, no resource acquisition/export.
- Active recording: exactly one stop request, inactive native backend, discarded chunks, ended render track.
- Finalizing: native backend already inactive after ordinary Stop; disposal does not stop twice, and pending completion is discarded.
- Completed/error: dispose clears owned resources and any retained export without acquiring replacement streams or creating output.
- Repeated disposal: no double stop, tap release, URL revocation, or resource recreation.
- Explicit `init()` after disposal: existing initialization reopens a clean lifecycle; monotonically advancing tokens fence old events from the new recorder.

Tests retain and deliberately invoke each old handler after disposal, during a
new recording, and after the new export. They also invoke the old timer after
advancing the clock. Assertions inspect private retention through a temporary
instrumented copy of the unchanged production logic; there is no production test
API. No old callback changes state, retains chunks, creates a URL, stops a new
track, releases a new tap, or overwrites a new export.

## Stop exceptions and exceptional cleanup

A native stop exception returns `ok: false`, code **`dispose-stop-failed`**, phase
**`disabled`**. Its message names actual observed state: active `recording` means
shutdown is not confirmed; if a throwing implementation nevertheless became
inactive, that observed fact is stated while the failed operation remains explicit.
Maximum safe cleanup still runs, handlers are fenced, and the active application
interface/reference is released. There is no upstream-track fallback, retry timer,
or watchdog. Failure persists through support reads, blocked actions, and repeated
disposal until explicit initialization; it cannot become unconditional success.

If an individual handler setter throws, remaining handlers are attempted and
native/session/capture/timer/export cleanup still proceeds. Failure code is
**`dispose-cleanup-failed`**. A throwing audio-owner release receives the same
failed disposition; native stop failure takes precedence when both fail. Native
browser handler setters did not throw in validation; exceptional operations are
covered deterministically with the instrumented recorder/tap.

A browser that refuses shutdown can leave its encoding backend active even though
logical disposal is complete. This limitation is exposed explicitly rather than
claiming confirmed shutdown or stopping someone else's audio. Reinitialization
does not retry or recover that rejected old native operation.

## Resource and native browser evidence

The focused suite uses the production AudioEngine tap and InputSourceManager
activation paths with instrumented Web Audio nodes/tracks. Live disposal leaves
the upstream track live with zero stops, source attached, graph source connected,
and analysis ready. File disposal stops dedicated tap audio once through
AudioEngine, with playback unpaused/loaded, media element retained, and analysis
connections intact. Render stops, tap releases, timer creation/clear, private chunk
retention, native requests, and URL creation/revocation are independently observed.

[Native Chromium evidence](native-disposal.json), Chromium **151.0.7922.173**:

| Scenario | Native state at disposal entry | State on return / after 1.5 s | Stop calls | Native tail events after entry | New ordinary export |
| --- | --- | --- | --- | --- | --- |
| Live active | recording | inactive / inactive | 1 | data + stop at +6.0 ms | 22,711 bytes |
| Live finalizing | inactive | inactive / inactive | 1, from ordinary Stop | data + stop at +1.8 ms | 21,749 bytes |
| File active | recording | inactive / inactive | 1 | data + stop at +2.7 ms | 21,894 bytes |

The report retains actual UTC/performance timestamps, stream-track states, native
observer events, canonical status snapshots, and source/playback observations.
All three aborts created zero recorder export URLs; late native events left the
snapshot unchanged. Live source audio survived with zero stops; file playback
continued and dedicated tap audio ended. Explicit init/new Start worked; old
callbacks could not affect that session, and new ordinary Stop produced a nonempty
export, revoked exactly once on its eventual disposal. No page errors occurred.

Native live acquisition uses generated oscillator audio in real MediaStreams
through the **production source manager and AudioEngine graph**. This establishes
ownership behavior without requiring device permissions. It does not validate
physical microphone/tab permission prompts or every browser implementation.

The existing [standalone export validation](native-export.json) ran against the
**unmodified** built HTML. UI Start → Stop → Complete → Download succeeded;
first export was 64,984 bytes, failed new capture retained that exact accessible
export, successful replacement was 108,074 bytes, and the previous URL was revoked
exactly once. Download metadata and fetchable Blob were checked; disk download
was intercepted by the existing harness. There were no page errors. No private
bundle API was exposed to call dispose from that standalone; public disposal itself
was tested through the unmodified source module with native Chromium.

The existing [live-source validation](native-live-source.json) passed all six
mic↔stream cancellation/error/normal ownership scenarios with no page errors.
Both preexisting optional browser scripts are preserved unchanged.

## Focused tests and mutations

[Focused recording/export/source regressions](focused-regressions.log): **47 passed**,
including **17 dedicated RC-19 tests**. The fake tracks native inactive/recording
states, stop attempts, retained handlers, queued/manual and synchronous event
delivery, configurable native stop failure, and exceptional handler cleanup.
All requested Start/Stop/Error/Dispose/late event/Init/Complete interleavings are
covered with deterministic assertions.

[Mutation results](mutations.json): **10/10 killed by ERR_ASSERTION**, with no
syntax/import failures counted. Each `mutation-*.log` preserves failing assertions.

1. Exact accepted-baseline disposal implementation.
2. Omitted native stop request.
3. Accepted stale event callbacks.
4. Native double stop during finalizing.
5. Stopping shared upstream tracks.
6. Unwanted export creation during disposal.
7. Session-token reuse on reinitialization.
8. Stop failure reported as success.
9. Accepted queued old timer tick.
10. Upstream track stopping after owner cleanup failure.

Run optional mutations from repository root:
`python3 docs/audits/remediations/115m-i-b-rc19/mutation-check.py <scratch-output-dir>`.
The script restores production source even on failure.

## Full validation and hosted CI

Sequential local validation completed:

- [npm ci](npm-ci.log): passed with a workspace cache; the first attempt could not write the default home cache, then succeeded with `--cache /workspace/work/rc19/npm-cache`.
- [npm test](full-test.log): **590 passed, 0 failed, 1 existing opt-in million-retention stress skip** (591 registered).
- [Optional million-retention stress](million-stress.log): enabled separately with `AP_MILLION_STRESS=1`, **1 passed**, including its 1,048,576-particle boundary.
- [npm run build](build.log): passed.
- `git diff --check`: passed.
- [Artifact verification](artifact.json): `auralprint_0.1.15m.i.b.html`, 400,289 bytes, correct version/schema/native-shutdown code; generated output and dependencies remain ignored/untracked.

[PR #41](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/41) remains open and
unmerged. Implementation commit: `1d160c612653701f012fff2d93dd0ab5a0a36301`.
[Hosted CI run 37831725322](https://github.com/cosmicdance-4-2-0/Auralprint1/actions/runs/37831725322)
completed **SUCCESS**, with **Ubuntu and Windows both PASS** on that exact commit.
Both jobs passed locked installation, tests, build, versioned artifact/untracked
output verification, and whitespace checks. See [hosted job/step results](ci-implementation.json).
This directly related evidence follow-up changes only this report, CI results,
and the inventory. Its final commit checks are also verified before handoff; no
production or test code changes follow the validated implementation.

Optional native command (external Playwright/Chromium required, no added dependency):

```sh
RC19_PLAYWRIGHT_MODULE=/path/to/playwright \
RC19_CHROMIUM_PATH=/path/to/chromium \
RC19_REPORT=/path/to/report.json \
node scripts/validate-recorder-disposal.cjs
```

For the same-script baseline comparison, additionally set `RC19_EXPECT_BASELINE=1`
and `RC19_REPO_ROOT` to a clean accepted-baseline checkout. All observations use a
bounded window; native fatal/stop failures are injected in unit tests rather than
asserting that real Chromium naturally refused shutdown.

## Exact changed-file inventory and remaining limits

Production behavior: **`src/js/recording/recorder-engine.js` only**.
Production version banner: `src/js/core/constants.js`.
Other changes: `version`, the two aligned version assertions in
`tests/targeted-audit.test.js`, `tests/rc19-recorder-disposal.test.js`, optional
`scripts/validate-recorder-disposal.cjs`, narrow recorder ownership contract in
`agents.md`, and the evidence files listed in [changed-files.txt](changed-files.txt).
There are no dependency/lockfile, generated artifact, root README, ROADMAP,
historical audit, or RC-01–RC-18 regression deletions/modifications beyond version
assertions.

RC-19 still needs independent review. RC-20 absent packaging assets, RC-21 band
picker help, RC-22 Remove-confirmation naming, and the later documentation
correctness pass remain outside this correction. No merge, tag, release, or
Build 115N promotion is performed.
