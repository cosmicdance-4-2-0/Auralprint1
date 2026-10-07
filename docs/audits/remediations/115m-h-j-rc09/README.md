# 115M.H.J — RC-09 reserve explicit Orb identities before fallback assignment

RC-09 CLOSED by local acceptance evidence. Version `v0.1.15m.h.j`.

Root cause: codec called normalizeOrbDef on each incoming item before collection normalization, assigning positional fallback IDs too early. Current-branch reproduction shows Right/ORB0 and Center/ORB1 while direct collection normalization reserves the explicit Center/ORB0.

Contract: explicit valid incoming identities retain their configuration; collection repair reserves all incoming IDs before fallback allocation. Duplicate identities retain the first owner and repair later duplicates, using the existing terminating exact-suffix allocator. Arbitrary valid opaque identities remain accepted.

Production change: `src/js/presets/preset-codec.js` returns the migration-mapped input rather than prematurely normalizing Orb shape. `normalizeOrbCollection()` continues to own identity repair and calls normalizeOrbDef afterward. No collection allocator or interfaces changed. Version metadata/assertion advanced to M.H.J. Risks: legacy mapping/default ownership and duplicate repair, covered by focused schema/collection/RC-01 tests.

Regression: `tests/preset-id-reservation.test.js` verifies URL import and share/encode identity, missing items before explicit IDs, duplicate and invalid repair, opaque Unicode/reserved/nonnumeric IDs, huge suffixes, source configuration preservation, input immutability, roundtrip, and subsequent Add/Duplicate across schemas 2–10. All 64 existing schema-contract tests and protected timeout-based RC-01 regressions pass unchanged. This pure sanitation defect does not require native browser behavior.

Mutation: restoring the early normalizeOrbDef call fails both new regressions. Correct source restored before final focused/full/build validation.


Acceptance: intended-behavior regressions and focused tests PASS; full `npm test` PASS including protected RC-01–RC-06; production build PASS; `git diff --check` PASS; schema exactly 10. Generated untracked artifact `dist/auralprint_0.1.15m.h.j.html` has matching version metadata. Adjacent logs record reproduction, regression, mutation and final checks.

Historical audit/evidence are unchanged. RC-01–RC-06 were CLOSED before this mission. RC-07–RC-09 are locally CLOSED. Remaining mission findings are OPEN. RC-16–RC-22 are untouched. Preset schema remains 10. 115N remains WITHHELD. Build 115 is NOT canonical / NOT shipped. Hosted Linux/Windows CI is reserved for the final PR if all blockers close.
