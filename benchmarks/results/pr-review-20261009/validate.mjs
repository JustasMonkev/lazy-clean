import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lintSource, RULE_IDS } from '../../../skills/slop-check/scripts/check.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const baselineRef = '8f38b32bae676c300d03191c2668e4f0c1271544';
const temporary = mkdtempSync(join(tmpdir(), 'lazy-review-validation-'));
const report = { node: process.version, baselineRef, ruleCount: RULE_IDS.size, paired: [], semantics: [] };
try {
  const baselinePath = join(temporary, 'baseline.mjs');
  writeFileSync(baselinePath, execFileSync('git', ['show', `${baselineRef}:skills/slop-check/scripts/check.mjs`], { cwd: root }));
  const baseline = await import(pathToFileURL(baselinePath).href);
  const probes = JSON.parse(readFileSync(new URL('./playwright-analysis-probes.json', import.meta.url), 'utf8')).reduced;
  probes.push({ path: 'package-isolation.test.ts', source: "jest.mock('@wdio/config', () => ({ ConfigParser: class { autoCompile() {} getCapabilities() {} } }));" });
  probes.push({ path: 'subject-bypass.test.ts', source: "vi.mock('./subject');" });
  const detection = findings => findings.map(({ rule, line, column, severity }) => ({ rule, line, column, severity }));
  for (const probe of probes) {
    const before = baseline.lintSource(probe.source, probe.path);
    const after = lintSource(probe.source, probe.path);
    assert.deepEqual(detection(after), detection(before), probe.path);
    report.paired.push({ path: probe.path, source: probe.source, before, after });
  }

  const firstNode = { id: 'node-1', label: 'first' };
  const nodes = [firstNode, { id: 'node-1', label: 'second representation' }];
  const serialized = Array.from(new Set(nodes.map(node => JSON.stringify(node)))).map(value => JSON.parse(value));
  const seen = new Set();
  const filtered = nodes.filter(node => seen.has(node.id) ? false : (seen.add(node.id), true));
  assert.equal(serialized.length, 2);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0], firstNode);
  report.semantics.push({ case: 'WDIO #14319 reduction', proves: 'ID deduplication retains original object identity; JSON equality does not model node identity.' });

  function capabilityProbe(compile) {
    let compileCalls = 0;
    const config = { autoCompile() { compileCalls += 1; }, getCapabilities() { return [{ browserName: 'chrome' }]; } };
    if (compile) config.autoCompile();
    const selected = config.getCapabilities();
    assert.deepEqual(selected, [{ browserName: 'chrome' }]);
    assert.equal(compileCalls, 1);
  }
  capabilityProbe(true);
  assert.throws(() => capabilityProbe(false), assert.AssertionError);
  report.semantics.push({ case: 'WDIO #8156/#8456 reduction', proves: 'A call assertion catches skipped orchestration even when the returned capability value stays correct.' });

  const processed = [];
  for (const batch of ['failed', 'later']) {
    try {
      if (batch === 'failed') throw new Error('telemetry unavailable');
      processed.push(batch);
    } catch {}
  }
  assert.deepEqual(processed, ['later']);
  assert.throws(() => {
    for (const batch of ['failed', 'later']) {
      if (batch === 'failed') throw new Error('telemetry unavailable');
    }
  }, /telemetry unavailable/);
  report.semantics.push({ case: 'WDIO #15331 reduction', proves: 'An intentional best-effort catch allows later work; removing it changes completion semantics.' });
  report.limits = 'Semantic cases are reductions, not upstream suite executions. Paired findings prove unchanged detection on these probes, not scanner completeness or AI code quality.';
  writeFileSync(new URL('./validation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.paired.length} paired checker probes and ${report.semantics.length} semantic counterexamples passed; ${report.ruleCount} rule IDs.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
