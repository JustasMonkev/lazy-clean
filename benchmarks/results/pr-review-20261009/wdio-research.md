# WebdriverIO PR review evidence — 2026-10-09

Researcher task only: no implementation changes. Read local AGENTS.md, lazy, lazy-clean, and slop-check rules. All remote evidence came through the GitHub connector from webdriverio/webdriverio. No Linux scanning; nodejs/node untouched. Seven independent PR cases: five merged, two closed/unmerged. Replacement PRs #8456 and #15723 are outcome checks, not additional independent samples.

## Method and selection

Reproducible connector queries, each topn=15, sort=comments:

1. `repo:webdriverio/webdriverio is:pr is:merged in:comments duplication`
2. `repo:webdriverio/webdriverio is:pr is:merged in:comments abstraction`
3. `repo:webdriverio/webdriverio is:pr is:closed is:unmerged in:comments`
4. `repo:webdriverio/webdriverio is:pr is:merged in:comments "helper"`

These returned 13, 2, 15, and 15 results respectively. This is purposeful, keyword-biased selection, not a prevalence estimate. Full normalized discussion timelines were fetched for eight candidates (#14319, #12430, #15221, #14544, #8156, #5992, #3586, #15471). The seven selected cases mix small bug fixes, feature/API work, tests, a large TypeScript refactor, and a substantial IPC proposal. #15471 was screened out: the retrieved discussion was largely author-to-bot requests, making it a weaker independent human-review case. Documentation-only #15301/#2142 and tracking-doc #5998/#5972 were seen in search results but not deep-read or counted. Search-ranked #15728/#4210/#9704 were not selected because more bounded cases already covered the requested concerns. Do not imply these were independently reviewed.

For selected cases, fetched REST PR metadata, all inline review comments (per_page=100; each selected response contained fewer than 100), and exact final-head file excerpts. The normalized timeline includes issue comments, author replies, and review submissions. REST comment `diff_hunk` and `original_commit_id` recover the reviewed old code rather than assuming the final diff is the criticized code. Exact final-head snapshots were read separately. Full relevant threads were followed through response and outcome. Bounded raw metadata, human timelines, and relevant original hunks are in [wdio-review-evidence.json](wdio-review-evidence.json); redundant HTML and repository snapshots are omitted.

| PR | Outcome | Size | Final head | Merge commit |
|---|---|---|---|---|
| [#14319](https://github.com/webdriverio/webdriverio/pull/14319) | Merged | +18/−5; 1 files | `696438b35684878b49c82d7b7d250a13ac6b0cee` | `c23bbc6310aed77796ec9d0246fddc39b17a7772` |
| [#12430](https://github.com/webdriverio/webdriverio/pull/12430) | Merged | +67/−4; 2 files | `8e308265643c5db44b06e7284f12a97065820576` | `af6b6b6f6b4022bfb8654ca51c2e5ca3770240d1` |
| [#15221](https://github.com/webdriverio/webdriverio/pull/15221) | Merged | +114/−4; 3 files | `0655b9e1719d7706d90eb92788a287ff651ea20c` | `7b9adadd87cb30f478fcc8cf543544285c8a6f38` |
| [#3586](https://github.com/webdriverio/webdriverio/pull/3586) | Merged | +105/−0; 5 files | `c898268bdfa474b492d76e4a4214e03deac4f452` | `afcec30f82960229f4d35d012d030738f74a65c3` |
| [#5992](https://github.com/webdriverio/webdriverio/pull/5992) | Merged | +267/−303; 53 files | `560dd81ea91c6bd3c669b849ad6a9fc94e3f89e0` | `2716ecb114d2bf8d1ee90ffd8683b515a6a50a6a` |
| [#8156](https://github.com/webdriverio/webdriverio/pull/8156) | Closed, unmerged | +234/−17; 12 files | `33bf2cf14efd2bbfc767233e448f6f70a57010aa` | None (a non-null API merge_commit_sha on an unmerged PR is not a merge) |
| [#14544](https://github.com/webdriverio/webdriverio/pull/14544) | Closed, unmerged | +3384/−523; 52 files | `fc4bd1939ad0b7dcb93c6294eca71c3e2d5b7a34` | None (a non-null API merge_commit_sha on an unmerged PR is not a merge) |

No upstream tests were run. Test value and pass/failure observations below are attributed to reviewers or visible test code. Approval is distinguished from merely observing code in a merged PR.

## 1. #14319 — useful workaround helper and comment; avoid serialization as deduplication

**Context.** A Firefox BiDi locateNodes bug returned duplicate element references. Initial reviewer [erwinheitzman](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2751351003) preferred fixing Geckodriver upstream, and the author [offered to close](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2752146830). Christian Bromann [proposed keeping a temporary WDIO workaround](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2752714991): file upstream issue, move patch into a function with an issue link, use a Set for duplicates, and check other affected call sites. He [reaffirmed due diligence](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2754438197).

**Reviewed before.** [Inline comment r2015097799](https://github.com/webdriverio/webdriverio/pull/14319#discussion_r2015097799), original ref `2c5627adaef12d006820b3329b1dfdce5bec2b79`, path `packages/webdriverio/src/utils/index.ts`:

```ts
/**
* Temporary patch for https://github.com/mozilla/geckodriver/issues/2223
*/
function returnUniqueNodes(nodes: ExtendedElementReference[]): ExtendedElementReference[] {
    return Array.from(new Set(nodes.map(node => JSON.stringify(node)))).map(res => JSON.parse(res))
}
```

Reviewer reasoned that element IDs suffice, eliminating serialization, deserialization, and extra maps. He [explicitly liked the abstraction](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2755920332). Author [agreed to ID filtering and supplied upstream issue](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2755927934).

**Final after.** [Exact final file](https://github.com/webdriverio/webdriverio/blob/696438b35684878b49c82d7b7d250a13ac6b0cee/packages/webdriverio/src/utils/index.ts), lines 435–442:

```ts
/**
* Temporary patch for https://github.com/mozilla/geckodriver/issues/2223
*/
function returnUniqueNodes(nodes: ExtendedElementReference[]): ExtendedElementReference[] {
    const ids = new Set()
    return nodes.filter((node) => !ids.has(node[ELEMENT_KEY]) && ids.add(node[ELEMENT_KEY]))
}
```

Both `findDeepElement` and `findDeepElements` call it. erwinheitzman [approved](https://github.com/webdriverio/webdriverio/pull/14319#pullrequestreview-2720335671), briefly requested changes based on a misunderstanding, and [approved again](https://github.com/webdriverio/webdriverio/pull/14319#pullrequestreview-2720382954). PR merged 2025-03-27.

**Lesson and caveat.** A helper can name a bounded compatibility policy; an upstream-issue comment records why the workaround exists and when to revisit it. This directly contradicts blanket removal of all non-directive code comments. It supports identity-based deduplication here because element identity is established; it does not license changing arbitrary deep-equality behavior to ID equality. No new test is visible in this one-file final change; do not claim comprehensive regression coverage.

## 2. #12430 — reuse a library hook, remove a helper only after tracing its role, prove the bug

**Context.** Passing config programmatically duplicated custom service initialization. The earliest simplification broke CLI arguments; maintainer [identified `npx wdio run wdio.conf.js --spec foo`](https://github.com/webdriverio/webdriverio/pull/12430#issuecomment-1977993314). Later proposal added flag-driven special handling; [r1514788559](https://github.com/webdriverio/webdriverio/pull/12430#discussion_r1514788559) requested the existing merger's customization instead.

**Reviewed before.** Original ref `3c4dcf00d38e3bb478fb105f01658ec0d4184fe7`, `packages/wdio-config/src/node/ConfigParser.ts`, exact hunk excerpt:

```ts
if (!addServicesToConfig) {
    this._config.services = services
```

An intermediate `private mergeReportersAndServices(object: MergeConfig)` was challenged in [r1518642560](https://github.com/webdriverio/webdriverio/pull/12430#discussion_r1518642560), original ref `62701a3414f1c90d0f439d97d9d696a261314222`. Author [defended its launcher-config responsibility](https://github.com/webdriverio/webdriverio/pull/12430#discussion_r1518643346). Reviewer [then explained that its work should live in the custom merger](https://github.com/webdriverio/webdriverio/pull/12430#pullrequestreview-1929988780), rather than treating one caller as sufficient proof of waste. Author [applied that change](https://github.com/webdriverio/webdriverio/pull/12430#issuecomment-2000741144).

**Final after.** [Exact final ConfigParser](https://github.com/webdriverio/webdriverio/blob/8e308265643c5db44b06e7284f12a97065820576/packages/wdio-config/src/node/ConfigParser.ts), inside `merge`:

```ts
const customDeepMerge = deepmergeCustom({
    mergeArrays: ([oldValue, newValue], utils, meta) => {
        const key = meta?.key as KeyWithMergeDuplication
        if (meta && MERGE_DUPLICATION.includes(key)) {
            const origWithoutObjectEntries = oldValue.filter((value: [Services.ServiceClass, WebdriverIO.ServiceOption] | [Reporters.ReporterClass, WebdriverIO.ReporterOption]) => typeof value !== 'object')
            return Array.from(new Set(deepmerge(newValue, origWithoutObjectEntries)))
        }
        return utils.actions.defaultMerge
    }
})
this._config = customDeepMerge(this._config, object) as TestrunnerOptionsWithParameters
```

The final code preserves other array merge policy through `defaultMerge`. Do not generalize the reviewer's early idea of avoiding all array merges: final implementation is targeted. The reviewer [requested a rationale comment](https://github.com/webdriverio/webdriverio/pull/12430#discussion_r1528842046) explaining programmatic-launcher duplication; final head contains it.

**Test evidence.** Reviewer first [asked for the actual class use case](https://github.com/webdriverio/webdriverio/pull/12430#discussion_r1545482384). After author added it, reviewer [removed the implementation change and found the test still passed](https://github.com/webdriverio/webdriverio/pull/12430#pullrequestreview-1970840543). His detailed response moved duplicate class tuples into the in-memory source config, removed an unnecessary filesystem fixture, and compared source plus override. Author [accepted](https://github.com/webdriverio/webdriverio/pull/12430#issuecomment-2029707580) and [reported amended code](https://github.com/webdriverio/webdriverio/pull/12430#issuecomment-2067525739). Final [test file](https://github.com/webdriverio/webdriverio/blob/8e308265643c5db44b06e7284f12a97065820576/packages/wdio-config/tests/node/configparser.test.ts) has class tuples on both sides, asserts three entries and snapshots each resulting list.

Maintainer [approved](https://github.com/webdriverio/webdriverio/pull/12430#pullrequestreview-2013183587); merged. This is direct evidence that a plausible assertion is insufficient if setup never triggers the defective merge. It also shows reviewers preferring additional fixture/test code. Reviewer-provided draft had mistakes later amended (e.g. Set result); use exact final code, not his suggested draft, as outcome.

## 3. #15221 — a shorter guard dropped required logging; keep transformation and masking semantics

**Context.** Enumerating keys on a huge serialized request body caused RangeError. Initial guard:

```ts
if (fullRequestOptions.body && typeof fullRequestOptions.body === 'object' && Object.keys(fullRequestOptions.body).length) {
```

Exact [r3689715078](https://github.com/webdriverio/webdriverio/pull/15221#discussion_r3689715078) hunk, original ref `7027034c2d8430d920721c686194ed4f9c4ce55f`, `packages/webdriver/src/request/request.ts`. A human reviewer initially thought skipping logging reasonable but [changed position](https://github.com/webdriverio/webdriverio/pull/15221#issuecomment-5141902095) after the bot established createOptions serializes the body: the guard silently disabled normal logging. Bot advice then proposed logging `this.body`; human reviewer [asked about masking bypass](https://github.com/webdriverio/webdriverio/pull/15221#discussion_r3691746763), author [acknowledged and fixed](https://github.com/webdriverio/webdriverio/pull/15221#discussion_r3691756299).

**Final after.** [Exact final file](https://github.com/webdriverio/webdriverio/blob/0655b9e1719d7706d90eb92788a287ff651ea20c/packages/webdriver/src/request/request.ts):

```ts
function toLoggableBody (body: BodyInit): BodyInit | Record<string, unknown> {
    if (typeof body !== 'string') {
        return body
    }

    try {
        return JSON.parse(body)
    } catch {
        return body
    }
}

const loggableBody = fullRequestOptions.body && toLoggableBody(fullRequestOptions.body)
if (loggableBody && hasLoggableBody(loggableBody)) {
    this.eventHandler.onLogData?.(loggableBody)
}
```

The second helper checks emptiness for string, URLSearchParams/FormData, Blob, ArrayBuffer/views, and objects. Parsing the actual transformed request retains masking and serialized `toJSON` behavior. Catch fallback represents an accepted non-JSON body, not fake success for a failed request. These two local helpers add code with concrete behavior value.

**Test evidence.** Final [tests](https://github.com/webdriverio/webdriverio/blob/0655b9e1719d7706d90eb92788a287ff651ea20c/packages/webdriver/tests/request.test.ts#L262-L338) cover plain object logging, 16,777,217-character payload, transformed redacted body, toJSON redaction, non-JSON string, binary body, and empty body. Exact representative assertions:

```ts
await req.makeRequest({ ...defaultOptions, transformRequest }, 'foobar-123')
expect(onLogData).toHaveBeenNthCalledWith(1, { password: '**REDACTED**' })
```

This checks transformation output crossing a logging boundary, not a mock being handed its own setup value. The author [warned bot review referenced old context](https://github.com/webdriverio/webdriverio/pull/15221#discussion_r3692188395), while reviewer [pasted current code and asked if bot assessed the right version](https://github.com/webdriverio/webdriverio/pull/15221#discussion_r3692179911). Human [approved coverage and fix](https://github.com/webdriverio/webdriverio/pull/15221#pullrequestreview-4830766911). Author [merged, attributing remaining test failures to unrelated flakiness](https://github.com/webdriverio/webdriverio/pull/15221#issuecomment-5145986416); we have not independently verified that CI attribution.

**Lesson and caveat.** Simplification must trace representation changes and observers. Helpful functions, guarded parsing fallback, and mock call assertions can earn their place. This does not prove all body types' behavior is exhaustive: do not infer contract completeness from merge or add formats on speculation.

## 4. #3586 — a reviewer withdrew an attractive simplification after inspecting the framework contract

**Context.** Add element shadow$/shadow$$ commands. Reviewer [requested moving factory from commands/constant.js to scripts](https://github.com/webdriverio/webdriverio/pull/3586#discussion_r258530319), old ref `e120b2135e417e9d4d0f5220cecf928c8ad2277a`. At the next revision, [r258542185](https://github.com/webdriverio/webdriverio/pull/3586#discussion_r258542185), ref `5e16bc4121c14c29754b4d6885661a557b87759d`, proposed avoiding eval by passing selector and flag as execute arguments.

**Exact reviewed and final code.** `packages/webdriverio/src/scripts/shadowFnFactory.js`, [final head](https://github.com/webdriverio/webdriverio/blob/c898268bdfa474b492d76e4a4214e03deac4f452/packages/webdriverio/src/scripts/shadowFnFactory.js) retains this shape:

```js
export const shadowFnFactory = function(elementSelector, qsAll) {
    const strFn = `
    (function() {
      if (this.shadowRoot) {
        return this.shadowRoot.querySelector${qsAll ? 'All' : ''}('${elementSelector}')
      }
      return this.querySelector${qsAll ? 'All' : ''}('${elementSelector}')
    })`
    return eval(strFn)
}
```

Nonfunctional comments omitted from this excerpt; exact source linked. Final [shadow$ call](https://github.com/webdriverio/webdriverio/blob/c898268bdfa474b492d76e4a4214e03deac4f452/packages/webdriverio/src/commands/element/shadow$.js):

```js
return await this.$(shadowFnFactory(selector))
```

Author [asked how proposed replacement would work](https://github.com/webdriverio/webdriverio/pull/3586#discussion_r258557108). Reviewer [explicitly withdrew it](https://github.com/webdriverio/webdriverio/pull/3586#discussion_r258561114): this is a function selector, which cannot receive arguments like execute. Reviewer subsequently [approved](https://github.com/webdriverio/webdriverio/pull/3586#pullrequestreview-205885820); merged.

**Lesson and caveat.** Apparent platform reuse is invalid when callbacks are serialized under a different invocation contract. This is specific historical evidence of reviewer correction, not a current endorsement of eval or proof interpolation is secure. Do not turn it into a checker whitelist. Postmerge discussion also challenged broad component-object abstractions; author ultimately [accepted using API, component objects, and deep selectors as needed](https://github.com/webdriverio/webdriverio/pull/3586#issuecomment-468382812). That is discussion, not a subsequent implementation change in this PR.

## 5. #5992 — TypeScript rewrite retained actual runtime defenses and staged type debt

**Context.** Large browser-command TS rewrite. An added process.send guard was [questioned](https://github.com/webdriverio/webdriverio/pull/5992#discussion_r515011279). Author [explained parent processes lack it](https://github.com/webdriverio/webdriverio/pull/5992#discussion_r515075107).

**Before/after.** Original and final ref `560dd81ea91c6bd3c669b849ad6a9fc94e3f89e0`, `packages/webdriverio/src/commands/browser/debug.ts` [source](https://github.com/webdriverio/webdriverio/blob/560dd81ea91c6bd3c669b849ad6a9fc94e3f89e0/packages/webdriverio/src/commands/browser/debug.ts):

```diff
- if (!process.env.WDIO_WORKER) {
+ if (!process.env.WDIO_WORKER || typeof process.send !== 'function') {
```

Callback path separately rechecks process.send before emitting results. The guard protects actual runtime capability variation. The asker [approved afterward, subject to remaining comments](https://github.com/webdriverio/webdriverio/pull/5992#pullrequestreview-520558588). This is stronger than an uncommented merged guard, but the approval covers the PR broadly.

**Type-cast subcase.** Reviewer [challenged a double assertion](https://github.com/webdriverio/webdriverio/pull/5992#discussion_r506951053), ref `9ded2c7aab21aea2bc9fc73ff462d5c500eaed2c`, getCookies.ts:

```ts
const allCookies: WebDriver.Cookie[] = await this.getAllCookies() as unknown as WebDriver.Cookie[]
```

Author [traced it to generated protocol return type object[]](https://github.com/webdriverio/webdriverio/pull/5992#discussion_r510467121), requiring upstream generation improvement. Final [source](https://github.com/webdriverio/webdriverio/blob/560dd81ea91c6bd3c669b849ad6a9fc94e3f89e0/packages/webdriverio/src/commands/browser/getCookies.ts) reduced it:

```ts
const allCookies: WebDriver.Cookie[] = await this.getAllCookies() as WebDriver.Cookie[]
return allCookies.filter(cookie => namesList.includes(cookie.name))
```

martinfrancois [approved after changes](https://github.com/webdriverio/webdriverio/pull/5992#pullrequestreview-516016867). Do not claim types validate external cookies; this is historical accepted boundary debt, not sound type proof.

**Scope subcase.** Reviewer [asked for stronger tab-count checking](https://github.com/webdriverio/webdriverio/pull/5992#discussion_r514444883); author [explicitly declined additional new-window behavior checks within the typing PR](https://github.com/webdriverio/webdriverio/pull/5992#discussion_r514454086). The suggesting review was later dismissed, not an explicit endorsement of the author's reasoning. No optional-chain readability suggestion was rejected: final getPuppeteer code accepted optional chaining; a question about syntax is not a refusal.

**Lesson.** Runtime guards and asserted generated-protocol mismatches must be triaged by evidence and migration scope. Do not turn historical compromises into permanent exemptions.

## 6. #8156 — closed proposal led to a merged maintainer replacement with purposeful module mocks

**Context.** REPL config capability selection. Closed unmerged PR does not mean its feature or all design choices were rejected. Maintainer [closed and explicitly requested review of replacement #8456](https://github.com/webdriverio/webdriverio/pull/8156#issuecomment-1160839539); REST confirms #8456 merged.

**Reviewed before.** [r894823064](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r894823064), original/final ref `33bf2cf14efd2bbfc767233e448f6f70a57010aa`, `packages/wdio-cli/tests/utils.test.ts`:

```ts
jest.mock('@wdio/config', () => {
    return { ...jest.requireActual('@wdio/config') }
})
```

Author's final tests loaded actual JS/TS config fixture files. Reviewer earlier [requested eliminating test data once functions were mocked](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r873974457), original ref `5052fc73d2512e51ad9eb799aecbe2cd31d66146`. Attempts to spy on existing class mock did not work. The maintainer's final explanation says the unit under test should not re-test ConfigParser autoCompile; its own tests cover that. He authored a file-specific class mock and prototype spies.

**Actual replacement after.** [Merged #8456 head test file](https://github.com/webdriverio/webdriverio/blob/8acaf19cc13c1804cf2b267c58ebc16fa30debec/packages/wdio-cli/tests/utils.test.ts):

```ts
jest.mock('@wdio/config', () => ({
    ConfigParser: class ConfigParserMock {
        addConfigFile () {}
        autoCompile () {}
        getCapabilities () {}
    }
}))

const autoCompileMock = jest.spyOn(ConfigParser.prototype, 'autoCompile')
const getCapabilitiesMock = jest.spyOn(ConfigParser.prototype, 'getCapabilities')
getCapabilitiesMock.mockReturnValue([
    { browserName: 'chrome' },
    { browserName: 'firefox', specs: ['/path/to/some/specs.js'] },
    { maxInstances: 5, browserName: 'chrome', acceptInsecureCerts: true,
      'goog:chromeOptions' : { 'args' : ['window-size=8000,1200'] } }
])
expect(getCapabilities({ option: '/path/to/config.js', capabilities: 2 } as any))
    .toMatchSnapshot()
expect(autoCompileMock).toBeCalledTimes(1)
```

The setup is an exact excerpt in content, with final capabilities object formatting condensed. The maintainer explanation explicitly supports both module mocking and call-count assertion at this boundary; this is not just uncommented final code. It does not prove all module mocking is desirable. Production should not acquire injectable APIs solely to remove an existing appropriate test seam.

**Reuse/naming subcase.** Reviewer [explained duplicate capability lists create maintenance obligations](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r870204389), [rejected whole-lodash import for a simple existence check](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r870822874), and [requested exporting the canonical list from protocols](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r870825130): relative cross-package imports fail under npm layouts. Author [reported completing changes](https://github.com/webdriverio/webdriverio/pull/8156#issuecomment-1125381680). Reviewer later [clarified W3C allowlist plus colon vendor capabilities](https://github.com/webdriverio/webdriverio/pull/8156#issuecomment-1125455136). This is a discussed compatibility choice in a specific command, not authorization to reject old inputs generally. [CAPABILITY_KEYS naming request](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r894823766) gives the shared list a concrete domain name.

**Outcome qualification.** Original #8156 received COMMENTED reviews, not final APPROVED. Replacement's code is maintainer-authored and merged. Count one historical development case, not independent two-PR corroboration.

## 7. #14544 — simpler standard emitter was rejected to preserve an established implementation choice

**Context.** Substantial birpc IPC proposal, 52 files. Reviewer [requested preserving recently introduced mitt](https://github.com/webdriverio/webdriverio/pull/14544#discussion_r2205412249). Preserving the established emitter implementation is explicit; an inference about browser/runtime motivation is plausible but not established by this comment.

**Before.** r2205412249, original ref `612422781983c7f4d1d43fdb3e0fd660e849ac09`, `packages/wdio-utils/src/monad.ts`, replaced the mitt adapter with:

```ts
const eventHandler = new EventEmitter()
```

**Final closed head.** [Exact monad.ts](https://github.com/webdriverio/webdriverio/blob/fc4bd1939ad0b7dcb93c6294eca71c3e2d5b7a34/packages/wdio-utils/src/monad.ts) restored:

```ts
const mittInstance = mitt()
const eventHandler = {
    on: mittInstance.on.bind(mittInstance),
    off: mittInstance.off.bind(mittInstance),
    emit: mittInstance.emit.bind(mittInstance),
    once: (type: string, handler: Function) => {
        const onceWrapper = (...args: unknown[]) => {
            mittInstance.off(type, onceWrapper)
            handler(...args)
        }
        mittInstance.on(type, onceWrapper)
    },
    removeListener: mittInstance.off.bind(mittInstance),
```

Excerpt ends before removeAllListeners; exact linked file contains it. Author [said done](https://github.com/webdriverio/webdriverio/pull/14544#discussion_r2207141065). Reviewer [also rejected added runtime dependencies in types package](https://github.com/webdriverio/webdriverio/pull/14544#discussion_r2205407500); author [said done](https://github.com/webdriverio/webdriverio/pull/14544#discussion_r2207140511), but final package still contains istanbul-lib-coverage alongside its types, so do not claim total dependency elimination.

**Acceptance and outcome.** Maintainer review [praised work and suggested remaining comments before readiness](https://github.com/webdriverio/webdriverio/pull/14544#pullrequestreview-3017091323), state COMMENTED, not APPROVED. Later [reported tests still failing](https://github.com/webdriverio/webdriverio/pull/14544#issuecomment-3100000091). PR closed unmerged. In 2026 maintainer [said it landed in #15723](https://github.com/webdriverio/webdriverio/pull/14544#issuecomment-5942215748); REST independently confirms #15723 merged with head `2b2acad71cf2df782760f1224829bde16db945d1`, merge `b683e320ac54559062645b6cb3006daf476205c9`. We have not proved full patch equivalence. Do not label #14544 rejected architecture or count every final-head choice as shipped.

**Lesson and caveat.** Library reuse is subordinate to the existing ownership/runtime contract. The review supports preserving mitt here; it does not prove the adapter itself is bug-free or justify arbitrary wrapping around standard libraries.

## Synthesis for lazy-clean

Evidence supports the ladder and contract-first simplification, but narrows categorical rules:

- Preserve durable rationale comments when they record upstream workaround provenance, a constraint, or behavior policy that code cannot communicate; reject narration and filler.
- Treat module mocks as prompts to inspect the actual unit boundary. An existing parser seam and isolated contract checks can be appropriate; adding production injection solely to remove mocks is not shown to improve design.
- Judge mock assertions by what regression they catch. Transformation, masking, lifecycle, and delegation obligations are observable behavior; self-fulfilling setup checks remain weak.
- Prefer reuse only after matching invocation, packaging, lifecycle, and runtime capability contracts.
- Maintain confidence distinctions: requested change, author agreement, visible final code, explicit approval, merge outcome, and claimed replacement lineage are different evidence.
- Regression tests must exercise the defective state. Reviewer #12430's removal probe is direct test-quality evidence, stronger than test-shaped code or a green suite assertion.

This small sample does not establish frequencies, universal preferences, or checker precision. It supplies grounded counterexamples and rerunnable primary-source references for bounded guidance changes.
