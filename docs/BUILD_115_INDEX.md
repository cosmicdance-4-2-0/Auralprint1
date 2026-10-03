# Build 115 Document Index

This is the recommended reading order for the Build 115 document set. These
docs now describe the implemented Build 115 architecture; the phased plan
remains historical context.

1. **`BUILD_115_ARCHITECTURE.md`** - Defines the canonical vocabulary and core
   invariants.
2. **`BUILD_115_SEAM_MAP.md`** - Defines ownership seams between analysis,
   banking, rendering, inspectors, presets, and UI shell work.
3. **`BUILD_115_IMPLEMENTATION_MAP.md`** - Maps the implemented architecture to
   current owners and remaining compatibility seams.
4. **`BUILD_115_WORKSPACE_SHELL.md`** - Defines the conceptual UI shell, panel
   taxonomy, and launcher behavior.
5. **`BUILD_115_FRAME_CONTRACTS.md`** - Defines `AnalysisFrame` and `BandFrame`.
6. **`BUILD_115_VISUALIZER_CONTRACT.md`** and
   **`BUILD_115_INSPECTOR_CONTRACT.md`** - Define the consumer interfaces for
   scene content and UI instrumentation.
7. **`BUILD_115_SCENE_MODEL.md`** - Defines `Scene`, `SceneNode`,
   `Compositor`, and `ViewTransform`.
8. **`BUILD_115_SCHEMA_PLAN.md`** - Defines schema implications and migration
   expectations for persisted scene configuration.
9. **`BUILD_115_RELEASE_GATE.md`** - Records automated evidence, manual audit
   status, and the current Build 115 release verdict.
10. **`BUILD_115_PHASES.md`** - Records the phase order Build 115 followed and
   links the release-gate record.

## Quick Reference

- **Vocabulary** - `BUILD_115_ARCHITECTURE.md`
- **Seams** - `BUILD_115_SEAM_MAP.md`
- **Implementation bridge** - `BUILD_115_IMPLEMENTATION_MAP.md`
- **UI shell** - `BUILD_115_WORKSPACE_SHELL.md`
- **Contracts** - `BUILD_115_FRAME_CONTRACTS.md`,
  `BUILD_115_VISUALIZER_CONTRACT.md`, `BUILD_115_INSPECTOR_CONTRACT.md`
- **Scene model** - `BUILD_115_SCENE_MODEL.md`
- **Schema migration** - `BUILD_115_SCHEMA_PLAN.md`
- **Phase order** - `BUILD_115_PHASES.md`
