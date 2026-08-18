#!/usr/bin/env node
// lazy-clean — PostToolUse hook: run the slop-check checker on the just-edited file.
// Advisory only: findings are surfaced as additionalContext, never as a block.

const path = require('path');
const { spawnSync } = require('child_process');

const CHECKER = path.join(__dirname, '..', 'skills', 'slop-check', 'scripts', 'check.mjs');
const EXTS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;
  try {
    // Strip UTF-8 BOM some shells prepend when piping (breaks JSON.parse)
    const data = JSON.parse(input.replace(/^\uFEFF/, ''));
    const file = (data.tool_input && data.tool_input.file_path) || '';
    if (!file || !EXTS.has(path.extname(file).toLowerCase())) return;

    const res = spawnSync(process.execPath, [CHECKER, file], { encoding: 'utf8', timeout: 20000 });
    if (res.status !== 1 || !res.stdout) return; // 0 = clean, anything else = checker broke

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: 'slop-check findings (heuristic — triage per slop-check SKILL.md, do not blindly silence):\n' + res.stdout,
      },
    }));
  } catch (e) {
    // Silent fail — a broken checker must never interrupt an edit.
  }
}

process.stdin.on('data', chunk => {
  input += chunk;
  // Bound stdin: a hook payload can carry a whole Write, never 32MB+.
  if (input.length > 32e6) { finish(); process.exit(0); }
});
// No exit() after the write: stdout to a pipe is async, exit() would truncate it.
process.stdin.on('end', finish);
// Never hang the session: same never-block contract as the lazy hooks.
process.stdin.on('error', () => { finish(); process.exit(0); });
setTimeout(() => { if (!done) { finish(); process.exit(0); } }, 1000).unref();
