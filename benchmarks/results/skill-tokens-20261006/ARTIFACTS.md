# Skill token study evidence

This package records GPT-6.1 Sol / medium and GPT-6 Luna / medium trials on a bounded snapshot of real Playwright source. It includes all observed benchmark arms and their frozen evidence. Read `snapshot.json` for the capture time, terminal/pending counts, raw usage, quality outcomes, exclusions, and conditional matched-pair results. Read the per-arm expected-but-not-yet-terminal counts before treating a snapshot as complete. Missing, failed, timed-out, and ungraded attempts are not counted as successful measurements.

## Files

| File | Contents |
|---|---|
| `inputs.tar.gz` | Frozen public source, all task prompts, all available frozen skill closures, original manifests/harnesses, prompt-isolation audit, and independent coding oracles. |
| `attempts.tar.gz` | Every captured terminal record, raw model JSONL/stderr, task diff, untracked inventory, prompt, and excluded environment preflight. |
| `cases.tar.gz` | Case index plus content-addressed changed/new files, including submitted tests, verification data, and saved evidence. No repeated unchanged workspaces or Git/user configuration. |
| `checks.tar.gz` | Recorded project checks, metadata-validator results, mutation evidence, and contemporaneous reports. |
| `snapshot.json`, `grades*.json`, `final-comparison.json`, `final-tables.md` | Readable measurements, canonical quality verdicts, complete-row and conditional comparisons. Pre-amendment verdicts are archived as history only. |
| `provenance.json`, `archives.json` | Original/publication file SHA256 values, normalization/redaction notes, modes, and archive checksums. |
| `upstream-fixture-scan*` | Uncompressed scan output, exit status, and retained-invariant rationale for the two archived upstream controls. |
| `prepare.mjs`, `audit.py`, `archive-audit.json` | Refresh helper and archive/metric-preservation audit; no live study edits. |

At the initial publication capture the four archives totaled about 5.2 MB, versus 346 MB of study workspaces. Exact current sizes and hashes are in `archives.json`. Unchanged source/skill files are stored once per frozen closure. Changed/new case files are deduplicated by published-content hash and mapped back to their original paths and modes. All terminal failures and partial timeout artifacts remain included.

## Inspect or reconstruct

Extract the archives into a new disposable directory. They create `inputs/`, `attempts/`, `cases/`, and `checks/`.

```sh
tar -xzf inputs.tar.gz
tar -xzf attempts.tar.gz
tar -xzf cases.tar.gz
tar -xzf checks.tar.gz
node inputs/runner.portable.mjs selftest
node inputs/revision2-runner.portable.mjs selftest
# If present: node inputs/final-runner.portable.mjs selftest
```

To reconstruct a case, independently copy `inputs/source/` into a fresh workspace and the selected arm's `inputs/ARM/skills/` into its `skill-files/`. Overlay the case's entries from `cases/index.json`: copy each referenced blob to its recorded relative path, verify its SHA256, restore its mode, and apply recorded deletions. Inspect the raw diff alongside that reconstruction; it also records the seeded review-task changes. Git history/configuration and scratch process state are intentionally not reproduced. Archive uid/gid are zero, owner names are empty, and PAX headers are absent; required file modes remain recorded. For final checker comparisons, initialize a local baseline commit before overlaying the case files.

The coding oracle accepts `train` or `heldout` and an absolute reconstructed `stringUtils.ts` path. It imports real code; it does not install dependencies. Product behavior checks do not establish submitted-test quality, mutation/red-green proof, scoped edits, or report honesty by themselves.

The portable runners preserve exact model IDs, medium effort, task/source hashes, flags, repetitions, and bounds. If present, final-recovery-runner.portable.mjs has the same selftest entrypoint. Model execution requires `STUDY_HOST_SKILLS` pointing to a freshly audited JSON list of absolute skill paths; without it, execution stops before Codex starts. Host isolation, CLI/runtime versions, credentials, and cross-host equivalence must be checked separately. These are trusted-local experiments, not deterministic replays or an OS sandbox. Auth/home state is never bundled. Historical commands containing `<STUDY_ROOT>` are inspection records, not shell commands to paste unchanged.

## Redactions and limits

Publication copies replace user-home account paths with `/Users/REDACTED` and the original temporary root with `<STUDY_ROOT>`. `provenance.json` retains original and published hashes; normalized files are not presented as byte-identical originals. Credential-shaped values are replaced with typed placeholders and recorded without their originals. The current scan found no credential-shaped matches. This is a bounded heuristic scan, not a secrecy guarantee.

Seven skills have substantively different assessment tasks; four variants are repeat/framing checks. The source snapshot is not all Playwright. Input includes cached input; output/reasoning/cache fields are retained without double-counting. Unknown metrics stay null. Matched quality-pass reductions are conditional, not a claim that every attempt succeeded or that the requested efficiency target has been achieved.

The validator still rejects four baseline-identical metadata fields. The archived control scan exits **1**, with **12 unchanged upstream `no-any` findings**. Those signatures/casts preserve unrelated public APIs and control context; they were not changed or suppressed to make a scan clean. Compression is storage packaging, not checker remediation. Real verification-engine qualification remains unavailable; protocol fixtures and historical rendering do not qualify it.

Refresh after the required runs and grading finish:

```sh
STUDY_SNAPSHOT_ROOT=/absolute/live-study node prepare.mjs
STUDY_SNAPSHOT_ROOT=/absolute/live-study python3 audit.py
```

Review the refreshed counts and hashes before copying the package into the PR. Keep both the original untracked `skills/test-quality-review/` directory and `.opencode/command/test-quality-review.md` outside the PR. The original test-quality-review closure remains archived for all-11 reproduction. The measured candidate changed help, debt, and contract-repaired slop; publication retains **help only**. Debt and slop were rejected and restored. The 132 recovery trials therefore do not measure the restored shipped closure; no additional full run was made after rejection. Retained help measurements use its shipped body inside that rejected closure. The 20% target was not achieved. Read the exact publication decision embedded in final-comparison.json and archived in checks/final-evidence/final-publication-selection.json.
