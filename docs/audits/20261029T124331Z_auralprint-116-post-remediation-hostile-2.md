# Auralprint 116 — post-remediation hostile audit #2

Audit only. Evidence collection began 2026-10-29 at 12:43:31 UTC; report completed the same UTC date. No application corrections or release decisions are included.

## 1. Executive assessment and exact baseline

**Recommendation: retain Build 116 as a feature candidate; do not promote it to RC on this assessment.** Two new P3 defects are verified: multi-contact touch seeking uses the wrong contact, and repeated public UI initialization duplicates Repeat handlers. Neither establishes a P0/P1/P2 ordinary-boot blocker. The repeatedly failing Ubuntu watcher gate remains causally unresolved. Owner disposition and the outstanding device/visual/distribution gates are still necessary.

The original Orb-ID amplification, palette precision, explicit draft replacement and interrupted-mouse-drag attacks did not defeat the corrections in this pass. Independent attacks extend those suites; the new touch finding qualifies the scrubber's broader ownership behavior without declaring the mouse repair ineffective. Passing gates are evidence for their exercised paths, not release authorization.

| Baseline item | Verified value |
| --- | --- |
| Repository | `cosmicdance-4-2-0/Auralprint1`, `/workspace/Auralprint1` |
| Accepted and upstream `main` | `332d1cd312f0060cd043f1dc48a001c662b3788f` |
| Accepted source tree | `045b81d9b82915652c89e29a562f939fee279eb0` |
| Branch / audited branch SHA before audit additions | `audit/116-post-remediation-hostile-2` / `332d1cd312f0060cd043f1dc48a001c662b3788f` |
| Evidence commit, before this report | `4fcb037c15c5c7b4aff35c0edef14a7a566302b2` |
| Version / writer schema | `v0.1.16-candidate` / 16 |
| Protected Build 115 Canon blob | `fb539ed8e03f8bd0c62951bff9f4a73ee802b11b`, unchanged |

The initial clean `work` checkout was stale at `6e795e40265d1fc111e6c3890988201a84e73a9d`. The GitHub API independently confirmed accepted upstream `main`. Missing baseline blobs/tree and the signed commit were retrieved and their exact Git hashes verified before tests; later a permission-enabled full refetch restored complete ancestry and confirmed the same remote SHA. `git fsck --full --no-reflogs` completed, with only a dangling scratch reconstruction object. No stale-checkout result is counted as candidate validation. Delivery commits descend from the accepted source; the final audit branch commit is identified in the draft PR.

Requirements came from `AGENTS.md`, `ROADMAP.md`, `docs/development/build-116.md`, current interfaces/CONFIG/schemas, the October 24 and October 29 audits, and PR #91–93 remediation records. Historical reports were leads, not correctness certificates. Build 116F/G, 117/118 features, existing tests, CI, dependencies, frozen fixtures and Canon were not changed.

Environment: Debian GNU/Linux 13, Linux 6.18.55 x86_64; Node 24.19.0, npm 11.9.0, Python 3.12.14, esbuild 0.25.12, Playwright 1.64.1. Native checks used system Chromium **151.0.7922.173** via `AP_CHROMIUM_PATH=/usr/bin/chromium`, not Playwright's downloaded browser. Firefox/WebKit executables were absent. Locked offline installation and local HTTP/child processes required permission-expanded execution; the first restricted esbuild-install spawn failure is environment setup evidence, not an application failure.

## 2. Production inventory and ownership review

All **65 production JavaScript modules** are reachable from template → `main.js`. Independent import traversal agrees exactly with actual esbuild JS inputs. [Inventory and source hashes](20261029T124331Z_auralprint-116-r2-evidence/inventory.json) enumerate every edge and packaging/configuration entry point. Paths below are under `src/js`, with `.js` omitted.

- Root (1): `main`.
- Core (17): `application-preferences`, `band-frequency`, `camera-fit`, `camera-projection`, `camera-state`, `config`, `constants`, `orb-admission`, `orb-collection`, `particle-safety`, `preferences`, `spaces`, `state`, `timing`, `utils`, `world-geometry`, `world-settings`.
- Presets (7): `compact-preset`, `deflate-transport`, `preset-codec`, `preset-limits`, `schema-13-baseline`, `schema-16-baseline`, `url-preset`.
- Audio (12): `analysis-frame`, `audio-engine`, `band-bank-controller`, `band-bank`, `input-source-manager`, `queue`, `scrubber`, `waveform-admission`, `waveform-coordinator`, `waveform-extractor`, `waveform-metadata`, `waveform-policy`.
- Recording (2): `recorder-engine`, `recording-policy`.
- Render (10): `camera-fit-content`, `color-policy`, `orb-runtime`, `orb`, `particle-governor`, `particle-list`, `renderer`, `trace-fade`, `trail-system`, `visualizer-runtime`.
- UI (16): `analysis-panel`, `camera-actions`, `camera-controls`, `camera-interaction`, `config-range`, `dom-cache`, `orb-band-picker`, `orb-editor`, `recording-resources`, `scene-camera-actions`, `scene-panel`, `spectral-ring-editor`, `ui`, `visualizers-panel`, `waveform-options`, `workspace`.

Additional entry points reviewed: `src/index.template.html`, all imported CSS, root `version`, `package.json`/lock, `scripts/build.mjs`, `watch.mjs`, `assemble_single_file.py`, `distribution.py`, `verify_distribution.py`, browser/test harnesses and `.github/workflows/ci.yml`. Branding stays flat for packaged assets; the unused OG subtree is not silently added to distributions.

| Subsystem and production transitions | Source-derived ownership and adversarial verification |
| --- | --- |
| CONFIG → preferences → runtime.settings → state | Frozen CONFIG owns policy. `resolveSettings()` derives runtime settings and frozen world geometry. Application waveform/recording policy persists separately. Reviewed defaults, bounds, normalization and edit/import/reset synchronization; independent precision/schema cases and existing pipeline tests passed. |
| Preset codec / compact / URL transport | Structural/byte/count/range admission precedes replacement; schema dispatch and frozen reconstruction stay separate from transport. Import generations plus preference/hash signatures fence asynchronous work. Main awaits winning startup import before initialization/frame scheduling. Native invalid/stale/superseded import and startup gates passed. |
| Orb definitions → collection → runtime/editor | Collection alone repairs identity; runtime requires unique canonical IDs. Reconciliation preserves surviving objects/trails/adapters, while explicit import/reset recreates simulation. New dense reservation, raw duplicate-ID transport, hostile text IDs and complex collection/focus lifecycles passed within their bounds. |
| Audio/File Queue/transport | InputSourceManager owns source tracks and activation tokens; AudioEngine owns graph/media/URLs and the File tap. UI owns File-entry/request fences and one EOF dispatch. Queue revisions fence optional clear-on-source-exit. Native acquisition, cancellation, Play, EOF/finalization and accepted-source policy gates passed. |
| AnalysisFrame/FFT/bands | Frame views reference producer arrays; consumers read them. Channel selection uses L/R/C energies independently; global spectrum remains actual C. Actual sample rate constrains effective ceiling. Independent constant-bin/collapsed-Nyquist and perceptual-edge cases passed; native stereo controls measured distinct L/R peaks and real C mixture. |
| Orb/Ring/time/resources | VisualizerRuntime owns composition and a shared governor; Orb precedes locked Ring update. TrailSystem/governor create/retire particles; renderer reads history. Separate motion/emission/age clocks remain. New 1,500 policy/reorder frames preserved accounting/ceilings/disposal; existing fairness, pause, expiry, spacing and same-frame Ring tests passed. |
| World/Camera/viewport/DPR | World fractions and retained positions are independent of backing dimensions. Live camera and authored camera are distinct snapshots. Projection/inverse/fit share short-side geometry and CSS-sized marks. 2,000 independent projection pairs, native camera gates and existing default/schema-10 framing tests passed. |
| Canvas/Trace/color | Renderer projects current world points and reads retained lists. Fade 0 uses the continuous-path branch; positive fades use bounded projected scratch and the accepted join approximation. Current native candidate comparator passed at DPR 1/2. Color policy retains targeted inherited dominance versus explicit global C and shared Scene palette. |
| Scrubber/waveform | Waveform coordinator retains one occupied pipeline until actual read/decode settlement, plus the newest pending intent. Metadata/PCM policy is separate from playback. Mouse lifecycle correction passed; new trusted multi-touch input demonstrates R2-001. No malformed-container memory guarantee is inferred from estimated PCM admission. |
| Recording/export | Session tokens/timers fence callbacks before abort/dispose; merged streams own no shared tracks. Candidate export and required cleanup precede prior-export replacement. Native short export/failure/retry/disposal and EOF gates passed; deferred AUD116-005 is not reopened. |
| UI/editors/workspace | Feature owners retain controllers and invalidate by settings/band references; explicit replacement propagates draft intent. Tooltips release removed feedback handlers. Native focus/caret/drafts/panels passed; coordinator reinitialization remains R2-002 despite feature-level init guards. |
| Build/distribution/watch/CI | Build and watch share assembler/distribution contracts. Watch captures esbuild source bytes, stages output, checks current inputs/results and serializes Python work. Nine packaged files matched across two builds. Historical Ubuntu duplicate-save assertion remains R2-003; Windows remote success does not establish its cause. |

Inventory completeness does not mean every branch or state combination was executed. The table separates ownership review, executed boundary cases and limits; the following findings and coverage gaps remain independent of passing subsystem checks.

## 3. Findings index

| ID | Severity / evidence category | Result |
| --- | --- | --- |
| AUD116-R2-001 | P3 / verified defect | Scrubber follows the first document touch and cancels for unrelated contact endings. |
| AUD116-R2-002 | P3 / verified defect, public reinitialization seam | A second UI wiring pass duplicates Repeat action handlers. |
| AUD116-R2-003 | Informational / unresolved historical hypothesis, verified diagnostic observations | AUD116-006 still lacks causal CI evidence; an interrupted save independently reproduces its assertion without incorrect publication. |

Totals: **0 P0, 0 P1, 0 P2, 2 P3, 1 Informational**. No additional source-proven defect is elevated without execution. Coverage gaps below are not findings or passing checks.

## 4. Detailed verified findings

### AUD116-R2-001 — Touch gesture ownership is not bound to a contact

**Locations/SHA:** [scrubber.js:238](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/332d1cd312f0060cd043f1dc48a001c662b3788f/src/js/audio/scrubber.js#L238), especially line 241 (`e.touches[0]`), handlers at lines 262–277. Window touch handlers are registered at lines 49–52. All references use accepted SHA `332d1cd312f0060cd043f1dc48a001c662b3788f`.

**Contract/entry:** Deterministic seeking and gesture ownership in AGENTS §3.3 / AUD116-004. A contact on the scrubber should own its seek; a contact on the main canvas should not redirect or terminate that drag. This does not require interpreting a pinch as a seek gesture.

**Reproduction:** Run `native-r2.cjs` as documented in the evidence README. It uses each actual application edition, a real ten-second WAV through File ingestion, paused native playback and trusted Chromium CDP contacts:

1. Hold contact A on the main canvas just above the scrubber, horizontally at 10% of its width.
2. Add B on the scrubber at 80%.
3. Move only A to 30%; B remains at 80%.
4. End A (the trace verifies A's identifier), then move remaining B to 60%.
5. Separately, begin the scrubber contact first at 20%, add/end an outside contact and move the original contact to 60%.

| Expected ownership result | Source | Portable | Hosted |
| --- | ---: | ---: | ---: |
| B starts: seek about 8 s | 1 s | 1 s | 1 s |
| A moves: remain about 8 s | 3 s | 3 s | 3 s |
| A ends, B moves: seek about 6 s | 3 s | 3 s | 3 s |
| Scrubber-first control after unrelated end: about 6 s | 2 s | 2 s | 2 s |

**Cause/evidence:** `touches` contains contacts from all targets. No touch identifier is retained; `onTouchMove` reads its first entry even for a move targeted at `#c`, and any window `touchend` clears ownership. [Native observations](20261029T124331Z_auralprint-116-r2-evidence/native-r2.json) retain target, trusted flag, all identifiers, changed identifiers and media time. High confidence for these supported Chromium event sequences. Single-contact 20%→60% controls produce 2→6 s in all editions; 104 existing native scrubber observations also pass. These controls exclude playback-clock or general touch failure.

**Impact/scope:** Recoverable wrong-position seeking and interrupted dragging during ordinary multi-contact input. This is separate from the repaired lost-mouseup condition; no ancestry-based regression claim or physical-device incidence is made. Playback, camera and recorder corruption are not demonstrated.

**Minimal recommendation:** Retain the initiating scrubber contact identifier, read that contact during movement, and terminate only on that contact's end/cancel or existing lifecycle cancellation. Preserve mouse/touch separation, default prevention and reset/load cleanup. **Release disposition:** P3, owner decision recommended before RC; no correction or waiver is authorized by this audit.

### AUD116-R2-002 — Coordinator initialization duplicates action listeners

**Locations/SHA:** [ui.js:1345](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/332d1cd312f0060cd043f1dc48a001c662b3788f/src/js/ui/ui.js#L1345) (`wireControls`) and [ui.js:1959](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/332d1cd312f0060cd043f1dc48a001c662b3788f/src/js/ui/ui.js#L1959) (new anonymous Repeat listener each call), same accepted SHA.

**Contract/entry:** AGENTS lines 181–182 explicitly require: “Listener initialization is idempotent for the same controls.” The public exported `UI.wireControls()` is the initialization entry point. Feature guards and the recorder WeakSet do not guard all coordinator listeners.

**Reproduction/expected/observed:** In the native source application, load and pause a File. On the initial boot, one real Repeat click changes Off→One. Cycle back to Off. Import `UI` through its public source module and call `UI.wireControls()` once more on the existing document/controls. One real Repeat click now changes **Off→All**, executing the action twice. No private state mutation or production rewrite is needed. The same script then presses Space: it toggles pause once, a useful negative control because that handler checks `defaultPrevented`.

[The final native record](20261029T124331Z_auralprint-116-r2-evidence/native-r2.json), `publicUiReinit`, records two initialization calls, both Repeat observations and the Space control; zero page errors. High confidence in the contract violation. Source proves the anonymous handlers have separate identity and are never removed by another wiring call.

**Impact/scope:** Reinitialization changes UI behavior and retains additional listeners. **Production boot calls this routine once; no ordinary product control that performs a second wiring was found.** This is a limited public-lifecycle defect, not evidence that normal first boot duplicates actions or that every shortcut runs twice. Reinitialization of built editions was not separately invoked.

**Minimal recommendation:** Give the coordinator one wiring owner for the same controls, preserving existing File/EOF authority and feature lifecycle behavior. Validate repeated wiring with real Repeat, transport and global input. An intentional single-use exception would require owner disposition of the explicit contract. **Release disposition:** P3; no ordinary-boot RC blocker established; no implementation or exception approved here.

## 5. Independent challenge of the four remediations

| Remediation | Existing focused gate and independent challenge | Assessment/limits |
| --- | --- | --- |
| AUD116-001 / PR #91 | 15 bounded native cases passed. New dense generator-name reservations at 4,096 Orbs preserve later IDs; normalization is idempotent; capacity Add/Duplicate refuse before mutation; remove/Add remains unique. A **raw** schema-16 DEFLATE payload, not a writer-repaired input, contains 4,096 copies of a Unicode opaque ID: 12,652,576 JSON bytes / 35,007 hash characters. Real decoding preserves one explicit ID and emits repairs of at most seven characters; re-encoding preserves the repaired identities. New native compressed startup also preserves `__proto__`, `constructor`, `spectral-ring`, NUL/newline, Unicode and an 8,192-digit ID. | No allocator defect found. Raw transport/import and native editor startup are separate probes: maximum-count import does not certify maximum-count interactive performance. Generated-length/resource bounds are supported; timing observations are not guarantees. |
| AUD116-002 / PR #92 | All three editions passed the 105-observation UI-state gate, including canonical `.375/.425/12.5`, pointer/keyboard/ARIA/persistence. Independent plain/compressed imports use `.10000000000000002`, `.37499999999999994`, `.37500000000000006`, unrelated world editing and native Left. Exact readouts and untouched persistence survive. The near-grid value follows the documented arithmetic membership tolerance on edit. | Original precision/readout defect not reproduced; canonical values stay exact until editing. This does not certify physical assistive technology or every engine's slider serialization. |
| AUD116-003 / PR #92 | Gate passed reset, plain/compressed success, failed/superseded imports, same IDs/scalars, invalid/active drafts, late events and structural actions. Independent **84 complex reorders**, three focus positions among 12 Orbs with interleaved sibling addition/removal, retain exact backward selection/caret, rejected draft, controller, runtime object and particle head with zero blurs. | Focus-preserving sibling ordering survived the more complex test. Reorder uses the real public coordination/reconciliation seams because no product reorder control exists. Imports intentionally reset simulation; ordinary reorder/history preservation is tested separately. |
| AUD116-004 / PR #93 | 104 native positions in isolated/source/portable/hosted passed: released/held button transitions, lost mouseup, blur, ordinary/outside drag, touchend/cancel and recovery. Node tests cover repeated same/replacement canvas init, listener cleanup, visibility, reset/load and replacement media. New trusted multi-contact sequences fail R2-001. | The mouse repair survives. Broader touch-contact ownership does not. Physical OS blur/lost-mouseup incidence, physical touch and all mixed-device schedules remain unverified. |

The independent raw opaque transport consumed bounded work (observed approximately 459 ms in this run), not a repeat of the original 147-character numeric attack. Controlled native/pure harness setup errors were corrected before final observations; they are not counted as application defects. Reproduction scripts and qualified final data are in [the evidence directory](20261029T124331Z_auralprint-116-r2-evidence/README.md).

## 6. AUD116-R2-003 — dedicated AUD116-006 watcher investigation

**Informational; original cause unresolved.** Source locations at accepted SHA: [watch.mjs:104](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/332d1cd312f0060cd043f1dc48a001c662b3788f/scripts/watch.mjs#L104), candidate snapshot/dedup lines 113–131, assembly fencing/publication lines 149–173, drain lines 176–185; `scripts/build.mjs` Python ownership; [test assertion](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/332d1cd312f0060cd043f1dc48a001c662b3788f/tests/watch-integration.test.js#L233); CI workflow. These four owners are byte-identical between the earlier failing feature merge and accepted baseline.

### Historical evidence, kept distinct

- [40830745837 attempt 1](https://github.com/cosmicdance-4-2-0/Auralprint1/actions/runs/40830745837/attempts/1), SHA `644266857be379991361cf3662236d185d876ff4`: Ubuntu assertion `Duplicate saves launched an assembler`; original evidence contains three extra complete invocations. Windows passed.
- [40873236076 attempt 1](https://github.com/cosmicdance-4-2-0/Auralprint1/actions/runs/40873236076/attempts/1), exact accepted SHA: the same assertion; trace grows by one complete start/end pair. Windows passed.
- Latest attempt 2 passed on **the identical accepted SHA**. The API and both original failing job logs were independently retrieved; [compact excerpts](20261029T124331Z_auralprint-116-r2-evidence/ci-evidence.json) retain run/job/attempt identity. The rerun establishes neither causality nor absence of the original failure.

### What the code actually fences

Native directory notifications call `queue()`, whose timer coalesces for 50 ms; notifications alone do not prove changed bytes. esbuild `onLoad` captures source bytes for each JS/CSS result; `write:false` keeps queued bundle contents fixed. Assembly combines those sources with current version/template/branding, compares captured inputs with live bytes, then fingerprints them. Only equality with **last successful publication** skips assembly; the signature is not a set of every previously seen attempt.

During Python work, result identity, active rebuilds, byte equality and the extra-input fingerprint fence publication. Changed work stays dirty and the stage is discarded. The serial drain prevents overlapping transactions. A pending dirty iteration can run immediately inside the active drain: the 50 ms timer is **not a universal minimum stable-content interval**. Native notifications and byte reads can race an editor's truncate/write save.

### New bounded observations

Six complete traced ordinary integration sequences passed **25 tests each: 150 pass, 0 fail, 0 skip**. Two sequences also ran with two bounded CPU workers. Ten ordinary same-byte saves produced candidates matching `lastSuccess` and **zero extra Python launches**. Added tracing is confined to disposable copies and timestamps native events, esbuild loads/start/end, candidate input lengths/hashes, signatures, stages, actual Python PIDs and publication. Existing production/test files were not edited. Tracing changes scheduling and can mask an intermittent race; passing traced runs do not disprove either CI failure.

A deterministic scheduling model pauses one duplicate-content save between open/truncate and write for 90 ms. It reproduces the **same assertion**, with one complete extra Python invocation. The final trace is:

| Time relative to save start | Observed event |
| --- | --- |
| 0 ms | Save begins; prior successful output hashes recorded. |
| 54 ms | Candidate has a new signature; **only the template differs**, length 0, SHA-256 `e3b0c442…b855`. JS/CSS snapshots match the previous successful candidate. |
| 56 ms | New staged assembler invocation scheduled with that signature. |
| 87 ms | Actual Python process starts. |
| 91 ms | Original 36,856-byte template restored. |
| 95 / 102 ms | Python ends; transaction reports exit 1 (empty staged template rejected). |
| 106 ms | Restored candidate signature equals the previous successful signature; deduplicated. |
| 696 ms | Successful-publication count remains 19; both live HTML hashes are unchanged; all nine packaged files verify. |

The controlled child reports **23 pass / 2 fail / 0 skip**: one intended duplicate-save assertion and its containing test. These are experimental failures, not concealed as a passing suite. [Hashes, signatures, timestamps and output controls](20261029T124331Z_auralprint-116-r2-evidence/watch-results.json) support the table. The full raw event stream is reproducible with `watch-trace.mjs` and remains outside the commit.

### Causal limits, risk and smallest next experiment

**No evidence determines that CI observed this transient.** Its logs lack native-event order, per-candidate bytes/hashes and launch timestamps. An unsettled earlier transaction/result notification could also fall inside the test's observation window. A success log plus a 600 ms observation does not prove that all source notifications and transactions were settled at the starting boundary. Conversely, no source proof shows that the test oracle alone caused the historical failures.

The controlled run establishes save-snapshot sensitivity and rejected extra process work. It does **not** demonstrate stale/mismatched published bundles, corrupt output, concurrent assemblers, or a shipped-runtime defect. A valid intermediate input could be treated as current input if it lasts through the fences; the watcher has no editor “save complete” signal. Universal rejection of all intermediate states is not established. The demonstrated rejection retained both prior editions, and subsequent normal saves/recovery/shutdown passed.

Concrete risk is repeated developer/CI assembly and an unresolved release gate. Incorrect release output has **not** been shown. Debian CPU controls do not reproduce Ubuntu runner scheduling; Windows success is not an attribution to either GitHub or Auralprint.

**Smallest next diagnostic:** run the exact full Node suite at this SHA on Ubuntu using the disposable trace wrapper, without changing the assertions or production watcher. Retain one failure's write start/end times, candidate file-set/byte hashes, last-success/previously-seen signature, esbuild generations, real Python start/end and publication/input hashes. Distinguish (a) a transient new byte snapshot, (b) an already successful signature unexpectedly launching, and (c) a launch already pending before duplicate writes. If needed, add a bounded syscall/scheduling trace specifically around template open/truncate/write. Do not replace the oracle or refactor the watcher before that evidence. **Disposition recommendation:** keep AUD116-006 unresolved pending this experiment or explicit owner disposition; this audit grants neither closure nor RC approval.

## 7. Cross-system, recording and release contracts

The following checks combine owners rather than treating isolated passes as integration proof:

- Successful compressed startup initializes preferences, authored/live camera, BandBank, runtime composition and editors before the first scheduled application frame. Failed/reserved/stale imports retain Scene and camera. UI draft interaction cancels pending import through capture-phase intent handling. Plain/compressed schema-16 exact roundtrips and legacy 2–13 cases passed; 14/15 reject. Both schema-9 forms/top-level precedence and legacy world/spacing/camera rules passed.
- Schema-13 literal SHA-256 remains `81bc92485e95cd1e1d9446a54b7f2c714e2d341ac3e20ccc54ddfe76fdf70e2b`. Frozen reconstruction/future-CONFIG independence, ordered ranges, DEFLATE framing and published historical fixtures passed. Schema-16 has its separate frozen baseline. No experimental schema was reinterpreted.
- Queue revision/File-entry/source-activation fences passed accepted Mic/Stream policy, cancellation and transport gates. Native EOF/finalization checks covered ordinary EOF, recording across EOF, delayed terminal callback, repeat one/all, no successor and export error. No duplicate EOF owner was added.
- World/camera/DPR tests preserve runtime geometry/history and authored-camera separation. Existing renderer integration tests independently calculate familiar Build 115 fraction framing and migrated schema-10 radius/offset/waveform results at differing viewport/DPR values. Native camera gates exercise live/authored Save/Restore/Share and initialization. No subjective pixel-identical artistic framing certification is inferred.
- Native candidate rendering passed six edition/DPR control combinations and two Canvas comparison reports. Fade 0 retains continuous-path behavior. Positive fades remain the accepted single-color join partition with localized reversal/overlap approximation, requiring owner visual evaluation. The validator's historical comparison modules remain harness-only; no experimental implementation entered production.
- Native recorder export yielded success A (69,452 bytes), a failed next acquisition preserving A, then success B (111,515 bytes) replacing/revoking A once. Native disposal, transport and generated-stream ownership gates passed. These are short captures, not long-duration/native-memory/fidelity guarantees. **AUD116-005 remains owner-deferred to Build 117**; the original synthetic throwing `track.stop()` evidence was not rerun or promoted into a blocker. No distinct ordinary supported recorder failure was independently established.
- Feature-level init/listener cleanup tests and source review support bounded Scrubber, Camera, picker/tooltips and recorder ownership in their tested paths. R2-002 prevents a blanket application-reinitialization claim. No million-particle or 4,096-editor safe-device/FPS promise is made.

## 8. Verification matrix

Commands used locked dependencies, documented build prerequisites and Chromium override; native scripts' output-selection environment variables are recorded in [verification metadata](20261029T124331Z_auralprint-116-r2-evidence/verification.json) and the evidence README. Shared build outputs were generated sequentially; watcher mutations were isolated.

| Check | Result |
| --- | --- |
| `npm ci --offline --cache /workspace/auralprint-environment/npm-cache` | Passed after resolving restricted child-process setup; no dependency changes. |
| `npm test` | **1,493 tests: 1,492 pass, 0 fail, 1 skip**, 27.99 s. Skip is the opt-in full 1,048,576-particle retention boundary. |
| `npm run build`; `python3 scripts/verify_distribution.py` | Both passed twice; all nine packaged files byte-identical across builds. |
| `npm run test:browser` | Passed; current portable/hosted authored-camera gates. |
| `npm run test:browser:editing` | Passed; source/portable/hosted, 40 sliders at DPR 1. |
| `npm run test:browser:presets` | Passed; Chromium transfer/startup/atomicity/staleness/legacy checks. No Firefox/WebKit/offline pass inferred. |
| `validate-116-orb-ids.cjs` | Passed, 15 bounded native cases. |
| `validate-116-ui-state.cjs` | Passed, 105 observations, zero reported failures/errors. |
| `validate-116-scrubber.cjs` | Passed, 104 positions in four fixtures/editions, zero reported failures/errors. |
| `validate-116-candidate.cjs` | Passed, source/portable/hosted at DPR 1/2; Canvas comparisons at DPR 1/2; zero reported errors. Documented comparator commits available. |
| `benchmark-presets.mjs` | Passed current corpus. |
| Applicable native historical regressions | Export; disposal (3); live ownership (6); File cancellation (9); transport ownership (10); finalizing EOF (8); workspace focus (11); touch seek (6); stereo generated-stream/File checks all passed. Physical display capture not attempted. |
| New independent probes | Pure: **8,695 checks**, including 1,500 resource frames/2,000 projection pairs. Native: **33 control checks**, 84 complex reorders, and observations reproducing two defect families; zero page errors. Completion is not a passing correctness verdict for the defect observations. |
| Watcher investigation | Six ordinary sequences: 150 pass / 0 fail / 0 skip. Controlled interrupted save: expected 23 pass / 2 fail / 0 skip, explained above. Original CI failures remain failures. |
| Direct-file launch | Attempted; `net::ERR_BLOCKED_BY_ADMINISTRATOR`. Blocked environment check, not application pass/failure attribution. |
| Integrity | Exact upstream SHA/tree, 65-module import/build agreement, complete ancestry/fsck, protected-path comparison and whitespace checks. Only new audit files are committed. |

Portable output is **579,369 bytes**, SHA-256 `ec680ea2b8cbc660c4b4576eb3023a34426e339747649094f35b7ea30ad6b092`; hosted index is **578,200 bytes**, SHA-256 `4f1ccc1dd8b495b377a654ea055b5d9bb9fc8485e2302baf708bdf5f6ab24384`. These generated artifacts are untracked and were not promoted or substituted for Canon. The diagnostic esbuild metafile contains a timestamp and is excluded from byte-reproducibility claims.

## 9. Coverage gaps and remaining milestones

**Unverified:** physical Safari; Firefox/WebKit interoperability in this environment; Windows/macOS native interaction; real Mic/display/audio permissions/devices/termination; physical touch/OS focus loss; monitor-to-monitor DPR handoff; direct-file/offline first launch; screen readers; external download/player and full A/V fidelity; long recordings; constrained-hardware/maximum-count performance; every cross-source/decode/recorder callback schedule; every positive-fade join/overlap's subjective quality. Estimated waveform PCM and admitted encoded recording bytes do not bound total native memory. Historical standalone validators with obsolete schema assumptions were not reinterpreted as current gates.

Recommended next reviewable milestones:

1. Owner-disposition R2-001/R2-002; if corrections are authorized, use separate scoped patches and independent native retests preserving mouse, focus/history and File/EOF behavior.
2. Capture the next Ubuntu watcher failure with the diagnostic distinctions above, or explicitly disposition the unresolved gate. A rerun alone cannot close it.
3. Complete the ROADMAP/116E owner-device matrix and positive-fade/framing evaluation, including direct-file/offline, physical Safari and ordinary capture/export workflows.
4. Review the corrected/dispositioned candidate and obtain explicit owner authorization for any later RC consideration. Build 117 recorder hardening and Build 118 spectral decisions retain their existing scope.

## 10. Findings, decisions and changes

**Findings:** two limited verified defects and one unresolved watcher investigation. **Decisions:** severity and next-step recommendations are this audit's assessment; owner acceptance, waivers and RC readiness remain undecided. **Changes:** only this report and its new bounded evidence directory. No production/test/CI/dependency/schema/CONFIG/history/Canon corrections, merge, tag, deployment, public publication or release promotion. Delivery stops at the draft PR targeting `main` for owner review.
