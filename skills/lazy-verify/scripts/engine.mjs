import { spawn } from 'node:child_process';
import { fail, LIMIT } from './protocol.mjs';

// The controller owns this process group. Target children and partial manifests
// remain the engine's responsibility; an engine that leaks children cannot pass.
export function launch(node, args, { cwd, home, timeout, input = '' }) {
  return new Promise((resolve, reject) => {
    const env = { HOME: home, USERPROFILE: home, TMPDIR: home, TMP: home, TEMP: home };
    for (const key of ['SystemRoot', 'WINDIR']) if (process.env[key]) env[key] = process.env[key];
    const grouped = process.platform !== 'win32';
    const child = spawn(node, args, { cwd, env, shell: false, detached: grouped, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [];
    let bytes = 0;
    let diagnostics = 0;
    let failure;
    let escalation;
    let deadline;
    let settled = false;
    const signal = (name) => {
      if (!child.pid) return;
      try {
        if (grouped) process.kill(-child.pid, name);
        else child.kill(name);
      } catch (error) {
        if (error.code !== 'ESRCH') failure ||= { code: 'CLEANUP_FAILED', message: error.message, exitCode: 3 };
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(escalation);
      clearTimeout(deadline);
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    };
    const finish = (status) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (failure) reject(Object.assign(new Error(failure.message), failure));
      else resolve({ bytes: Buffer.concat(output), status });
    };
    const stop = (code, message, exitCode = 3) => {
      if (failure) return;
      failure = { code, message, exitCode };
      signal('SIGTERM');
      escalation = setTimeout(() => signal('SIGKILL'), 250);
      deadline = setTimeout(() => {
        signal('SIGKILL');
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        failure.message += '; cleanup could not be confirmed';
        finish(null);
      }, 1000);
    };
    const interrupt = () => stop('INTERRUPTED', 'User interruption; partial evidence may exist', 130);
    const timer = setTimeout(() => stop('ENGINE_TIMEOUT', 'Engine exceeded approved time budget'), timeout);
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', interrupt);
    child.on('error', (error) => {
      stop(error.code === 'ENOENT' ? 'ENGINE_UNAVAILABLE' : 'ENGINE_LAUNCH_FAILED', error.message, 2);
    });
    child.stdin.on('error', () => stop('ENGINE_PROTOCOL_ERROR', 'Engine did not consume its request'));
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > LIMIT) stop('ENGINE_PROTOCOL_ERROR', 'Engine output exceeds byte limit');
      else output.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      diagnostics += chunk.length;
      // Diagnostics are untrusted terminal text and are not protocol evidence.
      if (diagnostics > LIMIT) stop('ENGINE_PROTOCOL_ERROR', 'Engine diagnostics exceed byte limit');
    });
    child.on('close', (status) => {
      if (grouped && child.pid) {
        try {
          process.kill(-child.pid, 0);
          if (!failure) failure = { code: 'CLEANUP_FAILED', message: 'Engine left a surviving process group', exitCode: 3 };
          signal('SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') failure ||= { code: 'CLEANUP_FAILED', message: error.message, exitCode: 3 };
        }
      }
      finish(status);
    });
    child.stdin.end(input);
  });
}

export async function negotiate(engine, options) {
  const runtime = await launch(engine.node, ['--version'], { ...options, timeout: 5000 });
  if (runtime.status !== 0 || !runtime.bytes.toString().startsWith(`v${engine.nodeMajor}.`)) {
    fail('ENGINE_RUNTIME_UNSUPPORTED', 'Approved Node major does not match runtime');
  }
  return launch(engine.node, [engine.entry, 'integration', 'capabilities', '--protocol', 'lazy-clean.verify/1'], { ...options, timeout: 5000 });
}
