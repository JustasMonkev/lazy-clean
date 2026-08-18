#!/usr/bin/env node
// End-to-end tests for the slop-check CLI: argument handling, exit codes, and
// the parts of file collection the rule-level tests in
// skills/slop-check/scripts/check.test.mjs never exercise.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), "..", "skills", "slop-check", "scripts", "check.mjs");
const root = mkdtempSync(join(tmpdir(), "slop-cli-"));
const SLOP = "const user = payload as User;\n";

let failures = 0;

function run(args, cwd = root) {
  return spawnSync(process.execPath, [CHECKER, ...args], { cwd, encoding: "utf8" });
}

function check(description, fn) {
  try {
    fn();
    console.log(`ok   ${description}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${description}: ${error.message}`);
  }
}

function write(name, contents) {
  const target = join(root, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
  return target;
}

write("slop.ts", SLOP);
write("clean.ts", "export const answer = 42;\n");
write("notes.md", SLOP);
write("types.d.ts", SLOP);
write("node_modules/pkg/index.ts", SLOP);
write("nested/deep/slop.ts", SLOP);
write("big.ts", `${SLOP}${"// filler\n".repeat(120_000)}`);

check("exit 1 and one finding for a sloppy file", () => {
  const result = run(["slop.ts"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /slop\.ts:1:22 require-safety-comment-for-type-assertion/u);
  assert.match(result.stdout, /1 finding in 1 file/u);
});

check("exit 0 for a clean file", () => {
  const result = run(["clean.ts"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /clean \(1 file checked\)/u);
});

check("exit 2 when a path cannot be read", () => {
  const result = run([join(root, "does-not-exist.ts")]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot read/u);
});

check("a failed path outranks a clean scan", () => {
  const result = run(["clean.ts", join(root, "does-not-exist.ts")]);
  assert.equal(result.status, 2);
});

check("the same file listed twice is linted once", () => {
  const result = run(["slop.ts", "./slop.ts", join(root, "slop.ts")]);
  assert.match(result.stdout, /1 finding in 1 file/u);
});

check("a directory scan skips node_modules, .d.ts, and non-source files", () => {
  const result = run(["."]);
  const paths = [...result.stdout.matchAll(/^\s+(\S+?):\d+:\d+ /gmu)].map((match) => match[1]);
  assert.deepEqual([...new Set(paths)].sort(), ["nested/deep/slop.ts", "slop.ts"]);
});

check("files over the size cap are skipped", () => {
  const result = run(["big.ts"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /clean \(0 files checked\)/u);
});

check("--json emits parseable findings and stays quiet otherwise", () => {
  const result = run(["slop.ts", "--json"]);
  const findings = JSON.parse(result.stdout);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "require-safety-comment-for-type-assertion");
  assert.equal(findings[0].line, 1);
  assert.equal(findings[0].severity, "review");
  assert.doesNotMatch(result.stdout, /slop-check:/u);
});

check("findings are grouped by whether the fix needs judgment", () => {
  write("mixed.ts", "const copy = JSON.parse(JSON.stringify(state));\nconst user = payload as User;\n");
  const result = run(["mixed.ts"]);
  const fix = result.stdout.indexOf("Fix (mechanical");
  const review = result.stdout.indexOf("Review (heuristic");
  assert.ok(fix >= 0 && review > fix, result.stdout);
  assert.ok(result.stdout.indexOf("no-json-clone") < review, "mechanical findings come first");
});

check("--summary prints only the per-rule tally", () => {
  const result = run(["mixed.ts", "--summary"]);
  assert.match(result.stdout, /1 no-json-clone/u);
  assert.doesNotMatch(result.stdout, /disables the type system|lossy, slow clone/u);
  assert.equal(result.status, 1);
});

check("--json on a clean file is an empty array", () => {
  const result = run(["clean.ts", "--json"]);
  assert.deepEqual(JSON.parse(result.stdout), []);
  assert.equal(result.status, 0);
});

check("an unknown option is reported, not treated as a path", () => {
  const result = run(["slop.ts", "-v"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ignoring unknown option -v/u);
  assert.doesNotMatch(result.stderr, /cannot read/u);
});

check("a file outside cwd keeps its absolute path", () => {
  const result = run([join(root, "slop.ts")], "/");
  assert.match(result.stdout, new RegExp(`^\\s+${join(root, "slop.ts")}:1:22 `, "mu"));
});

check("--since keeps only findings on lines the diff added", () => {
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
  } catch {
    console.log("skip --since (git unavailable)");
    return;
  }
  writeFileSync(join(repo, "app.ts"), "const first = payload as User;\n");
  git("add", "-A");
  git("commit", "-qm", "base");

  const full = run(["app.ts"], repo);
  assert.equal(full.status, 1, "the committed assertion is still a finding on a full scan");

  const unchanged = run(["--since=HEAD"], repo);
  assert.equal(unchanged.status, 0, unchanged.stdout);

  writeFileSync(join(repo, "app.ts"), "const first = payload as User;\nconst copy = JSON.parse(JSON.stringify(first));\n");
  const since = run(["--since=HEAD"], repo);
  assert.equal(since.status, 1);
  assert.match(since.stdout, /no-json-clone/u);
  assert.doesNotMatch(since.stdout, /require-safety-comment/u, "pre-existing findings stay out of scope");
});

check("--since reports a bad ref instead of passing silently", () => {
  const result = run(["--since=no-such-ref"], join(root, "repo"));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot diff against no-such-ref/u);
});

check("a symlink loop terminates instead of hanging", () => {
  const loop = join(root, "loop");
  mkdirSync(loop, { recursive: true });
  writeFileSync(join(loop, "slop.ts"), SLOP);
  try {
    symlinkSync(loop, join(loop, "self"), "dir");
  } catch {
    console.log("skip symlink loop (symlinks unavailable)");
    return;
  }
  const result = spawnSync(process.execPath, [CHECKER, loop], { cwd: root, encoding: "utf8", timeout: 20_000 });
  assert.notEqual(result.signal, "SIGTERM");
  assert.ok(result.status === 1 || result.status === 2, `unexpected status ${result.status}`);
});

rmSync(root, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nall slop-check CLI tests passed");
