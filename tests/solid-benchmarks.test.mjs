import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade, main, prepare } from '../benchmarks/run.mjs';
import { tasks } from '../benchmarks/solid-tasks.mjs';

const fixes = {
  'dependency-duplication': ['selection.cjs', 'exports.hasExclusive = suite => suite.hasOnly();'],
  'formatter-extension': ['invoice.cjs', `const formats = {
  text: invoice => 'Total: ' + invoice.totalCents,
  csv: invoice => 'totalCents\\n' + invoice.totalCents,
};
exports.render = (items, format = 'text', extra = {}) => {
  const available = {...formats, ...extra};
  const formatter = Object.hasOwn(available, format) ? available[format] : undefined;
  if (typeof formatter !== 'function') throw new TypeError('Unknown format');
  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  return formatter({totalCents});
};`],
  'store-substitution': ['store.cjs', `class CachedStore {
  constructor(store) { this.store = store; this.cache = new Map(); }
  find(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    const value = this.store.find(key);
    if (value !== undefined) this.cache.set(key, value);
    return value;
  }
}
exports.CachedStore = CachedStore;`],
  'single-backend': ['checkout.cjs', `exports.createCheckout = charge => items => {
  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  return charge(totalCents);
};
exports.checkout = items => exports.createCheckout(require('./gateway.cjs').charge)(items);`],
  'readonly-consumer': ['names.cjs', `exports.names = directory => {
  if (typeof directory?.list !== 'function') throw new TypeError('Invalid directory');
  return directory.list().map(user => user.name);
};`],
  'necessary-guard': ['route.cjs', tasks.find(task => task.id === 'necessary-guard').files['route.cjs']],
};
const mutations = {
  'dependency-duplication': 'exports.hasExclusive = suite => {suite.hasOnly(); return suite.hasOnly();};',
  'formatter-extension': fixes['formatter-extension'][1].replace("'totalCents\\n'", "'totalCents,'"),
  'store-substitution': fixes['store-substitution'][1].replace('value !== undefined', 'true'),
  'single-backend': "require('./gateway.cjs');\n" + fixes['single-backend'][1],
  'readonly-consumer': fixes['readonly-consumer'][1].replace('return directory.list()', 'const list = directory.list; return list()'),
  'necessary-guard': fixes['necessary-guard'][1].replace('  if (body === undefined) return;\n', ''),
};

const root = mkdtempSync(join(tmpdir(), 'lazy-solid-test-'));
try {
  for (const task of tasks) {
    const cwd = join(root, task.id);
    prepare(task, cwd);
    const baseline = await grade(task, cwd);
    assert.equal(baseline.pass, task.id === 'necessary-guard', `${task.id} baseline: ${baseline.output}`);
    const [file, source] = fixes[task.id];
    writeFileSync(join(cwd, file), source);
    const fixed = await grade(task, cwd);
    assert.equal(fixed.pass, true, `${task.id} fixed: ${fixed.output}`);
    writeFileSync(join(cwd, file), mutations[task.id]);
    assert.equal((await grade(task, cwd)).pass, false, `${task.id} mutation escaped`);
  }
  const configPath = join(root, 'config.json');
  const config = {command: [process.execPath, '-e', ''], model: 'fake-runner-test', trials: 1, taskSet: 'solid'};
  writeFileSync(configPath, JSON.stringify(config));
  const output = join(root, 'selected-results');
  assert.equal(await main([configPath, output, 'readonly-consumer']), 0);
  const report = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8'));
  assert.equal(report.config.taskSet, 'solid');
  assert.deepEqual(report.results.map(result => [result.task, result.arm, result.pass]), [
    ['readonly-consumer', 'off', false], ['readonly-consumer', 'on', false],
  ]);
  writeFileSync(configPath, JSON.stringify({...config, taskSet: 'unknown'}));
  await assert.rejects(main([configPath, join(root, 'invalid-results')]), /taskSet/u);
  console.log('solid benchmarks: six baselines, working fixes, and contract-breaking mutations passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
