# Build 116 — final pre-RC source and evidence review

**Date:** 2026-10-29 PDT  
**Baseline:** merged `main` `72cb1543759ae39631cc20aa587d907a1ad3f369` (PR #98)  
**Version/writer:** `v0.1.16-candidate` / preset schema 16  
**Classification:** read-only adversarial review and release-evidence reconciliation; **not an RC, Canon, tag, or release authorization**

## Verdict

**No newly demonstrated production release blocker in the inspected source paths.** The accepted candidate is reasonable to place before the owner for RC consideration, **subject to explicit disposition of remaining verification gaps and the unresolved watcher anomaly**. This review does not certify physical Safari or grant milestone acceptance.

This pass independently inspected current repository source/contracts, prior audit findings, test coverage and completed CI logs. It did **not** execute a new local Node/browser/physical-device suite, introduce a new negative-control harness, or inspect every production line. Thus “no blocker found” means no blocker was established by this review, not proof of absence. Earlier hostile audits remain distinct evidence.

## Inspected release-critical paths

| Area | Adversarial check and observed disposition |
|---|---|
| Boot and CONFIG/Scene | `src/js/main.js`, `core/preferences.js`, `core/state.js`, camera/space transforms: compressed import is awaited before first animation frame; resolved Scene and live camera remain distinct; viewport/DPR changes do not own world geometry. No new contradictory path identified. |
| Camera/touch after #98 | `ui/camera-interaction.js`, `ui/camera-actions.js`, camera projection, control reference, original and 18 additional camera tests: at most two owned touch IDs; nonprimary second contact admitted only to touch; single full-pose update; midpoint anchoring and clamped zoom; either-contact recovery; reentrant capture cancellation fenced; mode-off/mixed contacts ignored. No demonstrated mutation of authored Scene, simulation or transport. No new issue established. |
| Scrubber and UI lifecycle | `audio/scrubber.js`, relevant `ui/ui.js` coordinator, repeated-wiring tests: initiating touch identity and abandoned mouse-drag cancellation from #93/#95 remain in source; coordinator from #96 retains one listener owner. No new issue established. |
| Queue/source races | `audio/queue.js`, `audio/input-source-manager.js`, `ui/ui.js`: optional queue clearing is guarded by successful current Mic/Stream activation, Queue revision, request epoch and active source. Previous source/EOF/recording ownership regression tests pass in CI. No new issue established. |
| Preset admission | `presets/compact-preset.js`, `deflate-transport.js`, `preset-limits.js`, `url-preset.js`, `core/orb-collection.js`: frozen schema-13/16 baselines, bounded range expansion and decompression, bounded generated Orb identities, stale async import fence. No reintroduced P1 amplification path identified. Schema 14/15 rejection and historical formats are covered by existing gates. |
| Render/trace/record | `render/renderer.js`, `render/trace-fade.js`, Trail and Recorder boundaries: Fade 0 retains the original unsegmented stroke path; positive fades use the separately accepted approximation. No new issue established in reviewed paths. Prior recording cleanup-injection qualification remains unchanged. |
| Build/watch | `scripts/watch.mjs`, `tests/watch-integration.test.js`, CI workflow: watcher protects published output with input checks/staging; intermittent duplicate-save failure remains unexplained. Not reclassified as resolved simply because the latest CI passed. |

## Verified current CI

[Push CI for merged #98, run 41002925897](https://github.com/cosmicdance-4-2-0/Auralprint1/actions/runs/41002925897): **completed successfully on attempt 1**, exact `72cb1543759ae39631cc20aa587d907a1ad3f369`.

- **Ubuntu:** 1,532 pass / 0 fail / 1 existing opt-in skip, portable and hosted build/distribution verification, Chromium Scene Camera, editing, compact presets, Queue/Trace candidate gate, exact-head/version/artifact and whitespace checks all green.
- **Windows:** 1,532 pass / 0 fail / 1 skip; build, distribution, exact-head/version/artifact and whitespace checks green. Chromium browser gates are Linux-only.
- Generated artifact verified by CI: `dist/auralprint_0.1.16-candidate.html`. This is a build output, not a committed public release.
- The independent touch-native script `scripts/validate-116-camera-touch.cjs` reports six source/portable/hosted × DPR scenarios in PR #98. Its assertions were source-reviewed here, **not independently executed**; it is **not currently part of the mandatory CI workflow**.

## Remaining qualifications, not new findings

1. **AUD116-006 / R2-003 — unresolved watcher anomaly:** two first-attempt Ubuntu duplicate-save assertions failed historically; identical-SHA reruns passed, and a controlled interrupted-save model reproduced the assertion without corrupt publication. Neither observation establishes the original cause. It affects development watch/test reliability, not a demonstrated defect in delivered HTML. The ROADMAP requires explicit owner disposition or further causal investigation.
2. **Physical Safari:** no known tester/device is available; no iOS Safari pass can be claimed. Prior Linux WebKit checks and Chromium emulation are not physical Safari certification. This needs an explicit owner risk acceptance if Build 116 ships without it.
3. **Owner-device evidence:** owner reports working Camera gestures on multiple physical Android revisions; specific device/browser versions and a complete device matrix are not recorded in this review. Windows desktop user testing is ongoing; CI Windows success is distinct from that human acceptance.
4. **Remaining owner gates:** final positive Fade join/overlap visual evaluation, full direct-file/offline and available browser/device acceptance, playback/recording/export observation, and explicit release authorization. No new mandatory capability or architectural refactor is proposed.
5. **AUD116-005:** synthetic File-tap stop refusal remains deferred to Build 117 with no demonstrated ordinary native failure; this review does not change that disposition.

## Recommended disposition

- **Code:** do not open a new corrective implementation pass on the basis of this review; no demonstrated new release blocker.
- **RC decision:** record the owner's decision on the watcher and lack of physical Safari, complete practical available-device checks, and promote only when the owner explicitly accepts those limits. Preserve the Build 115 canon and schemas 2–13.
- **Release:** RC promotion, canonical artifact generation, tagging, deployment and public publication are separate authorized steps. Recheck tests, schema, distributed files and hashes on the actual versioned release commit, not merely this candidate SHA.

**Changes in this PR:** this audit report only. Source, tests, fixtures, configuration, dependencies, public artifacts and version are unchanged.
