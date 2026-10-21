# Build 116 — simulation world, camera and projection

## 116B projection interface contract

116B starts from merged PR #68, exact `main` commit `1044d06771280703a7237826f181bdc537228321`. Camera state is application/runtime-only for this pass: one frozen `state.camera` snapshot, changed by `setCamera(patch)` or deterministic `resetCamera()`. CONFIG owns application camera defaults separately from Scene defaults and owns zoom limits. Presets, URLs and schema 11 retain their accepted structure.

The existing `Spaces.centerPx()` and `simToScreen(xSim,ySim)` interfaces remain. The additive `Spaces.screenToSim(xPx,yPx)` takes viewport **backing pixels**, returning world `{ x, y }`. A pure projector pair owns both directions. Positive camera rotation means counterclockwise camera orientation in the world (`+X` toward `+Y`); the translated scene receives the inverse rotation and appears clockwise in the viewport. Orb phase is independent.

For a valid zero-sized viewport the forward transform collapses to the canvas center; its inverse is undefined and returns `null`. Invalid coordinates, malformed viewports/world/camera parameters and unrepresentable results also return `null`; renderer callers skip those points. This explicitly extends the old forward interface's failure behavior, without substituting a viewport-derived world origin. No existing valid-view projection changes at the default camera. CSS-sized marks and widths continue to multiply only by DPR, provisionally through 116B; final artistic sizing and interaction decisions belong to 116C and human review.

**116A accepted in merged PR #68; 116B implemented for review, not a public release.** The 116A baseline was merged PR #67, `e88313b31d619c10e71e00630cf88c156d1012f9`. The owner explicitly authorized schema 11 and the contracts below after the initial decision-gated handoff. Build 115 (`v0.1.15`), published schema 10 and canonical artifacts remain unchanged.

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

## 116B implementation and verification

`CONFIG.camera.defaults` defines `{ x: 0, y: 0, zoom: 1, rotationRad: 0 }` outside preset-owned `CONFIG.defaults`. `CONFIG.limits.camera.zoom` supports **0.01–100**, inclusive, as a provisional numeric range. Position accepts any finite world coordinates, without world bounds. `setCamera()` accepts partial camera fields, rejects invalid fields/values atomically with `RangeError`, and freezes the replacement snapshot; finite rotation is normalized into `[0, 2π)`. `resetCamera()` restores exactly the configured default without resetting visualizers or particles. Settings resolution and preset application preserve the current camera.

`camera-projection.js` owns `worldToViewport()` and `viewportToWorld()`. Forward projection subtracts camera position, applies `R(-rotationRad)`, zoom and the 116A uniform short-side fit, then canvas-center translation and Y reversal. Both directions validate coordinates, camera, world span and viewport. Finite arithmetic that overflows or underflows the invertible scale returns `null`. Native sizing rejects malformed DPR/layout and unrepresentable backing dimensions without changing world or camera state. Round-trip tests use **1e-10 × max(1, |point coordinates|, |camera coordinates|, world reference span)** world-unit tolerance; cancellation is limited by floating-point precision at those magnitudes. This is not an absolute precision guarantee for arbitrarily large coordinates or tiny nonzero scales.

Renderer Orbs/particles, Trace and Ring continue through the same `Spaces` projection. Historical and new particles retain world coordinates; zoom never enters admission or placement. Radius/width presentation still multiplies CSS sizes only by DPR. Invalid projected points are skipped, and malformed viewport clears are skipped. RecorderEngine still captures `Renderer.getRecorderTap()`'s canonical viewport canvas; no alternate rendering/capture path was introduced. The existing world-dimension help now explains proportional geometry changes and retained trails without confirmation or history mutation.

Verified on Linux with Node `v24.19.0`, npm `11.9.0` and Python `3.12.14`: locked offline `npm ci` using the environment's supplied esbuild binary, `npm test` (**1,080 passed, one existing opt-in retention test skipped, zero failures**), `npm run build`, `python3 scripts/verify_distribution.py` and whitespace checks. Both distribution contracts passed; generated output is untracked. Build 115 canon and all historical fixtures match the accepted baseline.

Focused tests are `tests/camera-projection.test.js` and `tests/camera-integration.test.js`: 17 new cases include 675 seeded round trips in each direction; exact default-fit equality; independent/combined transforms and both zoom limits; non-square/off-world coordinates; resize/orientation/DPR; malformed, zero and overflowing projections; live Orb/Ring/analysis and particle object/coordinate invariants; emission/spacing/fractions; CSS sizes; runtime-only ownership; and canonical recorder tap.

Native Chromium **151.0.7922.173** passed both `scripts/validate-116a.cjs` and `scripts/validate-116b.cjs` against the final source and generated artifacts. Each harness exercised source, portable and hosted pages at initial DPR 1 and 2, with zero page/console errors or failed responses. The 116A regressions retain world-control validation, world URL round trips, schema-10 migration and keyboard spacing edits. The 116B harness verifies camera transforms/reset/inverse, retained history and Ring world geometry, CSS sizes, native resize/orientation/DPR-only changes, zero/malformed views and camera URL exclusion. Actual RecorderEngine exports from the two transformed source views decoded at **1400 × 1800** and **700 × 900**; portable/hosted editions played a real stereo WAV and each recorded exports decoded at **1000 × 800** (DPR 1) and **2000 × 1600** (DPR 2). All six engine captures used the canonical viewport; the selected native MIME was `video/webm;codecs=vp9,opus`. Source geometry uses deterministic injected analysis/clock values; distribution playback uses native audio. Reproduce with the external Playwright module and optional `AP_REPORT` variables documented above; no new application dependency.

## Review handoff and remaining work

116B is limited to camera ownership/mathematics, renderer integration, world-size help and focused regressions. Review rotation semantics, finite/degenerate behavior, interim zoom bounds and provisional CSS sizing. Schema 11 and migrations 2–10 retain their accepted structure. Build 115 canon and historical fixtures are unchanged; no release/canon update or merge is automatic.

**Stop at 116B.** 116C controls, pointer/keyboard semantics and final artistic camera behavior require the next review. Camera persistence remains undecided beyond this runtime-only pass. Later acceptance still needs wider browser/device and physical resize/orientation coverage, human artistic/preset review and longer recorder scenarios. Short capture checks do not establish audio/export fidelity or long-duration recording safety. Native Chromium evidence does not establish Firefox/WebKit/physical-device acceptance. Build 117 optimizations remain excluded.
