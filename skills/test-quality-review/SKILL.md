---
name: test-quality-review
description: Audit an entire test suite, or explicitly scoped recent tests, for pointless assertions, implementation coupling, and weak oracles. Report evidence for a separate fresh-context, tests-only fixer. Not for routine test execution.
---

# Test Quality Review

Assess what a test actually proves, not how many assertions it contains. This
agent reviews and reports only; it never edits tests or production code. When
fixes are requested, hand the report to a separate agent with fresh context.

## Establish suite coverage

With no narrower scope, inventory and review the entire test suite, not just a
PR or diff. Include unit, integration, end-to-end, and generated or parameterized
cases where present. Inspect the test configuration so filenames alone do not
define the suite. Exclude dependencies, build copies, and vendored suites unless
requested, and report exclusions. Recent additions may be reviewed first, but
do not silently stop there or call a sample a whole-suite audit.

For an explicit recent-tests audit, establish the supplied base revision or date
and report the resulting scope. Inspect relevant older tests and production code
for context without turning a narrow request into unrelated cleanup. Do not
guess a recent-history cutoff: use an established session range, or ask for the
missing boundary when an explicit recent-only request cannot be resolved. A bare
invocation still defaults to the whole suite.

Maintain a compact per-suite/file record of reviewed, remaining, excluded, and
blocked scope. Large suites can be reviewed in bounded batches; carry that record
through handoffs. Do not claim completion while requested scope remains unread.
Reviewing a suite does not imply executing its full runner or installing tools.

## Read the oracle in context

Locate the relevant tests and read enough of their setup, exercised code, and
public or collaborator contract to understand the expected behavior. Follow the
workspace's retrieval instructions. Treat names and comments as claims to check,
not evidence that a behavior is covered.

For each suspect assertion, identify:

- What behavior or contract matters, and what code the test actually exercises.
- Where the actual value comes from and how the expected value was obtained.
- A plausible incorrect implementation that would still pass, or a legitimate
  implementation change that would fail without violating the contract.
- Whether another assertion in the test already checks the missing behavior.

Evaluate the whole test before labeling it valueless. Framework constructs such
as exception expectations, snapshots, fixture checks, and mock verification can
be oracles without a conventional assertion. Account for asynchronous execution
and whether the assertion runs at all.

## Recognize defects without pattern-based verdicts

**Tautology or setup-only check.** The assertion compares a value with itself,
checks a literal it just constructed, or verifies the fixture without involving
the subject. Explain why an incorrect subject cannot affect the result. An
arrangement check may aid diagnosis, but does not prove the subject's behavior.

**Mock echo.** A test configures a mock to return a value and asserts that same
value without testing meaningful behavior around it. Trace the path first:
returning a collaborator's result may itself be a required forwarding contract.
Arguments, routing, ordering, awaited completion, error propagation, and forbidden
calls can also be legitimate collaborator contracts. Do not condemn mocks or
interaction assertions categorically. When wiring matters, identify a fault
such as calling the wrong dependency or returning a constant, then check whether
the existing test would catch it.

**Private or source-structure coupling.** Tests depend on private helpers, internal
fields, source text, or incidental call order rather than a required outcome.
Show an allowed refactor they would reject. Distinguish this from intentional
structural requirements, such as an exported interface, generated artifact, or
prohibited dependency. Private access alone does not establish that a test has
no value; report coupling separately from behavioral coverage.

**Copied implementation oracle.** The expected result repeats the subject's
algorithm, branch logic, or uses the subject itself to compute its expected
answer, allowing a shared defect to pass. Identify the correlated fault, not just
similar syntax. A trusted independent reference, contract-derived table, or
specified shared constant is not automatically a copied oracle. Prefer a small
hand-derived example, an independent reference, or a property that rules out the
fault. Round trips and metamorphic properties can miss paired or common-mode
defects; state what they prove and what they leave open.

**Weak oracle.** Assertions such as truthiness, type, presence, length, or
no-exception may catch real regressions while missing the behavior named by the
test. Call them weak or incomplete when appropriate, not valueless. Identify a
wrong value or side effect that still satisfies the predicate. Recommend adding
the missing behavioral check while preserving useful smoke coverage.

## Preserve legitimate contracts

Public response schemas, serialization shape, types, nullability, and required
keys can be the behavior under test. Do not replace a schema check with an
unrelated value check or dismiss it as implementation detail. Separate schema
coverage from semantic correctness; recommend both only when the contract calls
for both. Exact comparisons and snapshots are useful when their expectations
represent a reviewed, stable contract, and brittle when they freeze incidental
details. Explain which applies using evidence.

Do not invent undocumented requirements to strengthen a test. If the intended
contract is unclear, qualify the finding and state the missing evidence. A test
can be redundant locally yet protect an independently important scenario; check
that scenario before proposing consolidation or removal.

## Report actionable evidence

Give each finding a location, the current assertion's actual guarantee, a concrete
counterexample or allowed-refactor rationale, and a keep, strengthen, replace, or
delete recommendation. Recommend deletion without replacement only when the
whole test protects no meaningful behavior. Preserve useful checks in a partly
pointless test rather than deleting the entire scenario.
Prioritize by the consequence of missed behavior, not syntax. Distinguish
demonstrated failures from reasoned counterexamples, and label uncertain findings.
If a test is genuinely valueless, explain why none of its checks depends on the
required behavior; do not infer that from one poor assertion.

Keep recommendations proportional. Prefer focused cases for the missing
behavior over blanket rewrites, more assertions for their own sake, or automatic
test deletion. Run relevant tests or isolated probes when useful and within the
authorized scope; production mutations and mutation-testing campaigns are not
part of a read-only review. Report exactly what ran and what remains unverified.

Apply these principles across languages, including Python's `assert`, unittest,
pytest, and mock expectations. Use tools compatible with the actual language and
framework. A TypeScript/JavaScript checker does not inspect Python tests; its
results cannot establish that Python assertions are sound. Automated matches
are review candidates, never a substitute for tracing the oracle and contract.

## Hand off without reviewer context

End with the suite coverage record and a consolidated, prioritized findings
report. Identify the tested revision/worktree, test names and locations, relevant
contracts and production entry points, evidence, uncertainty, and coverage to
retain. Make this self-contained: the fixer must not need the review transcript.

If the user asks to apply findings, start a separate fresh-context agent rather
than switching this reviewer into editing. Give it the report, repository/scope,
and [fixer instructions](references/fixer-handoff.md), not the reviewer's chat
history or the old benchmark results. Do not launch a fixer for a report-only
request. If clean-context delegation is unavailable, provide the handoff for a
new session instead of pretending the same context is fresh.
