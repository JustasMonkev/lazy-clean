# Paired experiment harness audit

## Scope and independence

Reviewed only `/tmp/lazy-paired-run.py`, `/tmp/lazy-paired-setup.py`, `/tmp/lazy-paired-mutants.cjs`, frozen `protocol.json`, the design/hidden-suite hashes, and reference-mutant logs/manifest. No worker event streams, handoffs, candidate contents or per-model quality outcomes were inspected. Completion-file existence was used to select frozen artifacts for automated grading. This is a harness audit, not a blind quality judgment.

## Verified preflight

- Both final protocol task requests exactly match the corresponding preregistered worker contracts, checked programmatically.
- The copied design document and both hidden suites match all three frozen SHA256 values.
- There are 36 plans, with one identical baseline-source hash per task and one common runner hash across all plans. Every task/model/repetition has both arms; condition ordering alternates across repetitions/tasks.
- The actual Codex subprocess command supplies fresh ephemeral sessions, ignores user config, sets project-document bytes to zero, disables hooks/plugins/apps/multi-agent and enables skip-host-skill-discovery. The OpenCode command supplies `--pure`, per-run XDG locations, disabled external skills/Claude/project config, and isolated config content. These are the configured isolation controls. This static audit does not attest to the full effective provider prompt or independently inspect hidden host behavior.
- All workers receive the same focused transpilation/runtime allowance and 600-second limit. Different model hosts and effort labels remain a declared cross-model comparability limitation. Common control instructions already require scoped fixes and saved tests: this measures additional lazy guidance, not instruction-free programming.

## Frozen reference mutants

All five mutants compiled and loaded using the supplied real dependencies before the hidden suite executed. The saved logs show intended behavioral failures:

| Mutant | Hidden result | Discriminating failure |
| --- | --- | --- |
| URL string policy tightened | 2/3 passed | Previously accepted string raises normal URL Error |
| CLI CSV directory fix missing | 6/7 passed | CSV directory read raises EISDIR-wrapped ArgumentTypeError |
| CLI JSON directory fix missing | 6/7 passed | Directory result is not the expected parse TypeError |
| CLI probe errors escape | 3/7 passed | Literal inputs leak ENOENT/ENAMETOOLONG; JSON parse error contract also breaks |
| CLI read errors fall back | 6/7 passed | Required read-failure exception is missing |

ENOENT/ENAMETOOLONG thrown from the mutant's filesystem probe is an intended behavioral failure, not infrastructure. A valid mutation kill need not have the JavaScript code `ERR_ASSERTION`. Exit codes alone are still insufficient when evaluating arbitrary saved candidate tests; logs must show the intended behavioral mismatch rather than an import/collection failure.

## Actionable findings and disposition

### 1. Stale/untrusted compiled output could be graded

The original controller runs the worker-writable `task-tools/test.cjs` and then grades `.task-build/candidate.cjs` whenever it exists. Failed compilation or timeout could leave an older file there. The frozen TS hash alone did not prove that hidden tests used those frozen bytes.

**Correction:** `/tmp/lazy-paired-grade.py` independently compiles `candidate-source.ts` with the pristine installed TypeScript `transpileModule`, CommonJS/ES2022, into coordinator-owned `trusted/candidate.cjs`. It first removes any prior output, rejects diagnostics, uses real argparse, verifies the original hidden-suite hash, and records hashes linking frozen TS, fresh JS, tests and reference modules. It never repairs worker source. Each completed run gets `trusted-grade.json`, which should replace original controller checks as the adjudication source.

### 2. Saved-test and working-directory provenance

The original controller freezes tests but executes the worktree copies. The trusted grader executes frozen `saved-tests/*.test.cjs`, passing the fresh compiled module through `CANDIDATE_MODULE`. Saved tests retain the original worktree cwd so supported relative scratch paths behave like the supplied runner; hidden tests run in the trusted directory. Candidate tests that fail to load worker-relative source instead of following the environment-module contract are flagged for harness compatibility, not silently counted as production bugs. Module-import failures originating in candidate code remain distinguishable from missing test imports through the first require-stack entry.

The grader records frozen-input and compiled-output hashes again after checks to flag on-disk mutation during grading. A compatibility flag is review evidence, not a substitute for reading the relevant failure log.

### 3. Scope inventory was tracked-only

The original controller's scope violation list uses tracked Git diffs. New unauthorized files could be absent from that list. The trusted grader retains recorded status and captures fresh tracked/untracked inventories plus scaffold hashes. Owned `.task-tests/*.test.cjs`, supplied `task-tools/` and generated `.task-build/` are excluded from unexpected-path lists. Other paths are marked for review, not automatically treated as production defects: scratch artifacts and post-freeze test side effects need attribution.

### 4. Setup is not the final frozen protocol generator

The inspected setup script still has earlier abbreviated requests and does not itself recreate the later freeze/isolation metadata. The final protocol has the correct exact requests. Preserve the post-setup transformation in the reproducibility record and do not rerun setup over the frozen experiment. Coordinator owns that follow-up; this audit did not edit setup or the running controller.

## Trusted grader freeze and verification

Initial implementation was hashed before any candidate grading or outcome inspection. A subsequent uniform harness-parity correction retained the worktree cwd for frozen saved tests, without inspecting their contents or results. All earlier trusted grades were then regenerated. No worker feedback or repair was provided.

Initial trusted grader SHA256 (superseded by version 2 below):

`ee683784b1cc427e53f217b9f36b7cbf3943223308578c986dcbcbb1b397ef38`

Checks actually performed:

- Python syntax parsing succeeded.
- The grader's exact compiler/check functions compiled both known baseline fixtures and both known corrected fixtures: URL baseline hidden exit 1, URL corrected exit 0; CLI baseline hidden exit 1, CLI corrected exit 0.
- An invalid TypeScript fixture returned compile exit 2 and produced no output.
- A bounded long-running subprocess returned timeout exit 124 and its process group was terminated.
- The final script was executed against completed frozen runs without opening their candidate contents or outcome logs. It can be rerun as more runs complete; outputs are regenerated from frozen artifacts, not cached worker builds.

Commands:

```sh
python3 /tmp/lazy-paired-grade.py
python3 /tmp/lazy-paired-grade.py <run-id> [<run-id> ...]
```

Every grading subprocess has a timeout at most 30 seconds, with a 10-second Node test timeout. Full project build/typecheck remains unperformed; runtime success must not be presented as either. Final scoring, truthful-report judgment, mutation-kill interpretation and any unexpected-scope attribution remain the fresh blind judges' responsibility.

## Uniform dependency-layout amendment, grader version 2

Before any scores, the coordinator identified a relocation mismatch: a saved test legitimately imported the supplied argparse dependency through `path.resolve(__dirname, '../.task-build/node_modules/argparse')`. Moving `.task-tests` to `saved-tests` removed that sibling dependency layout. The resulting MODULE_NOT_FOUND was a coordinator harness failure, not a model defect or an invalid test.

Version 2 mirrors the two originally supplied sibling dependency locations for every frozen run: `run/.task-build/node_modules/` and `run/task-tools/node_modules/`, each linking argparse and TypeScript to the exact preregistered installed dependencies. It does not copy candidate source or worker-generated JavaScript into these locations. `CANDIDATE_MODULE` still points to freshly compiled `trusted/candidate.cjs`; compilation, hidden-suite hashes and reference mutation behavior are unchanged. Existing links must resolve to the expected installed location; conflicting directories or links are rejected rather than overwritten.

Version 2 SHA256 (superseded by version 3 below):

`5119adec277d8bf9ecabfcf7a746fe45f7e6bdfec056d62add5d7450cfb38907`

Each trusted-grade provenance now records `graderVersion: 2` and the script hash. All completed runs are regraded uniformly, with no worker feedback, repair or score-based change. Earlier dependency-relocation failures must not be used for judging.

Verification: a disposable saved-test fixture successfully imported real argparse and TypeScript from both mirrored sibling layouts, confirmed no sibling candidate module was supplied, and verified repeated dependency setup succeeds. The check passed using the grader's bounded subprocess helper. No candidate source or quality outcomes were inspected while implementing this amendment.

## Complete test-root parity amendment, grader version 3

The dependency-only amendment was insufficient: a legitimate frozen test also derived the task root from `__dirname` and created fixtures beneath its `.task-tests` directory. Relocating tests to a differently named directory broke that original scaffold relationship. This remained a coordinator relocation defect, not a test or model defect.

Version 3 executes byte-identical copies of every frozen saved test under `trusted/.task-tests/`. It recreates the known `.task-tests`, `.task-build` and `task-tools` directories under one coordinator-owned root, supplies the exact argparse/TypeScript dependency links in both original locations, and uses that trusted root as cwd. This restores both dirname-relative and cwd-relative relationships together. No production source or worker-compiled candidate is mirrored into the scaffold; `CANDIDATE_MODULE` still selects freshly compiled `trusted/candidate.cjs`.

The original frozen tests remain untouched. Each executed copy is checked against its original before execution, both hash maps are recorded in provenance (`frozenTestsSha256` and `executedTestsSha256`), and both originals and copies are checked again after grading through `frozenInputsChangedDuringGrading`. The existing compiled-output integrity check remains unchanged. The known copied scaffold directories are recreated on each grading pass to avoid leftovers from a previous pass.

Version 3 SHA256 (superseded by version 4 below):

`58b9c4958af8addce94f6a807d0eac0e40841b560d314f51ee12df58aa92eeb7`

Verification explicitly requested by the coordinator: the previously relocation-blocked completed saved-test suite now exits 0 under version 3. Its original/copied test hashes match, no original or copied test changed during grading, and compiled JavaScript remained unchanged. This check confirms harness parity only; it is not a quality judgment. All completed runs are regraded uniformly before judging, without worker feedback or repairs. Version 1/2 relocation failures must not affect any score.

## Compiled-module path parity amendment, grader version 4

A second legitimate dependency lookup derived its path from `CANDIDATE_MODULE`, whose original location was `.task-build/candidate.cjs`. Version 3 preserved the test-root layout but placed compiled output one directory higher; that still broke a supplied relative dependency relationship. This was another coordinator relocation defect.

Version 4 now preserves the full relevant layout for every execution:

- Actual module: `run/trusted/.task-build/candidate.cjs`.
- Actual saved tests: `run/trusted/.task-tests/*.test.cjs`.
- Baseline/reference module: `run/trusted/reference-runs/<name>/.task-build/candidate.cjs`.
- Baseline/reference saved tests: `run/trusted/reference-runs/<name>/.task-tests/*.test.cjs`.
- Every execution root has the same `.task-build/node_modules` and `task-tools/node_modules` links to the exact supplied argparse and TypeScript installations, and is used as that execution's cwd.

Each baseline/mutant module is copied byte-for-byte, checked against the frozen reference hash, and executed with separately copied frozen tests in its own fresh scaffold. Actual fresh compilation remains separate and is never overwritten by reference execution. This also isolates reference fixtures from other test runs. The final grade exposes the canonical actual path in `provenance.compiledPath` and reference paths in `provenance.referenceExecutedPaths`; packet generation must use these paths, not an older `trusted/candidate.cjs`. All copied tests and actual/reference outputs receive post-execution integrity checks. `referenceOutputsChangedDuringGrading` records reference output changes separately.

Final version 4 SHA256:

`570f56d53ab394858129d41bbd727d5604dc05e024e8008ea7ed94618754d20f`

Verification: the specifically identified compiled-module-path-blocked saved-test suite now exits 0. Its baseline/reference executions have no module-load failures and retain all artifact hashes. The probe-error reference intentionally throws ENOENT while statting a CSV literal (`foo,bar,baz`); that remains a valid behavioral mutant failure. An initial audit probe that rejected all ENOENT text was too broad, failed, and was corrected to distinguish module loading from this intended filesystem behavior.

All completed runs are regraded uniformly under version 4. No source, saved test, hidden suite, worker or BLIND packet is edited. These changes restore the provided execution layout; they are not model repairs or quality judgments. Earlier coordinator relocation failures must not affect scoring.

Final status inspection after the version 4 pass: all 36 planned runs have version 4 grades, and all 36 frozen saved-test suites exit 0. No original/copied-test or actual/reference-output integrity check reports a change. A scan of candidate/reference logs found no remaining module-load or fixture-creation relocation failure. All ENOENT lines flagged by the broad path scan came from the deliberately broken `probe-errors-escape` reference statting nonexistent or dangling inputs; these are intended behavior failures. This status check does not grade source quality or imply that every rubric gate passes.
