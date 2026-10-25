# Build 116 — simulation world, camera and projection

## AUD-002 / AUD-003 and CONFIG step correction

Against accepted `main` `d2a92a868e214ae5cba77ea91600b9965038ff19`, Analysis
frequency drafts now survive unrelated settings/File/frame refreshes. Existing
change validation owns commit/rejection; successful URL application and full
reset explicitly replace drafts and fence late change events. Fractional Hz
remains valid; CONFIG defines no frequency editing lattice.

All 38 Orb/Bulk, Analysis and Ring sliders now bind CONFIG steps and validate
new submissions at their editing owner. Legacy canonical values and shipped
defaults remain unchanged until deliberate editing; visible/accessible readouts
identify both the current value and slider selection when they differ. Phase
converts CONFIG's radian bounds/step to native degrees so Chromium can select
360° exactly, then commits canonical radian indices with the established zero
wrap and preserved history. Ring speed's non-grid maximum is not a new index.

`npm run test:browser:editing` adds a separate mandatory Chromium gate to the
existing Ubuntu job using PR #76's pinned installation; the authored-camera
gate is unchanged. [Inventory, reproduction, verification and owner handoff](../audits/remediations/116-aud002-aud003/README.md)
record every limit/default, compatibility behavior and the separate unapproved
decision required for globally step-strict preset normalization. Schema 12,
migrations, CONFIG values, Build 115 canon and historical evidence are unchanged.
Owner review remains the stopping point; no merge or release approval is implied.

## AUD-001 corrective disposition

The October 24 audit's Medium live-input readiness defect is corrected against
accepted `main` **`0bbe5172cb4f1ec863bd00eb9e4e32c4e15f744f`**. Acquired live
sessions own pending listeners/tracks before attachment; admission and atomic
commit check the ID-selected audio track, stream activity and activation ownership.
Ended acquisitions retain granted permission, recover with existing reconnect
feedback, and permit the same Mic/Stream button to request capture again.
Session-fenced callbacks and synchronous recovery cannot overwrite a successor.
Committed Stream multi-track/video policy, recorder ownership, UI locks and schema
12 are unchanged. [AUD-001 handoff and evidence](../audits/remediations/116-aud001/README.md)
records the failing baseline, 91 focused tests, full suite, 72 native cases and
remaining device qualifications. Owner acceptance and release approval remain pending.

## AUD-005 corrective disposition

Against accepted `main` `7dd1de6f09d91472e739cad19916a90dcc21731f`, CI now runs
`npm run test:browser` against the generated version-derived portable HTML and
hosted `index.html` over local HTTP. One headless Chromium process verifies
nondefault schema-12 world/camera startup, live/authored separation, UI Save,
Share and Restore, a fresh recipient, in-session Apply URL Preset, invalid-import
atomicity, C/F ownership and fresh schema-11 migration to CONFIG camera defaults.
Browser-side observation checks live controls before the first named application
animation callback and at its first canvas clear; it never waits for the expected
camera to appear. Hosted relative HTML/manifest resources are fetched in Chromium.
Page/console errors, failed requests, installation/launch errors and assertions
fail the gate; waits are bounded by observable frames and UI readiness.

Playwright **1.64.1** is an exact, lockfile-managed development dependency, outside
the runtime bundle. The existing Ubuntu test/build job installs its matching
Chromium headless shell explicitly, then tests that job's already-built artifacts:

```sh
npm ci
npm run build
npx playwright install --with-deps chromium --only-shell
npm run test:browser
```

The existing exact-commit checkout, Ubuntu/Windows Node tests, build, distribution
verification, artifact checks and `git diff --check` remain. Windows downloads no
browser. The smoke is a required failing step within the existing **Test and build
(ubuntu-latest)** check; owners must require that check in branch protection if it
is not already required. Branch-protection settings were not changed or verified.

The decisive disposable-checkout mutation removed only
`if (presetApplied) restoreSceneCamera();`, then rebuilt. The same normal smoke
command exited **1**, identifying the initial authored-camera mismatch
`x: actual=0, expected=137.25`. Unmodified and restored builds both passed
(approximately **6.4 seconds** each locally). The full Node suite passed
**1,200**, with one existing opt-in skip; build/distribution checks passed. The
unchanged optional `validate-116d.cjs` also passed source/portable/hosted at DPR 1/2.
No production code, schemas 2–12, Build 115 canon or historical fixture changed.
AUD-005 is corrected subject to owner review; no release approval is implied.

The mandatory smoke qualifies Linux headless Chromium, local HTTP, a 1000×800
viewport and DPR 1. It uses no audio devices, capture permissions or external
media. Other engines, physical devices, direct `file://`, deployed hosting,
pixel-identical framing, artistic/performance stress and recording remain outside
this gate; the larger optional native harness remains available for broader checks.

## 116D authored Scene camera

**Owner-authorized implementation for final review, not release approval.**
Baseline: merged PR #72 and verified `main` at
`23b1f13b7769a9fdaf090aa54a1e9fa87f1f7695` (`v0.1.16c.a.a`).
116A–116C.A, including the owner's physical 16-Orb hero evaluation, are accepted.
116D WIP is `v0.1.16d`, on `codex/116d-authored-scene-camera`.
[Review handoff and compatibility evidence](build-116d-handoff.md).
Earlier milestone sections below describe their original scope; this section
supersedes their runtime-only persistence and preset-application statements.

A Scene has an authored view at `preferences.sceneCamera`; a user performs through
`state.camera`, the sole live camera. Schema **12** adds only
`sceneCamera { x, y, zoom, rotationRad }`: center in world units, positive
dimensionless zoom and radians. CONFIG supplies the same factory camera
`{ x: 0, y: 0, zoom: 1, rotationRad: 0 }` to both owners without duplicating numeric
policy. Existing zoom limits are 0.01–100, finite positions are unbounded, and
rotation normalizes to `[0, 2π)` through the existing camera-state creator.

`normalizeSceneCamera()` supplies malformed/missing individual fields from CONFIG;
nonpositive/nonfinite zoom defaults, positive finite zoom clamps to existing
limits, and types never coerce. Canonical output has exactly four fields and
retains numerical precision. Normalization, replacement, resolution, capture and
live initialization copy snapshots; no live reference enters Scene configuration.

The codec accepts schemas **2–12**, including both historical schema-9 layouts.
Schema 11 retains every existing Scene field, configured world dimensions and
`minPlacementDistanceUnits`; world import deliberately starts at schema 11,
independently of the current writer version. Schemas 2–10 retain default world
geometry and the accepted pixel-spacing migration. All schemas 2–11 get CONFIG's
default camera, ignoring injected `sceneCamera`, runtime `camera` and historical
Scene camera properties. Historical fixtures and Build 115 artifacts remain immutable.

Successful URL startup, **Apply URL Preset** and hash changes sanitize the whole
payload, replace preferences, resolve settings, initialize the live camera, then
synchronize through existing subsystem paths. URL transport still owns only
encoding/decoding and preference replacement. Invalid presets change neither
preferences nor camera. Initialization needs no canvas dimensions. Import retains
its existing explicit visual reset; ordinary settings resolution preserves the
live camera.

The existing Camera panel owns **Save Current View as Scene View** and **Restore
Scene View**. Save validates/copies the live camera and commits through
`applyPrefs()` without visual reset; Restore cancels held/gesture input and
applies the resolved authored camera without changing Scene preferences or history.
Readouts distinguish saved and live views. **Copy Share Link** includes the saved
view; movement alone never updates preferences or the URL. **C / Reset Camera**
restores factory defaults, **F / Fit View** remains a one-time composition fit,
and **Reset All Settings** resets both views through the complete reset path.
Mode, speeds, key/focus/gesture state and panel visibility remain runtime-only.

Projection remains uniform and short-side based. Shared center, zoom, orientation,
world geometry and visualizer settings reproduce the authored view, while unlike
screen aspect ratios may reveal different extents. Pixel-identical framing is not
promised. Resize/DPR never write the authored camera or simulation geometry;
CSS-screen-sized particle, Trace and Ring marks remain provisional. RecorderEngine
continues to capture the live canonical viewport. No letterboxing, alternate
renderer, recorder dimensions, local JSON workflow or Build 117 work is added.

**Stop at the review PR.** No merge, tag, publish, deployment or Build 117.

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

Baseline: PR #71 is merged; current `main` and branch base are **`5ee433bdc13a1f8abf07d8bc3a73dc9d11ed18dc`**. Its accepted tested head is `8cc6e60aac0e44a1f4fff4c411d7387bbfea1da8`. The dedicated branch is `codex/116ca-camera-workspace`; corrective WIP version is **`v0.1.16c.a.a`** (reviewed baseline `6c70473f45408da28442903f82b1d3d8bfe1c761`). Build 115 canon, historical fixtures and preset schema 11 are unchanged.

**Camera** in the bottom workspace launcher now owns the existing view controls, mode/status, runtime pan/rotation speeds, **Focus canvas for camera controls**, and a control reference. Settings retains Simulation World and Scene preferences. The workspace owner handles independent visibility, stacking, launcher collapse, focus recovery and H snapshots. Hiding Camera preserves its view, mode, audio and speeds. Camera clears the Audio dock at every viewport size; scroll the panel or independently hide Audio when vertical space is limited.

With camera mode enabled and canvas keyboard focus, hold **W/S** forward/back, **A/D** strafe, **Q/E** counterclockwise/clockwise camera rotation, and **Shift** to boost both. Combinations translate and turn together; diagonal translation is normalized. Arrows, +/−, brackets, Home and Escape retain their 116C actions. **C** resets through `resetCamera()`; **F** and the adjacent **Fit View** button run the same one-time framing action. Both shortcuts stop held movement until fresh input; they require mode and canvas focus, preserve native modifiers/text entry, and ignore OS repeats. H, Space, R, N/P and mode-off seeking keep their existing owners. Native controls, scrubber, recording and audio drops do not acquire movement keys.

`CONFIG.camera.keyboard` owns provisional defaults **320 CSS pixels/second**, **60 degrees/second**, **3× Shift**, and **0.1 seconds maximum movement time per update** (`maxMovementDeltaSec`). This is a movement cap, not a key-cancellation threshold. `CONFIG.limits.camera` owns speed bounds/increments: pan **0–3200, step 20**; rotation **0–360, step 5**. Speeds are session controls, excluded from Scene preferences, URLs and storage. Reset Camera preserves speeds. Existing discrete action steps remain 50 world units / 5° / 1.1×.

The existing animation callback calls `cameraInteraction.tick()` before rendering, independently of playback, simulation pause and Orb count. Key events track held state; repeats do not advance the view. The active projection fit, zoom and cached CSS/backing ratios convert screen velocity to world translation. The analytic turning integral makes combined translation/rotation coherent across frame intervals, with one validated camera replacement per active frame. No extra animation loop or per-tick layout queries were added. Key release, canvas/window blur, hidden documents, lost focus, mode exit and disposal clear held input. Slow visible frames spend at most 0.1 seconds; excess time is discarded without debt, retaining the held keys for subsequent frames. Invalid/nonpositive deltas skip movement without cancelling input, including zero supplied by `visualMotionDeltaSec()` after a larger discontinuity. Simulation timing and the single animation callback are unchanged.

Focused numeric drafts survive external camera replacement. Hidden Camera controls skip refresh; visible updates synchronize existing values/readouts without rebuilding controls. Camera frames no longer invalidate Settings or panel tooltips; tooltips refresh on reveal, focus, hover and editing. Forward/inverse transforms, world geometry/history, CSS-sized marks, analysis, particle admission and RecorderEngine's canonical viewport remain unchanged.

### Initial 116C.A validation

The initial tested runtime implementation is `1718d57a28094b0ff65c374852cabaffa7b87d7a`; validation scripts and this handoff are separate follow-up commits. Focused tests cover key state, frame intervals (120/60/20/10 Hz plus mixed intervals), exact simultaneous movement/turning, diagonals, view axes, zoom/world/DPR/CSS scaling, boosts, interruption, speed validation, focus and UI ownership. Full validation: `npm test -- --test-concurrency=2` passed **1,110 tests**, with one existing opt-in million-particle retention test skipped and zero failures. `npm run build`, `python3 scripts/verify_distribution.py` and whitespace checks passed. Build 115 canon and historical preset fixtures match the baseline.

Linux Chromium **151.0.7922.173** passed `validate-116a.cjs`, `validate-116b.cjs`, the Camera-adapted `validate-116c.cjs`, and new `validate-116ca.cjs` across source, portable and hosted at DPR **1 and 2**, with no page/console errors or failed responses. The 116C.A harness samples actual native held keys over real animation frames: 54 pan probes measured approximately **320 CSS pixels/second**, including 0°/90°/180°/37.5°, zoom 0.01/1/100, diagonals, Shift **960**, edited speed **160**, Q/E and combined translation/rotation. It checks focus/visibility/mode cancellation, panel state/focus, numeric drafts, shortcuts/seeking/drop ownership, stopped/playing/paused and zero/one/two Orbs, viewport/DPR resize and narrow/short layouts. Mutation probes found zero tooltip/element changes during visible movement and zero Camera control/text/tooltip writes while hidden. Six moving-camera RecorderEngine exports decoded at canonical **1000×800** (DPR 1) or **2000×1600** (DPR 2); MIME was `video/webm;codecs=vp9,opus`. Prior 116B/C video-content and projection regressions also passed.

Reproduce the new native checks with external tooling: `AP_PLAYWRIGHT_MODULE=/path/to/playwright AP_CHROMIUM_PATH=/path/to/chromium AP_REPORT=/path/to/report.json node scripts/validate-116ca.cjs`. No application dependency was added. Browser evidence is Linux Chromium over local HTTP; Firefox/WebKit, direct `file://`, physical devices, assistive-technology users and OS file dragging remain unverified. Cancellation lifecycle signals are additionally injected; touch/DPR/orientation use emulation in prior harnesses. Short exports establish viewport capture behavior, not long-duration safety or audio fidelity.

### PR #72 corrective review: continuity, C and F

Corrective source is `6749eaed1d6d91932ba74a1cec41278d8ebc2a6b`, based on the owner-reviewed `6c70473f45408da28442903f82b1d3d8bfe1c761`. The owner accepted the panel, movement directions, combined controls, Shift, zoom and mouse/workspace behavior; the original 100 ms key-cancellation policy interrupted sustained movement in the 16-Orb hero scene. It is replaced by the movement-time cap described above. C preserves world, trails, playback, speeds and mode while restoring CONFIG camera defaults.

Fit uses a pure calculation over a one-pass, request-only primitive iterator: the nominal centered world rectangle; each active Orb's full radial envelope from both configured response radii, center and waveform displacement; all retained particle coordinates; and the enabled Ring's own potential geometry. Configured envelopes include full-scale waveform potential or a larger observed channel peak at the instant of fitting. Orb locking changes Ring phase only. No analysis, history, phase, admission, recording, presets or simulation coordinates are changed.

The fitter rotates these bounds into the current view axes, centers their union and selects an aspect-preserving zoom, preserving rotation. CONFIG supplies a **16 CSS pixel** outer gutter, plus the conservative maximum screen-space particle/point radius or half trace/Ring stroke width. DPR enters screen margins, not world geometry. Minimum-zoom constraints apply the best centered framing and explicitly report incomplete coverage. Margins too large for the viewport or invalid/unrepresentable geometry leave the camera unchanged. Fit feedback remains visible with panels hidden for CONFIG's six-second duration. There is no automatic tracking or refit on resize; future scene/world changes require another F.

Focused regressions cover interspersed 120–300 ms frames, discarded/zero deltas and longer gaps, retained key ownership, C/F priority, rotated/aspect/DPR fits, zoom limits, off-world retained points, potential envelopes, drawing margins and unchanged state. `npm test` passed **1,135 tests**, with one existing opt-in retention test skipped and zero failures; build, distribution and whitespace checks passed. `validate-116ca-corrective.cjs` passed source/portable/hosted at DPR 1/2 in Chromium **151.0.7922.173**: **72 real main-thread stalls** (120/180/300/700 ms) across 18 native W/D/Q holds, each with one keydown and no reacquisition. Frame instrumentation verified a maximum normal-speed step of 32 CSS pixels or 6° and zero suspension debt, followed by continued movement. C/F/button, paused-state identities, retained off-world points, potential envelopes, rotation/aspect/DPR, minimum-zoom feedback, zero Orbs and lifecycle cancellation passed. Six RecorderEngine exports decoded at canonical 1000×800 or 2000×1600 and showed camera movement in their video frames, with no browser errors or failed responses. The existing `validate-116c.cjs` also passed all six editions, including captured drag/wheel and keyboard/transport ownership plus six further canonical video exports and source displayed-view comparisons. Reproduce using the same external Playwright/Chromium variables as above with `node scripts/validate-116ca-corrective.cjs`.

Native uses a representative 16-Orb preset because the owner's exact hero preset is not in the repository. Visible stalls are synchronous browser-main-thread delays; blur/tab hiding additionally use injected lifecycle signals. Broader browser/device and long-recording/audio-fidelity qualifications above remain.

### Preview and owner check

```sh
npm ci
npm test
npm run build
python3 scripts/verify_distribution.py
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/auralprint_0.1.16c.a.a.html` or `http://localhost:8000/hosted/`.

1. Load the 16-Orb hero scene and music; launch Camera, enable camera mode, select **Focus canvas**, and hold W, W+D, W+Q and W+Shift+E. Adjust both speeds and try rotation at 90°. Keep W held through demanding sections and confirm it resumes after delays without a fresh press.
2. Press H while moving; restore panels and confirm the view/mode survived. Compare Space-pause, audio pause and Stop. Drag and wheel over an off-center mark.
3. Release keys, tab into a number field, leave the window, and press Escape. Confirm movement stops and fresh canvas focus/key presses recover. Check mode-off arrows seek. Hold movement then press C; confirm the view stays reset until new input. Press F at 0°, 90° and an arbitrary rotation, and compare the Fit View button.
4. Make a short recording while moving; inspect the export. Resize the browser, apply/share a preset, and confirm retained trails remain in world coordinates and camera/speeds stay local.

**Stop after 116C.A.** Camera serialization, animation paths, 116D, Build 117 optimization and public release/canon changes are excluded. Movement tuning remains provisional for owner evaluation.
