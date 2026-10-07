import assert from 'node:assert/strict';
import { posix, win32 } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { isExcludedSubtree, normalizePrivatePaths } from '../benchmarks/results/skill-tokens-20261006/publication-paths.mjs';

for (const paths of [posix, win32]) {
  for (const directory of ['workspace', 'results', 'repo']) {
    test(`${paths.sep} excludes only the ${directory} subtree below the evidence root`, () => {
      const root = paths.join(paths.sep === '/' ? '/tmp' : 'C:\\Temp', directory, 'study');
      assert.equal(isExcludedSubtree(root, paths.join(root, 'nested', directory, 'private.bin'), directory, paths), true);
      assert.equal(isExcludedSubtree(root, paths.join(root, `${directory}-notes`, 'proof.json'), directory, paths), false);
      assert.equal(isExcludedSubtree(root, paths.join(root, 'proof.json'), directory, paths), false);
    });
  }
}

test('normalizes Linux, macOS, raw Windows and JSON-escaped Windows home paths', () => {
  const paths = ['/home/alice/document', '/Users/bob/document', 'D:\\Users\\carol\\document'];
  const normalized = normalizePrivatePaths(JSON.stringify(paths), '/tmp/other-study');
  const parsed = JSON.parse(normalized);
  assert.equal(parsed.length, 3);
  for (const name of ['alice', 'bob', 'carol']) assert.equal(normalized.includes(name), false);
  assert.deepEqual(parsed, ['/home/REDACTED/document', '/Users/REDACTED/document', 'C:/Users/REDACTED\\document']);
  assert.equal(normalizePrivatePaths('D:\\Users\\carol\\document', '/tmp/other-study'), 'C:/Users/REDACTED\\document');
});

test('normalizes configured study roots before home redaction and preserves valid JSON', () => {
  for (const root of ['/srv/custom-study', '/home/alice/custom-study', 'D:\\Temp\\custom-study']) {
    const value = normalizePrivatePaths(JSON.stringify({ source: root + '/source.ts' }), root);
    assert.equal(JSON.parse(value).source, '<STUDY_ROOT>/source.ts');
    assert.equal(value.includes('custom-study'), false);
    assert.equal(normalizePrivatePaths(root.replaceAll('\\', '/') + '/source.ts', root), '<STUDY_ROOT>/source.ts');
  }
});

test('redacts complete account names with spaces without treating prose as a home path', () => {
  const value = normalizePrivatePaths(JSON.stringify(['/Users/alice smith/doc', 'C:\\Users\\carol jane\\doc']), '/tmp/study');
  assert.deepEqual(JSON.parse(value), ['/Users/REDACTED/doc', 'C:/Users/REDACTED\\doc']);
  assert.equal(normalizePrivatePaths('No Git/home state copied.', '/tmp/study'), 'No Git/home state copied.');
  assert.equal(normalizePrivatePaths('d:\\users\\alice smith\\doc', '/tmp/study'), 'C:/Users/REDACTED\\doc');
});

test('study oracle reports its separate runtime requirement or a missing-module tooling failure', () => {
  const oracle = fileURLToPath(new URL('../benchmarks/results/skill-tokens-20261006/grading/behavior-oracle.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [oracle, 'train', oracle + '.absent.ts'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'tooling-failure');
  if (Number(process.versions.node.split('.')[0]) < 26) assert.match(report.error, /requires Node >=26/);
  else assert.match(report.error, /ERR_MODULE_NOT_FOUND/);
});
