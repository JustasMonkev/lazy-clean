import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grade, main, metrics, prepare, runAgent } from '../benchmarks/run.mjs';
import { tasks } from '../benchmarks/tasks.mjs';

const fixes = {
  'explicit-values': ['defaults.cjs', 'exports.options=x=>({enabled:x.enabled??true,retries:x.retries??3,label:x.label??"guest"});'],
  'shared-cause': ['app.cjs', 'const normalize=id=>id?.trim()??""; exports.button=normalize; exports.restore=s=>normalize(s.id);'],
  'user-edits': ['total.cjs', 'exports.total=xs=>xs.reduce((a,b)=>a+b,0);'],
  'useful-helper': ['tax.cjs', 'exports.taxCents=cents=>Math.round(cents*0.21);'],
  'input-compat': ['parse.cjs', 'exports.parse=raw=>{if(typeof raw!=="string"||!/^[a-z]{1,8}$/i.test(raw.trim()))throw new TypeError("ID"); return raw.trim().toLowerCase();};'],
  'requested-expiry': ['cache.cjs', 'exports.makeCache=(load,now)=>{const values=new Map();return key=>{let v=values.get(key);if(!v||now()-v.time>=60000){v={value:load(key),time:now()};values.set(key,v);}return v.value;};};'],
  'existing-tests': ['sum.cjs', 'exports.sum=xs=>xs.reduce((a,b)=>a+b,0);'],
  'trust-boundary': ['price.cjs', 'exports.parsePrice=raw=>{const x=JSON.parse(raw)?.price;if(typeof x!=="number"||!Number.isFinite(x)||x<0)throw new TypeError("price");return x;};'],
  'partial-cleanup': ['watch.cjs', 'exports.watch=(s,fn)=>{s.on("data",fn);try{s.on("end",fn);}catch(e){s.off("data",fn);throw e;}return()=>{s.off("data",fn);s.off("end",fn);};};'],
  'new-file-errors': ['config.cjs', 'exports.readConfig=path=>JSON.parse(require("node:fs").readFileSync(path,"utf8"));'],
};
const root = mkdtempSync(join(tmpdir(), 'lazy-eval-test-'));
try {
  const linked = join(root, 'linked benchmark');
  const entries = [fileURLToPath(new URL('../benchmarks/run.mjs', import.meta.url))];
  try {
    symlinkSync(fileURLToPath(new URL('../', import.meta.url)), linked, 'junction');
    entries.push(join(linked, 'benchmarks/run.mjs'));
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) throw error;
    console.log(`skip linked CLI (${error.code}: links unavailable)`);
  }
  for (const entry of entries) {
    for (const flags of [[], ['--preserve-symlinks-main']]) {
      const help = spawnSync(process.execPath, [...flags, entry, '--help'], { encoding: 'utf8', timeout: 5000 });
      assert.equal(help.status, 0, help.stderr);
      assert.match(help.stdout, /Usage: node benchmarks\/run.mjs/u);
      const invalid = spawnSync(process.execPath, [...flags, entry], { encoding: 'utf8', timeout: 5000 });
      assert.equal(invalid.status, 2, 'CLI must not silently succeed without arguments');
    }
  }
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e',
    `process.argv[1] = 'missing-entry.mjs'; await import(${JSON.stringify(new URL('../benchmarks/run.mjs', import.meta.url).href)});`],
    { cwd: root, encoding: 'utf8', timeout: 5000 });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, '', 'importing the runner must not invoke its CLI');
  assert.equal(tasks.length, 10);
  assert.equal(new Set(tasks.map(task => task.id)).size, 10);
  for (const task of tasks) {
    const cwd = join(root, task.id);
    prepare(task, cwd);
    assert.equal(grade(task, cwd).pass, false, `${task.id}: broken fixture passed`);
    const [file, source] = fixes[task.id];
    writeFileSync(join(cwd, file), source);
    if (task.id === 'existing-tests') writeFileSync(join(cwd, 'test.cjs'), task.files['test.cjs'] + 'assert.equal(sum([]),0);\n');
    const result = grade(task, cwd);
    assert.equal(result.pass, true, `${task.id}: ${result.output}`);
    // A concrete false-value mutation must be caught, then the fixed source restored.
    if (task.id === 'explicit-values') {
      writeFileSync(join(cwd, file), source.replace('x.enabled??true', 'x.enabled||true'));
      assert.equal(grade(task, cwd).pass, false);
      writeFileSync(join(cwd, file), source);
      assert.equal(grade(task, cwd).pass, true);
      const manifestPath = join(cwd, 'package.json');
      const originalManifest = readFileSync(manifestPath, 'utf8');
      const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies'];
      try {
        for (const field of fields) {
          const packages = field.startsWith('bundle') ? ['extra-package'] : { 'extra-package': '*' };
          writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(originalManifest), [field]: packages }));
          assert.equal(grade(task, cwd).pass, false, `${field} must fail the no-dependency task`);
        }
      } finally {
        writeFileSync(manifestPath, originalManifest);
      }
      assert.equal(grade(task, cwd).pass, true);
    }
  }
  assert.deepEqual(metrics('{}'), { costUsd: null, tokens: null, models: [], agentError: false, permissionDenials: null });
  assert.equal(metrics('not json').tokens, null);
  assert.equal(metrics('{"usage":{"input_tokens":1,"output_tokens":2,"cache_read_input_tokens":4},"total_cost_usd":0}').tokens, 7);
  assert.equal(metrics('{"usage":{"input_tokens":-1,"output_tokens":2},"total_cost_usd":-1}').costUsd, null);
  assert.equal(metrics('{"is_error":true}').agentError, true);
  const initialListeners = process.listenerCount('SIGTERM');
  const interrupted = runAgent([process.execPath, '-e', 'setInterval(()=>{},1000);'], root, '', 5000);
  process.emit('SIGTERM');
  assert.equal((await interrupted).error, 'interrupted');
  assert.equal(process.listenerCount('SIGTERM'), initialListeners);
  const echo = await runAgent([process.execPath, '-e', 'process.stdin.pipe(process.stdout);'], root, 'hello', 5000);
  assert.equal(echo.status, 0); assert.equal(echo.stdout, 'hello');
  assert.equal((await runAgent([join(root, 'missing-agent')], root, '', 1000)).error, 'ENOENT');
  assert.equal((await runAgent([process.execPath, '-e', 'setInterval(()=>{},1000);'], root, '', 100)).error, 'timeout');
  assert.equal((await runAgent([process.execPath, '-e', 'process.stdout.write("x".repeat(9*1024*1024));'], root, '', 5000)).error, 'output limit');
  const config = join(root, 'config.json');
  // A fake agent tests transport and reporting only, never AI quality.
  writeFileSync(config, JSON.stringify({ command: [process.execPath, '-e', `require('node:fs').writeFileSync('defaults.cjs',${JSON.stringify(fixes['explicit-values'][1])});`], model: 'fake-test-only', trials: 1 }));
  const out = join(root, 'results');
  assert.equal(await main([config, out, 'explicit-values']), 0);
  const report = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8'));
  assert.deepEqual(report.results.map(x => [x.arm, x.pass, x.tokens]), [['off', true, null], ['on', true, null]]);
  assert.match(readFileSync(join(out, 'explicit-values-1-on/prompt.txt'), 'utf8'), /LAZY MODE ACTIVE/u);
  assert.doesNotMatch(readFileSync(join(out, 'explicit-values-1-off/prompt.txt'), 'utf8'), /LAZY MODE ACTIVE/u);
  const failedOut = join(root, 'failed-results');
  const failedConfig = JSON.parse(readFileSync(config, 'utf8'));
  failedConfig.command[2] += 'process.exitCode=1;';
  writeFileSync(config, JSON.stringify(failedConfig));
  assert.equal(await main([config, failedOut, 'explicit-values']), 0);
  assert.ok(JSON.parse(readFileSync(join(failedOut, 'results.json'), 'utf8')).results.every(x => !x.pass));
  await assert.rejects(main([config, out, 'explicit-values']), /EEXIST/u);
  await assert.rejects(main([config, join(root, 'bad-task'), 'missing']), /unknown task/u);
  writeFileSync(config, JSON.stringify({ command: [], model: 'bad', trials: 0 }));
  await assert.rejects(main([config]), /invalid/u);
  console.log('benchmarks: 10 broken/fixed tasks, mutation, runner failures, metrics, and paired evidence passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
