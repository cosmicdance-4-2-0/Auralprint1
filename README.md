# Auralprint

Offline-capable audio analysis, playback, visualization, and recording. Spectral analysis drives the visualizers.

**Current release:** Release 4 / Build 115 (`v0.1.15`), preset schema 10. Released following 115N RC testing and owner acceptance. Build 114 (`v0.1.14`) was internal; previous public release was Release 3 / Build 113.

- [ROADMAP.md](ROADMAP.md): current scope, future builds, acceptance gates, and deferrals.
- [agents.md](agents.md): binding architecture and development contracts.
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
```

Do not run test and build concurrently: tests temporarily rename build directories.

Build outputs:

- **Portable:** `dist/auralprint_<version-without-leading-v>.html` (for this release: `dist/auralprint_0.1.15.html`); application JS/CSS and favicon embedded.
- **Hosted:** `dist/hosted/index.html` plus the included icons and `site.webmanifest`. Deploy the whole directory, including at subdirectory paths, with appropriate MIME types.

`npm run watch` watches JS/CSS, the HTML template, root `version`, and branding inputs. Build and watch share the distribution contract. CI checks Linux and Windows builds. Browser tooling is optional.

The portable file is designed to run without adjacent assets. Direct local-file usage has owner-reported browser coverage, but fully network-disabled operation remains an open acceptance check. Hosted packaging does not provide a service worker or offline caching.

## Using Auralprint

Load audio in **File**, or select **Mic** / **Stream** with browser permission. **Audio** controls sources and playback; **Queue** controls the playlist; **Analysis** owns spectral configuration; **Visualizers** owns Orbs and the Spectral Ring; **Settings** owns Scene appearance, particle resources, and presets; **Camera** owns runtime view and performance controls; **Record** owns capture. **H** hides/restores panels outside text inputs; **Space** pauses visual motion/emission, not audio analysis.

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
| 116–120 | Planned | See [ROADMAP.md](ROADMAP.md) |

## Build 111 — v0.1.11 (Release 2, ✅ shipped - previous canonical)

Stereo L/R/C analysis, Orbs, band overlay, URL presets, and panel controls. Playback, preset migration, and audio teardown remain compatibility requirements.

## Build 112 — v0.1.12 (✅ shipped - internal): “Scrubber + Queue”

Waveform seeking, multi-file queue, navigation, drag/drop, repeat and track-end handling. Queue and playback position remain runtime state, not presets.

## Build 113 — v0.1.13 (Release 3, ✅ shipped - canonical): Recording / Capture

Recording panel with browser-supported WebM/MP4, optional source audio, frame-rate choice, latest export/download, and five band-distribution modes. Previously the public release baseline.

## Build 114 — v0.1.14: Live Input Sources

Permission-gated microphone and stream analysis, source switching, and source-aware recording. Shipped internally.

## Build 115 — v0.1.15: Visualizer Architecture + Orb Overhaul v1

Release 4, accepted and shipped. AnalysisFrame separates analysis from visualizer consumers; VisualizerRuntime owns lifecycle. The Spectral Ring is a singleton, while zero/one/N Orbs have stable IDs and independent configuration/editors. Scene owns shared color; particle limits and recorder-resource policy are configurable. Schema 10 preserves supported legacy preset migration.

**Release artifact:** [Canonical portable HTML](docs/Canon/0.1.15/auralprint_0.1.15.html). Firefox does not supply shared-display audio for Stream mode; File and Mic are separate workflows. See [release acceptance and qualifications](ROADMAP.md#build-115-release-acceptance-and-qualifications).

## Build 116 — Simulation World, Camera & Projection (in progress)

116A integrates independent Orb/Ring world geometry, configurable Scene dimensions and schema-11 migration from supported schemas 2–10. World dimensions define reference geometry, **not** clipping/collision bounds; placement spacing uses world units independently of viewport/DPR. 116B adds runtime-only camera ownership and forward/inverse projection. 116C.A (`v0.1.16c.a.a`) gives **Camera** its own workspace launcher and operational panel. Enable camera mode, choose **Focus canvas**, and hold WASD/QE to move/turn; Shift boosts speed; C resets and F fits the world/composition while preserving rotation. Slow visible frames retain held input. Drag pans and wheel zooms around the pointer. Speeds and camera stay runtime-only, including while the panel is hidden. CSS-sized marks retain accepted behavior; [116 development contract and preview instructions](docs/development/build-116.md#116ca-camera-workspace-and-continuous-control) and [acceptance gates](ROADMAP.md#build-116-simulation-world-camera-and-projection).

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
