# Node held-out critical review — 2026-10-09

## Verdict

**QUALIFY overall.** The frozen package's behavior-first/manual guidance can preserve the three inspected Node changes. The checker did not demand deletion of the landed deliberate catches or safe Promise wrapper. **FAIL for the exact `no-empty-catch --explain` instruction's comment policy:** it says “do not add a comment,” whereas Node #45204 deliberately adds a meaningful catch rationale to replace an eslint suppression. That conflicts with the frozen package's general instruction to keep or add accurate non-obvious constraints and match existing style. No rule was changed or tuned.

This is purposeful counterexample sampling, not a randomized evaluation, pass-rate estimate, or proof of general safety. I did not read WDIO/Playwright/Linux derivation reports or root diagnoses. Researcher/analyst messages arrived after independent selection; their other cases are not scored here.

## Freeze and method

Read AGENTS.md, lazy-clean, lazy, slop-check, TS/JS simplification, design and risk references. Independently recomputed every SHA-256 listed in `rule-freeze.json`: all 18 matched. Frozen checker SHA-256: `9478ebb26857195b9d923bf494f4ffde8eb5618e0dd78b36957ec9ba0f7e074f`. No implementation edits.

Primary tools: GitHub connector search_prs, fetch_pr, fetch_pr_comments, list_pull_request_review_threads, fetch_file, fetch_commit, and approved raw REST fetch. No rendered-browser screens were used or needed; code/ref/comment evidence came from primary GitHub APIs. Review-thread resolution is not treated as approval; PR approval is not treated as acceptance of every suggestion.

Searches, sorted by comments and topn 15:

- `repo:nodejs/node is:pr is:merged simplify in:title`
- `repo:nodejs/node is:pr is:merged "empty catch"`
- `repo:nodejs/node is:pr is:merged "primordials" "simplify"`

Earlier broad screening used simplify+catch, simplify+comment, single+helper (topn 8). These returned large feature/release discussions; I refined the queries to make exact review/code inspection manageable. Search results are recorded in node-critic-evidence.json. I selected #45204 and #46536 from empty-catch results; #38650 was followed as a directly relevant primordial safety commit referenced in a release result.

Excluded from the scored triad: #57110 has useful performance-claim correction but little substantive code-review reasoning; #27854 is a semantic-major child-process normalization refactor, useful for caution about monkey-patching but weaker for this triad's comment/catch/wrapper focus. Large release proposals, docs-only changes, broad new-feature implementations and C++ simplifications were not expanded into the scored sample. No selected case was discarded because its outcome disagreed with the package.

## 1. #45204 — preserve the first failure, run afterEach once

PR: https://github.com/nodejs/node/pull/45204

Base inspected: `e14321bb50be506231e395df36f555269668746e`.
Review-comment original ref: `63689f409bca78e7087318d9fca2ebc28c6faf4b`.
Final head inspected: `5880f19d59b85c74945929c04954e6b6c770210a`.
Landed: `3759935ee29d8042d917d3ceaa768521c14413ff`.
The final head and landed `lib/internal/test_runner/test.js` contents are identical, blob `6d30f3aaa6686acaba45427a3614bdca767512c1`.

Before the PR, afterEach runs only after the test body completes successfully. The exact raw comment hunk shows this intermediate catch:

```js
// eslint-disable-next-line no-empty
try { await afterEach(); } catch {}
```

Final code instead contains, in both Test and Suite failure handling:

```js
try { await afterEach(); } catch { /* test is already failing, let's the error */ }
```

The author/coauthor also wraps afterEach with existing `once`, and changes `once` to return `ReflectApply(callback, this, args)`, so callers can await the hook result. Success-path afterEach remains outside the swallow and before `this.pass()`. On an existing failure, cleanup-hook failure must not replace the original failure; afterEach must not run twice.

Reviewer reasoning and response:

- MoLow identifies that moving hooks into finally obscures a hook failure after an otherwise successful test: https://github.com/nodejs/node/pull/45204#issuecomment-1304600271
- cjihrig asks specifically for simultaneous test-body and afterEach throws: https://github.com/nodejs/node/pull/45204#discussion_r1014728140 ; MoLow reports adding a test and fix at #discussion_r1014730242.
- aduh95 recommends simpler direct awaiting/try-catch and says PromiseResolve is unnecessary: https://github.com/nodejs/node/pull/45204#discussion_r1014732178 . MoLow replies fixed at #discussion_r1014777475.
- aduh95 explicitly proposes the rationale comment instead of the eslint-disable: https://github.com/nodejs/node/pull/45204#discussion_r1014823447 . The raw original hunk and final immutable contents prove that exact edit was made; this is not inferred from thread resolution.
- MoLow explicitly APPROVED: https://github.com/nodejs/node/pull/45204#pullrequestreview-1169822880 . benjamingr also approved earlier (#pullrequestreview-1169503033). Landed outcome: #issuecomment-1305123060.

The checked message fixture retains the original `error: 'test'` for simultaneous failures and reports hook failure when the body succeeds. The coauthor explains why .out files are necessary for tools/test.py at #issuecomment-1304752804. I inspected fixtures; I did not run the upstream tests.

Local convention was verified at the final head: .eslintrc.js extends eslint:recommended; vendored ESLint is 8.25.0; its no-empty implementation rejects empty blocks without comments unless allowEmptyCatch is enabled, which the default options do not enable. The rule source explicitly permits a block containing a comment. The repo's reviewer confirms that local constraint.

**Package decision:** keep deliberate catch, first-error precedence, once helper, returned promise, fixtures and accurate rationale comment. Removing the catch lets the hook exception escape before fail/postRun and can obscure the original failure/cleanup. Unconditionally moving the catch into afterEach would hide hook failure on a previously passing test. Inlining away once can execute hooks twice.

**Score:** PASS for full-package behavioral/manual guidance; FAIL for exact `--explain=no-empty-catch` comment advice. Frozen output says deliberate swallow should be justified in the final response and “do not add a comment.” That forbids the precise reviewer-approved local edit. Its suggested instead example removes catch, so a user following the example without the exception/invariant could cause the harmful rewrite above. The normal finding message itself allows verifying and keeping a swallow; the landed rationale comment suppresses the heuristic, so the final snapshot received no no-empty-catch finding.

Availability limit: fetching the full intermediate ref `63689...` from nodejs/node returned GitHub 404 “No commit found.” The raw immutable review-comment hunk preserves the before code and original_commit_id, while full base and final/landed files were available. I do not claim full intermediate-file verification.

## 2. #38650 — a necessary safe Promise boundary and a valid caller-specific simplification

PR: https://github.com/nodejs/node/pull/38650

Base inspected: `0996eb71edbd47d9f9ec6153331255993fd6f0d1`.
Original reviewer ref inspected: `06e59ffe84368def52ad17f40dee138cdfdce26f`, primordials blob `25821c3304b388197e240b37fac7ab1789d552d1`.
Final landed ref inspected: `2eeb4e1d944b4ebebcf80261d9250bc86eadc89a`, primordials blob `42250ffb422d6e0e85cf5589792fee80eefd0be2`.

The PR's connector merge_commit_sha is a different integration ref (`bf8aede...`); I used the full commit corresponding to the explicit landing comment, fetched its commit and files, rather than assuming the normalized metadata was the landed code.

Before the change, primordial catch/finally methods still look up the instance's then property, allowing altered userland prototypes to affect internals. The reviewed addition wraps work using SafePromise:

```js
new Promise((a, b) =>
  new SafePromise((a, b) => PromisePrototypeThen(thisPromise, a, b))
    .finally(onFinally)
    .then(a, b)
);
```

That wrapper is still present in final code, renamed `SafePromisePrototypeFinally`, with a comment explaining that the outer promise prevents exposing SafePromise's prototype to userland. Its JavaScript JSDoc types remain. In run_main, the author changes the caller to async try/finally:

```js
process.on('exit', handler);
try {
  return await promise;
} finally {
  process.off('exit', handler);
}
```

This retains both exit-code policy and listener cleanup. The safe wrapper remains for fs/promises and timers/promises callers.

Reviewer reasoning and response:

- mcollina objects to allocations in hot paths: https://github.com/nodejs/node/pull/38650#discussion_r634207258 and #discussion_r634217931.
- targos recommends replacing catch with then(undefined, fn), and finally with async functions where possible: #discussion_r634220943.
- aduh95 reports removing uses where possible, renaming the helper to expose its cost, and planning hot-path lint guidance: https://github.com/nodejs/node/pull/38650#discussion_r634362080.
- mcollina explicitly APPROVED with lgtm after that response: https://github.com/nodejs/node/pull/38650#pullrequestreview-662148717 . jasnell approved earlier (#pullrequestreview-657951617).
- jasnell explicitly landed `2eeb4e1d944b`: #issuecomment-844262360. The source commit has Reviewed-By entries matching both reviewers.
- The performance thread is still marked unresolved in normalized GitHub data; explicit subsequent approval and actual code matter more than this UI flag.

Tests in the inspected final file replace catch/finally/then with mustNotCall and check the returned promise's prototype is ordinary Promise.prototype. That is intentional test isolation and security-boundary evidence, not tautology. I did not execute it.

**Package decision:** preserve the SafePromise boundary/comment/functional constructor directive/JS JSDoc and pollution test. Reuse async try/finally only where compatible with that caller; retain return-await so finally removes the listener after settlement. Do not turn every wrapper into native .finally or Promise.resolve. Security contract and prototype identity outweigh line count.

**Score:** PASS with scope qualification. The frozen mechanical scanner does not flag this multi-stage wrapper as a trivial constructor wrapper, and typed-jsdoc is explicitly TypeScript-only. Its no-backcompat-comments finding in run_main is on the pre-existing compatibility rationale, outside the PR-owned hunk; it is not a deletion instruction and must be retained/out of scope. Generic prefer-platform advice alone would be unsafe here, but the full package explicitly demands checked contracts/security/local convention.

## 3. #46536 — optional kernel capability check, no preflight TOCTOU

PR: https://github.com/nodejs/node/pull/46536

Base inspected: `f46515c2f31902d2ca275d5eae0d5790d0cc212e`.
Original reviewer ref inspected: `526eed0ed3250297bf8db4217a8d47f371a409d8`, blob `a67b1658bbaffd3733fdd1b03f176616c2a22279`.
Final head: `1f161a1d5ce03e6ff1cc0631a36edda12cfddb8b`.
Landed: `024e648d905dcc120741530042810352508d2583`.
Head and landed test file match, blob `c971b7656f1221829659d3e0fa812dc26b72afef`.

Base reads /proc/sys/net/ipv4/ip_unprivileged_port_start unconditionally on Linux. The original author revision adds statSync(..., { throwIfNoEntry: false }) as a preflight. Final code instead attempts readFileSync in try, skips when the reported threshold makes port 42 unprivileged, and catches failures with the reason that older kernels lack the feature and keep 1024 as the threshold.

Reviewer reasoning and response:

- bnoordhuis rejects stat-then-read because tests are copied as best practices; attempt the read and handle missing-file failure: https://github.com/nodejs/node/pull/46536#discussion_r1098524529.
- KrayzeeKev agrees and reports a try block with comment: #discussion_r1099436873.
- lpinca catches an accidental intermediate reversion; author acknowledges and fixes: #discussion_r1100599543 / #discussion_r1100623963 / #discussion_r1100656385.
- lpinca proposes narrowing try to readFileSync, explicitly optional: #discussion_r1100667830.
- Author explains preferring to skip the entire capability check on missing feature rather than obscure NaN comparison: #discussion_r1100754729.
- lpinca explains the reason for narrower try (avoid hiding unexpected exceptions) and explicitly says it is okay as-is: https://github.com/nodejs/node/pull/46536#discussion_r1101052519 . This is explicit tolerance of the retained broader try, not silence.
- lpinca APPROVED at #pullrequestreview-1289982374. Landed at #issuecomment-1451497831.

**Package decision:** retain intentional optional-feature failure handling and local rationale; do not delete catch and restore failures on older kernels. Prefer actual operation/error handling over preflight checks. The comment's missing-feature explanation does not prove that every possible read error means the feature is absent. The catch also includes parse/skip operations; the reviewer specifically identifies that residual risk and tolerates it for this test. Mark this as a checked project exception, not an all-errors-safe general recipe.

**Score:** QUALIFY. No frozen finding occurs on the landed file because comments justify the catch. Higher-level rules allow the deliberately tolerated pattern and relevant rationale, but --explain's absolute prohibition on new catch comments conflicts here too. A cleaner narrower try was proposed and not adopted; do not label it author-approved implementation or claim all unexpected errors are handled.

## Actual verification and limits

Ran the frozen checker on fetched final JS snapshots using installed scratch Node v24.19.0. It exited 1 with two review findings:

1. #38650 run_main.js line 69: no-backcompat-comments — pre-existing compatibility rationale, retain/out of task scope.
2. #45204 util.js line 138: no-obvious-doc-comments — pre-existing doc outside changed once return, out of task scope.

No final catch, safe wrapper, test pollution setup or JS JSDoc finding was emitted. This scan is deliberately whole-file snapshot evidence, not a claim that --since against a complete Node checkout ran. Snapshot sources were supplied by immutable refs; no Node checkout/build was created. The failed finding-bearing scan is not reported clean.

Ran --explain=no-empty-catch, exit 0, reproduced its conflicting “do not add a comment” exception. Read frozen checker matchers to confirm commented catches are exempt and typed JSDoc checking is TS-only. No checker matcher was changed.

Read upstream src/node_version.h: #38650 landed source is 17.0.0-pre; #45204 and #46536 heads are 20.0.0-pre. Scratch Node 24.19.0 is only the checker runtime. No current-runtime replacement advice is based on it. TypeScript is not touched by these cases.

No upstream tests, upstream lint, benchmarks, mutation tests or full platform checks ran. Inspected upstream test fixtures, reviewer statements and vendored configuration establish design/outcome evidence only. Full original intermediate #45204 file was unavailable (404) as recorded above; other required immutable contexts, config, ESLint version/rule source, final files and primary comments were available.

The most material residual risk is not a new detection failure: conflicting exception text can push an operator to keep a silent catch, add a suppression, or remove error precedence to satisfy tooling, even though the full package and Node's reviewer support a useful local rationale comment. Report that as held-out evidence; resolve wording only in a later, separate revision.
