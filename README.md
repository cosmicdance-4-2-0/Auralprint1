# Auralprint Roadmap (Builds 110 → 120)

This repo tracks **Auralprint** an offline-capable audio analysis suite.(“analyzer cosplaying as a visualizer”).

The active development order, capability inventory, acceptance evidence, and known deferrals are in [ROADMAP.md](ROADMAP.md). Current development revision **v0.1.15m.h.o** corrects RC-14: terminate cancelled touch seek ownership. RC-01 through RC-06 were CLOSED before this mission; RC-07 through RC-14 pass local acceptance checks. RC-15 remains an open P2 blocker; autonomous remediation stopped for a product decision on measured aggregate/frame budgets and degradation policy. No release-readiness PR or promotion occurred. M.H completed the pre-RC closure pass for Build 115, **Visualizer Architecture + Orb Overhaul v1**. Revisions through 115M.G are complete, including stable Orb editor reconciliation, Scene/preset consolidation, validated Stream stereo correctness, schema-10 closure, and unified Visualizers editing. Visualizers owns Spectral Ring and all 23 per-Orb controls plus 13 Bulk Edit fields in one workspace. Settings owns shared Scene appearance and presets; Orbs retain local source/hue and trace-mode overrides. Spectral Ring consumes the shared palette, and Analysis uses it as a diagnostic legend. Targeted inherited dominant remains channel/target-aware while explicit dominant remains global combined-C. Schema 10 is frozen for Build 115. **115N — Release Candidate / final acceptance / canonization — remains withheld**; Build 115 is not shipped/canonical, and Camera remains Build 116 after acceptance.

To try a development revision, read the canonical root `version`, run `npm ci`, `npm test`, then `npm run build` sequentially, and open `dist/auralprint_<version-without-leading-v>.html` (currently `dist/auralprint_0.1.15m.h.f.html`). Start with **Load audio**. **Audio** owns source/playback, **Analysis** owns analysis configuration and diagnostics, **Visualizers** owns inventory, Spectral Ring presentation, complete per-Orb editing, and Bulk Edit All Orbs; **Settings** owns shared Scene appearance/color policy and presets, and **Record** owns capture. Preference feedback stays with its owning panel; generic/internal preference synchronization is silent. **Queue** works independently of the Audio panel. **View** hides/restores the current panel layout; **H** does the same when a form control is not focused.

Node/npm and Python are the build toolchain; the assembler tries `PYTHON`, `python`, `python3`, then `py -3` on Windows. Scene template tests inspect structure in JavaScript without Python or a DOM dependency. `package-lock.json` is canonical; dependencies and generated `node_modules/`, `.build/`, `build/`, and `dist/` directories are untracked and ignored. The optional `node scripts/validate-stream-stereo.cjs` diagnostic requires a Playwright-enabled developer environment; Playwright is not a project dependency and is not required by tests/build. It uses Playwright's normal browser resolution unless `--chromium=<path>` is supplied. Run it after building; `--report=<path>` saves evidence and `--generator=<path>` optionally attempts native display capture.

## Developer and agent bootstrap

Use Node **24** (the release audit used 24.19.0 / npm 11.9.0) and Python **3.12** (the audit used 3.12.14). From the repository root, run sequentially:

```sh
npm ci
npm test
npm run build
```

`npm ci` installs from `package-lock.json`; no global esbuild or committed `node_modules` is required. Installation requires registry access unless a complete npm cache is independently available. The built application is offline-capable; dependency installation is not promised to work offline. If an agent's default npm cache is unwritable, use `npm ci --cache ./.npm-cache` instead, then remove that disposable cache after validation. `--offline` and environment-specific shared caches are not the canonical bootstrap. A sandbox native-executable/child-process EPERM requires an environment fix, not an application or dependency change.

[GitHub Actions CI](.github/workflows/ci.yml) now validates clean lockfile installation, Node tests, Python single-file assembly, and the final build on Linux and Windows for pull requests and pushes to `main`. It explicitly provisions Node 24 and Python 3.12, uses setup-node's npm package cache, and never caches `node_modules`. CI verifies the non-empty versioned HTML with its version marker, `git diff --check`, and that generated dependency/build directories remain untracked. Tests and build must stay sequential because tests temporarily rename build directories.

Browser/device acceptance remains separate; Playwright and browsers are not required by normal CI/test/build. CI does not prove release readiness. RC-01, RC-06, RC-02, RC-03, and RC-04 are CLOSED; RC-05 awaits hosted CI and all other unresolved findings remain open, and **115N remains withheld**.

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
| 115 | v0.1.15 (`v0.1.15m.h.o` development revision) | — | RC-01, RC-06, RC-02, RC-03, RC-04 closed; 115N withheld | Visualizer Architecture + Orb Overhaul v1 |
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

**Staged status:** revisions through 115M.G are complete; 115M.H closes pre-RC hardening with explicit status ownership, portable tests/diagnostic invocation, repository hygiene, and reconciled documentation. M.H.A closed RC-01; M.H.B adds CI/build infrastructure only. M.H.C closed RC-06; M.H.D closed RC-02 cancellation with Linux/Windows CI green; remaining release-audit findings remain open; 115N Release Candidate / final acceptance / canonization remains withheld. Settings owns shared Scene appearance/color policy while persistence intentionally remains in schema-10 `visuals.*` and `bands.*` fields; no persisted `scene` object exists. Orbs own local color source/hue and trace color mode. Spectral Ring and Analysis consume the shared palette without independent color state. Schema 10 is frozen for Build 115, and Camera remains Build 116 after acceptance.

**Goal:** establish a clean analysis-consumer boundary and make Orbs first-class visualizers before camera work begins.

**Scope**
- One Visualizers workspace owns the Spectral Ring singleton and zero/one/N stable-ID Orb editors, collection management, and Bulk Edit All Orbs.
- Per-Orb channel, spectral targeting, chirality, degree-presented designed phase, hue offset, color source, center, motion, response, particle, and trace controls exist.
- The AnalysisFrame boundary and shared runtime lifecycle for Spectral Ring and Orbs are complete; ID-aware runtime reconciliation and user-facing add/edit/remove/duplicate operations are complete.
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

### Revision 115M.H.E — RC-03 live attachment ownership

Mic and Stream supply their existing activation-token guard to AudioEngine. Attachment revalidates ownership after context resume and before graph replacement. Cancelled attachment releases only its acquired tracks; stale attachment failures resolve as cancellation before source-state/error commits. Explicit current-source teardown still unloads normally. File loading, playPause(), RecorderEngine, UI, dependencies, and preset schema 10 are unchanged. RC-04 remains open; 115N remains WITHHELD.

Validation: 13 real-engine ownership regressions, both required mutations rejected, six native Chromium scenarios with generated MediaStreams, all nine native RC-02 protection scenarios, full tests, and the single-file build pass. RC-03 CLOSED after hosted Linux/Windows CI passed ([PR #31](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/31)). [New evidence](docs/audits/remediations/115m-h-e-rc03/) is separate from the unchanged historical audit. The optional `node scripts/validate-live-source-ownership.cjs` probe uses `RC03_PLAYWRIGHT_MODULE`, `RC03_CHROMIUM_PATH`, and `RC03_REPORT` to select developer tooling/output; Playwright remains outside project dependencies.

### Revision 115M.H.F — RC-04 Play/Clear transport ownership

`playPause()` captures its starting media element and revalidates that exact identity after context resume and play-promise completion. Lost ownership returns quietly before playback/error state commits or any replacement-element action. Every file load allocates a new element, so no transport generation is needed. Current play failures and synchronous Pause retain their existing semantics. UI, live-source/load generations, recording, dependencies, CI, and preset schema 10 are unchanged.

RC-01, RC-06, RC-02, and RC-03 remain CLOSED. RC-04 is CLOSED after focused/browser/mutation evidence and hosted Linux/Windows CI passed ([PR #32](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/32)); all other unresolved findings remain open. **115N remains WITHHELD.** [New evidence](docs/audits/remediations/115m-h-f-rc04/) remains separate from the unchanged historical audit. The optional `node scripts/validate-transport-ownership.cjs` probe uses `RC04_PLAYWRIGHT_MODULE`, `RC04_CHROMIUM_PATH`, and `RC04_REPORT`; Playwright remains outside project dependencies.

Validation: 13 focused ownership regressions, both required mutations rejected, ten native Chromium RC-04 scenarios with no page errors/stale commits, RC-02 protection (12 Node tests/nine browser scenarios), RC-03 protection (46 source/graph tests/six browser scenarios), all 339 tests, single-file build, and Linux/Windows CI pass.

### Revision 115M.H.G — RC-05 deferred EOF during recording finalization

Natural EOF during the temporary finalization lock now retains its File, media element, repeat mode at EOF, and existing load request identity in UI transport. Canonical recording-state refresh consumes it once after either completion or error, validates its owner, and invokes the same Queue/repeat policy as ordinary EOF through `loadAndPlay()`. Reset, source switches, and replacement loads clear pending ownership. RecorderEngine, AudioEngine, Queue, export ownership, and schema 10 are unchanged.

Validation: 18 focused regressions, both required mutations rejected, eight native Chromium scenarios (including both historical audit schedules, Repeat One/All, no-next, and export failure), all 357 tests, and the versioned single-file build pass. RC-02 (12 Node/nine browser), RC-04 (13 Node/ten browser), and RC-06 (16 Node/native export retention) protection remain green. Historical audit/evidence remains unchanged. [New evidence and full report](docs/audits/remediations/115m-h-g-rc05/README.md). The optional `node scripts/validate-finalizing-eof.cjs` probe accepts `RC05_PLAYWRIGHT_MODULE`, `RC05_CHROMIUM_PATH`, and `RC05_REPORT`; Playwright remains outside project dependencies.

RC-01–04 and RC-06 remain CLOSED. RC-05 awaits hosted Linux/Windows CI. All other audit findings remain unresolved. **115N remains WITHHELD.** Broader Build-117 lifecycle/performance hardening remains future work.
