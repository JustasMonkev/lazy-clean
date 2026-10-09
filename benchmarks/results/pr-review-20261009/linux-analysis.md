# Linux rule analysis — 2026-10-09

## Scope and corpus limit

The requested merged/closed GitHub PR sample is unavailable for `torvalds/linux`.
I independently opened [the public pulls page](https://github.com/torvalds/linux/pulls): it displays Open 0, Closed 0, and restricted pull-request creation. The connector GET of `https://api.github.com/repos/torvalds/linux/pulls?state=all&per_page=1` returned HTTP 404, while issue search `repo:torvalds/linux is:pr` returned an empty list. The 404 alone cannot prove an empty corpus; the public page and empty search corroborate the practical sampling limit. There are zero sampled Linux GitHub PRs, zero verified closed-without-merge PRs, and no denominator from which to estimate maintainer rule frequency.

The three cases below are a separately labeled **mailing-list supplement**: original author/reviewer messages as preserved by public archives, followed where possible by actual mainline commit metadata and diff. They do not satisfy the original GitHub PR sampling request. They support narrow qualitative reasoning, not a Linux-wide approval/rejection rate. `Reviewed-by` and commit presence are not treated as substitutes for substantive discussion.

Local comparison baseline: `8f38b32bae676c300d03191c2668e4f0c1271544`. I read the original and current `skills/lazy/SKILL.md`, `skills/lazy-clean/SKILL.md`, and `skills/slop-check/SKILL.md`, current `AGENTS.md`, risk checks, and the checker's extension filter and relevant explanations. The current working tree already contains other agents' changes; this analysis does not claim ownership of those edits. `nodejs/node` was left untouched as the held-out repository.

## Case L1: remove an abstraction only after its alternate behavior is gone

**Identity and primary chain.** Eric Biggers' [v1 cover, May 10, 2025](https://www.spinics.net/lists/kernel/msg5679457.html), message ID `20250511004110.145171-1-ebiggers@kernel.org`, proposes a ten-patch CRC32C series. [Andrew Lunn's May 11 review](https://www.spinics.net/lists/kernel/msg5679852.html) requests an end-to-end before/after CPU and bandwidth comparison, rather than relying on the assumption that fewer indirect calls must be faster. [Jakub Kicinski's May 13 response](https://www.spinics.net/lists/kernel/msg5683115.html) asks for the missing subsystem acknowledgments and a repost including the benchmark; its explicit state is `pw-bot: defer`.

**Revision.** The [v2 cover, May 19](https://lists.openwall.net/linux-kernel/2025/05/19/1316), message ID `20250519175012.36581-1-ebiggers@kernel.org`, records added benchmark material and return-value kernel documentation. [Patch v2 06/10](https://lists.openwall.net/linux-kernel/2025/05/19/1322), message ID `20250519175012.36581-7-ebiggers@kernel.org`, folds `__skb_checksum()` into `skb_checksum()`. Its narrow prerequisite is that earlier series patches migrated the CRC32C consumers, leaving the regular checksum path as the remaining consumer of the configurable operation layer.

Representative patch slice (indentation normalized for display):

```diff
- csum = INDIRECT_CALL_1(ops->update, csum_partial_ext,
-                        skb->data + offset, copy, csum);
+ csum = csum_partial(skb->data + offset, copy, csum);
```

The patch also removes the delegating wrappers and operation structure. This is a before/after slice of the proposed C change, not a TS test fixture or a behavioral execution result.

**Verified outcome.** [Jakub's May 22 message](https://www.spinics.net/lists/kernel/msg5695681.html) explicitly says the series was applied to net-next, with the RDMA acknowledgment from v1. Independently fetched mainline commit [70c96c7cb9f035d5b960021f2450afa6240e66b4](https://github.com/torvalds/linux/commit/70c96c7cb9f035d5b960021f2450afa6240e66b4) contains the fold and links the exact v2 patch ID. The final diff preserves page map/unmap structure and converts recursive calls to the surviving checksum routine. This confirms a realized change, not that every simplification in isolation received an explicit reviewer endorsement. I did not execute the benchmarks or validate all ten patches' behavior.

**Rule comparison.** Both baseline and current lazy guidance correctly say one caller alone is not waste. The stronger evidence here is that alternate operation behavior was deliberately migrated and the wrappers contribute only obsolete parameter adaptation. Keep that qualifier; do not infer a universal rule to inline single-caller functions, remove all operation tables, or delete exported symbols. The review adds a useful evidence requirement: a claimed performance improvement needs a relevant measurement preserving the other important output, not just fewer lines or calls. Existing before/after verification guidance already accommodates that requirement; no new general benchmark gate is justified by one series.

**Transfer boundary.** In TS/JS, a delegating wrapper may still preserve published types, timing, errors, instrumentation, or a loader boundary. Kernel-wide migration and authorized export removal do not establish permission to break a consumer API. TS checker patterns cannot verify these C call-graph or checksum invariants.

## Case L2: removing a visible NULL guard is not a proof that the state is impossible

**Identity and requested change.** Vihas Mak's November 2021 `staging: r8188eu: remove unnecessary NULL check` patch is reproduced in [Dan Carpenter's November 23 substantive response](https://lkml.rescloud.iu.edu/2111.2/06945.html). The hunk changes `rtw_usb_if1_deinit()` in `drivers/staging/r8188eu/os_dep/usb_intf.c`:

```diff
- if (pnetdev)
-     rtw_free_netdev(pnetdev);
+ rtw_free_netdev(pnetdev);
```

The author's argument is that `rtw_free_netdev()` already checks NULL. Dan challenges the readability gain: moving the visible check into the callee can conceal the relevant complexity. He asks whether `pnetdev` can actually be NULL at this point; proving it cannot would justify deleting both checks.

**Follow-up and limit.** [Greg Kroah-Hartman's November 24 original response](https://lkml.iu.edu/2111.3/00181.html) asks the same reachability question. [The November 24 author reply](https://lkml.iu.edu/2111.3/02597.html) answers by reiterating the callee's NULL check. That establishes the dispute remains about reachability evidence, not a final accepted revision. I did not verify a revised patch or mainline commit, so the outcome is **challenged, unresolved in the material verified here**. It is not counted as rejected, closed-without-merge, or merged. A further researcher-provided [Dan follow-up](https://lkml.iu.edu/2111.3/02742.html) failed in my independent web open; its content is not necessary to this conclusion.

**Rule comparison.** Lazy's trace-callers and impossible-state language is valuable when “impossible” means a checked caller/lifetime invariant. C pointers and permissive helper behavior do not provide the evidence represented by a TS type annotation. Nor does a NULL-tolerant callee automatically make a visible caller guard pointless. Keep a contextual review prompt, not an automatic removal demand. There is no new test or scanner rule demonstrated by this unresolved example.

## Case L3: preserve a hardware switching sequence and document its expected errors

**Identity and proposal.** Hungyu Lin's [May 9, 2026 v2 patch](https://lists.openwall.net/linux-kernel/2026/05/09/338), message ID `20260509090320.85481-1-dennylin0707@gmail.com`, changes three separate `adt7316_spi_write(spi_dev, 0, 0)` calls in `adt7316_spi_probe()` to a loop that returns immediately if a write fails. The v2 notes establish that v1 merely warned; the proposed revision makes an error abort probe setup.

**Substantive review.** [Maxwell Doose's May 9 reply](https://lists.openwall.net/linux-kernel/2026/05/09/726) asks whether the change was tested on hardware and highlights both an interrupted transfer sequence and timing changes from the loop/error checks. [Andy Shevchenko's May 10 response](https://lists.openwall.net/linux-kernel/2026/05/10/145), message ID `agAkRBbJiTmWxGtS@ashevche-desk.local`, explicitly NAKs this change and instead requests a comment grounded in the datasheet. [Maxwell's follow-up](https://lists.openwall.net/linux-kernel/2026/05/10/147) asks the comment to describe the I2C/SPI transition, datasheet facts, and the reason not to check these return values.

**Verified outcome and revision.** Independently fetched mainline commit [8bf3e7a9defcfa889976258919d99fa2e8465189](https://github.com/torvalds/linux/commit/8bf3e7a9defcfa889976258919d99fa2e8465189), `staging: iio: addac: adt7316: document SPI interface switching sequence`, has a comment-only diff preserving all three unchecked calls. It records the device initially uses I2C, references the datasheet's Serial Interface Selection section, and explains that SPI transfers may fail during that transition. This verifies a realized documentation alternative and a concrete NAK of the proposed early-abort behavior; it does not verify physical hardware operation or every intermediate submission. The selected review messages, not just final `Reviewed-by` tags, establish the requested direction.

**Rule comparison and bounded lesson.** The original blanket ban on adding comments would obstruct the reviewer-requested fix. The current non-obvious constraint/ordering-comment qualifier fits this case. Similarly, an unchecked result is not inherently fabricated success: this particular hardware transition intentionally continues the required write sequence. Preserve the project's checked error/lifecycle contract before introducing fail-fast behavior, retries, a loop, or a substitute completion event. Do not generalize this into permission to ignore ordinary SPI failures or swallow application exceptions. The hardware sequence is more specific than an optional JS best-effort feature.

**Retrieval limit.** Ordinary web open could not read these 2026 archive pages; Firecrawl fetched the four primary messages above successfully. A later attempt to independently re-fetch the optional author follow-up hit the connector's request-rate limit, so no conclusion depends on that follow-up. No device test or datasheet validation was performed.

## Official kernel context — not review-case observations

These documents sharpen the scope of the preceding conclusions. They are project policy/API documentation, not additional accepted/closed patches.

| Source | Concrete context | Safe qualifier for lazy-clean |
| --- | --- | --- |
| [Coding style §§4, 6–8](https://www.kernel.org/doc/html/latest/process/coding-style.html) | Short local names such as `tmp`/`i` are idiomatic; complex logic may deserve named helpers; shared `goto` cleanup can protect exit paths; comments may convey intent and reasons, while boilerplate is discouraged. | Keep local language/style conventions. Do not treat a short local name, a single caller, a cleanup label, or a necessary explanatory comment as slop by itself. |
| [Scope-based cleanup helpers](https://docs.kernel.org/core-api/cleanup.html) | Cleanup runs in reverse variable-definition order. Its documented bug declares `obj __free(remove_free)` before `guard(mutex)`, so the mutex is released before object cleanup on failure. Putting the guard before the initialized object fixes ordering. | A shorter cleanup path earns its place only after ownership transfer, scope, lock lifetime, and failure unwinding are preserved. The document also warns against partial conversion mixing goto and scope cleanup in one function. |
| [Device infrastructure: dev_err_probe](https://docs.kernel.org/driver-api/infrastructure.html#c.dev_err_probe) | This existing helper returns the original errno and records deferred-probe context while selecting appropriate logging. | Reuse project error helpers by verified contract. A Linux probe's intentional logging plus returned errno is not a JS exception catch/log/rethrow smell. |
| [Programming language](https://docs.kernel.org/process/programming-language.html) | Kernel C uses GNU C11 and language/compiler extensions; Clang is also supported. | Use the targeted revision's build rules, configuration, and toolchain for implementation advice. This live document is context, not a verified compiler pin for the 2021 or 2025 patches. |

No Linux checkout, `.config`, configured compiler, sanitizer run, KUnit run, or kernel build was available/performed in this role. These are manual source/review observations only. No C version upgrade or compatibility claim is made.

## Candidate guidance decisions

| Candidate | Evidence strength and limitation | Recommendation |
| --- | --- | --- |
| Preserve accurate non-obvious constraints, workaround references, and ordering comments beside code. | L3 explicitly requests a datasheet-grounded comment and the final commit realizes it; official project guidance also supports this. Baseline blanket “Do not add code comments” conflicts with both. | Retain the current qualifier already added by the broader task; label evidence as a mailing-list supplement, not a sampled Linux PR. |
| Verify helper contract, ownership, errors, lifecycle, and availability before reuse/replacement. | L1 demonstrates migration prerequisites; official cleanup and probe contracts show why shape/line-count similarity is insufficient. | Retain the current reuse qualifier. Preserve existing C cleanup, integer/error, locking, and ownership semantics. |
| Remove transient tracing/scaffolding, but judge names in local language/domain context. | Official Linux policy explicitly permits `tmp` for local temporaries. The manual checklist at initial read included “temporary variables named test/tmp/debug”; the parent subsequently replaced that naming proxy. | Retain the new local-context qualifier. No expansion of the TS scanner to C. |
| Prove impossible states by tracing callers and lifetimes; do not just delegate a check to a tolerant callee. | L2 substantive challenge; no accepted revision or final outcome verified. | Reinforce interpretation of existing trace-callers rule; avoid adding a broad check-removal rule. |
| Benchmark every simplification. | L1 reviewer asks for benchmarks because the series claims network performance improvement. It does not establish a requirement for ordinary refactors. | Reject broad generalization. When performance is claimed, use relevant before/after evidence and verify the other important output. |
| Single caller means inline/delete; all goto, comments, or operation tables are slop. | Neither case establishes this; official kernel idioms directly conflict with several variants. | Reject. Keep behavior/domain/lifetime review ahead of line count. |

## Checker coverage and work performed

`SOURCE_EXTENSIONS` in `skills/slop-check/scripts/check.mjs` contains only `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, and `.cjs`; `collectFiles()` rejects other suffixes. I deliberately did not run the TS checker against Linux C and did not fabricate TS transliterations. A zero-file C run would provide no static coverage. Current lazy-clean/slop-check documentation already states C receives manual review; that is the appropriate scope.

Only this report was written by this role. Checks actually performed: independent GitHub corpus page/API/search probes, original/current skill and checker-source inspection, independent retrievals of selected mailing messages, fetch of exact final L1/L3 mainline commits/diffs, and `git diff --check`. No implementation, upstream C build, behavioral benchmark, or held-out `nodejs/node` inspection was performed. These conclusions were sent to the Linux critic and parent for independent challenge before guidance decisions; the critic independently confirmed L3 review requests and final diff.
