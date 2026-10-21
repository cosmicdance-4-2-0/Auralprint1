# Build 116 — simulation world, camera and projection

**116A integration implemented for review in PR #68; not a public release.** Baseline: merged PR #67, `e88313b31d619c10e71e00630cf88c156d1012f9`. The owner explicitly authorized schema 11 and the contracts below after the initial decision-gated handoff. Build 115 (`v0.1.15`), published schema 10 and canonical artifacts remain unchanged.

## Accepted 116A contract

- World dimensions are positive finite reference geometry in independent **world units**. Origin is `(0,0)`, `+X` right, `+Y` up. They impose no clipping, collision, movement restriction or particle-retirement boundary. Coordinates beyond the nominal rectangle remain valid.
- Reference span is `min(world.widthUnits, world.heightUnits)`. Orb center offsets, Orb/Ring radii and waveform displacement use this span. Orb numeric runtime fields are now `baseRadiusUnits` and `radialDispUnits`; `xSim`/`ySim` retain their names.
- Default world is **1000 × 1000 units**. CONFIG owns per-axis limits **1–1,000,000**, accepts finite fractions without rounding, and supplies missing/invalid axis values independently. Finite out-of-range preset values clamp; number controls reject invalid/out-of-range drafts without committing. Limits constrain configuration, not coordinates.
- Compatibility framing is centered and aspect preserving: backing pixels per world unit = `min(viewport.widthPx, viewport.heightPx) / world.referenceSpanUnits`. `Spaces.simToScreen()` applies this one scale and flips Y. The shorter world reference fills the shorter viewport dimension; the nominal world rectangle need not fit completely. A zero-sized viewport has zero scale and does not initialize or change the world.
- Particle placement uses `particles.minPlacementDistanceUnits` (default **0.5**, range **0–10**, UI step **0.1**). Zero disables filtering. Same-Orb retained-tail distance is compared entirely in world units; viewport size, DPR and presentation scale never enter admission. Expiry, budgets, fairness and fractional emission progress retain their existing ownership.
- Particle radii, Trace widths, Ring line widths and Ring point sizes remain CSS-screen-sized for 116A, multiplied only by DPR. **Their behavior under future camera zoom is undecided.** No camera state, controls, inverse transform or persistence is introduced.

## Ownership and settings changes

`CONFIG.defaults.world` → `preferences.world` → normalized `runtime.settings.world` → frozen `state.world` follows the existing hierarchy. `normalizeWorldSettings()` is shared by the codec and settings resolver. `resolveSettings()` alone initializes/synchronizes the descriptor through the pure `createWorldGeometry()` foundation; equal dimensions preserve its identity across unrelated settings changes. There is no viewport-derived default or second world owner.

Settings → **Simulation World** owns width/height number controls, CONFIG-driven bounds, explicit units, help and inline accessible errors. Orb editors and Bulk Edit own the renamed placement setting and report world units. URL application still replaces preferences only; its caller owns resolution and subsystem synchronization.

An explicit world edit changes proportional geometry on the next Orb update and Ring draw. It preserves surviving Orb/adaptor/particle objects, live phase, retained coordinates and fractional emission progress. Already-emitted particles stay at their original world coordinates; they are not rescaled, clipped or cleared. Visual pause retains its existing behavior. Resize/orientation/DPR changes affect only backing resolution and presentation; zero-motion updates do not rewrap phase and introduce rounding drift.

`AnalysisFrame`, `VisualizerRuntime` lifecycle/frame interfaces and the public `Spaces.centerPx()` / `simToScreen(xSim,ySim)` signatures remain intact. Ring phase/analysis/composition ownership is unchanged. The trailing DPR argument to `TrailSystem.updateAndEmit()` is retired; JavaScript direct callers supplying an extra argument cannot influence world-unit spacing. Renderer/recording still use the canonical viewport canvas.

## Schema 11 and compatibility

Schema 11 encodes root `world { widthUnits, heightUnits }` and per-Orb `particles.minPlacementDistanceUnits`. The retired `minPlacementDistancePx` alias, world descriptor metadata, camera/session state and other unknown fields do not enter output. A separate complete non-default schema-11 fixture covers the canonical field inventory; the original schema-10 and historical fixtures remain untouched.

All previously supported schemas **2–10** still decode. Existing legacy distribution, repeat, band-name/ID, designed-phase and global-to-per-Orb migrations are preserved, including both historical schema-9 layouts and top-level precedence. Migration supplies CONFIG world defaults because those schemas did not define independent world dimensions. Their pixel-valued placement distance converts at the approved fixed **one world unit per reference CSS pixel**, with legacy missing/invalid values receiving 0.5 and finite values retaining the established clamp. Schema-11-only fields injected into older payloads are ignored. Schema 11 does not reinterpret the retired pixel alias as a current field. Input objects are never mutated.

Default-fit center/radius/waveform framing matches Build 115's fraction formulas; screen presentation sizes retain CSS-pixel sizing. **Placement density intentionally differs away from the 1000-CSS-pixel reference viewport span.** For default spacing 0.5, its apparent distance at viewport spans 800, 1000 and 2000 CSS pixels is 0.4, 0.5 and 1 CSS pixels, respectively. Changing world span also changes the displayed distance while world admission remains fixed. Exact legacy admission at every viewport size is not promised. No persisted simulation history exists to migrate; within the integrated runtime, retained history stays in world units.

## Regression and distribution evidence

Local Linux verification used Node `v24.19.0`, npm `11.9.0` and Python `3.12.14`:

```sh
npm ci
npm test
npm run build
python scripts/verify_distribution.py
```

Result: **1,063 passed, one skipped, zero failures**. The skip is the existing opt-in full 1,048,576-particle retention test. Build and portable/hosted packaging verification passed; generated outputs remain untracked. Build 115's `docs/Canon/0.1.15` tree matches accepted commit `79c7979bba9d60622f84194eb9709cbc6c9a1008`.

Focused evidence:

- `tests/world-geometry.test.js`: pure reference dimensions, immutability, overflow/failure cases and out-of-reference coordinates.
- `tests/world-settings.test.js` and `tests/preset-schema-11.test.js`: CONFIG normalization, independent axes, complete canonical round trips, unchanged schema-10 fixture conversion, all legacy schemas, sanitation, alias stripping, URL replacement and unsupported-version rejection.
- `tests/world-integration.test.js`: Orb centers/reversed radii/energy/waveforms; actual Ring draw geometry; resize/orientation/DPR-only changes and zero layout followed by update/render; unchanged world/phase/coordinates/history identities; identical placement decisions; world edits and zero/N Orb reconciliation; default and migrated legacy framing; CSS presentation sizes.
- `tests/scene-panel.test.js`, Orb editor and existing lifecycle/resource tests: validated UI commits, accessible units/errors, invalid drafts, preset replacement, focus/listener reuse, retained history, TTL/budgets/fairness and pause.

Optional native regression (Playwright/Chromium are environment tooling, not new dependencies):

```sh
AP_PLAYWRIGHT_MODULE=/path/to/playwright AP_REPORT=/path/to/report.json node scripts/validate-116a.cjs
```

Chromium **151.0.7922.173** passed actual source boot/callback/UI checks at initial DPR 1 and 2, with native CSS resize, orientation and DPR changes in both directions preserving live Orb/particle identities, coordinates and phase. Public world controls and schema-10 fixture import/re-encoding passed. Both built portable and hosted editions passed world URL round trips, native keyboard placement edits and short native canvas video capture at the backing resolution (1000 × 800 at DPR 1; 2000 × 1600 at DPR 2), with no page/console errors or failed responses. Deterministic source geometry checks inject analysis/clock values and freeze automatic scheduling; distribution checks use the actual bundle and native drawing/capture.

## Review handoff and remaining work

PR #68 contains separate schema/units, world geometry, world UI, native regression and handoff commits after the initial findings commit. Review schema-11 ownership/migration and the documented placement-density tradeoff before accepting this foundation. No merge, release/canon update or subsequent build work is automatic.

**116B remains unimplemented:** forward/inverse camera transforms, pan/zoom/rotation, controls, camera movement policy and explicit zoom behavior for CSS-sized marks/widths. Camera persistence requires its own decision before any implementation; no policy is inferred by 116A. Later Build 116 acceptance still needs wider browser/device and physical resize/orientation coverage, human artistic/preset review and longer recorder scenarios. The short canvas-capture check is not an audio/export-fidelity or long-duration recording claim. Native Chromium evidence does not establish Firefox/WebKit/physical-device acceptance. Build 117 optimizations remain excluded.
