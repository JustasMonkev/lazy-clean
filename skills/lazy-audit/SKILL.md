---
name: lazy-audit
description: >
  Whole-repo audit for over-engineering. Like lazy-review, but scans the
  entire codebase instead of a diff: a ranked list of what to delete, simplify,
  or replace with stdlib/native equivalents. Use when the user says "audit this
  codebase", "audit for over-engineering", "what can I delete from this repo",
  "find bloat", "find dead code", "which dependencies can we drop",
  "lazy-audit", or "/lazy-audit". One-shot report, does not apply fixes.
---

lazy-review, repo-wide. Scan the whole tree instead of a diff. Rank findings by
useful simplification, and do not cut required behavior merely to reduce lines.

## Tags

Same as lazy-review:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer that only forwards.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Hunt

Detect which of TypeScript, JavaScript, Java, Python, Ruby, Rust, and Go the
repo actually uses. Read each pinned or installed version from its toolchain
file, manifest, lockfile, or runtime and keep replacements compatible. If a
needed version fact cannot be checked, say so and do not guess; check the latest
release only when the user asks for current-version advice.

One caller or one export is not proof of waste. Keep a separate function or
file when it names a domain idea, hides tricky logic, isolates a side effect or
boundary, earns its keep in tests or readability, or is required by a framework
contract. Report it only when none of those hold.

Deps the stdlib or platform already ships, single-implementation interfaces,
factories with one product, wrappers that only delegate, dead flags and config,
hand-rolled stdlib.

## Output

One line per finding, ranked: `<tag> <what to cut>. <replacement>. [path]`.
End with `net: -<N> lines, -<M> deps possible.` Nothing to cut: `Lean already. Ship.`

## Boundaries

Behavior, edge, and failure tests that catch real regressions are not bloat.
Keep meaningful mutation evidence when existing red-green checks do not already prove the
risky behavior; mutation evidence is optional when they do. Never flag useful
evidence only to make the test tree smaller. Every proposed simplification must
preserve behavior; a separate correctness/security audit is not this pass.

Scope: over-engineering and complexity only. Correctness bugs, security holes,
and performance are explicitly out of scope. Route them to a normal review
pass. Lists findings, applies nothing. One-shot — it sets no mode, so there is
nothing to revert. To act on the list, say "apply the findings"; the fixes then
follow the lazy ladder and the surgical-changes rule.
