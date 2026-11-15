---
name: lazy
description: Use for coding tasks, bug fixes, refactors, code reviews, or requests for lazy mode, simpler code, or less over-engineering. Not for unrelated prose or general knowledge.
argument-hint: "[lite|full|ultra]"
license: MIT
---

Correctness and scope before size.

State material assumptions/tradeoffs before coding; ask only when blocked.
Multi-step: step → check plan; verifiable finish: bugs red → green; refactors before/after checks. Run checks first;
note pre-existing failures; never delete, skip, or weaken tests to pass. Carry unfinished
checks through handoffs and compaction; summaries do not replace these instructions.

Keep until `/lazy off`, "stop lazy", or "normal mode".
Switch: `/lazy lite|full|ultra`; bare `/lazy` reports.
Do not announce the mode during ordinary work.

## The ladder

Trace callers, callbacks, retries, restore/replay, and concurrent
use. Fix the shared cause: defects that break the request, recur at a sibling
site, or sit in an edited function, even if unrequested. Report others with a
failing input.

Choose the first option fully meeting contract and project conventions:
project helpers → stdlib/native → installed dependencies → custom code.
Underspecified new builds: identify core job and smallest complete workflow;
never skip explicit requirements or existing behavior.
Before adding helpers/components, search workspace and installed-dependency APIs
for closest implementation; reuse/extend if suitable.
Preserve platform representations; convert/wrap only when required for contract,
validation, ownership, or a meaningful domain boundary.

Preserve unrelated edits. One caller: keep domain names, tricky
logic, side effects, seams, and framework contracts.
Do not add code comments; remove nonessential comments.
Keep required license notices and functional tool directives.
Report rationale, shortcut ceilings, and upgrade paths in the final response.
Never add `SAFETY:`/`lazy:`/`slop-check-ignore`; verify necessary functional suppressions.

New guards/catches/fallbacks need contract/caller/documented-boundary evidence of reachability.
Catch only for required recovery/translation/cleanup/reporting; otherwise propagate original errors.
Guard removal requires redundancy evidence.
Derive cheap values from authoritative state; retain independent state, intentional
snapshots, required/measured caches, public contracts.

Skip speculative features/config/abstractions.
Remove task-created orphans; mention unrelated dead code.
Never force net-negative diffs.

Group behavior by reason to change; keep policy independent
of external details through ordinary parameters; give callers only needed
capabilities. Interchangeable implementations preserve inputs, results, errors,
and lifecycle.
Boundary changes: read [design checks](references/design-checks.md).
One implementation alone is not waste; judge behavior and design separately.

Preserve defaults, explicit false/zero/empty values, accepted input formats,
state, errors, metadata, generated files, lockfiles, and platform behavior unless
requested. Keep security, accessibility, and real-hardware calibration.
Revalidate trust boundaries. Bound external work; clean up timers/listeners/tasks.
Follow repo instructions; update docs for changed contracts.

Read [TS/JS and tsconfig](references/simplification-checks.md)
or [Python](references/python-checks.md) for changed languages;
[risk checks](references/risk-checks.md) for non-trivial code.

Use existing test tools. Map changed requirements, edge cases, and failure modes
to rerunnable tests; add missing coverage: fewest cases, each catching a
distinct bug; no scaffolding. Inline probes alone are not coverage.
Trivial edits need no new tests. If red-green checks prove the risky regression, skip old-code reruns;
mutation work is optional; otherwise meaningful mutation helps:
[lazy-mutation](../lazy-mutation/SKILL.md). Never add a dependency. Test tasks: every case;
strengthened tests must fail on planted faults, then restore code.

TS/JS: run bundled checker from the repo root with the final tests:
`node "<skills-dir>/slop-check/scripts/check.mjs" --since=HEAD`
(task-base for commits; quoted changed paths without Git).
Triage only task-owned findings; do not alter pre-existing work. Failed scans
are not clean; never weaken checks.

TypeScript, JavaScript, Java, Python, Ruby, Rust, Go: detect usage;
read toolchain file, manifest, lockfile, or runtime. Match installed version;
unavailable: report; do not guess.

## Intensity

<!-- Mode-keyed rows and quoted examples are filtered by lazy-instructions.js. -->

| Level | Guidance |
|-------|------------|
| **lite** | Complete tasks; suggest simpler options. |
| **full** | Default: smallest complete diff. |
| **ultra** | Cut unasked extras, never requested behavior/checks. |

"60-second expiry."
- lite: "Suggest reuse."
- full: "Reuse; preserve expiry."
- ultra: "Preserve expiry."

Keep in working context: requested deliverable, task-owned scope, required checks,
and action limits; no mandatory planning file.
After implementation/checks, review the task-owned diff once. Fix reproducible
in-scope findings and recheck affected behavior only with implementation/edit
authorization. Review-only/report-only requests: report findings without
modifications. Repeat review only for changed code, new concrete evidence, or
mandatory repo/user gates, not scores or unchanged findings. Reconsider scope
before broader guarantees or machinery.
A review budget never excuses a known required fix.
Stop only when requested needs and required checks are met; report blocked or
unverified work. A passed check proves its assertions, not general correctness;
distinguish behavior evidence from checker/review findings.

Check the diff, not memory: nothing unasked was added; each change traces to the
request or its verification; changed behavior has tests that ran.

Report changes, checks actually run, and limits; never claim an unrun check.
