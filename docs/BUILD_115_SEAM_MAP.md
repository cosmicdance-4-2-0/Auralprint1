# Build 115 Seam Map

This document maps responsibilities to code modules for the Build 115 visual
architecture. The goal is to keep analyzer logic, banking, scene composition,
rendering, inspectors, presets, and UI shell behavior on clear seams so future
changes stay local.

## Purpose

Build 115 is now implemented, but the repo still contains compatibility seams
that matter during hardening. This map describes the current responsibility
boundaries so fixes stay local and do not accidentally recreate duplicate
ownership.

## Canonical Frame And Ownership Flow

Build 115 uses this ownership flow:

`AnalyzerCore -> AnalysisFrame -> BandBank -> BandFrame -> Visualizer/Inspector`

- `Visualizer`s consume `BandFrame` and may read the underlying
  `AnalysisFrame` through `BandFrame.analysis`.
- `Inspector`s consume `BandFrame` in the UI layer.
- `Scene`, `SceneNode`, `Compositor`, and `ViewTransform` sit on top of those
  contracts to organize and render scene content.

## Current Owners And Compatibility Seams

These modules are the current runtime owners or compatibility seams:

- **Audio and banking**
  - `src/js/audio/audio-engine.js` is the current home of `AnalyzerCore`
    responsibilities.
  - `src/js/audio/band-bank.js` and
    `src/js/audio/band-bank-controller.js` are the current home of `BandBank`
    responsibilities.

- **Rendering**
  - `src/js/render/renderer.js` owns the top-level render path but delegates
    scene content to `src/js/render/compositor.js`.
  - `src/js/render/compositor.js` owns scene-node lifecycle, ordering, bounds,
    and `ViewTransform` handoff.
  - `src/js/render/visualizer.js` plus `src/js/render/visualizers/` own the
    first-class visualizer path used by the built-in orb and overlay visuals.
  - `src/js/render/orb.js` and `src/js/render/orb-runtime.js` remain
    compatibility and simulation helpers for orb behavior.
  - `src/js/render/color-policy.js`, `src/js/render/trail-system.js`, and
    related helpers remain support modules behind the current render path.

- **UI shell**
  - `src/js/ui/panel-state.js` owns runtime-only launcher and panel visibility
    state.
  - `src/js/ui/ui.js` remains the top-level UI orchestrator for the current
    shell and Scene editor behavior.
  - `src/js/ui/dom-cache.js` binds the current panel IDs and launcher elements
    used by the implemented shell.

- **Presets and configuration**
  - `src/js/presets/url-preset.js` owns preset serialization and the active
    Schema 9 import/export/share path.
  - `src/js/render/scene-persistence.js` owns scene-node normalization and
    legacy visual-root migration.
  - `src/js/core/constants.js` declares `PRESET_SCHEMA_VERSION = 9`.
  - `src/js/core/preferences.js` and `src/js/core/config.js` define the
    current persisted preference shape and defaults.

## Implemented Canonical Owners

These Build 115 modules now exist and should be treated as canonical runtime
owners:

- `src/js/render/visualizer.js` - `Visualizer` contract and registry.
- `src/js/render/compositor.js` - scene-driven render orchestration and
  `ViewTransform` handoff.
- `src/js/render/scene-persistence.js` and `src/js/render/scene-runtime.js` -
  scene-node normalization, persistence, and editor/runtime helpers.
- `src/js/ui/panel-state.js` - runtime-only `WorkspaceShell` visibility and
  launcher state.

## Responsibility Rules

- **AnalyzerCore** owns source attachment and analyzer graph state, not scene or
  UI composition.
- **BandBank** owns band derivation and dominant-band metadata, not rendering.
- **Visualizer** owns one scene-facing effect and renders within compositor
  bounds.
- **Inspector** owns one UI-facing instrumentation surface and does not
  participate in scene composition.
- **Scene** persists scene configuration, primarily through `scene.nodes`.
- **SceneNode** holds per-visualizer placement and settings data only.
- **Compositor** instantiates active visualizers from the scene, applies
  ordering and bounds, passes through `ViewTransform`, and renders into the
  main surface.
- **WorkspaceShell** owns panel and launcher runtime state without owning low-
  level audio or render internals.

## Hardening Boundary

Hardening work should preserve these seams, not reopen them:

- Do not bypass `scene-persistence.js` when normalizing or saving scene nodes.
- Do not reintroduce direct overlay/orb drawing into `renderer.js`.
- Do not move runtime-only shell or camera state into presets.
- Do not treat `orb-runtime.js` compatibility state as a second render owner.
