# AUD116-001 — bounded opaque Orb identity allocation

Repository: `cosmicdance-4-2-0/Auralprint1`. Accepted vulnerable main:
`970b5eb984d146afb4371702c3d2b9c02875f40e` (merged audit PR #90).
Its production source is identical to audited `31dd5b2c7f9562602670dd2ebcc334d76c37f099`.
Corrected implementation: `5e560f64c0edc43ecda5da8537aa3cf7f772b5c7`.
Regression commit: `08617afeb6e030cdd0aefd24341d7a6aff8cc98f`.
Branch: `fix/116-aud001-opaque-orb-ids`; version `v0.1.16-candidate`, writer schema 16.
This record supersedes no historical evidence, including this directory's older
live-input remediation. No merge, RC, Canon, release or deployment authorization.

## Correction and bounds

The old allocator converted the largest explicit `ORB` suffix to BigInt, then
serialized equally wide successors for every repair. The owner-approved contract
makes IDs opaque Scene-local strings; generated IDs need no numerical relationship
to existing IDs. That numeric parser and successor rule are removed entirely.

`orb-collection.js` first reserves every valid explicit ID, then preserves each
first occurrence in input order and repairs other entries using the first free
`orb-<local base-36 counter>` name. The namespace is never parsed. Add and Duplicate
use the same allocator with a fresh local cursor and the current collection.
Only exact collisions affect the chosen name. There is no persistent counter,
randomness, new dependency or separate writable identity source.

For an admitted collection of n Orbs, v distinct valid explicit IDs plus n−v
repairs require at most n candidate probes: each occupied candidate is visited
once. Add/Duplicate with n existing Orbs require at most n+1 probes. Generated IDs
are at most seven characters at CONFIG's 4,096-Orb ceiling. Reading/validating
explicit strings still costs their input length; generated work and representation
do not multiply that length. No input-ID length limit or truncation was added.

Intentional compatibility change: missing/invalid/duplicate repairs and new
Add/Duplicate IDs use the first free short name, rather than a numerical successor.
Removed names may be reused after reconciliation, with fresh runtime ownership.
Valid explicit IDs, including `ORB0`, `ORB1`, unsafe-integer-sized and arbitrarily
long numeric IDs, Unicode, `spectral-ring` and generator-like strings, stay exact.
The validity rule, CONFIG default IDs, composition order, canonical fields and
precision, admission limits and preset writer/version remain unchanged.

## Files and replacement regression protection

Production change: only `src/js/core/orb-collection.js`. Inspected admission,
preferences, runtime, visualizer, editor, inventory and all three preset boundaries
need no allocator integration changes.

Changed tests: `orb-collection`, `orb-id-termination`, `preset-id-reservation`,
`preset-schema-12`, `rc15-phase3`, and `rc22-orb-removal` under `tests/`.
Exact numeric-successor assertions were obsolete under the authorized contract.
Their replacements retain termination, collision/later-owner reservation,
nonmutation, order, capacity-before-read and linear identity-read protections.
Unsafe-Number/overflow cases remain in a killable child, joined by 20,000-digit
IDs, full-count missing/duplicate repairs and long opaque/numeric negative controls.

`scripts/test-support/orb-id-boundary.mjs` runs 15 boundary cases behind a 192 MiB
V8 heap limit and 30-second external deadline; the parent requires completion IPC
and clean exit 0. `scripts/validate-116-orb-ids.cjs` adds 15 native cases with
384 MiB V8 heaps, external 30-second child/browser-group termination, explicit
completion/exit checks and phase/failure reporting. These are heap limits, not
total browser RSS limits. Timing observations below are not CI benchmarks.

## Original versus corrected reproduction

Original historical scripts ran in isolated exact-baseline and implementation
checkouts; committed audit evidence was not overwritten. The attack contains one
`ORB` ID with 20,000 decimal digits and 4,095 missing IDs: 32,330 JSON bytes,
147 compressed hash characters, within existing admission limits.

| Original reproduction | Accepted baseline | Corrected implementation |
| --- | --- | --- |
| Node, 12-second external limit / 384 MiB heap | Exit 124; no completed allocation | Exit 0; 197 ms observed, 4,096 unique IDs, 47,336 total identity characters |
| Native Chromium real URL decoder, 6-second external deadline | `completed:false`; browser closed at deadline | All four original cases completed; attack 202 ms, 47,336 identity characters |
| Additional baseline 4,000-digit control | Completed: 16,400,383 identity characters, 900 ms | Main corrected attack above uses the larger 20,000-digit input |

The baseline cutoff proves noncompletion within the bound, not an infinite loop
or OOM. Ordinary 4,096-Orb, long opaque and two-Orb numeric controls completed on
both builds. The final new native gate independently completed the exact attack
in 180 ms: 4,095 generated IDs total 27,333 characters, maximum length seven;
the original 20,003-character explicit ID survives unchanged.

## Compatibility and verification

Linux; Node 24.19.0, npm 11.9.0, Python 3.12.14, Chromium 151.0.7922.173.
Commands ran sequentially with the documented environment activation and
`AP_CHROMIUM_PATH=/usr/bin/chromium`. Installation used the supplied locked offline
cache (`npm_config_offline=true`, `npm_config_cache=/workspace/auralprint-environment/npm-cache`).

| Check | Result |
| --- | --- |
| `npm ci` | Passed; initial restricted child-process EPERM required a permission-expanded retry |
| `npm test` | 1,465 passed, zero failed, one existing opt-in retention skip |
| `npm run build` | Passed, portable and hosted |
| `python scripts/verify_distribution.py` | Passed, all nine packaged files |
| `npm run test:browser` | Passed, portable/hosted authored startup and atomicity |
| `npm run test:browser:editing` | Passed, source/portable/hosted, 40 sliders, DPR 1 |
| `npm run test:browser:presets` | Passed, native compression/startup/staleness/atomicity/legacy controls |
| `node scripts/validate-116-candidate.cjs` | Passed, source/portable/hosted and Canvas comparisons at DPR 1/2 |
| New Node boundary child / new native gate | 15 completed boundary cases / 15 completed native cases |
| Protected paths and Git integrity | Canon, fixtures, frozen baseline source and original audit unchanged; diff checks and fsck passed |

The schema matrix covers 2–13 and 16, preserving explicit IDs and deterministic
repair. Full canonical normalization is idempotent. Repaired schema-16 collections
survive uncompressed and native-compressed serialization/import without reassignment.
Existing frozen schema-13 fingerprint/DEFLATE tests, published schema-10 fixture
and atomic reserved-14/15 and unrelated invalid-import tests pass. Preferences,
live Camera and runtime failure atomicity protections remain in place.

Runtime checks preserve surviving objects, trails, accumulators and adapters through
reorder/removal; duplication starts independent history. Remove→Add reuse of a
generated name creates a fresh Orb/trail/adapter. Native editor DOM/control identity
and intended edit targeting survive reorder. Actual source/portable/hosted startup
checks snapshot identities before the first application frame is scheduled, then
exercise delegated Add/Duplicate and reload. Maximum-count native coverage isolates
the real URL decoder, matching the original audit seam.

## Qualifications and next review

- Native editor **focus** can be lost when its existing DOM node moves. Reproduced
  on the accepted baseline and correction; DOM/controller/runtime/history ownership
  and edit targeting survive. Existing test doubles do not certify native focus.
  `orb-editor.js` was not changed: this allocator-independent defect is a next-pass
  finding, so the requested native focus invariant is not claimed satisfied.
- Custom native attempt 1 assumed exactly one particle and failed; the probe now
  snapshots actual existing history. Attempt 2 hit a 30-second deadline on the
  two-Orb numeric case before phase instrumentation existed; its phase/cause is
  unresolved. The focused repeat and final complete 15-case run passed. This timeout
  is retained as a qualification, not attributed to decoding or silently passed.
- GitHub CI is not yet observed; the draft PR triggers Linux/Windows CI. Native
  Firefox/WebKit, physical devices, Windows UI, direct-file/offline certification
  and high-count editor/rendering performance were not established by this pass.
  Existing roadmap gates and AUD116-002–006 remain outside this correction.

Re-run the added native gate after the documented build:

```sh
AP_CHROMIUM_PATH=/usr/bin/chromium AP_REPORT=/tmp/aud116-orb-ids.json node scripts/validate-116-orb-ids.cjs
```

Detailed logs, isolated checkouts and generated outputs remain outside the commit
under `/workspace/work/`. Independent review is required before merge or promotion.
