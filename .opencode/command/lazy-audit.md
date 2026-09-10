---
description: Audit the whole repo for over-engineering, what can be deleted
---

Audit the entire repository for over-engineering only, not correctness. Scan the whole tree, not a diff. Rank useful simplifications first; do not cut required behavior merely to reduce lines. One line per finding: <tag> <what to cut>. <replacement that preserves requested behavior>. [path]. Tags: delete (dead code/speculative feature), stdlib (reinvented standard library), native (dependency doing what the platform does), yagni (needless single-use abstraction/config), shrink (same logic, fewer lines). Remove only orphans created by this task; mention unrelated dead code. Every proposed simplification must preserve behavior; a separate correctness/security audit is not this pass. End with net lines/dependencies removable, or `net: unchanged`. If nothing to cut: 'Lean already. Ship.'

Detect which of TypeScript, JavaScript, Java, Python, Ruby, Rust, and Go the repo uses. Read each pinned or installed version from its toolchain file, manifest, lockfile, or runtime and keep replacements compatible. If a needed version fact cannot be checked, say so and do not guess; check the latest release only when the user asks for current-version advice.

One caller or export is never a finding by itself. Keep a separate function or file when it names a domain idea, hides tricky logic, isolates a side effect or boundary, earns its keep in tests or readability, or is required by a framework contract. Do not flag behavior, edge, or failure tests that can catch a real regression; keep meaningful mutation evidence when existing red-green checks do not already prove the risky behavior, and treat it as optional when they do.

One production implementation is not evidence of waste. Before removing a
boundary, check what external details and independent reasons for change its
callers would inherit. Keep useful consumer-owned contracts and narrow
capabilities; judge behavior and design separately.
