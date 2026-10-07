# Auralprint development roadmap

Updated: October 7, 2026. Development revision: `v0.1.15m.h.d` / Build 115. Preset schema: 10 (frozen for Build 115).

The immediate priority for **Visualizer Architecture + Orb Overhaul v1** is release-audit remediation. **115N — Release Candidate / final acceptance / canonization — remains withheld.** M.H completed status ownership, developer/test portability, repository hygiene, and documentation reconciliation. The release-readiness audit found blockers; M.H.A closed RC-01; M.H.B adds infrastructure-only CI/build validation. M.H.C closes RC-06; M.H.D fixes RC-02 cancellation, with hosted CI pending. RC-01 and RC-06 are CLOSED; remaining release-audit findings remain open, and remediation remains active. Analysis has a dedicated Orb-independent workspace; Visualizers owns Spectral Ring and all Orb editing; Settings owns shared Scene appearance and presets. Stream stereo correctness is fixed and validated, and schema 10 is frozen for Build 115. Build 115 is not shipped/canonical; Build 116 Camera work remains blocked until acceptance.

This roadmap directs development; `agents.md` defines the architecture and change contract. Release 3 / Build 113 remains the documented canonical public release. Build 114 and Build 115 are internal milestones. A development milestone is not a public release claim.

## Current capability inventory

The following capabilities are present in the current source. Passing unit tests establish their covered behavior; they do not substitute for browser, device, permission, or media testing.

| Area | Implemented | Current usability gap |
| --- | --- | --- |
| Playback and queue | Multi-file loading, drag and drop, queue navigation, removal, clear, shuffle, repeat, decoded waveform seeking | Queue access and transport must remain discoverable when panels are hidden or the viewport is narrow |
| Audio sources | File, microphone, and shared stream source manager; supported/unsupported/requesting/error states; teardown on source change | Source controls and file-only restrictions need understandable labels and coherent recovery paths |
| Analysis | L/R/C analysis, canonical 256-band default, linear/log/mel/bark/ERB distribution, Nyquist-aware ceiling | Technical controls need grouping and explanations; avoid exposing another wall of controls |
| Orbs | All 23 schema-10 per-Orb controls and 13 Bulk Edit fields in Visualizers, including chooser-backed targeting and degree-presented designed Phase Offset | High-Orb-count navigation and editor ergonomics are deferred to Build 117 |
| Visuals | Spectral Ring and Orbs share Visualizers; Settings owns Scene appearance, shared color/palette and presets; Reset Visuals | Long-panel ergonomics need Build 117 refinement; resize/move/orientation smearing belongs to Build 116 |
| Capture | Recording panel, canvas video and optional source audio, negotiated formats, target frame rate, latest-export download | Capture actions and availability must remain visible and truthful across file/live/recording states |
| Presets | URL configuration serialization; schema 10 complete Orb fields; accepted legacy schemas and migrations | No dedicated preset-file import/export workflow yet |
| Workspace | Panel show/hide controls, unified launcher, launcher collapse, global panel visibility shortcut | Launchers need visible names; long panels and queue recovery need improvement |

Camera pan/zoom/rotation, richer band tools, preset-file workflows, and 3D are planned. A separate scene/compositor architecture is not a prerequisite for finishing the current interface.

## Build 115 staged delivery plan

Build 115 proceeds in this order. Stages 1–13 and revisions through 115M.G are complete. 115M.H completed the small pre-RC hardening pass, but audit remediation remains active. M.H.A closed RC-01; M.H.B establishes CI/build infrastructure only; M.H.C closes RC-06; M.H.D fixes RC-02 cancellation; stages 14–15 belong to 115N and remain withheld.

1. **Revised Build 115 canon** — document the real scope and current state. *(115A complete)*
2. **AnalysisFrame boundary** — expose analysis data through a stable consumer seam without changing behavior. *(115B complete)*
3. **Visualizer lifecycle** — current Band Overlay and Orb instances share the runtime lifecycle. *(115C complete)*
4. **Per-Orb ownership** — move the remaining applicable visual/simulation settings out of global ownership. *(115D complete)*
5. **Dynamic Orb runtime** — support zero/one/N definitions, stable IDs, model operations, and incremental reconciliation. *(115E complete)*
6. **UI decomposition** — split only the UI seams needed for dynamic visualizers. *(115F complete)*
7. **Visualizers panel** — establish a runtime-backed inventory and navigation home for visualizer instances. *(115G complete)*
8. **Dynamic Orb management UI** — add, edit, remove, and duplicate Orb instances with generated ID-aware cards. *(115H complete)*
9. **Complete per-Orb controls** — expose every schema-10 Orb-owned setting, including designed Phase Offset. *(115I complete)*
10. **Dedicated Analysis panel** — separate analysis configuration from visualization configuration. *(115J/J.A complete)*
11. **Band Overlay → Spectral Ring promotion** — promote the existing rendering feature after lifecycle support exists. *(115K complete)*
12. **Explicit color ownership** — clarify and implement visualizer/color-policy boundaries. *(115L complete)*
13. **Preset/lifecycle hardening** — persist only deliberately designed configuration with migrations. *(115M.A–M.G complete; M.H final pre-RC closure complete)*
14. **Final acceptance** — complete browser, real-media, accessibility, and constrained-hardware performance validation. *(115N withheld pending audit remediation)*
15. **Canonization** — mark Build 115 complete only after every applicable gate has evidence. *(115N after acceptance)*

Existing Node tests and a successful offline single-file build are useful regression evidence. They are **not Build 115 completion evidence** and do not replace browser, media, accessibility, or performance validation.

## Build 115: Visualizer Architecture + Orb Overhaul v1

**Status: v0.1.15m.h.d fixes RC-02 File cancellation, with closure pending hosted Linux/Windows CI; RC-01 and RC-06 remain CLOSED. Audit remediation remains active; 115N promotion is withheld and Build 115 is not canonical. Schema 10 is frozen for Build 115. Settings owns Scene appearance/presets; one Visualizers workspace owns Spectral Ring and Orbs. Final acceptance/canonization remains pending.**

AnalysisFrame gives visual consumers an explicit data-only view. `VisualizerRuntime` now owns an ordered collection using `id`, `type`, `isVisible()`, `update()`, `render()`, `reset(reason)`, and `dispose()`: the singleton Spectral Ring participates first, followed by adapters around each current Orb. Persistence is schema 10: every Orb owns motion, response, particles, and trace, while schema 2–9 globals migrate into independent Orb copies. Dynamic Orb model/runtime management is exposed through the Visualizers panel and 115K promotes the user-facing/runtime identity to Spectral Ring while retaining `bands.overlay` persistence. Build 116 remains blocked.

The Visualizers panel offers Add/Edit/Duplicate/Remove through canonical runtime operations and generates one stable-ID editor card for every current Orb in that same workspace. The separate Orbs workspace is retired. Zero Orbs is valid and Spectral Ring remains a singleton. All 23 per-Orb controls and 13 Bulk Edit fields remain available; Bulk Edit reports mixed values truthfully. Settings owns Scene color/palette and preset controls. Audio, Analysis, Visualizer editing, and Scene preference feedback each use their own status lane; generic/internal preference synchronization is silent.

Revision 115I completed per-Orb control exposure. Phase Offset presents `startAngleRad` in degrees as designed phase, does not live-teleport a running Orb, and is applied by Reset Visuals. Nested controls commit by stable ID. Subsequent 115J Analysis, 115K Spectral Ring promotion, and 115L color ownership are complete; Camera remains Build 116.

Revision 115I.A tactically hardens that accepted editor: generated select readouts follow their synchronized values, Orb-editor invalidation reads only `runtime.settings`, per-Orb commits perform one runtime Orb synchronization, and Phase Offset exposes degree-based accessible value text. Current version metadata is aligned and schema remains 10.

Revision 115H.A guards the generated Orb editor by settings and BandBank edge references so unchanged animation frames do no controller, reorder, or open-picker row synchronization. Targeted Orbs inheriting the global dominant policy now use the strongest band in their selected target; explicit Orb Dominant Band remains tied to the global full-spectrum dominant band. Schema remains 10.

Revision 115F.A tactically hardened the accepted UI decomposition without changing architecture or schema. Revision 115G established the runtime-backed inventory; 115H added Orb collection management with generated editors. 115K moved Spectral Ring presentation into Visualizers, 115L retired Bands, and 115M.G consolidated the Orb editors into Visualizers.

The intended data direction is `Audio Sources → Audio / Spectral Analysis → AnalysisFrame → Visualizer consumers → Scene / Renderer → Camera → Canvas`. Visualizers consume analysis; they do not own or perform it. The Camera stage belongs to Build 116 and is not ready to begin.

### Protected semantics and limits

- L/R/C are first-class analysis channels. Orb `chanId` selects waveform, full-spectrum energy, and selected-band spectral energy; empty `bandIds` retains selected-channel full-spectrum behavior. Global spectrum and dominant remain the real combined C analysis.
- Preset schema remains 10; 115E changes collection lifecycle behavior without adding persisted fields.
- `state.bands` may remain producer state while the consumer boundary is extracted; visual state such as ring phase does not become analysis data.
- Dynamic Orb management uses canonical runtime operations and generated stable-ID editor cards. Spectral Ring retains its singleton lifecycle and schema-10 `bands.overlay` persistence; its sole presentation editor shares Visualizers with the Orb editors. Camera behavior remains blocked; schema 10 is unchanged.
- Track/source/recording ownership, immutable configuration, Nyquist-aware ceilings, and single-file output remain protected.

Revision 115J established the dedicated Analysis workspace. It owns FFT size, smoothing, RMS gain, band distribution/floor/configured ceiling, metadata, dominant-band diagnostics, and energy inspection. It consumes `AnalysisFrame`, has no Orb or visualizer dependency, exposes no band-count editor, and retains preset schema 10. Subsequent 115K/115L completed presentation/color ownership; Camera remains blocked.

Revision 115J.A established channel-complete spectral analysis. L/R/C reuse independent analyser FFT buffers and BandBank energy arrays while sharing one band definition. This intentionally changed existing schema-10 targeted L/R rendering without migrating presets. Three frequency reads and three channel BandBank calculations per ready sample are accepted for analyzer correctness; Build 117 must measure and harden that cost on constrained hardware without demand-driven channel pruning. Schema remains 10; Spectral Ring promotion and Scene color ownership are complete.

### Current regression evidence

The Node suite and clean-install single-file build cover preset, source-lifecycle, recording, chooser, packaging, status ownership, and template structure. M.E Stream stereo correctness is fixed and locally validated; the optional browser diagnostic retains stereo/left-only/right-only/dual-mono, file-versus-stream graph, splitter, built-artifact status, and optional native-capture checks. This evidence does not complete the wider real-media, device/permission, recording-export, accessibility, or performance acceptance required by 115N. Validation commands remain sequential because a build and the build-directory test can interfere with each other.

### Revision 115M.H.B — CI/build baseline

Canonical developer/agent bootstrap is `npm ci`, `npm test`, then `npm run build`, sequentially. GitHub Actions now validates a clean lockfile install/test/build on Linux and Windows for pull requests and pushes to `main`, explicitly provisioning Node 24 and Python 3.12. setup-node caches npm packages only; `node_modules/`, `.build/`, `build/`, and `dist/` remain ignored and untracked. CI checks the non-empty versioned single-file HTML, its version marker, generated-file tracking, and `git diff --check`.

Package installation may require network access even though the built application works offline. Use a disposable workspace-local npm cache if the default cache is unwritable; see [README bootstrap commands](README.md#developer-and-agent-bootstrap). Sandbox native-executable/child-process EPERM is an environment concern and must not be worked around in product source. No dependency, build-script, product-behavior, or schema change is part of M.H.B; schema remains 10.

Browser/device acceptance remains separate from fast repository CI and still gates release readiness. RC-01 and RC-06 are CLOSED; all other release-audit findings remain open. **115N remains withheld.**

### Revision 115M.H.C — RC-06 retained export ownership

RC-01 CLOSED. RC-06 CLOSED. All other release-audit findings remain open. **115N remains WITHHELD.** Schema remains exactly 10.

The last completed export survives new recording attempts and every failed acquisition, constructor, start, recorder-error, stop, or finalization path. Successful finalization snapshots the old URL by value, commits the new export metadata, then revokes the old URL exactly once. Reset retains the export; completed-export disposal still revokes/clears it. The unused premature-clear helper was removed locally; disposal remains its existing owner.

Validation: 16 focused ownership regressions use real Blob URLs and exact create/revoke instrumentation, including partial-new-URL cleanup and repeated replacement. Both premature-clear and mutable-alias mutations fail those regressions. The unchanged historical native probe reproduced RC-06 on M.H.B with output written outside historical evidence. The new optional `node scripts/validate-recording-export.cjs` probe passed against the built M.H.C artifact in Chromium: A remained downloadable after failed acquisition and during B capture; successful B replaced A and revoked only A. Playwright is optional developer tooling; `RC06_PLAYWRIGHT_MODULE`, `RC06_CHROMIUM_PATH`, and `RC06_REPORT` can select tooling and save results. The original release audit/evidence remains unchanged. RC-02/03/04/05/19 and resource budgets are outside this revision.

### Revision 115M.H.D — RC-02 File cancellation

RC-01 CLOSED. RC-06 CLOSED. RC-02 closure pending hosted Linux/Windows CI. RC-03 onward remain unresolved except RC-06. **115N remains WITHHELD.** Schema remains exactly 10.

Clear and final queue removal invalidate the permitted file-load request before source teardown/reset. Picker and canvas drop share synchronous batch enqueueing before first activation; cancelled continuations cannot enqueue remaining files. Existing AudioEngine request checks and aborted media listeners suppress stale success/failure/event commits. Recorder notifications remain intact; AudioEngine, InputSourceManager, Mic/Stream attachment, playPause(), and MIME filtering are unchanged.

Validation: 12 focused RC-02 tests cover delayed resume/play, rejection, final removal, stale media callbacks, picker/drop cancellation, ordinary single/multi-file load, append, and new work after cancellation. Removing invalidation fails resume/play regressions; restoring sequential ingestion resurrects B in both entry points. The optional `node scripts/validate-file-cancellation.cjs` probe passes nine native Chromium scenarios against the unmodified built HTML, including both final-removal boundaries and resource release ([new browser evidence](docs/audits/remediations/115m-h-d-rc02/browser.json)). The same probe fails all seven cancellation scenarios on the M.H.C artifact; positive controls pass. The unchanged historical probe can snapshot idle before native resume finishes, so new evidence waits for event-handler settlement. `RC02_PLAYWRIGHT_MODULE`, `RC02_CHROMIUM_PATH`, `RC02_ARTIFACT`, and `RC02_REPORT` select optional tooling/artifacts/evidence. Historical audit/evidence remains unchanged. RC-03/RC-04 and all unrelated defects remain outside this revision.

### Known deferrals after 115M.H

| Remaining issue | Status / future home |
| --- | --- |
| Resize / move / orientation visual smearing | Deferred to Build 116 simulation-space / Camera separation |
| Orb editor ergonomics / high-Orb-count navigation | Architecture is correct and controls are complete; UX refinement deferred to Build 117 |
| File / Queue UX refinement | Explicitly deferred from M.H to Build 117 UX hardening |
| AUD-002 unbounded preset-controlled work / resource governance | Build 117 performance/resource hardening |
| AUD-006 source/load concurrency | Confirmed by RC-02–RC-04; M.H.D fixes RC-02, hosted CI pending; RC-03/RC-04 remain open |
| AUD-009 recorder retained-memory / backpressure | Build 117 |
| AUD-012 per-frame allocation / UI refresh performance | Build 117, including channel-complete analysis cost |
| AUD-004 adjacent positive-width FFT-bin overlap | Intentional current behavior; Build 118 spectral partition work |
| AUD-013 duplicate legacy band-name migration ambiguity | Build 118 |

Accepted/fixed items are excluded from that ledger: AUD-001, AUD-003, AUD-005, M.C editor jump, M.E Stream stereo correctness, M.F schema-10 closure, and M.G Visualizer ownership. M.H added no Queue UX, Orb-editor redesign, Camera, or new product features. Hosted CI is now implemented in M.H.B as infrastructure only.

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

### Revision 115K — Spectral Ring promotion (complete)

The historical Band Overlay is now the singleton `spectral-ring` VisualizerRuntime participant. Its complete presentation editor, including line alpha and line width, lives in Visualizers; persistence intentionally remains schema-10 `bands.overlay`. It consumes combined C spectrum and waveform data. Free-run reset is independent of Orbs; explicit Orb-lock follows the first Orb when present and safely holds with zero Orbs. Bands temporarily retains shared color/palette controls for the 115L ownership audit. Camera remains blocked.

### Revision 115L — explicit Scene-level color ownership (complete)

The transitional Bands workspace was replaced by Scene (now labeled Settings). Scene owns background, fixed particle color, the default Orb particle policy, and the shared band palette, while persistence intentionally stays at schema-10 `visuals.*` and `bands.*` paths. Orbs own their local `colorSource`, hue offset, and trace color mode. Spectral Ring consumes the shared palette, and Analysis uses it as its diagnostic legend. Inherited dominant is target/channel-aware for targeted Orbs; explicit Orb and trace dominant remain global combined-C. No persisted Scene object or per-visualizer palette was introduced. 115M hardening is complete through final M.H closure; 115N is next, Camera remains Build 116, and Builds 117/118 retain their performance/band-expansion scopes.
