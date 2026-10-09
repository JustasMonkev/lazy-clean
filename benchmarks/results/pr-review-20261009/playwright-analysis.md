# Playwright rule analysis — 2026-10-09

Analyst: independent reading and checker probes against lazy-clean base
`8f38b32bae676c300d03191c2668e4f0c1271544`. No checker or instruction implementation
edits were made by this analyst. This is purposive review evidence, not a measured
estimate of Playwright reviewer preferences or checker precision.

## Coverage and provenance

Read `AGENTS.md`, `skills/lazy/SKILL.md`, lazy-clean, slop-check, TS/JS,
design, risk, and upstream-update references. Targeted checker inspection covered
comment classification, empty catch/default-result handling, arbitrary sleeps,
module mocks, assertions, and explanation text.

Independently fetched metadata, all returned inline comments, reviews, and changed
file listings for five researcher-selected PRs through GitHub's public API:
#31727 (50 inline comments), #31842 (18), #34949 (24), #32156 (45), and #36059
(30). Counts were below the `per_page=100` page limit. Read full immutable raw
source for 13 selected final files. Also read researcher-collected complete
payloads for #29890, #37761, #34238, and #13644, and independently fetched seven
additional final files. Nineteen of those 20 files are TS/JS; the remaining file
is YAML. Selection deliberately includes requested simplifications, resisted
simplifications, test disputes, and two unmerged submissions. It is not random.

Public web search retrieved Playwright's contributor policy; `web_run` opens of
specific PRs returned `DisabledError`. Public API/raw GitHub through Python
`urllib` worked, so no browser session or authenticated GitHub connector was
needed. API/raw evidence was staged in scratch; the researcher's committed-result
candidate `playwright-evidence.json` retains source discussion payloads.

Checker runtime was Node `v24.19.0`. Read immutable upstream manifests for #34949
and #32156: both require Node `>=18`; TypeScript manifest ranges are `^5.8.2`
and `^5.5.3`, respectively. No upstream installation, exact installed compiler,
browser executable, or full Playwright test execution was available/attempted.

## Findings supported by discussion and final code

### 1. Preserve useful source constraints; remove narration selectively

In [#31842 r1694972534](https://github.com/microsoft/playwright/pull/31842#discussion_r1694972534),
the reviewer explicitly requested a comment explaining that list refresh must
precede running watched tests. The final merge
[`8412d973` uiModeView.tsx L326-L351](https://github.com/microsoft/playwright/blob/8412d973c03ecfce9c0dbabe0e3fec6d307cdc2d/packages/trace-viewer/src/ui/uiModeView.tsx#L326-L351)
retains comments at L330 and L348, with `await commandQueue.current` between them.
The words themselves partly narrate the code; the review supplies the important
ordering invariant. They are not proof every such comment is necessary.

A stronger final-source example is
[`33408551` utilityScriptSerializers.ts L99-L107](https://github.com/microsoft/playwright/blob/3340855109a24c4001a2a3deb6943d991e253d43/packages/playwright-core/src/server/isomorphic/utilityScriptSerializers.ts#L99-L107):
the Firefox Xray restriction explains an apparently surprising `toBase64` path.
The [discussion](https://github.com/microsoft/playwright/pull/34949#discussion_r1975237868)
links the restriction; a later
[scope decision](https://github.com/microsoft/playwright/pull/34949#discussion_r2007197358)
leaves Firefox-specific behavior in place. Putting that rationale only in a chat
final answer loses context for the next maintainer.

Playwright's [CONTRIBUTING.md](https://github.com/microsoft/playwright/blob/main/CONTRIBUTING.md?plain=1)
permits comments with an explicit readability purpose. Its current main version
is supplementary evidence, not proof of the policy at each historical PR.

**Current gap:** lazy/AGENTS/lazy-clean/slop-check categorically prohibit adding
code comments and move constraints to the final answer, although the scanner's
comment messages already tell the operator to verify ordering before deletion.
**Smallest useful change:** remove narration, signature restatement, edit notes,
and filler; permit concise local comments for non-obvious ordering, cross-runtime
constraints, necessary deliberate error handling, or contract limitations. Do
not require a comment on every assertion or permit checker-silencing markers.
Evidence strength: high for the blanket ban being too broad; medium for the exact
comment wording one should retain.

### 2. Test the contract, including selection and forbidden extra work

[#31727 r1688188588](https://github.com/microsoft/playwright/pull/31727#discussion_r1688188588)
and [r1688191734](https://github.com/microsoft/playwright/pull/31727#discussion_r1688191734)
request an unrelated file as a negative control. The author's
[responses](https://github.com/microsoft/playwright/pull/31727#discussion_r1688231927)
identify the final commit. Final
[`f23d02a2` only-changed.spec.ts](https://github.com/microsoft/playwright/blob/f23d02a2116947369ff6206f9c73050dd36fe95c/tests/playwright-test/only-changed.spec.ts#L119-L168)
asserts that dependent `a`/`b` tests run and independent `c` does not. A test with
only affected files could pass an implementation that runs everything.

The same PR uses a reusable git fixture, while review asks that scenario-specific
file writes and commits remain visible inside each test:
[fixture reuse](https://github.com/microsoft/playwright/pull/31727#discussion_r1685795640),
[visible variation](https://github.com/microsoft/playwright/pull/31727#discussion_r1685795872),
[author response](https://github.com/microsoft/playwright/pull/31727#discussion_r1686450676).
This is focused shared setup, not maximum factoring.

In #31842, a reviewer initially questioned asserting exactly one file-change
event [r1694981901](https://github.com/microsoft/playwright/pull/31842#discussion_r1694981901).
The author explained that two watcher instances previously emitted duplicate
events [r1695100617](https://github.com/microsoft/playwright/pull/31842#discussion_r1695100617);
the reviewer accepted it [r1695123880](https://github.com/microsoft/playwright/pull/31842#discussion_r1695123880).
Final
[`8412d973` test-server-connection.spec.ts L63-L77](https://github.com/microsoft/playwright/blob/8412d973c03ecfce9c0dbabe0e3fec6d307cdc2d/tests/playwright-test/test-server-connection.spec.ts#L63-L77)
retains the cardinality and exact event assertion. A distinct reporter-message
sequence test was challenged as coupling to TeleEmitter internals
[r1695123624](https://github.com/microsoft/playwright/pull/31842#discussion_r1695123624),
replaced with STDIO interception
[r1695148652](https://github.com/microsoft/playwright/pull/31842#discussion_r1695148652),
and relaxed to `arrayContaining` in the
[final source](https://github.com/microsoft/playwright/blob/8412d973c03ecfce9c0dbabe0e3fec6d307cdc2d/tests/playwright-test/test-server-connection.spec.ts#L79-L97).

**Smallest useful change:** align the short lazy-clean/slop manual test guidance
with the already more precise test-quality-review skill: assert meaningful
behavior or contract interactions; preserve ordering/cardinality/absence when
they catch the named regression, and avoid exact unrelated internal sequences.
For a selection/filtering change, include an unaffected case. Do not add a generic
ban on call assertions, internal tests, exact counts, or mocks. Evidence strength:
high. Existing risk mapping substantially covers this already.

### 3. Useful boundaries and explicit methods can outweigh fewer lines

#32156 requested an explicit transport contract
[r1716946820](https://github.com/microsoft/playwright/pull/32156#discussion_r1716946820),
composition [r1716948134](https://github.com/microsoft/playwright/pull/32156#discussion_r1716948134),
and visible `send`/`close` methods because the implicit version impeded reading
[r1716951874](https://github.com/microsoft/playwright/pull/32156#discussion_r1716951874).
Final
[`201bad75` testServerConnection.ts L23-L63](https://github.com/microsoft/playwright/blob/201bad75d3c44334059da387a947bae68fa500e9/packages/playwright/src/isomorphic/testServerConnection.ts#L23-L63)
contains `TestServerTransport` plus explicit adapter methods. Final
[watchMode.ts L31-L62](https://github.com/microsoft/playwright/blob/201bad75d3c44334059da387a947bae68fa500e9/packages/playwright/src/runner/watchMode.ts#L31-L62)
also has explicit forwarding methods and an intentional no-op `onerror` to satisfy
the interchangeable contract.

#31842 retains a newly constructed `TestTree` despite a memoized tree elsewhere.
The [author's response](https://github.com/microsoft/playwright/pull/31842#discussion_r1695096158)
explains that React's next render is too late for the immediate updated model.
Final [L349-L350](https://github.com/microsoft/playwright/blob/8412d973c03ecfce9c0dbabe0e3fec6d307cdc2d/packages/trace-viewer/src/ui/uiModeView.tsx#L349-L350)
retains it. Deduplication without temporal reasoning would be wrong.

**Change:** no new rule. Current single-caller, design-boundary, lifetime, and
readability exceptions already cover these cases. A categorical 'one implementation
means delete interface' or 'two constructors mean reuse' rule would regress them.

### 4. Reuse must preserve runtime, callers, ownership, and units

#31727 reviewer proposed removing a repeated `cliOnlyChanged` operand
[r1688179577](https://github.com/microsoft/playwright/pull/31727#discussion_r1688179577).
The author corrected the assumed boolean type
[r1688208654](https://github.com/microsoft/playwright/pull/31727#discussion_r1688208654).
Final [tasks.ts L233-L238](https://github.com/microsoft/playwright/blob/f23d02a2116947369ff6206f9c73050dd36fe95c/packages/playwright/src/runner/tasks.ts#L233-L238)
passes the actual ref string to `detectChangedTests`. Reviewer confidence alone
did not establish redundancy.

#29890 questioned a helper as unused
[r1536045974](https://github.com/microsoft/playwright/pull/29890#discussion_r1536045974),
then acknowledged other-language consumers
[r1536144503](https://github.com/microsoft/playwright/pull/29890#discussion_r1536144503).
The author [retained it](https://github.com/microsoft/playwright/pull/29890#discussion_r1536225558).
Its six-case test table survived a proposed expansion into separate exact-message
cases because the [author](https://github.com/microsoft/playwright/pull/29890#discussion_r1559020593)
argued that the smaller table states the shared contract. Final
[`b2ded9fe` matchers.misc.spec.ts L28-L49](https://github.com/microsoft/playwright/blob/b2ded9fed1a66c13fb19a997808fb300219ec62c/tests/page/matchers.misc.spec.ts#L28-L49)
retains the table and covers positive/negative text and string/regex branches.
Neither reviewer-requested inlining nor maximum deduplication is universally right.

#34949 removed a Node-specific path in favor of `btoa`/`atob`
[review](https://github.com/microsoft/playwright/pull/34949#discussion_r1973604381),
[author experiment](https://github.com/microsoft/playwright/pull/34949#discussion_r1974957162),
and [final helper](https://github.com/microsoft/playwright/blob/3340855109a24c4001a2a3deb6943d991e253d43/packages/playwright-core/src/server/isomorphic/utilityScriptSerializers.ts#L99-L117).
But Firefox utility-world iteration constraints prevented treating every native
iteration option as interchangeable. Review also caught loss of view offset/length
[r1975173762](https://github.com/microsoft/playwright/pull/34949#discussion_r1975173762)
and required end-to-end protocol coverage
[r2012582813](https://github.com/microsoft/playwright/pull/34949#discussion_r2012582813).

**Counterexample to treating merge as correctness:** final merged
[protocol/serializers.ts L137](https://github.com/microsoft/playwright/blob/3340855109a24c4001a2a3deb6943d991e253d43/packages/playwright-core/src/protocol/serializers.ts#L135-L137)
uses `value.length` for Buffer's byte-count argument, despite
[r2014325396](https://github.com/microsoft/playwright/pull/34949#discussion_r2014325396)
specifying `byteLength`. Final [L61-L62](https://github.com/microsoft/playwright/blob/3340855109a24c4001a2a3deb6943d991e253d43/packages/playwright-core/src/protocol/serializers.ts#L60-L63)
uses received byte length as typed-array element count. Native Node probes with
`[1,2,3]` show Uint16's outgoing Buffer has 3 bytes rather than 6; a base64 wire
roundtrip corrupts wider arrays. A direct same-memory view roundtrip misleadingly
returns the original values because it can read beyond the short view into the
original backing buffer. This is a reduced API-level reproduction, not execution
of Playwright's exact transport or full test suite. Exact merged tests
[L97-L118](https://github.com/microsoft/playwright/blob/3340855109a24c4001a2a3deb6943d991e253d43/tests/page/page-evaluate.spec.ts#L97-L118)
do contain wide typed arrays; their presence is not proof they were run successfully
against these final bytes.

**Change:** current caller/lifetime/native-replacement rules largely suffice.
If reuse wording is shortened, retain equivalence checks for ownership, view
offsets, byte versus element units, and actual supported runtimes. No new lexical
rule is justified by one buffer site. Evidence strength: high for byte truncation
in the reduced API probe; limited for complete upstream execution outcome.

### 5. Defensive checks: trust boundary, scope, and evidence first

#37761 reviewer said validation and defensive rendering should not both define an
unclear contract [r2426348550](https://github.com/microsoft/playwright/pull/37761#discussion_r2426348550).
The author responded that saved trace input is a fresh external boundary
[r2426399089](https://github.com/microsoft/playwright/pull/37761#discussion_r2426399089).
Final unmerged head
[`de868aa4` annotationsTab.tsx](https://github.com/microsoft/playwright/blob/de868aa4a58b6b51c467b4b4d13b99d2f8998f99/packages/trace-viewer/src/ui/annotationsTab.tsx)
has removed those rendering guards; final
[util.ts L423-L455](https://github.com/microsoft/playwright/blob/de868aa4a58b6b51c467b4b4d13b99d2f8998f99/packages/playwright/src/util.ts#L423-L455)
still adds bespoke validation. The eventual closure
[comment](https://github.com/microsoft/playwright/pull/37761#issuecomment-3428639288)
objects to isolated ad hoc validation among many user-object contracts, and suggests
a coherent schema approach. Earlier closure cited missing issue/repro, followed
by an [acknowledged misunderstanding](https://github.com/microsoft/playwright/pull/37761#issuecomment-3427450093).
Do not summarize this as 'defensive checks are bad' or require a new schema dependency.

#36059's reviewer proposed DOM-native iframe focus detection
[r2114783266](https://github.com/microsoft/playwright/pull/36059#discussion_r2114783266).
Copilot repeatedly claimed changes the reviewer still did not see
[r2114877769](https://github.com/microsoft/playwright/pull/36059#discussion_r2114877769).
Final unmerged head
[`cfb46a7b` ariaSnapshot.ts L167](https://github.com/microsoft/playwright/blob/cfb46a7b72926874a3850dc5c0cdda915e716547/packages/injected/src/ariaSnapshot.ts#L167)
does simplify detection to `element.ownerDocument.activeElement === element`.
The final JavaScript code generator still strips `[active]` strings
[L123-L124](https://github.com/microsoft/playwright/blob/cfb46a7b72926874a3850dc5c0cdda915e716547/packages/playwright-core/src/server/codegen/javascript.ts#L123-L124).
It was not merged; a bot's 'fixed' response is not verification. Current diff-first
and preservation instructions already address this.

## Checker probes and limits

`playwright-analysis-source-manifest.json` records SHA-256 hashes for the 20
independently fetched raw source files. `playwright-typed-array-probe.json` records
the reduced native wire-versus-shared-memory result; it explicitly marks exact
upstream execution false.

`playwright-analysis-probes.json` records all twelve reduced sources and findings
plus nineteen exact whole-file scans. Whole-file totals: 199 findings, largely
existing `any`, assertions, and test suppression directives. These totals include
pre-existing lines and are **not** PR-diff finding counts or false-positive rates.
Reduced fixtures are explicitly separate from exact upstream scans.

| Reduced probe | Current result | Interpretation |
|---|---|---|
| Causal `First, update... because...` comment | `no-narration-comments` | Retain if invariant matters; current skill ban is the stronger problem. Exact #31842 wording receives no comment flag. |
| Prompt cancellation sentinel with `.catch` | No finding | Legitimate distinguishable failure outcome; block-catch matcher does not cover arrow-result form. |
| Navigation-trigger timer plus `.catch(() => {})` | No finding | Exact #29890 test also scans without this warning. Empty promise-callback catches are outside current empty-catch pattern. |
| Exact event cardinality | No finding | Manual contract judgment required; count can be the regression oracle. |
| Six-case style test loop | No finding | Useful branch coverage, no reason to force inlining. |
| Explicit transport interface/forwarders | No finding | Existing design exceptions are sufficient. |
| Typed-array wire snippet with `as any` | `no-any` | Does not detect byte/element error; clean typing would not prove wire behavior. |
| Best-effort empty block catch with reason above | `no-empty-catch` | Retained advisory finding; legacy support accepts qualifying comments inside the block. |
| Synthetic loader contract test using `jest.mock` | `no-module-mocking` | Message assumes bad design without tracing the boundary; not exact Playwright evidence. |
| Timing test observing noncompletion for 20 ms | `no-arbitrary-sleep` | Potential legitimate delay when elapsed-time behavior is the test contract. A reduced counterexample, not a recommended test template. |
| Empty file-change guard | No finding | Preserve real empty-event behavior. |
| Same-boundary impossible typed-array guard | No finding | Defensive impossibility is currently a manual rule; lexical detection lacks runtime evidence. |

Do not expand sleep/catch detectors from this study alone: stronger pattern
coverage is not automatically better when an equivalent `.catch` is legitimate
cancellation/cleanup policy. Do not mechanically exempt all tests or all comments.

## Proposed instruction changes, ranked

1. **High confidence:** replace blanket comment prohibition with purpose-based
   removal and narrow retention for local non-obvious constraints. Keep prohibition
   on adding checker-silencing markers and decorative/obsolete narrative.
2. **High confidence:** align short test-slop summaries with existing
   test-quality-review contract-oracle guidance; selection changes need an
   unaffected case. Preserve interaction/count assertions that catch actual bugs.
3. **Medium confidence:** make module-mocking message and explanation a review
   prompt. Ask whether the mock hides behavior or verifies a real loader/consumer
   contract before demanding dependency injection. This is a synthetic
   counterexample plus broader test-oracle evidence, not a Playwright mock dispute.
4. **Medium confidence, optional:** explicitly include elapsed-time/noncompletion
   testing in sleep exceptions. Keep assertion-based or event-based waits when
   they prove the intended behavior. Current minimum-delay exception partly covers
   this already.
5. **No expansion needed:** single-caller interfaces, native reuse, failed-run
   evidence, trust-boundary guards, ownership, and risky deletion are already
   substantially protected. Keep these qualifications when deduplicating wording.

No broad checker matcher addition, mandatory dependency, exhaustive mutation gate,
universal test inlining, or 'merged equals correct' benchmark label is supported.
No upstream tests or candidate instruction benchmark were executed by this analyst.
The final repository-root checker command
`node skills/slop-check/scripts/check.mjs --since=8f38b32bae676c300d03191c2668e4f0c1271544 --json`
returned `[]` and exit 0 while the parent's instruction/checker-message edits were
present. This verifies that observed changed TS/JS scope, not the upstream source
or overall PR behaviors.
