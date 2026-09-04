import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = mkdtempSync(join(tmpdir(), 'lazy-feedback-'));
try {
  mkdirSync(join(root, 'hooks'));
  mkdirSync(join(root, 'skills/slop-check/scripts'), { recursive: true });
  const hook = join(root, 'hooks/edit-check.js');
  const checker = join(root, 'skills/slop-check/scripts/check.mjs');
  copyFileSync(fileURLToPath(new URL('../hooks/edit-check.js', import.meta.url)), hook);
  const file = join(root, 'app.ts');
  writeFileSync(file, 'export const n = 1;\n');
  for (const source of [
    'process.exitCode = 2;',
    'console.log("not json"); process.exitCode = 1;',
    'console.log("{}"); process.exitCode = 1;',
    'console.log("[null]"); process.exitCode = 1;',
    'console.log("[{}]"); process.exitCode = 1;',
    'process.kill(process.pid, "SIGKILL");',
  ]) {
    writeFileSync(checker, source);
    const result = spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ tool_input: { file_path: file } }), encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, undefined);
    assert.equal(output.hookSpecificOutput.permissionDecision, undefined);
    assert.match(output.hookSpecificOutput.additionalContext, /check failed/u);
    assert.match(output.hookSpecificOutput.additionalContext, /--since=HEAD/u);
  }
  rmSync(checker);
  const missing = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_input: { file_path: file } }), encoding: 'utf8', timeout: 5000,
  });
  assert.equal(missing.status, 0);
  assert.match(JSON.parse(missing.stdout).hookSpecificOutput.additionalContext, /check failed/u);
  const closed = spawn(process.execPath, [hook], { stdio: ['pipe', 'pipe', 'pipe'] });
  const deadline = setTimeout(() => closed.kill('SIGKILL'), 5000);
  closed.stdout.destroy();
  closed.stdin.end(JSON.stringify({ tool_input: { file_path: file } }));
  try {
    assert.equal(await new Promise(resolve => closed.on('close', resolve)), 0);
  } finally {
    clearTimeout(deadline);
  }
  console.log('feedback: failed, malformed, killed, and missing scans stay advisory and visible');
} finally {
  rmSync(root, { recursive: true, force: true });
}
