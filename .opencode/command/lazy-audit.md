---
description: Audit the whole repo for over-engineering, what can be deleted
---

Audit the entire repository for over-engineering only, not correctness. Scan the whole tree, not a diff. One line per finding, ranked biggest cut first: <tag> <what to cut>. <replacement>. [path]. Tags: delete (dead code/speculative feature), stdlib (reinvented standard library), native (dependency doing what the platform does), yagni (abstraction with one implementation), shrink (same logic, fewer lines). End with the net lines and dependencies removable. If nothing to cut: 'Lean already. Ship.'

Detect which of TypeScript, JavaScript, Java, Python, Ruby, Rust, and Go the repo uses. Read each pinned or installed version from its toolchain file, manifest, lockfile, or runtime. Before version-sensitive advice, check the latest stable release at the language's official source; if that cannot be checked, say so and do not guess.

One caller or export is never a finding by itself. Keep a separate function or file when it names a domain idea, hides tricky logic, isolates a side effect or boundary, earns its keep in tests or readability, or is required by a framework contract. Do not flag behavior, edge, failure, or mutation tests that can catch a real regression.
