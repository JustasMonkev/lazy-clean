---
name: layz-test
description: >
  Find and reproduce bugs across applicable layers, add behavioral coverage, run the
  checks, and finish with manual testing steps and why automation cannot settle
  them. Use when asked to fully test code, assess test coverage, identify manual
  testing gaps, or invoke layz-test. Use existing tools; no benchmark framework.
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
   download tools or add a framework merely to measure this workflow.
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
| Static/build | Lint, types, compilation, packaging, public API compatibility. |
| Unit/property | Branches, boundaries, malformed input, invariants, generated cases. |
| Integration/contract | Real dependency boundaries, serialization, persistence, error semantics. |
| E2E/UI | Critical user flows, navigation, keyboard use, browser/device variants. |
| Resilience | Timeouts, retries, cancellation, races, partial failure, resource cleanup. |
| Security | Input validation, authorization, secret exposure, injection, unsafe paths. |
| Accessibility/visual | Automated accessibility checks and stable visual assertions; human usability gaps. |
| Performance | Existing budgets, realistic limits, leaks, and bounded resource use. |

## Execute and challenge

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
- Give external work a timeout and a bounded workload; clean up processes,
  listeners, timers, temporary data, and mutations on success and failure.
  Use isolated test data. Run destructive or costly external checks only within
  authorization; report missing prerequisites instead of inventing credentials.
- Prove a risky test can fail: reproduce a regression, or temporarily mutate a
  relevant branch/boundary and observe the expected assertion failure. Restore
  the exact source and rerun green. Do not count a setup/import failure as proof.
- Do not weaken assertions, skip failing cases, or change production behavior
  just to get green. Fix product defects only when the user has requested fixes
  for this task; a supplied file or diff is testing scope, not authorization to
  change production behavior. Otherwise retain the failing reproducer and report
  the defect. Separate pre-existing failures from new ones.
- Rerun affected checks after test edits. Review TS/JS changes with the installed
  slop checker when available; its clean result is not behavioral evidence.

## Finish with evidence and manual testing

Report the tested revision/worktree and environment, changed tests, the behavior
table, exact commands, exit status, assertion results, and evidence/log paths.
Before saving or sharing commands, results, logs, or evidence, redact credentials
and sensitive data. Use rerunnable placeholders and explicitly note each
redaction without exposing its original value.
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
