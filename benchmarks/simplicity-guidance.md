# Evidence before defensive code; derive redundant state

Research date: 2026-11-15. Starting revision:
`780b716ade38ff6eee08dbf5640501090bceb807`.

## Why these two changes

The existing instructions already cover reuse, root-cause fixes, discriminated
unions, small diffs, meaningful tests, and keeping useful single-caller helpers.
Repeating those rules would increase prompt size without adding a decision.

| Addition | Gap it addresses | Necessary exception |
| --- | --- | --- |
| Require evidence before adding defensive code | Existing deletion guidance asks for caller/lifetime evidence, but adding a guard or catch had no equally concrete test | Real boundary validation, recovery, error translation, cleanup, and required reporting stay; lack of an observed failure does not prove an existing guard redundant |
| Derive cheap values from authoritative state | Separate counts and flags create synchronization paths and compensating branches | Preserve independent state, intentional snapshots, required or measured caches, and public contracts |

Both are manual reasoning rules. A text scanner cannot reliably decide whether
a failure is reachable or a value is intentionally a historical snapshot.

## Sources and interpretation

Exa search and page retrieval were used. The connection did not expose
`agent_run` or a research-effort setting. Five search calls requested 40 results;
results included duplicates, mirrors, and irrelevant pages. That is a retrieval
count, not 40 validated sources.

| Primary source | What it supports |
| --- | --- |
| [No AI Slop manifesto](https://www.slopmanifesto.com/) | Prioritize useful outcomes and human review effort; improve recurring causes instead of repeatedly patching symptoms |
| [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices) | Keep instructions focused, provide concrete completion checks, and distinguish preferences from enforceable checks |
| [Boris Cherny's own prompting tips](https://www.threads.com/@boris_cherny/post/DUMZxTWElFm) | Challenge a mediocre implementation and verify behavior against the starting version |
| [React: choosing state structure](https://react.dev/learn/choosing-the-state-structure) | Avoid duplicated derived state and synchronization mistakes; deliberate initial-value snapshots have different semantics |
| [React: unnecessary effects](https://react.dev/learn/you-might-not-need-an-effect) | Calculate cheap derived values directly; retain caching when computation warrants it |

Twitter/X searches located
[Karpathy's coding observations](https://x.com/karpathy/status/2015883857489522876)
and [Cherny's tips thread](https://x.com/bcherny/status/2017742741636321619).
Direct retrieval of those X posts failed. Cherny's relevant advice was verified
through his own Threads post above. The
[Karpathy-inspired guidelines](https://github.com/antonillos/andrej-karpathy-skills)
are a community interpretation, not a primary statement by Karpathy or measured
evidence of a quality gain. They overlap heavily with existing lazy-clean rules.

The two selected policies are our engineering synthesis of these sources and
the repository's gaps. The React advice supplies a concrete state example; its
generalization beyond React is an inference, not a cross-language benchmark.
No source establishes that a short prompt always produces optimal code.

## Verification boundaries

Instruction-delivery tests check that the policies reach supported rules files,
normal hooks, subagents, and the missing-skill fallback. Existing prompt-size
limits remain in force. These checks establish delivery, not model compliance.

Two cases extend the existing implementation benchmark suite. Runtime graders
check observable contracts; their separate design rubrics distinguish narrow
recovery from blanket fallback and derived state from synchronized copies.
Equivalent correct implementations may pass without adopting the preferred
design. Baseline failures, working reference implementations, deliberately
broken variants, and restored references validate the graders.

## Results

Node v24.22.1 was used locally. No dependency or checker rule was added.

| Check | Result |
| --- | --- |
| Full `npm test` | Passed on the frozen candidate |
| Hook suite | 857 passed |
| Language/instruction delivery | 1,563 passed; core and fallback remain below the existing 700-word limit |
| Implementation benchmark validation | Seven baseline verdicts, reference fixes and restorations; all 32 broken variants rejected; correct synchronized-count alternative accepted |
| Changed-file checker, `--since=780b716ade38ff6eee08dbf5640501090bceb807` | Clean, four JS files scanned |
| `git diff --check` | Passed |
| Full `npm run slop-check` | Exit 1, two unchanged findings, also reproduced on the base revision |

The full scanner reports `no-catch-fake-success` at
`hooks/lazy-state.js:27` (mode-file fallback) and `benchmarks/run.mjs:195`
(entry-point detection). Neither file changed. These findings were left for
separate review; the repository-wide scan is not reported as clean.

Independent review strengthened two initially weak test cases: successful
non-string JSON reads and removal of an empty-string ID. Four additional faulty
implementations passed before that amendment and fail afterward. Existing
assertions were retained. A separate instruction review preserved required
error reporting as a legitimate catch purpose.

An intermediate full-suite run overlapped the reporting wording/assertion edit
and failed 27 delivery assertions. A complete run after the code/test freeze
passed; the earlier result is not represented as a final-candidate failure.

## Fresh-agent smoke, not a demonstrated quality gain

Three fresh-context agent sessions solved the same two tasks. Each received
only its own fixture projects, neutral task contracts, the assigned full-mode
rules, and unchanged supporting references/checker. Graders and design rubrics
were outside those directories. Agents used the host's inherited default model;
an exact model identifier and model cost/token metrics were not recorded.

| Rules | Optional config | Collection count |
| --- | --- | --- |
| Base revision | Pass | Pass |
| Intermediate revision, before reporting exception | Pass | Pass |
| Final revision, including reporting exception | Pass | Pass |

All three sessions produced byte-identical production implementations: a narrow
read-error catch and a count derived from membership. Each preserved the
intentional initial snapshot. Their own tests also passed. This smoke therefore
shows compatibility on these examples, **not improvement over the baseline**.
It cannot establish general reliability, fewer lines, or lower cost.

The independent test amendment happened before collecting any grading results;
the same amended grader evaluated all six outputs. The intermediate session is
retained rather than discarded. Each session completed both tasks in sequence;
this is one trial per rules version, with shared host instructions and no
randomized order. Treat these as development fixtures, not unseen holdouts.

[Raw smoke evidence](results/simplicity-20261115.json) contains the supplied
rules, task contracts, starter files, grader checks/hashes, actual output files,
diffs, and rerun test output. The deterministic grader validation is rerunnable
with `node tests/implementation-benchmarks.test.mjs`; the existing benchmark
runner can also run either task with an explicitly configured agent CLI.
