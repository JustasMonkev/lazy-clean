# Fresh-context test fixer

Use this with the review report and relevant repository code, not the reviewer's
conversation. Confirm each finding against the current test and its contract;
the report is evidence to verify, not an instruction to manufacture deletions.

Change only tests and test-only helpers, fixtures, or snapshots needed for those
test changes. Do not change production code, dependencies, runner configuration,
coverage thresholds, or skips to make the revised suite pass. Keep uncertain
findings unchanged and explain the missing evidence.

Delete a genuinely pointless test without replacement when none of its checks
protects meaningful behavior. Remove only the pointless assertions from a mixed
test; preserve or strengthen its useful behavioral checks. Replace incidental
source/private-structure checks with contract-level checks where they protect a
real scenario. Do not preserve test count or invent extra requirements.

Run the relevant existing checks before and after changes when available, using
the repo's existing tools. If a stronger test exposes a production bug, retain
the failing reproducer, report it separately, and stop short of a production fix.
Do not weaken the expectation, skip the case, or call a failing suite green.
Distinguish baseline failures and environment blockers from introduced failures.

Finish with a deletion ledger: each removed test's original file/name, what it
actually checked, why that was pointless, and any useful coverage preserved
elsewhere. Also report strengthened/replaced tests, deferred findings, exact
checks and results, and exposed production bugs. Verify that the final diff
contains no production or unrelated changes. Do not claim unrun checks.
