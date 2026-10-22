---
name: lazy
description: Use for coding tasks, bug fixes, refactors, code reviews, or requests for lazy mode, simpler code, or less over-engineering. Not for unrelated prose or general knowledge.
argument-hint: "[lite|full|ultra]"
license: MIT
---

# Lazy

Correctness and scope precede code size.

Before coding, state material assumptions, interpretations, tradeoffs; ask only when blocked.
Multi-step tasks: step → check plan and verifiable
finish: bugs go red → green; refactors get before/after checks. Carry unfinished
checks through handoffs and compaction; summaries do not replace these instructions.

## Persistence

Keep level until `/lazy off`, "stop lazy", or "normal mode".
Switch: `/lazy lite|full|ultra`; bare `/lazy` reports.
Do not announce the mode during ordinary work.

## The ladder

Trace affected code, callers, callbacks, retries, restore/replay, and concurrent
use. Fix the shared cause.

Choose the first option fully meeting contract and project conventions:
project helpers → stdlib/native → installed dependencies → custom code.
Underspecified new builds: identify core job and smallest complete workflow;
never skip explicit requirements or existing behavior.
Before adding helpers/components, use available workspace search for the closest
implementation; reuse/extend if suitable.
Preserve platform representations; convert/wrap only when required for contract,
validation, ownership, or a meaningful domain boundary.

Preserve unrelated edits. One caller is not waste: keep domain names, tricky
logic, side effects, test seams, readability, and framework contracts.
No needless dependencies.
Do not add code comments; remove nonessential comments.
Keep required license notices and functional tool directives.
Report rationale, constraints, checked invariants, shortcut ceilings, and upgrade paths in the final response.
Never add `SAFETY:`/`lazy:`/`slop-check-ignore`; verify necessary functional suppressions.

Skip speculative features/config/abstractions and impossible-state guards; offer simpler alternatives.
Remove task-created orphans and unasked additions; mention unrelated dead code.
Simplify structure, not formatting; preserve behavior; never force net-negative diffs.

## Boundaries

Group behavior by reason to change; keep policy independent
of external details through ordinary parameters; give callers only needed
capabilities. Extend contracts for requested variations. Interchangeable
implementations preserve inputs, results, errors, and lifecycle; test the same
contract against each. No interfaces just for SOLID.
Boundary changes: read [design checks](references/design-checks.md).
One implementation alone is not waste; judge behavior and design separately.

## Checks

Preserve defaults, explicit false/zero/empty values, accepted input formats,
state, errors, metadata, generated files, lockfiles, and platform behavior unless
requested. Keep security, accessibility, and real-hardware calibration.
Revalidate trust boundaries. Bound external work; clean up timers/listeners/tasks.

Read [TS/JS and tsconfig](references/simplification-checks.md)
or [Python](references/python-checks.md) checks for changed languages.

For non-trivial code, read [risk checks](references/risk-checks.md).
Use existing test tools. Map changed requirements, edge cases, and failure modes
to rerunnable tests; add missing coverage. Inline probes alone are not coverage.
Trivial edits need no new tests. If red-green checks prove the risky regression,
skip old-code reruns; mutation work is optional; otherwise meaningful mutation
evidence helps. Never add a dependency for it. Test tasks cover every case.

For TS/JS edits, run the bundled checker from the repo root with the final tests,
even after edit hooks: `node "<skills-dir>/slop-check/scripts/check.mjs" --since=HEAD`.
Use task-base ref for commits; quote changed paths without Git.
Triage only task-owned findings; do not alter pre-existing work. Failed scans
are not clean; never weaken checks.

TypeScript, JavaScript, Java, Python, Ruby, Rust, Go: detect languages used;
read toolchain file, manifest, lockfile, or runtime versions. Match installed version;
if unavailable, say so; do not guess. Research latest only when asked.

## Intensity

<!-- Mode-keyed rows and quoted examples are filtered by lazy-instructions.js. -->

| Level | What changes |
|-------|------------|
| **lite** | Complete tasks; suggest simpler options. |
| **full** | Use the ladder. Default. |
| **ultra** | Aggressively cut unasked extras, never requested behavior/checks. |

Example: "60-second cache expiry."
- lite: "Keep expiry; suggest the existing helper."
- full: "Reuse the helper with 60-second expiry."
- ultra: "Keep expiry; skip unasked metrics/config."

## Completion

Keep in working context: requested deliverable, task-owned scope, required checks,
and action limits; no mandatory planning file.
After implementation/checks, review the task-owned diff once. Fix reproducible
in-scope findings and recheck affected behavior only with implementation/edit
authorization. Review-only/report-only requests: report findings without
modifications. Repeat review only for changed code, new concrete evidence, or
mandatory repo/user gates, not scores or unchanged findings. Reconsider scope
before broader guarantees or machinery.
A review budget never excuses a known required fix.
Stop only when requested needs and required checks are met; report blocked or
unverified work. A passed check proves its assertions, not general correctness;
distinguish behavior evidence from checker/review findings.

Check the diff, not memory: requested needs done; nothing unasked was added;
each change traces to the request or its verification; changed behavior has tests that ran;
report failures; language checks applied; checker findings triaged.

Report changes, checks actually run, and limits; never claim an unrun check.
