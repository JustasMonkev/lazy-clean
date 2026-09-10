# SOLID guidance: sources and Luna pilot

On 2026-09-10, reviewed similar coding-skill packages and tested a focused revision
of lazy-clean against its current instructions. The revision clarifies when a
boundary earns its place, including when it has one production implementation.
This pilot supports keeping the clarification; it does not establish broad
quality gains or an “S-tier” rating.

## Ideas adapted

These are original, concise instructions informed by the sources below. No
external implementation or complete skill was copied, and no dependency was added.

| Source reviewed | Idea used | Adaptation for lazy-clean |
| --- | --- | --- |
| [Matt Pocock: codebase-design](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/codebase-design/SKILL.md) | Small interfaces can hide substantial complexity; consider where that complexity goes if a module disappears. | Ask what callers would need to know after deleting a helper. Keep a useful boundary even with one production implementation. |
| [JordanCoin: SOLID](https://github.com/JordanCoin/codingskills/blob/d990b56b72f3f4203c13d1ef40e815893d9e7c54/skills/solid/SKILL.md) | Apply SOLID in context, using focused capabilities and testable dependencies. | Express S/O/L/I/D through actual change, behavior contracts, and ordinary parameters; avoid mandatory class hierarchies. |
| [Anthropic: code-simplifier](https://github.com/anthropics/claude-plugins-official/blob/3ea32df27be71d78775e627df2382fc26203577f/plugins/code-simplifier/agents/code-simplifier.md) | Preserve useful abstractions and behavior while improving clarity. | Remove the suggestion that a single implementation alone proves waste; distinguish simplicity from fewer lines. |
| [Superpowers: task reviewer](https://github.com/obra/superpowers/blob/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/skills/subagent-driven-development/task-reviewer-prompt.md) and [writing skills](https://github.com/obra/superpowers/blob/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/skills/writing-skills/SKILL.md) | Judge requirements and quality separately; test instructions with fresh agents. | Use matched Luna runs and inspect generated artifacts independently of the agents' reports. |

The reviewed repositories identify MIT licenses for the first, second, and
fourth sources and Apache-2.0 for Anthropic's code-simplifier plugin. Source
links pin the reviewed revisions. Recommendations tied to a particular stack,
fixed class/function sizes, or requiring multiple adapters before a boundary
can be useful were not adopted.

## Changes

- Add a short design trigger to the main skill, fallback, and static rule surfaces.
- Put the detailed SOLID checklist in `skills/lazy/references/design-checks.md`,
  loaded for changes involving responsibilities, dependencies, or extension points.
- Align review/audit instructions: preserve useful single-implementation boundaries;
  judge requested behavior and design separately from the lexical slop scan.
- Add six SOLID tasks through `taskSet: "solid"`; retain the fourteen-task default.
- Test delivery of the reference and validate each grader with its initial fixture,
  a working correction, and a deliberate contract-breaking mutation.

The original inline candidate exceeded the existing strict 700-word core prompt
limit. Moving the detail into a reference preserved the gate: final generated
core counts are 698 / 696 / 699 words for lite / full / ultra under the existing
test's counting rule. The reference adds reading when relevant; the core budget
does not represent total context use.

## Experiment

Baseline: `7e37e655dc6da13d9f88c4fcf239afc8a1c7441a`.
Requested model: `gpt-5.6-luna`, high reasoning, `full` mode; Node `v24.19.0`.
Nine fresh subagents completed six tasks each, in separate Git workspaces.
Three task orders were matched across arms: original, reversed, and rotated.

The initial six runs compared current instructions with the inline candidate.
After the prompt-budget failure, three fresh agents tested the reference-based
candidate against the same controls. No generated trial solution was repaired
before scoring. The exact file prompts, guidance snapshots, sources, diffs,
agent reports, grading output, and manual observations are retained in
[raw evidence](results/solid-luna-2026-09-10.json). Text blobs are deduplicated
by SHA-256; each run maps file paths to those hashes.

Agents saw requirements and starting files, not the controller's graders or
known fixes. The grader was frozen before inspecting generated code; prototype
format names were added during grader QA before that inspection. Every arm was
scored against that same grader. Behavior and artifact review were separate.

| Observation | Current rules | Inline candidate, superseded | Final reference candidate |
| --- | ---: | ---: | ---: |
| Agents / task outcomes | 3 / 18 | 3 / 18 | 3 / 18 |
| Held-out behavior passes | 17/18 | 18/18 | 18/18 |
| Delegates to existing `hasOnly()` API | 2/3 | 3/3 | 3/3 |
| Narrow checkout capability, usable without production gateway | 3/3 | 3/3 | 3/3 |
| Correct parse-failure guard retained | 3/3 | 3/3 | 3/3 |
| Already-correct route file left unchanged | 2/3 | 2/3 | 2/3 |
| Tasks with saved regression assertions | 0/18 | 0/18 | 0/18 |

One control run treated an inherited object method such as `toString` as a
registered format instead of rejecting it. A different observation in that same
run was a handwritten traversal over private suite fields despite the existing
public method. All final-candidate runs rejected unknown prototype names and
reused the public method. Both arms otherwise solved these small requests well.

All arms calculated invoice totals once, allowed caller formatters without
changing calculation policy, and narrowed the directory consumer to `list()`.
Conditional dispatch and a small formatter map both satisfied the design need;
neither was required just to follow a stylistic recipe.

The saved-test gap matters. All supplied `test.cjs` placeholders stayed unchanged,
with no replacement test files. Agents reported useful inline assertions, and
some explicitly acknowledged that `npm test` ran no assertions. The controller's
held-out passes are real, but do not create persistent regression coverage.
The full store and read-only design rubrics included local regression tests,
so **those full rubrics were not satisfied in any arm**. The table reports
individual observations, not an overall SOLID/design pass score.

## Limits and next evidence

This is current-versus-revised guidance in a shared host environment, not rules
off/on. Both arms inherited the same host instructions and skill catalog.
Fresh forks avoided conversation history, but the workspace restrictions were
instructions, not OS isolation. Complete tool transcripts and independently
verified reference-read counts are unavailable in this artifact.

There are only three agents per arm; six tasks within each agent are correlated.
The final candidate ran later than its controls. Tasks are small, explicit
JavaScript examples, including two known regressions. They cannot establish
benefits on unseen projects, architectural refactors, or other languages.
The requested model is recorded; no independent provider fingerprint, token,
cost, or comparable timing measurements were exposed. No efficiency gain is claimed.

Before claiming broader quality, use unseen changes from real repositories and
require saved, rerunnable regression tests where the change warrants them.
Keep those tasks out of prompt tuning. Also test refactors where a useful
boundary must be discovered rather than explicitly requested.

## Reuse and validation

The existing runner can exercise these fixtures by adding `"taskSet": "solid"`
to its config; see [runner instructions](README.md#solid-task-set). That runner
performs rules-off/on comparisons, which differs from this recorded experiment.
The task definitions and artifact bundle are sufficient to inspect and re-grade
the saved implementations; they do not reproduce the stochastic agent responses.

Repository validation on the final code: `npm test` passed, including the new
grader tests and the existing prompt-budget gate. The generated behavior pass
counts above are independent of that package test result.
