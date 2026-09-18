import assert from 'node:assert/strict';
import { spawnSync, execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { bundleDigest } from '../skills/lazy-verify/scripts/verify.mjs';
import { digest, resultExit, validateResult } from '../skills/lazy-verify/scripts/protocol.mjs';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'lazy-verify-tests-')));
const target = join(scratch, 'target');
const controller = join(scratch, 'controller ü space');
const install = join(scratch, 'skills only ü space');
mkdirSync(target);
mkdirSync(controller);
cpSync(join(repo, 'skills/lazy-verify'), install, { recursive: true });
const cli = join(install, 'scripts/verify.mjs');
execFileSync('git', ['init', '-q', target]);
mkdirSync(join(target, '.lazy-verify/contracts/example'), { recursive: true });
writeFileSync(join(target, '.lazy-verify/contracts/example/contract.json'), '{"adapter":"node-script-v1"}');
cpSync(join(repo, 'tests/fixtures/verify/engine-stub.mjs'), join(controller, 'engine.mjs'));
const configPath = join(target, '.lazy-verify.json');
const policyPath = join(scratch, 'policy.json');
let policy;
let failures = 0;
let passed;
function setup(scenario = {}, mode = 'fix') {
  writeFileSync(join(controller, 'scenario.json'), JSON.stringify(scenario));
  const profile = { mode, contract: '.lazy-verify/contracts/example/contract.json', requiredChecks: ['suite'] };
  const config = JSON.stringify({ schemaVersion: 1, profiles: { example: profile } });
  writeFileSync(configPath, config);
  policy = { schemaVersion: 1, repositoryRoot: target, profile: 'example', configDigest: digest(config),
    profileDigest: digest(JSON.stringify(profile)), contractDigest: bundleDigest(join(target, '.lazy-verify/contracts/example')),
    engine: { node: process.execPath, entry: join(controller, 'engine.mjs'), version: 'fixture-1', digest: bundleDigest(controller), nodeMajor: Number(process.versions.node.split('.')[0]) },
    commands: [{ id: 'suite', executable: process.execPath, args: ['tests.mjs'] }], budgets: { totalMs: 2000 }, repetitions: 3, excludeUntracked: [] };
  savePolicy();
}
function savePolicy() { writeFileSync(policyPath, JSON.stringify(policy)); }
function run(args, nodeArgs = []) { return spawnSync(process.execPath, [...nodeArgs, cli, ...args, '--format', 'json'], { cwd: target, encoding: 'utf8', timeout: 10000 }); }
const verifyArgs = () => ['verify', '--profile', 'example', '--base', 'base', '--head', 'worktree', '--policy', policyPath, '--trust-code'];
function verify(nodeArgs) { return run(verifyArgs(), nodeArgs); }
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}: ${error.stack}`); }
}
function expected(result, status, code) {
  assert.equal(result.status, status, result.stdout + result.stderr);
  const data = JSON.parse(result.stdout);
  if (code) assert.ok(data.reasonCodes.includes(code), result.stdout);
  return data;
}

try {
  setup();
  for (const args of [[], ['verify'], ['doctor'], ['verify', '--mode', 'fix'], [...verifyArgs(), '--head', 'HEAD'],
    verifyArgs().filter((arg) => arg !== '--trust-code'), [...verifyArgs(), '--include-untracked', '../escape']]) {
    check(`reject invalid/unauthorized CLI ${args.join(' ')}`, () => expected(run(args), 2));
  }
  check('symlinked CLI executes and rejects invalid commands', () => {
    const link = join(scratch, 'verify-link.mjs');
    symlinkSync(cli, link);
    const result = spawnSync(process.execPath, [link, 'invalid', '--format', 'json'], { cwd: target, encoding: 'utf8', timeout: 10000 });
    expected(result, 2, 'INVALID_INPUT');
  });
  check('early CLI errors use only the explicit format flag', () => {
    const args = ['verify', '--profile', 'json', '--base', 'b', '--head', 'h'];
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: target, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 2);
    assert.match(result.stdout, /^lazy-verify/u);
    expected(run(args), 2, 'INVALID_INPUT');
  });
  check('bundle aggregate limit counts bytes read despite stale stats', () => {
    const bundle = join(scratch, 'growing-bundle'); mkdirSync(bundle);
    for (const name of ['first', 'second']) writeFileSync(join(bundle, name), Buffer.alloc(17 * 1024 * 1024));
    const preload = join(scratch, 'stale-stats.cjs');
    writeFileSync(preload, `
      const fs = require('node:fs');
      const original = fs.lstatSync;
      fs.lstatSync = (...args) => { const stat = original(...args); stat.size = 0; return stat; };
      require('node:module').syncBuiltinESMExports();
    `);
    const code = `import { bundleDigest } from ${JSON.stringify(pathToFileURL(cli).href)}; bundleDigest(${JSON.stringify(bundle)});`;
    const result = spawnSync(process.execPath, ['--require', preload, '--input-type=module', '-e', code], { encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exceeds byte limit/u);
  });
  check('report never executes a manifest', () => {
    const path = join(scratch, 'hostile.json');
    writeFileSync(path, '{"command":"touch injected"}');
    expected(run(['report', path]), 2);
  });
  const plugin = (await import(pathToFileURL(join(repo, '.opencode/plugins/lazy.mjs')))).default;
  const hooks = await plugin();
  const discovered = {};
  await hooks.config(discovered);
  check('OpenCode discovers shared skill command and preserves existing commands', () => {
    assert.match(discovered.command['lazy-verify'].template, /lazy-verify\/SKILL.md/u);
    for (const name of ['lazy', 'lazy-review', 'lazy-audit', 'lazy-debt', 'lazy-gain', 'lazy-help']) assert.ok(discovered.command[name]);
    assert.ok(discovered.skills.paths.includes(join(repo, 'skills')));
    assert.equal(JSON.parse(readFileSync(join(repo, '.codex-plugin/plugin.json'))).skills, './skills/');
  });
  await hooks['command.execute.before']({ command: 'lazy-verify', arguments: 'example', sessionID: 'verify-does-not-change-mode' });
  check('explicit verification command leaves persisted off mode unchanged', () => {
    const configHome = join(scratch, 'mode-state');
    const state = join(configHome, 'opencode', '.lazy-active');
    mkdirSync(dirname(state), { recursive: true }); writeFileSync(state, 'off');
    const code = `import plugin from ${JSON.stringify(pathToFileURL(join(repo, '.opencode/plugins/lazy.mjs')).href)};
      const hooks = await plugin();
      await hooks['command.execute.before']({command:'lazy-verify',arguments:'example'});`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, XDG_CONFIG_HOME: configHome, LAZY_DEFAULT_MODE: 'off' }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(state, 'utf8'), 'off');
    assert.deepEqual(readdirSync(dirname(state)), ['.lazy-active']);
  });
  if (process.platform === 'win32') {
    check('Windows execution fails explicitly', () => expected(verify(), 2, 'ENGINE_PLATFORM_UNSUPPORTED'));
  } else {
    check('report rejects FIFO input without waiting for a writer', () => {
      const fifo = join(scratch, 'report-fifo'); execFileSync('mkfifo', [fifo]);
      expected(run(['report', fifo]), 2, 'INVALID_INPUT');
    });
    check('skills-only Unicode/space install negotiates without running targets', () => {
      const result = expected(run(['doctor', '--policy', policyPath]), 0);
      assert.equal(result.execution, 'not_run');
      assert.equal(result.gate, 'not_evaluated');
    });
    check('valid synthetic fix envelope and evidence', () => { passed = expected(verify(), 0); });
    for (const manifest of ['missing', 'different', 'malformed', 'symlink']) {
      check(`reject ${manifest} persisted manifest`, () => {
        setup({ manifest }); expected(verify(), 3, 'ENGINE_PROTOCOL_ERROR');
      });
    }
    check('manifest equality ignores JSON formatting and object key order', () => {
      setup({ manifest: 'reordered' }); expected(verify(), 0);
    });
    check('blocked runs also require their terminal manifest', () => {
      setup({ manifest: 'missing', exitCode: 1, result: { gate: 'blocked', reasonCodes: ['SUITE_FAILED'], requiredChecks: [{ id: 'suite', status: 'failed' }] } });
      expected(verify(), 3, 'ENGINE_PROTOCOL_ERROR');
    });
    for (const action of [undefined, 'change-config']) {
      check(`scratch cleanup failure after ${action || 'success'} stays visible`, () => {
        setup({ recordScratch: true, action });
        const preload = join(scratch, 'fail-removal.cjs');
        writeFileSync(preload, `
          const fs = require('node:fs');
          fs.rmSync = () => { throw Object.assign(new Error('injected removal failure'), { code: 'EACCES' }); };
          require('node:module').syncBuiltinESMExports();
        `);
        const runs = join(target, '.lazy-verify/runs');
        const old = new Set(readdirSync(runs));
        try {
          const result = expected(verify(['--require', preload]), 3, 'CLEANUP_FAILED');
          assert.equal(result.execution, 'incomplete');
          if (action) assert.ok(result.reasonCodes.includes('APPROVAL_CHANGED'));
        } finally {
          for (const id of readdirSync(runs).filter(id => !old.has(id))) {
            const path = join(runs, id, 'scratch.txt');
            if (existsSync(path)) {
              const leftover = readFileSync(path, 'utf8');
              rmSync(leftover, { recursive: true, force: true });
            }
          }
        }
      });
    }
    check('valid synthetic preserve envelope', () => { setup({}, 'preserve'); expected(verify(), 0); });
    for (const action of ['missing', 'truncated', 'oversized', 'stderr', 'duplicate', 'broken-pipe']) {
      check(`reject ${action} protocol`, () => { setup({ action }); expected(verify(), 3, 'ENGINE_PROTOCOL_ERROR'); });
    }
    for (const result of [{ requestId: 'b'.repeat(36) }, { mode: 'preserve' }, { evidenceComplete: false }, { applicability: 'stale' },
      { cleanup: 'failed' }, { requiredChecks: [] }, { engine: { version: 'wrong', digest: 'a'.repeat(64) } },
      { evidence: { path: '../escape', digest: 'a'.repeat(64) } }, { command: 'execute this' }]) {
      check(`reject contradictory ${Object.keys(result)[0]}`, () => { setup({ result }); expected(verify(), 3, 'ENGINE_PROTOCOL_ERROR'); });
    }
    check('zero exit cannot override a blocked gate', () => {
      setup({ result: { gate: 'blocked', reasonCodes: ['SUITE_FAILED'], requiredChecks: [{ id: 'suite', status: 'failed' }] } });
      expected(verify(), 3, 'ENGINE_PROTOCOL_ERROR');
    });
    check('supporting suite blocks without erasing fix observation', () => {
      setup({ exitCode: 1, result: { gate: 'blocked', reasonCodes: ['SUITE_FAILED'], requiredChecks: [{ id: 'suite', status: 'failed' }] } });
      const result = expected(verify(), 1);
      assert.equal(result.behavior, 'fixed_observed');
      const path = join(scratch, 'recorded.json');
      writeFileSync(path, JSON.stringify(result));
      const report = expected(run(['report', path]), 0);
      assert.equal(report.result.gate, 'blocked');
      assert.match(report.provenance, /not authenticated/u);
    });
    check('changed profile bytes require reapproval', () => {
      setup(); writeFileSync(configPath, readFileSync(configPath, 'utf8') + '\n');
      expected(verify(), 2, 'APPROVAL_MISMATCH');
    });
    check('contract bundle change requires reapproval', () => {
      setup(); const path = join(target, '.lazy-verify/contracts/example/fixture.json');
      writeFileSync(path, '{}'); expected(verify(), 2, 'APPROVAL_MISMATCH'); rmSync(path);
    });
    check('engine distribution change requires reapproval', () => {
      setup(); writeFileSync(join(controller, 'scenario.json'), '{}\n'); expected(verify(), 2, 'APPROVAL_MISMATCH');
    });
    for (const action of ['change-policy', 'change-config']) {
      check(`${action} during execution cannot pass`, () => {
        setup({ action }); expected(verify(), 3, 'APPROVAL_CHANGED');
      });
    }
    check('dirty checkout cannot be presented as committed verification', () => {
      setup(); const args = verifyArgs(); args[args.indexOf('worktree')] = 'HEAD'; expected(run(args), 2, 'DIRTY_TARGET');
    });
    check('approved external output stays create-only', () => {
      setup(); policy.outputRoot = join(scratch, 'external runs'); savePolicy();
      const result = expected(verify(), 0);
      assert.equal(JSON.parse(readFileSync(join(policy.outputRoot, result.requestId, 'manifest.json'))).requestId, result.requestId);
    });
    check('doctor validates output paths without creating directories', () => {
      setup();
      const absent = join(scratch, 'doctor-absent', 'runs');
      policy.outputRoot = absent; savePolicy();
      expected(run(['doctor', '--policy', policyPath]), 0);
      assert.equal(existsSync(dirname(absent)), false);
      const file = join(scratch, 'output-file'); writeFileSync(file, 'not a directory');
      const link = join(scratch, 'doctor-output-link'); symlinkSync(controller, link, 'dir');
      for (const output of [file, join(file, 'runs'), join(link, 'runs')]) {
        policy.outputRoot = output; savePolicy();
        expected(run(['doctor', '--policy', policyPath]), 2);
      }
    });
    check('output symlinks cannot create files outside the approved parent', () => {
      setup(); const link = join(scratch, 'output-link'); symlinkSync(controller, link, 'dir');
      policy.outputRoot = join(link, 'should-not-exist'); savePolicy(); expected(verify(), 2, 'INVALID_INPUT');
      assert.equal(existsSync(join(controller, 'should-not-exist')), false);
    });
    check('config command-bearing fields are rejected without execution', () => {
      setup(); const config = JSON.parse(readFileSync(configPath)); config.command = 'touch injected';
      writeFileSync(configPath, JSON.stringify(config)); expected(verify(), 2, 'INVALID_INPUT');
    });
    check('missing engine is explicit', () => {
      setup(); policy.engine.entry = join(scratch, 'absent.mjs'); savePolicy(); expected(verify(), 2, 'ENGINE_UNAVAILABLE');
    });
    check('wrong runtime is explicit', () => {
      setup(); policy.engine.nodeMajor++; savePolicy(); expected(verify(), 2, 'ENGINE_RUNTIME_UNSUPPORTED');
    });
    check('missing preserve capability is explicit', () => {
      setup({ capabilities: { modes: ['fix'] } }); expected(verify(), 2, 'ENGINE_CAPABILITY_UNSUPPORTED');
    });
    check('wrong engine version fails negotiation', () => {
      setup({ capabilities: { engine: { version: 'wrong', digest: 'a'.repeat(64) } } });
      expected(verify(), 2, 'ENGINE_CAPABILITY_UNSUPPORTED');
    });
    check('timeout kills real owned process tree', () => {
      setup({ action: 'hang' }); policy.budgets.totalMs = 300; savePolicy(); expected(verify(), 3, 'ENGINE_TIMEOUT');
    });
    check('surviving descendants block and are terminated', () => {
      setup({ action: 'descendant' }); expected(verify(), 3, 'CLEANUP_FAILED');
    });
    check('replay uses current selected policy and saved identities', () => {
      setup(); const result = expected(verify(), 0);
      const manifest = join(target, '.lazy-verify/runs', result.requestId, 'manifest.json');
      const replay = expected(run(['replay', manifest, '--policy', policyPath, '--trust-code']), 0);
      assert.notEqual(replay.requestId, result.requestId);
      assert.deepEqual(replay.sources, result.sources);
    });
    check('replay cannot import a different contract', () => {
      setup(); const path = join(scratch, 'wrong-contract.json');
      writeFileSync(path, JSON.stringify({ ...passed, digests: { ...passed.digests, contract: 'b'.repeat(64) } }));
      expected(run(['replay', path, '--policy', policyPath, '--trust-code']), 2, 'APPROVAL_MISMATCH');
    });
    check('report escapes controls and markup without executing links', () => {
      const path = join(scratch, 'escaped.json');
      writeFileSync(path, JSON.stringify({ ...passed, limitations: ['\u001b[31m\u009b<script>[x](https://evil.test)'] }));
      const result = spawnSync(process.execPath, [cli, 'report', path], { encoding: 'utf8' });
      assert.equal(result.status, 0); assert.ok(!result.stdout.includes('\u001b')); assert.ok(!result.stdout.includes('<script>'));
      const json = run(['report', path]);
      assert.equal(json.status, 0); assert.ok(!json.stdout.includes('\u009b')); assert.match(JSON.parse(json.stdout).result.limitations[0], /<script>/u);
    });
    check('mode/outcome gate boundary covers every allowed classification', () => {
      for (const [mode, outcomes] of Object.entries({ fix: ['fixed_observed', 'not_reproduced', 'still_failing', 'changed_failure', 'regression_observed', 'flaky', 'inconclusive'],
        preserve: ['preserved_observed', 'baseline_failing', 'regression_observed', 'flaky', 'inconclusive'] })) {
        for (const behavior of outcomes) {
          const positive = behavior === 'fixed_observed' || behavior === 'preserved_observed';
          const result = { ...passed, mode, behavior, gate: positive ? 'passed' : 'blocked', reasonCodes: positive ? [] : ['OBSERVED'] };
          validateResult(result);
          assert.equal(resultExit(result), positive ? 0 : behavior === 'inconclusive' ? 3 : 1);
          if (!positive) assert.throws(() => validateResult({ ...result, gate: 'passed' }));
        }
      }
    });
    check('incomplete source resolution retains typed engine reasons', () => {
      setup({ exitCode: 3, result: { execution: 'incomplete', behavior: 'inconclusive', evidenceComplete: false,
        gate: 'not_evaluated', applicability: 'unknown', reasonCodes: ['MISSING_SOURCE'], sources: {
          base: { selector: 'base', kind: 'commit', identity: null }, head: { selector: 'worktree', kind: 'worktree', identity: null },
        } } });
      expected(verify(), 3, 'MISSING_SOURCE');
    });
    setup();
    const concurrent = await Promise.all([1, 2].map(() => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli, ...verifyArgs(), '--format', 'json'], { cwd: target });
      let stdout = '';
      child.stdout.on('data', (data) => { stdout += data; });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr: '' }));
    })));
    check('concurrent runs have independent evidence directories', () => {
      const results = concurrent.map((result) => expected(result, 0));
      assert.notEqual(results[0].requestId, results[1].requestId);
      for (const result of results) assert.equal(JSON.parse(readFileSync(join(target, '.lazy-verify/runs', result.requestId, 'manifest.json'))).requestId, result.requestId);
    });
    check('committed verification ignores only untracked run output', () => {
      setup();
      execFileSync('git', ['add', '.lazy-verify.json', '.lazy-verify/contracts'], { cwd: target });
      execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture'], { cwd: target });
      const args = verifyArgs(); args[args.indexOf('worktree')] = 'HEAD';
      expected(run(args), 0);
      expected(run(args), 0);
      for (const name of ['user.txt', '.lazy-verify/runs/user.txt', '.lazy-verify/user.txt']) {
        const unrelated = join(target, name);
        writeFileSync(unrelated, 'untracked');
        expected(run(args), 2, 'DIRTY_TARGET');
        rmSync(unrelated);
      }
      policy.outputRoot = target; savePolicy();
      expected(run(args), 2, 'DIRTY_TARGET'); // Old default output is not this parent's run output.
      policy.outputRoot = join(scratch, 'external-committed'); savePolicy();
      expected(run(args), 2, 'DIRTY_TARGET');
      delete policy.outputRoot; savePolicy();
      const tracked = join(target, '.lazy-verify/runs/tracked.txt');
      writeFileSync(tracked, 'original');
      execFileSync('git', ['add', tracked], { cwd: target });
      execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'tracked fixture'], { cwd: target });
      writeFileSync(tracked, 'changed');
      expected(run(args), 2, 'DIRTY_TARGET');
    });
    setup({ action: 'hang' });
    const oldRuns = new Set(readdirSync(join(target, '.lazy-verify/runs')));
    const child = spawn(process.execPath, [cli, ...verifyArgs(), '--format', 'json'], { cwd: target });
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    // Wait for the run directory's child PID marker, not an assumed startup delay.
    const poll = setInterval(() => {
      const runs = join(target, '.lazy-verify/runs');
      if (readdirSync(runs).filter((id) => !oldRuns.has(id)).some((id) => {
        try { return Number(readFileSync(join(runs, id, 'child.pid'))) > 0; }
        catch { return false; /* Runs without child fixtures have no marker. */ }
      })) {
        clearInterval(poll);
        child.kill('SIGINT');
      }
    }, 20);
    const cancelDeadline = setTimeout(() => child.kill('SIGKILL'), 10000);
    const status = await new Promise((resolve) => child.on('close', resolve));
    clearInterval(poll);
    clearTimeout(cancelDeadline);
    check('SIGINT reports interruption', () => { assert.equal(status, 130, output); });
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
if (failures) process.exitCode = 1;
else console.log('all lazy-verify bridge tests passed (protocol fixtures, not engine qualification)');
