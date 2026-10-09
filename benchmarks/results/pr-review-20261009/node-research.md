# Node.js held-out review research

Date: 2026-10-09. Repository: `nodejs/node`. Frozen package: [rule-freeze.json](rule-freeze.json), base `8f38b32bae676c300d03191c2668e4f0c1271544`.

This is an independent, purposeful sample, not a random sample or an estimate of repository-wide precision. I read the checkout's AGENTS.md, frozen lazy/lazy-clean/lazy-review guidance, and TS/JS simplification reference; I did not read derivation reports or prior agents' research. Rules and implementation were not edited. Exact original review hunks, author replies, PR metadata, and approvals are retained in [node-evidence/research-source.json](node-evidence/research-source.json); [exact source excerpts](node-evidence/source-excerpts.json) and [immutable refs/blob IDs/content hashes](node-evidence/snapshot-provenance.json) accompany it. Full upstream files were inspected and supplied for independent scans, then removed after the analyst preserved rerunnable data-only inputs. No Node.js code or tests were executed by this researcher. Test/benchmark results below are upstream reports or inspected test source, explicitly distinguished from execution here.

## Sampling and exclusions

GitHub connector issue search incorrectly returned zero merged PRs or ordinary issues despite `is:pr`; I did not treat that output as the universe. I used its approved read-only fetch for GitHub REST issue search instead, with these four queries, sorted by comment count, 15 results each:

- `repo:nodejs/node is:pr is:merged simplify`: 648 results.
- `repo:nodejs/node is:pr is:closed readability`: 688 results.
- `repo:nodejs/node is:pr is:merged reuse`: 362 results.
- `repo:nodejs/node is:pr is:merged unnecessary`: 700 results.

The leading results were large feature PRs, including #22712, #44004, #36328, #21128, #53725, #48740, #44943, #54630, #43525, #42675, #44731, and #12712. To avoid only sampling large feature discussions, I added `repo:nodejs/node is:pr is:merged simplify in:title`, sorted by updated date, 30 results (116 total). This surfaced #59700, #57144, #57110, #63032, #62651, #61192, #57338, #55543, and others.

Six discussions were screened in depth: #59700, #57144, #61871, #12712, #44943, and #57110. The five below were selected because exact inline hunks, substantive reasoning, and final code establish positive simplifications and counterexamples. #57110 was excluded from the core set: approvals and a missed benchmark-before-landing discussion were present, but no substantive inline reviewer/author exchange explained the comparator reduction. Large additions such as #22712/#44004/#36328 were not pursued because a smaller focused sample could establish review-to-code chronology more completely. Selection favors useful discussions; it cannot establish frequency, representativeness, or absence of contrary examples.

The normalized timeline endpoint returned all three types (issue comments, review comments, reviews). For original hunks I additionally fetched REST `pulls/N/comments` (100/page; two pages for #61871/#44943/#12712), rather than substituting final PR diff for original reviewed code. For #12712 the normalized timeline is complete but the retained raw-hunk pagination covers the selected early threads, not every later raw comment. Three old force-pushed/squashed original commits (#57144, #61871, #12712) returned 404 through both upstream and original-fork contents APIs. Their original code evidence is consequently the exact API review hunk, not a recovered whole tree. #44943 original full file and #59700 base full file were accessible.

## N1 — #59700: remove dead reporter flexibility, preserve the necessary error guard

PR: [test_runner: simplify logic, nix dead reporter code](https://github.com/nodejs/node/pull/59700). Author: vassudanagunta. Merged 2026-01-16. Base: `2ea31e53c61463727c002c2d862615081940f355`; final branch: `44ccad87f4d229a2cf3755affae1dc5e3fbbfba9`; landed: [e3071d52b6e8190d2158d7604161503a8b626b37](https://github.com/nodejs/node/commit/e3071d52b6e8190d2158d7604161503a8b626b37).

Before, `lib/internal/test_runner/reporter/utils.js`:

```js
function formatError(error, indent) {
  if (!error) return '';
  const err = error.code === 'ERR_TEST_FAILURE' ? error.cause : error;
  // formatting continues
}

function formatTestReport(type, data, prefix = '', indent = '',
                          hasChildren = false, showErrorDetails = true) {
  // title formatting
  const error = showErrorDetails ? formatError(data.details?.error, indent) : '';
  const err = hasChildren ?
    (!error || data.details?.error?.failureType === 'subtestsFailed' ? '' : `\n${error}`) :
    error;
  // result formatting
}
```

The [first commit d6a40ce](https://github.com/nodejs/node/commit/d6a40ce54ae1125cc758a9b838ecf84953b96755) explicitly reasons that `hasChildren` and `showErrorDetails` are never both true. The [second adada91](https://github.com/nodejs/node/commit/adada91bfcc8ca09e4a39d6d622aa7c37674078e) moves the error check from `formatError` to its sole caller. The [fourth 44ccad8](https://github.com/nodejs/node/commit/44ccad87f4d229a2cf3755affae1dc5e3fbbfba9) removes the unused argument and describes the two actual operations: print tree lines without error details, or print errors. I inspected all eight files in the reporter directory at the base ref: spec.js has two calls, dot.js one; the six other files have no `formatTestReport` call. This supports the cited reporter-local caller claim; it is not a repository-wide code-search proof.

Exact changes to spec.js include:

```diff
- return `${formatTestReport(type, data, prefix, indentation, hasChildren, false)}\n`;
+ return `${formatTestReport(type, data, false, prefix, indentation)}\n`;
```

The dead `hasChildren` calculation and associated reported-stack shift were removed. The PR changes only two files, +4/-13, without introducing a replacement abstraction.

A non-blocking [review r2685312372 by pmarchini](https://github.com/nodejs/node/pull/59700#discussion_r2685312372), on original commit `44ccad87f4d229a2cf3755affae1dc5e3fbbfba9`, proposed:

```js
const err = showErrorDetails ? formatError(data.details.error, indent) : '';
```

The comment says `formatError` already checks the error and an extra invocation is negligible. However, the reviewed and final code had already removed that internal check. The final branch and landed code both retain:

```js
function formatError(error, indent) {
  const err = error.code === 'ERR_TEST_FAILURE' ? error.cause : error;
  // formatting continues
}
const err = showErrorDetails && data.details?.error ?
  formatError(data.details.error, indent) : '';
```

Thus the broad reduction landed, but the exact reviewer guard-removal suggestion did not. There is no author reply in the fetched timeline establishing deliberate rejection; do not infer an explanation from silence. [pmarchini's APPROVED review](https://github.com/nodejs/node/pull/59700#pullrequestreview-3654424169) accompanies the suggestion; MoLow, JakobJingleheimer, and gurgunday also explicitly approved. These are approvals of the PR, not evidence that this suggestion was applied. The branch/merge files differ due to intervening surrounding title behavior (`expectFailure`), but the studied error/argument reduction is identical.

Frozen applicability: useful positive case for caller tracing, task-owned orphan removal, and eliminating unused flexibility. Useful negative case for blindly accepting a reviewer micro-suggestion or removing an apparently repeated guard: actual error contract must be read. A cleaner diff does not establish correctness. Upstream author says each step passed tests; I did not run or independently authenticate those results.

## N2 — #57144: reuse the existing lookup seam to make an error test deterministic

PR: [test: simplify test-http2-client-promisify-connect-error](https://github.com/nodejs/node/pull/57144). Author: lpinca. Merged 2025-02-22. Base `8fc919d3cb29a9a4664260bafe8b213efa810271`; reviewed original `f68fd2bd8f06df2b40ef0d9b011366b7c3af5909`; final branch `42a53b87c600bd2f8e45e548de8fb1e0ded64126`; landed [ba8fbf34f46dab885cf4bf3602e784c063be2ef3](https://github.com/nodejs/node/commit/ba8fbf34f46dab885cf4bf3602e784c063be2ef3). Final branch and landed file match byte-for-byte.

Exact original review hunk shows this removed setup:

```js
const server = http2.createServer();

server.listen(0, common.mustCall(() => {
  const port = server.address().port;
  server.close(() => {
    const connect = util.promisify(http2.connect);
    connect(`http://localhost:${port}`)
      .then(common.mustNotCall('Promise should not be resolved'))
      .catch(common.mustCall((err) => {
        assert(err instanceof Error);
        assert.strictEqual(err.code, 'ECONNREFUSED');
      }));
  });
}));
```

The initial PR replacement used the existing `lookup` option, created an `Error` inside it, assigned `error.code = 'ENOTFOUND'`, and asserted `{ code: 'ENOTFOUND' }`. [Reviewer aduh95 r1963164451](https://github.com/nodejs/node/pull/57144#discussion_r1963164451) proposed moving a single error outside `lookup` and asserting that error directly. Final file:

```js
const connect = util.promisify(http2.connect);
const error = new Error('Unable to resolve hostname');

function lookup(hostname, options, callback) {
  callback(error);
}

assert.rejects(
  connect('http://hostname', { lookup }),
  error,
).then(common.mustCall());
```

The PR body and [final commit](https://github.com/nodejs/node/commit/42a53b87c600bd2f8e45e548de8fb1e0ded64126) explain why: an unrelated process could claim the just-closed port. The purpose is to verify rejection from promisified HTTP2 connection, not real TCP connection refusal. The helper earns its place as the existing platform's injectable lookup contract; removal of infrastructure preserves the behavior under test and removes nondeterministic ownership of a free port.

There is no explicit author text accepting the suggestion; exact final code demonstrates adoption. aduh95 [approved the original review](https://github.com/nodejs/node/pull/57144#pullrequestreview-2629417354), joyeecheung [approved](https://github.com/nodejs/node/pull/57144#pullrequestreview-2629779292), and aduh95 [approved again immediately before landing](https://github.com/nodejs/node/pull/57144#pullrequestreview-2634760411). [Issue comment](https://github.com/nodejs/node/pull/57144#issuecomment-2670828667) identifies dependency on #57135, and the reviewer requested waiting for it before CI. No CI status or test execution is claimed here.

Frozen applicability: reuse an existing seam and existing `assert.rejects`; avoid production injection solely to remove a test mock; preserve a meaningful failure assertion and `common.mustCall` completion evidence. This is not a license to replace tests whose requested subject is actual socket behavior. The final change is +11/-10, illustrating complexity reduction without a forced negative line count.

## N3 — #61871: a proposed one-line standard-library replacement is challenged and not applied

PR: [buffer: improve performance of multiple Buffer operations](https://github.com/nodejs/node/pull/61871). Author: thisalihassan. Merged 2026-03-27. Original review commit `3a8546e517b8969cbb6353c6ba0c2acf7b97d083`; final branch `85fb7f19b65dba546a3c41b2d37e5b5a3c9edcca`; landed [9e0dc8b4725e4052126edbc35bbc3be073bf5c01](https://github.com/nodejs/node/commit/9e0dc8b4725e4052126edbc35bbc3be073bf5c01). Final lib/buffer.js matches landed code byte-for-byte.

The exact hunk attached to [anonrig r2947536524](https://github.com/nodejs/node/pull/61871#discussion_r2947536524) reads:

```diff
 Buffer.prototype.toJSON = function toJSON() {
-  if (this.length > 0) {
-    const data = new Array(this.length);
-    for (let i = 0; i < this.length; ++i)
+  const len = this.length;
+  if (len > 0) {
+    const data = new Array(len);
+    for (let i = 0; i < len; ++i)
       data[i] = this[i];
```

Reviewer proposes “This can be simplified into a single line,” followed by:

```js
Array.from({ length: this.length }, (_, i) => this[i]);
```

[aduh95 r2947611843](https://github.com/nodejs/node/pull/61871#discussion_r2947611843) questions whether the classic loop is more performant. [anonrig r2969708449](https://github.com/nodejs/node/pull/61871#discussion_r2969708449) replies “I'm not sure anymore.” [Author r2969886201](https://github.com/nodejs/node/pull/61871#discussion_r2969886201) reports a quick benchmark with Claude, claiming Array.from 15–27x slower in the displayed rows. That comment does not supply a complete reproducer/runtime methodology; it is reported evidence, not a benchmark run or verified performance estimate here.

Final code:

```js
Buffer.prototype.toJSON = function toJSON() {
  const bufferLength = TypedArrayPrototypeGetLength(this);
  if (bufferLength > 0) {
    const data = new Array(bufferLength);
    for (let i = 0; i < bufferLength; ++i)
      data[i] = this[i];
    return { type: 'Buffer', data };
  }
  return { type: 'Buffer', data: [] };
};
```

The final named length and primordial getter were introduced by [7c8b68d “improve variable names and add Refs”](https://github.com/nodejs/node/commit/7c8b68d25f548bc8b3d7eeffb745d4b2e6ab1c68) and [85fb7f1 “used primordial getter for safety”](https://github.com/nodejs/node/commit/85fb7f19b65dba546a3c41b2d37e5b5a3c9edcca). This is retention of explicit iteration plus a readability/contract improvement, not adoption of the one-liner. [anonrig's final APPROVED review](https://github.com/nodejs/node/pull/61871#pullrequestreview-4021113079) and [aduh95's final approval](https://github.com/nodejs/node/pull/61871#pullrequestreview-4019924251) precede landing; Qard and jasnell also approved.

Additional useful contextual threads: [r2947530802](https://github.com/nodejs/node/pull/61871#discussion_r2947530802) requests readable variable names; [r2824124248](https://github.com/nodejs/node/pull/61871#discussion_r2824124248) and [r2824126829](https://github.com/nodejs/node/pull/61871#discussion_r2824126829) request comments explaining ASCII eligibility and the changed copy path. “Remove comments” would contradict those rationale requests. The toHex native path was separately reverted in [631ec7d](https://github.com/nodejs/node/commit/631ec7d21ceed7189df3e70a1123eab6f0f2601e), whose message favors the existing C++ path's newer implementation; this is secondary context, not a fully evaluated sixth case.

Frozen applicability: directly tests the ceiling on one-liners and stdlib reuse. Preserve required performance and primordial behavior, choose readable names, and retain why-comments. The exact Array.from suggestion is not an accepted simplification and must not be counted as a true positive.

## N4 — #12712: cut speculative API customization while keeping error/lifecycle helpers and tests

PR: [util: add util.callbackify()](https://github.com/nodejs/node/pull/12712). Author: refack. Merged 2017-06-11, final branch/landed [af3aa682ac534bb55765f5fef2755a88e5ff2580](https://github.com/nodejs/node/commit/af3aa682ac534bb55765f5fef2755a88e5ff2580). Exact original comment hunk is from `117aeb05b5406c3bd87fa4e985b2a2d2dd8e62cb`; that old full snapshot cannot now be recovered through the connector. Final branch and landed util.js match byte-for-byte.

The initial hunk defined custom callbackify, splat, and projection symbols and branches:

```js
const kCustomCallbackifyiedSymbol = Symbol('util.callbackify.custom');
const kCustomCallbackifyiedToSplat = Symbol('util.callbackify.toSplat');
const kCustomCallbackifyiedProject = Symbol('util.callbackify.project');
// ...
orig.call(this, ...args).then((ret) => {
  if (toSplat) {
    cb(null, ...ret);
  } else if (project) {
    const allThere = project.all((k) => k in ret);
    if (!allThere) {
      throw new TypeError('Not all of the projected properties' +
        'are present in the returned value: ' + inspect(ret));
    }
    const args = project.reduce((s, k) => s.concat(ret[k]), []);
    cb(null, ...args);
  } else {
    cb(null, ret);
  }
}, cb);
```

[not-an-aardvark issue comment 297895360](https://github.com/nodejs/node/pull/12712#issuecomment-297895360) argues that destructuring in user callbacks can already handle array/object values. [benjamingr r113932742](https://github.com/nodejs/node/pull/12712#discussion_r113932742), original `cdd0463dee80fe584cee49ec4ed79e3bd5aba0b2`, says the symmetry with promisify is unjustified: callback conventions vary for promisify, while returned promises have uniform conventions. [Author r113934904](https://github.com/nodejs/node/pull/12712#discussion_r113934904) explicitly responds, “Came to same conclusion. Gone in last commit.” The discussion continued through options proposals, so that reply alone is not proof of final simplification; final `callbackify(original)` has no options or symbols, confirming eventual outcome.

At the same time, [r113844782](https://github.com/nodejs/node/pull/12712#discussion_r113844782) identifies that rejecting with null would look like success in an error-first callback. [benjamingr r113942370](https://github.com/nodejs/node/pull/12712#discussion_r113942370) objects to changing rejection values; [not-an-aardvark r113944695](https://github.com/nodejs/node/pull/12712#discussion_r113944695) clarifies the callback success/error ambiguity. This challenge did not lead to removing the guard. Final code preserves a named helper and rationale:

```js
function callbackifyOnRejected(reason, cb) {
  // Because null is the callback's no-error value, falsy rejections are wrapped.
  // (This line paraphrases the original multi-line comment; see saved source.)
  if (!reason) {
    const newReason = new errors.Error('FALSY_VALUE_REJECTION');
    newReason.reason = reason;
    reason = newReason;
    Error.captureStackTrace(reason, callbackifyOnRejected);
  }
  return cb(reason);
}
```

Final callback scheduling preserves the original receiver/arguments and separates callback exceptions from promise lifecycle:

```js
const cb = (...args) => { Reflect.apply(maybeCb, this, args); };
Reflect.apply(original, this, args)
  .then((ret) => process.nextTick(cb, null, ret),
        (rej) => process.nextTick(callbackifyOnRejected, rej, cb));
```

[r113933560](https://github.com/nodejs/node/pull/12712#discussion_r113933560) explicitly requires nextTick for callback exceptions/domains. Final comments explain why no promise is returned and why nextTick remains (stack, uncaughtException, async_hooks); they are substantive constraints, not dispensable narration.

[Reviewer r120000142](https://github.com/nodejs/node/pull/12712#discussion_r120000142) asks for null wrapping, argument and receiver propagation, Symbol rejection, and retained reason metadata. [Author issue comment 306041880](https://github.com/nodejs/node/pull/12712#issuecomment-306041880) tracks each requested case and says the receiver test exposed a bug. Final test file enumerates null, undefined, false, 0, objects, Symbol, function, array, and Error across async functions, promise factories, and thenables; assertions check FALSY_VALUE_REJECTION and `err.reason` and receiver/arguments. Later tests also exercise callback exceptions. These are inspected tests, not tests run here. [TimothyGu's approval](https://github.com/nodejs/node/pull/12712#pullrequestreview-43295077) explicitly praises the comprehensive suite; [benjamingr's approval](https://github.com/nodejs/node/pull/12712#pullrequestreview-42051884) acknowledges the feedback was addressed, and four others approve.

Frozen applicability: positive speculative flexibility reduction; negative counterexample to deleting a one-caller error helper, nextTick sequencing, falsy handling, or comprehensive tests. The `!reason` guard is purposeful at a promise-to-callback boundary; generic “preserve false/0” guidance must be applied to the API's actual error convention, retaining the original reason as metadata. Generic Reflect.apply usage is not inherently bloat when it preserves the receiver and argument list.

## N5 — #44943: map-entry deletion and callback/promise differences are lifecycle contracts

PR: [diagnostics_channel: add tracing channel](https://github.com/nodejs/node/pull/44943). Author: Qard. Merged 2023-03-31. Full accessible original snapshot `6b38fcba5ab6c6fa9f42e63aaf388eab9c6111e4`; final branch `c23e772ccc19618493937fd2a6a7addf83267ade`; landed [fe751df537dc58eb1c14ef27192f935a89718007](https://github.com/nodejs/node/commit/fe751df537dc58eb1c14ef27192f935a89718007). Final diagnostics_channel.js matches landed file byte-for-byte.

Original [review hunk r1052479777](https://github.com/nodejs/node/pull/44943#discussion_r1052479777):

```js
function decRef(channel) {
  channel._weak.decRef();
  if (channel._weak.getRef() === 0) {
    delete channels[channel.name];
  }
}
```

RafaelGSS suggests assigning undefined instead to preserve object shapes/property-access performance. [Author r1055997830](https://github.com/nodejs/node/pull/44943#discussion_r1055997830) explains that a weak referent being collected does not collect the WeakReference container or table entry: unique channel names accumulate. He names `test-diagnostics-channel-memory-leak.js` and says it fails without deletion. The final data structure becomes SafeMap, preserving deletion:

```js
function decRef(channel) {
  if (channels.get(channel.name).decRef() === 0) {
    channels.delete(channel.name);
  }
}
```

The retained test subscribes/unsubscribes 1,000 unique names, invokes `global.gc()`, and checks used heap did not increase. This demonstrates the upstream's intended regression mechanism; no local execution or deterministic memory-performance guarantee is claimed. The earlier undefined suggestion was not adopted. [RafaelGSS subsequently approved](https://github.com/nodejs/node/pull/44943#pullrequestreview-1264428617); that is broad acceptance of the resulting PR, not acceptance of his original suggestion.

An additional substantive thread reinforces why look-alike paths must not be merged blindly. [r1092363057](https://github.com/nodejs/node/pull/44943#discussion_r1092363057) asks to restore async-start context. Author initially expands runStores to every tracing publication, then [9a1e79b](https://github.com/nodejs/node/commit/9a1e79b22119c8c2a0b036bb0bc39ca125037de1) narrows it to helpful places. [Flarna r1148873078](https://github.com/nodejs/node/pull/44943#discussion_r1148873078), original `66825e784f6edd9fff49f04f0818e52110f30ea0`, accepts callback asyncStart runStores but demands docs/tests because promise behavior differs. [Author issue comment 1490972498](https://github.com/nodejs/node/pull/44943#issuecomment-1490972498) explicitly says tests and docs were added.

Final callback test binds start to firstContext and asyncStart to secondContext, asserting the traced function sees the first and the callback sees the second; outside remains undefined. Final promise test asserts the original context before and after an await and outside undefined. [Flarna r1154159768](https://github.com/nodejs/node/pull/44943#discussion_r1154159768) further suggests a binding to prove asyncStart's transform is unused in the promise case, explicitly nonblocking. [Author r1154577798](https://github.com/nodejs/node/pull/44943#discussion_r1154577798) defers it to a follow-up; the final promise test does not contain that stronger negative check. [Flarna approves](https://github.com/nodejs/node/pull/44943#pullrequestreview-1366466682) with this known limitation. This is accepted completion with a specific optional follow-up, not evidence of exhaustive alternate-path coverage.

The earlier [r1053126325](https://github.com/nodejs/node/pull/44943#discussion_r1053126325)/[r1053821728](https://github.com/nodejs/node/pull/44943#discussion_r1053821728) thread suggests avoiding a bind by direct Reflect.apply when there are no stores. The final runStores does use ReflectApply and wrapStoreRun to compose store boundaries. This secondary observation supports reuse while preserving actual function execution; it is not scored as a separate fully traced case.

Frozen applicability: prove object/container lifetimes before deleting or replacing cleanup. Keep specialized callbacks, asynchronous context restoration, error publishing, and meaningful tests. A shared named helper can own behavior that must remain even with few callers. The stronger omitted negative promise test is a legitimate coverage limit, and should not be reported as already run or as proof that the current tests detect all mutations.

## Evidence-level conclusion

The five cases support bounded manual principles rather than automatic “fewer lines” decisions. Three main outcomes are positive reductions (unused reporter flexibility, test infrastructure, callbackify customization), while three exact reviewer proposals are counterexamples or incomplete outcomes (reporter guard removal, Array.from loop replacement, undefined instead of map-entry deletion). #44943 also records a specific deferred test improvement and a secondary direct-apply reduction. This report does not quantify checker precision, claim unchanged behavior across upstream trees, or claim every maintainer suggestion is correct. The analyst and critic received IDs/raw code before this synthesis so their judgments could be independent.

The repository is held out by the supplied freeze file; this report does not independently prove all prior training/derivation history. These observations must remain validation evidence unless a later explicitly versioned rule update is made; silently tuning the frozen rules against them would invalidate the holdout.
