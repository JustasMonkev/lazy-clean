# Preregistered paired Appium evaluation

Prepared independently from baseline source and corrected focused tests, before any candidate/model/condition outcomes. This is a task-design artifact, not the final blind judgment. Freeze this document and both hidden suites before launching workers; record their hashes with the experiment artifacts. Any later protocol change must be dated, justified and applied to every candidate.

## Exact worker contracts

Use these same contracts in both conditions. Change only the intended skill treatment; do not give hidden tests or corrected patches to workers.

### URL validation

Fix `packages/base-driver/lib/protocol/validators.ts` so `validators.setUrl` rejects every non-string input with the ordinary `Error` named `Error` and message `Url or Uri must start with <scheme>://`, without invoking input-owned methods or coercing input. Preserve the existing acceptance policy for all string values, including unusual strings containing `about:` or `data:` away from the beginning; do not replace it with standards-based URL validation. Preserve successful return behavior and unrelated network validation. Add saved, rerunnable regression tests and actually run them. Keep the change scoped to this fix and its verification.

### CLI transformers

Fix `packages/appium/lib/schema/cli-transformers.ts` so both CSV and JSON transformers read an argument as a file only when it resolves to a regular file. Existing directories, symlinks to directories, nonexistent paths, dangling symlinks and filesystem-probe errors must fall back to the existing literal-input parser. Follow symlinks to regular files. Preserve file-first precedence, multiline CSV file parsing, single-line CSV literal behavior, trimming/empty-token behavior, existing JSON.parse output, and existing parse-error messages with their original causes. After identifying a regular file, a read failure must still become the existing argparse `ArgumentTypeError` with its path and original read message, not a literal fallback. Inputs are strings: no new runtime contract is requested for non-string CLI arguments. Add saved, rerunnable regression tests covering both transformers and actually run them. Keep the change scoped to this fix and its verification.

### Common harness allowance

Historical whole-project dependencies are known to prevent a reliable full build/typecheck. Every worker receives the identical supported focused harness: the actual target TypeScript module is transpiled to CommonJS, with real installed dependencies, and saved built-in `node:test` files consume `process.env.CANDIDATE_MODULE`. Transpilation is not typechecking. This limitation is shared and must be reported; candidates must not copy the implementation into tests, replace argparse with a fake, claim a project build passed, or change the harness to bypass failures.

## Frozen hidden verification

Run each suite against the compiled actual candidate, not a reimplementation:

```sh
CANDIDATE_MODULE=/absolute/path/to/candidate.cjs node --test /tmp/lazy-paired-hidden-url.cjs
CANDIDATE_MODULE=/absolute/path/to/candidate.cjs node --test /tmp/lazy-paired-hidden-cli.cjs
```

The hidden URL suite checks normal rejection for nonstrings, legacy string policy and unrelated network behavior. The hidden CLI suite checks literal inputs, directories and directory symlinks, actual path-probe failures, regular files and file symlinks, newline/empty handling, JSON values and parse causes, and read-failure semantics. Its transient `fs.readFileSync` stub targets only an existing fixture path and reloads the target CommonJS module; it preserves the real argparse dependency and restores module/fs state in `finally`. This models a regular file becoming unreadable after the probe without platform-dependent chmod assumptions. It is not a requirement to use a particular helper or source layout. If a candidate legitimately delegates to an already-cached module with a captured read function, independently inspect/reproduce that equivalent failure path before counting a harness miss as a defect.

Preflight performed on 2026-09-10 using Node v26.5.0 and the exact baseline/corrected sources compiled by the coordinator under `/tmp/lazy-paired-fixture-validation`:

| Task | Fixture | Exit | Passed / total | Actual discriminating result |
| --- | --- | ---: | ---: | --- |
| URL | `url-baseline.cjs` | 1 | 2 / 3 | Non-string rejection returned TypeError instead of Error |
| URL | `url-corrected.cjs` | 0 | 3 / 3 | All hidden checks passed |
| CLI | `cli-baseline.cjs` | 1 | 6 / 7 | Existing directory attempted a read and raised EISDIR-wrapped ArgumentTypeError |
| CLI | `cli-corrected.cjs` | 0 | 7 / 7 | All hidden checks passed |

Baseline failures occurred for the actual requested bugs, not missing dependencies or syntax. Each grouped test stops on its first failing assertion: test counts are not counts of independently observed edge-case outcomes. Passing the suites demonstrates these cases, not exhaustive correctness.

## Failure gates

Apply gates before scores. A failing candidate cannot outrank a passing candidate by having shorter code or nicer prose.

1. **Deliverable validity:** actual target source exists, focused compilation/runtime loading works, required exports are retained, and submitted changes are reviewable. Timeout with no working deliverable is incomplete. Infrastructure failure is separately marked and not silently counted as model failure.
2. **Requested behavior and preservation:** every applicable hidden check passes. An independently demonstrated contract regression also fails this gate even if the suite misses it. Novel judge findings require a minimal reproducer and equal rechecking of all candidates; do not silently rewrite hidden tests after seeing identities.
3. **Saved regression evidence:** relevant tests are saved, run successfully on the candidate, and fail on the unmodified baseline for the intended bug. URL tests must distinguish the ordinary validation error from TypeError. CLI tests must cover the directory regression in both CSV and JSON, not just one. Test failure due only to imports/harness problems does not count as regression detection. Further coverage affects the score below.
4. **Integrity and scope:** no hidden-test access, copied corrected solution, weakened checks, fake dependency replacing argparse, unrelated destructive edits, or materially false verification claim. Minor omissions in a summary lose report points; fabricated passing checks fail this gate. Preserve an audit trail rather than infer misconduct solely from code similarity.

Record each gate as PASS / FAIL / UNVERIFIED with evidence. UNVERIFIED is not a pass and must not be assigned an invented score.

## Strict rubric, 100 points

Grade source, saved tests and supported evidence, independently of model, condition, elapsed time and line count. Record a concrete reason for every deduction; do not reward verbose reports or penalize legitimate concise solutions.

| Dimension | Points | Full-credit standard |
| --- | ---: | --- |
| Requested correctness | 30 | Every requested input and branch behaves correctly; shared problem solved for both CLI transformers; no coercion or wrong error type at URL boundary |
| Behavior preservation | 20 | Existing formats, exact error contexts/causes, success outputs, symlink/file precedence, read failures and unrelated behavior retained |
| Saved test quality and regression sensitivity | 20 | Saved tests exercise actual implementation, kill the baseline bug, assert meaningful outputs/error identity, cover requested alternate paths and risky failure modes, and clean fixtures/stubs reliably |
| Readability and maintainability | 15 | Direct flow, locally understandable names and error boundaries, existing style, no opaque compression, redundant state or speculative abstractions; useful helpers remain acceptable |
| Applicable design principles | 10 | Responsibilities and exception boundaries reflect different reasons to change; reuse avoids policy drift without unnecessary indirection; no interfaces/config/extensions added solely to satisfy a slogan |
| Scope and truthful handoff | 5 | Only needed source/tests changed, no unrelated cleanup/dependencies/generated churn, summary accurately distinguishes tests, transpilation, typechecking and unavailable checks |

For test quality, allocate 8 points to meaningful regression detection, 8 to preservation/alternate-path coverage, and 4 to isolation, rerunnability and cleanup. Running extra tests is not itself worth points; relevant evidence is. Full points require more than a smoke test. A large parameter table is not automatically better than a few discriminating assertions.

SOLID applicability must be explicit: SRP/separation of file classification, read failure and parsing is relevant in CLI code; OCP is relevant only if a submitted abstraction creates needless extension machinery; LSP concerns preserving existing exported behavior, not requiring subclasses; ISP is normally N/A; DIP does not require a filesystem interface in this small synchronous utility. URL validation typically needs no architecture change. Mark nonapplicable principles N/A without a penalty or free invented subscore. Do not insist on a helper, ban a helper, or demand minimum line count.

For failed-gate artifacts, report defect severity and diagnostic rubric observations, but label any numeric score provisional/non-ranking. For gate-pass artifacts, use point totals to rank within the same task. Report ties when evidence does not support a meaningful distinction. Never compare raw URL and CLI code sizes as quality scores.

## Saved-test mutation audit

At minimum, rerun each candidate's saved tests against its baseline compiled module and against its own compiled module. Freeze a small reference mutant pool if stronger coverage measurement is desired, before worker outputs are inspected:

- URL: original nonstring bug; tightened anchoring that rejects previously accepted prefixed `about:`/`data:` strings.
- CLI: CSV directory fix missing while JSON is corrected; JSON directory fix missing while CSV is corrected; file-classification stat exceptions escape instead of falling back; regular-file read errors swallowed into literal parsing.

These are behavioral mutants, not mandates on candidate syntax. The coordinator can supply CommonJS fixture modules under the same `CANDIDATE_MODULE` contract; do not mechanically rewrite arbitrary candidate source and mistake syntax failures for kills. A mutant is valid only if it compiles/loads, differs by the intended behavior, and the corresponding hidden check detects it. Count only failing behavioral assertions as kills. Reference mutation detection measures saved test coverage of the contract, not source-specific mutation adequacy. Baseline red/candidate green can already establish the core regression; mutation work is extra evidence, not required churn in worker code.

## Pairing, budget and blindness

- Use identical historical snapshots, task wording, dependencies, harness, tool access, model settings, output requirements and 600-second wall-clock limits for every run. A model must be verifiably the requested model; a similarly named route is not a silent substitute.
- Plan 3 fresh repetitions x 2 tasks x 3 models x 2 conditions = 36 first-pass artifacts. Pair within task/model/repetition. No repair after deadline or after hidden/judge feedback. If a later repair study is run, label it separately with the same repair allowance for all conditions.
- Alternate/randomize condition order within pairs and balance model/task order. Record concurrency and host contention; avoid always placing one condition under greater load. Measure elapsed time consistently from worker-ready/task-delivery to completion/deadline. Skill-reading time is part of treatment cost unless explicitly declared otherwise for both groups.
- Start fresh contexts and worktrees. Without-skill workers must not inherit lazy instructions through system/developer prompts, parent history, AGENTS.md, automatic plugin activation or condition-specific tool scaffolding. If that cannot be prevented, label the experiment as the marginal effect of added skill text on an already-instructed environment, not lazy versus no-lazy.
- Keep a private ID-to-model/condition map. Fresh blind judges receive randomized artifact IDs, task contract, pristine source, task-owned diffs, saved tests and normalized verification evidence. Remove model names, condition names, characteristic path labels and explicit skill mentions from review packets, preserving code and factual check content. Keep originals for later audit. Do not ask judges to guess identities.
- Freeze judge instructions and rubric before reviewing artifacts. Judge gate decisions and scores are finalized before revealing model/condition labels. Ideally duplicate blind scoring with a second fresh judge, adjudicating disagreements with exact code/test evidence; if only one judge is used, report that limitation.
- Cost/time/token measurements are unblinded coordinator metrics, not inputs to blind quality scores. Report only actually available counters; do not equate output tokens with total cost.

## Reporting limits

Present per-artifact gates, quality scores, saved-test evidence, time/cost when measured, and paired within-task/model differences with all three repetitions visible. Give medians/ranges descriptively. Three runs per cell and two small Appium bugs are insufficient to establish broad causal claims, universal model superiority, or general software-engineering improvement from the skill. Avoid pooled averages hiding a correctness failure. Keep incomplete runs and infrastructure problems visible, and distinguish successful focused runtime verification from an unperformed full build/typecheck.
