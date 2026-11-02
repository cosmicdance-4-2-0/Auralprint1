# Build 117 — Stage 0/1 architecture and measurement checkpoint

**Status:** source-inspection checkpoint / design proposal; **no implementation, baseline remeasurement, or owner acceptance claimed**.  
**Reference:** `v117_dev` at `afa16125101dcca3fb714bcf9634955410179f01`, branched from `main` at `8c21846d4433376fc4568bc51810075fb42385c7` (1 additional specification-only commit).  
**Release reference:** immutable Canon `docs/Canon/0.1.16/auralprint_0.1.16.html`, SHA-256 `a7ccb6d0cffdc6641f7cc08fbce71b7087196b962267efae663819b2701d89db`; writer schema 16. The development `version` remains `v0.1.16`; do not advance it on this pass.

Authority: [AGENTS.md](../../AGENTS.md), [ROADMAP.md](../../ROADMAP.md), [117 spec draft](auralprint-build-117-spec-draft.md), and [117 performance audit](../audits/117-comprehensive-performance-audit.md). The draft has not been approved or linked from ROADMAP yet. PR #106's hosted metadata packaging is already in the base; do not redo it.

## 1. Observed topology (source-proven)

```text
CONFIG -> preferences -> resolveSettings() -> runtime.settings
                                   |-> state.world (reference world geometry)
URL/preset codec ------------------+ (admitted replacement, before init)
AudioEngine.sample() -> updateAnalysisFrame() -> L/R/C AnalysisFrame
                                      |           |
                                      |           v
main.onAnimationFrame() -----------> VisualizerRuntime.update()
  camera update, time clocks          Orb adapters -> Orb.step / TrailSystem
                                     -> ParticleGovernor frame boundary
                                     -> Ring update (reads current first Orb angle)
                                   -> VisualizerRuntime.render()
                                      Renderer.clearFrame()
                                      Ring draw -> ordered Orb draw
                                   -> UI.refreshAllUiText()
                                   -> Scrubber.draw()
Renderer canvas -------------------> RecorderEngine render tap
AudioEngine recordable tap --------> RecorderEngine audio tap
```

| Boundary | Current owner / implementation | Contract and migration risk |
| --- | --- | --- |
| Entry and time | `src/js/main.js`; bounded `dtSec`, visible `motionDtSec`, monotonic `nowSec` | Preserve pause, background/rebase and particle real-time expiry; other subsystems may continue independent of draw. |
| Producer | `audio/analysis-frame.js`, `audio/audio-engine.js`, `audio/band-bank-controller.js` | L/R/C data and combined C spectrum are authoritative, producer-owned and usable with zero visualizers. A reused frame object is *not* a signal that audio data stayed unchanged. |
| Definitions/identity | `core/config.js`, `core/preferences.js`, `core/orb-collection.js`, `render/orb-runtime.js` | CONFIG limits; runtime settings derived by resolver; stable `orb.id` and collection order; existing schema 16 `orbs[]` and `bands.overlay`. No generic persisted Scene shape authorized. |
| Participants | `render/visualizer-runtime.js` | Existing participants have `id/type/isVisible/update/render/reset/dispose`; hard-coded Ring and Orb factories, reconstruction, reconciliation, two-pass update ordering. No general discovery/registration, per-type dependency graph, or generic error-isolation policy. |
| Particle ownership | `render/orb.js`, `trail-system.js`, `particle-governor.js`, `particle-list.js` | Orb trails participate in runtime-owned governor. Ring does not. A new Visualizer must not automatically receive Orb particle budgets or own another system's cleanup. |
| Drawing | `render/renderer.js`, `render/trace-fade.js`, `render/color-policy.js` | Shared canonical Canvas2D, color/composition, Ring-before-Orb order, Trace Fade 0/positive, DPR scaling, recorder capture. Renderer currently exposes type-specific `drawSpectralRing`/`drawOrb` commands. |
| World/Camera/Fit | `core/world-geometry.js`, `core/spaces.js`, `core/camera-projection.js`, `render/camera-fit-content.js` | World coordinates independent from viewport; world fractions are settings units; viewport conversion returns backing pixels, CSS-sized marks multiply by DPR. Fit currently enumerates Orb envelopes/history and Ring geometry by name. World is not clipping/retirement policy. |
| Editors and workspace | `ui/visualizers-panel.js`, `ui/orb-editor.js`, `ui/spectral-ring-editor.js`, `ui/ui.js`, `ui/workspace.js` | Inventory is keyed by `[type,id]`; unknown types are generic read-only rows. Orb/Ring actions/editors are explicit. Closed Orb card bodies currently materialize; keep draft/focus/ARIA/ownership semantics when changing this. |
| Distribution | `scripts/build.mjs`, `scripts/assemble_single_file.py`, `src/js/main.js` | esbuild has one fixed JS entry, produces browser IIFE, then assembly embeds the bundle into portable and hosted HTML. Discovery must happen at build time with deterministic static inclusion; no runtime fetch/eval/external JS. |

**Ordering invariant:** current `VisualizerRuntime.update()` updates non-Ring participants, closes the governor frame, then updates Ring; `render()` clears and paints Ring before Orbs. An Orb-locked Ring observes the *current* first Orb's angle even when that Orb is reordered or zero Orbs remain. Update dependencies must not be inferred from layer order.

**Instance distinction:** current Ring is one participant with `id/type = spectral-ring`; Orbs are many participants with `type = orb`, stable instance IDs and ordered composition. An Orb is not synonymous with the abstract Visualizer *type*.

## 2. Proposed Visualizer design gate (not an approved interface)

| Decision | Working recommendation to review | Proof / unresolved choice |
| --- | --- | --- |
| Type/instance separation | A build-registered immutable type descriptor creates zero/many runtime instances; type ID is different from instance ID. | Confirm singleton admission, stable identity and mixed-type ordering; never instantiate merely by discovery. |
| Discovery | One prescribed source directory and entry convention, deterministic sorted discovery plus generated static import/registry manifest before esbuild (or an equivalent deterministic esbuild plugin). | Reject duplicate IDs, bad descriptors/versions, missing dependencies, cycles and unsafe paths. Add/remove independent example and compare both HTML products. Choose generator vs plugin explicitly. |
| Services | Host-supplied scoped, read-only analysis, settings, time, world, Camera/projection and viewport/DPR; explicit resource ownership; optional Fit/edit adapter capabilities. | Define surface and mutability, versioning, optional interfaces and error/teardown behavior, with no writable second authority or implicit Web Audio access. |
| Scheduling | Separate declared update prerequisites from numeric/ordered draw layers, stable tie-breaking and cycle failure. | Model Orb-current-frame -> Ring-phase dependency *without* naming those types in coordinator; determine governor frame boundaries for participants with shared accounting. |
| Spatial contract | Distinguish simulation world units, normalized world fractions, CSS px and backing px. Optional supported/desired/min/max size must name its unit. | Clarify whether size means layout request, visible projected extent, or rendered output bounds; no automatic world clipping. |
| Renderer | Preserve one owner of canvas/recording. Explore a host drawing service or scoped render callback without adopting another backend. | No quiet altered blending, paint order, extra Canvas or duplicate renderer. |
| Persistence | Retain schema-16 Orb/Ring representation at least during migration; registry alone does not imply serializing arbitrary types. | Owner decides whether third-party *first-party source* types are ephemeral-only, have type-specific adapters within existing policy, or require a separately approved future Scene/schema design. |

The contract is **not frozen**. A new generic participant must be demonstrated in the *build*, not only through dependency injection in tests. Stop for re-scope if this requires broad Scene/compositor replacement or a partially incompatible migration.

## 3. Baseline and measurement recipe (proposed; not executed in this pass)

1. Pin three references separately: archived Canon 116 hash above (behavioral reference); `main` at `8c21846d` (pre-117 runtime); each future 117 test/PR SHA. The merged 117 audit measured an *older* SHA (`2a2565f`) and a software Chromium environment; its values are historical leads, not current hardware certification.
2. Use Node 24/Python 3.12 and sequential `npm ci`, `npm test`, `npm run build`, `python scripts/verify_distribution.py`, then applicable README/CI Chromium gates. Do not overlap tests/build/watch in the shared output tree. Record browser, OS, CPU/GPU/backend, DPR, viewport, audio fixture, FFT/bands, governors, selected source, recording codec and actual output hash.
3. Sample whole `onAnimationFrame()` callback duration and rAF interval *separately*; report p50, p95, long intervals, startup/first-frame and edit-action latency, and memory/GC where accessible. Profile phase buckets (camera, audio/analysis, update, render incl. native Canvas calls, UI, scrubber) in a separate instrumentation run; do not subtract timer overhead blindly or equate interval minus callback with GPU time. Proposed comparable audit window: 60 warmups + 240 samples, repeated when noisy, isolated runs.
4. Reproduce controlled scenes before changing code: (a) factory idle and hidden panels; (b) canonical stereo File at current default FFT/bands, plus silence and paused simulation; (c) Ring and zero Orbs; (d) normal Orb/Trace scenes, 16/64/256-Orb editing; (e) 1,000/8,000/16,384 retained particles and Fade 0/5/20; (f) mixed Camera movement, DPR 1/2, open panels; (g) Queue mutation, reimport/reset/source transitions; (h) recorder-on and finalization, long-session memory. Add actual Hero only when owner supplies its preset. Heavy/expert stress cases do not set a universal FPS requirement.
5. Cross-browser/device grid: baseline Chromium locally/CI; physical Windows Chrome/Firefox and narrow/touch browsers where available; distinguish Mic permission, Stream API support, *actual audio track*, browser-denied share and no-track capture. Test portable offline and hosted from identical runtime bundles. Missing devices are explicit **not tested**, never inferred pass.
6. For each optimization: compare fixed scenario/audio/settings/seed, report both full-frame pacing and callback/memory, pixel or task parity where applicable, demonstrate invalidation and cleanup, and record negative results. No numerical pass threshold until owner approves a measured device-specific expectation.

Known inputs still needed for physical baseline: owner's Hero preset or equivalent reproducible scene, target constrained devices and acceptable task-level UX expectations. Existing audit's measured findings remain hypotheses for this newer branch until reproduced or bounded.

## 4. Protected checks and risk register

| Risk | Existing evidence/tests to preserve |
| --- | --- |
| Ring-first composition / Orb-first update / zero Orbs / identity | `tests/visualizer-runtime.test.js`, `tests/ring-phase-lock.test.js`, `tests/orb-collection.test.js`, `tests/visualizers-panel.test.js`, `tests/per-orb-ownership.test.js` |
| World vs viewport, Camera Fit and authored/live view | `tests/world-geometry.test.js`, `tests/world-integration.test.js`, `tests/camera-projection.test.js`, `tests/camera-fit-content.test.js`, `tests/scene-camera.test.js`, `scripts/validate-116d.cjs` |
| L/R/C and FFT channel contract | `tests/analysis-frame.test.js`, `tests/band-bank.test.js`, `tests/frequency-domain.test.js`, `tests/rc16-band-references.test.js` |
| Particle governor, spacing, clock, fades, color/capture | `tests/rc15-budgets.test.js`, `tests/rc15-spacing.test.js`, `tests/rc15-timing-performance.test.js`, `tests/trace-fade.test.js`, applicable browser/render audit gates |
| Schema and canonical distribution | `tests/preset-schema-13.test.js`, `tests/preset-schema-16.test.js`, `tests/rc20-packaging.test.js`, frozen compact baselines, `scripts/verify_distribution.py` |
| UI focus, source and recorder ownership | `tests/orb-editor.test.js`, `tests/visualizers-panel.test.js`, `tests/workspace-ui.test.js`, `tests/live-source-ownership.test.js`, `tests/recording-export.test.js`, `tests/rc19-recorder-disposal.test.js` |
| Watcher diagnostic exposure | `tests/watch-integration.test.js`; Ubuntu duplicate-save and Windows child-survival remain distinct unresolved causes; no weakened assertions, arbitrary debounce, or unapproved rewrite |

## 5. Small, dependency-ordered candidate passes

| Order | Candidate (stage) | Cost / decision and required evidence |
| --- | --- | --- |
| A | Repeatable source/Canon baseline and isolated measurement harness (0) | M; record instrumentation and device gaps, unmodified visual parity, complete frame interval/callback results; no production changes. |
| B | Visualizer type/instance and host-service contract proposal with dependency/layer/sizing semantics (1) | M; owner chooses unresolved cells in §2; failure/teardown, zero/many instances and authority rules must be testable. |
| C | Build-discovery proof and independent example in a disposable branch (3.5 *after* gate) | M; deterministic registry add/remove, invalid/duplicate/cycle failures, both offline HTMLs; no default activation and no persisted schema change. |
| D | Migrate Ring and Orb adapters without semantic changes (3.5 *after* upstream data decisions) | L; protected tests and pixel/Camera/preset equivalence, shared governor accounting and isolated disposal; stop rather than partial migration. |
| E | Source capability matrix and Firefox no-audio capture diagnostics (2; may proceed independently) | M; cross-browser/permission/no-track negative paths, release owned tracks, avoid false unavailable promises. |
| F | Same-File waveform peaks reuse (3) | M; repeat identical admitted File, exact peaks, cancellation, bounded cache eviction, unchanged playback progress; AUD117-002. |
| G | Scope Orb editor invalidation, then lazy unopened bodies (6 *after* interfaces) | M then M–L; compare 16/64/256 cases, drafts/focus/listeners/ARIA/picker teardown; AUD117-001/004. |
| H | Particle presentation + Trace controlled experiments (4/5 after migration) | M–L; repeated full-frame improvement, default-case nonregression, bounded memory, exact fade/pixel/capture output; AUD117-003/005. |

The list is scheduling advice, not authorization for C–H. Watcher investigations remain separate parallel diagnostics. **Stage 1 owner gate:** decide type/instance model, descriptor/registry mechanism, optional capabilities, dependency and draw ordering, service/ownership boundaries, dimensions and persistence. Only then authorize architectural migration; overhaul the Visualizers Workspace after its actual capabilities and efficient projection mechanisms exist.

## 6. Verification on this checkpoint

Read-only GitHub source and spec inspection, branch ancestry/diff and archived Canon checksum were verified. **No source modification, build/test execution, hardware baseline, browser proof, benchmark run or runtime change is claimed.** This report is review material; owner acceptance and merging are separate actions.
