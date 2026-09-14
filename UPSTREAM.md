# Upstream provenance

This is a customized fork, not a synchronized upstream distribution. The initial
import did not record pristine upstream snapshots. No verified upstream merge
base is established for either component below; reviewed commits are comparison
points only and must not be used as invented three-way merge bases.

## Sources reviewed on 2026-09-12

| Source | Immutable revision reviewed | Relationship to lazy-clean |
| --- | --- | --- |
| [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | [`356918eba965ee1eac64bd3a7f0dd02108350de5`](https://github.com/DietrichGebert/ponytail/commit/356918eba965ee1eac64bd3a7f0dd02108350de5) | Renamed skill and hook ancestry; the initial local `lazy-activate.js` and `lazy-subagent.js` retain corresponding Ponytail code. Exact original upstream revision unknown. |
| [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) | [`c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`](https://github.com/dmmulroy/anti-slop/commit/c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b) | Source behavior, regression-case concepts, and update-workflow inspiration for the partial adaptations below. This does not establish ancestry of the pre-existing standalone checker. |

The local comparison point was
[`ec008bca92241cacb29dee3e04d7d2e95340de03`](https://github.com/JustasMonkev/lazy-clean/commit/ec008bca92241cacb29dee3e04d7d2e95340de03).
It is a lazy-clean revision, not an upstream baseline.

## Partial adaptations

Anti-slop's [array-performance and update-workflow change](https://github.com/dmmulroy/anti-slop/commit/95a56e5d24fb3d849673c2d51eb0908b8bd2d33b)
supplies the reference behavior for this port:

- `skills/slop-check/scripts/check.mjs` and its tests adapt accumulator-copy
  detection and array filter/map pipeline review. Accumulating spread is covered
  alongside copying APIs; upstream instead uses Oxlint's native companion rule
  for spread. These are lexical review heuristics, not the upstream AST rules.
- `skills/lazy-clean/references/upstream-updates.md` adapts the staged-source,
  customization-preserving update procedure and distinguishes partial ports
  from full snapshot reconciliation.
- `skills/lazy-gain/SKILL.md` corrects the old scoreboard using Ponytail's
  [revised benchmark report](https://github.com/DietrichGebert/ponytail/blob/356918eba965ee1eac64bd3a7f0dd02108350de5/benchmarks/results/2026-06-18-agentic.md).
  Upstream measurements do not establish lazy-clean performance.

No complete upstream snapshot was imported or reconciled. Full-baseline status
remains **unknown**. Other upstream rules and adapters remain outside this port;
their absence is not evidence that a future update should automatically add them.

## Intentional local differences

- The checker runs on Node.js without dependencies and uses lexical analysis,
  not Oxlint AST, scope, or type APIs. Its detection coverage differs from upstream.
- Array performance findings require review, and edit hooks remain advisory.
  Rewrites must preserve callback order, indexes, mutations, and accumulator aliases.
- Keep local rules, suppressions, severities, tests, adapters, and customized
  guidance. Preserve intentional omissions and deletions during future updates.

For the next comparison or port, follow the
[update workflow](skills/lazy-clean/references/upstream-updates.md) and record
the actual checks and any deferred conflicts with that change.

## Verification of this port

Validated on Node.js v24.19.0 on 2026-09-12:

- `npm test` passed, including CLI and edit-hook checks for multiline findings.
- `npm run slop-check` passed with zero findings across 20 files. Its new
  pipeline finding in the rule-inventory test was removed by filtering names
  in the regular expression, preserving the inventory check.
- Both new rule decisions were deliberately inverted; regression tests failed,
  and the mutations were restored. The final checker tests passed again.
- Independent review reproduced and verified fixes for 11 property, import,
  and shadowing false positives. A 10,000-pipeline regression retains every
  finding without repeated declaration-to-use scans.
- Skill metadata validation and whitespace checks passed. No dependency or
  runtime-version requirement changed; Node 18 execution is left to CI.

## Attribution

Ponytail: Copyright (c) 2026 DietrichGebert.
Anti-slop: Copyright (c) 2026 Dillon Mulroy.
Both sources use the MIT license; its permission and warranty terms are in
[LICENSE](LICENSE). Preserve their notices when reusing substantial portions.
