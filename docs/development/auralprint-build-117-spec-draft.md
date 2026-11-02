# Auralprint Build 117 — Development Specification (Draft 1)

**Target:** Build 117 (`v0.1.17` when designated); **theme:** Quality of Life · UX Overhaul · Optimize · Harden.  
**Basis:** owner-approved dependency order, 2026-11-01 discussion, current `Auralprint1/main` (`8c21846d4433376fc4568bc51810075fb42385c7`), `ROADMAP.md`, `AGENTS.md`, and the merged `117-comprehensive-performance-audit.md`.  
**Status:** proposed normative specification for owner approval; not a release authorization or permission for an unrestricted refactor. No implementation or acceptance is implied by this draft. On acceptance, link it from `ROADMAP.md` (which remains the scope/acceptance authority); do not create competing policy ownership.

## 1. Objective

Make the capabilities shipped through Build 116 more usable, efficient, extensible, and reliable. Prefer removal of unnecessary work and friction over additional end-user features. Each change must justify its runtime cost, complexity, ownership, and regression exposure.

**Success** means users can complete existing tasks more easily, ordinary and demanding scenes behave at least as correctly as Canon 116, resource and lifecycle behavior is more predictable, and verified improvements are supported by reproducible evidence rather than intuition. A faster microbenchmark alone is not sufficient.

## 2. Authority and invariant contracts

1. **Reference:** Build 116 / Release 5 `v0.1.16`, preset writer schema 16, is the accepted immutable Canon. Preserve earlier shipped builds, checksums, protected fixtures, frozen compact baselines, and published preset meanings. The approved 117 hosted-metadata packaging work (merged PR #106) is already complete; do not schedule it again.
2. **Ownership:** `CONFIG → preferences → runtime.settings → state`; analysis is independent of Visualizers; consumers cannot mutate producer-owned analysis data; a subsystem may dispose only resources it owns.
3. **Data/visual semantics:** Preserve genuine L/R/C analysis, current channel/selected-band semantics, authored versus live Camera, independent world geometry, stable Orb identity, zero-Orb behavior, particle aging/governor/fairness, Trace Fade 0 and accepted positive fades, color/compositing order, Queue/source cancellation, scrubber ownership, recorder tap/export and prior-export preservation.
4. **Distribution:** Preserve one self-contained, offline-capable portable HTML and the first-party hosted edition from the same runtime bundles; no runtime plugin downloads or mandatory external assets. Any new first-party preview image is a release-branding update, not an unfinished 117 build-system feature.
5. **Process:** Executable source and reproduced behavior outrank stale comments, tests, reports, or proposed designs. Every implementation has bounded scope, explicit regression risks, independent review, applicable automated/physical evidence, and an owner-controlled merge/release gate. Do not introduce silent fidelity reductions, undocumented policy constants, or new dependencies without approval.
6. **Preset/schema:** Writer schema remains 16 unless an approved persisted change *requires* a new schema. If it does, the entire defaults/normalization/admission/codec/migration/compact-baseline/test pipeline must be designed and approved before implementation. Schemas 2–13 retain meaning; 14/15 remain reserved and rejected.

## 3. In scope and boundaries

**Required workstreams:** measurement and architecture inventory; browser/mode compatibility; source/recorder/Watcher diagnosis and hardening; data-processing and simulation optimization; procedural rendering and frame pacing; Visualizer extensibility; efficient UI projection; Visualizers/Queue/narrow-screen UX; general QOL; integrated accessibility/regression/device validation.

**Explicitly parked:** Simple/Advanced presentation modes, the separate mobile-site alternative, and any policy that makes the default experience intentionally hide advanced capabilities. Responsive usability remains in scope **without** deciding presentation modes.

**Not authorized by this specification:** new musical/temporal features, 118's expanded band selection or spectral migration, 119's local preset-file workflow, 120's 3D renderer, wholesale WebGL/Three.js/PixiJS migration, sprites as the default solution, Particle Birth Color, Angular Trace, dynamic third-party runtime plugins, a broad Scene/compositor rewrite, or general refactoring unconnected to an accepted workstream. Experiments may be separately approved; experiments are not production selections.

**Candidate, not guaranteed implementation:** The sixteen `AUD117-*` performance findings are investigation inputs. A candidate is implemented only after demonstrating benefit at acceptable fidelity, memory, and complexity cost. Findings with negative or inconclusive results can be closed as *rejected with evidence*.

## 4. Dependency-ordered execution plan

These stages are the approved **dependency order**, not an inflexible mandate that all work in one stage must stop before another begins. Each stage has a reviewable output and owner acceptance. Work on a protected subsystem must include its own tests immediately; final validation is not the first regression gate.

| Stage | Goal / principal work | Exit evidence |
| --- | --- | --- |
| **0 — Reference and measurement** | Pin Canon 116 and current main; define deterministic workloads including factory, common, Hero when owner-supplied, high-Orb, dense particles, fade 0/5/20, camera, Queue, source/recording; instrument p50/p95 intervals, callback buckets, startup/edit latency, memory and long frames across available browsers/devices. | Reproduction recipe, environments, clear baseline limitations and protected-behavior comparison. Existing 117 audit is input, not a substitute for owner-device measurements. |
| **1 — Architecture/dependency mapping** | Inventory producers/consumers, settings ownership, update cadences, allocation hotspots, lifecycle boundaries, UI capabilities and actual control requirements; **define the Visualizer abstraction** and assess its compatibility. | Dependency map, risk/decision register, proposed versioned Visualizer contract and approved implementation gates; no broad implementation rewrite. |
| **2 — Source and lifecycle hardening** | Firefox display-capture audio handling; capability-aware source controls; Mic/Stream/File transitions; cleanup ownership; recorder memory/native finalization diagnostics and injected File-tap cleanup refusal. | Supported/unsupported/uncertain capability matrix, correct error/cleanup behavior, reproducible negative paths and cross-source/recording regression tests. |
| **3 — Analysis/data efficiency** | Same-File waveform peaks reuse; FFT band planning; selected-band computation; transaction-local preset work; distinguish necessary producer contracts from truly unused work. | Correct L/R/C data and unchanged preset meaning; measured improvements or documented negative outcomes; bounded caches with invalidation and admission. |
| **3.5 — Visualizer architecture migration** | After 1's contract is approved and 3's upstream data requirements are stable, implement deterministic build discovery and generic runtime integration; migrate Orb/Ring while preserving their behavior. | Contract tests, dynamic registry proof via a small independent example, current Scene/preset equivalence and no runtime external modules. This is a **gate before major Visualizer-specific simulation/render and UI redesign**, not necessarily before unrelated standalone optimizations. |
| **4 — Simulation/resources** | Remove avoidable per-object derivation; bound/adapt retirement and reset; preserve Clock/Governor ownership, particle ordering, TTL, spacing, emission and pause semantics. | Deterministic parity, no hidden admission changes, bounded worst-case work/memory and measurable result where optimization is adopted. |
| **5 — Rendering/frame pacing** | Procedural particle presentation, Trace composition, Ring geometry, prepared projections, scene-visibility/size research; measure end-to-end p95 and browser/native effects. | Pixel/compositing/Camera/recording checks for accepted optimizations and improved realistic frame pacing; rejected approaches documented. |
| **6 — UI processing internals** | Dependency-aware invalidation, lazy Orb editor construction, keyed Queue operations, scrubber preparation and idle/hidden-panel update discipline; align with generic Visualizer contracts. | No stale controls/drafts, focus/listener regression or unnecessary large DOM work; quantified startup/edit/render overhead. |
| **7 — UX overhaul** | Design the Visualizers Workspace after Stage 3.5/6 establishes supported capabilities and efficient controls; improve Orb/Ring inventory, selection, contextual editing, bulk operations, Queue, panels and responsive desktop/mobile layouts. | Owner-approved workflows; existing advanced capability remains accessible; high-count navigation and small-screen interaction pass task and accessibility tests. |
| **8 — QOL refinement** | Improve feedback, discoverability, tooltips, transport and panel workflows, actionable errors, keyboard and touch. Polish the new experience rather than the old one. | Documented usability checks across normal, empty, loading, error and finalizing states. |
| **9 — Integrated hardening** | Repeat end-to-end source/Queue/recorder/Camera/Visualizer/preset/distribution tests; memory and long-session runs, physical browsers, adversarial audit, device qualifications and watcher diagnostic disposition. | All release gates pass or owner explicitly records an accepted qualification; no unresolved critical correctness regression. |
| **10 — Release** | Reconcile roadmap/worklog/changelog, prepare candidate, verify exact artifact and canonical hash, obtain owner approval for RC then release/deployment separately. | Owner-approved Canon decision; correct archives, checksums, distribution and published release information. |

**Parallel tracks:** Watcher `AUD116-006/R2-003` (intermittent Ubuntu duplicate saves) and Windows child-process termination are **distinct unresolved diagnostic risks**, investigated alongside Stages 1–6 without weakening assertions. Browser/physical hardware coverage, automated regression, documentation of decisions and accessibility checks continue throughout.

## 5. Visualizer contract — design requirements (`117-ARCH-VIZ`)

### 5.1 Intended result

A valid Visualizer implementation placed in the prescribed source directory can be **discovered, validated, statically included and registered by the build** without editing central runtime code or the static JS entry-point import list. A Scene activates/configures instances; mere inclusion does not instantiate them or change default visuals. The portable edition remains monolithic and functional offline.

### 5.2 Minimum abstract definition

A Visualizer is a uniquely identified, lifecycle-managed, configurable *type* capable of producing visual content from application-provided services, with zero or more runtime *instances*. It need not emit particles, consume audio, or have continuous motion. The Spectral Ring may be singleton; Orb supports multiple ordered instances. **Type IDs and instance IDs are distinct.**

The contract design must explicitly cover:

- **Discovery/registration:** fixed location/entry convention; exported descriptor and contract version; stable type ID; deterministic ordering; duplicate and malformed descriptor failure; supported dependency resolution; no hidden network fetch or runtime `eval`.
- **Core lifecycle:** creation/initialization, `update`, `render`, visibility, reset semantics, explicit disposal and ownership of allocated resources. Define error isolation and teardown failure behavior before implementation.
- **Services/data:** read-only or appropriately scoped analysis inputs (L/R/C), normalized settings, simulation and real-time clocks, world dimensions, Camera/projection and viewport/DPR. No direct Web Audio internals or new writable authorities.
- **Geometry/sizing:** clarify world units versus normalized world fractions versus CSS pixels/backing pixels; allow each Visualizer to state supported/desired and min/max output dimensions in their appropriate units. World bounds are **not** automatic clipping, collision, or retirement limits.
- **Update/render order:** declare dependencies separately from draw order. Existing Orb motion preceding Orb-locked Ring phase and Ring-first drawing must remain correct without hardcoding individual types in the generic coordinator.
- **Composition/fit:** optional conservative Camera Fit extent; explicit layer/order and blending semantics; shared Canvas lifecycle/recording remains canonical. No presumption of a new render backend.
- **Capabilities/UI:** explicit discoverable name/description and editable capabilities; owner-defined settings controls or editor adapters without assuming all types have Orb fields. A generic inventory must not silently misrepresent unknown types; UI design is decided at Stage 7.
- **Configuration/presets:** CONFIG-owned limits/defaults and validators; stable instance identity/order, optional singleton admission, normalization/migration and compatibility. **Do not choose a new persisted Scene representation or schema until approved.**
- **Resources/bounds:** declared ownership and applicable resource policies; no implicit participation in the Orb particle governor; bounded work, allocations and disposal. Optional capabilities must not become fake required methods.

### 5.3 Required proof before promotion

1. Existing Orb instances and the Spectral Ring pass protected simulation, ordering, rendering, Camera Fit, editing and preset tests without semantics changes.
2. A minimal independent Visualizer type can be dropped into the prescribed directory, discovered and bundled in **both** HTML editions without manual central imports; removing it from the source removes it from the registry. Invalid/duplicate definitions fail the build deterministically.
3. Discovery does not auto-activate the example or modify defaults, and browser execution succeeds without external JavaScript/assets.
4. Memory/resource lifetime and failure/teardown behavior are tested; no new dependency or policy constant is silently introduced.
5. Any necessary canonical interface or persisted schema changes are separately proposed, reviewed, versioned and migrated. The contract is **not yet frozen** by this draft.

**Stop condition:** If meeting this proof requires excessive scope, a new Scene architecture or incompatible changes, present alternatives and costs to the owner rather than half-migrating the runtime or silently expanding the milestone.

## 6. Investigation register and mapping

The merged [117 comprehensive performance audit](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/main/docs/audits/117-comprehensive-performance-audit.md) owns detailed evidence. Assign candidates to the most relevant stages; do not equate every observation with a mandatory code change.

| Stage | Audit IDs | Candidate focus |
| --- | --- | --- |
| 3 | `AUD117-002`, `007`, `008`, `012`, `015` | Waveform, analysis/output contracts, band maps, preset transactions, shared derivations |
| 4 | `AUD117-013`, portion of `015` | Bulk particle retirement/reset, simulation-derived work |
| 5 | `AUD117-003`, `005`, `006`, `014`, `016` | Particle colors/allocations, positive-fade cost, Camera/Ring, panel compositing, presentation gating |
| 6 | `AUD117-001`, `004`, `009`, `010`, `011` | Editor invalidation, DOM materialization, scrubber/idle UI, Queue rows |
| Parallel | `TOOL117-001`–`003`, `AUD116-006/R2-003` | Watcher diagnostics, assembly and CI only after measured need |

**Evidence rule:** classify each proposal *measured*, *source-proven*, *inference*, or *unverified*. Full-frame pacing and realistic mixed workloads outrank single-function timing. Preserve negative findings (e.g. prepared Camera math and default-scene CSS cache do not have a universal demonstrated win).

## 7. Compatibility, accessibility and lifecycle specifics

- **Firefox/Stream:** `getDisplayMedia` API existence is not proof of audio-track support. Keep existing no-audio detection and track release; distinguish known unsupported, supported-but-temporarily-disabled and uncertain-until-capture conditions. Do not promise Firefox display audio without device/browser evidence.
- **Mode controls:** On browsers/modes known unavailable, do not advertise unusable Mic/Stream choices as workable. Evaluate visibility versus disabled explanation in the approved UX design; uncertainty must not be confused with permanent lack of support. Preserve File access and existing permission flows.
- **Mobile:** Improve tap targets, gesture conflict avoidance, panel recovery, viewport orientation/narrow-screen operation, focus and keyboard/screen-reader behavior. **No Simple Mode, Advanced Mode switch, or second mobile site is authorized.**
- **Source/recorder:** Preserve request epochs, winning source, Queue revision fences, record finalization, upstream track ownership, previous successful exports, and failure quarantine. `AUD116-005` is injected cleanup-refusal evidence, not proof of an ordinary native defect. Native encoder/Blob RAM is not bounded by encoded-byte policy.
- **Rendering:** Preserve unmodified Canon reference output unless the owner explicitly accepts a visible difference. Continue procedural/Canvas-first research, including Fade 0 and positive fade fidelity, high-DPI, camera transformations and capture output.
- **Watcher:** Distinguish Ubuntu duplicate-save from Windows child-survival; passing reruns do not resolve causes. No arbitrary debounce tweaks, assertion suppression or major worker rewrite without reproduced cause and approval.

## 8. Per-pass Definition of Done

Each reviewable change must include:

1. A narrowly named problem, baseline, hypothesis and approved scope; correct dependency placement; explicit interface/CONFIG/preset/resource impact and regression risks.
2. Code-level proof of changed behavior, appropriate negative tests and comparison to protected 116 semantics. Source, test, and evidence agree; failures are not hidden by weakened assertions.
3. Deterministic or reproducible before/after measurements for optimization claims, with environment and realistic p50/p95 frame intervals and workload definition where relevant; memory, fidelity and complexity costs reported.
4. Existing `npm test`, `npm run build`, `python scripts/verify_distribution.py` and applicable browser/camera/preset/recording/Watcher tests; Windows/Ubuntu CI and physical-device checks as applicable. Do not run overlapping build/watch processes against a shared output directory.
5. No resource leaks, stale listener ownership, broken focus or inaccessible controls; Scene import/export and portable/hosted parity preserved.
6. A concise repository-visible report of outcome, open qualifications and accepted/rejected hypotheses; owner reviews before merge and before any new milestone is declared complete.

## 9. Build-level completion and release gates

Build 117 can enter RC consideration when all **mandatory contracts and owner-accepted workstreams** are complete, or remaining items have explicit owner-approved dispositions; all critical regression gates pass; the Visualizer contract has either passed its proof or received an explicit re-scope decision; and the application remains credible on constrained hardware with documented limitations.

Do **not** invent numerical FPS/memory targets without a measured reference and owner-approved device/scenario thresholds. Baseline comparisons must include realistic default and stressful scenes; a performance win may be workload-specific but may not silently degrade the default experience. Release is a separate owner decision after RC acceptance, exact-head validation, canonical artifact generation/checksum and deployment verification.

## 10. Immediate first milestone (117-0/1)

**Deliverable:** a repository-visible architecture/dependency map and benchmark plan, **not** production code migration. Identify all real Visualizer service/ownership dependencies, unresolved contract decisions, work saved by likely interface changes, and protected fixtures. Present an ordered list of small implementation candidates with cost, proof requirements and owner decision points.

**Stage 1 decision gate:** Approve/revise the Visualizer type-vs-instance model, mandatory/optional capabilities, dependency/update ordering, host service boundaries, sizing units and persistence strategy **before** starting Stage 3.5 migration or Stage 7 UX design.

---

**Source pointers:** [ROADMAP](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/main/ROADMAP.md) · [AGENTS](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/main/AGENTS.md) · [117 audit](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/main/docs/audits/117-comprehensive-performance-audit.md) · [Visualizer runtime](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/main/src/js/render/visualizer-runtime.js).
