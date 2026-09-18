#!/usr/bin/env node
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { launch, negotiate } from './engine.mjs';
import { PROTOCOL, digest, fail, fields, hash, parseJSON, readBytes, render, requireValue,
  resultExit, safePath, strings, validateResult } from './protocol.mjs';

export function bundleDigest(root) {
  const entries = [];
  let size = 0;
  let count = 0;
  function visit(dir) {
    for (const name of readdirSync(dir).sort()) {
      requireValue(++count <= 4096, 'Bundle exceeds supported entry count');
      const path = join(dir, name);
      const stat = lstatSync(path);
      requireValue(!stat.isSymbolicLink(), 'Symlinked bundles are unsupported');
      if (stat.isDirectory()) visit(path);
      else {
        requireValue(stat.isFile(), 'Non-file bundle entry');
        const bytes = readBytes(path, 32 * 1024 * 1024 - size);
        size += bytes.length;
        const name = relative(root, path).split(sep).join('/');
        requireValue(safePath(name), 'Unsafe bundle path');
        entries.push([name, digest(bytes)]);
      }
    }
  }
  visit(root);
  return digest(JSON.stringify(entries));
}

function inside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function validateOutputParent(path) {
  let existing = path;
  for (;;) {
    try {
      requireValue(realpathSync(existing) === existing, 'Output directory must not traverse symlinks');
      requireValue(lstatSync(existing).isDirectory(), 'Output parent must be a directory');
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      existing = dirname(existing);
    }
  }
}

function createOutputParent(path) {
  validateOutputParent(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  requireValue(realpathSync(path) === path, 'Output directory changed during creation');
}

function argumentsFor(argv) {
  const [operation, ...args] = argv;
  const allowed = {
    doctor: ['policy', 'config', 'format'],
    verify: ['policy', 'config', 'format', 'profile', 'base', 'head', 'include-untracked', 'trust-code'],
    report: ['format'],
    replay: ['policy', 'config', 'format', 'trust-code'],
  };
  requireValue(Object.hasOwn(allowed, operation), 'Expected doctor, verify, report, or replay');
  const options = { operation, format: 'markdown', include: [] };
  const seen = new Set();
  if (operation === 'report' || operation === 'replay') {
    requireValue(args[0] && !args[0].startsWith('--'), 'A manifest path is required');
    options.manifest = args.shift();
  }
  while (args.length) {
    const flag = args.shift();
    const key = flag.startsWith('--') ? flag.slice(2) : '';
    requireValue(allowed[operation].includes(key), `Unknown option: ${flag}`);
    requireValue(key === 'include-untracked' || !seen.has(key), `Duplicate option: ${flag}`);
    seen.add(key);
    const value = key === 'trust-code' ? true : args.shift();
    requireValue(key === 'trust-code' || (typeof value === 'string' && value.length > 0 && !value.startsWith('--')), `Missing value: ${flag}`);
    if (key === 'include-untracked') {
      requireValue(safePath(value) && !options.include.includes(value), 'Invalid or duplicate untracked path');
      options.include.push(value);
    } else options[key] = value;
  }
  requireValue(['json', 'markdown'].includes(options.format), 'Unsupported format');
  if (operation !== 'report') requireValue(options.policy, 'Explicit --policy is required');
  if (operation === 'verify') {
    requireValue(options.profile && options.base && options.head, 'Explicit profile, base and head are required');
    requireValue(options.head === 'worktree' || options.include.length === 0, 'Untracked inclusion needs worktree mode');
  }
  if (operation === 'verify' || operation === 'replay') requireValue(options['trust-code'], 'Explicit --trust-code is required', 'CODE_NOT_AUTHORIZED');
  return options;
}

function policyFor(path) {
  const bytes = readBytes(path);
  const policy = parseJSON(bytes);
  fields(policy, ['schemaVersion', 'repositoryRoot', 'profile', 'configDigest', 'profileDigest', 'contractDigest',
    'engine', 'commands', 'budgets', 'repetitions', 'excludeUntracked'], ['outputRoot']);
  requireValue(policy.schemaVersion === 1, 'Unsupported policy schema');
  if (Object.hasOwn(policy, 'outputRoot')) requireValue(typeof policy.outputRoot === 'string' && isAbsolute(policy.outputRoot), 'Output root must be absolute');
  requireValue(typeof policy.repositoryRoot === 'string' && isAbsolute(policy.repositoryRoot)
    && realpathSync(policy.repositoryRoot) === policy.repositoryRoot, 'Policy needs canonical repository root');
  requireValue(typeof policy.profile === 'string' && policy.profile.length > 0, 'Missing policy profile');
  requireValue([policy.configDigest, policy.profileDigest, policy.contractDigest].every(hash), 'Invalid approved digests');
  requireValue(strings(policy.excludeUntracked) && policy.excludeUntracked.every(safePath), 'Invalid exclusions');
  requireValue(Number.isInteger(policy.repetitions) && policy.repetitions >= 1 && policy.repetitions <= 100, 'Invalid repetition count');
  fields(policy.budgets, ['totalMs']);
  requireValue(Number.isInteger(policy.budgets.totalMs) && policy.budgets.totalMs > 0 && policy.budgets.totalMs <= 3600000, 'Invalid total budget');
  requireValue(Array.isArray(policy.commands), 'Invalid approved commands');
  for (const command of policy.commands) {
    fields(command, ['id', 'executable', 'args']);
    requireValue(typeof command.id === 'string' && command.id.length > 0 && typeof command.executable === 'string'
      && isAbsolute(command.executable) && Array.isArray(command.args)
      && command.args.every((arg) => typeof arg === 'string' && !arg.includes('\0')), 'Invalid command');
  }
  requireValue(strings(policy.commands.map((command) => command.id)), 'Duplicate command IDs');
  fields(policy.engine, ['node', 'entry', 'version', 'digest', 'nodeMajor']);
  const engine = policy.engine;
  requireValue(typeof engine.node === 'string' && isAbsolute(engine.node) && typeof engine.entry === 'string'
    && isAbsolute(engine.entry) && /\.(?:mjs|cjs|js)$/u.test(engine.entry), 'Engine needs absolute Node and JS paths');
  requireValue(typeof engine.version === 'string' && engine.version.length > 0 && hash(engine.digest)
    && Number.isInteger(engine.nodeMajor) && engine.nodeMajor >= 18, 'Invalid engine identity/runtime');
  return { policy, policyDigest: digest(bytes) };
}

function configuration(root, path, policy) {
  const bytes = readBytes(path);
  const config = parseJSON(bytes);
  fields(config, ['schemaVersion', 'profiles']);
  requireValue(config.schemaVersion === 1, 'Unsupported configuration schema');
  requireValue(config.profiles && typeof config.profiles === 'object' && !Array.isArray(config.profiles), 'Invalid profiles');
  for (const profile of Object.values(config.profiles)) {
    fields(profile, ['mode', 'contract', 'requiredChecks']);
    requireValue(['fix', 'preserve'].includes(profile.mode) && safePath(profile.contract) && strings(profile.requiredChecks), 'Invalid profile');
  }
  requireValue(Object.hasOwn(config.profiles, policy.profile), 'Unknown profile');
  const profile = config.profiles[policy.profile];
  const contract = realpathSync(join(root, profile.contract));
  requireValue(inside(root, contract) && inside(root, dirname(contract)), 'Contract escapes repository');
  requireValue(digest(bytes) === policy.configDigest && digest(JSON.stringify(profile)) === policy.profileDigest
    && bundleDigest(dirname(contract)) === policy.contractDigest, 'Profile or contract changed; renewed review required', 'APPROVAL_MISMATCH');
  requireValue(profile.requiredChecks.every((id) => policy.commands.some((command) => command.id === id)), 'Unapproved required check');
  return profile;
}

function readReport(path) {
  const result = validateResult(parseJSON(readBytes(path)));
  // Rendering uses the data only. Replay passes the location to the trusted
  // engine, which must validate and resolve the bundle without executing it.
  return result;
}

function capabilities(bytes, policy) {
  const result = parseJSON(bytes);
  fields(result, ['protocol', 'engine', 'modes', 'adapters', 'sourceModes', 'platforms', 'nodeMajor', 'cancellation']);
  fields(result.engine, ['version', 'digest']);
  requireValue(result.protocol === PROTOCOL && result.engine.version === policy.engine.version
    && result.engine.digest === policy.engine.digest, 'Engine protocol/version/digest mismatch', 'ENGINE_CAPABILITY_UNSUPPORTED');
  requireValue(strings(result.modes) && result.modes.length === 2 && result.modes.includes('fix') && result.modes.includes('preserve')
    && strings(result.adapters) && result.adapters.includes('node-script-v1')
    && strings(result.sourceModes) && result.sourceModes.includes('commit') && result.sourceModes.includes('worktree')
    && result.cancellation === 'sigterm-process-group', 'Required capability missing', 'ENGINE_CAPABILITY_UNSUPPORTED');
  requireValue(result.nodeMajor === policy.engine.nodeMajor, 'Engine runtime mismatch', 'ENGINE_RUNTIME_UNSUPPORTED');
  requireValue(strings(result.platforms) && result.platforms.includes(process.platform), 'Engine platform unsupported', 'ENGINE_PLATFORM_UNSUPPORTED');
}

async function execute(options) {
  if (options.operation === 'report') return { value: readReport(options.manifest), exitCode: 0, recorded: true };
  const policyPath = realpathSync(resolve(options.policy));
  const { policy, policyDigest } = policyFor(policyPath);
  const root = policy.repositoryRoot;
  const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd(), encoding: 'utf8', timeout: 5000, maxBuffer: 262144 }).trim();
  requireValue(realpathSync(gitRoot) === root, 'Policy belongs to a different target repository');
  const configPath = realpathSync(resolve(options.config || join(root, '.lazy-verify.json')));
  const profile = configuration(root, configPath, policy);
  requireValue(!options.profile || options.profile === policy.profile, 'Selected profile is not approved', 'APPROVAL_MISMATCH');
  const prior = options.operation === 'replay' ? readReport(options.manifest) : null;
  if (prior) requireValue(prior.profile === policy.profile && prior.mode === profile.mode
    && prior.repositoryRoot === root && prior.digests.contract === policy.contractDigest
    && prior.digests.profile === policy.profileDigest, 'Replay contract/profile does not match current approval', 'APPROVAL_MISMATCH');
  const outputParent = policy.outputRoot || join(root, '.lazy-verify', 'runs');
  validateOutputParent(outputParent);
  if (options.operation === 'verify' && options.head !== 'worktree') {
    const gitOptions = { cwd: root, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 };
    const status = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=no'], gitOptions);
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], gitOptions);
    // Only UUID run directories are tool output; tracked changes and other
    // untracked files under a custom output parent still belong to the user.
    const userFiles = untracked.split('\0').filter(Boolean).filter(path => {
      const outputPath = relative(outputParent, join(root, path)).split(sep).join('/');
      return !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\//u.test(outputPath);
    });
    requireValue(status.length === 0 && userFiles.length === 0, 'Committed verification requires a clean checkout; select --head worktree for edits', 'DIRTY_TARGET');
  }
  requireValue(process.platform !== 'win32', 'Windows target execution is not qualified', 'ENGINE_PLATFORM_UNSUPPORTED');
  let entry;
  let node;
  try {
    entry = realpathSync(policy.engine.entry);
    node = realpathSync(policy.engine.node);
  } catch {
    fail('ENGINE_UNAVAILABLE', 'Approved engine or Node executable is absent');
  }
  requireValue(!inside(root, entry) && !inside(root, node), 'Install the reviewed controller and Node outside the target repository', 'ENGINE_LOCATION_UNSUPPORTED');
  requireValue(bundleDigest(dirname(entry)) === policy.engine.digest, 'Engine distribution changed', 'APPROVAL_MISMATCH');
  const scratch = mkdtempSync(join(tmpdir(), 'lazy-verify-'));
  let failure;
  try {
    const frozen = join(scratch, 'engine');
    cpSync(dirname(entry), frozen, { recursive: true, dereference: false });
    requireValue(bundleDigest(frozen) === policy.engine.digest, 'Engine changed during freeze', 'APPROVAL_MISMATCH');
    const home = join(scratch, 'home');
    mkdirSync(home, { mode: 0o700 });
    const engine = { ...policy.engine, node, entry: join(frozen, relative(dirname(entry), entry)) };
    const context = { cwd: scratch, home, timeout: policy.budgets.totalMs };
    const offered = await negotiate(engine, context);
    requireValue(offered.status === 0, 'Engine capability probe failed', 'ENGINE_CAPABILITY_UNSUPPORTED');
    capabilities(offered.bytes, policy);
    if (options.operation === 'doctor') return { value: { protocol: PROTOCOL, status: 'ready', execution: 'not_run', gate: 'not_evaluated', limitations: ['Experimental; real-engine qualification remains required'] }, exitCode: 0 };
    const requestId = randomUUID();
    createOutputParent(outputParent);
    const outputRoot = join(outputParent, requestId);
    mkdirSync(outputRoot, { mode: 0o700 });
    const request = {
      protocol: PROTOCOL, requestId, operation: options.operation, repositoryRoot: root,
      profile: policy.profile, mode: profile.mode, requiredChecks: profile.requiredChecks,
      sources: prior ? { base: prior.sources.base.selector, head: prior.sources.head.selector } : { base: options.base, head: options.head },
      includeUntracked: options.include, excludeUntracked: policy.excludeUntracked,
      digests: { config: policy.configDigest, profile: policy.profileDigest, contract: policy.contractDigest, policy: policyDigest },
      policyPath, configPath, outputRoot, trustCode: true, engine: { version: engine.version, digest: engine.digest },
    };
    requireValue(!request.includeUntracked.some((path) => request.excludeUntracked.includes(path)), 'Conflicting inclusion/exclusion');
    if (prior) request.replay = { manifest: realpathSync(resolve(options.manifest)), digest: digest(readBytes(options.manifest)), sources: prior.sources };
    const input = JSON.stringify(request);
    requireValue(Buffer.byteLength(input) <= 256 * 1024, 'Request exceeds byte limit');
    const response = await launch(engine.node, [engine.entry, 'integration', 'run', '--protocol', PROTOCOL], { ...context, input });
    let result;
    try {
      result = validateResult(parseJSON(response.bytes), request);
      requireValue(response.status === resultExit(result), 'Engine exit contradicts result');
      const manifestPath = join(outputRoot, 'manifest.json');
      requireValue(realpathSync(manifestPath) === manifestPath, 'Manifest must be owned by the run directory');
      const manifest = validateResult(parseJSON(readBytes(manifestPath)), request);
      requireValue(isDeepStrictEqual(manifest, result), 'Manifest differs from engine response');
      const evidence = realpathSync(join(outputRoot, result.evidence.path));
      requireValue(inside(outputRoot, evidence) && digest(readBytes(evidence)) === result.evidence.digest, 'Evidence attachment missing or changed');
    } catch (error) {
      fail('ENGINE_PROTOCOL_ERROR', error.message, 3);
    }
    // The engine rechecks source applicability; the bridge rechecks the approval
    // inputs that it owns before accepting the engine's recorded observation.
    try {
      requireValue(digest(readBytes(policyPath)) === policyDigest, 'Policy changed during run');
      configuration(root, configPath, policy);
    } catch (error) {
      fail('APPROVAL_CHANGED', error.message, 3);
    }
    return { value: result, exitCode: resultExit(result) };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch (error) {
      const message = `Could not remove scratch directory ${scratch}: ${error.message}`;
      throw Object.assign(new Error(failure ? `${failure.message}; ${message}` : message, { cause: failure || error }), {
        code: 'CLEANUP_FAILED', exitCode: failure?.exitCode === 130 ? 130 : 3,
        reasonCodes: [...new Set([...(failure ? [failure.code || 'INVALID_INPUT'] : []), 'CLEANUP_FAILED'])],
      });
    }
  }
}

async function main(argv) {
  const formatIndex = argv.indexOf('--format');
  let format = formatIndex !== -1 && argv[formatIndex + 1] === 'json' ? 'json' : 'markdown';
  try {
    const options = argumentsFor(argv);
    format = options.format;
    const result = await execute(options);
    console.log(render(result.value, format, result.recorded));
    process.exitCode = result.exitCode;
  } catch (error) {
    const exitCode = error.exitCode || 2;
    console.log(render({ protocol: PROTOCOL, execution: exitCode === 2 ? 'not_run' : 'incomplete', gate: 'not_evaluated',
      reasonCodes: error.reasonCodes || [error.code || 'INVALID_INPUT'], message: error.message }, format));
    process.exitCode = exitCode;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
