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

If you add/change any field:

**You MUST update ALL of the following:**
1. `CONFIG.defaults`
2. `sanitizeAndApply()`
3. `normalize*()` helpers (e.g., `normalizeOrbDef`)
4. `writeHashFromPrefs()`
5. `PRESET_SCHEMA_VERSION` (increment)
6. Migration handling for older schemas

Failure to update all = **silent data corruption risk**

---

### 2.2 What NOT to Store in Presets

Never include runtime/session state:
- Playlist / queue
- Playback position
- Recording sessions
- Live input permissions

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
particles { emitPerSecond, sizeMaxPx, sizeMinPx, sizeToMinSec, ttlSec, overlapRadiusPx },
trace { lines, numLines, lineAlpha, lineWidthPx, lineColorMode }
```

Rules:
- Only fields returned by `normalizeOrbDef()` are valid
- Adding a field requires full preset pipeline update (Section 2)

---

### 4.3 Visualizer Lifecycle

- Visualizers consume `AnalysisFrame`; they MUST NOT read Web Audio internals.
- Visualizer-specific runtime behavior belongs behind the lifecycle contract: `id`, `type`, `isVisible()`, `update()`, `render()`, `reset(reason)`, and `dispose()`.
- `VisualizerRuntime` owns active composition order and lifecycle dispatch. Renderer owns canonical canvas and drawing mechanics; each visualizer owns its behavior and participation in composition.
- Adding a future visualizer must not add type-specific simulation or phase behavior to the main animation loop.
- Lifecycle runtime state is not automatically preset state. Schema 10 persists complete normalized `preferences.orbs[]` and `preferences.bands.overlay`; schema 9 global Orb behavior migrates into independent nested copies for each Orb. Every canonical Orb-owned simulation/presentation field has a per-Orb UI owner; Bulk Edit is an apply-to-all convenience and must report mixed values without changing them.
- Camera remains a downstream render/projection concern for Build 116.

### 4.4 Dynamic Orb Collection

- `preferences.orbs[]` order defines composition order; `orb.id` defines stable identity. Collection mutation must never renumber survivors.
- Zero Orbs is valid. Runtime reconciliation is ID-based and preserves surviving Orb objects and ephemeral phase/trail/emission state.
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
- Sim / Orbs
- Scene
- Analysis

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
- Orb UI must not own Orb identity, collection normalization, or runtime reconciliation.
- UI feature modules must not import `ui.js`; dependencies flow toward the coordinator.
- UI refresh functions must not mutate persistent settings merely to render state or fabricate missing visualizer instances.
- Listener initialization must be idempotent for the same DOM controls and must not accumulate duplicate handlers.
- The Visualizers panel owns user-facing Orb collection management and the singleton Spectral Ring presentation editor through canonical operations; it does not own Orb values or generic visualizer persistence.
- Orb editor commits and controller reconciliation use persistent Orb IDs, never assumed array slots. Surviving editor nodes, listeners, picker instances, and ephemeral UI state must be retained across unrelated collection changes.
- Orb editor nested controls commit by persistent Orb ID and per-Orb edits preserve unrelated runtime history. `startAngleRad` is designed phase configuration, distinct from ephemeral `angleRad`: the UI presents degrees while persistence/runtime use radians, edits do not live-teleport, and visual reset applies the designed phase.
- Removing the last Orb is valid; UI must not implicitly fabricate an Orb. Generated DOM identifiers must be independent of untrusted persistent Orb IDs.
- Visualizer inventory order follows `VisualizerRuntime`; display numbering communicates composition position and never replaces persistent identity.
- Visualizer UI must not fabricate runtime instances. During staged migration, writable configuration retains one UI owner and navigation points to that owner rather than duplicating controls.
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
