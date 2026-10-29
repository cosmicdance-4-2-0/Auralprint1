# AUD116-004 — Scrubber drag cancellation

Accepted upstream `main`: `6e795e40265d1fc111e6c3890988201a84e73a9d` (merged PR #92).
The clean checkout was fetched and matched exactly before implementation.
Branch: `fix/116-aud004-scrubber-drag`. Corrected source and native regression:
`e6183a69f099fa68cd738f79c52acdefcdcf92a1`; implementation:
`a4bf94feb587edcf4253f7ed6a73ac678db1db9d`. This record follows in a documentation-only commit.
Version remains `v0.1.16-candidate`, writer schema 16.

## Cause and repair

[Scrubber](../../../../src/js/audio/scrubber.js) used one Boolean for mouse and
touch dragging. Mouse movement trusted that flag indefinitely after a lost mouseup;
neither focus loss nor released mouse buttons invalidated ownership.

Mouse/touch ownership is now distinguished. Mouse movement requires the initiating
button's `MouseEvent.buttons` bit. A shared cancellation helper terminates ownership
on blur, hidden document, Reset, File load and reinit; mouseup and touchend/cancel
terminate their respective gestures. Cancellation does not seek. Focus or movement
alone cannot restore ownership; a fresh press can. Touch movement and its
`preventDefault` remain independent of mouse-button state. Existing middle/right
seeking and held dragging outside the canvas remain functional.

Cleanup captures the registration window and document. Reinit removes old canvas,
window and visibility handlers before registering replacements. Tests bound ownership
to two canvas, six window and one document listener, including repeated same-canvas
init, replacement canvas/window/document, touch reinit and blur followed by reinit.
Repeated Reset/load installs no interaction handlers. Stale input cannot seek a
replacement media target or alter audio/source/recording state.

Production changes are confined to interaction handling in `scrubber.js`.
The two existing Scrubber test owners are extended; `targeted-audit.test.js` only
gains an EventTarget document fixture. The new native script and this evidence are
the remaining changes. AudioEngine, transport/Queue/source acquisition, waveform
admission/extraction, recording, UI corrections AUD116-002/003, configuration,
schemas, frozen fixtures, Canon, dependencies and CI are unchanged.

## Independently observed native results

The original harness was inspected and rerun **before editing implementation**
using production Scrubber and a real paused ten-second HTMLMediaElement supplied
through the public AudioEngine read seam. Only scratch repository/output paths
were adjusted. [Original baseline result](baseline-original.json): 2 → 8 seconds;
delivered mouseup then held the position at 8; paused throughout; no page errors.
The historical [audit](../../20261029-081602_auralprint-116-pre-rc-hostile-audit.md)
and its evidence remain unchanged.

The [new native regression](../../../../scripts/validate-116-scrubber.cjs) also ran
against a clean detached worktree at the exact baseline. Its correction assertions
failed as expected (exit 1); its ordinary mouse/touch controls passed.

| Native isolated-source observation | Baseline | Corrected |
| --- | ---: | ---: |
| Initial press at 20% | 2 s | 2 s |
| Blur itself | 2 s | 2 s |
| No-button movement at 80% after blur | 8 s | 2 s |
| Held-button movement after blur, before any no-button event | 8 s | 2 s |
| No-button movement with missing mouseup, without blur | 8 s | 2 s |
| Fresh held drag to 60% | 6 s | 6 s |
| Held drag outside canvas at 70% | 7 s | 7 s |
| Movement after mouseup outside canvas | 7 s | 7 s |

[Baseline observations](native-baseline.json) and
[corrected observations](native-corrected.json) retain actual events/results.
Corrected isolated/source/portable/hosted runs pass all 104 position observations,
four consecutive cancel/recovery cycles per edition, native touchend/cancel and
middle/right-button controls, with zero console/page errors. Full applications use
their real File ingestion and transport pause; the isolated fixture uses the same
public read seam as the original. CSS pixel rounding gives the full applications
an initial 1.995517 s; that exact position remains unchanged after cancellation.
Trusted Chromium movement confirms buttons 0/1/2/4; touchstart/move remain prevented.

## Verification and qualifications

Linux: Node 24.19.0, npm 11.9.0, Python 3.12.14, locked offline `npm ci`, Chromium
151.0.7922.173. [Verification record](verification.txt) includes commands,
distribution hashes and resolved setup/harness failures.

- Focused Node tests: **31 passed**, zero failed.
- `npm test`: **1,492 passed**, zero failed, one existing opt-in retention skip.
- Sequential build, distribution verifier, camera/editing/preset browser gates and
  `validate-116-candidate.cjs`: **passed**; candidate covers source/portable/hosted
  at DPR 1/2. Native Scrubber regression: **passed** in all four editions/fixtures.
- Source reasoning and Node EventTarget tests establish cleanup/visibility/reset/
  load contracts; they do not establish physical browser focus behavior.
- Native media and mouse/touch input are real Chromium APIs/CDP input. Blur/focus
  signals are explicitly dispatched, matching the original audit. Headless tab
  switching did not emit native blur here. Physical OS focus loss or missing-mouseup
  incidence, physical touch, Windows, Firefox/WebKit, Safari and direct-file/offline
  behavior were not tested. No such platform acceptance is claimed.

AUD116-005 recorder fault injection remains deferred to Build 117. AUD116-006's
original Ubuntu watcher failure has an unknown cause; passing checks here do not
resolve it or attribute it to GitHub. Neither issue was changed.

Delivery is a draft PR for independent review. No merge, tag, deployment, release
or RC promotion is authorized by this repair.
