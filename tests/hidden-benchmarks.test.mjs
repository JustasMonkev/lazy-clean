import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade, main, prepare } from '../benchmarks/run.mjs';
import { tasks } from '../benchmarks/hidden-tasks.mjs';

const guard = tasks.find(task => task.id === 'necessary-guard').files['route.cjs'];
const tallyTask = tasks.find(task => task.id === 'reused-helper');
const originalTally = tallyTask.files['tally.cjs'];
const fixes = {
  'reused-helper': ['tally.cjs', `const countWords = words => {
  const counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
};
exports.tally = words => Object.fromEntries(countWords(words));
exports.top = (words, n) => [...countWords(words)].sort((a, b) => b[1] - a[1]).slice(0, n);`],
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
  'key-collision': ['users.cjs', `const cache = Object.create(null);
const key = (tenant, id) => JSON.stringify([tenant, id]);
exports.getUser = (tenant, id, load) => cache[key(tenant, id)] ??= load(tenant, id);
exports.invalidate = (tenant, id) => { delete cache[key(tenant, id)]; };`],
  'helper-rounding': ['pages.cjs', `exports.pageCount = (items, size) => Math.ceil(items.length / size);
exports.page = (items, index, size) => items.slice(index * size, (index + 1) * size);
exports.hasNext = (items, index, size) => index + 1 < exports.pageCount(items, size);`],
  'reentrant-listener': ['emitter.cjs', `exports.createEmitter = () => {
  const listeners = [];
  const emitter = {
    on(fn) { listeners.push(fn); },
    off(fn) {
      const index = listeners.indexOf(fn);
      if (index >= 0) listeners.splice(index, 1);
    },
    once(fn) {
      let called = false;
      const wrapped = value => {
        if (called) return;
        called = true;
        emitter.off(wrapped);
        fn(value);
      };
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
  'installed-library': ['posts.cjs', `const {slugify} = require('./slugkit.cjs');
exports.postPath = post => \`/posts/\${post.id}\`;
exports.postUrl = post => \`/posts/\${slugify(post.title)}\`;`],
  'fallback-parse': ['config.cjs', `const ENTRY = /^([\\w.-]+)=(.*)$/u;
const legacyEntries = text => text.split('\\n').map(line => line.trim())
  .filter(line => line !== '' && !line.startsWith('#')).map(line => ENTRY.exec(line));
exports.loadConfig = text => {
  try {
    return JSON.parse(text);
  } catch (error) {
    const entries = legacyEntries(text);
    if (entries.includes(null)) throw error;
    return Object.fromEntries(entries.map(([, key, value]) => [key, value]));
  }
};`],
  'necessary-guard': ['route.cjs', guard],
};
const fallbackFix = fixes['fallback-parse'][1];
const strictLegacy = `const parseLegacy = text => {
  const config = {};
  for (const line of text.split('\\n')) {
    const entry = line.trim();
    if (entry === '' || entry.startsWith('#')) continue;
    const match = /^([\\w.-]+)=(.*)$/u.exec(entry);
    if (!match) throw new SyntaxError(\`invalid config line: \${entry}\`);
    config[match[1]] = match[2];
  }
  return config;
};
`;
const lenientLegacy = `const parseLegacy = text => Object.fromEntries(text.split('\\n').map(line => line.trim())
  .filter(line => line.includes('=') && !line.startsWith('#'))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
`;
const tryJsonFirst = 'exports.loadConfig = text => { try { return JSON.parse(text); } catch { return parseLegacy(text); } };';
const badVariants = {
  'reused-helper': [
    fixes['reused-helper'][1].replace(/exports\.top[\s\S]*$/u, 'exports.top = (words, n) => Object.entries(exports.tally(words)).sort((a, b) => b[1] - a[1]).slice(0, n);'),
    fixes['reused-helper'][1].replace(/exports\.top[\s\S]*$/u, `exports.top = (words, n) => {
  const counts = Object.create(null);
  for (const word of words) counts[word] = (counts[word] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
};`),
    fixes['reused-helper'][1].replace('exports.tally = words => Object.fromEntries(countWords(words));', originalTally.trim()),
  ],
  'in-path-defect': [fixes['in-path-defect'][1].replace('[...values].sort((a, b) => a - b)', 'values.sort()')],
  'stale-result': [
    "exports.makeSearch = (fetchResults, render) => query => query === '' ? render([]) : fetchResults(query, results => render(results));",
    fixes['stale-result'][1].replace('request === latest', "query !== ''"),
    fixes['stale-result'][1].replace('let latest = 0;', 'let latest;').replace('const request = ++latest;', 'const request = latest = query;'),
  ],
  'sibling-site': ["exports.firstName = user => (user.name ?? '').split(' ')[0];\nexports.initials = user => user.name.split(' ').map(part => part[0]).join('');"],
  'fail-open': [
    fixes['fail-open'][1].replace('!(now < Date.parse(token.expiresAt))', 'now >= Date.parse(token.expiresAt)'),
    fixes['fail-open'][1].replace('!(now < Date.parse(token.expiresAt))', 'now > Date.parse(token.expiresAt)'),
  ],
  'key-collision': [
    fixes['key-collision'][1].replace('JSON.stringify([tenant, id])', 'tenant + id'),
    fixes['key-collision'][1].replace('JSON.stringify([tenant, id])', "tenant + ':' + id"),
  ],
  'helper-rounding': [
    fixes['helper-rounding'][1].replace('Math.ceil', 'Math.round'),
    fixes['helper-rounding'][1].replace('Math.ceil', 'Math.round')
      .replace('index + 1 < exports.pageCount(items, size)', '(index + 1) * size < items.length'),
    fixes['helper-rounding'][1].replace(/^exports\.pageCount.*\n/u, '')
      .replace('index + 1 < exports.pageCount(items, size)', '(index + 1) * size < items.length'),
  ],
  'reentrant-listener': [
    fixes['reentrant-listener'][1].replace('for (const listener of [...listeners]) listener(value);', 'for (let index = 0; index < listeners.length; index++) listeners[index](value);'),
    fixes['reentrant-listener'][1].replace('      let called = false;\n', '').replace('        if (called) return;\n        called = true;\n', ''),
    fixes['reentrant-listener'][1].replace(
      '        called = true;\n        emitter.off(wrapped);\n        fn(value);',
      '        fn(value);\n        called = true;\n        emitter.off(wrapped);',
    ),
  ],
  'failed-update': [fixes['failed-update'][1].replace("if (used + units > limit) throw new RangeError('quota exceeded');\n      used += units;", "used += units;\n      if (used > limit) throw new RangeError('quota exceeded');")],
  'installed-library': [
    fixes['installed-library'][1].replace('slugify(post.title)', "post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')"),
    fixes['installed-library'][1].replace('slugify(post.title)',
      "post.title.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')"),
  ],
  'fallback-parse': [
    strictLegacy + tryJsonFirst,
    lenientLegacy + tryJsonFirst,
    strictLegacy + "exports.loadConfig = text => text.trimStart().startsWith('{') ? JSON.parse(text) : parseLegacy(text);",
    lenientLegacy + 'exports.loadConfig = text => { try { return JSON.parse(text); } catch (error) { try { return parseLegacy(text); } catch { throw error; } } };',
  ],
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
    for (const partial of badVariants[task.id]) {
      writeFileSync(join(cwd, file), partial);
      const rejected = await grade(task, cwd);
      assert.equal(rejected.pass, false, `${task.id} bad variant escaped: ${partial}`);
      assert.equal(rejected.error, null, `${task.id} grader execution failed`);
    }
  }
  writeFileSync(join(root, 'throws.cjs'), "exports.isExpired = (token, now) => { const at = Date.parse(token.expiresAt); if (Number.isNaN(at)) throw new TypeError('expiresAt'); return now >= at; };\nexports.canAccess = (token, now) => !exports.isExpired(token, now);");
  const failOpen = join(root, 'fail-open');
  writeFileSync(join(failOpen, 'session.cjs'), readFileSync(join(root, 'throws.cjs')));
  assert.equal((await grade(tasks.find(task => task.id === 'fail-open'), failOpen)).pass, true, 'rejecting an unreadable expiry by throwing must pass');
  const tallyCwd = join(root, tallyTask.id);
  writeFileSync(join(tallyCwd, 'tally.cjs'), fixes['reused-helper'][1].replace(
    'Object.fromEntries(countWords(words))',
    'Object.assign(Object.create(null), Object.fromEntries(countWords(words)))',
  ));
  const nullPrototype = await grade(tallyTask, tallyCwd);
  assert.equal(nullPrototype.pass, true, `a null-prototype tally record must pass: ${nullPrototype.output}`);
  const fallbackTask = tasks.find(task => task.id === 'fallback-parse');
  const fallbackCwd = join(root, fallbackTask.id);
  writeFileSync(join(fallbackCwd, 'config.cjs'), fallbackFix.replace('JSON.parse(text)', 'JSON.parse(text.trim())'));
  const trimmedJson = await grade(fallbackTask, fallbackCwd);
  assert.equal(trimmedJson.pass, true, `parsing trimmed JSON must pass: ${trimmedJson.output}`);
  writeFileSync(join(fallbackCwd, 'config.cjs'), strictLegacy
    + 'exports.loadConfig = text => { try { return JSON.parse(text); } catch (error) { try { return parseLegacy(text); } catch { throw error; } } };');
  const strictRethrow = await grade(fallbackTask, fallbackCwd);
  assert.equal(strictRethrow.pass, true, `a grammar-strict fallback that rethrows the JSON error must pass: ${strictRethrow.output}`);
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
  const variantCount = Object.values(badVariants).flat().length;
  console.log(`hidden benchmarks: ${tasks.length} baselines, reference fixes, ${variantCount} rejected variants, selection, and no prompt leak passed`);
} finally {
  rmSync(root, {recursive: true, force: true});
}
