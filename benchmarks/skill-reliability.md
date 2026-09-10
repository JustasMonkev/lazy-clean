# Skill retention and Appium smoke checks

Baseline: `ec008bc` (PR #10 merged). No commits or pushes were made for this work.
Node v26.5.0; package supports Node >=18. OpenCode and its plugin API: 1.18.30.

## Research applied

Exa searches reviewed 15 results across three focused queries; primary source
code and skill documents below supplied the useful patterns. No external code,
new dependency, embedding matcher, or workflow framework was copied into the package.

| Primary source | Decision for lazy-clean |
| --- | --- |
| [Superpowers OpenCode plugin](https://github.com/obra/superpowers/blob/main/.opencode/plugins/superpowers.js) | Deliver actual instructions through host hooks, rather than assume a skill catalog entry is sufficient. Keep the existing per-turn injection. |
| [OpenCode Agent Skills plugin](https://github.com/joshuadavidthomas/opencode-agent-skills/blob/main/src/plugin.ts) | Treat session identity and compaction as lifecycle concerns; keep state per identified session. No semantic matcher is needed for an explicitly active mode. |
| [Superpowers writing-skills](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md) | Test agent behavior and actual artifacts; a skill description or agent's self-report is not proof of compliance. |
| [Anthropic skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) | Separate triggering, task outcomes, and quantitative checks. Iterate on observed omissions rather than inflate a rating. |

These are moving source links, accessed 2026-09-10, not pinned implementation
provenance. The older package comparison remains in [SOLID guidance](solid-guidance.md).

## Changes and evidence

- Main and fallback prompts carry the actionable SOLID core. The detailed
  reference remains available for boundary changes. Full injected prompts are
  695 / 693 / 696 words (lite / full / ultra) under the existing counting test.
- A header or compacted summary no longer counts as a fully loaded ruleset.
  Unfinished checks survive handoffs in the instructions. Requirements, edge
  cases, and failure modes must map to rerunnable tests; existing coverage is reused.
- One state boundary serves hook hosts and OpenCode. Identified sessions retain
  explicit off and levels independently. Startup/clear initialize defaults;
  resume/compact restore. Existing unidentified hosts retain the global fallback.
- Shared UTF-8 input parsing bounds payloads and waiting, clears timers/listeners,
  and handles malformed or incomplete input. Session writes are atomic.
- Statusline launchers use the same Node state/config readers instead of parallel
  parsers. The old global override is not copied into unrelated identified
  sessions; it remains available to legacy callers.

The initial saved lifecycle test revision had 611 passes and 32 failures. A
separate eight-case subprocess probe failed all eight cases before the fix and
passed all eight afterward. Disabling session scoping in a temporary copy made
that probe fail again; restoring it returned eight passes. Compact logs are in
[retention evidence](results/skill-reliability/). Saved tests also exercise actual
concurrent writers, restart, subagent/badge identity, default changes, explicit
off, hostile/colliding IDs, BOM input, and missing EOF.

Astra also caught an inherited-default-off gap in Qoder: another session could
change the default and re-enable it. Pinning the initial off level fixed that
red→green case, with saved cross-session regression coverage.

Astra found a new FIFO-config hang in the Node badge path. It was reproduced
with a timed-out subprocess, fixed with a regular-file check, and given a saved
regression. Nine local launches measured median badge startup at 9.76 ms before
and 33.61 ms after, with identical output. This is a latency tradeoff, not a
speedup. PowerShell execution and actual live-host compaction remain unverified.

The final SOL judge found that UTF-8 hashing collapsed distinct lone-surrogate
session IDs into the replacement character. The regression sets three such IDs
to different levels through the real hooks and resumes each independently.
The hook suite went from 663 passes / 1 failure to 664 passes / 0 failures.
The first UTF-16-only fix passed that regression but changed existing Qoder
filenames. Astra reproduced a saved off level being ignored. The compatibility
correction preserves legacy UTF-8 hashes for well-formed IDs and uses a disjoint
binary prefix plus exact UTF-16 code units only for malformed IDs. Baseline-format
Qoder state is tested separately; changing a test filename mirror is not proof
of compatibility. The compatibility regression suite went from 642 passes /
24 failures to 666 passes / 0 failures.

## Model and review limits

After the user approved both external transfers, the requested
`zai-coding-plan/glm-5.3-flash` ran through OpenCode's `build` agent with the
`max` variant in an isolated candidate copy. Its first attempt hit OpenCode's
internal path permissions. A canonical-path retry read the full skill and
runtime, ran the tests, and timed out at 600 seconds before its final verdict.
A bounded continuation of that same session completed with **NO FIX NEEDED**.
GLM made no source changes; this is a review result, not a GLM implementation.
Its verdict was not accepted as proof of correctness: a separate judge found a
session-ID Unicode collision it missed, and Astra identified factual errors in
its explanation of write verification, absent-state handling, and test exits.
Its observed skill read establishes delivery, not guaranteed adherence.

The first approved standalone `codex review --uncommitted` completed with exit 0 and
no actionable regressions. It independently ran the full tests, changed-file
slop checker, and whitespace check. Source hashes and compact external-run
provenance are saved in [external reviews](results/skill-reliability/external-reviews.json).
The final standalone review also completed clean after the Unicode/Qoder fixes;
its optional delegated check failed network access and is not counted as passed.
Earlier permission failures and the retry timeout remain part of the record.
Astra rated GLM’s pre-fix review **5/10, NOT CLEAN**, after independently
confirming the missed collision. There is no GLM code-delta score.

Runtime changes were made locally. Fresh in-session Astra review scored the
reviewed final runtime diff 9/10, with no remaining confirmed defect after the
FIFO, Unicode identity, and Qoder compatibility fixes.
That is a review opinion, not a guarantee or a measured skill-adherence score.

The skill-creator Python validator could not start because PyYAML is unavailable;
an offline attempt was blocked by cache permissions. Existing package guidance,
frontmatter, and runtime tests are separate checks, not a claim that this
validator passed.

## Luna on Appium

Two historical bug baselines from `/Users/justas/Desktop/appium` were copied
under `/tmp`; the original checkout was not changed. Luna (`gpt-5.6-luna`, xhigh)
applied the candidate guidance to fix a non-string URL-validation crash and
CLI directory-versus-file handling. It knew the bug locations, so these were
guided smoke trials, not blind or matched old/new experiments.

| Evidence | First pass | Reviewer-assisted correction |
| --- | --- | --- |
| URL focused tests | 3 pass | 3 pass with exact error and retained string-policy assertions |
| CLI focused tests | 4 pass | 8 pass including JSON files, long CSV, parse-error type/cause/messages |
| Saved mutations | Both original fixes fail when removed | New JSON-file-recognition mutation fails; restored suite passes |

Fresh Astra review scored the **initial artifacts 7.5/10**: the fixes worked,
but saved coverage missed several promised cases. Initial artifacts are frozen
separately. Astra rated the corrected artifacts 8.5/10 and independently reran 11/11 tests.
Its remaining raw-path-regex test finding was changed to a literal match, followed
by another passing CLI run. Corrections do not erase that first-pass result. This observation
motivated the skill's explicit requirement-to-test mapping; it is not evidence
that the new wording alone caused better behavior.

Full archived builds and broader package unit suites failed on dependency-version
mismatches. Targeted TypeScript compiles also exit 2 but emit the focused code;
source/output checksums and exact commands are retained. Appium slop scans exit 1
on pre-existing `any` annotations, not clean. Existing permissive URL string
validation was intentionally preserved, not claimed to be standards-compliant.
No full-repository Appium success, cross-model adherence guarantee, or 10/10
quality result is claimed.

The [compact trial bundle](results/skill-reliability/appium-trials.json) retains
patches, red/green/mutation logs, statuses, compilation provenance, and the
isolation audit. The expanded working evidence remains at
`/tmp/lazy-appium-evidence/README.md`.

## Final local verification

- `npm test`: exit 0, including 666 hook checks and 423 guidance checks, plus
  checker/CLI, feedback, and both benchmark-grader suites. Expected failing
  fixtures inside grader self-tests are not failing package tests.
- `npm run slop-check`: exit 0, 23 files checked.
- Installed bundled checker `--since=HEAD`: exit 0, 12 changed JS/MJS files checked.
- `git diff --check`: exit 0. No staged changes; HEAD remains `ec008bc`.
- Both changed skills' frontmatter also parsed with the already-installed YAML
  library; this does not replace or claim success for the blocked Python validator.
- Final standalone Codex review: exit 0, no actionable regressions. Its optional
  delegated check failed network access; the direct review and checks completed.
- Final independent SOL verdict: **CLEAN — 9/10**, after process-boundary
  compaction/off-state/badge probes and legacy-hash checks.
- Final Astra runtime verdict: **CLEAN — 9/10**, no actionable finding. PowerShell
  and real host compaction are still outside the executed coverage.

## Does this help readability?

The guidance favors explicit guards, meaningful names, small cohesive changes,
and useful shared logic—not the fewest lines. The Appium artifacts demonstrate
those habits: a type guard keeps URL validation readable, and `isRegularFile`
names one decision shared by CSV and JSON handling. Contract-focused tests make
future edits safer. No blind readability comparison or general improvement rate
was measured, and reviewer assistance was needed to complete test coverage.
