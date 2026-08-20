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

Review diffs for unnecessary complexity. One line per finding: location, what
to cut, what replaces it. The diff's best outcome is getting shorter.

Detect which of TypeScript, JavaScript, Java, Python, Ruby, Rust, and Go the
diff actually touches, and read each pinned or installed version from its
toolchain file, manifest, lockfile, or runtime. Before version-sensitive
advice, check that language's latest stable release at its official source and
keep the replacement valid for the version in use. If the latest release cannot
be checked, say so and do not guess.

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

❌ "This EmailValidator class might be more complex than necessary, have you
considered whether all these validation rules are needed at this stage?"

✅ `L12-38: stdlib: 27-line validator class. "@" in email, 1 line, real validation is the confirmation mail.`

✅ `L4: native: moment.js imported for one format call. Intl.DateTimeFormat, 0 deps.`

✅ `repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second one exists.`

✅ `L52-71: delete: retry wrapper around an idempotent local call. Nothing replaces it.`

✅ `L30-44: shrink: manual loop builds dict. dict(zip(keys, values)), 1 line.`

## Scoring

End with the only metric that matters: `net: -<N> lines possible.`

If there is nothing to cut, say `Lean already. Ship.` and stop.

## Boundaries

Scope: over-engineering and complexity only. Correctness bugs, security holes,
and performance are explicitly out of scope. Route them to a normal review
pass, not this one. A single smoke test or `assert`-based
self-check is the lazy minimum, not bloat, never flag it for deletion — and a
mutation test that fails after the covered logic is changed has earned its lines.
Does not apply the fixes, only lists them — say "apply the findings" and they
are applied under the lazy ladder and the surgical-changes rule. One-shot: it
sets no mode, so there is nothing to revert.
