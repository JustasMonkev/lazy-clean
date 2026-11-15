import './simplicity-projects-a.test.mjs';
import './simplicity-projects-b.test.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../benchmarks/run.mjs';
import {tasks} from '../benchmarks/simplicity-projects.mjs';

const root = mkdtempSync(join(tmpdir(), 'simplicity-selection-'));
try {
  assert.equal(tasks.length, 6);
  assert.equal(new Set(tasks.map(task => task.id)).size, 6);
  const config = join(root, 'config.json');
  writeFileSync(config, JSON.stringify({command:[process.execPath, '-e', ''], model:'fake-selection-only', trials:1, taskSet:'simplicity'}));
  const output = join(root, 'results');
  assert.equal(await main([config, output, 'report-review']), 0);
  const report = JSON.parse(readFileSync(join(output, 'results.json'), 'utf8'));
  assert.equal(report.config.taskSet, 'simplicity');
  assert.deepEqual(report.results.map(result => [result.task, result.arm, result.pass]), [['report-review', 'off', true], ['report-review', 'on', true]]);
  for (const result of report.results) assert.equal(result.sourceBytesAfter, result.sourceBytesBefore);
  const task = tasks.find(task => task.id === 'report-review');
  for (const arm of ['off', 'on']) {
    const prompt = readFileSync(join(output, `report-review-1-${arm}`, 'prompt.txt'), 'utf8');
    assert.ok(prompt.includes(task.prompt));
    assert.equal(prompt.includes(task.design), false);
    assert.equal(prompt.includes('LAZY MODE ACTIVE'), arm === 'on');
  }
  console.log('simplicity project selection: six unique projects, paired routing, no-change metrics, and rubric isolation passed');
} finally {rmSync(root, {recursive:true, force:true});}
