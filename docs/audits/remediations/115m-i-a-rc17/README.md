# 115M.I.A — RC-17 canonical designed Orb phase and truthful slider

RC-17 is corrected and ready for independent review. Version **v0.1.15m.i.a**;
preset schema **10**; Build **115**. **115N remains WITHHELD.**

## Verified starting point and scope

Accepted `main`: **4ea4d78877fe83096dc93bdbbe68d6ac9c5b999d**, version
`v0.1.15m.i`, tree `19c44a0b0332231db6f984ed9ae1c45df616dfee`.
The initial clean sandbox was stale at `4d3cfeb77befc94b3512593e25cdf159a8f76d84`.
Its configured Git proxy was unreachable. The authenticated GitHub connector
confirmed current `main` and retrieved missing objects; every blob/tree and the
signed accepted commit were reconstructed and SHA-verified locally. The clean
checkout at the accepted SHA was verified before implementation; branch
`codex/115m-i-a-rc17` starts there. No unrelated working changes were overwritten.

Read before editing: `agents.md`, current `ROADMAP.md`, the original
[October 6 audit](../../2026-10-06_214431_PDT-release-audit.md), its native
[UI reproducer](../../evidence/2026-10-06_214431_PDT/ui/ui-control-repro.cjs),
and production preferences, CONFIG, codec/URL transport, collection, editor,
UI commits, Orb, runtime reconciliation, color policy and visualizer resets.

This is a narrow Build 115 bug fix. Risk is concentrated at canonical phase,
native representation and reset boundaries. No schema fields, CONFIG numbers,
dependencies, simulation formulas, audio lifecycle or analysis architecture
change. Normalization is constant-time; editor work happens on settings refresh
or user input, preserving existing refresh invalidation.

## Original defect reproduced before implementation

Adapted only the original RC-17 block, using actual schema-10 URL import, actual
boot-generated editor and the public Share transport to observe persisted values.
Native Chromium **151.0.7922.173**, source and versioned baseline standalone,
DPR **1 and 2**, all reproduced the mismatch. No mocked range proved this result.
See [baseline-browser.json](baseline-browser.json).

| Observation | Accepted baseline | Corrected revision |
| --- | --- | --- |
| Imported `4π` | 12.566370614359172 rad | Same input |
| Persisted/exported phase | 12.566370614359172 rad | 0 rad |
| Native range value | 6.26573201465964 rad, about 359° | 0 rad |
| Visible value | 720° | 0° |
| `aria-valuetext` | 720 degrees | 0 degrees |
| Range min / max | 0 / TAU | 0 / TAU |
| Native step | 0.017453292519943295 rad | `any` |

Baseline fractional imports were also measured: 0.5° snapped to about 1°;
1.5° snapped to about 1° while the readout said 2°; 57.2958° snapped to 57°;
359.5° and a value immediately below TAU snapped to about 359° while the readout
said 360°. Negative 90° showed -90° while the thumb was at zero.

The original unbounded-persistence assertion now fails with `AssertionError`:
actual zero, expected 12.566370614359172. See
[former-defect-assertion.log](former-defect-assertion.log).

## Canonical half-open contract

`startAngleRad` is a designed position within one revolution, not a turn counter:
**`0 <= startAngleRad < TAU`**, using the existing `TAU = 2 * Math.PI`.
`normalizeOrbPhaseRad()` is a pure helper owned by `normalizeOrbDef()`.
Already-canonical radians return unchanged, except negative zero becomes positive
zero. Other finite numbers use remainder modulo TAU and add TAU for negative
remainders. Exact positive/negative multiples become zero. There is no clamping,
degree quantization, epsilon snapping or hidden state in canonical normalization.

| Input | Canonical result |
| --- | --- |
| 0, -0 | +0 |
| π/2, π, 3π/2 | Unchanged |
| TAU, 2TAU, -TAU, -2TAU | 0 |
| 5π/2 (450°) | π/2 (90°) |
| -π/2 (-90°) | 3π/2 (270°) |
| 1.5° in radians; valid value just below TAU | Exact input retained |

NaN, infinities, strings, booleans, arrays, objects and boxed numbers do not
coerce. Invalid/missing values use the corresponding finite fallback, normalized
with the same policy; an invalid fallback uses zero. Collection defaults retain
their corresponding 0/π phases, including valid explicit zero at a π-default slot.

## Canonical ownership and historical compatibility

The existing production paths already converge on `normalizeOrbDef()`:
`normalizeOrbCollection()`, codec sanitation on import **and export**, URL import,
creation/duplication, per-ID editor commits and `UI.applyPrefs()`. Those paths
receive the same correction without adding independent codec/UI normalizers.
`resolveSettings()` derives settings; Orb construction/sync consumes the resulting
definition. Runtime consumers and orbital formulas remain unchanged.

Schema 10 and development-era schema-10 snapshots are accepted; obsolete overlap
fields remain stripped and missing particle/resource fields retain their existing
defaults. Supported schemas 2–9 and both schema-9 layouts remain accepted.
Scene-node recovery preserves the phase field; later top-level Orbs take precedence.
Global-to-Orb motion/response/particle/trace migration is unchanged. Inspected
archived schemas 5–8 store designed radians and default 0/π; the compatibility
fixtures cover supported earlier common-root formats and both schema-9 forms.
No accumulated-turn artistic semantics or separate persisted degree field is added.
Original schema-2–4 writers are unavailable; their supported readers/fixtures are
tested rather than presented as recovered writers.

Tests change only phase in historical fixtures and compare the complete remaining
canonical object. Unknown fields stay stripped; stable IDs, band references,
ordering, color, RC-15 selected resources and RC-16 strict targeting remain intact.
Missing/invalid phase, independent Orbs, replacement, Share serialization,
creation/duplication and Reset All Settings are covered.

## Native slider and display decision

The phase control keeps CONFIG's **0–TAU native range**, with an editor-specific
**`step="any"`**. Its former fixed step altered fractional imports. Pointer/native
input remains continuous. Arrow Up/Right and Down/Left adjust the **canonical
designed phase** by CONFIG's existing one-degree step, then use the normal per-ID
commit and synchronous editor refresh. Reading the canonical value for Arrow
adjustment avoids accumulating Chromium's serialization error. Ordinary whole
degrees remain simple; imported fractional precision is never changed by rendering.

Native endpoint input submits the exact CONFIG maximum when Chromium reports a
value at/above it. The canonical normalizer wraps that endpoint to zero; the
existing synchronous commit refresh returns thumb, readout and ARIA to zero before
the input handler finishes. This endpoint adapter does not clamp preset phases.
Keyboard End, programmatic endpoint input and the post-commit zero state are tested.

One formatting helper feeds visible and accessible output: exact whole-degree
round trips are integers; ordinary fractions use 12 significant digits. If that
display rounding would turn a fractional value into an exact integer, the full
numeric representation is retained. In particular, a valid near-TAU phase is
displayed as **359.99999999999994°**, never 360°. The formatting changes no radians.

Chromium still serializes range doubles to roughly 15 significant digits with
`step=any`; bit-for-bit equality between its getter and arbitrary supplied doubles
is unavailable. For example 0.5° is stored exactly as 0.008726646259971648 rad,
while native `value` reads 0.00872664625997165. The near-TAU getter can read
6.28318530717959 although configured `max` is 6.283185307179586. Evidence records
the actual numbers instead of assuming setter fidelity. Native agreement is
checked within **1e-14 rad**, about 6e-13 degrees; canonical persistence is checked
with exact equality separately. This tolerance cannot hide one-degree snapping.

## Designed versus live phase and geometry

Moving source-runtime probes use the actual boot listeners and animation callback
with a controlled clock and frozen scheduling. Before editing, live phase was
**0.4500000000000002 rad**. A designed edit to about 1.5° leaves that live angle,
Orb object, trail list/tail, governor, emission fraction, diagnostics, independent
Orb and Ring phase unchanged. The next 0.1-second frame advances normally by
0.2 rad, to **0.6500000000000004**. The UI continues showing designed phase.

Reset Track clears trail history, retains designed phase and leaves live phase
and Ring phase unchanged. Reset Visuals uses the actual button and established
lifecycle: live phase becomes the new canonical design, trails clear, locked Ring
uses that design and free Ring resets independently to zero. Subsequent Orb-lock
follows current-frame Orb motion; free Ring retains its independent speed/phase.
Duplication copies canonical design into a separate runtime Orb starting there,
with empty history, while the original survives.

Actual `Orb.step()` coordinates are compared for 0/TAU, π/2/5π/2 and -π/2/3π/2,
positive/negative chirality and zero/ordinary speed. Each pair runs 10,000 updates,
crossing many wrap boundaries. Coordinates, radial waveform displacement and
phase-derived palette colors match. Stable-ID reconciliation retains runtime
objects/history across reordered canonical replacement. Orb particle placement,
audio targeting, waveform formula and color policy code are unchanged.

## Regression, mutation and browser evidence

- [Dedicated model/lifecycle suite](../../../../tests/rc17-designed-phase.test.js)
  and [generated-editor suite](../../../../tests/rc17-phase-editor.test.js):
  **33 pass**, zero failures; [focused output](focused-tests.log).
- [Mutation runner](mutation-check.py) uses isolated temporary copies and restores
  each modified copy. **9/9 detected by assertion failures**, not syntax/import
  failures: unbounded persistence, clamp, negative remainder, dropped zero,
  stale endpoint thumb, integer readout, radians in ARIA, edit teleport and ignored
  visual reset. [Machine-readable results](mutations.json) include failing assertions.
- Native optional [driver](../../../../scripts/validate-rc17.cjs) and
  [source lifecycle probe](../../../../scripts/validate-rc17.mjs), externally
  available Playwright/Chromium, no project automation dependency:
  **DPR 1 and 2 pass**, source and final versioned standalone. Actual URL imports,
  generated controls, native values/step, readout/ARIA, real Arrow/End/pointer input,
  programmatic input, same-handler endpoint refresh, focus, listener counts,
  reorder, open-editor replacement, lifecycle and Reset All are verified.
- [Native results](native-browser.json), plus native 359.5° thumb screenshots at
  [DPR 1](native-phase-dpr1.png) and [DPR 2](native-phase-dpr2.png).
  Normal-scheduling **unmodified standalone HTML** also imports, applies Reset
  Visuals, decodes/plays stereo WAV, advances the scrubber, keeps designed readout
  fixed during motion and stops, at both DPRs. Zero page errors.
- `npm ci --offline --cache /workspace/auralprint-environment/npm-cache`: initial
  sandbox child-process `EPERM`; permitted retry succeeds, **2 packages** installed.
  [Install evidence](npm-ci.log). Dependencies/lockfile unchanged.
- `npm test` then `npm run build`, sequentially: **573 pass, 0 fail, 1 existing
  opt-in million-particle stress skip**; [full test output](npm-test.log),
  [build output](build.log). Existing RC-01–RC-16 and RC-18 regressions pass.
- `git diff --check`: **PASS**. Final untracked standalone
  **`dist/auralprint_0.1.15m.i.a.html`**, with corrected implementation and schema 10
  verified in the assembled bundle. [Byte count/hash/inspection](artifact.json).

Reproduce final evidence after installing the existing locked dependencies:

```sh
node --test --test-isolation=none tests/rc17-designed-phase.test.js tests/rc17-phase-editor.test.js
npm test
npm run build
AP_REPORT=work/native-browser.json node scripts/validate-rc17.cjs
python3 docs/audits/remediations/115m-i-a-rc17/mutation-check.py
node scripts/validate-rc17.cjs --expect-defect # must fail the original assertion
git diff --check
```

For baseline reproduction, use a separate checkout at the accepted SHA, copy the
optional driver there, build its baseline standalone, and pass `--baseline`.
`AP_PLAYWRIGHT_MODULE` and `AP_CHROMIUM_PATH` select external tooling as needed.
No browser dependency is required by `npm test` or hosted CI.

## Limitations and deferred work

JavaScript finite inputs guarantee finite canonical output, not recovery of lost
angular precision from enormous doubles. `%` operates on the supplied double and
the representable TAU; enormous values already lack small fractional phase bits.
Adding TAU to a negative remainder smaller than its representable spacing can
round exactly to TAU; that result becomes zero to preserve the half-open contract.
There is no epsilon neighborhood snapping, and canonical inputs just below TAU
retain their exact value. Native range getter serialization has the separate
measured precision limit above; below-boundary values can be visually
indistinguishable from an endpoint at finite pixel resolution. Explicit native
endpoint input selects zero; merely importing or rendering a near-boundary value
retains its exact persistent radians.

Browser evidence is Chromium on Linux over loopback HTTP. Safari, Firefox,
physical touch and direct `file://` launch are not newly accepted here. Existing
metadata asset 404s belong to deferred RC-20. No unrelated audit fix is included.
RC-19 recorder disposal, RC-20 deployment assets, RC-21 picker wording and RC-22
Remove confirmation remain deferred/open. General README/ROADMAP reconciliation,
Build 116 Camera and Build 115 promotion/release remain separate work.

## Exact changed-file inventory

Production: `src/js/core/preferences.js`, `src/js/ui/orb-editor.js`.
Version: `version`, `src/js/core/constants.js`.
Contract: `agents.md` (only pre-release phase/ownership notes).
Tests: `tests/rc17-designed-phase.test.js`, `tests/rc17-phase-editor.test.js`,
`tests/targeted-audit.test.js` (only exact version assertions).
Optional browser tooling: `scripts/validate-rc17.cjs`, `scripts/validate-rc17.mjs`.

Under `docs/audits/remediations/115m-i-a-rc17/`, exactly:

```text
README.md
artifact.json
baseline-browser.json
build.log
focused-tests.log
former-defect-assertion.log
mutation-check.py
mutations.json
native-browser.json
native-phase-dpr1.png
native-phase-dpr2.png
npm-ci.log
npm-test.log
```

Historical audits/evidence, root README, ROADMAP and all runtime/render/audio
production files remain unchanged. Generated HTML/bundles, dependencies, browser
profiles, temporary mutation checkouts and caches are not tracked.

Publication uses the authenticated GitHub connector because the shell Git proxy
is unreachable. The uploaded Git tree is compared to the validated local tree.
Exact starting/final commit SHAs and hosted Linux/Windows check states are recorded
in the PR and handoff, belonging to the published head rather than inferred from
local results. No merge, release, tag or 115N promotion is performed.

**115M.I.A COMPLETE — RC-17 READY FOR INDEPENDENT REVIEW.**
