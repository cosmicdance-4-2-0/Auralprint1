# Auralprint development roadmap

Updated: October 2, 2026. App baseline: `v0.1.15` / Build 115. Preset schema: 9.

The immediate priority is to make the existing analysis and orb controls usable. New engine capabilities follow a working interface, a reliable preset path, and a verified offline single-file build.

This roadmap directs development; `agents.md` defines the architecture and change contract. Release 3 / Build 113 remains the documented canonical public release. Build 114 and Build 115 are internal milestones. A development milestone is not a public release claim.

## Current capability inventory

The following capabilities are present in the current source. Passing unit tests establish their covered behavior; they do not substitute for browser, device, permission, or media testing.

| Area | Implemented | Current usability gap |
| --- | --- | --- |
| Playback and queue | Multi-file loading, drag and drop, queue navigation, removal, clear, shuffle, repeat, decoded waveform seeking | Queue access and transport must remain discoverable when panels are hidden or the viewport is narrow |
| Audio sources | File, microphone, and shared stream source manager; supported/unsupported/requesting/error states; teardown on source change | Source controls and file-only restrictions need understandable labels and coherent recovery paths |
| Analysis | L/R/C analysis, canonical 256-band default, linear/log/mel/bark/ERB distribution, Nyquist-aware ceiling | Technical controls need grouping and explanations; avoid exposing another wall of controls |
| Orbs | Per-orb channel, band selection, direction, starting angle, hue offset, color source, and simulation-space center | Band targeting currently requires entering indices; starting angle is a preset/code configuration field rather than a dedicated control |
| Visuals | Trails and particles, band overlay, global color controls, reset visuals | Related settings are scattered across long panels; first-use and advanced controls compete for space |
| Capture | Recording panel, canvas video and optional source audio, negotiated formats, target frame rate, latest-export download | Capture actions and availability must remain visible and truthful across file/live/recording states |
| Presets | URL configuration serialization; schema 9 orb fields; accepted legacy schemas and migrations | No dedicated preset-file import/export workflow yet |
| Workspace | Panel show/hide controls, unified launcher, launcher collapse, global panel visibility shortcut | Launchers need visible names; long panels and queue recovery need improvement |

Camera pan/zoom/rotation, richer band tools, preset-file workflows, and 3D are planned. A separate scene/compositor architecture is not a prerequisite for finishing the current interface.

## Delivery order

1. Complete Build 115 usability and prove the existing orb features work through the interface.
2. Add Build 116 camera controls with an explicit separation between rendering and simulation.
3. Harden performance and interaction behavior in Build 117 using measurements and reported friction.
4. Extend spectral selection in Build 118 after the basic chooser has been used and validated.
5. Deliver preset-file workflows in Build 119.
6. Reassess the optional Build 120 3D experiment against stability and performance evidence.

The basic band chooser is deliberately pulled forward from Build 118 into Build 115 completion. It exposes the existing `bandIds` configuration; it does not introduce a new analysis model or preset field. The numbered milestones retain their themes.

## Build 115 completion: usable controls for the existing engine

**Status: interface implemented in the working tree; browser/media acceptance remains open.**

### Implementation checkpoint — October 2

Implemented a lazy per-orb band chooser with name/index search, validated range replacement, individual checkboxes, actual BandBank frequency labels, and explicit full-spectrum restoration. Sparse selections remain sparse. Exact-ID drafts survive ordinary UI refresh; invalid input leaves preferences unchanged and shows an inline error. Configuration and band-edge changes synchronize the chooser without rebuilding it on animation frames.

Orbs now appear first in collapsible settings groups. Audio, Queue, Orbs, Bands, and Record have named launchers; unwired placeholders are removed. Audio and the side panels can hide independently; Queue has its own launcher and close action. View/H restores the previous panel selection. Transport wraps, and panel clearance follows its measured height. A more opaque panel surface improves text legibility over the canvas. This changes UI metadata only; preset schema 9 and transport ownership are unchanged.

Validation so far: **84/84 Node tests pass**, including new component interaction, independent targeting, invalid-input, draft-preservation, row-reuse, queue-recovery, disclosure-keyboard, and panel-restoration cases. The existing schema 9 round-trip, schema 8 migration, source-lifecycle and recording-lock tests pass. Static markup inspection confirms balanced tags, 167 unique IDs, and resolvable labels/cached controls. The single-file build succeeds.

Browser validation is **not complete**. The in-app browser remained on a loopback connection-error page, and Browser Use rejected that page's `data:` URL under its HTTP/HTTPS-only policy. A local server reported listening, but no successful preview load was observed. Do not treat the unit tests or build as evidence of correct rendered layout, live playback, actual device permissions, or real recording export.

Next acceptance work: load the generated HTML in a working browser session; check desktop and narrow layouts, both orb selections and a URL reload, keyboard focus, panel overlap/recovery, generated-audio playback/queue/seek/auto-advance, sample-rate-dependent frequency labels, and recording export. Keep Build 116 behind those gates.

### Configuration still accessible through presets/code only

The current interface does not yet expose `orbs[*].startAngleRad`, `trace.lineAlpha`, `trace.lineWidthPx`, `bands.floorHz`, `bands.ceilingHz`, or the overlay's connecting-line alpha/width. Band count remains canonical at 256; timing and mono-detection tuning remain engine controls. Consider start angle and trace styling in the next Build 115 usability pass after browser acceptance. Frequency-bound controls need explicit validation and Nyquist-aware feedback before exposure.

Targeting semantics remain those of the existing engine: selected IDs aggregate **combined-channel** band energies; Channel selects the waveform and full-spectrum channel energy. Dominant color refers to the global dominant band. The chooser does not imply per-channel selected-band analysis or per-selection dominant colors.

### Work to deliver now

- Replace mandatory manual band-index entry with a per-orb chooser supporting search and contiguous range selection. Keep an explicit full-spectrum action and visible selection summary. Retain precise index editing as an advanced affordance when useful.
- Make empty selection semantics clear: the existing empty `bandIds` array means full spectrum. A chooser must not imply that the orb is muted or has no target when it writes this value.
- Derive chooser names, valid indices, and displayed ranges from the configured band system. Respect the active distribution and Nyquist ceiling when describing frequencies.
- Group related controls into keyboard-accessible collapsible sections. Keep common orb controls easy to find; reveal detailed particle, motion, analysis, and overlay controls progressively.
- Give the workspace launchers visible names. Keep each panel recoverable and give Queue an accessible route independent of Audio panel visibility.
- Make transport and panel layouts usable at narrow widths, with scrolling contained inside panels and sufficient canvas space to see the result.
- Keep source and capture status understandable. File-only actions remain disabled for live sources, and recording finalization continues to protect destructive transport changes.

### Architectural limits for this milestone

- Use the existing `preferences.orbs[*].bandIds` pipeline and `normalizeOrbDef()`; preserve schema 9 unless an actual persisted field changes.
- Store section expansion, search text, and chooser interaction state only as ephemeral UI state. They are not presets.
- Leave track changes on `loadAndPlay()` and retain the single `_onTrackEnded` hook.
- Preserve immutable `CONFIG`, settings derived by `resolveSettings()`, offline operation, and the current single-file output.
- Avoid unrelated refactors, new runtime dependencies, speculative scene abstractions, or camera behavior inside orb simulation.
- Refresh selection UI on user actions and configuration changes; do not add band-chooser DOM work to the animation loop.

### Acceptance gates

- A user can assign different spectral targets to the two default orbs, switch either back to full spectrum, and understand the selected result without memorizing indices.
- A URL preset preserves each orb's channel, targets, hue, color source, direction, start angle, and center. Schema 8 presets continue to receive the expected Build 115 defaults.
- Search, range selection, and preset application keep the displayed selection consistent with actual preferences. Invalid input cannot silently produce a misleading selection summary.
- Audio, Queue, Sim, Bands, and available recording controls remain recoverable after individual hides, launcher collapse, global hide, and source changes.
- Keyboard activation, visible focus, control labels, and focus recovery work. Collapsed or hidden controls cannot remain in the tab sequence.
- Narrow and desktop layouts keep transport, panel scrolling, close actions, and launchers usable without overlap that blocks access.
- File loading, next/previous, queue jump/removal, seeking, repeat, and track-end advance retain their lifecycle behavior. Live-source failures remain recoverable, and recording locks remain correct.
- Run `npm test`, then `npm run build` sequentially. Verify the generated standalone HTML in a browser with no normal-flow console errors and no duplicate actions after repeated open/close cycles.
- Check playback and analysis with real or generated audio, including a sample rate whose Nyquist frequency is below the configured ceiling. Verify that controls change analysis/visual behavior and that the highest bands do not collapse because of an unclamped ceiling.

**Baseline evidence:** the existing suite passed 78/78 tests before the usability work. The existing build command succeeded. The suite covers source lifecycle, recording restrictions, several panel recovery paths, waveform seeking behavior, schema 9 orb round trips, schema 8 orb migration, and exclusion of runtime source/recording data from presets. These are baseline results, not completion evidence for the new interface.

The current build-directory test temporarily renames `.build` and `dist`. Running a build or watcher at the same time can invalidate that test or interfere with its output restoration. Keep validation sequential.

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

Extend the proven chooser with better frequency-oriented inspection, named selections, and visual confirmation in the analysis display. Add only controls that correspond to implemented analysis behavior. Weighted aggregation remains a separate design decision, not an implied capability.

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
