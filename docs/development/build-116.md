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

## 116A integration handoff — awaiting decisions

PR #67 merged at `e88313b31d619c10e71e00630cf88c156d1012f9`; this is the verified integration baseline on `main`. Release 4 / Build 115 (`v0.1.15`) remains shipped and immutable. **Runtime integration is blocked, not implemented.** The findings below come from source inspection and numerical execution against that baseline.

### Current implementation and risks

| Owner | Verified behavior | Integration requirement |
| --- | --- | --- |
| `core/world-geometry.js` | Frozen positive finite dimensions, reference span `min(width,height)`, fraction/point conversion without clipping; no production imports | Reuse this module with explicitly owned dimensions; test values are not approved defaults |
| `core/config.js`, `core/preferences.js`, `core/state.js` | No world configuration or world state; preferences clone CONFIG defaults and `resolveSettings()` derives active settings | Do not introduce a state-only world default, capture the first canvas size as the world, or bypass the preferences pipeline |
| `render/orb.js` | Radius, waveform displacement and center offsets use the backing-store reference span on every step; `baseRadiusPx`/`radialDispPx` are actually simulation distances | Convert all fraction-derived geometry together; name the resulting units explicitly and update numeric consumers |
| `render/renderer.js` | Ring radii and waveform displacement use backing dimensions during drawing; Ring phase is owned by its runtime participant | Use the same world reference as Orbs without changing phase, analysis consumption or composition order |
| `core/spaces.js` | `Spaces` exposes only `centerPx()` and `simToScreen(xSim,ySim)`; projection centers/flips Y with no scale or inverse | Keep these callers intact; an approved presentation scale must apply equally to current geometry and retained history |
| Canvas sizing | CSS size × current DPR is floored into the backing store; sizing runs on resize and every animation callback | Keep backing-store/DPR updates separate from world initialization and simulation; cover DPR-only changes and zero-sized layout |
| Particle placement | `TrailSystem.updateAndEmit()` compares retained-tail distance against `minPlacementDistancePx * current DPR` | Resolve a fixed pixel-to-world conversion before removing the DPR dependency; retain zero-spacing behavior, expiry order, fractional emission progress and governor fairness |
| Particle presentation | Particle radii, Trace widths, Ring widths and Ring point sizes multiply configured pixel values by DPR | Decide screen-size semantics separately from placement-distance semantics |
| Reconciliation/history | ID-based reconciliation keeps surviving Orb objects, adapters, phase, trails and emission progress; resize does not rewrite stored particles | Do not rebuild Orbs, reset trails or rescale existing particles on resize; preserve particle objects/coordinates and stable IDs |
| Presets | The published codec uses schema 10 and seeds sanitation from CONFIG defaults | New Scene defaults can leak into encoded presets even without a new explicit encoder branch; complete schema 11 is required before adding persistent world dimensions |

Resize itself updates the backing store, not Orb fields. The next Orb step recomputes its position even with zero elapsed time; Ring drawing recomputes its geometry immediately. Existing trails therefore retain coordinates in the old backing-pixel scale while new geometry uses the new scale. No world-bound collision or retirement behavior was found in these paths; normal viewport visibility is not a simulation boundary.

### Decisions required before runtime changes

The assignment excludes schema migration in this pass and requires the canonical CONFIG → preferences → runtime settings → state pipeline. With no approved world defaults or pixel conversion, there is no supported source for independent production dimensions yet. A nonpersisted duplicate owner or an unversioned field in schema 10 would bypass these contracts. **Recommendation: keep runtime hookup blocked until the ownership/schema prerequisite is explicitly authorized.** Do not begin that prerequisite automatically.

The following is a concrete proposal for review, **not an accepted contract or an implemented default**:

| Decision | Recommendation and observable consequence |
| --- | --- |
| World defaults | Start with a fixed `1000 × 1000` world-unit reference in CONFIG, eventually normalized through Scene preferences under schema 11. The number is a proposed reference scale, not a dimension inferred from the foundation tests or canvas. Configurable ranges and UI increments still require the later settings design. |
| Initial/legacy framing and aspect ratio | Use a centered uniform presentation fit: backing pixels per world unit = `min(viewport widthPx, viewport heightPx) / world.referenceSpanUnits`. Preserve aspect ratio, expose extra world area along the longer viewport axis, and impose no world clipping. This preserves Build 115's fraction-based Orb/Ring framing, including existing center offsets. The minimal `Spaces` scale is for compatibility; pan, zoom, rotation, inverse transforms and controls remain later work. A zero-sized viewport renders nothing and does not initialize or modify the world. |
| Placement distance | Convert each legacy CSS-pixel spacing value at a fixed `1 world unit per reference CSS pixel`; compare entirely in world units. No current viewport, DPR or future camera value participates in admission. This changes apparent spacing away from a 1000-CSS-pixel viewport reference span and needs explicit semantic/migration approval. |
| Presentation sizes | Keep particle radii, Trace/Ring widths and Ring point sizes in CSS screen pixels, multiplying only by DPR. They do not scale with the proposed fit or a future camera zoom. |
| History and interfaces | Preserve Orb/particle identities and stored coordinates within the integrated runtime. There is no persisted simulation-history migration because presets contain configuration only. Keep `AnalysisFrame`, `VisualizerRuntime` lifecycle and existing `Spaces` public call signatures unchanged; no necessary interface break has been demonstrated. |

There is a real compatibility tradeoff: legacy spacing `p` has fraction-of-span threshold `p / viewportSpanCss`. Fixed-world spacing has threshold `p / 1000` under the proposal. With `p = 0.5`, the displayed distance becomes `0.4`, `0.5`, or `1` CSS pixels at viewport spans of `800`, `1000`, or `2000` CSS pixels. Exact legacy placement decisions at every viewport size cannot coexist with this fixed-world conversion. Capturing an initial viewport-derived conversion would introduce a different, explicitly viewport-dependent simulation initialization policy and is not recommended. Camera persistence remains undecided and is not needed for this pass.

### Implementation sequence after approval

1. Separately authorize and complete the Scene ownership/schema-11 prerequisite, including approved CONFIG defaults/limits, normalization, supported-schema decoding/migration, encoding, round trips and all required UI/serialization owners. Do not change schema 10 or start this work from the present handoff.
2. On the accepted baseline, derive a frozen world descriptor through `createWorldGeometry()` from resolved settings. Define initialization and settings-sync ownership explicitly; viewport resizing cannot replace the descriptor or alter simulation state.
3. Migrate Orb radius, displacement and centers, plus Ring radius/displacement, to world units in a focused geometry commit. Preserve reversed-radius safety, energy/waveform selection, designed/live phase behavior, lifecycle order and ID-based reconciliation. No camera controls or Build 117 changes.
4. Apply the approved placement conversion and compatibility-only `Spaces` scale in a separate commit. Keep CSS presentation sizes explicit. Preserve retained objects, fractional emissions, TTL/retention behavior and existing direct-caller contracts unless a necessary change is documented.
5. Add focused regression coverage: pure world failures/out-of-reference points; Orb centers/radii/waveforms; actual Ring draw coordinates; real CSS resize, orientation and DPR-only changes followed by update/render; unchanged phase, positions, Ring world geometry, retained coordinates/identities and admission decisions for identical world inputs. Exercise zero/N Orbs, reconciliation, pause, exact/below/above spacing, zero spacing, schema-10/legacy inputs under the approved migration, and reference-size visual compatibility. Recording continues to capture the rendered viewport.
6. Run locked install, tests, build and both packaging verifications on the implementation head. Add browser evidence for resize/DPR/history, real presets and capture before claiming interactive/visual compatibility. Keep changes in this one review branch/PR; stop for review before 116B or any further scope.

### Verification at the handoff

On Linux with Node `v24.19.0`, npm `11.9.0`, and Python `3.12.14`, the unchanged runtime baseline passed `npm ci`, `npm test` (1,045 passed, one skipped, zero failures), `npm run build`, and `python scripts/verify_distribution.py`. Generated outputs remain untracked. The canonical `docs/Canon/0.1.15` tree is unchanged from accepted Build 115 commit `79c7979bba9d60622f84194eb9709cbc6c9a1008`.

A direct Node probe used actual `resizeCanvasToDisplaySize()`, `Orb.step()`, `Renderer.drawSpectralRing()`, `Spaces.simToScreen()` and `TrailSystem.updateAndEmit()` with a stub canvas/context. Orb phase/speed were zero, center fractions `(0.1,0.2)`, Orb and Ring radius fractions both `0.25`, waveform displacement zero, and automatic Orb emission disabled:

| CSS viewport | DPR | Orb radius | Orb simulation point | Ring radius |
| --- | --- | --- | --- | --- |
| 1000 × 800 | 1 | 200 | (280,160) | 200 |
| 1200 × 1000 | 1 | 250 | (350,200) | 250 |
| 1200 × 1000 | 2 | 500 | (700,400) | 500 |

The same retained particle object at `(5000,-6000)` survived every resize and zero-delta step without coordinate changes or boundary retirement. Separately, a same-Orb candidate at simulation distance `0.75` with configured spacing `0.5` emitted at DPR 1 and was suppressed at DPR 2. These assertions demonstrate the present coupling and history mismatch; they do not verify a fix. The five existing world-geometry tests validate only the pure foundation. No new runtime behavior, integration regression tests, browser, Windows, recording, or artistic compatibility result is claimed by this documentation-only handoff.
