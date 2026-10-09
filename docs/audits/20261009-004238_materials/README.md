# Supporting materials for the 2026-10-09 forensic audit

Canonical report: [20261009-004238_project-audit.md](../../20261009-004238_project-audit.md).

Audited baseline: `f5bbf2a25ffbf8b122e81bd9f54e3639a53a6243`, development version `v0.1.15m.i.c`. Report generated at **2026-10-09 00:42:38 UTC**. These files preserve observations from that audit; they are not fresh measurements of the current default branch.

This directory was added afterward at the user's request to publish a PR containing the audit and associated materials. The original report's statements about a report-only repository change describe the completed initial audit task. This follow-up adds only supporting documentation, diagnostic sources, and evidence. Application code, tests, dependencies, configuration, and existing project documentation are unchanged by the PR.

## Evidence map

| File | What it demonstrates | Report references |
|---|---|---|
| `results/native.json` | Unmodified built-page playback/native recording; delayed-resume pending removal; idle DOM mutations; count-3 picker; focus loss; narrow mobile-layout smoke check | AUD-001, AUD-003, AUD-004, AUD-005; scope/positive observations |
| `results/extra.json` | Injected resume refusal; synthetic native live stereo/recording ownership; fractional native range snapping; UI batch scaling; recorder reset observation | AUD-002, AUD-004, AUD-009; open questions and ownership observations |
| `results/pure.json` | Current-module band-target mismatch, extreme log-floor collapse, and Nyquist-limited top band | AUD-003, AUD-008, AUD-013 |
| `results/watch.json` | Template-only watch omission and version metadata retention on a subsequent JS-triggered rebuild | AUD-011 |
| `results/npm-ci.log` | Offline cache installation completed | Audit method; environment-specific bootstrap |
| `results/npm-test-installed.log` | Node test runner reported 41 discovered test files passing | Validation; not 41 total assertions or browser coverage |
| `results/build.log` | Successful JavaScript/CSS bundling within the normal single-file build | Build validation; the report also records final artifact verification |
| `original-diagnostics/` | Original four diagnostic scripts, copied without edits | Provenance and fixture details |
| `manifest.json` | SHA-256 checksums and byte lengths for the report and these materials, excluding the manifest itself | Integrity/provenance |

AUD-006/AUD-007 are conditional memory risks supported by traced source and calculations in the report; there is no induced OOM result. AUD-010/AUD-012/AUD-014 primarily use source/reference evidence documented in the report. Recorder reset error retention is an open contract question, not an additional established defect.

## Interpretation and limitations

The normal playback/recording smoke scenario used the unmodified built HTML. Other browser scenarios exposed existing module symbols in an in-memory HTML copy before the unchanged `main()` call. Some scenarios deliberately suspended/rejected AudioContext resume, disabled RAF, or directly set synthetic-source state. They demonstrate behavior under controlled conditions and do not measure how often browser failures occur. Native stereo input came from oscillators, not a real microphone or system-audio permission grant.

Mutation timings are synchronous batches on one host; they exclude full paint/render cost and are not FPS guarantees. Recorded Blob sizes and generated filenames depend on timing/browser encoder behavior. The saved blob URL identifies a local ephemeral object and is not a retrievable recording. Capture media itself was not retained in this PR. All JSON and logs are the original outputs; no output was regenerated to conceal a failure or reflect newer code.

The default branch has advanced beyond the audited commit. In particular, later build/packaging and documentation changes may supersede AUD-010/AUD-011/AUD-012. This publication does not re-audit those changes or assert that every historical finding remains open. The original report and its baseline are preserved so developers can assess applicability themselves.

## Reproduction

Use a separate checkout at the audited baseline; do not downgrade a developer's working branch. The self-contained Node recipe in report section 17 reproduces the numerical findings without these scripts' environment paths. Normal validation is `npm ci`, followed sequentially by `npm test` and `npm run build` with the repository's Node/Python requirements. Registry access or an independently complete cache is required for dependency installation.

The scripts in `original-diagnostics/` are **verbatim investigative originals**, not integrated test commands. They retain `/workspace/Auralprint1`, `/workspace/work/audit`, and `/usr/bin/chromium` paths from the audit environment. Copy them into a disposable workspace and replace those paths before replay. Provide Playwright and a Chromium executable independently; neither is introduced as a project dependency. The browser scripts intercept local page requests and use synthetic audio; they do not require real capture permissions. Their Chromium launch used `--no-sandbox` because the audit container could not launch otherwise; use normal browser sandboxing when your environment supports it.

`native.cjs` and `extra.cjs` require the baseline versioned build and its exact bundled bootstrap marker. `pure.mjs` imports baseline modules directly. `watch.cjs` copies source/build inputs to a disposable directory and changes that copy only; its timing-based 1.5-second observation should be replaced with completion signals for a permanent watcher regression test. Do not run the original watcher script against a directory containing valuable work: it assumes ownership of its scratch copy.

The initial audit used Node 24.19.0, Python 3.12.14, esbuild 0.25.12, and Chromium 151.0.7922.173. An offline install with `--ignore-scripts` used a separately provisioned esbuild executable through `ESBUILD_BINARY_PATH`. This is environment provenance, not a new canonical bootstrap instruction.
