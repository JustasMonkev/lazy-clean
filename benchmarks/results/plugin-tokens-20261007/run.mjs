import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = resolve(process.argv[3]);
const runner = await import(pathToFileURL(join(config.runnerRoot, 'benchmarks/run.mjs')).href);
const { tasks } = await import(pathToFileURL(join(config.runnerRoot, 'benchmarks/tasks.mjs')).href);
const selected = config.tasks ? tasks.filter(t => config.tasks.includes(t.id)) : tasks;
mkdirSync(out, { recursive: true });

const jobs = [];
for (let trial = 1; trial <= config.trials; trial++)
  for (const task of selected)
    for (const model of config.models)
      for (const [arm, pluginDir] of Object.entries(config.arms))
        jobs.push({ trial, task, model, arm, pluginDir });

function analyze(stdout) {
  const lines = stdout.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const result = lines.findLast(l => l.type === 'result') || null;
  const tools = [];
  let assistantMessages = 0;
  for (const l of lines) {
    if (l.type !== 'assistant' || !l.message) continue;
    assistantMessages++;
    for (const c of l.message.content || []) if (c.type === 'tool_use') tools.push({ name: c.name, input: c.input });
  }
  const u = result?.usage || {};
  const total = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'].reduce((a, k) => a + (u[k] || 0), 0);
  const str = t => JSON.stringify(t.input || {});
  return {
    ok: !!result && result.is_error === false && result.subtype === 'success',
    turns: result?.num_turns ?? null,
    costUsd: result?.total_cost_usd ?? null,
    input: u.input_tokens ?? null, cacheWrite: u.cache_creation_input_tokens ?? null, cacheRead: u.cache_read_input_tokens ?? null,
    output: u.output_tokens ?? null, totalTokens: result ? total : null,
    modelUsage: result?.modelUsage ? Object.keys(result.modelUsage) : [],
    denials: Array.isArray(result?.permission_denials) ? result.permission_denials.length : null,
    toolCalls: tools.length,
    skills: tools.filter(t => t.name === 'Skill').map(t => t.input?.skill || t.input?.command || str(t)),
    refReads: tools.filter(t => t.name === 'Read' && /skills\//.test(t.input?.file_path || '')).map(t => t.input.file_path.replace(/^.*skills\//, '')),
    slopRuns: tools.filter(t => t.name === 'Bash' && /check\.mjs/.test(t.input?.command || '')).length,
    toolNames: tools.map(t => t.name),
  };
}

async function runJob(job) {
  const dir = join(out, job.model, job.arm, `${job.task.id}-${job.trial}`);
  if (existsSync(join(dir, 'result.json'))) return JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
  const work = join(dir, 'work');
  const cfg = join(dir, 'cfg');
  mkdirSync(cfg, { recursive: true });
  writeFileSync(join(cfg, '.lazy-statusline-nudged'), '');
  runner.prepare(job.task, work);
  const prompt = `Work only in this task workspace. Do not read benchmark files or other task workspaces. Implement the request and run local tests. Do not install dependencies.\n\n${job.task.prompt}\n`;
  const command = ['claude', '-p', '--model', job.model, '--effort', config.effort, '--output-format', 'stream-json', '--verbose',
    '--no-session-persistence', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '',
    '--permission-mode', 'acceptEdits', '--tools', 'Read,Write,Edit,Bash,Glob,Grep,Skill',
    '--allowedTools', config.allowedTools,
    '--max-budget-usd', String(config.budgetUsd),
    ...(job.pluginDir ? ['--plugin-dir', job.pluginDir] : [])];
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg };
  for (const k of ['CLAUDE_EFFORT', 'CLAUDE_CODE_SESSION_ID', 'LAZY_DEFAULT_MODE', 'LAZY_SUBAGENT_MATCHER']) delete env[k];
  const run = await runAgentEnv(command, work, prompt, config.timeoutMs, env);
  writeFileSync(join(dir, 'stream.jsonl'), run.stdout);
  writeFileSync(join(dir, 'stderr.txt'), run.stderr);
  const a = analyze(run.stdout);
  const verdict = await runner.grade(job.task, work);
  writeFileSync(join(dir, 'grade.txt'), verdict.output);
  const res = { model: job.model, arm: job.arm, task: job.task.id, trial: job.trial, pass: run.status === 0 && !run.error && a.ok && verdict.pass,
    status: run.status, error: run.error, ms: run.ms, ...a };
  writeFileSync(join(dir, 'result.json'), JSON.stringify(res, null, 2));
  appendFileSync(join(out, 'results.jsonl'), JSON.stringify(res) + '\n');
  console.log(`${res.model} ${res.arm} ${res.task}#${res.trial} ${res.pass ? 'PASS' : 'FAIL'} tokens=${res.totalTokens} turns=${res.turns} skills=${res.skills} refs=${res.refReads} slop=${res.slopRuns}`);
  return res;
}

function runAgentEnv(command, cwd, prompt, timeoutMs, env) {
  return new Promise(done => {
    const child = spawn(command[0], command.slice(1), { cwd, env, detached: true, stdio: 'pipe' });
    const chunks = { stdout: [], stderr: [] };
    let failure = null;
    const started = Date.now();
    const timer = setTimeout(() => { failure = 'timeout'; try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') child.kill('SIGKILL'); } }, timeoutMs);
    for (const s of ['stdout', 'stderr']) child[s].on('data', c => chunks[s].push(c));
    child.on('error', e => { failure = e.code; });
    child.on('close', status => {
      clearTimeout(timer);
      done({ status, error: failure, ms: Date.now() - started, stdout: Buffer.concat(chunks.stdout).toString(), stderr: Buffer.concat(chunks.stderr).toString() });
    });
    child.stdin.end(prompt);
  });
}

let next = 0;
await Promise.all(Array.from({ length: config.concurrency }, async () => {
  while (next < jobs.length) await runJob(jobs[next++]);
}));
console.log('done', jobs.length);
