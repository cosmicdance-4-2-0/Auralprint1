# Build 116 — simulation world, camera and projection

## 116B projection interface contract

116B starts from merged PR #68, exact `main` commit `1044d06771280703a7237826f181bdc537228321`. Camera state is application/runtime-only for this pass: one frozen `state.camera` snapshot, changed by `setCamera(patch)` or deterministic `resetCamera()`. CONFIG owns application camera defaults separately from Scene defaults and owns zoom limits. Presets, URLs and schema 11 retain their accepted structure.

The existing `Spaces.centerPx()` and `simToScreen(xSim,ySim)` interfaces remain. The additive `Spaces.screenToSim(xPx,yPx)` takes viewport **backing pixels**, returning world `{ x, y }`. A pure projector pair owns both directions. Positive camera rotation means counterclockwise camera orientation in the world (`+X` toward `+Y`); the translated scene receives the inverse rotation and appears clockwise in the viewport. Orb phase is independent.

For a valid zero-sized viewport the forward transform collapses to the canvas center; its inverse is undefined and returns `null`. Invalid coordinates, malformed viewports/world/camera parameters and unrepresentable results also return `null`; renderer callers skip those points. This explicitly extends the old forward interface's failure behavior, without substituting a viewport-derived world origin. No existing valid-view projection changes at the default camera. CSS-sized marks and widths continue to multiply only by DPR, provisionally through 116B; final artistic sizing and interaction decisions belong to 116C and human review.

**116A and 116B accepted in merged PRs #68/#69; 116C implemented for owner artistic evaluation, not a public release.** The 116A baseline was merged PR #67, `e88313b31d619c10e71e00630cf88c156d1012f9`. The owner explicitly authorized schema 11 and the contracts below after the initial decision-gated handoff. Build 115 (`v0.1.15`), published schema 10 and canonical artifacts remain unchanged.

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

## 116C interactive camera

Baseline: PR #69 merged at `bb1ed1c112d2006e1678f71d169db81729ba5e18`. The branch also includes the owner's subsequent version-only correction `c57eac01f601c16e2bd7e62d8bd218e00e383724`; this preview is `v0.1.16c`.

In the accepted 116C baseline, Settings → **Viewport Camera**, adjacent to Simulation World, owned X/Y in world units, numeric zoom, rotation in degrees, view-direction pan buttons, zoom/rotation buttons, Reset Camera and the canvas-mode checkbox. Controls reflect `state.camera`, work stopped/paused/running with zero Orbs, and call `setCamera()`/`resetCamera()` through focused UI/action modules. Finite positions remain unbounded. Numeric controls reject malformed/nonfinite/out-of-range drafts with inline accessible errors; `step=any` and no-op degree edits preserve valid precision. Arrow Up/Down in these fields adjusts the valid draft using CONFIG steps.

`CONFIG.camera.interaction` owns the provisional choices: **50 world units** per pan, **1.1×** per zoom action, **5°** per rotation action, wheel exponential coefficient **0.0015 per CSS pixel**, and **16 CSS pixels** per line-mode wheel unit (page mode uses the real canvas rectangle height). Existing zoom bounds remain **0.01–100**; large wheel deltas reach exact endpoints. These values and the current sizing policy require human evaluation, not artistic approval by tests.

Canvas camera mode is **off by default** and runtime-only. A primary single-pointer drag grabs the displayed world; pan controls instead move the camera in view-relative directions. Both invert the actual projection, including rotation/zoom. Client positions map through the real bounding rectangle to backing pixels, without clamping captured positions outside the canvas. Pointer capture, matching IDs, release/cancellation/lost capture, missing primary button, canvas/window blur, hidden document and mode exit terminate drag state. Fresh drags recover without reloading. Wheel zoom holds the pointer's world position using an atomic camera update. Mode-off pointer/wheel events, modified browser gestures, panel inputs, scrubber and audio drop ownership retain their existing paths. Active-mode touch uses the same primary-pointer path with `touch-action:none`; multi-touch pinch/rotation is deferred.

All buttons/inputs support native Tab, Enter and Space behavior. With the canvas focused in camera mode, arrows pan, `+`/`−` zoom, `[`/`]` rotate the camera clockwise/counterclockwise, Home resets the camera, and Escape disables the mode. Local keys prevent default and stop propagation; the global handler also respects consumed events. H/Space/R/N/P retain panel/pause/visual-reset/transport ownership. Ctrl/Alt/Meta shortcuts are unclaimed. Reset Camera affects only camera state; Reset Visualizers retains simulation reset behavior and preserves the camera. Preset application preserves the camera; camera/mode remain absent from Scene preferences, schema 11, URLs and shared links.

Orb/Ring geometry and particle positions transform with zoom. Particle radii, Trace widths, Ring widths and Ring point sizes remain CSS-screen-pixel sized. Particle admission remains world-based and camera-independent. No simulation coordinates/history, analysis, rendering mode or recorder ownership changes were introduced.

Validation on Linux, Node `v24.19.0`, npm `11.9.0`, Python `3.12.14`: **1,095 tests passed, one existing opt-in million-particle retention test skipped, zero failures**; build, distribution verification and whitespace checks passed. The environment used cached locked npm packages with lifecycle scripts disabled and its matching supplied esbuild binary. Build 115 canon and historical preset fixtures are unchanged. New control/action/lifecycle tests and deterministic running/paused Orb comparisons cover precision, malformed values, view-relative pan, anchored zoom/limits, listener reuse, capture failure/recovery, retained object identities, world positions, phase, spacing decisions and emission fractions. Existing schema-11 and legacy schema-10/all-supported-schema tests remain passing.

Native Chromium **151.0.7922.173** passed `validate-116a.cjs`, `validate-116b.cjs` and `validate-116c.cjs` across source, portable and hosted pages at initial DPR **1 and 2**, with zero page/console errors or failed responses. 116C exercises keyboard tab/actions, live readouts/errors, rotated captured drags beyond CSS-scaled bounds, cancellation/focus/toggle recovery, pointer-centered wheel, exact zoom limits, layout/orientation/DPR changes, emulated single touch, zero/one/two Orbs, pause/seek/panel/transport priority, native File/DataTransfer audio drops with mode on/off, playback and stopped controls. Six 116C RecorderEngine exports decoded at canonical backing dimensions: source **1400×1800 / 700×900**, distributions **1000×800 / 2000×1600**. Decoded source video frames match each of two displayed camera views more closely than the other view, confirming movement appears in capture.

Build and preview from the repository root:

```sh
npm ci
npm test
npm run build
python3 scripts/verify_distribution.py
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/auralprint_0.1.16c.html` (portable), or `http://localhost:8000/hosted/` (hosted). For optional native checks, supply an external Playwright module and Chromium executable, e.g. `AP_PLAYWRIGHT_MODULE=/path/to/playwright AP_CHROMIUM_PATH=/path/to/chromium node scripts/validate-116c.cjs`; `AP_REPORT` optionally saves JSON. No browser dependency was added to the app.

Owner sequence: load music; open Settings → Viewport Camera; edit X/Y, zoom and rotation, then pan at 90°. Enable camera mode, drag beyond canvas edges and wheel at an off-center particle. Tab through controls; focus the canvas and try arrows/+/−/brackets/Home/Escape, then confirm mode-off arrows seek. Compare Space-pause and audio pause/Stop while moving the view. Drop another audio file, move the camera during a short recording, and inspect the export. Compare Reset Camera with Reset Visualizers; apply/share a preset and confirm the view is retained locally and excluded from the link.

**116C baseline handoff:** owner artistic evaluation was next; 116D/final compatibility and release acceptance require review. Remaining decisions are step feel, rotation semantics and provisional screen-sized marks. Camera persistence remains undecided beyond this pass. Firefox/WebKit, assistive-technology users, physical touch/orientation/DPR changes, OS-level file dragging, direct `file://` launch, fully offline operation, long recordings and audio/export fidelity were not validated here. Chromium policy blocks `file://` navigation in this environment; portable HTTP usage passed. Blur/cancel signals are injected during native captured drags, and touch/orientation/DPR use browser emulation. No Build 117 work or public release/canon update is included.

## 116C.A Camera workspace and continuous control

Baseline: PR #71 is merged; current `main` and branch base are **`5ee433bdc13a1f8abf07d8bc3a73dc9d11ed18dc`**. Its accepted tested head is `8cc6e60aac0e44a1f4fff4c411d7387bbfea1da8`. The dedicated branch is `codex/116ca-camera-workspace`; WIP version is **`v0.1.16c.a`**. Build 115 canon, historical fixtures and preset schema 11 are unchanged.

**Camera** in the bottom workspace launcher now owns the existing view controls, mode/status, runtime pan/rotation speeds, **Focus canvas for camera controls**, and a control reference. Settings retains Simulation World and Scene preferences. The workspace owner handles independent visibility, stacking, launcher collapse, focus recovery and H snapshots. Hiding Camera preserves its view, mode, audio and speeds. Camera clears the Audio dock at every viewport size; scroll the panel or independently hide Audio when vertical space is limited.

With camera mode enabled and canvas keyboard focus, hold **W/S** forward/back, **A/D** strafe, **Q/E** counterclockwise/clockwise camera rotation, and **Shift** to boost both. Combinations translate and turn together; diagonal translation is normalized. Arrows, +/−, brackets, Home and Escape retain their 116C actions. H, Space, R, N/P and mode-off seeking keep their existing owners. Native controls, scrubber, recording and audio drops do not acquire movement keys.

`CONFIG.camera.keyboard` owns provisional defaults **320 CSS pixels/second**, **60 degrees/second**, **3× Shift**, and the **0.1-second inclusive** camera frame threshold. `CONFIG.limits.camera` owns speed bounds/increments: pan **0–3200, step 20**; rotation **0–360, step 5**. Speeds are session controls, excluded from Scene preferences, URLs and storage. Reset Camera preserves speeds. Existing discrete action steps remain 50 world units / 5° / 1.1×.

The existing animation callback calls `cameraInteraction.tick()` before rendering, independently of playback, simulation pause and Orb count. Key events track held state; repeats do not advance the view. The active projection fit, zoom and cached CSS/backing ratios convert screen velocity to world translation. The analytic turning integral makes combined translation/rotation coherent across frame intervals, with one validated camera replacement per active frame. No extra animation loop or per-tick layout queries were added. Key release, canvas/window blur, hidden documents, lost focus, mode exit, invalid/nonpositive time and intervals above 0.1 seconds discard held input; press again after interruption. No movement debt is retained.

Focused numeric drafts survive external camera replacement. Hidden Camera controls skip refresh; visible updates synchronize existing values/readouts without rebuilding controls. Camera frames no longer invalidate Settings or panel tooltips; tooltips refresh on reveal, focus, hover and editing. Forward/inverse transforms, world geometry/history, CSS-sized marks, analysis, particle admission and RecorderEngine's canonical viewport remain unchanged.

### Validation

The tested runtime implementation is `1718d57a28094b0ff65c374852cabaffa7b87d7a`; validation scripts and this handoff are separate follow-up commits. Focused tests cover key state, frame intervals (120/60/20/10 Hz plus mixed intervals), exact simultaneous movement/turning, diagonals, view axes, zoom/world/DPR/CSS scaling, boosts, interruption, speed validation, focus and UI ownership. Full validation: `npm test -- --test-concurrency=2` passed **1,110 tests**, with one existing opt-in million-particle retention test skipped and zero failures. `npm run build`, `python3 scripts/verify_distribution.py` and whitespace checks passed. Build 115 canon and historical preset fixtures match the baseline.

Linux Chromium **151.0.7922.173** passed `validate-116a.cjs`, `validate-116b.cjs`, the Camera-adapted `validate-116c.cjs`, and new `validate-116ca.cjs` across source, portable and hosted at DPR **1 and 2**, with no page/console errors or failed responses. The 116C.A harness samples actual native held keys over real animation frames: 54 pan probes measured approximately **320 CSS pixels/second**, including 0°/90°/180°/37.5°, zoom 0.01/1/100, diagonals, Shift **960**, edited speed **160**, Q/E and combined translation/rotation. It checks focus/visibility/mode cancellation, panel state/focus, numeric drafts, shortcuts/seeking/drop ownership, stopped/playing/paused and zero/one/two Orbs, viewport/DPR resize and narrow/short layouts. Mutation probes found zero tooltip/element changes during visible movement and zero Camera control/text/tooltip writes while hidden. Six moving-camera RecorderEngine exports decoded at canonical **1000×800** (DPR 1) or **2000×1600** (DPR 2); MIME was `video/webm;codecs=vp9,opus`. Prior 116B/C video-content and projection regressions also passed.

Reproduce the new native checks with external tooling: `AP_PLAYWRIGHT_MODULE=/path/to/playwright AP_CHROMIUM_PATH=/path/to/chromium AP_REPORT=/path/to/report.json node scripts/validate-116ca.cjs`. No application dependency was added. Browser evidence is Linux Chromium over local HTTP; Firefox/WebKit, direct `file://`, physical devices, assistive-technology users and OS file dragging remain unverified. Cancellation lifecycle signals are additionally injected; touch/DPR/orientation use emulation in prior harnesses. Short exports establish viewport capture behavior, not long-duration safety or audio fidelity.

### Preview and owner check

```sh
npm ci
npm test
npm run build
python3 scripts/verify_distribution.py
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/auralprint_0.1.16c.a.html` or `http://localhost:8000/hosted/`.

1. Load music; launch Camera, enable camera mode, select **Focus canvas**, and hold W, W+D, W+Q and W+Shift+E. Adjust both speeds and try rotation at 90°.
2. Press H while moving; restore panels and confirm the view/mode survived. Compare Space-pause, audio pause and Stop. Drag and wheel over an off-center mark.
3. Release keys, tab into a number field, leave the window, and press Escape. Confirm movement stops and fresh canvas focus/key presses recover. Check mode-off arrows seek.
4. Make a short recording while moving; inspect the export. Resize the browser, apply/share a preset, and confirm retained trails remain in world coordinates and camera/speeds stay local.

**Stop after 116C.A.** Camera serialization, animation paths, 116D, Build 117 optimization and public release/canon changes are excluded. Movement tuning remains provisional for owner evaluation.
