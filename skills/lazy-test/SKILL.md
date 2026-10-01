---
name: lazy-test
description: >
  Test code as completely as the repo's own tools allow: static checks, unit,
  integration, end-to-end and browser (Playwright when it is the configured
  runner), edge cases, failure modes, contracts, lifecycle and concurrency,
  platform and security paths, plus a mutation probe. Adds rerunnable tests
  with the installed runner, runs them, and ends with what still needs manual
  testing and why it cannot be automated here. Use when the user says "test
  this fully", "test everything", "what needs manual testing", "lazy-test", or
  "/lazy-test". Never adds a dependency.
---

# lazy-test

Test the target in every way the repository can run, save what you add as
rerunnable tests, and finish with an honest list of what only a person can check.

## 1. Scope

Test what the user names. Otherwise test the task-owned diff against its base,
including untracked files. Otherwise ask; do not test the whole repo by default.
Before you change anything, record the starting state of the user's tree:
`git status` and the diff, or a file listing with checksums without Git.

Run every command that can write files, such as installs, builds, test runs,
snapshot updates, the mutation probe, and the old-code run, in a disposable copy
of the working tree as it is now, uncommitted and ignored files included, kept
in a private temporary directory that you delete on every exit. If the suite
cannot run from a copy, ask before running write-capable commands in place. In
the user's tree, only add the tests you keep and the snapshots they need.
Read the code under test and trace its callers, callbacks, retries,
restore/replay, and concurrent paths: a bug in a shared helper is tested through
the shared helper.

## 2. Inventory the tools

Detect which of TypeScript, JavaScript, Java, Python, Ruby, Rust, and Go the
target uses. Read each pinned or installed version from its toolchain file,
manifest, lockfile, or runtime and keep tests valid for the installed version.
If a needed version fact cannot be checked, say so and do not guess.

Find the runners, configs, fixtures, and CI jobs already in use: package
scripts, Makefile, pyproject, Cargo, go.mod, Gemfile, Maven/Gradle, workflow
files. Use them. Never add a dependency or a second runner. If a declared runner
is not installed yet, run the repo's documented locked install first; a tool
still missing after that goes in the report as a check that did not run. If
Playwright is the target's configured browser runner, it is the browser and
end-to-end tool: reuse its config and fixtures, locate by role, label, or text,
and use its web-first assertions. Otherwise keep the repo's own browser runner.
Install browsers only through the repo's documented setup.

## 3. Case list

Before writing tests, list each requirement and the cases that cover it. Apply
every layer below that fits the target; list a layer that does not apply
under **Not applicable** with its reason.

- **Static:** the project's type checker, linter, and build, as configured, and
  its formatter in check or dry-run mode only; with no such mode, the formatter
  goes under **Not run**. Never loosen them to get green.
- **Behavior:** each changed requirement, through its public entry point.
- **Edges:** empty, zero, false, null, boundaries and one past them, maximum
  sizes, duplicates, ordering, Unicode, whitespace, paths with spaces, time
  zones, DST, and locale where they apply.
- **Failure modes:** invalid input, thrown or rejected errors, timeouts, network
  or disk failure, permission denied, partial setup. Assert the error and the
  state left behind.
- **Contracts:** defaults, explicit false/zero/empty values, accepted input
  formats, public API shape, errors, and generated output stay as they were
  unless the task changes them.
- **Lifecycle and concurrency:** timers, listeners, cancellation, retries,
  double calls, races, and stale results; cleanup after success, failure, and
  cancellation. See [risk checks](../lazy/references/risk-checks.md).
- **Integration:** real collaborators where the existing tests use them; fakes
  only at true boundaries such as network, clock, and randomness. Never call a
  live payment, email, SMS, or other third-party account unless it is an
  isolated sandbox or the user approves; otherwise list that check under
  **Needs manual testing**.
- **End-to-end:** user flows through the browser, CLI subprocess, or HTTP API
  the project exposes, including keyboard use and accessible names.
- **Platform:** the OS and runtime matrix CI runs; path separators, line endings,
  and shell quoting. Run what this machine can; name the rest.
- **Security:** trust boundaries, injection, path traversal, redirects; values
  revalidated after parsing or persistence.
- **Regression:** for a bug, red → green — the same new test, run in an
  isolated copy holding only the old production code, fails on its intended
  assertion, then passes against the fix. A missing test or setup error is not
  red.

Performance is tested only against a stated budget or a real complexity risk;
do not add benchmarks.

## 4. Write the tests

Add tests beside similar ones and match their style. Keep them deterministic:
wait on conditions, not sleeps; fake clocks and seeded randomness. Each test is
independent of order. Drop tautologies and mock-call checks that only repeat
setup. When a test exposes a bug, keep the correct expectation and report the
failure; never edit an expectation to match broken behavior, and fix the code
only when that is in scope. Do not restructure code just to test it: one caller
is not a reason to inline, export, or split a function, and a framework contract
stays as it is.

## 5. Run and prove

Run every command non-interactively, never in watch mode, with a timeout that
fits the repo, and stop the servers, browsers, and workers it started on every
exit path. Run the new tests, then the affected suite, then the repo's fast
check for that target; widen to the whole repo only when that is its
established fast check or the user agrees. Record each command and its result.
Rerun a failure once: a second failure is real, and a pass on the retry is a
flaky failure, reported with both results under **Failures found**. Never skip,
disable, or weaken a test to get green.

Docs, config, and trivial edits need no mutation probe. For non-trivial
behavior, if existing red-green checks already prove the risk, mutation work is
optional; otherwise run a small meaningful mutation check: pick a test that
passes, leave it unchanged, flip one branch, boundary, operator, or return value
in the production code it exercises, confirm that test's intended assertion now
fails because of the mutation, revert, and confirm it passes again. A test that
already failed, or a mutation of the test itself, proves nothing. Mutate only
the disposable copy, never the user's tree, so an interruption cannot leave
broken code behind. Never add a dependency for it.

Before finishing test changes, read and apply
[TS/JS checks](../lazy/references/simplification-checks.md) to TS/JS and
[Python checks](../lazy/references/python-checks.md) to Python. For TS/JS, run
`node "<skills-dir>/slop-check/scripts/check.mjs" --since=HEAD` on uncommitted
changes, or with the task base ref instead of `HEAD` once they are committed,
and triage it. Without Git or a usable base, pass each changed path as a
separate quoted argument.

Before reporting, compare the user's tree with the starting state you recorded.
It should differ only by the tests you added, the snapshots they need, and
changes the task asked for. Never touch edits that were there before you
started; name any other change instead of reverting it.

## 6. Report

```
## Tested
| Layer | Cases | Command | Result |

## Failures found
<file:line — what failed, expected vs actual>

## Not run
<check — why it could not run here>

## Not applicable
<layer — why it does not apply to this target>

## Needs manual testing
- <what to check> — why: <reason it cannot be automated here> — how: <steps and expected result>
```

A case belongs under **Needs manual testing** only when automating it here is
not possible, for a reason such as:

- real hardware or devices: camera, printer, GPU, touch, mobile sensors;
- live third-party services, real credentials, payments, email or SMS delivery;
- visual or motion judgment beyond an assertion or screenshot diff;
- assistive technology output, such as a real screen reader, beyond automated
  accessibility checks;
- an OS, browser, or runtime this machine does not have;
- real network conditions, production data, or production-only infrastructure;
- install, upgrade, or migration on real user machines;
- usability, wording, or legal judgment that needs a person.

"Too much work" is not a reason: if the installed tools can check it, automate
it. An open spec or product question is not manual testing; list it under
**Failures found** as a question for the owner. If no case needs a person,
write `Needs manual testing: none.` and leave **Not run** as it is.

Never claim "fully tested" or an unrun check. Checks that did not run go under
**Not run**, not **Tested**.
