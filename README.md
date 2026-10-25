# Auralprint

Offline-capable audio analysis, playback, visualization, and recording. Spectral analysis drives the visualizers.

**Current release:** Release 4 / Build 115 (`v0.1.15`), preset schema 10. Released following 115N RC testing and owner acceptance. Build 114 (`v0.1.14`) was internal; previous public release was Release 3 / Build 113.

**Current source checkout:** Build 116D (`v0.1.16d`), preset schema 12. Implementation and the first audit's remediations are merged; further acceptance is pending. The owner has not authorized 116 RC #1 or public publication. See the [Build 116 acceptance gates](ROADMAP.md#build-116-simulation-world-camera-and-projection).

- [ROADMAP.md](ROADMAP.md): current scope, future builds, acceptance gates, and deferrals.
- [AGENTS.md](AGENTS.md): binding architecture and development contracts.
- [Build 115 history](docs/development/build-115.md): engineering chronology and corrective dispositions.
- [Build 115 release comparison](docs/development/build-115-release-delta.md): public Build 113 and internal Build 114 baselines.
- [Canonical changelog](docs/Canon/changelog.md): chronological build changes, including internal milestones.

## Developer and agent bootstrap

Requires **Node 24** and **Python 3.12**. Run sequentially from the repository root:

```sh
npm ci
npm test
npm run build
python scripts/verify_distribution.py
npm run test:browser
npm run test:browser:editing
```

Do not run test and build concurrently: tests temporarily rename build directories.

Before the native browser checks, install Playwright's matching Chromium headless shell and required platform dependencies. Ubuntu CI uses `npx playwright install --with-deps chromium --only-shell`; local installations need the browser and dependencies appropriate to their OS. Commands and CI setup are defined in [package.json](package.json) and the [CI workflow](.github/workflows/ci.yml).

Build outputs:

- **Portable:** `dist/auralprint_<version-without-leading-v>.html`, derived from the root [version](version) file (this checkout: `dist/auralprint_0.1.16d.html`); application JS/CSS and favicon embedded. The immutable [public Build 115 HTML](docs/Canon/0.1.15/auralprint_0.1.15.html) is stored separately.
- **Hosted:** `dist/hosted/index.html` plus the included icons and `site.webmanifest`. Deploy the whole directory, including at subdirectory paths, with appropriate MIME types.

`npm run watch` watches JS/CSS, the HTML template, root `version`, and branding inputs. Build and watch share the distribution contract. CI runs Node tests, build and distribution verification on Ubuntu and Windows; both Chromium smoke checks are mandatory on Ubuntu. Chromium CI uses local HTTP and does not certify Windows browser interaction, Firefox, Safari, physical devices, native audio permissions, direct `file://` operation or offline launch.

The portable file is designed to run without adjacent assets. Direct local-file usage has owner-reported browser coverage, but fully network-disabled operation remains an open acceptance check. Hosted packaging does not provide a service worker or offline caching.

## Using Auralprint

Load audio in **File**, or select **Mic** / **Stream** with browser permission. **Audio** controls sources and playback; **Queue** controls the playlist; **Analysis** owns spectral configuration; **Visualizers** owns Orbs and the Spectral Ring; **Settings** owns Scene appearance, particle resources, and presets; **Camera** owns the live view, authored Scene view actions and performance controls; **Record** owns capture. **H** hides/restores panels outside text inputs; **Space** pauses visual motion/emission, not audio analysis.

**Waveforms:** Audio → Waveforms has optional 4/8/15-minute stereo-equivalent workload profiles, separate encoded-input and estimated-PCM admission limits, and manual generation. Playback does not require waveform preparation. These limits do not bound total browser memory.

**Recording Resources:** Record → Settings defaults to **Balanced** (five-minute automatic Stop, encoded-data admission limits). **Custom** allows independent Off settings; **Unrestricted** disables application size, chunk, and duration restrictions. Neither mode eliminates browser/device limits. Recording settings persist locally, outside Scene presets. Cancel Current Capture preserves the previous successful export.

## Versioning and what the numbers mean

- **App version:** `v0.1.xx` (with lettered development revisions before release).
- **Build:** `100 + xx` for the `v0.1.xx` series (e.g., `v0.1.13` = Build 113).
- **Release:** public published bundle; may skip internal builds. Only one public release is canonical at a time.

Interfaces are canon; modules are mutable. Shipped builds and published preset contracts are immutable.

## Canonical release history

| Release | Build | Version | Status |
| --- | --- | --- | --- |
| 1 | 110 | `v0.1.10` | Shipped, legacy |
| 2 | 111 | `v0.1.11` | Shipped, previous |
| 3 | 113 | `v0.1.13` | Shipped, previous |
| 4 | 115 | `v0.1.15` | Current canonical |

Builds 112 and 114 were shipped internally, not as new public releases.

## Build status overview

| Build | Status | Scope |
| --- | --- | --- |
| 112 | Internal shipped | Queue and scrubber |
| 114 | Internal shipped | Microphone and stream input |
| 115 | Release 4, shipped | Analysis/visualizer separation and independent Orbs |
| 116 | 116D merged, unreleased | Independent world and authored/live cameras; acceptance pending |
| 117–120 | Planned / gated | See [ROADMAP.md](ROADMAP.md) |

## Build 111 — v0.1.11 (Release 2, ✅ shipped - previous canonical)

Stereo L/R/C analysis, Orbs, band overlay, URL presets, and panel controls. Playback, preset migration, and audio teardown remain compatibility requirements.

## Build 112 — v0.1.12 (✅ shipped - internal): “Scrubber + Queue”

Waveform seeking, multi-file queue, navigation, drag/drop, repeat and track-end handling. Queue and playback position remain runtime state, not presets.

<a id="build-113--v0113-release-3--shipped---canonical-recording--capture"></a>

## Build 113 — v0.1.13 (Release 3, ✅ shipped - previous canonical): Recording / Capture

Recording panel with browser-supported WebM/MP4, optional source audio, frame-rate choice, latest export/download, and five band-distribution modes. Previously the public release baseline.

## Build 114 — v0.1.14: Live Input Sources

Permission-gated microphone and stream analysis, source switching, and source-aware recording. Shipped internally.

## Build 115 — v0.1.15: Visualizer Architecture + Orb Overhaul v1

Release 4, accepted and shipped. AnalysisFrame separates analysis from visualizer consumers; VisualizerRuntime owns lifecycle. The Spectral Ring is a singleton, while zero/one/N Orbs have stable IDs and independent configuration/editors. Scene owns shared color; particle limits and recorder-resource policy are configurable. Schema 10 preserves supported legacy preset migration.

**Release artifact:** [Canonical portable HTML](docs/Canon/0.1.15/auralprint_0.1.15.html). Firefox does not supply shared-display audio for Stream mode; File and Mic are separate workflows. See [release acceptance and qualifications](ROADMAP.md#build-115-release-acceptance-and-qualifications).

## Build 116 — Simulation World, Camera & Projection (in progress)

Implemented Build 116D separates the simulation world from the viewport. Configurable world dimensions define Orb/Ring reference geometry, **not** clipping/collision bounds; particle placement spacing uses world units independently of viewport/DPR. Camera movement changes the view, preserving simulation and retained history; marks retain CSS-screen sizing.

`state.camera` owns the live performance view. Under schema 12, `preferences.sceneCamera` owns the explicitly authored Scene viewpoint. **Save Current View as Scene View** explicitly persists the live pose into the Scene; **Restore Scene View** stops input and restores that authored view to the live camera. **Copy Share Link** serializes the authored Scene, including its saved viewpoint; live navigation never implicitly saves or shares its current pose.

Enable camera mode for drag-to-pan and pointer-centered wheel zoom. With canvas keyboard focus, hold WASD/QE to move/turn and Shift to boost; **C** resets to the factory view and **F** performs a one-shot world/composition fit while preserving rotation. Slow visible frames retain held input. Camera mode and keyboard focus are distinct from panel visibility: hiding Camera preserves mode/view, while losing canvas focus stops held movement. Mode, movement speeds, input state and panel state remain runtime-only. See the [Build 116D contract](docs/development/build-116.md#116d-authored-scene-camera) for implementation detail and [ROADMAP](ROADMAP.md#build-116-simulation-world-camera-and-projection) for pending acceptance.

## Build 117 — v0.1.17: UX + Performance Hardening

Planned measured resource/performance and interaction improvements. [Acceptance requirements](ROADMAP.md#build-117-ux-and-performance-hardening).

## Build 118 — v0.1.18: Richer Spectral Selection

Planned frequency-oriented inspection and configurable band-table choices. [Acceptance requirements](ROADMAP.md#build-118-richer-spectral-selection).

## Build 119 — v0.1.19: Workflow Upgrades

Planned preset file import/export alongside URL sharing. [Acceptance requirements](ROADMAP.md#build-119-preset-workflow-upgrades).

## Build 120 — v0.1.20: 3D Orbs + Perspective

Optional exploration after the 2D/camera baseline stabilizes. [Acceptance requirements](ROADMAP.md#build-120-optional-3d-and-perspective).

## Release discipline notes

Changes to published preset schemas require versioning and migrations. Runtime state—queue, playback position, recording sessions, live-input permissions—does not belong in Scene presets. Changelog fixes describe defects present in the compared shipped baseline, not problems introduced and corrected only during unpublished development. Release 4 public comparison spans Build 113 through the internal 114 milestone and Build 115.
