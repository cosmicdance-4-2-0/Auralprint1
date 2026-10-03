# Auralprint Roadmap (Builds 110 → 120)

This repo tracks **Auralprint** an offline-capable audio analysis suite.(“analyzer cosplaying as a visualizer”).

The active development order, capability inventory, and acceptance evidence are in [ROADMAP.md](ROADMAP.md). The current work completes Build 115's interface before adding camera controls. Its basic band chooser has been pulled forward from Build 118; browser acceptance is still pending.

To try the development build, run `npm test`, then `npm run build` (sequentially), and open `dist/auralprint_0.1.15.html`. Start with **Load audio**. **Orbs** opens per-orb targeting; **Bands** contains spectral and color controls. **Queue** works independently of the Audio panel. **View** hides/restores the current panel layout; **H** does the same when a form control is not focused.

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
| 115 | v0.1.15 | — | In Progress | Orbs overhaul v1 (per-orb spectral + color phase) |
| 116 | v0.1.16 | R4 | Planned | Camera controls (render ≠ sim) |
| 117 | v0.1.17 | — | Planned | UX polish + performance hardening |
| 118 | v0.1.18 | — | Planned | Per-orb band picker UI |
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

## Build 115 — v0.1.15: Orbs Overhaul (v1)

**Goal:** orbs become first-class Visualizers inside the scene/compositor architecture.

**Scope**
- Per-orb spectral targeting (band IDs / ranges)
- Per-orb aggregation rules (avg now; weighted later)
- Per-orb color phase space / palette modes
- Backward-compatible preset migration for orb config

**DoD**
- Orbs can lock to different bands cleanly
- Presets round-trip without corruption

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

## Build 118 — v0.1.18: Per-Orb Band Picker UI

**Goal:** configure orb targets without editing code.

**Scope**
- Band picker per orb:
  - search by band name
  - range select (start/end)
  - optional named sets (“Air Shelf”, etc.)
- Visual confirmation in HUD

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
