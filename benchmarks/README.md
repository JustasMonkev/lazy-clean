# AI behavior checks

Fourteen small coding tasks, each run with the compact rules off and on. This measures
prompt behavior, **not** automatic hook delivery, editor integration, or broad
coding ability. Package unit tests cover the hooks separately.

## Run

Use a current agent CLI that reads a task from stdin and edits its working
folder. No SDK or npm dependency is needed. For example, save this as
`/tmp/lazy-eval-config.json` after choosing an exact model you have access to:

```json
{
  "command": ["claude", "-p", "--safe-mode", "--model", "YOUR_EXACT_MODEL_ID", "--output-format", "json", "--no-session-persistence", "--strict-mcp-config", "--mcp-config", "{\"mcpServers\":{}}", "--permission-mode", "acceptEdits", "--tools", "Read,Write,Edit,Bash,Glob,Grep", "--allowedTools", "Read,Write,Edit,Glob,Grep,Bash(node *),Bash(npm test*)", "--max-budget-usd", "0.50"],
  "model": "YOUR_EXACT_MODEL_ID",
  "trials": 3,
  "timeoutMs": 180000,
  "mode": "full"
}
```

```bash
node benchmarks/run.mjs /tmp/lazy-eval-config.json /tmp/lazy-eval-results
# Quick smoke test: one task, still paired off/on.
node benchmarks/run.mjs /tmp/lazy-eval-config.json /tmp/lazy-eval-smoke explicit-values
```

The output folder must not exist. It contains a fresh Git repo for each task,
prompt text, client stdout/stderr, held-out check output, and `results.json`.
Workspaces remain available for review. The runner never edits your real repo.
The default full run makes **84 agent calls** (14 tasks × 3 trials × 2 arms).
It uses the account/budget of the command you configure. Unit tests make no AI calls.

The example uses Claude's `--safe-mode` to disable user prompts, plugins,
auto-memory, and hooks in **both** arms. It passes these rules as task context
only in the on arm. This is not the system-level injection used by plugin hooks. Keep the same exact model, tools, permissions, and runtime
in both arms. For another CLI, disable its global rules too; setting this
package's mode to off does not remove an already-installed AGENTS.md or plugin.
The runner does not change your global client config. Check `claude --help` for
these flags before using an older client.

This is a local benchmark, not an OS sandbox. Run only a trusted agent command
under its normal permissions. The task prompt confines work to its fixture;
held-out checks live outside it. Do not give the agent this benchmark's source
or expected fixes. Inspect outputs for task leakage and denied tool calls (`permissionDenials` records the count when available).

## Tasks

| Task | What must survive |
| --- | --- |
| explicit-values | false, zero, empty string, null/missing defaults |
| shared-cause | button and restore paths |
| user-edits | a pre-existing uncommitted receipt label |
| useful-helper | the tax module API and rounding |
| input-compat | accepted case/whitespace, new length limit, errors |
| requested-expiry | required 60-second expiry, boundary, failed loads |
| existing-tests | existing runner and old/new regression checks |
| trust-boundary | validated JSON data, no string coercion |
| partial-cleanup | cleanup after attach failure, original error |
| new-file-errors | new file, explicit values, filesystem/JSON errors |
| dependency-duplication | selection behavior without repeating the dependency's tree traversal |
| collection-cleanup | no collection-time acquisition; cleanup on success, setup failure, and test failure |
| empty-error | empty string errors stay empty; empty object messages still use the fallback |
| necessary-guard | malformed JSON produces one 400 response and preserves task state |

The last four cases come from review of
[playwright-leak-finder PR #3](https://github.com/JustasMonkev/playwright-leak-finder/pull/3)
and [wdio-mocha-split-runner PR #2](https://github.com/JustasMonkev/-jm-wdio-mocha-split-runner/pull/2).
They isolate the observed mechanisms without installing either framework:
`suite.cjs` models Mocha 10.8.2's `hasOnly` traversal; injected synchronous hooks
model collection, filtering, setup, and teardown. They do not cover real
Vitest process cleanup or Mocha's TypeScript declarations.

`necessary-guard` is deliberately correct at baseline. Leaving it unchanged is
a pass; deleting its parse-failure guard must fail. The other three cases start
broken. Tests prove a working correction passes and a targeted mutation fails
for each case. This checks the graders, not whether an AI finds the fixes.
These are known regression cases, not unseen holdouts for measuring generalization.
For `dependency-duplication`, also inspect whether the solution delegates to
`suite.hasOnly()`: the behavior grader accepts an equivalent single traversal,
but retaining a handwritten copy still misses the dependency-reuse objective.
See the [Luna smoke results](luna-pr-regressions.md) for the first paired run and
its separate manual findings.

## Read the evidence

1. Compare pass counts first. A smaller broken solution is a loss.
2. Inspect diffs for scope, useful helpers, tests, and clarity. Byte counts are
   a rough size measure, not a readability score. `user-edits` intentionally
   starts dirty in both arms.
3. Compare time, cost, and size only for pairs where **both** runs passed, using
   the same model. Report missing or mismatched model evidence, not a gain.
4. Use several trials. Keep some new real-world tasks out of prompt tuning, then
   test those before release. These tiny tasks cannot prove general gains.

`tokens` includes reported input, output, cache creation, and cache-read tokens.
`costUsd` comes from Claude's JSON result; it is not necessarily your invoice on
a subscription. Other clients can still run; absent metrics are `null`, never
zero. Runtime includes the full child process. A timeout, missing executable,
output overflow, client error, or failed held-out check is not a pass.

Each child is capped at 8 MiB of output and the configured time (at most ten
minutes). Timeout/overflow kills its process tree. Each result is saved before
the next run; interrupted runs retain earlier evidence. SIGINT/SIGTERM stops
the active process tree and ends the run. Do not publish secrets
from a custom command or its logs.

The test suite checks each expected baseline verdict and working fix, including
the already-correct guard fixture, and catches deliberate mutations.
Fake-client tests only check this runner;
they are **not** evidence of AI quality. No speed or quality gain is assumed.

Approach: [Anthropic's agent evaluation guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
CLI flags: [Claude Code reference](https://code.claude.com/docs/en/cli-reference).

Exit 0 means the benchmark completed, not that all tasks passed. Exit 2 means
setup or measurement failed; an interrupted run exits 130. Use the saved per-task verdicts.

## SOLID task set

Set `"taskSet": "solid"` in the same config to select six tasks about existing
API reuse, formatter extension, substitutable stores, an isolated checkout
capability, read-only consumers, and preservation of a necessary guard.
The default stays `"taskSet": "core"` with the fourteen original tasks.
A full SOLID run makes 36 calls (6 tasks × 3 trials × 2 arms).

Runtime checks establish the requested behavior. Review the `design` rubric in
`solid-tasks.mjs` separately; a passing runtime check is not a design verdict.
For the two reused tasks, check public-method reuse and justified preservation
of the existing guard. `npm test` exercises baselines, working fixes, deliberate
contract-breaking mutations, and selection of the SOLID set without AI calls.

The runner compares rules off/on. The [recorded Luna experiment](solid-guidance.md)
compares the existing and revised rules using fresh subagents; it is a separate
protocol, with shared host instructions and six tasks per agent.

## Implementation-choice task set

Set `"taskSet": "implementation"` in the same config. The default core/off-on
protocol is unchanged. This set makes 30 calls at three trials:

| Task | Behavior checked | Separate manual implementation observation |
| --- | --- | --- |
| query-pairs | Ordered duplicate keys, empty fields, form encoding, UTF-8, immutable input | Native API reuse or custom encoder |
| existing-component | Escaping in text/attributes, explicit empty values, conversion errors, existing preview and component exports | Existing component reuse or duplicate rendering |
| shared-cause (existing core task) | Button and restore normalization | Shared helper or caller-specific repair |
| trust-boundary (existing core task) | Parsed numeric values without coercion | Preserved validation or unsafe shortening |
| already-minimal | Fresh output, first-seen order, case-sensitive deduplication, empty strings | Unchanged, justified edit, or unnecessary churn |

The first, second, and last tasks are new; the middle two reuse frozen core
contracts rather than duplicate them. `implementation-tasks.mjs` holds the
manual `design` rubrics outside worker prompts. Behavioral grading accepts
correct alternative implementations: a handwritten encoder can pass while
still missing the native-reuse objective. Do not combine these judgments into
one automatic score or reward a change merely for being an edit.

`npm test` validates the initial fixtures, reference fixes, fourteen deliberately
broken variants, and a fake-client no-change run. These are grader/harness
checks, **not model-performance results**. Keep graders, references, and mutants
fixed before collecting worker outcomes. Do not tune them against a particular
arm's answer without declaring an amendment and regrading every arm uniformly.
The harness rejects installed dependencies, so this set intentionally does not
simulate an installed-package workload or relax that boundary. Real UI/browser
behavior and dependency integration remain outside these small Node fixtures.

### Reproduce current-versus-candidate rules

Use two clean, detached worktrees with the **same harness revision and config**.
Only substitute the compact rules producer, its skill/references, and checker.
The benchmark measures this delivery path, not changes confined to unrelated
skills or host hooks. Replace the three revision values below with immutable
commits available in this repository, and create the config as above with
`"taskSet": "implementation"`. Use an absolute agent executable path if needed.

```bash
HARNESS_REV=COMMIT_WITH_THIS_TASK_SET
CURRENT_RULES=IMMUTABLE_CURRENT_COMMIT
CANDIDATE_RULES=IMMUTABLE_CANDIDATE_COMMIT
EVAL_ROOT=$(mktemp -d /tmp/lazy-choice.XXXXXX)
git worktree add --detach "$EVAL_ROOT/current" "$HARNESS_REV"
git worktree add --detach "$EVAL_ROOT/candidate" "$HARNESS_REV"
git -C "$EVAL_ROOT/current" restore --source="$CURRENT_RULES" --worktree -- hooks/lazy-instructions.js skills/lazy skills/slop-check
git -C "$EVAL_ROOT/candidate" restore --source="$CANDIDATE_RULES" --worktree -- hooks/lazy-instructions.js skills/lazy skills/slop-check
git rev-parse "$HARNESS_REV" "$CURRENT_RULES" "$CANDIDATE_RULES" > "$EVAL_ROOT/revisions.txt"
git -C "$EVAL_ROOT/current" diff --binary > "$EVAL_ROOT/current-rules.patch"
git -C "$EVAL_ROOT/candidate" diff --binary > "$EVAL_ROOT/candidate-rules.patch"
cp /tmp/lazy-eval-config.json "$EVAL_ROOT/config.json"
node "$EVAL_ROOT/current/benchmarks/run.mjs" "$EVAL_ROOT/config.json" "$EVAL_ROOT/current-results"
node "$EVAL_ROOT/candidate/benchmarks/run.mjs" "$EVAL_ROOT/config.json" "$EVAL_ROOT/candidate-results"
```

Both reports identify the harness commit; `dirty` records substituted rule files,
not a candidate rule SHA. Retain `revisions.txt`, both patches, the config,
prompts, grader output, and workspaces together to identify the actual inputs.
Check that these old/new paths exist at both revisions before substitution.
Disable global instructions/plugins identically and inspect denied calls and
prompt leakage. Run current/candidate in reversed order in a second experiment
with new output directories if making an order-sensitive claim; within each
experiment the runner still counterbalances off/on task pairs.

Compare **on** rows by task and trial across the two reports; keep each run's
**off** rows as controls, not extra candidate observations. Compare size, cost,
and time only where both on rows passed and reported model evidence matches.
Report pass denominators and failures first, then descriptive reuse/no-change
observations from retained diffs, including justified boundaries. Do not infer
reuse from byte counts alone.

The existing `sourceBytesBefore/After` counters include all `.js`, `.cjs`, and
`.mjs` files, **including tests**; they are aggregate JavaScript bytes, not
production-only size. For a source/test comparison, classify retained files
manually and report production and test bytes separately with the classification;
do not subtract guessed test sizes or label the aggregate as production savings.
No model trials or savings are claimed by adding this task set.
