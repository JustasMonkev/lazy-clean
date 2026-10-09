# WebdriverIO critical review — 2026-10-09

Reviewed local lazy-clean base `8f38b32bae676c300d03191c2668e4f0c1271544`. This is a read-only evidence review; no implementation changes, WDIO test execution, production mutations, or benchmark execution. GitHub connector calls succeeded. No requested configuration/tool was unavailable. Read AGENTS.md, lazy-clean, lazy, slop-check, test-quality-review, and TS/JS simplification checks.

## Recommendations to the lead

| Proposed lesson | Verdict | Evidence and limit |
| --- | --- | --- |
| Treat every module mock as a design defect and demand dependency injection | Reject categorical claim; qualify current checker wording | #8156/#8456 maintainer explicitly chose package isolation and wrote a file-local class mock. Current exception only mentions legacy seams that cannot be refactored, but this was an intentional package boundary. Keep finding as review prompt, require tracing real production code and meaningful fault detection. |
| Preserve durable, maintainer-required workaround/invariant comments | Accept narrowly | #14319 explicitly requires an upstream issue link beside the workaround and landed with it. This is stronger than inferring approval from merge/silence. #12430 also requested a comment, but its final wording is imperfect and partly stale; it is not evidence to retain all explanations uncritically. |
| Inline all single-caller helpers | Reject; existing helper exceptions already cover this | #15221 final solution retains two module-private one-caller helpers which isolate parsing and body-shape policy; approved expressly. #14319 maintainer requested abstraction. Do not add another generic helper rule. |
| Catch-log-continue always hides failures | Qualify only | #15331 deliberately isolates failed uploads to preserve later queue batches; #10183 deliberately contains optional telemetry failures so the remaining session path executes. Preserve errors on required/fatal operations; keep explicit best-effort boundaries with checked downstream behavior. |
| Delete repeated guards based on equivalent syntax | Reject; existing boundary guidance already covers this | #10183 same credentials condition appears before env JSON restoration and after restoration. The value is changed across a boundary. Final approved code keeps both checks. |
| Optional chaining suggestion in #5992 was rejected for readability | Reject factual claim | Raw final getPuppeteer.ts includes exactly the proposed `ffArgs?.[...] ?? null`. The author's question about `?? null` was discussion, not refusal. Researcher was notified and corrected their provisional claim. |
| Prefer real regressions over setup-only tests | Accept existing policy, no new broad rule needed | #12430 maintainer removed the proposed implementation and the tests still passed. #15221 meaningful callback assertions distinguish dropped/transformed/redacted data. Current test-quality-review already distinguishes wiring contracts. |
| Add robustness for all hypothetical callback shapes | Reject unsupported extrapolation | #15310 author refused fallback for a callback that shares the same two-tuple shape pre/post-await; final code omits it. This is author explanation plus final outcome, not a direct reviewer endorsement of a universal callback invariant. |

## Evidence A: intentional package mocking and useful interaction assertions (#8156 → #8456)

[Original PR #8156](https://github.com/webdriverio/webdriverio/pull/8156) was **closed, not merged**. It was superseded by [#8456](https://github.com/webdriverio/webdriverio/pull/8456), merged at [c08dfbe2e684b1b370a260812f9f9ba51ffa6ca3](https://github.com/webdriverio/webdriverio/commit/c08dfbe2e684b1b370a260812f9f9ba51ffa6ca3). Replacement base was `0fb963aad5a2bdd53adb0e1808f315740bbd58cd`, head `8acaf19cc13c1804cf2b267c58ebc16fa30debec`.

The maintainer first [asked for mocking package classes](https://github.com/webdriverio/webdriverio/pull/8156#issuecomment-1127930097) and [explained ConfigParser should be isolated](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r873974149). Attempts to spy the existing automock failed. In the [final detailed explanation](https://github.com/webdriverio/webdriverio/pull/8156#issuecomment-1160839539), christian-bromann wrote a local `jest.mock` and explained that parsing JS/TS fixtures exercises autoCompile, which belongs to separate tests.

Before (author's reported test scope): load actual config fixtures / unmock ConfigParser to test JS and TS config parsing through the CLI utility. The author's [question documents that attempt](https://github.com/webdriverio/webdriverio/pull/8156#discussion_r872949104). This is discussion evidence for an abandoned approach; no claim that that code merged.

After ([actual replacement test file](https://github.com/webdriverio/webdriverio/blob/8acaf19cc13c1804cf2b267c58ebc16fa30debec/packages/wdio-cli/tests/utils.test.ts)):

```ts
jest.mock('@wdio/config', () => ({
    ConfigParser: class ConfigParserMock {
        addConfigFile () {}
        autoCompile () {}
        getCapabilities () {}
    }
}))
```

The final [maintainer-authored commit](https://github.com/webdriverio/webdriverio/commit/8acaf19cc13c1804cf2b267c58ebc16fa30debec) added:

```diff
 it('should get capability from wdio.conf.js', () => {
+    const autoCompileMock = jest.spyOn(ConfigParser.prototype, 'autoCompile')
     const getCapabilitiesMock = jest.spyOn(ConfigParser.prototype, 'getCapabilities')
     getCapabilitiesMock.mockReturnValue([
         ...
     ])
     expect(getCapabilities({ option: '/path/to/config.js', capabilities: 2 } as any))
         .toMatchSnapshot()
+    expect(autoCompileMock).toBeCalledTimes(1)
 })
```

[Actual production utility](https://github.com/webdriverio/webdriverio/blob/8acaf19cc13c1804cf2b267c58ebc16fa30debec/packages/wdio-cli/src/utils.ts) instantiates ConfigParser, calls autoCompile, parses the file, selects a capability, filters W3C/vendor keys, and throws meaningful errors. The test calls that production utility; it does not replace the subject with a test-local copy. Removing `config.autoCompile()` would fail the interaction assertion. Returning the wrong selected capability would fail its snapshot. These are reasoned fault-detection claims, not mutations executed here.

This is explicit maintainer design intent plus the actual merged replacement, not merge-as-silence. It does **not** justify mocking the subject itself or deleting integration tests. Current `no-module-mocking` text (“patch the loader instead of the design”) overstates the finding. Update wording/exception to acknowledge intentional collaborator/package isolation when production logic remains exercised and behavior/wiring is the oracle.

## Evidence B: small fix that deleted logging, corrected with one-caller helpers (#15221)

[#15221](https://github.com/webdriverio/webdriverio/pull/15221) merged at [7b9adadd87cb30f478fcc8cf543544285c8a6f38](https://github.com/webdriverio/webdriverio/commit/7b9adadd87cb30f478fcc8cf543544285c8a6f38). Base `24d52253bfd86b44500429a76d60db1c72acb442`; head `0655b9e1719d7706d90eb92788a287ff651ea20c`.

[Original submitted commit](https://github.com/webdriverio/webdriverio/commit/e157eada0e4a0b86df047c2fd062f211123c5b88):

```diff
-if (fullRequestOptions.body && Object.keys(fullRequestOptions.body).length) {
+if (fullRequestOptions.body && typeof fullRequestOptions.body === 'object' && Object.keys(fullRequestOptions.body).length) {
     this.eventHandler.onLogData?.(fullRequestOptions.body)
 }
```

The guard avoided enumerating a huge string, but normal createOptions bodies are already serialized. dprevost-LMI initially [considered skipping logging reasonable](https://github.com/webdriverio/webdriverio/pull/15221#discussion_r3689715078), then [explicitly rejected dropping all logging](https://github.com/webdriverio/webdriverio/pull/15221#issuecomment-5141902095) after tracing the data path. The lesson is to preserve established behavior, not prefer the reviewer's first suggestion.

[Final source](https://github.com/webdriverio/webdriverio/blob/0655b9e1719d7706d90eb92788a287ff651ea20c/packages/webdriver/src/request/request.ts):

```ts
function hasLoggableBody (body: BodyInit | Record<string, unknown>): boolean {
    if (typeof body === 'string') {
        return body.length > 0
    }

    if (body instanceof URLSearchParams || body instanceof FormData) {
        return !(body as URLSearchParams).keys().next().done
    }

    if (body instanceof Blob) {
        return body.size > 0
    }

    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
        return body.byteLength > 0
    }

    return Object.keys(body).length > 0
}

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
```

```ts
const loggableBody = fullRequestOptions.body && toLoggableBody(fullRequestOptions.body)
if (loggableBody && hasLoggableBody(loggableBody)) {
    this.eventHandler.onLogData?.(loggableBody)
}
```

These helpers are not redundant wrappers: one normalizes serialized logging data with non-JSON fallback; the other distinguishes empty strings, form data, blobs, binary views and ordinary objects. They are module-private, each called only at this site. This refutes caller count as sufficient deletion evidence. The JSON parse catch intentionally preserves a supported non-JSON transformed body; deleting the catch would make that valid logging path throw.

[Final tests](https://github.com/webdriverio/webdriverio/blob/0655b9e1719d7706d90eb92788a287ff651ea20c/packages/webdriver/tests/request.test.ts) preserve production `makeRequest` and check: ordinary object callback; >2²⁴-character payload avoids RangeError **and still emits once**; transformRequest-redacted body; custom toJSON output; non-JSON body; binary identity; absent callback on empty object. The transport is mocked for selected cases. Example:

```ts
const req = new WebFetchRequest('POST', 'session/:sessionId/element', { password: 'secret' }, undefined, false, { onLogData })
const transformRequest = vi.fn().mockImplementation((requestOptions) => ({
    ...requestOptions,
    body: JSON.stringify({ password: '**REDACTED**' })
}))
await req.makeRequest({ ...defaultOptions, transformRequest }, 'foobar-123')
expect(onLogData).toHaveBeenNthCalledWith(1, { password: '**REDACTED**' })
```

The asserted value is selected/transformed by production before the callback; logging original credentials, logging a string, or omitting logging would fail. This is not a mock echo. dprevost-LMI [approved “Nice coverage and fix!”](https://github.com/webdriverio/webdriverio/pull/15221#pullrequestreview-4830766911), [approved again](https://github.com/webdriverio/webdriverio/pull/15221#pullrequestreview-4830802528), and mccmrunal [announced merge](https://github.com/webdriverio/webdriverio/pull/15221#issuecomment-5145986416). Reported unrelated flaky tests were not rerun by this reviewer.

Limit: final code parses transformed JSON without narrowing the resulting shape, and falsy primitives skip logging. This PR is evidence for preserving established paths, not proof the helpers cover every possible custom transform. Do not turn all observed implementation choices into general prescriptions.

## Evidence C: deliberate catch-log-continue at a best-effort boundary (#15331)

[#15331](https://github.com/webdriverio/webdriverio/pull/15331) merged at [af3737447f4b70e19b7f95c2c894b575c6a882d6](https://github.com/webdriverio/webdriverio/commit/af3737447f4b70e19b7f95c2c894b575c6a882d6). Base `d1f898264c8e4f9889e0153978051ed914f20bf1`; head `3a9062a263ec4e205e08328cfd1956a243fdff7a`.

[Before](https://github.com/webdriverio/webdriverio/blob/d1f898264c8e4f9889e0153978051ed914f20bf1/packages/wdio-browserstack-service/src/request-handler.ts):

```ts
callCallback = async (data: UploadType[], kind: string) => {
    BStackLogger.debug('calling callback with kind ' + kind)
    await this.callback?.(data)
}
```

[After](https://github.com/webdriverio/webdriverio/blob/3a9062a263ec4e205e08328cfd1956a243fdff7a/packages/wdio-browserstack-service/src/request-handler.ts):

```ts
callCallback = async (data: UploadType[], kind: string) => {
    BStackLogger.debug('calling callback with kind ' + kind)
    // SDK-6275: isolate per-batch failures so one failing upload never aborts
    // the rest of the queue flush (notably the shutdown() drain loop, which
    // awaits this for each batch and would otherwise stop on the first error).
    try {
        await this.callback?.(data)
    } catch (e) {
        BStackLogger.debug(`Exception while sending data batch (${kind}); continuing with remaining batches: ${e}`)
    }
}
```

Both files show shutdown removing the poll interval and draining `while (this.queue.length > 0)`, splicing one batch then awaiting callCallback. A rejection previously aborted later batches. The same callCallback also serves interval/sendBatch. This is a shared failure boundary, not an irrelevant impossible-state guard.

Three explicit approvals: [rounak610](https://github.com/webdriverio/webdriverio/pull/15331#pullrequestreview-4512618016), [Bhargavi-BS](https://github.com/webdriverio/webdriverio/pull/15331#pullrequestreview-4512872087), [rounak610 final](https://github.com/webdriverio/webdriverio/pull/15331#pullrequestreview-4521857370). Author describes best-effort isolation in the PR body. No added tests appear in this final diff; approval and merge establish acceptance, not independently verified correctness.

Generalize only: a caught failure can be intentionally contained at an optional telemetry/queue boundary when failing-fast would discard independent work. Verify batch ownership, remaining work, cleanup and what is lost. Here the **failed batch remains lost** (already spliced), not requeued; this cannot justify “silently convert required upload failure to success” elsewhere. Current manual checklist should distinguish best-effort isolation from catch-log-continue that actually hides a required failure.

## Evidence D: same-looking guard required after restoration (#10183)

[#10183](https://github.com/webdriverio/webdriverio/pull/10183) merged at [d64a139ed7ca5d8e9148f20d6ae2f7912c73b280](https://github.com/webdriverio/webdriverio/commit/d64a139ed7ca5d8e9148f20d6ae2f7912c73b280). Base `c169f55057d52b7415dfebc2c0782848f380a94d`; head `254bb1dbe667e5ba2525d061437c15c64ac7a658`.

christian-bromann [suggested hoisting the duplicate condition](https://github.com/webdriverio/webdriverio/pull/10183#discussion_r1167105611). amaanbs [explained the first guard performs per-worker initialization and the second validates restored fields](https://github.com/webdriverio/webdriverio/pull/10183#discussion_r1171734473). Original reviewed [util.ts](https://github.com/webdriverio/webdriverio/blob/e8539f4a450860e198b32d961dc13d55fdfb7658/packages/wdio-browserstack-service/src/util.ts) had both checks around mutable module state. Final [CrashReporter class](https://github.com/webdriverio/webdriverio/blob/254bb1dbe667e5ba2525d061437c15c64ac7a658/packages/wdio-browserstack-service/src/crash-reporter.ts) retains the same necessary order:

```ts
try {
    if (!this.credentialsForCrashReportUpload.username || !this.credentialsForCrashReportUpload.password) {
        this.credentialsForCrashReportUpload = process.env.CREDENTIALS_FOR_CRASH_REPORTING !== undefined ? JSON.parse(process.env.CREDENTIALS_FOR_CRASH_REPORTING) : this.credentialsForCrashReportUpload
    }
} catch (error) {
    return log.error(`[Crash_Report_Upload] Failed to parse user credentials while reporting crash due to ${error}`)
}
if (!this.credentialsForCrashReportUpload.username || !this.credentialsForCrashReportUpload.password) {
    return log.error('[Crash_Report_Upload] Failed to parse user credentials while reporting crash')
}
```

Restored `{}` is valid JSON but lacks credentials. A single check before parse cannot certify the result afterward. Existing AGENTS revalidation after parsing/persistence already captures this; no new rule needed.

Separate contested catch scope: maintainer [requested narrowing](https://github.com/webdriverio/webdriverio/pull/10183#discussion_r1173452335) and later [said listener setup could move outside catch](https://github.com/webdriverio/webdriverio/pull/10183#discussion_r1180609641). Author initially argued future-proof wrapping (weak rationale), then [gave the concrete downstream reason](https://github.com/webdriverio/webdriverio/pull/10183#discussion_r1180632878): failed observability setup must not prevent the subsequent _printSessionURL path. [Final service.ts](https://github.com/webdriverio/webdriverio/blob/254bb1dbe667e5ba2525d061437c15c64ac7a658/packages/wdio-browserstack-service/src/service.ts) still wraps observability constructor/before/listener registration and logs/reports exceptions before `return await this._printSessionURL()`. [Base service.ts](https://github.com/webdriverio/webdriverio/blob/c169f55057d52b7415dfebc2c0782848f380a94d/packages/wdio-browserstack-service/src/service.ts) had no catch, so an observability rejection skipped that remainder. Maintainer [explicitly approved final PR](https://github.com/webdriverio/webdriverio/pull/10183#pullrequestreview-1406461524).

Do not mislabel reviewer suggestion as implemented or broad catch as universally preferred. The accepted implementation is bounded optional observability isolation. The author's claim that _printSessionURL “starts” the BrowserStack session overstates what the actual code does: it fetches/displays the session URL. Use the verified execution-order consequence, not that claim.

Repository-specific caveat: same maintainer [said BrowserStack service had become too complex to review without product context](https://github.com/webdriverio/webdriverio/pull/10183#issuecomment-1523707900), proposed separate ownership, and required tests. This makes BrowserStack acceptance weaker evidence for repository-wide preferences than the same maintainer's direct CLI boundary instruction.

## Evidence E: durable workaround rationale (#14319) and stale rationale caution (#12430)

[#14319](https://github.com/webdriverio/webdriverio/pull/14319) merged at [c23bbc6310aed77796ec9d0246fddc39b17a7772](https://github.com/webdriverio/webdriverio/commit/c23bbc6310aed77796ec9d0246fddc39b17a7772). christian-bromann [required moving the patch into a function and linking the upstream bug in its comment](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2752714991), [reiterated documentation/due diligence](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2754438197), author [reported the upstream issue and implementation update](https://github.com/webdriverio/webdriverio/pull/14319#issuecomment-2755927934), and erwinheitzman [approved](https://github.com/webdriverio/webdriverio/pull/14319#pullrequestreview-2720335671).

[Final code](https://github.com/webdriverio/webdriverio/blob/696438b35684878b49c82d7b7d250a13ac6b0cee/packages/webdriverio/src/utils/index.ts):

```ts
/**
* Temporary patch for https://github.com/mozilla/geckodriver/issues/2223
*/
function returnUniqueNodes(nodes: ExtendedElementReference[]): ExtendedElementReference[] {
    const ids = new Set()
    return nodes.filter((node) => !ids.has(node[ELEMENT_KEY]) && ids.add(node[ELEMENT_KEY]))
}
```

Original extraction attempt used JSON serialization/parse; [reviewer requested filtering element IDs directly](https://github.com/webdriverio/webdriverio/pull/14319#discussion_r2015097799), implemented above. That exact historical attempt was not recovered as a separate commit here (PR history was squashed to one commit), so the cited review establishes attempted strategy, not an exact original-code snapshot. Analyst/researcher may have recovered the raw inline hunk.

Narrow lesson: preserve verified upstream bug links/revisit rationale that maintainers explicitly require in code. Final chat prose is not a durable substitute for explaining why a workaround exists. This is a needed adjustment to current universal “do not add comments” policy if the user wants upstream-informed behavior.

[#12430](https://github.com/webdriverio/webdriverio/pull/12430) merged at [af6b6b6f6b4022bfb8654ca51c2e5ca3770240d1](https://github.com/webdriverio/webdriverio/commit/af6b6b6f6b4022bfb8654ca51c2e5ca3770240d1). Maintainer [requested explanation of default merge duplication](https://github.com/webdriverio/webdriverio/pull/12430#discussion_r1528842046). [Final parser](https://github.com/webdriverio/webdriverio/blob/8e308265643c5db44b06e7284f12a97065820576/packages/wdio-config/src/node/ConfigParser.ts) retains:

```ts
const MERGE_DUPLICATION = ['services', 'reporters'] as const
...
/**
 * Add deepmergeCustom to remove array('services', 'reporters', 'capabilities') duplication in the config object
 */
const customDeepMerge = deepmergeCustom({
    ...
})
```

The requested rationale supports a narrow exception, but final comment still narrates the helper and names capabilities absent from final MERGE_DUPLICATION. Preserve durable correct rationale, not stale narrative. The [maintainer's tests-stay-green-under-deletion report](https://github.com/webdriverio/webdriverio/pull/12430#pullrequestreview-1970840543) is strong evidence for existing regression-test policy and for checking merged code rather than descriptions.

## Corrections / exclusions

- #5992 getPuppeteer suggestion [r506951336](https://github.com/webdriverio/webdriverio/pull/5992#discussion_r506951336) and author question [r510468071](https://github.com/webdriverio/webdriverio/pull/5992#discussion_r510468071): [final source](https://github.com/webdriverio/webdriverio/blob/560dd81ea91c6bd3c669b849ad6a9fc94e3f89e0/packages/webdriverio/src/commands/browser/getPuppeteer.ts) **implements** it. Reject “author rejected optional chaining for readability.”
- #5992 debug process.send [author rationale](https://github.com/webdriverio/webdriverio/pull/5992#discussion_r515075107): [final debug.ts](https://github.com/webdriverio/webdriverio/blob/560dd81ea91c6bd3c669b849ad6a9fc94e3f89e0/packages/webdriverio/src/commands/browser/debug.ts) keeps `!process.env.WDIO_WORKER || typeof process.send !== 'function'`, and another guard inside async REPL callback. This supports existing real-runtime-boundary/changed-lifetime cautions, not a new general optional-chaining rule.
- #15310 theoretical mixed-arity fallback [reviewer suggestion](https://github.com/webdriverio/webdriverio/pull/15310#discussion_r3420384908) is [explicitly rejected by author](https://github.com/webdriverio/webdriverio/pull/15310#discussion_r3421466759); [final wrapper](https://github.com/webdriverio/webdriverio/blob/e72d7ec2a6a793839500556d8eda2a4f80b43b9a/packages/wdio-utils/src/test-framework/testFnWrapper.ts) reuses identity and live context without speculative fallback. The author says all current framework callbacks are stable two-tuples. **Same callback alone does not prove stable arity**; generalizing requires tracing actual callbacks. I did not enumerate every framework callback here.
- #15310 author first defended FIFO and 20-second disabled-hook timeout floor, then [removed floor as unrelated scope](https://github.com/webdriverio/webdriverio/pull/15310#discussion_r3438343338) and [removed FIFO because snapshot already fixes identity](https://github.com/webdriverio/webdriverio/pull/15310#discussion_r3438345321). Do not promote superseded rationale. These are author admissions plus final diff, not repository-wide style rules.
- #3586 and #14544/#15723 were suggested by teammates but not independently fetched in this critic pass; excluded from my evidence claims.

## Confidence and transfer limits

High confidence: #8156/#8456 package isolation intent and final mock/call assertion; #15221 initial logging deletion and final approved helpers/tests; #14319 explicitly required bug-link rationale; #5992 optional-chain rejection claim is false. High confidence in acceptance, moderate behavioral confidence: #15331 isolation was merged and explicitly approved, but no new tests were in its diff and none were run here. High confidence in retained boundary ordering: #10183 repeated credentials checks around restoration and catch preserving the subsequent session-URL path. Moderate transfer confidence: BrowserStack-specific best-effort handling cannot establish all WebdriverIO errors should be swallowed. Moderate confidence: #15310 tuple-shape claim is author-backed and final code verified; every framework callback was not traced.

The proposed removal of net-line scoring from lazy-review/audit was not directly audited in this pass. #15221 does show that an expressly approved complete fix adds helpers and tests after a much shorter proposal deleted required behavior. That supports correctness/contract preservation over line count, but it does not independently prove a particular replacement complexity metric or score formula.

## Sampling and coverage record

GitHub `search_prs` repository selector `webdriverio/webdriverio`; `sort=comments`, `topn=20`, default order. Queries below are keyword screens, not comprehensive repository coverage. Search matches title/body, not every review comment. Search results normalize some state fields to null; merged outcome was verified via `fetch_pr` for deep-reviewed cases.

| Query | Returned hits | Screening |
| --- | ---: | --- |
| `is:merged simplify` | 20 | Titles screened; code/discussion traced only for selected followups. |
| `is:merged refactor` | 20 | Same. |
| `is:merged "error handling"` | 20 | Same. |
| `is:merged defensive` | 5 | Same. |

65 hits, 62 unique search candidates. Followups from teammates added #5992, #15221, #8156/#8456, #14319, #12430. Nine PRs had independently fetched metadata/diff/discussions: #5992, #15221, #10183, #15331, #15310, #8156, #8456, #14319, #12430. Exact head files/commits were checked for useful claims above. Other candidates remain **screened only**, not reviewed/accepted/rejected evidence.

| Screened PR | Title | Query numbers | Outcome of this critic pass |
| --- | --- | --- | --- |
| [#4210](https://github.com/webdriverio/webdriverio/pull/4210) | Allow to choose between WebDriver and Chrome DevTools Protocol as automation backend | 1 | Title screen only; no evidence claim |
| [#11906](https://github.com/webdriverio/webdriverio/pull/11906) | (docs): add documentation on visual testing | 1 | Title screen only; no evidence claim |
| [#7720](https://github.com/webdriverio/webdriverio/pull/7720) | Fix for bug #7640  run is not working when project already has a misconfigured tsconfig.json | 1 | Title screen only; no evidence claim |
| [#11992](https://github.com/webdriverio/webdriverio/pull/11992) | feat(wdio-prefix): introduce `wdio:{maxInstances,specs,exclude}` to WebdriverIO.Capabilities | 1 | Title screen only; no evidence claim |
| [#5390](https://github.com/webdriverio/webdriverio/pull/5390) | Fix browser version in spec reporter | 1 | Title screen only; no evidence claim |
| [#11771](https://github.com/webdriverio/webdriverio/pull/11771) | Fix filtering test specs by part of their name using CLI --spec arg | 1 | Title screen only; no evidence claim |
| [#14932](https://github.com/webdriverio/webdriverio/pull/14932) | feat:add start appium inspector from the cli | 1, 3 | Title screen only; no evidence claim |
| [#3467](https://github.com/webdriverio/webdriverio/pull/3467) | set logLevel per logger and disable driver logger | 1 | Title screen only; no evidence claim |
| [#4010](https://github.com/webdriverio/webdriverio/pull/4010) | introduce 'install' command to wdio-cli | 1 | Title screen only; no evidence claim |
| [#122](https://github.com/webdriverio/webdriverio/pull/122) | Implemented small selector API for better element querying | 1 | Title screen only; no evidence claim |
| [#14581](https://github.com/webdriverio/webdriverio/pull/14581) | fix: Emit browser custom command `beforeCommand` to fix broken reports | 1 | Title screen only; no evidence claim |
| [#9013](https://github.com/webdriverio/webdriverio/pull/9013) | Fix exclude pattern when --spec is passed via cli | 1 | Title screen only; no evidence claim |
| [#3536](https://github.com/webdriverio/webdriverio/pull/3536) | wdio-allure-reporter: capture before each and all hooks | 1 | Title screen only; no evidence claim |
| [#8595](https://github.com/webdriverio/webdriverio/pull/8595) | WebDriver Action Interface | 1 | Title screen only; no evidence claim |
| [#4576](https://github.com/webdriverio/webdriverio/pull/4576) | Wdio config yes | 1 | Title screen only; no evidence claim |
| [#6954](https://github.com/webdriverio/webdriverio/pull/6954) | Implement new async API | 1 | Title screen only; no evidence claim |
| [#137](https://github.com/webdriverio/webdriverio/pull/137) | event handling in WebdriverJS | 1 | Title screen only; no evidence claim |
| [#11570](https://github.com/webdriverio/webdriverio/pull/11570) | Adding ability to get pseudo-elements css value via getCSSProperty #7709 | 1 | Title screen only; no evidence claim |
| [#4065](https://github.com/webdriverio/webdriverio/pull/4065) | Simplify special keys in add/set value commands | 1 | Title screen only; no evidence claim |
| [#11368](https://github.com/webdriverio/webdriverio/pull/11368) | WebdriverIO project generator for Serenity/JS | 1 | Title screen only; no evidence claim |
| [#11865](https://github.com/webdriverio/webdriverio/pull/11865) | Wdio Percy Support v8 | 2 | Title screen only; no evidence claim |
| [#6085](https://github.com/webdriverio/webdriverio/pull/6085) | Tracking doc: rewrite `@wdio/allure-reporter` package into Typescript | 2 | Title screen only; no evidence claim |
| [#6368](https://github.com/webdriverio/webdriverio/pull/6368) | Add tsNodeOpts to enable configuring auto loaded ts-node | 2 | Title screen only; no evidence claim |
| [#15471](https://github.com/webdriverio/webdriverio/pull/15471) | feat: Expect's multi-element `$$()` support | 2 | Title screen only; no evidence claim |
| [#6149](https://github.com/webdriverio/webdriverio/pull/6149) | WIP refactor: rewrite `wdio-appium-service` src to TypeScript | 2 | Title screen only; no evidence claim |
| [#12392](https://github.com/webdriverio/webdriverio/pull/12392) | [browserstack-service] Add Funnel Data instrumentation [v8] | 2 | Title screen only; no evidence claim |
| [#15856](https://github.com/webdriverio/webdriverio/pull/15856) | fix(webdriverio): route commands to their held browsing context, url() returns a context, frame() queries | 2 | Title screen only; no evidence claim |
| [#15088](https://github.com/webdriverio/webdriverio/pull/15088) | feat: native headless Wayland (weston) support | 2 | Title screen only; no evidence claim |
| [#6606](https://github.com/webdriverio/webdriverio/pull/6606) | webdriverio: fix setvalue typings | 2 | Title screen only; no evidence claim |
| [#11942](https://github.com/webdriverio/webdriverio/pull/11942) | V9 migrate from got to fetch | 2 | Title screen only; no evidence claim |
| [#3778](https://github.com/webdriverio/webdriverio/pull/3778) | webdriverio: refactor find-strategy method | 2 | Title screen only; no evidence claim |
| [#3681](https://github.com/webdriverio/webdriverio/pull/3681) | webdriverio: middleware refactor | 2 | Title screen only; no evidence claim |
| [#4136](https://github.com/webdriverio/webdriverio/pull/4136) | Fix spawn declaration on Windows | 2 | Title screen only; no evidence claim |
| [#5999](https://github.com/webdriverio/webdriverio/pull/5999) | Refactor utils interception webdriver to typescript | 2 | Title screen only; no evidence claim |
| [#5957](https://github.com/webdriverio/webdriverio/pull/5957) | Refactor webdriverio utils interception index to TS | 2 | Title screen only; no evidence claim |
| [#15259](https://github.com/webdriverio/webdriverio/pull/15259) | [browserstack-service] Add Load Testing Service (LTS) support | 2, 4 | Title screen only; no evidence claim |
| [#9771](https://github.com/webdriverio/webdriverio/pull/9771) | #9539 Support various configurations of CJS/ESM with(out) TS | 2 | Title screen only; no evidence claim |
| [#6023](https://github.com/webdriverio/webdriverio/pull/6023) | Webdriverio refactor some lower hanging fruits in webdriverio to TS | 2 | Title screen only; no evidence claim |
| [#13437](https://github.com/webdriverio/webdriverio/pull/13437) | Browserstack Turboscale Observability Integration | 2 | Title screen only; no evidence claim |
| [#15824](https://github.com/webdriverio/webdriverio/pull/15824) | feat: drive browser.emulate() from the BiDi emulation module | 2 | Title screen only; no evidence claim |
| [#10183](https://github.com/webdriverio/webdriverio/pull/10183) | Error handling for Observability code in browserstack service | 3 | Deep-reviewed above |
| [#1441](https://github.com/webdriverio/webdriverio/pull/1441) | screenshotOnReject: Ability to extend error with current page screenshot | 3 | Title screen only; no evidence claim |
| [#15310](https://github.com/webdriverio/webdriverio/pull/15310) | fix(wdio-utils): finish the correct test/hook when a mocha test or hook times out | 3, 4 | Deep-reviewed above |
| [#3601](https://github.com/webdriverio/webdriverio/pull/3601) | webdriverio: isDisplayed() change for browsers without the endpoint | 3 | Title screen only; no evidence claim |
| [#15246](https://github.com/webdriverio/webdriverio/pull/15246) | fix: resolve etxtbsy issue(file busy error) at spawn | 3 | Title screen only; no evidence claim |
| [#2283](https://github.com/webdriverio/webdriverio/pull/2283) | Capture stacktrace after message modifying in ErrorHandler | 3 | Title screen only; no evidence claim |
| [#15141](https://github.com/webdriverio/webdriverio/pull/15141) | fix(appium): rename deprecated Appium protocol commands for Appium 3 compatibility | 3 | Title screen only; no evidence claim |
| [#15868](https://github.com/webdriverio/webdriverio/pull/15868) | fix(webdriverio): follow the WebDriver spec for elements of other browsing contexts | 3 | Title screen only; no evidence claim |
| [#969](https://github.com/webdriverio/webdriverio/pull/969) | Onerror hook (includes staleElementRetry) | 3 | Title screen only; no evidence claim |
| [#15738](https://github.com/webdriverio/webdriverio/pull/15738) | fix(webdriverio): avoid blocked Firefox mock responses | 3 | Title screen only; no evidence claim |
| [#15582](https://github.com/webdriverio/webdriverio/pull/15582) | fix(wdio-sumologic-reporter): Throw on http status different than ok | 3 | Title screen only; no evidence claim |
| [#2497](https://github.com/webdriverio/webdriverio/pull/2497) | Fix for error handling on before/after hooks | 3 | Title screen only; no evidence claim |
| [#14022](https://github.com/webdriverio/webdriverio/pull/14022) | fix: Close appium server onComplete completly | 3 | Title screen only; no evidence claim |
| [#762](https://github.com/webdriverio/webdriverio/pull/762) | 404 on isExisting callback should be handled and same as element not found | 3 | Title screen only; no evidence claim |
| [#15629](https://github.com/webdriverio/webdriverio/pull/15629) | fix(webdriverio): apply throttleNetwork conditions to service workers | 3 | Title screen only; no evidence claim |
| [#15461](https://github.com/webdriverio/webdriverio/pull/15461) | fix(webdriver): make WebDriver Bidi response timeout configurable | 3 | Title screen only; no evidence claim |
| [#15684](https://github.com/webdriverio/webdriverio/pull/15684) | breaking(webdriverio): make `$` strict and throw on multiple matches | 3 | Title screen only; no evidence claim |
| [#3559](https://github.com/webdriverio/webdriverio/pull/3559) | webdriver: unhandled promise rejection | 3 | Title screen only; no evidence claim |
| [#15614](https://github.com/webdriverio/webdriverio/pull/15614) | feat(webdriverio): add acceptDialog and dismissDialog for mobile permission dialogs | 3 | Title screen only; no evidence claim |
| [#15235](https://github.com/webdriverio/webdriverio/pull/15235) | feat(create-wdio): migrate to @wdio/electron-service and add Tauri service | 4 | Title screen only; no evidence claim |
| [#15331](https://github.com/webdriverio/webdriverio/pull/15331) | fix(@wdio/browserstack-service): isolate per-batch failures in the request queue | 4 | Deep-reviewed above |
| [#15231](https://github.com/webdriverio/webdriverio/pull/15231) | Sdk 5540 test plan | 4 | Title screen only; no evidence claim |

No test suite audit completeness claim. No WDIO runtime was installed or run by this reviewer; this report uses review/commit/code evidence plus clearly labeled fault reasoning. No source-checker scan is claimed: only Markdown was written by this reviewer. Final outcomes are retrieved as of 2026-10-09.
