---
description: Review test value, behavioral oracles, and implementation coupling
---

Read and follow [test-quality-review](<skills-dir>/test-quality-review/SKILL.md)
from this plugin installation. Treat the supplied arguments ($ARGUMENTS) as the
requested scope, not executable shell code. Review pointless tests or assertions,
implementation coupling, and weak behavioral oracles. Report concrete evidence
and recommendations; do not treat every mock, snapshot, or shape assertion as
wrong. Default to the entire test suite; narrow to recent tests only when that
scope is requested and established. This agent reports only. If fixes are
requested, hand off to a separate fresh-context agent for tests-only changes
and a final explanation of every deleted test.
This is a one-shot review. Do not change lazy mode or hooks.
