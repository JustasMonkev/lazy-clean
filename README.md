# lazy-clean

One skill package for coding agents: write the least code that works, then delete the slop that crept in anyway.

- **While writing** — a lazy-senior-dev ruleset (YAGNI ladder, risk gate) is injected at session start, into subagents, and adjustable via `/lazy` commands.
- **After writing** — a heuristic slop checker runs on every TS/JS file Claude writes or edits, and hands findings back as review context.

(A renamed hard fork of two upstream projects; this package is standalone and self-contained.)

## Works with

Same ruleset, four levels of wiring — pick whatever your agent supports.

| Tier | Platforms | What you get | Files |
| --- | --- | --- | --- |
| Full hooks | Claude Code, Codex | Ruleset injected at session and subagent start, `/lazy` level switching, slop-check auto-run after every Write/Edit | `hooks/lazy-clean.json` via `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` |
| Plugin | OpenCode | Ruleset injected every turn plus six slash commands | `.opencode/` + `opencode.json` |
| Rules file | Cursor, Copilot | Always-on ruleset in the editor; run the checker by hand after TS/JS changes | `.cursor/rules/lazy-clean.mdc`, `.github/copilot-instructions.md` |
| `AGENTS.md` | Everything else that reads it — Codex, Zed, Amp, Jules | The compact ruleset plus the post-edit checker step | `AGENTS.md` |

Only the Claude Code and Codex tiers run the checker automatically; everywhere else, run `node skills/slop-check/scripts/check.mjs <changed files>` yourself.

Upstream also ships adapters this fork deliberately skips (MCP server, pi extension, Hermes, Qoder, Devin, openclaw). Add them from upstream if you need them.

## Install — zero-install, skills only

No packages, no npm, no plugin needed. Copy the skills into your global skills folder:

```
cp -R /path/to/lazy-clean/skills/* ~/.claude/skills/
```

That gives you all 8 skills (`lazy-clean`, `lazy`, `lazy-review`, `lazy-audit`, `lazy-debt`, `lazy-gain`, `lazy-help`, `slop-check`). Claude picks them up by description or by `/lazy-clean` etc. The checker script travels inside the `slop-check` skill and runs with plain `node` — zero dependencies.

What you DON'T get in skills-only mode: the automatic parts (ruleset injected every session, checker auto-run after every edit). Those need the hooks — install as a plugin for that:

## Install — full (hooks + auto-run)

Local checkout:

```
claude --plugin-dir /path/to/lazy-clean
```

Or add the containing directory as a marketplace and enable it with `/plugin`.

Requires `node` on `PATH`. No dependencies to install.

## What runs when

| Event | What happens |
| --- | --- |
| `SessionStart` (startup/resume/clear/compact) | lazy ruleset injected at the current level |
| `SubagentStart` | same ruleset injected into the subagent |
| `UserPromptSubmit` | `/lazy …` commands parsed, level flag updated |
| `PostToolUse` on `Write`/`Edit`/`MultiEdit` | `skills/slop-check/scripts/check.mjs` runs on the edited file |

The checker only looks at `.ts .tsx .mts .cts .js .jsx .mjs .cjs`; anything else is skipped silently. Findings are **advisory** — they arrive as `additionalContext`, never as a block, and the hook always exits 0. Triage them per `skills/slop-check/SKILL.md`: fix real slop, justify false positives, keep deliberate assertions with a `// SAFETY:` comment.

Skills available: `lazy`, `lazy-audit`, `lazy-debt`, `lazy-gain`, `lazy-help`, `lazy-review`, `slop-check`, `lazy-clean` (the main workflow).

## Intensity

```
/lazy lite     # gentle
/lazy full     # default
/lazy ultra    # YAGNI extremist
/lazy          # report current level
```

`/lazy default <lite|full|ultra|off>` persists the level across sessions.

## Disable

- Lazy only: `/lazy off` (or say "stop lazy" / "normal mode"). Level resets at session end unless set as default.
- Slop-check only: remove the `PostToolUse` entry from `hooks/lazy-clean.json`.
- Everything: disable the plugin in `/plugin`, or drop the `--plugin-dir` flag.
