# Auralprint

Offline-capable audio analysis, playback, visualization, and recording. Spectral analysis drives the visualizers.

**Current public release:** Release 4 / Build 115 (`v0.1.15`), preset schema 10. [Canonical portable HTML](docs/Canon/0.1.15/auralprint_0.1.15.html); [release acceptance and platform qualifications](ROADMAP.md#build-115-release-acceptance-and-qualifications).

**Current source checkout:** Proposed Build 116G (`v0.1.16g`), preset schema 15. Optional Angular Span Trace length extends accepted 116F (PR #86); implementation review and browser/device acceptance remain pending. The owner has not authorized 116 RC #1 or public publication. See the [Build 116 acceptance gates](ROADMAP.md#build-116-simulation-world-camera-and-projection).

- [ROADMAP](ROADMAP.md): current scope, future builds, acceptance gates and deferrals.
- [AGENTS](AGENTS.md): binding architecture and development contracts.
- [Build 115 history](docs/development/build-115.md) and [Build 116 history/contract](docs/development/build-116.md): engineering decisions, chronology and evidence.
- [Changelog](docs/Canon/changelog.md) and [Build 115 release comparison](docs/development/build-115-release-delta.md): release differences and historical internal-build comparisons.

<a id="developer-and-agent-bootstrap"></a>

## Developer bootstrap

Requires **Node 24** and **Python 3.12**. Run sequentially from the repository root:

```sh
npm ci
npm test
npm run build
python scripts/verify_distribution.py
npm run test:browser
npm run test:browser:editing
npm run test:browser:presets
```

Do not run test and build concurrently: tests temporarily rename build directories.

Before the native browser checks, install Playwright's matching Chromium headless shell and required platform dependencies. Ubuntu CI uses `npx playwright install --with-deps chromium --only-shell`; local installations need the browser and dependencies appropriate to their OS. Commands and CI setup are defined in [package.json](package.json) and the [CI workflow](.github/workflows/ci.yml).

Build outputs:

- **Portable:** `dist/auralprint_<version-without-leading-v>.html`, derived from the root [version](version) file (this checkout: `dist/auralprint_0.1.16g.html`); application JS/CSS and favicon embedded. The immutable [public Build 115 HTML](docs/Canon/0.1.15/auralprint_0.1.15.html) is stored separately.
- **Hosted:** `dist/hosted/index.html` plus the included icons and `site.webmanifest`. Deploy the whole directory, including at subdirectory paths, with appropriate MIME types.

`npm run watch` watches JS/CSS, the HTML template, root `version`, and branding inputs. Build and watch share the distribution contract. CI runs Node tests, build and distribution verification on Ubuntu and Windows; all three Chromium browser checks are mandatory on Ubuntu. Chromium CI uses local HTTP and does not certify Windows browser interaction, Firefox, Safari, physical devices, native audio permissions, direct `file://` operation or offline launch.

The portable file is designed to run without adjacent assets. Direct local-file usage has owner-reported browser coverage, but fully network-disabled operation remains an open acceptance check. Hosted packaging does not provide a service worker or offline caching.

## Sharing in the Build 116 checkout

**Copy Share Link** writes a compact schema-15 link using native DEFLATE (`#z=`) when compression and decompression work. It shares the authored Scene view. If compression is unavailable, it writes an uncompressed schema-15 link (`#p=`) and explains the fallback. If clipboard access fails, copy the complete link from the address bar.

Opening a compressed link requires working native DEFLATE decompression. Unsupported browsers retain the active Scene and show an explanation; an uncompressed link is the compatibility option. Schemas 2–14 retain their decoding meanings, including compressed schemas 13 and 14. New links require a build supporting schema 15. Link length depends on the Scene and the sharing service's limits.

See [116E protocol, measurements, reproducible checks and owner device matrix](docs/development/build-116.md#116e-compact-presets). Optional Firefox/WebKit checks remain separate from mandatory Chromium CI.

<a id="build-115--v0115-visualizer-architecture--orb-overhaul-v1"></a>

## Current capabilities

The public Build 115 release provides:

- **Playback and analysis:** File, permission-gated Mic and Stream sources; a multi-file queue with picker/drop, navigation, remove/clear, shuffle/repeat and waveform seeking. Analysis offers L/R/C channels, a 256-band default, five distributions and Nyquist-aware frequency limits.
- **Visualizers:** a singleton Spectral Ring and zero, one or many stable-ID Orbs with independent channel/band targets, motion, response, particles, Trace, position, color and designed phase. Add, duplicate, remove and edit Orbs; Bulk Edit applies to all Orbs with mixed-value awareness. Scene appearance owns shared colors and palette.
- **Resources and presets:** configurable particle emission/retention limits and placement spacing; URL sharing and supported legacy preset migration. Scene presets contain configuration; queue, playback position, recording sessions and live-input permissions remain runtime state. The current checkout adds the world and authored Camera behavior below.

## Using Auralprint

Load audio in **File**, or select **Mic** / **Stream** with browser permission. **Audio** controls sources and playback; **Queue** controls the playlist; **Analysis** owns spectral configuration; **Visualizers** owns Orbs and the Spectral Ring; **Settings** owns Scene appearance, particle resources and presets; **Record** owns capture. The development checkout adds **Camera** for live view and authored Scene view actions. **H** hides/restores panels outside text inputs; **Space** pauses visual motion/emission while analysis and particle aging continue. **Reset Visuals** applies designed Orb phases and clears trails.

**Queue source behavior:** Settings → Source Behavior → **Clear File Queue when switching sources** clears the File Queue only after a successful File → Mic or Stream transition. It defaults off and is saved in Scene presets, including shared links. Enabling it through an import affects future transitions; importing does not clear or serialize the Queue.

**Trace length:** each Orb’s Trace section and Bulk Edit offer **Trace Length Mode**. **Line Count** retains the existing behavior. **Angular Span** limits the Trace to actual Orb travel, with a numeric degree input from 1–3,600° (initially 360°; arrow step 1°). This is an upper bound using retained particles: 180° allows up to half a turn, 360° one turn, and 1,080° three turns. **Line Count** remains the maximum segment limit in both modes. Switching into Angular Span starts collecting eligible samples; it does not reconstruct older rotation history or keep particles longer.

**Trace presentation:** **Fade Trace**, **Fade Length** (1–1,000 visible segments, initially 5), and **Particle Birth Color** work in both length modes. Fading blends the oldest selected drawable segments toward the Scene background. Particle Birth Color uses each contributing particle’s stored emission color. These features can be combined and default to the existing unfaded dominant-band behavior. Settings → Performance → **Refresh Trace Work Diagnostics** explains any drawing-budget simplification for the last completed frame.

**Waveforms:** Audio → Waveforms has optional 4/8/15-minute stereo-equivalent workload profiles, separate encoded-input and estimated-PCM admission limits, and manual generation. Playback does not require waveform preparation. These limits do not bound total browser memory.

**Recording:** choose a browser-supported WebM/MP4 format, frame rate and optional source audio. Start capture, then Stop and download the latest export. Record → Settings defaults to **Balanced** (five-minute automatic Stop, encoded-data admission limits). **Custom** allows independent Off settings; **Unrestricted** disables application size, chunk and duration restrictions. Neither mode eliminates browser/device limits. Recording settings persist locally, outside Scene presets. Cancel Current Capture preserves the previous successful export.

Firefox does not supply shared-display audio for Stream mode; Stream requires an audio track and rejects video-only sessions. File and Mic are separate workflows. Browser/codec support and native permissions vary; see the [release qualifications](ROADMAP.md#build-115-release-acceptance-and-qualifications).

## Camera in the Build 116 checkout

Build 116 separates the simulation world from the viewport. Configurable world dimensions define Orb/Ring reference geometry, **not** clipping/collision bounds; particle placement spacing uses world units independently of viewport/DPR. Camera movement changes the view, preserving simulation and retained history; marks retain CSS-screen sizing.

The live performance view is separate from the authored Scene viewpoint. **Save Current View as Scene View** explicitly persists the live pose into the Scene; **Restore Scene View** stops input and restores that authored view to the live camera. **Copy Share Link** serializes the authored Scene, including its saved viewpoint; live navigation never implicitly saves or shares its current pose.

Enable camera mode for drag-to-pan and pointer-centered wheel zoom. With canvas keyboard focus, hold WASD/QE to move/turn and Shift to boost; **C** resets to the factory view and **F** performs a one-shot world/composition fit while preserving rotation. Slow visible frames retain held input. Camera mode and keyboard focus are distinct from panel visibility: hiding Camera preserves mode/view, while losing canvas focus stops held movement. Mode, movement speeds, input state and panel state remain runtime-only. See the [Build 116D contract](docs/development/build-116.md#116d-authored-scene-camera) for implementation detail and [ROADMAP](ROADMAP.md#build-116-simulation-world-camera-and-projection) for pending acceptance.

<a id="build-113--v0113-release-3--shipped---canonical-recording--capture"></a>

## Canonical release history

| Public release | Build / version | Accepted artifact | Changes |
| --- | --- | --- | --- |
| 1 | 110 / `v0.1.10` | [HTML](docs/Canon/0.1.10/index.html) | Legacy baseline |
| 2 | 111 / `v0.1.11` | [HTML](docs/Canon/0.1.11/index.html) | [Changelog](docs/Canon/changelog.md#v110--v111) |
| 3 | 113 / `v0.1.13` | [HTML](docs/Canon/0.1.13/auralprint_0.1.13.html) | [Changelog](docs/Canon/changelog.md#v112--v113) |
| 4 (current) | 115 / `v0.1.15` | [HTML](docs/Canon/0.1.15/auralprint_0.1.15.html) | [Changelog](docs/Canon/changelog.md#v114--v115-release-4--build-115) |

Builds [112](docs/Canon/changelog.md#v111--v112) and [114](docs/Canon/changelog.md#v113--v114) shipped internally, without additional public releases. Public Release 3 → 4 includes the internal Build 114 Mic/Stream work as well as Build 115.

For the `v0.1.xx` series, Build = `100 + xx`; letter suffixes identify development revisions. A Release is a published public bundle and may skip internal builds. Shipped builds and published preset contracts are immutable; [schema changes require versioning and migration](AGENTS.md#21-schema-discipline).
