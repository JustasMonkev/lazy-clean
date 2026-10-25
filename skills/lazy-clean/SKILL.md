---
name: lazy-clean
description: Guides a coding task from requirements through implementation, independent subagent verification, review, fixes, and a final evidence-based handoff. Use for lazy-clean, guided A-to-Z implementation, or a coordinated multi-agent build. Use lazy for ordinary coding guidance and focused review skills for report-only audits.
---

# lazy-clean

One entry point for a complete implementation: **first make it work, then make
it right, then hand it over with evidence**. Coordinate the work, not just a
collection of reviews. This replaces the former ladder-plus-checker workflow;
it does not change persistent lazy levels, hooks, or the user's task scope.

Read and execute [the guided workflow](references/guided-workflow.md). It defines
phase gates, subagent assignments, integration, failure recovery, and completion.
Keep the engineering rules below throughout. Supporting skills are procedures
inside this workflow, not additional user commands required to finish it.

## Engineering contract

Follow [lazy](../lazy/SKILL.md): think first and use project helpers → stdlib/native → installed dependencies → custom code.
If the full ruleset is already in context, do not reread it. A header, description,
or compacted summary is not the full ruleset. State material assumptions and a
brief step → check plan before coding. Ask only when a missing answer blocks work.

Model the data and invariants before splitting implementation. Keep one decision
in one place. Search for the closest existing implementation before adding one;
reuse or extend it when it meets the contract. Remove replaced task-owned paths,
not unrelated features. Consider the design that would naturally accommodate the
requirement, then deliver it in small compatible slices rather than a rewrite.

Keep independent mutable state separate; assign one writer when sharing is
necessary. Validate external data at its boundary and revalidate after parsing,
persistence, redirects, or replay when trust changes. Preserve explicit false/zero/empty
values, accepted input formats, defaults, errors, metadata, and user state.
Test retry/crash idempotency when the operation promises it; do not retrofit it
everywhere. Keep cancellation, cleanup, accessibility, and platform behavior.

One caller alone does not make a helper waste: preserve a domain name, tricky
logic, side effect, test seam, readability, or framework contract. At changed
boundaries read [design checks](../lazy/references/design-checks.md). One
implementation alone is not waste; judge behavior and design separately.
Do not add code comments; remove nonessential comments from touched code.
Keep required license notices and functional tool directives. Report rationale
and constraints in the final response, not suppression comments.

## Verification tools

Detect only the changed languages: TypeScript, JavaScript, Java, Python, Ruby,
Rust, Go. Read each pinned or installed version from its toolchain file, manifest, lockfile,
or runtime; keep advice compatible. If a needed version cannot be checked,
say so and do not guess. Research latest versions only when requested.
Before finishing TS/JS read [simplification checks](../lazy/references/simplification-checks.md);
for Python read [Python checks](../lazy/references/python-checks.md).
Other languages get the same behavior/design review in their own idioms.

Use existing test tools. Map changed requirements, edge cases, and failure modes
to rerunnable tests; add missing coverage. Inline probes alone are not coverage.
Trivial edits need no new tests. Write the failing behavioral test first, confirm
its intended failure, then implement. Refactors need before/after checks. When
an honest automated test is impractical, record the specific manual check and
limit instead of inventing a tautology or claiming automation passed.

The guided workflow runs [lazy-quality-review](../lazy-quality-review/SKILL.md)
for task-owned added/changed tests, not a whole-suite audit. Preserve useful
assertions; do not weaken expectations to hide a production bug.
Mutation work is optional when existing red-green checks already prove the risky
regression; otherwise meaningful mutation evidence can help. Use
[lazy-mutation](../lazy-mutation/SKILL.md) for the scoped, isolated challenge;
never add a dependency for it. Keep tests that catch real regressions.

For TS/JS changes run from the target repo root, even after edit hooks:

```bash
node "<skills-dir>/slop-check/scripts/check.mjs" --since=HEAD
```

Resolve `<skills-dir>` to this installation. Use the task base ref for committed
changes; without Git pass changed paths as separate quoted arguments. The scan
includes new untracked files and shell edits. Triage only task-owned findings;
do not alter pre-existing work. Follow [slop-check](../slop-check/SKILL.md): fix
real slop, never weaken checks. Exit 1 means findings; exit 2 means scan failure,
not clean. The scanner reads only TS/JS; zero files checked proves nothing about
other languages. Explain retained assertions or swallowed errors with checked
invariants in the final response, never `SAFETY:`, `lazy:`, or suppression markers.

[lazy-verify](../lazy-verify/SKILL.md) remains experimental and explicitly opt-in;
never install or execute its separate engine automatically. Missing prerequisites
cannot satisfy a required gate. Do not require crapper, dryer, mutator, arbitrary
complexity scores, or new infrastructure to complete this workflow.

## Completion boundary

Keep in working context: requested deliverable, task-owned scope, required checks,
and action limits; no mandatory planning file. Carry unfinished checks through
handoffs and compaction. After implementation/checks, review the task-owned diff once.
Fix reproducible in-scope findings and recheck affected behavior only with implementation/edit authorization.
Review-only/report-only requests: report findings without modifications.
Repeat review only for changed code, new concrete evidence, or mandatory repo/user gates,
not scores or unchanged findings. Reconsider scope before broader guarantees or machinery.
A review budget never excuses a known required fix. Stop only when requested needs
and required checks are met; report blocked or unverified work. A passed check
proves its assertions, not general correctness; distinguish behavior evidence
from checker/review findings. No commit, push, deployment, or deletion of unrelated
worktrees is implied by invoking this skill. When PR creation is authorized,
create draft PRs only. Never create a ready-for-review PR, mark one ready, merge
a PR, or push directly to main/the default branch. This applies to every worker;
if draft creation is unavailable, report the blocker rather than open a normal PR.

For upstream comparisons or ports, also read [upstream updates](references/upstream-updates.md)
and the repository's `UPSTREAM.md` when present; preserve local behavior and record partial adaptations.

## Before you report

Check the diff, not memory:
1. Every requested need is done; nothing unasked was added.
2. Each changed line traces to the request or its verification.
3. Changed behavior has tests that ran; failures are reported.
4. Language checks were applied; checker findings were triaged.

Report changes, checks actually run, and limits. Never claim an unrun check.
