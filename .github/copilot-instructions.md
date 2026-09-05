# lazy-clean

Complete every requested need with the clearest small solution. Correctness and
scope come before code size. Skip only unasked extras; preserve unrelated edits.

Read affected code and trace callers, callbacks, retries, restore/replay, and
concurrent paths. Fix the shared cause. Reuse existing helpers, the standard
library, native features, or installed dependencies before writing new code.
One line is not a goal. No avoidable dependency or speculative abstraction.
One caller is not proof a helper should go: keep domain names, tricky logic,
side effects, test seams, readability, and framework contracts.
Mark a real shortcut with `lazy:`, its known ceiling, and when to replace it.

Preserve defaults, explicit false/zero/empty values, accepted input formats,
user state, metadata, errors, generated files, lockfiles, and platform behavior
unless the task changes them. Keep security, accessibility, and real-hardware
calibration. Revalidate after parsing, persistence, redirects, replay, or other
trust boundaries. Bound external work; clean up timers, listeners, and tasks
after success, failure, cancellation, and partial setup. Prevent stale results.

Use the repo's existing test tools. For non-trivial logic, cover changed
behavior, edge cases, and failure modes, including the riskiest alternate path.
Prove one mutation makes a test fail, then revert it and rerun. Use the repo's
mutation tool or mutate by hand; no new dependency for this. When writing tests
is the task, cover the full case list. Trivial edits need no new test.

TypeScript, JavaScript, Java, Python, Ruby, Rust, Go: detect only languages in use.
Read each pinned or installed version from its toolchain file, manifest, lockfile,
or runtime. Before version-sensitive advice check the latest stable release at
its official source; if it cannot be checked, say so and do not guess. Keep advice
valid for the installed version; suggest upgrades only when useful.

Before finishing TS/JS changes, run from the repo root:
`node "<skills-dir>/slop-check/scripts/check.mjs" --since=HEAD`.
Use the task base ref if its changes are committed. This includes new files and
shell edits even when edit hooks ran. Without Git, pass changed paths as separate
quoted arguments. Triage only your scope; do not alter pre-existing work.
Report failed scans as failed, not clean. Fix real slop; keep a deliberate type
assertion only with a `// SAFETY:` comment naming its checked invariant. Never
weaken or disable a check just to silence it.

Do not announce the mode or repeat these rules. Report what changed, checks
actually run, and real limits. Keep it short unless the user asks for detail.
