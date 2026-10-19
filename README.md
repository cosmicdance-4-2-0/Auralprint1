# Auralprint

Offline-capable audio analysis, playback, visualization, and recording. Spectral analysis drives the visualizers.

**Current release:** Release 3 / Build 113 (`v0.1.13`). Build 114 (`v0.1.14`) was shipped internally. **Release candidate:** Build 115N (`v0.1.15n`), preset schema 10; final acceptance **WITHHELD**. Build 115 is not a canonical shipped release. The owner reports 115N is publicly deployed for [RC testing](docs/development/build-115-release-delta.md#115n-rc-1-field-evidence-owner-tester-reports-october-1819-2026), not approved as Release 4.

- [ROADMAP.md](ROADMAP.md): current scope, future builds, acceptance gates, and deferrals.
- [agents.md](agents.md): binding architecture and development contracts.
- [Build 115 history](docs/development/build-115.md): engineering chronology and corrective dispositions.
- [Release comparison draft](docs/development/build-115-release-delta.md): unpublished comparison with public Build 113 and internal Build 114.
- [Canonical changelog](docs/Canon/changelog.md): changes between shipped public releases.

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

- **Portable:** `dist/auralprint_<version-without-leading-v>.html` (for this candidate: `dist/auralprint_0.1.15n.html`); application JS/CSS and favicon embedded.
- **Hosted:** `dist/hosted/index.html` plus the included icons and `site.webmanifest`. Deploy the whole directory, including at subdirectory paths, with appropriate MIME types.

`npm run watch` watches JS/CSS, the HTML template, root `version`, and branding inputs. Build and watch share the distribution contract. CI checks Linux and Windows builds. Browser tooling is optional.

The portable file is designed to run without adjacent assets. Direct local-file usage has owner-reported browser coverage, but fully network-disabled operation remains an open acceptance check. Hosted packaging does not provide a service worker or offline caching.

## Using the development build

Load audio in **File**, or select **Mic** / **Stream** with browser permission. **Audio** controls sources and playback; **Queue** controls the playlist; **Analysis** owns spectral configuration; **Visualizers** owns Orbs and the Spectral Ring; **Settings** owns Scene appearance, particle resources, and presets; **Record** owns capture. **H** hides/restores panels outside text inputs; **Space** pauses visual motion/emission, not audio analysis.

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
| 3 | 113 | `v0.1.13` | Current canonical |

Builds 112 and 114 were shipped internally, not as new public releases.

## Build status overview

| Build | Status | Scope |
| --- | --- | --- |
| 112 | Internal shipped | Queue and scrubber |
| 114 | Internal shipped | Microphone and stream input |
| 115 | 115N RC in validation; unshipped; acceptance WITHHELD | Analysis/visualizer separation and independent Orbs |
| 116–120 | Planned | See [ROADMAP.md](ROADMAP.md) |

## Build 111 — v0.1.11 (Release 2, ✅ shipped - previous canonical)

Stereo L/R/C analysis, Orbs, band overlay, URL presets, and panel controls. Playback, preset migration, and audio teardown remain compatibility requirements.

## Build 112 — v0.1.12 (✅ shipped - internal): “Scrubber + Queue”

Waveform seeking, multi-file queue, navigation, drag/drop, repeat and track-end handling. Queue and playback position remain runtime state, not presets.

## Build 113 — v0.1.13 (Release 3, ✅ shipped - canonical): Recording / Capture

Recording panel with browser-supported WebM/MP4, optional source audio, frame-rate choice, latest export/download, and five band-distribution modes. This is the current public release baseline.

## Build 114 — v0.1.14: Live Input Sources

Permission-gated microphone and stream analysis, source switching, and source-aware recording. Shipped internally.

## Build 115 — v0.1.15: Visualizer Architecture + Orb Overhaul v1

Release candidate under validation; not shipped. AnalysisFrame separates analysis from visualizer consumers; VisualizerRuntime owns lifecycle. The Spectral Ring is a singleton, while zero/one/N Orbs have stable IDs and independent configuration/editors. Scene owns shared color; particle limits and recorder-resource policy are configurable. Schema 10 preserves supported legacy preset migration.

**RC acceptance pending:** [115N acceptance](ROADMAP.md#build-115n-acceptance-gates) still requires applicable media/device, browser, accessibility, performance, artistic, distribution, and release evidence. Passing tests or merged corrective PRs does not authorize shipment.

## Build 116 — v0.1.16: Camera Controls (Render ≠ Sim)

Planned projection-only pan, zoom, and rotation. Simulation/analysis must remain unaffected. [Acceptance requirements](ROADMAP.md#build-116-camera-controls-render-separate-from-simulation).

## Build 117 — v0.1.17: UX + Performance Hardening

Planned measured resource/performance and interaction improvements. [Acceptance requirements](ROADMAP.md#build-117-ux-and-performance-hardening).

## Build 118 — v0.1.18: Richer Spectral Selection

Planned frequency-oriented inspection and configurable band-table choices. [Acceptance requirements](ROADMAP.md#build-118-richer-spectral-selection).

## Build 119 — v0.1.19: Workflow Upgrades

Planned preset file import/export alongside URL sharing. [Acceptance requirements](ROADMAP.md#build-119-preset-workflow-upgrades).

## Build 120 — v0.1.20: 3D Orbs + Perspective

Optional exploration after the 2D/camera baseline stabilizes. [Acceptance requirements](ROADMAP.md#build-120-optional-3d-and-perspective).

## Release discipline notes

Changes to published preset schemas require versioning and migrations. Runtime state—queue, playback position, recording sessions, live-input permissions—does not belong in Scene presets. Changelog fixes describe bugs present in the prior **public release**, not problems introduced and corrected only during development. Canonization requires explicit 115N acceptance.
