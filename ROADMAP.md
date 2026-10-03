# Auralprint development roadmap

Updated: October 3, 2026. Development revision: `v0.1.15f.a` / Build 115. Preset schema: 10.

The immediate priority is **Visualizer Architecture + Orb Overhaul v1**. Build 115 is mid-development: the menu reorganization and editing of two existing Orbs have substantially landed, schema-10 per-Orb ownership and the dynamic Orb runtime are complete, while per-Orb management UI, later panels, and final acceptance remain open. Build 116 Camera work is blocked until this sequence is complete.

This roadmap directs development; `agents.md` defines the architecture and change contract. Release 3 / Build 113 remains the documented canonical public release. Build 114 and Build 115 are internal milestones. A development milestone is not a public release claim.

## Current capability inventory

The following capabilities are present in the current source. Passing unit tests establish their covered behavior; they do not substitute for browser, device, permission, or media testing.

| Area | Implemented | Current usability gap |
| --- | --- | --- |
| Playback and queue | Multi-file loading, drag and drop, queue navigation, removal, clear, shuffle, repeat, decoded waveform seeking | Queue access and transport must remain discoverable when panels are hidden or the viewport is narrow |
| Audio sources | File, microphone, and shared stream source manager; supported/unsupported/requesting/error states; teardown on source change | Source controls and file-only restrictions need understandable labels and coherent recovery paths |
| Analysis | L/R/C analysis, canonical 256-band default, linear/log/mel/bark/ERB distribution, Nyquist-aware ceiling | Technical controls need grouping and explanations; avoid exposing another wall of controls |
| Orbs | Per-orb channel, chooser-backed band selection with advanced exact indices, direction, starting angle, hue offset, color source, and simulation-space center | Starting angle is a preset/code configuration field rather than a dedicated control |
| Visuals | Trails and particles, band overlay, global color controls, reset visuals | Related settings are scattered across long panels; first-use and advanced controls compete for space |
| Capture | Recording panel, canvas video and optional source audio, negotiated formats, target frame rate, latest-export download | Capture actions and availability must remain visible and truthful across file/live/recording states |
| Presets | URL configuration serialization; schema 10 complete Orb fields; accepted legacy schemas and migrations | No dedicated preset-file import/export workflow yet |
| Workspace | Panel show/hide controls, unified launcher, launcher collapse, global panel visibility shortcut | Launchers need visible names; long panels and queue recovery need improvement |

Camera pan/zoom/rotation, richer band tools, preset-file workflows, and 3D are planned. A separate scene/compositor architecture is not a prerequisite for finishing the current interface.

## Build 115 staged delivery plan

Build 115 proceeds in this order. The first six stages are complete through revision 115F; later stages must not be inferred from their presence in this plan.

1. **Revised Build 115 canon** — document the real scope and current state. *(115A complete)*
2. **AnalysisFrame boundary** — expose analysis data through a stable consumer seam without changing behavior. *(115B complete)*
3. **Visualizer lifecycle** — current Band Overlay and Orb instances share the runtime lifecycle. *(115C complete)*
4. **Per-Orb ownership** — move the remaining applicable visual/simulation settings out of global ownership. *(115D complete)*
5. **Dynamic Orb runtime** — support zero/one/N definitions, stable IDs, model operations, and incremental reconciliation. *(115E complete)*
6. **UI decomposition** — split only the UI seams needed for dynamic visualizers. *(115F complete)*
7. **Visualizers panel** — establish a home for visualizer instances and their controls.
8. **Dynamic Orb management UI** — add, remove, and duplicate Orb instances.
9. **Complete per-Orb controls** — expose the remaining properly owned Orb settings.
10. **Dedicated Analysis panel** — separate analysis configuration from visualization configuration.
11. **Band Overlay → Spectral Ring promotion** — promote the existing rendering feature after lifecycle support exists.
12. **Explicit color ownership** — clarify and implement visualizer/color-policy boundaries.
13. **Preset/lifecycle hardening** — persist only deliberately designed configuration with migrations.
14. **Final acceptance** — complete browser, real-media, accessibility, and constrained-hardware performance validation.
15. **Canonization** — mark Build 115 complete only after every applicable gate has evidence.

Existing Node tests and a successful offline single-file build are useful regression evidence. They are **not Build 115 completion evidence** and do not replace browser, media, accessibility, or performance validation.

## Build 115: Visualizer Architecture + Orb Overhaul v1

**Status: actively under development; revisions 115A–115F are complete, with schema 10 retained. Workspace and compatibility-Orb UI ownership are separated; the Visualizers panel, generated dynamic Orb editor, Analysis panel, Band Overlay promotion, and final acceptance remain pending.**

AnalysisFrame gives visual consumers an explicit data-only view. `VisualizerRuntime` now owns an ordered collection using `id`, `type`, `isVisible()`, `update()`, `render()`, `reset(reason)`, and `dispose()`: the current Band Overlay participates first, followed by adapters around each current Orb. Persistence is schema 10: every Orb owns motion, response, particles, and trace, while schema 2–9 globals migrate into independent Orb copies. Dynamic Orb model/runtime management is present, while its final UI is absent and the user-facing Band Overlay has not been promoted or renamed. Build 116 remains blocked.

The current source substantially contains the reorganized menu and per-instance editing for the two pre-existing Orbs. Users cannot yet add, remove, or duplicate Orbs through the temporary fixed editor; those model/runtime operations are available for the later UI. Motion, radius-response, particle, and trace settings are Orb-owned; their existing shared controls are temporary bulk controls with mixed-value display. The Bands and Orbs/Sim surfaces still mix analysis configuration with visualization configuration, and the Band Overlay remains its current user-facing feature rather than a lifecycle-managed Spectral Ring.

Revision 115F.A tactically hardens the accepted UI decomposition with focused Orb compatibility tests; it does not change the architecture or preset schema.

The intended data direction is `Audio Sources → Audio / Spectral Analysis → AnalysisFrame → Visualizer consumers → Scene / Renderer → Camera → Canvas`. Visualizers consume analysis; they do not own or perform it. The Camera stage belongs to Build 116 and is not ready to begin.

### Protected semantics and limits

- Selected Orb band IDs average the existing combined/center-channel band energies; the Orb channel independently chooses its waveform and full-spectrum energy. Empty `bandIds` means full spectrum.
- Preset schema remains 10; 115E changes collection lifecycle behavior without adding persisted fields.
- `state.bands` may remain producer state while the consumer boundary is extracted; visual state such as ring phase does not become analysis data.
- Revision 115E adds dynamic Orb model/runtime management without final UI. Revision 115F gives workspace orchestration and the temporary two-card compatibility surface dedicated modules without adding management controls. Band Overlay keeps its current name and location. Camera behavior remains blocked; schema 10 is unchanged.
- Track/source/recording ownership, immutable configuration, Nyquist-aware ceilings, and single-file output remain protected.

### Current regression evidence

The existing Node suite and build cover valuable preset, source-lifecycle, recording, chooser, and packaging behavior. Browser validation is not complete, so this evidence does not establish rendered layout, live playback, device permission, recording export, accessibility, or performance acceptance. Validation commands must remain sequential because a build and the build-directory test can interfere with each other.

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
