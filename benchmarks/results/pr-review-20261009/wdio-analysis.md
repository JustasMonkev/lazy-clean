# WebdriverIO rule analysis — 2026-10-09

Baseline inspected: lazy-clean `8f38b32bae676c300d03191c2668e4f0c1271544`. Read AGENTS.md, lazy, lazy-clean, slop-check, and lazy TS/JS, risk, and design references. No implementation edits. GitHub connector available; no WDIO checkout/test installation was made. Runtime for local checker: Node v24.19.0. WDIO manifests verified for sampled historical heads: TypeScript ^4.6.2 (#8456), ^5.4.5 (#12430), ^5.5.4 (#14319); installed/pinned lockfile resolution not verified, so no newer syntax recommendation.

## Smallest changes worth considering

1. **Qualify the no-module-mocking finding; keep detection and review severity.** Current emitted message says every module mock patches the loader “instead of the design” and orders dependency injection. Reviewer-authored merged code in #8456 deliberately isolates another package while testing the actual CLI utility; forcing production injection would add scope/abstraction. Proposed message: “Review this module mock. Prefer an existing dependency seam when it improves production coverage; keep deliberate package-boundary isolation or loader-contract tests when they exercise the real code under test.” Extend `--explain` exceptions with deliberate isolation of independently tested dependencies, preserving the existing unmock and legacy-seam caveats. Strong evidence for qualification, not removal or auto-exemption.

   Scope: `skills/slop-check/scripts/check.mjs` LINE_RULES no-module-mocking message and RULE_EXPLANATIONS exceptions; `skills/slop-check/SKILL.md` test-slop bullet; matching checker message tests if any. Do not change regex or severity. The scanner cannot establish test ownership or useful seams from `jest.mock` spelling. Both justified and unnecessary module mocks should still produce review findings; only direction of advice changes.

2. **Preserve accurate durable rationale in existing comments.** #14319's maintainer explicitly requested a named workaround helper with an upstream issue link. The final helper and comment remain. Current instructions allow required license/tool metadata, while placing useful constraints solely in a final response; make explicit that an existing comment recording a non-obvious invariant, workaround/upstream issue, supported contract, or requested repository documentation can be essential. Keep the prohibition on filler, narration, and checker suppression comments. Evidence supports a narrow preservation exception; adding comments should remain governed by user/repository requirements. No mechanical matcher change is supported: exact final workaround and custom-merge comments already produce no comment finding.

   Scope: comment paragraphs in AGENTS.md / lazy / lazy-clean / slop-check and corresponding explanatory guidance only if they presently imply all durable rationale must move out of code. Strong #14319 evidence, qualified corroboration #12430: its final comment is inaccurate about capabilities, so this is no license to retain stale text.

No new broad anti-helper, no-eval, anti-guard, call-assertion, or dedup regex rule is justified. Existing reuse, public-contract, helper-value, trust-boundary, and red-green/mutation checks already contain most lessons.

## Independently verified evidence chains

### #8156 → #8456: package isolation and meaningful call checks

Original [#8156](https://github.com/webdriverio/webdriverio/pull/8156) is closed unmerged; [#8456](https://github.com/webdriverio/webdriverio/pull/8456) explicitly supersedes it and is merged. Do not label the original an approach rejection.

- [Maintainer rationale](https://github.com/webdriverio/webdriverio/pull/8156#issuecomment-1160839539): prototype spying did not work against pre-existing jest.fn class mocks, so maintainer wrote a local `jest.mock('@wdio/config')` class with addConfigFile, autoCompile, and getCapabilities methods; tested utility owns capability selection/errors, config package owns compilation; checking that autoCompile ran checks orchestration.
- [Earlier reviewer request](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r873974149) and [author question](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r873979945) expose actual test ownership and failure-seam problem rather than hypothetical purity.
- Exact [final tests, head 8acaf19](https://github.com/webdriverio/webdriverio/blob/8acaf19cc13c1804cf2b267c58ebc16fa30debec/packages/wdio-cli/tests/utils.test.ts): lines 50–60 local module mock; 442–460 production getCapabilities call, snapshot, and autoCompile call assertion. [Maintainer-authored final commit](https://github.com/webdriverio/webdriverio/commit/8acaf19cc13c1804cf2b267c58ebc16fa30debec) adds that call check. Merge c08dfbe2e684b1b370a260812f9f9ba51ffa6ca3.
- Baseline checker reports line 54 as no-module-mocking, review severity. This is an intentional heuristic match with overly categorical advice, not a parser false positive. Current --explain already permits legacy mocks; qualify it rather than remove detection.
- Reuse evidence in same PR: [shared capability list](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r870204389), [export through package entrypoint](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r870825130), [avoid all lodash for a basic check](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r870822874). Existing ladder covers this. W3C/vendor-prefixed capability selection was an [explicit migration policy](https://github.com/webdriverio/webdriverio/pull/8156#issuecomment-1125455136), not authority for arbitrary parser narrowing.

### #14319: domain identity beats JSON roundtrips; workaround helper earns its place

[#14319](https://github.com/webdriverio/webdriverio/pull/14319) merged, head 696438b35684878b49c82d7b7d250a13ac6b0cee, merge c23bbc6310aed77796ec9d0246fddc39b17a7772.

- [Maintainer request](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2752714991): raise Firefox issue, put patch into function linked to issue, use set, check all affected paths.
- [Original immutable code](https://github.com/webdriverio/webdriverio/blob/2c5627adaef12d006820b3329b1dfdce5bec2b79/packages/webdriverio/src/utils/index.ts#L435-L440): `Array.from(new Set(nodes.map(node => JSON.stringify(node)))).map(res => JSON.parse(res))`. Verified original_commit_id and exact diff hunk by GET pulls/comments/2015097799.
- [Reviewer](https://github.com/webdriverio/webdriverio/pull/14319#discussion_r2015097799) asks to filter by element ID, preserving object values instead of serializing/parsing. [Reviewer follow-up](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2755920332) likes abstraction and offers to file Firefox issue. [Author response](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2755508101) asks for feedback on revision.
- [Final code](https://github.com/webdriverio/webdriverio/blob/696438b35684878b49c82d7b7d250a13ac6b0cee/packages/webdriverio/src/utils/index.ts#L435-L441): local `returnUniqueNodes` holds Set IDs and filters original nodes, preceded by geckodriver issue 2223 comment; both deep-element call paths use it (336 and 407).
- Exact final helper comment is not flagged. Original distributed JSON roundtrip is also not flagged by no-json-clone: matcher catches nested parse(stringify), not two maps. Manual identity/contract review covers it; broad mechanical detection would not prove intended equality and is not justified by this sample.

### #12430: existing merger extension, test can pass without fix, stale comment caveat

[#12430](https://github.com/webdriverio/webdriverio/pull/12430) merged; head 8e308265643c5db44b06e7284f12a97065820576, merge af6b6b6f6b4022bfb8654ca51c2e5ca3770240d1.

- [Reviewer](https://github.com/webdriverio/webdriverio/pull/12430#discussion_r1514788559) asks for customMerge rather than manual extra array logic. [Review](https://github.com/webdriverio/webdriverio/pull/12430#pullrequestreview-1929988780) says use the existing custom merger instead of extra mergeReportersAndServices helper; [author](https://github.com/webdriverio/webdriverio/pull/12430#issuecomment-2000741144) applies changes. Installed deepmerge-ts extension retains a necessary boundary; not “single caller means inline.”
- [Reviewer mutation evidence](https://github.com/webdriverio/webdriverio/pull/12430#pullrequestreview-1970840543): removing implementation left test green; explanation identifies missing duplicate-class setup and in-memory config fixtures, then supplies corrected reproduction. This is reviewer-reported execution, not rerun by this analyst. Current meaningful regression/mutation clauses already cover.
- [Requested explanation](https://github.com/webdriverio/webdriverio/pull/12430#discussion_r1528842046) should describe programmatic-launch duplicate entry cause. [Final code](https://github.com/webdriverio/webdriverio/blob/8e308265643c5db44b06e7284f12a97065820576/packages/wdio-config/src/node/ConfigParser.ts#L183-L196) uses deepmergeCustom and returns utils.actions.defaultMerge outside services/reporters. Comment mentions capabilities though final MERGE_DUPLICATION contains only services/reporters; preserve accurate cause, not stale wording.
- Final custom merger comment is not flagged. Casts at 188 and 196 are review findings requiring type contract evidence; merge status does not make them checker bugs.

### #3586: simplification suggestion withdrawn after selector contract check

[#3586](https://github.com/webdriverio/webdriverio/pull/3586) merged; head c898268bdfa474b492d76e4a4214e03deac4f452, merge afcec30f82960229f4d35d012d030738f74a65c3.

- [Reviewer suggestion](https://github.com/webdriverio/webdriverio/pull/3586#discussion_r258542185) says pass execute parameters instead of eval; [author](https://github.com/webdriverio/webdriverio/pull/3586#discussion_r258557108) asks how; [same reviewer withdrawal](https://github.com/webdriverio/webdriverio/pull/3586#discussion_r258561114) observes this is function-selector contract without execute arguments.
- [Final factory](https://github.com/webdriverio/webdriverio/blob/c898268bdfa474b492d76e4a4214e03deac4f452/packages/webdriverio/src/scripts/shadowFnFactory.js) still evals generated selector. Baseline scan has no finding. This establishes invalidity of proposed replacement in this historical context, not that arbitrary eval is safe. Current caller/framework-contract clause is adequate.

### #5992: runtime IPC defense

[#5992](https://github.com/webdriverio/webdriverio/pull/5992) merged, head 560dd81ea91c6bd3c669b849ad6a9fc94e3f89e0, merge 2716ecb114d2bf8d1ee90ffd8683b515a6a50a6a.

- [Reviewer question](https://github.com/webdriverio/webdriverio/pull/5992#discussion_r515011279) and [author explanation](https://github.com/webdriverio/webdriverio/pull/5992#discussion_r515075107): parent process lacks process.send.
- [Final debug command](https://github.com/webdriverio/webdriverio/blob/560dd81ea91c6bd3c669b849ad6a9fc94e3f89e0/packages/webdriverio/src/commands/browser/debug.ts) checks `typeof process.send !== 'function'` in standalone and later async callback. No defensive-check finding. External/process capability guards remain necessary; current risk checklist already protects them.
- Researcher/critic rechecked the optional-chain/?? proposal: accepted in final, not a rejection. Do not derive a “reject optional chaining for readability” rule.

### Independent supplementary sample #15802: behavior-oriented tests

[#15802](https://github.com/webdriverio/webdriverio/pull/15802) merged head da5ed9626ffc6422cec576c4d24d15b14e448187, merge 6e37e532d728e2afc804ea14d5529ea4ef3bc90b. Final diff removes sumByKey mocked constant 'foobar' and asserts 76822 bytes, 61153 transferred, 8 requests; removes unused gatherer and retains browser.emit interaction/negative assertions. Body reports mutation failures for wrong sum/removed emit. No human review discussion found (only bot review); lower evidence strength for learning reviewer norms, useful implementation counterexample to “all interaction checks are tautologies.” Current test rule supports it.

## Checker probes and expected outcomes

Command run against six exact fetched final files:
`node skills/slop-check/scripts/check.mjs --json /tmp/wdio-analysis/wdio-14319-final.ts /tmp/wdio-analysis/wdio-12430-final.ts /tmp/wdio-analysis/wdio-8456-final.test.ts /tmp/wdio-analysis/wdio-3586-final.js /tmp/wdio-analysis/wdio-5992-final.ts /tmp/wdio-analysis/wdio-15221-final.ts`
Exit 1, 174 findings, no scan failure. Whole files contain historical unrelated casts/JSDoc; totals are not a slop verdict on PRs.

| Exact final file | Findings |
|---|---|
| #14319 utils | 81; issue rationale comment clean |
| #12430 ConfigParser | 24; custom-merge rationale comment clean |
| #8456 CLI tests | 60; module mock at line 54 is review finding |
| #3586 shadow factory | 0 |
| #5992 debug | 1 no-any, no guard finding |
| #15221 request | 8; no invented impossible-state rule |

Reduced fixtures in /tmp/wdio-analysis are **not original source**, are not executable WDIO regression tests, and use isolated skeletons to test scanner behavior. module-isolation.test.ts adapts #8456 class mock and production-call assertion; redundant-module.test.ts is analyst-created contrary example; enduring-comment.ts copies only exact #14319 helper; json-roundtrip-dedup.ts copies original helper without surrounding declarations; narration.ts is generic counterexample. Running these five gives exit 1, exactly three findings: no-module-mocking on both mocks and no-narration-comments on narration. Enduring comment and distributed JSON conversion remain unflagged.

Expected after proposed message/docs qualification: identical three finding IDs, locations, and review severities; same exit 1. Justified mock advice now permits retaining isolated dependency; unnecessary mock still invites existing production seam review. Enduring comment remains zero, generic narration remains review. Any matcher weakening is outside justified scope.

Baseline `--explain=no-module-mocking` exits 0 and confirms review category and existing legacy/unmock exceptions. No checker modifications or new package tests run by this analyst.

## Coverage/search limits

Independent queries on webdriverio/webdriverio, top 15 sorted updated: `"reuse" in:comments -label:dependencies`, `"unnecessary" in:comments -label:dependencies`, `"simplify" in:comments -label:dependencies`, `"test" "mock" in:comments -label:dependencies`. First unfiltered exploratory searches returned dependency noise; filtered reruns used for candidate selection. Researcher separately supplies historical sample. The search is targeted and not repository-history exhaustive.

Independently fetched PR metadata/discussions for 14319, 12430, 3586, 5992, 15221, 8156, 8456, plus 14581, 15802, 15939. #15939 is closed unmerged with no human comments: excluded as source for reviewer norms. #14581 author conjectured chaining emission to command result would fix ordering ([discussion](https://github.com/webdriverio/webdriverio/pull/14581#discussion_r2160044887)), but [final monad](https://github.com/webdriverio/webdriverio/blob/d33426fb3fa1f355b0d5740a41bf6e2aa8d42d8b/packages/wdio-utils/src/monad.ts#L225-L258) still returns original result with side .then().catch() chain. Do not claim promised ordering rewrite landed; public legacy emit was retained after explicit maintainer request ([request](https://github.com/webdriverio/webdriverio/pull/14581#discussion_r2165842339), [author commit reply](https://github.com/webdriverio/webdriverio/pull/14581#discussion_r2166436393)). Existing public-contract guidance covers this.

No nodejs/node data was read; reserved holdout respected. Source reports author/reviewer execution separately from local scanner runs. No merge approval was treated as universal correctness evidence.
