---
name: lazy-verify
description: Explicitly requested, optional fix or preservation evidence through a separately reviewed local verification engine. Experimental; not a lazy intensity or automatic completion hook.
---

# lazy-verify

Use only when the user explicitly requests verification or has authorized the
selected profile for this task. Installation, repository configuration, edits,
subagent startup, and lazy intensity are not authorization. Never change lazy
mode, including when it is off.

This bridge is experimental. No real engine version or historical pilot has been
qualified. Protocol fixtures are not project verification. An absent or
unsupported engine blocks explicitly required verification; it does not block
ordinary lazy-clean use. Never install an engine automatically or use npx.

1. Read [the installed contract reference](references/contract.md). Select the
   explicit profile, base, head, and user-reviewed policy. Do not guess refs.
   Read data-only `.lazy-verify.json` at the target root, or the explicit config.
2. Explain the selected contract: **fix** needs the named expected assertion
   failure before and a pass after; **preserve** needs passes on both snapshots.
   Command exit status alone, setup failures, and a clean static scan are not
   assertion evidence. Do not invent a baseline failure for a new feature.
3. Perform ordinary final slop review where applicable. Keep those findings
   separate from behavioral evidence. Never weaken the final checker requirement.
4. Run the bridge below with individually quoted arguments as data. `doctor`
   probes the explicitly approved local engine; it never executes target checks.
   `--trust-code` acknowledges local code execution, not the correctness of an
   expectation. An agent must not self-approve an altered contract to get green.
5. Report execution, behavior, gate, applicability, reasons, and limitations
   separately. Further edits require another applicability check or run.

From the target repository, replace `<skill-dir>` with this installed directory:

```sh
node "<skill-dir>/scripts/verify.mjs" doctor --policy /absolute/reviewed-policy.json
node "<skill-dir>/scripts/verify.mjs" verify --profile parser-fix --base BUGGY_REF --head FIXED_REF --policy /absolute/reviewed-policy.json --trust-code
node "<skill-dir>/scripts/verify.mjs" verify --profile cleanup --base TASK_BASE_REF --head worktree --include-untracked tests/new-case.mjs --policy /absolute/reviewed-policy.json --trust-code
node "<skill-dir>/scripts/verify.mjs" report .lazy-verify/runs/RUN_ID/manifest.json --format markdown
node "<skill-dir>/scripts/verify.mjs" replay .lazy-verify/runs/RUN_ID/manifest.json --policy /absolute/reviewed-policy.json --trust-code
```

Report rendering is read-only, previously recorded and unauthenticated; exit zero
means rendering worked, not that its gate passed. Replay needs fresh policy
selection and exact saved inputs, never executable commands from the report.

During an explicitly requested setup task, propose a contract and policy for
review. Do not mark them approved yourself. Keep contracts reviewable; ignore
only generated `.lazy-verify/runs/` output if the user requests that target edit.

Allowed claims concern only selected checks and recorded snapshots. Never say
“safe to merge,” “all behavior preserved,” or “bug-free.” Trusted-local execution
is not a sandbox; observations have `observationAuthenticity: not-established`.
Do not run hostile PR code with credentials. Working-tree capture, target binding,
attempt validity, classification, and replay material are owned by the engine.
