'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {after, test} = require('node:test');
const modulePath = require.resolve(process.env.CANDIDATE_MODULE);
const {transformers, parseCsvLine} = require(modulePath);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lazy-hidden-cli-'));
after(() => fs.rmSync(root, {recursive: true, force: true}));

function fixture(name, text) {
  const file = path.join(root, name);
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

function expectJsonError(input, fromFile) {
  assert.throws(() => transformers.json(input), (error) => {
    assert.ok(error instanceof TypeError);
    assert.ok(error.cause instanceof SyntaxError);
    const prefix = fromFile ? `'${input}' must be a valid JSON` : 'The provided value must be a valid JSON';
    assert.equal(error.message, `${prefix}. Original error: ${error.cause.message}`);
    return true;
  });
}

test('CSV literal behavior, whitespace, empties and newlines are unchanged', () => {
  for (const [input, expected] of [
    ['', []], [' , , ', []], [' alpha, beta ,,gamma ', ['alpha', 'beta', 'gamma']],
    ['alpha\nbeta,gamma', ['alpha\nbeta', 'gamma']], ['one', ['one']],
  ]) {
    assert.deepEqual(transformers.csv(input), expected);
    assert.deepEqual(parseCsvLine(input), expected);
  }
});

test('directories are literal inputs for both transformers', () => {
  for (const name of ['feature-directory', 'alpha,beta']) {
    const directory = path.join(root, name);
    fs.mkdirSync(directory);
    assert.deepEqual(transformers.csv(directory), directory.split(',').map((part) => part.trim()).filter(Boolean));
    expectJsonError(directory, false);
    const link = path.join(root, `${name}-link`);
    fs.symlinkSync(directory, link, 'dir');
    assert.deepEqual(transformers.csv(link), link.split(',').map((part) => part.trim()).filter(Boolean));
    expectJsonError(link, false);
  }
});

test('filesystem probe failures fall back to literal input', () => {
  const csv = Array.from({length: 80}, (_, index) => `feature_${index}`).join(',');
  const json = JSON.stringify({app: 'a'.repeat(400), enabled: false});
  assert.deepEqual(transformers.csv(csv), csv.split(','));
  assert.deepEqual(transformers.json(json), JSON.parse(json));
  const absent = path.join(root, 'absent');
  const dangling = path.join(root, 'dangling');
  fs.symlinkSync(absent, dangling);
  const parentFile = fixture('not-a-directory', 'plain');
  for (const input of [absent, dangling, path.join(parentFile, 'child')]) {
    assert.deepEqual(transformers.csv(input), [input]);
    expectJsonError(input, false);
  }
});

test('CSV regular files and symlinks retain multiline parsing and file precedence', () => {
  const file = fixture('csv,filename', ' alpha, beta\r\n\n gamma,,delta\n  \n');
  const link = path.join(root, 'csv-link');
  fs.symlinkSync(file, link);
  for (const input of [file, link]) {
    assert.deepEqual(transformers.csv(input), ['alpha', 'beta', 'gamma', 'delta']);
  }
  assert.deepEqual(transformers.csv(fixture('empty.csv', '')), []);
});

test('JSON inline values, files and symlinks preserve JSON.parse output', () => {
  for (const value of [{nested: {enabled: false, count: 0, text: ''}}, [1, false], null, false, 0, '']) {
    const json = JSON.stringify(value);
    assert.deepEqual(transformers.json(json), value);
  }
  const value = {devices: ['a', 'b'], enabled: false};
  const file = fixture('valid.json', JSON.stringify(value));
  const link = path.join(root, 'json-link');
  fs.symlinkSync(file, link);
  for (const input of [file, link]) {
    assert.deepEqual(transformers.json(input), value);
  }
});

test('JSON parse errors preserve inline/file context and original SyntaxError cause', () => {
  for (const input of ['', '{bad', '[1,]']) expectJsonError(input, false);
  for (const [name, content] of [['bad.json', '{bad'], ['empty.json', '']]) {
    expectJsonError(fixture(name, content), true);
  }
});

test('regular-file read failures remain ArgumentTypeError, not literal fallbacks', () => {
  // A targeted synchronous stub reproduces a file becoming unreadable after its
  // successful probe; chmod cannot do this reliably under privileged runners.
  const file = fixture('unreadable-after-probe', '{}');
  const originalRead = fs.readFileSync;
  const previousModule = require.cache[modulePath];
  const failure = Object.assign(new Error('deterministic read failure'), {code: 'EACCES'});
  try {
    fs.readFileSync = function (input, ...args) {
      if (input === file) throw failure;
      return originalRead.call(this, input, ...args);
    };
    delete require.cache[modulePath];
    const reloaded = require(modulePath).transformers;
    for (const kind of ['csv', 'json']) {
      assert.throws(() => reloaded[kind](file), (error) => {
        assert.equal(error.name, 'ArgumentTypeError');
        assert.equal(error.message, `Could not read file '${file}': ${failure.message}`);
        assert.equal(error.constructor.name, 'ArgumentTypeError');
        return true;
      });
    }
  } finally {
    fs.readFileSync = originalRead;
    if (previousModule) require.cache[modulePath] = previousModule;
    else delete require.cache[modulePath];
  }
});
