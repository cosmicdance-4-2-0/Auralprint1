# 115M.I.C — RC-21/RC-22 UI correctness

RC-21 and RC-22 are corrected and ready for independent review. Development
version **v0.1.15m.i.c**; preset schema **10**, unchanged. Build 115 remains
unreleased; **115N is WITHHELD**. No merge, tag, release, or promotion is authorized.

## Accepted baseline and scope

Repository `cosmicdance-4-2-0/Auralprint1`; accepted GitHub `main` and clean local
branch `work` both resolved to **`d506d16801d791d1cab50d345d107f21085eb8a2`**,
version `v0.1.15m.i.b`, schema 10. Verified through the connected GitHub commit API
(`main`) and then `git ls-remote origin refs/heads/main`. PR #41 is merged at
that exact SHA and contains the RC-19 native recorder-disposal correction.
The checkout needed no reconciliation and had no unrelated changes.
Branch `codex/115m-i-c-rc21-rc22` starts directly at that accepted commit.

Inspected `agents.md`, the original [October 6 release audit](../../2026-10-06_214431_PDT-release-audit.md),
its [UI reproducer](../../evidence/2026-10-06_214431_PDT/ui/ui-control-repro.cjs)
and [preserved results](../../evidence/2026-10-06_214431_PDT/ui/ui-control-results.json),
production picker, panel, `selectOrbAnalysis`, Orb runtime/collection, coordinator
confirmation callback, and existing UI/channel/identity regression harnesses.
RC-16 strict targeting, RC-17 designed phase/native editor, RC-18 visual pause,
and RC-19 recorder disposal remain present; **81 baseline protection assertions
passed** ([log](baseline-protections.log)). Historical audit evidence is unchanged.

Classification: two UI truthfulness bug fixes. Production behavior changes are
one help string and one type-aware lookup condition. Risk is confirmation
identity/event routing; tests cover cancellation, removal, focus, and stale rows.
No CONFIG values, persistence fields, dependencies, audio calculations, render
behavior, or refresh policy change. The narrow `agents.md` addition makes the
combined inventory identity contract explicit.

## RC-21: reproduced mismatch and corrected explanation

Before production editing, new tests instantiated the actual band picker and
failed on its inaccurate rendered explanation. Production `selectOrbAnalysis`
still returned different selected-channel energies. The optional Chromium
harness also reproduced both findings using an isolated archive of the exact
accepted commit, without editing the baseline. See [baseline assertions](baseline-focused.log)
and [native baseline](baseline-native.json). Four focused assertions failed on
baseline; all 12 focused cases pass after correction ([focused log](focused.log)).

Before:

> Selected bands use the combined spectrum. Channel controls the waveform. With no explicit targets, the orb uses its channel’s full-spectrum energy.

After, rendered through the existing safe `textContent` path:

> Channel selects both the Orb's waveform and its band energies (Left, Right, or Center). Selected bands use that channel's energy. With no bands selected, the Orb uses its channel's full-spectrum energy.

The actual AnalysisFrame/selector/Orb.step fixture proves this contract:

| Channel | Band 0 | Average bands 0, 1 | Empty-target full energy | Waveform sample |
| --- | ---: | ---: | ---: | ---: |
| L | 0.9 | 0.8 | 0.8 | 0.75 |
| R | 0.1 | 0.2 | 0.2 | -0.5 |
| C | 0.5 | 0.45 | 0.6 | 0.25 |

For empty targeting the selector returns `energyOverride01: null`; Orb.step
uses the selected channel's full energy. Channel/waveform object identity,
radius and waveform displacement, and unchanged producer arrays are asserted.
The selector and every audio/render implementation remain unchanged. Ring's
global combined-C source remains its own contract.

## RC-22: confirmation identity and destructive lifecycle

Before, combined inventory contained both `{type: "spectral-ring", id:
"spectral-ring"}` and `{type: "orb", id: "spectral-ring"}`. The ID-only
confirmation search selected the first entry while the removal callback acted
on the Orb. Baseline payload was `{id: "spectral-ring", displayName:
"Spectral Ring"}`; displayed text:

> Remove Spectral Ring (spectral-ring)? This cannot be undone.

After, the predicate is `entry.type === "orb" && entry.id === id`.
Payload is `{id: "spectral-ring", displayName: "Orb 1"}`; displayed text:

> Remove Orb 1 (spectral-ring)? This cannot be undone.

Across the combined inventory, identity is **type plus persistent ID**. Within
the Orb collection, persistent ID remains the stable identity. `isValidOrbId`,
allocation, sanitation, normalization, runtime reconciliation, and the Ring
singleton are unchanged. IDs `spectral-ring`, `ORB0`, `ORB123`, `custom string`,
and `custom![]#"<>&` retain exact values through production preset normalization,
Share encoding, generated dataset routing and removal. No ID is used as an
HTML fragment, selector, or unsafe innerHTML.

Actual generated Remove buttons route through production list delegation,
including a nested event target. The integration fixture invokes real
`removeRuntimeOrb`, preferences resolution, Orb reconciliation and
`VisualizerRuntime`, rather than only recording a callback ID:

- Cancel: one confirmation, no removal/disposal, same settings/runtime collection,
  same Orb objects, same list and focus; no refresh or unrelated selection change.
- Accept: requested Orb alone disappears from persisted preferences, runtime
  settings and live Orb collection. ORB1, its adapter, phase, trail tail and governor
  remain; the exact Ring object survives, with no Ring/unrelated disposal.
- Survivor focus: current Orb order determines display numbering. After reverse
  order, removing a middle Orb confirms its new number and focuses the next
  survivor; removing the end focuses the preceding survivor. Removing the final
  Orb focuses Add Orb and leaves only the Ring.
- Missing target: a stale generated button for `spectral-ring` after its Orb is
  removed does not confirm the Ring, call removal, refresh, move focus, or throw.
- Failed removal: preserves list, settings, collection, objects and focus.
- Edit/Add/Duplicate still use stable IDs and appropriate focus. Repeated init and
  unchanged-reference refresh do not accumulate listeners or rebuild the list.

## Mutation evidence

[Nine isolated mutations](mutations.json) were all killed by behavioral assertions
(`ERR_ASSERTION`), not syntax/import failures. Copies under the system temporary
directory are deleted in `finally`; the checkout and accepted baseline are never
mutated. Optional rerun:

```sh
node docs/audits/remediations/115m-i-c-rc21-rc22/mutation-check.mjs work/rc21-rc22/mutations
```

| Mutation | Failed focused assertions |
| --- | ---: |
| Restore original help | 1 |
| Always select Center for Orb targeting | 2 |
| Restore ID-only lookup/remove type filter | 3 |
| Suppress confirmation | 8 |
| Break Cancel | 1 |
| Remove another Orb | 3 |
| Dispose Ring during Orb reconciliation | 1 |
| Break survivor focus | 2 |
| Missing Orb falls through to same-ID Ring | 1 |

Each `mutation-*.log` preserves the assertion failure. Archived logs trim trailing
whitespace only for repository whitespace checks. The tests therefore
protect both displayed truth and channel-specific behavior, plus approval/identity
and focus during destruction.

## Native browser validation

[Chromium 151.0.7922.173](native.json) passed the ordinary generated source UI
and **unchanged standalone HTML** with **zero page errors**. Controlled
`window.confirm` interception records the coordinator's actual message and
deterministically returns Cancel or Accept; no new dialog is introduced.
Native keyboard Enter and pointer clicks activate the actual Remove button.
Source mode additionally inspects live production objects/disposal; standalone
mode observes public Share persistence, remaining Ring row and focus, without
exposing private bundle state. Node tests alone do not exercise browser dialogs.

Native checks cover collision Cancel/Accept, exact text, correct survivor focus,
real band selection/clearing with unchanged L ownership, stable Edit, Add and
Duplicate, custom IDs, empty collection Add focus, and Ring survival. Source
checks additionally cover current-order numbering after canonical reorder,
repeated refresh, stale missing target and deterministic L/R/C targeting.

Optional rerun after build (external Playwright/Chromium; no added dependency):

```sh
AP_PLAYWRIGHT_MODULE=/path/to/playwright AP_CHROMIUM_PATH=/path/to/chromium \
AP_REPORT=/path/to/results.json node scripts/validate-rc21-rc22.cjs
```

`--baseline` accepts `AP_REPO_ROOT` pointing to an isolated accepted archive and
`AP_CSS_PATH` to the unchanged built stylesheet; it asserts the original defects.
The harness freezes requestAnimationFrame to isolate Cancel state. It does not
claim OS dialog appearance, every browser, physical touch or hardware media
coverage. Source object survival is directly observed; standalone private
object identity is intentionally not exposed.

## Full validation and artifact

- Locked offline `npm ci` passed ([log](npm-ci.log)). The initial sandbox blocked
  esbuild subprocess execution; authorized execution resolved that environment
  constraint. Initial sandbox Node runs hid child assertion reports; all retained
  final counts use ordinary subprocess execution with individual assertions.
- Relevant channel, picker/editor, inventory/identity and RC-15–RC-19 suites:
  **265 pass, 0 fail, 1 existing opt-in skip** ([log](regressions.log)).
- Existing opt-in 1,048,576-particle boundary: **1 pass** ([log](million-stress.log)).
- `npm test`: **602 pass, 0 fail, 1 existing opt-in skip**; 603 registered
  ([log](full-test.log)).
- `npm run build`: passed after full tests, sequentially ([log](build.log)).
- `git diff --check`: passed.
- [Artifact verification](artifact.json): `dist/auralprint_0.1.15m.i.c.html`,
  **400,363 bytes**, SHA-256 `15d661654b2161e506ffcbb15cb72739b68b910a1f102499c037719327f070dd`.
  Correct help and type-plus-ID lookup are present; original help absent. Schema
  10 and version are correct. Generated output/dependencies are untracked/ignored.

Hosted Ubuntu/Windows CI will be inspected on the PR head separately from local
Node/native-browser results. At report preparation, the PR has not yet been
opened; no hosted result is claimed here.

## Changed files, limitations and remaining work

Exact tracked change inventory: [changed-files.txt](changed-files.txt).
Production behavior changes only `src/js/ui/orb-band-picker.js` and
`src/js/ui/visualizers-panel.js`. Version updates: `version`, constants banner,
and two exact-version assertions. Tests: two focused files plus bounded DOM
helper. Optional browser/mutation programs, evidence, and one canonical identity
bullet in `agents.md` complete the scope. No audio/runtime implementation,
validator, preset codec, dependencies, CSS/template, root README or ROADMAP change.

Native tests are Chromium-only and use intercepted confirm responses; no claim
is made about OS dialog rendering or Safari/Firefox. Existing RC-20 missing
icons/manifest remains open and may cause resource 404s; page exceptions are
tracked separately. Root README/ROADMAP correctness and version reconciliation
remain scheduled for the dedicated documentation pass **after RC-20**.
Independent review is still required. Build 115N remains WITHHELD.
