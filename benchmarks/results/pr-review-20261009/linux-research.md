# Linux review research — 2026-10-09

## Corpus status and method

**Actual `torvalds/linux` GitHub PR discussions sampled: 0.** Independently opened [the repository's PR page](https://github.com/torvalds/linux/pulls) on 2026-10-09. It reports Open 0, Closed 0, and restricted PR creation. The GitHub connector query `repo:torvalds/linux is:pr` returned `issues: []`. This independently supports the root researcher's reported API 404/empty search; I did not independently rerun that raw REST endpoint. Consequently, this report cannot provide a Linux merged/closed GitHub-PR sample or compare PR acceptance rates.

The four cases below are an **explicit mailing-list substitution**, not PRs. Spinics, Openwall, and Indiana University's archives mirror original author/reviewer messages; the evidentiary material is those original messages and patch diffs, not commentary written by the mirror. The GitHub connector separately verified two resulting commits in `torvalds/linux`. A commit's `Reviewed-by` trailer alone is not counted as review discussion.

This is a purposive, bounded sample. Queries targeted `unnecessary abstraction`, `only one caller`, `dev_err_probe`, and unnecessary NULL checks. Candidate threads were retained when their full original patch and substantive reviewer reasoning could be read, then followed through author replies and revisions. Four cases cover removing an exhausted abstraction, distinguishing a redundant guard from an unproved invariant, preserving a callback's return contract during lock cleanup, and rejecting speculative error checks in a hardware transition. This is useful qualitative evidence, not representative frequency evidence. Cases range from 2021 to 2026; recent was preferred where a full chain was available, but this is not a recent-PR sample.

Exclusions: thread indexes/search snippets alone; docs presented as discussions; bare acknowledgements presented as reasoning; unrelated security updates sharing a title; similarly named NULL-check cleanups in 2022 whose relationship to the 2021 patch was unproved; generated percentages/rates; and inferred merge/rejection outcomes where no final evidence was obtained. The IIO error-helper patch is included only within its actual broader ad9832 discussion, not counted as another independent case.

Access limits: several web-open calls could not fetch particular messages. Firecrawl read the complete original ADT7316 messages from Openwall with HTTP 200. Indiana archive link clicks with very large index IDs also failed; Openwall date indexes supplied the actual URLs. GitHub web-open failed for the CRC commit, but `github_fetch_commit(repo_full_name="torvalds/linux", commit_sha=...)` returned its full metadata and diff. No hardware tests, kernel build, or C static scan was performed. The TypeScript checker does not validate this C corpus.

## L1 — CRC32C: remove an abstraction after its use cases are gone; substantiate performance

**Series:** Eric Biggers, `[PATCH net-next 00/10] net: faster and simpler CRC32C computation`, May 10–22, 2025. **Language/context:** kernel C; networking, SCTP, RDMA, NVMe-TCP.

Evidence chain:

1. [Original cover/patch links](https://www.spinics.net/lists/kernel/msg5679457.html), May 10, proposes direct CRC32C calls, adds a CRC-specific skb helper, removes generic checksum ops and crypto-layer use, and reports 156 additions/274 deletions. The addition of the specialized helper matters: this is not a blanket prohibition on functions or abstraction.
2. [Andrew Lunn's substantive review](https://www.spinics.net/lists/kernel/msg5679852.html), May 11, asks for before/after networking throughput and CPU load. Short exact excerpt: “Show the CPU load has gone down without the bandwidth also going down.” The request checks useful system behavior, not just instruction count.
3. [Author reply](https://www.spinics.net/lists/kernel/msg5679724.html), May 11, initially argues indirect-call removal is clearly beneficial and points to the negative diffstat. He also explicitly separates fragmented-skb microbenchmarks from SCTP's current behavior because an existing linearization workaround remains outside this series.
4. [Ard Biesheuvel reply](https://www.spinics.net/lists/kernel/msg5679859.html), May 11, supports removing redundant layers leading to the same core CRC implementation. This is a substantive disagreement over evidentiary burden, not unanimous reviewer reasoning.
5. [Jakub Kicinski's disposition](https://www.spinics.net/lists/kernel/msg5683115.html), May 13, defers pending RDMA/NVMe acknowledgements and reposted benchmarks despite favorable networking review. Exact excerpt: “Please repost once those were collected and with the benchmarks”. [Author response](https://www.spinics.net/lists/kernel/msg5686688.html), May 15, notes those lists are copied.
6. [v2 cover/changelog](https://lists.openwall.net/linux-kernel/2025/05/19/1316), Message-ID `20250519175012.36581-1-ebiggers@kernel.org`, May 19, records added benchmark material, a kernel-doc return section, acknowledgements/reviews, and NVMe changes. [v2 patch 6](https://lists.openwall.net/linux-kernel/2025/05/19/1322), Message-ID `20250519175012.36581-7-ebiggers@kernel.org`, folds `__skb_checksum()` into `skb_checksum()` because other callers were converted earlier in the series. It removes the ops struct and pass-through checksum wrappers, retaining ordinary checksum behavior. Its displayed diffstat is +7/−73 across three files.
7. [Actual applied reply](https://www.spinics.net/lists/kernel/msg5695681.html), May 22, exact excerpt: “Applied to net-next with Leon's ack he sent to v1.”

**Final artifact verified:** [torvalds/linux commit `70c96c7cb9f035d5b960021f2450afa6240e66b4`](https://github.com/torvalds/linux/commit/70c96c7cb9f035d5b960021f2450afa6240e66b4), created May 21, 2025, `net: fold __skb_checksum() into skb_checksum()`. The connector's commit `Link` trailer points exactly to v2 patch 6, and the fetched diff removes the ops struct, indirect calls, and pass-through wrappers from `include/linux/skbuff.h`, `include/net/checksum.h`, and `net/core/skbuff.c`. The separately read [Hannes reply](https://lists.openwall.net/linux-kernel/2025/05/21/628) supplies a review tag but no additional rationale; it is not the substantive discussion on which this case relies. The final commit confirms this one patch, not independent inspection of all ten final commits.

**Accept/challenge:** Supports reuse of the underlying API and removal of an exhausted generic mechanism once alternate callers are migrated. Challenges “fewer lines proves faster” and “obvious improvement needs no relevant checks.” A single remaining caller is a consequence of the audited series, not a sufficient general test for deleting any helper. Preserve useful domain-specific functions and cross-subsystem contracts.

## L2 — r8188eu: a callee's NULL tolerance does not prove the caller's invariant

**Patch:** Vihas Mak, `[PATCH] staging: r8188eu: remove unnecessary NULL check`, November 2021. **Language/context:** kernel C; device teardown.

Evidence chain:

1. The original diff is reproduced in full in [Dan Carpenter's November 23 review](https://lkml.rescloud.iu.edu/2111.2/06945.html) and [Greg KH's November 24 reply](https://lists.openwall.net/linux-kernel/2021/11/24/337). The proposed +1/−2 change removes `if (pnetdev)` around `rtw_free_netdev(pnetdev)` in `rtw_usb_if1_deinit()`, justified by the callee's own check.
2. Dan objects to hiding visible NULL-handling complexity, then offers a stronger cleanup: investigate whether the pointer can actually be NULL and, if not, remove both checks. Exact excerpt: “it might be worth checking if "pnetdev" can even be NULL at this point”. The caller/callee redundancy and the state invariant are different claims.
3. Greg independently reinforces the visibility objection and asks the same reachability question. Message-ID `YZ4NL3TvLYMa/Tzu@kroah.com`; exact excerpt: “And are you sure this ever could be NULL?”
4. [Author November 25 reply](https://lkml.iu.edu/2111.3/02597.html) answers yes, but substantiates that answer only by repeating that the helper checks NULL. [Dan's final visible response](https://lkml.iu.edu/2111.3/02742.html) identifies the unanswered question. Exact excerpt: “That's not the question Greg and I asked. Re-read the emails.”

**Observed outcome:** substantive challenge to the posted simplification; author response did not supply the requested caller-state proof in the messages inspected. No v2 or final accepted/rejected commit was verified. Do not call this a merged PR, a formally rejected patch, or proof that all redundant NULL checks must remain. A later similarly titled r8188eu commit is excluded because its relationship to this specific proposal was unverified.

**Accept/challenge:** Supports tracing lifecycle/callers before cleanup and using evidence for impossible-state reasoning. Challenges mechanical guard removal merely because the called helper tolerates NULL. It does not justify adding speculative guards either: the preferred larger simplification depends on proving actual reachability first.

## L3 — ad9832: lock helpers simplify exits, but success still means bytes consumed

**Series:** Tomas Borquez, ad9832 driver cleanup, December 2025. **Language/context:** kernel C; sysfs write callback, SPI operations, mutex ownership, probe helpers.

Evidence chain:

1. [Marcelo Schmitt's December 18 review of original patch 2/5](https://lists.openwall.net/linux-kernel/2025/12/18/1058), Message-ID `aUQQ3YnaZau2RO2d@debian-BULLSEYE-live-builder-AMD64`, reproduces the original guard conversion. Replacing manual lock/unlock enables early error exits. Marcelo suggests direct returns from each case and separately suggests `devm_mutex_init()`.
2. [Author's same-day response](https://lists.openwall.net/linux-kernel/2025/12/18/1127), Message-ID `aUQa0IBuE7EITq9G@Lewboski.localdomain`, challenges the suggested literal direct-return example: successful writes must return the input length. Exact excerpt: “Wouldn't work because we need to return len too”. He proposes `ret ?: len` and notes its repetition across cases.
3. [v2 patch 2/6](https://lkml.rescloud.iu.edu/hypermail/linux/kernel/2512.3/04475.html), December 30, adds the cleanup header, replaces manual mutex operations with `guard(mutex)`, uses early returns for invalid input, and uses per-case `return ret ?: len` for completed operations. The callback's previous final `return ret ? ret : len` is visible in the diff, so the return-contract concern is directly checkable.
4. [Andy Shevchenko's v2 review](https://lkml.rescloud.iu.edu/hypermail/linux/kernel/2512.3/04390.html), December 30, suggests error-only early returns plus a common success return and asks for `bloat-o-meter` comparison, rather than treating repeated short expressions as automatically better.
5. [Author December 31 response](https://lkml.rescloud.iu.edu/hypermail/linux/kernel/2512.3/03789.html) agrees with that alternative and reports a comparison. Exact excerpt: “Jonathan's is better by 7 delta, so I'll stick with his”. The unit/build configuration is not supplied in that message; do not convert this into a measured percentage or independently verified benchmark.
6. The nearby [original error-helper review](https://lists.openwall.net/linux-kernel/2025/12/18/1069) asks to put probe-message cleanup before lock changes. The reviewer explicitly labels line wrapping a personal preference. [v2 cover](https://lkml.rescloud.iu.edu/hypermail/linux/kernel/2512.3/04477.html) records reordering and a separate managed-mutex patch. [Andy](https://lkml.rescloud.iu.edu/hypermail/linux/kernel/2512.3/04391.html) and [Jonathan Cameron](https://lkml.rescloud.iu.edu/hypermail/linux/kernel/2512.3/03741.html) subsequently request separating a new local `struct device *dev` from the error-helper change. These are scope and reviewability comments, not evidence that the error helper is invalid.

**Observed outcome:** author accepted a corrected control-flow suggestion after defending the success contract. No final replacement patch or torvalds commit was verified. Exact GitHub commit searches for the ad9832 guard/error-helper titles returned no hits; an empty search alone does not prove that no equivalent change ever merged.

**Accept/challenge:** Supports kernel-provided lock cleanup and logical patch separation. Strongly challenges applying a reviewer's shorter example without checking the enclosing callback's contract. Repetition, lock lifetime, success value, failure value, and compiled code all matter; expression size alone is insufficient. The author's correction is a real challenge even though the overall cleanup direction remains viable.

## L4 — ADT7316: adding error checks broke an intentional hardware transition; add the rationale comment

**Patch/continuation:** Hungyu Lin (mail replies signed Hungyu and sent as Denny Lin), May 9–31, 2026. **Language/context:** kernel C; switching a device from its initial I2C interface to SPI.

Evidence chain, read in full from Openwall via Firecrawl:

1. [Original patch](https://lists.openwall.net/linux-kernel/2026/05/09/291), Message-ID `20260509082636.85114-1-dennylin0707@gmail.com`, May 9, replaces three writes with a loop and warnings on failures. [v2](https://lists.openwall.net/linux-kernel/2026/05/09/338), Message-ID `20260509090320.85481-1-dennylin0707@gmail.com`, returns early on an error instead. Both have +6/−3 diffs; the second changes probe behavior.
2. [Maxwell Doose's substantive review](https://lists.openwall.net/linux-kernel/2026/05/09/726), Message-ID `CAKqfh0F+rAqAwdu=BtagPa2D-F-TANm8Tx3RCOoLyZXkYAn2pg@mail.gmail.com`, asks whether this was hardware-tested and what interrupted writes/timing changes would do. Exact excerpt: “we need to know how the hardware would respond when we hit an error case and quit sending data”. He links a previously rejected attempt; that earlier attempt was not separately sampled here.
3. [Author reply](https://lists.openwall.net/linux-kernel/2026/05/10/20), Message-ID `CAGEkeHcqG2_c7Ls_=ZMkKfR_MpSNiuRO5d159oWfuN_A6qNEoA@mail.gmail.com`, May 10 UTC, admits no failure-path test and chooses to preserve behavior pending confirmation. Exact excerpt: “I currently cannot test the failure case”. [Maxwell's follow-up](https://lists.openwall.net/linux-kernel/2026/05/10/25) explains that transitional writes may fail while the device still interprets the interface as I2C. His message phrases this as his understanding, so it is not a newly run hardware measurement.
4. [Andy Shevchenko's disposition](https://lists.openwall.net/linux-kernel/2026/05/10/145), Message-ID `agAkRBbJiTmWxGtS@ashevche-desk.local`, explicitly NAKs the behavior change and asks for a datasheet-based explanation instead. Exact excerpt: “Instead, add a better comment, if you wish”. [Maxwell's response](https://lists.openwall.net/linux-kernel/2026/05/10/147) specifies that the comment explain the transitional mode, the datasheet facts, and why these particular returns should be ignored.
5. [Author's replacement comment patch](https://lists.openwall.net/linux-kernel/2026/05/10/178), Message-ID `20260510072918.85734-1-dennylin0707@gmail.com`, leaves the three writes intact and documents the interface transition and expected errors. A subsequent [v2 comment discussion](https://www.spinics.net/lists/kernel/msg6195896.html) shows the author explaining that the datasheet lacks section numbering; reference title/version details are refined rather than invented.

**Final artifact verified:** [torvalds/linux commit `8bf3e7a9defcfa889976258919d99fa2e8465189`](https://github.com/torvalds/linux/commit/8bf3e7a9defcfa889976258919d99fa2e8465189), May 31, 2026, `staging: iio: addac: adt7316: document SPI interface switching sequence`. Fetched metadata identifies Hungyu Lin, the same patch title and file, and Jonathan Cameron as committer. The fetched diff changes only the comment at the same three-write sequence; it references the ADT7316/ADT7317/ADT7318 datasheet Rev. B and its Serial Interface Selection section and explains ignoring errors during transition. There is no `Link` trailer in the fetched commit. Attribution is supported by the matching author/title/file/hunk and resulting comment, not an exact message-ID trailer. Reviewed-by trailers are outcome metadata; the actual reasoning is in the messages above.

**Observed outcome:** proposed behavior-changing check patch explicitly NAKed; a replacement explanatory comment verified in torvalds/linux. The final implementation keeps the three unchecked writes. No new hardware test or datasheet validation was performed by this research agent.

**Accept/challenge:** Strong support for accurate comments explaining non-obvious constraints, preserving device behavior, and researching error contracts before adding checks. Challenges blanket “every error must be returned,” “repeated calls should always become a loop,” and “comments can always be reduced.” The accepted comment is longer than the original implementation's prose and is necessary to prevent a plausible future regression. This is a narrowly documented expected-error exception, not license to ignore ordinary SPI errors.

## Bounded conclusions

| Proposed lazy-clean principle | What the observed mailing-list evidence supports | Ceiling |
| --- | --- | --- |
| Prefer direct existing APIs over unnecessary machinery | CRC removes generic ops/wrappers after migrating alternate uses | Not a blanket one-caller/helper deletion rule |
| Correctness and contracts precede code size | ad9832 author preserves byte-count success; ADT7316 rejects early error exit | Relevant ownership, lifecycle, callback and hardware behavior must be traced |
| Remove impossible-state guards | r8188eu reviewers request proof of pointer reachability | Callee NULL tolerance is not caller-state proof; final outcome unknown |
| Keep rationale comments | ADT7316 replacement documents an intentional ignored-error sequence | Explain the real invariant and source, not checker-silencing boilerplate |
| Use native cleanup/error helpers | ad9832 discussion supports lock cleanup, but reviews scope and return behavior | Verify installed/kernel API availability and scope/order; no universal conversion mandate |
| Verify claimed improvements | CRC maintainer requests benchmarks; ad9832 reviewer requests object-size comparison | Author-reported numbers are not research-agent-run verification |

These four cases justify qualitative caveats to the written rules. They do not establish cross-language validation, real-world checker precision/recall, kernel test success, or a Linux PR review acceptance rate.
