---
description: Review changes for over-engineering, what can be deleted
---

Review only the task-owned code changes for over-engineering, not correctness. Match existing style and report one line per finding: L<line>: <tag> <what to cut>. <replacement that preserves requested behavior>. Tags: delete (dead code/speculative feature), stdlib (reinvented standard library), native (dependency doing what the platform does), yagni (needless single-use abstraction/config), shrink (same logic, fewer lines). Remove only orphans created by this task; mention unrelated dead code. Every proposed simplification must preserve behavior; a separate correctness/security audit is not this pass. Do not force a net-negative feature change. End with net lines removable, or `net: unchanged`. If nothing to cut: 'Lean already. Ship.'

Detect which of TypeScript, JavaScript, Java, Python, Ruby, Rust, and Go the diff touches. Read each pinned or installed version from its toolchain file, manifest, lockfile, or runtime and keep replacements compatible. If a needed version fact cannot be checked, say so and do not guess; check the latest release only when the user asks for current-version advice.

One caller is never a finding by itself. Keep a separate function or file when it names a domain idea, hides tricky logic, isolates a side effect or boundary, earns its keep in tests or readability, or is required by a framework contract. Behavior, edge, and failure tests that catch a real regression are not bloat; keep meaningful mutation evidence when existing red-green checks do not already prove the risky behavior, and treat it as optional when they do.

One production implementation is not evidence of waste. Before removing a
boundary, check what external details and independent reasons for change its
callers would inherit. Keep useful consumer-owned contracts and narrow
capabilities; judge behavior and design separately.
