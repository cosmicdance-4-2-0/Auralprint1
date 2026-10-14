# 115M.I.I / I.2A — single-flight waveform foundation

I.2A implements concurrency/resource ownership, not a memory-size budget. Development `v0.1.15m.i.i`, schema **10 unchanged**. **AUD-007 remains open; I.2B/C/D are not begun; Build 115N remains WITHHELD.**

Starting clean head: `b2d84e9122991affea5c8525a07c5f755a52a3ce`, exact accepted PR #50 head. Remote PR #50 was independently verified open/draft/unmerged; remote main remained `704bf13d3a3dfb76032343226bad7240191ef6c6`. Branch `codex/115m-i-i-aud007-coordinator` is stacked onto the unchanged policy branch in [draft PR #51](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/51). No merges or changes to accepted I.1 documents/evidence. Read agents.md, ROADMAP.md and the complete accepted design before editing. This is a Build 115 AUD-007 concurrency bug fix; source/recorder/preset/UI ownership are protected impact surfaces.

## Implementation and ownership

- `waveform-coordinator.js` owns one active extraction, one replaceable newest pending intent and generation eligibility. It reserves occupancy before the extractor's full read. A replacement revokes authority immediately; it does not pre-read. A/B/C means B never starts and C alone waits. Native/extractor settlement, including rejection, releases occupancy and revalidates newest intent. Reset drops pending intent and current authority but cannot release an outstanding slot.
- `waveform-extractor.js` owns File.arrayBuffer, native offline decoding and unchanged full-channel peak reduction. It checks validity after read and decode, drops local references in finally, and returns 512 Float32 peaks or null for obsolete work. All channels, absolute magnitude, short/non-divisible buffers and final-bucket coverage are retained. No per-channel full copy or cache. Current 44.1kHz decoding is unchanged, not a memory cap.
- `scrubber.js` owns peak/status presentation, fallback/progress and mouse/touch seeking. No scheduling flag remains there. Existing API/exports remain; loadFile Promise<void> is not awaited by production UI. Pending superseded/reset requests settle without extraction; active requests settle only with the extractor. Load/reset synchronously end drag and clear old peaks. Waiting is distinguished from decoding in the existing status lane. Time text compares before assignment; no added per-frame scheduler polling or tooltip traversal.

No Queue request/entry identity, media/source lifecycle, recorder tap/finalization, preferences, CONFIG, AnalysisFrame, BandBank, main loop, visual systems or schema contracts changed. The only other source edit is the authorized constants version banner; root version and established version/packaging assertions are synchronized. No size/duration exclusion, threshold, deadline, worker, dependency, new global mutable governor, settings dropdown or persisted waveform field is introduced. Every normally eligible File still requests automatic waveform extraction, potentially delayed behind an older unsettled job.

See [ownership-contract.md](ownership-contract.md) for the canon interfaces, promise compatibility, reset/supersession/resource settlement and future replacement/policy boundaries. A temporarily or indefinitely unresponsive decoder can postpone all subsequent waveform generation in this Scrubber session; playback, seek, source switching and recording remain independent. No timeout masquerades as cancellation.

> The single-flight waveform coordinator protects against overlapping whole-file reads and native decoding allocations. Removing this resource-ownership boundary without replacing its admission guarantees reintroduces AUD-007. Any replacement must demonstrate equivalent or stronger bounds with adversarial concurrency tests.

## Read cancellation decision

File.arrayBuffer is retained and serialized. A native small FileReader probe observed abort then loadend with DONE/read-result null. This verifies an alternative browser capability, not physical memory reclamation. Replacing the reader adds event/cancellation acknowledgement/cleanup ownership without addressing already-started native decode. It is unnecessary to establish I.2A's bound; the extractor is the documented future substitution point. File.stream would still need bounded chunk handling and acknowledged cancellation. No partial-file decodeAudioData is used. A future replacement must keep its promise unsettled until actual operations/cancellation acknowledgements settle.

## Deterministic and negative-control evidence

22 new permanent tests in `waveform-coordinator.test.js` and `scrubber-coordinator.test.js`; existing peak/drag tests unchanged. Four waveform suites pass **33 assertions**. Tests observe read/decode starts, scalar occupancy/current pending generation, presentation/results and actual seek/listener behavior, not preferred private field names.

Cases cover active read/decode plus B/C supersession; stale success/rejection; current rejection recovery; Reset while reading/decoding; pending discard/no restart; 100 repeated replacements during unresolved reads/decodes; identical-File separate generations; synchronous extractor failure; admission callback reset; stale result despite a noncooperative replaceable extractor; immediate old-peak clearing/drag termination; Clear/Mic/Stream presentation reset; unavailable-waveform seeking/playback; unchanged status mutation absence; repeated load/reset without listener or pending-work growth. Controlled fixtures are only small ArrayBuffers and 13-frame PCM. Never-settling work is observed without settlement, then resolved for harness cleanup; no forever-hung native decoder is induced.

`negative-controls.py` runs isolated original positives and seven disposable mutations. All seven fail their intended observable assertions: false Reset release, a second native decode before A settlement, FIFO rather than newest intent, stale success, stale rejection, pending restart after Reset and stuck gate after rejection. No harness crash is counted. It uses temporary directories outside normal Node test discovery and removes them. Original source and historical I.1 reproduction/evidence remain unchanged; I.1's three-overlap expectation intentionally no longer describes the corrected implementation.

## Native and protected regressions

New portable artifact SHA-256 is in validation.json/evidence, with hosted output hashes in distribution.json. Native **Chromium 151.0.7922.173**, headless Linux/localhost, 1440×1000:

- I.2A **12/12**: portable/root/nested playback+ready; native six-channel terminal impulse detected in final bucket; A/B/C with held decode delivery and no B read/decode; held read delivery skips stale A decode; optional decode rejection with real playback/seek/recovery; Clear while occupied; File→fake Mic and controlled Stream refusal while pending; native recorder capture/export through File changes with optional work blocked; FileReader capability probe.
- During held A, exactly one read/decode invocation exists; C's File is playing with no peaks. B never starts. Release admits only C. With held read, A never decodes. Maximum outstanding observed read/decode wrapper counts are one. Test wrappers hold **result delivery** from genuine native operations; evidence separately records native completion. They do not prove native threads remain busy or physical memory released.
- Waiting, ready and unavailable states each receive 1,000 unchanged draw calls with **zero time-label mutations**, using paused native media to hold currentTime stable. Accepted H also verifies 2,000 unchanged UI refreshes, hidden reveal, tooltip/focus/listener ownership, native source/recorder transitions, held finalization/EOF and retained export after a controlled recorder error.
- Protected native F.6 **21/21**, G.1 focus **38/38**, G.2 targets **31/31**, G.3 geometry/numeric **27/27**, G integrated **13/13**, H.1 **9/9**. `recheck.cjs` only adapts root/version selectors and the accepted I.1 H wait for ordinary RAF source-error presentation. All original scripts/evidence stay immutable. Historical audited-SHA labels identify diagnostic provenance, not this artifact.
- No unexpected page/console errors, failed assets or unhandled rejections. H's deliberately injected recorder error remains explicitly expected. Mic is fake hardware; Stream refusal/decode rejection and delivery gates are controlled. No physical-device, other-browser, direct file:// or universal memory-safety claim.

## Required sequential validation

`npm ci` **succeeded directly**; no cache fallback or alternate dependency install needed. `npm test`: **826 total, 825 passed, zero failed, one established skip**. `npm run build`, `python scripts/verify_distribution.py` and `git diff --check` pass. Broader focused source/F/G/H/recorder selection: **442 passed**. No lockfile/dependency change. Tests/build run unsandboxed because sandboxed native/packaging subprocess/socket access is restricted; configured proxy/CA remain intact.

Initial attempts are disclosed in evidence/attempts.json: accidental mutant discovery under work, escaped version regex awaiting synchronization, and native fixture expecting appended Queue files to activate automatically. Each is corrected without source/Queue behavior workarounds. Intermediate CI on the pre-correction test commit failed; exact **final-head** Linux/Windows CI is checked after push and linked in the PR handoff, avoiding a self-referential SHA inside this commit. Neither passing intermediate CI nor documentation is substituted for the exact-head check.

Reproduce after standard install/build:

```sh
node --test --test-isolation=none tests/waveform-coordinator.test.js tests/scrubber-coordinator.test.js tests/scrubber-waveform.test.js tests/scrubber-drag-ownership.test.js
python docs/audits/remediations/115m-i-i-aud007/implementation/negative-controls.py work/i2a-negative.json
node docs/audits/remediations/115m-i-i-aud007/implementation/native.cjs work/i2a-native.json
mkdir -p work/f-exports
node docs/audits/remediations/115m-i-i-aud007/implementation/recheck.cjs f --output "$PWD/work/f-native.json" --export-dir "$PWD/work/f-exports"
node docs/audits/remediations/115m-i-i-aud007/implementation/recheck.cjs g --output "$PWD/work/g-native.json"
node docs/audits/remediations/115m-i-i-aud007/implementation/recheck.cjs g1 --output "$PWD/work/g1-native.json"
node docs/audits/remediations/115m-i-i-aud007/implementation/recheck.cjs g2 --output "$PWD/work/g2-native.json"
node docs/audits/remediations/115m-i-i-aud007/implementation/recheck.cjs g3 --output "$PWD/work/g3-native.json"
node docs/audits/remediations/115m-i-i-aud007/implementation/recheck.cjs h "$PWD/work/h-native.json"
```

Playwright/Chromium are environment test tooling, not application dependencies. `native.cjs` adds observation hooks to served HTML only; no shipped artifact/source hook is committed. Evidence includes exact successful output summaries, small native cases, broad compact case observations/raw digests, seven mutation outputs and provenance. Native allocation/RSS is not measured; reference clearing is eligibility, not proof of reclamation.

## Review and remaining phases

Independent review should inspect the single active/one latest slot, finally-only release, reset/pending invalidation and duplicate-File generations; replaceable extractor lifetime/output guarantees; preserved Scrubber exports/promise behavior and value-compared status; immutable F/G/H/recorder and I.1 paths; and exact final-head Linux/Windows CI. Commit groups are interfaces/extractor, scheduling/version, regressions/negative controls, native acceptance/evidence, and final File-reference/FIFO-control hardening. The final review removed a File-valued async local at extractor dispatch and Scrubber returns/adopts the request promise; the entire protected/native matrix was rerun on the resulting artifact. The FIFO mutation retains a real accumulating queue and wrongly admits obsolete B, which the intended assertion rejects. The PR remains draft/unmerged.

I.2B still owns CONFIG encoded/estimated-PCM budgets, metadata/admission credibility, unknown metadata and any display deadline. No one-file memory bound or whole-browser cap exists yet. I.2C owns the accepted approximately 4/8/15 minute choices (proposed factory 8), Ask/automatic-if-permitted/Skip behavior, application preference persistence outside scene presets and UI. I.2D owns final integrated acceptance. An unresolved decoder blocks optional progress by design; no automatic retry/cancel/reload is added. Do not begin later phases or mark AUD-007/Build 115N closed/ready.
