import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade, main, prepare } from '../benchmarks/run.mjs';
import { tasks } from '../benchmarks/hidden-tasks.mjs';

const guard = tasks.find(task => task.id === 'necessary-guard').files['route.cjs'];
const fixes = {
  'reused-helper': ['tally.cjs', `exports.tally = words => {
  const counts = {};
  for (const word of words) counts[word] = (counts[word] || 0) + 1;
  return counts;
};
exports.top = (words, n) => {
  const counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n);
};`],
  'in-path-defect': ['stats.cjs', `exports.median = values => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};`],
  'stale-result': ['search.cjs', `exports.makeSearch = (fetchResults, render) => {
  let latest = 0;
  return query => {
    const request = ++latest;
    if (query === '') return render([]);
    fetchResults(query, results => { if (request === latest) render(results); });
  };
};`],
  'sibling-site': ['names.cjs', `const parts = user => (user.name ?? '').split(' ');
exports.firstName = user => parts(user)[0];
exports.initials = user => parts(user).map(part => part[0]).join('');`],
  'fail-open': ['session.cjs', `exports.isExpired = (token, now) => !(now < Date.parse(token.expiresAt));
exports.canAccess = (token, now) => !exports.isExpired(token, now);`],
  'key-collision': ['users.cjs', `const cache = new Map();
const key = (tenant, id) => JSON.stringify([tenant, id]);
exports.getUser = (tenant, id, load) => {
  if (!cache.has(key(tenant, id))) cache.set(key(tenant, id), load(tenant, id));
  return cache.get(key(tenant, id));
};
exports.invalidate = (tenant, id) => { cache.delete(key(tenant, id)); };`],
  'helper-rounding': ['pages.cjs', `exports.pageCount = (items, size) => Math.round(items.length / size);
exports.page = (items, index, size) => items.slice(index * size, (index + 1) * size);
exports.hasNext = (items, index, size) => (index + 1) * size < items.length;`],
  'reentrant-listener': ['emitter.cjs', `exports.createEmitter = () => {
  const listeners = [];
  const emitter = {
    on(fn) { listeners.push(fn); },
    off(fn) {
      const index = listeners.indexOf(fn);
      if (index >= 0) listeners.splice(index, 1);
    },
    once(fn) {
      const wrapped = value => { emitter.off(wrapped); fn(value); };
      emitter.on(wrapped);
    },
    emit(value) {
      for (const listener of [...listeners]) listener(value);
    },
  };
  return emitter;
};`],
  'failed-update': ['quota.cjs', `exports.createQuota = limit => {
  let used = 0;
  return {
    take(units) {
      if (used + units > limit) throw new RangeError('quota exceeded');
      used += units;
      return limit - used;
    },
    remaining() { return limit - used; },
  };
};`],
  'necessary-guard': ['route.cjs', guard],
};
const symptomOnly = {
  'reused-helper': [
    fixes['reused-helper'][1].replace(/exports\.top[\s\S]*$/u, 'exports.top = (words, n) => Object.entries(exports.tally(words)).sort((a, b) => b[1] - a[1]).slice(0, n);'),
    fixes['reused-helper'][1].replace(/exports\.top[\s\S]*$/u, `exports.top = (words, n) => {
  const counts = Object.create(null);
  for (const word of words) counts[word] = (counts[word] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
};`),
  ],
  'in-path-defect': [fixes['in-path-defect'][1].replace('[...values].sort((a, b) => a - b)', 'values.sort()')],
  'stale-result': [
    "exports.makeSearch = (fetchResults, render) => query => query === '' ? render([]) : fetchResults(query, results => render(results));",
    fixes['stale-result'][1].replace('request === latest', "query !== ''"),
  ],
  'sibling-site': ["exports.firstName = user => (user.name ?? '').split(' ')[0];\nexports.initials = user => user.name.split(' ').map(part => part[0]).join('');"],
  'fail-open': [
    fixes['fail-open'][1].replace('!(now < Date.parse(token.expiresAt))', 'now >= Date.parse(token.expiresAt)'),
    fixes['fail-open'][1].replace('!(now < Date.parse(token.expiresAt))', 'now > Date.parse(token.expiresAt)'),
  ],
  'key-collision': ["const cache = {};\nexports.getUser = (tenant, id, load) => cache[tenant + id] ??= load(tenant, id);\nexports.invalidate = (tenant, id) => { delete cache[tenant + id]; };"],
  'helper-rounding': [fixes['helper-rounding'][1].replace('(index + 1) * size < items.length', 'index + 1 < exports.pageCount(items, size)')],
  'reentrant-listener': [fixes['reentrant-listener'][1].replace('for (const listener of [...listeners]) listener(value);', 'for (let index = 0; index < listeners.length; index++) listeners[index](value);')],
  'failed-update': [fixes['failed-update'][1].replace("if (used + units > limit) throw new RangeError('quota exceeded');\n      used += units;", "used += units;\n      if (used > limit) throw new RangeError('quota exceeded');")],
  'necessary-guard': [guard.replace('  if (body === undefined) return;\n', '')],
};

const root = mkdtempSync(join(tmpdir(), 'lazy-hidden-test-'));
try {
  assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length);
  assert.deepEqual(tasks.map(task => task.id).sort(), Object.keys(fixes).sort());
  for (const task of tasks) {
    const cwd = join(root, task.id);
    prepare(task, cwd);
    const baseline = await grade(task, cwd);
    assert.equal(baseline.pass, task.id === 'necessary-guard', `${task.id} baseline: ${baseline.output}`);
    const [file, source] = fixes[task.id];
    writeFileSync(join(cwd, file), source);
    const fixed = await grade(task, cwd);
    assert.equal(fixed.pass, true, `${task.id} fixed: ${fixed.output}`);
    for (const partial of symptomOnly[task.id]) {
      writeFileSync(join(cwd, file), partial);
      const rejected = await grade(task, cwd);
      assert.equal(rejected.pass, false, `${task.id} symptom-only change escaped: ${partial}`);
      assert.equal(rejected.error, null, `${task.id} grader execution failed`);
    }
  }
  writeFileSync(join(root, 'throws.cjs'), "exports.isExpired = (token, now) => { const at = Date.parse(token.expiresAt); if (Number.isNaN(at)) throw new TypeError('expiresAt'); return now >= at; };\nexports.canAccess = (token, now) => !exports.isExpired(token, now);");
  const failOpen = join(root, 'fail-open');
  writeFileSync(join(failOpen, 'session.cjs'), readFileSync(join(root, 'throws.cjs')));
  assert.equal((await grade(tasks.find(task => task.id === 'fail-open'), failOpen)).pass, true, 'rejecting an unreadable expiry by throwing must pass');
  const configPath = join(root, 'config.json');
  writeFileSync(configPath, JSON.stringify({command: [process.execPath, '-e', ''], model: 'fake-test-only', trials: 1, taskSet: 'hidden'}));
  const output = join(root, 'selected-results');
  assert.equal(await main([configPath, output, 'sibling-site']), 0);
  const report = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8'));
  assert.equal(report.config.taskSet, 'hidden');
  assert.deepEqual(report.results.map(result => [result.task, result.arm, result.pass]), [
    ['sibling-site', 'off', false], ['sibling-site', 'on', false],
  ]);
  const hidden = tasks.find(task => task.id === 'sibling-site').hidden;
  for (const arm of ['on', 'off']) {
    assert.equal(readFileSync(join(output, `sibling-site-1-${arm}/prompt.txt`), 'utf8').includes(hidden), false, 'hidden defect leaked');
  }
  console.log('hidden benchmarks: ten baselines, reference fixes, thirteen symptom-only changes, selection, and no prompt leak passed');
} finally {
  rmSync(root, {recursive: true, force: true});
}
