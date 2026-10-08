# agents.md — Auralprint

**Purpose**
This document defines the operating contract for autonomous or semi-autonomous agents working on the Auralprint codebase. It is not guidance; it is **policy**. Deviations must be explicit, justified, and versioned.

---

## 0. Project Identity (Do not drift this)

Auralprint is a:
- **Offline-capable** media player
- **FFT-based audio analysis engine**
- **Visualizer as a byproduct of analysis**, not the other way around

Core philosophy:
> *Interfaces are canon. Modules are mutable.*

---

## 1. Canonical Architecture

### 1.1 State Hierarchy (STRICT)

```
CONFIG (immutable, frozen)
    ↓
preferences (user-controlled, persisted via presets)
    ↓
runtime.settings (derived, active)
    ↓
state (ephemeral runtime: audio, UI, bands, etc.)
```

**Rules**
- `CONFIG` MUST NEVER be mutated.
- `preferences` is the only writable long-lived state.
- `runtime.settings` MUST be derived via `resolveSettings()`.
- `state` is volatile and must be safe to reset at any time.

Violation of this hierarchy = architectural bug.

---

### 1.2 Single Source of Truth

- All limits, defaults, and ranges live in `CONFIG`.
- UI controls must reflect `CONFIG.limits`.
- No magic numbers. Ever.

---

### 1.3 Single-File Integrity

The app is intentionally shippable as one file.

Agents MUST:
- Preserve single-file operability
- Avoid introducing build steps unless explicitly approved
- Avoid external dependencies unless critical and justified

---

## 2. Preset System (CRITICAL)

### 2.1 Schema Discipline

Preset system is **versioned and backward-compatible**.

Schema 10 is frozen when Build 115 ships. Any future persisted-field addition,
removal, rename, ownership move, or semantic change requires schema 11 and
migration from 10. Schema numbers must never be reused for incompatible formats.
Narrow pre-release exception: Build 115 has not shipped. Revision v0.1.15m.h.q
retires `particles.overlapRadiusPx` from schema 10 without incrementing it.
Development-era schema-10 inputs containing this property remain accepted;
normalization and encoding strip it. This exception adds no migration or schema
11 and does not relax the frozen public contract after Build 115 ships.
Revision v0.1.15m.h.t is an explicitly authorized final pre-release correction:
schema 10 adds `particles.minPlacementDistancePx` (CSS pixels, default 0.5;
0 disables placement filtering). Missing schema-2–10 fields receive that default;
obsolete overlap fields remain discarded, never aliased. Neither exception
permits changes to a published schema.
Revision v0.1.15m.h.u is separately authorized before release: schema 10 adds
`particleSafety { maxEmissionsPerFrame, maxActiveParticles }` at the preference
root. Missing schema-2–10 values use CONFIG defaults; malformed types/nonintegers
fall back independently and valid integers clamp to CONFIG range metadata.
Schema 9 historically had both Scene-node and later top-level forms; input
migration recognizes both, with top-level values taking precedence. Abandoned
Scene layout/editor semantics have no schema-10 equivalent and are discarded.
Revision v0.1.15m.i.a is an authorized pre-release RC-17 correction: designed
`orbs[].startAngleRad` describes a position within `[0, TAU)`, with finite numbers
wrapped modulo TAU and invalid input using the normalized corresponding fallback.
Canonical radians retain their precision; no degree-valued field or schema bump.

URL/hash is one transport, not the owner of preset semantics. The pure
`preset-codec.js` owns payload encoding, supported-schema decoding, migration,
and sanitation. `UrlPreset` replaces canonical preferences only; callers own
`resolveSettings()` and subsystem synchronization.

If you add/change any persisted field:

**You MUST update ALL of the following:**
1. `CONFIG.defaults`
2. `sanitizePreset()`
3. `normalize*()` helpers (e.g., `normalizeOrbDef`)
4. `encodePresetPayload()` and schema-contract tests
5. `PRESET_SCHEMA_VERSION` (increment, except the explicitly authorized pre-release corrections above)
6. Migration handling for older schemas (preserve existing migrations and default missing spacing for those exceptions)

Failure to update all = **silent data corruption risk**

---

### 2.2 What NOT to Store in Presets

Never include runtime/session state:
- Playlist / queue
- Playback position
- Recording sessions
- Live input permissions
- Source/stream/channel metadata and transport errors
- Analysis frames, BandBank arrays and effective Nyquist limits
- Visualizer/Orb simulation state, panel visibility/stacking and launchers

Presets are **configuration only**, not session snapshots.

---

## 3. Audio + Transport Invariants

### 3.1 Track Lifecycle (SINGLE PATH)

All track changes MUST go through:
```
loadAndPlay()
```

This guarantees:
- Trail reset
- Scrubber reset
- Dominant band reset
- Clean playback state

Do NOT bypass this.

---

### 3.2 End-of-Track Handling

- Use the existing `_onTrackEnded` path
- NEVER attach duplicate `ended` listeners

Violation results in:
- Double-advance bugs
- Queue desync

---

### 3.3 Scrubber Contract

- Scrubber uses **decoded waveform data**, not live playback buffer
- Seeking must remain deterministic and stateless

---

### 3.4 Recorder Shutdown Ownership (RC-19)

- RecorderEngine owns native MediaRecorder shutdown. Public `dispose()` is a
  terminal abort: invalidate the session before native `stop()`, discard chunks,
  fence queued callbacks/timers, and clear retained exports. Ordinary `stop()`
  remains the export finalization path.
- RecorderEngine stops only its render capture tracks. Merged streams are glue
  containing shared track references, never track owners. AudioEngine owns
  recorder tap release through `releaseStream()`; live source tracks remain owned
  by InputSourceManager. An audio-owner cleanup failure never authorizes stopping
  upstream tracks.
- Disposal remains disabled if native shutdown or handler cleanup fails, with a
  truthful failed status that persists until explicit reinitialization. Do not
  infer native inactivity from dropping the application reference.

---

## 4. Analysis Engine Constraints

### 4.0 Analysis and Consumer Ownership

- Analysis modules own extraction and normalization of information from audio and may maintain internal analysis state.
- Build 115 establishes an explicit analysis-consumer interface. Downstream visual systems consume that representation instead of independently reading unrelated `AudioEngine`, analyser-node, and global band-state details.
- When a stable analysis interface exists, visualizers MUST NOT reach into Web Audio internals.
- Consumers may read producer-owned analysis arrays and buffers but MUST NOT mutate them.
- Visualization-specific response and presentation state should ultimately belong to the visualizer instance that uses it. Schema 10 makes Orb motion, response, particles, and trace persistent Orb-owned state; color ownership remains a later Build 115 stage.

### 4.1 Band System

- Band count: 256 (canonical)
- Band distribution default is defined by `CONFIG.defaults.bands.distributionMode`
- Ceiling must respect Nyquist

**Critical invariant:**
If `ceilingHz > Nyquist`, highest band collapses.

Agents MUST:
- Preserve `effectiveCeilingHz = min(configCeiling, nyquist)`
- Never “simplify” this logic

---

### 4.2 Orb System (Highly Sensitive)

Canonical orb fields:
```
id, chanId, bandIds, chirality, startAngleRad,
hueOffsetDeg, colorSource, centerXFrac, centerYFrac,
motion { angularSpeedRadPerSec },
response { minRadiusFrac, maxRadiusFrac, waveformRadialDisplaceFrac },
particles { emitPerSecond, sizeMaxPx, sizeMinPx, sizeToMinSec, ttlSec, minPlacementDistancePx },
trace { lines, numLines, lineAlpha, lineWidthPx, lineColorMode }
```

Rules:
- Only fields returned by `normalizeOrbDef()` are valid
- `startAngleRad` is canonical designed phase in `[0, TAU)`, distinct from live
  `angleRad`. Editing preserves live phase/history; Reset Visuals applies design.
  The native phase range preserves fractional imports (`step=any`); Arrow keys
  use CONFIG's one-degree increment. Its 360-degree endpoint commits as zero,
  synchronously refreshing the thumb and shared visible/accessibility readout.
- Adding a field requires full preset pipeline update (Section 2)
- `bandIds` accepts only integer numbers in `[0, CONFIG.bandNames.length - 1]`,
  retaining first-occurrence order and uniqueness. Discard unsupported entries,
  including numeric strings; an empty result uses the selected channel's full
  spectrum. Human text controls explicitly parse validated digit tokens before
  normalization. Legacy `bandNames` mapping remains supported on input.

---

### 4.3 Visualizer Lifecycle

- Visualizers consume `AnalysisFrame`; they MUST NOT read Web Audio internals.
- Visualizer-specific runtime behavior belongs behind the lifecycle contract: `id`, `type`, `isVisible()`, `update()`, `render()`, `reset(reason)`, and `dispose()`.
- `VisualizerRuntime` owns active composition order and lifecycle dispatch. Renderer owns canonical canvas and drawing mechanics; each visualizer owns its behavior and participation in composition.
- Adding a future visualizer must not add type-specific simulation or phase behavior to the main animation loop.
- Lifecycle runtime state is not automatically preset state. Schema 10 persists complete normalized `preferences.orbs[]` and `preferences.bands.overlay`; schema 9 global Orb behavior migrates into independent nested copies for each Orb. Every canonical Orb-owned simulation/presentation field has a per-Orb UI owner; Bulk Edit is an apply-to-all convenience and must report mixed values without changing them.
- Camera remains a downstream render/projection concern for Build 116.

Each `VisualizerRuntime` owns one ephemeral ParticleGovernor. Scene-wide selected
particle budgets persist at `preferences.particleSafety` and derive into
`runtime.settings.particleSafety`. CONFIG defaults are 512 emissions/update and
16,384 retained particles; permissible integer ranges are 0–16,384 and
0–1,048,576 respectively. Settings → Performance → Particle Resources is their
sole UI owner. User selections, including zero and expert maxima, are enforced
without an additional default-valued ceiling.

Runtime settings synchronization applies policies in place; update/render and
lifecycle entry points also synchronize changed active settings references.
Retention reductions retire globally oldest heap entries before rendering.
Increasing limits preserves history, fractions, and fairness ownership; zero
emission preserves retained history, and zero retention retires all and rejects
new retention. Diagnostics and cumulative retention counts are ephemeral. Explicit
factory test-policy injection fixes an isolated test policy and is not supplied
by production initialization.

Particle heap/list ownership is ephemeral and belongs to each runtime. `TrailSystem.particles` is a renderer-readable chronological collection (`length`, iteration, `at`, suffix `slice`/`suffix` iterator); rendering uses direct suffix traversal. Only TrailSystem and its governor create or retire particles. Shared admission/retention accounting must follow lifecycle disposal and preserve surviving ID-based history.

Minimum placement distance compares only the same Orb's currently retained
trail tail using squared distance scaled by active DPR. Nonzero spacing prepares
at most one candidate per callback before shared scheduling, discards redundant
whole opportunities, and retains fractional rate progress. Zero bypasses spacing
and preserves dense emission semantics. Spatial suppression never deletes history
or spends governor service priority; per-frame diagnostic counts are ephemeral.

Visual frame timing has three explicit responsibilities. The main callback owns
clock sampling: `dtSec` remains bounded emission-work time (immutable maximum
1/30 s), additive `motionDtSec` integrates ordinary visible elapsed time, and
`nowSec` is monotonic real time for particle birth, fade, and TTL. CONFIG owns the
nonpersistent .5 s motion-discontinuity threshold: exactly .5 integrates motion;
larger/invalid/hidden intervals discard both deltas without debt. First/rebased
callbacks use zero deltas but still age/expire particles and refresh consumers.
Visibility changes rebase the existing frame anchor. Audio, analysis, recording,
and transport do not consume motion delta.

Orb and free Ring phase use motion time; Orb updates precede current-frame Ring
lock. Visual pause freezes Orb/free Ring motion and emission, preserves fractions,
and still retires particles by real age. Legacy frame/Orb callers omitting the
additive motion value retain their supplied delta convention; explicit direct
callers own valid elapsed values, while the application enforces discontinuities.

Normal trail births are nondecreasing. ParticleList tracks ordering conservatively
in O(1) on append/unlink; supported out-of-order direct emission flags a safe expiry
scan until the list shrinks to <=1 node or resets. Ordered expiry visits only the
expired prefix plus one unexpired head, retiring through the existing governor.
No second expiry index, coordinate cache, or per-frame ordering validation scan.

### 4.4 Dynamic Orb Collection

- `preferences.orbs[]` order defines composition order; `orb.id` defines stable identity. Collection mutation must never renumber survivors.
- Zero Orbs is valid. Runtime reconciliation is ID-based and preserves surviving Orb objects and ephemeral phase/trail/emission state.
- `CONFIG.limits.orbs.maxCount` is a provisional operational admission ceiling, not a performance guarantee. Oversized imports/normalization/replacement are rejected before Orb processing; Add/Duplicate at the ceiling make no change. Runtime lifecycle validates count and unique canonical identities before mutation. Collection normalization alone owns ID repair and reserves later explicit IDs in one pass.
- Duplication copies configuration, never live simulation history. UI must not fabricate missing instances or implicitly create an Orb by accessing an indexed slot.

## 5. UI System Constraints

### 5.0 Analysis UI Ownership

- Analysis UI owns writable analysis configuration and analysis diagnostics, consuming `AnalysisFrame` rather than sampling `AudioEngine` or analyser nodes.
- Analysis must function with zero visualizers and must not depend on Orb identities or visualizer lifecycle.
- Band definition owns count, floor, configured ceiling, and distribution. Configured ceiling remains distinct from the effective Nyquist-limited ceiling.
- Band count is visible but non-editable until a deliberate later band-table feature. Writable analysis configuration has exactly one UI owner.

### 5.1 Panel System

Panels:
- Audio
- Queue
- Visualizers
- Settings (Scene appearance, particle resources, and presets)
- Analysis
- Record (when enabled)

Rules:
- Panels must be independently hideable
- Launchers must always remain accessible
- Z-index hierarchy must not regress

---

### 5.2 Accessibility (Non-Optional)

- Maintain `:focus-visible` behavior
- Do not remove keyboard navigation
- Do not introduce hidden interactive elements

---

### 5.3 Performance Safety

Agents MUST assume:
- Users may run on weak hardware

Avoid:
- Unbounded loops
- Per-frame allocations
- Excessive DOM writes

### 5.4 UI Module Ownership

- `ui.js` is the application-level UI coordinator. Feature-specific UI behavior belongs behind focused modules once a stable ownership boundary exists.
- Workspace panel visibility, focus, stacking, launcher state, and hide/restore behavior have one owner.
- OrbEditor remains a focused module for per-Orb controls and Bulk Edit; it must not own Orb identity, collection normalization, or runtime reconciliation. Bulk Edit is an apply-to-all Orb convenience inside Visualizers.
- UI feature modules must not import `ui.js`; dependencies flow toward the coordinator.
- UI refresh functions must not mutate persistent settings merely to render state or fabricate missing visualizer instances.
- Listener initialization must be idempotent for the same DOM controls and must not accumulate duplicate handlers.
- The Visualizers panel owns user-facing Orb collection management and editing of both Orbs and the singleton Spectral Ring through canonical operations; it does not own Orb values or generic visualizer persistence.
- Orb editor commits and controller reconciliation use persistent Orb IDs, never assumed array slots. Surviving editor nodes, listeners, picker instances, and ephemeral UI state must be retained across unrelated collection changes.
- Orb editor nested controls commit by persistent Orb ID and per-Orb edits preserve unrelated runtime history. `startAngleRad` is designed phase configuration, distinct from ephemeral `angleRad`: the UI presents degrees while persistence/runtime use radians, edits do not live-teleport, and visual reset applies the designed phase.
- Removing the last Orb is valid; UI must not implicitly fabricate an Orb. Generated DOM identifiers must be independent of untrusted persistent Orb IDs.
- Visualizer inventory order follows `VisualizerRuntime`; display numbering communicates composition position and never replaces persistent identity.
- Combined visualizer inventory lookups use type plus persistent ID. Orb IDs are opaque accepted strings; `spectral-ring` is valid for an Orb. Destructive confirmation must name the actual target, and a missing target must not confirm or remove another type with the same ID.
- Visualizer UI must not fabricate runtime instances. Writable configuration retains one UI owner inside Visualizers; Edit opens/focuses the existing Ring or persistent-ID Orb editor without navigating to another workspace.
- Visualizers inventory refresh must not rebuild dynamic DOM when both the settings and runtime collection references are unchanged.
- Dynamic Orb editor refresh must not perform DOM or picker synchronization when both settings and BandBank definitions are unchanged.
- Dynamic Orb editor rendering and synchronization reads canonical `runtime.settings`, not mutable `preferences`, so reference-based refresh invalidation has one authority.
- Human-facing angular controls may persist radians internally, but must expose their displayed units to assistive technology.
- Orb selected-band targeting supplies both averaged selected-energy response and selected-target dominant context. Inherited global dominant color is scoped by a nonempty Orb target, while explicit Orb dominant color remains global full-spectrum unless a future revision deliberately changes that contract.
- L, R, and C are first-class analysis channels. An Orb's `chanId` selects its waveform, full-spectrum energy, and selected-band spectral-energy source; empty `bandIds` uses that channel's full-spectrum energy, while nonempty `bandIds` averages selected energies from that channel.
- `AnalysisFrame` exposes producer-owned channel band-energy arrays as read-only-by-contract references. Band definitions and metadata remain shared, and the global spectrum/dominant remains the real combined C channel unless a future deliberate contract changes it.

---

## 6. Queue System (Runtime Only)

### 6.1 Behavior Guarantees

- Multi-file load
- Click-to-jump
- Remove / clear
- Auto-advance
- Repeat modes respected

### 6.2 Invariants

- Queue state is ephemeral
- UI must always reflect actual queue
- Prev/Next disabled when invalid

---

## 7. Change Protocol (MANDATORY)

Before implementing any change, an agent must:

### Step 1 — Classify
- Bug fix
- Feature (matches roadmap)
- Experimental (NOT allowed without explicit flag)

### Step 2 — Check Impact Surface
- CONFIG?
- Presets?
- Audio lifecycle?
- UI panels?

### Step 3 — Declare Risk
- Regression risk
- Schema impact
- Performance impact

### Step 4 — Implement Minimally
- No refactors unless required
- No opportunistic cleanup

### Step 5 — Validate
- No console errors
- No state leaks
- No duplicate listeners
- Presets round-trip

---

## 8. Roadmap Alignment (DO NOT FREEFORM)

Agents MUST align work with roadmap builds:

- **113**: Recording / capture (MediaRecorder, WebM-first)
- **114**: Live inputs (mic / stream)
- **115**: Visualizer architecture + Orb overhaul v1
- **116**: Camera (render ≠ sim)

If a change does not map to a roadmap item:
→ It is likely out of scope.

### 8.1 Camera Boundary

> Camera/projection changes render space, never simulation or analysis state.

Camera remains Build 116 and MUST stay behind completion of the Build 115 analysis/visualization and ownership work.

---

## 9. Definition of Done (GLOBAL)

A change is NOT complete unless:

- No console errors in normal flow
- No memory leaks or listener duplication
- UI remains coherent at all panel states
- Presets encode/decode correctly
- No regression in playback or analysis

---

## 10. Anti-Patterns (HARD FAIL)

Agents MUST NOT:

- Mutate `CONFIG`
- Introduce magic numbers
- Store runtime state in presets
- Bypass `loadAndPlay()`
- Add duplicate event listeners
- Break schema compatibility silently
- Refactor unrelated systems
- Add hidden state

---

## 11. Guiding Principle

Auralprint is a **living system with strict memory**.

Every change must:
- Respect past versions
- Preserve user expectations
- Extend capability without destabilizing core behavior

> Stability is a feature. Treat it as such.

---

## 12. If You Are Unsure

Do NOT guess.

Instead:
- Inspect existing patterns
- Follow established pathways
- Extend, don’t reinvent

When in doubt:
> Choose the option that preserves invariants over the one that feels cleaner.

---

**End of Contract**

## 5.5 Spectral Ring Ownership (Build 115K)

- Spectral Ring is a first-class singleton `VisualizerRuntime` participant; its runtime ID and type are `spectral-ring`.
- Visualizers owns its sole writable presentation editor. Analysis does not own presentation, and the transitional color panel must not duplicate it.
- Spectral Ring consumes the global combined C spectrum and C waveform.
- Schema-10 persistence intentionally remains under `bands.overlay` until a deliberate future schema revision.
- Free-run phase resets independently to zero. Explicit Orb-lock may synchronize/reset to the first Orb and remains safe when no Orb exists.
- Visualizer-specific configuration has exactly one writable UI owner.
- Shared color/palette ownership is Scene-level and separate from Spectral Ring geometry.

## 5.6 Scene Appearance Ownership (Build 115L)

- Scene Appearance is the sole writable UI owner of shared visual color policy; this does not create a persisted `scene` object.
- Persistence remains in schema-10 `visuals.*`, `bands.*`, and `orbs.*` paths.
- Scene owns canvas background, Scene fixed particle color, default Orb color policy, and the shared band palette.
- The palette is consumed by multiple visualizers and Analysis diagnostics; no individual visualizer owns it, and Spectral Ring has no independent color state.
- Orb `colorSource=inherit` resolves through Scene default policy. Inherited dominant is target-aware for targeted Orbs; explicit dominant remains global combined-C.
- Orb hue offset affects only that Orb's palette-derived colors. Trace color mode remains Orb-local.
- Scene fixed particle color supplies current Orb/trace fixed modes and the last-particle fallback.
- Every color setting has exactly one writable UI owner.
