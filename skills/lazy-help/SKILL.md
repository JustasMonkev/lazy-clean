---
name: lazy-help
description: >
  Quick-reference card for all lazy modes, skills, and commands.
  One-shot display, not a persistent mode. Trigger: /lazy-help,
  "lazy help", "what lazy commands", "how do I use lazy".
disable-model-invocation: true
---

Display only; no mode, flag files, persistence, or config/update execution.

| Level | Trigger | Behavior |
| --- | --- | --- |
| Lite | `/lazy lite` | Requested work + one-line lazier alternative. |
| Full | `/lazy full` | YAGNI → reuse → stdlib → native → clear minimum. |
| Ultra | `/lazy ultra` | Cut extras, not requested behavior/checks. |

Persists until changed/session end. "Stop lazy", "normal mode", `/lazy off`: off.
`/lazy full`: resume. Bare `/lazy`: live level only.

| Skill | Trigger | Purpose |
| --- | --- | --- |
| lazy | `/lazy` | Simplest working solution. |
| lazy-review | `/lazy-review` | Diff over-engineering report. |
| lazy-audit | `/lazy-audit` | Ranked repo complexity report. |
| lazy-debt | `/lazy-debt` | `lazy:` comments → debt ledger. |
| lazy-gain | `/lazy-gain` | Recorded evidence, not project savings. |
| lazy-help | `/lazy-help` | This card. |
| lazy-clean | `/lazy-clean` | Write with ladder, then check. |
| slop-check | `/slop-check` | TS/JS checker + manual checklist. |
| lazy-verify | `/lazy-verify` | Experimental opt-in fix/preserve evidence; requires reviewed local engine/policy; mode-independent. |
| **layz-test** | `/layz-test` | Run tests, fill gaps, explain manual checks. |
| test-quality-review | `/test-quality-review` | Whole-suite test-value audit; report-only, fresh-context tests-only fixer when requested; mode-independent. |

Codex: `@lazy`, `@lazy-review`, `@lazy-help`, `@layz-test`, `@test-quality-review`. Claude Code: slash
forms. OpenCode: seven `/lazy*` commands + `/layz-test` + `/test-quality-review`; `lazy-clean`/`slop-check`
are name/description-invoked skills.

For test-quality-review, Codex CLI also supports `$test-quality-review`; select
Test Quality Review in Codex's skill picker. Claude plugin installs use
`/lazy-clean:test-quality-review`; skills-only installs use `/test-quality-review`.
All hosts share the same instructions. Without clean-context delegation, pass
the report and fixer instructions to a new session instead of editing as reviewer.

Test-quality findings explain the defect a check can miss and recommend keeping,
strengthening, replacing, or removing it. Mocks, snapshots, and shape assertions
can be useful when they verify a real contract; they are not blanket findings.
Explicit recent-test scopes can narrow the audit. The fixer may delete genuinely
pointless tests and must explain every deletion; production code stays unchanged.

## Defaults/updates

Session default: auto-active `full`. Priority: env > config > `full`.
Env: `export LAZY_DEFAULT_MODE=ultra`. Config: `{ "defaultMode": "lite" }` in
`~/.config/lazy/config.json` (Windows `%APPDATA%\lazy\config.json`). `off` disables
auto-activation; enable with `/lazy lite|full|ultra`.

Checkout (`claude --plugin-dir`/`claude plugin marketplace add`): `git pull`,
`/reload-plugins`. Skills-only: re-copy `skills/*` to `~/.claude/skills/`.
Unknown `/plugin`: update Claude Code (`npm install -g @anthropic-ai/claude-code@latest`
or `brew upgrade claude-code`), restart. Other hosts: own updates.

https://github.com/JustasMonkev/lazy-clean
