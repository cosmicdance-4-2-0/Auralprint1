# Auralprint Roadmap (Builds 110 → 120)

This repo tracks **Auralprint** an offline-capable audio analysis suite.(“analyzer cosplaying as a visualizer”).

The active development order, capability inventory, and acceptance evidence are in [ROADMAP.md](ROADMAP.md). Build 115 is actively under development as **Visualizer Architecture + Orb Overhaul v1**. Revision 115L is complete: the Scene workspace now owns shared appearance and color policy, replacing the transitional Bands workspace without changing schema-10 persistence. Scene owns the canvas background, fixed particle color, default Orb particle-color policy, and shared band palette. Orbs retain local source/hue and trace-mode overrides; Spectral Ring consumes the shared palette, and Analysis uses it as a diagnostic legend. Targeted inherited dominant remains channel/target-aware while explicit dominant remains global combined-C. Preset schema remains 10; 115M hardening is next, and Build 116 Camera remains blocked.

To try a development revision, read the canonical root `version`, run `npm test`, then `npm run build` sequentially, and open `dist/auralprint_<version-without-leading-v>.html` (currently `dist/auralprint_0.1.15m.g.html`). Start with **Load audio**. **Audio** owns source/playback, **Analysis** owns analysis configuration and diagnostics, **Visualizers** owns inventory, Spectral Ring presentation, complete per-Orb editing, and Bulk Edit All Orbs; **Settings** owns shared Scene appearance/color policy and presets, and **Record** owns capture. **Queue** works independently of the Audio panel. **View** hides/restores the current panel layout; **H** does the same when a form control is not focused.

## Versioning and what the numbers mean

Auralprint uses three related identifiers:

- **App Version**: `v0.1.xx` (user-facing).
- **Build Number**: `1xx` (engineering shorthand) where **Build = 100 + xx**.  
  Example: `v0.1.11` ⇔ **Build 111**.
- **Release N**: “what users get”. A release points at exactly one canonical build (tagged and packaged).

> Rule: **Interfaces are canon; modules are mutable.** If an option changes behavior, it must be exposed via UX or documented as code-only.

## Canonical release history

- **Release 1** — **Build 110** (`v0.1.10`) — legacy shipped baseline  
- **Release 2** — **Build 111** (`v0.1.11`) — previous canonical shipped baseline  
- **Release 3** — **Build 113** (`v0.1.13`) — current canonical shipped baseline

The project uses intermediate builds (e.g., 112, 114–120) as structured milestones. Not every milestone is necessarily shipped to users.

## Build status overview

| Build | App Version | Release | Status | Theme |
|------:|:-----------:|:-------:|:------:|:------|
| 110 | v0.1.10 | R1 | ✅ Shipped (legacy) | Baseline analyzer/visual foundation |
| 111 | v0.1.11 | R2 | ✅ Shipped (previous canonical) | Stability + stereo-orb baseline + band HUD |
| 112 | v0.1.12 | — | ✅ Shipped (Internal) | Scrubber + Playlist/Queue |
| 113 | v0.1.13 | R3 | ✅ Shipped (canonical) | Recording / Capture + band distribution modes |
| 114 | v0.1.14 | — | ✅ Shipped (Internal) | Live input sources (mic/tab/stream) |
| 115 | v0.1.15 (`v0.1.15l` development revision) | — | In Progress | Visualizer Architecture + Orb Overhaul v1 |
| 116 | v0.1.16 | R4 | Planned | Camera controls (render ≠ sim) |
| 117 | v0.1.17 | — | Planned | UX polish + performance hardening |
| 118 | v0.1.18 | — | Planned | Richer spectral selection |
| 119 | v0.1.19 | — | Planned | Workflow upgrades (preset export/import helpers) |
| 120 | v0.1.20 | (candidate) | Planned | 3D orbs + perspective projection |

---

## Build 111 — v0.1.11 (Release 2, ✅ shipped - previous canonical)

**Intent:** stable baseline users already love.

**Core capabilities**
- Offline-capable operation (hosted or packaged)
- L/R/C analysis with mono-ish detection and stable playback controls
- Two-orb stereo baseline (L+R) with trails
- Band overlay ring + dominant-band HUD
- URL preset encode/decode (schema versioned)
- Panel system (audio / sim / bands) with launcher buttons

**DoD (maintain forever)**
- No console errors in normal flows
- No “zombie audio” after reload/change
- URL presets remain backward compatible (or migrated intentionally)

---

## Build 112 — v0.1.12 (✅ shipped - internal): “Scrubber + Queue”

**Goal:** add navigation without destabilizing 111.

**Scope**
- Scrubber bar: waveform overview + seek
- Playlist/queue: multi-file load, next/prev, click-to-jump, remove, clear
- Drag/drop audio files onto canvas to enqueue
- Auto-advance on track end (respect repeat mode)
- Keyboard: `N/P` track nav; `←/→` seek (shift = ±30s)

**Non-goals**
- Playlist state stored in URL presets (runtime-only)
- ID3 parsing (filename display is fine)

**DoD**
- No-audio-loaded state stays clean
- Switching tracks resets trails + scrubber view
- Prev/Next disabled unless queue length ≥ 2
- No accumulating `ended` handlers (no “double-advance” bugs)

**Release note**
- Build 112 remained the shipped internal queue/scrubber milestone that preceded Release 3.

---

## Build 113 — v0.1.13 (Release 3, ✅ shipped - canonical): Recording / Capture

**Goal:** ship capture/export without destabilizing the queue + scrubber baseline.

**Scope**
- Dedicated recording panel with a bottom-right launcher
- Start/Stop flow with elapsed timer, latest export metadata, and download action
- Runtime format negotiation (`WebM`-first by default; `MP4` available when supported)
- Runtime recording controls: `Include Audio`, `Preferred Format`, and `Target FPS` (`24` / `30` / `60`)
- Recording spans track changes and unloaded-audio states without taking ownership away from the transport path
- Recording settings remain runtime-only and are not stored in presets
- Band distribution mode control (`linear`, `log`, `mel`, `bark`, `erb`) with legacy preset migration from `logSpacing`

**DoD**
- Recording support is surfaced clearly before capture starts
- Exports finalize cleanly and remain downloadable for the current session
- Active recording survives track changes, queue advance, and queue-end unload states
- Presets migrate `bands.logSpacing` to `bands.distributionMode` safely
- Playback, queue, and analysis invariants remain intact while capture is active

---

## Build 114 — v0.1.14: Live Input Sources

**Goal:** analyze sources other than file playback.

**Scope**
- Microphone input
- Tab/system stream input when available (permission-gated)
- Source switch UI (File / Mic / Stream)

**DoD**
- Permission failures handled politely
- Source switching resets analysis state safely

---

## Build 115 — v0.1.15: Visualizer Architecture + Orb Overhaul v1

**Staged status:** revisions through 115L are complete. Scene now explicitly owns shared appearance/color policy while persistence intentionally remains in schema-10 `visuals.*` and `bands.*` fields; no persisted `scene` object exists. Orbs own local color source/hue and trace color mode. Spectral Ring and Analysis consume the shared palette without independent color state. Hardening (115M) and acceptance (115N) remain future work. Preset schema remains 10, and Camera remains blocked behind Build 115.

**Goal:** establish a clean analysis-consumer boundary and make Orbs first-class visualizers before camera work begins.

**Scope**
- The reorganized menus and editing for two existing Orb instances are substantially present.
- Per-Orb channel, spectral targeting, chirality, degree-presented designed phase, hue offset, color source, center, motion, response, particle, and trace controls exist.
- The AnalysisFrame boundary and shared runtime lifecycle for the current Band Overlay and Orbs are complete; ID-aware runtime reconciliation and create/removal/duplication model operations are complete; their final user-facing controls remain a future Build 115 stage.
- Motion, radius response, particle, trace, source, position, and color settings are schema-10 Orb-owned and individually editable; optional Bulk Edit controls apply one field to all Orbs while preserving truthful mixed states.
- Spectral Ring is a singleton VisualizerRuntime participant configured in Visualizers. It uses combined C spectrum/waveform data; free-run resets to phase zero, while explicit Orb-lock follows the first Orb when present. Line alpha and width are editable.

**DoD**
- Complete the staged Build 115 plan in `ROADMAP.md`, including browser/media/accessibility/performance acceptance.
- Preserve preset compatibility and observable audio/visual behavior at each architectural seam.
- Keep Build 116 Camera work blocked until Build 115 is complete.

---

## Build 116 — v0.1.16: Camera Controls (Render ≠ Sim)

**Goal:** separate simulation space from camera transform.

**Scope**
- Camera pan / zoom / rotate
- Camera centers on sim origin by default
- Reset camera action exists

**DoD**
- Camera never mutates simulation state
- Presets can store camera state if desired (explicit schema bump)

---

## Build 117 — v0.1.17: UX + Performance Hardening

**Goal:** make it harder to break and easier to use.

**Scope**
- FPS/CPU safety rails + validation
- UI affordances: tooltips, small layout fixes, “Reset Visuals”
- Reduce HUD updates when hidden

**DoD**
- Defaults don’t melt laptops
- Hide-panels mode is clean and recoverable

---

## Build 118 — v0.1.18: Richer Spectral Selection

**Goal:** expand the spectral/band system beyond the existing chooser with richer frequency-oriented selection, inspection, feedback, and practical configurable band-table sizes.

**Scope**
- Richer frequency-aware selection and inspection with visual confirmation
- Configurable practical band-table sizes, with curated presets envisioned around 5, 64, 256, 1024, and 2048
- Deterministic thematic naming across planetary/core, Earth/ocean/life/atmosphere, orbital/solar/stellar, and cosmic/quantum progressions
- Sensible generated fallback names where curated names do not apply

**DoD**
- Usable orb targeting via UX
- Presets round-trip correctly

---

## Build 119 — v0.1.19: Workflow Upgrades

**Goal:** sharing + iteration becomes frictionless.

**Scope**
- Export/import preset JSON
- Copy preset link remains
- Optional: screenshot (PNG)

**DoD**
- Users can save/share configurations reliably

---

## Build 120 — v0.1.20: 3D Orbs + Perspective

**Goal:** controlled leap into 3D (optional mode).

**Scope**
- Orb rotation axes (x/y/z components)
- Camera: basic perspective projection
- Keep 2D mode as stable fallback

**DoD**
- 3D mode optional; doesn’t destabilize 2D
- Performance acceptable at defaults

---

## Release discipline notes

- **Only one canonical release at a time.** Release bundles must be reproducible from tags.
- URL preset schema changes:
  - bump schema intentionally
  - accept older schemas via migrations
- Runtime-only state (playlist, recording session, live input permissions):
  - never stored in presets unless explicitly designed
