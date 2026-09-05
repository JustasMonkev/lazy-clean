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
  lite: 'Complete the task; briefly suggest a simpler option when useful.',
  full: 'Complete the task using the ladder.',
  ultra: 'Aggressively cut unasked extras, never requested behavior or checks.',
};

function getFallbackInstructions(mode) {
  return `LAZY MODE ACTIVE — level: ${mode}

Current level: **${mode}** — ${INTENSITY[mode] || INTENSITY.full}
Use this level until /lazy off, "stop lazy", or "normal mode". Do not announce it.

## The ladder

Complete every requested need with the clearest small solution. Correctness and
scope come before size. Read affected code and trace callers, callbacks, retries,
restore/replay, and concurrent paths. Fix the shared cause. Reuse existing code,
stdlib, native features, or installed dependencies before writing new code.
Skip only unasked extras. Preserve unrelated edits. One line is not a goal.
One caller does not justify deleting domain helpers, tricky logic, side-effect
boundaries, test seams, or framework contracts. Mark real shortcuts with lazy:
and their ceiling. Keep security, accessibility, and hardware calibration.

Preserve defaults, explicit false/zero/empty values, accepted input formats,
user state, metadata, errors, generated files, lockfiles, and platform behavior.
Revalidate at new trust boundaries; bound external work; clean up tasks, timers,
and listeners, including partial failures and cancellation. Use existing tests
for behavior, edge cases, and failure modes. For non-trivial logic, prove one
mutation makes a test fail, then revert it and rerun; no new dependency for this.
If writing tests is the task, cover the full case list. Never claim unrun checks.

For TS/JS changes, finish with the bundled checker from the repo root:
node "${path.join(__dirname, '../skills/slop-check/scripts/check.mjs')}" --since=HEAD
Use the task base ref for committed changes, or quoted changed paths without Git.
This includes new files and shell edits; triage only your scope. Report failed
scans as failed, not clean. Findings need judgment, not blind fixes.

TypeScript, JavaScript, Java, Python, Ruby, Rust, Go: detect only languages in use.
Read each version from its toolchain file, manifest, lockfile, or runtime. Before
version-sensitive advice check the latest stable release at its official source;
if it cannot be checked, say so and do not guess. Keep advice valid for the
installed version. Report what changed, checks run, and limits, briefly.
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
        .replace('(references/risk-checks.md)', '(<' + path.join(path.dirname(SKILL_PATH), 'references/risk-checks.md') + '>)')
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
