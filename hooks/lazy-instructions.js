#!/usr/bin/env node
// Shared Lazy instruction builder for Claude hooks and the OpenCode plugin.

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

// A Markdown link destination written as `<...>` may hold spaces and
// parentheses, which are valid in an install path. `<` and `>` would end it,
// `&name;` would decode as an entity, and a backslash before punctuation would
// read as an escape, so encode exactly those; every valid path then survives
// as one openable link. Entities, unlike `\<`, are also decoded by older
// CommonMark parsers.
const LINK_ENTITIES = { '<': '&lt;', '>': '&gt;', '&': '&amp;' };
function markdownLinkTarget(filePath) {
  return '<' + filePath.replace(/[<>]|&(?=#?\w+;)|\\(?=[!-/:-@[-`{-~])/gu,
    (match) => LINK_ENTITIES[match] || '\\' + match) + '>';
}

const INTENSITY = {
  lite: 'Complete the task; mention a simpler option when useful.',
  full: 'Complete the task using the ladder and verify the goal.',
  ultra: 'Aggressively cut unasked extras, never requested behavior or checks.',
};

function getFallbackInstructions(mode) {
  return `LAZY MODE ACTIVE — level: ${mode}

${INTENSITY[mode] || INTENSITY.full}
Keep it until /lazy off, "stop lazy", or "normal mode". Do not announce it.

## Think, then act

Before coding, state material assumptions, interpretations, and tradeoffs; ask
only when blocked. For multi-step work: step → check plan and verifiable finish:
bugs go red → green; refactors get before/after checks. Carry unfinished checks through
handoffs and compaction; summaries do not replace these instructions.

## The ladder

Complete requests. Trace code, callers, callbacks, retries,
restore/replay, and concurrent paths; fix the shared cause. Reuse code, stdlib,
native features, or installed dependencies. Match existing style. Skip unasked
extras, speculative features/config, needless abstractions, and impossible-state
guards; offer simpler alternatives. Remove task-created orphans; mention unrelated
dead code. Simplify structure, not formatting; preserve behavior; never force net-negative
diffs. Preserve unrelated edits. One caller is not waste: keep domain helpers,
tricky logic, side-effect boundaries, test seams, and framework contracts.
Keep security, accessibility, and hardware calibration.

Do not add code comments; remove nonessential comments.
Keep required license notices and functional tool directives.
Report rationale, constraints, checked invariants, shortcut ceilings, and upgrade paths in the final response.
Never add SAFETY:/lazy:/slop-check-ignore; verify necessary functional suppressions.

At boundaries: group behavior by reason to change; keep policy independent
of external details through ordinary parameters; give callers only needed
capabilities. Extend contracts for requested variations. Interchangeable
implementations preserve inputs, results, errors, and lifecycle; test the same
contract against each. No interfaces just for SOLID.

For boundary changes, read [design checks](${markdownLinkTarget(path.join(__dirname, "../skills/lazy/references/design-checks.md"))}).
One implementation alone is not waste; judge behavior and design separately.

Before finishing, infer obvious local types without any/unchecked casts;
normalize overloaded arguments once; avoid
throwing only to catch them locally. Remove guards/helpers only with caller/lifetime evidence. Match error and
cancellation semantics with native APIs. Preserve encoding and buffer ownership;
prove risky removals with regression or mutation checks.
Keep modules to one reason to change; no import-time I/O. Use exclusive-state
unions. On TypeScript 7 (native tsc) avoid baseUrl, moduleResolution node/node10,
target es5, outFile; keep the TypeScript 6 alias API tools need.
For TS/JS and tsconfig read [TS/JS checks](${markdownLinkTarget(path.join(__dirname, '../skills/lazy/references/simplification-checks.md'))}).
For Python read [Python checks](${markdownLinkTarget(path.join(__dirname, '../skills/lazy/references/python-checks.md'))}):
no mutable defaults, bare except, or \`if not x\` where 0 or "" is valid.

Preserve defaults, explicit false/zero/empty values, accepted input formats,
state, metadata, errors, generated files, lockfiles, and platform behavior.
Revalidate trust boundaries; bound external work; clean up tasks/timers/listeners
after success, failure, cancellation, and partial setup. Use existing tests.
Map changed requirements, edge cases, and failure modes to rerunnable tests;
add missing coverage. Inline probes alone are not coverage. Trivial edits need
no new tests. If red-green checks prove the risky regression, skip old-code reruns;
mutation work is optional; otherwise meaningful mutation evidence helps.
Never add a dependency for it. Test tasks cover every case.

For TS/JS, run the bundled checker from the repo root with the final tests:
node "${path.join(__dirname, '../skills/slop-check/scripts/check.mjs')}" --since=HEAD
Use task-base ref for commits; quote changed paths without Git.
Triage only task-owned findings; do not alter pre-existing work.
Report failed scans as failed, not clean.

TypeScript, JavaScript, Java, Python, Ruby, Rust, Go: detect languages in use;
read versions from the toolchain file, manifest, lockfile, or runtime. Keep advice
valid for the installed version. If unavailable, say so and do not guess;
research latest only when asked.

Keep in working context: requested deliverable, task-owned scope, required checks,
and action limits; no mandatory planning file.
After implementation/checks, review the task-owned diff once. Fix reproducible
in-scope findings and recheck affected behavior only with implementation/edit
authorization. Review-only/report-only requests: report findings without
modifications. Repeat review only for changed code, new concrete evidence, or
mandatory repo/user gates, not scores or unchanged findings. Reconsider scope
before broader guarantees or machinery.
A review budget never excuses a known required fix.
Stop only when requested needs and required checks are met; report blocked or
unverified work. A passed check proves its assertions, not general correctness;
distinguish behavior evidence from checker/review findings.

Check the diff, not memory: requested needs done; nothing unasked was added;
each changed line traces to the request or its verification; changed behavior has
tests that ran; language checks applied; checker findings triaged.
Report changes, checks actually run, and limits. Never claim an unrun check.
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
        .replace(/\(references\/([\w-]+\.md)\)/g, (_, file) => '(' + markdownLinkTarget(path.join(path.dirname(SKILL_PATH), 'references', file)) + ')')
        .replace('<skills-dir>', path.dirname(path.dirname(SKILL_PATH)));
  } catch (e) {
    return getFallbackInstructions(effectiveMode);
  }
}

// Both entry points use the same compact rules so safety and scope cannot drift.
const getSubagentInstructions = getLazyInstructions;

module.exports = {
  markdownLinkTarget,
  filterSkillBodyForMode,
  getFallbackInstructions,
  getLazyInstructions,
  getSubagentInstructions,
};
