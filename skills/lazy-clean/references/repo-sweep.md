# Repository sweep

Use this when the request is to run the lazy audits over an existing repository
and fix what they find, rather than to build a requested change. The delegation
contract, phase gates, draft-only PR policy, and completion rules of the
[guided workflow](guided-workflow.md) still apply.

## 1. Baseline before any scan

Install with the repository's documented locked setup. Run its build, lint, and
test commands once and record each failing test by name with its cause. Separate
environment causes (missing browser revision, runtime older than the manifest's
engines, no IPv6, missing fonts) from code failures. Every later run is compared
against this list; a failure on the list is not caused by the sweep, and a new
failure is never explained away as environmental without the same evidence.

## 2. Report-only scans

Run these in parallel as read-only jobs. None of them edits the repository.

| Command | Scope in a sweep |
| --- | --- |
| [slop-check](../../slop-check/SKILL.md) | `--source-only --summary` first, then test paths with their non-type rules. Triage every source finding; findings are prompts, not verdicts. |
| [lazy-audit](../../lazy-audit/SKILL.md) | Whole tree. Verify each finding by grepping callers, including test-only and tool-hidden exports. |
| [lazy-debt](../../lazy-debt/SKILL.md) | Ledger of existing `lazy:` markers. |
| [test-quality-review](../../test-quality-review/SKILL.md) | Whole suite, prioritized. Demonstrations run only in disposable copies. |

Not part of a sweep: `lazy-review` reviews a diff, so it runs later on the
sweep's own diff; `layz-test` needs a scope; `lazy-help` and `lazy-gain` only
display; `lazy-verify` needs explicit opt-in.

## 3. Select fixes

Merge duplicate findings across reports. Select only verified, behavior-preserving
fixes. Defer with a recorded reason anything that changes a published type,
exported name, CLI flag, or config field, or that needs wide test churn. Note
every intended behavior change; it needs a test and, when it alters a documented
contract, a docs update the repository's instruction files require.

## 4. Fix with disjoint ownership

Before starting writers, list every file each fix set touches. Give production
fixes and tests-only fixes to separate fresh agents with disjoint file lists.
Assign test files that a production deletion forces to change to the production
writer, and remove those findings from the tests-only writer's list. A tests-only
writer proves each strengthened test against a planted fault in a disposable
copy, never the shared checkout. Commit each writer's files only after it
finishes, so one commit never captures another writer's partial edits.

## 5. Verify the combined diff

Start these on the stable combined candidate:

- Verifier: compare old and new behavior for each risky refactor in disposable
  copies of both revisions, rerun the full suite against the baseline list, and
  exercise the real entry point once.
- Reviewer: run `lazy-review` on the sweep diff, check correctness against the
  repository's own review checklists, and confirm docs follow every changed
  contract.
- Test judge: the lazy-quality-review judge stage on the changed tests,
  re-planting at least some faults independently and rerunning each changed test
  file several times for flakiness.

Route accepted findings to a fresh fixer, then rerun only the affected checks.

## 6. Report

List each scan's raw counts and how many findings were real, the fixes made, the
deferred items with reasons, intended behavior changes, the baseline comparison,
and checks that remain manual or blocked.
