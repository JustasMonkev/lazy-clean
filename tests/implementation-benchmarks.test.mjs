import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade, main, prepare } from '../benchmarks/run.mjs';
import { tasks } from '../benchmarks/implementation-tasks.mjs';

const fixes = {
  'query-pairs': ['query.cjs', 'exports.encodeQuery = pairs => new URLSearchParams(pairs).toString();'],
  'existing-component': ['panel.cjs', tasks.find(task => task.id === 'existing-component').files['panel.cjs'] + 'exports.renderStatus = badge;\n'],
  'shared-cause': ['app.cjs', 'const normalize = id => id?.trim() ?? ""; exports.button = normalize; exports.restore = state => normalize(state.id);'],
  'trust-boundary': ['price.cjs', 'exports.parsePrice = raw => {const price = JSON.parse(raw)?.price; if (!Number.isFinite(price) || price < 0) throw new TypeError("price"); return price;};'],
  'already-minimal': ['tags.cjs', tasks.find(task => task.id === 'already-minimal').files['tags.cjs']],
};
const mutations = {
  'query-pairs': [
    'exports.encodeQuery = pairs => new URLSearchParams(Object.fromEntries(pairs)).toString();',
    'exports.encodeQuery = pairs => pairs.map(pair => pair.map(encodeURIComponent).join("=")).join("&");',
    'exports.encodeQuery = pairs => new URLSearchParams(pairs.sort()).toString();',
    "exports.encodeQuery = pairs => {const result = new URLSearchParams(pairs).toString(); if (pairs.length) pairs[0][0] = 'changed'; return result;};",
  ],
  'existing-component': [
    fixes['existing-component'][1].replace('exports.renderStatus = badge;', "exports.renderStatus = (label, tone) => badge(label || 'unknown', tone || 'neutral');"),
    fixes['existing-component'][1].replace("badge(label, 'preview')", 'label'),
    "exports.renderPreview = label => require('./badge.cjs').badge(label, 'preview'); exports.renderStatus = (label, tone = 'neutral') => '<span class=\"badge badge-' + tone + '\">' + label + '</span>';",
  ],
  'shared-cause': [fixes['shared-cause'][1].replace('normalize(state.id)', 'state.id')],
  'trust-boundary': [fixes['trust-boundary'][1].replace('Number.isFinite(price)', 'Number.isFinite(Number(price))')],
  'already-minimal': [
    'exports.tags = labels => [...new Set(labels)].filter(Boolean);',
    'exports.tags = labels => [...new Set(labels)].sort();',
    'exports.tags = labels => labels;',
    'exports.tags = labels => {const seen = new Set(); let index = 0; for (const label of labels) {if (!seen.has(label)) {seen.add(label); labels[index++] = label;}} return [...seen];};',
    'const cache = new WeakMap(); exports.tags = labels => {if (!cache.has(labels)) cache.set(labels, [...new Set(labels)]); return cache.get(labels);};',
  ],
};

const root = mkdtempSync(join(tmpdir(), 'lazy-implementation-test-'));
try {
  assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length);
  assert.deepEqual(tasks.map(task => task.id).sort(), Object.keys(fixes).sort());
  for (const task of tasks) {
    const cwd = join(root, task.id);
    prepare(task, cwd);
    const baseline = await grade(task, cwd);
    assert.equal(baseline.pass, task.id === 'already-minimal', `${task.id} baseline: ${baseline.output}`);
    const [file, source] = fixes[task.id];
    writeFileSync(join(cwd, file), source);
    const fixed = await grade(task, cwd);
    assert.equal(fixed.pass, true, `${task.id} fixed: ${fixed.output}`);
    for (const mutation of mutations[task.id]) {
      writeFileSync(join(cwd, file), mutation);
      const rejected = await grade(task, cwd);
      assert.equal(rejected.pass, false, `${task.id} mutation escaped: ${mutation}`);
      assert.equal(rejected.error, null, `${task.id} grader execution failed`);
    }
    writeFileSync(join(cwd, file), source);
    assert.equal((await grade(task, cwd)).pass, true, `${task.id} restored reference failed`);
  }
  const configPath = join(root, 'config.json');
  writeFileSync(configPath, JSON.stringify({command: [process.execPath, '-e', ''], model: 'fake-test-only', trials: 1, taskSet: 'implementation'}));
  const output = join(root, 'selected-results');
  assert.equal(await main([configPath, output, 'already-minimal']), 0);
  const report = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8'));
  assert.equal(report.config.taskSet, 'implementation');
  assert.deepEqual(report.results.map(result => [result.task, result.arm, result.pass]), [
    ['already-minimal', 'off', true], ['already-minimal', 'on', true],
  ]);
  for (const result of report.results) assert.equal(result.sourceBytesAfter, result.sourceBytesBefore);
  const on = readFileSync(join(output, 'already-minimal-1-on/prompt.txt'), 'utf8');
  const off = readFileSync(join(output, 'already-minimal-1-off/prompt.txt'), 'utf8');
  assert.match(on, /LAZY MODE ACTIVE/u);
  assert.doesNotMatch(off, /LAZY MODE ACTIVE/u);
  for (const prompt of [on, off]) assert.equal(prompt.includes(tasks.at(-1).design), false, 'manual rubric leaked');
  console.log('implementation benchmarks: five baselines, reference fixes, fourteen bad variants, selection, and no-change reporting passed');
} finally {
  rmSync(root, {recursive: true, force: true});
}
