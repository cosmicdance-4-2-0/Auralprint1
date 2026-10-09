# F.1 activation ownership trace

Baseline: `0717e6c82ea5e4a9c08a2650e00730f4d698b3b5`, tree
`36fef151366f02941498dbcb32e969527b06811f`, `v0.1.15m.i.e`, schema 10.
Line references below refer to this baseline. Implementations, rather than prior
audit prose or comments, determine the behavior described here.

## The identities are different

| Concept | Actual representation and authority |
| --- | --- |
| Queue cursor | Private integer `_cursor`; `-1` means no selection. It can select a pending File before any media exists. |
| Queue entry | Private fresh object `{file, name}` per `Queue.add()`. Objects survive reorder; removal splices the object out. No public entry handle/ID is returned. |
| File identity | The actual File reference. `current()`, `goTo()`, `remove()` return Files, not entries. Repeating the same File reference produces different entries. |
| Filename | `file.name`, copied into Queue entries, source label and audio filename. Two distinct Files can have the same name. It is display data. |
| Pending File request | Closure-local UI integer `activeLoadRequestId`; each `loadAndPlay()` increments it and passes the captured ID to manager/engine. It contains neither entry nor autoplay metadata. |
| Loaded media identity | New HTMLAudioElement per engine load; `mediaEl` is AudioEngine's current owner. A Blob URL identifies the File supplying the element. |
| Source session | Private manager `activeSession`; File sessions retain their media element and label. Live sessions additionally own streams/tracks/listener cleanup. Published `state.source` is a projection, not the session itself. |
| Live activation sequencing | Private manager `activationSeq`; tokens are created for Mic/Stream and tested around permission/attachment awaits. File activation does not create/check this token. |
| Requested autoplay | Normalized `opts.autoPlay` / `options.autoPlay` / engine-local `autoPlay`, passed down the pending call chain. Default true. No public Queue or state getter exposes it. |
| Actual playing | `state.audio.isPlaying`, media play/pause/ended events, and `mediaEl.paused`. These can disagree transiently or after stale work. Playing is not proof the activation has committed. |

Native evidence assigns WeakMap IDs solely for observation. These IDs are not
production state, cancellation tokens, or a proposed replacement authority.

## User action and selection

`queue.js:10–125` owns `_items` and `_cursor`. `add()` returns an index; it does
not select. `setCursor`, `goTo`, `next`, `prev` select synchronously. `remove()`
splices first, decrements a cursor following the removed item, or retains/clamps
the removed cursor to its successor/last survivor; final removal sets `-1`.
`clear()` resets the array and cursor. `snapshot()` projects index/name/active,
excluding File references and entry identity. `shuffle()` internally preserves
the entry object, showing that entry identity already exists privately.

`ui.js:1407–1419` enqueues an entire picker/drop batch synchronously, then selects
the first item and starts `loadAndPlay()` if Queue was empty. Subsequent batches
append without a new activation. This ordering is RC-02 protection against a
late continuation repopulating a cleared Queue. Row selection (`1475–1482`),
Next/Prev (`1676–1705`), shortcuts (`1813–1832`), and repeat/EOF policy
(`1422–1469`) move the cursor before invoking the shared load helper.

Removal (`1542–1565`) captures:

```js
const wasActive = hasActiveFileSource(state.source, state.audio)
  && Queue.currentIndex === item.index;
const wasPlaying = state.audio.isPlaying;
const nextFile = Queue.remove(item.index);
```

`hasActiveFileSource()` (`34–36`) requires File kind and `audio.isLoaded`, not
merely the Queue selection or source `requesting`. With pending initial resume,
it returns false. With B remaining, neither `loadAndPlay(nextFile)` nor empty
reset runs. The cursor now selects B, but A's request ID remains current. This is
the exact AUD-001 missed cancellation/selection boundary. It is also reproduced
after native `play()` has started but before `isLoaded` commitment.

Loaded removal does call the helper with `{autoPlay: wasPlaying}`. Final removal
and Clear call `resetEmptyFileWorkflowState()` (`1247–1255`), which invalidates
UI ownership *before* Queue clear, manager teardown and audio/visual reset.
Pending initial-resume final removal and Clear were verified to stay idle.

The loaded predicate can also be true for a pending replacement: manager teardown
unloads A's element but engine `unload()` resets only `isPlaying`, leaving old
`isLoaded`/filename metadata. Starting B with autoplay true, holding its resume,
then removing B selects/loads C with `autoPlay:false`. Cancellation does occur
through the new C request, but requested intent is lost because actual playing
was reset by A's teardown. Native evidence distinguishes this from the initial
unloaded case in which no successor request occurs at all.

## Request creation and source transfer

`loadAndPlay()` (`1361–1399`) clears deferred EOF, increments the UI request ID,
clears transport error, sends recorder `track-change-start` with ID/filename,
and resets visual/scrubber state synchronously. It then awaits
`InputSourceManager.activateFile(file, {requestId, autoPlay})`.

After fulfillment it checks the captured request ID before failure/success
notifications, toast, waveform decode, preference synchronization or Queue
refresh. Rejection skips this whole continuation: there is no catch/finally.

`invalidatePendingTrackLoads()` (`1280–1283`) clears deferred EOF and increments
the same existing UI authority. Clear/final removal and UI live-mode switches
invoke it. A new File request increments it directly. Removing a pending selected
entry while survivors remain does neither.

`InputSourceManager.activateFile()` (`439–488`) optionally awaits
`teardownActiveSource()` before publishing a File `requesting` projection,
clearing source error and stream metadata. Teardown's body is synchronous even
though its API is async: it invalidates live sequencing, detaches the session,
stops manager-owned live tracks, calls engine unload, then resets source to idle
(`413–437`). The await yields; File activation does not recheck its request ID
after this teardown await and before publishing `requesting`/starting engine work.
No executed scenario here proves that particular pre-engine interleaving is
harmful; it is an identified gap to test before extending cancellation handling.

Manager awaits `audioEngine.loadFile()` without a catch. On fulfillment it tests
the UI request guard (`278–284`, `465`); stale returns false, current false becomes
`file-activation-failed`, current true commits `activeSession` and source active.
Live tokens do not automatically cancel a File call. UI File→live switches work
at the initial-resume boundary because they explicitly invalidate the UI ID.

## Engine awaits, resources and commitment

| Boundary | Before await | After fulfilled await | Rejection behavior |
| --- | --- | --- | --- |
| `loadFile`, context startup (`301–304`) | Normalize autoplay and capture UI guard; `ensureContext()` creates/caches context and informs/rebuilds BandBank. No new media/URL yet. | Check UI ID before allocating media. | Constructor throw or resume reject escapes the engine and manager; source remains requesting. |
| `attachSource`, second context resume (`257–279`) | File element, AbortController, URL, listeners already exist. Context is ensured again. | Optional `options.isCurrent` guard, then teardown old owner, create source node, install descriptor/element/listeners/URL, build graph. File caller supplies **no guard**; live caller supplies its live token guard. | File's enclosing attach catch releases its candidate and writes global audio failure **without testing UI ID**. Live manager catch checks its token and releases only its acquired stream. |
| `loadFile`, media play (`371–389`) | Graph and current media already assigned; autoplay can invoke native play and emit play events while source is requesting and audio not loaded. | Check UI ID **and** element equality; stale releases candidate. Otherwise commit loaded/filename/error/actual playing. | `media.play()` rejection is converted to local `playErr`. Unsupported/media error makes false; other playback errors can keep loaded true with transport error. |
| `playPause`, resume (`392–414`) | Capture current target; ensure context. Existing media/session remain. | Check target equality before operating; run play/pause. | Resume reject escapes before target check or error conversion, including after Clear/replacement. |
| `playPause`, media play (`401–409`) | Native target play requested. | Check element equality; current error becomes transport error and not-playing. | Converted into local error, then fenced by element identity. RC-04 already protects this boundary. |

There is no explicit loadeddata/readiness await in current `loadFile()`. Native
autoplay readiness is awaited through `HTMLMediaElement.play()`. Paused loading
can commit a graph/file before decoder readiness. The older audit's generalized
description of a readiness wait is secondary evidence, not this implementation.

`attachSource()` is the destructive graph-transfer point. It tears down the
previous graph/element before installing the candidate. `loadFile()`'s late guard
cannot undo destruction of a winner that happened inside attachment, nor prevent
old playback from being invoked first. The second-resume diagnostic deliberately
leaves the first resume suspended (`skip`) so this real await is controlled;
ordinary browser resume normally makes the second await unnecessary. It models
intervening suspension, not its frequency or a naturally observed race.

`ensureContext()` (`66–72`) caches context indefinitely; unload tears down media/
graph, not the context. Rejected initial resume therefore retains the suspended
context; constructor throw leaves the cached context null. Both recovered with
valid retries. Closed-context recovery was not induced or established.

## Callbacks and cleanup

Engine teardown (`136–167`) disconnects graph/tap connection, clears ownership
references, aborts installed element listeners, pauses/rewinds/detaches/reloads
old media and revokes its owned URL. It does not own live track shutdown.
`releaseMediaElement()` (`41–51`) releases a particular candidate; it is not
whole-engine teardown. Several paths may revoke an already revoked URL, which is
safe; the evidence records calls, not a browser allocator's retained memory.

Element callbacks (`316–350`) revoke URL at loadeddata/error; loadeddata clears
`mediaObjectUrl` only on equality. Error/play/pause/ended callbacks write global
audio projection before any request check. Error's manager notification has an
element equality check; play/pause/ended do not. Installed old listeners normally
disappear with abort on teardown, but a candidate pending attachment has not yet
transferred its AbortController to engine ownership. Local release does not abort
that candidate's controller. Source trace identifies this exposure; this phase
did not artificially dispatch candidate decoder/error/EOF events to prove it.

Manager `handleFilePlaybackError()` (`684–718`) checks its File session/element,
unloads owned media and commits a source failure. Its registered engine hook is
called only for the engine-current element. UI's `_onTrackEnded` captures File,
element, repeat mode and UI request ID; deferred finalizing EOF consumes once and
checks those identities (`1450–1469`). File identity alone still cannot distinguish
duplicate entries referencing the same File; future changes must preserve these
guards and consider entry identity without redesigning EOF.

Scrubber (`scrubber.js:70–116`) owns independent OfflineAudioContext decode and
its own existing decode token. `file.arrayBuffer()` and `decodeAudioData()` are
both fenced; reset invalidates waveform work. Waveform failure becomes unavailable
and does not own transport error. UI launches decode only after current activation
success. This token is not a File transport cancellation authority.

Recorder (`recorder-engine.js:971–1017`) observes start/complete/failed/unloaded;
it does not select Queue or own playback. The native diagnostic forwards all
recorded notifications to the real recorder, but does not start a recording.
AUD-001 emits complete for removed A. AUD-002 initial failure emits only start;
it skips the terminal failure notification. Active recording behavior is protected
by existing tests, not newly claimed native recording coverage in F.1.

## Reusable boundaries and missing information

Reuse UI `activeLoadRequestId` for File cancellation, live manager sequencing
for live ownership, engine element identity for Play, and engine's existing
attachment guard/release helpers. No production counter/token was added here.

F.2 needs the removal decision to refer to the authorized selected *entry/request*
even while unloaded, and to retrieve its requested autoplay. Private Queue entry
objects provide identity; public index/name/File alone do not in all tested cases.
Autoplay remains in the pending call chain but removal cannot read it. Preserving
intent needs no persisted preference or schema change; the existing successor
transition already accepts `autoPlay`. The exact ephemeral interface is deferred
to F.2 review.

F.3 needs ownership-aware settlement covering constructor, both resume boundaries,
media setup and Play, before any error projection or graph mutation. An obsolete
error must settle silently and cannot release winner resources. UI event containment
must include awaited picker/drop/Next/Prev/Play calls and fire-and-forget row,
removal, shortcut and EOF loads. This is a recommendation for these specific
paths, not authorization for generalized error-handling cleanup.
