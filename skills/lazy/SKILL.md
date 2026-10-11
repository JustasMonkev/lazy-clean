---
name: lazy
description: Use for coding tasks, bug fixes, refactors, code reviews, or requests for lazy mode, simpler code, or less over-engineering. Not for unrelated prose or general knowledge.
argument-hint: "[lite|full|ultra]"
license: MIT
---

# Lazy

Complete requests clearly. Correctness and scope precede code size.

## Think, then act

Before coding, state material assumptions, interpretations, and tradeoffs. Ask
only when blocked. For multi-step tasks: step → check plan and verifiable
finish: bugs go red → green; refactors get before/after checks. Carry unfinished
checks through handoffs and compaction; summaries do not replace these instructions.

## Persistence

Keep the level until `/lazy off`, "stop lazy", or "normal mode".
`/lazy lite|full|ultra` switches; bare `/lazy` reports it.
Do not announce the mode during ordinary work.

## The ladder

Trace affected code, callers, callbacks, retries, restore/replay, and concurrent
use. Fix the shared cause.

1. Skip speculative features/config, abstractions, and impossible-state guards,
   never requirements.
2. Reuse existing helpers.
3. Prefer stdlib, native features, or installed dependencies.
4. Write clear small code.

Preserve unrelated edits. One caller is not waste: keep domain names, tricky
logic, side effects, test seams, readability, and framework contracts.
Avoid needless dependencies.
Do not add code comments; remove nonessential comments.
Keep required license notices and functional tool directives.
Report rationale, constraints, checked invariants, shortcut ceilings, and upgrade paths in the final response.
Never add `SAFETY:`/`lazy:`/`slop-check-ignore`; verify necessary functional suppressions.

Match existing style; offer simpler alternatives to unneeded scope.
Remove task-created orphans and unasked additions; mention unrelated dead code.
Simplify structure, not formatting; preserve behavior; never force net-negative diffs.

## Design boundaries

At boundaries: group behavior by reason to change; keep policy independent
of external details through ordinary parameters; give callers only needed
capabilities. Extend contracts for requested variations. Interchangeable
implementations preserve inputs, results, errors, and lifecycle; test the same
contract against each. No interfaces just for SOLID.
For boundary changes, read [design checks](references/design-checks.md).
One implementation alone is not waste; judge behavior and design separately.

## Checks

Preserve defaults, explicit false/zero/empty values, accepted input formats,
state, errors, metadata, generated files, lockfiles, and platform behavior unless
requested. Keep security, accessibility, and real-hardware calibration.
Revalidate trust boundaries. Bound external work; clean up timers/listeners/tasks.

Before finishing, read [TS/JS and tsconfig](references/simplification-checks.md)
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

## Language fit

TypeScript, JavaScript, Java, Python, Ruby, Rust, Go: detect languages in use;
read versions from the toolchain file, manifest, lockfile, or runtime. Keep advice
valid for the installed version. If unavailable, say so and do not guess;
research latest only when asked.

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

## Completion and review

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

## Before you report

Check the diff, not memory:
1. Requested needs done; nothing unasked was added.
2. Each changed line traces to the request or its verification.
3. Changed behavior has tests that ran; report failures.
4. Language checks applied; checker findings triaged.

Report changes, checks actually run, and limits; never claim an unrun check.
