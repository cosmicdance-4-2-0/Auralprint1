# Build 116D review handoff

Repository: `cosmicdance-4-2-0/Auralprint1`. Accepted baseline and verified remote
`main`: **`23b1f13b7769a9fdaf090aa54a1e9fa87f1f7695`**, merged PR #72,
`v0.1.16c.a.a`. Dedicated branch: `codex/116d-authored-scene-camera`.
Implementation head: **`508768a365ea18058dba21fbbdf064062f82897b`**,
`v0.1.16d`. Validation commit: `d028495dbacc8a8d6df4a6f803943a887af199b8`.
Subsequent delivery changes contain docs only; the PR's head is the delivered ref. Build 115 remains the public release. Do not merge,
tag, publish, deploy or begin Build 117 without the owner's separate decision.

The [116D contract](build-116.md#116d-authored-scene-camera) owns the field policy.
Schema 12 persists `sceneCamera { x, y, zoom, rotationRad }`; CONFIG owns factory
values and the existing constraints. Live `state.camera` is independent. Save
copies the validated live view and uses canonical settings synchronization;
Restore stops input and applies the resolved saved view. Share never captures
live movement. Startup and in-session imports initialize the authored view;
invalid input leaves both owners unchanged. Existing import visual resets remain.

Schema 11 retains all Scene fields, configured world dimensions and unit spacing.
Schemas 2–10 retain their established default world and pixel-spacing migrations,
including both schema-9 formats. All schemas 2–11 receive the CONFIG default
camera and ignore injected current/historical camera fields. The original
schema-9, schema-10, schema-11 and legacy fixtures and every Build 115 canonical
artifact match the accepted baseline. The new schema-12 fixture is synthetic.

## Acceptance review

| Contract | Implementation/evidence |
| --- | --- |
| Viewport-independent world and short-side projection | World geometry, projection, Spaces and renderers unchanged; world/projection/integration tests and native 116A/B cover aspect, resize and DPR. |
| World edits retain old particles and geometry discontinuity notice | Existing Scene controls, accepted notice and history behavior unchanged; world/native 116A regressions. |
| Responsive live controls, C and one-time F | Interaction/actions/timing sources unchanged; keyboard, fit, pointer and native C/C.A/corrective regressions. Restore explicitly cancels held and gesture input. |
| Scene/live independence, sharing and import | Schema-12 field inventory plus individual round trips; malformed/extreme/precision cases; schema-11 full-field preservation; actual UI coordinator tests at zero/one/two/16 Orbs; native fresh-instance and second URL round trips. |
| Stable geometry, phase, admission and retained identities | Existing integration tests compare running/paused simulation and emission decisions; authoring UI tests preserve actual Orb/particle identities and fractions. No new reset is called by Save/Restore. |
| Playback, focus and workspace ownership | Existing native C/C.A covers stopped/playing/paused, native key/button focus, hidden panels, text drafts, pointer/drop and transport priority. New native D covers Save/Restore Enter/Space and Restore during held input. |
| Screen-sized particle/Trace/Ring marks | Renderer and projection paths unchanged; accepted CSS/DPR sizing regressions retained. Artistic semantics remain provisional. |
| Recording uses live canonical viewport | RecorderEngine and Renderer tap unchanged; native decoded exports verify viewport dimensions/content. Corrective harness also saves/restores while recording remains active. |
| Source/portable/hosted parity and large URLs | Shared build/codec/transport unchanged; native D checks all editions at DPR 1/2, including fresh unlike-aspect instances and 256-Orb URLs; unit transport checks 512 Orbs. |

## Validation

- Locked offline `npm ci --ignore-scripts` with the environment's cached packages
  and matching supplied esbuild binary; no dependency or lockfile changes.
- `npm test`: **1,162 passed, one existing opt-in million-particle retention test
  skipped, zero failures** (Node 24.19.0). The sandbox blocked a Python subprocess;
  the complete suite passed with local subprocess execution enabled.
- `npm run build`, `python3 scripts/verify_distribution.py` and `git diff --check`
  passed. Generated artifacts stay outside version control.
- Native Chromium **151.0.7922.173**, Linux/local HTTP: all six harnesses
  (`116A`, `116B`, `116C`, `116C.A`, corrective `116C.A`, `116D`) passed source,
  portable and hosted at DPR **1 and 2**, with no page/console errors or failed
  responses. This includes **24 decoded RecorderEngine exports**, viewport
  dimensions **700×900, 1400×1800, 1000×800 and 2000×1600**, and displayed-view
  content comparisons.
- The corrective stress harness checked **18 single-key holds**, **72 actual
  120/180/300/700 ms main-thread stalls** and **1,052 frame assertions**. All six
  stress recordings remained active through Save/Restore and showed camera motion.
- The ordinary workspace speed harness retried **five** invalid measurement
  windows with intervals over 100 ms, at most two retries per probe. Its existing
  speed, direction and per-frame assertions remain byte-identical to the accepted
  baseline. Slow-frame behavior is independently checked by the corrective harness.
- Native D verified schema-10 migration, explicit capture, share versus live
  independence, initialization before the first rendered frame, unlike-aspect
  fresh instances, Restore during held input, second round trips, invalid import
  atomicity, reset distinctions and **180,086-character** 256-Orb URLs. The 512-Orb
  unit URL check also retains the complete configuration. No broader device,
  artistic or URL-length certification is implied.

Reproduce from the repository root:

```sh
npm ci
npm test
npm run build
python3 scripts/verify_distribution.py
AP_PLAYWRIGHT_MODULE=/path/to/playwright AP_CHROMIUM_PATH=/path/to/chromium \
  AP_REPORT=/tmp/116d.json node scripts/validate-116d.cjs
```

Existing native regressions are `validate-116a.cjs`, `validate-116b.cjs`,
`validate-116c.cjs`, `validate-116ca.cjs` and `validate-116ca-corrective.cjs`, with
the same external tooling variables. No application browser dependency was added.
`AP_HERO_PRESET='/path/to/HERO-S10-MIRROR16.decoded(1).json'` optionally supplies
the external schema-10 owner artifact to `validate-116d.cjs`; it is never copied
into a fixture or included in the report.

## Owner review

Run `python3 -m http.server 8000 --directory dist` and open
`http://localhost:8000/auralprint_0.1.16d.html` or `http://localhost:8000/hosted/`.

1. Load the actual schema-10 hero preset and music. Check the mirrored 16-Orb
   configuration and 256 bands. Move, rotate and zoom; use **Save Current View as
   Scene View**, move again, then **Copy Share Link**.
2. Open the link in a fresh instance/device. Check the intended initial view,
   navigate independently, use **Restore Scene View**, and share/reopen once more.
   Unlike screen shapes may show different world extents at the same saved view.
3. Compare **C / Reset Camera** (factory), **F / Fit View** (one-time fit),
   **Restore Scene View** (authored), and **Reset All Settings** (both defaults).
   Try normal/demanding playback, visual pause, audio pause/Stop, hidden panels,
   text input/focus recovery, resizing and a short moving-camera recording.

## Qualifications and next step

The exact owner artwork **was not available** in the checkout or supplied file
locations. Its new author/share/receive workflow remains unverified. Native
stress coverage uses an explicitly representative synthetic 16-Orb composition;
it does not substitute for the owner's artifact or artistic review. No owner
artwork was published as a fixture.

Other browsers, physical devices/touch/DPR/orientation, assistive technology,
OS-level file dragging, direct `file://`, fully offline launch, long recordings
and exported audio fidelity remain unverified here. Native touch/DPR/orientation
and some lifecycle signals use emulation/injection. Saved world-space center,
zoom and orientation are reproducible; pixel-identical framing across unlike
screens is not promised. Native large-link navigation was checked at roughly 180,000 characters; higher
browser/service URL limits are unverified. No application truncation or field
dropping was observed. No implementation release blockers were found in the reviewed scope. No
unrelated optimization or alternate renderer was introduced. Final artistic and release approval remains with the owner.
