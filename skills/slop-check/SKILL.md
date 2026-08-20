---
name: slop-check
description: Detect and remove AI slop — pointless, low-evidence, or filler code — in TypeScript and JavaScript. Use after writing or editing TypeScript or JavaScript, when reviewing a diff or pull request, or whenever the user asks to check for slop, clean up AI-generated code, or run slop-check. Fully self-contained; runs with plain node and requires no npm packages or project configuration.
---

# slop-check

Find and remove code that exists to look helpful rather than to do something: fabricated type evidence, defensive filler, narration comments, and edit-artifacts that AI assistants commonly leave behind.

Everything runs from this skill directory with plain `node`. Do not install any npm package, copy files into the repository, or modify lint configuration to use it.

## Procedure

1. Run the bundled checker on the code in question:

   ```bash
   node <skill-directory>/scripts/check.mjs [paths...]
   ```

   - With no paths it scans the current directory recursively (skipping `node_modules`, build output, and agent tooling directories).
   - To check only your own changes, pass the changed files: `node <skill-directory>/scripts/check.mjs $(git diff --name-only --diff-filter=d HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.mts' '*.cts')`. `--diff-filter=d` drops deleted paths: without it a deletion-only change hands the checker a pathname that no longer exists, and the run exits 2 as `scan incomplete` with nothing wrong.
   - `--json` prints machine-readable findings; `--summary` replaces the finding list with the per-rule tally (the run summary line still prints). Exit code 1 means findings exist, 2 means a path could not be read, 0 means clean.
   - `--since=<git-ref>` keeps only findings on lines the diff against that ref added — `--since=HEAD` before a commit, `--since=origin/main` in CI — which is how an existing codebase adopts the checker without a baseline file.
   - The checker reads TypeScript and JavaScript only. For any other language skip step 1 and treat the manual checklist below as the whole procedure — never report "clean" on the strength of a scan that read nothing.

2. Triage every finding. The checker is heuristic, so findings are review prompts, not verdicts:
   - Fix real slop by removing the pointless code or restoring real type evidence — prefer inference, `as const`, `satisfies`, named owner contracts, and parsing at the boundary.
   - A justified type assertion needs a `// SAFETY:` comment stating the checked invariant immediately before it.
   - A justified swallowed error needs a comment inside the catch block explaining why.
   - If a finding is a genuine false positive, leave the code alone and say so briefly. Never rewrite correct code into something worse just to silence the checker, and never weaken or disable a check.

3. Apply the manual review checklist below to the same code. These are the highest-value slop patterns that a mechanical scan cannot catch.

4. Report what was found, what was fixed, and any findings intentionally left in place with the reason.

## Languages and versions

Detect which of TypeScript, JavaScript, Java, Python, Ruby, Rust, and Go the project actually uses, and read each pinned or installed version from its toolchain file, manifest, lockfile, or runtime. Before version-sensitive advice, check that language's latest stable release at its official source, say whether the project is current, and suggest only what the version in use supports. If the latest release cannot be checked, say so and do not guess.

## Manual review checklist

For each item, the question is the same: does this code earn its place, or does it only exist because generating it was easy?

- **Dead code shipped "just in case"** — unused exports, unused parameters, branches no caller can reach, commented-out code. Delete it; version control remembers.
- **Speculative generality** — config options, flags, or abstraction layers nobody asked for. One caller alone is not evidence: keep a helper separate when it names a domain idea, hides tricky logic, isolates a side effect or boundary, earns its keep in tests or readability, or is required by a framework contract. Inline only when separation has none of that value.
- **Defensive checks against impossible states** — `if (!items) return` when the type says `items: Item[]`; re-validating data already validated upstream; optional chaining on values that cannot be null. Trust the types, or fix the types.
- **Reimplementing the platform** — hand-rolled `deepClone`, `debounce`, `isEmpty`, UUID generators, date formatting. Use the standard library or an existing project utility.
- **Error handling that hides errors** — catch-log-continue, retries around non-transient failures, fallback values that turn failure into silently wrong behavior.
- **Debug leftovers** — `console.log` tracing, timing code, temporary variables named `test`/`tmp`/`debug`.
- **Edit-artifacts** — old and new versions of a function both kept, re-export aliases "for compatibility" when every call site could just be updated, comments describing the diff instead of the code.
- **Comment and doc bloat** — JSDoc that restates the signature, section banner comments, README additions narrating the change. A comment should state a constraint the code cannot show.
- **Test slop** — tests that assert a mock was called with the value it was just given, module-level mocks instead of real dependency seams, duplicated setup that hides what varies. Keep a mutation test when it fails after the covered logic is changed.

## Checker rules

Type evidence: `no-any`, `no-chained-type-assertions`, `no-unknown-alias`, `no-object-type`, `no-unsafe-dictionary-type`, `no-known-value-widening`, `no-empty-type-declaration`, `no-reflect`, `no-shape-in-symbol-names`, `require-safety-comment-for-type-assertion`.

Pointless code: `no-useless-rethrow`, `no-empty-catch`, `no-catch-fake-success`, `no-log-and-rethrow`, `no-message-only-rethrow`, `no-json-clone`, `no-redundant-fallback`, `no-boolean-literal-compare`, `no-boolean-literal-ternary`, `no-boolean-return-branches`, `no-double-negation-condition`, `no-await-promise-resolve`, `no-promise-constructor-wrapper`, `no-conditional-empty-object-spread`, `no-let-if-else-assign`, `no-foreach-push`, `no-slop-symbol-names`.

Faked behavior and test slop: `no-arbitrary-sleep`, `no-env-secret-fallback`, `no-module-mocking`, `no-tautological-assertion`.

Comment slop: `no-filler-comments`, `no-narration-comments`, `no-change-note-comments`, `no-backcompat-comments`, `no-restating-comments`, `no-obvious-doc-comments`, `no-typed-jsdoc`, `no-unjustified-suppression`, `no-emoji`.
