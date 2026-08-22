# lazy-clean

One skill package for coding agents: write the least code that works, then delete the slop that crept in anyway.

- **While writing** — a lazy-senior-dev ruleset (YAGNI ladder, risk gate) is injected at session start, into subagents, and adjustable via `/lazy` commands.
- **After writing** — a heuristic slop checker runs on every TS/JS file Claude writes or edits, and hands findings back as review context.

(A renamed hard fork of two upstream projects; this package is standalone and self-contained.)

## Works with

Same ruleset, five levels of wiring — pick whatever your agent supports.

| Tier | Platforms | What you get | Files |
| --- | --- | --- | --- |
| Full hooks | Claude Code, Codex | Ruleset injected at session and subagent start, `/lazy` level switching, slop-check auto-run after every Write/Edit | `hooks/lazy-clean.json` via `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` |
| Plugin | OpenCode | Ruleset injected every turn plus six slash commands | `.opencode/` + `opencode.json` + `hooks/` + `skills/` — the plugin loads the shared builder from `hooks/`, so copying only `.opencode/` gives you a plugin that fails to load |
| Rules file | Cursor, Copilot | Always-on ruleset for all seven supported languages; run the TS/JS-only checker by hand after TS/JS changes | `.cursor/rules/lazy-clean.mdc`, `.github/copilot-instructions.md` |
| `AGENTS.md` | Everything else that reads it — Codex, Zed, Amp, Jules | The compact ruleset plus the post-edit checker step | `AGENTS.md` |
| Skills only | Anything that reads `~/.claude/skills` | Every skill on demand, no automation | `skills/` |

Only the Claude Code and Codex tiers run the checker automatically. Everywhere else run it yourself, from wherever the skills live — `node ~/.claude/skills/slop-check/scripts/check.mjs <changed files>` after the skills-only install below, or `node skills/slop-check/scripts/check.mjs <changed files>` from a checkout.

Qoder and VS Code Copilot are detected by the hooks and get the right output shape, but neither is wired up here as its own tier. Upstream also ships adapters this fork skips (MCP server, pi extension, Hermes, Devin, openclaw). Add them from upstream if you need them.

## Languages and review scope

The rulesets cover TypeScript, JavaScript, Java, Python, Ruby, Rust, and Go. The agent detects the ones your project actually uses, reads their pinned or installed versions, and checks the latest stable release at the language's official source before any version-sensitive advice — and says the check failed instead of guessing.

The bundled checker script stays TS/JS-only; the other five languages get the manual review, because a zero-dependency scanner is not a parser.

Two rules the reviews follow throughout: a one-caller helper stays when it carries real value (a domain name, tricky logic, an isolated side effect, test or readability value, a framework contract), and non-trivial changed logic needs one mutation check — the repo's own tool, or one flip by hand, never a new dependency.

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

Or add the checkout as a marketplace and enable it with `/plugin`:

```
claude plugin marketplace add /path/to/lazy-clean
```

Requires `node` 18+ on `PATH`. No dependencies to install.

## What runs when

| Event | What happens |
| --- | --- |
| `SessionStart` (startup/resume/clear/compact) | lazy ruleset injected at the current level |
| `SubagentStart` | same ruleset injected into the subagent |
| `UserPromptSubmit` | `/lazy …` commands parsed, level flag updated |
| `PostToolUse` on `Write`/`Edit`/`MultiEdit` | `skills/slop-check/scripts/check.mjs` runs on the edited file |

The checker only looks at `.ts .tsx .mts .cts .js .jsx .mjs .cjs`; anything else is skipped silently. Files written through `Bash` — heredocs, `sed -i`, codemods — are not seen by the hook at all; run the checker on those yourself.

Findings are **advisory** — they arrive as `additionalContext`, never as a block, and the hook always exits 0. It reports only findings on the lines that edit wrote, and says how many others in the file predate it, so a small edit never hands back a to-do list for the whole file. Triage them per `skills/slop-check/SKILL.md`: fix real slop, justify false positives, keep deliberate assertions with a `// SAFETY:` comment.

## Running the checker yourself

```
node skills/slop-check/scripts/check.mjs [paths...] [--json] [--summary] [--since=<ref>] [--disable=<rule-id>,...]
```

With no paths it scans the current directory. Exit code 1 means findings, 2 means a path could not be read, 0 means clean — so a failed scan is never mistaken for a clean one.

`--since=<ref>` keeps only findings on lines the diff against `<ref>` added. That is the whole adoption story for an existing codebase: there is no baseline file to generate or refresh, because git already holds the baseline.

```
node skills/slop-check/scripts/check.mjs --since=HEAD          # before committing
node skills/slop-check/scripts/check.mjs --since=origin/main   # in CI
```

Findings are grouped by whether the fix needs judgment: mechanical ones have a single correct answer, review ones are heuristics where "this is deliberate, leaving it" is a legitimate reply. `--summary` replaces the finding list with the per-rule tally, which is the number that tells you whether a codebase is worth a full pass. The run summary line still prints; `--json` is the machine-readable form.

## Silencing a rule

Every rule can be turned off, because a heuristic you cannot turn off is one you end up ignoring entirely. To record a false positive where it happened, name the rule and say why:

```ts
// slop-check-ignore no-any -- the vendor typing is `any`; narrowed at the call site below
const parsed = raw as any;
```

It covers that line and the next, takes several ids separated by commas, and `slop-check-ignore-file` in a file's first 10 lines covers the whole file. `--disable=<rule-id>,...` turns rules off for one run.

The `-- <reason>` is not decoration. An ignore with no reason, with an id that is not a rule, or a file-level one written too far down suppresses nothing and is reported as `no-unjustified-ignore` — the same standard the checker already holds `@ts-expect-error` to, because an ignore that silently does nothing is worse than no ignore. The run summary counts what was suppressed: clean under forty ignores is not clean.

Skills available: `lazy`, `lazy-audit`, `lazy-debt`, `lazy-gain`, `lazy-help`, `lazy-review`, `slop-check`, `lazy-clean` (the main workflow).

## Intensity

```
/lazy lite     # gentle
/lazy full     # default
/lazy ultra    # YAGNI extremist
/lazy          # report current level
```

`/lazy default <lite|full|ultra|off>` persists the level across sessions. On OpenCode the session level itself also persists until changed, since there is no session boundary to reset it at.

## Statusline badge

The plugin ships a statusline script that shows the active level (`[LAZY]`, `[LAZY:ULTRA]`). It is not wired up automatically: on first session the hook offers to add a `statusLine` entry to your `settings.json` pointing at `hooks/lazy-statusline.sh` (or `.ps1` on Windows), and it makes that offer at most once.

Hide the badge while keeping lazy active with `LAZY_HIDE_STATUS=1`, or `"hideStatus": true` in `~/.config/lazy/config.json` (`%APPDATA%\lazy\config.json` on Windows).

## Disable

- Lazy only: `/lazy off` (or say "stop lazy" / "normal mode"). Level resets at session end unless set as default.
- Slop-check only: remove the `PostToolUse` entry from `hooks/lazy-clean.json`.
- Everything: disable the plugin in `/plugin`, or drop the `--plugin-dir` flag.

## Developing

```
npm test              # rule, CLI, and hook suites — no dependencies
npm run slop-check    # the checker over this repo, which it has to survive
```
