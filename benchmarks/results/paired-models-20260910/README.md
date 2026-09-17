# Audit bundle

The human-readable result is [the matched-model report](../../paired-models.md).

- `protocol.json`: all 36 preregistered run IDs, snapshots, inputs, settings and hashes.
- `lazy-paired-eval-design.md`: frozen task contracts, failure gates and scoring rubric.
- `lazy-paired-hidden-*.cjs`: unchanged hidden behavioral checks.
- `submissions.json`: every frozen production source, patch, saved test, original handoff, launch metadata, raw-log hash and trusted grading log. `trustedGrade` version 4 is authoritative; `provisionalChecks` is explicitly superseded.
- `reproduction.json`: baseline sources, toolchain versions, supplied resources, reference mutants and coordinator scripts stored as text. Scripts retain this machine's paths; reproducing elsewhere requires rebasing paths and supplying the recorded toolchain/dependencies. This is an audit snapshot, not an installed runtime feature.
- `grading-amendment.md` and `harness-audit.md`: coordinator corrections applied uniformly, without changing worker submissions.
- `execution-audit.json`: baseline/working-tree/hash checks and observed tool-input access audit. This is not a filesystem-access trace.
- `skill-use.json`: observed checker/reference use, not a claim of complete instruction adherence.
- `judgments-url.json` and `judgments-cli.json`: initial blind Astra judgments of all artifacts in each task.
- `judgments-calibration.json`: separate blind Astra consistency audit; initial judgments remain preserved.
- `final-blind-scores.json`: adjudicated scores and gate decisions fixed before model/condition comparison.
- `scores.json`, `summary.json`, and `blind-map.json`: unblinded results and matched pairs, including gate failures.
- `study.json` and `manifest.json`: final provenance and bundle hashes.

Raw CLI event streams remain at the recorded temporary paths; their hashes and byte sizes are retained. Frozen source, tests, check logs and handoffs are included here, so reviewing results does not require those temporary streams. No experiment output was committed or pushed. The original Appium checkout was not modified.
