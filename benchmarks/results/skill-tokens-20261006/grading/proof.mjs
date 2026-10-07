import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const grading = dirname(fileURLToPath(import.meta.url));
const root = dirname(grading);
const original = process.argv[2] ?? join(root, 'inputs/source/packages/isomorphic/stringUtils.ts');
const cases = [
  ['original-train', 'train', original, 1, 'behavior-fail'],
  ['original-heldout', 'heldout', original, 1, 'behavior-fail'],
  ['good-train', 'train', join(grading, 'known-good-train.ts'), 0, 'pass'],
  ['good-heldout', 'heldout', join(grading, 'known-good-heldout.ts'), 0, 'pass'],
  ['missing-module', 'train', join(grading, 'intentionally-absent-module.ts'), 2, 'tooling-failure'],
];
const proof = [];
for (const [name, variant, module, expectedExit, expectedStatus] of cases) {
  const result = spawnSync(process.execPath, [join(grading, 'behavior-oracle.mjs'), variant, module], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  writeFileSync(join(grading, name + '.json'), result.stdout);
  writeFileSync(join(grading, name + '.stderr'), result.stderr);
  const report = JSON.parse(result.stdout);
  if (result.status !== expectedExit || report.status !== expectedStatus) throw new Error(`Oracle proof failed for ${name}`);
  if (name.startsWith('original') && !report.checks.some(c => c.status === 'fail' && c.name === (variant === 'train' ? 'astral suffix counts one point' : 'uppercase scheme'))) throw new Error(`Intended assertion did not fail for ${name}`);
  proof.push({ name, exitCode: result.status, status: report.status, passed: report.passed ?? null, failed: report.failed ?? null });
}
writeFileSync(join(grading, 'proof-results.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
