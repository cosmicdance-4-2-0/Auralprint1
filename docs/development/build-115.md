# Build 115 development history

Build 115 — **Visualizer Architecture + Orb Overhaul v1** — is **Release 4 (`v0.1.15`)**, owner-accepted October 20, 2026 after the 115N public RC. Preset schema **10** is frozen. The [README milestone](../../README.md#build-115--v0115-visualizer-architecture--orb-overhaul-v1), [roadmap](../../ROADMAP.md), and [release comparison](build-115-release-delta.md) state the final disposition; this file preserves engineering chronology and immutable audit evidence.

Accepted corrective history includes watcher correction PR #56 and October 9 AUD-006 recorder changes through PRs #57–#60 (`1bd8ef65b3589f0d1ef321edaf07e177d94ced01`). Final 115N owner acceptance is separate from those corrective reviews. Historical audit reports retain their original checkpoint statuses.

The historical I.E documentation reconciliation started from [`a198b14b087da6b855041c3a23acb550a156ff4e`](https://github.com/cosmicdance-4-2-0/Auralprint1/commit/a198b14b087da6b855041c3a23acb550a156ff4e), merged [PR #43](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/43), `v0.1.15m.i.d`. RC-01–RC-22 corrective review and merge were complete at that baseline. Final 115N acceptance occurred later, on October 20, 2026. “Closed” in historical entries describes the corrective disposition; it does not claim universal browser/device certification.

## Intent and original architecture

Build 115 establishes an analysis-consumer boundary and independent visualizer ownership before Camera work. The approved direction is source/audio analysis → AnalysisFrame → visualizers → renderer, with Camera/projection deferred to Build 116. It does not turn Auralprint into a decorative visualizer with analysis bolted on.

Earlier Scene-node/compositor experiments were superseded by the current smaller runtime and workspace boundaries. Their schema-9 payloads still matter for compatibility: the codec recovers supported Orb and Band Overlay configuration, prefers explicit top-level data, and discards abandoned Scene bounds, anchors, editor/order/visibility and camera semantics. It does not restore that architecture. The [schema policy](../../AGENTS.md#21-schema-discipline) defines the surviving contract.

## Early architecture stages 115A–115L

All PR links here refer to merged repository history, not public releases.

| Phase | Completed change and decision | Accepted evidence |
| --- | --- | --- |
| A–B | Rebaseline actual scope; reusable AnalysisFrame exposes read-only-by-contract producer buffers and metadata instead of visualizers sampling Web Audio internals. | [PR #1](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/1), [AnalysisFrame](../../src/js/audio/analysis-frame.js) |
| C | Shared `id/type/isVisible/update/render/reset/dispose` lifecycle; runtime owns composition, renderer owns drawing/canvas. | [PR #2](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/2), [runtime](../../src/js/render/visualizer-runtime.js) |
| D | Schema 10 moves motion, response, particles and trace into independent Orb configuration. Schema-2–9 global settings migrate into separate nested copies. | [PR #3](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/3), [codec](../../src/js/presets/preset-codec.js) |
| E | Zero/one/N runtime, stable identity, model Add/Duplicate/Remove and ID-based reconciliation preserve surviving live history. Duplicates copy design, not simulation. | [PR #4](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/4), [collection](../../src/js/core/orb-collection.js), [Orb runtime](../../src/js/render/orb-runtime.js) |
| F / F.A | Extract focused workspace/editor seams. Tactical hardening fixed zero-Orb compatibility no-ops, tested the seam and removed redundant picker synchronization without redesigning architecture. | [PR #5](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/5), [PR #6](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/6) |
| G–H / H.A | Runtime-backed Visualizers inventory and generated stable-ID Orb cards. Reference-based refresh avoids unchanged-frame DOM/picker work; inherited dominant color follows selected targets, while explicit dominant remains global C. | [PR #7](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/7), [PR #8](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/8), [PR #9](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/9) |
| I / I.A | Complete per-Orb editing and Bulk Edit. Designed phase is displayed in degrees, applied by Reset Visuals, and distinct from live phase. Hardening synchronized select/accessible readouts, used runtime.settings for invalidation and eliminated duplicate runtime sync on edits. | [PR #10](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/10), [PR #11](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/11), [editor](../../src/js/ui/orb-editor.js) |
| J / J.A | Dedicated Orb-independent Analysis workspace; channel-complete L/R/C FFT buffers and band energy arrays share one definition. This deliberately changes targeted L/R response from historical combined-spectrum energy without migrating schema 10. Three channel reads/calculations remain intentional; demand-driven channel pruning was not adopted. | [PR #12](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/12), [PR #13](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/13), [Analysis UI](../../src/js/ui/analysis-panel.js) |
| K | Historical Band Overlay becomes singleton Spectral Ring with its sole editor in Visualizers. It consumes C spectrum/waveform; free phase resets to zero, explicit Orb lock follows the first Orb and safely holds with none. Persistence stays `bands.overlay`. | [PR #14](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/14), [Ring editor](../../src/js/ui/spectral-ring-editor.js) |
| L | Shared Scene background/fixed color/default policy/palette ownership; Orb source/hue and trace mode remain local. Transitional Bands workspace is retired. No persisted Scene object or independent Ring palette is added. | [PR #15](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/15), [color policy](../../src/js/render/color-policy.js) |

## Preset and lifecycle hardening through 115M

| Revision | Accepted work | Evidence |
| --- | --- | --- |
| M / M.A / M.B | Runtime URL application rebuilds changed BandBank definitions; Nyquist-bounded floor geometry remains ordered; proportional waveform peak buckets eliminate low-resolution tail clumping. | [PR #17](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/17), [PR #18](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/18), [PR #19](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/19) |
| M.C | Orb content refresh preserves editor card position instead of moving cards during editing. | [PR #20](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/20) |
| M.D | Settings consolidates Scene appearance/presets, preserves local overrides and panel-owned feedback; generic synchronization is silent. | [PR #21](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/21) |
| M.E | Prefer stereo Stream acquisition and expose actual returned channel metadata; validate stereo/left-only/right-only/dual-mono and file/stream graphs. Native permission/device breadth remained outside that probe. | [PR #22](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/22), [diagnostic](../../scripts/validate-stream-stereo.cjs) |
| M.F | Pure codec owns sanitation/migration on encoding and decoding; URL transport replaces preferences, callers resolve/synchronize. Both schema-9 layouts recover supported equivalents; runtime/session state cannot leak into presets. | [PR #23](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/23), [schema-10 contracts at the merged M.F revision](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/e501398784a55838bd1d2553375bb0e98ddcde7c/tests/preset-schema-10.test.js); [current successor](../../tests/preset-schema-12.test.js) |
| M.G | Visualizers absorbs Orb editors and Bulk Edit; the separate Orbs workspace is retired. Inventory/edit actions use existing editors rather than duplicate configuration owners. | [PR #24](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/24) |
| M.H | Pre-RC status ownership, portable invocation/tests and repository hygiene. This was implementation closure, not proof of release readiness. | [PR #25](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/25), audited [commit `0cd7995`](https://github.com/cosmicdance-4-2-0/Auralprint1/commit/0cd79958d3f0156d52c4f68e36458298d6accd9b) |

## Release-audit discovery and priorities

The [October 6 audit](../audits/2026-10-06_214431_PDT-release-audit.md) describes `v0.1.15m.h` / `0cd7995`: 22 findings (one P1, fourteen P2, seven P3). The [contemporaneous evidence](../audits/evidence/2026-10-06_214431_PDT/README.md) asserts historical defects. Exit 0 in those probes may mean a defect reproduced; it is not a passing intended-behavior test.

The audit withheld canonical promotion despite a passing suite/build. Priorities were terminating identity allocation, export retention, asynchronous source/transport ownership, spectrum/identity/phase correctness, keyboard/media/touch recovery, and measured resource governance. The original observations and subsequent intermediate “open” statuses remain unchanged.

## Corrective remediation sequence

### Identity, transport, recording and interaction corrections

M.H.A used exact BigInt suffix arithmetic to terminate huge-ID allocation without banning opaque string identities or persisting BigInt. M.H.B added clean locked Linux/Windows CI as infrastructure, with sequential tests/build, package-only caching and ignored generated directories.

M.H.C retains the last successful recording through new capture attempts/failures. Successful replacement captures the old URL by value, commits the new metadata, then revokes the old URL once. Ordinary Reset keeps the export; terminal disposal clears it. M.H.D synchronously enqueues picker/drop batches and invalidates current load ownership before Clear/final removal, preventing stale continuations from resurrecting playback or remaining files.

M.H.E supplies the existing source activation guard to AudioEngine, checking after resume and before graph replacement. A cancelled Mic/Stream attachment releases only acquired tracks; stale failures cannot overwrite the winning source. M.H.F captures the intended media element for Play, revalidates after resume/play, and quietly exits when ownership is lost. A fresh element per file load makes identity sufficient; a new transport-generation framework was not required.

M.H.G retains EOF context during recording finalization: File, media element, repeat policy at EOF and load request ID. Recording refresh consumes it once after completion/error, checks ownership and uses the ordinary `loadAndPlay()` queue/repeat policy. Reset/source/replacement invalidates it. [PR #34](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/34) additionally verifies reentrant replay; the RecorderEngine/AudioEngine/Queue ownership boundaries remain intact.

M.H.H–O correct band coverage, FFT scale, incoming ID reservation, current-frame Ring lock, mixed Bulk selection, decoder-led media admission, focus ownership and touch cancellation. They were merged together in PR #35. M.H.P fixes the post-merge Queue Hide edge: use the Queue toggle when Audio is visible, otherwise expand/focus the Audio launcher without opening Audio; preserve outside focus. PR #36 completes that corrective sequence.

### Resource-governance decisions and superseded approaches

The [M.H.O stop report](../audits/remediations/115m-h-o-rc15-stop/README.md) preserves independently measured unbounded work and the product-policy stop. No arbitrary cap was silently imposed at that checkpoint. The accepted follow-up spans two cumulative PRs:

| Phase | Decision / result | Evidence |
| --- | --- | --- |
| M.H.Q | Retire proximity deletion and `overlapRadiusPx`, including individual/Bulk controls. Accept obsolete development inputs but strip them. Independent immutable 1/30 s emission-work timing cap replaces an imported value controlling burst safety. | [Phase 1](../audits/remediations/115m-h-q-rc15-phase1/README.md) |
| M.H.R | One runtime-owned ephemeral ParticleGovernor; fair equal-quantum scheduling, discarded refused whole demand with preserved fractions, globally oldest retention and intrusive chronological trails/indexed heap. Initial fixed 512/16,384 ceilings were an intermediate policy. | [Phase 2](../audits/remediations/115m-h-r-rc15-phase2/README.md) |
| M.H.S | Provisional 4,096-Orb admission, atomic oversize refusal, single-pass ID repair, direct Trace suffix traversal and removal of demonstrated quadratic tooltip/editor discovery. Runtime validates count/unique identity before mutation. | [Phase 3](../audits/remediations/115m-h-s-rc15-phase3/README.md), merged [PR #37](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/37) |
| M.H.T | New placement filter compares only the same Orb's retained tail before scheduling, in CSS pixels scaled by DPR; default 0.5, zero bypass. Nonzero spacing admits at most one sampled-position candidate per callback, keeps fractions and discards redundant whole opportunities. It is not an alias for overlap deletion. | [Placement](../audits/remediations/115m-h-t-rc15-spacing/README.md) |
| M.H.U | Supersedes fixed default-valued ceilings with persisted user selections: emissions 0–16,384/update and retention 0–1,048,576, defaults 512/16,384. Settings owns controls/diagnostics; in-place policy edits preserve governor/trails/fairness. Lower retention retires oldest before rendering; zero emissions preserves history, zero retention clears/rejects it. | [Budgets](../audits/remediations/115m-h-u-rc15-budgets/README.md) |
| M.H.V | Separate bounded emission time, visible elapsed motion and monotonic real age. Exactly 0.5 s integrates; larger/hidden/invalid gaps discard both deltas/debt. Pause freezes Orb/free Ring motion/emission while TTL ages. Ordered expiry inspects the expired prefix plus first survivor; out-of-order direct callers retain a conservative fallback. | [Timing/performance](../audits/remediations/115m-h-v-rc15-timing-performance/README.md) |
| M.H.W | Cumulative hostile review, synthetic history, mutations and native comparisons; no additional production algorithm defect reproduced. Adverse timings and attribution uncertainty retained. | [Final review](../audits/remediations/115m-h-w-rc15-final-review/README.md), [acceptance matrix](../audits/remediations/115m-h-w-rc15-final-review/acceptance-matrix.md), [performance tables](../audits/remediations/115m-h-w-rc15-final-review/performance-tables.md), merged [PR #38](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/38) |

The early fixed ceilings and “all visual time capped at 1/30 s” descriptions are **superseded** by H.U/H.V. The current contract preserves bounded emission while restoring ordinary slow-frame angular motion. No cross-Orb proximity search, cached coordinate index, interpolation, second expiry index, batching, adaptive quality system, or Camera change was adopted.

Schema 10 remains unpublished. H.Q removal, H.T placement, H.U resource selections and later I.A phase normalization are narrowly approved pre-release exceptions, not permission to reuse a shipped schema incompatibly. [AGENTS.md](../../AGENTS.md#21-schema-discipline) retains their precise authority.

The synthetic 16-Orb history exceeds a rotation under its documented speed/TTL/capacity; the Trace suffix can cover less than the retained particle history. The exact human preset was unavailable. Heavy Canvas/UI work, large synchronous trim/expiry, sparse low-FPS placement, uncertain dense-callback attribution and full-million visual usability remain limitations or unverified acceptance. Closure of the corrective sequence does not erase these observations or promise constrained-device FPS; broader optimization remains Build 117.

### Final correctness and packaging preparation

115M.I discards malformed/noninteger/numeric-string band references while retaining numeric targets, order/deduplication and empty-target full-channel fallback. Human text parsing explicitly produces numbers; historical writers require no numeric-string migration. It independently verifies RC-18 pause, already corrected incidentally in H.V, without another Ring implementation change.

I.A normalizes designed phase into `[0, TAU)` while retaining canonical fractional precision. Native range uses `step=any` with one-degree Arrow increments; 360° commits zero and refreshes thumb/readout/ARIA together. Live phase/history stay independent until Reset Visuals. I.B makes public recorder disposal terminal: invalidate session before native stop, fence callbacks/timer, release only owned resources, discard chunks/exports. AudioEngine owns file taps; InputSourceManager owns live tracks; merged references convey no ownership. Native shutdown/cleanup failure remains truthful and disabled until explicit reinitialization; ordinary Stop finalizes exports.

I.C corrects channel-specific band-picker help and type-plus-ID Remove confirmation without reserving `spectral-ring` against valid Orb IDs. I.D addresses metadata packaging after canonical asset intake [`f5bbf2a`](https://github.com/cosmicdance-4-2-0/Auralprint1/commit/f5bbf2a25ffbf8b122e81bd9f54e3639a53a6243): shared template/bundles produce portable embedded-SVG HTML and a relocatable hosted package with six unchanged icons and a generated package-relative manifest. Root/subdirectory HTTP probes pass; direct `file://` remains blocked/unverified. Maskable-safe art is not certified; unrelated OG artwork is unused. At that historical checkpoint, watch tracked JS/CSS only; I.M below corrects template/version/branding monitoring. No PWA/service-worker or hosted caching subsystem is introduced.

I.E advances development metadata only, restores product/plan/history separation, and creates an internal [release-delta preparation draft](build-115-release-delta.md). It does not change application behavior, schema, canonical artifacts, audit evidence, release numbering or acceptance.

## Subsequent F/G/H and AUD-007 waveform governance

F (`v0.1.15m.i.f`, PR #46) corrected demonstrated File/source identity and cleanup; G (`v0.1.15m.i.g`, PR #48) accepted focus/target/numeric corrections; H (`v0.1.15m.i.h`, PR #49) eliminated unchanged UI writes. Their evidence remains immutable. These October 9 AUD IDs are separate from the older October 6 RC index below.

| AUD-007 phase | Revision / accepted checkpoint | Scope and disposition |
| --- | --- | --- |
| I.1 | v0.1.15m.i.h; PR #50 | Design/investigation: demonstrated overlapping whole-file optional work; no implementation authorization at that checkpoint |
| I.2A | v0.1.15m.i.i; PR #51 | One unsettled whole pipeline and one replaceable latest intent; extractor/presentation split |
| I.2B | v0.1.15m.i.j; PR #52 | Pure CONFIG encoded/estimated-PCM policy and bounded metadata adapter; production activation still deferred at that checkpoint |
| Foundation integration | PR #53; main 56f8f8e | Accepted I.1/I.2A/I.2B work integrated into main |
| I.2C | v0.1.15m.i.k; PR #54; accepted main 45cbf55 | Production admission, bounded probe ownership, application-only choices and contextual manual Generate; direct-file automation restriction explicitly reported |
| I.2D | v0.1.15m.i.l; merged PR #55 / main a2f484b | Independent hostile acceptance, two demonstrated admission callback-order corrections, permanent controls, native/resource calibration and current documentation reconciliation; closure recommendation requires human review/merge |

[Final review package](../audits/remediations/115m-i-i-aud007/final-acceptance/README.md) owns the current recommendation and evidence. The owner supplies cross-browser functional acceptance in Chrome, Opera, Edge and Firefox using direct local files and Python hosting; exact codecs and a complete browser/mode/case matrix are not inferred. This supplements managed Chromium automation, whose file:// navigation remains administrator-blocked. Networking-disabled offline execution remains a narrower 115N portability gap.

AUD-007 closure review is distinct from Build 115N acceptance and shipment. Waveforms remain optional; playback/seek/source/recording ownership is primary. Source ceilings govern encoded bytes and estimated PCM, not total native/browser memory. Prior phase statements remain accurate historical checkpoints and are not overwritten.

## 115M.I.M — AUD-011 watcher correctness

The accepted starting point is main `a2f484b845df69e717ebd3998cabb7db640eb6c6`, merged PR #55, root `v0.1.15m.i.l`, schema 10. I.M advances development metadata to `v0.1.15m.i.m` and corrects only builder/watcher integration. JS/CSS dependencies, template, root version and flat branding inputs trigger coherent staged assembly; version metadata is selected afresh for each candidate. Assemblers remain serialized, superseded snapshots are discarded, and errors retain prior successful artifacts. Earlier versioned portable HTML is retained until an explicit developer cleanup.

The [remediation report](../audits/remediations/115m-i-m-aud011/README.md) records original reproductions, permanent integration coverage, hostile testing, recovery/lifecycle behavior and Linux/Windows evidence. **AUD-011 corrective implementation was merged via PR #56 (`a85ed8d7`); broader 115N release acceptance remains separate.** The October 9 audit/materials and prior remediation evidence are immutable. This is separate from AUD-006/013/014 and Build 116; **115N acceptance was withheld at this historical checkpoint**, before its October 20 release approval.

## Audit disposition index

Original IDs/priorities/titles come from the immutable [October 6 audit](../audits/2026-10-06_214431_PDT-release-audit.md#confirmed-findings-index). Corrective commits were checked for ancestry in accepted `a198b14`; PR merge records were independently fetched from GitHub. Historical reports may say “awaiting review,” “open,” or “PR open” at their own checkpoints. The accepted merge sequence and this task's accepted baseline establish the current corrective disposition. They supply no separate artistic acceptance transcript or 115N approval.

| ID | Original priority / defect | Current disposition | Accepted correction / PR | Remediation evidence and residual limits |
| --- | --- | --- | --- | --- |
| RC-01 | P1 · Huge numeric Orb IDs hang allocation/import | Closed corrective review/merge | M.H.A `7863119`; [#27](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/27) | [Pinned original closure report](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/4f8e3400cc0894a062ce2c465e09b1f6fe233c02/docs/audits/2026-10-07-115m-h-a-rc01.md); [current regressions](../../tests/orb-id-termination.test.js). Report is absent from current tree; link preserves accepted historical evidence. |
| RC-02 | P2 · Clear leaves pending loads/batch ingestion | Closed corrective review/merge | M.H.D `eeea53a`; [#30](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/30) | [Native evidence](../audits/remediations/115m-h-d-rc02/browser.json); deterministic native scheduling, not all device/media conditions. |
| RC-03 | P2 · Cancelled live attachment destroys winning graph | Closed corrective review/merge | M.H.E `a0c5e9e`; [#31](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/31) | [Native evidence](../audits/remediations/115m-h-e-rc03/browser.json); generated streams, physical acquisition/permission gates remain. |
| RC-04 | P2 · Play/Clear unhandled exception | Closed corrective review/merge | M.H.F `aba13a6`; [#32](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/32) | [Report](../audits/remediations/115m-h-f-rc04/README.md); protects stale actions, not complete browser acceptance. |
| RC-05 | P2 · EOF lost during recording finalization | Closed corrective review/merge | M.H.G `1386de5`; [#33](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/33), [#34](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/34) | [Report](../audits/remediations/115m-h-g-rc05/README.md), [reentrant regression](../../tests/targeted-audit.test.js); broader recording/media acceptance remains. |
| RC-06 | P2 · Failed new recording deletes prior export | Closed corrective review/merge | M.H.C `eb18fea`; [#29](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/29) | PR #29 contains the correction/validation report; [native protection](../audits/remediations/115m-h-g-rc05/rc06-browser-protection.json), [regressions](../../tests/recording-export.test.js). No invented standalone remediation directory; external-player fidelity remains. |
| RC-07 | P2 · Two-band presets omit audible interior | Closed corrective review/merge | M.H.H `e76044e`; [#35](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/35) | [Report](../audits/remediations/115m-h-h-rc07/README.md); supported count 3–256, default 256; richer tables deferred. |
| RC-08 | P2 · FFT coordinate scale contaminates target energy | Closed corrective review/merge | M.H.I `7e1605e`; [#35](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/35) | [Report](../audits/remediations/115m-h-i-rc08/README.md); inclusive adjacent overlap intentionally remains (AUD-004). |
| RC-09 | P2 · Sanitation steals later explicit Orb identity | Closed corrective review/merge | M.H.J `a39d265`; [#35](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/35) | [Report](../audits/remediations/115m-h-j-rc09/README.md); collection owns repair; duplicate legacy names remain AUD-013. |
| RC-10 | P2 · Orb-locked Ring lags one frame | Closed corrective review/merge | M.H.K `7f9f562`; [#35](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/35) | [Report](../audits/remediations/115m-h-k-rc10/README.md); update dependency corrected, Ring-first render preserved. |
| RC-11 | P2 · Mixed Bulk select cannot apply displayed option | Closed corrective review/merge | M.H.L `f1492e3`; [#35](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/35) | [Report](../audits/remediations/115m-h-l-rc11/README.md); sentinel never persists; wider accessibility remains. |
| RC-12 | P2 · MIME filter rejects supported media | Closed corrective review/merge | M.H.M `ae46937`; [#35](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/35) | [Report](../audits/remediations/115m-h-m-rc12/README.md); decoder owns support; codec/media breadth still needs acceptance. |
| RC-13 | P2 · Covered-panel edits / Queue focus loss | Closed corrective review/merge | M.H.N `ebbbc9d`, M.H.P `f92c88b`; [#35](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/35), [#36](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/36) | [Original correction](../audits/remediations/115m-h-n-rc13/README.md), [post-merge edge](../audits/remediations/115m-h-p-rc13/README.md); full assistive-tech/mobile acceptance remains. |
| RC-14 | P2 · Cancelled seek intercepts later touches | Closed corrective review/merge | M.H.O `6e78680`; [#35](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/35) | [Report](../audits/remediations/115m-h-o-rc14/README.md); dispatched TouchEvents, not physical mobile gestures. |
| RC-15 | P2 · Uncontrolled aggregate resources/frame bursts | Closed corrective review/merge | M.H.Q–W; [#37](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/37), [#38](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/38), final `a4acd94` | [Cumulative matrix](../audits/remediations/115m-h-w-rc15-final-review/acceptance-matrix.md), [review](../audits/remediations/115m-h-w-rc15-final-review/README.md); artistic/hardware evidence, heavy Canvas/UI/trim/expiry and expert usability remain 115N gates; broader optimization Build 117. |
| RC-16 | P3 · Malformed band references become targets | Closed corrective review/merge | M.I `ad00367`; [#39](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/39) | [Report](../audits/remediations/115m-i-rc16/README.md); numeric strings discarded, human parser converts validated text. |
| RC-17 | P3 · Designed phase and control disagree | Closed corrective review/merge | M.I.A `fb0b8c0`; [#40](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/40) | [Report](../audits/remediations/115m-i-a-rc17/README.md); floating-point remainder limits disclosed, wider browsers/touch unverified. |
| RC-18 | P3 · Free Ring ignores motion pause | Closed; correction independently verified | M.H.V `1987bed`; M.I `ad00367`, [#38](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/38), [#39](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/39) | [Verification](../audits/remediations/115m-i-rc16/README.md#rc-18-verification); no new pause fix in I. |
| RC-19 | P3 · Public disposal leaves native recorder active | Closed corrective review/merge | M.I.B `1d160c6`; [#41](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/41) | [Report](../audits/remediations/115m-i-b-rc19/README.md); failed native shutdown is truthfully failed, not guaranteed recovery; upstream tracks remain owned by source. |
| RC-20 | P3 · Missing root-relative distribution metadata | Closed corrective review/merge | M.I.D `8f94fc9`; [#43](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/43) | [Report](../audits/remediations/115m-i-d-rc20/README.md); owner-reported direct-file functional coverage is in I.2D; managed file:// remains blocked and network-disabled execution, maskable artwork review and server MIME setup remain separate gates. |
| RC-21 | P3 · Picker help describes wrong channel | Closed corrective review/merge | M.I.C `2d45956`; [#42](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/42) | [Report](../audits/remediations/115m-i-c-rc21-rc22/README.md); actual selected-channel response protected. |
| RC-22 | P3 · ID collision misnames Remove target | Closed corrective review/merge | M.I.C `2d45956`; [#42](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/42) | [Report](../audits/remediations/115m-i-c-rc21-rc22/README.md); type-plus-ID lookup; native confirm intercepted for deterministic evidence, OS dialog presentation not accepted. |

### October 9 AUD-007 disposition

| Finding | Accepted implementation | Current review recommendation | Residual limits |
| --- | --- | --- | --- |
| AUD-007 · uncontrolled optional waveform reads/decodes | I.1–I.2C / PR #50–#54, accepted main 45cbf55 | I.2D / PR #55 recommends closure for human review after two narrow callback-order corrections; not yet closure approved | Estimated compressed channels can understate actual PCM; unresolved native work blocks optional availability; total browser memory is not bounded. Owner-reported direct-file functional coverage supplements managed automation; network-disabled portability remains a separate 115N gate. |

## Diagnostics and evidence

Commit [`c7604b8`](https://github.com/cosmicdance-4-2-0/Auralprint1/commit/c7604b838b09617d7f24daafc20ebbcbdd0c467a) deliberately removed 344 generated diagnostic logs. Files named in the original inventories but absent from the current tree remain available at its parent, `bda0ea9d0a27d32c2b6a1ac558bedfc63525db06`: [October 9 results](https://github.com/cosmicdance-4-2-0/Auralprint1/tree/bda0ea9d0a27d32c2b6a1ac558bedfc63525db06/docs/audits/20261009-004238_materials/results) and [October 6 evidence](https://github.com/cosmicdance-4-2-0/Auralprint1/tree/bda0ea9d0a27d32c2b6a1ac558bedfc63525db06/docs/audits/evidence/2026-10-06_214431_PDT). The original reports, manifests and recorded hashes are unchanged; retrieve archived files from that revision rather than regenerating them.

Version-specific counts, mutation outcomes, CI run IDs, native results and intermediate failures live in the reports above, not the ordinary README. Their links retain the observations without duplicating large logs. Optional browser probes require externally provisioned Playwright/Chromium, not new project dependencies. Run after building; report paths should target new scratch output, never overwrite historical evidence.

| Historical diagnostic | Owning evidence / tooling selectors |
| --- | --- |
| [Stream stereo](../../scripts/validate-stream-stereo.cjs) | PR #22; normal Playwright resolution, optional `--chromium`, `--report`, `--generator` |
| [Retained export](../../scripts/validate-recording-export.cjs) | PR #29 and RC-06 protection; `RC06_PLAYWRIGHT_MODULE`, `RC06_CHROMIUM_PATH`, `RC06_REPORT` |
| [File cancellation](../../scripts/validate-file-cancellation.cjs) | [RC-02 native evidence](../audits/remediations/115m-h-d-rc02/browser.json); `RC02_PLAYWRIGHT_MODULE`, `RC02_CHROMIUM_PATH`, `RC02_ARTIFACT`, `RC02_REPORT` |
| [Live attachment](../../scripts/validate-live-source-ownership.cjs) | [RC-03 native evidence](../audits/remediations/115m-h-e-rc03/browser.json); `RC03_PLAYWRIGHT_MODULE`, `RC03_CHROMIUM_PATH`, `RC03_REPORT` |
| [Play ownership](../../scripts/validate-transport-ownership.cjs) | [RC-04 report](../audits/remediations/115m-h-f-rc04/README.md); `RC04_PLAYWRIGHT_MODULE`, `RC04_CHROMIUM_PATH`, `RC04_REPORT` |
| [Finalizing EOF](../../scripts/validate-finalizing-eof.cjs) | [RC-05 report](../audits/remediations/115m-h-g-rc05/README.md); `RC05_PLAYWRIGHT_MODULE`, `RC05_CHROMIUM_PATH`, `RC05_REPORT` |
| [Distribution/browser](../../scripts/validate-rc20.cjs) | [RC-20 report](../audits/remediations/115m-i-d-rc20/README.md); `RC20_PLAYWRIGHT_MODULE`, `RC20_CHROMIUM_PATH`, `RC20_REPORT` |

## 115N release disposition

The owner accepted Build 115 as Release 4 on October 20, 2026 following extended local testing and public RC feedback. The [roadmap qualifications](../../ROADMAP.md#build-115-release-acceptance-and-qualifications) record limits of that acceptance, including Firefox Stream audio. The [release comparison](build-115-release-delta.md) distinguishes public Build 113 from internal Build 114; the canonical changelog follows the existing `v114 → v115` chronological format.

The [editorial integrity report](115m-i-e-documentation-review.md) records this pass's scope and validation. Canonical distributions, canonical changelog, original audit, remediation reports and evidence logs remain unchanged.

## 115M.I.N.3 — October 9 AUD-006 corrective implementation

Accepted baseline is `302173917ed9b337a9d1df9a3f93d083248fe51f`, merged PR #58,
including required N.2 calibration head `3e6a01bc5453307d0b4d64db844d9dc0ce0518cf`.
N.1/PR #57 and N.2 are immutable evidence-only checkpoints. The owner separately
authorized N.3 production implementation and exact provisional factory values.
Revision `v0.1.15m.i.n` adds Balanced/Custom/Unrestricted recorder policy, five-minute
Stop target, whole-event admission and monotonic Stop scheduling, preserve-export
Cancel and unresolved-backend fencing, independent versioned local settings and
Record progress/accessibility. Schema remains 10. Earlier audit/remediation files
and protected presets/branding remain byte-identical.

The [N.3 package](../audits/remediations/115m-i-n3-aud006/README.md) owns validation,
native evidence, negative controls, gaps and the independent-review recommendation.
N.2's high-resolution VP8 resource guard and broader browser/device uncertainties
remain real; encoded payload is not total native memory. Build 117 retains broader
resource/encoder/performance optimization. AUD-006 closure requires independent
review; **Build 115N was withheld at this October 9 checkpoint**. This report did not authorize merge or shipment; final owner acceptance came later.

The subsequent [N.3F closeout](../audits/remediations/115m-i-n3-aud006/closeout-n3f.md), merged in PR #60, records lossless Custom settings entry and its validation without changing the recorder policy or schema.
