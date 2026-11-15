# GPT-6.1-sol simple-project validation

## Result

All 24 fresh GPT-6.1-sol submissions passed their local tests and the frozen
hidden checks: 12/12 under the previous rules and 12/12 under the revised rules.
Two independent reviewers, each inspecting 12 anonymized submissions, found no
production defect or unnecessary design machinery within the stated contracts.
This supports the revised guidance on these projects; it does **not** establish
an overall improvement over the previous rules or guarantee future correctness.

Each cell below averages two passing runs. Lines exclude blank lines; both
measurements include all production modules and exclude test code.

| Project | Previous pass | Revised pass | Previous → revised bytes | Previous → revised lines |
| --- | --- | --- | --- | --- |
| settings-report | 2/2 | 2/2 | 559 → 565 | 16 → 16 |
| shopping-basket | 2/2 | 2/2 | 945 → 905 | 23 → 18 |
| audited-drafts | 2/2 | 2/2 | 426 → 426 | 17 → 17 |
| catalogue-expiry | 2/2 | 2/2 | 503 → 504.5 | 14 → 14 |
| notes-http | 2/2 | 2/2 | 1,074 → 1,118 | 26 → 38 |
| report-review | 2/2 | 2/2 | 267 → 267 | 3 → 3 |

The revised basket submissions used fewer lines while deriving totals and
preserving owned snapshots. HTTP differences were largely formatting; longer
code was not a defect. All four report-review submissions left production
unchanged. All cache submissions kept the required cache, and all audit/HTTP
submissions retained necessary error handling. No submission added dependencies.

Independent reviews identified limitations in some worker-written tests:
Unicode writes could coalesce, frozen input could hide attempted mutation,
and some error-message, error-identity, adapter-failure, or pending-write checks
were absent. These are recorded per submission in the raw reviews; the worker
outputs were not edited after collection. Frozen hidden checks independently
cover split UTF-8 requests and several of these error/ownership paths, but are
not exhaustive. Production behavior and test quality are separate conclusions.

The full repository `npm test` passed on Node v24.22.1 / npm 11.9.0. The new
suite accepts six reference fixes and six alternatives, rejects 33 faulty
variants, and restores all references. Five broken starters fail; the correct
negative control passes. The task-scoped scanner is clean (7 files).
An independent verifier also passed the project suite and adjacent core and
implementation benchmark tests.

Scanner results are not uniformly clean: 23/24 project scans exited 0; `r06`
exited 1 on two `await Promise.resolve()` test yields. They intentionally allow
promise reactions before checking pending operations; retain the recorded
finding rather than suppress it. The full repository scan exits 1 on two
unchanged findings in `hooks/lazy-state.js:27` and `benchmarks/run.mjs:196`.
Neither finding was introduced by this change.

Raw [submissions, diffs and logs](results/sol-simple-projects-20261115/results.json),
[model requests and run order](results/sol-simple-projects-20261115/manifest.json),
[coding rules](results/sol-simple-projects-20261115/guidance.json),
[anonymous design reviews](results/sol-simple-projects-20261115/design-reviews.json),
[independent verification](results/sol-simple-projects-20261115/independent-verification.md),
and [final judgment](results/sol-simple-projects-20261115/final-judgment.md)
are retained. Every first submission is included. Model identity is the explicit
host request, not a claim of independently inspecting model internals.

## Protocol fixed before model trials

The user requested simple projects to test the revised lazy-clean rules with
GPT-6.1-sol. This extends the earlier two-function smoke with six projects,
each containing two or three production modules and a runnable Node test entry.
The settings tool and basket exercise child-process entry points; notes uses
real HTTP requests on an ephemeral loopback port.

| Project | Required behavior | Design question |
| --- | --- | --- |
| settings-report | Missing-file defaults; exact CLI schema; malformed/read errors; false and zero | Is recovery confined to an actual optional-file failure? |
| shopping-basket | Updates/removal/reset; totals; ordering; owned receipt snapshots | Are cheap totals derived without deleting snapshots? |
| audited-drafts | Required audit completion and original failure semantics | Does catch scope report the correct operation's failure? |
| catalogue-expiry | Per-ID cache, completion-time TTL, explicit values, failed refresh | Does simplification preserve the required cache? |
| notes-http | JSON validation, Unicode streams, status/body, persistence failures | Are real boundary guards and error responses retained? |
| report-review | Correct existing helper, fresh results, explicit empty/zero values | Can the agent leave already-simple code alone? |

The comparison uses the full-mode coding rules from base revision
`780b716ade38ff6eee08dbf5640501090bceb807` and revised revision
`cc7515ed50a032c9c0db521b4e158cd1f446bd0f`. Each project runs twice under each
version: 24 fresh-context worker sessions. Every worker explicitly requests
the host model identifier `gpt-6.1-sol`. No model or effort change is made
between arms. The host's reasoning default and shared host instructions remain
possible influences; this is not a clean-room model API experiment.

Workers receive one isolated project, its behavioral task contract, the
assigned rules, and matching supporting references/checker. They are instructed
not to read other workspaces, grader source, reference fixes, mutants, or design
rubrics. This is instruction-level isolation on a shared filesystem, not an OS sandbox.
They add and run their own local tests. Hidden checks are applied only after
their submission; no hidden-test feedback is supplied during the trial.

Run order and anonymous identifiers are fixed before execution. Both trials
and all outputs are retained; failures are not replaced by a better attempt.
Correctness is evaluated before code size. Production source bytes, nonblank
lines, and changed files are descriptive measurements, not quality scores.
Design review uses anonymous submissions with the task and separate rubric,
without the rules version or behavioral verdict. Required guards, caches,
snapshots, and error reporting count as useful behavior, not slop.

The cases are new development fixtures, not independently collected real-world
holdouts. Two trials per case cannot establish statistical superiority or
universal reliability. These runs exercise coding guidance; hook delivery and
the guided multi-agent workflow require separate checks.

## Validate or rerun

```sh
node tests/simplicity-projects.test.mjs
npm test
node benchmarks/run.mjs /path/to/agent-config.json /path/to/new-results settings-report
```

For the last command, set `taskSet` to `simplicity` in the existing runner
configuration. That runner compares rules **off/on**, unlike the recorded
base/revised experiment here; do not label its results as the same protocol.
Choose an exact available model and disable unrelated client configuration in
both arms as described in [the benchmark guide](README.md).

Before any worker ran, independent oracle review found and corrected coverage
for asynchronous failed audits, A-to-B-to-A cache access, split UTF-8 request
bodies, and extra settings fields. Faulty variants must fail these checks while
reference implementations and legitimate alternatives pass. Production fixture
starters retain their defects so the task still requires meaningful work.

## Replay recorded projects without another model call

From the repository root on Node 24 (the recorded worker tests may use
`Promise.withResolvers`), the following extracts all 24 submissions into fresh
temporary folders, runs their local tests, and reruns the hidden checks. The
printed location contains runnable project folders for manual inspection. It
replays submitted code; it does not reproduce model generation.

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {grade, runAgent} from './benchmarks/run.mjs';
import {tasks} from './benchmarks/simplicity-projects.mjs';
const runs = JSON.parse(readFileSync('benchmarks/results/sol-simple-projects-20261115/results.json'));
const root = mkdtempSync(join(tmpdir(), 'sol-project-replay-'));
for (const run of runs) {
  const cwd = join(root, run.id);
  mkdirSync(cwd);
  for (const [name, source] of Object.entries(run.files)) writeFileSync(join(cwd, name), source);
  const local = await runAgent(['npm', 'test'], cwd, '', 30000);
  assert.equal(local.error, null, local.stderr);
  assert.equal(local.status, 0, local.stdout + local.stderr);
  const verdict = await grade(tasks.find(task => task.id === run.task), cwd);
  assert.equal(verdict.pass, true, verdict.output);
  console.log(`${run.id} ${run.task} ${run.arm}: local and hidden checks pass`);
}
console.log(`Runnable projects retained at ${root}`);
NODE
```
