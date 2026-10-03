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
- Visualization-specific response and presentation state should ultimately belong to the visualizer instance that uses it. Build 115 does not yet declare a final persisted Visualizer schema.

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
hueOffsetDeg, colorSource, centerXFrac, centerYFrac
```

Rules:
- Only fields returned by `normalizeOrbDef()` are valid
- Adding a field requires full preset pipeline update (Section 2)

---

### 4.2 Visualizer Lifecycle

- Visualizers consume `AnalysisFrame`; they MUST NOT read Web Audio internals.
- Visualizer-specific runtime behavior belongs behind the lifecycle contract: `id`, `type`, `isEnabled()`, `update()`, `render()`, `reset(reason)`, and `dispose()`.
- `VisualizerRuntime` owns active composition order and lifecycle dispatch. Renderer owns canonical canvas and drawing mechanics; each visualizer owns its behavior and participation in composition.
- Adding a future visualizer must not add type-specific simulation or phase behavior to the main animation loop.
- Lifecycle runtime state is not automatically preset state. Schema 9 remains `preferences.orbs[]` and `preferences.bands.overlay`.
- Camera remains a downstream render/projection concern for Build 116.

## 5. UI System Constraints

### 5.1 Panel System

Panels:
- Audio
- Queue
- Sim
- Bands

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
