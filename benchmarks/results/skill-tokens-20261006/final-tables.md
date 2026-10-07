# Final measured comparison

Captured 2026-10-07T03:38:51.363Z. All expected baseline/recovery measurements and verdicts are present.

Counts: attempts/planned; completed/execution-failed; missing usage; quality pass/fail/ungraded. Unknown usage is not zero. Known totals may be partial. All-attempt reduction is shown only for completely measured rows and does not qualify efficiency when quality fails. Passing-pair reductions are conditional. Input/cached/uncached/output/total sums and contributing counts are in final-comparison.json.

Changed-three and unchanged-eight **entrypoints** are descriptive groups, not independent controls; shared closure/reference reads remain included. Frozen measured source is not automatically validated shipped source. Historical startup failures remain explicit in snapshot.json and are not model-quality measurements.

## Group totals

| Model | Variant | Entrypoint/group | Baseline counts | Recovery counts | Baseline known total | Recovery known total | Complete measured row | All-attempt reduction | Passing pairs | Conditional reduction |
|---|---|---|---|---|---:|---:|---|---:|---:|---:|
| gpt-6.1-sol | train | all-entrypoints | 33/33; 33/0; 0; 33/0/0 | 33/33; 33/0; 0; 32/1/0 | 4273196 | 4100808 | yes | 4.03% | 32 | -1.46% |
| gpt-6.1-sol | train | changed-three-entrypoints | 9/9; 9/0; 0; 9/0/0 | 9/9; 9/0; 0; 9/0/0 | 657200 | 646665 | yes | 1.60% | 9 | 1.60% |
| gpt-6.1-sol | train | unchanged-eight-entrypoints | 24/24; 24/0; 0; 24/0/0 | 24/24; 24/0; 0; 23/1/0 | 3615996 | 3454143 | yes | 4.48% | 23 | -2.10% |
| gpt-6.1-sol | heldout | all-entrypoints | 33/33; 33/0; 0; 32/1/0 | 33/33; 33/0; 0; 32/1/0 | 4647236 | 4484007 | yes | 3.51% | 31 | 0.27% |
| gpt-6.1-sol | heldout | changed-three-entrypoints | 9/9; 9/0; 0; 9/0/0 | 9/9; 9/0; 0; 9/0/0 | 664585 | 689226 | yes | -3.71% | 9 | -3.71% |
| gpt-6.1-sol | heldout | unchanged-eight-entrypoints | 24/24; 24/0; 0; 23/1/0 | 24/24; 24/0; 0; 23/1/0 | 3982651 | 3794781 | yes | 4.72% | 22 | 1.07% |
| gpt-6-luna | train | all-entrypoints | 33/33; 33/0; 0; 23/10/0 | 33/33; 33/0; 0; 20/13/0 | 3308647 | 3450277 | yes | -4.28% | 20 | -5.30% |
| gpt-6-luna | train | changed-three-entrypoints | 9/9; 9/0; 0; 8/1/0 | 9/9; 9/0; 0; 6/3/0 | 515885 | 553945 | yes | -7.38% | 6 | -6.46% |
| gpt-6-luna | train | unchanged-eight-entrypoints | 24/24; 24/0; 0; 15/9/0 | 24/24; 24/0; 0; 14/10/0 | 2792762 | 2896332 | yes | -3.71% | 14 | -5.08% |
| gpt-6-luna | heldout | all-entrypoints | 33/33; 33/0; 0; 17/16/0 | 33/33; 33/0; 0; 18/15/0 | 3214000 | 3608382 | yes | -12.27% | 14 | -3.11% |
| gpt-6-luna | heldout | changed-three-entrypoints | 9/9; 9/0; 0; 5/4/0 | 9/9; 9/0; 0; 6/3/0 | 576578 | 563536 | yes | 2.26% | 5 | -15.69% |
| gpt-6-luna | heldout | unchanged-eight-entrypoints | 24/24; 24/0; 0; 12/12/0 | 24/24; 24/0; 0; 12/12/0 | 2637422 | 3044846 | yes | -15.45% | 9 | 0.39% |
| both | both | all-entrypoints | 132/132; 132/0; 0; 105/27/0 | 132/132; 132/0; 0; 102/30/0 | 15443079 | 15643474 | yes | -1.30% | 97 | -1.45% |
| both | both | changed-three-entrypoints | 36/36; 36/0; 0; 31/5/0 | 36/36; 36/0; 0; 30/6/0 | 2414248 | 2453372 | yes | -1.62% | 29 | -3.42% |
| both | both | unchanged-eight-entrypoints | 96/96; 96/0; 0; 74/22/0 | 96/96; 96/0; 0; 72/24/0 | 13028831 | 13190102 | yes | -1.24% | 68 | -1.04% |

## Every entrypoint

| Model | Variant | Entrypoint/group | Baseline counts | Recovery counts | Baseline known total | Recovery known total | Complete measured row | All-attempt reduction | Passing pairs | Conditional reduction |
|---|---|---|---|---|---:|---:|---|---:|---:|---:|
| gpt-6.1-sol | train | layz-test | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 2/1/0 | 1181425 | 992782 | yes | 15.97% | 2 | -5.65% |
| gpt-6.1-sol | train | lazy | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 420886 | 422011 | yes | -0.27% | 3 | -0.27% |
| gpt-6.1-sol | train | lazy-audit | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 439555 | 415199 | yes | 5.54% | 3 | 5.54% |
| gpt-6.1-sol | train | lazy-clean | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 416006 | 458743 | yes | -10.27% | 3 | -10.27% |
| gpt-6.1-sol | train | lazy-debt | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 195635 | 193710 | yes | 0.98% | 3 | 0.98% |
| gpt-6.1-sol | train | lazy-gain | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 227232 | 205788 | yes | 9.44% | 3 | 9.44% |
| gpt-6.1-sol | train | lazy-help | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 96022 | 95226 | yes | 0.83% | 3 | 0.83% |
| gpt-6.1-sol | train | lazy-review | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 233165 | 243899 | yes | -4.60% | 3 | -4.60% |
| gpt-6.1-sol | train | lazy-verify | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 368658 | 370454 | yes | -0.49% | 3 | -0.49% |
| gpt-6.1-sol | train | slop-check | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 365543 | 357729 | yes | 2.14% | 3 | 2.14% |
| gpt-6.1-sol | train | test-quality-review | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 329069 | 345267 | yes | -4.92% | 3 | -4.92% |
| gpt-6.1-sol | heldout | layz-test | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 2/1/0 | 1561505 | 1309219 | yes | 16.16% | 2 | 8.93% |
| gpt-6.1-sol | heldout | lazy | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 358401 | 387195 | yes | -8.03% | 3 | -8.03% |
| gpt-6.1-sol | heldout | lazy-audit | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 450429 | 423749 | yes | 5.92% | 3 | 5.92% |
| gpt-6.1-sol | heldout | lazy-clean | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 430944 | 398381 | yes | 7.56% | 3 | 7.56% |
| gpt-6.1-sol | heldout | lazy-debt | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 191029 | 191977 | yes | -0.50% | 3 | -0.50% |
| gpt-6.1-sol | heldout | lazy-gain | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 243069 | 228900 | yes | 5.83% | 3 | 5.83% |
| gpt-6.1-sol | heldout | lazy-help | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 96105 | 95008 | yes | 1.14% | 3 | 1.14% |
| gpt-6.1-sol | heldout | lazy-review | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 221938 | 247986 | yes | -11.74% | 3 | -11.74% |
| gpt-6.1-sol | heldout | lazy-verify | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 362629 | 400072 | yes | -10.33% | 3 | -10.33% |
| gpt-6.1-sol | heldout | slop-check | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 377451 | 402241 | yes | -6.57% | 3 | -6.57% |
| gpt-6.1-sol | heldout | test-quality-review | 3/3; 3/0; 0; 2/1/0 | 3/3; 3/0; 0; 3/0/0 | 353736 | 399279 | yes | -12.87% | 2 | -15.32% |
| gpt-6-luna | train | layz-test | 3/3; 3/0; 0; 0/3/0 | 3/3; 3/0; 0; 0/3/0 | 468373 | 483987 | yes | -3.33% | 0 | — |
| gpt-6-luna | train | lazy | 3/3; 3/0; 0; 1/2/0 | 3/3; 3/0; 0; 0/3/0 | 482766 | 621313 | yes | -28.70% | 0 | — |
| gpt-6-luna | train | lazy-audit | 3/3; 3/0; 0; 2/1/0 | 3/3; 3/0; 0; 2/1/0 | 262590 | 301853 | yes | -14.95% | 2 | -36.48% |
| gpt-6-luna | train | lazy-clean | 3/3; 3/0; 0; 0/3/0 | 3/3; 3/0; 0; 0/3/0 | 581508 | 491924 | yes | 15.41% | 0 | — |
| gpt-6-luna | train | lazy-debt | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 136160 | 151757 | yes | -11.45% | 3 | -11.45% |
| gpt-6-luna | train | lazy-gain | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 183850 | 149907 | yes | 18.46% | 3 | 18.46% |
| gpt-6-luna | train | lazy-help | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 91822 | 90956 | yes | 0.94% | 3 | 0.94% |
| gpt-6-luna | train | lazy-review | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 170571 | 215187 | yes | -26.16% | 3 | -26.16% |
| gpt-6-luna | train | lazy-verify | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 342080 | 330275 | yes | 3.45% | 3 | 3.45% |
| gpt-6-luna | train | slop-check | 3/3; 3/0; 0; 2/1/0 | 3/3; 3/0; 0; 0/3/0 | 287903 | 311232 | yes | -8.10% | 0 | — |
| gpt-6-luna | train | test-quality-review | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 301024 | 301886 | yes | -0.29% | 3 | -0.29% |
| gpt-6-luna | heldout | layz-test | 3/3; 3/0; 0; 0/3/0 | 3/3; 3/0; 0; 0/3/0 | 621075 | 720461 | yes | -16.00% | 0 | — |
| gpt-6-luna | heldout | lazy | 3/3; 3/0; 0; 0/3/0 | 3/3; 3/0; 0; 0/3/0 | 384963 | 503410 | yes | -30.77% | 0 | — |
| gpt-6-luna | heldout | lazy-audit | 3/3; 3/0; 0; 2/1/0 | 3/3; 3/0; 0; 1/2/0 | 307828 | 378538 | yes | -22.97% | 0 | — |
| gpt-6-luna | heldout | lazy-clean | 3/3; 3/0; 0; 0/3/0 | 3/3; 3/0; 0; 0/3/0 | 448161 | 471264 | yes | -5.16% | 0 | — |
| gpt-6-luna | heldout | lazy-debt | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 135670 | 167131 | yes | -23.19% | 3 | -23.19% |
| gpt-6-luna | heldout | lazy-gain | 3/3; 3/0; 0; 1/2/0 | 3/3; 3/0; 0; 3/0/0 | 148445 | 267040 | yes | -79.89% | 1 | -38.42% |
| gpt-6-luna | heldout | lazy-help | 3/3; 3/0; 0; 2/1/0 | 3/3; 3/0; 0; 3/0/0 | 91318 | 90983 | yes | 0.37% | 2 | 0.91% |
| gpt-6-luna | heldout | lazy-review | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 2/1/0 | 168471 | 187335 | yes | -11.20% | 2 | -19.74% |
| gpt-6-luna | heldout | lazy-verify | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 268411 | 268327 | yes | 0.03% | 3 | 0.03% |
| gpt-6-luna | heldout | slop-check | 3/3; 3/0; 0; 0/3/0 | 3/3; 3/0; 0; 0/3/0 | 349590 | 305422 | yes | 12.63% | 0 | — |
| gpt-6-luna | heldout | test-quality-review | 3/3; 3/0; 0; 3/0/0 | 3/3; 3/0; 0; 3/0/0 | 290068 | 248471 | yes | 14.34% | 3 | 14.34% |
