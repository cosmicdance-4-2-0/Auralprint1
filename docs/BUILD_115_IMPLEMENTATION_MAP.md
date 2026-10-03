# Build 115 Implementation Map

This document records where Build 115 ownership landed in the shipped runtime.
It no longer serves as a future-work bridge. Instead, it shows which modules
now own the Build 115 architecture and which compatibility seams still deserve
extra caution during hardening work.

## Purpose

Use this map to reason about current ownership without reopening the roadmap.
If a change touches one of the compatibility seams below, prefer the smallest
possible fix and preserve the Build 115 contracts described in the other docs.

## Current Owners And Compatibility Seams

- `src/js/audio/audio-engine.js`
  - Owns the current `AnalyzerCore`-adjacent analysis path, transport hooks,
    and track-ended lifecycle.
- `src/js/audio/band-bank.js`
  - Owns `BandBank` derivation and dominant-band metadata.
- `src/js/audio/band-bank-controller.js`
  - Owns banking coordination around the live band model and UI-facing banking
    controls.
- `src/js/render/renderer.js`
  - Owns canvas lifecycle and the top-level render loop.
  - Delegates scene content to `src/js/render/compositor.js` instead of drawing
    overlay/orb content directly.
- `src/js/render/compositor.js`
  - Owns scene-driven visualizer lifecycle, ordering, bounds application, and
    `ViewTransform` handoff.
- `src/js/render/visualizer.js`
  - Owns the `Visualizer` registry/factory contract used by built-in
    visualizers.
- `src/js/render/visualizers/`
  - Owns the built-in orb and band-overlay visualizer implementations.
- `src/js/render/orb.js` and `src/js/render/orb-runtime.js`
  - Remain compatibility and simulation helpers for orb behavior and legacy
    runtime state. They are sensitive seams, but they are not alternate render
    owners.
- `src/js/ui/panel-state.js`
  - Owns runtime-only `WorkspaceShell` launcher and panel visibility state.
- `src/js/ui/ui.js` and `src/js/ui/dom-cache.js`
  - Own the shell wiring, Scene panel/editor behavior, and current DOM ID
    bindings that implement the Build 115 shell model.
- `src/js/render/scene-persistence.js`
  - Owns scene-node normalization, legacy visual-root migration, and canonical
    saveback rules.
- `src/js/presets/url-preset.js`
  - Owns preset serialization, share/import/export behavior, and the main entry
    point for schema migration.
- `src/js/core/constants.js`, `src/js/core/preferences.js`, and
  `src/js/core/config.js`
  - Own schema versioning, canonical defaults/limits, and persisted preference
    normalization.

## Implemented Build 115 Modules

These Build 115 modules now exist in the runtime and should be treated as
current architecture, not future intent:

- `src/js/render/compositor.js`
- `src/js/render/visualizer.js`
- `src/js/render/scene-runtime.js`
- `src/js/render/scene-persistence.js`
- `src/js/ui/panel-state.js`

Build 115 still describes `AnalysisFrame`, `BandFrame`, `Scene`, and
`WorkspaceShell` as architectural concepts even where the runtime keeps those
concepts distributed across existing files rather than a single module name.

## Highest Hardening Pressure

The files with the highest release-gate pressure are:

- `src/js/render/scene-persistence.js`
- `src/js/presets/url-preset.js`
- `src/js/ui/ui.js`
- `src/js/render/compositor.js`
- `src/js/render/orb-runtime.js`

These files sit closest to migration correctness, runtime-only boundaries,
scene/editor truth, and visual lifecycle stability.
