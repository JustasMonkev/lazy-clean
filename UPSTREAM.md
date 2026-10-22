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

## Ponytail first-fit guidance adaptation (2026-10-22)

Reviewed [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) at
[`09c434ab73ca43761c5d8b0c5d341926c2fba710`](https://github.com/DietrichGebert/ponytail/commit/09c434ab73ca43761c5d8b0c5d341926c2fba710),
specifically the smallest-complete-change guidance in `skills/ponytail/SKILL.md`
and `AGENTS.md`. The local comparison point is `56b9e60`; it is not a pristine
upstream base. No verified upstream merge base or complete snapshot
reconciliation is established by this partial adaptation.

Adopted in `skills/lazy/SKILL.md`, the fallback in `hooks/lazy-instructions.js`,
`AGENTS.md`, Cursor/Copilot rules, and the OpenCode lazy command:

- Choose the first option satisfying the full contract and project conventions:
  project helpers, then stdlib/native features, installed dependencies, custom code.
- For underspecified new builds only, identify the core job and smallest complete
  workflow without omitting explicit requirements or existing behavior.
- Search the workspace for the closest existing implementation before adding a
  helper/component, and reuse or extend it when suitable. This makes upstream's
  reuse instruction operational without introducing a scanner or index.
- Keep platform representations unless conversion/wrapping is required for the
  contract, validation, ownership, or a meaningful domain boundary.

The `skills/lazy-clean/SKILL.md` pointer now uses the same first-fit ordering.
Normal injection still reads the skill; no runtime routing changed. Local
no-comment rules, useful-helper exceptions, trust-boundary/cleanup protections,
full risk-based test coverage, and bounded completion/review remain. Redundant
wording was tightened to retain the existing below-700-word core/fallback limit.
Upstream one-line/net-negative preferences, shortcut comments, and its smaller
test floor were not adopted. No automatic architecture map or dashboard was
added. No dependency, runtime requirement (Node >=18), scanner, or configuration
changed; this is guidance delivery, not evidence of model-performance gains.

Verified on Node.js v26.5.0:

- `npm test` passed; the guidance delivery suite passed 1,322 checks, including
  all modes and missing/unreadable-skill fallback. The same added assertions
  against local base `56b9e60` failed all 130 new delivery checks while the
  original 1,192 still passed. This checks delivery, not agent behavior.
- Core injection is 697–699 words and fallback is 697–698 words, without budget
  exceptions or weakened existing assertions.
- `node skills/slop-check/scripts/check.mjs --since=56b9e60` passed with zero
  findings across both changed JS files; TS/JS guidance and `git diff --check`
  were applied. Independent scoped test-quality review found no actionable issue.
- Node 18 was not executed locally; the existing `>=18` requirement is unchanged
  and no new runtime API was introduced.

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

## Local optional verification integration

The experimental `lazy-verify` bridge, skill, command, protocol fixtures and
documentation are local work based on `docs/specs/lazy-verify-integration.md`.
They are not an upstream port or synchronization and do not change the reviewed
upstream revisions above. Real-engine qualification, preservation and reviewed
historical-fix pilots, and independent replay remain outstanding; protocol
fixtures do not qualify a release.

## Attribution

Ponytail: Copyright (c) 2026 DietrichGebert.
Anti-slop: Copyright (c) 2026 Dillon Mulroy.
Both sources use the MIT license; its permission and warranty terms are in
[LICENSE](LICENSE). Preserve their notices when reusing substantial portions.
