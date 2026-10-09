# 115M.I.F / F.1 — AUD-001 + AUD-002 baseline evidence

**Phase F.1 only. Both historical defects independently reproduced at the accepted
current baseline. No correction is implemented and neither finding is closed.**
Build 115N remains WITHHELD; version `v0.1.15m.i.e` and preset schema 10 remain
unchanged. F.2/F.3/F.4 are not performed by this evidence commit.

## Baseline verification before investigation

- GitHub `main`: `0717e6c82ea5e4a9c08a2650e00730f4d698b3b5`, confirmed through
  connected GitHub API `GET /repos/cosmicdance-4-2-0/Auralprint1/branches/main`.
- Local HEAD before investigation: the same SHA; root tree
  `36fef151366f02941498dbcb32e969527b06811f`; clean working tree.
- Root `version`: `v0.1.15m.i.e`; `src/js/core/constants.js` preset schema: 10.
- PR [#45](https://github.com/cosmicdance-4-2-0/Auralprint1/pull/45): merged,
  merge SHA equals the accepted baseline. The prior audit and its 14 published
  report/material files are present and hash-verified.
- Historical report [AUD-001 High and AUD-002 Medium](../../../20261009-004238_project-audit.md)
  and [supporting materials](../../20261009-004238_materials/README.md) were read.
  Their original baseline is `f5bbf2a`, `v0.1.15m.i.c`; their reproductions were
  not treated as evidence of current execution.
- Work branch: `codex/115m-i-f-aud001-aud002`, starting at the accepted commit.

The provisioned local checkout initially contained clean but stale `26e012c`.
Shell `git ls-remote` could not connect to its inherited proxy at port 8080.
Before source investigation or execution, the missing Git blobs, recursive trees
and original commits were obtained through the connected API, imported with Git,
and matched to their original object hashes, including the original signed merge
commit. This did not synthesize a new baseline commit or rely on a version label.
All existing tracked blobs were already available; the missing blobs were the
14 historical audit additions. API tree reconstruction matched the accepted
root tree exactly. The requested working branch was then created at that commit.
This provenance and protected-file verification are recorded in
[baseline-results.json](baseline-results.json).

## Independently observed current behavior

| Finding / boundary | Observed at accepted baseline | Intended outcome |
| --- | --- | --- |
| AUD-001 High: A/B picker batch, initial context resume deferred, remove A through actual Queue button | Before: selected A, source requesting, unloaded, no media/URL. After remove: selected B, A still requesting, UI ID unchanged. After release: native A loaded/playing, A source active, Queue still B; complete notification for A, no exceptions. | A loses authority on removal; B loads with A's requested autoplay and coherent entry/source/media/audio/recorder identity. |
| AUD-001: pending paused request | Removed A commits paused while B selected. This uses real `loadAndPlay({autoPlay:false})` via an in-memory hook; normal ingestion/row selection always requests autoplay. | B loads paused with inherited requested intent. |
| AUD-001: native play completion deferred before final File commit | Native A is already playing but `isLoaded=false` and source requesting. Removal still misses pending ownership; A commits. | Removed candidate releases; B alone completes with requested autoplay. |
| AUD-001 intent: start autoplay B after loaded A, hold resume, remove B with C surviving | Old A loaded metadata remains but media is null and actual playing false. Removal correctly cancels B via new C request, yet C receives `autoPlay:false` and loads paused. | C inherits B's requested true intent independently of old audio flags. |
| AUD-002 Medium: context constructor throws | Engine and manager reject; source remains requesting, errors empty, no media/URL allocated; unhandled File-input promise. | Recoverable observable terminal error and contained event boundary. |
| AUD-002: first load resume rejects | Same missing settlement; cached suspended context remains. | Terminal failure, no false loaded/playing or obsolete writes; retry possible. |
| AUD-002: loaded paused File; Play resume rejects | File/session/media retained, actually paused, empty transport error; unhandled Play promise. | Retain recoverable File and report meaningful playback failure without rejection leakage. |
| AUD-002: obsolete first resume / Play resume rejects after replacement or Clear | Winner/idle projection survives, but obsolete rejection reaches browser event boundary. | Fully silent stale settlement. |
| Shared ownership seam: second File resume inside graph attach | Stale success destroys B media ownership and installs then releases A; B labels remain. Stale rejection releases A but clears B audio flags/name and installs old error while native B still plays. | Fence graph transfer and error writes by current ownership; cleanup only loser resources. |

Controls passed for unmodified-artifact valid-WAV playback with advancing scrubber,
loaded playing/paused successor removal, noncurrent B removal, pending final removal,
Clear, A→B→C with fulfilled old resume, removing A after B already began, synthetic
Mic/Stream replacement at initial resume, and retries after constructor/resume/Play
failures. The existing catch **does** settle a current second-attachment resume
failure into source error/`file-activation-failed` with a failed recorder
notification and no unhandled rejection. Early startup failure and late attach
failure are different paths.

## Evidence and execution

- [ownership-trace.md](ownership-trace.md): current implementations, all ownership
  concepts, awaits, destructive transfer, state/error writes, callbacks and cleanup.
- [regression-contracts.md](regression-contracts.md): full matrix, exact required
  invariants, native versus internal reachability, and RC-02/03/04/05/06/19 risks.
- [baseline-results.json](baseline-results.json): environment, provenance, validation,
  generated fixture hashes, 28 native scenario snapshots, recorder calls, element/
  File/entry/request identities, URL operations, rejection records and assertions.
- [diagnostics/native.cjs](diagnostics/native.cjs): reproducible opt-in runner.
- `evidence/`: baseline validation logs, diagnostic baseline log, separate desired
  correctness run's log and assertion results. These are actual outputs; transient
  preliminary runner debugging outputs are not presented as completed evidence.
  Log trailing whitespace/extra terminal blank lines are normalized; original
  hashes are recorded in JSON. The post-evidence default-discovery log is a result
  excerpt; the sequential baseline test log contains the complete test output.

Environment: Node 24.19.0, Python 3.12.14, esbuild 0.25.12, Playwright 1.62.1,
Chromium 151.0.7922.173, Linux, headless, native Web Audio/HTMLMediaElement.
Playwright/Chromium are preinstalled environment tools and are not added to the
application dependencies. Browser output is muted by automation; advancing
native playback is verified, physical audibility is not.

Final baseline validation, sequentially from repository root:

```sh
source /workspace/auralprint-environment/activate.sh
npm ci --offline --cache /workspace/auralprint-environment/npm-cache
npm test
npm run build
python scripts/verify_distribution.py
```

Installation passed using the existing cache and unchanged lockfile. Default
`npm test` passed: 604 tests, 603 passed, 1 skipped, 0 failed. Build and distribution
verification passed. Portable artifact: 401,173 bytes, SHA-256
`2075fd4d443fccf2bd2def64492e62342e69129407ebf46e3b033c3abcb18808`.
The verifier also validated the hosted package; hashes are retained in evidence.

Initial sandbox runs reported `spawnSync EPERM` from esbuild's successful native
version subprocess and RC-20's Python subprocess (whose 23 packaging assertions
had themselves passed). An `--ignore-scripts` cached install allowed preliminary
validation, and build/verification succeeded. Then installation, default tests
and build were rerun with authorized child-process support; the successful final
sequence above supersedes those environment-limited attempts. No test expectation,
lockfile, dependency or CI change was made. Initial restriction logs are retained
and explicitly distinguished from final passing validation.

Opt-in diagnostics, from repository root, after building:

```sh
mkdir -p /workspace/work
node docs/audits/remediations/115m-i-f-aud001-aud002/diagnostics/native.cjs \
  --output /workspace/work/native-baseline.json
node docs/audits/remediations/115m-i-f-aud001-aud002/diagnostics/native.cjs \
  --contracts --output /workspace/work/native-contracts.json
```

Set `CHROMIUM_PATH` if necessary; provide Playwright through the environment's
Node module search path. No external audio downloads/server are required: all
HTTP page traffic is locally intercepted and other requests are aborted. The
runner reads, but never writes, the current portable build. Each invocation
creates isolated pages and generates distinct valid stereo PCM WAVs (30 s,
44,100 Hz, 16 bit; A/B/C base frequencies 440/554/659 Hz).

Baseline mode exits **0** only if the runner completes and the explicitly named
historical reproduction/positive-control assertions pass. It still prints and
records desired-contract failures. Final result: 28 scenarios, 9 baseline
assertions passed, 14 desired correctness assertions failed, no infrastructure
failure. This is successful reproduction, **not** successful correctness.

`--contracts` omits historical-defect assertions and exits **1** if any desired
invariant fails. Its independent run also executed 28 scenarios and captured 14
actual failures. Do not treat this intentional red diagnostic as a failure of the
unchanged default suite, and do not conceal it with ordinary passing defect
expectations. Runner errors/timeouts are infrastructure failures and exit 1 in
either mode. Full snapshots include stacks, actual/expected assertion values and
UI error events; Blob URLs are local ephemeral references, not downloadable assets.

## Every injected difference

1. The ordinary success page uses the original built HTML unchanged, served by
   local interception. Fault pages expose existing module objects before the
   unchanged `main()` call in an **in-memory** HTML copy.
2. The copy exposes the existing UI load helper/request ID/Queue refresh helper,
   and a getter for private Queue entry objects. Exact unique bundle markers are
   asserted. The paused scenario invokes that existing helper directly; all
   remaining File loads and all removal actions use the normal DOM handlers.
3. A native AudioContext subclass can throw before construction, defer/reject
   resume, or let the first resume fulfill without starting the context (`skip`)
   to control `attachSource()`'s real second await. Native resume releases holds.
   Constructor fault is `NotSupportedError`; resume fault is `InvalidStateError`.
4. Native media play ordinarily runs unchanged. One scenario holds its completion
   promise after native playback begins, before File activation commitment.
5. Forwarding wrappers observe engine loads, manager activations, Play calls and
   recorder transport notifications. They return the original promises/results;
   observer handlers record fulfillment/rejection without containing the UI's
   rejected continuation. URL create/revoke wrappers forward native operations.
6. Same-File duplication replays the actual input change event on the same FileList.
   WeakMap observation distinguishes entry/File/media references, not transport
   authority. Duplicate filenames use distinct valid generated File bytes.
7. Mic/Stream mediaDevices are replaced with permission-free stubs returning native
   oscillator/destination streams. Real source-switch/manager/attachment paths
   run. No real devices, external streams or permission prompts are used.
8. Headless Chromium runs `--no-sandbox`, `--disable-background-networking` and
   `--autoplay-policy=no-user-gesture-required`. Event scheduling uses held promises,
   conditions and a zero-delay task barrier, not duration sleeps. RAF remains live.

## Root causes and next-phase seams

AUD-001: selected pending entry is mistaken for nonactive removal because removal
tests loaded state. It therefore misses the existing UI cancellation authority.
Requested autoplay exists down the pending options chain but removal reads actual
playing state and cannot query requested intent. Queue entry objects already exist
privately; names, indices and even File references are not interchangeable with
entry identity. F.2 should make that narrow UI/Queue transition identify and revoke
the removed authorized entry/request, pass its intent to the existing successor
helper, and fence File graph attachment with the existing guard. No new counter,
persisted preference, schema field or Queue rewrite is proposed.

AUD-002: constructor/first resume and Play resume are outside error settlement.
Manager and UI do not converge those rejections to a terminal outcome. The second
resume's existing attach catch settles current failure but ignores staleness before
global audio writes. F.3 should extend the same ownership-aware failure boundary
to startup/media setup and Play, preserve still-owned loaded media on recoverable
Play failure, and contain rejection at the specific UI event boundaries. A broad
error refactor is not authorized.

Preserve synchronous batch/Clear cancellation, live token and track release,
element-based Play fencing, once-only deferred recording EOF, retained exports,
and recorder terminal disposal/shared-resource ownership. The inspected tests
and precise missing assertions are linked in the regression contract document.

## Limits and unresolved questions

The second-resume race is controlled by fault injection; natural browser frequency
is unknown. Same-object reuse and paused initial loading require the stated event/
internal hooks. The evidence establishes state snapshots, native media ownership
and forwarded recorder calls; it does not establish every transient write or
active recording behavior at these faults. Native decoder events on a candidate
pending attachment, pre-engine supersession at the manager teardown await, all
alternative UI failure callers, closed-context retry, real capture permissions,
headful/device audibility and other browsers were not executed. F.2/F.3 should
add deterministic write/resource assertions; F.4 owns integrated/native expansion.

Only this new remediation directory is changed. Application, existing tests,
scripts, metadata, presets, prior evidence and Canon remain byte-identical to the
accepted baseline. Generated builds are ignored/untracked. No release, tag,
finding closure, merge, or automatic advancement to F.2 is part of this phase.
