# Sweep rules: Haiku 5.5 and Sonnet 5.5

Current rules (`780b716`) against candidate rules (`cdbbc10`: run checks first,
never weaken tests, update docs for changed contracts). Both arms used the same
harness revision (`cdbbc10`); only `hooks/lazy-instructions.js`, `skills/lazy`,
and `skills/slop-check` were restored from `780b716` in the current worktree,
as described in the [benchmark README](README.md#reproduce-current-versus-candidate-rules).

Command: `claude -p --safe-mode` with the README's flags, `--max-budget-usd 0.50`,
`timeoutMs` 300000, mode `full`. Models `claude-haiku-5-5` and `claude-sonnet-5-5`.
232 agent calls. The off arm is identical in both worktrees, so its runs are pooled.
Raw per-run rows: [runs.json](results/sweep-models-20261115/runs.json);
tallies: [summary.json](results/sweep-models-20261115/summary.json).

## Pass counts

| Set | Model | Off (no rules) | Current rules | Candidate rules |
| --- | --- | --- | --- | --- |
| sweep, 5 trials | Haiku 5.5 | 30/30 | 15/15 | 15/15 |
| sweep, 5 trials | Sonnet 5.5 | 27/30 | 15/15 | 14/15 |
| core, 1 trial | Haiku 5.5 | 28/28 | 14/14 | 14/14 |
| core, 1 trial | Sonnet 5.5 | 25/28 | 14/14 | 14/14 |

Median cost of passing runs, current against candidate: Haiku sweep $0.0051 /
$0.0050, Sonnet sweep $0.0281 / $0.0278, Haiku core $0.0040 / $0.0047, Sonnet
core $0.0423 / $0.0416. One trial per core task cannot separate these.

## Reading

- No regression: both rule versions pass every core task with both models.
- No measured improvement: the sweep tasks saturate. Haiku passes all of them
  without any rules, so these fixtures cannot show the new rules helping. They
  remain useful as regression checks; harder variants are needed to measure gain.
- All four sweep failures, including the one candidate failure, are the same
  harness interaction: Sonnet wrote `test.cjs` through a Bash heredoc, the
  allowlist denied it, and the final message still claimed the file was
  rewritten. That is a false completion claim, not a rule-version effect.
- Final messages on `test-oracle` mention checking the test against a planted
  or mutated fault in 7/10 Sonnet off runs but 1/5 in each rules arm (Haiku:
  8/10 off, 4/5 in each rules arm). The rules' "mutation work is optional" line
  appears to suppress that self-check on test-strengthening tasks. A rule that
  strengthened tests must fail on a planted fault is the obvious next candidate;
  it was cut from this change to stay under the 700-word prompt cap.
- On `preexisting-failure` every run in every arm left `money.cjs` alone and
  reported the unrelated failing test; on `docs-contract` every run updated
  README. Keyword counts over final messages are a weak signal, not a grade.
