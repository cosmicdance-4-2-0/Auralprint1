# Build 115 Scene Model

## Purpose

Build 115 introduces a formal scene model that decouples Auralprint's visual
output from analysis and banking. Prior versions treated the orb path and band
overlay as special-case render behavior wired directly into the main renderer.
The scene model ratifies that render content is composed from multiple
`Visualizer`s placed in a `Scene`, while UI instrumentation remains the domain
of `Inspector`s.

The scene model creates a foundation for:

- Compositing multiple visualizers, such as orbs, the band overlay, and future
  effects, onto a single render surface.
- Positioning, ordering, and resizing visualizers without altering analyzer
  logic.
- Migrating legacy preset data into stable scene configuration.
- Preparing for Build 116 camera work through a runtime `ViewTransform`
  abstraction.

## Implementation Status

The Build 115 scene model is implemented in the current runtime:

- presets persist `scene.nodes` in Schema 9;
- the compositor instantiates and renders active scene nodes through the
  visualizer registry;
- the Scene panel edits node ordering, enabled state, and settings through the
  persisted scene model; and
- `ViewTransform` remains a runtime-only identity hook for Build 116.

`orb.js` and `orb-runtime.js` still exist as compatibility and simulation
helpers, but they are not alternate scene ownership paths.

## Scene And Scene Nodes

### Scene

A `Scene` is the top-level persisted scene configuration model. For Build 115,
the minimum persisted scene surface is:

- top-level `scene`
- `scene.nodes`

Optional future scene-level properties may exist later, but the initial Build
115 migration baseline is the `scene.nodes` collection plus the node fields
defined below. Runtime-only state, including the active `ViewTransform`, is not
part of the persisted scene shape.

### SceneNode

A `SceneNode` encapsulates the configuration for one visualizer placement inside
the scene. A `SceneNode` is a data structure, not a live visualizer instance.
The `Compositor` consumes scene nodes to create and manage actual visualizer
objects.

Required fields in a Build 115 `SceneNode`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for the node within the scene. |
| `type` | string | Registered visualizer type such as `"orbs"` or `"bandOverlay"`. |
| `enabled` | boolean | Whether this node is active. Disabled nodes are ignored by the compositor. |
| `zIndex` | number | Render order. Lower values render behind higher values. |
| `bounds` | `{ x, y, w, h }` | Normalized position and size within the render surface. Coordinates are in the `0..1` range. |
| `anchor` | `{ x, y }` | Normalized pivot point inside the node bounds. |
| `settings` | any | Visualizer-specific settings payload. |

#### Bounds And Layout

- **Normalized coordinates** - `bounds` and `anchor` use normalized coordinates
  so layouts scale with the render surface.
- **Anchor semantics** - `{ x: 0.5, y: 0.5 }` anchors at center.
  `{ x: 0, y: 0 }` anchors at top-left.

#### Node Settings

The `settings` payload contains visualizer-specific configuration such as orb
motion parameters or overlay options. Each visualizer type defines its own
settings schema and defaults. `SceneNode` itself does not inspect those fields.

### Scene Default

When no scene configuration exists in a preset, the application should
construct a default scene that preserves the current orb-plus-overlay
experience:

- `id: "orbs-1"`, `type: "orbs"`, `enabled: true`, `zIndex: 0`,
  full-surface bounds, centered anchor, and the base orb settings.
- `id: "overlay-1"`, `type: "bandOverlay"`, `enabled: true`, `zIndex: 1`,
  full-surface bounds, centered anchor, and the base overlay settings.

## Compositor

The `Compositor` instantiates visualizers, invokes their `update()` and
`render()` methods, and combines their outputs into the final render surface.
It reads scene configuration, creates the live visualizer instances, and passes
the current runtime `ViewTransform` through the render path.

Key responsibilities:

- **Instantiation** - For each active node, obtain the visualizer implementation
  from the registry and call `init()` with node settings and render context.
- **Order** - Respect `zIndex` ordering when rendering.
- **Sizing and placement** - Convert normalized scene bounds into pixel bounds
  and pass those to `resize(bounds)`.
- **Updates** - Call `update(frame, dt)` on each active visualizer using the
  current `BandFrame` and, when needed, `frame.analysis`.
- **Rendering** - Call `render(target, viewTransform)` on each active
  visualizer.
- **Disposal** - Call `dispose()` when a node is removed or disabled.

Build 115 keeps the compositor simple: one render surface, identity
`ViewTransform`, and stable ordering. More advanced camera behavior arrives in
Build 116.

## Inspectors And HUD

Inspectors consume the same `AnalysisFrame` and `BandFrame` contracts but live
in the UI layer rather than the scene. The band table and dominant-band HUD are
Inspectors. The band overlay is a Visualizer. This boundary is intentional and
must remain explicit.

## ViewTransform

`ViewTransform` is the runtime-only abstraction for camera or view state passed
through the compositor render path. In Build 115 it is an identity transform
and is not persisted to presets. Build 116 adds meaningful camera controls on
top of this seam.

## Guidelines And Invariants

- **Persisted scene shape** - Build 115 persists top-level `scene`,
  `scene.nodes`, and per-node `id`, `type`, `enabled`, `zIndex`, `bounds`,
  `anchor`, and `settings`.
- **Runtime scene state is not persisted** - Live visualizer instances,
  selected node/UI state, the current `ViewTransform`, panel visibility,
  permissions, queue state, playback session state, and recording state remain
  runtime-only.
- **Do not treat inspectors as nodes** - Band tables, live readouts, and other
  inspectors belong to the UI layer, not scene composition.
- **Normalized layout** - Scene layout is expressed in normalized coordinates.
- **Independent visualizer logic** - Each visualizer owns its own transient
  simulation state.
- **Ordering matters** - The default scene keeps orbs behind the band overlay,
  and user-authored scene ordering must be preserved.

Build 115 uses this model to stabilize vocabulary and composition boundaries
before any invasive renderer or UI migration begins.
