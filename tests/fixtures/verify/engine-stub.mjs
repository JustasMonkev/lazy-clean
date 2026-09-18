// Protocol fixture only. This does NOT execute a target or verify behavior.
import { createHash } from 'node:crypto';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(join(root, 'scenario.json'), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const entries = [];
function visit(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) visit(path);
    else entries.push([relative(root, path).split(sep).join('/'), hash(readFileSync(path))]);
  }
}
visit(root);
const engine = { version: 'fixture-1', digest: hash(JSON.stringify(entries)) };
const protocol = 'lazy-clean.verify/1';
if (process.argv[3] === 'capabilities') {
  console.log(JSON.stringify({ protocol, engine, modes: ['fix', 'preserve'], adapters: ['node-script-v1'],
    sourceModes: ['commit', 'worktree'], platforms: [process.platform], nodeMajor: Number(process.versions.node.split('.')[0]),
    cancellation: 'sigterm-process-group', ...scenario.capabilities }));
} else if (scenario.action === 'broken-pipe') {
  process.stdin.destroy();
  process.exitCode = 3;
} else {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const request = JSON.parse(input);
  if (scenario.action === 'hang' || scenario.action === 'descendant') {
    const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    writeFileSync(join(request.outputRoot, 'child.pid'), String(child.pid));
    if (scenario.action === 'hang') {
      process.on('SIGTERM', () => {});
      setInterval(() => {}, 1000);
    } else {
      child.unref();
    }
  } else if (scenario.action === 'missing') {
    process.exitCode = 0;
  } else if (scenario.action === 'truncated') {
    process.stdout.write('{');
  } else if (scenario.action === 'oversized') {
    process.stdout.write('x'.repeat(1024 * 1024 + 1));
  } else if (scenario.action === 'stderr') {
    process.stderr.write('x'.repeat(1024 * 1024 + 1));
  } else {
    const evidence = 'Synthetic protocol fixture; not behavioral verification.\n';
    writeFileSync(join(request.outputRoot, 'evidence.json'), evidence);
    const source = (side) => ({ selector: request.sources[side], kind: request.sources[side] === 'worktree' ? 'worktree' : 'commit',
      identity: request.replay ? request.replay.sources[side].identity : 'a'.repeat(request.sources[side] === 'worktree' ? 64 : 40) });
    const result = {
      schemaVersion: 1, protocol, requestId: request.requestId, engine, mode: request.mode, profile: request.profile,
      digests: request.digests, repositoryRoot: request.repositoryRoot, sources: { base: source('base'), head: source('head') },
      execution: 'complete', behavior: request.mode === 'fix' ? 'fixed_observed' : 'preserved_observed', gate: 'passed',
      applicability: 'current', reasonCodes: [], evidence: { path: 'evidence.json', digest: hash(evidence) },
      limitations: ['Protocol fixture only; no target execution'], requiredChecks: request.requiredChecks.map((id) => ({ id, status: 'passed' })),
      evidenceComplete: true, cleanup: 'complete', observationAuthenticity: 'not-established', ...scenario.result,
    };
    const manifest = join(request.outputRoot, 'manifest.json');
    if (scenario.manifest !== 'missing') {
      const recorded = scenario.manifest === 'different' ? { ...result, limitations: ['Different recorded observation'] }
        : scenario.manifest === 'reordered' ? Object.fromEntries(Object.entries(result).reverse()) : result;
      const bytes = scenario.manifest === 'malformed' ? '{' : JSON.stringify(recorded, null, 2);
      if (scenario.manifest === 'symlink') {
        const outside = join(process.cwd(), 'outside-manifest.json');
        writeFileSync(outside, bytes);
        symlinkSync(outside, manifest);
      } else writeFileSync(manifest, bytes);
    }
    if (scenario.recordScratch) {
      writeFileSync(join(request.outputRoot, 'scratch.txt'), process.cwd());
    }
    if (scenario.action === 'change-policy') writeFileSync(request.policyPath, readFileSync(request.policyPath, 'utf8') + '\n');
    if (scenario.action === 'change-config') writeFileSync(request.configPath, readFileSync(request.configPath, 'utf8') + '\n');
    console.log(JSON.stringify(result));
    if (scenario.action === 'duplicate') console.log(JSON.stringify(result));
    process.exitCode = scenario.exitCode || 0;
  }
}
