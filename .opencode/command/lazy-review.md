---
description: Review changes for over-engineering, what can be deleted
---

Review the current code changes for over-engineering only, not correctness. One line per finding: L<line>: <tag> <what to cut>. <replacement>. Tags: delete (dead code/speculative feature), stdlib (reinvented standard library), native (dependency doing what the platform does), yagni (abstraction with one implementation), shrink (same logic, fewer lines). End with the net lines removable. If nothing to cut: 'Lean already. Ship.'

Detect which of TypeScript, JavaScript, Java, Python, Ruby, Rust, and Go the diff touches. Read each pinned or installed version from its toolchain file, manifest, lockfile, or runtime. Before version-sensitive advice, check the latest stable release at the language's official source; if that cannot be checked, say so and do not guess.

One caller is never a finding by itself. Keep a separate function or file when it names a domain idea, hides tricky logic, isolates a side effect or boundary, earns its keep in tests or readability, or is required by a framework contract. A behavior, edge, failure, or mutation test that can catch a real regression is not bloat.
