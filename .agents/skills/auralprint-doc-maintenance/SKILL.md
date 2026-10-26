---
name: auralprint-doc-maintenance
description: >-
  Maintain Auralprint repository documentation: correct stale claims, consolidate
  duplicated technical descriptions, reconcile README/ROADMAP/worklog/changelog
  ownership, verify claims against source, repair links, and maintain accurate
  public-release notes. Use for documentation maintenance, not release
  authorization, code auditing, or architecture redesign.
---

# Auralprint documentation maintenance

Follow root [AGENTS.md](../../../AGENTS.md), including its single global Definition
of Done, and the task's allowed paths. This procedure grants no release authority,
architectural exception, source change, or permission to alter shipped artifacts.
It does not substitute for a code audit.

1. **Establish context.** Fetch upstream and verify the accepted baseline, branch,
   ancestry and working-tree state; distinguish accepted history from newer work.
   Preserve unrelated changes. Read applicable AGENTS, README, ROADMAP, relevant
   worklogs and the actual source behind each proposed technical claim. Report
   unavailable verification; do not present an unverified checkout as current.

2. **Choose the audience and owner.** Update an existing authoritative destination
   before creating another document. README owns current product/developer guidance;
   ROADMAP owns plans, milestone acceptance and deferrals; existing worklogs own
   engineering chronology; AGENTS owns always-on safeguards. Source owns current
   implementation truth. Prefer a link to copied field inventories or algorithms.

3. **Verify claims.** Trace source symbols and relevant callers for current behavior;
   use accepted commits, original evidence and owner decisions for historical claims.
   Check plans and authorization against ROADMAP and the current task. Documentation
   and passing tests alone do not prove a technical claim. Separate observed facts,
   static inference and unresolved questions; do not infer release acceptance from
   implementation or merge status.

4. **Classify before editing.** Keep, correct, consolidate, link, relocate, remove
   duplication, or flag an owner decision. Account for unique facts and authorization
   context before removing text. Preserve binding safeguards in AGENTS even when a
   procedure moves here. Scope or contract changes require the owner's decision;
   report out-of-scope defects without silently fixing behavior or expanding paths.

5. **Preserve evidence.** Do not rewrite historical audit findings, accepted
   measurements, original review decisions, immutable canon or timestamped handoffs.
   Distinguish historical checkpoint language from current operational guidance.
   Link superseding decisions or archived evidence without rewriting what was
   originally observed. Relocate unique chronology only within authorized scope.

6. **Edit concisely.** Use factual, specific language for the intended reader. Avoid
   marketing, development diaries and repeated implementation narration. Keep useful
   compatibility/ownership qualifications; do not simplify them into false claims.
   Correct stale comments only when source-comment edits are explicitly in scope.

7. **Maintain release notes.** Compare public-release changes with the actual last
   shipped public baseline. A defect introduced and fixed only during unreleased
   development is not automatically a public changelog item. Keep development
   chronology in existing worklogs or PR evidence; do not erase historical internal
   comparisons merely because current release-note policy differs.

8. **Verify the patch.** Recheck every changed claim, authoritative destination,
   case-sensitive relative path and Markdown fragment, including inbound anchors.
   Confirm historical evidence and all unauthorized paths are unchanged. Validate
   metadata/discovery when editing skills; distinguish actual discovery from manual
   path reads. Run `git diff --check` and applicable existing tests/build checks from
   README and CI. Report skipped checks and platform limits; add no tests merely to
   justify prose. Apply AGENTS' global DoD without creating a second version here.

9. **Deliver within authority.** Make bounded commits and a reviewable PR when
   requested. Report implemented changes separately from findings and deferrals,
   with baseline/head, evidence and unresolved decisions. Distinguish local,
   committed and pushed work. Stop at the requested review boundary; never infer
   permission to merge, promote an RC, tag, deploy, publish or release.
