import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, lstatSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tasks as coreTasks } from './tasks.mjs';
import { tasks as solidTasks } from './solid-tasks.mjs';

const require = createRequire(import.meta.url);
const { getLazyInstructions } = require('../hooks/lazy-instructions.js');
const root = dirname(fileURLToPath(import.meta.url));
const limit = 8 * 1024 * 1024;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10000, maxBuffer: limit });
  if (result.status !== 0) throw new Error(result.stderr || 'git failed');
  return result.stdout;
}

export function prepare(task, cwd) {
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ private: true, scripts: { test: 'node test.cjs' } }));
  writeFileSync(join(cwd, 'test.cjs'), 'console.log("No local tests yet; add task checks here.");\n');
  for (const [name, body] of Object.entries(task.files)) writeFileSync(join(cwd, name), body);
  git(cwd, ['init', '-q']);
  git(cwd, ['add', '-f', '--', 'package.json', 'test.cjs', ...Object.keys(task.files)]);
  git(cwd, ['-c', 'user.name=Eval', '-c', 'user.email=eval@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture']);
  for (const [name, body] of Object.entries(task.dirty || {})) writeFileSync(join(cwd, name), body);
}

export async function grade(task, cwd) {
  const complete = `\n${randomUUID()}\n`;
  const result = await runAgent([process.execPath, '-e', `const assert=require('node:assert/strict'); const fs=require('node:fs');
${task.check}
const manifest=JSON.parse(fs.readFileSync('package.json','utf8'));
for(const field of ['dependencies','devDependencies','optionalDependencies','peerDependencies','bundledDependencies','bundleDependencies'])
assert.equal(Object.keys(manifest[field] || {}).length,0);
const dirs=['.']; let entries=0;
while(dirs.length) {
  const dir=dirs.pop();
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    assert(++entries<=1000,'workspace file limit');
    assert.notEqual(entry.name,'node_modules','unexpected installed dependency');
    if(entry.isDirectory() && entry.name!=='.git') dirs.push(dir+'/'+entry.name);
  }
}
process.stdout.write(${JSON.stringify(complete)});`], cwd, '', 10000);
  const completed = result.stdout.includes(complete);
  return { pass: result.status === 0 && !result.error && completed, output: result.stdout.replace(complete, '') + result.stderr,
    error: result.error || (result.status === 0 && !completed ? 'incomplete grader' : null) };
}

// No shell interpolation. Kill the process tree on timeout or output overflow.
export function runAgent(command, cwd, prompt, timeoutMs) {
  return new Promise((done) => {
    const child = spawn(command[0], command.slice(1), { cwd, detached: process.platform !== 'win32', stdio: 'pipe' });
    const chunks = { stdout: [], stderr: [] };
    let bytes = 0;
    let failure = null;
    let killTimer;
    const started = Date.now();
    const stop = reason => {
      if (failure) return;
      failure = reason;
      if (child.pid) {
        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { timeout: 5000, stdio: 'ignore' });
        } else {
          try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') child.kill('SIGKILL'); }
        }
      }
      // Descendants outside the process group must not hold our pipes forever.
      killTimer = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); }, 1000);
    };
    const interrupt = () => stop('interrupted');
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    for (const stream of ['stdout', 'stderr']) {
      child[stream].on('data', chunk => {
        bytes += chunk.length;
        if (bytes > limit) stop('output limit');
        else chunks[stream].push(chunk);
      });
    }
    child.on('error', error => { failure = error.code; });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') stop(error.code); });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      done({ status, signal, error: failure, ms: Date.now() - started,
        stdout: Buffer.concat(chunks.stdout).toString(), stderr: Buffer.concat(chunks.stderr).toString() });
    });
    child.stdin.end(prompt);
  });
}

function sourceBytes(cwd) {
  let bytes = 0;
  let count = 0;
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (++count > 1000) throw new Error('workspace file limit');
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const file = join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && /\.[cm]?js$/u.test(entry.name)) bytes += lstatSync(file).size;
      if (bytes > limit) throw new Error('workspace byte limit');
    }
  }
  visit(cwd);
  return bytes;
}

export function metrics(stdout) {
  try {
    const result = JSON.parse(stdout);
    const usage = result.usage;
    const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    const fields = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];
    return {
      costUsd: valid(result.total_cost_usd) ? result.total_cost_usd : null,
      tokens: usage && valid(usage.input_tokens) && valid(usage.output_tokens)
        && fields.every(key => usage[key] === undefined || valid(usage[key]))
        ? fields.reduce((total, key) => total + (usage[key] ?? 0), 0) : null,
      models: result.modelUsage && typeof result.modelUsage === 'object' ? Object.keys(result.modelUsage).sort() : [],
      agentError: result.is_error === true,
      permissionDenials: Array.isArray(result.permission_denials) ? result.permission_denials.length : null,
    };
  } catch {
    return { costUsd: null, tokens: null, models: [], agentError: false, permissionDenials: null };
  }
}

export async function main(args) {
  if (args.length < 1 || args.length > 3 || args.includes('--help')) {
    console.log('Usage: node benchmarks/run.mjs <config.json> [new-output-dir] [task-id]\nConfig: {"command":["agent","args"],"model":"exact model id","trials":3,"timeoutMs":180000,"mode":"full"}');
    return args.includes('--help') ? 0 : 2;
  }
  const config = JSON.parse(readFileSync(args[0], 'utf8'));
  const { command, model, trials = 3, timeoutMs = 180000, mode = 'full', taskSet = 'core' } = config;
  if (!Array.isArray(command) || !command.length || command.some(x => typeof x !== 'string' || x.includes('\0')) || !command[0]
    || typeof model !== 'string' || !model.trim() || !Number.isInteger(trials) || trials < 1 || trials > 10
    || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000 || !['lite', 'full', 'ultra'].includes(mode) || !['core', 'solid'].includes(taskSet)) {
    throw new Error('invalid command, model, trials (1–10), timeoutMs (100–600000), mode, or taskSet');
  }
  const tasks = taskSet === 'solid' ? solidTasks : coreTasks;
  const selected = args[2] ? tasks.filter(task => task.id === args[2]) : tasks;
  if (!selected.length) throw new Error('unknown task id');
  // Refuse to overwrite prior evidence. Workspaces are retained for inspection.
  const output = args[1] ? resolve(args[1]) : mkdtempSync(join(tmpdir(), 'lazy-eval-'));
  if (args[1]) mkdirSync(output);
  const report = { schema: 1, created: new Date().toISOString(), commit: git(root, ['rev-parse', 'HEAD']).trim(),
    dirty: git(root, ['status', '--porcelain']).length > 0, config: { command, model, trials, timeoutMs, mode, taskSet }, results: [] };
  const save = () => writeFileSync(join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  save();
  for (const [taskIndex, task] of selected.entries()) {
    for (let trial = 1; trial <= trials; trial++) {
      // Counterbalance across tasks as well as trials, including odd trial counts.
      for (const arm of (trial + taskIndex) % 2 ? ['off', 'on'] : ['on', 'off']) {
        const dir = join(output, `${task.id}-${trial}-${arm}`);
        const cwd = join(dir, 'work');
        prepare(task, cwd);
        const prompt = `Work only in this task workspace. Do not read benchmark files or other task workspaces. Implement the request and run local tests. Do not install dependencies.\n\n${task.prompt}\n\n${arm === 'on' ? getLazyInstructions(mode) : ''}`;
        writeFileSync(join(dir, 'prompt.txt'), prompt);
        const before = sourceBytes(cwd);
        const run = await runAgent(command, cwd, prompt, timeoutMs);
        let interrupted = run.error === 'interrupted';
        writeFileSync(join(dir, 'stdout.txt'), run.stdout);
        writeFileSync(join(dir, 'stderr.txt'), run.stderr);
        const measured = metrics(run.stdout);
        const verdict = interrupted ? { pass: false, output: 'Skipped: interrupted.\n', error: 'interrupted' } : await grade(task, cwd);
        interrupted ||= verdict.error === 'interrupted';
        writeFileSync(join(dir, 'grade.txt'), verdict.output);
        const result = { task: task.id, trial, arm, pass: run.status === 0 && !run.error && !measured.agentError && verdict.pass,
          status: run.status, error: interrupted ? 'interrupted' : run.error, gradeError: verdict.error, ms: run.ms, sourceBytesBefore: before, sourceBytesAfter: interrupted ? null : sourceBytes(cwd), ...measured };
        report.results.push(result);
        save();
        console.log(`${task.id} ${trial} ${arm}: ${result.pass ? 'PASS' : 'FAIL'} (${run.ms}ms)`);
        if (interrupted) return 130;
      }
    }
  }
  console.log(`Evidence: ${join(output, 'results.json')}. Compare correctness first; cost/time/size only for paired passing runs. No automatic improvement claim.`);
  return 0;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) return true;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false; // Programmatic entry points need not name a file.
  }
}

if (isMainModule()) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
    console.error(error.message); process.exitCode = 2;
  });
}
