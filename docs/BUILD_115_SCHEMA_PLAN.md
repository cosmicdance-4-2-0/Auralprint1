# Build 115 Schema Plan And Migration

## Overview

Build 115 reorganizes Auralprint's visual system around a formal `Scene` model
and a unified `Visualizer` framework. To preserve backward compatibility, Build
115 defines Schema 9 as the target preset shape and documents the migration path
from Schema 8 and earlier presets.

Schema 9 is the active runtime preset format. The current runtime declares
`PRESET_SCHEMA_VERSION = 9` and ships migration code that carries Schema 8 and
earlier presets forward into the scene model.

## Schema Versioning

The user-facing app version is separate from the preset schema version. In the
current Build 115 runtime, the active schema version is 9.

All presets should include a `schema` field. If a preset omits it, the loader
assumes schema 1 and migrates forward step by step until the active schema.

## Persisted Shape In Schema 9

Schema 9 introduces a top-level `scene` object whose required Build 115 surface
is:

- `scene`
- `scene.nodes`
- per-node `id`
- per-node `type`
- per-node `enabled`
- per-node `zIndex`
- per-node `bounds`
- per-node `anchor`
- per-node `settings`

Runtime-only state, including live visualizer instances, selected node/UI state,
`ViewTransform`, panel visibility, permissions, queue state, playback session
state, and recording state, is excluded from persistence.

On import, persisted `scene.nodes[].zIndex` is authoritative for ordering. On
save, export, and share, scene nodes are written back in canonical array order
with sequential `zIndex` values.

## Key Changes In Schema 9

1. **`orbs` becomes a visualizer type** - Orb configuration moves under scene
   configuration as a `SceneNode` with `type: "orbs"`.
2. **Band overlay becomes a visualizer type** - Overlay configuration becomes a
   `SceneNode` with `type: "bandOverlay"`.
3. **`scene` becomes a top-level scene object** - Presets persist a `scene`
   object that contains a `nodes` array of `SceneNode` data. This keeps the
   canonical `Scene` concept intact instead of reducing it to a raw array.
4. **Legacy visual fields move under node settings** - Orb and overlay fields
   that previously lived at the preset root move into `scene.nodes[].settings`.
5. **Band configuration remains top-level** - Banking configuration stays
   outside the scene and is shared by visualizers and inspectors.
6. **Persist configuration, not live runtime state** - Presets persist scene
   configuration such as node order, enabled state, bounds, anchor, and
   settings. Runtime-only state such as live visualizer instances, selected node
   UI, `ViewTransform`, panel visibility, permissions, queue state, playback
   session state, and recording state is not persisted.

## Old Location Of Orb And Overlay Settings

In Schema 8 and earlier, orb and overlay settings lived at the preset root:

```json
{
  "orbs": { "...": "..." },
  "overlay": { "...": "..." }
}
```

## New Location In Schema 9

In Schema 9, those settings move under the top-level `scene` object:

```json
{
  "scene": {
    "nodes": [
      {
        "id": "orbs-1",
        "type": "orbs",
        "enabled": true,
        "zIndex": 0,
        "bounds": { "x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0 },
        "anchor": { "x": 0.5, "y": 0.5 },
        "settings": { "...": "legacy orb settings" }
      },
      {
        "id": "overlay-1",
        "type": "bandOverlay",
        "enabled": true,
        "zIndex": 1,
        "bounds": { "x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0 },
        "anchor": { "x": 0.5, "y": 0.5 },
        "settings": { "...": "legacy overlay settings" }
      }
    ]
  }
}
```

## Migrating From Schema 8 To Schema 9

1. **Copy unchanged fields** - Start from canonical Schema 9 defaults, then
   overlay valid non-visual fields from the incoming preset.
2. **Ensure `scene` exists** - Create a top-level `scene` object with a `nodes`
   array if one is missing.
3. **Migrate orbs** - If the old preset contains `orbs`, create a `SceneNode`
   with `id: "orbs-1"`, `type: "orbs"`, `enabled: true`, `zIndex: 0`,
   full-surface bounds, centered anchor, and the old orb settings moved into
   `settings`.
4. **Migrate overlay** - If the old preset contains `overlay`, create a
   `SceneNode` with `id: "overlay-1"`, `type: "bandOverlay"`, `enabled: true`,
   `zIndex: 1`, full-surface bounds, centered anchor, and the old overlay
   settings moved into `settings`.
5. **Ensure a default scene** - If neither `orbs` nor `overlay` existed, create
   the canonical default scene described in the scene model document.
6. **Remove legacy root fields** - Remove the old root-level `orbs` and
   `overlay` fields after they have been migrated.
7. **Set `schema` to 9** - Mark the migrated preset with the new schema value.

### Migrating Earlier Versions

Presets older than Schema 8 should first pass through the existing migration
path into Schema 8, then apply the Schema 9 steps above.

## Non-Goals And Future Work

- **Schema rollout timing** - Schema 9 is now live. Future schema work should
  extend it only when a new persisted capability is required.
- **Camera settings** - Schema 9 does not persist `ViewTransform`. Camera data
  is deferred to a future schema once Build 116 defines it.
- **Scene manipulation UX** - Schema 9 persists scene layout data, but the UI
  for interactive node movement and resizing remains a later phase.
- **Third-party visualizers** - Schema 9 does not introduce plugin-defined
  visualizer types.

Schema 9 preserves preset compatibility while aligning persisted visual
configuration with the Build 115 scene model.
