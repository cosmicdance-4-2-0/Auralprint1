# Auralprint canonical-release precursor audit

Report timestamp: **2026-10-06 21:44:31 PDT — America/Los_Angeles** (2026-10-07 04:44:31 UTC). Evidence collection continued through final report validation.

Repository: [cosmicdance-4-2-0/Auralprint1](https://github.com/cosmicdance-4-2-0/Auralprint1). Audited revision: **v0.1.15m.h**, commit [`0cd79958d3f0156d52c4f68e36458298d6accd9b`](https://github.com/cosmicdance-4-2-0/Auralprint1/commit/0cd79958d3f0156d52c4f68e36458298d6accd9b), tree `c2db9fa7833b224a861f27ff7882bb7d815514ab`.

## Acceptance recommendation

**Withhold promotion to canonical release.** This audit confirms **22 findings: 1 P1, 14 P2, and 7 P3**. The P1 permits a tiny supported-schema URL preset to hang the application indefinitely. P2 findings include playback restarting after Clear, a cancelled input disabling a newer active input, recording output loss, discarded queue transitions, incorrect spectral coverage/energy, and ordinary keyboard interaction failures.

Resolve RC-01 and the user-facing P2 correctness findings before promotion. RC-15 independently re-verifies an already documented resource-governance deferral; it requires measured release limits and an explicit release disposition. P3 findings can be tracked separately with their reachability and impact recorded. Successful tests/builds do not invalidate these observations.

This PR adds the audit, reproduction programs, and evidence. Application source, preset schema, version metadata, canonical bundles, and release designation are unchanged. No fixes are claimed by this report.

## Workspace verification and audit method

The starting checkout was clean on local branch `work` at `c203cf64d23a58e8e83a71b881020d9799f37379`; the local `origin/main` reference was stale. GitHub's branch API established the current main commit independently. `git fetch origin main` followed by `git merge --ff-only origin/main` advanced the workspace to `0cd79958…`. `git rev-parse HEAD HEAD^{tree} origin/main` matched the remote commit/tree above, and both tracked and untracked status were clean before installation/build/audit deliverables. The fast-forward changed nine tracked files, including the current version and pre-RC source hardening. Earlier checkout contents were not used as the audited baseline.

The audit branch, `codex/release-audit-2026-10-06`, starts at that exact commit. Generated dependencies and build outputs are ignored by the repository. Scratch files stayed outside the checkout. All application-source conclusions and line citations in this report refer to the pinned audited commit.

Five independent reviews covered audio/transport, recording, presets/core state, analysis/rendering, and UI; a sixth focused browser review verified layout and keyboard behavior. The lead auditor verified the checkout, build/packaging, cross-domain conclusions, and independently reran the reproduction programs. README, ROADMAP, agents.md, canonical changelog, comments, historical executable bundles, and tests were read for context. Correctness claims come from implementation control flow and newly executed observations. Existing test expectations, documentation statements, and commit descriptions were not treated as proof.

Every listed finding has a concrete trigger, code cause, and recorded observation. Deterministic scheduling deliberately delays native promises/callback delivery around existing asynchronous seams; this demonstrates legal failing orderings, not their incidence on a particular user's hardware. Synthetic numerical buffers isolate analysis mapping. Instrumented Canvas calls measure operation counts, not GPU speed. Dangerous infinite loops run under isolated external timeouts.

Severity definitions:

| Priority | Meaning here |
| --- | --- |
| P1 | Accepted input can immobilize the application; fix before release. |
| P2 | Reachable incorrect behavior, data loss, lifecycle failure, analysis error, or substantial interaction/resource defect. |
| P3 | Narrow malformed-input inconsistency, lower-reachability API defect, or minor presentation/packaging defect. |

## Confirmed findings index

| ID | Priority | Finding | Evidence program |
| --- | --- | --- | --- |
| RC-01 | P1 | Unsafe numeric Orb IDs cause infinite allocation/import loops | presets/id-worker.mjs |
| RC-02 | P2 | Clear does not cancel pending loads or remaining batch ingestion | audio/browser-repros.cjs |
| RC-03 | P2 | Cancelled live attachment tears down a newer active graph | audio/browser-repros.cjs |
| RC-04 | P2 | Pending Play followed by Clear throws an unhandled exception | audio/browser-repros.cjs |
| RC-05 | P2 | EOF during recording finalization loses queue advance/repeat | recording/finalizing-eof.cjs |
| RC-06 | P2 | Failed new recording destroys the previous successful export | recording/native-capture.cjs |
| RC-07 | P2 | Accepted two-band presets leave most audible frequencies uncovered | presets/repro.mjs |
| RC-08 | P2 | Incorrect FFT coordinate scaling contaminates target energy | render_analysis/reproduce-render-analysis.mjs |
| RC-09 | P2 | Preset sanitation reassigns an explicitly supplied stable Orb identity | presets/repro.mjs |
| RC-10 | P2 | Orb-locked Ring lags the first Orb by one simulation frame | render_analysis/reproduce-render-analysis.mjs |
| RC-11 | P2 | Mixed bulk select cannot apply its already displayed option directly | ui/ui-control-repro.cjs |
| RC-12 | P2 | MIME-only ingestion silently rejects supported Ogg/empty-MIME audio | ui/ui-control-repro.cjs |
| RC-13 | P2 | Keyboard focus can edit covered panels; queue actions discard focus | ui/reproduce-ui-focus.cjs |
| RC-14 | P2 | Cancelled touch seek intercepts later unrelated touches | audio/browser-repros.cjs |
| RC-15 | P2 | Normalized presets permit uncontrolled aggregate work/frame bursts | render_analysis/reproduce-render-analysis.mjs |
| RC-16 | P3 | Malformed band references become concrete targets | presets/repro.mjs |
| RC-17 | P3 | Imported designed phase disagrees with slider and accessible value | ui/ui-control-repro.cjs |
| RC-18 | P3 | Space's advertised motion pause leaves free-run Ring moving | render_analysis/reproduce-render-analysis.mjs |
| RC-19 | P3 | Public dispose does not stop a native live-audio recorder | recording/native-capture.cjs |
| RC-20 | P3 | Single-file package references five absent root-relative resources | packaging.cjs |
| RC-21 | P3 | Band picker help contradicts actual channel-specific targeting | ui/ui-control-repro.cjs |
| RC-22 | P3 | Orb ID collision misnames the object in Remove confirmation | ui/ui-control-repro.cjs |

Evidence paths below are relative to [the evidence directory](evidence/2026-10-06_214431_PDT/README.md). Its programs assert the observed defective behavior. Exit 0 means the described defect was reproduced, not that intended behavior passed. A corrected build should invalidate those defect assertions; proper regression tests should assert the intended behavior instead.

## Detailed findings

### RC-01 — P1: supported URL input can hang boot/import/Add/Duplicate indefinitely

**Code:** [orb-collection.js:17–20](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/core/orb-collection.js#L17-L20); preset-codec.js:189–207; main.js:66.

`isValidOrbId()` accepts `ORB9007199254740992`. Converting its suffix to Number and incrementing it does not change the value: both `9007199254740992 + 1` and `suffix++` round to the same number. The used-ID loop therefore never terminates. A duplicate such ID reaches allocation during normal URL sanitation; one such ID imports successfully but hangs subsequent Add/Duplicate. The synchronous loop cannot be caught by URL error handling, and reloading with the same dangerous hash repeats the hang.

**Reproduction/result:** `id-worker.mjs control` imports `ORB42`, prints `new ID ORB43`, and exits 0. `timeout 2s node id-worker.mjs huge-add` imports the large ID and stalls at `before Add`; `huge-import` stalls at `before import`. Both end with external timeout exit **124**. The lead auditor independently repeated all three. The duplicate-import payload is `{schema:10,prefs:{orbs:[{id:"ORB9007199254740992"},{id:"ORB9007199254740992"}]}}`. Its complete normal transport is:

```text
#p=eyJzY2hlbWEiOjEwLCJwcmVmcyI6eyJvcmJzIjpbeyJpZCI6Ik9SQjkwMDcxOTkyNTQ3NDA5OTIifSx7ImlkIjoiT1JCOTAwNzE5OTI1NDc0MDk5MiJ9XX19
```

**Expected/remediation:** identity repair and collection mutations always terminate. Use exact suffix arithmetic or a safely bounded allocator that does not increment unsafe Number values; preserve accepted persistent identities. Add timeout-protected coverage for import with duplicate enormous suffixes and later collection operations. Evidence: `presets/id-*-output.txt` and `presets/id-worker.mjs`. The exact production URL path was executed in isolated Node processes; a hung native browser session was deliberately avoided.

### RC-02 — P2: Clear resurrects pending playback or remaining selected files

**Code:** [ui.js:1237–1267](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/ui/ui.js#L1237-L1267), :1345–1381, :1590–1600, :1652–1665, :1713–1722; input-source-manager.js:439–482; audio-engine.js:298–300, :369–375.

Clear/final removal reset the workflow without invalidating `activeLoadRequestId`. File activation commits after awaiting playback using that unchanged guard. The picker/drop loops also wait on the first load before enqueueing later files, without checking whether the batch was cancelled.

**Reproduction/result:** actual UI Clear during delayed native context resume initially gives queue 0/source idle/graph absent, then the cleared `tone.wav` becomes loaded and playing with queue still 0. Clear during delayed play completion restores a `file/error` workflow and false `Playback failed.` toast. Clearing a two-file selection during the first load causes the old loop to re-enqueue and play `second.wav`. All three cases assert the before/after states.

**Expected/remediation:** Clear must leave the empty idle workflow until another user action. Invalidate both transport and ingestion generations before Clear/final removal; guard successful and failed file commits, and synchronously enqueue a batch before its first await or cancel its remainder. Evidence: `audio/browser-repros.json`, cases `clear-during-context-resume`, `clear-during-play-promise`, and `multi-file-clear-repopulates-queue`.

### RC-03 — P2: cancelled live attachment disables a newer active source

**Code:** [audio-engine.js:257–275](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/audio/audio-engine.js#L257-L275); input-source-manager.js:546–567 and :630–652.

Engine attachment resumes the context asynchronously, then tears down the currently installed graph without checking source ownership. Manager cancellation is checked only after attachment, and stale cleanup calls global `unload()`.

**Reproduction/result:** Mic starts with a pending native resume; Stream completes first. Before the old Mic attachment resolves, Stream is active, its track is live, and sample.ready is true. Releasing Mic destroys the graph: Stream still says active with a live track, but sample.ready is false and UI says `Bands: n/a`. The stale Mic track ends. No page exception reveals the loss. The already-active Stream selector rejects a retry, so recovery requires another source switch/reload.

**Expected/remediation:** cancelled work releases only its own resources. Validate generation after resume and before any graph replacement; make cleanup ownership-scoped and guard stale error commits. Evidence: `audio/browser-repros.json`, `cancelled-mic-attach-destroys-new-stream-graph`. Acquisition is stubbed to return real generated MediaStreams; native devices/permission dialogs were not tested. This supplies deterministic evidence for the source-concurrency concern previously marked unconfirmed in the roadmap.

### RC-04 — P2: Play followed by Clear can throw an unhandled null dereference

**Code:** [audio-engine.js:388–402](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/audio/audio-engine.js#L388-L402); ui.js:1604–1607.

`playPause()` uses mutable global `mediaEl` after awaiting context resume/play. Clear tears it down and sets it to null; the UI awaits the method without catching the exception. Replacement can alternatively leave the continuation operating on another element.

**Reproduction/result:** a real loaded track is paused, UI Play is clicked, and UI Clear runs before native play promise delivery. Releasing it produces a Chromium pageerror, `Cannot read properties of null (reading 'paused')`. This is distinct from RC-02's load-commit cancellation because an already loaded transport action fails.

**Expected/remediation:** capture element plus transport generation at entry; revalidate after each await and apply results/errors only while still current. A superseded action should exit quietly. Evidence: `audio/browser-repros.json`, `playPause-unload-null-dereference` (the final harness exercises UI Play/Clear and asserts the native pageerror).

### RC-05 — P2: EOF during recording finalization permanently loses auto-advance/repeat

**Code:** [ui.js:1390–1410](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/ui/ui.js#L1390-L1410); recorder-engine.js:1037–1094.

The shared track-ended hook returns while recording is finalizing. Finalization never replays that EOF, so the next/repeat branches are lost rather than postponed.

**Reproduction/result:** built app plus native WAV playback/MediaRecorder. Control naturally advances first.wav to second.wav. When Stop Recording overlaps EOF, export successfully completes but queue remains cursor 0, first.wav is ended, and playback is stopped. One schedule delays native onstop delivery by 800 ms; another calls Stop from a capture-phase listener on the native EOF event before the app hook, with no delayed/fake recorder. Both assert native EOF occurred during finalizing. Repeat One/All share the skipped branch; next-track loss was directly exercised.

**Expected/remediation:** preserve a pending EOF associated with the current source/cursor and process it when finalization unlocks, or permit the safe automatic transition. Do not discard it. Evidence: `recording/finalizing-eof-results.json`, control `baseline` and failure modes `finalizing-at-eof` / `native-eof-order`. Test-only exposure of built app objects leaves product logic intact.

### RC-06 — P2: a failed new recording deletes the previous unsaved export

**Code:** [recorder-engine.js:1177–1185](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/recording/recorder-engine.js#L1177-L1185); :684–692, :1042–1073.

Start clears/revokes the last successful export before acquiring streams or starting a new encoder. A failure creates no replacement and cannot restore the previous Blob URL.

**Reproduction/result:** record and finalize genuine canvas/live audio, verify nonempty playable export metadata, then force the next canvas capture to throw NotSupportedError. Start returns `render-capture-unavailable`; lastExportUrl becomes null and fetching the previous native Blob URL throws TypeError. The only in-app copy of the completed output is lost. Failure injection changes acquisition only; export creation and deletion are production/native behavior.

**Expected/remediation:** keep the previous output until a valid replacement export is available. Snapshot its URL by value before committing replacement metadata: the current `previous = readStateRef()` aliases mutable state, so merely removing the earlier clear could make the later revocation branch read/revoke the replacement URL. Evidence: `recording/native-capture-results.json`, `result.failedRestart`.

### RC-07 — P2: valid two-band presets omit the interior audible spectrum

**Code:** [preset-codec.js:88–90](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/presets/preset-codec.js#L88-L90); band-bank.js:91–103.

Count 2 is accepted, but BandBank reserves a floor band and top band and creates zero interior bands. With default floor/ceiling, only `[0,20]` and `[22500,Infinity]` exist.

**Reproduction/result:** import schema 10/count 2, resolve, rebuild at 48 kHz, and feed the actual energy function a 4096-bin buffer with a strong 1 kHz bin. Both band energies are zero. Identical count-3 control includes `[20,22500]` and yields nonzero interior energy. This affects spectrum diagnostics/Ring/targeted Orbs while full-channel RMS can remain active. The imported count is displayed but not editable in the current UI.

**Expected/remediation:** every supported count covers the spectrum. Require at least three for this construction or define two-band coverage explicitly; enforce the same minimum at import and runtime. Evidence: `presets/repro-output.txt`, two-band and three-band observations.

### RC-08 — P2: Hz-to-FFT conversion uses the wrong coordinate scale

**Code:** [band-bank.js:131–155](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/audio/band-bank.js#L131-L155).

N frequency bins represent centers `k * sampleRate / fftSize`, equivalently `k * Nyquist / N`. The code instead scales frequencies by N−1. This shifts membership toward lower bins independently of the deliberately inclusive overlap policy.

**Reproduction/result:** 48 kHz/top band starts 22500 Hz. FFT 256 uses lower bin 119 instead of 120; a strong bin at 22312.5 Hz contributes 1/9 energy to that band. At default FFT 8192, bin 3839 represents 22494.140625 Hz and contributes 1/257. A reference changing only N−1 to N, retaining the identical floor/ceil/clamp/inclusive averaging, returns zero in both cases.

**Expected/remediation:** map using sampleRate/fftSize and clamp final indices. Validate aligned boundaries with known bins. Evidence: `render_analysis/render-analysis-results.json`, `evidence.fftCoordinate`. Synthetic bin vectors isolate the arithmetic; no native windowing/fidelity claim is made. This is separate from roadmap AUD-004 adjacent-bin overlap.

### RC-09 — P2: codec normalization steals a later explicit Orb identity

**Code:** [preset-codec.js:189–207](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/presets/preset-codec.js#L189-L207); preferences.js:77–79; orb-collection.js:24–35.

The codec normalizes each Orb before the collection reserves incoming identities. Positional fallback assigns ORB0 to an unidentified item, forcing the later explicit ORB0 to be renamed.

**Reproduction/result:** `{orbs:[{chanId:"R"},{id:"ORB0",chanId:"C"}]}` through the raw collection helper correctly yields Right/ORB1 and Center/ORB0. Through supported URL import it yields Right/ORB0 and Center/ORB1. Sharing serializes these reassigned identities. The explicit unique identity is silently attached to a different configuration.

**Expected/remediation:** reserve/repair original incoming IDs before assigning positional fallback IDs. Keep the collection allocator as the owner of identity repair. Evidence: `presets/repro-output.txt`, direct-collection versus URL results.

### RC-10 — P2: explicit Ring phase lock is one frame behind its Orb

**Code:** [visualizer-runtime.js:45–50](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/render/visualizer-runtime.js#L45-L50), :107–110, :137–139; orb.js:54–56.

Runtime updates in composition order: Ring copies the first Orb's angle, then the Orb advances. Rendering therefore uses different current phases despite the UI's explicit lock option.

**Reproduction/result:** actual Orb/Runtime adapters, allowed speed 3 rad/s, dt 1/30. First frame Orb 0.1/ring 0; second Orb 0.2/ring 0.1. Repeating discrepancy is **0.1 rad / 5.7296°**; varying deltas vary the offset.

**Expected/remediation:** resolve dependent phase after Orb simulation while preserving Ring-before-Orb drawing order. Keep dependency handling within lifecycle/runtime. Evidence: `render_analysis/render-analysis-results.json`, `evidence.ringLock`.

### RC-11 — P2: mixed bulk select requires an unintended intermediate edit

**Code:** [orb-editor.js:135–143](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/ui/orb-editor.js#L135-L143).

Mixed bulk controls retain a concrete selected option and only the readout says mixed. The select commits only on change; choosing its currently displayed option does not emit change.

**Reproduction/result:** one Orb fixed trace color, another dominantBand. Bulk select shows dominantBand/readout mixed. Native keyboard opening/End/Enter selects dominantBand but leaves `[fixed,dominantBand]`. Changing to fixed is a positive control that applies `[fixed,fixed]`. The current desired option cannot be directly applied to all.

**Expected/remediation:** show an actual mixed sentinel option or provide explicit Apply so every concrete choice can be committed once, without first changing all Orbs to another value. Evidence: `ui/ui-control-results.json`, `bulkMixedSelect`; persisted values are observed through the public share transport.

### RC-12 — P2: supported audio is silently discarded based only on MIME metadata

**Code:** [ui.js:1590](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/ui/ui.js#L1590), :1713; index.template.html:390.

Picker and drop filtering require `type.startsWith("audio/")`; MIME is metadata and can be empty or a valid non-audio-prefixed container type.

**Reproduction/result:** genuine Vorbis Ogg fixture, OggS header, native decode duration ~0.297 s: MIME application/ogg produces queue 0, disabled Play, and generic idle status; identical audio/ogg bytes load. A browser File/DataTransfer with valid WAV bytes and exact empty MIME is also discarded; identical audio/wav bytes load and decode ~1 s. These are supported media bytes, not an unsupported decoder failure.

**Expected/remediation:** admit supported audio containers and unknown-MIME candidates to the real load/error path, with visible rejection feedback. Keep picker/drop acceptance consistent. Evidence: `ui/tone.ogg` and `ui/ui-control-results.json`, `oggDecode`, `oggMime`, `emptyMime`.

### RC-13 — P2: keyboard users can edit covered fields and lose queue focus

**Code:** [workspace.js:124](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/ui/workspace.js#L124), :50–53, :58–60; ui.js:1442, :1499.

Panel stacking reacts to pointerdown only. Background panels remain tabbable. Queue refresh destroys all row DOM, and Queue Hide references a launcher absent from the template.

**Reproduction/result:** at 1280×800 and 375×667, open Analysis then Settings; Shift+Tab three times from Settings Hide focuses the covered Analysis ceiling input while Settings stays foreground. Hit testing returns the covering Settings row. ArrowDown changes ceiling 22500→22499; after committing, the public share payload confirms the invisible setting change. Screenshots show the overlap. Separately, Queue Hide leaves focus on BODY. Removing the second of three entries by keyboard also leaves BODY; next Tab returns to the first remaining row rather than a neighboring action.

**Expected/remediation:** bring a panel forward on focusin, preserve a sensible neighboring queue focus, and use the real Queue toggle/launcher for restoration. Evidence: `ui/ui-focus-evidence.json` plus desktop/mobile `background-focus-*.png`.

### RC-14 — P2: cancelled touch seek keeps intercepting unrelated gestures

**Code:** [scrubber.js:56–64](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/audio/scrubber.js#L56-L64), :274–291.

Touchstart sets dragging, but there is no touchcancel listener. Window touchmove continues seeking and preventDefault for later unrelated touches.

**Reproduction/result:** standard synthetic TouchEvents on real listeners/native 20 s WAV: start at 25% seeks to 5 s, then cancel. A later touchmove on Load seeks to 15 s and defaultPrevented is true. A cancelled interaction can thus change playback and intercept panel scrolling.

**Expected/remediation:** clear drag on touchcancel and relevant scrubber/source resets; any future pointer implementation must handle pointercancel/lost capture. Evidence: `audio/browser-repros.json`, `touchcancel-leaves-global-seek-drag-active`. Physical mobile gestures were not exercised.

### RC-15 — P2: accepted presets can remove effective resource/frame safeguards

**Code:** [preset-codec.js:175–207](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/presets/preset-codec.js#L175-L207); main.js:45; trail-system.js:18–50; renderer.js:66–88.

There is no aggregate Orb/particle/frame-work limit. Arbitrary positive finite maxDeltaTimeSec is accepted; the emission guard derives from that same imported value, so it scales with the requested burst rather than independently bounding it.

**Reproduction/result:** sanitizer accepts all 4096 valid uniquely identified Orbs. Simulating only 256 with ordinary default behavior for six seconds at 60 Hz/full energy leaves **61,440 particles**; production render emits 61,440 Canvas arc calls per frame and default emission entails ~245,760 overlap comparisons/frame before expiry work. A one-Orb valid preset with maxDeltaTimeSec 120/ttl 600, after six-second prehistory, executes **28,800 emit calls and 6,912,000 overlap comparisons** in one 120 s update.

**Expected/remediation:** define aggregate budgets and immutable safety caps; normalize input consistently and cap per-frame emissions independently of user timing preferences. Reduce repeated linear-history scanning. Evidence: `render_analysis/render-analysis-results.json`, `resources` / `longFrameBurst`. Counts come from production code; Node/instrumented-Canvas timings are not native browser/GPU measurements. No universal FPS or crash threshold is claimed.

This re-verifies existing roadmap **AUD-002**, deferred to Build 117. Its accepted deferral is recorded; this audit does not infer that it is safe for release. Obtain realistic constrained-device measurements and an explicit scope/resource disposition.

### RC-16 — P3: malformed band references silently become low-band targeting

**Code:** [preferences.js:31–44](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/core/preferences.js#L31-L44).

Number conversion precedes type validation: null/false/empty string/empty array become 0, true becomes 1. Importing `bandIds:[null,false,"",[],true]` succeeds as `[0,1]`. With full-channel energy 0.9 but those targets silent, actual Orb.step at 1000 px gives radius 10 instead of the empty-target control's 721. The low priority reflects malformed-input reachability, despite a substantial response change.

**Expected/remediation:** discard unsupported reference types. If compatibility requires numeric strings, accept that narrow format explicitly. Evidence: `presets/repro-output.txt`, malformed targets/actual radius consequence.

### RC-17 — P3: designed-phase persistence and control limits disagree

**Code:** [preferences.js:84–86](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/core/preferences.js#L84-L86); config.js:526; orb-editor.js:111–112.

Any finite phase is retained, while the slider is limited to 0–2π. An imported 4π remains persisted; UI/readout/aria-valuetext report 720°, but native range value clamps/steps to ~6.265732 rad (~359°). The displayed/accessibility value describes a different state from the actual control thumb.

**Expected/remediation:** deliberately normalize equivalent phase or make the control represent the supported persisted range; synchronize thumb, readout and accessibility text. Preserve any historical intended phase semantics. Evidence: `ui/ui-control-results.json`, `phase`.

### RC-18 — P3: Space's motion-pause instruction contradicts free-run Ring behavior

**Code:** [index.template.html:26](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/index.template.html#L26); ui.js:1752–1755; visualizer-runtime.js:45–55 and :78–79.

The canvas advertises Space pauses motion. The shortcut sets simPaused, which Orbs honor but free-run Ring phase ignores. With simPaused true/dt 1/30/speed 2, Orb phase stays fixed while Ring goes 1→1.0666667 rad.

**Expected/remediation:** either honor visual pause for Ring phase while analysis continues or explicitly narrow the product instruction to Orb motion. Existing tests expecting Ring continuation cannot establish consistency with the live instruction. Evidence: `render_analysis/render-analysis-results.json`, `pausedMotion`; UI label/wiring were inspected, and adapters were executed directly.

### RC-19 — P3: public disposal leaves the native live-audio recorder active

**Code:** [recorder-engine.js:512–518](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/recording/recorder-engine.js#L512-L518), :1358–1361.

Disposal drops recorder handlers/reference without stopping an active backend. Start live recording with audio, call dispose, and wait 1.5 s: app phase disabled/video ended, but native recorder state recording/audio live. Normal UI currently does not call this public API, so reachability is lower.

**Expected/remediation:** explicitly stop recorder-owned encoding before dropping it, with stale-event guards and upstream ownership preserved. Evidence: `recording/native-capture-results.json`, `afterDispose`. The probe retains a native reference for inspection; it proves backend stop was omitted and does not establish post-GC leak duration. The probe stops the recorder afterward.

### RC-20 — P3: packaged HTML references absent icons/manifest

**Code:** [index.template.html:11–21](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/index.template.html#L11-L21).

The build keeps root-relative references to favicon.ico, favicon-96x96.png, favicon.svg, apple-touch-icon.png and site.webmanifest. None exists in tracked source or output. Hosted Chromium observes icon requests returning 404; static/package inspection confirms all five are absent. A subdirectory deployment also points at the hosting root rather than its artifact location.

**Expected/remediation:** inline provided icons, package intentional resources appropriately, or remove unsupported declarations. This is metadata/network noise; core JS/CSS is bundled and audio boot/playback succeeded. Evidence: `packaging-results.json` and `browser-smoke.log`. Direct file URL navigation was blocked by the environment's browser policy; direct-file behavior remains unvalidated and that block is not an application finding.

### RC-21 — P3: band-picker help describes the wrong analysis channel

**Code:** [orb-band-picker.js:48](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/ui/orb-band-picker.js#L48); visualizer-runtime.js:8–34.

The live chooser says selected bands use the combined spectrum and Channel controls the waveform. Actual selection takes both waveform and target band energies from the chosen L/R/C channel. A shared target with L/R/C energies 0.9/0.1/0.5 returns those different selected responses in production selectOrbAnalysis; it does not always return combined 0.5.

**Expected/remediation:** describe channel-specific selected energy accurately so the operator can predict what a channel change does. Evidence: `ui/ui-control-results.json`, `bandPickerHelp`; actual UI text and production selection are both observed.

### RC-22 — P3: accepted Orb ID misidentifies the object in Remove confirmation

**Code:** [visualizers-panel.js:120](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/0cd79958d3f0156d52c4f68e36458298d6accd9b/src/js/ui/visualizers-panel.js#L120); orb-collection.js:6–7.

An Orb may have valid ID `spectral-ring`. Confirmation lookup searches the combined inventory by ID without restricting type and finds the singleton Ring first. The real Remove Orb action prompts `Remove Spectral Ring (spectral-ring)? This cannot be undone.` Accepting removes the Orb and preserves the actual Ring.

**Expected/remediation:** identify the actual Orb in the destructive confirmation by matching its type and ID. Preserve arbitrary accepted persistent identities; no Ring disposal or runtime identity corruption is claimed. Evidence: `ui/ui-control-results.json`, `reservedIdConfirmation`, including surviving Orb IDs.

## Executed validation and positive evidence

Environment: Linux, Node **v24.19.0**, npm **11.9.0**, Python **3.12.14**, esbuild **0.25.12**, Chromium **151.0.7922.173**; externally available Playwright. App dependencies were installed from the unchanged canonical lockfile. The first npm invocation failed because the sandbox prevented its default home cache; rerunning with a writable workspace cache succeeded. This was an environment constraint, not a package defect.

| Validation | Observed result | Evidence |
| --- | --- | --- |
| `npm ci --cache /workspace/work/npm-cache` | Clean installation, 2 packages | npm-ci.log |
| `npm test` then `npm run build` sequentially | All 18 Node test files pass; production single-file build succeeds | npm-test.log, npm-build.log |
| Built HTML boot/native WAV transport | HTTP 200; 12 s stereo WAV loads/plays; scrubber advances; pause/resume/stop work; no application exceptions | browser-smoke.log |
| Native stream/file graph diagnostic | 440/880 Hz L/R separation, Center mixing, left-only/right-only/dual-mono, explicit splitter, built UI channel metadata/constraints pass | stream-stereo.json |
| Native capture | Available VP9/Opus, VP8/Opus, generic WebM and plain MP4 generate nonempty 400×300 exports and load native metadata; unsupported explicit H.264/AAC option excluded | recording/native-capture-results.json |
| Recording across transport mutations | Capture stays active through natural queue advance and Clear/unload; subsequent stop finalizes a nonempty export and stops recorder-owned tracks | recording/finalizing-eof-results.json, recording-across-eof |
| Default configuration roundtrip/boundaries | Default encode/decode/sanitize stable; schemas 2–10 accepted, 11 rejected | presets/repro-output.txt |
| Numerical/lifecycle/resource probes | All recorded defect/control assertions pass | render_analysis/render-analysis-results.json |
| UI real keyboard/media controls | Bulk/MIME/phase/focus defect and positive-control assertions pass without pageerrors | ui/*-results.json, ui-focus-evidence.json |
| Responsive layout | 320×568, 375×667, 667×375, 568×320: no document horizontal overflow; launcher accessible; panels internally scroll; hidden-focus defect verified at desktop/mobile widths | focused browser review; focus screenshots |

Built artifact: `dist/auralprint_0.1.15m.h.html`, **369,340 bytes**, SHA-256 **`5b314c1c23b9881c35f3aefeb9a07244788f5a7d469a1f34c9d5167ec976b10d`**. JS/CSS/version markers are replaced, with no external script or stylesheet requirements. This is a traceable audit artifact, not a claim that every browser/packaging mode was accepted.

Native recording metadata acceptance does not establish exported audio fidelity or external-player compatibility. WebM's native indefinite duration metadata was observed and not raised as a new code defect. Existing stereo diagnostic code was inspected; its actual native measurements, rather than its comments, support the positive result.

## Coverage, dismissed suspicions, and prior deferrals

| Area | Implementation reviewed and exercised |
| --- | --- |
| Audio/transport | Entire audio-engine, input-source-manager, queue, scrubber; UI ingestion/removal/navigation/repeat/source switch; graph/metadata ownership; native generated WAV and MediaStreams; controlled async orderings |
| Recording | Entire 1,412-line recorder-engine; config/state; render/audio taps; format negotiation; native start/stop/export/failure/dispose; built-app queue EOF and unload integration |
| Core/presets | Entire config/preferences/constants/orb-collection/state/utils and both preset modules; schema boundaries/Scene-9 recovery/global-to-Orb migration/clone boundaries/zero Orbs; historical executable writers/defaults for compatibility context |
| Analysis/render | All render modules; analysis-frame/band-bank/controller; spaces and main loop; selected L/R/C consumers; numerical ranges/phase/reset; instrumented resource growth |
| UI/template/CSS | All nine UI modules, all nine CSS files and current template; dynamic editor/inventory/picker/Scene/Analysis; bulk/preset controls; keyboard focus/launchers; responsive browser interactions |
| Packaging/tooling | package/lockfile, build/watch/assembler and optional stereo diagnostic; clean install; sequential tests/build; actual assembled HTML/static resource inspection |

Historical `docs/Canon/0.1.10`–`0.1.14` files were compatibility context, not a second full audit of retired releases. The current modular source/build is the release candidate under review. Test files were inspected as scaffolding and run as supporting coverage; their assertions are not a substitute for the new reproductions.

Checks that did not support additional findings: stale decoded waveforms are token-guarded; teardown aborts ordinary media listeners and releases URLs; queue cursor/shuffle preserve intended item identity; crossed radius endpoints are ordered defensively; null/non-ready buffers are guarded; surviving Orb/adaptor reconciliation is ID-based; phase reset with zero Orbs is safe; ordinary controller ceilings respect Nyquist; L/R/C routing and native stereo graph behavior passed. Stream upstream video is not accidentally selected as recording video. Normal source-switch/runtime recording controls have active/finalizing guards. Unsupported recorder MIME options are excluded rather than silently selected.

The roadmap's prior deferral labels were checked against implementation:

- **AUD-002:** aggregate resource growth/frame bursts are independently demonstrated as RC-15.
- **AUD-006:** source/load concurrency now has deterministic native-browser evidence (RC-02 through RC-04); the previous unconfirmed status should be revisited.
- **AUD-009:** recorder data events append every encoded chunk without byte/duration/backpressure limits; export construction requires the full collection (`recorder-engine.js:1221`, :699). Chunks are later reset; output remains retained. No long-recording crash threshold was measured, and Blob assembly is not assumed to double backing memory.
- **AUD-012:** renderer/UI still allocate per-frame slices/projected/color objects and refresh work; absence of device profiling prevents a separate measured performance finding. Complete L/R/C analysis remains real work.
- **AUD-004:** deliberate adjacent inclusive FFT overlap remains. RC-08 isolates a different coordinate-scale error while preserving the overlap rule.
- **AUD-013:** legacy duplicate-name lookup resolves through a map and remains ambiguous where duplicate labels exist; it was not elevated to another independently demonstrated migration-loss case.
- Resize/orientation trail smearing and high-Orb navigation are documented later-stage work. Hosted CI is absent; this alone is not a current product correctness defect.

A suspicious invalid Exact Band Indices draft persisting after a chooser edit was examined; draft-preservation semantics made it unsuitable as an additional definite defect. An extreme 375×200 viewport could push the scrubber above the viewport, but a practical supported trigger was not established. These were excluded rather than counted as findings.

## Remaining acceptance evidence and remediation order

This audit is detailed but bounded. It does not establish acceptance for Safari/Firefox, iOS/Android/physical touch, real microphone hardware, OS-native display/system-audio permission dialogs, device-specific sample rates, surround/compressed-media breadth, external-player exported audio fidelity, filesystem download behavior, long-duration recording/memory retention, or constrained-hardware FPS/GPU behavior. Synthetic acquisition and generated PCM/Vorbis inputs do not substitute for those gates. Direct `file://` navigation failed with environment `ERR_BLOCKED_BY_ADMINISTRATOR`; offline single-file source packaging was inspected, but actual direct-file launch needs another browser environment.

Suggested correction order:

1. Make identity allocation always terminate (RC-01) and preserve successful exports across failed starts (RC-06).
2. Correct load/batch/source/Play ownership and cancellation (RC-02–04), then preserve EOF transitions across recording finalization (RC-05).
3. Correct band-count coverage/FFT coordinates/identity reservation (RC-07–09) and phase dependency (RC-10).
4. Repair direct bulk application, supported-media acceptance, focus ownership, and cancelled touch cleanup (RC-11–14).
5. Measure/disposition RC-15 and the remaining resource/cross-browser/media gates; track P3 corrections with explicit expected semantics.

After changes, invert these reproduction observations into intended-behavior regression checks, rerun relevant native-browser controls, and repeat acceptance on the new pinned commit. Any conclusion about canonical promotion must refer to that corrected revision; this report describes the current unfixed build only.
