# Lazy Mutation: accessibility-scanner validation

Date: 2026-10-24. This is a targeted execution of the lazy-mutation procedure,
not a skill-on/off comparison, whole-suite mutation score, or application-speed benchmark.

## Result

**56 component tests passed with the wrapper's selector mapping broken.**
The public tool test caught the same fault. Existing coverage killed all four
selected mutants at their intended assertions; each baseline and restoration passed.

| Contract challenged | Temporary production fault | Baseline | Mutant | Restored |
| --- | --- | --- | --- | --- |
| Forward includeSelectors through the public scan tool | Map include to undefined | 1 passed | 1 assertion failed | 1 passed |
| Respect includeIncomplete=false | Always include incomplete findings | 1 passed | 1 assertion failed | 1 passed |
| Restore caller viewport | Remove final viewport restoration | 1 passed | 1 assertion failed | 1 passed |
| Preserve serialized MCP error status | Serialize isError as undefined | 1 passed | 1 assertion failed | 1 passed |

For the selector fault, the separate `axe helpers` group passed **56/56**
before, during, and after mutation. It calls lower-level helpers directly and
does not establish the public option mapping. The public `scan_page_matrix`
test exercised the real mapping and detected `include: undefined` instead of
`['#checkout']`.

These are deliberately chosen faults based on the contracts and existing tests.
No missing test was inferred from the helper-only pass, and no scanner tests or
production files were changed permanently. This validates the workflow's central
distinction; it does not measure an AI agent's improvement over an unguided baseline.

## Exact scope and evidence

- Scanner revision: `cba7ac9292501f814a8636f26545f38553e86187`.
- Node `v26.5.0`, Vitest `5.0.5`, Python `3.9.6`, macOS.
- Source-level tool handlers and response serialization; existing browser,
  filesystem, and Axe doubles remain in place. No browser or live MCP transport
  was exercised. Forwarding assertions protect a real dependency contract, not
  end-to-end browser semantics.
- Four selected public-contract tests, one 56-test helper group, 15 runner
  invocations total. One run per state, not repeated timing trials.
- The original checkout's tracked bytes/modes and Git status were unchanged.
  Existing untracked `.rbt/` and `.zvec-grep/` state was excluded from the probe.
- Installed dependency files were copied independently and byte/mode verified;
  package-lock, dependency-tree, skill, and runner fingerprints are retained.
  Dependency executable symlinks were omitted; Vitest was called by its actual
  `node_modules/vitest/vitest.mjs` file. This reused the installed dependencies,
  not a fresh lockfile installation.
- Tests and assertions stayed unchanged throughout each baseline/mutant/restored
  sequence. Fresh Vitest processes loaded TypeScript directly; generated
  `lib/` output was not used.
- Temporary source/dependency copies were removed. Their isolation is filesystem
  separation, not a claim of an OS security sandbox.

[Results and commands](results.json), [source manifest](source-manifest.json),
[exact mutations](mutations.json), and the adjacent `*.report.json` files contain
the assertion evidence. The failure reports show the expected assertion failures,
not compilation, import, setup, or timeout failures.

The first harness attempt looked for JSON on stdout, but Vitest 5 wrote its
report to a file. The recipe now uses an explicit output path. That attempt
yielded no mutation result and is excluded from the table.

## Reproduce

From the lazy-clean checkout, using Python 3.9+ and the scanner's compatible Node:

```sh
python3 benchmarks/lazy-mutation-scanner.py \
  /path/to/mcp-accessibility-scanner \
  /tmp/lazy-mutation-scanner-results
```

The output directory must not exist. Use the stated scanner revision with its
dependencies installed. The fixed recipe verifies each mutation anchor and
fails if the source shape or baseline no longer matches. It copies tracked
working-tree inputs, so record any tracked local changes when comparing a rerun.
This is a specific reproducible workload, not a new general mutation framework.
