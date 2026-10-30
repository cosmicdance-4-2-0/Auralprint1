# Auralprint development roadmap

Updated: October 30, 2026. **Current public release: Release 4 / Build 115 (`v0.1.15`), schema 10. Build 116 RC #1 (`v0.1.16-rc.1`, schema 16) was authorized October 29. Post-RC #1 accessibility corrections merged in PR #101; RC #2 is planned, not yet promoted. Public release/Canon gates remain separate.**

This document owns the plan, milestone acceptance and deferrals. [README](README.md) owns current capabilities, user instructions and [developer verification](README.md#developer-bootstrap); [AGENTS](AGENTS.md) owns engineering policy. The [Build 115](docs/development/build-115.md) and [Build 116](docs/development/build-116.md) worklogs own completed stages, corrective history and evidence. [Release comparisons](docs/development/build-115-release-delta.md) distinguish public Build 113 from internal Build 114.

<a id="build-115n-acceptance-gates"></a>

## Build 115 release acceptance and qualifications

All 15 delivery stages are complete. **The owner accepted Build 115 for Release 4 on October 20, 2026**, following extended 115N testing and live public RC feedback. Automated Linux/Windows CI and the shared distribution contract passed. Acceptance is a release decision, not universal browser/device certification. Schema 10 is frozen; new feature work does not reopen Build 115. See the [completed engineering history](docs/development/build-115.md) and [audit dispositions](docs/development/build-115.md#audit-disposition-index).

- Firefox shared-display **audio** is unavailable through its display-capture API; Stream requires an audio track and rejects video-only sessions. Chrome, Opera and Edge Stream operation was owner-reported. File and Mic have separate support requirements.
- The owner reported direct-local-file and Python-hosted functional coverage in Chrome, Opera, Edge and Firefox; exact codecs and a complete browser/mode/case matrix are not inferred. Managed Chromium automation used HTTP; its direct `file://` navigation was blocked.
- Browser/device combinations, real media, physical touch, native capture/permission dialogs, accessibility, recording/export fidelity and external-player/download/long-duration behavior have not all been independently certified. Network-disabled portable operation and maskable artwork remain unverified. Unsupported features and environmental limits are not passing tests.
- [README distribution guidance](README.md#developer-bootstrap) links the canonical portable artifact and shared hosted build. Hosted deployment requires the complete generated directory; no caching/installability claim is made.

## Protected semantics and limits

- Orb channel selects waveform, full-channel energy and selected-band energy. Empty targets use full-channel energy; nonempty targets average the selected channel's energies. Global spectrum/dominant remain real combined C. Inherited dominant color follows an Orb's target; explicit dominant remains global C.
- Designed phase is canonical radians in `[0, TAU)`, displayed in degrees. Editing preserves live history; Reset Visuals applies design and clears trails; track reset clears trails without changing phase. Pause stops Orb/free Ring motion/emission while analysis and TTL aging continue.
- Published schema 10 and accepted development schema 11 are immutable; schema 12 is the immutable authored-camera format; schema 13 adds frozen deltas and ordered ranges without changing canonical Scene configuration. Future persisted changes require versioning/migration under [AGENTS](AGENTS.md#21-schema-discipline). Legacy support and CONFIG → preferences → runtime.settings → state remain protected.
- Selected particle budgets are enforced without hidden default ceilings. Zero emission preserves history; zero retention clears/rejects it. Nonzero spacing filters new same-Orb placements, never deletes nearby history. Emission work has an immutable 1/30 s ceiling; ordinary motion integrates visible elapsed time up to the 0.5 s discontinuity threshold.
- The 4,096-Orb admission ceiling and expert particle maxima are operational bounds, not safe-device/FPS claims. Audio, source, recorder, Nyquist, and shared portable/hosted build ownership remain protected.
- Recorder correctness and prior-export preservation remain mandatory; encoded-data limits do not bound total browser memory.

Analysis remains independent of visualizers; consumers neither access Web Audio internals nor mutate producer-owned analysis. Stable Orb identities, surviving history, zero-Orb validity and one writable UI owner per setting remain binding [engineering contracts](AGENTS.md). A separate Scene/compositor architecture is not a prerequisite. Detailed implementation and superseded contracts live in the [Build 115](docs/development/build-115.md) and [Build 116](docs/development/build-116.md) worklogs.

<a id="known-deferrals-after-115mh"></a>

## Known deferrals

Build 116 implements the simulation-world/viewport separation assigned after Build 115 to address resize/move/orientation smearing; resize, high-DPI and retained-history acceptance remain explicit [116 gates](#build-116-simulation-world-camera-and-projection). Orb/Queue ergonomics, constrained-hardware rendering/analysis, heavy Canvas/UI work, large synchronous retirement and broader source/recorder resource hardening remain [Build 117](#build-117-ux-and-performance-hardening). Spectral partition and legacy-name ambiguities remain [Build 118](#build-118-richer-spectral-selection).

Build 115's accepted items (AUD-001/003/005, editor jump, Stream stereo, schema closure, visualizer ownership, RC-01–RC-22 and distribution metadata) are not open deferrals. Future improvements retain their existing owners; this plan creates no new functional assignment.

## Build 116: simulation world, camera and projection

**Status: RC #1 authorized October 29, 2026 (promotion PR #100); accessibility corrections merged subsequently in [PR #101](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/101). The current `main` includes those corrections but retains the RC #1 version string. RC #2 is intended, not yet promoted; public release/Canon not authorized.** Build 116 includes independent world geometry, live Camera controls, authored Scene views, compact preset sharing, opt-in File Queue clearing and numeric Trace fade length 0–20. Particle Birth Color and Angular Trace are excluded. The writer uses schema 16; experimental schemas 14/15 are reserved and rejected. Build 115 remains the public release; RC #1 is accepted for testing, but Build 116 has no Canon or public-release acceptance. See the [candidate contract](docs/development/build-116.md#116-feature-candidate) and [audit dispositions](docs/development/build-116.md#pre-rc-audit-dispositions).

World geometry is an independent reference coordinate system, not the window's dimensions. World width/height define proportional Orb and Ring geometry; they do **not** impose clipping, collision, automatic particle retirement, or camera movement limits. Viewport/DPR concern presentation, not world state.

Release evidence and acceptance gates (RC #1 owner dispositions below):

- Verify Queue completion/mutation fencing and Fade 0 pixel/path parity; evaluate positive fades, joins and overlaps on owner devices.
- Verify schema-16 round trips, schema-13 frozen-default reconstruction, ordered contiguous/sparse/reordered selections, native DEFLATE framing and bounded streaming decode. Preserve schemas 2–13 and canonical numerical precision; reject reserved schemas 14/15 atomically.
- Verify compressed startup before the first application frame, stale-import cancellation and accurate compression/clipboard fallback.
- Run the Chromium preset gate and optional Firefox/WebKit interoperability checks as tooling permits; execute available [116E device checks](docs/development/build-116.md#116e-owner-device-matrix). Owner reports Windows Chrome, Edge, Firefox and Opera, and multiple physical Android devices using Chrome. **No native Safari test has been performed**; the owner accepts that gap for RC #1 without claiming Safari support. Direct-file/offline coverage and exact browser/codec combinations are not inferred from the reports.
- Complete documentation reconciliation and review for the RC #2 promotion decision; preserve original RC #1 evidence and distinguish post-RC #1 changes.
- **AUD116-006 / R2-003 remains open**, owner-accepted as a diagnostic risk for RC #1: Ubuntu duplicate-save assertions failed in [run 40830745837](https://github.com/cosmicdance-4-2-0/Auralprint1/actions/runs/40830745837/attempts/1) and [run 40873236076](https://github.com/cosmicdance-4-2-0/Auralprint1/actions/runs/40873236076/attempts/1). Identical-SHA reruns passed. Interrupted saves can reproduce the assertion without corrupt publication, but the original cause is unknown; GitHub-runner causation is an unverified suspicion. Do not weaken the test or mark it fixed.
- The pre-RC hostile audits and [final review](docs/audits/20261029-auralprint-116-final-pre-rc-review.md) are historical evidence. A subsequent context-blind RC #1 artifact review identified scrubber/Queue accessibility deficiencies; [PR #101](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/101) corrected them and closed test-harness finding AUD101-001. No new demonstrated blocker emerged from that correction; newly reproduced release defects still require owner disposition.
- **Owner RC #1 evaluation:** Windows Chrome/Edge/Firefox/Opera and physical Android Chrome functional testing reported; Camera touch gestures confirmed across multiple Android revisions. Trace fade appearance accepted by the owner and its original requester. Precise device and per-feature matrix remain unspecified.
- **RC #1 promotion authorized by the owner October 29, 2026.** Verify the actual versioned RC commit before treating its build/distribution as accepted. Public release, Canon, tagging, deployment and publication each require separate owner authorization.
- World dimensions can be configured independently of browser dimensions; changing viewport size, devicePixelRatio, pan, zoom or camera rotation must not mutate Orb locations/phases, retained particle coordinates, Ring geometry, analysis or playback.
- Verify familiar Build 115 default framing and loaded schema-10 presets. Preserve schema-11 world geometry and the fixed legacy pixel-to-world spacing migration.
- Pan, zoom, rotation, reset and the inverse coordinate transform are deterministic and accessible; camera reset returns to a documented default and interactive controls avoid transport, seek, drag/drop and panel gesture conflicts.
- Verify direct-touch Camera pan/pinch/twist, moving-midpoint anchoring and either-finger recovery on available owner devices. Android gestures are physically confirmed across multiple revisions; **iOS Safari has not been tested** and is explicitly qualified for RC #1. The [touch contract](docs/development/build-116.md#camera-touch-completion) extends historical 116C; native automation is separate evidence.
- Schema 12 persists only the explicitly saved `sceneCamera`; `state.camera` remains the live performance view. Copy Share Link does not capture movement. Startup and URL import initialize the live camera from the normalized authored view; schemas 2–11 initialize factory defaults. Schema-11 world geometry and unit spacing survive migration. World and authored-camera settings traverse the canonical preferences pipeline.
- World-unit particle spacing and CSS-screen-sized particle/Trace/Ring presentation retain explicit semantics; camera transforms must not silently change emission decisions. Resize, high-DPI, history retention, recording, hosted and single-file behavior pass regression validation.

The owner accepted the available Windows/Android Camera experience and the requested Trace fade appearance for RC #1. Safari, direct-file/offline combinations, native recording/media workflows and resource behavior not explicitly reported remain unverified; automated evidence is not physical certification. See the [RC #1 owner dispositions](docs/development/build-116.md#116-rc-1--owner-promotion-and-qualifications).

## Build 117: UX and performance hardening

**Status: planned; targeted fixes may accompany their owning milestone.**

Measure rendering and analysis on constrained hardware, reduce unnecessary hidden-panel updates, and address interaction problems found during Build 115/116 use. Preserve useful tooltips, reset behavior, and recoverable panel visibility.

Acceptance gates:

- Establish and record representative device, audio, viewport, FFT, and particle settings before comparing performance.
- Prevent unbounded work and new per-frame allocations; show an actionable explanation for any user-visible performance limit.
- Repeated source changes, queue operations, panel toggles, and recording cycles do not accumulate listeners or retain obsolete media resources.
- Keyboard and narrow-layout checks cover every panel, including empty, loading, error, and finalizing states.

### Outstanding UX and resource work

| Concern | Scope / qualification |
| --- | --- |
| Orb editor ergonomics / high-count navigation and long panels | Build 117 UX refinement |
| File / Queue UX refinement | Build 117, retaining accepted focus/cancellation corrections |
| Broader constrained-hardware performance / resource hardening | Build 117; RC-15 corrective work is closed, and broader tuning is deferred |
| Broader source/load lifecycle hardening (October 6 AUD-006) | Build 117; demonstrated RC-02–RC-05 concurrency/EOF defects are closed |
| Broader recorder memory / encoder optimization (October 6 AUD-009) | Build 117; October 9 AUD-006 bounded application policy is implemented and merged through N.3F (PRs #59/#60). Encoded payload does not bound total browser memory; N.2 high-resolution VP8 reached its diagnostic resource guard. |
| Injected File-tap cleanup refusal (AUD116-005) | Build 117 hardening, as retained in [PR #94](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/94). Native failure reachability remains unestablished; this is separate from the unresolved Build 116 watcher gate. |
| Remaining allocations / hidden UI refresh / channel-complete analysis cost (AUD-012) | Build 117; direct Trace suffix traversal and demonstrated quadratic editor/tooltip work have already been corrected |

## Build 118: richer spectral selection

**Status: planned; the basic chooser shipped in Build 115.**

Expand the spectral system with frequency-aware selection and inspection, visual confirmation, configurable practical band-table sizes, curated counts envisioned around 5/64/256/1024/2048, deterministic thematic naming from planetary/core through cosmic/quantum imagery, and sensible generated fallbacks. The current canonical 256-band implementation remains unchanged until that work. Add only controls that correspond to implemented analysis behavior. Weighted aggregation remains a separate design decision, not an implied capability.

Acceptance gates:

- Selection feedback explains the active distribution and effective frequency range.
- Named selections resolve deterministically to supported band IDs or receive an explicit new schema design if they need different persistence semantics.
- Selection remains legible for sparse and dense targets, and each orb's configuration remains independent.
- Existing presets retain their meaning; new persisted fields follow the full schema process.

### Outstanding spectral decisions

| Concern | Scope / qualification |
| --- | --- |
| Adjacent positive-width FFT-bin overlap (AUD-004) | Intentional current behavior; Build 118 spectral partition work, separate from corrected coordinate scaling |
| Duplicate legacy band-name migration ambiguity (AUD-013) | Build 118 |

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
