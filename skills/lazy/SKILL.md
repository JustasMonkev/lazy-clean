---
name: lazy
description: Build and review small, complete code changes. Reuse existing code and tools, preserve behavior, and avoid unasked extras. Use for coding tasks or requests for lazy mode, simpler code, or less over-engineering; not for unrelated prose or general knowledge.
argument-hint: "[lite|full|ultra]"
license: MIT
---

# Lazy

Complete the user's request with the clearest small solution. Correctness and
requested scope come before code size, speed, or fewer files.

## Think, then act

Before coding, state material assumptions, interpretations, and tradeoffs. Ask
only when a missing answer blocks the requested result; use judgment for trivial
choices. For a multi-step task, write a brief step → check plan. Define a
verifiable finish: bug fixes go red → green, refactors have before/after checks,
and keep looping until the result is verified.

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
4. Otherwise write the clearest small solution. One line is not a goal.

Preserve unrelated edits.
One caller is not proof a helper should go: keep domain names, tricky logic,
side effects, test seams, readability, and framework contracts.
No avoidable dependency, speculative abstraction, or unrelated cleanup.
Mark a deliberate shortcut with `lazy:` only when it has a known ceiling;
name that ceiling and when to replace it.

Match existing style. Do not add speculative features/config, needless
single-use abstractions, or impossible-state guards. Push back on unneeded scope
and offer a simpler alternative. Review the task-owned diff once more: remove
only orphans created by this task, mention unrelated dead code instead of
deleting it, and cut additions that do not support the request. If 200 lines can
be 50 with the same behavior and clearer structure, rewrite; do not compress
formatting. Do not force a net-negative diff or remove required behavior. Every
proposed simplification must preserve behavior. Every changed line should be
traceable to the request or verification.

## Checks

Preserve defaults, explicit false/zero/empty values, accepted input formats,
user state, errors, metadata, and platform behavior unless the task changes them.
Keep security, accessibility, and real-hardware calibration. Revalidate at new
trust boundaries. Bound external work and clean up timers, listeners, and tasks.

Before finishing TS/JS changes, read [TS/JS simplification checks](references/simplification-checks.md)
for concrete type, argument, control-flow, ownership, and deletion examples.
Other languages keep their own idioms.

For non-trivial code changes, read [risk checks](references/risk-checks.md).
Use the repo's existing test tools. Cover changed behavior, edge cases, and
failure modes. If existing red-green checks already prove the risky regression,
mutation work is optional; otherwise, a small meaningful mutation check is
useful. Never add a dependency just for mutation evidence.
When writing tests is the task, cover the full case list, not just one example.

Before finishing TS/JS edits, run the bundled checker from the repo root:
`node "<skills-dir>/slop-check/scripts/check.mjs" --since=HEAD`.
This final pass includes new files and shell edits even when edit hooks ran.
Use the task's base ref if its changes are already committed. Review only your
scope; do not change pre-existing work. Without Git, pass your changed paths
as separate quoted arguments. A failed scan is not a clean result.
Triage findings; never weaken a check just to silence it.

## Language fit

Supported: TypeScript, JavaScript, Java, Python, Ruby, Rust, Go. Detect only those
in use; read each pinned or runtime version from its toolchain file, manifest,
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

Report what changed, what checks ran, and any real limits. Keep it short unless
the user asks for detail. Never claim a check passed without running it.
