# Experimental bridge contract

The bridge runs on Node >=18 with no dependencies. Its protocol fixtures test
integration only. No engine artifact is qualified yet; real verification and
release qualification remain unavailable until a separately reviewed engine
passes the RFC's engine tests and both replay pilots. The proposed package name
`@justasmonkev/repro-evidence` is not an installation instruction.

## Target configuration and review

Only `<canonical-target-root>/.lazy-verify.json` (or `--config PATH`) is read:

```json
{"schemaVersion":1,"profiles":{"parser-fix":{"mode":"fix","contract":".lazy-verify/contracts/parser-fix/contract.json","requiredChecks":["suite"]}}}
```

Select the policy explicitly with `--policy`. It is a separate data-only JSON
document with exactly these fields (replace all example digests and paths):

```json
{
  "schemaVersion": 1,
  "repositoryRoot": "/canonical/target",
  "profile": "parser-fix",
  "configDigest": "SHA256_OF_EXACT_CONFIG_BYTES",
  "profileDigest": "SHA256_OF_JSON_STRINGIFY_SELECTED_PROFILE",
  "contractDigest": "SHA256_OF_CONTRACT_DIRECTORY_MANIFEST",
  "engine": {
    "node": "/absolute/node",
    "entry": "/outside-target/reviewed-engine/main.mjs",
    "version": "EXACT_REVIEWED_VERSION",
    "digest": "SHA256_OF_ENGINE_DIRECTORY_MANIFEST",
    "nodeMajor": 24
  },
  "commands": [{"id":"suite","executable":"/absolute/node","args":["tests/cli.test.mjs"]}],
  "budgets": {"totalMs": 60000},
  "repetitions": 3,
  "excludeUntracked": []
}
```

An optional absolute `outputRoot` selects an approved output parent outside the
repository; it must have no symlink components. Each run still creates its own
UUID directory. The default is `<target>/.lazy-verify/runs/`.

These digests bind reviewed inputs, not truth or authorization. JSON uses native
last-member-wins parsing; config/policy exact-byte hashes also bind whitespace
and duplicate names. Never add `approved: true`. Profile or required-check changes
require renewed review. Policy digest is SHA-256 of its exact bytes; it is sent
alongside the other digests, avoiding a self-referential policy hash.

Bundle digest: walk the entire containing directory, sorting each directory's
names by JavaScript string order; depth-first append `[relative/posix/path,
sha256(fileBytes)]` pairs and hash UTF-8 `JSON.stringify(pairs)`. No files are
implicitly excluded. Symlinks/non-files are unsupported; maximum 4096 entries and
32 MiB total. Engine runtime resources must be entirely inside its directory.
The bridge freezes that directory and rehashes it before executing its JS entry.
An engine inside the target is explicitly unsupported in this initial bridge.

All paths in bundles are relative POSIX paths with no empty, `.` or `..`
components, control characters, colon, backslash, or glob syntax. CLI paths to
policy/config/report and approved Node/entry paths support native absolute paths.
Repeated `--include-untracked` accepts individual literal paths. Exclusions are
explicit policy entries. The engine must reject unresolved untracked inputs.

## Protocol lazy-clean.verify/1

Launch without a shell:

```text
APPROVED_NODE FROZEN_ENTRY integration capabilities --protocol lazy-clean.verify/1
APPROVED_NODE FROZEN_ENTRY integration run --protocol lazy-clean.verify/1
```

Capability object fields, all required: `protocol`, `engine: {version,digest}`,
`modes: ["fix","preserve"]`, `adapters` including `node-script-v1`, `sourceModes`
including `commit` and `worktree`, `platforms`, `nodeMajor`, and
`cancellation: "sigterm-process-group"`. Unknown modes or missing capabilities
fail before target execution. Runtime and capability probes have five-second
deadlines. Windows execution is explicitly unsupported pending qualification.

The run reads exactly one JSON object from stdin, at most 256 KiB:
`protocol`, fresh `requestId`, `operation` (`verify` or `replay`), canonical
`repositoryRoot`, `profile`, `mode`, `requiredChecks`, `sources: {base,head}`
(selectors), `includeUntracked`, `excludeUntracked`, `digests` (config/profile/
contract/policy), `policyPath`, `configPath`, create-only `outputRoot`, `trustCode: true`, and
`engine: {version,digest}`. Replay additionally carries `replay: {manifest,digest,
sources}` with saved immutable source identities. The engine independently checks
approval, source identities and bundle bytes. The bridge never imports target code.

Exactly one final JSON object goes to stdout (1 MiB maximum), never test logs:

- `schemaVersion: 1`, `protocol`, `requestId`, `engine: {version,digest}`;
- `mode`, `profile`, `digests: {config,profile,contract,policy}`, `repositoryRoot`;
- `sources: {base,head}`, each `{selector,kind,identity}`: `commit` with Git SHA-1
  or SHA-256 object ID; `worktree` with SHA-256 snapshot identity (head only);
- `execution`: `complete`, `incomplete`, `cancelled`, or `not_run`; unresolved
  source identities may be null only for non-complete execution;
- `behavior`: fix allows `fixed_observed`, `not_reproduced`, `still_failing`,
  `changed_failure`, `regression_observed`, `flaky`, `inconclusive`; preserve
  allows `preserved_observed`, `baseline_failing`, `regression_observed`, `flaky`,
  `inconclusive`;
- `gate`: `passed`, `blocked`, `not_evaluated`; `applicability`: `current`, `stale`,
  `unknown`; `reasonCodes` and `limitations`: distinct nonempty-string arrays;
- `requiredChecks`: exactly approved IDs as `{id,status}`, status `passed`,
  `failed`, or `incomplete`; `evidenceComplete`: boolean;
- `cleanup`: `complete`, `failed`, `unknown`;
- `evidence: {path,digest}`: bounded evidence index inside this run, SHA-256 bytes;
- `observationAuthenticity: "not-established"`.

Unexpected fields and contradictions fail. Incomplete evidence requires
`inconclusive`. A passing gate requires the mode's positive behavior, complete
evidence/execution/cleanup, current applicability and all required checks passing.
The bridge validates these invariants; it does not classify assertions or parse
test log strings. Non-success requires explicit reason codes.

The engine writes `manifest.json` (the terminal envelope), `summary.md`, and its
evidence index/attempts/source and contract bundles in the owned run. Evidence
index paths must stay within the run; replay validates every attachment and
requires exact recoverable source bytes, not merely hashes. Engine-owned evidence
includes attempt identities, environment/setup identities, approval provenance,
cleanup, omissions/redaction, replay requirements and limitations from RFC §10.

Only command observations are available from ordinary project commands. To pass,
the engine must validate the same external `node-script-v1` harness, named tests
and assertions, approved expected symptom, target binding and complete terminal
events on both revisions. Default pilot policy uses three fresh attempts each.
Setup errors/zero tests/skips/timeouts do not establish expected assertion failure.
Supporting-check failures block the gate without erasing a valid observation.

## Ownership and limits

The engine owns revision resolution, lossless worktree capture, process trees,
attempt resets, terminal classification and replay. No stash, reset, index edit,
automatic fetch, approximate replay, model calls or package installation. It must
recheck source applicability at completion. A malicious in-process target can
forge observations; this is trusted-local execution, not a sandbox.

The bridge supplies a disposable HOME/temp area and no inherited credentials,
PATH or NODE_OPTIONS (Windows system directory variables only are forwarded).
Target environment/setup is explicitly controlled by the engine's approved
policy. Engine output and diagnostics are each bounded to 1 MiB; diagnostics are
not forwarded as terminal text. On cancellation/timeout the bridge sends SIGTERM,
then SIGKILL to its owned group after 250 ms; cleanup uncertainty after one second
blocks acceptance. Partial evidence stays in the run; scratch controller copies
are removed. Separate invocations use UUID create-only output directories.

Exit meanings for verify/replay: 0 passing gate, 1 complete blocking evidence,
2 invalid/unapproved/unavailable/unsupported prerequisite, 3 incomplete/protocol/
stale/cleanup failure, 130 interruption. `doctor` zero means prerequisites only,
with `execution: not_run` and `gate: not_evaluated`. `report` zero means valid
rendering only; JSON wraps it with previously-recorded provenance, and Markdown
escapes control characters and markup. Report never starts an engine or follows
attachments/URLs. Replay takes execution authority only from the current policy.

## Qualification still required

Stub acceptance does not qualify a release. Required engine work includes all
mode/outcome classifications, setup/collection/assertion failure cases, dirty-tree
capture and races, exact replay, environment isolation and process cleanup on each
advertised platform. Run a real preservation pilot and a reviewed historical
fix pair at exact revisions, with independent replay and contract/evidence review.
Node 24 Linux/macOS are the planned engine targets; neither is advertised as
qualified by these fixtures. Core Node 18/22 and Windows bridge CI remains intact.
