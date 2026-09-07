---
name: lazy-review
description: >
  Code review focused exclusively on over-engineering. Finds what to delete:
  reinvented standard library, unneeded dependencies, speculative abstractions,
  dead flexibility. One line per finding: location, what to cut, what replaces
  it. Use when the user says "review for over-engineering", "what can we
  delete from this diff", "is this over-engineered", "simplify review", or invokes
  /lazy-review. Complements correctness-focused review, this one only
  hunts complexity.
---

Review only the task-owned diff for unnecessary complexity. One line per
finding: location, what to cut, and what preserves the requested behavior. Cut
real slop, but do not manufacture a net-negative diff or delete required
features.

Detect which of TypeScript, JavaScript, Java, Python, Ruby, Rust, and Go the
diff actually touches. Read each pinned or installed version from its toolchain
file, manifest, lockfile, or runtime and keep replacements compatible. If a
needed version fact cannot be checked, say so and do not guess; check the latest
release only when the user asks for current-version advice.

One caller is never a finding on its own. Before `yagni:`, `shrink:`, or
`delete:`, check whether the function or file names a domain idea, hides tricky
logic, isolates a side effect or boundary, earns its keep in tests or
readability, or is required by a framework contract. Keep it separate when any
of those hold.

## Format

`L<line>: <tag> <what>. <replacement>.`, or `<file>:L<line>: ...` for
multi-file diffs.

Tags:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer that only forwards.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Examples

✅ `L12-18: stdlib: 7-line clamp helper where finite numbers and min <= max are already enforced. Math.min(Math.max(value, min), max), preserving the bounds.`

✅ `L4: native: moment.js for one en-US/UTC medium-date format. Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'medium' }), preserving the format contract.`

✅ `repo.py:L88: yagni: wrapper that only forwards to the single SQLite repository. Call it directly, preserving the transaction boundary.`

✅ `L30-34: shrink: wrapper passes arguments unchanged to parseInt with radix 10. Call parseInt directly, preserving the radix.`

KEEP `repo.py:L88: transaction helper owns rollback and is covered by a rollback test. Keep it even with one caller.`

## Scoring

End with `net: -<N> lines possible` only when findings remove code; otherwise
say `net: unchanged` when a required feature remains intact.

If there is nothing to cut, say `Lean already. Ship.` and stop.

## Boundaries

Scope: over-engineering and complexity only. Correctness bugs, security holes,
and performance are explicitly out of scope. Route them to a normal review
pass, not this one. Behavior, edge, and failure tests that catch a real
regression are not bloat. Keep meaningful mutation evidence when existing
red-green checks do not already prove the risky behavior; mutation evidence is
optional when they do. Do not flag useful evidence only to make the test tree
smaller. Every proposed simplification must preserve behavior; a separate
correctness/security audit is not this pass.
Does not apply the fixes, only lists them — say "apply the findings" and they
are applied under the lazy ladder and the surgical-changes rule. One-shot: it
sets no mode, so there is nothing to revert.
