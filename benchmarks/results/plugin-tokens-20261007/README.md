# Plugin token cost on Opus 5.5 and Sonnet 5.5

The 14 core tasks from `benchmarks/tasks.mjs` were run through the real Claude Code
plugin (`--plugin-dir`), not prompt-pasted rules. Arms: no plugin, the plugin at
`0d72c71` (baseline) and the plugin with this change (improved). Models:
`claude-opus-5-5` and `claude-sonnet-5-5` at `--effort high`. Each arm ran 3 trials,
for 252 runs in total. Every run used a fresh `CLAUDE_CONFIG_DIR`, and the
statusline nudge was pre-dismissed. Every run passed its held-out check: 252/252.

## Where the tokens go

Static context per request, measured exactly with a one-turn "Reply with just OK"
probe on Sonnet's tokenizer. The same tools were enabled for every probe.

| Context | Tokens |
| --- | ---: |
| Claude Code without the plugin | 10,150 |
| Skill catalog (baseline → improved) | 1,096 → 767 |
| Injected `lazy` ruleset (depends on install path) | ~1,800–2,040 |

The ruleset embeds about six absolute plugin paths, so the install-path length
changes its cost. The improved plugin was benchmarked from a path of the same
length as the baseline's.

Static context is not the main cost. Every extra turn re-reads the whole
context, which is about 16k tokens per turn here. The plugin adds turns
mostly for its intended evidence: tests run red before the fix, the checker, and
mutation checks. In the baseline transcripts, Opus often proved the same
regression twice: first with a red run before the fix, then again by stashing the
fix or copying the old code. It also ran tests, the checker and `git diff` as
separate calls.

## Changes

1. Six model-visible skill descriptions are shorter, saving **329 tokens on every
   request**, including sessions where lazy mode is off.
2. The ruleset asks for each proof once: when red-green checks already prove the
   regression, the agent skips reruns against the old code. It also runs the
   bundled checker with the final tests. Duplicate wording was cut to keep the
   ruleset under its 700-word limit.

## Results (total tokens = input + cache write + cache read + output)

| Model | Arm | Pass | Mean tokens | Mean turns | Mean cost USD | Runs with checker |
| --- | --- | --: | --: | --: | --: | --: |
| Opus 5.5 | none | 42/42 | 55,415 | 6.1 | 0.098 | — |
| Opus 5.5 | baseline | 42/42 | 109,177 | 9.5 | 0.171 | 40/42 |
| Opus 5.5 | improved | 42/42 | 100,901 | 8.5 | 0.161 | 40/42 |
| Sonnet 5.5 | none | 42/42 | 60,387 | 6.0 | 0.051 | — |
| Sonnet 5.5 | baseline | 42/42 | 83,167 | 6.5 | 0.072 | 19/42 |
| Sonnet 5.5 | improved | 42/42 | 82,058 | 6.7 | 0.071 | 23/42 |

| Model | Comparison | Change | 95% CI (task-cluster bootstrap) |
| --- | --- | --: | --: |
| Opus 5.5 | none → baseline | +97.0% | +65.7% … +131.6% |
| Opus 5.5 | baseline → improved | −7.6% | −18.8% … +5.3% |
| Sonnet 5.5 | none → baseline | +37.7% | +26.9% … +50.1% |
| Sonnet 5.5 | baseline → improved | −1.3% | −8.7% … +4.9% |

Both improved deltas lie inside run-to-run noise: each interval includes zero.
Per-task changes range from −42% to +55%. Only the 329-token catalog saving is
deterministic. On Opus, the improved ruleset averaged one turn fewer.
Sonnet ran the mandatory final checker in more runs (19 → 23 of 42), which costs
tokens and offsets the savings.

## Limits

- These tiny tasks pass even without the plugin, so the graders cannot show a
  quality benefit or a quality loss. Read the transcripts for review quality.
- Child agents ran under `acceptEdits` with a Bash allowlist. Bypass mode was
  refused in this environment. Shell commands that could not be statically
  checked were denied and retried, which adds turns, mostly in the plugin arms.
  `denials` records this per run.
- The arms ran one after another on the same day, with three trials. No subagents,
  Python, or TypeScript-config tasks were run.

## Reproduce

Create two checkouts whose paths have the same length, one at the baseline and one
with the change. Fill in `config.example.json`, then run this from any directory:

```sh
node run.mjs config.json <new-output-dir>
python3 analyze.py <new-output-dir>/results.jsonl
```

`run.mjs` reuses `prepare` and `grade` from the baseline `benchmarks/run.mjs`.
It saves each run's stream-json transcript and skips runs already recorded.
`results.jsonl` holds the per-run metrics from this study. The transcripts are not
committed.
