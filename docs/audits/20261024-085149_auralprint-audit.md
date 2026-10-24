# Auralprint full-repository adversarial audit

Audit date: 2026-10-24. Timestamp in this filename is UTC. Investigation and testing only; no remediation.

## 1. Executive verdict

**Require scoped corrections and a stronger release gate before unqualified Build 116 acceptance.** No Critical or High defect was confirmed. This audit establishes **one Medium, three Low and one Informational finding**. The Medium defect admits an already-ended live source as active and prevents retry through its selected source button. Two UI defects and an extreme-input numerical defect are recoverable. The Informational finding demonstrates that CI can accept a broken authored-camera startup.

Build 116D's principal separation survives the exercised cases: authored `preferences.sceneCamera` and live `state.camera` remain independent; explicit Save/Restore, factory reset, fit, projection, resize and schema-12 sharing behave as designed. Supported migrations, including both schema-9 forms, survived the tested chains. No Build 116 production regression was established. The live-input and slider findings reproduce in the immutable Build 115 HTML; the Analysis draft assignment and Bark arithmetic also exist in that artifact. These are not grounds to rewrite the public release.

This is an inventory and adversarial investigation of all 57 reachable production JavaScript modules, with selected executable challenges at each major boundary. It is **not proof of exhaustive correctness**. Physical capture devices, other browser engines, direct portable-file launch, long recordings, and the owner's real hero scene remain unqualified.

## 2. Exact baseline and environment

| Item | Verified value |
|---|---|
| Repository | `cosmicdance-4-2-0/Auralprint1` |
| Audited immutable commit | `7421c2d4d9a2ce17f8ab5d4ba9bd30bb86bdb0d4` |
| Complete Git tree | `7533d37083e6807c663f9641d70c480e7fb64113` |
| Upstream at selection | `main` equals the owner's expected SHA; no advancement |
| Version / schema | `v0.1.16d` / `12` |
| Ancestry | PR #73 merge; parents `23b1f13b7769a9fdaf090aa54a1e9fa87f1f7695` and `9ae4f266468714ba8f4b92f48c4087fea8b7a994` |
| Audit branch | `audit/20261024-full-repository`, based on the audited SHA |
| Checkout | Isolated `/workspace/work/auralprint-audit`; initially clean |
| Original checkout | `/workspace/Auralprint1`, branch `work`, stale `23b1f13`, `v0.1.16c.a.a`; preserved |
| OS / tools | Debian 13, Linux 6.18.55 x86_64; Node 24.19.0; npm 11.9.0; Python 3.12.14; system FFmpeg/ffprobe |
| Browser | Headless Chromium 151.0.7922.173; local HTTP/request interception; DPR 1/2 and emulation |
| Dependency | Package and lock agree on `esbuild ^0.25.5`, locked/installed `0.25.12`; lockfile v3; no application runtime npm dependency |
| Protected release | `docs/Canon/0.1.15/auralprint_0.1.15.html`, Git blob `fb539ed8e03f8bd0c62951bff9f4a73ee802b11b` |

Initial sandboxed Git fetch could not reach its proxy. GitHub's connected API verified current `main`; the isolated checkout was reconstructed and its complete tree and signed commit hashes matched upstream exactly. Normal-process Git subsequently fetched and unshallowed upstream, and verified the first-parent ancestry. No mixed-revision application evidence is used.

Plain sandboxed `npm ci` encountered `EPERM` during esbuild's child-process version check. An offline, scripts-disabled installation permitted initial inspection/build; normal-process `npm ci --offline --cache /workspace/auralprint-environment/npm-cache` then succeeded. The supplied `ESBUILD_BINARY_PATH` selects the matching 0.25.12 binary. The authoritative full test run used normal process support. The initial sandboxed test attempt was terminated after its watcher stalled; it is not reported as a passing suite.

The only intended Git change is this report. Source, permanent tests, package files, distribution sources, branding, historical reports, canonical HTML and historical fixtures remain unchanged. Build output, instrumentation, mutation copies, media and exploratory logs are outside the commit.

## 3. Execution inventory and coverage map

The build metafile has **57 JS inputs**, equal to the 57 files under `src/js`; there is no additional orphan JS module omitted from that bundle. Inventory by directory:

- Root: `main` (1).
- `core` (16): `application-preferences`, `camera-fit`, `camera-projection`, `camera-state`, `config`, `constants`, `orb-admission`, `orb-collection`, `particle-safety`, `preferences`, `spaces`, `state`, `timing`, `utils`, `world-geometry`, `world-settings`.
- `audio` (12): `analysis-frame`, `audio-engine`, `band-bank-controller`, `band-bank`, `input-source-manager`, `queue`, `scrubber`, `waveform-admission`, `waveform-coordinator`, `waveform-extractor`, `waveform-metadata`, `waveform-policy`.
- `presets` (2): `preset-codec`, `url-preset`.
- `render` (9): `camera-fit-content`, `color-policy`, `orb-runtime`, `orb`, `particle-governor`, `particle-list`, `renderer`, `trail-system`, `visualizer-runtime`.
- `recording` (2): `recorder-engine`, `recording-policy`.
- `ui` (15): `analysis-panel`, `camera-actions`, `camera-controls`, `camera-interaction`, `dom-cache`, `orb-band-picker`, `orb-editor`, `recording-resources`, `scene-camera-actions`, `scene-panel`, `spectral-ring-editor`, `ui`, `visualizers-panel`, `waveform-options`, `workspace`.

All names above refer to `.js` files. This inventory establishes reachability; the following table describes actual investigation depth, rather than treating an opened file as validated.

Boot is template → `main` → resolve defaults → decode/sanitize/replace hash preferences → resolve → restore authored camera → source support → BandBank → Orbs/runtime → recorder taps → UI → scrubber → resize/visibility listeners → one animation callback. Each frame resizes presentation, samples separate motion/emission/real-time clocks, advances camera input, samples L/R/C audio, refreshes the producer-owned AnalysisFrame, updates Orbs before Ring lock, renders, then projects UI/scrubber state.

**S** = source/control-flow inspected; **E** = independently exercised in this audit; **T** = meaningful existing tests executed; **G** = not adequately tested. An E or T designation covers the stated behavior, not every path in the subsystem.

| Boundary / owners | Inspection and exercised behavior | Depth / remaining gaps |
|---|---|---|
| Configuration and state: CONFIG, preferences, state, normalizers | Frozen defaults; replacement before derivation; reference ownership; count/identity admission; application storage separation; invalid numeric/type inputs | S/E/T. 2,500 seeded malformed/valid snapshot round trips. G: arbitrary external mutation of internal module objects is not a supported UI contract. |
| Boot and timing: main, timing, spaces | Initialization order, discontinuity rebasing, visibility, held controls, independent real-age TTL and bounded emission time | S/E/T. Native clock harness and camera mutation. G: browser background scheduling on physical devices. |
| File/live input: InputSourceManager, AudioEngine, Queue | Permission, attach/resume, replacement, cancellation, event listener ownership, graph disconnects and track release; File/Stream/Mic churn | S/E/T. 20 independent File → Stream → Mic → File cycles with reversed deferred completions; stale tracks stopped; final Clear left no loaded source/graph/queue rows. AUD-001 fails. G: real permission prompts/devices. |
| Transport and scrubber | Queue entry identity, remove/Clear/EOF, repeat/navigation, delayed Play/resume, seek/drag cancellation and decoder error paths | S/E/T. Native cancellation, ownership, finalizing-EOF and emulated touch harnesses. G: OS file dragging/physical touch. |
| Waveform preparation | Admission before reads; one occupied read/decode/reduce pipeline; newest pending request; generation fences; prefix bounds; metadata confidence and manual Generate | S/T plus existing native admission harness. E for real stereo file integration. G: hostile native decoder implementations, total native memory, every media container. |
| L/R/C and frequency analysis | Splitter/combined gains; RMS; FFT coordinates; inclusive current bin policy; Nyquist, selected-target arrays and dominant context; producer reference refresh | S/E/T. Controlled 375/1125 Hz stereo file and 70 numerical edge configurations; native channel harness. AUD-004 fails. G: acoustic/device fidelity and arbitrary multichannel downmix. |
| Orb/Ring composition and color | Stable IDs/reconciliation; phase versus designed phase; selected-band averaging; Ring update dependency; Scene versus local color ownership; zero/one/N composition | S/E/T. Surrogate mirrored scene, phase/ownership tests and independent projection/history comparisons. G: owner's artistic acceptance and real artwork. |
| Particles and Trace | Heap/list accounting, oldest eviction, fairness queue, fractional emission, spacing, real-time expiry, disposal and direct suffix drawing | S/E/T. 3,000 randomized policy transitions, 60-second near-stationary simulation, sustained caps, full million-particle case. G: million-particle native drawing and hours-long heap/GC behavior. |
| World, projection and fit | Frozen reference geometry; independent axes; forward/inverse transforms; rotated content bounds, retained off-world points and CSS-sized marks | S/E/T. 10,000 matrix/inverse comparisons; 1,600 retained particle records survive 50 camera replacements, world resize and browser resize. G: physical DPR/display changes. |
| Authored camera and input | Save/Restore; C versus F; focus, pointer capture/cancel, wheel anchoring, held keys, movement cap without debt; initialization after import | S/E/T. 116D and 116C.A corrective native harnesses each pass six edition/DPR combinations, including actual main-thread stalls. G: other browser engines and physical multitouch. |
| Presets / URL | Schema dispatch 2–12, both schema-9 representations, pixel/world migration, field allowlists, full replacement and authored-only encoding | S/E/T. 100 canonical cycles per schema on a 16-Orb surrogate; rejected 4,097-Orb input leaves state unchanged. Native 180,086-character cross-instance links; same-page transport of 4,096 Orbs without truncation. G: cross-browser/system handling of multi-megabyte links. |
| Workspace/editor/accessibility | Single UI owners, ID-safe DOM, launchers, panel focus/recovery, listener patterns, draft protection, native slider behavior | S/E/T for camera, Analysis and visualizer surfaces; T for detailed picker/bulk/recording-resource controls. AUD-002/003 fail. G: screen-reader users and complete keyboard traversal on other platforms. |
| Recording/export | Start/Stop/cancel/dispose authority, native event admission, immutable session policy, previous export transaction, audio versus video track ownership, cleanup tombstones | S/E/T. Three new native exports and external decode; native failure/disposal/EOF harnesses; fault-injection tests. G: long captures, high-resolution exhaustion, device/codec combinations and precise A/V sync. |
| Build/distribution/security | esbuild options and lock, assembler escaping, branded assets, relative manifest URLs, portable/hosted equality, watch snapshots/staging/rollback/shutdown, CI | S/E/T. Build/verifier, normal watcher tests, isolated mutations and local editions. No untrusted preset/filename interpolation into executable HTML found in traced consumers. G: fresh registry advisory scan, dependency supply-chain provenance and file launch. |

Generated `.build/`, `dist/`, metafile and hosted package are disposable build outputs. `src/index.template.html`, `src/assets/branding`, source modules/CSS and root `version` are build inputs. `docs/Canon`, prior audits and fixtures are historical evidence, not editable remediation targets. Optional validation scripts are developer tooling, not application entry points.

## 4. Findings summary

Finding IDs are local to this report and do not inherit prior audits' numbering or closure status.

| ID | Severity | Finding | Evidence / regression status |
|---|---|---|---|
| [AUD-001](#aud-001-ended-live-input-is-published-as-active-and-cannot-be-retried-in-place) | Medium | Ended live input published as active; selected source retry blocked | Execution, controlled native tracks and delayed completion; source/portable/hosted and Build 115 |
| [AUD-002](#aud-002-file-completion-overwrites-a-focused-analysis-frequency-draft) | Low | File completion overwrites a focused Analysis frequency draft | Execution through real File workflow with delayed completion; pre-existing assignments in Build 115 |
| [AUD-003](#aud-003-stepped-native-sliders-misrepresent-supported-imported-values) | Low | Stepped native sliders misrepresent supported imported values | Execution in all current editions and Build 115 |
| [AUD-004](#aud-004-accepted-extreme-bark-frequencies-produce-nan-band-boundaries) | Low | Accepted extreme Bark frequencies produce NaN boundaries before audio initialization | Execution and arithmetic proof; pre-existing formula, not a Build 116 regression |
| [AUD-005](#aud-005-ci-misses-broken-authored-camera-startup) | Informational | CI misses broken authored-camera startup | Full-suite surviving mutation; optional native harness rejects it |

## 5. Detailed findings

All source locations in this section refer to audited SHA **`7421c2d4d9a2ce17f8ab5d4ba9bd30bb86bdb0d4`**. Static proof and native observations are distinguished below.

### AUD-001: Ended live input is published as active and cannot be retried in place

**Severity / confidence / owner:** Medium; confirmed by execution under controlled scheduling; InputSourceManager and source-switch UI.

**Location:** `src/js/audio/input-source-manager.js`, `activateMic` lines 547–593, `activateStream` lines 635–683, `registerFutureStreamSession` lines 753–763; `src/js/ui/ui.js`, `switchToMicMode` lines 1405–1409 and `switchToStreamMode` lines 1424–1428.

**Trigger:** An acquired audio track ends, and its `ended`/stream `inactive` signals are delivered before the manager registers lifecycle listeners. Capture delivery and AudioContext attachment both contain asynchronous boundaries. Membership in `getAudioTracks()` survives track termination.

**Expected:** Only usable live input becomes an active session. A terminated acquisition should fail/recover to reconnectable state, and should release its graph/owned tracks. This is a lifecycle invariant, not a requirement to implement an unsupported capture API.

**Actual / root cause:** Admission checks array length, not audio-track readiness. Listener installation occurs only after awaited attachment, and registration does not reconcile already-ended/inactive state. The session is committed active with ended tracks. The UI then treats the selected source as already active and refuses another permission attempt.

**Reproduction:** On a local application page in Chromium, override `getUserMedia` to return a deferred promise containing a real `AudioContext.createMediaStreamDestination().stream`. Click Mic, stop that stream's audio track, deliver its `ended` signal, allow 80 ms for native inactivity delivery, then resolve acquisition. Wait for UI settlement and click Mic again. For Stream substitute `getDisplayMedia`/Stream. No physical device permission or production endpoint is involved.

Observed in source, portable, hosted and immutable Build 115: all returned audio tracks `ended`; status still `Microphone live: …` or `Stream live: …`; clicking the selected source leaves capture-call count **1**. The source-level probe additionally observed `status="active"`, `sessionActive=true` and retry `false`. Normal end events delivered after registration do recover; this finding specifically requires the earlier-delivery ordering. Physical-device incidence was not measured.

**Impact:** Silent/dead input is represented as healthy; reconnect requires File → Mic/Stream rather than the obvious retry. Recording admission can also believe this dead source is usable.

**Suggested remediation / regression protection:** Track acquisition lifecycle before asynchronous attachment, reconcile selected audio track readiness before commit, and fence/clean only the failing owner. Test termination before capture delivery, during resume/attach, immediately around registration and after commit; preserve the existing supersession tests.

### AUD-002: File completion overwrites a focused Analysis frequency draft

**Severity / confidence / owner:** Low; confirmed by execution; Analysis panel / UI settings projection.

**Location:** `src/js/ui/analysis-panel.js`, `syncControls` lines 32–42; `src/js/ui/ui.js`, `loadAndPlay` lines 1515–1536 and `refreshAllUiText` line 1281.

**Trigger:** Type in Band floor or ceiling while asynchronous File activation is still completing. Completion calls `applyPrefs(null)`, replacing the settings reference; the next Analysis refresh runs `syncControls`.

**Expected:** A focused, uncommitted draft survives an unrelated asynchronous refresh. Camera fields already implement this ownership rule.

**Actual / evidence:** A faithfully delayed real `AudioEngine.loadFile` completion was released while `inpBandFloorHz` remained focused with `37.125`. After source activation and the next frame, it read **`20`**, the prior canonical floor. A simpler `UI.applyPrefs(null)` followed by one animation frame produces the same result. The assignments are unconditional and do not inspect focus/dirty state. Equivalent assignments exist in the Build 115 canonical bundle; the delayed File reproduction here used current source.

To reproduce locally without a permanent edit, temporarily wrap the source module's `AudioEngine.loadFile`: await the original result, then wait five seconds before returning it. Load the generated/ordinary audio file and type into Band floor during that interval. Reload removes the instrumentation.

**Impact / root cause:** Recoverable loss of user input; a settings-reference invalidation is mistaken for permission to overwrite an editor-owned draft. No persisted preset corruption was demonstrated.

**Suggested remediation / regression protection:** Separate readout refresh from draft synchronization; preserve focus/dirty drafts until commit or explicit replacement of that field. Exercise real load completion during floor/ceiling editing, including invalid partial drafts, rather than testing only a direct synchronous change event.

### AUD-003: Stepped native sliders misrepresent supported imported values

**Severity / confidence / owner:** Low; confirmed by native execution; Spectral Ring and Analysis controls.

**Location:** `src/js/ui/spectral-ring-editor.js`, `bindRange` lines 18–21 and `refresh` lines 68–77; `src/js/ui/analysis-panel.js`, `bindRange` line 30 and `syncControls` lines 36–37. The preset codec accepts finite fractional values within the corresponding ranges.

**Trigger:** Import schema 10/12 with `bands.overlay.pointSizePx=3.456` and `audio.rmsGain=0.123456`, then reveal Visualizers and Analysis.

**Expected:** The native value/thumb and assistive value agree with the supported canonical setting. CONFIG step metadata should govern editing increments without silently changing the control's representation of an already accepted value; the Orb editor explicitly handles this distinction.

**Actual / evidence:** After waiting for confirmed preset application, all current editions and Build 115 show Ring readout **`3.456px`** but native `#rngBandPoint.value` **`"3"`**. RMS native value is **`"0.12"`** while the accepted setting is `0.123456`. HTML range value sanitation snaps to the configured step lattice. Import/share itself retains the canonical fractions; this is not reported as automatic preset data loss.

**Impact / root cause:** Thumb/native accessibility value can describe a different setting than the renderer uses; subsequent edits start from the snapped native value. Readout formatting cannot prevent the browser's range-value sanitation.

**Suggested remediation / regression protection:** Preserve imported continuous values with `step="any"` and explicit CONFIG-derived keyboard increments, or establish an explicitly approved quantization contract across the entire pipeline. Use native-browser assertions on `.value`, accessibility value and canonical rendering settings for off-grid imports; a fake DOM does not enforce HTML range sanitation.

### AUD-004: Accepted extreme Bark frequencies produce NaN band boundaries

**Severity / confidence / owner:** Low; confirmed by execution and arithmetic; BandBank numerical conversion / preset boundary.

**Location:** `src/js/audio/band-bank.js`, `hzToBark` lines 11–12, Bark branch lines 23–25 and `rebuild` lines 88–105; `src/js/presets/preset-codec.js` lines 96–103.

**Trigger:** Before an AudioContext establishes a realistic Nyquist ceiling, import or configure `distributionMode="bark"`, `floorHz=20`, `ceilingHz=1e307`. Both frequency inputs satisfy the implemented positive-finite admission rule.

**Expected:** Accepted bank inputs produce finite, monotonic interior boundaries, or are rejected/normalized deterministically. The final open-ended band's intentional Infinity is separate.

**Actual / independent proof:** `26.81 * 1e307` overflows to Infinity. Bark interpolation/inversion yields NaN, and `clamp(NaN, f0, f1)` remains NaN. At count 256, **508** low/high array entries excluding the intentional final Infinity are nonfinite. A 70-case distribution/boundary matrix found eight such Bark configurations. A realistic sample-rate rebuild limits the ceiling and recovers the bank; no audio-time crash or normal-frequency failure was demonstrated.

Minimal source-module reproduction:

```js
Object.assign(runtime.settings.bands, {
  count: 256, floorHz: 20, ceilingHz: 1e307, distributionMode: "bark"
});
BandBank.rebuild(1e307); // no AudioContext/sample rate yet
state.bands.lowHz.filter(Number.isNaN).length; // 254
```

**Impact / root cause:** Invalid analysis metadata/ranges propagate from an admitted numeric configuration before audio initialization. Severity is Low because the trigger is extreme and ordinary audio initialization recovers it. The formula is also present in Build 115; this is not a Build 116 regression.

**Suggested remediation / regression protection:** Use numerically stable Bark conversion with checked finite monotonic edges, or define and enforce a CONFIG-owned supported frequency domain. Cover positive subnormals, very large finite values, collapsed ranges and pre-/post-AudioContext rebuilding for every distribution.

### AUD-005: CI misses broken authored-camera startup

**Severity / confidence / owner:** Informational; confirmed by isolated mutation; CI / Build 116 acceptance tests.

**Location:** `.github/workflows/ci.yml` lines 31–38; `src/js/main.js` lines 70–73; `tests/scene-camera.test.js`; optional `scripts/validate-116d.cjs` lines 94–96.

**Trigger / expected:** Delete only `if (presetApplied) restoreSceneCamera();` in a disposable copy. A schema-12 preset should initialize its authored view before its first rendered frame; a release gate should reject the opposite behavior.

**Actual / evidence:** The entire mutated Node suite still passes **1,162**, skips one and fails zero. Build/packaging also succeed. After building the mutant, the optional native 116D harness rejects the first source/DPR-1 startup with **`0 != 123.456789012345`**. Current CI runs npm tests, build and packaging but no native startup check. The unmutated native harness passes all six source/portable/hosted × DPR-1/2 cases.

**Impact / root cause:** Passing CI does not establish the new release's actual browser boot contract. Unit tests exercise actions/codec and manually perform restoration; they do not prove `main` wires that action into startup. This is a coverage weakness, not a claim that current authored-camera boot is defective.

**Suggested remediation / regression protection:** Promote a small real-browser startup/import/save/restore smoke gate for the built distribution into CI. Require that omitting the boot restoration fails it. Preserve the current successful pure migration tests.

## 6. Cross-subsystem contracts

- **Configuration:** CONFIG is deeply frozen. Codec sanitation constructs a fresh allowlisted configuration from defaults; unknown runtime/session fields do not automatically serialize. Resolution clones preferences and derives world/timing/policy settings. Public hash replacement validates oversize Orb admission before mutating preferences. Direct internal `replacePreferences` is not a general hostile-object parser; the external boundary is the codec.
- **Audio authority:** UI owns File request plus Queue-entry identity; AudioEngine checks that authority after awaited context startup and before graph replacement. InputSourceManager separately owns live activation tokens and upstream tracks. Native supersession experiments preserve the newer graph and stop stale captured tracks. AUD-001 identifies the distinct readiness boundary that token validity alone does not prove.
- **Analysis ownership:** AudioEngine owns waveform/FFT buffers, BandBank owns channel energy arrays, and AnalysisFrame refreshes borrowed references. Visualizers consume those references without a second analyser graph. Center is a real combined signal; tested mono/single-channel adaptation and selected-band behavior are distinct from playback gain/mute. Inclusive adjacent FFT-bin overlap and duplicate legacy band-name ambiguity remain accepted, disclosed limitations (ROADMAP), not newly reopened defects.
- **World/view:** World dimensions own reference geometry; camera projection is downstream. Camera operations replace frozen snapshots and do not call simulation resets. Retained particle objects/coordinates and designed/live phases survived the independent view/world/resize checks. Runtime interaction mode and speeds remain outside schema 12. Authored Save is explicit; ordinary movement does not write preferences.
- **Particle ownership:** Governor heap and per-trail intrusive lists reconcile retirement through one path. Policy changes trim before render; fairness ownership survives reordering; whole demand is not debt. Trace drawing reads a suffix rather than allocating a full history copy. Standalone/direct caller paths and lifecycle transfers are distinct from the production frame scheduler.
- **Recording:** Video tracks belong to RecorderEngine; upstream live audio belongs to InputSourceManager; AudioEngine owns playback-tap release. Merged streams share references and confer no stop authority. Abort fences precede native stop/cleanup; successful export replacement follows candidate construction and required cleanup. Application encoded-byte/chunk limits do not bound native encoder buffers, GPU memory or RSS.
- **UI:** Focused modules own feature controls; the coordinator commits settings and derives runtime state. ID-based Orb reconciliation preserves surviving history. Generated editor IDs do not interpolate untrusted persistent identities into HTML. AUD-002/003 show why reference invalidation and fake input objects do not establish native editing correctness.
- **Build:** Portable and hosted artifacts share JS/CSS; metadata differences are generated. Watch staging checks bytes consumed by esbuild against current assembly inputs, joins its child service/assembler on shutdown and publishes complete files with rollback. This does not establish resistance to arbitrary OS/process crashes during multi-file publication.

## 7. Testing credibility and reproducibility

Baseline commands, after activating the supplied environment, completed successfully:

```sh
npm ci --offline --cache /workspace/auralprint-environment/npm-cache
npm test -- --test-concurrency=2
npm run build
python3 scripts/verify_distribution.py
AP_MILLION_STRESS=1 node --test tests/rc15-budgets.test.js
```

Full suite: **1,163 cases, 1,162 pass, one opt-in skip, zero failures**, 20.87 seconds on its baseline run. The separate opt-in budget run passed all **10** cases, including the 1,048,576 boundary, eviction and zero-retention retirement. Timing of later concurrent mutation/browser runs is not comparable to baseline wall time.

Existing native harnesses successfully executed in this audit:

`validate-116d.cjs`, `validate-116ca-corrective.cjs`, `validate-file-cancellation.cjs`, `validate-live-source-ownership.cjs`, `validate-transport-ownership.cjs`, `validate-finalizing-eof.cjs`, `validate-recording-export.cjs`, `validate-recorder-disposal.cjs`, `validate-media-admission.cjs`, `validate-touch-seek.cjs`, `validate-rc15-history.cjs`, `validate-rc15-clock.cjs`, `validate-rc15-analysis.cjs`.

For camera harnesses use external `AP_PLAYWRIGHT_MODULE`, `AP_CHROMIUM_PATH`, and scratch `AP_REPORT`. The older lifecycle harnesses document their respective `RC02`/`RC03`/`RC04`/`RC05`/`RC06`/`RC19` prefixes. No application dependency was added. Both six-edition camera runs report zero page errors and zero failed responses. Held-camera checks include 120/180/300/700 ms main-thread stalls, input continuity, reset/fit, off-world history and decoded camera movement. Lifecycle scenarios deliberately perturb callback order; they are not claims of physical device/permission testing.

Independent experiments used seed **`0x1a2b3c4d`** for 2,500 configuration fuzz cases, semantic idempotence and isolation checks; 100 migration/canonical cycles per schema 2–12 with a labeled 16-Orb surrogate; both schema-9 forms; 10,000 projection matrix/inverse cases; 3,000 particle policy transitions checking caps, heap/list accounting and fractions; and 70 numerical distribution cases. Invalid/unsupported hash inputs leave the tested live camera unchanged. Production DOM sinks were traced: dynamic identities/names use text/dataset assignments; the observed `innerHTML` uses clear trusted containers.

Large same-page URL round trips preserved all generated IDs and counts at 16, 256 and **4,096** Orbs; respective hashes were **12,229**, **179,477**, **2,861,365** characters. This validates serialization and same-page browser history retention, not delivery through every browser, address bar, OS clipboard, messaging service or fresh multi-megabyte navigation. The existing 116D harness separately exercises fresh-instance links of 180,086 characters.

| Disposable mutation | Existing check outcome |
|---|---|
| Omit authored-camera boot restoration | Entire Node suite survives; native 116D harness rejects — AUD-005 |
| Remove retained-particle ceiling enforcement | Phase-2/budget tests reject |
| Omit recorder audio-tap release | Disposal/governor/export tests reject |
| Allow stale attachment after context resume | File/live ownership tests reject |
| Accept injected authored camera in legacy schemas | Scene-camera tests reject (2 failures) |

These are five targeted mutations, not a comprehensive mutation score. Surviving one proves a concrete blind spot; killing four does not prove all hazards are covered.

One optional tooling check **failed**: `node scripts/measure-release-resources.mjs` asserts eight dense burst emissions despite the current nonzero spacing default. Independent isolation measured **one emission**, spacing **0.5 world units**, and accepted delta **1/30 second**, consistent with the production placement contract. Its generic “simulation timestep protection failed” message therefore cannot substantiate an application timing defect. The independent measurements below avoid that stale assertion.

No large logs, media, mutation directories, fuzz corpus or duplicate evidence ledger is committed. Minimal procedures and decisive outputs are retained in this report. Scratch evidence lived under `/workspace/work` during execution and is not a permanent repository dependency.

## 8. Performance and resource observations

Independent production-loop measurements used dense spacing-disabled default-rate Orbs, default shared limits, 300 warm-up frames and 15 measured updates per count. Canvas calls used a no-op instrumented proxy; render numbers are **JavaScript traversal/submission costs**, not native painting, GPU completion or supported frame-rate guarantees. Other audit work shared this host.

| Orbs | Final retained particles | Emissions in measured final update | Median update ms | Median mock Canvas submission ms |
|---:|---:|---:|---:|---:|
| 2 | 2,520 | 8 | 0.012 | 1.18 |
| 16 | 16,384 | 64 | 0.065 | 4.94 |
| 256 | 16,384 | 512 | 0.301 | 6.29 |
| 4,096 | 16,384 | 512 | 2.109 | 9.67 |

The measured caps held; this does not qualify 4,096-Orb native UI/render performance. A separate minimum-speed, 1,000-demand/second Orb with 0.5-world-unit spacing retained **12 particles after 60 simulated seconds**, with one placement comparison per final callback. No accumulated burst debt was observed. The full million-particle allocation/eviction/trim test took approximately 1.68 seconds for the complete test body; this is not a measurement of trim alone or proof of responsiveness while drawing that history.

Three independent short recordings completed repeatedly and a later cancel preserved the prior successful export. FFmpeg decoded all three without error. ffprobe reported **600×1000 VP9 video, stereo 48 kHz Opus**. External audio analysis found left peaks **374.44–375.56 Hz**, right **1124.44–1125.56 Hz**, channel RMS approximately **0.351–0.354**, consistent with the generated 375/1125 Hz, 0.5-amplitude inputs. Live analysis independently measured 376.83/1125.11 Hz FFT peaks at 44.1 kHz, L/R RMS ≈0.353 and C RMS ≈0.250; playback mute did not change sampled analysis RMS.

Decoded audio spans were approximately 0.9 seconds per deliberately short capture. These observations establish real decodable signals and repeated cleanup/recovery, **not** exact A/V synchronization, complete duration fidelity, long-session stability or quality equivalence across codecs. No new unbounded-resource defect was established in the tested policy paths. Native buffering, large permitted histories, high-count editor creation and mark-heavy scenes remain expensive/unqualified; these observations do not authorize Build 117 optimization.

## 9. Unverified conditions and limitations

- `HERO-S10-MIRROR16.decoded(1).json` was not available in the repository or attached workspace search. All 16-Orb workloads here are explicitly synthetic mirrored L/R substitutes. No owner artwork was committed or claimed tested.
- Firefox, WebKit/Safari, mobile browsers, Windows/macOS runtime behavior, real microphone/display/system-audio permission flows, physical touch/orientation/DPR changes and assistive-technology users were not exercised.
- Direct `file://` portable navigation returned **`ERR_BLOCKED_BY_ADMINISTRATOR`** in this environment. This is an environment restriction, not a demonstrated portable-app defect. Local HTTP portable/hosted runs succeeded without external application resources.
- No hours-long session, full native teardown/restart soak, sustained high-resolution recording, encoder-memory exhaustion, million-particle native render acceptance or fine A/V sync measurement was completed. Repeated source churn, Clear, recorder completion/cancel/dispose and fresh-page boots are narrower lifecycle evidence.
- The registry advisory scan (`npm audit --json`) was rejected by automatic approval review because it would transmit lockfile metadata to npm. It was not run or bypassed. Local versions/lock/integrity declarations were inspected; no claim of a current vulnerability-free dependency tree is made. Running that external scan requires the owner's approval.
- Fuzzing is finite and seeded. It does not cover every supported legacy artistic meaning, arbitrary hostile native/browser implementation, every container/codec, or all UI event interleavings. Legacy name ambiguity and intentional FFT overlap remain as documented in ROADMAP.
- No production website was tested, deployed or changed. Historical reports were used as leads only; findings above depend on current executable paths and fresh evidence.

## 10. Release-gate assessment

| Gate | Result |
|---|---|
| Exact accepted baseline and ancestry | Pass; upstream matches requested SHA |
| Locked installation / full Node checks / build / distribution verification | Pass with normal process support and matching supplied toolchain |
| Million-particle policy boundary | Pass in separate opt-in case; native drawing unqualified |
| Authored/live camera ownership, schema-12 startup and import | Pass in exercised native cases; CI alone insufficient (AUD-005) |
| Legacy schema migration and canonical repeatability | Pass in exercised fixtures, surrogate chains and fuzz cases |
| File/queue supersession and recorder EOF/cleanup | Tested scenarios pass; ended-before-registration live readiness fails (AUD-001) |
| Native editing consistency | Fails AUD-002/003; no destructive preset loss demonstrated |
| Numerical admission invariants | Extreme pre-audio Bark case fails AUD-004 |
| Portable/hosted shared runtime and relative packaging | Pass over local HTTP; file launch unverified by policy |
| Real hero scene / broad browser/device / long-duration export | Unverified |
| Fresh external dependency advisory scan | Blocked by automatic approval review |

The **Build 116 architectural claims survive the challenged cases**, and no confirmed production regression specifically introduced by 116 was found. An unconditional all-platform/all-workload readiness verdict remains unsupported. Correct AUD-001 and resolve the acceptance/CI gap first; make explicit dispositions for the Low defects and the unverified owner/platform/media gates. Passing this audit's exercised paths is not a general certification of correctness.

## 11. Recommended remediation sequence and delivery

1. Close the live-input readiness race with a focused ownership-preserving change and delayed-end/native-event regressions. Keep existing stale-activation protections intact.
2. Add a built-browser authored-camera startup/import smoke gate that rejects the demonstrated mutation. Do not replace pure codec/migration checks with snapshots.
3. Preserve Analysis drafts during unrelated async settings refresh; then align native slider representation with supported fractional inputs. Keep data ownership and schema 12 unchanged.
4. Stabilize or explicitly bound extreme frequency admission, with finite/monotonic reference tests for every distribution before and after sample-rate discovery.
5. Obtain the actual hero scene for private owner validation; qualify the intended browser/device, portable-file and long-recording gates. Request approval separately for any external registry metadata scan. None of these recommendations authorizes implementation, merge or release in this audit pass.

Delivery is this single report on `audit/20261024-full-repository`, for commit/push and a **draft** PR targeting `main` at the audited baseline. The report commit is the branch's report-only child of `7421c2d`; its SHA and draft PR URL are supplied in the PR/chat handoff rather than embedded in a self-referential commit. No source, permanent test, distribution input, canonical file or historical fixture was changed.
