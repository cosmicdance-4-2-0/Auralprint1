# Build 115 Workspace Shell

This document specifies the Build 115 `WorkspaceShell`: the panel and launcher
system that surrounds the render surface. The current runtime implements this
shell through the existing DOM structure and panel IDs, without requiring a
wholesale rename of legacy element IDs.

## Panel Taxonomy

Build 115 uses the following conceptual panel set:

| Panel | Responsibilities |
|-------|------------------|
| **Audio Source** | File loading, queue management, source selection, transport controls, mute, and volume. |
| **Analysis** | Controls for `AnalyzerCore`, such as FFT size, smoothing, RMS gain, and other analyzer-facing knobs. |
| **Banking** | Controls for band distribution, band count, floor and ceiling, dominant-band behavior, color policy, and related banking rules. The full live band table may be revealed here as an `Inspector`, not as a scene visualizer. |
| **Scene** | Compose the visual scene by enabling, ordering, and configuring active `Visualizer`s. |
| **Recording** | Start and stop capture sessions, choose recording options, and surface export state. |
| **Workspace / Presets** | Import, export, and share presets plus any workspace-wide settings that do not belong elsewhere. |
| **Status / Log** | Surface runtime events, warnings, permission results, migration notices, and other user-facing status output. |

## Bottom Launcher Bar

Build 115 introduces a unified launcher bar docked to the bottom edge of the
viewport.

- **Collapsed state** - The bar can collapse into a minimal strip to maximize
  render space.
- **Icons** - Each conceptual panel has one icon in the launcher bar. Active
  panels appear highlighted.
- **Badges and pulses** - Icons may show state indicators such as unread log
  activity or active recording.
- **Ordering** - The default order is Audio Source, Analysis, Banking, Scene,
  Recording, Workspace / Presets, and Status / Log.

## Panel Behavior

Panels overlay the render surface rather than shifting it.

- **Open and close** - Clicking an icon toggles one panel instance.
- **Multiple panels** - More than one panel may be open at the same time.
- **Default state** - Audio Source, Analysis, and Banking are visible by
  default. Scene, Recording, Workspace / Presets, and Status / Log begin
  collapsed.
- **Responsive layout** - On smaller screens, panels may stack or dock
  differently, but the launcher system remains accessible.

## Status / Log Console

The Status / Log panel is a runtime event surface for:

- Permission grants and failures.
- Source switching events.
- Recording lifecycle events and export results.
- Schema migration notices and warnings.
- Errors or warnings emitted by visualizers or inspectors.

This log is runtime-only and is never persisted to presets.

## Implementation Status

The current runtime implements the Build 115 shell model through:

- `src/js/ui/panel-state.js` for runtime-only launcher and panel visibility
  state;
- `src/js/ui/ui.js` for panel wiring, launcher behavior, and shell
  coordination; and
- the current DOM bindings in `src/js/ui/dom-cache.js`.

Implementation labels such as `audioPanel`, `simPanel`, `bandsPanel`,
`queuePanel`, and `recordPanel` remain valid runtime labels even though the
user-facing shell behavior now follows the Build 115 taxonomy.

## Future Expansion

Build 116 adds meaningful camera behavior on top of the Scene panel's current
identity `ViewTransform` hook. Runtime-only shell state remains non-persisted.
