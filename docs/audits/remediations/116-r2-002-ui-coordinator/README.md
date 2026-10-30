# AUD116-R2-002 — coordinator initialization

Baseline: fetched `origin/main`, **`ea1b823b560b835382637566098bd0107b655afd`**, clean checkout; GitHub confirmed PR #95 merged at that SHA. Branch: `fix/116-r2-002-ui-coordinator`. Implementation: **`d7a350b0bb3ac6267351f9c5ee778a2fd8d635a0`**; regressions: `60775d72aca9df0a4302bf565a7dabc70233b14f`. Version remains `v0.1.16-candidate`, writer schema 16. Draft review only; no merge or RC promotion.

Read [AGENTS](../../../../AGENTS.md), [ROADMAP](../../../../ROADMAP.md), owning source and the [original finding/evidence](../../20261029T124331Z_auralprint-116-post-remediation-hostile-2.md). Executable source established that every public `wireControls()` invocation created a new File request/EOF closure, replaced AudioEngine hooks and attached more anonymous coordinator listeners. Feature-level guards did not protect this boundary. Space's `defaultPrevented` check concealed duplication for that shortcut while N/P and Repeat remained exposed.

`src/js/ui/ui.js` now creates one coordinator closure and retains its request counter, current File request, pending EOF, source dispatcher and callback identities. Each wiring call removes the previous coordinator listeners and binds one set to the recached controls, then installs the same AudioEngine callbacks. Pending continuations keep the same request fences. Detached coordinator controls lose listeners. Recording controls are bound individually, replacing the old Start-button group guard. Transport/event bodies, Queue policy and recorder/source architecture are unchanged; most production diff lines are indentation around the retained event bodies.

DOM recaching, preset-intent capture, tooltips, workspace, Camera and feature initializers still run at their established boundaries. No feature production files changed. Existing Camera canvas replacement remains functional. Arbitrary whole-document replacement or mixed replacement of feature roots and surviving children is not a new supported lifecycle: those modules retain their existing root-based guards. This PR covers repeated wiring, individual coordinator controls and the already-supported Camera canvas replacement.

## Native comparison

Pinned Chromium **156.0.8078.4**, actual source application and generated portable/hosted editions over local HTTP. The sequence follows the original audit: ingest playable File, pause, click Repeat once, cycle back to Off, import public UI, call `wireControls()`, click once. Five additional calls then test listener bounds and successive single transitions.

| Edition | Initial click | After second wiring, one click before fix | After fix |
| --- | --- | --- | --- |
| Source | Off → One | Off → All | Off → One |
| Portable | Off → One | Off → All | Off → One |
| Hosted | Off → One | Off → All | Off → One |

[Before](native-before.json): exact baseline, 13 checks in observation mode; six expected failures (Repeat/listener bounds in three editions), no page errors. [After](native-after.json): **148 checks, zero failures/page errors**, with CDP listener counts. Source imports resolve the actual application's UI instance. For built editions only, the local response adds an export inside the existing IIFE; no generated file is rewritten or duplicate source instance imported. Standard browser gates also execute the uninstrumented distributions.

The full corrected probe covers Play/Pause/Stop, Prev/Next, Shuffle, Queue toggle/jump/remove/clear, picker/drop ingestion, hash handling, Space/N/P focus/modifier/default-prevention semantics, arrow seeking, natural Repeat One/All/Off EOF, pending real File completion, callback identity, recording/finalization/export retention, independent control replacement, detached controls and Camera canvas cleanup. Node regressions additionally fence pending resume/play operations against Clear/replacement and preserve captured Repeat policy through recording-finalization EOF, without repeated consumption.

## Verification

Debian 13 container; Node **24.19.0**, Python **3.12.14**, locked dependencies and Playwright **1.64.1**. Bootstrap used the documented environment activation and cached `npm ci`; Chromium is the matching installed headless shell. Tests/builds ran sequentially. [Command results, artifact hashes and native transport results](verification.json):

| Check | Result |
| --- | --- |
| Focused Node coordinator regressions | 11 passed, zero failed |
| `npm test` | **1,514 passed, zero failed, 1 existing opt-in skip** |
| `npm run build`; `python scripts/verify_distribution.py` | Passed; all nine packaged files verified |
| `npm run test:browser`; `test:browser:editing`; `test:browser:presets` | Passed; editing covers source/portable/hosted, 40 sliders |
| `node scripts/validate-116-ui-state.cjs` | Passed; 105 observations |
| `node scripts/validate-116-candidate.cjs` | Passed; source/portable/hosted DPR 1/2 and native Canvas comparisons |
| `node scripts/validate-116-ui-coordinator.cjs` | Passed; 148 checks across all three editions |
| Existing transport / finalizing EOF / recording export validators | Passed; 10 transport and 8 EOF scenarios, real export ownership checks |
| Existing `validate-116-scrubber.cjs` | Passed; 237 checks, zero failures/errors |
| `git diff --check` | Passed |

Earlier failures are retained in the verification record. The first full suite had two RC-18 source-extraction failures; its selector/registration adapter now matches `listen(window, ...)`, with every established assertion unchanged. Initial focused tests exposed callback restoration between fixtures; the correction reinstalls stable callback identities. A new native fixture stopped after two frames: its [diagnostic](short-capture-diagnostic.json) shows **40 ms, zero chunks, `no-captured-chunks`, Start/Stop once**. It now waits for delivered data and enabled Start after completion. No recorder fix, assertion weakening, watcher changes or failure suppression was used. The initial sandbox dependency bootstrap's child-process restriction was resolved before execution.

Reproduce after the standard build:

```sh
node --test --test-name-pattern=AUD116-R2-002 tests/targeted-audit.test.js
node scripts/validate-116-ui-coordinator.cjs
# Same limited observation sequence against a separately built exact baseline:
AP_REPO_ROOT=/path/to/baseline AP_REPRO_ONLY=1 AP_OBSERVE=1 \
  AP_REPORT=work/coordinator-before.json node scripts/validate-116-ui-coordinator.cjs
```

Unverified here: Windows/macOS native interaction, physical devices/audio permissions, Firefox/WebKit/Safari, direct-file/offline launch, long recordings and arbitrary whole-document replacement. The Ubuntu watcher anomaly and deferred recorder hardening remain outside scope and unresolved by these passes. CI results belong to the exact pushed draft PR head; local passes do not certify CI or RC acceptance. Independent owner review remains required.
