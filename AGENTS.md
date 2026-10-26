# AGENTS.md — Auralprint

## 0. Identity and authority

Auralprint is an offline-capable FFT audio-analysis application with playback, visualization and recording.
**Interfaces are canon; modules are mutable.** Analysis drives visualization.

- Source owns implementation truth; [ROADMAP](ROADMAP.md) owns scope/acceptance/deferrals, [README](README.md)
  user/developer guidance, [Build 115](docs/development/build-115.md)/[116](docs/development/build-116.md)
  worklogs history. Historical checkpoints do not supersede current contracts.
- Read owning source/contracts before relevant edits. Disclose scope deviations, contract changes and
  protected regression risks; exceptions require owner approval. Agents cannot approve architectural
  exceptions or milestone promotion.
- Shipped builds/artifacts/checksums, published presets and protected fixtures/evidence are immutable. RC
  promotion, release, tags, deployment and publication each require explicit owner authority;
  implementation/merge acceptance grants none.

## 1. Configuration and distribution

`CONFIG → preferences → runtime.settings → state`

- Frozen `CONFIG` owns configurable defaults, limits and policy; UI bounds and admission must follow it.
  Scientific constants/mathematical definitions are not configurable policy values. Introduce no unexplained
  policy constants.
- `preferences` owns writable, persistent **Scene** configuration;
  [preferences.js](src/js/core/preferences.js) `resolveSettings()` alone derives `runtime.settings`; `state`
  is ephemeral/resettable. No hidden truth sources or duplicate writable ownership.
- Application-only waveform/recording settings stay outside Scene presets with CONFIG defaults/separate
  controls: [application-preferences.js](src/js/core/application-preferences.js),
  [recording-policy.js](src/js/recording/recording-policy.js). Recording policy freezes on Start; never
  silently persist runtime state.
- Preserve self-contained portable HTML and relocatable hosted editions from the same
  implementation/template/bundles, with shared runtime/schema and their distinct relative metadata/resource
  contracts. Build scripts own packaging. New build steps require approval; dependencies require critical
  need/justification. README/[CI](.github/workflows/ci.yml) own commands.

## 2. Presets and compatibility

### 2.1 Schema Discipline

- Released schema **10** and accepted development schema **11** are immutable; **12** owns authored Scene
  camera. Persisted-field/ownership/semantic changes require versioning and migration; never reuse schema
  numbers incompatibly.
- Update the **complete pipeline**: CONFIG defaults/limits, `sanitizePreset()`, `normalize*()`,
  `encodePresetPayload()`, decoding/migrations, `PRESET_SCHEMA_VERSION`, schema tests, resolution and
  UI/subsystem synchronization. Preserve canonical precision; normalization is not globally
  editing-grid-strict.
- [preset-codec.js](src/js/presets/preset-codec.js) owns encoding/decoding/migration/sanitation. `UrlPreset`
  is transport/preference replacement; callers resolve/synchronize. Invalid imports change neither preferences
  nor camera.
- Preserve schemas **2–12** and approved migrations: both schema-9 forms with top-level precedence and
  abandoned Scene semantics discarded; schemas 2–10 default world/fixed one-world-unit-per-reference-CSS-pixel
  spacing; schema 11 world/unit spacing; schemas 2–11 factory camera, ignoring injected/historical camera
  fields. Never mutate input objects.
- Build 115 H.Q/H.T/H.U/I.A exceptions were approved **before publication**: overlap retirement,
  placement/resources, designed phase. No current exception follows. Preserve obsolete-overlap
  acceptance/stripping (never alias to spacing), defaults and phase precision.
  [History](docs/development/build-115.md#resource-governance-decisions-and-superseded-approaches)/RC-17
  evidence own decisions; codec/normalizers own inventories.
- Presets are configuration only: no queue, playback position, recordings, permissions, source/channel
  metadata/errors, analysis frames/arrays/effective Nyquist, simulation/history, live camera or
  interaction/panel/launcher state.

## 3. Audio, transport and recording

### 3.1 Playback and sources

- All track changes use `loadAndPlay()` in [ui.js](src/js/ui/ui.js), preserving
  trail/scrubber/dominant/playback reset. Keep one `_onTrackEnded` dispatch; never duplicate EOF listeners or
  advance behavior, including during recording finalization.
- Preserve File/Mic/Stream lifecycle/cancellation in
  [InputSourceManager](src/js/audio/input-source-manager.js)/[AudioEngine](src/js/audio/audio-engine.js).
  Stale work cannot replace winning sources/graphs/status; release only owned resources.
- Queue is runtime-only. Preserve multi-file ingestion, jump/remove/clear, auto-advance and repeat behavior;
  UI reflects the actual queue and disables invalid Prev/Next.

### 3.2 Recorder ownership

- [RecorderEngine](src/js/recording/recorder-engine.js) owns sessions/finalization/disposal. Stop finalizes
  once; Cancel aborts new capture, preserves the export and unlocks transport; Dispose terminally discards
  chunks/exports. Preserve source-owned Stop reasons, whole-event admission and shutdown contracts; no
  automatic finalization watchdog.
- For Cancel, Dispose and error aborts, fence session/callbacks/timers **before native stop/cleanup**.
  RecorderEngine stops only render-capture tracks; Renderer owns drawing/canvas, AudioEngine owns tap
  `releaseStream()`, InputSourceManager owns source tracks. Merged streams own no shared tracks; cleanup
  failure never transfers upstream ownership.
- Candidate export **and required cleanup** must succeed before replacing/revoking the previous export. Failed
  capture preserves prior success. Unconfirmed native shutdown or failed required cleanup retains bounded
  ownership evidence and blocks recording/Init until reload; dropping references proves nothing. Advise
  downloading retained exports first. Only confirmed normal disposal permits fresh explicit Init.

### 3.3 Scrubber Contract

The [scrubber](src/js/audio/scrubber.js) uses decoded waveform data, separate from live analysis/playback
buffers. Seeking stays deterministic and stateless; optional waveform work must preserve primary
playback/source ownership.

## 4. Analysis and visualizers

### 4.1 Analysis ownership

- Analysis owns extraction/normalization, independent of visualizers and valid with zero. Consumers MUST NOT
  mutate producer-owned [AnalysisFrame](src/js/audio/analysis-frame.js) arrays/buffers or read Web Audio
  internals. Analysis UI owns settings/diagnostics; count stays visible/non-editable pending approved
  band-table work.
- CONFIG owns band defaults/limits. In [BandBankController](src/js/audio/band-bank-controller.js), once actual
  sample rate is known, `effectiveCeilingHz = min(configuredCeilingHz, actualSampleRateHz / 2)`. Configured
  admission limits neither promise physical analysis at that frequency nor force a sample rate.
- L/R/C are first-class: Orb `chanId` selects waveform and energies; empty targets use full-channel energy,
  nonempty targets average selected channel energies. Definitions/metadata stay shared; global
  spectrum/dominant remain real combined **C**. Inherited dominant follows nonempty Orb targets; explicit
  dominant stays global C.

### 4.2 Orb System (Highly Sensitive)

- `normalizeOrbDef()` owns valid fields. Band IDs stay numeric integers in CONFIG range, ordered/unique
  without string coercion; preserve legacy names. Human controls parse validated digit tokens before
  normalization.
- Designed `startAngleRad` is radians in `[0, TAU)`, distinct from live `angleRad`; edits preserve
  phase/history, Reset Visuals applies design. Sliders commit CONFIG grids; imports/defaults retain precision
  until editing. Readouts/ARIA distinguish canonical value/selection with displayed units. Preserve
  phase/control synchronization and [numeric
  contracts](docs/development/build-116.md#config-angular-step-alignment).
- `preferences.orbs[]` orders composition; `orb.id` is stable identity. Zero Orbs is valid; reconciliation
  preserves survivors/history, duplication copies only configuration. Collection normalization alone repairs
  IDs. CONFIG count/unique-ID admission precedes mutation: oversize imports fail atomically, Add/Duplicate at
  capacity does nothing; never renumber survivors.
- [VisualizerRuntime](src/js/render/visualizer-runtime.js) owns composition/lifecycle:
  `id/type/isVisible/update/render/reset(reason)/dispose`. Renderer owns drawing/canvas; visualizers own
  behavior, with no type-specific simulation in the main loop. Orb simulation/presentation fields have per-Orb
  editors; Bulk applies to all Orbs and reports mixed values without changing them.
- Singleton Spectral Ring consumes C spectrum/waveform and persists under `bands.overlay`; Visualizers owns
  its sole presentation editor. Free phase resets to zero; first-Orb lock uses current-frame updates and stays
  safe with zero Orbs.
- Scene Appearance owns shared background/fixed color/default policy/palette; no persisted Scene object or
  independent Ring color state. Orb source/hue/trace overrides stay local; hue affects only its palette
  colors. Preserve [color-policy.js](src/js/render/color-policy.js) resolution.

### 4.3 Particle resources and timing

- Each runtime owns one ephemeral ParticleGovernor. Scene `particleSafety` follows the canonical pipeline;
  Settings owns controls. Enforce CONFIG-bounded selections, including zero/expert maxima, without hidden
  default ceilings. Operational maxima are **not performance guarantees**.
- Synchronize policies in place across settings/lifecycle paths; preserve fairness/fractions/history. Lower
  retention retires global oldest before drawing; zero emission preserves history, zero retention
  clears/rejects it. TrailSystem/governor alone create/retire particles; renderer only reads trails. Disposal
  maintains shared accounting.
- Spacing compares the same Orb's retained tail in **world units**, never viewport/DPR; zero bypasses
  filtering. Suppression never deletes history or spends fairness priority. Preserve bounded
  emission/fairness, fractional progress and ordered-expiry/fallback contracts in
  [TrailSystem](src/js/render/trail-system.js), [ParticleGovernor](src/js/render/particle-governor.js) and
  [ParticleList](src/js/render/particle-list.js); read them before changes.
- Main-loop clocks separate bounded emission work, visible elapsed motion and monotonic real particle age.
  Pause freezes Orb/free Ring motion and emission, preserving fractions while real-time aging/expiry
  continues. Preserve immutable emission bounds/CONFIG discontinuities, discarded suspension debt,
  rebased-frame aging and legacy caller compatibility. Audio/analysis/recording/transport never consume motion
  delta. [timing.js](src/js/core/timing.js), [main.js](src/js/main.js) and runtime own exact mechanics.

## 5. World and camera

- World is independent of viewport/DPR; dimensions are reference geometry, **not clipping, collision,
  retirement or camera limits**. View changes preserve simulation locations/phases/history/audio/analysis.
  `resolveSettings()` owns frozen `state.world`; explicit world edits preserve retained coordinates/history.
- `state.camera` is live; `preferences.sceneCamera` is explicitly authored. Save copies the live pose through
  canonical synchronization without visual reset; Restore stops input and replaces only live view.
  Navigation/editing never implicitly saves; C resets factory view, F fits once, Share serializes authored
  view. Successful import resolves settings/initializes camera before subsystem sync; full settings reset
  restores both.
- Mode/speeds/keys/focus/gestures/panels stay runtime-only. Preserve short-side uniform projection/inverse,
  CSS-screen-sized marks and live canonical-viewport recording; aspect ratios may reveal different extents.
  Read [Build 116's contract](docs/development/build-116.md#116d-authored-scene-camera) and owning source
  before edits; interaction/projection mechanics stay there.

## 6. UI, accessibility and work bounds

- Panels are independently hideable/recoverable with accessible launchers; workspace visibility/focus/stacking
  has one owner. Preserve keyboard/visible focus and subsystem independence; no hidden interactive controls or
  gesture/focus conflicts.
- `ui.js` coordinates focused feature modules; feature modules MUST NOT import it. One writable UI owner per
  setting. Refresh must not mutate persistent settings or fabricate missing runtime instances. Listener
  initialization is idempotent for the same controls.
- ID-based Orb controls preserve surviving DOM/listeners/pickers/UI state. Generated DOM IDs never derive from
  untrusted Orb IDs. Inventory uses **type plus ID** (`spectral-ring` is a valid Orb ID); confirmation
  names/removes the actual target, never another type on lookup failure. Display order follows composition;
  Edit focuses existing editors.
- Orb refresh reads `runtime.settings`; retain settings/BandBank/runtime-reference invalidation to skip
  unchanged DOM/picker work and inventory rebuilds.
- Assume constrained hardware: no unbounded per-frame work/uncontrolled allocations, unnecessary DOM
  synchronization or expensive hidden work. Preserve source-owned precision, lifecycle and bounded scheduling
  contracts.

## 7. Change boundaries and Definition of Done

Classify changes (fix, planned feature, explicitly authorized experiment), check CONFIG/preset/audio/UI impact
and disclose regression/schema/performance risks before implementation. Follow ROADMAP; seek owner direction
for expansion/exceptions. Inspect established pathways; implement minimally without unrelated
refactors/cleanup.

A change is complete only when:

- No normal-flow console errors; no resource/memory leaks or duplicated listeners.
- UI stays coherent across applicable panel states, with keyboard/focus/recovery intact.
- Presets encode/decode/migrate correctly; playback and analysis do not regress.
- Verify functionality/protected invariants with applicable README/CI checks. Report evidence,
  skipped/platform-limited checks and unresolved failures; untested is not passed. ROADMAP adds milestone
  gates; agents cannot waive them.

## 8. Documentation discipline and skill routing

Keep docs brief/factual/verifiable, without marketing or diaries. Update existing owners; correct stale
comments within scope. Preserve historical audits/measurements/decisions/timestamped evidence. Logs, failed
approaches and transient fixes belong in PR/scoped evidence or existing worklogs. Public changelogs compare
shipped releases; development-only introduced-and-fixed bugs are not public fixes.

For documentation/link/release-note maintenance use `$auralprint-doc-maintenance`:
[SKILL.md](.agents/skills/auralprint-doc-maintenance/SKILL.md). It supplies procedure; root safeguards and
this single DoD apply without skill selection. A link does not prove discovery.
