#!/usr/bin/env node
// lazy-clean — PostToolUse hook: run the slop-check checker on the just-edited file.
// Advisory only: findings are surfaced as additionalContext, never as a block.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readHookInput } = require('./lazy-input');

const CHECKER = path.join(__dirname, '..', 'skills', 'slop-check', 'scripts', 'check.mjs');
const EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
// Rules can carry startLine/endLine evidence beyond their diagnostic anchor.
// Comment rules do not: a multi-line comment still reports at its `/**`,
// and no-restating-comments reports at the comment above the code it restates,
// so the headroom above the written line has to stay.
const PAD_UP = 3;
const PAD_DOWN = 1;
// A findings list past this is not review context, it is a wall. The file is
// still there to scan in full if the agent wants the rest.
const MAX_REPORTED = 40;

function matchingRanges(toolInput, content) {
  const edits = Array.isArray(toolInput.edits)
    ? toolInput.edits
    : typeof toolInput.new_string === 'string' ? [toolInput] : null;
  if (!edits) return null;

  const ranges = [];
  for (const edit of edits) {
    const text = edit.new_string;
    if (typeof text !== 'string' || text === '') return null;
    const at = content.indexOf(text);
    if (at === -1) return null;
    if (!edit.replace_all && at !== content.lastIndexOf(text)) return null;
    // A trailing newline is the end of the last written line, not a line of
    // its own: without this a one-line edit claimed the line below it too.
    const height = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    // Counted on from the previous match: re-splitting the whole prefix per
    // match made a replace_all on a large file quadratic.
    let start = 1;
    let counted = 0;
    for (let from = at; from !== -1; from = content.indexOf(text, from + text.length)) {
      start += content.slice(counted, from).split('\n').length - 1;
      counted = from;
      ranges.push([start - PAD_UP, start + height - 1 + PAD_DOWN]);
      if (!edit.replace_all) break;
    }
  }
  ranges.sort(([first], [second]) => first - second);
  const merged = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], range[1]);
    } else {
      merged.push(range);
    }
  }
  return merged;
}

function overlapsEdit(ranges, finding) {
  const start = finding.startLine ?? finding.line;
  const end = finding.endLine ?? finding.line;
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (ranges[mid][1] < start) low = mid + 1;
    else high = mid;
  }
  return low < ranges.length && ranges[low][0] <= end;
}

function selectFindings(findings) {
  if (findings.length <= MAX_REPORTED) return findings;
  const unseenRules = new Set(findings.map(f => f.rule));
  let repeatSlots = MAX_REPORTED - unseenRules.size;
  const shown = [];
  for (const finding of findings) {
    if (!unseenRules.delete(finding.rule)) {
      if (repeatSlots <= 0) continue;
      repeatSlots--;
    }
    shown.push(finding);
    if (shown.length === MAX_REPORTED) break;
  }
  return shown;
}

function render(findings) {
  const groups = [
    ['fix', 'Fix (mechanical, one correct answer):'],
    ['review', 'Review (heuristic — "deliberate, leaving it" is a valid answer):'],
  ];
  // Every finding is in the one file just edited, and a rule's message repeats
  // verbatim; restating both on each line was most of a large report's tokens.
  const stated = new Set();
  const lines = [];
  for (const [severity, heading] of groups) {
    const group = findings.filter(f => f.severity === severity);
    if (group.length === 0) continue;
    lines.push(heading);
    for (const f of group) {
      const key = `${f.rule}\0${f.message}`;
      const message = stated.has(key) ? '' : ` — ${f.message}`;
      stated.add(key);
      const label = f.rule === 'require-safety-comment-for-type-assertion' ? 'type assertion review' : f.rule;
      lines.push(`  ${path.basename(f.path)}:${f.line}:${f.column} ${label}${message}`);
    }
  }
  return lines.join('\n');
}

function report(context) {
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context },
    }));
  } catch { /* A closed output pipe must not turn advice into a hook failure. */ }
}

function check(data) {
  // A malformed tool payload (data === null) cannot identify a file to check.
  const toolInput = data?.tool_input || {};
  const file = toolInput.file_path;
  if (typeof file !== 'string' || !EXTS.has(path.extname(file).toLowerCase())) return;
  try {
    // maxBuffer: the default 1MB is ~3,000 findings of JSON. Overrunning it
    // ends the child with a null status, which read as "the checker broke" and
    // dropped the report for exactly the files that needed it most.
    // `--` before the path: a file whose name starts with `-` is an unknown
    // option to the checker, which exits 2, and this hook then reports nothing
    // for a file the manual CLI can scan perfectly well after the same marker.
    const res = spawnSync(process.execPath, [CHECKER, '--json', '--', file], { encoding: 'utf8', timeout: 20000, maxBuffer: 64e6 });
    if (res.error || ![0, 1].includes(res.status) || !res.stdout) throw new Error('scan incomplete');
    const all = JSON.parse(res.stdout);
    if (!Array.isArray(all) || (res.status === 0) !== (all.length === 0) || all.some(f => !f || typeof f.path !== 'string'
      || !Number.isInteger(f.line) || f.line < 1 || !Number.isInteger(f.column) || f.column < 1
      || f.startLine !== undefined && (!Number.isInteger(f.startLine) || f.startLine < 1 || f.startLine > f.line)
      || f.endLine !== undefined && (!Number.isInteger(f.endLine) || f.endLine < f.line)
      || typeof f.rule !== 'string' || typeof f.message !== 'string'
      || !['fix', 'review'].includes(f.severity))) throw new Error('invalid checker output');
    if (res.status === 0) {
      const skipped = res.stderr.split('\n').find(line => line.startsWith('slop-check: skipped '));
      if (skipped) report(`${skipped}; this edit was not verified.`);
      return;
    }

    let ranges = null;
    try {
      ranges = matchingRanges(toolInput, fs.readFileSync(file, 'utf8'));
    } catch (e) {
      // Unreadable after the write: fall back to reporting everything.
    }
    // Overlap, not containment: a block rule reports at the `catch`/`if`/`let`
    // that opens the block, which can sit well above the body the edit wrote.
    // Comparing only the reported line dropped the finding the edit had just
    // created, and the hook then printed nothing at all.
    const mine = ranges
      ? all.filter(f => overlapsEdit(ranges, f))
      : all;
    if (mine.length === 0) return;

    const shown = selectFindings(mine);
    const truncated = mine.length - shown.length;
    const elsewhere = all.length - mine.length;
    const context =
      (ranges
        ? 'slop-check findings near matching replacement text (not proof these findings were introduced by this edit)'
        : data?.tool_name === 'Write'
          ? 'slop-check findings for the file you just wrote'
          : 'slop-check file-wide findings (edit scope unknown; not attributed to this edit)') +
      ' (heuristic — triage per slop-check SKILL.md, do not blindly silence):\n' +
      render(shown) +
      (truncated > 0 ? `\n(${truncated} more on these lines, not listed.)` : '') +
      (elsewhere > 0
        ? `\n(${elsewhere} further finding${elsewhere === 1 ? '' : 's'} elsewhere in this file, not attributed to this edit.)`
        : '');

    report(context);
  } catch (e) {
    report('slop-check: check failed; this edit was not verified. Run the bundled checker with --since=HEAD from the repo root before finishing (use the task base ref for committed changes, or explicit changed paths without Git). This is advisory, not a clean result.');
  }
}

process.stdout.on('error', () => { /* The host may close the advisory pipe early. */ });

// No exit() after the write: stdout to a pipe is async, exit() would truncate it.
readHookInput(check, { waitForEnd: true });
