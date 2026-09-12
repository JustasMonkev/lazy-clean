---
description: Show upstream benchmark results and lazy-clean evaluation sources
---

Show the lazy gain scoreboard. One shot, change nothing: do not switch mode,
write flag files, or persist anything. The active level remains untouched.

Render this table with its setup, source, and limitations:

| Metric | Ponytail vs no-skill agent |
| --- | ---: |
| Added lines in `git diff` | ~54% fewer |
| Tokens | ~22% fewer |
| Cost | ~20% lower |
| Elapsed time | ~27% less |

Source: [Ponytail's agentic study, June 18, 2026](https://github.com/DietrichGebert/ponytail/blob/356918eba965ee1eac64bd3a7f0dd02108350de5/benchmarks/results/2026-06-18-agentic.md).
These are the upstream study's aggregate results across 12 feature tasks on
the FastAPI + React template, using Claude Code with Haiku 4.5 and four runs
per task and arm. They have not been reproduced for lazy-clean.

The feature apps were not run; added lines do not establish correctness or
readability. This is one model and a small task set, with four timed-out cells
missing cost/time data. It is not a savings or safety guarantee.

Point to lazy-clean's [evaluation runner and measurement rules](https://github.com/JustasMonkev/lazy-clean/blob/main/benchmarks/README.md)
and [recorded Luna guidance pilot with raw artifacts](https://github.com/JustasMonkev/lazy-clean/blob/main/benchmarks/solid-guidance.md).
The pilot measures behavior and design on small tasks; it provides no token,
cost, or comparable timing measurements and claims no efficiency gain.

Never apply Ponytail's percentages to lazy-clean, the current task, or another
model. Do not invent savings from an unwritten alternative. Report local gains
only from actual matched measurements following the runner's measurement rules;
missing metrics stay unknown. `/lazy-debt` counts deferred shortcuts and
`/lazy-audit` reviews remaining work; neither measures savings. Report only.
