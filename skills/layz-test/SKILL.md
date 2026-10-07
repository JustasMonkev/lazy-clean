---
name: layz-test
description: >
  Find and reproduce bugs across applicable layers, add behavioral coverage, run
  the checks, and finish with manual testing steps automation cannot settle.
  Use when asked to fully test code, assess coverage or manual gaps, or invoke
  layz-test. Use existing tools; no benchmark framework.
---

# layz-test

Test the requested scope thoroughly with the smallest useful checks. Never
claim exhaustive coverage, bug-free code, or release readiness from passing
tests. Keep this a one-shot testing workflow; do not change lazy mode or hooks.

## Map the behavior

1. Read repository instructions, requirements, affected code, callers, and
   existing tests. Use the requested files or diff; if none is given, inventory
   the repository's components and test suites. State the scope, revision,
   material assumptions, and completion criteria before running checks. Do not
   silently replace a whole-repository request with a sample.
2. Read pinned and installed tool versions and test commands from the project.
   Reuse its runner, fixtures, assertions, and installed dependencies. Do not
   download tools or add a framework merely to measure this workflow. For
   checks that rely on locked dependencies, use the repository's documented
   locked install in a disposable copy when permitted; otherwise report those
   checks as blocked.
3. Make a compact behavior → test → result table. Enumerate happy paths,
   boundaries (including false/zero/empty), invalid inputs, and failure modes.
   Trace retries, restore/replay, cancellation, concurrency, and cleanup where
   relevant. Derive expected results from requirements or established contracts;
   label unclear expectations rather than copying the implementation into tests.

Honor explicit exclusions, including requests for no security testing. Mark
excluded layers not run and do not execute them through a bundled suite.
Consider every remaining layer below. Run applicable checks; mark the others blocked,
not run, or not applicable with a concrete reason. Add domain-specific risks.

| Layer | What to check when applicable |
| --- | --- |
| Static/build | Lint, types, compilation, packaging, public API compatibility; formatters in check or dry-run mode. |
| Unit/property | Branches, boundaries, malformed input, invariants, generated cases. |
| Integration/contract | Real dependency boundaries, serialization, persistence, error semantics. |
| E2E/UI | Critical user flows, navigation, keyboard use, browser/device variants. |
| Resilience | Timeouts, retries, cancellation, races, partial failure, resource cleanup. |
| Security | Input validation, authorization, secret exposure, injection, unsafe paths. |
| Accessibility/visual | Automated accessibility checks and stable visual assertions; human usability gaps. |
| Performance | Existing budgets, realistic limits, leaks, and bounded resource use. |

## Execute and challenge

- Use the host's existing execution sandbox and permissions. Do not build or
  claim a new isolation boundary; a disposable copy is not a security sandbox.
- Use disposable copies for installs, mutation probes, old-code reproductions,
  and any command expected to write repository state, including snapshots,
  fixtures, and coverage. Prepare copies from a stable source revision or
  snapshot containing the requested inputs, including relevant uncommitted
  edits. Verify source bytes and behavior-relevant metadata, such as executable
  modes, against that captured state before execution; block checks whose
  required state cannot be captured or reproduced. Use independent regular
  source files, not links or Git metadata shared with the user's
  checkout. Do not follow links when preparing a probe; report checks requiring
  linked or special-file source inputs as blocked.
  Do not copy production credentials, user home state, or Git history and
  configuration into a probe. Use fixtures or sandbox credentials when needed.
  Record the tested revision and relevant uncommitted inputs or omissions. If
  required inputs or isolation are unavailable, report the check as blocked.
  Do not reconstruct user Git, home, or filesystem state or run destructive
  probes in place.
- Do not automatically copy generated files back. Apply test and snapshot
  changes through ordinary scoped edits after reviewing their contents,
  preserving existing user changes. If they cannot be applied safely, save a
  redacted patch and report the conflict. Keep redacted evidence the report
  cites outside disposable copies before deleting them, and report its path.
- Run existing relevant tests first. Add small, rerunnable tests for uncovered
  behaviors, including negative cases; use real code, not a copied algorithm.
  For a whole-repository request, work through the inventory and report every
  remaining component. Test count and line coverage alone do not prove behavior.
- Actively look for defects, not just passing coverage. Write concrete failure
  hypotheses from callers and contracts, then challenge them with boundaries,
  malformed input, generated cases, and adverse event ordering as applicable.
  Use an independent oracle or invariant; a test that repeats the implementation
  cannot establish correctness. Follow suspicious results through real callers.
- Confirm each bug with a minimal failing assertion on the unmodified code:
  record the contract, input or event sequence, expected and actual behavior,
  and affected caller. Separate confirmed defects from unclear requirements,
  environment failures, and synthetic mutations. If none is confirmed, say so
  and list the hypotheses tested; never invent a finding to meet a bug quota.
- Run commands non-interactively, never in watch mode. Give external work a
  timeout and a bounded workload. Keep setup services alive until their
  dependent checks finish. Run each command only where the host can manage its
  spawned process tree; otherwise report the check as blocked. Terminate that
  tree on success, failure, timeout, cancellation, and partial setup. Clean up
  listeners, timers, temporary copies, and mutations on those exits; report
  cleanup failures. Use isolated test data. Run destructive or costly external
  checks only within authorization; report missing prerequisites instead of
  inventing credentials. Never call a live payment, email, SMS, or other
  third-party account unless it is an isolated sandbox or the user approves;
  otherwise report it as blocked automation.
- Prove a risky test can fail: run the same new test, unchanged, in a disposable
  copy against the pre-fix product state needed for that behavior, including
  relevant dependency and configuration versions. Its intended assertion fails
  there and passes against the fix; if that state cannot be supplied, report
  regression proof as blocked. Alternatively, in a disposable copy, leave a
  passing test unchanged, mutate a relevant production branch/boundary, and
  observe that test's intended assertion fail; revert and rerun green. A
  mutation of the test itself or a setup/import failure is not proof.
- Do not weaken assertions, skip failing cases, or change production behavior
  just to get green. Fix product defects only when the user has requested fixes
  for this task; a supplied file or diff is testing scope, not authorization to
  change production behavior. Otherwise retain the failing reproducer and report
  the defect. Separate pre-existing failures from new ones.
- Compare the task-owned diff before reporting; preserve pre-existing edits and
  report other changes instead of reverting them. If source changed after
  testing, rerun affected checks or report the newer state as untested.
- Rerun affected checks after test edits. Review TS/JS changes with the installed
  slop checker when available; its clean result is not behavioral evidence.

## Finish with evidence and manual testing

Report the tested revision/worktree and environment, changed tests, the behavior
table, exact commands, exit status, assertion results, and evidence/log paths.
Before saving, applying, or sharing commands, results, logs, evidence, patches,
tests, or snapshots, redact credentials and sensitive data. Use rerunnable
placeholders and explicitly note each redaction without exposing its original
value. If redaction cannot produce usable content, report the affected output
as blocked.
Use **pass**, **fail**, **blocked**, **not run**, and **not applicable** explicitly.
Record skips and retries; a flaky pass does not erase an earlier failure. Never
describe a planned, empty, or blocked run as tested. State remaining coverage
and uncertainty even when every executed check passes.

End with **Manual testing still needed**:

| Check | Steps and expected result | Why automation cannot settle it here | How to enable automation, if possible |
| --- | --- | --- | --- |

Distinguish human judgment (usability, screen-reader experience, real hardware)
from an automatable check blocked by this environment (missing browser, service,
credentials, OS, or dependency). Give the exact blocker and a rerunnable command
or prerequisite for blocked automation; do not call it inherently manual. Do
not use generic manual checklists unrelated to the code. If no human checks
apply, say so and list blocked automation separately. Passing scoped tests
still leaves untested behavior; never write “nothing needs testing” without
evidence for the stated scope.
