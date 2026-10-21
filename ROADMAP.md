# Auralprint development roadmap

Updated: October 20, 2026. **Release 4 / Build 115 (`v0.1.15`) is accepted for public shipment.** Preset schema **10** is frozen; changes after shipment require versioned migration per [agents.md](agents.md#21-schema-discipline).

**RC-01 through RC-22 completed corrective review at checkpoint `a198b14b087da6b855041c3a23acb550a156ff4e`; Build 115N passed automated CI and received owner acceptance following public RC testing.** Release 4 is Build 115. Platform limitations and unverified environments are disclosed below; earlier audit snapshots remain immutable. The [audit disposition index](docs/development/build-115.md#audit-disposition-index) retains historical corrective evidence.

This document owns the current plan and acceptance criteria. [Development history](docs/development/build-115.md) owns chronology; [agents.md](agents.md) owns engineering policy. **Release 4 / Build 115 is the current public release. Build 113 was Release 3; Build 114 was an internal shipment.** The [release comparison](docs/development/build-115-release-delta.md) distinguishes both baselines. Build 116 Camera follows Build 115.


Current accepted recorder work: the October 9 AUD-006 investigation/calibration
(PRs #57/#58), [N.3 governor](docs/audits/remediations/115m-i-n3-aud006/README.md)
(PR #59), and [lossless Custom settings closeout](docs/audits/remediations/115m-i-n3-aud006/closeout-n3f.md)
(PR #60) are merged. Balanced targets a five-minute automatic Stop; Custom and
Unrestricted offer deliberate overrides. Recorder correctness and prior-export
preservation remain mandatory. Engineering corrective acceptance alone did not establish broader browser/device safety; owner release acceptance is recorded separately.

## Current capability inventory

Capabilities below are implemented in source. Covered automated behavior and recorded Chromium probes do not substitute for wider acceptance.

| Area | Implemented | Acceptance / future work |
| --- | --- | --- |
| Playback and queue | Multi-file picker/drop, navigation, remove/clear, shuffle/repeat, decoded waveform seek; cancelled work cannot restore cleared transport | Real-media/browser/physical-touch evidence; broader Queue UX in Build 117 |
| Optional waveforms | Single-flight preparation/read/decode/reduction, one latest pending intent, bounded metadata probe, encoded/estimated-PCM admission, application-only 4/8/15m choices and manual Generate | [I.2D](docs/audits/remediations/115m-i-i-aud007/final-acceptance/README.md) reviews AUD-007 closure; estimates do not bound total browser memory |
| Audio sources | File/Mic/Stream manager, explicit support/permission/error states, ownership-scoped cancellation and teardown, source-aware recording | Physical hardware and native capture/permission dialogs in 115N |
| Analysis | Orb-independent workspace, reusable AnalysisFrame, L/R/C channel spectra, 256-band default, five distributions, Nyquist-aware floor/ceiling and diagnostics | Measure channel-complete analysis on constrained hardware; richer tooling in Build 118 |
| Orbs | Zero/one/N stable-ID collection, independent motion/response/particles/trace/source/position/color, complete controls and mixed-aware Bulk Edit | High-count editing ergonomics in Build 117; operational ceiling is not a frame-rate guarantee |
| Visuals and color | Singleton Spectral Ring and Orbs in Visualizers; shared Scene appearance in Settings; designed/reset/pause semantics | Artistic acceptance and resize/orientation coverage; simulation/projection separation in Build 116 |
| Particle resources | Settings-owned emission/retention budgets and diagnostics; per-Orb minimum placement distance; fairness, oldest retirement and bounded emission time | Heavy Canvas/UI and large synchronous retirement costs require measured 115N disposition; broader optimization in Build 117 |
| Capture | Canvas plus optional source audio, format/FPS, Balanced/Custom/Unrestricted resource policy, five-minute default Stop target, independent local settings, retained export and preserve-export Cancel | Exported audio fidelity/external players, downloads, long duration and devices in 115N |
| Presets | Build 116A schema-11 codec, URL transport, schemas 2–10 migration including both schema-9 forms, configuration-only persistence | File import/export remains Build 119 |
| Workspace | Independent panels, unified launcher, collapse/global hide/restore, visible focus ownership and Queue focus recovery | Wider keyboard/accessibility/mobile acceptance; long-panel refinements in Build 117 |
| Distribution | Versioned self-contained portable HTML and relocatable hosted package from shared JS/CSS | Owner-reported direct-file and Python-hosted functional coverage; managed automation file:// blocked; network-disabled portability remains separate; no caching/installability claim |

Camera, richer frequency/band tools, preset-file workflows, and 3D remain planned. A separate Scene/compositor architecture is not a prerequisite for the current interface.

## Build 115 staged delivery plan

Stages 1–15 are complete for Build 115. Accepted corrective milestones include AUD-007 I.2D (PR #55), [AUD-011 watcher correctness](docs/audits/remediations/115m-i-m-aud011/README.md) (PR #56), and October 9 AUD-006 recorder work (PRs #57–#60). Stage 14 concluded with owner acceptance after 115N public RC testing; Stage 15 produces the canonical `v0.1.15` artifact and documentation. The [development record](docs/development/build-115.md) retains chronology.

1. **Revised Build 115 canon** — real scope and state. *(115A complete)*
2. **AnalysisFrame boundary** — data-only consumer seam. *(115B complete)*
3. **Visualizer lifecycle** — Ring/Orb runtime participation. *(115C complete)*
4. **Per-Orb ownership** — applicable visual/simulation settings. *(115D complete)*
5. **Dynamic Orb runtime** — zero/one/N, stable IDs and incremental reconciliation. *(115E complete)*
6. **UI decomposition** — workspace and editor seams. *(115F complete)*
7. **Visualizers panel** — runtime-backed inventory. *(115G complete)*
8. **Dynamic Orb management UI** — generated ID-aware Add/Edit/Remove/Duplicate. *(115H complete)*
9. **Complete per-Orb controls** — schema-10 ownership including designed phase. *(115I complete)*
10. **Dedicated Analysis panel** — configuration/diagnostics separate from visualization; channel-complete spectra. *(115J/J.A complete)*
11. **Spectral Ring promotion** — singleton lifecycle and sole presentation editor. *(115K complete)*
12. **Explicit color ownership** — Scene policy and Orb overrides. *(115L complete)*
13. **Preset/lifecycle hardening** — codec/migration, ownership and UI consolidation; subsequent corrective audit review/merge and packaging complete. *(115M corrections merged through N.3F; complete)*
14. **Final acceptance** — browser, real-media/device, accessibility, artistic and constrained-hardware evidence. *(115N public RC tested; owner accepted October 20, 2026)*
15. **Canonization** — approved release comparison, artifacts and explicit human shipment approval. *(Release 4 / v0.1.15, canonized)*

## Build 115: Visualizer Architecture + Orb Overhaul v1

Data flows `Audio Sources → Audio / Spectral Analysis → AnalysisFrame → Visualizer consumers → Renderer → Canvas`. Camera/projection is a future downstream stage in Build 116. Visualizers consume producer-owned analysis without Web Audio access or mutation.

Analysis owns extraction, band definitions, metadata and diagnostics independently of Orb count. VisualizerRuntime owns lifecycle/composition; Orbs update before the dependent Ring, while rendering keeps Ring first and Orbs in preference order. Per-Orb settings and stable identity survive reconciliation; runtime phase/trails/UI/session state are not presets.

Visualizers owns collection management, complete Orb editors/Bulk Edit, and the singleton Ring editor. Settings owns Scene color/palette, particle resources and presets. Persistence deliberately remains at schema-10 `orbs`, `bands.overlay`, `visuals`, shared `bands` color paths, and root `particleSafety`; there is no persisted Scene object. See [README Build 115 scope](README.md#build-115--v0115-visualizer-architecture--orb-overhaul-v1) for the milestone overview and [policy](agents.md) for binding interfaces.

### Protected semantics and limits

- Orb channel selects waveform, full-channel energy and selected-band energy. Empty targets use full-channel energy; nonempty targets average the selected channel's energies. Global spectrum/dominant remain real combined C. Inherited dominant color follows an Orb's target; explicit dominant remains global C.
- Designed phase is canonical radians in `[0, TAU)`, displayed in degrees. Editing preserves live history; Reset Visuals applies design and clears trails; track reset clears trails without changing phase. Pause stops Orb/free Ring motion/emission while analysis and TTL aging continue.
- Schema 10 retains approved unpublished-build corrections; future published-schema changes require increment/migration. Legacy support and immutable CONFIG → preferences → runtime.settings → state remain protected.
- Selected particle budgets are enforced without hidden default ceilings. Zero emission preserves history; zero retention clears/rejects it. Nonzero spacing filters new same-Orb placements, never deletes nearby history. Emission work has an immutable 1/30 s ceiling; ordinary motion integrates visible elapsed time up to the 0.5 s discontinuity threshold.
- The 4,096-Orb admission ceiling and expert particle maxima are operational bounds, not safe-device/FPS claims. Audio, source, recorder, Nyquist, and shared portable/hosted build ownership remain protected.

### Current regression evidence

The [CI workflow](.github/workflows/ci.yml) checks sequential locked install/tests/build and both distribution contracts on Linux/Windows. [README bootstrap](README.md#developer-and-agent-bootstrap) documents commands/toolchains. The [audit disposition index](docs/development/build-115.md#audit-disposition-index) links accepted numerical, lifecycle, native Chromium and mutation evidence without duplicating historical logs. These checks protect implemented behavior; release acceptance additionally included owner and community field testing.

<a id="build-115n-acceptance-gates"></a>

### Build 115 release acceptance and qualifications

**Accepted by the owner for Release 4 on October 20, 2026** following extended 115N testing and live public RC feedback. Automated Linux/Windows CI and the shared distribution contract passed. Acceptance is a release decision, not a claim of universal browser/device certification.

- Firefox shared-display **audio** is unavailable through its display-capture API; Auralprint's Stream workflow requires an audio track and rejects video-only sessions. Chrome, Opera and Edge Stream operation was owner-reported. File and Mic modes have separate support requirements.
- Browser/device combinations, physical touch, accessibility, recording/export fidelity, network-disabled portable operation and maskable artwork have not all been independently certified. Unsupported browser features and environmental limitations remain documented, not silently treated as passing tests.
- Canonical portable artifact: [`docs/Canon/0.1.15/auralprint_0.1.15.html`](docs/Canon/0.1.15/auralprint_0.1.15.html). The hosted distribution is generated by the same build pipeline; deployment must include its complete directory.
- Usability and rendering optimization are deferred to Build 117; new feature work does not reopen Build 115.

<a id="known-deferrals-after-115mh"></a>

### Known deferrals

| Remaining issue | Status / future home |
| --- | --- |
| Resize / move / orientation visual smearing | Build 116 simulation-space / Camera separation |
| Orb editor ergonomics / high-count navigation and long panels | Build 117 UX refinement |
| File / Queue UX refinement | Build 117, retaining accepted focus/cancellation corrections |
| Broader constrained-hardware performance / resource hardening | Build 117; RC-15 corrective work is closed, and broader tuning is deferred |
| Broader source/load lifecycle hardening (October 6 AUD-006) | Build 117; demonstrated RC-02–RC-05 concurrency/EOF defects are closed |
| Broader recorder memory / encoder optimization (October 6 AUD-009) | Build 117; October 9 AUD-006 bounded application policy is implemented and merged through N.3F (PRs #59/#60). Encoded payload does not bound total browser memory; N.2 high-resolution VP8 reached its diagnostic resource guard. |
| Remaining allocations / hidden UI refresh / channel-complete analysis cost (AUD-012) | Build 117; direct Trace suffix traversal and demonstrated quadratic editor/tooltip work have already been corrected |
| Adjacent positive-width FFT-bin overlap (AUD-004) | Intentional current behavior; Build 118 spectral partition work, separate from corrected coordinate scaling |
| Duplicate legacy band-name migration ambiguity (AUD-013) | Build 118 |

Accepted items (AUD-001/003/005, editor jump, Stream stereo, schema closure, visualizer ownership, RC-01–RC-22 and distribution metadata) are not open deferrals. Related future improvements retain their existing homes. No new functional assignment is created by documentation reconciliation.

## Build 116: simulation world, camera and projection

**Status: 116A integration implemented for review in PR #68 after Release 4.** [Build 116 contract](docs/development/build-116.md).

World geometry is an independent reference coordinate system, not the window's dimensions. World width/height define proportional Orb and Ring geometry; they do **not** impose clipping, collision, automatic particle retirement, or camera movement limits. Viewport/DPR concern presentation, not world state.

Staged work: **116A** world coordinate contract, independent geometry, configurable world dimensions and authorized schema-11 migration; **116B** world-to-screen camera projection and inverse transform; **116C** remaining camera UI/persistence after explicit policy approval; **116D** compatibility, interactive and distribution acceptance. Small reviewable passes; no Build 117 optimizations.

Acceptance gates:

- World dimensions can be configured independently of browser dimensions; changing viewport size, devicePixelRatio, pan, zoom or camera rotation must not mutate Orb locations/phases, retained particle coordinates, Ring geometry, analysis or playback.
- Default framing should approximate the familiar Build 115 appearance; explicitly test loaded schema-10 presets and legacy migration. The first persisted world configuration requires schema 11, CONFIG defaults/limits, codec migration and all preset/UI owners. Freeze no new preset semantics prematurely.
- Pan, zoom, rotation, reset and the inverse coordinate transform are deterministic and accessible; camera reset returns to a documented default and interactive controls avoid transport, seek, drag/drop and panel gesture conflicts.
- Decide camera persistence explicitly before implementation; application-only camera state stays out of presets unless a versioned design is approved. World dimensions are intended Scene configuration and must traverse the canonical preferences pipeline.
- World-unit particle spacing and CSS-screen-sized particle/Trace/Ring presentation retain explicit semantics; camera transforms must not silently change emission decisions. Resize, high-DPI, history retention, recording, hosted and single-file behavior pass regression validation.

## Build 117: UX and performance hardening

**Status: planned; targeted fixes may accompany their owning milestone.**

Measure rendering and analysis on constrained hardware, reduce unnecessary hidden-panel updates, and address interaction problems found during Build 115/116 use. Preserve useful tooltips, reset behavior, and recoverable panel visibility.

Acceptance gates:

- Establish and record representative device, audio, viewport, FFT, and particle settings before comparing performance.
- Prevent unbounded work and new per-frame allocations; show an actionable explanation for any user-visible performance limit.
- Repeated source changes, queue operations, panel toggles, and recording cycles do not accumulate listeners or retain obsolete media resources.
- Keyboard and narrow-layout checks cover every panel, including empty, loading, error, and finalizing states.

## Build 118: richer spectral selection

**Status: planned; the basic chooser ships with Build 115 completion.**

Expand the spectral system with frequency-aware selection and inspection, visual confirmation, configurable practical band-table sizes, curated counts envisioned around 5/64/256/1024/2048, deterministic thematic naming from planetary/core through cosmic/quantum imagery, and sensible generated fallbacks. The current canonical 256-band implementation remains unchanged until that work. Add only controls that correspond to implemented analysis behavior. Weighted aggregation remains a separate design decision, not an implied capability.

Acceptance gates:

- Selection feedback explains the active distribution and effective frequency range.
- Named selections resolve deterministically to supported band IDs or receive an explicit new schema design if they need different persistence semantics.
- Selection remains legible for sparse and dense targets, and each orb's configuration remains independent.
- Existing presets retain their meaning; new persisted fields follow the full schema process.

## Build 119: preset workflow upgrades

**Status: planned.**

Add local preset JSON export/import with validation and readable errors, using the same canonical configuration pipeline as URL presets. Keep Copy Link. Consider PNG capture only after the configuration workflow is reliable.

Acceptance gates:

- Exported presets reimport with equivalent normalized settings.
- Malformed files and unsupported schema versions fail without partially applying settings.
- Queue, playback position, recordings, and live input permissions are excluded.
- Legacy migration works through the same path for both URL and file imports.
- File workflows work offline in the standalone HTML.

## Build 120: optional 3D and perspective

**Status: gated exploration, not committed implementation.**

Revisit after camera behavior and the 2D workflow are stable. Define the user benefit, expected performance, and configuration migration before implementation. Experiments require an explicit flag; 2D remains the default and stable fallback.

Acceptance gates:

- Optional 3D cannot change the meaning of existing 2D presets or degrade the default workflow.
- Simulation and projection remain separate.
- Performance is measured against the Build 117 baseline at documented settings.
- Any new persisted axis/projection fields have normalization, limits, versioning, and migration coverage.

## Completion and release evidence

For each delivered milestone, record the implementation scope, test/build result, browser/device checks, preset compatibility result, and remaining limitations. Mark completion only when its acceptance gates have evidence. Release tags, distribution deployment and archival checks must match the accepted canonical version.

Prioritize fixes that make an existing capability understandable or recoverable. Defer new abstractions and feature expansion that do not resolve a demonstrated workflow problem.
