# I.2A waveform module contracts

Starting point: exact open PR #50 head `b2d84e9122991affea5c8525a07c5f755a52a3ce`, parent accepted main `704bf13d3a3dfb76032343226bad7240191ef6c6`. PR #50 remains separate and immutable. I.2A authorizes production concurrency correction only; no size/duration admission, deadlines, settings controls or persistence.

## Public compatibility

`Scrubber {init, loadFile, reset, draw}` remains unchanged. `loadFile(File)` remains an asynchronous Promise<void>, never awaited by production UI. It completes after underlying extraction for active work; a pending request removed by replacement/reset completes without starting extraction. Its promise is **not** an occupancy signal; only the coordinator can release occupancy. `buildWaveformPeaks(audioBuffer, bucketCount=512)` remains re-exported from Scrubber at the existing import path. Its implementation is moved unchanged to the extractor. No AudioEngine/InputSourceManager/Queue/RecorderEngine/AnalysisFrame or main-loop interface changes.

## Coordinator interface

`createWaveformCoordinator({extract, onUpdate}) → {request, reset, snapshot}` creates an instance, not a global resource owner. Scrubber owns exactly one instance for its lifecycle. `request(file)` replaces presentation generation, returns Promise<void>, and either starts one operation or retains one newest pending intent. `reset()` synchronously invalidates current/pending presentation, drops pending File reference and resolves its unused promise; outstanding active work remains occupied. `snapshot()` returns only scalar occupancy/generation facts for tests/diagnostics; no File/buffer/list history or production polling.

`onUpdate(status, peaks)` is the synchronous presentation callback. Only a current result can deliver ready/peaks or unavailable. States are empty, waiting, decoding, ready, unavailable. Waiting means no extraction has started for the current request. Scrubber alone stores this presentation state/peaks, draws existing fallback/progress and owns seeking/drag. The coordinator stores generation and resource slots, not another presentation state machine.

The active slot is reserved before callback/extractor invocation and is retained through the extractor promise's actual success/rejection/discard. A pending descriptor retains only the newest File, generation and promise resolver. Superseded pending descriptors immediately drop their File and resolve. Active descriptors drop their File immediately after invoking the extractor; no coordinator File-valued local suspends across extraction. Scrubber returns/adopts the request promise without suspending its own File-valued argument. Settlement clears active, resolves its request, and revalidates the newest pending generation before starting it. No FIFO, cache, retry loop, timer, per-frame native polling, or scheduler recreation on Reset.

## Extractor interface

`extractWaveform(file, {isCurrent}) → Promise<Float32Array|null>`. It reads the complete File, checks freshness before starting native decode, awaits `OfflineAudioContext(1,1,44100).decodeAudioData`, checks freshness before reducing and returns the same 512 all-channel absolute-magnitude peaks. `null` means obsolete work discarded; rejection means extraction failed. Future replacement extractors must settle their promise only after all underlying work has settled or acknowledged cancellation, respect validity checks and return the same faithful full-file peak output semantics unless a separately approved interface revision changes them. They must not return early from a promise race while native work remains unresolved.

The extractor drops locally owned File/read/encoded/decoded/context references in finally after settlement. This is logical release eligibility, not proof of immediate native/GC reclamation. Native read/decode internals can retain buffers independently. Channel views are used without explicit full-channel copies. Production source uses the existing 44.1kHz decode rate and 512 output buckets; these are unchanged waveform semantics, not new admission ceilings.

## Source, playback and recording

Queue entry + UI request ID continue to govern File activation. Only successfully activated current File work calls Scrubber. UI resets Scrubber at every track-change start, Clear/last removal and File→Mic/Stream; live teardown callbacks use existing reset coordination. Scrubber does not take Queue/source/recording authority. A repeated same File creates another coordinator generation. Superseded work cannot present peaks/status even if the File object is identical.

Seeking consults the active media duration/currentTime, independent of waveform status. Load/reset synchronously terminate drag. Failure stays in optional waveform presentation and cannot unload playback, set a transport error, affect source permission, finalize capture or stop shared tracks. Permanently unresolved native work may indefinitely block future waveforms; playable media, source switches, seek and recording remain usable. This tradeoff is intentional until later display/admission policy.

## Encoded-read cancellation decision

Retain File.arrayBuffer for I.2A. It has no abort argument; serialization already prevents a replacement full read until it settles. Browser FileReader.readAsArrayBuffer provides abort/abort-event/loadend/readystate acknowledgement with the same ArrayBuffer result type, but replacing the reader requires explicit event/error/cleanup ownership and must not release occupancy merely because abort() was called. File.stream cancellation likewise needs observed acknowledgement and bounded chunk ownership while still assembling full encoded input. These alternatives do not cancel an admitted decodeAudioData operation. A native small FileReader abort probe is included in evidence; no production reader rewrite is needed for this concurrency foundation. The extractor is the substitution point for a later justified reader.

## Future policy boundary and risks

I.2B may preflight and revalidate explicit CONFIG encoded/estimated-PCM criteria before extractor invocation, including metadata and display deadlines. It must remain separate from this single-flight invariant. I.2C will own application preferences/large-file choices independently of scene schema 10. No speculative factory/module, metadata parser, unknown-file exclusion, threshold/dropdown or scene preference is created now. All normally eligible Files still request automatic extraction; an unabortable older job can delay them.

Risks: false slot release during Reset, stale status notification, pending retention/restart, callback reentrancy, starvation behind unresolved native work and reduced responsiveness under replacement. Source/recorder internals and visual systems are protected. Scrubber time text compares before assignment to avoid repeated unchanged DOM writes for waiting/decoding/ready/unavailable; main-loop cadence stays unchanged.

> The single-flight waveform coordinator protects against overlapping whole-file reads and native decoding allocations. Removing this resource-ownership boundary without replacing its admission guarantees reintroduces AUD-007. Any replacement must demonstrate equivalent or stronger bounds with adversarial concurrency tests.

This binds the admission guarantees, not one implementation forever. AUD-007 remains open for I.2B/C/D; Build 115N remains WITHHELD.
