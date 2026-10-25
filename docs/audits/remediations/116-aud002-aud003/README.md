# Build 116: Analysis drafts and CONFIG editing grids

Accepted baseline: `d2a92a868e214ae5cba77ea91600b9965038ff19`, verified against
GitHub's remote main ref and `git ls-remote origin refs/heads/main`; clean checkout
before branching to `codex/116-aud002-aud003-config-steps`. Corrective bug-fix scope:
AUD-002, AUD-003 and the explicitly authorized Orb/Bulk editing contract. Schema
12, schemas 2–11 migration, CONFIG numerical policy, Build 115 canon, simulation,
history, renderer, audio/AnalysisFrame, recording and camera geometry are unchanged.
No AUD-004 or Build 117 work. Stop at owner review; no merge/release authorization.

## Reproduced accepted-main failures

- [Node baseline](baseline-node.txt): four delayed File workflow assertions fail:
  focused floor/ceiling drafts `37.125` and empty text become `20` / `22500`.
  Tests use the real coordinator and pending File activation path.
- [Chromium baseline](baseline-native.txt): actual built portable application,
  real WAV/File selection, native playback completion delayed by holding its
  returned promise. Focus remains on floor while `37.125` becomes `20`.
  RMS `.123456` is represented as `.12`; Ring point size `3.456` as `3` while its
  readout says `3.456px`. Orb speed uses `any`, Trace count uses native step `1`.
- The unmodified new mandatory smoke also fails against an isolated accepted-main
  checkout on the actual focused File draft assertion. With only the Analysis
  correction installed there, it rejects the original Orb `any` step; with Orb
  corrected too, it rejects the original Ring readout/ARIA discrepancy.

## Complete numeric slider inventory

There are **38 editing controls**: 17 individual Orb, 11 Bulk, two Analysis and
8 Ring. Rows marked **I/B** exist in both individual and Bulk editors; **I** has
no Bulk counterpart. CONFIG paths below are relative to `CONFIG.limits`.
Defaults are from `CONFIG.defaults`; both shipped default Orbs share behavior.
All bounds are inclusive for historical normalization. UI grid indices are
`min + n * step`, within those bounds; an off-grid bound is not an extra index.

| Owner / canonical field | CONFIG limit | Min | Max | Step | Default | Existing normalization admits off-grid? |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| I/B motion.angularSpeedRadPerSec | motion.angularSpeedRadPerSec | .01 | 3 | .01 | π/2 | Yes; finite clamp |
| I centerXFrac | orbs.centerXFrac | −.95 | .95 | .01 | 0 | Yes; finite clamp |
| I centerYFrac | orbs.centerYFrac | −.95 | .95 | .01 | 0 | Yes; finite clamp |
| I startAngleRad | orbs.startAngleRad | 0 | 2π | π/180 | 0 / π | Yes; canonical radians wrap to [0, 2π) |
| I hueOffsetDeg | orbs.hueOffsetDeg | 0 | 360 | 1 | 0 | Yes; finite clamp |
| I/B response.minRadiusFrac | orbs.response.minRadiusFrac | .01 | .4 | .01 | .01 | Yes; finite clamp |
| I/B response.maxRadiusFrac | orbs.response.maxRadiusFrac | .3 | 1 | .01 | .8 | Yes; finite clamp |
| I/B response.waveformRadialDisplaceFrac | orbs.response.waveformRadialDisplaceFrac | .01 | 1 | .01 | .1 | Yes; finite clamp |
| I/B particles.emitPerSecond | particles.emitPerSecond | 10 | 1000 | 10 | 240 | Yes; finite clamp, fractional emission |
| I/B particles.sizeMinPx | particles.sizeMinPx | .5 | 6 | .1 | 1 | Yes; also capped at sizeMaxPx |
| I/B particles.sizeMaxPx | particles.sizeMaxPx | 1 | 12 | .1 | 8 | Yes; finite clamp |
| I/B particles.sizeToMinSec | particles.sizeToMinSec | .1 | 120 | .1 | 3 | Yes; finite clamp |
| I/B particles.ttlSec | particles.ttlSec | .1 | 600 | .1 | 6 | Yes; also raised to sizeToMinSec |
| I/B particles.minPlacementDistanceUnits | particles.minPlacementDistanceUnits | 0 | 10 | .1 | .5 | Yes; schema 10 migrates pixel field |
| I/B trace.numLines | trace.numLines | 10 | 1000 | 10 | 10 | Yes; all integers, ceil(clamped fractions) |
| I trace.lineAlpha | trace.lineAlpha | 0 | 1 | .01 | .35 | Yes; finite clamp |
| I trace.lineWidthPx | trace.lineWidthPx | 1 | 6 | 1 | 2 | Yes; finite clamp |
| Analysis audio.rmsGain | audio.rmsGain | .05 | 10 | .01 | 1 | Yes; finite clamp |
| Analysis audio.smoothingTimeConstant | audio.smoothingTimeConstant | .01 | .99 | .01 | .1 | Yes; finite clamp |
| Ring alpha | bands.overlayAlpha | 0 | 1 | .01 | .65 | Yes; finite clamp |
| Ring pointSizePx | bands.pointSizePx | 1 | 10 | 1 | 3 | Yes; finite clamp |
| Ring minRadiusFrac | bands.overlayMinRadiusFrac | .01 | .4 | .01 | .01 | Yes; finite clamp |
| Ring maxRadiusFrac | bands.overlayMaxRadiusFrac | .3 | 1 | .01 | .8 | Yes; finite clamp |
| Ring waveformRadialDisplaceFrac | bands.overlayWaveformRadialDisplaceFrac | .01 | 1 | .01 | .18 | Yes; finite clamp |
| Ring lineAlpha | bands.overlayLineAlpha | 0 | 1 | .01 | .35 | Yes; finite clamp |
| Ring lineWidthPx | bands.overlayLineWidthPx | 1 | 6 | 1 | 1 | Yes; finite clamp |
| Ring ringSpeedRadPerSec | bands.ringSpeedRadPerSec | 0 | 2π | .01 | 0 | Yes; finite clamp, including 2π |

Band floor/ceiling are **numeric fields, not sliders**. CONFIG defines no
frequency step/range lattice. Their established positive-finite and non-crossing
validation remains; fractional Hz is still valid. FFT is an enumerated select.

### Defaults, endpoints and historical rationale

- The only off-grid default in this inventory is each Orb's angular speed
  `Math.PI * .5 = 1.5707963267948966`. The UI selection is `1.57`; canonical
  defaults stay unchanged, including on Reset All Settings. Other defaults,
  including phase π at index 180, were checked rather than assumed compliant.
- Ring speed's configured maximum `2π = 6.283185307179586` is **off-grid**.
  Its last regular editing index is 628, value `6.28`. End/pointer/forged input
  cannot commit `2π`; imported `2π` remains canonical until deliberate editing.
- Phase's CONFIG step is `1 / RAD_TO_DEG`, one degree in radians. Index 360
  is the explicit exact CONFIG endpoint `TAU`, submitted as that exact number
  and normalized to zero by the unchanged Orb owner. There is no incremental
  radian addition or history reset. A fractional import moves to the next grid
  index in the requested arrow direction (1.5° → 2° right / 1° left).
  The native phase control uses **degrees**, deriving its min, max and step by
  multiplying the CONFIG radian values by `RAD_TO_DEG` (0, 360, 1). This is a
  unit conversion, not an alternate step. Chromium decimal range arithmetic
  otherwise puts `360 * String(oneDegreeInRadians)` just beyond `String(TAU)`
  and can sanitize an attempted endpoint to 359°. Degree-native End and pointer
  selection reach 360 exactly; the owner converts via canonical grid indices.
- Trace count's old step 1 disagreed with CONFIG step 10. Existing integers such
  as 16 remain legal persisted artwork, but deliberate UI selection uses
  10, 20, …, 1000. Integer CONFIG controls commit integers.
- [Historical AUD-009 rationale](../115m-i-g-aud008-aud009/numeric-contracts.md)
  intentionally allowed arbitrary continuous UI submissions and preserved all
  integral Trace counts using native `any`/`1`. That editing policy is superseded
  by this pass's authorization. Historical evidence and persistence assertions
  remain; current tests now distinguish editing from normalization.

## Implemented ownership

`ui/config-range.js` is a narrow editing-only helper shared by the three existing
editor owners. It binds CONFIG min/max/step, validates the owner's submitted
number independently of HTML sanitation and selects a valid integer grid index.
Floating membership tolerance is 64 binary64 epsilons scaled to the index;
decimal CONFIG values serialize from the index without accumulated addition.
Non-grid maxima are excluded. Exact size/lifetime dependency bounds take
precedence over tolerance, including one-ULP boundary cases.

Normal native pointer dragging, Tab/focus, Home/End and modified native shortcuts
remain. Local arrows choose adjacent indices; off-grid canonical values move
onto the grid in the requested direction. The owner validates all input paths,
including a test submission bypassing HTML step sanitation. Size min/max and
decay/lifetime edits select only indices satisfying the unchanged neighboring
canonical value; Bulk uses the intersection for all affected Orbs. Editing one
field must not cause historical normalization to modify another.

Rendering an off-grid canonical value never commits it. Visible and accessible
readouts say, for example, **“Current 3.456px; slider selection 3px (edit to apply)”**.
The native thumb is the editable selection, not a claim that the artwork is 3px.
Phase describes both values in degrees. A deliberate edit replaces only that
control's canonical value with a grid value. Bulk preserves “mixed” and describes
its selection through ARIA. Zero-Orb and phase-locked controls remain disabled.
Settings-reference guards and stable controller identity remain in place.

Analysis owns focused/dirty floor and ceiling drafts until the existing `change`
validation commits or rejects them. Ordinary settings refreshes, File completion,
transport and frames update canonical readouts/HUD independently. Draft text,
focus and applicable selection remain untouched. Invalid and crossed drafts
restore the canonical field without mutation. Duplicate changes are no-ops.
Successful Apply URL Preset and Reset All Settings explicitly replace both
drafts even with focus, clear their dirty ownership, and make subsequent blur/
change read the new canonical text. Invalid imports do not replace drafts.
Hidden table deferral and CONFIG HUD throttling are unchanged.

## Separately reviewable persistence decision — not approved or implemented

Applying this lattice inside `normalizeOrbDef`, `sanitizePreset`, migrations,
encoding or general settings refresh would change existing schema-10/11/12
artwork, including defaults and values previously preserved by AUD-009. With
nearest-index quantization the concrete changes would include:

| Existing canonical value | Globally step-strict replacement | Observable impact |
| --- | --- | --- |
| Orb speed π/2 | 1.57 rad/s | Changes default and saved orbital timing |
| RMS gain .123456 | .12 | Changes analysis response |
| Ring point size 3.456 | 3px | Changes rendered mark size |
| Ring speed 2π | 6.28 rad/s | Changes free-run timing and bound semantics |
| Orb emission 245.5 | 250/s | Changes emission timing/density |
| Trace count 16 (historical 15.5 → ceil 16) | 20 | Changes retained Trace segment rendering |
| Designed fractional phase 1.5° | 2° under nearest/up tie policy | Changes reset/initial design geometry |

The impact extends to **every “Yes” row above**, including fractional hue,
positions, response, opacity, sizes, spacing, time and line widths. Encoding
currently sanitizes too, so changing that boundary would also rewrite values on
Share without an edit. Defaults would need an explicit decision, and dependent
size/lifetime constraints and phase ties/endpoints need versioned policy.

That is a persisted semantic change requiring an approved versioned preset
contract/migration strategy, with old-schema decoding retaining its accepted
meaning or an explicitly authorized conversion. **Global persistence is not
step-strict.** This PR authorizes only new UI commits; it neither introduces a
migration nor silently adjusts CONFIG defaults/steps. Owner review may approve a
separate future proposal; no approval is needed to preserve the current boundary.

## Validation and owner check

Local Linux verification uses Node 24.19.0, npm 11.9.0, Python 3.12.14,
Playwright 1.64.1 and its pinned Chromium headless shell 156.0.8078.4:

- Focused seven-file Node set: **138 passed**. The production-coordinator File
  and UI commit regressions also pass inside the full suite.
- Full `npm test`: **1,277 passed, one existing opt-in retention test skipped,
  zero failures** (1,278 total).
- Build, portable/hosted distribution verifier and `git diff --check`: pass.
- Unchanged required authored-camera browser smoke: pass, portable and hosted.
- [New native editing matrix](native-editing.json): all 38 controls, source,
  portable and hosted at DPR 1/2. Includes every intermediate input commit,
  actual pointer drags/arrows/Home/End, exact phase endpoint, imported precision,
  unclipped discrepancy text/ARIA, owner validation and Scene field isolation.
- [Existing phase/history native integration](native-phase.json): pass, source
  and portable at DPR 1/2 plus normal-scheduling stereo File playback. Orb/list/
  tail/governor/fraction/Ring/history identities remain protected.
- Existing native spacing/Bulk, Analysis producer and 116D source/portable/hosted
  compatibility harnesses: pass at DPR 1/2.
- Required-gate negative controls: accepted-main draft loss, original Orb `any`
  and original Ring representation are rejected with relevant assertions. See
  [draft](negative-drafts.log), [Orb](negative-orb-steps.log) and
  [Ring](negative-ring-readout.log) output. Historical evidence is untouched.

CI results are reported on the corrective PR; local results do not assert a
remote run that has not finished.
The required Ubuntu job runs `npm run test:browser:editing` after the existing
pinned Playwright 1.64.1 Chromium install and build. The authored-camera smoke
remains a separate unchanged required step. No dependency or lockfile change.

Reproduce with `npm ci`, `npm test`, `npm run build`,
`python3 scripts/verify_distribution.py`,
`npx playwright install --with-deps chromium --only-shell`,
`npm run test:browser`, and `npm run test:browser:editing`.
Set `AP_DPRS=1,2` for the broader editing matrix; `AP_REPORT` optionally saves JSON.
Optional native `validate-rc17.cjs`, `validate-rc15-spacing-ui.cjs` and
`validate-116d.cjs` accept `AP_CHROMIUM_PATH` for the installed executable.

Owner: import a fractional Scene and inspect Orb/Bulk, Analysis and Ring readouts;
Share before editing and confirm exact values survive. Drag/use arrows and
Home/End; confirm only the deliberately edited field moves to its CONFIG grid.
Try Ring lock, Trace 16, phase 359.5° → right → 0°, and the default Orb speed.
Type valid and incomplete floor/ceiling drafts while loading audio; confirm no
loss at completion. Check crossed-bound rejection, hide/reveal, Apply URL Preset
and Reset All Settings. Inspect phase edits while moving: history/live phase
continue until explicit Reset Visuals. Review the persistence decision separately.

Browser evidence qualifies Linux Chromium over local HTTP, DPR 1/2 and emulated
native input. Physical assistive technology, other browsers/devices, direct
`file://` and release/artistic acceptance remain owner testing, not asserted here.
