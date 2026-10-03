# Auralprint Changelog

---

## v110 → v111

### New Features

- **Orb routing expanded from channel-only presets to channel-plus-band targeting.** Orb definitions moved from legacy `bandId` routing to `chanId` plus optional `bandIds`, and preset/hash migration now accepts older `bandId` and `bandNames` payloads while normalizing them into the new shape.
  - **Why:** New helpers such as `normalizeOrbChannelId`, `sanitizeOrbBandIds`, and `normalizeOrbDef`, plus the schema bump to v6, show a deliberate move toward richer per-orb spectral routing without abandoning older presets.
  - **Impact:** Maintainers can evolve orb behavior without carrying ad hoc legacy cases throughout the render loop, and presets from earlier builds continue to load instead of breaking on the new orb model.

- **Band metadata became sample-rate aware instead of using a fixed descriptive string.** The bands panel now reports sample rate, Nyquist, configured ceiling, and effective ceiling derived from the active audio context.
  - **Why:** New band metadata state and `refreshBandMetaText()` were added alongside Nyquist-aware rebuild logic, which strongly suggests the earlier static copy was no longer accurate enough once band ceilings became runtime-dependent.
  - **Impact:** Users get a truer picture of the active analysis range, and maintainers can inspect band-bank behavior directly from the UI when debugging device-specific sample-rate differences.

### Changes

- **Band-bank rebuilds were split into a dedicated controller layer.** `BandBankController` now tracks the current band-definition key, notices when the audio context sample rate becomes known, and triggers rebuilds only when band definitions or the effective ceiling actually change.
  - **Why:** The new controller centralizes rebuild timing and removes direct `BandBank.rebuild()` calls from multiple UI flows.
  - **Impact:** Band analysis becomes easier to reason about, and future changes to band definitions or source initialization have a single coordination point instead of scattered rebuild calls.

- **Orb reset behavior now preserves designed phase offsets.** Reset and preset-apply flows call `resetOrbsToDesignedPhases()`, which restores each orb to its configured `startAngleRad` and realigns the ring phase from the primary orb rather than always zeroing phase.
  - **Why:** The new `startAngleRad` ownership pattern and reset helper indicate that orb phase became part of the intended visual design rather than disposable runtime state.
  - **Impact:** Visual resets are deterministic and match preset intent, which is especially important now that multiple orbs can begin in intentionally offset positions.

- **Frame and HUD updates were made more deliberate.** Maximum delta time was loosened from `1/200` to `1/30`, the animation loop now explicitly clamps to a "slow frame" budget, and the band HUD refresh is throttled instead of updating every render frame.
  - **Why:** The added comments and throttling state (`lastBandHudUpdateMs`, `bandHudIntervalMs`) point to a conscious attempt to prevent large timing spikes and avoid wasteful UI churn.
  - **Impact:** The render loop should behave more predictably after tab switches or long frames, and the band panel does less unnecessary DOM work while still feeling live.

### Fixes

- **Band ceilings now honor Nyquist instead of blindly trusting configuration.** Rebuild logic computes an effective ceiling from the configured ceiling and the active sample rate, then stores both values in state for downstream UI and analysis code.
  - **Why:** The new metadata fields and rebuild signature explicitly distinguish configured and effective ceilings, which addresses the earlier mismatch between static configuration and actual analyzable range.
  - **Impact:** Upper bands are less likely to become misleading or effectively dead on lower-sample-rate inputs, and maintainers can diagnose ceiling-related edge cases more directly.

- **Band range construction became more defensive around narrow or degenerate ranges.** The bin-range logic now guards against inverted ranges with a stricter comparison, and orb/band inputs are sanitized before they enter runtime state or URL presets.
  - **Why:** The sanitization helpers, legacy-field cleanup, and tighter band-range conditional all point to hardening around malformed or migrated inputs.
  - **Impact:** Older or partially invalid presets are less likely to produce broken band assignments, empty orb selections, or misleading analysis output.

---

## v111 → v112

### New Features

- **Auralprint became a queue-driven audio transport instead of a single-file loader.** Build 112 introduced a real `Queue` model with multi-file load, drag-and-drop enqueueing, previous/next navigation, repeat modes, shuffle, click-to-jump queue rows, and per-item removal.
  - **Why:** The new queue module, transport buttons, and `loadAndPlay()` ownership comments show a deliberate shift from manual file replacement toward jukebox-style playback.
  - **Impact:** Users can treat the app as a session-based playlist tool, while maintainers now have a central transport model instead of scattered one-off file loading flows.

- **The bottom transport gained a scrubber timeline with seeking.** The audio panel was redesigned into a two-row dock with a waveform scrubber canvas, elapsed/total time readout, and keyboard seeking on the left/right arrows.
  - **Why:** The dedicated `Scrubber` module and scrubber row markup were added together with new seek handlers, which indicates a full transport-control addition rather than visual polish.
  - **Impact:** Playback position is now inspectable and adjustable without leaving the visualization, making the tool more practical for repeated listening and analysis.

- **Band-overlay controls became independently configurable.** New controls were added for overlay min radius, max radius, and overlay-specific waveform displacement, with corresponding preset-schema support.
  - **Why:** The v7 schema bump and new `bands.overlay.*` controls show the overlay was being separated from the orb radius/motion settings into its own tunable subsystem.
  - **Impact:** Users can shape the band overlay independently of the orb system, and preset authors gain finer control over how spectral overlays occupy the canvas.

### Changes

- **The transport UI was reorganized into a more complete "jukebox" workflow.** The app now shows a first-run load hint, a queue toggle, a clear-queue affordance, a dedicated "Reset Visuals" control, clearer transport labels, and queue panel affordances that sit above the audio dock.
  - **Why:** The new panel layout, first-run overlay, and queue/status controls indicate the file transport became important enough to deserve its own interaction model.
  - **Impact:** The app feels less like a demo harness and more like an analyzable playback environment, with cleaner entry points for both first-time and repeat usage.

- **Accessibility and control discoverability improved across the UI.** Build 112 added `:focus-visible` handling, explicit button/launcher labels, queue-row keyboard activation, and config tooltip live-value refresh behavior.
  - **Why:** The new focus-ring CSS, `aria` attributes, keyboard handlers, and tooltip-refresh helpers all point to a pass focused on navigation clarity and control feedback.
  - **Impact:** Keyboard users can operate more of the UI safely, and maintainers now have a clearer framework for keeping control text and live values in sync.

- **Visualization and analysis defaults were retuned for denser output.** Defaults shifted toward more visible traces and higher analysis detail, including enabled trace lines, more lines, dominant-band line coloring, larger particles, `fftSize` `8192`, lower smoothing, and adjusted band floor/ceiling values.
  - **Why:** The configuration deltas are broad and coordinated rather than incidental, suggesting a deliberate change in the default aesthetic and analysis fidelity.
  - **Impact:** Fresh sessions will look and respond differently than v111, with more explicit spectral detail and a stronger "instrument" feel out of the box.

### Fixes

- **Track changes now route through a single clean-slate loader path.** `loadAndPlay()` and `resetTrackVisualState()` centralize trail resets, scrubber resets, dominant-band clearing, and queue-aware transition handling for every track-change entry point.
  - **Why:** The code explicitly audits all track-change routes and funnels them through one helper to stop state bleed between pathways.
  - **Impact:** Switching tracks is less likely to leave stale waveform previews, old trail particles, or mismatched dominant-band HUD state behind.

- **Queue clearing and active-item removal now fully unload transport state.** The clear/remove paths explicitly unload audio, blank the scrubber, clear filename/playback flags, and disable transport based on the resulting queue state.
  - **Why:** The new `clearAudioState()` helper and the surrounding comments document a full clean-slate contract that the earlier transport did not have.
  - **Impact:** Empty-queue scenarios behave predictably instead of leaving half-loaded media state or misleading UI behind.

- **File re-selection and drag-drop edge cases were hardened.** The file input is cleared before each picker open so the same file can be loaded twice, and window-level drag/drop prevention stops accidental browser navigation outside the canvas drop target.
  - **Why:** Both behaviors are called out directly in the new comments and event handlers, indicating they were observed pain points rather than speculative safeguards.
  - **Impact:** Repeating analysis on the same asset works reliably, and drag-and-drop is less likely to eject the user from the app.

---

## v112 → v113

### New Features

- **A dedicated recording/export workflow was added.** Build 113 introduced a separate recording panel and bottom-right camera launcher with start/stop controls, support probing, status text, elapsed timer, latest-export download, MIME selection, target FPS selection, and an "include audio" toggle.
  - **Why:** The new record panel markup, camera launcher, recording config block, and `RecorderEngine` state model clearly establish recording as a first-class subsystem rather than an experimental hidden hook.
  - **Impact:** Users can export captured sessions directly from the app, and maintainers gain a defined UI boundary for recording behavior that stays separate from normal playback controls.

- **Band spacing moved beyond a log/linear toggle to named perceptual distributions.** `distributionMode` replaced the old boolean `logSpacing`, with support for `linear`, `log`, `mel`, `bark`, and `erb`, and ERB became the default.
  - **Why:** The schema bump to v8, new scale-conversion helpers, and the distribution-mode selector show a deliberate broadening of how spectral bands are laid out.
  - **Impact:** Analysis layouts can now be tuned for different perceptual goals, and preset authors are no longer constrained to a single log-spacing decision.

### Changes

- **Recording was integrated through a dedicated engine and shared state instead of bolted onto transport code.** `RecorderEngine` now owns capture probing, stream acquisition, MIME negotiation, session lifecycle, and export finalization, while the UI reads from `state.recording`.
  - **Why:** The code introduces a full recorder state factory, recorder-specific UI sync model, and explicit engine methods such as `start`, `stop`, `selectMimeType`, `setIncludePlaybackAudio`, and `setTargetFps`.
  - **Impact:** Recording behavior is easier to evolve independently, and playback code can notify the recorder about transport mutations without absorbing recorder-specific control flow.

- **Transport and recording were coordinated without merging their UI ownership.** File load, queue changes, and natural track end events now notify `RecorderEngine.onTransportMutation(...)`, but the record controls remain isolated in their own panel and launcher.
  - **Why:** Multiple comments explicitly warn against folding recording controls into `#audioPanel`, and the transport hooks are narrow notifications rather than shared state mutations.
  - **Impact:** Recording can persist across track changes and queue events while preserving a cleaner separation of concerns for future maintenance.

- **Preset and config handling were updated to match the new band model.** URL presets now read and write `distributionMode`, retain legacy `logSpacing` compatibility, and present the selected distribution directly in the bands UI.
  - **Why:** The v8 migration path and the new selector wiring show that band-layout choice was meant to become a stable user-facing preference, not just an internal constant.
  - **Impact:** Shared links stay meaningful across the band-spacing overhaul, and maintainers can extend band-layout logic without leaving old presets stranded.

### Fixes

- **Preset import now rebuilds from canonical defaults instead of inheriting live state.** URL preset application clones `CONFIG.defaults` before migration/sanitization rather than starting from the already-mutated current preferences object.
  - **Why:** The new comment makes the intent explicit: older or partial payloads should not inherit whatever state happened to be live when the hash was applied.
  - **Impact:** Partial or older preset hashes load more predictably and are less likely to carry unrelated runtime state forward.

- **Visual color inputs became stricter.** Incoming preset colors are now validated with `isValidHexColor()` before they are accepted into preferences.
  - **Why:** The new validator was inserted exactly where preset colors are read, which indicates earlier imports could admit malformed values.
  - **Impact:** Invalid color payloads are less likely to corrupt the visuals state or produce inconsistent rendering behavior.

- **URL encoding and schema migration paths were hardened.** The preset encoder no longer spreads byte arrays directly into `String.fromCharCode(...)`, and transitional schemas v5-v7 are accepted during migration into the v8 model.
  - **Why:** The encoder rewrite and explicit legacy-schema constants both point to defensive compatibility work around older or larger preset payloads.
  - **Impact:** Shared links should be more robust across release boundaries, especially when importing legacy hashes or larger serialized preference sets.

---

## v113 → v114

### New Features

- **Auralprint gained live input workflows alongside file playback.** The audio panel now exposes `File`, `Mic`, and `Stream` source selectors, backed by an `InputSourceManager` that activates microphone input or display/shared-stream capture, handles permissions, and tears down or reconnects sessions when streams end.
  - **Why:** Build 114 adds real `getUserMedia` and `getDisplayMedia` activation paths, source-state tracking, permission normalization, and ended-stream cleanup instead of placeholder UI.
  - **Impact:** The app is no longer limited to offline file analysis; it can now analyze live microphone and shared-stream sources inside the same visualization environment.

- **Recording support became source-aware instead of file-playback-only.** The recorder now asks the active audio subsystem for the current recordable source stream, allowing recording to include live-input audio without enabling local monitoring for those inputs.
  - **Why:** `RecorderEngine.init()` now receives a source-aware audio tap, and the audio engine exposes recorder tap behavior that differs for file playback versus upstream media streams.
  - **Impact:** Capture exports follow the currently selected input workflow, which makes the new live-source modes useful for actual session recording instead of visualization only.

### Changes

- **The shipped artifact now reflects a modularized internal codebase.** The v114 HTML bundle is annotated with `src/css/...` and `src/js/...` sections for subsystems such as `audio-engine`, `input-source-manager`, `queue`, `scrubber`, `recorder-engine`, `renderer`, and UI helpers.
  - **Why:** The release reorganizes large contiguous blocks into clearly labeled module boundaries rather than leaving everything as one monolithic inline script/style block.
  - **Impact:** Maintainers get much clearer subsystem ownership and a more scalable architecture for future releases, even though the canonical artifact is still delivered as a single HTML file.

- **The transport UI became source-aware instead of assuming file playback.** The load hint now says "Choose File, Mic, or Stream," the scrubber is visually disabled in live-input modes, audio status text distinguishes live sources from file playback, and file-only transport actions are gated behind file workflow checks.
  - **Why:** The new source selector copy, `data-source-mode` styling, and `isFileWorkflowMode(...)` guards show that source mode now drives large parts of the UI contract.
  - **Impact:** Users get clearer feedback about what operations make sense for each input type, and maintainers have explicit source-mode branches instead of implicit file-only assumptions.

- **Source selection became part of the app's state-management model.** Build 114 introduces source support/permission/status fields, source switch dispatchers, live-input reset hooks, and audio-engine support for attaching `MediaStream` sources.
  - **Why:** The new `state.source` shape, `dispatchSourceSwitchAction(...)`, and `attachMediaStreamSource(...)` plumbing indicate that live inputs were added as a structural runtime concern, not just as transport shortcuts.
  - **Impact:** Future source types can be integrated through the same lifecycle model, and debugging source-related issues is easier because support, permission, and active-session state are tracked explicitly.

### Fixes

- **File transport mutations are now blocked while recording finalizes.** Queue mutations, source switches, and other destructive file-workflow actions check `isFinalizingFileTransportLocked()` and surface an explicit finalization toast instead of racing the export lifecycle.
  - **Why:** Build 114 adds many guards and copy helpers around the recorder's `finalizing` phase, which suggests file transport changes were unsafe during export finalization.
  - **Impact:** Finalized recordings are less likely to be interrupted or corrupted by impatient UI interactions during export completion.

- **Live input shutdown and interruption paths were made recoverable.** When microphone or shared-stream sessions end, the new input-source manager resets session metadata, updates status text, and prompts the user to reconnect rather than leaving stale active state behind.
  - **Why:** The new `handleExternalStreamEnded()` flow, cleanup registration, and normalized error/permission messages show explicit handling for ended-track and interrupted-session edge cases.
  - **Impact:** Live-input workflows fail more gracefully, which reduces dead-session states and makes reconnecting clearer for users.

- **File-only controls now fail safely outside file mode.** Queue actions, drag-and-drop loading, and track navigation are guarded with file-mode checks and user-facing affordance text instead of silently doing the wrong thing in live-input workflows.
  - **Why:** The new `toastFileModeOnlyAction()` path and repeated `isFileWorkflowMode(...)` checks were added specifically around transport controls that only make sense for queued files.
  - **Impact:** The expanded source model does not leave legacy file controls in ambiguous states, which reduces accidental no-ops and cross-mode bugs.
