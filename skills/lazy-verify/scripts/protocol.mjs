import { createHash } from 'node:crypto';
import { constants, openSync, readSync, closeSync, fstatSync } from 'node:fs';

export const PROTOCOL = 'lazy-clean.verify/1';
export const LIMIT = 1024 * 1024;
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function fail(code, message, exitCode = 2) {
  throw Object.assign(new Error(message), { code, exitCode });
}

export function requireValue(condition, message, code = 'INVALID_INPUT', exitCode = 2) {
  if (!condition) fail(code, message, exitCode);
}

export function fields(value, keys, optional = []) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected an object');
  requireValue(Object.keys(value).every((key) => keys.includes(key) || optional.includes(key)), 'Unexpected field');
  requireValue(keys.every((key) => Object.hasOwn(value, key)), 'Missing field');
}

export function strings(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0)
    && new Set(value).size === value.length;
}

export function safePath(value) {
  return typeof value === 'string' && value.length > 0 && !/[\\:\x00-\x1f\x7f*?]/u.test(value)
    && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

export function hash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

export function readBytes(path, limit = LIMIT) {
  // Nonblocking open lets the regular-file check reject FIFOs without waiting
  // for a writer. Windows ignores unsupported POSIX open flags.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    requireValue(stat.isFile(), 'Expected a regular file');
    requireValue(stat.size <= limit, 'Input exceeds byte limit');
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    requireValue(length < buffer.length, 'Input grew while being read');
    return buffer.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}

export function parseJSON(bytes) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('INVALID_JSON', 'Expected one complete UTF-8 JSON value');
  }
}

const behaviors = {
  fix: ['fixed_observed', 'not_reproduced', 'still_failing', 'changed_failure', 'regression_observed', 'flaky', 'inconclusive'],
  preserve: ['preserved_observed', 'baseline_failing', 'regression_observed', 'flaky', 'inconclusive'],
};

export function validateResult(result, request) {
  fields(result, ['schemaVersion', 'protocol', 'requestId', 'engine', 'mode', 'profile', 'digests',
    'repositoryRoot', 'sources', 'execution', 'behavior', 'gate', 'applicability', 'reasonCodes',
    'evidence', 'limitations', 'requiredChecks', 'evidenceComplete', 'cleanup', 'observationAuthenticity']);
  requireValue(result.schemaVersion === 1 && result.protocol === PROTOCOL, 'Unsupported result protocol');
  requireValue(typeof result.requestId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(result.requestId), 'Invalid request identity');
  fields(result.engine, ['version', 'digest']);
  requireValue(typeof result.engine.version === 'string' && hash(result.engine.digest), 'Invalid engine identity');
  requireValue(Object.hasOwn(behaviors, result.mode) && behaviors[result.mode].includes(result.behavior), 'Invalid mode/behavior');
  requireValue(typeof result.profile === 'string' && result.profile.length > 0, 'Missing profile');
  fields(result.digests, ['config', 'profile', 'contract', 'policy']);
  requireValue(Object.values(result.digests).every(hash), 'Invalid approval digests');
  requireValue(typeof result.repositoryRoot === 'string' && result.repositoryRoot.length > 0, 'Missing repository root');
  fields(result.sources, ['base', 'head']);
  for (const [side, source] of Object.entries(result.sources)) {
    fields(source, ['selector', 'kind', 'identity']);
    requireValue(typeof source.selector === 'string' && source.selector.length > 0, 'Invalid selector');
    requireValue(source.kind === 'commit' || (side === 'head' && source.kind === 'worktree'), 'Invalid source kind');
    const unresolved = result.execution !== 'complete' && source.identity === null;
    requireValue(unresolved || (source.kind === 'commit' ? /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(source.identity) : hash(source.identity)), 'Invalid immutable identity');
    requireValue(side !== 'head' || (source.selector === 'worktree') === (source.kind === 'worktree'), 'Contradictory worktree selector');
  }
  requireValue(['complete', 'incomplete', 'cancelled', 'not_run'].includes(result.execution), 'Invalid execution');
  requireValue(['passed', 'blocked', 'not_evaluated'].includes(result.gate), 'Invalid gate');
  requireValue(['current', 'stale', 'unknown'].includes(result.applicability), 'Invalid applicability');
  requireValue(['complete', 'failed', 'unknown'].includes(result.cleanup), 'Invalid cleanup');
  requireValue(typeof result.evidenceComplete === 'boolean', 'Missing evidence completeness');
  requireValue(strings(result.reasonCodes) && strings(result.limitations), 'Invalid reasons/limitations');
  requireValue(result.observationAuthenticity === 'not-established', 'Unsupported authenticity claim');
  fields(result.evidence, ['path', 'digest']);
  requireValue(safePath(result.evidence.path) && hash(result.evidence.digest), 'Invalid evidence attachment');
  requireValue(Array.isArray(result.requiredChecks), 'Missing supporting results');
  const ids = [];
  for (const check of result.requiredChecks) {
    fields(check, ['id', 'status']);
    requireValue(typeof check.id === 'string' && check.id.length > 0 && ['passed', 'failed', 'incomplete'].includes(check.status), 'Invalid supporting check');
    ids.push(check.id);
  }
  requireValue(strings(ids), 'Duplicate checks');
  if (result.execution !== 'complete' || !result.evidenceComplete) {
    requireValue(result.behavior === 'inconclusive' && result.gate !== 'passed', 'Incomplete evidence cannot establish behavior');
  }
  if (result.execution !== 'complete') requireValue(!result.evidenceComplete, 'Non-complete execution cannot have complete evidence');
  if (result.gate === 'passed') {
    requireValue(result.behavior === (result.mode === 'fix' ? 'fixed_observed' : 'preserved_observed')
      && result.execution === 'complete' && result.evidenceComplete && result.applicability === 'current'
      && result.cleanup === 'complete' && result.requiredChecks.every((check) => check.status === 'passed'), 'Contradictory passing gate');
  } else {
    requireValue(result.reasonCodes.length > 0, 'Non-success needs a reason');
  }
  if (request) {
    requireValue(result.requestId === request.requestId && result.mode === request.mode && result.profile === request.profile
      && result.repositoryRoot === request.repositoryRoot, 'Response does not match request');
    for (const key of Object.keys(result.digests)) requireValue(result.digests[key] === request.digests[key], 'Approval digest mismatch');
    requireValue(result.engine.version === request.engine.version && result.engine.digest === request.engine.digest, 'Engine identity mismatch');
    requireValue(JSON.stringify([...ids].sort()) === JSON.stringify([...request.requiredChecks].sort()), 'Required checks changed');
    for (const side of ['base', 'head']) {
      requireValue(result.sources[side].selector === request.sources[side], 'Source selector mismatch');
      if (result.sources[side].identity !== null && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(request.sources[side])) {
        requireValue(result.sources[side].identity === request.sources[side], 'Exact commit identity mismatch');
      }
      if (request.replay && result.sources[side].identity !== null) requireValue(result.sources[side].identity === request.replay.sources[side].identity, 'Replay source identity mismatch');
    }
  }
  return result;
}

export function resultExit(result) {
  if (result.execution === 'not_run') return 2;
  if (result.execution === 'cancelled') return 130;
  if (result.execution !== 'complete' || !result.evidenceComplete || result.applicability !== 'current'
    || result.cleanup !== 'complete' || result.behavior === 'inconclusive' || result.gate === 'not_evaluated'
    || result.requiredChecks.some((check) => check.status === 'incomplete')) return 3;
  return result.gate === 'passed' ? 0 : 1;
}

export function render(value, format, recorded = false) {
  if (format === 'json') return JSON.stringify(recorded ? { provenance: 'previously-recorded; not authenticated or rerun', result: value } : value)
    .replace(/[\x7f-\x9f\u202a-\u202e\u2066-\u2069]/gu, (char) => `\\u${char.codePointAt(0).toString(16).padStart(4, '0')}`);
  const escape = (text) => String(text).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/[&<>"'`*_[\]\\#|]/gu, (char) => `&#${char.codePointAt(0)};`);
  return [recorded ? 'Previously recorded evidence; not authenticated or rerun.' : 'lazy-verify (experimental)',
    ...Object.entries(value).map(([key, item]) => `${escape(key)}: ${escape(typeof item === 'object' ? JSON.stringify(item) : item)}`)].join('\n');
}
