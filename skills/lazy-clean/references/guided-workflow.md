# Guided implementation

The caller is the coordinator and integration owner. Run this procedure directly;
workers execute only their assigned stage, never recursively invoke the whole
workflow. Use the host's available agent tools, not a new orchestration service.

## Delegation contract

Use multiple agents for distinct jobs, not repeated votes on the same diff.
A non-trivial implementation normally uses a contract challenger, one or more
implementation workers, an independent verifier, a code reviewer, a test-quality
reviewer when tests change, and a final judge. Test fixes may add a fresh fixer
and test-change judge through lazy-quality-review. Queue waves within the host's
actual concurrency limit; no fixed agent count or required model tier.
For a trivial change combine planning and implementation in the coordinator,
while retaining a separate verification/review pass. Honor an explicit no-agent
constraint; explain which independent gates cannot be established in that case.

Give each agent a compact, self-contained assignment containing:

- Role and concrete result; repository root and applicable instruction/skill paths.
- User contract and acceptance checks, task base and relevant uncommitted state.
- Owned files/resources, exclusions, edit authority, dependencies, and known commands.
- Draft-only PR policy: no ready-for-review creation, marking ready, merging, or
  direct pushes to main/the default branch, including by delegated workers.
- Evidence to return: inspected state, changes/findings with locations, exact
  checks and results, unresolved requirements, and cleanup status.

Tell workers they are not alone: preserve others' edits and request coordination
before touching another owner's files. Assign one writer for each shared
manifest, lockfile, generated output, fixture, integration point, and mutable
external resource. Shared checkout writes require disjoint ownership; serialize
dependent edits and checks that share output. Worktrees do not isolate services.

Use fresh-context agents for independent review and judgment (for example,
`fork_turns: "none"` when supported). Supply contracts, raw artifacts and source
state, not the author's transcript, preferred verdict, or desired deletion count.
Give navigation hints as leads, not conclusions. Independent means they inspect
and reason themselves; different names in the same conversation are not enough.
If delegation is unavailable, continue authorized implementation and local checks,
return a self-contained handoff for missing independent stages, and label them
unverified. Never invent agents or substitute a self-review as independent proof.

## A. Establish the finish

Capture the starting revision and relevant working changes without resetting or
stashing unrelated work. Read repository instructions and use workspace search
to find existing implementations and affected callers before broad file reads.
Identify the public entry point, data shape, accepted values, failures, state
ownership, and lifecycle paths that the request changes.

Keep a compact requirement → observable check → owner → result record in working
context, alongside exclusions and open questions. No mandatory tracking file.
Use examples from the real request, including the riskiest edge/alternate path.
Run the relevant existing baseline checks; separate existing failures from new
ones. A missing runner or failing setup is not a behavioral red test.

Give a read-only contract challenger the request and relevant code to identify
missing requirements, incompatible assumptions, available reuse, and risky
boundaries. Resolve evidence-backed issues before assigning dependent work.
Ask the user only about a decision that cannot be inferred and blocks correctness;
continue independent work while waiting. Report a short step → check plan.

## B. First make it work

Split by verifiable behavior, not arbitrary file counts. Set contracts and one
integration owner before parallelizing independent slices. Each implementation
worker owns its slice and regression tests; a single coupled change needs one
writer, not several agents editing the same function.

For each slice: establish a failing user-visible check, confirm why it fails,
implement the smallest complete change, and rerun it. Preserve unrelated tests
and user edits. Test the public path, not a duplicate implementation or mocks
that erase the behavior under test. For refactors pin current behavior first.
Build a helper tool only when repeated concrete work earns it, after one verified
manual example; do not create infrastructure just because the work is unfamiliar.

Integrate finished slices in dependency order. Check cross-slice behavior using
the actual combined implementation. If two attempted fixes fail the same gate,
state their shared premise, identify which actors own the affected state or
responsibility, and challenge that assignment before a third patch. Reproduce
and fix the cause rather than add a guard that hides it.

## C. Then make it right

Wait for all writers to finish and establish a stable integrated candidate,
identified by revision plus the exact task diff/untracked inputs or an isolated
snapshot. Do not run a verdict-producing review against files still changing.
Assign these independent read-only jobs in parallel when resources permit:

| Role | Required evidence |
| --- | --- |
| Verifier | Run relevant existing checks on the candidate; exercise the public workflow, edge cases, errors, and cleanup. Map results to the requirement record; identify missing rerunnable coverage and manual-only checks. |
| Code reviewer | Inspect the task-owned diff and affected callers for correctness, boundary/lifecycle defects, regressions, and removable complexity. Return concrete counterexamples and locations, not scores. |
| Test-quality reviewer | For added/changed tests, execute stage 1 of lazy-quality-review, with that skill and test-quality-review as instructions. Report what the assertions actually prove and retain useful coverage. |

The coordinator owns [lazy-quality-review](../../lazy-quality-review/SKILL.md)'s
reviewer → authorized tests-only fixer → change-judge pipeline; do not start a
second duplicate test audit. Its fresh fixer owns only tests, with production
writers paused. A strengthened test exposing a real bug goes back to the
implementation owner; never loosen the expectation or let a tests-only worker
silently patch production. After production fixes, rerun affected verification.

Use [lazy-mutation](../../lazy-mutation/SKILL.md) when selected risks need a
fault challenge or the user requests one. Its worker owns an isolated probe,
not this checkout. Preserve its baseline/mutant/restoration evidence; invalid
mutants and timeouts do not count as kills. No universal mutation-score target.

Reconcile findings against code and contract, not agent majority. Record accepted
fixes, evidence-backed dismissals, and unresolved items. Assign fixes to their
owners, establish the updated candidate, and invalidate affected earlier results.
Rerun relevant checks and review changed areas/new evidence, not unchanged code
for reassurance. Run the final language/static checks from SKILL.md too.

## D. Practice and final judgment

Keep a concise decision/evidence log in working context: meaningful decisions,
changes, checks, unresolved findings and reasons. Do not narrate every tool call.
Keep bulky output in local artifacts when useful and pass paths plus summaries;
carry scope, ownership, candidate state, and unfinished gates through handoffs.

Give a fresh final judge the original request, starting state, final integrated
candidate, task diff, requirement/check record, and raw check evidence. It reads
the actual changes and verifies that requested behavior, preserved contracts,
findings, and reported checks agree on the same state. It is not a second
whole-suite test audit and must not accept worker summaries as proof.

Compare task-owned additions across all slices for duplicated functions, helpers,
and domain rules, including equivalents already available in the project. Trace
callers and contracts before recommending reuse: share logic when it represents
the same rule that should change together, not merely similar-looking code.
Report concrete locations and the smallest compatible consolidation; do not
invent abstractions to reduce line count or refactor unrelated duplication.
Route justified consolidation to one owner and recheck every affected caller.

Require one outcome: complete, concrete in-scope fixes needed, or blocked/unverified with
missing evidence. Fix concrete defects through the appropriate owner and repeat
only affected gates; a deadline or review budget does not erase a required fix.

Close task-created agents and stop their timers/processes after success, failure,
or cancellation. Remove only disposable artifacts this task owns when no
retained evidence depends on them. Never delete another worktree or uncommitted
work to tidy up. Commit, push, publish, or deploy only within the user's actual
authorization. When PR creation is authorized, use a feature branch and explicitly
request draft creation (for example, `gh pr create --draft`). Inspect the returned
PR state to confirm it is a draft before reporting success. If resuming an existing
PR, inspect its state; do not create a duplicate or silently change its readiness.
Report an existing non-draft PR as outside the draft-only delivery contract. Never
mark a PR ready, merge it, or push directly to main/the default branch. If the
host cannot create or verify a draft, report that delivery stage blocked; do not
fall back to a normal PR. Include this restriction in every delegated handoff.

Return what changed/replaced, requirement coverage, exact checks run and results,
independent roles completed, unresolved/manual checks, and evidence locations.
Distinguish observed behavior from reviewer opinion; do not promise correctness
beyond the checked contract. The user should not have to invoke another skill to
finish a stage the coordinator can complete within the existing authorization.
