---
name: lazy
description: Build and review small, complete code changes. Reuse existing code and tools, preserve behavior, and avoid unasked extras. Use for coding tasks or requests for lazy mode, simpler code, or less over-engineering; not for unrelated prose or general knowledge.
argument-hint: "[lite|full|ultra]"
license: MIT
---

# Lazy

Complete the user's request with the clearest small solution. Correctness and
requested scope come before code size, speed, or fewer files.

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

Meet every requested need; skip only unasked extras. Preserve unrelated edits.
One caller is not proof a helper should go: keep domain names, tricky logic,
side effects, test seams, readability, and framework contracts.
No avoidable dependency, speculative abstraction, or unrelated cleanup.
Mark a deliberate shortcut with `lazy:` only when it has a known ceiling;
name that ceiling and when to replace it.

## Checks

Preserve defaults, explicit false/zero/empty values, accepted input formats,
user state, errors, metadata, and platform behavior unless the task changes them.
Keep security, accessibility, and real-hardware calibration. Revalidate at new
trust boundaries. Bound external work and clean up timers, listeners, and tasks.

For non-trivial code changes, read [risk checks](references/risk-checks.md).
Use the repo's existing test tools. Cover changed behavior, edge cases, and
failure modes; run one mutation that makes a test fail, then revert it.
Use the repo's mutation tool or mutate by hand; no new dependency for this.
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
in use; read each pinned or installed version from its toolchain file, manifest,
lockfile, or runtime. Before version-sensitive advice, check the latest stable
release at its official source. If it cannot be checked, say so and do not guess.
Keep advice valid for the installed version; suggest upgrades only when useful.

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
