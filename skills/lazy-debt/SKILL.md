---
name: lazy-debt
description: >
  Harvest every `lazy:` comment into a debt ledger of deliberate shortcuts
  (not generic TODOs). One-shot report, changes nothing. Use for "lazy debt",
  "what did lazy defer", or /lazy-debt.
---

Collect existing `lazy:` comments into a ledger. Do not add new markers:
report shortcut ceilings and upgrade paths in the final response. Accurate,
non-obvious constraints may also belong beside the affected code without a marker.

## Scan

Grep the repo for comment markers, skipping `node_modules`, `.git`, and build
output:

`grep -rnE --exclude-dir={node_modules,.git,dist,build,out,coverage} '(#|//|/\*|<!--|--) ?lazy:' .`

Each hit is one ledger row. The comment prefix keeps prose that merely mentions
the convention out of the ledger.

## Output

One row per marker, grouped by file:

`<file>:<line>, <what was simplified>. ceiling: <the limit named>. upgrade: <the trigger to revisit>.`

The convention is `lazy: <ceiling>, <upgrade path>`, so pull the ceiling
and the trigger straight from the comment. Want an owner per row too? add
`git blame -L<line>,<line>`.

Flag the rot risk: any `lazy:` comment that names no upgrade path or
trigger gets a `no-trigger` tag, those are the ones that silently rot.

End with `<N> markers, <M> with no trigger.` Nothing found: `No lazy: debt. Clean ledger.`

## Boundaries

Reads and reports only, changes nothing. To persist it, ask and it writes the
ledger to a file (e.g. `LAZY-DEBT.md`) in the same row format as the report.
One-shot — it sets no mode, so there is nothing to revert.
