import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const resultDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(resultDir, '../../..');
const evidenceDir = join(resultDir, 'node-evidence');
const freeze = JSON.parse(readFileSync(join(resultDir, 'rule-freeze.json'), 'utf8'));
const source = JSON.parse(readFileSync(join(evidenceDir, 'research-source.json'), 'utf8'));
const inputs = JSON.parse(readFileSync(join(resultDir, 'node-probe-inputs.json'), 'utf8'));
const excerpt = (name) => {
  const entry = inputs.excerpts.find((item) => item.name === name);
  assert(entry, `Missing excerpt: ${name}`);
  return entry.code;
};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const frozenContent = (path) => execFileSync('git', ['show', `${freeze.commit}:${path}`],
  { cwd: root, encoding: 'utf8' });
const manifestDrift = [];
const workingTreeDrift = [];
for (const [path, expected] of Object.entries(freeze.files)) {
  const actual = hash(frozenContent(path));
  const current = hash(readFileSync(join(root, path)));
  if (current !== expected) workingTreeDrift.push({ path, expected, actual: current });
  if (actual !== expected) manifestDrift.push({ path, expected, actual });
  if (!path.startsWith('tests/')) assert.equal(actual, expected, `Frozen rule file changed: ${path}`);
}

const scratch = mkdtempSync(join(tmpdir(), 'node-heldout-'));
const report = { runtime: process.version, base: freeze.base, frozenCommit: freeze.commit, manifestDrift, workingTreeDrift, files: [], reductions: [] };
try {
  const baseline = spawnSync('git', ['show', `${freeze.base}:skills/slop-check/scripts/check.mjs`],
    { cwd: root, encoding: 'utf8' });
  assert.equal(baseline.status, 0, baseline.stderr);
  const baselinePath = join(scratch, 'baseline.mjs');
  writeFileSync(baselinePath, baseline.stdout);
  const frozenPath = join(scratch, 'frozen.mjs');
  writeFileSync(frozenPath, frozenContent('skills/slop-check/scripts/check.mjs'));
  const currentPath = join(root, 'skills/slop-check/scripts/check.mjs');
  const files = inputs.excerpts.map((entry) => {
    assert.equal(hash(entry.code), entry.codeSha256, `Excerpt changed: ${entry.name}`);
    const path = join(scratch, `${entry.name}.js`);
    writeFileSync(path, entry.code);
    return { path, name: entry.name, startLine: entry.startLine, sourceFile: entry.sourceFile };
  });
  const rawCases = [['12712', 113844519], ['57144', 1963164451], ['44943', 993496790]];
  for (const [pr, id] of rawCases) {
    const comment = source.prs[pr].originalReviewHunks.find((entry) => entry.id === id);
    assert(comment, `Missing review ${id}`);
    const right = comment.diff_hunk.split('\n').filter((line) => /^[ +]/u.test(line))
      .map((line) => line.slice(1)).join('\n');
    const path = join(scratch, `${pr}-review-${id}.js`);
    writeFileSync(path, right);
    files.push({ path, name: `${pr}-review-${id}`, startLine: null, sourceFile: comment.path });
  }
  for (const file of files) {
    const { path, name, startLine, sourceFile } = file;
    const entry = { file: name, sourceFile, startLine, sha256: hash(readFileSync(path)), scans: {} };
    for (const [label, checker] of [['baseline', baselinePath], ['frozen', frozenPath], ['current', currentPath]]) {
      const scan = spawnSync(process.execPath, [checker, '--json', path], { encoding: 'utf8' });
      assert([0, 1].includes(scan.status), `${label} failed: ${scan.stderr}`);
      entry.scans[label] = { exit: scan.status, findings: JSON.parse(scan.stdout)
        .map(({ path: ignored, ...finding }) => finding) };
    }
    assert.deepEqual(entry.scans.frozen.findings.map(({ message, ...finding }) => finding),
      entry.scans.baseline.findings.map(({ message, ...finding }) => finding));
    assert.deepEqual(entry.scans.current.findings.map(({ message, ...finding }) => finding),
      entry.scans.frozen.findings.map(({ message, ...finding }) => finding));
    report.files.push(entry);
  }

  const utilSource = excerpt('12712-callbackify');
  const callbackSource = utilSource.slice(utilSource.indexOf('function callbackifyOnRejected('),
    utilSource.indexOf('exports.callbackify = callbackify;'));
  const callbacks = vm.runInNewContext(`${callbackSource}\n({ callbackify, callbackifyOnRejected })`,
    { errors: { Error, TypeError }, Error, Reflect, Object, process });
  for (const reason of [false, 0, '', null, undefined]) {
    let received;
    callbacks.callbackifyOnRejected(reason, (value) => { received = value; });
    assert(received instanceof Error);
    assert.equal(received.reason, reason);
  }
  const reason = { detail: 'domain rejection' };
  callbacks.callbackifyOnRejected(reason, (received) => assert.equal(received, reason));
  const owner = { value: 7 };
  await new Promise((done, fail) => {
    function subject(increment) {
      assert.equal(this, owner);
      return Promise.resolve(this.value + increment);
    }
    const fn = callbacks.callbackify(subject);
    fn.call(owner, 3, function (error, result) {
      try {
        assert.equal(this, owner);
        assert.equal(error, null);
        assert.equal(result, 10);
        done();
      } catch (failure) { fail(failure); }
    });
  });
  report.reductions.push({ case: '12712', pass: true,
    claim: 'Exact callbackify fragment preserves falsy rejection distinction and both receiver/argument contracts.' });

  const diagnostic = excerpt('44943-tracePromise');
  const method = diagnostic.slice(diagnostic.indexOf('  tracePromise('));
  const tracing = vm.runInNewContext(`({${method}})`, {
    Promise, PromiseReject: Promise.reject.bind(Promise), PromiseResolve: Promise.resolve.bind(Promise),
    PromisePrototypeThen: Function.call.bind(Promise.prototype.then), ReflectApply: Reflect.apply,
  });
  for (const reason of [false, 0, null, undefined, new Error('rejected')]) {
    const events = [];
    const context = {};
    const channels = Object.fromEntries(['end', 'asyncStart', 'asyncEnd', 'error'].map((name) =>
      [name, { publish: () => events.push(name) }]));
    channels.start = { runStores: (_, fn) => { events.push('start'); return fn(); } };
    const observed = await tracing.tracePromise.call(channels, () => Promise.reject(reason), context)
      .then(() => ({ fulfilled: true }), (error) => ({ fulfilled: false, error }));
    assert.equal(observed.fulfilled, false);
    assert.equal(observed.error, reason);
    assert.equal(context.error, reason);
    assert.deepEqual(events, ['start', 'end', 'error', 'asyncStart', 'asyncEnd']);
  }
  report.reductions.push({ case: '44943', pass: true,
    claim: 'Exact final tracePromise fragment preserves rejection values and publishes end/error events with stub channels.' });

  const reporterSource = excerpt('59700-reporter');
  const reporterFunctions = reporterSource.slice(reporterSource.indexOf('function formatError('),
    reporterSource.length);
  const stub = {
    reporterColorMap: {}, reporterUnicodeSymbolMap: {}, colors: { white: '', gray: '' },
    ArrayPrototypeJoin: (array, separator) => array.join(separator),
    RegExpPrototypeSymbolSplit: (regex, value) => value.split(regex), hardenRegExp: (regex) => regex,
    inspectWithNoCustomRetry: () => 'error', inspectOptions: {},
  };
  const final = vm.runInNewContext(`${reporterFunctions}\nformatTestReport`, stub);
  assert.equal(final('test:pass', { name: 'example' }), ' example');
  assert.equal(final('test:pass', { name: 'example', details: {} }), ' example');
  const suggested = reporterFunctions.replace('showErrorDetails && data.details?.error ?', 'showErrorDetails ?');
  assert.notEqual(suggested, reporterFunctions);
  const unsafe = vm.runInNewContext(`${suggested}\nformatTestReport`, stub);
  assert.throws(() => unsafe('test:pass', { name: 'example' }));
  assert.throws(() => unsafe('test:pass', { name: 'example', details: {} }));
  report.reductions.push({ case: '59700', pass: true,
    claim: 'Exact final function handles missing details/error; counterfactual applying review suggestion throws.' });
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
