---
name: lazy-mutation
description: Challenge test effectiveness with targeted production mutations and public-entry-point checks. Use for "lazy mutation", mutation testing, or proving a test catches a specified behavioral fault. Not a general test-suite audit or routine test run.
---

# Lazy Mutation

Prove that a test detects a concrete contract violation, not merely that the
suite runs. This is a scoped, one-shot workflow; it does not change lazy mode,
hooks, dependencies, or runner policy.

## Select the contract

Use the requested behavior, files, or diff. If scope is absent, use the current
task-owned change; ask for scope when neither exists. List the selected risks
and completion criteria before executing. A small challenge is not a whole-suite
mutation score.

Read the public entry point, its callers, and the tests that claim to protect it.
For wrappers and adapters, ask: **Would this test still pass if the wrapper were
replaced by its underlying dependency?** Bypass only behavior the wrapper is
required to add; transparent delegation can itself be the contract.

Choose a plausible fault and predict the named test and observable assertion
that should fail. Examples: ignore a public option, return live data instead of
persisted data, drop a required header, or skip cleanup. Prefer assertions about
status, headers, bytes, fallback behavior, persistence, and resource lifecycle as
applicable. Keep the real public-to-implementation mapping in the exercised path;
mocking away that mapping cannot prove it.

Reuse an existing mutation runner if it provides the evidence below. Otherwise
use the existing test runner and a small temporary patch; add no dependency.
Already-recorded red-green evidence for the same risk can satisfy incidental
verification. An explicit mutation request still calls for mutation evidence;
do not substitute an old-code run without saying so.

## Prepare an isolated probe

Capture the exact requested source state, including relevant uncommitted inputs,
and identify it in the report. Work on independent regular files in a disposable
copy, not the user's checkout, shared Git metadata, or linked source files.
Verify copied bytes and relevant executable modes against that snapshot.
Keep production credentials and user-home configuration out of the probe;
use the project's supported test setup and locked dependencies where needed.
If the required state cannot be reproduced, mark that check blocked.

A disposable copy is not a security sandbox. Stay within the host's permissions
and authorized test services. Bound commands and manage their process trees;
stop them and clean temporary state on failure, timeout, cancellation, and
success. Preserve redacted evidence outside the copy before removing it.
Never restore the user's files with reset/checkout commands.

## Run the challenge

For each selected fault, keep the test, fixtures, runner settings, and assertions
unchanged throughout this sequence:

1. **Baseline:** run the selected test on the captured source and require its
   assertions to execute and pass. A skipped or empty run is not a baseline.
2. **Mutation:** change only the production branch or boundary under test.
   Confirm the patch applied to the intended code. Rebuild required generated
   or native artifacts and verify the test loads that copy, not stale output or
   an installed package from elsewhere. Run the same test and inspect its
   actual assertion result, not just the command exit code.
3. **Restoration:** restore the copied production source in a finally/cleanup
   path, rebuild affected artifacts, verify restoration against the captured
   state, and rerun the same test to a passing result. Incomplete restoration
   leaves the challenge unverified even when an assertion failed.

Classify each challenge:

- **Killed:** the intended behavioral assertion fails under the fault, with
  passing baseline and restored runs.
- **Survived:** the valid, behavior-changing fault reaches the tested path and
  the test still passes. Explain the missed observable behavior.
- **Invalid:** syntax, compilation, setup, import, or unrelated assertion failure;
  an equivalent mutation or one outside the claimed contract is not a test gap.
- **Inconclusive/blocked:** missing prerequisites, uncertain execution, flakes,
  or incomplete restoration. A timeout alone is not proof of a kill.

## Respond to the result

A survivor is a coverage candidate, not automatic permission to rewrite or
delete tests. With test-edit authorization, add or strengthen the smallest
rerunnable public-contract test, then repeat the entire sequence with that test
fixed across all three runs. Without it, report the proposed check. Never alter
an expectation merely to kill a mutant or weaken it to obtain a baseline pass.

Keep synthetic faults separate from real defects found on unmodified production.
Report those with a reproducer; fix production only within the user's task.
Apply reviewed test changes as ordinary scoped edits, not by copying the probe
back wholesale. Stop when the selected risks are accounted for; broader testing
or a deletion campaign belongs to a separate task.

Report **contract → fault → test/assertion → baseline/mutant/restored results**,
the tested source state, exact commands, evidence paths, cleanup outcome, and
remaining uncertainty. Claim only the behaviors actually challenged.

## Related workflows

- [layz-test](../layz-test/SKILL.md): broad testing and real-bug reproduction.
- [test-quality-review](../test-quality-review/SKILL.md): review test value and
  recommend changes; it does not execute this workflow during read-only review.
- [lazy-verify](../lazy-verify/SKILL.md): separate engine-based fix/preserve evidence.
