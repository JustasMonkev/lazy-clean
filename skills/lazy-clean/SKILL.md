---
name: lazy-clean
description: Write clean minimal code — the lazy laziness ladder while writing, the slop-check checker after. Use when the user asks to write clean minimal code, wants code that is lazy and slop-free, asks for a lazy-clean review, or wants both over-engineering and AI slop caught on the same change.
---

# lazy-clean

Two passes over one change: build the least code that works, then delete the slop that crept in anyway.

## 1. While writing — the lazy ladder

Follow `skills/lazy/SKILL.md` as written: climb the ladder (YAGNI → reuse → stdlib → platform → installed dep → one line → minimum code) and run its risk gate before shipping. Do not restate the rules here; read that file.

If installed as a plugin, hooks already inject the lazy ruleset at session and subagent start; in a skills-only install, read and apply it now. Intensity is `/lazy lite|full|ultra`.

## 2. After writing or editing TS/JS — the checker

```bash
node <skills-dir>/slop-check/scripts/check.mjs <changed files>
```

`--json` for machine-readable findings. Exit code 1 means findings exist.

Triage every finding per `skills/slop-check/SKILL.md`:

- Fix real slop — delete the pointless code, restore real type evidence.
- Keep a justified type assertion only with a `// SAFETY:` comment naming the checked invariant.
- Keep a justified swallowed error only with a comment inside the catch saying why.
- A genuine false positive stays as-is; say so briefly. Never rewrite correct code to silence the checker, and never weaken or disable a check.

Then apply that skill's manual review checklist — dead code, speculative generality, reimplemented platform, edit-artifacts — which no mechanical scan catches.

## When the manual run is needed

In a plugin install, the `PostToolUse` hook already runs the checker on each file you Write/Edit, so a per-file manual run is redundant; in a skills-only install, run it yourself on every file you changed. Run it by hand for repo-wide sweeps: a whole directory, a full diff, or a pre-review pass over files you did not just edit.

```bash
node <skills-dir>/slop-check/scripts/check.mjs $(git diff --name-only HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.mts' '*.cts')
```

## Reject what the spec didn't define

Clean code can still be too generous. When parsing or validating input, accept
exactly the formats the task names and throw on everything else — do not
silently take uppercase variants, decimals, padded whitespace, or other
unrequested formats "to be nice". Every silently accepted format is an
undocumented contract you now maintain. Leniency is a feature: if wanted, it
gets asked for, specified, and tested.

## Order matters

Ladder first. The checker finds slop in code that exists; the ladder stops the code from being written at all, and code never written has no findings.
