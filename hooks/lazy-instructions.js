#!/usr/bin/env node
// Shared Lazy instruction builder for Claude hooks and Pi extension.

const fs = require('fs');
const path = require('path');
const { DEFAULT_MODE, normalizeMode, normalizePersistedMode } = require('./lazy-config');

const INDEPENDENT_MODES = new Set(['review']);
const SKILL_PATH = path.join(__dirname, '..', 'skills', 'lazy', 'SKILL.md');

function filterSkillBodyForMode(body, mode) {
  const effectiveMode = normalizeMode(mode) || DEFAULT_MODE;
  // HTML comments in SKILL.md are notes to whoever edits the file (e.g. the
  // warning that this very function filters it); injecting them spends context
  // on instructions meant for a human.
  const withoutFrontmatter = String(body || '')
    .replace(/^---[\s\S]*?---\s*/, '')
    .replace(/<!--[\s\S]*?-->\r?\n?/g, '');

  // Only the intensity table rows and worked examples are mode-specific, and
  // both are keyed by a mode name (lite/full/ultra). A bullet whose label is
  // not a mode — e.g. "No unrequested abstractions: ..." — is a normal rule
  // and must be kept verbatim.
  return withoutFrontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
      if (tableLabel) {
        const labelMode = normalizeMode(tableLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      // Require a quoted value: every worked example is `- lite: "..."`. Without
      // this, an ordinary rule bullet that happens to start with a mode word
      // (e.g. "- Full: ...") is silently dropped in every other mode — it looks
      // like a worked example but is really prose meant to survive verbatim.
      const exampleLabel = line.match(/^-\s*([^:]+):\s*"/);
      if (exampleLabel) {
        const labelMode = normalizeMode(exampleLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      return true;
    })
    .join('\n');
}

const INTENSITY = {
  lite: 'Complete the task; mention a simpler option when useful.',
  full: 'Complete the task using the ladder and verify the goal.',
  ultra: 'Aggressively cut unasked extras, never requested behavior or checks.',
};

function getFallbackInstructions(mode) {
  return `LAZY MODE ACTIVE — level: ${mode}

Current level: **${mode}** — ${INTENSITY[mode] || INTENSITY.full}
Use this level until /lazy off, "stop lazy", or "normal mode". Do not announce it.

## Think, then act

Before coding, state material assumptions, interpretations, and tradeoffs. Ask
only when a missing answer blocks the result. For multi-step work, write a brief
step → check plan. Define a verifiable finish: bugs go red → green, refactors get
before/after checks; loop until verified. Carry unfinished checks through
handoffs and compaction; summaries do not replace these instructions.

## The ladder

Complete every requested need with the clearest small solution. Read affected code and trace callers, callbacks, retries,
restore/replay, and concurrent paths. Fix the shared cause. Reuse existing code,
stdlib, native features, or installed dependencies before writing new code.
Skip only unasked extras. Match existing style. Do not add speculative
features/config, needless single-use abstractions, or impossible-state guards;
offer a simpler alternative to unneeded scope. Review the task-owned diff: remove
only orphans created by this task, mention unrelated dead code, and cut additions
that do not support the request. Simplify structure, not formatting; preserve
behavior and do not force a net-negative diff. Preserve unrelated edits. One
caller does not justify deleting domain helpers, tricky logic, side-effect
boundaries, test seams, or framework contracts. Mark real shortcuts with lazy:
and their ceiling. Keep security, accessibility, and hardware calibration.

At changed boundaries: group behavior by reason to change; keep policy independent
of external details through ordinary parameters; give callers only capabilities
they need. Extend existing contracts for requested variations. Interchangeable
implementations must preserve inputs, results, errors, and lifecycle; exercise
the same contract against each. Do not add interfaces just to satisfy SOLID.

For boundary changes, read [design checks](<${path.join(__dirname, "../skills/lazy/references/design-checks.md")}>).
One implementation alone is not waste; judge behavior and design separately.

Before finishing, simplify the changed code: infer obvious local types without
any or unchecked casts; normalize overloaded arguments once; handle returned
errors directly instead of throwing only to catch them locally. Remove guards
and helpers only with evidence from callers and lifetimes. Match error and
cancellation semantics when replacing code with native APIs. Preserve encoding
and buffer ownership; prove risky removals with regression or mutation checks.
Keep modules to one reason to change and I/O out of import time. Model exclusive
states as unions. On TypeScript 7 (native tsc) do not add baseUrl,
moduleResolution node/node10, target es5, or outFile; keep a TypeScript 6 alias
API tools need.
For TS/JS and tsconfig read [TS/JS checks](<${path.join(__dirname, '../skills/lazy/references/simplification-checks.md')}>).
For Python read [Python checks](<${path.join(__dirname, '../skills/lazy/references/python-checks.md')}>):
no mutable defaults, bare except, or \`if not x\` where 0 or "" is valid.

Preserve defaults, explicit false/zero/empty values, accepted input formats,
user state, metadata, errors, generated files, lockfiles, and platform behavior.
Revalidate at trust boundaries; bound external work; clean up tasks, timers, and
listeners after success, failure, cancellation, and partial setup. Use existing tests
and map changed requirements, edge cases, and failure modes to rerunnable tests;
add missing coverage. Inline probes alone are not coverage. Trivial edits need
no new tests. If existing red-green checks prove the risky regression, mutation
work is optional; otherwise a small meaningful mutation can provide evidence.
Never add a dependency just for it. If writing tests is the task, cover the full
case list.

For TS/JS changes, finish with the bundled checker from the repo root:
node "${path.join(__dirname, '../skills/slop-check/scripts/check.mjs')}" --since=HEAD
Use the task base ref for committed changes, or quoted changed paths without Git.
Triage only your scope. Report failed scans as failed, not clean.

TypeScript, JavaScript, Java, Python, Ruby, Rust, Go: detect only languages in use.
Read each version from its toolchain file, manifest, lockfile, or runtime. Keep
advice valid for the installed version. If a needed version fact cannot be checked, say so and do not guess; research latest
versions only when asked.

Before you report, check the diff, not memory: every requested need is done and
nothing unasked was added; each changed line traces to the request or its
verification; changed behavior has tests that ran; language checks were applied
and checker findings triaged. Report what changed, checks run, and limits,
briefly. Never claim an unrun check.
`;
}

function getLazyInstructions(mode) {
  const configuredMode = normalizePersistedMode(mode) || DEFAULT_MODE;
  // `off` filtered down to a header, an empty intensity table, and an example
  // with no examples. There is nothing to instruct when lazy is off.
  if (configuredMode === 'off') return '';

  if (INDEPENDENT_MODES.has(configuredMode)) {
    return 'LAZY MODE ACTIVE — level: ' + configuredMode + '. Behavior defined by /lazy-' + configuredMode + ' skill.';
  }

  const effectiveMode = normalizeMode(configuredMode) || DEFAULT_MODE;

  try {
    return 'LAZY MODE ACTIVE — level: ' + effectiveMode + '\n\n' +
      filterSkillBodyForMode(fs.readFileSync(SKILL_PATH, 'utf8'), effectiveMode)
        .replace(/\(references\/([\w-]+\.md)\)/g, (_, file) => '(<' + path.join(path.dirname(SKILL_PATH), 'references', file) + '>)')
        .replace('<skills-dir>', path.dirname(path.dirname(SKILL_PATH)));
  } catch (e) {
    return getFallbackInstructions(effectiveMode);
  }
}

// Both entry points use the same compact rules so safety and scope cannot drift.
const getSubagentInstructions = getLazyInstructions;

module.exports = {
  filterSkillBodyForMode,
  getFallbackInstructions,
  getLazyInstructions,
  getSubagentInstructions,
};
