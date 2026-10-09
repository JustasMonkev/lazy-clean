# Playwright PR review evidence — 2026-10-09

This is a purposeful qualitative sample for improving lazy-clean, not an estimate of repository-wide preferences. It records eight PRs: six merged, two closed without merge. A request, an author claim, an approval, and merged code are separate evidence. No Playwright tests were run in this research task.

## Reproducible selection and verification

Tool discovery used the installed GitHub connector: `github_search_prs`, GET-only `github_fetch`, and immutable-ref `github_fetch_file`. Selection queries, each `topn=12`, `sort=comments`:

- `repo:microsoft/playwright is:merged "reuse" in:comments`
- `repo:microsoft/playwright is:merged "helper" in:comments`
- `repo:microsoft/playwright is:closed is:unmerged "test" in:comments`
- `repo:microsoft/playwright is:merged "unnecessary" in:comments`

A supplementary `topn=15` query was `repo:microsoft/playwright is:merged "reuse" in:comments "fix" in:title`. Its returned results included non-fix titles; the return set was used only as candidate discovery, not proof of exact title matching.

For each included PR: GET `/repos/microsoft/playwright/pulls/{n}`, `/pulls/{n}/comments?per_page=100`, `/pulls/{n}/reviews?per_page=100`, `/issues/{n}/comments?per_page=100`. Reviewed-comment counts and fetched lengths showed no inline-comment pagination truncation (largest 80). Original inline `diff_hunk`, `original_commit_id`, reply relationships, author replies, final head, and merge-ref code were checked. Cache `playwright-evidence.json` retains bounded metadata, comment bodies, selected hunk excerpts, and non-bot conversation/reviews; it intentionally omits entire diffs, unrelated repository metadata, and full head files.

Sorting by comment count favors complex discussion. Coverage was deliberately balanced by outcome, category, and size:

| PR | Category | Outcome | Final size |
| --- | --- | --- | --- |
| [31727](https://github.com/microsoft/playwright/pull/31727) | feature: only-changed | merged | +509/-35, 13 files |
| [32156](https://github.com/microsoft/playwright/pull/32156) | refactor: watch-mode transport | merged | +199/-271, 10 files |
| [31842](https://github.com/microsoft/playwright/pull/31842) | bug fix: newly added watched tests | merged | +202/-56, 9 files |
| [34949](https://github.com/microsoft/playwright/pull/34949) | feature: typed-array serialization | merged | +131/-15, 10 files |
| [13644](https://github.com/microsoft/playwright/pull/13644) | test infrastructure migration | merged | +1225/-1092, 88 files |
| [34238](https://github.com/microsoft/playwright/pull/34238) | small CI/platform fix | merged | +21/-0, 3 files |
| [37761](https://github.com/microsoft/playwright/pull/37761) | annotation-validation fix | closed/unmerged | +191/-2, 5 files |
| [36059](https://github.com/microsoft/playwright/pull/36059) | AI-authored focus-state feature | closed/unmerged | +165/-12, 8 files |

Screened but not included in the eight: #33904 (merged accessible-error matcher, 22 inline comments; useful narrow exports/native validity/comments, overlaps #34949/#31727); #30962 (unmerged sharding, 27 inline comments; persistence compatibility and strategy discussion, overlaps scope/test themes and requires larger independent algorithm analysis); #7345 (merged snapshot negation, 26 comments; reviewer explicitly retracts an assertion-removal objection, useful supplementary counterexample); #29890 (merged missing-element errors, 19 comments; cross-language consumers and test branches, useful supplementary counterexample). #36358/#31529/#9156/#31165/#33081/#41294/#34750/#34995/#34037/#8963/#12242/#38194/#33267/#36049/#21468/#34329/#41324/#42405/#36921/#15154 and the other returned unmerged feature candidates were title/body-screened only, not read as evidence. They were excluded after obtaining the intended category/outcome mix; no conclusion is drawn about their reviews.

## 1. #31727 — reuse exact semantics, add discriminating tests

**Requests and rationale.** [dgozman r1685794347](https://github.com/microsoft/playwright/pull/31727#discussion_r1685794347) rejects converting known affected file paths into regex filters and asks for a matcher like watch mode, named `additionalFileMatcher`. [r1685796563](https://github.com/microsoft/playwright/pull/31727#discussion_r1685796563) points to the existing `toPosixPath` utility instead of a new implementation. [r1688188588](https://github.com/microsoft/playwright/pull/31727#discussion_r1688188588) asks for an unaffected test file: two dependent files alone cannot prove that selection excludes unrelated tests.

**Original review code.** `packages/playwright/src/runner/loadUtils.ts`, original ref `8ef765468203fbc58170afd5ddecb7b39b519407`, exact comment-hunk addition:

```ts
const onlyChangedFilters = onlyChangedFiles ? createFileFiltersFromArguments(onlyChangedFiles) : undefined;
const toPosixPath = (s: string) => s.replaceAll(path.sep, path.posix.sep);
```

The lines are from separate hunks, not adjacent. The [original dependency test](https://github.com/microsoft/playwright/blob/6e2f581a3c7a40573dfc374cc972a4c87cf72ed4/tests/playwright-test/only-changed.spec.ts) ended with:

```ts
expect(result.exitCode).toBe(1);
expect(result.failed).toBe(2);
expect(result.output).toContain('a.spec.ts');
expect(result.output).toContain('b.spec.ts');
```

**Final merge code.** [tasks.ts at f23d02a2116947369ff6206f9c73050dd36fe95c](https://github.com/microsoft/playwright/blob/f23d02a2116947369ff6206f9c73050dd36fe95c/packages/playwright/src/runner/tasks.ts):

```ts
const changedFiles = await detectChangedTests(testRun.config.cliOnlyChanged, testRun.config.configDir);
cliOnlyChangedMatcher = file => changedFiles.has(file);
```

[Final test at head 4355c7f8cf45bffd452a46f705287f913f9b93f0](https://github.com/microsoft/playwright/blob/4355c7f8cf45bffd452a46f705287f913f9b93f0/tests/playwright-test/only-changed.spec.ts) adds an independent `c.spec.ts` and:

```ts
expect(result.exitCode).toBe(1);
expect(result.failed).toBe(2);
expect(result.passed).toBe(0);
expect(result.output).toContain('a.spec.ts');
expect(result.output).toContain('b.spec.ts');
expect(result.output).not.toContain('c.spec.ts');
```

**Acceptance/challenge/outcome.** Author [r1686467270](https://github.com/microsoft/playwright/pull/31727#discussion_r1686467270) links matcher changes, [r1686431527](https://github.com/microsoft/playwright/pull/31727#discussion_r1686431527) accepts utility reuse, [r1688231927](https://github.com/microsoft/playwright/pull/31727#discussion_r1688231927) accepts unaffected-file coverage. [Explicit dgozman approval](https://github.com/microsoft/playwright/pull/31727#pullrequestreview-2194180864); merged.

Do not turn reviewer suggestions into unconditional rules: [r1688179577](https://github.com/microsoft/playwright/pull/31727#discussion_r1688179577) says `cliOnlyChanged` is always true, but author [r1688208654](https://github.com/microsoft/playwright/pull/31727#discussion_r1688208654) corrects it to a string. [r1688226139](https://github.com/microsoft/playwright/pull/31727#discussion_r1688226139) uses existing passed-count assertions rather than inventing ambiguous `result.total` semantics. Final `vcs.ts` retains config-directory/git-root path mapping and diagnostic error output; author [r1688213586](https://github.com/microsoft/playwright/pull/31727#discussion_r1688213586) explains the directories differ.

**Generalization.** Reuse a helper only when its input semantics fit; exact paths should stay exact. Test selection needs both selected and excluded examples. A small extra assertion/file may be the proof, not redundancy.

## 2. #32156 — explicit interfaces and named methods can be the clearer small solution

**Requests.** [r1716946820](https://github.com/microsoft/playwright/pull/32156#discussion_r1716946820) asks for an explicit transport interface (possible existing-transport reuse deferred); [r1716948134](https://github.com/microsoft/playwright/pull/32156#discussion_r1716948134) prefers transport composition to connection inheritance; [r1716951874](https://github.com/microsoft/playwright/pull/32156#discussion_r1716951874) asks for explicit `send` and `close` because constructor properties concealed how the interface is implemented.

**Original code**, ref `3b8e89ad18926211fec345a8e28b0b78913063ba`, respective comment hunks in `testServerConnection.ts` and `watchMode.ts`:

```ts
export type TestServerSocket = Pick<WebSocket, 'addEventListener' | 'send' | 'close'>;
class InMemoryServerSocket extends EventEmitter implements TestServerSocket {
  constructor(public readonly send: (data: any) => void, public readonly close: () => void = () => {}) {
```

**Final merge**, [testServerConnection.ts at 201bad75d3c44334059da387a947bae68fa500e9](https://github.com/microsoft/playwright/blob/201bad75d3c44334059da387a947bae68fa500e9/packages/playwright/src/isomorphic/testServerConnection.ts):

```ts
export interface TestServerTransport {
  onmessage(listener: (message: string) => void): void;
  onopen(listener: () => void): void;
  onerror(listener: () => void): void;
  onclose(listener: () => void): void;

  send(data: string): void;
  close(): void;
}
```

[Final watchMode.ts head e624642a96f43fddef8a3de34f6dd3cce98f0579](https://github.com/microsoft/playwright/blob/e624642a96f43fddef8a3de34f6dd3cce98f0579/packages/playwright/src/runner/watchMode.ts) has named methods:

```ts
close() {
  this.emit('close');
}
send(data: string): void {
  this._send(data);
}
```

These methods are separated in the file. It uses `new TestServerConnection(transport)`, retaining ordinary composition.

**Response/outcome.** Author accepts explicit interface [r1719815912](https://github.com/microsoft/playwright/pull/32156#discussion_r1719815912), composition [r1719815301](https://github.com/microsoft/playwright/pull/32156#discussion_r1719815301), and named methods [r1719814806](https://github.com/microsoft/playwright/pull/32156#discussion_r1719814806). [Explicit final approval](https://github.com/microsoft/playwright/pull/32156#pullrequestreview-2276723130), merged. That approval explicitly defers a project-list test. [r1717047890](https://github.com/microsoft/playwright/pull/32156#discussion_r1717047890) also defers browser-reuse testing; this is a contextual decision, not permission to omit all refactor verification.

[r1716949692](https://github.com/microsoft/playwright/pull/32156#discussion_r1716949692) rejects unrelated async-to-sync churn because it adds blame noise without value. [r1741151406](https://github.com/microsoft/playwright/pull/32156#discussion_r1741151406) requests existing `ManualPromise`; [r1729822614](https://github.com/microsoft/playwright/pull/32156#discussion_r1729822614) flags listing races. The final loop retains a queue and changed-file set. [r1742052444](https://github.com/microsoft/playwright/pull/32156#discussion_r1742052444) reports an uncommitted follow-up after merge: approval does not establish perfection.

**Generalization.** Keep or add explicit domain contracts/methods when they explain responsibilities. Prefer existing lifecycle primitives, preserve event ordering, and avoid unrelated cleanup. Line count cannot decide abstraction quality.

## 3. #31842 — useful ordering comments, necessary fresh model, boundary tests

**Requests/challenge.** [r1694972534](https://github.com/microsoft/playwright/pull/31842#discussion_r1694972534) asks to explain refreshing the test list before running watched tests. [r1694976427](https://github.com/microsoft/playwright/pull/31842#discussion_r1694976427) questions another `TestTree` allocation. Author [r1695096158](https://github.com/microsoft/playwright/pull/31842#discussion_r1695096158) explains `useMemo` updates next render, too late here, and defers a presentation/state separation.

**Original**, `uiModeView.tsx` at `e7ae8bec096978f230db5de9c67a0538b3cef4c5`, exact hunk excerpt:

```ts
const testModel = teleSuiteUpdater.asModel();
const testTree = new TestTree('', testModel.rootSuite, testModel.loadErrors, projectFilters, pathSeparator);
```

The refresh was newly present but the phase comments were absent. **Final merge**, [8412d973c03ecfce9c0dbabe0e3fec6d307cdc2d](https://github.com/microsoft/playwright/blob/8412d973c03ecfce9c0dbabe0e3fec6d307cdc2d/packages/trace-viewer/src/ui/uiModeView.tsx), retains that allocation and phase markers:

```ts
// fetch the new list of tests
commandQueue.current = commandQueue.current.then(async () => {
```

Later, after the awaited queue and an empty-file guard:

```ts
// run affected watched tests
const testModel = teleSuiteUpdater.asModel();
const testTree = new TestTree('', testModel.rootSuite, testModel.loadErrors, projectFilters, pathSeparator);
```

**Tests.** Reviewer [r1694981901](https://github.com/microsoft/playwright/pull/31842#discussion_r1694981901) initially considers a single-event test redundant with chokidar. Author [r1695100617](https://github.com/microsoft/playwright/pull/31842#discussion_r1695100617) explains two watcher instances previously emitted duplicates; it is a regression, not a library retest. Reviewer [r1695123880](https://github.com/microsoft/playwright/pull/31842#discussion_r1695123880) explicitly accepts. Meanwhile [r1695123624](https://github.com/microsoft/playwright/pull/31842#discussion_r1695123624) distinguishes the actual TestServerInterface from TeleEmitter internal change detection, and author [r1695148652](https://github.com/microsoft/playwright/pull/31842#discussion_r1695148652) rewrites that test to stdio.

Original stdio assertion was hard-coded length; [r1695238198](https://github.com/microsoft/playwright/pull/31842#discussion_r1695238198) requests maintainable content membership. [Final test](https://github.com/microsoft/playwright/blob/5240576ac31f6005610dae3c4f16268ebcb9e1fa/tests/playwright-test/test-server-connection.spec.ts):

```ts
await expect.poll(() => testServerConnection.events).toEqual(expect.arrayContaining([
  ['stdio', { type: 'stderr', text: 'this goes to stderr\n' }],
  ['stdio', { type: 'stdout', text: 'this goes to stdout\n' }]
]));
```

By contrast the file-watching test still uses `toHaveLength(1)` and exact event equality because duplicate emission is its regression. Author explains VS Code compatibility [r1695102560](https://github.com/microsoft/playwright/pull/31842#discussion_r1695102560) and links an external consumer [r1695106518](https://github.com/microsoft/playwright/pull/31842#discussion_r1695106518).

**Outcome.** [Explicit approval](https://github.com/microsoft/playwright/pull/31842#pullrequestreview-2204968186), merged. Generalization: comment bans and unconditional removal of count assertions both lose useful information. Check when state becomes fresh, what behavior a test protects, and whether apparently internal APIs have real consumers.

## 4. #34949 — shared native conversion, real platform exceptions, coverage that crosses the wire

**Requests.** [r1973604381](https://github.com/microsoft/playwright/pull/34949#discussion_r1973604381) questions Node-specific code because `btoa/atob` work on both sides. [r1975173762](https://github.com/microsoft/playwright/pull/34949#discussion_r1975173762) flags serializing an entire backing buffer instead of its offset/length. [r2012582813](https://github.com/microsoft/playwright/pull/34949#discussion_r2012582813) rejects landing without coverage and asks to extend protocol serialization for end-to-end tests.

**Original**, [utilityScriptSerializers.ts ref 1837b1bf4b8ab2b35687a1379833f1a98c7b7b7f](https://github.com/microsoft/playwright/blob/1837b1bf4b8ab2b35687a1379833f1a98c7b7b7f/packages/playwright-core/src/server/isomorphic/utilityScriptSerializers.ts):

```ts
function typedArrayToBase64(array: any) {
  if (globalThis.Buffer)
    return Buffer.from(array).toString('base64');

  const binary = Array.from(new Uint8Array(array.buffer)).map(b => String.fromCharCode(b)).join('');
  return btoa(binary);
}
```

**Final merge**, [3340855109a24c4001a2a3deb6943d991e253d43](https://github.com/microsoft/playwright/blob/3340855109a24c4001a2a3deb6943d991e253d43/packages/playwright-core/src/server/isomorphic/utilityScriptSerializers.ts):

```ts
if ('toBase64' in array)
  return array.toBase64();
const binary = Array.from(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).map(b => String.fromCharCode(b)).join('');
return btoa(binary);
```

The surrounding final comment explains Firefox Xray typed-array iteration restrictions. This fallback is retained: simple constructor-name lookup and generic iteration suggestions were challenged by runtime-world behavior [r1977811753](https://github.com/microsoft/playwright/pull/34949#discussion_r1977811753), [r1975237868](https://github.com/microsoft/playwright/pull/34949#discussion_r1975237868), [r2007197358](https://github.com/microsoft/playwright/pull/34949#discussion_r2007197358).

**Acceptance/outcome/caveat.** Native common path accepted [r1974957162](https://github.com/microsoft/playwright/pull/34949#discussion_r1974957162), offset correction accepted [r1975238806](https://github.com/microsoft/playwright/pull/34949#discussion_r1975238806), protocol support/tests added [r2014089632](https://github.com/microsoft/playwright/pull/34949#discussion_r2014089632). [Explicit approval](https://github.com/microsoft/playwright/pull/34949#pullrequestreview-2717976224), merged. The `Object.entries(...)` key assertion remains in merge: [r1973620916](https://github.com/microsoft/playwright/pull/34949#discussion_r1973620916) explains key erasure; it is not automatically unnecessary.

Do not report this as proof that all serialization is correct. Reviewer [r2014325396](https://github.com/microsoft/playwright/pull/34949#discussion_r2014325396) suggests `Buffer.from(array.buffer, array.byteOffset, array.byteLength)`, but [merged protocol serializers.ts](https://github.com/microsoft/playwright/blob/3340855109a24c4001a2a3deb6943d991e253d43/packages/playwright-core/src/protocol/serializers.ts) uses `Buffer.from(value.buffer, value.byteOffset, value.length)`. That differs for multi-byte arrays. This research did not execute the wire path or claim a regression is proven. It shows why author acknowledgment and approval do not replace reading and testing final code.

**Generalization.** Native reuse can remove duplicate paths; preserve proven platform-specific paths, offsets, and length units. Add coverage at the requested feature's real boundary even if that requires more implementation.

## 5. #13644 — custom matcher contract, meaningful names, retained fixtures

**Requests.** [r855748243](https://github.com/microsoft/playwright/pull/13644#discussion_r855748243) replaces nested expect/try-catch with direct comparison and a purpose-built failure message. [r855749069](https://github.com/microsoft/playwright/pull/13644#discussion_r855749069) explains why `toHaveDownloaded` misleads: it sounds like disk inspection and subset inclusion but actually matches exact log contents. [r855736016](https://github.com/microsoft/playwright/pull/13644#discussion_r855736016) asks to ensure negated matcher behavior.

**Original**, [npmTest.ts ref 63220102f76eaed7e64142fcf0ee3a66e9a75004](https://github.com/microsoft/playwright/blob/63220102f76eaed7e64142fcf0ee3a66e9a75004/tests/installation/npmTest.ts):

```ts
try {
  const expected = [...browsers];
  browsers.sort();
  const actual = [...downloaded];
  actual.sort();
  _expect(actual).toEqual(expected);
} catch (err) {
  return {
    message: () => `Browser download expectation failed:\n${err.toString()}`,
    pass: false,
  };
}
```

**Final merge**, [e69e836c40dd55c08a884c8523bf2da893101034](https://github.com/microsoft/playwright/blob/e69e836c40dd55c08a884c8523bf2da893101034/tests/installation/npmTest.ts):

```ts
toHaveLoggedSoftwareDownload(received: any, browsers: ('chromium' | 'firefox' | 'webkit' | 'ffmpeg')[]) {
```

The exact-match core:

```ts
const expected = browsers;
if (expected.length === downloaded.size && expected.every(browser => downloaded.has(browser)))
  return { pass: true };
return {
  pass: false,
  message: () => [
    `Browser download expectation failed!`,
    ` expected: ${[...expected].sort().join(', ')}`,
    `   actual: ${[...downloaded].sort().join(', ')}`,
  ].join('\n'),
};
```

**Challenge/response/outcome.** Asked whether fixture code could be a `beforeEach`, author [r856544460](https://github.com/microsoft/playwright/pull/13644#discussion_r856544460) prefers fixtures for automatic application and helper/parameterization scope. Final auto fixture remains. Author [r856509292](https://github.com/microsoft/playwright/pull/13644#discussion_r856509292) declines replacing the built-package cache file with environment-only transport because the file also tracks already built packages. Reviewer removes needless comments [r855740309](https://github.com/microsoft/playwright/pull/13644#discussion_r855740309), but final code retains explanatory comments about workspace path and isolated npm environment. [Explicit approval](https://github.com/microsoft/playwright/pull/13644#pullrequestreview-951862066), merged. No silent reply is labeled approval of the declined cache-file suggestion.

**Generalization.** Remove avoidable error-driven control flow, name what is actually asserted, and keep framework fixtures/cache state when their role extends beyond a superficial call count.

## 6. #34238 — small additive platform fix; easy native substitute was incomplete

**Original request/code.** At ref `68c74990869a4cc7d4be9a181cee04bb72b4953c`, [r1905673759](https://github.com/microsoft/playwright/pull/34238#discussion_r1905673759) in `tests_primary.yml` suggests `npx playwright install-deps chromium` in place of:

```yaml
run: |
  sudo apt-get update
  sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libcups2 libgtk-3-0 libgbm-dev libasound2t64
```

Author [r1905925270](https://github.com/microsoft/playwright/pull/34238#discussion_r1905925270) explains install-deps does not cover the missing dependency. Subsequent work changes the solution; **do not claim the initial package install landed**.

Reviewer [r1907577108](https://github.com/microsoft/playwright/pull/34238#discussion_r1907577108) asks to scope the newer OS workaround to installation/Electron tests and document when to remove it. **Final merge**, [tests_primary.yml at 01ba528904714e02bdf19bee436988dc7d2f30eb](https://github.com/microsoft/playwright/blob/01ba528904714e02bdf19bee436988dc7d2f30eb/.github/workflows/tests_primary.yml):

```yaml
- name: Setup Ubuntu Binary Installation # TODO: Remove when https://github.com/electron/electron/issues/42510 is fixed
  if: ${{ runner.os == 'Linux' }}
  run: |
    if grep -q "Ubuntu 24" /etc/os-release; then
      sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
    fi
  shell: bash
```

The final shared `run-test` action has no new setup step. The OS workaround occurs in installation-test workflow jobs rather than every browser test. [r1907932149](https://github.com/microsoft/playwright/pull/34238#discussion_r1907932149) initially challenges whether it helps, then distinguishes Codespaces from Ubuntu 24.04 Docker. That is environment-sensitive evidence, not a universal guarantee.

**Outcome.** [Explicit approval](https://github.com/microsoft/playwright/pull/34238#pullrequestreview-2540092730), merged +21/-0. Generalization: an additive diff may be the correct scoped solution. Verify a suggested installed utility covers the actual environment; preserve rationale/revisit triggers for necessary workarounds. This case gives no basis for introducing OS changes into lazy-clean itself.

## 7. #37761 — contract clarity, real input-boundary challenge, rejected ad hoc validation

**Requests.** [r2413901307](https://github.com/microsoft/playwright/pull/37761#discussion_r2413901307) rejects defensive checks throughout consumers of a declared string contract, asks for producer guarantees. [r2426348550](https://github.com/microsoft/playwright/pull/37761#discussion_r2426348550) asks to choose runtime validation or defensive checks rather than unclear duplication. Author [r2426399089](https://github.com/microsoft/playwright/pull/37761#discussion_r2426399089) challenges this: trace viewer consumes external stored data, unlike a freshly generated HTML report. That is a substantive trust-boundary distinction.

**Original code**, `packages/html-reporter/src/filter.ts` ref `38b3ba03b293f595423bfc3e6f5aa23a9c381dce`, exact hunk:

```ts
annotations: test.annotations.map(a => (a.type || '').toLowerCase() + '=' + a.description?.toLocaleLowerCase())
```

At intermediate [annotationsTab.tsx b07adb13d074e03cfcf58664c3aad55722b9aa71](https://github.com/microsoft/playwright/blob/b07adb13d074e03cfcf58664c3aad55722b9aa71/packages/trace-viewer/src/ui/annotationsTab.tsx):

```ts
// Defensive check for trace files which may have invalid data
if (!annotation.type || typeof annotation.type !== 'string')
  return null;
```

**Final unmerged head**, [de868aa4a58b6b51c467b4b4d13b99d2f8998f99 annotationsTab.tsx](https://github.com/microsoft/playwright/blob/de868aa4a58b6b51c467b4b4d13b99d2f8998f99/packages/trace-viewer/src/ui/annotationsTab.tsx), removes this guard; [util.ts](https://github.com/microsoft/playwright/blob/de868aa4a58b6b51c467b4b4d13b99d2f8998f99/packages/playwright/src/util.ts) introduces validation, including:

```ts
export function validateAnnotation(annotation: any): TestAnnotation {
  if (typeof annotation !== 'object' || annotation === null || Array.isArray(annotation))
    throw new Error(`Annotation must be an object, received: ${typeof annotation}`);

  if (!('type' in annotation) || annotation.type === null || annotation.type === undefined)
    throw new Error('Annotation must have a "type" property');

  if (typeof annotation.type !== 'string')
    throw new Error(`Annotation type must be a string, received: ${typeof annotation.type}`);
```

Additional code validates location fields and normalizes description. Author [r2428495914](https://github.com/microsoft/playwright/pull/37761#discussion_r2428495914) links guard removal; author [r2416770468](https://github.com/microsoft/playwright/pull/37761#discussion_r2416770468) accepts restoring error throwing rather than mangling annotation types. Naming `validateAnnotation` and local-variable-over-property requests are also accepted, not helper deletion.

**Actual final outcome.** Changes requested, no explicit approval. An initial closure citing missing issue/repro [issuecomment-3417514867](https://github.com/microsoft/playwright/pull/37761#issuecomment-3417514867) is corrected as a misunderstanding [3427450093](https://github.com/microsoft/playwright/pull/37761#issuecomment-3427450093). Final maintainer [3428639288](https://github.com/microsoft/playwright/pull/37761#issuecomment-3428639288) says dozens of ad hoc validation lines for one of many user objects do not improve the overall validation story; suggests schema-based validation for a future coordinated approach. Author [3429278511](https://github.com/microsoft/playwright/pull/37761#issuecomment-3429278511) agrees to close. The non-null `merge_commit_sha` is a synthetic GitHub mergeability commit; `merged=false` is the outcome. No replacement implementation was verified.

**Generalization/caveat.** Prefer one clear contract and avoid speculative downstream duplication. Revalidate external stored inputs at the actual boundary; a type annotation is not proof of trust. This rejection supports scope/consistency, not a universal ban on validation and not adding a schema dependency to lazy-clean.

## 8. #36059 — native activeElement simplifies iframe handling; claims require code checks

**Request.** [r2114783266](https://github.com/microsoft/playwright/pull/36059#discussion_r2114783266) explains an iframe is active in its owner document when it contains the focused element; reading `contentDocument` is unnecessary. Reviewer also limits the feature to active state because focusability implementation is incomplete/platform-dependent [review-2862904706](https://github.com/microsoft/playwright/pull/36059#pullrequestreview-2862904706).

**Original**, [ariaSnapshot.ts ref 5056a57d5ea9b93f704ecd1b8ea17330a46af1c5](https://github.com/microsoft/playwright/blob/5056a57d5ea9b93f704ecd1b8ea17330a46af1c5/packages/injected/src/ariaSnapshot.ts):

```ts
const iframe = element as HTMLIFrameElement;
const isDirectlyActive = element.ownerDocument.activeElement === element;
let containsActiveElement = false;
try {
  containsActiveElement = iframe.contentDocument &&
                          iframe.contentDocument.activeElement &&
                          iframe.contentDocument.activeElement !== iframe.contentDocument.body;
} catch (e) {
  // Cross-origin iframe, can't access contentDocument
}
const isActive = isDirectlyActive || !!containsActiveElement;
```

**Final unmerged head**, [cfb46a7b72926874a3850dc5c0cdda915e716547](https://github.com/microsoft/playwright/blob/cfb46a7b72926874a3850dc5c0cdda915e716547/packages/injected/src/ariaSnapshot.ts):

```ts
const isActive = element.ownerDocument.activeElement === element;
```

This avoids a cross-origin read and its catch entirely while preserving the documented native behavior. Final iframe still has `active: isActive` in the node object. Do not claim all other feedback was addressed: [r2124476583](https://github.com/microsoft/playwright/pull/36059#discussion_r2124476583) requests moving active to props; final inspected code still has it on the node. The bot says it fixed `toContainYaml` and simplification repeatedly, but reviewer [r2110101891](https://github.com/microsoft/playwright/pull/36059#discussion_r2110101891), [r2114877769](https://github.com/microsoft/playwright/pull/36059#discussion_r2114877769) finds the actual code unchanged at those points. [r2110103675](https://github.com/microsoft/playwright/pull/36059#discussion_r2110103675) also asks for deterministic exact focus checks rather than forgiving alternatives.

**Outcome.** Closed without merge, no approval in fetched reviews, no closure rationale in fetched conversation. Some reviewer requests are implemented in final head; this does not make the overall feature accepted. No replacement PR was verified.

**Generalization.** Use native APIs whose semantics cover the case and eliminate the problematic path. Verify actual final diff after claimed fixes, including generated tests; do not treat agent prose or mere silence as acceptance.

## Supplementary counterexamples (not counted as full sample cases)

- [#29890 r1536045974](https://github.com/microsoft/playwright/pull/29890#discussion_r1536045974) suggests injected code is unused/uncovered in Node. Maintainer [r1536144503](https://github.com/microsoft/playwright/pull/29890#discussion_r1536144503) points to other-language consumers; author [r1536225558](https://github.com/microsoft/playwright/pull/29890#discussion_r1536225558) keeps it. Review [r1558391865](https://github.com/microsoft/playwright/pull/29890#discussion_r1558391865) prefers inlining six table cases; author [r1559020593](https://github.com/microsoft/playwright/pull/29890#discussion_r1559020593) declines because it grows tests and hides shared error-format intent. Maintainer [r1556493894](https://github.com/microsoft/playwright/pull/29890#discussion_r1556493894) explicitly requires every branch. Head `259d9c6380bcd59224f1541259b21cff778d12a1`, merge `b2ded9fed1a66c13fb19a997808fb300219ec62c`. This reinforces cross-language caller tracing and behavior coverage over either inlining or parameterization dogma.
- [#7345 r663261930](https://github.com/microsoft/playwright/pull/7345#discussion_r663261930) questions snapshot-file assertions; author [r663272783](https://github.com/microsoft/playwright/pull/7345#discussion_r663272783) explains they prove an existing snapshot was not overwritten. Reviewer [r663274636](https://github.com/microsoft/playwright/pull/7345#discussion_r663274636) explicitly retracts the objection. Author also distinguishes absent versus existing snapshots [r661869247](https://github.com/microsoft/playwright/pull/7345#discussion_r661869247). Reviewer [r665529888](https://github.com/microsoft/playwright/pull/7345#discussion_r665529888) first offers existing `stripAscii`, only then permits dropping a low-value colored-path output check if too costly. Mutation/state preservation assertions are not implementation mirrors.

## Implications for lazy-clean

High-confidence transferable refinements: keep helpful why/order/platform comments; distinguish exact-path semantics from regex reuse; require negative/nondependent cases for selection; preserve explicit readable domain interfaces and fixture lifecycles; trace consumers beyond local language/call sites; use final code and behavior checks rather than acceptance claims; avoid expanding a local fix into ad hoc global input validation.

Most already align with current AGENTS rules. The clearest gap is unconditional code-comment prohibition. A second risk is treating implementation-shaped test assertions or exact counts as redundant before identifying the regression/consumer boundary. Cases do not justify requiring fewer tests, fewer functions, net-negative diffs, new dependencies, or wholesale architecture changes.
