# Auralprint Build 116 — independent adversarial pre-RC audit

Created 2026-10-29 08:16:02 UTC. Audit only; no application fixes. Source baseline is pinned below.

## Executive verdict

**Build 116 is not suitable for RC consideration on the evidence collected. One RC blocker is confirmed.** A 147-character compressed preset reaches synchronous numeric identity repair that failed to finish within six seconds in native Chromium and twelve seconds in an isolated Node process. The application awaits that decoder before scheduling its first frame. Transport byte/count limits do not bound the generated identities or their conversion work.

Severity totals: **0 Critical/P0, 1 High/P1, 0 Medium/P2, 3 Low/P3, 2 Informational**. The three Low findings are recoverable control/interaction inconsistencies requiring owner disposition. The Informational entries distinguish an injected recorder failure from an unresolved historical watcher failure; neither is counted as a demonstrated ordinary-user blocker.

The named Ubuntu watcher failure remains **unresolved intermittent**, despite six passing isolated watcher runs and the passing final suite. A controlled truncate/write window demonstrates extra rejected assembly work, but does not prove the historical cause. Positive Trace fade remains subject to owner acceptance of its established join approximation and physical-device gates. Physical Mic/Stream permission, Safari/Firefox/WebKit, direct-file operation, long capture and constrained-device resource behavior remain unqualified.

This is an inventory of all **65 reachable production JavaScript modules**, source/template/CSS/packaging review, standard verification and targeted independent challenges. It is not exhaustive state-space, browser, media or hardware certification. Serious identity evidence was independently repeated by the lead; raw native observations, controls and explicit limitations accompany the findings.

## Baseline, authority and environment

| Item | Verified value |
| --- | --- |
| Repository | `https://github.com/cosmicdance-4-2-0/Auralprint1` |
| Audited commit | `31dd5b2c7f9562602670dd2ebcc334d76c37f099` |
| Complete source tree | `dc36c37073fe9f74067577c77ae320d124c5d95b` |
| Parents | `644266857be379991361cf3662236d185d876ff4`, `b75edf9621804a87342b5c28c54b9fab4060048e` |
| Audit branch / path | `audit/116-pre-rc-hostile`, `/workspace/Auralprint1`; created directly from accepted commit |
| Initial worktree | Clean; original branch `work`; unrelated tracked changes absent |
| Upstream verification | GitHub API main ref and Git commit tree matched; subsequent successful `git fetch origin main` updated stale local `origin/main` from `3abce4a` to exact accepted SHA |
| Integrity | Full non-shallow Git object store; `git fsck --full --no-reflogs` passed; 65/65 source files reachable both through import traversal and actual esbuild JS inputs |
| Development version / writer | `v0.1.16-candidate` / schema `16`; reserved `14/15` remain rejected |
| Protected public release | Build 115, `docs/Canon/0.1.15/auralprint_0.1.15.html`, Git blob `fb539ed8e03f8bd0c62951bff9f4a73ee802b11b`; unchanged |
| OS | Debian GNU/Linux 13.6, Linux 6.18.55, x86_64 |
| Runtimes | Node `24.19.0`, npm `11.9.0`, Python `3.12.14` |
| Locked development dependencies | esbuild `0.25.12`, Playwright `1.64.1`; no new dependencies or lockfile changes |
| Browser | System Chromium `151.0.7922.173`, `/usr/bin/chromium`; substituted for Playwright-downloaded Chromium using `AP_CHROMIUM_PATH` |

Read AGENTS/ROADMAP as requirements and the October 6/24 reports as leads. No historical conclusion, passing assertion or agent statement was accepted as implemented behavior without current source reconstruction. All application evidence uses the pinned source. The existing candidate validator deliberately loads immutable historical renderer comparators; those comparison modules are not substituted into the audited production build.

The initial sandboxed Git fetch could not connect to its proxy. Normal process access subsequently fetched successfully. Initial plain `npm ci` stalled on network; it was terminated, then `npm ci --offline --cache /workspace/auralprint-environment/npm-cache` completed from the prepared cache. A first test attempt raced the terminated install's cleanup and failed to resolve esbuild in watcher copies; it is invalid application evidence. A later scratch watcher copy was moved outside the repository before the final clean suite was rerun; its counts agree with the preceding complete passing run. Only the final clean counts are authoritative below. Default sandbox child isolation and localhost restrictions also required normal/additional-capability execution. These limitations were resolved without changing application or test source.

Portable output: **577,564 bytes**, SHA-256 `9068ee6cfb637163687a06f159bf3eaf0cae460a75949f0bb28b07a10cebf136`. Hosted index: **576,395 bytes**, SHA-256 `0dcd58162a108279cbdea2e7c0b29af141922bc492403bd875cac9f1f35568cf`. Two isolated builds plus verifier produced identical nine packaged files. The diagnostic metafile contains a generation timestamp and is not asserted byte-reproducible.

## Runtime inventory and coverage

Template boot calls `main`: resolve defaults → await winning URL import → resolve/camera initialization → source support → BandBank → Orb/runtime → recorder taps → UI/scrubber → resize/listeners → one animation callback. Each frame updates viewport, separate motion/emission/real-age clocks, camera input, native L/R/C sampling, reusable AnalysisFrame, Orb updates before Ring lock, rendering and UI/scrubber projection. Queue and live source ownership live outside Scene persistence. Recorder callbacks carry session authority; asynchronous waveform preparation retains occupancy until actual decode settlement.

Every name below refers to a `.js` file under `src/js/`. **S** means executable control flow inspected, **E** a new independent executable challenge, **T** existing tests run, **G** a material execution gap. E/T labels apply to the described boundaries, not every statement or input. Import edges and exact grouped inventory are saved in [module-inventory.json](20261029-081602_auralprint-116-pre-rc-evidence/module-inventory.json).

- **Root (1):** `main`.
- **core (17):** `application-preferences`, `band-frequency`, `camera-fit`, `camera-projection`, `camera-state`, `config`, `constants`, `orb-admission`, `orb-collection`, `particle-safety`, `preferences`, `spaces`, `state`, `timing`, `utils`, `world-geometry`, `world-settings`.
- **presets (7):** `compact-preset`, `deflate-transport`, `preset-codec`, `preset-limits`, `schema-13-baseline`, `schema-16-baseline`, `url-preset`.
- **audio (12):** `analysis-frame`, `audio-engine`, `band-bank-controller`, `band-bank`, `input-source-manager`, `queue`, `scrubber`, `waveform-admission`, `waveform-coordinator`, `waveform-extractor`, `waveform-metadata`, `waveform-policy`.
- **recording (2):** `recorder-engine`, `recording-policy`.
- **render (10):** `camera-fit-content`, `color-policy`, `orb-runtime`, `orb`, `particle-governor`, `particle-list`, `renderer`, `trace-fade`, `trail-system`, `visualizer-runtime`.
- **ui (16):** `analysis-panel`, `camera-actions`, `camera-controls`, `camera-interaction`, `config-range`, `dom-cache`, `orb-band-picker`, `orb-editor`, `recording-resources`, `scene-camera-actions`, `scene-panel`, `spectral-ring-editor`, `ui`, `visualizers-panel`, `waveform-options`, `workspace`.

| Owners / entry points and transitions | Actual coverage and boundaries |
| --- | --- |
| CONFIG → preferences → resolveSettings → runtime.settings/state; collection admission/Add/Duplicate/remove; application-only preferences | S/E/T. 39 new schema/precision/atomic cases; zero/capacity, exact unsafe-Number identities, duplicate/later-ID reservation, invalid fields and retained camera/world references. Identity expansion fails AUD116-001. Application storage recovery primarily S/T; arbitrary direct mutation of module internals is not a user contract. |
| Preset codec, compact expansion, frozen baselines, Base64/DEFLATE and async URL/share ownership | S/E/T. All schemas 2–13/16 ordinary roundtrips, reserved 14/15 rejection, malformed ranges/depth/prototype keys, compressed import losing to user edits; native preset gate tests actual browser decompression/startup and stale requests. Source confirms bounded stream read/cancel, compressed/JSON/depth/node admission. G: all cross-engine decoder/clipboard schedules and maximum 64 MiB allocations. |
| AudioEngine graph/media/URL ownership; InputSourceManager acquisition → attach/resume → publication/end/teardown; Queue revisions/current request; UI loadAndPlay/EOF locks | S/E/T. Twelve independent native source-app sequences, both Mic/Stream opt-in clear success, denial, Queue replacement, File return, winning competing source and track termination during held attachment. Real generated media/oscillator streams; permission delivery controlled. Existing native RC-03 six-case and RC-04 ten-case harnesses also pass. G: physical capture/dialog/device incidence. |
| FFT/bands/AnalysisFrame and Analysis controls | S/E/T. 120 edge-generation cases and 200 bank/sample-rate cases, subnormal→384 kHz, five distributions, collapsed intervals and Nyquist; producer reference/invalidation checks. Native 375/1125 Hz stereo input establishes L/R separation and real C mixture; measured engine sample rate 44.1 kHz. G: arbitrary multichannel/device matrices and acoustic fidelity. |
| Scrubber and waveform admission/coordinator/extractor/metadata/policy | S/T; E ordinary generated WAV extraction, seeking and AUD116-004. One occupied read/probe/decode/reduction plus newest pending request traced; encoded admission precedes prefix/native decode, generations reject stale presentation, actual settlement releases occupancy. G: independent exhaustive malformed containers, never-settling decoders, total native decoder memory. |
| RecorderEngine/policy/resources UI; canonical canvas and AudioEngine tap | S/E/T. Three native encodes, active resize, native decode plus FFmpeg decode, failed next canvas acquisition, Stop/Cancel/Dispose, prior export preservation, owned-vs-upstream track checks, normal File tap cleanup and injected refusal. 95 recorder/policy/export/disposal named tests separately pass. G: long-duration, full A/V fidelity, codecs/players and physical source recording matrix. |
| Orb/Ring composition/color, TrailSystem/ParticleList/Governor and clocks | S/E/T. 10,000 seeded frames with budget/TTL/spacing/reorder changes and 345 remove/add transitions; heap/list/accounting/fairness assertions each frame. Current-frame Ring lock, paused free Ring and TTL expiry, phase-preserving track reset/design reset, selected L/R/C and disposal checked. G: million-particle native rendering, 4,096-Orb interactive performance and hours-long GC. |
| Canvas renderer/Trace fade/projection | S/E/T. 264 exact Fade 0 pixel comparisons against separately drawn continuous paths; 1,056 positive-fade draws at 1/5/10/20; empty/minimal/gapped/identical/reversed/intersecting/tiny/huge histories, nonblack backgrounds, two cameras, DPR1/2 and three viewports. Twelve analytic straight-gradient samples, ten 16-Orb × 1,001-point draws. No history mutation/pageerrors. Known positive-fade join partition is an approximation, not certified ideal compositing. |
| World geometry/spaces, live/authored camera/fit, gestures/controls | S/E/T. 10,000 projection inverses and 10,000 analytic fits; 46 malformed cases; native keyboard/pointer capture/wheel anchoring/resize during drag/reset/blur/cancel. Authored pose, Orb phase and retained identity/coordinates preserved. Built camera gate observes authored pose before first rendered frame, Save/Share/Restore and migration. G: actual monitor DPR changes/physical touch/OS focus matrix/extreme-translation useful precision. |
| UI coordinator/DOM cache/config ranges/Orb picker/editor/Bulk/Ring/Scene/visualizer inventory/workspace/waveform options | S/E/T. Native source controls; zero-Orb Add recovery, safe hostile ID rendering/type-aware removal, 20 panel toggles followed by exactly one duplication, narrow/short layouts. Forty-control browser editing gate covers source/portable/hosted at DPR1; candidate controls gate covers DPR1/2. Scene palette/draft defects are separate owners outside those passing assertions. G: screen readers, every bulk mixed-state permutation and high-count DOM performance. |
| Build/assembler/distribution/verifier/watch/harness, template/CSS/flat artwork and workflow/package metadata | S/E/T. Six isolated exact watcher runs, save timing experiment, double byte-identical build/verifier; source and both built editions. New HTTP DPR1/2 offline-after-load camera interactions pass with no failed/external requests. G: original Ubuntu cause, physical Windows editor/filesystem timing, ordinary-build I/O fault atomicity and first-load network-disabled/direct-file launch. |

Cross-system challenges include Queue mutation and source supersession while acquisition is pending, source termination during native attachment, failed acquisition preserving Queue, Scene import/reset retaining a surviving editor, world/camera/viewport changes preserving history, particle-policy changes during admission/expiry, live capture resize and failed-next-capture preserving the previous export. The standard native gates also exercise delayed File completion during Analysis drafts, compressed import before first paint, stale imports/user edits/camera changes, and File Queue/fade controls across editions. Not every combination suggested by the brief was executed; specifically, a new integrated recording-finalization/EOF/source-switch race and physical display/DPR transition during full-app recording were not independently constructed in this pass.

## Findings index

| ID | Title | Severity | Evidence / confidence | Release disposition |
| --- | --- | --- | --- | --- |
| AUD116-001 | Short preset multiplies huge numeric Orb identities before startup | High/P1 | Native decoder + isolated Node; high | **RC blocker** |
| AUD116-002 | Scene palette sliders misrepresent accepted fractional values | Low/P3 | Native UI; high | Requires owner decision |
| AUD116-003 | Reset/import retain rejected editor drafts and stale errors | Low/P3 | Native UI; observed behavior high; draft policy needs disposition | Requires owner decision |
| AUD116-004 | Scrubber drag survives blur and seeks on no-button movement | Low/P3 | Native media/listeners, controlled focus sequence; high | Requires owner decision |
| AUD116-005 | Injected File-tap cleanup refusal is reported as success | Informational | Native control + patched failure; high for injection only | Requires owner decision |
| AUD116-006 | Original Ubuntu duplicate-save watcher failure remains unexplained | Informational | Historical log + current repeated/controlled runs; cause unresolved | Requires owner decision |

## Detailed findings

All source locations and line ranges below refer exclusively to audited SHA `31dd5b2c7f9562602670dd2ebcc334d76c37f099`. Native reproduction means actual Chromium APIs/source modules unless an explicit seam or injected event is identified.

### AUD116-001 — Short preset multiplies huge numeric Orb identities before startup

**High/P1; high confidence; RC blocker.** Confirmed native decoder delay and isolated Node timeout, with direct source proof of startup reachability. No infinite-loop, OOM or completed large-allocation claim is made.

**Locations:** `core/orb-collection.js:5–24,33–50` (`largestOrbSuffix`, `normalizeOrbCollection`), `core/orb-admission.js:4–10`; `presets/compact-preset.js:101–109`, `presets/preset-codec.js:244–285`, `presets/url-preset.js:51–67,102–113`; `main.js:70–78`. Paths are under `src/js/`.

**Entry/trigger:** schema-16 compressed URL JSON with 4,096 Orb objects, first ID `ORB` followed by 20,000 decimal nines, remaining IDs omitted. Count, JSON, compressed bytes, depth and node admission all accept this shape. The measured input is **32,330 JSON bytes / 147 hash characters**. Missing identities are a supported normalization path.

**Expected:** identity admission/repair must bound conversion work and generated representation; a transported preset below resource limits must not stall initialization through unbounded repair amplification. Preserve explicitly authored identities and uniqueness.

**Observed / controls:** Native Chromium's `decodePrefsFromHash` did not settle before a **6,000 ms external driver deadline**; its browser was then closed. Three fresh-browser controls completed: ordinary 4,096-Orb input **451 ms**, equally long opaque `X…` ID with 4,096 Orbs **199 ms**, and the same long numeric suffix with only two Orbs **23 ms**. These isolate numeric identity multiplication from just input length, BigInt parsing or Orb count. Independent lead Node execution was killed by `timeout 12s` with **exit 124**, no completed result. A smaller completed 4,000-digit case generated **16,400,383 identity characters** from 16,330 JSON bytes in 478 ms; the independent 2,000-digit case generated 8,208,383 characters from a 125-character hash.

**Cause:** `largestOrbSuffix` converts arbitrary-length decimal suffixes to BigInt; `nextSuffix` exceeds that maximum. Every repaired identity serializes another equally wide BigInt. There is no generated-ID length/work/output admission. If the 20,000-digit case completes, arithmetic implies 81,936,383 identity characters alone; that is a deduction, not a completed allocation measurement. The full-app first frame is scheduled after awaiting import, so the decoder is directly on the startup critical path. The native reproduction isolates the decoder rather than waiting for 4,096 editors to render.

**Reproduction / artifacts:** From repository root, run `node docs/audits/20261029-081602_auralprint-116-pre-rc-evidence/identity-native.cjs` in a disposable checkout with locked dependencies and Chromium. It creates each payload itself and closes the browser after six seconds. For Node use `timeout 12s node --max-old-space-size=384 docs/audits/20261029-081602_auralprint-116-pre-rc-evidence/identity-node.mjs identity-expansion 20000 4096`; the completed small case substitutes `4000`. See [native results](20261029-081602_auralprint-116-pre-rc-evidence/identity-native.json) and [Node observations](20261029-081602_auralprint-116-pre-rc-evidence/identity-node-observations.json). The lead's extra 12-second cutoff and 4,000-digit output are recorded in verification metadata.

**Impact / limits:** A short shared link can force prolonged synchronous work before usable startup/import completion. No network endpoint, arbitrary code execution or data disclosure is implicated. Physical-browser incidence, total RSS, eventual completion time and an actual renderer crash were not measured. This is distinct from expert rendering performance: it occurs inside decoding before visualizer/DOM construction.

**Remediation direction / protection:** Keep existing opaque identities, but avoid deriving all repairs from an arbitrarily wide largest suffix; bound generated identity work/representation and post-normalization expansion before committing preferences. Preserve later explicit IDs and frozen schema meanings. Add bounded child/browser regressions for long numeric versus opaque IDs, missing/duplicate repairs, unsafe-Number exactness and atomic rejection. No fix implemented.

**Disposition rationale:** Startup-blocking synchronous work from a small admitted share link is a core-function/resource failure; deferment to rendering optimization in Build 117 does not address it.

### AUD116-002 — Scene palette sliders misrepresent accepted fractional values

**Low/P3; high confidence; requires owner decision.** Confirmed native source-app interaction.

**Locations:** `src/js/ui/scene-panel.js:12–16,86–88,106–108,137–139`; accepted canonical values `src/js/presets/preset-codec.js:199–210`; CONFIG grids `src/js/core/config.js:607–610`.

**Entry/trigger:** Apply schema 12 with `bands.rainbow={hueOffsetDeg:12.5,saturation:0.375,value:0.425}`; open Settings → Band Palette. Schemas retain these finite fractions.

**Expected:** Controls/readouts/ARIA distinguish canonical values from editing-grid selection consistently, retaining imported precision until editing.

**Observed / cause:** Canonical values stay `12.5/.375/.425`, native range `.value` snaps to `13/.38/.43`, and readouts show `12.5°/.38/.42`. None supplies `aria-valuetext` explaining the mismatch. Hue ArrowRight changes canonical `12.5` directly to `14`. The owner binds native step and writes canonical values directly, bypassing the corrected `config-range` representation used elsewhere. The post-arrow agreement at 14 and unchanged other fractions are controls against a failed import.

**Reproduction / evidence:** `ui-native.cjs`, [ui-native.json](20261029-081602_auralprint-116-pre-rc-evidence/ui-native.json), fields `sceneColorBefore` / `sceneHueAfterArrow`. Minimal JSON is `{"schema":12,"prefs":{"bands":{"rainbow":{"hueOffsetDeg":12.5,"saturation":0.375,"value":0.425}}}}`, Base64URL-encode after `#p=`, use Apply URL Preset, inspect native values and press Hue ArrowRight.

**Impact / limits:** Renderer and native/assistive control can describe different color settings; first edit jumps from the snapped selection. Recoverable; no automatic persisted-value loss or screen-reader-device certification claimed. Source-app Chromium probe; the same owner is bundled in both editions, but this exact new UI reproduction was not independently repeated there.

**Remediation / protection:** Extend the existing canonical/selection/editing policy to these three controls; native checks should compare imported canonical fractions, value, readout/ARIA and first keyboard action, plus an on-grid control. This is a residual owner outside October 24's specifically repaired Ring/Analysis path, not a demonstrated regression of that correction. Owner may disposition its narrow release impact; no blocker established.

### AUD116-003 — Reset/import retain rejected editor drafts and stale errors

**Low/P3; high confidence in observed behavior; requires owner decision on whole-Scene replacement policy.**

**Locations:** `src/js/ui/orb-editor.js:129–130,154–165`; `src/js/ui/scene-panel.js:118–130`; explicit replacement callers `src/js/ui/ui.js:493–500,537–545`.

**Entry/trigger:** Type `invalid` into a surviving Orb's Exact Band Indices, blur, then Reset All Settings or import a valid Scene retaining that ID. Alternatively reject `-1` in default World Width or Maximum Live Particles, then Reset while the canonical default scalar stays unchanged.

**Expected / policy question:** Explicit whole-Scene replacement should display replacement values and clear obsolete rejected state; unrelated refresh should preserve a draft. If preserving rejected drafts across Reset/import is intended, the owner must explicitly accept the misleading visible result.

**Observed / cause:** Reset leaves `invalid`, `aria-invalid=true`, `Invalid indices` and its error while canonical bands are `[]`. Import with canonical `[12,13]` still shows the rejected text. World Width remains `-1` with error/readout `1000`; particle limit remains `-1` with error/readout `Selected: 16384`. ID reconciliation retains the controller and its invalid guard; Scene scalar refresh clears errors only when the canonical scalar changes. Only Analysis receives explicit `replaceDrafts:true` from these replacement callers.

**Reproduction / controls / evidence:** Execute `ui-native.cjs`; [JSON](20261029-081602_auralprint-116-pre-rc-evidence/ui-native.json) records `bandBeforeReset`, `bandAfterReset`, `bandAfterImport`, `worldAfterReset`, `resourcesAfterReset`. The Orb's Full spectrum chooser clears the stale invalid state and agrees with canonical `[]`, establishing recovery. Ordinary focused-draft preservation remains a valid separate contract.

**Impact / limits:** Reset/import success can leave controls representing an earlier rejected Scene draft. Persisted values remain correct; no partial import or configuration corruption shown. Chromium source-app UI only; desired cross-reset draft lifetime needs owner disposition.

**Remediation / protection:** Propagate explicit replacement intent to all field owners while preserving unrelated refresh drafts. Regressions should reset/import with unchanged scalar defaults and surviving IDs, then verify text/error/ARIA and canonical values; include focused unrelated refresh as control. Narrow recoverable discrepancy, no blocker demonstrated.

### AUD116-004 — Scrubber drag survives blur and seeks on no-button movement

**Low/P3; high confidence for controlled legal event sequence; requires owner decision.**

**Locations:** `src/js/audio/scrubber.js:37–53` registers global move/up without blur/visibility cancellation; `:221–224` seeks; `:240–242` trusts `_dragging` without inspecting mouse buttons.

**Entry/trigger:** Begin dragging, lose focus, release outside the app without a delivered mouseup, return with no button held. The reproduction explicitly dispatches blur and supplies subsequent CDP `mouseMoved` with `buttons:0`; physical OS incidence is unverified.

**Expected:** Focus loss/no-button movement terminates drag; casual motion after returning does not seek.

**Observed / cause:** Production listeners and a real paused ten-second HTMLMediaElement seek **2 → 8 seconds** after blur on no-button movement. An ordinary mouseup followed by another movement stays at **8**, controlling for playback clock and normal cleanup. `_dragging` persists across blur and any subsequent window mousemove consumes it.

**Reproduction / evidence:** `scrubber-native.cjs`, [scrubber-native.json](20261029-081602_auralprint-116-pre-rc-evidence/scrubber-native.json). It supplies the paused native element through the public AudioEngine read seam; production Scrubber owns listeners and actual seeking. No source rewrite or fake seek implementation; no pageerrors.

**Impact / limits:** Unexpected playback jump after an interrupted drag; click/mouseup recovers. Full-app OS focus loss, recording of such a seek and physical pointer devices were not certified. Nonprimary-click seeking was observed but excluded as a separate issue because intent is ambiguous.

**Remediation / protection:** Cancel on blur/hidden state and reject movement without the intended held button; preserve existing touchcancel/reset/idempotent init cleanup. Test interrupted drag versus ordinary held drag, delivered mouseup, reset and touchcancel. This is separate from October 6's repaired touchcancel defect; ancestry was not bisected to claim a new regression. Recoverable, no blocker on measured impact.

### AUD116-005 — Injected File-tap cleanup refusal is reported as success

**Informational; high confidence in injected behavior, native reachability unestablished; requires owner decision. Not an ordinary-user RC blocker.**

**Locations:** `src/js/audio/audio-engine.js:91–98,125–137,599–613`; `src/js/recording/recorder-engine.js:684–697,1204–1227`.

**Trigger / expected contract:** On a real File graph/native MediaStreamDestination, replace only the AudioEngine-owned tap track's `stop()` with a throwing function. Under AGENTS' cleanup-failure contract, required release failure should retain prior export/ownership evidence and block retry.

**Observed / cause / control:** Unpatched control ends the tap and commits a valid export. Injected refusal leaves the old tap track `live`, yet finalization reports `complete`, `nativeShutdown='confirmed-stopped'`, revokes/replaces the previous export and permits another Start. AudioEngine catches individual stop errors and drops its destination; RecorderEngine only recognizes an exception escaping `releaseStream()`.

**Reproduction / evidence:** `recorder-native.cjs`, [recorder-native.json](20261029-081602_auralprint-116-pre-rc-evidence/recorder-native.json), `fileCleanupControl` / `failedCleanup` observations. The probe retains native references for observation and invokes the original stop afterward. Native encoder/render cleanup succeeds.

**Impact / strict limit:** If a supported backend can refuse this release, ownership/transaction reporting is wrong. **Standard MediaStreamTrack.stop has no ordinary specified throwing branch.** The injected behavior is not an observed device failure, URL-triggered exploit, real leak-duration measurement or security finding. It must not inflate blocker totals.

**Direction / regression / disposition:** Decide whether lower-layer refusal is a supported failure model. If yes, propagate release outcome and retain owner evidence before export commit; test the actual AudioEngine seam with normal release as control. Otherwise qualify that guarantee. Broader backend hardening can be a Build 117 candidate after explicit owner disposition; no implementation done.

### AUD116-006 — Original Ubuntu duplicate-save watcher failure remains unexplained

**Informational; high confidence in observations, historical cause unresolved; requires owner decision. Classification: unresolved intermittent failure.**

**Locations:** `scripts/watch.mjs:16,35–78,100–108,113–185,218–241`; `tests/watch-integration.test.js:232–250` duplicate-save case and `scripts/test-support/watch-harness.mjs:12–29,46–56`.

**Historical entry:** [run 40830745837, attempt 1](https://github.com/cosmicdance-4-2-0/Auralprint1/actions/runs/40830745837/attempts/1) at feature-merge SHA `644266857be379991361cf3662236d185d876ff4` failed because duplicate saves produced **three extra completed Python assembler launches**, without successful-publication count increasing. The original job excerpt was independently fetched and saved, rather than inferring the failure from a later passing attempt.

**Expected / current observations:** Byte-identical settled inputs should skip duplicate assembly; assemblers must serialize and only current complete outputs publish. Six independent sequential exact watcher runs pass **25 tests each**. Ten ordinary identical writes in the new probe produce zero extra launches. Deliberately pause 250 ms between `open(O_TRUNC)` and writing the same template bytes: one extra assembler sees an empty template, packaging rejects it, no success is reported and prior output stays byte-identical. This demonstrates sensitivity to an observable intermediate file state; it does **not** reproduce the historical three-launch sequence or prove that descheduling caused CI failure.

**Strongest source explanation:** Native save events debounce 50 ms; byte snapshots/fingerprints deduplicate against last success. esbuild result-reference or input changes during Python assembly discard the stage and queue another transaction. Serial drain prevents concurrent transactions. A transient but genuinely different byte snapshot can launch work and then fail/reject. No current source-level proof attributes the original run to that mechanism or a faulty test oracle.

**Reproduction / evidence:** In a disposable checkout run the existing `node --test tests/watch-integration.test.js`, then `node docs/audits/20261029-081602_auralprint-116-pre-rc-evidence/watch-save-window.mjs`. See [controlled results](20261029-081602_auralprint-116-pre-rc-evidence/watch-save-window.json), [original CI excerpt](20261029-081602_auralprint-116-pre-rc-evidence/watch-original-ci.txt), and verification metadata. Probe uses private temporary projects; no shared output competition. The deliberate delay is a model of possible writer scheduling, not observed CI hardware timing.

**Impact / limits:** Extra redundant work is demonstrated under the controlled window; stale/truncated publication or overlapping assemblers was not. The original unclosed acceptance gate prevents claiming watcher diagnosis complete. Linux Debian repeats do not reproduce the original Ubuntu load/Windows save behavior.

**Recommended direction / protection:** Reproduce with timestamped editor syscalls, source byte digests, esbuild onStart/onEnd/result generations, stage signature and Python launch/commit events on Ubuntu under load. Preserve duplicate-save and current-input publication assertions. Do not weaken the oracle or relabel the original harmless/fixed without causal evidence. Owner must disposition the unresolved gate before RC; this audit does not invent a second confirmed blocker.

## Prior-defect regression review

| Earlier lead | Independently established current disposition |
| --- | --- |
| October 6 RC-01 / RC-09 unsafe-ID progress / later explicit identity theft | Exact unsafe-Number successor/reservation cases pass and source uses BigInt plus pre-reservation. AUD116-001 is a separate length/work amplification left by that mechanism; the former infinite-loop trigger is not claimed regressed. |
| RC-02–04 File/batch/Play/source ownership | Current entry/request identity and attachment fences traced; twelve new Queue/live cases plus existing native RC-03/04 scenarios pass. These bounded cases do not certify every device/promise schedule. |
| RC-05 finalizing EOF | Current UI stores pending EOF with source/media/request/repeat context and consumes after unlock; existing suite passes. New native finalization/EOF race not independently reproduced this pass; status is source/tests, not complete recertification. |
| RC-06 prior export preservation / RC-19 disposal | Native success followed by next capture failure preserves fetchable export; Cancel preserves it; Dispose makes encoder inactive, ends owned video, preserves upstream audio and revokes export. AUD116-005 is separately qualified injected lower-owner failure. |
| RC-07/08 band coverage/FFT coordinates; October 24 AUD-004 excessive Bark domain | Current bounded frequency admission rejects 384001/1e307; 120 numerical/200 bank cases and native known stereo frequencies pass. Bin count is derived from real frequency buffer length. Adjacent inclusive-bin overlap remains deliberate Build 118 scope; no partition redesign inferred. |
| RC-10 Ring update lag / RC-18 free-Ring pause / RC-15 timing-resource bypass | Independent runtime probes establish same-frame Orb lock/free pause/real TTL aging; immutable emission bounds and 10,000 policy frames hold. Expert limits remain operational, not performance promises; full million-retention standard test is skipped. |
| RC-14 touchcancel / RC-16 malformed band references | Touchcancel now clears drag; normalization requires integer numeric IDs and compact grammar is validated. AUD116-004 is a different mouse interruption path. |
| RC-17 phase precision / October 24 AUD-002 drafts / AUD-003 native sliders | Current Orb/Analysis/Ring config-range and draft paths pass native editing gate and direct source trace. Scene palette and surviving rejected drafts are the separate residual owners described in AUD116-002/003. |
| RC-20 metadata/assets / RC-21 picker help / RC-22 type-aware removal | Packaged assets/relative requests pass; chooser help inspected; native Orb ID `spectral-ring` names/removes the Orb and preserves Ring. Hostile ID becomes text, creates no image or untrusted DOM ID. |
| October 24 AUD-001 ended-live publication | Acquired native track ended during held attachment recovers idle, preserves Queue and releases stale source; prepublication readiness and listeners traced. No claim of physical race incidence/exhaustive schedules. |
| October 24 AUD-005 missing authored-camera CI gate | Workflow now runs camera/editing/preset/candidate gates on Ubuntu; lead ran those gates. Current startup pose checked before first paint. Passing gate does not prove all future mutants or other browser engines are caught. |
| Older AUD-009/012/013 and positive-fade approximation | Current bounded encoded-recording policy exists; total browser/GPU/encoder memory remains unbounded by that metric. Hidden/high-count allocation, constrained-device performance, duplicate legacy names and spectral partition remain their documented later-stage/acceptance owners. No new crash or blanket safety conclusion was established. |

## Verification results

Commands ran sequentially against shared generated output. Independent watcher/build fault probes used private copies. Root's final clean test rerun occurred after the browser gates to remove scratch-test discovery ambiguity; source did not change between runs.

| Command / check | Actual result and qualification |
| --- | --- |
| `npm ci` | Initial network-stalled attempt terminated. Locked installation then passed as `npm ci --offline --cache /workspace/auralprint-environment/npm-cache`; four packages installed, no package changes. |
| `npm test` — final clean discovery | Exit 0: **1,456 tests; 1,455 passed, 0 failed, 1 skipped**, 27.67 seconds. One standard full-million-retention boundary test skipped; it is not passed coverage. |
| `npm run build` | Exit 0; source JS/CSS bundled into portable and complete hosted edition. |
| `python scripts/verify_distribution.py` | Exit 0; nine packaged files verified; hashes above and full JSON saved. |
| `npm run test:browser` | Exit 0; portable/hosted authored startup before first frame, nondefault world, independent recipients, invalid atomicity, C/F/Restore and legacy migration; Chromium override. |
| `npm run test:browser:editing` | Exit 0; source/portable/hosted, DPR1, forty sliders, native steps/readout/ARIA, delayed real File/drafts, frequency/Nyquist and Ring lock. Not DPR2 editing certification. |
| `npm run test:browser:presets` | Exit 0; Chromium source/portable/hosted compression/startup/cancel/atomicity/legacy checks and within-Chromium interoperability; no Firefox/WebKit. Gate's own offline array is empty. |
| `node scripts/validate-116-candidate.cjs` | Exit 0; source/portable/hosted controls DPR1/2, Queue cases at DPR1, Canvas history/workload/reference comparisons DPR1/2, no reported errors. Historical comparator refs available locally. |
| Independent positive/boundary probes | 39 preset cases; 120 edge + 200 bank cases; stereo peaks near 376.83/1125.11 Hz from 375/1125 Hz input at 44.1 kHz engine; twelve Queue/live races; 10,000 governor frames/345 lifecycles; 10,000 inverses/fits; 264 Fade0 pixel matches; 1,056 positive draws; short native recording/FFmpeg controls. |
| HTTP offline-after-load, new probe | Portable/hosted DPR1/2 at 375×667; browser context set offline after boot; Camera reveal/Reset/frames operate, no pageerrors/failed/external requests. This is not fresh offline first-load proof. |
| Direct `file://` portable launch | Attempted; browser rejected with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Environment block, not an application failure and not a passing direct-file check. |
| Reproducibility / watcher | Two isolated builds/verifier hashes identical; six isolated 25-test watcher runs pass; original failure unresolved as AUD116-006. |
| Source and protected-artifact integrity | `git fsck`, exact commit/tree, import/metafile inventory and final tracked-diff inspection; only new report/evidence added. No source/test/schema/config/CI/Canon/history changes. |

Compact machine-readable metadata, raw observations and standalone harnesses are in [the evidence directory](20261029-081602_auralprint-116-pre-rc-evidence/README.md). Videos, screenshots, copied trees, dependency installs and large stdout logs remain untracked under `work/` or disposable directories; none is a production deliverable. Browser console/request observations are saved in each probe's JSON; the deliberate recorder failure's console error is identified rather than hidden.

## Remaining actions and limitations

1. Correct AUD116-001 in a separate scoped implementation and repeat the bounded native/Node controls on its exact new SHA before considering RC.
2. Owner-disposition the three recoverable Low findings and the supported model for tap cleanup failure; keep observed behavior separate from product-policy acceptance.
3. Close or explicitly disposition the original Ubuntu watcher gate using causal evidence. Passing repeat runs alone do not supply a diagnosis.
4. Complete owner-device positive-fade/join review and physical browser/media/distribution gates. Maintain Build 115 immutability and treat all RC/release actions as separately authorized.
5. Keep broader high-count DOM, million-particle rendering, hidden allocations, long-session precision/GC and encoder/native memory profiling in Build 117 unless a concrete release failure is established. Spectral partition/name ambiguity remains Build 118 scope.

No physical microphone, system/display-audio dialog, real device termination, Safari, Firefox/WebKit, Windows/macOS UI, physical touch, actual monitor DPR handoff, screen reader, full external-player/A-V fidelity, download filesystem, long-duration capture or constrained-hardware FPS/memory acceptance was established. Synthetic/native generated streams prove the source/browser seams they exercise; they do not certify hardware. The decoder timeout is a lower bound, not an infinite-loop or crash result. Positive-fade no-throw tests and straight gradients do not prove ideal artistic compositing at every join. Source/file/API paths not specifically exercised remain statically reviewed or test-covered as labeled, not silently passed.

Only this new audit and compact evidence are delivery changes. No fixes, schema changes, refactors, CI edits, historical rewrites, tags, merge, deployment, release or RC promotion were performed.
