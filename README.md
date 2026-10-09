# Auralprint

**Auralprint is an offline-capable audio-analysis system whose visualization expresses its analysis.** It combines file playback and live input analysis with configurable spectral inspection, visualizers, and recording.

**Release 3 / Build 113 (`v0.1.13`) remains the canonical public shipped release.** Build 114 (`v0.1.14`) is an internally shipped milestone. Current development is **Build 115, `v0.1.15m.i.e`**, preset schema **10**. RC-01 through RC-22 have completed corrective review and merge at the accepted baseline; **115N final acceptance remains WITHHELD**. Build 115 is unshipped and noncanonical.

See [ROADMAP.md](ROADMAP.md) for current capabilities, dependencies, deferrals, and acceptance gates; [Build 115 development history](docs/development/build-115.md) for engineering decisions and the [current audit disposition index](docs/development/build-115.md#audit-disposition-index); and the [canonical changelog](docs/Canon/changelog.md) for shipped-build differences. The [release-delta draft](docs/development/build-115-release-delta.md) prepares both public and internal comparisons for human review without publishing release notes.

To try development, build from the canonical root `version` using the bootstrap below. Start with **Load audio** in File mode, or choose Mic/Stream where the browser supports capture. **Audio** owns source/playback; **Queue** manages files independently of Audio panel visibility; **Analysis** owns analysis configuration and diagnostics; **Visualizers** owns the singleton Spectral Ring, Orb management/editing, and Bulk Edit All Orbs; **Settings** owns shared Scene appearance, particle resources, and presets; **Record** owns capture. Feedback appears in its owning panel. **View**, or **H** outside form controls, hides/restores the current panel layout; **Space** outside form controls pauses visual motion/emission while analysis and particle aging continue.

## Developer and agent bootstrap

Use Node **24** and Python **3.12**. From the repository root, run sequentially:

```sh
npm ci
npm test
npm run build
python scripts/verify_distribution.py
```

The supported install/test/build sequence uses `package-lock.json`; the final Python command additionally verifies both generated distribution contracts. Tests and build must stay sequential because a test temporarily renames build directories.

`npm run build` generates:

- **Portable:** `dist/auralprint_<version-without-leading-v>.html` (currently `dist/auralprint_0.1.15m.i.e.html`), with embedded application JavaScript, CSS, and SVG favicon. It needs no adjacent application assets.
- **Hosted:** `dist/hosted/index.html`, six supplied icon files, and `site.webmanifest`. Deploy the complete `dist/hosted/` directory at a root or subdirectory, with correct server MIME types. All metadata URLs are package-relative; both editions use the same application bundles and version.

The portable build is intended for offline execution. Actual direct `file://` boot/playback remains an independent acceptance gate: the automated Chromium environment blocked navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. Portable HTTP and hosted root/subdirectory behavior have [recorded Chromium evidence](docs/audits/remediations/115m-i-d-rc20/README.md#native-browser-and-request-evidence). Hosted metadata does not establish offline caching or installability; no service worker is provided.

`npm ci` may require registry access; installation is not promised to work offline. No global esbuild or committed `node_modules` is needed. If the default npm cache is unwritable, use `npm ci --cache ./.npm-cache`, then remove that disposable cache. Native-executable/child-process EPERM requires an environment fix. The assembler tries `PYTHON`, `python`, `python3`, then `py -3` on Windows. Dependencies and generated `node_modules/`, `.build/`, `build/`, and `dist/` remain ignored and untracked.

[GitHub Actions CI](.github/workflows/ci.yml) provisions Node 24/Python 3.12 and validates locked installation, tests, both distributions, packaging contracts, generated-output tracking, and whitespace on Linux and Windows. It caches npm packages, never `node_modules`. Browser tooling is optional and outside project dependencies; [historical diagnostic instructions](docs/development/build-115.md#diagnostics-and-evidence) link to the owning reports and scripts. `npm run watch` regenerates both editions for JS/CSS edits; branding, template, or version-only changes require a rebuild or restart.

**CI success does not complete browser/device or release acceptance. 115N remains WITHHELD.**

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
| 115 | v0.1.15 (`v0.1.15m.i.e` development revision) | — | Implemented; corrective audit review/merge complete; 115N WITHHELD; unshipped | Visualizer Architecture + Orb Overhaul v1 |
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

**Goal:** establish an explicit analysis-consumer boundary and make Orbs and the Spectral Ring first-class, independently managed visualizers. This prepares the application for Build 116 Camera work without adding Camera functionality.

**Scope**

- AnalysisFrame exposes producer-owned L/R/C waveform, energy, spectrum, and metadata to consumers, separating analysis from visualization. Analysis has an Orb-independent workspace for FFT, gain, smoothing, band definition, and diagnostics.
- VisualizerRuntime manages composition and update/render/reset/disposal through one lifecycle. The Spectral Ring is a singleton with its sole presentation editor in Visualizers; it consumes combined C data and retains configuration under `bands.overlay`.
- A zero/one/N Orb collection uses stable IDs. Add/Edit/Duplicate/Remove preserve surviving runtime history. Each Orb owns its channel/targets, position, designed phase, motion, response, particles, trace, and local color overrides. All applicable fields have per-Orb controls; Bulk Edit applies shared behavior fields and reports mixed values.
- Orb spectral targeting uses the selected L/R/C channel; empty targets use full-channel energy. Designed phase edits preserve live phase until Reset Visuals. Orb-locked Ring uses the current first Orb; free-run Ring resets independently. Visual pause freezes motion/emission while analysis and real particle age continue.
- Settings owns shared Scene background, fixed color, default Orb color policy, and palette. Ring and Analysis consume the palette; no persisted Scene object or independent Ring palette is introduced.
- Schema-10 configuration/presets support legacy schemas 2–9, including both schema-9 layouts. Presets exclude session state. Approved pre-release corrections strip obsolete overlap fields and persist placement distance and selected particle budgets.
- Shared particle emission/retention budgets, oldest-first retirement, per-Orb placement distance, and Orb admission limits govern resource use. Defaults are operational safeguards; expert settings and the maximum Orb count are not performance guarantees.
- Existing file/queue/scrubber, Mic/Stream, and recorder integration retain subsystem ownership. Builds produce both a portable versioned HTML and a relocatable hosted package.

**Definition of Done**

- Preserve preset compatibility/schema discipline and stable analysis, visualizer, audio/source, and recorder ownership.
- Verify browser/audio/visualizer regressions, accessible and recoverable interactions, real-media/device workflows, and resource limits with representative performance evidence.
- Verify both distributions, including direct portable launch in a permitted browser environment and hosted root/subdirectory operation.
- Complete independent [115N final acceptance and canonization gates](ROADMAP.md#build-115n-acceptance-gates). Implementation and passing CI alone do not satisfy this milestone.

**Status:** implemented through release-preparation revisions; RC-01–RC-22 corrective review and merge are complete at the accepted baseline. **115N remains WITHHELD; Build 115 is unshipped and noncanonical.** See [development history and current audit dispositions](docs/development/build-115.md) for evidence and residual limitations.

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
