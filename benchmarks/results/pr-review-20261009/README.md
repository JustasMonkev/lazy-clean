# PR review evidence: minimal necessary code

Improve the package's decisions, not its line-count score. The inspected base is
`8f38b32bae676c300d03191c2668e4f0c1271544`. It already protects useful single-caller
helpers, contracts, accepted inputs, meaningful regression tests, and surgical
scope. Those protections were retained rather than reinvented.

## Research configuration and coverage

Twelve research agents were requested as **GPT-6.1 Sol, high reasoning**: a
researcher, independent rule analyst, and critical reviewer for each of
WebdriverIO, Playwright, Linux, and held-out Node.js. Every spawn accepted that
configuration; no unavailable model configuration or substitution was reported.
This records the requested/accepted configuration, not independent inspection
of the backend model. The lead orchestrated implementation and validation.
At most six workers ran alongside the lead. WebdriverIO/Playwright began first;
Linux began as slots became available, followed by the independent Node triad.

| Corpus | Core sample | Coverage | Detailed roles |
| --- | --- | --- | --- |
| `webdriverio/webdriverio` | 7 PRs: 5 merged, 2 closed/unmerged | Fixes, features/API work, refactors, tests; +18/-5 through +3384/-523 | [Research](wdio-research.md), [analysis](wdio-analysis.md), [critique](wdio-critique.md) |
| `microsoft/playwright` | 8 PRs: 6 merged, 2 closed/unmerged | Fixes, features, refactors, tests, small CI change; +21/-0 through +1225/-1092 | [Research](playwright-research.md), [analysis](playwright-analysis.md), [critique](playwright-critique.md) |
| `torvalds/linux` | **0 GitHub PRs**; 4 separately labeled mailing-list chains | Exhausted abstraction, disputed NULL guard, sysfs/cleanup contract, hardware error sequence; 2 mainline commits verified | [Research](linux-research.md), [analysis](linux-analysis.md), [critique](linux-critique.md) |
| `nodejs/node` | 5 researcher cases plus 3 independent critic cases | Held-out simplifications, test oracles, loop performance, lifetime, safe Promise wrappers, and deliberate catches | [Research](node-research.md), [analysis](node-analysis.md), [critique](node-critique.md) |

The first two core samples total **15 PRs: 11 merged and 4 closed without merge**.
Replacement PRs and supplementary critic cases are listed separately, not added
to that total. A closed PR can be superseded or abandoned; it is not automatically
an approach rejection.

Sampling was purposeful and keyword-biased, not random. Repository-scoped
searches discovered candidates using reuse, duplication, abstraction, helper,
unnecessary, simplify, readability, and relevant test/error terms. Comment-count
sorting favored substantive discussions; additional small changes and
counterexamples balanced the sample. Each role's report records exact queries,
limits, screened candidates, exclusions, and actual deep-reading coverage.
Search matches are discovery, not proof that every inline comment was searched.
No frequency, precision, acceptance-rate, or repository-wide claim follows.

For useful examples, the reports link the PR, exact comments, original hunks and
commit IDs, author replies, revised/final code, and outcomes. They separate an
author's “done,” explicit approval, unremarked code, integration, and demonstrated
correctness. Several historical original commits no longer resolve: those cases
use exact primary review hunks and mark whole-original-file verification absent.

Linux's public mirror currently shows zero open/closed PRs and restricted
creation; REST enumeration returned 404 and search was empty. Kernel mailing-list
messages are an explicit substitute, not a claimed Linux PR sample. Official C
documentation supplies language context, not invented reviewer discussion.

## Evidence-backed decisions

| Finding | Evidence and qualification | Package change |
| --- | --- | --- |
| Durable rationale can earn its place | [WDIO #14319](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2752714991) explicitly asks for a named workaround and upstream issue link; [#12430](https://github.com/webdriverio/webdriverio/pull/12430#discussion_r1528842046) requests merger rationale. Its final comment mentions capabilities absent from the key list, so accuracy must be checked. Playwright ordering and Linux hardware cases corroborate. | Replace blanket comment bans across skills, rules files, hook fallback, OpenCode, and README. Keep accurate non-obvious constraints, workarounds, and ordering beside code; remove narration and obsolete edits. No new suppression recipe. |
| Reuse must preserve the actual contract | [Playwright #31727](https://github.com/microsoft/playwright/pull/31727#discussion_r1685794347) distinguishes exact paths from regex filters and reuses an existing path helper. [#34238](https://github.com/microsoft/playwright/pull/34238) needs the actual OS dependency. WDIO's existing custom merger removes an unnecessary extra helper. | Add a concise contract, ownership, errors, lifecycle, and availability check to the reuse step and delivered instructions. Existing deeper boundary guidance stays. |
| Module mocks and interaction assertions need ownership analysis | [WDIO #8156](https://github.com/webdriverio/webdriverio/pull/8156#issuecomment-1160839539), superseded by merged #8456, explains why package isolation and an autoCompile call assertion test changed orchestration. The isolated production subject still runs; this is not a test-local copy. | Qualify the emitted `no-module-mocking` message and explanation. Keep detection/review severity. Do not inject production dependencies solely to remove a useful mock. Align short test guidance with existing test-quality-review principles. |
| More code can preserve behavior | [WDIO #15221](https://github.com/webdriverio/webdriverio/pull/15221) rejects a short guard that loses logging, then accepts two useful helpers and transformed-body tests. Playwright #41806 removes an unhelpful internal test while retaining lifecycle handling. | Keep existing useful-helper protection. Replace lazy-review/audit net-line scoring and “Ship” conclusions with a concrete complexity benefit and scoped finding result. |
| Error containment can be deliberate | [WDIO #15331](https://github.com/webdriverio/webdriverio/pull/15331) allows later telemetry batches after one failure. Linux ADT7316 rejects an early error exit during interface switching. | Qualify manual catch-log-continue advice: verify callers tolerate failure and later work/cleanup still run. This is not permission to hide data loss or make every error best-effort. |
| C needs its own manual reasoning | CRC32C abstraction removal follows migrated use cases; r8188eu's NULL-removal claim lacks reachability proof; ad9832's helper success value is not a sysfs byte count; ADT7316 preserves three writes. Linux style permits ordinary `tmp`/`i` locals. | Explicit C manual scope: widths/signedness, pointer ownership, allocation failure, locking, cleanup. Remove temporary-variable names as a standalone proxy for debug leftovers. No C scanner or TS/JS rewrite rule. |

Most requested themes were already handled appropriately by current guidance.
The evidence does **not** justify a new regex for helper count, cross-module
duplication, naming, impossible-state guards, or test value. These decisions need
callers, state, ownership, and domain knowledge. No dependency, matcher, rule ID,
severity, automatic exemption, or new production abstraction was added.

## Before/after examples

### Package advice

| Before | After |
| --- | --- |
| “Do not add code comments.” | Keep or add accurate non-obvious constraints, workaround references, and ordering; remove narration. |
| “Module mocks patch the loader instead of the design. Inject…” | Review whether the mock bypasses the subject or isolates a package/loader contract; use an existing fitting seam. |
| “same logic, fewer lines”; finish with net removable lines | Clearer equivalent logic with its contract preserved; describe removed complexity and maintenance cost. |
| Temporary variables named `test`/`tmp`/`debug` as debug leftovers | Look for unsupported transient tracing/scaffolding; local names alone are not waste. |

### Actual reviewed code

WDIO #14319's reviewed helper deduplicated serialized representations:

```ts
return Array.from(new Set(nodes.map(node => JSON.stringify(node)))).map(res => JSON.parse(res))
```

The accepted final helper deduplicates element identity while retaining original
objects and the helper's issue-linked rationale:

```ts
const ids = new Set()
return nodes.filter((node) => !ids.has(node[ELEMENT_KEY]) && ids.add(node[ELEMENT_KEY]))
```

These are exact excerpts; the research report contains immutable original/final
refs, complete relevant helper snippets, replies, and approval. The final has
more statements but a clearer, narrower identity contract. The scanner misses
the distributed stringify/parse pattern, which is a coverage limitation rather
than a reason to infer all such pipelines are bad.

Playwright #31727 adds an unaffected file and a negative output assertion after
review. That extra code distinguishes correct test selection from running every
file. WDIO #12430's reviewer removed the proposed implementation and reported
that the original test stayed green, then requested a discriminating reproducer.
Those are concrete test-oracle lessons; merely shrinking test bodies is not.

Linux ad9832 shows why direct returns can be incorrect: a write helper returns
zero on success, whereas a sysfs callback must return `len`. The author challenges
the shorter suggestion; revised handling retains the success contract. Its
final mainline outcome was not verified and is not presented as merged.

## What the checker flags and where it is wrong

The checker exposes **43 TS/JS rule IDs**, covering type evidence, catch/error
handling, redundant expressions, wrappers/clones, array passes/copies, test
patterns, comments, and suppressions. It does not establish reuse, helper value,
test quality, runtime correctness, or C safety. `--explain` and manual triage are
part of using a finding; an advisory match is not a verdict.

| Pattern | Useful signal | Legitimate case or missed behavior |
| --- | --- | --- |
| `no-module-mocking` | Mock replaces the subject or obscures an available production seam | Intentional package isolation/loader contract still matches; changed advice now permits retaining it with evidence. |
| Narration/change-note/doc comments | Repeats code, signature, or obsolete editing history | Causal ordering or durable rationale can match a prefix. Exact WDIO issue comments were not flagged; the blanket guidance was the defect. |
| `no-json-clone` | Nested lossy copy inconsistent with ownership/data contract | Intentional JSON normalization can be valid. WDIO's two-map roundtrip is not detected. |
| Arbitrary sleep | Wait guesses instead of synchronizing with a signal | A non-completion or timing-policy test can intentionally need time; advisory false positives remain. |
| Empty/fake-success catch | Required failures are hidden | Optional operations, cancellation sentinels, and first-error precedence can need containment. Promise `.catch` forms also fall outside some lexical patterns. |
| Type assertions and broad types | Unsupported type evidence | Runtime bridges or vendor contracts need manual proof. Neither a finding nor a clean scan proves byte units, ownership, or external validity. |

Whole historical-file scans found 174 WDIO and 199 Playwright findings in their
analysts' selected files. Those include pre-existing code, overlapping files, and
unrelated regions; they are **not** PR-added findings or precision measurements.
No source was rewritten to make those totals smaller.

Playwright #34949 is a concrete warning against approval as correctness proof.
Review asked for byte length; the inspected merge uses element length in Buffer
operations. A reduced native wire-copy probe succeeds for Uint8 but fails for
Uint16/Uint32/Float64, while a shared-backing test misleadingly succeeds. The
analyst and critic traced the relevant transport paths independently. This is
immutable-source plus reduction evidence, **not** a full historical remote
Playwright reproduction or a statement about current main.

## Validation and held-out result

Rules were frozen before Node retrieval using SHA-256 in
[rule-freeze.json](rule-freeze.json). Agents read frozen package/raw Node
artifacts without derivation reports or proposed answers. One CLI assertion was
updated after the freeze when an old ADR-specific wording expectation failed;
checker/guidance hashes stayed fixed during evaluation. The analyst records that
test-only manifest drift. Role reports retain their actual inspection timing.

The frozen Node result is deliberately **mixed**:

- Useful passes/qualifications include #59700's audited dead reporter flexibility,
  #57144's deterministic error setup, #61871's retained loop after a challenged
  one-line alternative, #12712's retained falsy-rejection behavior, and #44943's
  necessary WeakReference-container deletion.
- Independent #38650 retains a SafePromise boundary while simplifying an
  appropriate caller; #46536 contains optional platform-feature failure.
- **FAIL:** [#45204](https://github.com/nodejs/node/pull/45204#discussion_r1014823447)
  explicitly prefers a meaningful catch comment over an eslint suppression.
  The frozen `no-empty-catch --explain` still says not to add a comment despite
  the revised general policy. The correct outcome preserves the original test
  failure, awaited hooks, once semantics, and local lint convention.

The implementation record below distinguishes any post-evaluation consistency
repair from the untouched frozen result. No statistical or uniformly passing
held-out score is claimed.

After all three held-out roles completed, the lead corrected that exact
`no-empty-catch` contradiction: verification remains required, comments solely
to silence the checker remain discouraged, and accurate failure rationale can
remain beside code for local style/lint conventions. The same absolute wording
was aligned in the assertion explanation. A CLI regression expectation protects
the distinction. This is a **post-holdout consistency repair**, not an untouched
blind pass of the final package. Local commit `69d8c6c` preserved the frozen
guidance. Publishing through the authenticated API changed commit metadata;
`rule-freeze.json` records the published commit and original local identity.
Their Git tree SHA is identical. The bounded Node probe reconstructs the
published snapshot and compares baseline, frozen, and final detection while
reporting manifest/working-tree drift.

Package tests also caught the existing compact-prompt budget. The lead shortened
redundant wording without increasing the limit or changing its guidance tests.
Core prompts now use 692–695 words and fallbacks 696–697, below 700 in every
mode. This delivery-budget repair is recorded after the frozen evaluation.

Rerunnable local evidence:

```sh
npm test
node benchmarks/results/pr-review-20261009/validate.mjs
node benchmarks/results/pr-review-20261009/node-probe.mjs
node skills/slop-check/scripts/check.mjs --since=8f38b32bae676c300d03191c2668e4f0c1271544 --json
git diff --check
```

[validation.json](validation.json) records **14 paired checker probes** with
unchanged rule/position/severity detection and **3 semantic reductions**: ID
deduplication preserves identity, a call oracle catches skipped orchestration,
and removing best-effort containment changes later work. The probe's intentional
empty catch remains an advisory finding and is retained as the counterexample;
no ignore directive was added. These are local reductions, not upstream tests.

[node-probe-results.json](node-probe-results.json) records **17 original/final
excerpts** with baseline, frozen, and current scans, plus **3 exact-fragment
reductions** for callbackify, tracePromise, and the reporter's error guard.
The complete final diff scan retains one review-severity `no-empty-catch`
finding in the intentional best-effort reduction at `validate.mjs:55`; the
changed production/checker and package-test paths scan without findings.

[stress-validation.json](stress-validation.json) records a full-suite failure in
two assertions of the unchanged 16 MB no-EOF input case, followed by two isolated
baseline and two isolated final passes. The input reader, mode tracker, and stress
test have no diff from baseline. These reruns do not establish a timing guarantee
or erase the failed run; no timeout or test was weakened.

The next full `npm test` attempt passed all 812 hook checks and 785 guidance
checks, along with checker, CLI, feedback, benchmark, and SOLID benchmark suites.
It then failed three assertions in the unchanged verification bridge with
`ENGINE_PROTOCOL_ERROR: Engine did not consume its request`. A clean baseline
worktree reproduced that same protocol failure in two assertions, including one
shared with the revised full run. A subsequent isolated revised bridge run
passed. These observations establish intermittent failures in unchanged code,
not their precise cause. **The full final `npm test` attempts exited 1**; the
isolated pass is not presented as a clean full-suite result. Verification code
and tests were not changed for this task.

[validation-summary.json](validation-summary.json) records configurations,
current guidance hashes, both failing full attempts, the baseline comparison,
and targeted results. All nine package test groups passed across the final
full and targeted runs; the separate token-path suite passed all 10 tests.
That distributed validation does not erase the full-run failures above.

[skill-validation.json](skill-validation.json) records five valid changed skill
frontmatters. The generic validator rejects lazy's pre-existing `argument-hint`
field on both baseline and revised files. That incompatibility was not “fixed”
by removing the platform's existing command metadata.

## Limits

This is bounded qualitative review research, with old and new PRs and deliberate
counterexamples. Historical hunks can be incomplete context; several original
trees were unavailable. Linux GitHub PR sampling could not be fulfilled and was
substituted transparently. Kernel builds, hardware tests, upstream Node/WDIO/
Playwright suites, upstream benchmarks, and an AI code-generation A/B experiment
were not run. Reviewer-reported execution and inspected tests are labeled as
such. Guidance usefulness is supported by these chains and probes, not proof
that every project or future model will write less code correctly.
