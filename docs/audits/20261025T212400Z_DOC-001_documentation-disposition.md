# DOC-001 — documentation and source-comment disposition

**Audit only. No cleanup, comment edits, skills, application changes, or release changes are applied by this report.**

- Repository: `cosmicdance-4-2-0/Auralprint1`; target: `main`.
- Audited upstream commit: [`f8bac944b3996b012ede11b88e48a7e4e335c81b`](https://github.com/cosmicdance-4-2-0/Auralprint1/commit/f8bac944b3996b012ede11b88e48a7e4e335c81b).
- UTC report timestamp: `2026-10-25T21:24:00Z`; filename uses that same timestamp.
- Audit branch: `audit/doc-001-documentation-disposition`.
- References below are repository-relative paths and **baseline** line ranges. Proposed destinations and PRs are recommendations, not authorization to implement them.

## A. Executive assessment and accepted baseline

The repository retains valuable engineering evidence and mostly sound local explanations. Its main documentation problem is competing current authorities: public-release descriptions, earlier camera-stage instructions, merged development, and historical acceptance wording coexist without consistent audience boundaries. No Critical correctness finding is established. The highest-risk misleading guidance concerns authored versus live camera ownership, obsolete merge instructions, incomplete developer verification guidance, and overly broad resource-ownership comments.

Confirmed issues are listed in C. Historical status, test counts and checkpoint decisions are not errors merely because later work superseded them. In particular, the Build 116 worklog explicitly supersedes earlier runtime-only-camera descriptions at `docs/development/build-116.md:228–229`. Its old scoped stop instructions, and the original 116D handoff, should remain historical.

Recommended sequence: repair living status/navigation and developer commands; consolidate human-document ownership; restructure agent instructions with demonstrated discovery; then make a separately reviewed comment-only pass. Keep release verification and the pending second code audit separate from DOC-001.

### Baseline verification

The initially clean checkout was on `work` at `ea46ae8dbb2422a4c2f3d8b3fe96103d2f2f6bb5`. A fresh `git fetch origin main` and an independent GitHub branch read both identified `f8bac944b3996b012ede11b88e48a7e4e335c81b`. Ancestry was `0` local-only / `1` upstream-only commit. The dedicated audit branch was created directly from fetched `origin/main`; no unrelated work was overwritten and investigation used that single revision.

The intervening commit is the owner's exact-content `agents.md → AGENTS.md` rename. The baseline tree contains uppercase `AGENTS.md` and no lowercase file. **Do not rename it again.**

| Boundary | Fresh evidence and disposition |
| --- | --- |
| Public release | GitHub [release `v115`](https://github.com/cosmicdance-4-2-0/Auralprint1/releases/tag/v115), published 2026-10-20, is non-draft/non-prerelease. Canonization history includes `e4cd3cd`, `7c5f5cd` and merged PR #66. `README.md:5` and `ROADMAP.md:79–86` agree: Release 4 / Build 115 / `v0.1.15`, schema 10. Keep. |
| Active source | `version:1` is `v0.1.16d`; `src/js/core/constants.js:13` sets writer schema 12. First-parent history includes merged PRs #67–#79, including the first 116 audit (#74) and its five finding dispositions (#75–#79). Implementation merge does not establish release acceptance. |
| Release/RC authority | `ROADMAP.md:108` still withholds release approval; changelog labels 116 unreleased. The owner's DOC-001 brief additionally says RC #1 is unauthorized and a second independent code audit is pending. Those are current owner-supplied gates; repository history and release listings cannot prove the absence of private authorization or an unpublished audit. DOC-001 does not satisfy that code-audit gate. |
| Protected artifact | `docs/Canon/0.1.15/auralprint_0.1.15.html` hashes to `13144f403f92088228630f40cc10d9770d34fc182e5ff9d061b81541e33f8741`, matching `SHA256SUMS`. Preserve bytes and checksum. |

## B. Coverage inventory and limits

The baseline contains **803 tracked files**, including **99 Markdown files**. Counts below overlap by family and must not be added together.

| Family | Inventory / investigation depth |
| --- | --- |
| Root living documents | README, ROADMAP and AGENTS: all three read completely; source/history checked for substantive claims. AGENTS is 577 lines / 29,072 bytes. |
| `docs/development/` | All five Markdown files read completely: Build 115 history, release comparison, I.E documentation review, Build 116 worklog/contract and 116D handoff. Historical versus current sections distinguished. |
| `docs/Canon/` | Eight files: six HTML artifacts, changelog and checksum. Changelog read completely; Build 115 checksum verified and selected shipped implementation compared. Older bundles inventoried, not comprehensively re-audited. |
| `docs/audits/` and root October 9 audit | 562 audit-tree files, including 89 Markdown files. Every audit Markdown file received opening/provenance/status examination and term scanning (8,858 lines across those 89 files). The major October 6, October 9 and October 24 reports received selected finding/method/conclusion reads, not complete semantic re-audits. Two supporting-evidence READMEs read fully. |
| Links / navigation | All 99 Markdown files checked: 388 ordinary relative references; seven absent file targets identified. No additional suspected fragment failures in that scan. Plain backtick inventories and historical test names required separate checks. This is not an external-URL availability guarantee or a complete Markdown-parser proof. |
| Application | All 70 text source files inventoried/comment-searched: 59 JS, ten CSS and one HTML template. Relevant comments examined in context, with deeper owner/call-path traces in core, presets, camera/UI, render, audio, waveform and recording. Eight branding assets inventoried. Not every executable line or CSS declaration was semantically verified. |
| Tools / tests | All 56 scripts, the CI workflow and 85 test/helper/fixture files inventoried/searched. Headers and suspect contract comments examined; deeper reads covered build/watch/distribution, mandatory browser smokes and relevant regressions. Fixture payloads retain historical roles. |
| Raw historical evidence | Remaining JSON, diagnostic programs, images, compressed assets, media and logs inventoried rather than individually validated. October 9's 13-entry manifest was checked: ten present entries match; three intentionally removed logs match their historical parent commit (DOC-001-013). |

Search leads included TODO/FIXME, temporary/provisional/future, not implemented, runtime-only, legacy, schema, camera/world/viewport, canonical/migration/release/RC, Build 115/116 and old version identifiers. Matches were leads, not findings.

This pass ran five focused suites with **131 tests passing, zero failures/skips**: scene camera, held camera keys, schema 12, angular-speed contract and frequency domain. An initial restricted subprocess launch failed with `EPERM`; the permitted rerun passed. These corroborate traced contracts, not universal correctness. No full suite, build, native-browser, device/permission, artistic or release-acceptance rerun was needed for the report-only diff. Existing recorded browser evidence is cited as historical evidence, not newly reproduced.

## C. Actionable findings

Priority terms: **Significant misleading instruction**, **Maintenance**, **Cosmetic**. No Critical correctness item is confirmed. Each finding groups occurrences with the same underlying disposition.

### DOC-001-001 — README mixes release, checkout and camera-stage status

- **Priority / location:** Significant misleading instruction; `README.md:28,37,69,79,93–95`.
- **Current claim:** Portable bootstrap example names 0.1.15; 116–120 are all Planned; Build 113's heading says canonical; the 116 description stops at `v0.1.16c.a.a` and says speeds and camera stay runtime-only.
- **Evidence:** `version:1`; `scripts/build.mjs:21–47` derives output from that version; `src/js/ui/scene-camera-actions.js:7–15` explicitly saves/restores the authored view; `src/js/ui/camera-controls.js:170–180` distinguishes Reset/Fit/Save/Restore; `src/js/presets/preset-codec.js:79–81` initializes legacy/default and authored camera configuration.
- **Problem:** A checkout user cannot reliably identify its artifact or share its authored view. Live `state.camera` remains ephemeral; the blanket wording omits distinct persisted `sceneCamera`.
- **Disposition / destination:** **Correct / Consolidate** in README: separate current public Build 115 from merged unreleased 116D, show version-derived output, and explain explicit Save, Share and Restore with C/F distinctions. Link ROADMAP for acceptance and the existing Build 116 contract for technical detail.
- **Risk:** Do not promote 116, imply automatic camera capture, erase release history or strand milestone anchors.

### DOC-001-002 — Developer verification guidance predates mandatory browser gates

- **Priority / location:** Significant misleading instruction; `README.md:15–33` and the twelve reusable script headers enumerated in F.
- **Current claim:** Browser tooling is optional; several script headers say there is no project/npm Playwright dependency or CI browser dependency.
- **Evidence:** `package.json:8–14` declares both browser commands and pinned Playwright 1.64.1; `.github/workflows/ci.yml:17–18,31–47` runs unit/build/distribution checks on Ubuntu/Windows and installs Chromium/runs two mandatory smoke steps on Ubuntu. `docs/development/build-116.md:187–202` already records the setup and scope.
- **Problem:** General bootstrap guidance omits current checks and conflicts with operational script introductions.
- **Disposition / destination:** **Correct / Consolidate** tooling setup in README, linking package/CI owners. Document `npx playwright install --with-deps chromium --only-shell`, `npm run test:browser` and `npm run test:browser:editing` after building. Correct reusable headers; the broader investigation scripts remain optional and baseline-specific.
- **Risk:** Do not imply Windows browser, Firefox/WebKit/macOS, device or release certification. Do not rewrite historical reports' truthful dependency provenance.

### DOC-001-003 — ROADMAP retains a superseded operational merge stop

- **Priority / location:** Significant misleading instruction; `ROADMAP.md:108–112`.
- **Current claim:** Stop at the 116D review PR; no merge is authorized.
- **Evidence:** Accepted ancestry includes `7421c2d` (merged #73), `0bbe517` (#74), and #75–#79 through `ea46ae8`.
- **Problem:** A living plan directs agents to a completed pre-merge checkpoint. Release approval remains separately pending and must not be inferred from those merges.
- **Disposition / destination:** **Correct** ROADMAP's current status to merged 116D and corrective work, with outstanding acceptance/owner gates explicitly distinguished. Preserve useful original stop wording in the existing Build 116 chronology if it is not already represented.
- **Risk:** No RC, tag, deployment or publication authorization follows. Do not change the historical 116D handoff or older scoped review instructions merely to match today's merge state.

### DOC-001-004 — Current navigation points to renamed instruction/test files

- **Priority / location:** Maintenance; `README.md:8`; `ROADMAP.md:3,7,63`; `docs/development/build-115.md:13,40,80`; related source pointer `src/js/core/preferences.js:124`. The plain historical test name at `docs/development/build-116.md:334` also lacks a current successor pointer.
- **Current claim:** Links target lowercase `agents.md` and absent `tests/preset-schema-10.test.js`; historical validation names `preset-schema-11.test.js`.
- **Evidence:** Baseline has uppercase AGENTS only; `c1a3ff0` renamed the schema test to 11, then `269d710` to current `tests/preset-schema-12.test.js`.
- **Problem:** Seven actual relative file links fail; historical file names are useful provenance but cannot serve as current navigation unaided.
- **Disposition / destination:** **Correct** living AGENTS links and visible title; preserve `#21-schema-discipline` or provide an explicit replacement during restructuring. In worklog navigation, pin historical tests to the relevant historical commit and identify the current successor without changing what originally ran.
- **Risk:** No repeated rename or blanket historical text replacement. Moving sections requires inbound-anchor review.

### DOC-001-005 — Release notes promise a nonexistent selected-Orb Bulk mode

- **Priority / location:** Significant misleading instruction; `docs/Canon/changelog.md:186`.
- **Current claim:** Bulk Edit supports multiple selected Orbs.
- **Evidence:** `src/js/ui/orb-editor.js:12–17,201` applies over all supplied `preferences.orbs`. Shipped Build 115 HTML has the same apply-all behavior at `docs/Canon/0.1.15/auralprint_0.1.15.html:8433–8441,8748–8750`.
- **Problem:** The statement implies a selection subset and can mislead users about which Orb values an edit affects.
- **Disposition / destination:** **Correct** the living changelog to apply-to-all, mixed-aware Bulk Edit. Keep the capability.
- **Risk:** Never change the immutable shipped artifact to match the prose.

### DOC-001-006 — Human documents repeat chronology and technical authorities

- **Priority / location:** Maintenance; `README.md:51–115`; `ROADMAP.md:5,10–15,37–75`; `README.md:11` versus `AGENTS.md:494–499`; changelog's repeated Why/Impact analysis, e.g. `docs/Canon/changelog.md:15–17,53–55,113–115`.
- **Current claim:** README carries release history, build inventory and per-milestone plan summaries; ROADMAP repeats completed stages, corrective PR chronology and interface detail. README describes changelog ownership as including internal milestones, while agent policy specifies shipped-public-release deltas.
- **Evidence:** Existing Build 115 worklog already records stages and dispositions (`docs/development/build-115.md:15–115`); Build 116 has stage/corrective chronology and current contract anchors. Drift is demonstrated by DOC-001-001/003.
- **Problem:** Mostly correct information is copied into documents with different audiences; editing one copy leaves other apparent authorities behind. Several historical Why paragraphs infer intent from comments rather than record an independently established decision.
- **Disposition / destination:** **Consolidate** per D. Move unique completed Build 115 stage/PR chronology into existing Build 115 history, and unique 116 chronology into existing Build 116 history. Link instead of copying. Treat older changelog comparisons as historical material; use public-baseline deltas for future entries. **Owner decision** before wholesale restructuring of older internal-build comparisons.
- **Risk:** Preserve release comparison baselines, unique decisions and inbound anchors. Do not delete older entries merely because current changelog policy differs; do not invent a new history document.

### DOC-001-007 — Always-on instructions carry history and duplicate completion rules

- **Priority / location:** Maintenance; `AGENTS.md:108–150,258–353,400–442,464–577`.
- **Current claim:** Detailed historical schema exceptions, field inventories, particle algorithms, UI rules, protocol checks, global DoD, anti-patterns and motivational reminders are presented as universal policy.
- **Evidence:** 29,072-byte root; repeated checks at `488–492,523–546`; local behavior is owned by normalizers, codec, AnalysisFrame, visualizer/resource owners and CONFIG. Discovery conventions and section migration are established in E.
- **Problem:** Unrelated tasks receive substantial history; repeated rules can diverge. The historical introduction correctly qualifies Build 115's pre-release exceptions, but `147` still refers to them as checklist exceptions rather than closed historical authorizations. Absolute no-magic-number wording at `54–56,539–540` also needs to distinguish configurable policy from scientific definitions in `src/js/audio/band-bank.js:34–45`.
- **Disposition / destination:** **Consolidate / Move to skill / Remove** by E's explicit map. Keep one engineering DoD in AGENTS; ROADMAP owns milestone acceptance. Retain mandatory protections always-on; move chronology to existing worklogs and procedures to justified skills. Remove repetitions/editorial prose only after accounting for unique constraints.
- **Risk:** Do not weaken requirements under the label of shortening. Owner review is required for an actual change to schema policy, DoD obligations or accepted performance requirements; ordinary deduplication need not invent new policy.

### DOC-001-008 — Source comments overstate interface/resource ownership

- **Priority / location:** Significant misleading instruction; `src/js/audio/audio-engine.js:615–616` and `src/js/render/renderer.js:176–177`.
- **Current claim:** No listeners may be attached through `getMediaEl()`; RecorderEngine owns any MediaStream lifecycle.
- **Evidence:** `src/js/audio/scrubber.js:62–65` passes that media element to waveform admission, which adds scoped metadata/duration/error listeners and removes them on reset (`src/js/audio/waveform-admission.js:91–115`). RecorderEngine owns render capture, delegates audio cleanup (`src/js/recording/recorder-engine.js:571–602,684–697`), and `AudioEngine.getRecorderTap().releaseStream()` deliberately preserves upstream streams (`src/js/audio/audio-engine.js:599–612`).
- **Problem:** Literal compliance could remove needed waveform listeners or encourage stopping shared source tracks. This is comment drift, not a demonstrated runtime ownership bug.
- **Disposition / destination:** **Correct** local comments: scoped waveform metadata ownership is allowed; single transport EOF dispatch remains protected; Among capture tracks, RecorderEngine owns render capture tracks; it owns recorder/session/export lifecycle and delegates audio-tap release to AudioEngine. InputSourceManager retains upstream source-track ownership.
- **Risk:** Preserve cancellation fencing, single-ended-hook behavior, shared-track ownership and prior-export protection.

### DOC-001-009 — Schema-12 test comment reintroduces viewport-owned geometry

- **Priority / location:** Significant misleading instruction; `tests/preset-schema-12.test.js:85–86`.
- **Current claim:** Schema-12 centers use min(canvas dimensions).
- **Evidence:** `src/js/core/world-geometry.js:11–19,34–39` uses the smaller independent world dimension; `src/js/core/preferences.js:50–56` resolves world settings; `src/js/render/orb.js:64–88` uses that geometry.
- **Problem:** The comment describes obsolete production geometry and invites coupling simulation to viewport size.
- **Disposition / destination:** **Correct** to the independent world-reference span; retain the reason legacy Scene-node-relative centers have no authorized direct equivalent.
- **Risk:** Preserve migration assertions and fixtures. No normalization or coordinate behavior change.

### DOC-001-010 — Schema comments need current format and admission precision

- **Priority / location:** Maintenance; `src/js/core/preferences.js:124`; `src/js/presets/preset-codec.js:14–16`.
- **Current claim:** Canonical Orb fields are labelled v11; older schemas retain their input contracts without an admission qualification.
- **Evidence:** Writer is schema 12 (`src/js/core/constants.js:13`); schema-independent frequency checks run at `src/js/presets/preset-codec.js:25,76`. `src/js/core/band-frequency.js:8–15` enforces CONFIG's maximum; `docs/development/build-116.md:15–16` explicitly records rejection of formerly admitted excessive frequencies.
- **Problem:** Orb field shape remains compatible, but the version label is stale; unqualified input preservation can be mistaken for preservation of every formerly accepted frequency.
- **Disposition / destination:** **Correct** local wording: version-neutral normalizer ownership; preserved formats/migrations subject to accepted frequency-domain admission. Retain schema-10 immutability and old migration exceptions.
- **Risk:** This does not identify a new architecture contradiction or authorize a schema/migration change.

### DOC-001-011 — Current source retains development-stage/future narration

- **Priority / location:** Maintenance; source owners and bounded occurrences listed in F.
- **Current claim:** Metadata probe has no production call site in I.2B; recorder APIs/UI and active positioning/pulse behavior are future; Queue will be replaced by a Playlist module; old implementation phase/storage references remain.
- **Evidence:** Probe is the default production adapter (`src/js/audio/waveform-admission.js:4,10–11,30–35`); recorder UI reads current state (`src/js/ui/ui.js:682–743`); configured recorder placement/pulse is consumed at `src/js/ui/ui.js:239–266,295–299,318–322` and `src/css/record-panel.css:108–120`. ROADMAP’s Build 117 plans Queue UX, not a replacement Playlist architecture.
- **Problem:** Historically accurate narration is embedded beside current APIs as operational guidance; some speculative replacement language lacks an accepted plan.
- **Disposition / destination:** **Correct / Relocate / Remove** only obsolete tense or redundant chronology; existing Build 115/116 worklogs retain unique engineering history. **Review** the Playlist promise and unused launcher-position hooks before changing wording that might imply a new contract.
- **Risk:** Do not remove bounded-read, overflow, ownership, state-projection or lifecycle rationale with the narration. No removal of executable hooks or future feature authorization.

### DOC-001-012 — Layout comments name retired panels and duplicate stack descriptions

- **Priority / location:** Cosmetic / Maintenance; `src/css/panels.css:99–100,135,161–170`; `src/css/workspace.css:1–3,30`; `src/index.template.html:19,30,478`.
- **Current claim:** Bands/Orbs panel names, incomplete panel stack, scrubber-only row and indefinite later-phase instructions.
- **Evidence:** Actual selectors include Camera/Analysis, workspace front class is z-index 35; template includes time/Generate/Waveforms controls; `src/js/ui/ui.js:43–45,325–328` hides the load hint for active File/Mic/Stream sessions.
- **Problem:** The prose no longer locates the current layout owners, and duplicated z-index documentation can drift.
- **Disposition / destination:** **Correct / Consolidate / Remove** bounded comments; keep one local stack explanation beside workspace ownership and refer to selectors rather than duplicate a numeric inventory.
- **Risk:** Comment-only changes must leave all selectors, markup, accessibility and styling bytes outside comment spans unchanged.

### DOC-001-013 — Historical evidence inventories need an archival-access disposition

- **Priority / location:** Maintenance; `docs/audits/20261009-004238_materials/manifest.json:37–39,52–59`; `docs/audits/20261009-004238_materials/README.md:17–19`; `docs/audits/evidence/2026-10-06_214431_PDT/README.md:72–73`.
- **Current claim:** Evidence inventories identify log paths absent from the current tree.
- **Evidence:** Owner commit `c7604b838b09617d7f24daafc20ebbcbdd0c467a` deliberately removed 344 generated diagnostic log files. The October 9 manifest's other ten entries match current bytes/hashes; all three absent logs match recorded lengths/hashes at parent [`bda0ea9d0a27d32c2b6a1ac558bedfc63525db06`](https://github.com/cosmicdance-4-2-0/Auralprint1/tree/bda0ea9d0a27d32c2b6a1ac558bedfc63525db06/docs/audits/20261009-004238_materials/results).
- **Problem:** A current reader can misinterpret absent working-tree evidence as corruption, or assume the historical inventory can be replayed entirely from current paths.
- **Disposition / destination:** **Keep** original reports/manifests; **Consolidate** an archival-access note and pinned historical links into `docs/development/build-115.md`'s existing audit disposition/evidence navigation. **Owner decision** only if restoring deleted archives is desired.
- **Risk:** Do not regenerate missing outputs, rewrite checksums, restore owner-deleted files automatically, or delete further evidence.

## D. Documentation ownership map

Implementation facts remain owned by executable source. This map assigns one prose authority per audience/contract; cross-links should route readers there rather than reproduce explanations.

| Information | Authoritative home / treatment elsewhere |
| --- | --- |
| Product, current public/WIP distinction, usage, camera actions, build/bootstrap | README. Keep a compact release history; link milestones/gates rather than repeat the plan. |
| Current milestone state, acceptance criteria, deferrals, explicit release/RC decisions | ROADMAP. Link evidence; move completed stage and PR chronology to existing worklogs. |
| Universal engineering safeguards and global engineering DoD | Root AGENTS. No duplicated DoD in skills or human documents; ROADMAP adds milestone-specific acceptance. |
| World/authored-camera narrative and accepted 116 decisions | Existing `docs/development/build-116.md#116d-authored-scene-camera` as the concise current contract entry, linking later accepted frequency/editing amendments; distinctly labelled chronology below/alongside. README explains operations; AGENTS retains only cross-cutting prohibitions and routing. Do not move historical sections out merely to shorten this file. |
| Local interfaces, mathematical behavior, schema normalization and lifecycle/resource ownership | Owning source symbols/comments: `resolveSettings`/normalizers, preset codec, AnalysisFrame, audio/source/recorder owners, visualizer/runtime and camera helpers. Do not create another full architecture document or duplicate field/default tables in skills. |
| 115 chronology, experiments, superseded policy, audit dispositions and archive access | Existing Build 115 worklog. Preserve revision/authorization/baseline context when adding unique moved passages. |
| 116 chronology, correction history, validation and pending review context | Existing Build 116 worklog; 116D handoff remains a historical checkpoint, not current release authority. |
| Public-release deltas | `docs/Canon/changelog.md`. Correct false feature claims; retain older historical comparisons pending owner-approved restructuring. The release-delta document remains a baseline-specific comparison reference. |
| Audit findings, reproductions, failed probes and original evidence | Existing `docs/audits/` and root dated audit. Keep original conclusions and provenance; living worklog indexes record later dispositions. I.E documentation review remains historical. |
| Task procedures | Proposed discoverable skills below. They reference source owners, README commands, ROADMAP status and AGENTS DoD; they do not own duplicate architecture/status. |

For any relocation: identify the exact passage, merge only unique content at its destination, retain revision and authorization context, check incoming links, and preserve an old anchor or provide an explicit replacement. Unreferenced editorial repetition can be removed after this accounting. No new history or architecture document is justified by this audit.

## E. AGENTS / skill architecture

### Discovery verified, and what remains unverified

Installed CLI reports `codex-cli 0.159.0-alpha.3`. The official [AGENTS discovery guide](https://developers.openai.com/codex/guides/agents-md) and [skills guide](https://developers.openai.com/codex/skills), retrieved on 2026-10-25, establish:

- Global instructions use `AGENTS.override.md` before `AGENTS.md`. Project discovery walks the repository root to the launch working directory, choosing at most one instruction file per directory: override, AGENTS, then configured fallback names. Closer files are appended later and take precedence. Lowercase discovery is not assured without fallback configuration.
- The documented default combined project-instruction limit is 32 KiB. This root's 29,072 bytes leave about 3.6 KiB under that default; this is headroom pressure, **not evidence of actual truncation**.
- Local repository skills use `.agents/skills/<skill-name>/SKILL.md` along the working-directory-to-repository-root chain. SKILL.md requires name/description metadata. Names/descriptions/paths are exposed first; full instructions load on selection. Explicit invocation and implicit description matching exist, but implicit selection is not guaranteed.
- Arbitrary `docs/skills` files, ordinary Markdown links, and a newly invented path do not create discoverable skills. This baseline has one tracked instruction file and no repository skills or nested instructions.

Uppercase AGENTS is eligible under documented conventions. **Automatic injection in this host was not demonstrated:** this task launched at `/workspace`, outside the repository; the file was manually read. A CLI prompt-input diagnostic failed during read-only setup and produced no discovery transcript. The host's skill catalog includes the generic Codex handoff skill, not an Auralprint repository skill.

A later restructuring must verify loaded instructions and listed skills in fresh sessions launched at repository root and a representative subdirectory before deleting old coverage. Nested instructions can help directory-specific launches, but root-launched discovery is not proof that later file access recursively loads descendant instructions. This application does not yet justify many nested copies.

### Recommended always-on content and migration map

A rough **110–150 lines / 6–9 KiB** is plausible because the root needs identity/authority, protected architecture, compatibility/resource safeguards, one DoD and task routing. This is a sizing estimate, not a deletion quota. Mandatory contracts must survive even if the result is longer. Always-on guidance must explicitly protect immutable shipped builds, canon and release artifacts, and require owner authorization for RC promotion, release, tagging, deployment and publication. Bootstrap routing must require reading the owning contracts before relevant edits; a link alone does not prove it was read.

| Existing AGENTS section / baseline lines | Proposed disposition and destination |
| --- | --- |
| Purpose / §0, 1–18 | **Keep** compact identity, interface stability and authority routes; remove repeated policy/editorial framing. |
| §1.1, 24–48 | **Keep** `CONFIG → preferences → runtime.settings → state`, `resolveSettings` ownership and Scene/application-only distinction. Local storage IDs/formats remain with source owners. |
| §1.2, 52–56 | **Keep** CONFIG's configurable policy/UI-limits rule; distinguish mathematical definitions from configuration policy. |
| §1.3, 60–70 | **Keep** shared portable/hosted and single-file integrity; README owns commands, scripts own mechanics. Drop obsolete revision framing. |
| §2 introduction, 74–102 | **Keep** short schema/world/authored/live boundaries; existing Build 116 contract owns detailed narrative; README owns user operations. |
| §2.1, 104–150 | **Keep** immutable shipped/accepted schema discipline and complete persisted-field pipeline obligations. **Relocate** closed Build 115 exception chronology to Build 115 history, retaining authorization/version semantics and the old section anchor's usable destination. |
| §2.2, 154–165 | **Keep** configuration-only persistence and compact excluded categories; source codec owns exhaustive behavior. |
| §§3.1–3.3, 169–202 | **Keep** canonical `loadAndPlay`, single EOF hook and decoded-waveform seeking safeguards; source owns detailed lifecycle rationale. |
| §3.4, 206–229 | **Keep** resource ownership, export preservation and Stop/Cancel/Dispose distinctions in compact form. Source owns state-machine detail; Build 115 worklog owns corrective chronology. |
| §§4.0–4.1, 233–254 | **Keep** producer-owned AnalysisFrame/L/R/C, analysis independence and actual-Nyquist limit. Default counts/algorithms route to CONFIG/source, future counts to ROADMAP. |
| §4.2, 258–287 | **Keep** normalizer authority and canonical precision; remove copied field inventory. Source plus existing 116 numeric decisions own details; do not convert precision compatibility into optional skill advice. |
| §§4.3–4.4, 291–353 | **Keep** lifecycle interface, typed/stable identity, zero-Orb validity, composition and world-unit/history protection. Route exact budgets, fairness, expiry and time equations to local source rationale; chronology to worklogs. |
| §5.0, 357–362 | **Consolidate** with analysis/presentation ownership; source owns writable controls; future band-table plan stays ROADMAP. |
| §§5.1–5.3, 364–398 | **Keep** accessible independent workspace, recoverable launchers, focus and bounded work. README owns panel inventory; workspace source owns stacking mechanics. |
| §§5.4–5.6, 400–442 | **Keep** one writable UI owner, coordinator dependency direction, identity and read-only producer contracts; route detailed Orb/Ring/Scene behavior to owner symbols. Preserve accepted channel/color distinctions. |
| §6, 446–460 | **Consolidate** runtime-only queue rule with persistence exclusions; user capability list in README, lifecycle details in Queue/coordinator. |
| §7, 464–492 | **Consolidate** minimal scope/risk/verification guard with §9/10; task-specific evidence-gathering steps go to skills. |
| §7 documentation discipline, 494–499 | **Keep** brief truth/ownership/history/public-baseline-changelog guard. **Move to skill** the detailed maintenance procedure; retained engineering chronology belongs in existing worklogs, supplemented by PR/evidence links. |
| §8, 503–519 | **Keep** ROADMAP authority and no unapproved expansion; consolidate world invariant with §2; remove copied numbered roadmap list. |
| §9, 523–531 | **Keep / Consolidate** one engineering DoD here. ROADMAP retains milestone acceptance; skills link both. Actual relaxation of obligations requires owner decision. |
| §10, 535–546 | Preserve unique safeguards in owning rules; **Remove** duplicate anti-pattern list. |
| §§11–12, 550–577 | **Remove** motivational/repeated reminders after retaining one evidence/owner-decision rule in the change guard. |

### Skills justified by recurring workflows

All paths here are **proposals**, not files created by DOC-001.

| Proposed skill | Unique responsibility / boundary |
| --- | --- |
| `.agents/skills/auralprint-doc-maintenance/SKILL.md` | Source truth checks, ownership/relocation/link review, worklog placement, historical integrity and public-baseline changelog discipline. Does not repeat schema tables or technical architecture. |
| `.agents/skills/auralprint-adversarial-audit/SKILL.md` | Local baseline/canon protection, falsification, bounded reproductions, finding-versus-fix separation and evidence/report delivery. Add Auralprint specifics; do not copy the entire generic personal handoff skill or assume every developer has it. |
| `.agents/skills/auralprint-release-verification/SKILL.md` | Version/schema/artifact consistency, distribution/compatibility evidence, platform limits and explicit authorization verification. Reads commands/status from their owners; cannot itself authorize RC/release. |

These procedures recur in the repository's history and offer real opt-in context savings. No separate architecture, subsystem, field-inventory, concision or DoD skill is justified. Always-on safeguards must not depend on skill selection. Bootstrap task-routing should name relevant skills and references; verify actual listing/loading in supported clients before relying on implicit matching.

## F. Code-comment disposition

The substantive corrections are DOC-001-008–010. The bounded categories below complete the comment plan; **all edits are deferred**.

| Source owner / exact occurrences | Classification / intended change |
| --- | --- |
| Audio media accessor; Renderer recorder tap (DOC-001-008) | **Correct** scoped metadata versus EOF ownership and recorder-owned render resources versus delegated audio/source lifecycle. Preserve interface restrictions that remain true. |
| Schema test / normalizer / codec (DOC-001-009/010) | **Correct** world-reference wording, current/version-neutral field authority and supported-frequency qualification. No fixtures/assertions/migrations change. |
| `src/js/audio/waveform-metadata.js:117–118`; `src/js/audio/scrubber.js:23,73–74` | **Relocate / Correct / Remove** I.2B/no-production and added-this-build narration; include actual metadata status. Keep bounded-prefix/no-full-read/no-native-decode rationale. Existing Build 115 history already owns AUD-007 chronology; avoid copying it again. |
| `src/js/audio/audio-engine.js:597–598`; `src/js/recording/recorder-engine.js:9,437–438` | **Correct** future tense; **Keep** injected seams, graph isolation and state projection. |
| `src/js/core/config.js:406,410,436–439` | **Correct** implemented recorder placement/pulse tense. **Review** launcher-position wording at `416`: variables are emitted but the unified launcher layout has no current consumers for those position variables. Do not remove config/code. |
| `src/js/audio/queue.js:6`; `src/js/core/config.js:26,535` | **Review** unsupported Playlist replacement promise and whether camera interaction/limit provisional labels still reflect owner intent. Do not declare all provisional policy accepted just because 116 implementation merged. |
| `src/js/render/trail-system.js:82`; `src/js/render/particle-list.js:44`; `src/js/audio/band-bank-controller.js:5–7` | **Remove / Relocate** phase/storage narration if redundant, retaining present safety/suffix rationale; **Correct** controller owner label, which currently describes BandBank's FFT mapping. |
| CSS/template locations in DOC-001-012 | **Correct / Consolidate / Remove** stale names, duplicate stack inventory and later-phase commentary. No CSS/HTML behavior changes. |
| `scripts/validate-workspace-focus.cjs:1`; `scripts/validate-transport-ownership.cjs:2`; `scripts/validate-recorder-disposal.cjs:1`; `scripts/validate-rc21-rc22.cjs:1`; `scripts/validate-rc20.cjs:1`; `scripts/validate-rc17.cjs:1–2` | **Correct** present tooling/CI claims per DOC-001-002. |
| `scripts/validate-rc15-spacing-ui.cjs:1`; `scripts/validate-rc15-phase1.cjs:1`; `scripts/validate-rc15-budgets-ui.cjs:1`; `scripts/validate-finalizing-eof.cjs:1`; `scripts/validate-file-cancellation.cjs:2`; `scripts/validate-bulk-select.cjs:1` | **Correct** the same bounded header category; retain baseline-specific execution meaning. No assertion modernization in a comment pass. |

Important **Keep** examples, verified against the implementation:

- `src/js/core/world-geometry.js:18–19,35–36` and `src/js/core/camera-state.js:11–12,23,28–30`: independent world span, no bounds/clipping, half-open rotation and different live/persistence sanitation.
- `src/js/ui/camera-interaction.js:59–61,185`; `src/js/ui/camera-actions.js:34–38`; `src/js/ui/scene-camera-actions.js:5–6,12–13`: held-key/time ownership, simultaneous movement/rotation math and explicit capture/restore.
- `src/js/ui/config-range.js:1–14,29–30,45–55`; `src/js/core/preferences.js:114–119`: editing-only grids, binary64/native serialization tolerance and precision-preserving canonical radians.
- `src/js/audio/band-bank.js:6–8,34–39,68–75`; `src/js/audio/analysis-frame.js:4–6`; `src/js/audio/input-source-manager.js:356–358,380–382,473–484`: numerical definitions/asymptotes, borrowed producer buffers and session-fenced readiness.
- `src/js/render/trail-system.js:91–93`; `src/js/render/particle-list.js:7–8`; `src/js/render/particle-governor.js:30–31,65–66,80–82`; `src/js/render/orb.js:55–56`: same-Orb retained-tail spacing, out-of-order compatibility, oldest/fair resource accounting and legacy direct-call delta semantics.
- `src/js/recording/recorder-engine.js:688–689,710–711,1151,1202,1228,1369–1370` and `src/js/recording/recording-policy.js:16–17,49–50,78–79`: shared-track exceptions, fencing before cleanup, prior-export commit rules and safe rational resource parsing.
- `scripts/watch.mjs:53–54,82–84,151–162`; `scripts/build.mjs:140–148`; `scripts/assemble_single_file.py:61`: snapshot/staging/cancellation rationale. Preserve corresponding distribution validation explanations.
- Historical fixture provenance, including `tests/preset-schema-12.test.js:13–19`, is reproducibility evidence, not disposable obsolete commentary.

### Explicit reconciliation of the ten 116D boundaries

| Required boundary | Source-grounded result |
| --- | --- |
| 1. Public 115 / development 116D | Verified in A; correct living status without RC promotion. |
| 2. Authored versus live camera | `src/js/ui/scene-camera-actions.js:7–15` explicitly saves preferences/restores live state; `src/js/presets/preset-codec.js:79–81` admits authored data at schema 12; `src/js/main.js:70–80` restores after resolution, before subsystem synchronization. Ordinary navigation does not save preferences. |
| 3. Schema 11 world/spacing and older migration | `src/js/presets/preset-codec.js:80,223–234` retains schema-11 world/unit data and authorized older pixel-spacing/default-world conversion. Do not reinterpret obsolete overlap fields. |
| 4. World is no physical boundary | `src/js/core/world-geometry.js:34–39` does not clamp points; `src/js/core/camera-state.js:4–24` validates finite position without world bounds. |
| 5. Slow camera frames retain held keys | `src/js/ui/camera-interaction.js:54–70` clamps movement time to CONFIG 0.1 s without releasing held keys for a slow frame; `src/js/main.js:36–47` and `src/js/core/timing.js:16–21` discard discontinuous time without debt. Focus/visibility cancellation is a separate responsibility. |
| 6. C / F / Restore / Save | `src/js/ui/camera-interaction.js:170–177` routes C to factory reset and F to one-time fit; `src/js/ui/camera-actions.js:73–89` preserves rotation; `src/js/ui/camera-controls.js:170–180` separates Save from input-cancelling Restore. |
| 7. CONFIG ceiling versus Nyquist | `src/js/core/config.js:578–580` owns 384,000-Hz admission; `src/js/audio/audio-engine.js:70–74` requests no forced sample rate; `src/js/audio/band-bank-controller.js:31–39` uses actual rate/2 once known, configured ceiling beforehand. No universal ultrasonic support implied. |
| 8. Angular grids versus canonical precision | `src/js/core/config.js:5,9,566,588` gives half-degree/second speed editing and exact π/2 startup; `ui/config-range.js` implements editing-only conversion. Historical in-range off-grid values survive until deliberate edit. Designed phase remains its separate **1°** grid (`src/js/core/config.js:615`), not half-degree speed semantics. |
| 9. Required CI browser checks and limits | Workflow `39–47` runs authored-camera and numerical-editing smokes as Ubuntu failing steps. Unit/build/package checks also run Windows. No Windows browser/device/other-engine certification or branch-protection enforcement is inferred. |
| 10. Future builds stay future | `ROADMAP.md:122–173` retains 117–120 UX/performance, richer bands, preset files and optional 3D as planned/gated. No TemporalEngine module or accepted expansion was found in current source/plan. Absence of a module is not owner authorization to introduce it. |

## G. Suggested implementation PR sequence

These are future proposals requiring their own scoped implementation authorization.

| PR | Limited scope / files | Verification / main risk |
| --- | --- | --- |
| 1 — Living correctness and navigation | README public/WIP/camera/bootstrap; ROADMAP merged versus release state; exact false Bulk sentence in changelog; case-sensitive links and current/historical test routing. No history rewrites. | Check every changed claim against source/history, all affected links/anchors and shell commands against package/CI; `git diff --check`. Risk: accidental RC implication, automatic camera capture wording or changed historic meaning. |
| 2 — Human ownership and archive navigation | Consolidate completed-stage/PR detail into existing Build 115/116 worklogs; shorten duplicated README/ROADMAP summaries; add archival-access note/pinned links to living worklog index. | Passage-to-destination accounting and incoming-anchor inventory; verify pinned logs/manifest hashes. Risk: losing unique chronology or silently rewriting removed evidence. Older changelog restructuring needs explicit owner disposition first. |
| 3 — Agent architecture | Minimal AGENTS, one DoD, task routing and the three justified skills, if confirmed useful in target clients. Preserve current authoritative contract anchors and all protected rules. | Compare old-to-new instruction coverage section by section; test fresh root/subdirectory instruction loading and skill listing/representative selection; keep mandatory safeguards independent of selection. Risk: undiscovered skills, changed obligations or lost exceptional contracts. |
| 4 — Source-comment corrections | Only comment spans enumerated in C/F across application, template/CSS, tests and reusable script headers. No executable changes or historical fixture/report edits. | Inspect/token-compare non-comment code; use appropriate JS/HTML/CSS/Python syntax/build checks if needed; recheck touched owner contracts and diff whitespace. Risk: touching comment-like text inside strings or dropping mathematical/race rationale. |
| Separate future tooling decision | Catalogue historical probe applicability in existing bootstrap/worklog references; decide separately whether current measurement tools need functional repairs. | Reproduce each alleged harness mismatch in an isolated checkout before any assertion change. This is outside a documentation/comment-only PR. Risk: making historical negative controls appear to certify today's application. |

Run product tests/builds when a future diff warrants them; do not create meaningless tests merely to justify prose shortening. No PR above authorizes merging, tagging, RC promotion or release publication.

## H. Preservation, accurate material and unresolved decisions

**Preserve:** all shipped HTML/checksums, release artifacts, historical audit reports, original diagnostics, fixtures, manifests, accepted schema migrations, timestamped handoffs, failed approaches, original measurements and corrective chronology. Preserve local mathematical, numerical-stability, lifecycle-race and resource-ownership explanations. No historical report is redundant merely because its findings were fixed.

Known accurate material worth keeping includes README's product/public release (`3–5`), waveform/local-memory qualifications (`39`), recorder policy/export distinction (`41`), distribution/no-caching limitations (`29,33`); ROADMAP's qualified release acceptance (`79–86`), world/live/authored boundaries (`110,116–120`) and future-build gates; the development worklogs' supersession notices and detailed audit disposition index.

The unreleased AUD-001 changelog entry (`docs/Canon/changelog.md:5–7`) is **not WIP-only churn**: InputSourceManager has identical blob `e15051ea77b77d8c6eb69bfd8c3e1cdfa51f2cfc` at Build 115 canon merge `debec67` and pre-fix 116 baseline `0bbe517`. The shipped-baseline defect therefore supports a future public-release fix note. No analogous indiscriminate purge of unreleased fixes is justified.

Unresolved decisions and limits:

- Owner release/RC acceptance and the second independent adversarial code audit remain separate gates. DOC-001 makes no release-readiness verdict.
- Owner must approve substantive DoD/architecture/performance-policy changes; deduplication must retain requirements. Whether older internal-build changelog comparisons should be restructured also needs a preservation-aware editorial decision.
- Camera provisional policy wording and the unapproved Playlist replacement promise need owner intent checked before declaring a new accepted contract.
- Owner-deleted diagnostic logs remain retrievable in Git history. Restoration is not required to explain their disposition and is not authorized here.
- Some optional probes have historical expectations, not current-release contracts: e.g. `scripts/validate-rc15-phase1.cjs:43,52` expects schema 10 and `scripts/validate-rc15-budgets-ui.cjs:31,43` expects schema 11. The prior October 24 audit already records `scripts/measure-release-resources.mjs:66`'s stale eight-emission assertion (`docs/audits/20261024-085149_auralprint-audit.md:229`). Current source inspection confirms that assertion remains; this pass did not rerun that measurement or authorize changing it.
- Automatic AGENTS/skill loading in this host, external link availability, complete raw-evidence integrity, broader browser/device/permission/recording fidelity and artistic acceptance were not established. Coverage and targeted checks are bounded in B.

Before delivery, 120 full-path file/line citations were bounds-checked and substantive findings independently reviewed against source. Finding IDs, sections A–H, Markdown table structure and the exact upstream SHA were checked. `git diff --check` passes; the intended diff is exactly this added report, with existing tracked files and the protected canon unchanged. Scratch analysis remains outside the repository. The audit branch/commit and draft PR provide the review trail; no cleanup is applied.
