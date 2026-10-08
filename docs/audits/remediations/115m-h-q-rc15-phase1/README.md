# Build 115M.H.Q — RC-15 phase 1 checkpoint

**RC-15: PARTIAL REMEDIATION — NOT CLOSED.**

Accepted baseline: `main` at `e273bba5c2a9c0da04f2472395f05c751a799231`, `v0.1.15m.h.p`. Clean checkout and freshly fetched `origin/main` matched before edits. Continuing development branch: `codex/115m-h-q-rc15`. Target: `v0.1.15m.h.q`. This is an unpublished development checkpoint, not a release, promotion, final PR, or closure. Prompt 2 and Prompt 3 remain human-directed stages.

## Implementation and contract

- `src/js/render/trail-system.js`: removed `removeOverlaps`, its squared-distance comparisons and proximity splices, the radius/settings argument to `emitAt`, and the runtime-settings/DPR imports. `emitAt` only appends a new particle. TTL expiry still compares real `nowSec` with `bornSec`; reset still clears particles and the emission accumulator.
- `src/js/core/config.js`: removed the overlap default and range. Emission, sizes, decay, TTL, motion, response, trace, and Orb defaults otherwise retain their values.
- `src/js/core/preferences.js`: the canonical `normalizeOrbDef` whitelist no longer includes overlap. Collection creation, duplication, reconciliation, imports, and encoding continue to use the existing canonical normalization paths.
- `src/js/presets/preset-codec.js` and `url-preset.js`: existing sanitation on both decode/application and encode strips overlap and other unknown properties. No compatibility algorithm, schema 11, or removal-only migration was added. Supported schemas 2–9, including both schema-9 forms and their precedence, remain accepted. Historical input fixtures are preserved; expected migrated timing now reflects the safety ceiling. The canonical schema-10 fixture has five particle fields and a smaller legal non-default timing value.
- `src/js/ui/orb-editor.js`: removed generated overlap range, label/readout, controller entries, listener, synchronization, Bulk listener, and Bulk synchronization. `src/index.template.html` and `src/js/ui/dom-cache.js`: removed Bulk label/input/readout, cached DOM references, and range binding. Production source and current measurement scripts contain no surviving overlap ownership. Compatibility inputs and negative assertions deliberately retain the obsolete property in validation scripts/tests; historical sources and audit reports are untouched.
- `agents.md`: revised only the narrow pre-release schema exception/checklist and canonical Orb particle inventory. Schema 10 freezes when Build 115 ships; this correction does not authorize future incompatible reuse after publication.
- Root `version` and the source banner agree at `v0.1.15m.h.q`. `PRESET_SCHEMA_VERSION` remains exactly **10**.

## Independent simulation-time safety

`CONFIG.limits.timing.maxDeltaTimeSec` is deeply frozen at **1/30 second = 0.03333333333333333 seconds**, sharing the existing intended default value through one CONFIG-owned constant. It is not a preference or persisted safety setting.

`src/js/core/timing.js` owns `normalizeMaxDeltaTimeSec` and `simulationDeltaSec`. Positive finite requested maxima are bounded by CONFIG; smaller positive requests survive. Invalid, negative, zero, nonfinite, and wrong-type requests fall back to the existing default, itself independently bounded. Preset sanitation/encoding and `resolveSettings()` use this boundary without mutating preferences during resolution.

`main.js` calls `simulationDeltaSec` at animation consumption even for manipulated or malformed timing settings. Finite positive elapsed time is bounded by the smaller resolved request and independent ceiling; invalid/nonpositive elapsed time produces zero simulation delta. The last real frame timestamp advances to the current timestamp, so excess elapsed time is discarded rather than queued. `performance.now()`, particle birth/expiry timestamps, AnalysisFrame sampling, transport, and recording retain their existing clock/ownership paths.

The temporary per-Orb emission guard now uses a finite CONFIG-bounded emission rate and the immutable CONFIG timestep, retaining its existing rounding and `+2` allowance. For normalized defaults it permits at most **10** emissions per invocation; at the maximum normalized rate of 1,000/s, at most **36**. Ordinary 60 Hz emission is unchanged. This is not an aggregate allocation policy. The existing emission accumulator behavior is retained; final allocation, fairness, and backlog semantics await Prompt 2. Direct abnormal subsystem deltas cannot defeat this single-invocation guard, but it does not define final aggregate resource safety.

## Regression and mutation evidence

Focused command:

```sh
node --test --test-isolation=none tests/rc15-phase1.test.js tests/orb-editor.test.js tests/orb-collection.test.js tests/preset-schema-10.test.js
```

**92 tests passed; zero failed/skipped**, recorded in `focused-detailed.log`. Coverage includes:

- Twelve emissions at identical/nearby coordinates coexist; expiry removes only particles reaching real-time TTL. Reset clears live particles and fractional accumulator; duplication retains source history and starts the duplicate with no particles/accumulator.
- Development schema-10 overlap input decodes, canonicalizes, and re-encodes with every other fixture field preserved; unknown properties and polluted fallbacks are stripped. Canonical defaults and normalized collections contain exactly the five remaining particle fields.
- Generated per-Orb controls contain no overlap owner, and even a stale Bulk DOM control receives no listener or preference mutation. Remaining controls and their existing regression assertions stay intact.
- Timing tables cover 60 Hz, 1/30, a smaller 1/120 request, 120, 1,000,000, `Number.MAX_VALUE`, zero/negative values, NaN, both infinities, missing/null/wrong types, and malformed timing groups. The production callback executes against subsystem seams to prove stalled-frame capping, subsequent normal-frame behavior without catch-up, and real-time context preservation.

Mutation checks (`mutation-check.py`, run from repository root) temporarily replace one implementation site, run the behavioral regression, and restore the original in `finally`. **All five detected**, with assertion failures rather than syntax/import errors:

| Mutation | Observed failure |
| --- | --- |
| Restore proximity deletion | 1 particle retained instead of 12 |
| Remove CONFIG ceiling from timing normalization | 120 seconds accepted instead of 1/30; effective/frame regressions fail too |
| Bypass helper at production animation boundary | 119.9833-second delta instead of 1/30 |
| Restore emission guard's runtime timing dependency | 28,800 emissions instead of guard maximum 10 |
| Restore emission guard's unbounded rate dependency | 33,336 emissions instead of guard maximum 36 |

See `mutations.json` and individual `mutation-*.log`. All mutations were restored before full validation and production build. Captured logs have trailing whitespace removed for repository whitespace checks.

## Sequential validation and environment distinctions

1. `npm ci`: default cache failed with `ENOENT` creating `/home/agent/.npm/_cacache`. The README-documented writable fallback `npm ci --cache ./.npm-cache` succeeded with the unchanged lockfile: two packages installed. Initial sandboxed git fetch could not connect to the session proxy; granting network access let normal authenticated fetch succeed and verify the baseline. These were environment/bootstrap failures, not source defects.
2. `npm test`: **PASS**, all **28 test files**, zero failures/skips (`full-test.log`). This includes existing RC-01–RC-14 protections. This environment's default Node reporter summarizes process-isolated files; the focused run above records individual assertions.
3. `npm run build`: **PASS** (`build.log`), Node v24.19.0, unchanged esbuild dependency. Generated nonempty single-file `dist/auralprint_0.1.15m.h.q.html` contains the matching version marker, inline CSS/JS, and no external stylesheet/script asset references.
4. `git diff --check`: **PASS**. Generated dependencies/build output remain ignored and untracked. No dependency upgrades or production dependencies added. Disposable local npm cache removed after validation.

Optional Chromium **151.0.7922.173** validation passed (`browser.json`, `browser.log`). Reproduction uses `scripts/validate-rc15-phase1.cjs` with an independently installed Playwright via `AP_PLAYWRIGHT_MODULE`; it is not a required project dependency. The browser verified single-file localhost boot with external requests blocked, obsolete schema-10 import and stripped share encoding, 120-second timing sanitation, missing overlap controls/labels, working individual emission and Bulk lifetime edits, and initialized Canvas. No application console/page errors or external asset requests occurred. Sandboxed socket permissions initially prevented Chromium startup; network-enabled execution resolved it. Browser policy blocked direct `file:` navigation, so that mode was not browser-validated.

## Known consequences and next-stage risks

The current synthetic resource probe (`scripts/measure-release-resources.mjs`, `resource-measurements.json`) no longer instruments a deleted method or expects an unsafe stalled burst. Prior audit/benchmark artifacts remain separate and unchanged. At six seconds under full-energy input, default Orbs retain **1,440 particles each**: 2 Orbs retain 2,880; 256 retain 368,640. Each remains subject to the existing TTL, not proximity eviction. A 120-second stall under the bounded delta emits eight default-rate particles rather than 28,800. These are workload observations, not universal FPS guarantees or selected budgets.

Removing scans reduces emission comparison work, but more retained particles increase memory, expiry visits, and rendering work. No compensating rate/TTL/default/appearance change was made. Aggregate population and emission still scale with Orb count, and large presets are still admitted. No architectural conflict or unanswered phase-1 product decision was found. Aggregate allocation/fairness, retention, accumulator backlog semantics, rendering/admission concerns, and integration remain open for the forthcoming prompts; no policies or budgets for them were chosen here.

**Schema remains 10. RC-15 remains OPEN. Build 115 is not declared ready to ship.**
