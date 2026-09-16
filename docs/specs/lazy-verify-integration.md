# RFC: Optional behavioral verification for lazy-clean

Status: proposed; no integration or npm package is implemented by this document.\
Date: 2026-09-16.\
Suggested repository path: `docs/specs/lazy-verify-integration.md`.\
Repository inspected: `JustasMonkev/lazy-clean`.\
Inspected revision: `9bfab628212f282019f98fba4ac77f8681a09919` (`main` at inspection).\
Feature name: `lazy-verify`.\
Proposed engine: `@justasmonkev/repro-evidence`; the name, scope ownership, publication, and compatible release remain unverified.

## 1. Decision and mission

Add an explicitly invoked `lazy-verify` skill and a small, dependency-free bridge to an optional verification engine. Keep lazy-clean's existing guidance, checker, hooks, installation methods, and intensity settings intact.

The engine verifies the **target repository that an agent is editing**, not merely lazy-clean's own implementation. lazy-clean supplies workflow guidance and an integration boundary; the engine owns source preparation, test execution, evidence classification, and replay. Do not build a second execution engine inside lazy-clean.

The mission is to make an agent's completion claim inspectable: identify the actual code and approved checks, execute those checks, distinguish application failures from failed verification, and retain enough evidence to repeat the comparison.

There are two contracts:

- **Fix:** the reviewed reproduction fails for the specified behavioral reason before the change and passes afterward.
- **Preserve:** the same reviewed behavioral checks pass before and after a cleanup or refactor. This is evidence for the selected checks, not proof of total semantic equivalence.

Success means a maintainer can run both workflows, see an honest non-success result when evidence is missing, and continue using lazy-clean unchanged when verification is not installed or requested.

The terms MUST, MUST NOT, and SHOULD below describe proposed implementation requirements. They do not describe features already present in the repository.

## 2. Inspected baseline and sources of requirements

### 2.1 Existing repository behavior

| Inspected source | Relevant existing behavior | Integration constraint |
| --- | --- | --- |
| `README.md` | Skills-only installation; dependency-free TS/JS checker; advisory edit hooks; final task-scoped scan | Preserve these workflows and keep static findings separate from behavioral evidence. [R1] |
| `skills/lazy-clean/SKILL.md` | Lazy ladder, slop review, existing test tools, meaningful behavior/edge/failure coverage | Add optional execution support, not a replacement methodology. [R2] |
| `skills/lazy/references/risk-checks.md` | Meaningful red/green evidence; unrelated failures do not prove a regression; no dependency solely for mutation evidence | Reject setup failures as reproduction evidence; do not require new test frameworks or mutation tools. [R3] |
| `package.json` | `private: true`, Node `>=18`, tests launched through plain `node` commands | Do not publish lazy-clean, add a build step, or raise its engine requirement as part of this feature. [R4] |
| `hooks/lazy-clean.json` | Session, subagent, prompt, and Write/Edit/MultiEdit hooks | Do not add verification execution to these hooks. [R5] |
| `hooks/lazy-instructions.js` | Shared instruction builder and fallback; distinct handling of existing modes | Do not add `verify` as an intensity or persist it as a session mode. [R6] |
| `.opencode/plugins/lazy.mjs` | Discovers command Markdown files and registers the skills directory | Add a command file; do not duplicate command-registration code. [R7] |
| `.codex-plugin/plugin.json` | Registers `./skills/` and the shared hooks file | Use the existing skill discovery mechanism. [R8] |
| `.github/workflows/test.yml` | Linux/macOS/Windows with Node 18 and 22; `npm test` and slop-check | Preserve the existing checks; qualify the optional engine separately. [R9] |
| `tests/cli.test.mjs` | Plain Node assertions and real child-process CLI tests | Extend this testing style rather than migrating the repository to Vitest. [R10] |

This inspection establishes integration points, not correctness or measured performance of the repository. No repository tests were executed while preparing this RFC.

### 2.2 Relationship to the earlier npm plan

The supplied `Repro Evidence` package specification remains a broader proposed engine design, not an available dependency. This integration makes four explicit adjustments:

1. Replace the earlier **Vitest-first** integration requirement with a narrow structured **plain-Node script adapter**. Existing project commands remain usable as supporting checks.
2. Add `preserve` mode. Green-to-green is a successful selected-contract observation in that mode, not `not_reproduced`.
3. Require honest handling of uncommitted edits before calling a result applicable to the agent's current work.
4. Preserve lazy-clean's runtime and installation contract. The separately installed engine may require Node 24; that does not raise lazy-clean's own Node requirement.

Docker, fast-check integration, browser traces, generated-case promotion, and public SDK packaging stay in the engine roadmap. They are not prerequisites for this integration's first release. [P1]

### 2.3 Article-derived motivation, not product guarantees

The supplied Dan Luu article reports better debugging results when agents execute checks of their hypotheses, describes an artificial browser reproduction mistaken for the real environment, and argues for feedback that improves future testing. This motivates execution evidence, target binding, and retaining useful regressions. It does not establish this tool's accuracy, justify removing human review, or supply this RFC's API design. [A1]

## 3. Scope and non-goals

The first release includes a self-contained skill, an OpenCode command, a plain-Node bridge, two verification modes, an explicit policy/contract boundary, exact-commit and qualified working-tree targets, bounded JSON/Markdown reports, and replay through an approved engine.

It MUST NOT add automatic installation, model calls, model selection, autonomous fixing, PR creation, auto-merge, a dashboard, continuous monitoring, per-edit test runs, or a new linter. It MUST NOT turn advisory slop findings into an implicit merge gate.

It MUST NOT change `/lazy lite`, `/lazy full`, `/lazy ultra`, `/lazy off`, default persistence, statusline behavior, or the current checker exit codes. Explicitly invoking the independent verification skill while lazy mode is off does not reactivate lazy mode.

New-feature acceptance, performance certification, arbitrary-language assertion interpretation, hostile-code execution, and universal semantic equivalence are outside version 1. A feature with no meaningful before/after contract continues through the repository's ordinary tests; the agent must not invent a baseline failure to fit this tool.

## 4. Architecture and ownership

```text
User / coding agent
        |
        v
lazy-verify skill and optional platform command
        |
        v
Bundled bridge: verify.mjs
  - parses explicit user inputs and data-only configuration
  - resolves an explicitly approved engine launch specification
  - negotiates a supported protocol and capabilities
  - sends a bounded request; validates the final response
  - renders the result without upgrading its claims
        |
        v
Separately installed, trusted verification engine
  - resolves revisions and captures source snapshots
  - freezes approved contracts and validates target binding
  - runs setup, structured assertions, and supporting checks
  - manages attempts, cancellation, cleanup, evidence and replay
  - classifies behavior and computes the acceptance gate
        |
        v
Disposable execution workspaces for base and candidate
```

The bridge MUST NOT import target code, target JavaScript configuration, or the engine into its own process. It launches the approved engine as a child. The engine is trusted controller code; the tested application and its reports are not promoted to controller authority.

The bridge validates protocol integrity and contradictory response fields, but MUST NOT implement a competing behavioral classifier or parse test log strings into its own verdict. The authoritative classifier belongs to the engine and is tested there. A broken engine response becomes an integration error, not a guessed result.

Keep the bridge in at most a few cohesive modules. The installed skill must work when copied with the existing skills-only method: all bridge code and runtime resources reside under `skills/lazy-verify/`. Do not depend on repository-root `src/`, a development build directory, or the current working directory to locate bridge resources.

## 5. User interface and activation

### 5.1 Proposed commands

All examples are interfaces to implement, not commands available today. In these examples the shell variable `VERIFY` identifies the installed bridge file, while the process working directory is the target repository.

```bash
VERIFY=/path/to/lazy-clean/skills/lazy-verify/scripts/verify.mjs

# Inspect prerequisites; do not execute target code or install anything.
node "$VERIFY" doctor --policy /path/to/reviewed-policy.json

# Check an explicitly selected committed bug-fix pair.
node "$VERIFY" verify \
  --profile parser-fix \
  --base BUGGY_REF \
  --head FIXED_REF \
  --policy /path/to/reviewed-policy.json \
  --trust-code

# Check a cleanup that has not been committed.
node "$VERIFY" verify \
  --profile checker-contract \
  --base TASK_BASE_REF \
  --head worktree \
  --include-untracked tests/new-case.mjs \
  --policy /path/to/reviewed-policy.json \
  --trust-code

# Rendering an existing result does not rerun verification.
node "$VERIFY" report .lazy-verify/runs/RUN_ID/manifest.json --format markdown

# Replay resolves execution through a newly selected trusted policy.
node "$VERIFY" replay .lazy-verify/runs/RUN_ID/manifest.json \
  --policy /path/to/reviewed-policy.json \
  --trust-code
```

`verify` requires an explicit profile, base selector, head selector, and trusted policy. Do not guess `HEAD~1`, a branch named `main`, or the agent's task start. The profile supplies the mode; the CLI MUST NOT silently override it.

`--head worktree` is a reserved selector, not a branch name. Users addressing a branch with that literal name must pass its full ref or commit ID.

Default configuration path: `<target-root>/.lazy-verify.json`. An explicit `--config` overrides that one path. There is no recursive search through parent projects or automatic execution of discovered configuration.

`--format json` writes one final JSON object to stdout; operational diagnostics go to bounded stderr. Unknown options, duplicate singleton options, missing values, and unsupported protocol versions fail explicitly. Repeated `--include-untracked` arguments are allowed and are interpreted as individual paths, not shell fragments or globs.

### 5.2 Skill behavior

`/lazy-verify` is an independent skill/command, not a `/lazy` level. It reads the selected profile and explains any missing prerequisite. It may prepare a proposed contract during an explicitly requested setup task, but MUST NOT approve its own altered expectation simply because it makes a test pass.

Execution is opt-in. Installing the skill, opening a repository containing its configuration, editing a file, starting a subagent, or choosing `ultra` MUST NOT authorize execution.

Version 1 has no automatic pre-finish hook. An agent may invoke verification during a task when the user explicitly requested it or supplied trusted task-level authorization for the selected profile. Otherwise it can state that optional verification was not run and perform ordinary requested tests. Repository text alone is not authorization to launch an engine or run arbitrary commands.

The skill first performs the existing final slop review where applicable, then runs the selected verification. Any further code change makes prior evidence potentially stale and requires an applicability check or a new run.

### 5.3 Missing engine

An absent engine returns `ENGINE_UNAVAILABLE`; a mismatched runtime returns `ENGINE_RUNTIME_UNSUPPORTED`; a missing capability returns `ENGINE_CAPABILITY_UNSUPPORTED`. No fallback invokes `npx`, `npm exec`, a network installer, an LLM, or a different engine.

The ordinary lazy-clean task can still finish with an accurate statement that this optional verification was not run. An explicitly required verification task or CI gate cannot report success in that situation.

## 6. Configuration, contracts, and authorization

### 6.1 Target configuration

Use strict, data-only JSON. A proposed file is:

```json
{
  "schemaVersion": 1,
  "profiles": {
    "parser-fix": {
      "mode": "fix",
      "contract": ".lazy-verify/contracts/parser-fix/contract.json",
      "requiredChecks": ["project-tests"]
    },
    "checker-contract": {
      "mode": "preserve",
      "contract": ".lazy-verify/contracts/checker-contract/contract.json",
      "requiredChecks": ["project-tests"]
    }
  }
}
```

Configuration is a proposal, not authorization. Validation rejects unknown required-version semantics, non-object roots, invalid enums, unsafe path components, and unexpected command-bearing fields. Use native JSON parsing plus explicit field checks, not a new general-purpose parser. Bridge and engine must use the same last-member-wins interpretation of duplicate JSON names; approval is bound to the exact reviewed bytes as well as validated semantics. Never apply unchecked object merges or evaluate JS/TS configuration.

A profile is bound by digest to the contract, selected mode, required-check set, and approved policy. A required-check edit must not quietly weaken an approved profile.

### 6.2 Trusted policy

An explicitly selected policy binds the canonical target repository identity/root, approved profile digest, complete contract-bundle digest, allowed setup/supporting commands, budgets, repetition count, and engine identity.

Engine identity includes an exact reviewed distribution version/digest plus an absolute Node executable and absolute JS entry path. If the engine is installed inside the target's `node_modules`, it must be independently validated and frozen before target setup; do not execute a candidate-controlled replacement. A separately installed controller outside the target is the preferred arrangement.

The engine is launched through the approved Node executable and entry path, not an ambiguous PATH binary or Windows `.cmd` shim. A policy document is not trusted merely because it calls itself trusted. Local authorization comes from the user's explicit selection/review; CI authorization comes from a separately protected controller configuration.

`--trust-code` acknowledges local execution risk. It is **not** proof that the contract expresses the user's requirement. There is no agent-writable `approved: true` shortcut and no approval hidden in a generated report. Changing the approved bundle invalidates the previous digest and requires renewed review.

### 6.3 Contract bundle

Keep the same reviewed harness code, assertions, inputs, fixtures, and harness dependencies for both revisions. The candidate must not replace the baseline measuring instrument.

The first structured adapter is `node-script-v1`: a small external `.mjs` harness using the engine's supported assertion/event interface and Node's existing assertion facilities. This is an adapter for narrow cases, not a replacement test runner for the project.

Each contract names its test/assertion IDs, supported target entry, expected symptom in fix mode, relevant supported input domain, and approved setup/supporting command IDs. The engine checks target binding to the prepared revision; no ambient import, stale build, fake replacement application, or candidate-only fixture may silently substitute for the selected target.

This solves the new-test-on-old-code problem: the approved harness exists independently even when it is absent from the buggy commit. A legacy repository-local overlay is supported only after a reviewed adapter can restrict it to test inputs; copying the entire candidate test directory over the base is not the default.

## 7. Evidence levels and modes

### 7.1 Do not overinterpret command success

A project command such as `node tests/cli.test.mjs` can be retained as a supporting check. Its direct observations are process completion, exit status, and captured output. Those observations do not establish how many assertions ran.

Therefore:

| Evidence level | Allowed statement | Can alone satisfy fix/preserve verification? |
| --- | --- | --- |
| `command` | The selected command exited with the recorded status. | No. |
| `structured-assertion` | The required named test and assertion completed with the recorded result. | Yes, subject to the full gate and stated limitations. |
| `trace-attachment` (later) | Supporting browser activity was captured. | No. |

Do not scrape `ok`, `PASS`, or `FAIL` from the existing handcrafted Node tests to manufacture assertion-level evidence. The first integration uses a narrow structured external harness and can run the existing suite unchanged as a supporting check.

### 7.2 Structured attempt validity

A valid attempt requires successful preparation, correct target binding, expected collection/test/assertion identities, a complete terminal protocol, and a compatible observed process exit. Missing assertions, zero tests, skipped required tests, silent retries, unsupported expected-failure annotations, report truncation, and contradictory events cannot pass.

Only failure of the named approved assertion establishes the expected base symptom. Import failure, missing dependencies, startup failure, signal termination, and a generic timeout are not that symptom. An intentional application timing requirement must be an explicit assertion after successful setup.

Repetition defaults to three fresh attempts per revision in the initial pilot, controlled by the approved policy. Preserve every attempt. Three matching results do not prove a test is never flaky. Scratch state must reset between attempts; a seed does not control arbitrary scheduling or external services.

### 7.3 Behavior classification

This table applies only after required structured observations are validated. `Expected failure` means the approved symptom, not any nonzero exit.

| Base | Candidate | Fix mode | Preserve mode |
| --- | --- | --- | --- |
| Stable pass | Stable pass | `not_reproduced` | `preserved_observed` |
| Stable expected failure | Stable pass | `fixed_observed` | `baseline_failing` |
| Stable expected failure | Same stable failure | `still_failing` | `baseline_failing` |
| Stable expected failure | Different valid behavioral failure | `changed_failure` | `baseline_failing` |
| Stable pass | Stable valid behavioral failure | `regression_observed` | `regression_observed` |
| Stable unexpected base behavioral failure | Any valid candidate | `inconclusive` with `BASE_FAILURE_MISMATCH` | `baseline_failing` |
| Mixed valid outcomes within either revision | Any | `flaky` | `flaky` |
| Missing/invalid/setup-failed required evidence | Any | `inconclusive` | `inconclusive` |

Incomplete required evidence takes precedence over a headline flaky/behavioral conclusion, but all observed dimensions remain in the manifest. Equal failures on both revisions are never preservation success. Intentional behavior changes require separately reviewed contracts; do not normalize them away.

### 7.4 Gate and applicability

The engine reports behavior, supporting-check results, evidence completeness, and applicability separately.

A gate passes only if the approved mode's positive result is observed (`fixed_observed` or `preserved_observed`), the contract/policy is unchanged, all required evidence is complete, every approved required supporting check passes, cleanup has no unresolved error, and evidence applies to the requested target snapshot.

A supporting suite failure may coexist with `fixed_observed`; retain that observation and block the gate. A stale result remains historical evidence about its captured snapshot, but MUST NOT be presented as verification of subsequently edited code.

Slop findings remain separate. Neither fewer findings nor a clean scan satisfies the behavioral gate. Conversely, a passing behavioral gate does not automatically excuse a static finding.

## 8. Revision and working-tree semantics

### 8.1 Exact commits

The engine resolves both selectors to exact commit objects before executing anything and records Git object format and IDs. Ref names are labels, not replay identities. Missing/shallow-history objects produce explicit insufficient-source results; verification does not fetch automatically. Git documents the `--verify` / `--end-of-options` approach for untrusted revision arguments. [W2]

Committed mode checks the selected commits only. If the target checkout has additional tracked edits or unresolved non-ignored untracked inputs, the command refuses to imply those changes are covered. Version 1 requires using the explicit working-tree mode or a clean checkout; there is no silent `HEAD` fallback.

### 8.2 Working-tree candidate

Working-tree support is required before advertising pre-commit applicability. The engine captures actual working-tree bytes, not just `HEAD` or the staged index, into an owned disposable snapshot.

It MUST include tracked modifications, additions, removals, and relevant executable modes. All non-ignored untracked files must be explicitly included or explicitly excluded in the approved capture policy; unresolved untracked inputs block capture. Exclusions are visible and are not claims of coverage. Tool-owned evidence output is excluded by a narrowly defined rule, not a blanket rule hiding user source files.

The engine MUST NOT stash, reset, commit, modify the user's index, or discard unrelated edits. Capture the whole supported target state; do not silently construct an artificial program containing only task-owned lines. The skill still restricts its editing and static triage to the task's scope.

Use NUL-safe Git/file enumeration, deterministic relative-path ordering, content/mode digests, and pre/post capture inventories. Detected changes during capture cause `SOURCE_CHANGED_DURING_CAPTURE`. The capture algorithm's finite checks are race detection for cooperative local use, not an atomic snapshot guarantee against an adversary.

Version 1 may reject symlinked source entries, submodules, Git LFS content requiring materialization, unsupported encodings, and oversized trees rather than guess. These restrictions must be capability-tested and reported before claiming support.

Persist a content-addressed source bundle or an exact base-plus-lossless-overlay representation that includes removals and approved untracked bytes. A list of hashes without recoverable source bytes is not sufficient for working-tree replay. Local source evidence can contain private code and is never uploaded by default.

Recheck target applicability before reporting success. A subsequent edit makes the result stale, even if slop-check still passes. Do not claim that matching source bytes alone guarantees the live runtime/dependency environment is identical; record the compared environments separately.

### 8.3 Workspaces and dependencies

The engine uses separate owned workspaces and dependency trees for base/candidate. Each target retains its own approved dependency lock and explicit setup. The harness remains fixed. A dependency change is part of the compared environment, not evidence that one source line caused the change.

Worktrees may support trusted-local preparation, but Git documents shared repository information; they are not a hostile-code isolation boundary. [W1] Failed preparation is inconclusive. In the first lazy-clean pilot, prefer dependency-free fixtures so setup does not require introducing a package manager or test dependency.

## 9. Bridge-to-engine protocol

Define an integration protocol independent of human CLI output: `lazy-clean.verify/1`. The engine's earlier planned public CLI is not assumed to already implement it.

### 9.1 Capability negotiation

The bridge starts only an approved local engine. Its bounded capability response must declare protocol major, exact engine version, supported modes, adapters, source modes, runtime/platform constraints, and cancellation support. Unknown modes or a missing `preserve` capability fail before target execution. A stub capability response in a unit test does not establish a real engine capability.

The first engine launch shape is proposed as:

```text
<approved-node> <approved-engine-entry> integration capabilities --protocol lazy-clean.verify/1
<approved-node> <approved-engine-entry> integration run --protocol lazy-clean.verify/1
```

The run receives one bounded JSON request on stdin, not a shell command string. Paths and arguments remain data. Node documents the distinction between direct process execution and shell execution, including Windows batch-file restrictions. [W3]

### 9.2 Request and response contract

Request fields include protocol, fresh request ID, operation (`verify`/`replay`), canonical repository root, profile/mode, requested source selectors, explicitly included/excluded untracked paths, approved profile/contract/policy digests, policy location, output root, and local trust acknowledgement. The engine verifies digests itself; bridge-supplied strings are not approval by assertion.

The final envelope includes protocol/request identity, engine identity, mode, resolution of the requested sources, selected profile and digests, execution status, behavior, gate, applicability, reason codes, evidence location/digest, and limitations. The bridge rejects mismatched request IDs, mode/profile/digests, unexpected resolved-source relationships, unsupported schemas, duplicate results, oversized output, and contradictions such as an accepted incomplete run.

Exactly one terminal envelope is emitted on stdout. Progress is bounded stderr; no test logs contaminate the protocol. A missing envelope is an error even when the process exits zero. A nonzero exit inconsistent with a purported success is an integration error, not a success with a warning.

Recommended bridge limits are a 256 KiB request, 1 MiB terminal envelope, 1 MiB diagnostics, a 5-second capability timeout, and an approved total run budget. These are starting limits to validate, not performance measurements. Do not truncate JSON and then accept its surviving portion.

### 9.3 Cancellation and ownership

The engine owns target subprocesses and cleanup. On interruption the bridge requests cancellation through the documented process mechanism, waits a bounded grace period, and then terminates only the owned engine process/tree using a qualified platform mechanism. The engine writes a partial manifest where possible.

Do not assume killing one PID kills all descendants or that `killed` proves process termination; Node documents those limitations. [W3] Tests must exercise real process trees on every platform advertised for execution. Residual resources and cleanup failure block acceptance and retain the original failure reason.

No second run automatically resumes after cancellation. Independent invocations use independent IDs and create-only output directories.

## 10. Reports, replay, and exit codes

### 10.1 Evidence layout

```text
<target-root>/
  .lazy-verify.json                       # reviewable profile declarations
  .lazy-verify/
    contracts/<contract-id>/              # reviewable measuring instrument
    runs/<run-id>/                        # private generated output; ignored
      manifest.json
      summary.md
      contract-snapshot/
      source/                            # required replay material where applicable
      base/attempt-*.json
      head/attempt-*.json
      logs/
```

A caller may choose an approved output directory outside the repository. The tool creates only owned output, never overwrites unrelated files, and does not silently edit `.gitignore`. Installation documentation must distinguish reviewable contracts from generated output.

The manifest records schema/engine/bridge versions; source selectors and immutable identities; source and contract digests; approval provenance; runtime/OS/architecture; setup and dependency identities; all attempts; structured assertion identities; supporting command results; behavior/gate/applicability; cancellations/cleanup; redaction/omission records; replay requirements; and explicit limitations.

For local in-process observations, include `observationAuthenticity: "not-established"`. Digests bind bytes relative to an expected digest; they do not establish that the original observation was truthful.

### 10.2 Allowed summary

A successful preserve run might be rendered as:

```text
Mode: preserve
Result: selected behavior checks passed on both snapshots (3/3 each)
Required project checks: passed
Applicability: captured candidate unchanged at completion
Gate: passed
Limits: trusted-local execution; only the approved contract was checked
```

Static review is reported separately. Do not use “safe to merge,” “all behavior preserved,” “bug-free,” or an unsupported confidence percentage. Do not fill missing test counts with zero or infer counts from logs.

### 10.3 Replay and read-only rendering

`report` validates bounded data and renders it; it never loads executable JS, follows arbitrary external URLs, or performs a fresh verification. An imported manifest is labeled as previously recorded evidence, not an independently rerun or authenticated observation. Escape terminal control sequences and Markdown/HTML-sensitive content. Resolve attachment paths within the owned bundle and reject traversal or unsupported links.

`replay` creates a new run. It uses exact saved sources and the approved contract through the current explicitly selected policy. It MUST NOT execute commands, install package names, or fetch download URLs taken from an imported report. Missing source bundles, fixtures, locks, tools, or secrets become explicit replay limitations/errors rather than approximate replay silently presented as exact.

### 10.4 Exit semantics

| Exit | `verify` / `replay` meaning |
| --- | --- |
| `0` | Selected behavioral gate passed for the recorded applicable snapshot. |
| `1` | Complete evidence blocks the gate: behavior mismatch, valid baseline failure, flakiness, or a failed required check. |
| `2` | Invalid input, unavailable/unapproved engine, unsupported runtime/platform/capability, or unapproved contract. |
| `3` | Incomplete execution/evidence, protocol failure, setup error, timeout, capture race, stale applicability, or unresolved cleanup failure. |
| `130` | User interruption; partial evidence may exist. |

For `report`, zero means valid rendering, not a passing embedded gate. `doctor` returns zero only when the requested prerequisites are satisfied; it does not execute target checks. Refused execution reports `not_run`; gate is `not_evaluated`, never `passed`.

## 11. Security and compatibility boundaries

Local verification runs trusted project/dependency code with the user's authority. Temporary directories, read-only input checks, environment filtering, and worktrees reduce accidental mistakes; none is a security sandbox. The engine must not claim network denial when it merely avoids making its own network requests.

Do not inherit cloud/npm/Git tokens, SSH agents, browser profiles, proxy credentials, or target-provided `NODE_OPTIONS` into target execution by default. Use an explicit environment allowlist and disposable HOME. Redaction is best effort, not a promise to remove every secret. Prefer synthetic inputs; no uploads or telemetry are enabled by this integration.

A malicious target sharing a process with a reporter can interfere with observations. The integration is not intended to authenticate observations against such a target. Protecting approved source files and hashing artifacts does not remove this limitation.

Keep the existing core compatibility surface and Node 18/22 CI matrix. The bridge's parsing, report rendering, missing-engine behavior, and stub-protocol tests run there without additional dependencies. A separately selected engine Node executable allows a Node 24 engine without changing the invoking user's core installation.

Initial real-engine execution qualification targets Linux and macOS on Node 24. Windows bridge/command/path/error behavior remains tested in the core matrix; advertise Windows target execution only after the engine passes the process-tree and workspace tests. Until then, execution returns an explicit unsupported-platform result. Do not silently invoke a shell to imitate support.

Future use against untrusted PR code requires a separately designed execution boundary and protected controller/policy. Do not run candidate code under privileged `pull_request_target` / `workflow_run` arrangements or give it publishing credentials. GitHub's secure-use guidance describes these trust-boundary risks. [W4]

## 12. Repository change map

### 12.1 Required additions and narrow edits

| Path | Change |
| --- | --- |
| `docs/specs/lazy-verify-integration.md` | Add this RFC. |
| `skills/lazy-verify/SKILL.md` | Add purpose, explicit activation, commands, mode selection, authorization, allowed claims, and limitations. |
| `skills/lazy-verify/scripts/verify.mjs` | Add dependency-free CLI/bridge; locate its own resources relative to the file, not target cwd. |
| `skills/lazy-verify/scripts/protocol.mjs` | Add small data validation/response boundary if separating it materially improves tests; no general plugin framework. |
| `skills/lazy-verify/references/contract.md` | Add installed-skill usage/protocol reference; do not require the repository docs directory for runtime use. |
| `.opencode/command/lazy-verify.md` | Delegate to the same skill with arguments as data; preserve existing frontmatter conventions. |
| `tests/verify.test.mjs` | Add bridge, installation-copy, protocol, and platform-path tests in the existing Node style. |
| `tests/fixtures/verify/engine-stub.mjs` | Add a clearly labeled protocol fixture for valid and invalid responses; never present its output as a real project verification. |
| `skills/lazy-clean/SKILL.md` | Add a short optional verification section after ordinary review; preserve final checker requirements. |
| `skills/lazy-help/SKILL.md`, `.opencode/command/lazy-help.md` | Document the independent command and opt-in prerequisite. |
| `README.md` | Document two modes, separate results, engine/runtime requirements, installation boundaries, and updated skill/command counts. |
| `package.json` | Append the new test script to existing tests and cover it with the existing checker; preserve `private`, engine range, and dependency-free core. |
| `.gitignore` | Ignore only this repository's generated `.lazy-verify/runs/` output; keep contracts reviewable. |
| `UPSTREAM.md` | Record the local optional integration; do not claim it was ported from upstream or alter reviewed upstream revisions without a separate comparison. |

### 12.2 Leave unchanged unless a demonstrated test requires a minimal adjustment

`hooks/lazy-clean.json`, `hooks/edit-check.js`, mode/config/statusline scripts, the shared instruction builder, existing checker rules and exit semantics, and plugin hook wiring remain unchanged. Do not insert the full verification specification into every session or subagent prompt.

The existing OpenCode command-directory discovery and Codex skills-directory declaration should pick up the new files. Validate the actual install paths rather than adding duplicate registrations. For Claude and other skill readers, validate discovery with the current package layout. Rules-only users can invoke the bridge by its documented path; do not promise a native slash command in every client.

Do not expand AGENTS/Cursor/Copilot always-on guidance in the first patch merely to advertise the feature. Documentation plus explicit skill invocation is sufficient. A later short pointer may be added only with path-resolution and prompt-size tests.

A separate real-engine qualification job can be added to the existing workflow once an actual reviewed engine artifact is available. Ordinary `npm test` MUST NOT download it, require an AI service, or depend on registry availability.

## 13. Acceptance tests

Tests marked **engine** belong to engine qualification; tests marked **bridge** are mandatory in lazy-clean. The integrated release needs both, not just a stub engine with a green test suite.

| ID | Scenario | Required result | Owner |
| --- | --- | --- | --- |
| LV-01 | Engine absent; ordinary edit hook executes | Existing hook/checker behavior unchanged | Bridge |
| LV-02 | Configuration appears without explicit authorization | No engine or target execution | Bridge |
| LV-03 | `/lazy-verify` invoked while mode is off | Verification is independent; persisted mode stays off | Bridge |
| LV-04 | Skills-only copy to a directory with spaces/Unicode | Bridge resources resolve; no repository-root dependency | Bridge |
| LV-05 | New OpenCode command discovered | Shared skill delegation; existing commands unchanged | Bridge |
| LV-06 | Engine missing, wrong version, or lacking preserve support | Typed non-success before target execution; no network fallback | Bridge |
| LV-07 | Engine exits zero with absent/truncated/wrong-request response | Protocol failure, never acceptance | Bridge |
| LV-08 | Profile/contract/policy digest changes | Reapproval required; no weakened expectation | Both |
| LV-09 | Expected assertion fails on base; passes on candidate | Fix observed, subject to other gate conditions | Engine |
| LV-10 | Same approved checks pass on both revisions | Preserve observed; fix mode is not reproduced | Engine |
| LV-11 | Base already fails in preserve mode | Baseline failing, not preservation success | Engine |
| LV-12 | Import/setup failure, no tests, skipped assertion | Inconclusive; not expected reproduction | Engine |
| LV-13 | Supporting project command passes without structured assertions | Command evidence only; insufficient alone | Engine |
| LV-14 | Fix observation passes but required suite fails | Keep observation; block gate | Both |
| LV-15 | Different outcomes across fresh attempts | All attempts retained; flaky result blocks | Engine |
| LV-16 | New regression harness absent from old revision | Same external approved harness still runs against both real targets | Engine |
| LV-17 | Ambient package/stale target entry available | Reject wrong binding; no fallback import | Engine |
| LV-18 | Dirty target with `--head HEAD` | Refuse misleading coverage | Both |
| LV-19 | Working tree has tracked edits, deletion, and approved untracked file | Snapshot includes actual supported state; user index/edits unchanged | Engine |
| LV-20 | Unresolved untracked input or source changes during capture | Capture fails explicitly | Engine |
| LV-21 | Target changes after captured verification | Historical result retained; current applicability blocked | Both |
| LV-22 | Working-tree source bytes unavailable for replay | Missing replay input; no approximate success | Engine |
| LV-23 | Timeout, cancel, child crash, surviving descendant | Bounded termination; partial evidence; unresolved cleanup blocks | Both |
| LV-24 | Concurrent invocations | Independent create-only outputs and ownership-safe cleanup | Both |
| LV-25 | Imported report contains traversal, commands, or terminal escapes | Data validation/escaping; no embedded execution | Bridge |
| LV-26 | Static checker reports zero files or findings | No inference of behavioral correctness | Bridge/skill |
| LV-27 | Render a valid report containing a blocked gate | Rendering may exit zero; text/JSON still states blocked | Bridge |
| LV-28 | Existing platform/core regression suites | Continue passing without a verifier installation | Bridge |

Add table-driven tests for every mode/outcome combination and negative protocol fixture. Use real subprocesses for timeout, close/exit races, broken pipes, and cancellation; mocking spawn alone is insufficient.

For the first integration pilot, an external harness can exercise lazy-clean's actual checker CLI on a temporary file and assert its public exit/output contract. Treat the checker as the **subject under test**, not as an authority for arbitrary behavior preservation. Use an explicitly synthetic altered candidate to establish regression rejection if no reviewed historical bug pair has been selected. Do not label a synthetic case historical.

A second pilot must show an actual already-understood bug-fix pair. Record exact revisions and the reviewed requirement before claiming historical validation. Test-fixture completion, independent replay, and real-project usefulness are different milestones.

## 14. Implementation sequence and release gate

| Work item | Deliverable | Depends on | Acceptance |
| --- | --- | --- | --- |
| LC-V01 | Approve RFC, vocabulary, protocol, and threat boundaries | None | Fix/preserve tables and source/approval semantics agreed; no implementation claim. |
| RE-LC01 | Qualify engine's plain-Node adapter, preserve mode, capture and protocol | LC-V01 | Negative cases and both source modes supported; real engine identity recorded. |
| LC-V02 | Bridge and protocol fixtures | LC-V01 | Core matrix passes; missing engine and invalid response cases never pass. |
| LC-V03 | Skill, platform command, help and narrow documentation edits | LC-V02 | Copy-install and command-discovery tests; no mode/hook regressions. |
| LC-V04 | Real-engine integration and replay pilots | RE-LC01, LC-V03 | Commit and worktree evidence; one preservation pilot and one reviewed historical fix. |
| LC-V05 | Release qualification and opt-in documentation | LC-V04 | Accepted test matrix, documented limits, no default network/engine dependency, independent replay review. |

Keep engine changes in the engine project and integration changes in lazy-clean. Bridge work may use protocol stubs before the engine exists, but the feature remains experimental/unavailable for real verification until LC-V04 passes. No stub result qualifies it for release.

No calendar estimate is implied. These are dependency and acceptance gates. Do not combine this work with broad checker cleanup, language migrations, upstream synchronization, or unrelated review comments.

The release gate requires all existing checks plus LV-01 through LV-28 for advertised capabilities, a recorded real-engine version, both modes, working-tree applicability, replay from saved material, and a human review of the accepted contract and evidence. Any deferred platform/capability must return a clear unsupported result.

No performance, reliability-percentage, token-saving, or market-novelty claim is made. Measure integration overhead and false acceptance on a labeled workload before making such claims. Do not confuse a finite all-green fixture set with proof that false acceptance is impossible.

## 15. Learning and feedback focus

This integration exercises three concepts directly: **policy versus evidence**, **a test oracle versus a successful process**, and **snapshot identity versus a branch name**. A useful implementation review asks what exact observation would make each completion claim false, then checks that the negative fixture blocks it.

Useful discovered failures become reviewed regression cases in the project's existing test setup. Automated generator improvement, shrinking, and corpus promotion can be integrated later through the engine, without changing the meaning of the initial two modes. The fixing agent does not get to change a failing expectation merely to obtain acceptance.

## 16. Source register

Repository links are pinned to the inspected revision so this RFC's baseline can be rechecked. Existing behavior is identified in section 2; all other requirements are proposed integration decisions unless explicitly attributed.

- **R1 — README:** https://github.com/JustasMonkev/lazy-clean/blob/9bfab628212f282019f98fba4ac77f8681a09919/README.md
- **R2 — Main skill:** https://github.com/JustasMonkev/lazy-clean/blob/9bfab628212f282019f98fba4ac77f8681a09919/skills/lazy-clean/SKILL.md
- **R3 — Risk checks:** https://github.com/JustasMonkev/lazy-clean/blob/9bfab628212f282019f98fba4ac77f8681a09919/skills/lazy/references/risk-checks.md
- **R4 — Package manifest:** https://github.com/JustasMonkev/lazy-clean/blob/9bfab628212f282019f98fba4ac77f8681a09919/package.json
- **R5 — Hook definitions:** https://github.com/JustasMonkev/lazy-clean/blob/9bfab628212f282019f98fba4ac77f8681a09919/hooks/lazy-clean.json
- **R6 — Shared instructions:** https://github.com/JustasMonkev/lazy-clean/blob/9bfab628212f282019f98fba4ac77f8681a09919/hooks/lazy-instructions.js
- **R7 — OpenCode discovery:** https://github.com/JustasMonkev/lazy-clean/blob/9bfab628212f282019f98fba4ac77f8681a09919/.opencode/plugins/lazy.mjs
- **R8 — Codex manifest:** https://github.com/JustasMonkev/lazy-clean/blob/9bfab628212f282019f98fba4ac77f8681a09919/.codex-plugin/plugin.json
- **R9 — Existing CI:** https://github.com/JustasMonkev/lazy-clean/blob/9bfab628212f282019f98fba4ac77f8681a09919/.github/workflows/test.yml
- **R10 — Existing CLI tests:** https://github.com/JustasMonkev/lazy-clean/blob/9bfab628212f282019f98fba4ac77f8681a09919/tests/cli.test.mjs
- **P1 — Supplied planning documents:** `repro-evidence-plan/SPEC.md` and `BACKLOG.md`, dated 2026-09-16; broader proposed engine design, not evidence of implementation.
- **A1 — Supplied article:** Dan Luu, “Agentic test processes, LLM benchmarks, and other notes on agentic coding from Galapagos Island,” attachment `Pasted markdown(6).md`; supplied source lines 7–9, 90–102, 291, and 366–374. These are the author's reports, not independently replicated product results. Online reference: https://danluu.com/ai-coding/
- **W1 — Git worktrees:** https://git-scm.com/docs/git-worktree (checked 2026-09-16).
- **W2 — Revision validation:** https://git-scm.com/docs/git-rev-parse (checked 2026-09-16).
- **W3 — Node child processes:** https://nodejs.org/api/child_process.html (checked 2026-09-16; implementation must use APIs available in each declared runtime).
- **W4 — GitHub Actions trust boundaries:** https://docs.github.com/en/actions/reference/security/secure-use (checked 2026-09-16).
