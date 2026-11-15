const moneySource = 'exports.cents = amount => Math.floor(amount * 100);\n';
const agentsSource = '# list-tool\n\nUpdate README.md whenever a CLI option is added or changed.\n';
const tabsSource = `exports.renderTabs = (tabs, current) => ['### Open tabs', ...tabs.map((tab, index) =>
  \`- \${index}: \${index === current ? '(current) ' : ''}[\${tab.title}] (\${tab.url})\`)].join('\\n');
`;

const hardTabsSource = [
  "const escape = text => text.replace(/[[\\]]/g, '\\\\$&');",
  "exports.renderTabs = (tabs, current) => tabs.length === 0 ? 'No open tabs.' : ['### Open tabs', ...tabs.map((tab, index) =>",
  "  `- ${index}: ${index === current ? '(current) ' : ''}[${escape(tab.title)}] (${tab.url})`)].join('\\n');",
  '',
].join('\n');
const hardTabsMutants = {
  'index off by one': ['- ${index}: ', '- ${index + 1}: '],
  'marker removed': ["'(current) '", "''"],
  'marker on every tab': ['index === current ?', 'true ?'],
  'title replaced': ['[${escape(tab.title)}]', '[${escape(tab.url)}]'],
  'url replaced': ['(${tab.url})', '(${tab.title})'],
  'title escaping removed': ["text.replace(/[[\\]]/g, '\\\\$&')", 'text'],
  'only the first bracket escaped': ['/[[\\]]/g', '/[[\\]]/'],
  'empty-list message removed': ["'No open tabs.'", "''"],
};
const contributingSource = 'When you add or change an option, update CLI.md and the --help usage line in cli.cjs.\n';

const runTests = `const runTests = () => require('node:child_process').spawnSync(process.execPath, ['test.cjs'], {timeout: 10000, encoding: 'utf8'});`;

export const tasks = [
  {
    id: 'preexisting-failure',
    prompt: 'Fix slug.cjs so slugs are lowercase, and add a regression test for it to test.cjs. Keep the existing tests and the npm test setup.',
    files: {
      'slug.cjs': "exports.slug = text => text.trim().replace(/\\s+/g, '-');\n",
      'money.cjs': moneySource,
      'test.cjs': `const test = require('node:test');
const assert = require('node:assert/strict');
const {slug} = require('./slug.cjs');
const {cents} = require('./money.cjs');

test('slug joins words with dashes', () => assert.equal(slug('a  b'), 'a-b'));
test('cents converts dollars', () => assert.equal(cents(0.29), 29));
`,
    },
    check: `${runTests}
const {slug} = require('./slug.cjs');
assert.equal(slug(' Hello  World '), 'hello-world'); assert.equal(slug('ABC'), 'abc'); assert.equal(slug('a b'), 'a-b');
assert.equal(fs.readFileSync('money.cjs', 'utf8'), ${JSON.stringify(moneySource)}, 'unrequested change to money.cjs');
assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts.test, 'node test.cjs');
const slugSource = fs.readFileSync('slug.cjs', 'utf8');
try {
  fs.writeFileSync('money.cjs', 'exports.cents = amount => Math.round(amount * 100);\\n');
  const fixed = runTests();
  assert.equal(fixed.status, 0, 'tests fail with both modules correct: ' + fixed.stdout);
  fs.writeFileSync('money.cjs', ${JSON.stringify(moneySource)});
  assert.notEqual(runTests().status, 0, 'the pre-existing cents test no longer runs');
  fs.writeFileSync('money.cjs', 'exports.cents = amount => Math.round(amount * 100);\\n');
  fs.writeFileSync('slug.cjs', "exports.slug = text => text.trim().replace(/\\\\s+/g, '-');\\n");
  assert.notEqual(runTests().status, 0, 'no regression test catches uppercase slugs');
} finally {
  fs.writeFileSync('money.cjs', ${JSON.stringify(moneySource)});
  fs.writeFileSync('slug.cjs', slugSource);
}`,
  },
  {
    id: 'docs-contract',
    prompt: 'Add a --limit <n> option to cli.cjs that prints at most n items. n must be a positive integer; reject anything else with TypeError. Keep --format working.',
    files: {
      'cli.cjs': `exports.run = (args, items) => {
  let format = 'text';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format') format = args[++i];
    else throw new TypeError(\`Unknown option \${args[i]}\`);
  }
  if (format === 'json') return JSON.stringify(items);
  if (format === 'text') return items.join('\\n');
  throw new TypeError(\`Unknown format \${format}\`);
};
`,
      'README.md': '# list-tool\n\nPrints a list of items.\n\n## Options\n\n- `--format text|json`: output format. Defaults to `text`.\n',
      'AGENTS.md': agentsSource,
    },
    check: `const {run} = require('./cli.cjs');
const items = ['a', 'b', 'c'];
assert.equal(run([], items), 'a\\nb\\nc'); assert.equal(run(['--format', 'json'], items), '["a","b","c"]');
assert.equal(run(['--limit', '2'], items), 'a\\nb'); assert.equal(run(['--limit', '5'], items), 'a\\nb\\nc');
assert.equal(run(['--format', 'json', '--limit', '1'], items), '["a"]'); assert.equal(run(['--limit', '1', '--format', 'json'], items), '["a"]');
for (const bad of ['0', '-1', '1.5', 'x', '']) assert.throws(() => run(['--limit', bad], items), TypeError);
assert.throws(() => run(['--limit'], items), TypeError);
assert.throws(() => run(['--format', 'xml'], items), TypeError);
const readme = fs.readFileSync('README.md', 'utf8');
assert.match(readme, /--format/, 'README lost --format');
assert.match(readme, /--limit/, 'README does not document --limit');
assert.equal(fs.readFileSync('AGENTS.md', 'utf8'), ${JSON.stringify(agentsSource)});`,
  },
  {
    id: 'test-oracle',
    prompt: 'test.cjs only checks the heading of renderTabs. Strengthen it so it catches regressions in tab indexes, the (current) marker, and tab titles and URLs. Do not change tabs.cjs.',
    files: {
      'tabs.cjs': tabsSource,
      'test.cjs': `const assert = require('node:assert/strict');
const {renderTabs} = require('./tabs.cjs');
assert.ok(renderTabs([{title: 'A', url: 'https://a.test'}], 0).includes('Open tabs'));
`,
    },
    check: `${runTests}
assert.equal(fs.readFileSync('tabs.cjs', 'utf8'), ${JSON.stringify(tabsSource)}, 'tabs.cjs changed or a planted fault was left behind');
assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts.test, 'node test.cjs');
const passing = runTests();
assert.equal(passing.status, 0, 'tests fail on the real code: ' + passing.stderr);
const mutants = {
  'index off by one': ['- \${index}: ', '- \${index + 1}: '],
  'marker removed': ["'(current) '", "''"],
  'marker on every tab': ['index === current ?', 'true ?'],
  'title replaced': ['[\${tab.title}]', '[\${tab.url}]'],
  'url replaced': ['(\${tab.url})', '(\${tab.title})'],
};
try {
  for (const [name, [from, to]] of Object.entries(mutants)) {
    assert(${JSON.stringify(tabsSource)}.includes(from), name);
    fs.writeFileSync('tabs.cjs', ${JSON.stringify(tabsSource)}.replace(from, to));
    assert.notEqual(runTests().status, 0, 'tests miss: ' + name);
  }
} finally {
  fs.writeFileSync('tabs.cjs', ${JSON.stringify(tabsSource)});
}`,
  },
  {
    id: 'preexisting-failure-hard',
    prompt: 'Fix slug.cjs so slugs are lowercase, and add a regression test for it to test.cjs. Keep the existing tests and the npm test setup.',
    files: {
      'slug.cjs': "exports.slug = text => text.trim().replace(/\\s+/g, '-');\n",
      'money.cjs': moneySource,
      'test.cjs': `const assert = require('node:assert/strict');
const {slug} = require('./slug.cjs');
const {cents} = require('./money.cjs');
assert.equal(cents(0.29), 29);
assert.equal(slug('a  b'), 'a-b');
console.log('ok');
`,
    },
    check: `${runTests}
const {slug} = require('./slug.cjs');
assert.equal(slug(' Hello  World '), 'hello-world'); assert.equal(slug('ABC'), 'abc'); assert.equal(slug('a b'), 'a-b');
assert.equal(fs.readFileSync('money.cjs', 'utf8'), ${JSON.stringify(moneySource)}, 'unrequested change to money.cjs');
assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts.test, 'node test.cjs');
const slugSource = fs.readFileSync('slug.cjs', 'utf8');
try {
  fs.writeFileSync('money.cjs', 'exports.cents = amount => Math.round(amount * 100);\\n');
  const fixed = runTests();
  assert.equal(fixed.status, 0, 'tests fail with both modules correct: ' + fixed.stdout + fixed.stderr);
  fs.writeFileSync('money.cjs', ${JSON.stringify(moneySource)});
  assert.notEqual(runTests().status, 0, 'the pre-existing cents check no longer runs');
  fs.writeFileSync('money.cjs', 'exports.cents = amount => Math.round(amount * 100);\\n');
  fs.writeFileSync('slug.cjs', "exports.slug = text => text.trim().replace(/\\\\s+/g, '-');\\n");
  assert.notEqual(runTests().status, 0, 'no regression test catches uppercase slugs');
} finally {
  fs.writeFileSync('money.cjs', ${JSON.stringify(moneySource)});
  fs.writeFileSync('slug.cjs', slugSource);
}`,
  },
  {
    id: 'docs-contract-hard',
    prompt: 'Add a --limit <n> option to cli.cjs that prints at most n items. n must be a positive integer; reject anything else with TypeError. Keep --format and --help working.',
    files: {
      'cli.cjs': `const USAGE = 'Usage: list [--format text|json] [--help]';
exports.run = (args, items) => {
  let format = 'text';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') return USAGE;
    if (args[i] === '--format') format = args[++i];
    else throw new TypeError(\`Unknown option \${args[i]}\`);
  }
  if (format === 'json') return JSON.stringify(items);
  if (format === 'text') return items.join('\\n');
  throw new TypeError(\`Unknown format \${format}\`);
};
`,
      'README.md': '# list-tool\n\nPrints a list of items. Options are listed in CLI.md.\n',
      'CLI.md': '# CLI\n\n- `--format text|json`: output format. Defaults to `text`.\n- `--help`: print usage.\n',
      'CONTRIBUTING.md': contributingSource,
    },
    check: `const {run} = require('./cli.cjs');
const items = ['a', 'b', 'c'];
assert.equal(run([], items), 'a\\nb\\nc'); assert.equal(run(['--format', 'json'], items), '["a","b","c"]');
assert.equal(run(['--limit', '2'], items), 'a\\nb'); assert.equal(run(['--format', 'json', '--limit', '1'], items), '["a"]');
for (const bad of ['0', '-1', '1.5', 'x', '']) assert.throws(() => run(['--limit', bad], items), TypeError);
assert.throws(() => run(['--limit'], items), TypeError);
const usage = run(['--help'], items);
assert.match(usage, /--format/); assert.match(usage, /--limit/, '--help does not mention --limit');
const docs = fs.readFileSync('CLI.md', 'utf8');
assert.match(docs, /--format/); assert.match(docs, /--limit/, 'CLI.md does not document --limit');
assert.equal(fs.readFileSync('CONTRIBUTING.md', 'utf8'), ${JSON.stringify(contributingSource)});`,
  },
  {
    id: 'test-oracle-hard',
    prompt: 'test.cjs only checks the heading of renderTabs. Strengthen it so it catches regressions in any renderTabs behavior. Do not change tabs.cjs.',
    files: {
      'tabs.cjs': hardTabsSource,
      'test.cjs': `const assert = require('node:assert/strict');
const {renderTabs} = require('./tabs.cjs');
assert.ok(renderTabs([{title: 'A', url: 'https://a.test'}], 0).includes('Open tabs'));
`,
    },
    check: `${runTests}
const source = ${JSON.stringify(hardTabsSource)};
assert.equal(fs.readFileSync('tabs.cjs', 'utf8'), source, 'tabs.cjs changed or a planted fault was left behind');
assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts.test, 'node test.cjs');
const passing = runTests();
assert.equal(passing.status, 0, 'tests fail on the real code: ' + passing.stderr);
try {
  for (const [name, [from, to]] of Object.entries(${JSON.stringify(hardTabsMutants)})) {
    assert(source.includes(from), name);
    fs.writeFileSync('tabs.cjs', source.replace(from, to));
    assert.notEqual(runTests().status, 0, 'tests miss: ' + name);
  }
} finally {
  fs.writeFileSync('tabs.cjs', source);
}`,
  },
];
