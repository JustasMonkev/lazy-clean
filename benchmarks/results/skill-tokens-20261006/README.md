# All-skill token benchmark outcome and compact help

The hoped-for **20% reduction was not achieved**. The fully measured final
candidate used **1.30% more total tokens** and had **102 quality passes / 30
failures**, versus baseline 105/27. Counterproductive proposals were rejected.

Only `skills/lazy-help/SKILL.md` is changed in the published skill source. Its
complete command/config card remains display-only; metadata, runtime/checker
implementations, hook/fallback surfaces and user configuration are unchanged.
All 12 help outputs passed independent review. Their reported total was
375,267 → 372,173 tokens (**0.8245% lower**); the body is 3,263 → 2,362 UTF-8
bytes. Byte reduction is not a token-savings measurement.

**Scope limit:** those help results were measured within the frozen final
candidate containing changed help, debt and slop instructions. Debt and slop
were subsequently restored. The shipped help-only closure did not receive
another full 132-run comparison. This report does not substitute a synthetic
assembled result, establish causality, or promise future savings.

## Independent challenge

The requested `/grill-skill` was unavailable; the user accepted an independent
adversarial review instead. Self-review and that challenge required frozen
dependency closures, audited instruction isolation, repeated runs, original
contract gates, and per-model reporting. The review caught mismatched rubrics,
malformed verification prerequisites, duplicate assessment variants and omitted
failure rates before the full baseline. A proposed helper framework was not
adopted without token evidence. Later independent outcome reviews and the
scan-grade amendment are retained rather than concealed.

## Full inventory and execution

All 11 filesystem skills were tested before and after the proposals:
`lazy`, `lazy-clean`, `slop-check`, `lazy-review`, `lazy-audit`, `lazy-debt`,
`lazy-help`, `lazy-gain`, `lazy-verify`, `layz-test`, and the pre-existing
untracked `test-quality-review` draft. Both that draft directory and its
`.opencode/command/test-quality-review.md` remain outside the source PR; its
original frozen closure is archived solely for all-11 experiment reproduction.

Each model arm uses GPT-6.1 Sol/medium and GPT-6 Luna/medium, two task variants
and three repetitions: 132 planned calls, two concurrent. Seven skills have
substantively different assessment tasks; four variants are framing repeats,
not independent generalization evidence. Tasks and source snapshots were frozen
before optimization. Baseline preceded edits; assessment was an acceptance gate,
not a tuning source. Independent reviewers inspected every outcome, including
saved coverage, actual commands, report honesty and lifecycle evidence.

The bounded real Playwright source is revision
`b9a34ac7783a1b6c2e1dfff0c08ac744c048fa59`; the initial checkout was clean.
Its manifest pins TypeScript 6.0.3. Observed host versions were Node v26.5.0 and
Codex CLI 0.160.1. These extracted-source experiments are not a full Playwright
suite, a new OS sandbox, or verification-engine qualification.

## Measured arms

| Arm | Terminal attempts | Completed / execution failed | Valid / missing usage | Quality pass / fail |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 132 | 132 / 0 | 132 / 0 | 105 / 27 |
| First candidate | 132 | 128 / 4 | 128 / 4 | 85 / 47 |
| Revision2 | 132 | 132 / 0 | 132 / 0 | 87 / 45 |
| Final recovery candidate | 132 | 132 / 0 | 132 / 0 | 102 / 30 |
| Initial final host-startup failure | 132 | 0 / 132 | 0 / 132 | Not model quality: no model turns |

The first candidate's four timeouts occurred across an overnight clock gap;
unknown usage remains unknown. The initial final launch failed before model
startup because the outer sandbox could not initialize the app-server. Those
132 records remain separate. Recovery used the same allowed outer host
permission profile as baseline, with the same inner workspace-write settings.
Its single planned preflight is included in, not added to, the 132 calls.
Revision2 and final recovery used a process-lifetime native idle-sleep assertion;
no time-gain claim is made from that changed condition.

An unvalidated early isolation preflight is archived but excluded from every
comparison. The audited protocol excludes host skill catalogs by absolute path;
constant global retrieval instructions remain disclosed. Rendered instruction
audits do not claim to capture every internal CLI prompt component.

### Final candidate versus baseline

| Model / variant | Baseline pass / fail | Candidate pass / fail | Baseline total | Candidate total | All-attempt reduction | Matched passing pairs / conditional reduction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sol / train | 33 / 0 | 32 / 1 | 4,273,196 | 4,100,808 | 4.03% | 32 / -1.46% |
| Sol / assessment | 32 / 1 | 32 / 1 | 4,647,236 | 4,484,007 | 3.51% | 31 / 0.27% |
| Luna / train | 23 / 10 | 20 / 13 | 3,308,647 | 3,450,277 | -4.28% | 20 / -5.30% |
| Luna / assessment | 17 / 16 | 18 / 15 | 3,214,000 | 3,608,382 | -12.27% | 14 / -3.11% |
| All | 105 / 27 | 102 / 30 | 15,443,079 | 15,643,474 | -1.30% | 97 / -1.45% |

[Every skill/model/variant and descriptive subgroup](final-tables.md) has all
44 rows; [machine-readable comparison](final-comparison.json) retains input,
cached/uncached input, output, total, contributing counts and nulls. Input
already includes cached input; it is not added twice. Negative reduction means
more tokens. Passing-pair figures exclude workflow failures and are conditional,
not full-suite efficiency. Changed-three/unchanged-eight entrypoint groups are
not independent controls: shared reference/closure reads remain included.
Three repetitions, sequential arms and differing outputs do not support causal,
statistical-generalization, cost, time or full-project claims.

## Rejections and grading correction

The TRAIN-only selection was recorded before final assessment. Earlier proposals
and their dependency closures remain immutable in the archives. The full final
candidate was measured after restoring other proposals and repairing slop's
original unconditional final root-scan instruction.

- **Debt:** all 12 quality passes, but Luna used 11.45% more train tokens and
  23.19% more assessment tokens. Restored exact baseline source.
- **Slop:** Sol passed 6/6; Luna omitted the mandatory final root scan in all
  six runs, including train 0/3 versus baseline 2/3. Rejected despite the
  contract repair. Restored baseline skill/test and removed the orphan inventory.
- **TQR:** the earlier candidate's assessment counterexamples failed the gate.
  Its exact pre-existing original was restored, not introduced as a new feature.
- **Help:** all 12 pass; observed per-model/variant all-attempt reductions range
  from 0.367% to 1.141%. Only this modest source change is retained.

Eighteen earlier slop passes were amended after command-by-command review found
that the original mandatory root `--since=HEAD` scan had been omitted. A focused
scan is not that gate, even for a read-only task. An independent reviewer
confirmed the command extraction; no alias/generated-script scan was overlooked. Pre-amendment files,
actual commands and revised verdicts are preserved. Corrected first-candidate
and revision2 totals are 85/47 and 87/45; avoided scans are not efficiency gains.

All 24 final `lazy`/`lazy-clean` implementations passed actual independent
oracles: 12 train × 28 plus 12 assessment × 27 = **660 checks**. Saved-test and
workflow failures still count. Honest blocked `lazy-verify` reports can pass the
benchmark's honesty gate without passing the actual release/project gate.
A genuine failing `layz-test` reproducer is useful discovery, not itself a
quality failure; coverage, effectiveness proof and restoration are assessed too.

## Checks and artifacts

- Actual final `npm test`: exit 0; checker/CLI suites, 812 hook checks and 764
  language checks pass. Fake-client/mutation failures are intentional harness
  cases; bridge fixtures do not qualify a real verification engine.
- Actual repository-root slop scan: **exit 1**, 12 `no-any` findings in the two
  retained public TS controls. Their signatures/casts are unchanged upstream
  comparison context; no suppression or checker weakening. This is a failed
  scan, not clean. The separate authored-helper scoped scan is exit 0 / no
  findings; JS syntax checks pass.
- Current frontmatter validator, installed Python 3.11.14 with PyYAML: seven
  valid, four baseline-identical `argument-hint`/`disable-model-invocation`
  rejections retained for compatibility. Earlier missing-PyYAML setup failures
  remain archived, not reclassified as invalid schemas.
- Archive hashes/paths/owners, all 660 terminal record metrics/statuses and all
  44 comparison rows/15 groups are independently audited. All discrepancies
  are zero. Redaction, metric and portable-parser/host-guard positive controls
  pass. Python compile/import-safety checks pass; no configured Python linter
  or type checker was found, and none is claimed.
- `git diff --check` passes. User draft hashes are unchanged. The isolated
  branch-source `npm test` also passes after initializing a fresh independent
  Git repository; its first no-Git setup failure is preserved.

Detailed checked outcomes and limitations are in [final-shipped-checks.json](final-shipped-checks.json)
and the checks archive; [archive-audit.json](archive-audit.json) and
[comparison-audit.json](comparison-audit.json) record package verification.

[Artifact guide](ARTIFACTS.md) explains extraction, case reconstruction,
normalization, checksums and portable runner guards. Frozen inputs, terminal
JSONL/stderr/diffs, submitted tests, independent grades/oracles and failures are
retained in four deduplicated archives. Original and publication hashes/modes
are recorded; no user Git/auth/home state is bundled. Publication paths are
normalized and credential-shaped values scanned/redacted. The audit is a
bounded heuristic check, not a secrecy guarantee or deterministic replay.

To rerun the public oracle proof after extracting `inputs.tar.gz` here:

```sh
node grading/proof.mjs "$PWD/inputs/source/packages/isomorphic/stringUtils.ts"
```

The expected original-source assertion failures distinguish the two known-good
controls from tooling failures; they are not presented as passing project tests.
