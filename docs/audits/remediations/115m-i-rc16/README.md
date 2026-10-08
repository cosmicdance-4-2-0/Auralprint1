# 115M.I — RC-16 band-reference sanitation and RC-18 verification

**RC-16: production defect corrected, ready for independent review.**

**RC-18: CLOSED — Corrected incidentally by 115M.H.V; independently verified in 115M.I.**

Accepted source baseline: `main` at
`4d3cfeb77befc94b3512593e25cdf159a8f76d84`, version `v0.1.15m.h.w`.
The initial checkout was clean at that exact commit; connected GitHub inspection
also resolved remote `main` to that SHA before editing. Branch:
`codex/115m-i-rc16`. Target version: **v0.1.15m.i**. Preset schema: **10**.

This is a Build 115 sanitation bug fix with a small UI parser dependency.
There are no new fields, migrations, dependencies, analyzer changes or response
formula changes. Regression risk is the targeting/codec/UI boundary; sanitation
retains its existing bounded traversal. **115N remains WITHHELD.** No merge,
tag, release or promotion is authorized by this report.

## Original reproduction and root cause

The historical [release audit](../../2026-10-06_214431_PDT-release-audit.md),
[preset reproducer](../../evidence/2026-10-06_214431_PDT/presets/repro.mjs),
[preset output](../../evidence/2026-10-06_214431_PDT/presets/repro-output.txt),
and [render/analysis evidence](../../evidence/2026-10-06_214431_PDT/render_analysis/render-analysis-results.json)
are preserved unchanged.

Current source inspection confirmed `Number(v)` still preceded integer/range
validation in `sanitizeOrbBandIds()`. A focused adaptation of the original
RC-16 block was executed before production edits: raw schema-10 URL input
`[null, false, "", [], true]` was admitted as `[0, 1]`. With all channels at .9
full-spectrum energy but bands 0/1 silent, real `Orb.step()` at 1000 px produced
**10 px**, versus **721 px** for the empty-target control. See
[baseline evidence](baseline-rc16.json).

The current helper is used by every following production path:

- `normalizeOrbDef()` for explicit inputs and fallback targets; collection
  normalization, creation, duplication and UI canonical commits use that owner.
- `Orb` construction and `Orb.syncFromDef()`; initialization, ID reconciliation
  and settings synchronization reach these consumers.
- `sanitizePreset()` for supported legacy `bandNames` mapping, before canonical
  collection normalization. Both codec encode/decode boundaries sanitize.
- `parseBandSelection()` in the band picker module, called by the Orb editor's
  exact-index text control. This was the direct caller passing validated strings.

`UrlPreset` owns base64url JSON transport and preference replacement; its
existing error handling, settings-derivation ownership and admission rules are
unchanged. Picker checkboxes and ranges already produce numeric indices.

## Canonical policy and compatibility decision

Accept only primitive JavaScript **integer numbers** from zero through
`CONFIG.bandNames.length - 1` (currently 255). `Number.isInteger()` also excludes
NaN and both infinities. Reject null, undefined, booleans, strings (including
numeric and whitespace-only strings), arrays, objects, fractional values,
negative indices and out-of-range indices. Never call `Number()` on arbitrary
canonical entries.

Retain first occurrences in their original order, deduplicate, preserve valid
zero and the highest index, and return fresh independent arrays. Unsupported
entries are discarded individually, without rejecting an otherwise valid Orb or
scene. `[7, null, 3, false, 7, 0, true, 3]` becomes `[7, 3, 0]`.
An all-invalid input becomes `[]`; it uses the Orb's **selected L/R/C channel's
full-spectrum energy**, never implicit Band 0, global Center, silence or an
explicit all-bands list. Missing targeting retains the established fallback
normalization rule. An explicit empty array retains precedence over legacy names.

**Numeric-string decision: reject in canonical `bandIds`, with no legacy migration.**
Evidence inspected before deciding:

- `docs/Canon/0.1.10/index.html` (schema 5 writer and schemas 2–4 accepted common-root
  formats) uses legacy channel fields, with no numeric-string target format.
  Original schema-2–4 writers are unavailable; no claim is made of recovering them.
- Archived schema-6/7/8 sources in `docs/Canon/0.1.11/index.html`,
  `docs/Canon/0.1.12/auralprint_0.1.12.html`, and
  `docs/Canon/0.1.13/auralprint_0.1.13.html` store numeric arrays after normalization
  and serialize preferences to JSON. Their permissive reader is evidence of the
  defect, not a distinct emitted numeric-string format.
- Later top-level schema 9 at `2ae4191505f1dcbef9dbb762a0935bd9f6e74e3e` normalizes
  targets, and its human-text parser produces numbers through the old helper.
- Scene-node schema 9 at `eae5e1f446aeb7bea4a2d8097dd5e53c5867ea35` normalizes through
  `orb-settings.js`; its actual writer-emitted `tests/fixtures/schema-9-scene.json`
  contains `[7, 19]` and `[]`, with integer values.
- `tests/fixtures/legacy-presets.json` includes provenance for schemas 2–9; every
  represented `bandIds` entry is an integer number. Current schema-10 fixtures
  also use integer numbers. All historical expected field values still pass.

No accepted historical schema requiring numeric strings was found. Supported
`bandNames` aliases still map by exact configured names, in stable unique order,
and are stripped from canonical output. Schemas 2–9 and both schema-9 shapes
remain admitted, with existing top-level precedence and global-to-Orb migration.
No obsolete fields, Scene architecture, identity rules or ordering are revived.

The human interface stays explicit: validate digit-only tokens and their bounds,
then `tokens.map(Number)`, then canonical sanitation. Whitespace delimiters and
blank text retain their legitimate UI meaning; imported whitespace strings
remain unsupported model values. Native editor and picker interaction verify
the complete commit/synchronization path.

## Actual Orb response evidence

Before/after original malformed URL input:

| Observation | Accepted baseline | 115M.I |
| --- | --- | --- |
| Normalized targets | `[0, 1]` | `[]` |
| Full channel energy | .9 | .9 |
| Malformed Orb base radius at 1000 px | 10 px | 721 px |
| Empty-target control | 721 px | 721 px |
| Deliberately selected silent Band 0 | 10 px | 10 px |

Deterministic producer-owned arrays feed the real `updateAnalysisFrame()`,
`createVisualizerRuntime()` → Orb adapter → `Orb.step()` production path.
The mixed and fully valid `[7, 3, 0]` Orbs match; all-invalid and empty controls
match independently in every channel. At 1000 px:

| Channel | Full energy | Selected mean | Empty/all-invalid radius | Selected radius | Explicit Band 0 radius |
| --- | --- | --- | --- | --- | --- |
| L | .9 | 1.1/3 | 721 | 299.6666667 | 89 |
| R | .3 | 1.2/3 | 247 | 326 | 168 |
| C | .6 | 1.5/3 | 484 | 405 | 247 |

Separate waveform values (L=1, R=-.5, C=.25) verify unchanged radial displacement
and Cartesian position formulas. Global spectrum remains the producer's C array,
global dominant ownership remains unchanged, and consumers do not mutate arrays.
Runtime reconciliation retains identity, phase and history; duplication copies
independent configuration with fresh simulation history. See
[focused regression output](focused-tests.log) and
[native browser evidence](native-browser.json).

## RC-18 verification

The original audit's `pausedMotion` observation and its negative assertion in
`render_analysis/reproduce-render-analysis.mjs` were inspected. Current
`createSpectralRingVisualizer().update()` already guards free-run advancement
with `else if (!simPaused)`, introduced by revision H.V (`1987bed`), and uses
motion time. Orb adapters likewise skip motion/emission during pause. Current
Orb updates precede Ring lock.

The isolated RC-18 block is adapted in [reproduce.mjs](reproduce.mjs).
With `simPaused=true`, delta 1/30 and speed 2, Ring phase remains **1 → 1** and
Orb phase remains fixed. The historical assertion expecting **1 → 1.0666667**
fails with `AssertionError`; see [former assertion evidence](former-rc18-assertion.log).
The original whole audit scripts also assert unrelated already-corrected defects,
so only the authorized RC-16/RC-18 blocks were adapted and rerun.

New positive tests execute the real production callback and shortcut body, real
AnalysisFrame updates and real runtime consumers. For free and Orb-lock modes,
100 paused callbacks sample/update analysis while both phases remain fixed.
Resume advances .2 rad for the next .1-second frame, with no paused-time catch-up.
Native Chromium executes the actual boot-installed Space listener, callback and
DOM controls, independently confirming free/locked pause, 20 analysis samples
per paused interval, synchronized lock and debt-free resume at DPR 1 and 2.

Existing `ring-phase-lock.test.js` and `rc15-timing-performance.test.js` also pass,
including locked current-frame phase, free Ring pause, lifetime retirement,
motion discontinuities and recovery. No production Ring or timing source changed.

**Disposition: RC-18 CLOSED — Corrected incidentally by 115M.H.V; independently verified in 115M.I.**

## Validation and mutations

Commands ran sequentially where generated directories are shared:

1. Focused RC-16/RC-18: `node --test --test-isolation=none tests/rc16-band-references.test.js tests/rc18-motion-pause.test.js` — **31 pass**.
2. Relevant targeting/editor/collection/codec/analysis/runtime/Ring/RC-15 timing/
   URL/build regressions — **322 pass**, zero failures; [log](relevant-tests.log).
3. `npm ci --offline --cache /workspace/auralprint-environment/npm-cache` — initial
   esbuild binary validation hit sandbox `EPERM`; permitted retry succeeded,
   **2 packages installed**, no lockfile/dependency changes. [Install evidence](npm-ci.log).
4. `npm test` — **540 pass, 0 fail, 1 skip**. The pre-existing million-particle
   stress test remains opt-in via `AP_MILLION_STRESS`; it was not needed for this
   targeting correction. [Full output](npm-test.log).
5. `npm run build` — **PASS**; [build output](build.log). Verified untracked
   `dist/auralprint_0.1.15m.i.html`, **397,799 bytes**, embedded version/schema,
   strict sanitizer and explicit UI conversion; [SHA-256 and checks](artifact.json).
6. `git diff --check` — **PASS**. Generated bundles, artifact, node_modules,
   caches and temporary workspace files are not committed.
7. `AP_REPORT=work/115m-i/native-browser.json node scripts/validate-rc16-rc18.cjs`
   — **PASS**, Chromium **151.0.7922.173**, DPR 1/2. Controlled sample/time seams
   provide deterministic source-module checks; unmodified standalone HTML also
   boots, decodes/plays stereo WAV, advances the scrubber and stops. No page errors.
   Existing icon 404s are recorded under deferred RC-20, without production changes.
   Native validation uses HTTP; direct file-URL behavior is not asserted.

The scripts under this directory preserve original defect assertions as negative
controls. Both `--expect-rc16-defect` and `--expect-rc18-defect` exit 1 with
`AssertionError` against the corrected source; normal execution passes. See
[after results](after.json) and [RC-16 former assertion](former-rc16-assertion.log).

[mutation-check.py](mutation-check.py) copies source/tests into an isolated
temporary checkout and restores each copy after execution. All four deliberate
mutations are detected by assertion failures, not syntax/import failures:

- [Restore permissive Number coercion](mutation-permissive-coercion.log).
- [Drop valid Band 0](mutation-drop-valid-zero.log).
- [Reject every target](mutation-reject-all-targets.log).
- [Ignore free Ring pause](mutation-free-ring-pause-ignored.log).

[Machine-readable mutation results](mutations.json) record exit code 1 for each.
The suite therefore protects deliberate targeting as well as malformed-input
rejection. Two existing codec tests that encoded accidental string acceptance
now assert rejection **and add numeric selection controls**, retaining their
full-object and legacy precedence checks. No fixture snapshots, historical
results or unrelated assertions were weakened.

## Changed files and review boundary

Production behavior: `src/js/core/preferences.js` and
`src/js/ui/orb-band-picker.js` only. Version metadata: `version` and the canonical
header in `src/js/core/constants.js`. `agents.md` narrowly records the target-type
contract. Tests: new RC-16/RC-18 files, existing codec numeric controls and exact
version assertions. Optional native tooling: `scripts/validate-rc16-rc18.cjs` and
`.mjs`. This directory holds the report, focused repro/mutation tooling and evidence.

Git's configured proxy is unreachable in this environment. Remote baseline
inspection and publication use the authenticated GitHub connector. Publication
verifies the tested local tree against the uploaded Git tree; hosted Linux and
Windows status belongs to the exact PR head and is reported in the PR and final
handoff, rather than inferred from local checks.

RC-01–RC-15 retain prior acceptance. RC-16 awaits independent review. RC-18 is
verified closed. **RC-17, RC-19, RC-20, RC-21 and RC-22 remain deferred/open**.
No FFT, analyzer, Ring presentation, particles/governor/timing, geometry, recorder,
phase UI, help text, Remove confirmation, Canvas or Build 116 Camera work was
undertaken. General README/ROADMAP and original hostile audit evidence are unchanged.

**Build 115 is not released or promoted. 115N remains WITHHELD.**
