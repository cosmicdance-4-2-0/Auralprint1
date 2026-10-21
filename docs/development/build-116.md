# Build 116 — simulation world, camera and projection

**WIP 116A** (post-Release 4 / `v0.1.15`). This pass defines a pure geometry seam and a binding contract. **It does not yet decouple Orb/Ring simulation from the canvas or expose controls.** Shipped Build 115 and canonical artifacts are unchanged.

## Accepted world contract

- **World**: finite, positive width and height measured in independent *world units*. Origin is `(0, 0)`; `+X` is right and `+Y` is up. Dimensions are reference geometry, **not** clipping, collision, movement or particle-retirement boundaries; points outside the nominal rectangle remain valid.
- **Reference span**: `min(world width, world height)`. Existing Orb center fractions and Orb/Ring radius fractions can use this value in place of `min(canvas.width, canvas.height)`. Fractional coordinates are not inherently confined to the reference rectangle.
- **Camera**: position, orientation and magnification describe an observer, not world physics. Its forward/inverse transforms are downstream of simulation. A resize or camera change must not rewrite Orb positions, phase, Ring geometry, or already-emitted particle positions.
- **Viewport**: canvas backing dimensions, CSS layout and DPR define output resolution only. Recording continues to capture the rendered viewport. Geometry and viewport units must not be implicitly interchangeable.
- **Configuration ownership**: world dimensions belong to Scene preferences once interactive; their first persisted form requires **preset schema 11** plus CONFIG defaults/limits, normalization, legacy migration, codec, UI and serialization coverage. The camera's persistence policy is a separate 116 decision. Do not change schema 10 in place.

## Stages

1. **116A contract**: pure `core/world-geometry.js` validating world reference dimensions, deriving reference span and projecting existing normalized Orb offsets/radii into world units. Tests include out-of-world coordinates. No runtime hookup yet.
2. **116A integration**: explicitly-owned world state; Orb and Ring geometry must stop reading canvas dimensions. Resolve initial Build 115 visual-framing compatibility. Existing pixel-valued particle controls need an explicit fixed-world conversion before camera zoom is enabled.
3. **116B**: forward/inverse projection, pan/zoom/rotation and viewport/DPR tests. No simulation mutation.
4. **116C**: CONFIG-owned world settings, camera controls and chosen persistence; complete schema-11 rollout and legacy migration.
5. **116D**: browser, resize/orientation, real presets, trails, recording and portable/hosted acceptance.

## Existing coupling to remove during integration

- `Orb.step()` and `Renderer.drawSpectralRing()` calculate geometry from `min(state.widthPx, state.heightPx)`.
- `Spaces.simToScreen()` only centers and flips the simulation Y coordinate.
- `TrailSystem.updateAndEmit()` checks world-position deltas against `minPlacementDistancePx * dpr` — this **must not** become camera-dependent by accident.
- Particle/Trace/Ring presentation sizes currently use canvas device-pixel units. Their response to camera zoom needs an explicit contract.
- `resizeCanvasToDisplaySize()` owns the physical backing store; its resizing responsibilities remain distinct from world geometry.

**Deferred design decisions:** world defaults/ranges in CONFIG, legacy initial framing, aspect-ratio behavior, exact pixel-vs-world presentation semantics, whether camera state is persisted, and whether to permit panning beyond the nominal world (the world itself imposes no automatic boundary). Decide each before wiring it into a shipped contract.

**Definition of Done for this foundation pass:** static pure module and unit tests; roadmap and agent policy aligned; no runtime, schema, CI, canon artifacts or shipped behavior changed. A passing build verifies only that this inactive foundation is safe to stage, not that the world/viewport divorce is finished.
