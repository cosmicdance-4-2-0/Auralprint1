# Build 115 Architecture

This document defines the high-level architecture for Build 115 of Auralprint.
It ratifies the canonical vocabulary used across the refactor and clarifies how
analysis, banking, scene composition, rendering, and UI responsibilities fit
together.

## Overview

Auralprint remains analysis-first. `AnalyzerCore` produces a normalized
`AnalysisFrame` for each tick. `BandBank` enriches that into a `BandFrame`.
`Visualizer` and `Inspector` modules consume those contracts through stable
interfaces. A `Scene` organizes visualizer configuration, a `Compositor`
instantiates and renders active `SceneNode`s, and the `WorkspaceShell` hosts
the control surfaces around that render path.

```
Source Input -> AnalyzerCore -> AnalysisFrame -> BandBank -> BandFrame
                                         |                    |
                                         |                    +-> Inspector(s)
                                         +--------------------+-> Visualizer(s)
                                                                  |
                                                           Scene + Compositor
                                                                  |
                                                            Render Surface
```

Build 115 is now implemented in the runtime. These docs remain the architecture
source of truth, while `docs/Canon/` captures older release baselines. The
module layout differs slightly from the earliest phase plan, but the runtime
does ship the scene/compositor/visualizer shell described here.

## Key Components

- **AnalyzerCore** - Owns the Web Audio analysis graph and produces a
  normalized `AnalysisFrame`. It is responsible for FFT, RMS, and related
  frame-level analysis output, not for banking, scene logic, or UI.
- **AnalysisFrame** - The immutable per-tick snapshot emitted by
  `AnalyzerCore`. It is the low-level analysis contract consumed by `BandBank`
  and, when needed, by advanced visualizers.
- **BandBank** - Converts an `AnalysisFrame` into a psychoacoustically grouped
  `BandFrame`. It owns distribution logic, dominant-band derivation, band
  metadata, and related banking rules.
- **BandFrame** - The immutable band-oriented snapshot consumed by
  `Visualizer`s and `Inspector`s. It carries band energies, dominant-band
  information, and a reference to the underlying `AnalysisFrame` at
  `BandFrame.analysis`.
- **Visualizer** - A scene-facing module that consumes `BandFrame` and, when
  needed, `BandFrame.analysis`, then renders visual output inside the render
  surface. The band overlay and orbs belong to this category in the Build 115
  architecture.
- **Inspector** - A UI-facing module that consumes the same frame contracts but
  renders instrumentation in the UI layer instead of the scene. The band table
  and live band HUD belong here.
- **Scene** - The top-level scene configuration model. Presets persist scene
  data such as node order, enabled state, bounds, anchor, and settings. The
  runtime constructs live visualizer instances from this configuration.
- **SceneNode** - A data record inside a `Scene` that places and configures one
  `Visualizer`. A `SceneNode` is not a live visualizer instance.
- **Compositor** - The render orchestration layer that reads a `Scene`,
  instantiates active visualizers, applies ordering, passes through the current
  `ViewTransform`, and draws into the final render surface.
- **ViewTransform** - The runtime-only camera/view abstraction passed through
  the compositor render path. It is the identity transform in Build 115 and
  becomes meaningful in Build 116.
- **WorkspaceShell** - The panel and launcher system around the render surface.
  It hosts Analysis, Banking, Scene, Audio Source, Recording,
  Workspace/Presets, and Status/Log surfaces. In Build 115 this remains
  conceptual canon, not a required rename of current Build 114 panel IDs.

## Layered Architecture

1. **Input Layer**
   File playback, microphone capture, and stream capture feed raw audio into
   the analysis path.

2. **Analysis Layer**
   `AnalyzerCore` turns source audio into `AnalysisFrame` snapshots.

3. **Spectral Model Layer**
   `BandBank` derives `BandFrame` data from `AnalysisFrame` plus banking
   settings.

4. **Presentation Layer**
   `Visualizer`s render scene content and `Inspector`s render user-facing
   instrumentation. Both consume the same frame contracts.

5. **Composition Layer**
   `Scene`, `SceneNode`, `Compositor`, and `ViewTransform` define how scene
   content is organized, ordered, and rendered.

6. **Workspace/UI Layer**
   `WorkspaceShell` hosts panels and launchers without owning low-level audio
   analysis or scene rendering logic.

## Current Runtime Reality

The current runtime aligns with the Build 115 ownership model:

- `src/js/render/renderer.js` owns canvas lifecycle and the top-level render
  loop, then delegates scene content to `src/js/render/compositor.js`.
- `src/js/render/visualizer.js` and `src/js/render/visualizers/` own the
  `Visualizer` registry and the built-in orb/overlay implementations.
- `src/js/render/orb.js` and `src/js/render/orb-runtime.js` remain
  compatibility and simulation helpers for orb behavior, not alternate render
  owners.
- `src/js/ui/panel-state.js` owns the runtime-only launcher/panel shell state,
  while `src/js/ui/ui.js` and `src/js/ui/dom-cache.js` wire the current shell
  and Scene panel UI.
- `src/js/presets/url-preset.js`, `src/js/render/scene-persistence.js`,
  `src/js/core/constants.js`, `src/js/core/preferences.js`, and
  `src/js/core/config.js` own Schema 9 persistence and migration.

The remaining legacy modules are compatibility seams and wiring layers, not
parallel architecture paths.

## Terms And Invariants

- **AnalyzerCore -> AnalysisFrame -> BandBank -> BandFrame** is the canonical
  frame flow for Build 115.
- **Visualizer vs Inspector** - A `Visualizer` is scene content drawn within
  the render surface. An `Inspector` is UI instrumentation drawn within the
  workspace shell. The band overlay is a `Visualizer`; the band table and band
  HUD are `Inspector`s.
- **Frame contracts** - `Visualizer`s and `Inspector`s consume `BandFrame` as
  their direct input and read `AnalysisFrame` through `BandFrame.analysis` when
  needed. They do not read directly from Web Audio nodes.
- **Scene persistence** - Presets persist scene configuration, including node
  order, enabled state, bounds, anchor, and settings. Runtime-only state
  includes instantiated visualizer objects, selected node/UI state, the live
  `ViewTransform`, panel visibility, permissions, queue state, playback
  session state, and recording state.
- **WorkspaceShell boundary** - `WorkspaceShell` names the Build 115 shell
  concept. Current implementation labels such as `audioPanel`, `simPanel`,
  `bandsPanel`, `queuePanel`, and `recordPanel` remain legacy runtime labels
  unless a future build intentionally changes them.

Build 115 establishes this architecture vocabulary and contract surface.
Build 116 extends it with camera behavior built on the `ViewTransform`
abstraction without changing the core layering.
