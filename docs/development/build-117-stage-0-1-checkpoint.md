# Build 117 — Stage 0/1 architecture and measurement checkpoint

**Status:** reconciled architecture inventory, benchmark plan and Visualizer contract proposal for owner review. Baseline correctness checks completed; performance measurements and architectural acceptance remain open.

**Reference:** `v117_dev` at `afa16125101dcca3fb714bcf9634955410179f01`, branched from `main` at `8c21846d4433376fc4568bc51810075fb42385c7` (1 additional specification-only commit).

**Release reference:** immutable Canon `docs/Canon/0.1.16/auralprint_0.1.16.html`, SHA-256 `a7ccb6d0cffdc6641f7cc08fbce71b7087196b962267efae663819b2701d89db`; writer schema 16. The development `version` remains `v0.1.16`; do not advance it on this pass.

**Follow-on measurement pass:** [B0/B1/B2 baseline harness and evidence](build-117-baseline.md). The observations below retain their original checkpoint context; the follow-on pass does not approve the Visualizer contract or close all Stage 0 coverage.

**November 2 architecture-first clarification:** the [current preparation checkpoint](build-117-architecture-preparation.md) extends the map to both cores and the [baseline completion ledger](build-117-baseline.md#baseline-completion-ledger) identifies remaining evidence. PR #109 is on hold. The original proposals, recipes and verification below are retained as historical review material, not current task authorization.

Authority: [AGENTS.md](../../AGENTS.md), [ROADMAP.md](../../ROADMAP.md), [117 spec draft](auralprint-build-117-spec-draft.md), and [117 performance audit](../audits/117-comprehensive-performance-audit.md). ROADMAP links the draft and checkpoint as review material; the draft remains unapproved. PR #106's hosted metadata packaging is already in the base; do not redo it.

## 1. Observed topology (source-proven)

Boot admits the winning URL preset before Camera and subsystem initialization. Each [application callback](../../src/js/main.js) sizes the canvas, derives clocks, updates Camera, samples audio into the reusable AnalysisFrame, updates visualizers, renders, projects UI and draws the scrubber. Recorder timing and native finalization have separate owners.

| Boundary | Current owner / implementation | Contract and migration risk |
| --- | --- | --- |
| Entry and time | `src/js/main.js`; bounded `dtSec`, visible `motionDtSec`, monotonic `nowSec` | Preserve pause, background/rebase and particle real-time expiry; other subsystems may continue independent of draw. |
| Producer | `audio/analysis-frame.js`, `audio/audio-engine.js`, `audio/band-bank-controller.js` | L/R/C data and combined C spectrum are authoritative, producer-owned and usable with zero visualizers. A reused frame object is *not* a signal that audio data stayed unchanged. |
| Sources / Queue | `audio/input-source-manager.js`, `audio/queue.js`, `ui/ui.js` | Activation epochs fence source acquisition; the UI coordinator owns File requests, Queue-entry identity and deferred EOF. Queue revision fences accepted source-exit clearing. A File can occur in multiple distinct entries. |
| Optional waveform | `audio/waveform-admission.js`, `waveform-coordinator.js`, `waveform-extractor.js`, `scrubber.js` | One occupied probe/decode pipeline plus one latest pending request; supersession revokes presentation, not unsettled native occupancy. Playback does not await extraction. No same-File result cache currently survives reset. |
| Definitions/identity | `core/config.js`, `core/preferences.js`, `core/orb-collection.js`, `render/orb-runtime.js` | CONFIG limits; runtime settings derived by resolver; stable `orb.id` and collection order; existing schema 16 `orbs[]` and `bands.overlay`. No generic persisted Scene shape authorized. |
| Participants | `render/visualizer-runtime.js` | Existing participants have `id/type/isVisible/update/render/reset/dispose`; hard-coded Ring and Orb factories, reconstruction, reconciliation, two-pass update ordering. No general discovery/registration, per-type dependency graph, or generic error-isolation policy. |
| Particle ownership | `render/orb.js`, `trail-system.js`, `particle-governor.js`, `particle-list.js` | Orb trails participate in runtime-owned governor. Ring does not. A new Visualizer must not automatically receive Orb particle budgets or own another system's cleanup. |
| Drawing | `render/renderer.js`, `render/trace-fade.js`, `render/color-policy.js` | Shared canonical Canvas2D, color/composition, Ring-before-Orb order, Trace Fade 0/positive, DPR scaling, recorder capture. Renderer currently exposes type-specific `drawSpectralRing`/`drawOrb` commands. |
| World/Camera/Fit | `core/world-geometry.js`, `core/spaces.js`, `core/camera-projection.js`, `render/camera-fit-content.js` | World coordinates independent from viewport; world fractions are settings units; viewport conversion returns backing pixels, CSS-sized marks multiply by DPR. Fit currently enumerates Orb envelopes/history and Ring geometry by name. World is not clipping/retirement policy. |
| Editors and workspace | `ui/visualizers-panel.js`, `ui/orb-editor.js`, `ui/spectral-ring-editor.js`, `ui/ui.js`, `ui/workspace.js` | Inventory is keyed by `[type,id]`; unknown types are generic read-only rows. Orb/Ring actions/editors are explicit. Closed Orb card bodies currently materialize; keep draft/focus/ARIA/ownership semantics when changing this. |
| Distribution | `scripts/build.mjs`, `scripts/assemble_single_file.py`, `src/js/main.js` | esbuild has one fixed JS entry, produces browser IIFE, then assembly embeds the bundle into portable and hosted HTML. Discovery must happen at build time with deterministic static inclusion; no runtime fetch/eval/external JS. |
| Recorder | `recording/recorder-engine.js`, `recording-policy.js` | Recorder-owned timer and native callbacks run independently of draw cadence. Canvas/audio taps retain their owners; required cleanup and candidate export must succeed before replacing the previous export. Encoded bytes do not bound native RAM. |

**Ordering invariant:** current `VisualizerRuntime.update()` updates non-Ring participants, closes the governor frame, then updates Ring; `render()` clears and paints Ring before Orbs. An Orb-locked Ring reads the current first Orb's angle after reorder. With zero Orbs it retains its current phase; Reset Visuals sets it to zero. Update dependencies must not be inferred from layer order.

**Instance distinction:** current Ring is one participant with `id/type = spectral-ring`; Orbs are many participants with `type = orb`, stable instance IDs and ordered composition. An Orb is not synonymous with the abstract Visualizer *type*.

**Cadences and invalidation:** analysis and simulation update per delivered frame; settings resolve on edits/import/reset. Orb/editor reference guards skip unchanged frames, but [applyPrefs()](../../src/js/ui/ui.js) normalizes/resolves and refreshes all Orb editors even for volume-only changes. Closed editor bodies are constructed during initialization. Queue rows rebuild on explicit refresh, not every unchanged frame. Fit is an explicit query; waveform extraction and recording have independent asynchronous lifetimes. These owners must survive new scheduling/caching.

**Existing control requirements:** retain individual/Bulk Orb editing and mixed values, Ring geometry/phase/presentation, add/duplicate/remove and stable Edit targets, Analysis diagnostics, Camera Save/Restore/Fit, and Queue/recorder locks. Generic inventory must describe unknown capabilities honestly; the Stage 7 layout follows these requirements rather than prescribing Orb fields for every type.

## 2. Visualizer contract proposal (`117-ARCH-VIZ`, not approved)

| Decision | Recommendation for a first contract version | Proof / unresolved choice |
| --- | --- | --- |
| Type and identity | Immutable type metadata with stable type ID, name/description, capabilities and explicit `contractVersion: 1`; instance identity is the pair `(typeId, instanceId)`. Separate contract versioning from preset schema. Describe singleton/multiple admission; discovery creates no instances. | Preserve opaque Orb IDs, including `spectral-ring`, order and zero instances. Confirm mixed-type composition admission before migration. |
| Discovery | Proposed convention: `src/js/visualizers/<type>/visualizer.json` plus `index.js`. Validate metadata as data and generate static imports through an esbuild plugin shared by build/watch; avoid a separate generator process. | Approve/revise convention and plugin approach before implementation. Fail deterministically on malformed/duplicate IDs, unsupported contract versions, invalid paths, missing required types or static cycles. Define factory-export checks separately; JSON validation alone proves no executable lifecycle contract. |
| Core and optional behavior | Synchronous factory initialization and a render operation form the proposed minimum. Update, reset, disposal, Fit and editor hooks are capabilities used where needed; a resource-owning implementation must provide cleanup. Host owns instance identity, visibility and dispatch. | This proposes a versioned change from today's required lifecycle methods. Prove a static non-audio example without fake motion/particle methods, settings replacement without survivor recreation, and explicit Reset Visuals versus track-reset behavior. |
| Host services | Scoped normalized settings, read-only L/R/C analysis, emission/motion/real-time clocks and pause state, world geometry, projection and viewport/DPR. Supply current views per operation; no direct Web Audio or writable global-state authority. | Borrowed analysis arrays are live producer data, not retained snapshots. Any grouped-analysis cache needs a real freshness key, not AnalysisFrame object identity. Preserve all channels with zero consumers. |
| Scheduling | Declare update dependencies separately from composition order, with stable tie-breaking. Make shared-resource commit barriers explicit, without type-name branches in the generic coordinator. | Preserve Orb update -> governor commit -> Ring phase update and Ring-first drawing. Distinguish optional absent phase providers from missing required type dependencies; zero Orbs must preserve current Ring fallback. Reject cycles at the appropriate build/activation boundary. |
| Sizing | Optional desired/min/max output extents must declare units and meaning. Treat these as presentation requests, not automatic geometry rescaling or clipping. CONFIG owns any new policy bounds; viewport/DPR stay ephemeral. | Review the units below. Existing Orb/Ring geometry and apparent mark sizes must remain exact. Decide the host response to an unsatisfied request before adding automatic adaptation. |
| Rendering / Fit | Keep one Canvas2D/composition/recording owner; give each type a scoped drawing boundary and optional conservative Fit primitives. Move type knowledge into adapters rather than a new Scene architecture. | Preserve blend/order, Fade 0/positive fades, projection failure behavior and retained-history Fit. Do not assume exception catching or one save/restore can recover arbitrary canvas-stack damage. Native failure/recovery proof is required. |
| Failure / resources | Proposed policy: report and suspend a failed instance until explicit reset/recreation; continue teardown of independent instances. Preserve bounded unresolved ownership after cleanup failure; never stop another subsystem's resources. | Current runtime has no generic per-instance isolation. Define partial-creation cleanup, reset failure, partial-frame handling and drawing-state recovery before migration. Do not import recorder-specific quarantine rules as an implicit global policy. |
| Persistence / UI | Keep schema-16 `orbs[]` and `bands.overlay` behind compatibility adapters. Use discoverable names/capabilities and optional editor adapters. Exercise the independent example through isolated runtime-only activation in the proof. | Registry inclusion is separate from activation and preset admission. Arbitrary new persisted type definitions require a separately approved schema pipeline; production activation/UI policy remains a decision. No generic persisted Scene or new schema is selected here. |

| Quantity | Units / owner | Meaning to preserve |
| --- | --- | --- |
| World dimensions and retained coordinates | World units / resolved geometry and simulation | Reference geometry; never automatic clipping, collision or retirement. |
| Authored center/radius fractions | Fractions of `world.referenceSpanUnits` / normalized settings | Resolve to world geometry; never viewport fractions. |
| Particle radius, Trace/Ring widths and point sizes | CSS pixels / presentation settings | Multiply by DPR for backing pixels; camera zoom does not scale these marks. |
| Projected locations and canvas dimensions | Backing pixels / projection and Renderer | Ephemeral output coordinates; do not persist or feed them into emission spacing. |
| Optional desired/min/max extents | Explicit world-unit or CSS-pixel extent / type request and host policy | State width/height or radius explicitly. Keep separate from conservative Camera Fit content and current geometry. |

**Decision gate:** owner review must settle the proposed version/minimum lifecycle, discovery convention, host services, resource/update ordering, sizing response, failure recovery and persistence boundary before Stage 3.5. A new type must work by directory inclusion/removal in both built editions, not merely through test injection. Stop for alternatives if this requires a broad Scene/compositor replacement. All recommendations above remain proposals.

## 3. Reproducible benchmark plan (measurement implementation pending)

Pin archived Canon 116 as behavioral reference, pre-117 source `8c21846d`, and every candidate SHA separately. The [117 audit](../audits/117-comprehensive-performance-audit.md) measured older source `2a2565f` with software Chromium; retain its observations without presenting them as current device results.

**Common inputs:** start each case from a fresh `structuredClone(CONFIG.defaults)` and explicitly listed overrides. Clone alternating factory Orbs with unique `bench-<index>` IDs when changing count. Encode through the current schema-16 writer, decode that payload and compare canonical settings; store its hash and exact settings with the case. Full canonical preferences are not themselves a compact schema-16 wire payload. No random scene generation is needed.

Generate one 120-second, 48,000-Hz, two-channel PCM16 little-endian WAV: sample `round(32767 * 0.25 * sin(2*pi*f*n/48000))`, with L=440 Hz, R=880 Hz, initial phase zero. Generate silence with identical dimensions and zero samples. Pin the actual bytes/SHA-256 once and reuse them for all comparisons. These are declared experiment inputs, not new application defaults or guaranteed platform sample rates.

| Case | Fixed setup / action | Required observations |
| --- | --- | --- |
| B0 factory | Factory Scene with no source, then stereo File from position zero; panels in recorded default state and all hidden. Repeat with silence and simulation paused. | Callback/interval pacing, first-frame and startup latency; real particle aging and analysis continue under pause. |
| B1 Ring / zero Orbs | `orbs=[]`, Ring enabled; compare free phase and Orb lock. | Valid L/R/C analysis, no missing-instance access, preserved phase fallback and Ring geometry. |
| B2 editor scaling | 16/64/256 factory-derived Orbs; alternate volume 1/0.5 for 20 commits, then edit only first Orb hue 0/30. Run panel hidden and revealed. | Commit-to-next-frame latency, synchronous projection time, DOM/control counts, focus/drafts and unchanged unrelated values. Measure first usable Edit separately from startup. |
| B3 particles / aging | Two Orbs; initial total populations 1,000/8,000/16,384; TTL 6/60/600 seconds, Fade 0. Seed through owned `TrailSystem.emitAt()`; this does not exercise spacing-based emission. | Use the deterministic history below; record admitted population and age range per sample. Include aging-only and churn runs. Initial count is not a promise of steady population. |
| B4 Trace | 16 Orbs, each 1,001 retained points, `trace.numLines=1000`, TTL 600; compare Fade 0/5/20 with identical histories. | Native pixels/strokes, joins/reversals/overlaps, callback and interval costs; preserve baseline rendering and real aging. |
| B5 Camera / mixed | Repeat B0/B4 at 1280x800 and 375x667 CSS pixels, DPR 1/2; apply the live-pose sequence below. | World/history invariance, CSS-sized marks, Fit and authored/live separation. Programmatic pose replay does not certify native gestures. |
| B6 Queue / waveform / sources | Add the same File object as 100/1,000/5,000 distinct Queue entries; jump/remove middle entry and repeat a track. Separately exercise denied, no-audio, superseded and accepted source transitions. | Entry/focus identity, action latency, extraction count/peak hash, optional-work occupancy and stale-source cleanup. Recreating a File is not an identity-cache hit. |
| B7 recording / lifetime | B0/B4, recording off/on, 30 FPS and the same actual supported codec; five 30-second capture cycles, Stop on cycles 1/2/4 and Cancel on 3/5, replacing the File Queue entry between captures. Repeat the cycle schedule for a separate 60-minute soak. | Capture parity, prior export, cleanup, per-cycle ownership and memory trend; log native/RSS separately from JS heap. Record actual finalization time and policy-triggered Stops; unsupported codec/FPS cases are not comparisons. |

**History/pose recipes:** for each Orb with M seeded points, insert k=0..M-1 in order, at angle `2*pi*k/M + orbIndex*pi`, radius `0.4*world.referenceSpanUnits`, with white `rgbStart`. Birth time is `setupNowSec - 0.9*ttlSec*(M-1-k)/(M-1)`, so insertion is chronological. B3 divides N equally between two Orbs; B4 uses M=1,001. Aging-only pauses simulation after seeding; churn leaves it running. For B5, after warmup and before each sampled callback, use canonical `setCamera()` with `u=i/(sampleCount-1)`: x=100*u, y=-50*u world units, zoom=1+0.5*u, rotationRad=pi*u/4. Save the generated inputs and actual applied poses with the harness revision.

Use production admission; never secretly bypass ceilings or freeze aging to obtain a favorable dense-scene result. Actual wall-clock aging continues through warmup/sampling, and live media is not replaced by a frozen analysis frame. Verify invalidation and adversarial geometry separately with the existing protected validators. Add the owner's actual Hero only from an owner-supplied preset, outside protected fixtures. The synthetic cases can proceed without it.

**Sampling protocol:** proposed initial window is 60 warmup callbacks plus 240 sampled callbacks, in three balanced baseline/candidate/candidate/baseline blocks. Record actual media times, retained populations and elapsed durations; do not pool different environments/editions. Report per-run p50/p95 using nearest-rank percentiles and long-interval counts with the threshold stated. Longer lifecycle/recording runs need separately declared durations. These sample choices are methodology proposals, not FPS/memory acceptance targets.

Measure normal-loop callback duration and rAF intervals separately with a minimal external observer; characterize observer overhead. Use a separate instrumented run for camera, analysis, update, render, UI and scrubber buckets. Preserve normal rAF scheduling and clocks for pacing claims. Interval minus callback is not GPU time; nested phase timings cannot be summed indiscriminately. Keep pixels/task parity, memory cost and negative results alongside speed claims.

**Environment / result record:** exact source/artifact hashes; case/fixture/harness revision; OS, CPU/GPU/backend, browser/version, viewport/DPR, FFT/bands and actual sample rate; resolved settings, visibility, source and recording format; raw samples and summaries; correctness checks; exclusions. Run [README checks](../../README.md#developer-bootstrap) sequentially; never overlap tests/build/watch. Compare portable/hosted from shared bundles, and test portable offline separately.

**Available tooling limitation (source-proven):** [measure-rc15-frame.mjs](../../scripts/measure-rc15-frame.mjs) disables automatic rAF and forces clock deltas; it is an instrumented callback probe, not normal frame pacing. It and [measure-release-resources.mjs](../../scripts/measure-release-resources.mjs) construct schema-10 inputs. Current migration resets legacy fades to 0, so these scripts cannot establish a schema-16 positive-fade baseline unchanged. Reuse their seams only after an explicitly scoped harness adaptation; do not change the historical scripts/evidence in this documentation pass.

**Coverage:** locally available browser automation first; Windows Chrome/Firefox and narrow/touch hardware where available; native Safari, physical permissions, offline launch and long recordings remain separate checks. Distinguish API presence, known unavailability, transient locks and uncertain capture-audio support. Missing devices remain untested. Owner device priorities/task expectations and Hero are open inputs, not prerequisites for source mapping or synthetic harness work.

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

Protected artifacts include all `docs/Canon/` releases/checksums, `tests/fixtures/`, frozen `schema-13-baseline.js`/`schema-16-baseline.js`, historical audits and original remediation/mutation evidence. Passing current tests does not resolve historical Watcher causes or certify untested platforms.

**Source-capability baseline:** [detectSupport()](../../src/js/audio/input-source-manager.js) checks method presence; [syncSourceSelectorUi()](../../src/js/ui/ui.js) already disables unsupported buttons but leaves them visible. No-audio Stream capture already rejects and releases its tracks. Stage 2 should improve capability classification/presentation and diagnostics while preserving those protections, rather than implement them again.

## 5. Small, dependency-ordered candidate passes

| Stage | Small candidate pass | Cost / decision and required evidence |
| --- | --- | --- |
| 0 | Isolated baseline harness and fixture definitions | M; implement B0/B1/B2 first, then deterministic B3–B7 setup. Store inputs/raw results and overhead; no production policy change or invented hardware threshold. |
| 1 | Review this dependency map and contract proposal | M; decide §2 service/lifecycle/ordering/sizing/failure/persistence questions. Review material can advance while browser access is unavailable. |
| 2 | Source capability / lifecycle diagnostic pass | M; actual browser matrix, permission/no-track negatives, cancellation and owned cleanup. Investigate injected File-tap refusal without asserting native reachability. |
| 3 | Same-File peak reuse, then independent upstream planning candidates | M; exact peaks, current admission/cancellation, bounded cache and unchanged playback. Review FFT/ordered-selection needs before downstream contract migration; no visibility-gated removal of required analysis. |
| 3.5a | Build-discovery proof with an independent type | M, after contract acceptance and upstream requirements review; add/remove/invalid/duplicate/cycle cases, both editions, no default activation or schema change. |
| 3.5b | Migrate Orb/Ring adapters | L, after 3.5a; exact simulation/preset/Camera/Fit/composition parity, generic service routing and resource/failure tests. Stop for re-scope rather than leave a partial migration. |
| 4/5 | Simulation and procedural rendering experiments | M–L, after migration for major Visualizer-specific changes; repeated full-frame benefit, default nonregression, bounded memory and exact accepted fade/capture behavior. Reject inconclusive candidates with evidence. |
| 6 | Scoped editor invalidation, then lazy unopened bodies | M then M–L, aligned with the established interfaces; B2 latency plus drafts/focus/listeners/ARIA/picker ownership. |
| 7/8 | Visualizers/Queue/responsive workflows, then QOL | Owner-approved task flows after capabilities/internals are established. Keep advanced capability accessible; Simple/Advanced modes and a separate mobile site remain parked. |

These are candidate passes in the draft's dependency order, not implementation acceptance. Unrelated bounded optimizations may proceed independently when their prerequisites are resolved; the table must not pull major migration ahead of upstream decisions. Watcher diagnosis remains a separate track. The [draft](auralprint-build-117-spec-draft.md) owns the proposed later integrated/release sequence; ROADMAP remains acceptance authority.

## 6. Verification on this checkpoint

The initial checkpoint (`58e5892`) recorded source inspection only. During the preceding Step 0 study, exact `v117_dev` `afa1612` was checked locally on Linux with Node 24.22.1, npm 11.9.0, Python 3.12.14, esbuild 0.25.12 and locked Playwright 1.64.1:

- Locked `npm ci` completed. Sequential `npm test`: **1,548 passed, zero failed, one existing opt-in retention skip**.
- `npm run build` and `python scripts/verify_distribution.py` passed; portable HTML was byte-identical to Canon 116, whose SHA256SUMS passed.
- Application JS/CSS/template and package files matched `v116`. The attachment matched the repository draft. The checkout was clean; no production changes were made.
- Native browser checks were **not run**: the pinned Chromium headless-shell download failed with an invalid/truncated ZIP. No browser performance, physical-device, offline or long-session result is inferred.

This reconciliation changes only the checkpoint document and ROADMAP's completed-packaging status/planning pointer. It reuses the above same-source baseline evidence; documentation link/fragment, protected-path and whitespace verification are recorded in the PR. No benchmark harness, production migration, contract approval, version/schema change or milestone promotion is delivered. The next concrete engineering pass is the isolated B0/B1/B2 measurement harness; the contract decision gate remains before Stage 3.5.
