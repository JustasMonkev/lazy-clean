# Final blind calibration audit

Reviewed all **36** primary judgments: **35 confirmed**, **1 proposed score correction**, **no gate changes**.

## Proposed correction

- **URL artifact-029: 100 → 99**. Its only bigint case is `0n` at `url/artifact-029/saved-tests/validators.test.cjs:21`. The baseline already rejects falsy `0n` normally; no saved truthy bigint exercises the original failing branch. Deduct one regression-quality point consistently with missing truthy number/boolean cases elsewhere. All gates remain PASS.

## Confirmed gate failure

**CLI artifact-026 remains non-ranking (diagnostic 88.5).** Saved CSV calls at lines 40 and 47 append text to directory/link paths and therefore test nonexistent strings. Its CSV-only missing-fix reference passes 18/18; the baseline fails only the JSON directory case. Production behavior still passes.

## Complete calibration

| Artifact | Task | Decision | Proposed total | Ranking eligible |
|---|---|---|---:|:---:|
| artifact-001 | cli | confirm | 98.5 | Yes |
| artifact-002 | cli | confirm | 97.5 | Yes |
| artifact-003 | cli | confirm | 96.5 | Yes |
| artifact-004 | url | confirm | 100 | Yes |
| artifact-005 | cli | confirm | 98 | Yes |
| artifact-006 | url | confirm | 97 | Yes |
| artifact-007 | url | confirm | 97 | Yes |
| artifact-008 | url | confirm | 95 | Yes |
| artifact-009 | url | confirm | 100 | Yes |
| artifact-010 | url | confirm | 95 | Yes |
| artifact-011 | url | confirm | 99 | Yes |
| artifact-012 | url | confirm | 100 | Yes |
| artifact-013 | url | confirm | 95 | Yes |
| artifact-014 | url | confirm | 94 | Yes |
| artifact-015 | cli | confirm | 98.5 | Yes |
| artifact-016 | cli | confirm | 95.5 | Yes |
| artifact-017 | cli | confirm | 97.5 | Yes |
| artifact-018 | url | confirm | 96 | Yes |
| artifact-019 | cli | confirm | 94.5 | Yes |
| artifact-020 | url | confirm | 98 | Yes |
| artifact-021 | cli | confirm | 97.5 | Yes |
| artifact-022 | cli | confirm | 96 | Yes |
| artifact-023 | cli | confirm | 95 | Yes |
| artifact-024 | url | confirm | 100 | Yes |
| artifact-025 | cli | confirm | 93 | Yes |
| artifact-026 | cli | confirm | 88.5 | No |
| artifact-027 | cli | confirm | 97.5 | Yes |
| artifact-028 | url | confirm | 98 | Yes |
| artifact-029 | url | adjust | 99 | Yes |
| artifact-030 | url | confirm | 99 | Yes |
| artifact-031 | cli | confirm | 96 | Yes |
| artifact-032 | cli | confirm | 97 | Yes |
| artifact-033 | url | confirm | 98 | Yes |
| artifact-034 | cli | confirm | 96 | Yes |
| artifact-035 | url | confirm | 99 | Yes |
| artifact-036 | cli | confirm | 98 | Yes |

## Evidence and limits

- Inspected every source patch, complete baseline, saved suite and handoff; reconstructed all 36 candidate sources from baseline plus patch and matched them exactly.
- Recomputed frozen source/compiled/test hashes and reviewed trusted candidate, hidden and reference-test evidence. All score and deduction arithmetic reconciles.
- This is blind calibration after viewing anonymous primary judgments, **not duplicate independent first-pass scoring**. No model/treatment identities or other experiment directories were accessed.
- No novel production behavior failure or new mutation pool was introduced. Runtime evidence comes from trusted executions, not new runs by this auditor.
- Full builds/typechecks are a shared unavailable check, not a defect. Permission-based saved tests have repeatability limits; omitted scratch commands alone are not fabrication.
- Small within-task score differences are rubric judgments, not statistically established superiority.

Finalized before identity disclosure: 2026-09-10T17:47:34.674884+00:00
