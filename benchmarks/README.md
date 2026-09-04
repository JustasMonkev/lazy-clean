# AI behavior checks

Ten small coding tasks, each run with the compact rules off and on. This measures
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
The default full run makes **60 agent calls** (10 tasks × 3 trials × 2 arms).
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

## Read the evidence

1. Compare pass counts first. A smaller broken solution is a loss.
2. Inspect diffs for scope, useful helpers, tests, and clarity. Byte counts are
   a rough size measure, not a readability score. `user-edits` intentionally
   starts dirty in both arms.
3. Compare time, cost, and size only for pairs where **both** runs passed, using
   the same model. Report missing or mismatched model evidence, not a gain.
4. Use several trials. Keep some new real-world tasks out of prompt tuning, then
   test those before release. These ten tiny tasks cannot prove general gains.

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

The test suite proves every original fixture fails, a working fix passes, and
a deliberate mutation is caught. Fake-client tests only check this runner;
they are **not** evidence of AI quality. No speed or quality gain is assumed.

Approach: [Anthropic's agent evaluation guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
CLI flags: [Claude Code reference](https://code.claude.com/docs/en/cli-reference).

Exit 0 means the benchmark completed, not that all tasks passed. Exit 2 means
setup or measurement failed; an interrupted run exits 130. Use the saved per-task verdicts.
