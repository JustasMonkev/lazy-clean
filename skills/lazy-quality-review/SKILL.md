---
name: lazy-quality-review
description: Coordinates independent test-quality review, fresh-context tests-only fixes, and a final judge. Use for "lazy quality review", removing tautological tests, or the changed-tests quality pass in lazy-clean. Not a general code review or test runner.
---

# Lazy Quality Review

Review what tests prove, apply authorized tests-only improvements, then independently
judge the actual changes. This is a one-shot workflow, not a lazy level or an
automatic detector. Do not change mode, hooks, dependencies, or runner settings.

## Scope and authority

Use the requested suite or change. When called from `lazy-clean`, explicitly scope
the review to tests added or changed by the current task and identify its base
revision or captured starting state. Read older tests and production contracts
for context without expanding into unrelated cleanup. A standalone invocation
without narrower scope uses the whole-suite default of `test-quality-review`.

Review-only requests stop after the review report. Apply findings only when the
user has authorized test edits, including edits within an implementation task's
scope. Do not ask again for authorization already established in the session.

Keep a stable before-state, the reviewed scope, check results, and unresolved
findings available for handoffs. Use the repository's existing tools and preserve
unrelated edits. A smaller suite or a passing runner is not a quality verdict.

## 1. Independent reviewer

Start a fresh-context reviewer with the scope, relevant repository instructions,
and [test-quality-review](../test-quality-review/SKILL.md). The reviewer reads
the subject and contract, reviews every in-scope test, and reports only.

Require the self-contained findings and coverage record that skill specifies:
actual guarantee, concrete faulty-subject or allowed-refactor counterexample,
recommended action, and useful coverage to retain. Do not supply a desired
deletion count, generator labels, or previous benchmark verdicts.

If no actionable findings remain, report the reviewed scope and checks; no fixer
or change judge is needed. If edits are not authorized, return the report only.

## 2. Fresh-context fixer

Give a different fresh-context agent the report, current files, scope and base,
and [fixer instructions](../test-quality-review/references/fixer-handoff.md),
not the reviewer's conversation. That agent verifies findings before applying
tests-only changes and runs relevant checks before and after.

Delete only wholly valueless tests without replacement; preserve useful checks
in mixed tests. Strengthen weak oracles rather than treating them as valueless.
Consolidation must preserve the actual scenario in an equivalent or stronger
check, not merely another test with a similar name. Returning a collaborator's
value, schema checks, errors, and awaited completion can be real contracts.

Keep the fixer's deletion ledger and any exposed production-bug reproducer.
Do not fix production or weaken expectations to make a strengthened suite pass.

## 3. Independent change judge

Give another fresh-context agent the before/after files, scope, subject and
contract, and actual check evidence. It must judge the changes itself rather
than inherit the reviewer/fixer conversation or accept their recommendations as
ground truth. Reports can support its assessment, not replace inspection.

Have it account for every deletion or consolidation, useful coverage in mixed
tests, strengthened or still-weak oracles, and remaining in-scope tautologies.
It must check that production, runner configuration, skips, and unrelated work
are unchanged. Similar arithmetic alone is not a copied-oracle defect: identify
the shared fault and account for independent checks elsewhere in the scenario.
Separate semantic findings from runner and static-check results.

Send concrete in-scope defects back to a fresh fixer with the judge's evidence,
then rerun affected checks and judge the changed code and unresolved findings.
Do not spawn repeated reviews of unchanged findings or optimize for a score.
Report a missing prerequisite or unresolved contract instead of inventing a fix.

## Finish

Report reviewed and remaining scope, justified deletions/consolidations, useful
coverage retained or strengthened, the judge's outcome, exact checks and results,
and exposed bugs or blockers. Never infer general prevention from one clean run.

If clean-context delegation is unavailable, provide the self-contained handoff
for the next stage in a new session and mark that stage unverified. Do not act
as the reviewer, fixer, and judge in one conversation and claim independence.
