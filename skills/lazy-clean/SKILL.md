---
name: lazy-clean
description: Write clean minimal code — the lazy ladder while writing, the slop-check checker after. Use when the user wants BOTH passes on one change, says "lazy-clean", asks for code that is lazy and slop-free, or wants over-engineering and AI slop caught together. For the ladder alone use lazy; for the checker alone use slop-check.
---

# lazy-clean

Two passes over one change: build the minimum complete result, then cut slop
from the task-owned diff.

## 1. While writing — the lazy ladder

Follow `<skills-dir>/lazy/SKILL.md` as written: think first, climb the ladder
(YAGNI → reuse → stdlib → platform → installed dep → clear minimum code), and
verify the goal before shipping. Do not restate the rules here; read that file.

If your context already carries a `LAZY MODE ACTIVE` header, the ruleset is injected and you are following it; otherwise read that file now. Intensity is `/lazy lite|full|ultra`.

## 2. After writing or editing TS/JS — the checker

```bash
node <skills-dir>/slop-check/scripts/check.mjs <changed files>
```

`--json` for machine-readable findings. Exit code 1 means findings exist.

Triage every finding per `<skills-dir>/slop-check/SKILL.md`:

- Fix real slop — delete the pointless code, restore real type evidence.
- Keep a justified type assertion only with a `// SAFETY:` comment naming the checked invariant.
- Keep a justified swallowed error only with a comment inside the catch saying why.
- A genuine false positive stays as-is; say so briefly. Never rewrite correct code to silence the checker, and never weaken or disable a check.

Apply the manual checklist — dead code, speculative generality, reimplemented
platform, and edit-artifacts — to the task-owned diff. Report only findings that
matter; this is a review pass, not a demand for extra prose or a net-negative
feature change.

The checker reads TypeScript and JavaScript only. Java, Python, Ruby, Rust, and Go
get the same manual pass by hand — never report them clean on the strength of a
scan that did not read them. For every language the change actually touches,
read its pinned or installed version from the toolchain file, manifest, lockfile,
or runtime and keep replacements compatible. If a needed version fact cannot be
checked, say so and do not guess; latest-version research is only needed when
the user asks for current-version advice.

One caller alone is not a reason to inline or delete a function or file. Keep it separate when it names a domain idea, hides tricky logic, isolates a side effect or boundary, earns its keep in tests or readability, or is required by a framework contract. Inline or delete only when none of those hold.

## Manual simplification pass

Before finishing a TypeScript or JavaScript change, read and apply [TS/JS simplification checks](../lazy/references/simplification-checks.md). It is a concise pre-finish review with small before/after examples: infer obvious local types without `any` or bypass casts, normalize arguments once, handle returned errors directly, and compare lifetimes, callers, and error/cancellation/cleanup semantics before replacing or deleting code. Keep useful domain helpers and explicit multi-step control flow. Its TS/JS examples are illustrative; other languages keep their own syntax and idioms.

## Tests that earn their place

List the changed behavior, its edge cases, and its failure modes, and cover each
one. Use the repo's existing test tools. Keep tests that can catch a real
regression; drop tautologies and mock-call checks that only repeat setup. When
existing red-green checks already prove the risky regression, mutation work is
optional; otherwise a small meaningful mutation check can confirm the test
earns its place. Never add a dependency for it.

## When the manual run is needed

Edit hooks give quick feedback, not final coverage. Before finishing, run from
the repo root, even if those hooks ran:

```bash
node "<skills-dir>/slop-check/scripts/check.mjs" --since=HEAD
```

This includes tracked changes, new untracked files, and edits made through shell
commands. Use the task base ref if its changes are already committed. Findings
can include pre-existing user edits: triage only your task's scope. Without Git,
pass changed paths as separate quoted arguments. Exit 2 means the scan failed;
report that, never claim it was clean.

## Preserve input contracts

For new input formats, implement the specified contract without inventing extra
formats. For existing parsers, preserve accepted formats unless the task changes
them. An omitted detail in a new task is not permission to reject inputs that
already worked. Preserve explicit false/zero/empty values. Revalidate after a
trust boundary without changing that contract.

## Order matters

Ladder first. The checker finds slop in code that exists; the ladder stops the code from being written at all, and code never written has no findings.

## Upstream comparisons and ports

When asked to compare or reuse upstream changes, read
[upstream updates](references/upstream-updates.md) and the repository's
`UPSTREAM.md` if present. Preserve local behavior and record partial adaptations;
a reviewed upstream revision is not proof of a pristine merge base.
