---
name: lazy-help
description: >
  Quick-reference card for all lazy modes, skills, and commands.
  One-shot display, not a persistent mode. Trigger: /lazy-help,
  "lazy help", "what lazy commands", "how do I use lazy".
---

# Lazy Help

Display this reference card when invoked. One-shot, do NOT change mode,
write flag files, or persist anything.

## Levels

| Level | Trigger | What changes |
|-------|---------|-------------|
| **Lite** | `/lazy lite` | Build what's asked, name the lazier alternative in one line. |
| **Full** | `/lazy` | The ladder enforced: YAGNI → stdlib → native → one line → minimum. Default. |
| **Ultra** | `/lazy ultra` | YAGNI extremist. Deletion before addition. Challenges requirements before building. |

Level sticks until changed or session end.

## Skills

| Skill | Trigger | What it does |
|-------|---------|--------------|
| **lazy** | `/lazy` | Lazy mode itself. Simplest solution that works. |
| **lazy-review** | `/lazy-review` | Over-engineering review: `L42: yagni: factory, one product. Inline.` |
| **lazy-audit** | `/lazy-audit` | Whole-repo over-engineering audit: ranked list of what to delete. |
| **lazy-debt** | `/lazy-debt` | Harvest `lazy:` shortcut comments into a tracked ledger. |
| **lazy-gain** | `/lazy-gain` | Measured-impact scoreboard: less code, less cost, more speed. |
| **lazy-help** | `/lazy-help` | This card. |
| **lazy-clean** | `/lazy-clean` | Both passes on one change: the ladder while writing, the checker after. |
| **slop-check** | `/slop-check` | Delete AI slop in TS/JS: bundled checker plus a manual checklist. |

Codex uses `@lazy`, `@lazy-review`, and `@lazy-help`; Claude Code uses the
slash-command forms above. OpenCode ships the six `/lazy*` commands as slash
commands; `lazy-clean` and `slop-check` are skills, invoked by name or
description.

## Deactivate

Say "stop lazy" or "normal mode". Resume anytime with `/lazy`.
`/lazy off` also works.

## Configure Default Mode

Default mode = `full`, auto-active every session. Change it:

**Environment variable** (highest priority):
```bash
export LAZY_DEFAULT_MODE=ultra
```

**Config file** (`~/.config/lazy/config.json`, Windows: `%APPDATA%\lazy\config.json`):
```json
{ "defaultMode": "lite" }
```

Set `"off"` to disable auto-activation on session start, activate manually
with `/lazy` when wanted.

Resolution: env var > config file > `full`.

## Update

Enable auto-update once: open `/plugin`, go to Marketplaces, pick lazy, Enable auto-update. Claude Code then pulls new versions at startup (run `/reload-plugins` when it prompts). Manual refresh: `/plugin marketplace update lazy` then `/reload-plugins`.

If `/plugin` is not recognized, your Claude Code is out of date. Update it (`npm install -g @anthropic-ai/claude-code@latest`, or `brew upgrade claude-code`) and restart. Other hosts use their own update flow.

## More

Full docs + examples: https://github.com/DietrichGebert/lazy
