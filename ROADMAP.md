# Auralprint development roadmap

Updated: October 8, 2026. Development revision: **`v0.1.15m.i.e` / Build 115**. Preset schema: **10**, with approved pre-release exceptions in [agents.md](agents.md#21-schema-discipline); frozen on shipment.

**RC-01 through RC-22 have completed corrective review and merge at accepted main `a198b14b087da6b855041c3a23acb550a156ff4e`. 115N final acceptance remains WITHHELD. Build 115 is unshipped and noncanonical.** Corrective closure does not establish complete browser, media, accessibility, artistic, or hardware acceptance. The [current audit disposition index](docs/development/build-115.md#audit-disposition-index) records accepted corrections and residual limitations; earlier audit snapshots remain immutable.

This document owns the current plan and acceptance criteria. [Development history](docs/development/build-115.md) owns chronology; [agents.md](agents.md) owns engineering policy. **Release 3 / Build 113 is the canonical public shipped release. Build 114 is internally shipped.** The [internal release-delta draft](docs/development/build-115-release-delta.md) compares both baselines without choosing a public release number or changelog baseline. Build 116 Camera remains dependent on Build 115 acceptance.

## Current capability inventory

Capabilities below are implemented in source. Covered automated behavior and recorded Chromium probes do not substitute for wider acceptance.

| Area | Implemented | Acceptance / future work |
| --- | --- | --- |
| Playback and queue | Multi-file picker/drop, navigation, remove/clear, shuffle/repeat, decoded waveform seek; cancelled work cannot restore cleared transport | Real-media/browser/physical-touch evidence; broader Queue UX in Build 117 |
| Audio sources | File/Mic/Stream manager, explicit support/permission/error states, ownership-scoped cancellation and teardown, source-aware recording | Physical hardware and native capture/permission dialogs in 115N |
| Analysis | Orb-independent workspace, reusable AnalysisFrame, L/R/C channel spectra, 256-band default, five distributions, Nyquist-aware floor/ceiling and diagnostics | Measure channel-complete analysis on constrained hardware; richer tooling in Build 118 |
| Orbs | Zero/one/N stable-ID collection, independent motion/response/particles/trace/source/position/color, complete controls and mixed-aware Bulk Edit | High-count editing ergonomics in Build 117; operational ceiling is not a frame-rate guarantee |
| Visuals and color | Singleton Spectral Ring and Orbs in Visualizers; shared Scene appearance in Settings; designed/reset/pause semantics | Artistic acceptance and resize/orientation coverage; simulation/projection separation in Build 116 |
| Particle resources | Settings-owned emission/retention budgets and diagnostics; per-Orb minimum placement distance; fairness, oldest retirement and bounded emission time | Heavy Canvas/UI and large synchronous retirement costs require measured 115N disposition; broader optimization in Build 117 |
| Capture | Canvas video plus optional active-source audio, format negotiation, target FPS, retained latest export, terminal disposal with track ownership | Exported audio fidelity/external players, downloads, long duration and devices in 115N |
| Presets | Pure schema-10 codec, URL transport, schemas 2–9 migration including both schema-9 forms, configuration-only persistence | File import/export remains Build 119 |
| Workspace | Independent panels, unified launcher, collapse/global hide/restore, visible focus ownership and Queue focus recovery | Wider keyboard/accessibility/mobile acceptance; long-panel refinements in Build 117 |
| Distribution | Versioned self-contained portable HTML and relocatable hosted package from shared JS/CSS | Direct `file://` launch remains blocked/unverified in current Chromium environment; no hosted caching/installability claim |

Camera, richer frequency/band tools, preset-file workflows, and 3D remain planned. A separate Scene/compositor architecture is not a prerequisite for the current interface.

## Build 115 staged delivery plan

Stages 1–13 are complete. Subsequent audit corrections and distribution preparation are accepted through 115M.I.D; 115M.I.E reconciles documentation for review. The [development record](docs/development/build-115.md) contains revision details. Stages 14–15 remain withheld.

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
13. **Preset/lifecycle hardening** — codec/migration, ownership and UI consolidation; subsequent corrective audit review/merge and packaging complete. *(115M complete through I.D; I.E documentation review)*
14. **Final acceptance** — browser, real-media/device, accessibility, artistic and constrained-hardware evidence. *(115N WITHHELD)*
15. **Canonization** — approved release comparison, artifacts and explicit human shipment approval. *(115N only after acceptance)*

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

The [CI workflow](.github/workflows/ci.yml) checks sequential locked install/tests/build and both distribution contracts on Linux/Windows. [README bootstrap](README.md#developer-and-agent-bootstrap) documents commands/toolchains. The [audit disposition index](docs/development/build-115.md#audit-disposition-index) links accepted numerical, lifecycle, native Chromium and mutation evidence without duplicating historical logs. These checks protect implemented behavior; they do not complete 115N.

### Build 115N acceptance gates

**WITHHELD.** Independent evidence and explicit human approval are still required for applicable scenarios:

- Firefox/Safari and mobile browsers, physical touch, responsive panel recovery, keyboard/focus and assistive technology.
- Real compressed/media breadth, device sample rates/channel layouts, microphone hardware, OS display/system-audio permissions, cancellation and recovery.
- Recording/download workflows, external-player exported audio fidelity, repeated and long-duration capture/resource retention.
- Representative constrained-hardware analysis/rendering, high-count/editor costs, large retention trim/expiry and expert limits. Exact human presets require artistic slow-frame/trail/Trace acceptance; synthetic histories alone do not establish it.
- Actual portable `file://` boot/playback with networking offline in an environment permitting navigation; complete hosted root/subdirectory validation and correct server MIME setup. Existing blocked navigation is not a successful gate or an application finding.
- Maskable artwork review, final public-versus-internal comparison baseline and editorial approval of eventual shipped notes. [Release-delta draft](docs/development/build-115-release-delta.md) is preparation only.
- Approved artifacts and explicit shipment/canonization decision. Passing CI, merged corrective PRs and this documentation revision do not authorize it.

<a id="known-deferrals-after-115mh"></a>

### Known deferrals

| Remaining issue | Status / future home |
| --- | --- |
| Resize / move / orientation visual smearing | Build 116 simulation-space / Camera separation |
| Orb editor ergonomics / high-count navigation and long panels | Build 117 UX refinement |
| File / Queue UX refinement | Build 117, retaining accepted focus/cancellation corrections |
| Broader constrained-hardware performance / resource hardening | Build 117; RC-15 corrective work is closed by accepted review/merge, while applicable 115N performance/artistic evidence remains required |
| Broader source/load lifecycle hardening (AUD-006) | Build 117; demonstrated RC-02–RC-05 concurrency/EOF defects are closed |
| Recorder retained-memory / backpressure (AUD-009) | Build 117; terminal disposal correction does not bound long recordings |
| Remaining allocations / hidden UI refresh / channel-complete analysis cost (AUD-012) | Build 117; direct Trace suffix traversal and demonstrated quadratic editor/tooltip work have already been corrected |
| Adjacent positive-width FFT-bin overlap (AUD-004) | Intentional current behavior; Build 118 spectral partition work, separate from corrected coordinate scaling |
| Duplicate legacy band-name migration ambiguity (AUD-013) | Build 118 |

Accepted items (AUD-001/003/005, editor jump, Stream stereo, schema closure, visualizer ownership, RC-01–RC-22 and distribution metadata) are not open deferrals. Related future improvements retain their existing homes. No new functional assignment is created by documentation reconciliation.

## Build 116: camera controls, render separate from simulation

**Status: planned after Build 115 acceptance.**

Deliver pan, zoom, rotation, and reset camera. Start at the simulation origin. Provide discoverable controls and define pointer/keyboard interactions before adding gestures that compete with seeking, file drop, or panel scrolling.

Acceptance gates:

- Camera changes affect projection only: orb phases, centers, analysis, and transport do not change.
- Reset returns to a documented default view.
- Resizing and device-pixel-ratio changes remain correct.
- Decide and document camera persistence before implementation. Persisted camera fields require the complete preset pipeline update, schema increment, and legacy migration; runtime-only camera state must remain outside presets.
- Playback, recording, and the single-file build pass regression validation with the transformed view.

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

For each delivered milestone, record the implementation scope, test/build result, browser/device checks, preset compatibility result, and remaining limitations. Mark completion only when its acceptance gates have evidence. Keep the public release designation unchanged until an actual release is prepared.

Prioritize fixes that make an existing capability understandable or recoverable. Defer new abstractions and feature expansion that do not resolve a demonstrated workflow problem.
