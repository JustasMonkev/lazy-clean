import { readFileSync, writeFileSync, readdirSync, mkdirSync, lstatSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const publication = dirname(fileURLToPath(import.meta.url));
const study = process.env.STUDY_SNAPSHOT_ROOT ?? dirname(publication);
const stage = join(publication, '.stage');
if (existsSync(stage)) rmSync(stage, { recursive: true });
mkdirSync(stage, { recursive: true });
const digest = value => createHash('sha256').update(value).digest('hex');
const provenance = [];
const credentialRedactions = [];
const excluded = [];
function redact(bytes, label) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) throw new Error(`Binary evidence needs separate review before publication: ${label}`);
  let clean = text.replace(/\/Users\/[^/\s"'`]+/g, '/Users/REDACTED');
  clean = clean.replaceAll('/private/tmp/lazy-token-study-20261006', '<STUDY_ROOT>');
  const patterns = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['OpenAI-key-shaped', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
    ['GitHub-token-shaped', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
    ['JWT-shaped', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/g],
    ['AWS-access-key-shaped', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ['bearer-token-shaped', /\bBearer [A-Za-z0-9._~+/-]{20,}={0,2}/g],
  ];
  for (const [kind, pattern] of patterns) clean = clean.replace(pattern, () => { credentialRedactions.push({ file: label, kind }); return `<REDACTED_${kind}>`; });
  clean = clean.replace(/(\\?"(?:access_token|refresh_token|id_token|api_key|client_secret|password)\\?"\s*:\s*\\?")([^"\\\s]{12,})(\\?")/gi, (match, before, value, after) => { credentialRedactions.push({ file: label, kind: 'credential-field' }); return before + '<REDACTED_CREDENTIAL>' + after; });
  clean = clean.replace(/((?:OPENAI_API_KEY|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|CODEX_[A-Z_]*TOKEN)=)([^\s"']{12,})/g, (match, before) => { credentialRedactions.push({ file: label, kind: 'credential-environment-field' }); return before + '<REDACTED_CREDENTIAL>'; });
  return Buffer.from(clean);
}
function publishFile(from, to, label = relative(study, from)) {
  const stat = lstatSync(from);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not a regular evidence file: ${label}`);
  const original = readFileSync(from);
  const published = redact(original, label);
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, published, { mode: stat.mode & 0o777 });
  provenance.push({ file: label, originalSha256: digest(original), publishedSha256: digest(published), originalBytes: original.length, publishedBytes: published.length, mode: stat.mode & 0o777, normalizedOrRedacted: !original.equals(published) });
  return { originalSha256: digest(original), publishedSha256: digest(published), bytes: published.length, mode: stat.mode & 0o777 };
}
function walk(path) {
  return readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = join(path, entry.name);
    if (entry.name === '.git') { excluded.push({ file: relative(study, file), reason: 'Git history/config excluded from publication' }); return []; }
    if (entry.isSymbolicLink()) { excluded.push({ file: relative(study, file), reason: 'Symbolic link not followed' }); return []; }
    return entry.isDirectory() ? walk(file) : entry.isFile() ? [file] : [];
  });
}
function copyTree(from, to) { for (const path of walk(from)) publishFile(path, join(to, relative(from, path))); }
const inputs = join(stage, 'inputs');
for (const path of ['source', 'prompts', 'baseline/skills', 'candidate/skills', 'revision2/skills', 'final/skills', 'final-recovery/skills']) if (existsSync(join(study, path))) copyTree(join(study, path), join(inputs, path));
for (const name of ['manifest-v1.json', 'manifest.json', 'manifest-revision2.json', 'manifest-final.json', 'manifest-final-grading.json', 'manifest-final-recovery.json', 'manifest-final-recovery-grading.json', 'final-selection.json', 'runtime-provenance.json', 'global-skill-paths.json', 'prompt-audit-disabled.json', 'prompt-audit-disabled.stderr.log', 'runner.mjs', 'revision2-runner.mjs', 'final-runner.mjs', 'final-recovery-runner.mjs', 'audit.mjs']) if (existsSync(join(study, name))) publishFile(join(study, name), join(inputs, name));
if (existsSync(join(study, 'grading'))) for (const path of walk(join(study, 'grading')).filter(path => !path.includes('/results/'))) publishFile(path, join(inputs, 'grading', relative(join(study, 'grading'), path)));
for (const name of ['runner.mjs', 'revision2-runner.mjs', 'final-runner.mjs', 'final-recovery-runner.mjs']) {
  const from = join(study, name);
  if (!existsSync(from)) continue;
  let portable = redact(readFileSync(from), `portable/${name}`).toString('utf8');
  portable = portable.replace(/const repo = '[^']+';/, "const repo = process.env.STUDY_REPO ?? join(root, 'unconfigured-live-repo');");
  portable = portable.replace(/const playwright = '[^']+';/, "const playwright = process.env.STUDY_SOURCE ?? join(root, 'source');");
  const runAnchor = "async function run() {";
  const runAt = portable.indexOf(runAnchor);
  const manifestAt = portable.indexOf("  const manifest = JSON.parse(readFileSync(", runAt);
  const end = portable.indexOf('\n', manifestAt);
  if (runAt < 0 || manifestAt < 0 || end < 0) throw new Error('Portable runner entrypoint changed; review needed');
  const hostConfig = `\n  const hostPath = process.env.STUDY_HOST_SKILLS;\n  if (!hostPath) throw new Error('Model runs require a freshly audited absolute skill-path list in STUDY_HOST_SKILLS; no cross-host equivalence is assumed.');\n  const hostSkills = JSON.parse(readFileSync(hostPath));\n  if (!Array.isArray(hostSkills) || !hostSkills.every(path => typeof path === 'string' && path.startsWith('/'))) throw new Error('Expected audited absolute skill paths.');\n  manifest.globalSkillPathsDisabled = hostSkills;`;
  portable = portable.slice(0, end) + hostConfig + portable.slice(end);
  const portableName = name.replace('.mjs', '.portable.mjs');
  writeFileSync(join(inputs, portableName), portable);
  provenance.push({ file: `inputs/${portableName}`, derivedFrom: name, sourceOriginalSha256: digest(readFileSync(from)), publishedSha256: digest(Buffer.from(portable)), publishedBytes: Buffer.byteLength(portable), portabilityChanges: ['live repository/source paths use explicit environment settings', 'model runs require freshly audited host skill paths; no cross-host equivalence assumed'] });
}
if (existsSync(join(study, 'diagnostics'))) for (const name of ['recommendations.md', 'train-metrics.json']) if (existsSync(join(study, 'diagnostics', name))) publishFile(join(study, 'diagnostics', name), join(stage, 'checks/diagnostics', name));
const statuses = [], pending = [], missing = [];
const cases = [];
const storedBlobs = new Set();
const runs = join(study, 'runs');
for (const id of readdirSync(runs).sort()) {
  const dir = join(runs, id);
  const recordPath = join(dir, 'record.json');
  if (!existsSync(recordPath)) { pending.push(id); continue; }
  const recordBytes = readFileSync(recordPath);
  const record = JSON.parse(recordBytes);
  if (record.terminal !== true) { pending.push(id); continue; }
  statuses.push({ id, arm: record.arm, skill: record.skill, variant: record.variant, model: record.model, reasoning: 'medium', repetition: record.repetition, status: record.status, usage: record.usage ?? null, code: record.code ?? null, signal: record.signal ?? null, timeout: record.timeout, elapsedMs: record.elapsedMs, recordSha256: digest(recordBytes) });
  for (const name of ['record.json', 'stdout.jsonl', 'stderr.log', 'diff.patch', 'untracked.txt', 'prompt.txt']) {
    const from = join(dir, name);
    if (existsSync(from)) publishFile(from, join(stage, 'attempts', id, name));
    else missing.push({ id, file: name, reason: 'Not captured in terminal attempt' });
  }
  const work = join(dir, 'workspace');
  if (!existsSync(work)) { missing.push({ id, file: 'workspace', reason: 'Workspace unavailable for case reconstruction' }); continue; }
  const git = args => {
    const result = spawnSync('git', ['--no-optional-locks', ...args], { cwd: work, encoding: 'utf8', timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`Read-only Git evidence inventory failed for ${id}`);
    return result.stdout.split('\0').filter(Boolean);
  };
  const tracked = git(['diff', '--no-ext-diff', '--name-only', '-z', 'HEAD']);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']);
  const caseFiles = [];
  for (const path of [...new Set([...tracked, ...untracked])].sort()) {
    if (path.startsWith('/') || path.split('/').includes('..') || path.startsWith('.git/')) throw new Error(`Invalid task-owned path for ${id}`);
    const from = join(work, path);
    if (!existsSync(from)) { caseFiles.push({ path, deleted: true }); continue; }
    const stat = lstatSync(from);
    if (!stat.isFile() || stat.isSymbolicLink()) { excluded.push({ file: `runs/${id}/workspace/${path}`, reason: 'Unsupported nonregular task artifact' }); continue; }
    const original = readFileSync(from), clean = redact(original, `runs/${id}/workspace/${path}`), blob = digest(clean);
    if (!storedBlobs.has(blob)) {
      mkdirSync(join(stage, 'cases/blobs'), { recursive: true });
      writeFileSync(join(stage, 'cases/blobs', blob), clean);
      storedBlobs.add(blob);
    }
    provenance.push({ file: `runs/${id}/workspace/${path}`, originalSha256: digest(original), publishedSha256: blob, originalBytes: original.length, publishedBytes: clean.length, mode: stat.mode & 0o777, normalizedOrRedacted: !original.equals(clean) });
    caseFiles.push({ path, originalSha256: digest(original), publishedSha256: blob, blob: `blobs/${blob}`, bytes: clean.length, mode: stat.mode & 0o777 });
  }
  cases.push({ id, arm: record.arm, reconstruction: 'Start from frozen source plus this arm skill-files closure; overlay indexed case files/delete entries. The raw diff includes seeded review changes. No original Git history/config, credentials, or repeated unchanged workspaces are shipped.', files: caseFiles });
}
if (existsSync(join(study, 'preflight'))) for (const path of walk(join(study, 'preflight')).filter(path => !path.includes('/workspace/'))) publishFile(path, join(stage, 'attempts/preflight', relative(join(study, 'preflight'), path)));
const grades = {};
for (const name of readdirSync(study).filter(name => /^grades(?:-[\w-]+)?\.json$/.test(name)).sort()) {
  const original = JSON.parse(readFileSync(join(study, name)));
  if (name.includes('before-root-scan-amendment')) {
    publishFile(join(study, name), join(stage, 'checks/grading-history', name));
    continue;
  }
  Object.assign(grades, original);
  publishFile(join(study, name), join(publication, name));
}
for (const name of readdirSync(study).filter(name => /^(?:final-|root-scan-grade-amendment).+\.(?:json|md|log|stderr)$/.test(name) || name === 'root-scan-grade-amendment.json').sort()) if (!name.endsWith('.mjs')) publishFile(join(study, name), join(stage, 'checks/final-evidence', name));
for (const name of readdirSync(study).filter(name => /(?:notes|checks|test)\.(?:md|log)$/.test(name)).sort()) publishFile(join(study, name), join(stage, 'checks', name));
for (const folder of ['proposal-checks', 'revision2-checks', 'checks', 'recovery-grader-scratch']) if (existsSync(join(study, folder))) for (const path of walk(join(study, folder)).filter(path => !path.includes('/repo/'))) publishFile(path, join(stage, 'checks', folder, relative(join(study, folder), path)));
const repoEvidence = process.env.STUDY_REPO_EVIDENCE ?? join(process.cwd(), 'benchmarks/results/skill-tokens-20261006');
for (const name of ['README.md', 'harness.md', 'source-copy-check.json', 'final-slop-scan.log', 'final-slop-scan.json']) if (existsSync(join(repoEvidence, name))) publishFile(join(repoEvidence, name), join(stage, 'checks/repository-report', name));
if (existsSync(join(study, 'final-shipped-checks.json'))) publishFile(join(study, 'final-shipped-checks.json'), join(publication, 'final-shipped-checks.json'));
writeFileSync(join(stage, 'cases/index.json'), JSON.stringify(cases, null, 2) + '\n');
const count = {};
for (const row of statuses) {
  const arm = count[row.arm] ??= { terminal: 0, completed: 0, failed: 0, unknownUsage: 0, qualityPass: 0, qualityFail: 0, ungraded: 0, modelQualityNotApplicable: 0 };
  arm.terminal++; arm[row.status === 'completed' ? 'completed' : 'failed']++;
  if (!row.usage) arm.unknownUsage++;
  if (row.arm === 'final' && row.status !== 'completed' && row.usage === null) arm.modelQualityNotApplicable++;
  else if (grades[row.id]?.pass === true) arm.qualityPass++;
  else if (grades[row.id]?.pass === false) arm.qualityFail++;
  else arm.ungraded++;
}
const observedArms = Object.keys(count).sort();
const comparatorArms = observedArms.filter(arm => arm !== 'baseline');
const expectedFullStudy = Object.fromEntries(observedArms.map(arm => [arm, 132]));
const expectedNotYetTerminal = Object.fromEntries(observedArms.map(arm => [arm, Math.max(0, 132 - count[arm].terminal)]));
const pairs = [];
for (const arm of comparatorArms) for (const base of statuses.filter(r => r.arm === 'baseline')) {
  const other = statuses.find(r => r.arm === arm && r.skill === base.skill && r.model === base.model && r.variant === base.variant && r.repetition === base.repetition);
  if (other && base.status === 'completed' && other.status === 'completed' && base.usage && other.usage && grades[base.id]?.pass === true && grades[other.id]?.pass === true) pairs.push({ arm, model: base.model, variant: base.variant, skill: base.skill, repetition: base.repetition, baseline: base.id, comparator: other.id, baselineUsage: base.usage, comparatorUsage: other.usage });
}
const metrics = [];
for (const arm of comparatorArms) for (const model of ['gpt-6.1-sol', 'gpt-6-luna']) for (const variant of ['train', 'heldout']) {
  const selected = pairs.filter(p => p.arm === arm && p.model === model && p.variant === variant);
  const base = selected.reduce((s,p) => s+p.baselineUsage.total,0), other = selected.reduce((s,p) => s+p.comparatorUsage.total,0);
  metrics.push({ arm, model, reasoning: 'medium', variant, matchedQualityPassPairs: selected.length, expectedPairs: 33, baselineTotal: selected.length ? base : null, comparatorTotal: selected.length ? other : null, reduction: selected.length ? 1-other/base : null, all33PairsPassed: selected.length === 33 });
}
const snapshot = { captured: new Date().toISOString(), terminalOnly: true, pendingExistingDirectories: pending, missingArtifacts: missing, excludedUnsupportedArtifacts: excluded, armCounts: count, metrics, pairs, statuses, expectedFullStudy, expectedNotYetTerminal, pendingNotice: 'Observed arms may still be running; absent/not-yet-terminal attempts are not passed, failed, or measured here. Planned but not observed arms are not represented as executed. This snapshot alone is not final completion.', redaction: 'Publication copies normalize /Users/<account> to /Users/REDACTED and the original temporary root to <STUDY_ROOT>; original SHA256 values remain recorded. Credential-shaped values are replaced with typed placeholders. Original live inputs are never edited.', caveats: ['Matched-pass savings are conditional, not full-suite success; all failures/timeouts/unknown usage and ungraded cells remain explicit.', 'Same exact gpt-6.1-sol and gpt-6-luna with medium reasoning; raw cache/input/output/reasoning fields are retained, not double-counted.', 'Seven substantive heldout tasks and four repeat/framing variants; bounded actual Playwright source snapshot, not full Playwright.', 'Four baseline-identical skill metadata fields fail current validator; metadata not removed.', 'Full slop scan has 12 unchanged upstream-fixture no-any findings; not a clean scan. Authored MJS scans were clean when recorded.', 'Trust-local reproduction only. Restored historical reports are unauthenticated; engine qualification not established.'] };
writeFileSync(join(publication, 'snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
const changedEntrypoints = ['lazy-help', 'lazy-debt', 'slop-check'];
const skills = JSON.parse(readFileSync(join(study, 'manifest.json'))).skills;
const usageFields = ['input', 'cachedInput', 'uncachedInput', 'output', 'total'];
function summarizeCells(arm, selectedSkills, model, variant) {
  const selected = statuses.filter(row => row.arm === arm && selectedSkills.includes(row.skill) && (model === null || row.model === model) && (variant === null || row.variant === variant));
  const expected = selectedSkills.length * 3 * (model === null ? 2 : 1) * (variant === null ? 2 : 1);
  const valid = selected.filter(row => row.status === 'completed' && row.usage !== null && usageFields.every(field => Number.isFinite(row.usage[field]) && row.usage[field] >= 0));
  const known = Object.fromEntries(usageFields.map(field => {
    const measured = selected.filter(row => row.usage !== null && Number.isFinite(row.usage[field]) && row.usage[field] >= 0);
    return [field, { records: measured.length, sum: measured.length ? measured.reduce((sum, row) => sum + row.usage[field], 0) : null }];
  }));
  const qualityPass = selected.filter(row => grades[row.id]?.pass === true).length;
  const qualityFail = selected.filter(row => grades[row.id]?.pass === false).length;
  return { expected, attempts: selected.length, absentOrNotYetTerminal: Math.max(0, expected - selected.length), completions: selected.filter(row => row.status === 'completed').length, executionFailures: selected.filter(row => row.status !== 'completed').length, missingUsage: selected.filter(row => row.usage === null).length, qualityPass, qualityFail, ungraded: selected.length - qualityPass - qualityFail, knownUsage: known, allExpectedMeasured: valid.length === expected && selected.length === expected, allExpectedQualityPass: qualityPass === expected && selected.length === expected };
}
function compareCells(selectedSkills, model, variant, group) {
  const baseline = summarizeCells('baseline', selectedSkills, model, variant);
  const recovery = summarizeCells('final-recovery', selectedSkills, model, variant);
  const allExpectedMeasured = baseline.allExpectedMeasured && recovery.allExpectedMeasured;
  const matching = pairs.filter(pair => pair.arm === 'final-recovery' && selectedSkills.includes(pair.skill) && (model === null || pair.model === model) && (variant === null || pair.variant === variant));
  const baselinePaired = matching.reduce((sum, pair) => sum + pair.baselineUsage.total, 0);
  const recoveryPaired = matching.reduce((sum, pair) => sum + pair.comparatorUsage.total, 0);
  return { group, skills: selectedSkills, model, reasoning: 'medium', variant, baseline, finalRecovery: recovery, allExpectedMeasured, fullRowTotalReduction: allExpectedMeasured && baseline.knownUsage.total.sum > 0 ? 1 - recovery.knownUsage.total.sum / baseline.knownUsage.total.sum : null, efficiencyQualified: allExpectedMeasured && baseline.allExpectedQualityPass && recovery.allExpectedQualityPass, conditionalMatchedQualityPass: { label: 'Conditional on both attempts passing; not a full-suite efficiency qualification', pairCount: matching.length, baselineTotal: matching.length ? baselinePaired : null, comparatorTotal: matching.length ? recoveryPaired : null, reduction: matching.length && baselinePaired > 0 ? 1 - recoveryPaired / baselinePaired : null } };
}
const perSkill = [];
const grouped = [];
for (const model of ['gpt-6.1-sol', 'gpt-6-luna']) for (const variant of ['train', 'heldout']) {
  for (const skill of skills) perSkill.push(compareCells([skill], model, variant, 'single-entrypoint'));
  grouped.push(compareCells(skills, model, variant, 'all-entrypoints'));
  grouped.push(compareCells(changedEntrypoints, model, variant, 'changed-three-entrypoints'));
  grouped.push(compareCells(skills.filter(skill => !changedEntrypoints.includes(skill)), model, variant, 'unchanged-eight-entrypoints'));
}
for (const [group, selected] of [['all-entrypoints', skills], ['changed-three-entrypoints', changedEntrypoints], ['unchanged-eight-entrypoints', skills.filter(skill => !changedEntrypoints.includes(skill))]]) grouped.push(compareCells(selected, null, null, group));
const publicationDecisionPath = join(study, 'final-publication-selection.json');
const publicationDecision = existsSync(publicationDecisionPath) ? JSON.parse(redact(readFileSync(publicationDecisionPath), 'final-publication-selection.json')) : null;
const comparison = { publicationDecision, captured: snapshot.captured, baselineArm: 'baseline', comparatorArm: 'final-recovery', finalInfrastructureArm: count.final ?? null, completeMeasuredGrid: perSkill.every(row => row.allExpectedMeasured), completelyGradedGrid: perSkill.every(row => row.baseline.ungraded === 0 && row.finalRecovery.ungraded === 0 && row.baseline.attempts === 3 && row.finalRecovery.attempts === 3), caveats: ['Known sums include only available numeric metrics; partial known sums are not full rows and missing values never become zero.', 'Full-row reductions describe all valid attempt usage; quality failures prevent efficiency qualification.', 'Changed-three versus unchanged-eight entrypoints are descriptive groups, not independent controls; shared skill closure/reference reads can affect every entrypoint.', 'The final arm failed before model turns with null usage; it is infrastructure evidence, not measured model quality.', 'Frozen measured closure is not automatically validated shipped source; rejection or later scope changes require an explicit final source decision.'], perSkill, grouped };
writeFileSync(join(publication, 'final-comparison.json'), JSON.stringify(comparison, null, 2) + '\n');
const percent = value => value === null ? '—' : (value * 100).toFixed(2) + '%';
const amount = value => value === null ? 'unknown' : String(value);
const countsCell = row => `${row.attempts}/${row.expected}; ${row.completions}/${row.executionFailures}; ${row.missingUsage}; ${row.qualityPass}/${row.qualityFail}/${row.ungraded}`;
const header = '| Model | Variant | Entrypoint/group | Baseline counts | Recovery counts | Baseline known total | Recovery known total | Complete measured row | All-attempt reduction | Passing pairs | Conditional reduction |';
const separator = '|---|---|---|---|---|---:|---:|---|---:|---:|---:|';
const tableRow = row => `| ${row.model ?? 'both'} | ${row.variant ?? 'both'} | ${row.skills.length === 1 ? row.skills[0] : row.group} | ${countsCell(row.baseline)} | ${countsCell(row.finalRecovery)} | ${amount(row.baseline.knownUsage.total.sum)} | ${amount(row.finalRecovery.knownUsage.total.sum)} | ${row.allExpectedMeasured ? 'yes' : 'no'} | ${percent(row.fullRowTotalReduction)} | ${row.conditionalMatchedQualityPass.pairCount} | ${percent(row.conditionalMatchedQualityPass.reduction)} |`;
writeFileSync(join(publication, 'final-tables.md'), `# Final measured comparison\n\nCaptured ${snapshot.captured}. ${comparison.completeMeasuredGrid && comparison.completelyGradedGrid ? 'All expected baseline/recovery measurements and verdicts are present.' : '**Pending:** measurements or verdicts are incomplete.'}\n\nCounts: attempts/planned; completed/execution-failed; missing usage; quality pass/fail/ungraded. Unknown usage is not zero. Known totals may be partial. All-attempt reduction is shown only for completely measured rows and does not qualify efficiency when quality fails. Passing-pair reductions are conditional. Input/cached/uncached/output/total sums and contributing counts are in final-comparison.json.\n\nChanged-three and unchanged-eight **entrypoints** are descriptive groups, not independent controls; shared closure/reference reads remain included. Frozen measured source is not automatically validated shipped source. Historical startup failures remain explicit in snapshot.json and are not model-quality measurements.\n\n## Group totals\n\n${header}\n${separator}\n${grouped.map(tableRow).join('\n')}\n\n## Every entrypoint\n\n${header}\n${separator}\n${perSkill.map(tableRow).join('\n')}\n`);

writeFileSync(join(publication, 'provenance.json'), JSON.stringify({ captured: snapshot.captured, files: provenance, credentialRedactions }, null, 2) + '\n');
const archives = [];
for (const name of ['inputs', 'attempts', 'cases', 'checks']) {
  mkdirSync(join(stage, name), { recursive: true });
  const tarProgram = `import sys,tarfile,pathlib
stage=pathlib.Path(sys.argv[1]); name=sys.argv[2]
with tarfile.open(sys.argv[3], 'w:gz', format=tarfile.USTAR_FORMAT) as archive:
 def normalize(info):
  info.uid=0; info.gid=0; info.uname=''; info.gname=''; info.pax_headers={}
  return info
 archive.add(stage/name, arcname=name, filter=normalize)
`;
  const result = spawnSync('python3', ['-c', tarProgram, stage, name, join(publication, name + '.tar.gz')], { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Archive failed: ${name}`);
  const bytes = readFileSync(join(publication, name + '.tar.gz'));
  archives.push({ file: name + '.tar.gz', bytes: bytes.length, sha256: digest(bytes) });
}
writeFileSync(join(publication, 'archives.json'), JSON.stringify(archives, null, 2) + '\n');
rmSync(stage, { recursive: true });
console.log(JSON.stringify({ captured: snapshot.captured, armCounts: count, pending: pending.length, uniqueCaseBlobs: storedBlobs.size, caseFileEntries: cases.reduce((s,c)=>s+c.files.length,0), credentialShapedRedactions: credentialRedactions.length, artifacts: archives }, null, 2));
