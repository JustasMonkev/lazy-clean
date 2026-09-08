# Luna PR-regression smoke check

Run on 2026-09-08 against the four new PR-derived cases. The lazy rules were
unchanged from `c54be430fafa56db108300ea141c68adfb693f01`.

## Setup

- Configured model: `gpt-5.6-luna`, high reasoning effort.
- Codex CLI 0.153.4; Node 26.5.0; Python 3.14.6 adapter.
- One trial per case, paired rules off/on, with first-arm order counterbalanced.
- On arm: existing `ultra` instructions, referenced checklists, and checker.
- Off arm: no lazy instructions. The existing Codex adapter disables project
  documentation, skill instructions, bundled skills, plugins, apps, and memory.
- Fresh Git workspace per call; no dependency installs; 180-second timeout.
- CLI usage reports do not independently identify the resolved model or cost.

## Results

| Case | Off behavior | On behavior | Manual review |
| --- | --- | --- | --- |
| Dependency duplication | Pass | Pass | Off delegates to `suite.hasOnly()`; on keeps a handwritten traversal. |
| Collection cleanup | Pass | Pass | On uses a 9-line fixture and saves regression tests; off uses a 47-line fixture with extra setup/error bookkeeping. |
| Empty-string error | Pass | Pass | Identical runtime fixes; on also saves regression tests. |
| Necessary guard | Pass | Pass | Both keep the guard. On leaves the fixture unchanged; off rewrites the unrelated `else if` branch. |

The dependency case exposes a grader limit: it proves selection behavior and
single traversal, not dependency reuse. The rules-on solution passes that
grader while missing the manual reuse objective:

```js
function hasExclusive(suite) {
  return suite._onlyTests.length > 0 || suite._onlySuites.length > 0 ||
    suite.suites.some(hasExclusive);
}
```

The rules-off solution delegates to the existing method:

```js
function hasExclusive(suite) {
  return suite.hasOnly();
}
```

## Recorded measurements

| Arm | Behavior checks | Total wall time | Reported tokens, including cache reads |
| --- | --- | --- | --- |
| off | 4/4 | 356.3 s | 392,741 |
| on | 4/4 | 424.6 s | 481,115 |

The on arm includes checklist/checker work and, in two cases, saved tests.
These are single-run observations, not an estimated speed, token, or quality
gain. The CLI also warned about ignoring an unrelated malformed local reviewer
role; no reviewer subagents were launched.

## Interpretation

All eight behavior checks passed; this run shows no correctness advantage for
either arm on these familiar, explicitly described cases. Manual review found
both benefits and a miss with rules on. Keep the dependency-reuse criterion
separate from the automated verdict. Do not tune or expand instructions on the
strength of this one smoke run.

The fixtures use minimized framework surrogates, not real Vitest processes or
Mocha typings. Raw results, prompts, generated workspaces, and Codex transcripts
were retained locally under `benchmark-results/2026-09-08/luna-pr-regressions/`;
only this summary is included in the PR.
