---
name: lazy
description: Use for coding tasks, bug fixes, refactors, code reviews, or requests for lazy mode, simpler code, or less over-engineering. Not for unrelated prose or general knowledge.
argument-hint: "[lite|full|ultra]"
license: MIT
---

# Lazy

Complete the request with the clearest small solution. Correctness and scope
come before code size.

## Think, then act

Before coding, state material assumptions and tradeoffs. Ask only if missing
information blocks work. For multi-step tasks, write a step → check plan.
Define a verifiable finish: bugs go red → green, refactors get before/after
checks; loop until verified. Carry unfinished
checks through handoffs and compaction; summaries do not replace these instructions.

## Persistence

Use the active level until `/lazy off`, "stop lazy", or "normal mode".
Switch with `/lazy lite|full|ultra`; a bare `/lazy` only reports the level.
Do not announce the mode during ordinary work.

## The ladder

First, trace affected code, callers, callbacks, retries, restore/replay,
and concurrent use. Fix the shared cause.

1. Skip speculative features, config, abstractions, and impossible-state guards,
   never an explicit requirement.
2. Reuse existing helpers or patterns with matching contracts: check callers,
   ownership, errors, lifecycle, and availability. Avoid syntax-only reuse.
3. Prefer the standard library, native platform, or an installed dependency.
4. Write a clear small solution.

Preserve unrelated edits. One caller alone is not waste: keep domain names, tricky logic,
side effects, test seams, readability, and framework contracts.
No avoidable dependency.
Keep or add accurate comments for non-obvious constraints, workarounds, and ordering.
Remove nonessential comments that only narrate code or edits.
Keep required license notices and functional tool directives.
Report rationale, constraints, checked invariants, shortcut ceilings, and upgrade paths in the final response.
Never add `SAFETY:`/`lazy:`/`slop-check-ignore`; verify necessary functional suppressions.

Match existing style. Offer simpler alternatives to unneeded scope. Review the
task-owned diff: remove task-created orphans and unrelated additions; mention
unrelated dead code. Simplify structure, preserve behavior; do not force a
net-negative diff.

## Design boundaries

At changed boundaries: group behavior by reason to change; keep policy independent
of external details through ordinary parameters; give callers only capabilities
they need. Extend existing contracts for requested variations. Interchangeable
implementations must preserve inputs, results, errors, and lifecycle; exercise
the same contract against each. Do not add interfaces just to satisfy SOLID.
For boundary changes, read [design checks](references/design-checks.md).
One implementation alone is not waste; judge behavior and design separately.

## Checks

Preserve defaults, explicit false/zero/empty values, accepted input formats,
user state, errors, metadata, generated files, lockfiles, and platform behavior unless the task changes them.
Keep security, accessibility, and real-hardware calibration. Revalidate at new
trust boundaries. Bound external work and clean up timers, listeners, and tasks.

Read checks for each changed language:
[TS/JS and tsconfig](references/simplification-checks.md) or [Python](references/python-checks.md).

For non-trivial code changes, read [risk checks](references/risk-checks.md).
Use existing test tools. Map changed requirements, edge cases, and failure modes
to rerunnable tests; add missing coverage. Inline probes alone are not coverage.
Trivial edits need no new tests. Prove each risk once. If red-green
checks prove the risky regression, skip old-code reruns, and mutation work is
optional; otherwise a meaningful mutation check is useful. Never add a dependency for it.
When writing tests is the task, cover the full case list.

For TS/JS edits, run the bundled checker from the repo root with the final
tests, even after edit hooks: `node "<skills-dir>/slop-check/scripts/check.mjs" --since=HEAD`. Use the
task's base ref for committed changes, or quoted changed paths without Git.
Review only your scope. A failed scan is not clean. Triage findings; never
weaken a check to silence it.

## Language fit

TypeScript, JavaScript, Java, Python, Ruby, Rust, Go: detect those in use. Read
versions from the toolchain file, manifest, lockfile, or runtime. Use the
installed version. Report unavailable facts; do not guess. Research latest
versions only when asked.

## Intensity

<!-- Mode-keyed rows and quoted examples are filtered by lazy-instructions.js. -->

| Level | What changes |
|-------|------------|
| **lite** | Complete the task; briefly suggest a simpler option when useful. |
| **full** | Complete the task using the ladder. Default. |
| **ultra** | Aggressively cut unasked extras, never requested behavior or checks. |

Example: "Add a cache with a 60-second expiry."
- lite: "Keep the expiry; suggest the existing cache helper."
- full: "Reuse the existing cache helper with a 60-second expiry."
- ultra: "Keep the required expiry; skip unasked cache metrics and configuration."

## Before you report

Check the diff, not memory:
1. Every requested need is done; nothing unasked was added.
2. Each changed line traces to the request or its verification.
3. Changed behavior has tests that ran; failures are reported.
4. Language checks were applied; checker findings were triaged.

Report changes, checks actually run, and limits. Never claim an unrun check.
