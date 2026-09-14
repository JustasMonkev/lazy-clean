# Matched model comparison: skill on versus off

## Result

**36 fresh runs completed; all production submissions passed focused hidden checks.** Strict saved-regression gates are reported separately from production behavior and numeric scores. These are artifact scores for two guided Appium bug fixes, not an overall skill rating.

Three repetitions per task/model/condition; scores below are medians on a 10-point scale. Where a cell has a gate failure, its score is conditional on the eligible submissions and cannot stand in for a clean three-run result.

| Model | Task | Without skill | With skill | Gate passes (off → on) | Eligible paired score changes, r1 / r2 / r3 |
| --- | --- | ---: | ---: | --- | --- |
| LUNA | URL | 9.50 | 9.80 | 3/3 → 3/3 | +0.10 / +0.40 / +0.30 |
| LUNA | CLI | 9.75 | 9.65 | 3/3 → 3/3 | +0.05 / -0.15 / -0.05 |
| SOL | URL | 10.00 | 10.00 | 3/3 → 3/3 | +0.00 / -0.10 / +0.20 |
| SOL | CLI | 9.80 | 9.80 | 3/3 → 3/3 | +0.05 / -0.25 / +0.05 |
| GLM | URL | 9.90 | 9.70 | 3/3 → 3/3 | +0.30 / -0.50 / -0.20 |
| GLM | CLI | 9.60 | 9.50 | 2/3 → 3/3 | -0.20 / +0.05 / not rankable |

A non-ranking failed submission is never averaged into an eligible score, and its pair is not assigned a quality improvement number. All three repetitions are visible below.

## Strict findings and interpretation

- **35/36 pass all strict gates:** all 18 skill-on submissions and 17/18 controls. All 36 actual source implementations and saved suites run green, but green tests alone do not establish regression coverage.
- **GLM, CLI, repetition 3, skill off (artifact-026) fails saved regression.** Its CSV directory test passes `` `${dir},,x ,` `` and its directory-symlink test appends ` ,foo`. Those are nonexistent paths, not the created directory/link. The entire saved suite still passes when the CSV directory bug is reintroduced. The production fix is correct; the claimed CSV regression coverage is not. Its 8.85 is diagnostic, not ranking-eligible.
- **No consistent quality improvement:** Luna's URL median improves 9.50 → 9.80, but its CLI median declines 9.75 → 9.65. SOL's medians are unchanged. GLM's URL median declines 9.90 → 9.70; its CLI skill-on submissions all pass the gates, but their eligible score median is not higher than the two eligible controls. The failed control prevents a clean three-pair numeric comparison.
- **No demonstrated readability gain:** five model/task cells have unchanged median readability; Luna CLI declines 15 → 14 out of 15 because two skill-on fixes introduce redundant predicate state. Smaller source totals did not translate into uniformly clearer code.
- Remaining deductions concern specific saved-test gaps, fixture cleanup/isolation, permission-dependent reruns, and minor handoff overstatements. Correctness and preservation points are full for every artifact; scores differ mainly in verification quality.
- The independent calibration accepted 35 initial judgments and corrected one URL score, artifact-029, from 10.00 to 9.90: its sole bigint case was falsy `0n`, which already received the right error in the baseline. This applies the same missing-truthy-input deduction used elsewhere. Initial judgments remain archived.

**Verdict:** the skill was observably used, but these results do not justify a universal better-code claim, full-adherence claim, or a 10/10 overall rating. The clearest unmet adherence signal is GLM skipping every linked reference guide despite invoking the checker.

## Did agents actually use the skill?

Core guidance was present in every skill-on prompt. The observable tool-input audit found:

| Model | Checker invoked | Simplification guide opened | Risk guide opened | Design guide opened |
| --- | ---: | ---: | ---: | ---: |
| LUNA | 6/6 | 6/6 | 6/6 | 5/6 |
| SOL | 6/6 | 6/6 | 6/6 | 6/6 |
| GLM | 6/6 | 0/6 | 0/6 | 0/6 |

No control run showed added-guidance access in observed command/tool inputs. These are access observations, not proof of understanding, exhaustive adherence, or unobservable filesystem activity. GLM used the checker but did not open linked reference guides. Live compaction/session retention was not exercised: **this study cannot establish that agents fully use or never drop the skill.**

## Size, readability and elapsed time

Across the 18 submissions in each condition, skill-on production sources totaled **985 lines versus 1,006 without** (21 fewer, 2.1%). The common baselines totaled 891 lines: the fixes added 94 production lines with the skill and 115 without. Both conditions added required logic; neither was a net deletion. Saved tests totaled 2,140 versus 2,214 lines. These aggregate counts describe these repeated artifacts, not a real combined Appium patch, and were withheld from judges. Fewer lines do not establish readability.

| Model | Task | Median source lines, off → on | Median readability points / 15, off → on | Median elapsed seconds, off → on |
| --- | --- | --- | --- | --- |
| LUNA | URL | 17 → 17 | 15 → 15 | 123.8 → 174.0 |
| LUNA | CLI | 90 → 92 | 15 → 14 | 163.6 → 330.8 |
| SOL | URL | 17 → 17 | 15 → 15 | 122.7 → 200.0 |
| SOL | CLI | 94 → 90 | 15 → 15 | 230.8 → 482.8 |
| GLM | URL | 20 → 17 | 15 → 15 | 79.7 → 86.5 |
| GLM | CLI | 96 → 95 | 15 → 15 | 222.6 → 113.5 |

Timing includes CLI startup and model work. At most three workers ran concurrently; scheduling, cache state, API/host contention and the URL judge overlapping the last CLI trials were not controlled. These medians are descriptive, not causal latency/cost claims. Raw native usage counters are retained; no dollar-cost estimate is asserted.

## All 36 first-pass results

Scores marked † are diagnostic only because a gate failed. C/H/T are fresh compilation, hidden behavior, and saved tests; full build/typecheck was not run.

| Model | Task | Repeat | Without: score; gates; C/H/T | With: score; gates; C/H/T | Blind artifact IDs (off / on) |
| --- | --- | ---: | --- | --- | --- |
| LUNA | URL | 1 | 9.60; 4/4; pass/pass/pass | 9.70; 4/4; pass/pass/pass | artifact-018 / artifact-006 |
| LUNA | URL | 2 | 9.50; 4/4; pass/pass/pass | 9.90; 4/4; pass/pass/pass | artifact-008 / artifact-011 |
| LUNA | URL | 3 | 9.50; 4/4; pass/pass/pass | 9.80; 4/4; pass/pass/pass | artifact-010 / artifact-020 |
| LUNA | CLI | 1 | 9.60; 4/4; pass/pass/pass | 9.65; 4/4; pass/pass/pass | artifact-022 / artifact-003 |
| LUNA | CLI | 2 | 9.75; 4/4; pass/pass/pass | 9.60; 4/4; pass/pass/pass | artifact-021 / artifact-031 |
| LUNA | CLI | 3 | 9.75; 4/4; pass/pass/pass | 9.70; 4/4; pass/pass/pass | artifact-002 / artifact-032 |
| SOL | URL | 1 | 10.00; 4/4; pass/pass/pass | 10.00; 4/4; pass/pass/pass | artifact-024 / artifact-009 |
| SOL | URL | 2 | 10.00; 4/4; pass/pass/pass | 9.90; 4/4; pass/pass/pass | artifact-004 / artifact-029 |
| SOL | URL | 3 | 9.80; 4/4; pass/pass/pass | 10.00; 4/4; pass/pass/pass | artifact-033 / artifact-012 |
| SOL | CLI | 1 | 9.80; 4/4; pass/pass/pass | 9.85; 4/4; pass/pass/pass | artifact-005 / artifact-001 |
| SOL | CLI | 2 | 9.85; 4/4; pass/pass/pass | 9.60; 4/4; pass/pass/pass | artifact-015 / artifact-034 |
| SOL | CLI | 3 | 9.75; 4/4; pass/pass/pass | 9.80; 4/4; pass/pass/pass | artifact-027 / artifact-036 |
| GLM | URL | 1 | 9.50; 4/4; pass/pass/pass | 9.80; 4/4; pass/pass/pass | artifact-013 / artifact-028 |
| GLM | URL | 2 | 9.90; 4/4; pass/pass/pass | 9.40; 4/4; pass/pass/pass | artifact-030 / artifact-014 |
| GLM | URL | 3 | 9.90; 4/4; pass/pass/pass | 9.70; 4/4; pass/pass/pass | artifact-035 / artifact-007 |
| GLM | CLI | 1 | 9.75; 4/4; pass/pass/pass | 9.55; 4/4; pass/pass/pass | artifact-017 / artifact-016 |
| GLM | CLI | 2 | 9.45; 4/4; pass/pass/pass | 9.50; 4/4; pass/pass/pass | artifact-019 / artifact-023 |
| GLM | CLI | 3 | 8.85†; 3/4; pass/pass/pass | 9.30; 4/4; pass/pass/pass | artifact-026 / artifact-025 |

## Method and verification

- Exact models: `gpt-5.6-luna` and `gpt-5.6-sol` via Codex CLI at `xhigh`; `zai-coding-plan/glm-5.3-flash` via OpenCode build agent at `max`. Node 26.5.0, TypeScript 6.0.3, argparse 2.0.1, Codex CLI 0.154.0, OpenCode 1.18.30.
- Historical Appium URL baseline `1a81ac88f361f6cb5c19cd701775aca07ca46d68`; CLI baseline `422362a259bdd8e13055389c7644eb3d76e94fe1`.
- Three fresh repetitions × two tasks × three models × on/off = 36 first-pass runs / 18 matched pairs. Identical task contracts, baseline, focused harness and 600-second limit within each pair; condition order counterbalanced. No reviewer feedback or repairs before scoring.
- Separate detached temporary worktrees and fresh native CLI contexts. Codex project/global skill hooks and plugin discovery disabled. OpenCode isolated XDG state, `--pure`, and disabled external/Claude/project skill loading. The treatment was the actual current ultra injected guidance plus its resources, not a new experimental rewrite.
- Hidden suites and five reference mutants were frozen before worker outcomes; baseline bugs were demonstrated red and reference fixes green. Final v4 grading freshly compiled frozen source, ran unchanged frozen tests against candidate/baseline/mutants, and verified source/test/compiled hashes and scope.
- Three fresh Astra reviewers: one fully judged all 18 URL artifacts; one fully judged all 18 CLI artifacts; a third audited all 36 for consistent deductions/gates and inspected their sources/tests. Initial scores and calibration are preserved separately. Model/condition names, timings and line metrics were withheld from judges; code style/check traces can still suggest treatment, so blinding is not absolute.
- URL initial grading used already-valid v3 packets. Uniform final v4 grading restored compiled-module/fixture/dependency layouts for CLI tests and confirmed identical URL outcomes. Original provisional grading and earlier relocation failures were coordinator issues, never counted as model defects. See the grading amendment and harness audit.
- All 36 sessions exited successfully with terminal responses, no timeouts/runtime errors, baseline HEADs unchanged, no staging or task-scope violations. Original Appium remained at its pre-existing untracked `.zvec-grep/` status. Previously reviewed package implementation hashes remained unchanged during this experiment.
- Final local evidence checks: installed `slop-check --since=HEAD` clean (14 files), `git diff --check` clean. No new claim of a full Appium build/typecheck.

## Limits

Two explicitly specified bug fixes with three repetitions per cell cannot establish broad model superiority, universal skill effectiveness, or a 10/10 skill/runtime rating. Detailed shared task contracts create a ceiling effect and already give controls strong preservation/testing instructions. This measures the marginal effect of added skill guidance in these native coding environments. It does not test broad discovery, large architecture work, long conversations, compaction, PowerShell or live host lifecycle. SOLID was scored only where applicable; no interfaces or abstractions were required just to satisfy principle names.

## Evidence

The [audit bundle](results/paired-models-20260910/README.md) includes all frozen source/tests/handoffs/check logs, protocol, rubric, reference mutants, exact normalized judging packets, three judgments, adjudications, paired scores, tool-use evidence and hashes. Raw native event streams remain at their recorded temporary locations.

**Nothing was committed, staged or pushed. The original Appium checkout was not changed.**
