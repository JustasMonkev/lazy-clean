#!/usr/bin/env node
// lazy-clean — PostToolUse hook: run the slop-check checker on the just-edited file.
// Advisory only: findings are surfaced as additionalContext, never as a block.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const CHECKER = path.join(__dirname, '..', 'skills', 'slop-check', 'scripts', 'check.mjs');
const EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
// Block rules report at the `catch`/`try` above the body that was edited.
const PAD = 1;
// A findings list past this is not review context, it is a wall. The file is
// still there to scan in full if the agent wants the rest.
const MAX_REPORTED = 40;

let input = '';
let done = false;

// Line ranges this tool call actually wrote. null means "the whole file": a
// Write authored all of it, and an edit we cannot locate unambiguously has no
// safe narrower answer.
function writtenRanges(toolInput, content) {
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
    const height = text.split('\n').length;
    for (let from = at; from !== -1; from = content.indexOf(text, from + text.length)) {
      const start = content.slice(0, from).split('\n').length;
      ranges.push([start - PAD, start + height - 1 + PAD]);
      if (!edit.replace_all) break;
    }
  }
  return ranges;
}

function render(findings) {
  const groups = [
    ['fix', 'Fix (mechanical, one correct answer):'],
    ['review', 'Review (heuristic — "deliberate, leaving it" is a valid answer):'],
  ];
  const lines = [];
  for (const [severity, heading] of groups) {
    const group = findings.filter(f => f.severity === severity);
    if (group.length === 0) continue;
    lines.push(heading);
    for (const f of group) lines.push(`  ${f.path}:${f.line}:${f.column} ${f.rule} — ${f.message}`);
  }
  return lines.join('\n');
}

function finish() {
  if (done) return;
  done = true;
  try {
    // Strip UTF-8 BOM some shells prepend when piping (breaks JSON.parse)
    const data = JSON.parse(input.replace(/^\uFEFF/, ''));
    const toolInput = data.tool_input || {};
    const file = toolInput.file_path || '';
    if (!file || !EXTS.has(path.extname(file).toLowerCase())) return;

    const res = spawnSync(process.execPath, [CHECKER, file, '--json'], { encoding: 'utf8', timeout: 20000 });
    if (res.status !== 1 || !res.stdout) return; // 0 = clean, anything else = checker broke
    const all = JSON.parse(res.stdout);
    if (all.length === 0) return;

    // Only report what this edit wrote. Handing back the whole file's findings
    // invited edits outside the task — the opposite of the surgical-changes
    // rule this package ships — and re-served the same ones after every edit.
    let ranges = null;
    try {
      ranges = writtenRanges(toolInput, fs.readFileSync(file, 'utf8'));
    } catch (e) {
      // Unreadable after the write: fall back to reporting everything.
    }
    const mine = ranges ? all.filter(f => ranges.some(([a, b]) => f.line >= a && f.line <= b)) : all;
    if (mine.length === 0) return;

    const shown = mine.slice(0, MAX_REPORTED);
    const truncated = mine.length - shown.length;
    const elsewhere = all.length - mine.length;
    const context =
      'slop-check findings for the lines you just wrote (heuristic — triage per slop-check SKILL.md, do not blindly silence):\n' +
      render(shown) +
      (truncated > 0 ? `\n(${truncated} more on these lines, not listed.)` : '') +
      (elsewhere > 0
        ? `\n(${elsewhere} further finding${elsewhere === 1 ? '' : 's'} elsewhere in this file predate${elsewhere === 1 ? 's' : ''} this edit — out of scope, leave them alone.)`
        : '');

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: context,
      },
    }));
  } catch (e) {
    // Silent fail — a broken checker must never interrupt an edit.
  }
}

process.stdin.on('data', chunk => {
  input += chunk;
  // Bound stdin: a hook payload can carry a whole Write, never 32MB+.
  if (input.length > 32e6) { finish(); process.stdin.destroy(); }
});
// No exit() after the write: stdout to a pipe is async, exit() would truncate it.
process.stdin.on('end', finish);
// Never hang the session: same never-block contract as the lazy hooks.
process.stdin.on('error', () => { finish(); process.stdin.destroy(); });
setTimeout(() => { if (!done) { finish(); process.stdin.destroy(); } }, 1000).unref();
