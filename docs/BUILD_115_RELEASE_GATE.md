# Build 115 Release Gate

This document records the current release-gate evidence for Build 115
(`v0.1.15.RC-1`). It is the source of truth for whether Build 115 is ready to
promote beyond RC status.

## Baseline Scope

- Canon baseline available: `docs/Canon/changelog.md` plus canon artifacts for
  `0.1.12`, `0.1.13`, and `0.1.14`
- Canon baseline limit: `docs/Canon/` stops at `0.1.14`; there is no canon
  artifact for Build 115 itself
- Build 115 fallback baseline: current Build 115 docs, current tests, and
  current runtime behavior

## Automated Evidence

Audit date: `2026-04-25`

- `npm test`: passed on the current working tree (`146/146`)
- `npm run build`: succeeded on the current working tree

Automated coverage used for the release gate includes:

- scene/compositor ownership and ordering
- Schema 9 migration and save/load round trips
- runtime-only exclusions for source, queue, recording, panel shell, selected
  scene node, and `ViewTransform`
- file, mic, and stream workflow switching
- recording/export lifecycle guards
- launcher/panel reachability and Status / Log behavior
- orb and overlay non-regression through the compositor path

## Manual Browser And Hostile Audit

The following checks are required by Phase 22:

- file playback, queue navigation, repeat, and scrubber seeking
- microphone activation and recovery
- stream activation and recovery
- recording start, stop, finalize, and export/download
- preset import, export, share, and round-trip recovery
- launcher and panel reachability across hide/show states
- Scene ordering, enable/disable, inspector truth, and selected-node plumbing
- overlay/orb coexistence and per-orb feature behavior
- `ViewTransform` remaining a runtime-only identity/no-op seam

Status in this implementation environment:

- No browser-side manual audit was executed from this headless session.
- No direct browser verdict is claimed here.
- These checks remain pending for an unqualified release promotion.

## Current Verdict

`go with caveats`

Why:

- The current working tree passes automated release gates.
- Build 115 runtime ownership, persistence boundaries, and Schema 9 migration
  behavior are covered by targeted tests and source inspection.
- A true manual browser pass has not been executed or recorded from this
  environment, so Build 115 should remain at `RC-1` until that evidence exists.

## Remaining Release-Gate Actions

1. Run the manual hostile browser checklist against `v0.1.15.RC-1`.
2. Append exact outcomes to this document.
3. Promote Build 115 only if those checks pass without release-blocking issues.
