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

Before coding, state material assumptions, interpretations, and tradeoffs. Ask
only when a missing answer blocks the requested result; use judgment for trivial
choices. For a multi-step task, write a brief step → check plan. Define a
verifiable finish: bug fixes go red → green, refactors have before/after checks,
and keep looping until verified. Carry unfinished checks through handoffs and
compaction; a summary or skill description does not replace these instructions.

## Persistence

Use the active level until `/lazy off`, "stop lazy", or "normal mode".
Switch with `/lazy lite|full|ultra`; a bare `/lazy` only reports the level.
Do not announce the mode during ordinary work.

## The ladder

Read the affected code and trace its real entry paths before choosing a fix.
For bugs, include callers, callbacks, retries, restore/replay, and concurrent use.
Fix the shared cause, not just the reported path.

1. Skip speculative work, never an explicit requirement.
2. Reuse an existing helper or pattern.
3. Prefer the standard library, native platform, or an installed dependency.
4. Otherwise write a clear small solution.

Preserve unrelated edits. One caller is not proof a helper should go: keep domain names, tricky logic,
side effects, test seams, readability, and framework contracts.
No avoidable dependency, speculative abstraction, or unrelated cleanup.
Mark a deliberate shortcut with `lazy:` only when it has a known ceiling;
name that ceiling and when to replace it.

Match existing style. Reject speculative features/config, needless single-use
abstractions, and impossible-state guards. Offer a simpler alternative to unneeded
scope. Review the task-owned diff: remove only task-created orphans and additions
unrelated to the request; mention unrelated dead code. Simplify structure, not
formatting. Preserve behavior; do not force a net-negative diff.

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

Before finishing TS/JS changes, read [TS/JS simplification checks](references/simplification-checks.md).
Other languages keep their idioms.

For non-trivial code changes, read [risk checks](references/risk-checks.md).
Use existing test tools. Map changed requirements, edge cases, and failure modes
to rerunnable tests; add missing coverage. Inline probes alone are not coverage.
Trivial edits need no new tests. If existing red-green checks prove the risky regression,
mutation work is optional; otherwise, a small meaningful mutation check is
useful. Never add a dependency just for mutation evidence.
When writing tests is the task, cover the full case list, not just one example.

Before finishing TS/JS edits, run the bundled checker from the repo root:
`node "<skills-dir>/slop-check/scripts/check.mjs" --since=HEAD`.
Include new files and shell edits even when edit hooks ran. Use the task's base
ref for committed changes. Review only your scope. Without Git, pass changed
paths as separate quoted arguments. A failed scan is not a clean result.
Triage findings; never weaken a check just to silence it.

## Language fit

TypeScript, JavaScript, Java, Python, Ruby, Rust, Go: detect only those in use;
read each version from its toolchain file, manifest,
lockfile, or runtime. Keep advice valid for the installed version. If a needed
version fact cannot be checked, say so and do not guess; latest-version research
is only needed when the user asks for current-version advice.

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

## Output

Report changes, checks actually run, and limits; stay concise unless asked
for detail.
