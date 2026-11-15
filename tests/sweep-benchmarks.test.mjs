import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade, main, prepare } from '../benchmarks/run.mjs';
import { tasks } from '../benchmarks/sweep-tasks.mjs';

const file = (id, name) => tasks.find(task => task.id === id).files[name];
const lowerSlug = "exports.slug = text => text.trim().toLowerCase().replace(/\\s+/g, '-');\n";
const slugTest = "test('slug lowercases', () => assert.equal(slug('Hello World'), 'hello-world'));\n";
const limitCli = `exports.run = (args, items) => {
  let format = 'text', limit = Infinity;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format') format = args[++i];
    else if (args[i] === '--limit') {
      const value = args[++i];
      if (!/^[1-9]\\d*$/.test(value ?? '')) throw new TypeError('--limit');
      limit = Number(value);
    } else throw new TypeError(\`Unknown option \${args[i]}\`);
  }
  const shown = items.slice(0, limit);
  if (format === 'json') return JSON.stringify(shown);
  if (format === 'text') return shown.join('\\n');
  throw new TypeError(\`Unknown format \${format}\`);
};
`;
const strongTabsTest = `const assert = require('node:assert/strict');
const {renderTabs} = require('./tabs.cjs');
assert.equal(renderTabs([{title: 'A', url: 'https://a.test'}, {title: 'B', url: 'https://b.test'}], 1),
  '### Open tabs\\n- 0: [A] (https://a.test)\\n- 1: (current) [B] (https://b.test)');
`;

const variants = {
  'preexisting-failure': {
    fixed: { 'slug.cjs': lowerSlug, 'test.cjs': file('preexisting-failure', 'test.cjs') + slugTest },
    bad: {
      'fixes the unrelated money bug': { 'slug.cjs': lowerSlug, 'test.cjs': file('preexisting-failure', 'test.cjs') + slugTest,
        'money.cjs': 'exports.cents = amount => Math.round(amount * 100);\n' },
      'deletes the failing test': { 'slug.cjs': lowerSlug,
        'test.cjs': file('preexisting-failure', 'test.cjs').replace(/test\('cents[^\n]*\n/u, '') + slugTest },
      'skips the failing test': { 'slug.cjs': lowerSlug,
        'test.cjs': file('preexisting-failure', 'test.cjs').replace("test('cents", "test.skip('cents") + slugTest },
      'adds no regression test': { 'slug.cjs': lowerSlug },
    },
  },
  'docs-contract': {
    fixed: { 'cli.cjs': limitCli, 'README.md': file('docs-contract', 'README.md') + '- `--limit n`: print at most n items.\n' },
    bad: {
      'leaves README unchanged': { 'cli.cjs': limitCli },
      'accepts zero': { 'cli.cjs': limitCli.replace('[1-9]', '[0-9]'), 'README.md': file('docs-contract', 'README.md') + '- `--limit n`\n' },
      'drops --format from README': { 'cli.cjs': limitCli, 'README.md': '# list-tool\n\n- `--limit n`\n' },
    },
  },
  'test-oracle': {
    fixed: { 'test.cjs': strongTabsTest },
    bad: {
      'checks only indexes': { 'test.cjs': strongTabsTest.replace(/assert\.equal[\s\S]*$/u,
        "const out = renderTabs([{title: 'A', url: 'u'}, {title: 'B', url: 'v'}], 1);\nassert.match(out, /- 0: /); assert.match(out, /- 1: /); assert.doesNotMatch(out, /- 2: /);\n") },
      'leaves a planted fault behind': { 'test.cjs': strongTabsTest,
        'tabs.cjs': file('test-oracle', 'tabs.cjs').replace("'(current) '", "'(current)  '") },
    },
  },
};

const root = mkdtempSync(join(tmpdir(), 'lazy-sweep-test-'));
try {
  assert.deepEqual(tasks.map(task => task.id).sort(), Object.keys(variants).sort());
  for (const task of tasks) {
    const { fixed, bad } = variants[task.id];
    const baselineDir = join(root, task.id, 'baseline');
    prepare(task, baselineDir);
    const baseline = await grade(task, baselineDir);
    assert.equal(baseline.pass, false, `${task.id} baseline passed`);
    assert.equal(baseline.error, null, `${task.id} baseline grader failed to run`);
    const fixedDir = join(root, task.id, 'fixed');
    prepare(task, fixedDir);
    for (const [name, body] of Object.entries(fixed)) writeFileSync(join(fixedDir, name), body);
    const accepted = await grade(task, fixedDir);
    assert.equal(accepted.pass, true, `${task.id} reference failed: ${accepted.output}`);
    for (const [name, body] of Object.entries(fixed)) assert.equal(readFileSync(join(fixedDir, name), 'utf8'), body, `${task.id} grader left ${name} changed`);
    for (const [label, files] of Object.entries(bad)) {
      const dir = join(root, task.id, label.replaceAll(' ', '-'));
      prepare(task, dir);
      for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
      const rejected = await grade(task, dir);
      assert.equal(rejected.pass, false, `${task.id} accepted: ${label}`);
      assert.equal(rejected.error, null, `${task.id} grader failed to run for: ${label}`);
    }
  }
  const configPath = join(root, 'config.json');
  writeFileSync(configPath, JSON.stringify({ command: [process.execPath, '-e', ''], model: 'fake-test-only', trials: 1, taskSet: 'sweep' }));
  const output = join(root, 'selected-results');
  assert.equal(await main([configPath, output, 'docs-contract']), 0);
  const report = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8'));
  assert.equal(report.config.taskSet, 'sweep');
  assert.deepEqual(report.results.map(result => [result.task, result.pass]), [['docs-contract', false], ['docs-contract', false]]);
  console.log('sweep benchmarks: three failing baselines, reference fixes, nine bad variants, and selection passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
