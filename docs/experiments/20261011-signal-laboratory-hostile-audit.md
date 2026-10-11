# Hostile audit — Auralprint experimental Signal Laboratory branch

**Date:** 2026-10-11 (America/Los_Angeles)  
**Repository:** https://github.com/cosmicdance-4-2-0/Auralprint1  
**Audited GitHub branch:** `experiment/signal-laboratory-v01`  
**Observed HEAD:** `e77cb9cdc7de3074b53db47842e45efe945dd43c`  
**Prior experiment branch:** `experiment/temporal-audio-modulation-20261011` — **same HEAD**  
**Decision:** **NO-GO** for Signal Laboratory experimental acceptance; **NO-GO** for shipping the opt-in temporal experiment without integration verification.

## Audit standards and scope

Reviewed the committed source tree, temporal analysis producer/consumer wiring, Orb integration, UI reset paths, config, CSS entry, and packaging entry. Treated comments, tests, and prior documentation only as leads; findings below are based on executable paths and independent reproduction. Separately examined *uncommitted* local Signal Laboratory sources, because the attempted publication had not reached the remote branch when the audit began. Do **not** misattribute those findings to the committed tree.

Local runtime was Node 22.16.0, Python 3.13.5. Network DNS prevented GitHub cloning. Repository source was inspected through the connected GitHub reader; exact committed temporal module blobs were available locally and validated with `git hash-object`. Full Node 24 / Python 3.12 repository tests, build, packaging verification, browser and audio-device scenarios were **not** run. These are **not** passing gates.

## Release-blocking findings

### B-001 — CRITICAL — Signal Laboratory is absent from the audited branch (confirmed)

The GitHub tree under `e77cb9c` contains `src/js/audio/temporal-features.js` and `src/js/render/temporal-modulation.js` but not `src/js/audio/signal-lab.js`, an inspector UI, associated markup or new CSS. The Signal Laboratory branch and preceding experiment branch point at exactly the same SHA. Neither the new selectable frequency target nor its inspection interface exists in the committed code.

**Impact:** The milestone cannot be reviewed, tested or used from this branch. Previous progress statements about its implementation referred to local prototypes, not a pushed implementation.

**Required correction:** Finish and publish the change on the Signal Laboratory branch, inspect the resulting tree/diff against its parent, then re-audit.

### B-002 — HIGH — Current temporal modulation dilutes narrowband events and changes its reported amplitude with rendering cadence (reproduced)

Source: [`src/js/audio/temporal-features.js`](https://github.com/cosmicdance-4-2-0/Auralprint1/blob/e77cb9cdc7de3074b53db47842e45efe945dd43c/src/js/audio/temporal-features.js). In `update`, positive differences in every selected channel's band array are added, divided by **all** bands, multiplied by `fluxNormalizationSec / elapsedSec`, then clamped. This is not target-selective. `src/js/main.js` passes `motionDtSec` derived from `requestAnimationFrame` to the feature processor.

Independent observation with a 256-element spectrum and a single band rising from 0 to 1 (all other bands 0), using the actual committed module:

| Frame interval | Reported `C.flux01` |
| --- | ---: |
| 1/60 s | 0.01171875 |
| 1/144 s | 0.028125 |

**Impact:** A full-scale narrowband step may barely modulate Orb speed, and raw feature amplitude is observation-cadence sensitive. This is a scientific/behavioral acceptance blocker **if** repeatable attack response is claimed; not necessarily a default application regression, because the feature is disabled in CONFIG.

**Required correction:** Define feature semantics and a reproducibility tolerance, compare selected bands with scripted inputs, and decouple measurement cadence from display cadence before claiming dependable event detection. Avoid equating normalised dB-bin averages with calibrated power.

## Findings in LOCAL STAGED LAB FILES ONLY — not present on remote branch

### S-001 — HIGH — Above-Nyquist ranges report valid energy (independently reproduced)

Local code: `/mnt/data/signal-lab/src/js/audio/signal-lab.js`. The open-ended upper band has `highHz === Infinity` in `BandBank.rebuild`. The staged overlap calculator substitutes the **requested** upper limit when a band's upper bound is infinite, instead of clipping to `frame.spectrum.metadata.nyquistHz`.

Reproduction: synthetic band lower bounds `[0,100,22500]`, upper bounds `[100,22500,Infinity]`, Nyquist `24000`, C energies `[0,0,0.8]`, target `30000–40000 Hz`, dt `0.05 s`. The staged engine returned `ready:true`, `energy01:0.8`, `bandCount:1` although that selected interval is outside the observable spectrum. This is a correctness failure, not merely a labelling issue.

**Required correction:** Use the actual finite Nyquist cap for the open-ended high band; reject or report uncovered selections, and test 44.1/48/96 kHz sampling rates and ranges on both sides of Nyquist.

### S-002 — HIGH — 100 ms UI sampling can silently miss brief attacks (independently reproduced)

Local code: `/mnt/data/signal-lab/src/js/ui/signal-lab-panel.js`. `update` calculates features on every visual frame, but draws only if `nowMs - lastDraw >= sampleIntervalMs`; `draw` samples the **latest** `attack01` and `flux01`. There is no aggregation, peak-hold or event queue over the unsampled interval.

Independent fake-engine sequence: attack 0 at 0 ms, attack 1 at 20 ms, attack 0 at 100 ms. The chart/readout at 100 ms displayed **Attack: 0.000** and **Flux: 0.000**, losing the event at 20 ms completely.

**Impact:** The central diagnostic feature cannot reliably visualize the very transients the lab is intended to inspect.

**Required correction:** Keep minimum/maximum or peak-hold data over each plot bucket, or decouple history capture from the redraw rate. Verify with short impulses positioned between UI refresh boundaries.

### S-003 — MEDIUM — Source switches can join unrelated temporal histories (code-path confirmed; browser reproduction pending)

The staged `signalLabPanel` has its own engine and history. Its proposed integration in `src/js/main.js` calls `signalLabPanel.update(...)`, but the existing `UI.resetTrackVisualState()` resets only `TemporalFeatures`; it has no access to the lab engine. If a fast track or source switch occurs between animation frames without an intervening unready sample, the lab's previous buffer can compare the new source to the old source, producing a synthetic attack.

**Required correction:** Connect the lab's reset to the canonical source/track identity reset path, ideally through a small injected callback, and test back-to-back source swaps with no empty RAF between them.

### S-004 — MEDIUM — New stylesheet is not included in the distributable (code-path confirmed)

The staged changes add `src/css/signal-lab.css`, but the committed `src/css/base.css` does not import it. `scripts/build.mjs` bundles CSS from **only** `src/css/base.css`. Unless the base import is added, the lab's styling is absent from both portable and hosted bundles.

**Required correction:** Add the missing CSS import and inspect actual built artifacts, not merely file existence.

### S-005 — MEDIUM — Invalid frequency edits can be masked by the next refresh (code-path confirmed)

The staged selector reports `Invalid channel or frequency range.` after `select()` returns false, but leaves the prior valid selection active. Its next UI refresh replaces the error with healthy metrics from the **old** target, while the inputs can still display the invalid range. No recovery, application state, or stale/invalid indicator persists.

**Required correction:** Either disable sampling while input is invalid or restore the last accepted range and keep an explicit status until corrected.

### S-006 — LOW/MEDIUM — Work scales with RAF and allocations, not UI refresh rate (implementation confirmed; impact unmeasured)

The staged `signal-lab.js` constructs a fresh `samples` array and pushes one sample for each selected band every analysis frame, even though the plot only redraws every 100 ms. This is not a demonstrated frame-rate regression but should be measured with 256 bands, multiple devices and background transitions before performance acceptance.

**Required correction:** Reuse engine-owned buffers, separate sampling from plotting, and measure per-frame allocation and wall-clock work.

## Additional committed-branch risks (not independently reproduced as failures)

- **Configuration discontinuity:** `UI.applyPrefs()` calls `AudioEngine.applyAnalyserSettingsLive()` after FFT size/smoothing changes. This can change the observed band distributions without replacing `frame.spectrum.lowHz`; `TemporalFeatures.update()` only detects band-definition reference changes. Investigate false transients immediately after FFT/smoothing/gain changes. See `ui/ui.js`, `audio/audio-engine.js` and `audio/temporal-features.js`.
- **Experiment is inaccessible by default:** `CONFIG.experimental.temporalAudio.enabled` is `false` and only developer-editable. This is appropriate for a quarantined prototype, but it is not a user-facing feature or acceptance evidence.
- **Existing Orb interface extended:** `Orb.step` gained an eighth positional parameter (`angularSpeedOffsetRadPerSec`). Its default zero preserves old calls, but compatibility with all callers requires the repository suite and browser regressions before merging.
- **Scientific validity:** The upstream band bank uses mean normalized decibel-bin values, not calibrated physical power; physical interpretations and comparisons across band widths are not justified by the numeric output alone.

## Independent verification performed

- Inspected remote branch heads and complete tree; both experimental branch heads identical at `e77cb9c`.
- Verified local committed temporal files against Git blob SHAs: `d600e471ff0d74d9ae38f56a700b48b091cb8c39`, `110f75b8c2c405bc6ae2c6e584ac1cfc81856208`.
- Executed the committed temporal module with independent narrowband signals and two RAF intervals, obtaining the different amplitudes in B-002.
- Executed the staged Signal Laboratory engine with an above-Nyquist range, reproducing S-001.
- Executed the staged UI with a deterministic injected feature stream, reproducing S-002.
- Parsed staged and committed core modules via `node --check`.
- As smoke checks, ran 6/6 local isolated temporal tests and 6/6 local staged laboratory tests on Node 22; no tests were altered to obtain pass. Their passing does **not** override the findings.
- No committed GitHub modifications were made during this audit; no PR was merged.

## Acceptance conditions before resuming feature work

1. Publish a coherent Signal Laboratory implementation on the intended feature branch and verify its diff against the temporal parent.
2. Eliminate above-Nyquist misreporting and validate band/range overlap using actual sample-rate metadata.
3. Guarantee that short transients are not systematically discarded by the diagnostic display.
4. Reset all lab temporal state on source, track, analysis-definition and material analyser-configuration changes; test rapid swaps.
5. Connect the new styles to the sole CSS entry point and verify the resulting portable and hosted builds.
6. Exercise deterministic signals against multiple frame cadences and publish numeric reproducibility/error budgets; explicitly label known limitations.
7. Run sequential Node **24**/Python **3.12** `npm ci`, `npm test`, `npm run build`, `python scripts/verify_distribution.py`, then Chromium/Firefox/mobile source, panel and recording regressions as applicable. The local environment cannot certify these gates.

**Auditor decision: NO-GO.** Do not merge into the previous experimental branch or canonical main until B-001 and S-001/S-002 are resolved, with remaining items dispositioned and independently verified.