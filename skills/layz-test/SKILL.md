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
   download tools or add a framework merely to measure this workflow. If the
   lockfile declares a runner that is missing, or the installed runner or its
   dependency graph does not match the lockfile, run the repository's
   documented locked install in the disposable copy before calling it blocked.
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
| Static/build | Lint, types, compilation, packaging, public API compatibility; formatters in check or dry-run mode, or write mode in the disposable copy when formatter output is under test. |
| Unit/property | Branches, boundaries, malformed input, invariants, generated cases. |
| Integration/contract | Real dependency boundaries, serialization, persistence, error semantics. |
| E2E/UI | Critical user flows, navigation, keyboard use, browser/device variants. |
| Resilience | Timeouts, retries, cancellation, races, partial failure, resource cleanup. |
| Security | Input validation, authorization, secret exposure, injection, unsafe paths. |
| Accessibility/visual | Automated accessibility checks and stable visual assertions; human usability gaps. |
| Performance | Existing budgets, realistic limits, leaks, and bounded resource use. |

## Execute and challenge

- Isolate every command that can write files, such as installs, builds, test
  runs, snapshot updates, mutation probes, and old-code reproductions. Nothing
  they do may change the user's tree, Git directories or refs, home, installed
  toolchains, or anything else outside a private temporary directory; where a
  rule below cannot guarantee that, ask first. A copy and redirected variables
  do not stop a command that writes to an absolute path or finds the original
  checkout, so run these commands under an OS-level sandbox that allows
  writes only inside the private directory, hides the original checkout (only
  the preparation clone may read it, read-only), and
  denies network access except to approved sandbox endpoints, and, as the
  platform allows, keeps host processes, IPC sockets such as Docker or D-Bus,
  devices, and the Windows registry out of reach; where none is available,
  ask first, and mark a run that read the original checkout
  unfaithful. The user's tree only gains the tests you keep, the snapshots they
  need, and production fixes the user asked for.
  - Read the source without changing access times (a read-only snapshot or a
    no-atime read); if that is not possible, ask first.
  - Record the starting state of the user's tree, with read-only Git commands
    (`GIT_OPTIONAL_LOCKS=0`, `-c core.fsmonitor=false`, diffs with
    `--no-textconv --no-ext-diff`, every configured `filter.<driver>.clean` and
    `.process` overridden with an empty value and `.required` set to `false`, or
    direct file reads instead of Git), with network access denied so a partial
    clone cannot lazily fetch missing objects (also set `GIT_NO_LAZY_FETCH=1`
    where the installed Git supports it); if an object is missing, read the file
    directly or report that state as unavailable. Record `git status`, the
    unstaged and staged diffs, copies of untracked files (only checksums for
    secrets), and checksums of every ignored file copied, or a checksum
    listing without Git. Include `HEAD`, the refs, reflogs, in-progress
    operation state, and repository config the tests read, and the file modes,
    hard-link groups, owners, timestamps, ACLs, and extended attributes they
    depend on. Keep these in a private temporary directory outside the
    repository and outside what isolated commands can read, and delete it on
    every exit once the final audit is done.
  - Run in a disposable copy of the working tree, uncommitted and ignored files
    included, in a private temporary directory deleted on every exit, on a
    filesystem with the same semantics as the source (case sensitivity, name
    limits, rename and locking behavior, file watching), or mark the checks
    that depend on those semantics unfaithful. Present the copy at a path
    equivalent to the source checkout (length, characters, depth, drive), or
    mark the checks that depend on the checkout path unfaithful. Leave out
    secrets such as `.env` files, keys, and production configuration; supply
    sandbox or user-approved replacements when the tests need them. Classify
    each path without following it before reading it: never read FIFOs,
    sockets, or device nodes; recreate them privately where supported, or mark
    the checks that depend on them unfaithful. Stop at mount points inside the
    tree: copy a mounted directory only from a user-approved snapshot of its
    intended contents, or mark the checks that depend on it unfaithful.
  - If the source is a Git worktree, give the copy independent Git metadata,
    never a `.git` file or `gitdir` that points back to the user's repository.
    Clear inherited Git path variables (`GIT_DIR`, `GIT_WORK_TREE`,
    `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`,
    `GIT_ALTERNATE_OBJECT_DIRECTORIES`) first. Clone with `--no-hardlinks`,
    `--no-checkout`, and `--dissociate`, with no shared or alternate object
    store, and run the clone and every Git command in the copy with hooks
    disabled (`core.hooksPath` set to an empty private directory) and the user's
    global and system config ignored (`GIT_CONFIG_GLOBAL` and
    `GIT_CONFIG_SYSTEM` set to an empty file), passing only the settings the
    tests need, such as an identity, with `-c`. When a repository hook is under
    test, point `core.hooksPath` at the copy's own hooks, never the user's.
    Remove the clone's remotes, or point them at private repositories inside the
    temporary directory. Do not check out: copy the user's working-tree bytes
    into the clone so no smudge filter or other conversion helper runs, then
    recreate the index, unstaged changes, untracked files, `HEAD` (the same
    branch, or the same detached commit), and the refs the tests read (local
    branches, tags, custom refs, stashes, and their reflogs) separately, along
    with any in-progress merge, rebase, cherry-pick, revert, or bisect state
    (`MERGE_HEAD`, `CHERRY_PICK_HEAD`, the sequencer and rebase directories), or
    mark the checks that depend on it unfaithful. Replay the repository and
    worktree config settings the checks read (`git config --local` and
    `--worktree`), replacing credentials such as authenticated remote URLs or
    `http.extraHeader` with sandbox or user-approved values, or mark the checks
    that need them unfaithful. If a left-out secret is in any of the clone's
    objects, reachable or not, purge those objects and the refs that carry them,
    or treat the target as unable to run safely from a copy. Give each
    initialized submodule and every other nested repository the same independent
    metadata and state, or mark the checks that depend on it unfaithful. A
    non-Git source stays without Git.
  - Reapply the file modes, owners, timestamps, ACLs, and extended attributes
    the tests depend on, and recreate hard-link groups among copied files. If
    the source state, Git or filesystem, cannot be reproduced faithfully, treat
    the target as unable to run from a copy. Before running checks, compare the
    completed copy with the baseline and refresh it if they differ.
  - Keep symlinks as symlinks; if one points outside the repository, ask before
    running write-capable commands through it. Retarget an absolute link into
    the repository to the same path in the copy. If the checks read its target,
    snapshot the target into the private directory and point the copy's link
    at the snapshot, or compare the target again before reporting and mark the
    run unfaithful if it changed.
  - Point temp and cache locations inside the private directory (`TMPDIR`,
    `TMP`, `TEMP`, and the tools' cache variables). If the behavior under test
    depends on those locations, keep them equivalent in the private directory
    or treat the target as unable to run faithfully from a copy. Give every
    isolated command a private home (`HOME`, `USERPROFILE`, app-data
    variables), so files such as `.npmrc`, `.netrc`, or cloud credentials stay
    out of reach; expose only required, user-approved home state read-only, and
    keep installed toolchains reachable read-only or as a private copy, never
    through a writable path into the user's toolchain state such as
    `RUSTUP_HOME`. Ask before a command writes to any other path or shared
    service outside the private directory.
  - Before deleting the copy, move every redacted artifact the report cites,
    from passing or failing runs (logs, traces, screenshots, coverage), to a
    private evidence directory.
  - When copying kept tests and snapshots back, compare each destination with
    its baseline and its current state; if it changed since the copy was made,
    merge the change or report a conflict instead of overwriting it. Recheck the
    destination immediately before an atomic rename into place, and report a
    conflict if it changed in between.
  - If the suite cannot run from a copy, ask before running write-capable
    commands in place. When approved, ask the user to pause other edits to the
    tree and to every Git directory it shares with other worktrees from before
    the backup until restoring is done, and back up the tree first, classifying
    paths, never reading special files, and stopping at mount points as for the
    copy, into a location the command cannot read or write: bytes, file modes,
    symlink targets, which paths exist, hard-link groups, owners, timestamps,
    ACLs and extended attributes where the platform has them, and the Git
    directories the tree points to (`git rev-parse --absolute-git-dir` and
    `--git-common-dir`). Keep mounted paths out of the command's reach unless
    the user approves them. Record what the command changed, verify the backup,
    restore from it only paths that still hold exactly that result, rechecked
    immediately before an atomic replacement, and report any other change as a
    conflict. Delete those backups on every exit once restoring is done; keep
    one only for an unresolved conflict, and say where.
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
  timeout and a bounded workload. Keep a service a setup command starts alive
  until the tests that depend on it finish, then stop every process tree the
  scenario started and clean up listeners, timers, temporary data, and
  mutations on success, failure, cancellation, and partial setup.
  Use isolated test data. Run destructive or costly external checks only within
  authorization; report missing prerequisites instead of inventing credentials.
  Never call a live payment, email, SMS, or other third-party account unless it
  is an isolated sandbox or the user approves; otherwise report it as blocked
  automation that needs a sandbox or approval. Run isolated commands with an
  allowlisted environment: drop inherited credentials, tokens, and agent
  sockets such as `SSH_AUTH_SOCK`, and add back only sandbox or user-approved
  credentials. Keep the non-secret variables the behavior depends on, such as
  locale, `TZ`, `CI`, and feature flags, or report the affected checks as
  unfaithful.
- Prove a risky test can fail: reproduce a regression by running the same new
  test, unchanged, against the complete old non-test product state (code,
  generated files, schemas, lockfiles, configuration, and dependencies freshly
  installed from the old lockfile, or report the proof blocked if that graph
  cannot be restored) in the disposable copy,
  where its intended assertion fails, then passing against the fix; or, in the
  copy, leave a passing test unchanged, mutate a relevant production
  branch/boundary, and observe that test's intended assertion fail; revert and
  rerun green. A mutation of the test itself or a setup/import failure is not
  proof.
- Do not weaken assertions, skip failing cases, or change production behavior
  just to get green. Fix product defects only when the user has requested fixes
  for this task; a supplied file or diff is testing scope, not authorization to
  change production behavior. Otherwise retain the failing reproducer and report
  the defect. Separate pre-existing failures from new ones.
- Before reporting, confirm the user's tree differs from its starting state only
  by the tests you added, the snapshots they need, and requested changes; name
  any other change instead of reverting it. If tested source, its metadata, or
  the refs the tests read changed after the copy was made, refresh the copy
  and rerun the affected checks, or report the newer state as untested. If a
  command rewrote tested production files inside the copy, such as a pretest
  code generator, report it and rerun from the intended state, or report that
  state as untested.
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
