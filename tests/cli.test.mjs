#!/usr/bin/env node
// End-to-end tests for the slop-check CLI: argument handling, exit codes, and
// the parts of file collection the rule-level tests in
// skills/slop-check/scripts/check.test.mjs never exercise.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

check("a file that stats but cannot be read is a failed scan, not a finding", () => {
  // EIO on the first read, and unlike a chmod it does not depend on the uid, so
  // this still covers the read guard in a root CI container.
  if (process.platform !== "linux") {
    console.log("skip unreadable file, EIO (linux-only fixture)");
    return;
  }
  const dir = join(root, "unreadable-eio");
  mkdirSync(dir, { recursive: true });
  try {
    symlinkSync("/proc/self/mem", join(dir, "eio.ts"), "file");
    const result = run([join(dir, "eio.ts"), "clean.ts"]);
    assert.equal(result.status, 2, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /cannot read/u);
    assert.doesNotMatch(result.stderr, /EIO/u, "the scan reports the path, it does not crash");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

check("a directory that cannot be listed is a failed scan, not a crash", () => {
  const dir = join(root, "unreadable-dir");
  const sub = join(dir, "sub");
  mkdirSync(sub, { recursive: true });
  try {
    writeFileSync(join(dir, "top.ts"), SLOP);
    writeFileSync(join(sub, "hidden.ts"), SLOP);
    chmodSync(sub, 0o000);
    try {
      readFileSync(join(sub, "hidden.ts"));
      console.log("skip unlistable directory (mode bits do not apply to this user)");
      return;
    } catch { /* denied, which is the case under test */ }
    const result = run([dir]);
    assert.equal(result.status, 2, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /cannot read/u);
    // The readable half of the tree is still reported, not thrown away.
    assert.match(result.stdout, /top\.ts:1:22 require-safety-comment/u);
  } finally {
    chmodSync(sub, 0o755);
    rmSync(dir, { recursive: true, force: true });
  }
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
  // Dropping `!!` in a condition is the whole fix and changes nothing else,
  // which is what the mechanical tier claims; the assertion below needs a human.
  write("mixed.ts", "if (!!ready) { go(); }\nconst copy = JSON.parse(JSON.stringify(state));\nconst user = payload as User;\n");
  const result = run(["mixed.ts"]);
  const fix = result.stdout.indexOf("Fix (mechanical");
  const review = result.stdout.indexOf("Review (heuristic");
  assert.ok(fix >= 0 && review > fix, result.stdout);
  assert.ok(result.stdout.indexOf("no-double-negation-condition") < review, "mechanical findings come first");
  assert.ok(result.stdout.indexOf("no-json-clone") > review, "a clone that is not equivalent is not mechanical");
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

check("an unknown option fails the scan rather than being ignored", () => {
  // Exit 2, not 1: warning and carrying on meant a run that skipped what it was
  // asked to look at could still report on everything else and exit 0.
  const result = run(["slop.ts", "-v"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown option -v/u);
  assert.doesNotMatch(result.stderr, /cannot read/u);
});

check("-- lets a dash-leading filename be scanned", () => {
  // Without an end-of-options marker this name was unreachable: it read as an
  // option, went unscanned, and the run exited 0 — clean for a file nobody read.
  write("-dash.ts", "const value: any = 1;\n");
  const result = run(["--", "-dash.ts"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /-dash\.ts:1:12 no-any/u);
  // That one file and no other: with `--` stripped as an option the target list
  // fell back to ".", which scanned the whole tree and found it by accident.
  assert.match(result.stdout, /1 finding in 1 file/u);
});

check("-- keeps options before it and paths after it apart", () => {
  const result = run(["--json", "--", "-dash.ts"]);
  const findings = JSON.parse(result.stdout);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "no-any");
});

check("a file outside cwd keeps its absolute path", () => {
  const result = run([join(root, "slop.ts")], "/");
  assert.match(result.stdout, new RegExp(`^\\s+${join(root, "slop.ts")}:1:22 `, "mu"));
});

check("--since keeps only findings on lines the diff added", () => {
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  // -c commit.gpgsign=false: a developer who signs every commit by default has
  // no key in this scratch repo, and the commit below would fail, not skip.
  const git = (...args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "app.ts"), "const first = payload as User;\n");
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since (git unavailable)");
    return;
  }

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

check("--since with no paths stays under the current directory", () => {
  // The changed-file map comes from the repository ROOT, so a run in packages/a
  // was handing back findings from a changed packages/b — work outside the
  // subtree the caller asked about.
  const repo = join(root, "subdir-repo");
  const git = (...args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  try {
    mkdirSync(join(repo, "packages", "a"), { recursive: true });
    mkdirSync(join(repo, "packages", "b"), { recursive: true });
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "packages", "a", "a.ts"), "export const x = 1;\n");
    writeFileSync(join(repo, "packages", "b", "b.ts"), "export const y = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "base");
    writeFileSync(join(repo, "packages", "a", "a.ts"), "export const x: any = 1;\n");
    writeFileSync(join(repo, "packages", "b", "b.ts"), "export const y: any = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "change");
  } catch {
    console.log("skip --since subdirectory scope (git unavailable)");
    return;
  }

  const fromSubdir = run(["--since=HEAD~1", "--json"], join(repo, "packages", "a"));
  const scoped = JSON.parse(fromSubdir.stdout);
  assert.equal(scoped.length, 1, fromSubdir.stdout);
  assert.match(scoped[0].path, /a\.ts$/u);

  // From the root it still sees both, so the filter scoped the scan rather than
  // narrowing what --since reports.
  const fromRoot = JSON.parse(run(["--since=HEAD~1", "--json"], repo).stdout);
  assert.equal(fromRoot.length, 2);
});

check("--since survives a filename git has to quote or pad", () => {
  const repo = join(root, "spaced");
  mkdirSync(repo, { recursive: true });
  const git = (...args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "seed.ts"), "const ok = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since quoting (git unavailable)");
    return;
  }
  // A space makes git append a TAB after the path in the `+++` header, and
  // mnemonicprefix renames the `b/` prefix the parser strips. Both used to drop
  // the file's findings and exit 2.
  writeFileSync(join(repo, "my file.ts"), "const user = payload as User;\n");
  git("add", "-A");
  git("config", "diff.mnemonicprefix", "true");
  const result = run(["--since=HEAD"], repo);
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /my file\.ts:1:22 require-safety-comment/u);
  assert.doesNotMatch(result.stderr, /cannot read/u);
});

check("--since sees a brand-new file git has never tracked", () => {
  const repo = join(root, "untracked-new");
  mkdirSync(repo, { recursive: true });
  const git = (...args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "seed.ts"), "const ok = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since untracked (git unavailable)");
    return;
  }
  // The documented pre-commit command is `--since=HEAD`, and a new file is the
  // likeliest place for fresh slop; git diff never mentions it.
  writeFileSync(join(repo, "brand-new.ts"), SLOP);
  const result = run(["--since=HEAD"], repo);
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /brand-new\.ts:1:22 require-safety-comment/u);
});

check("--since ignores untracked names it would never lint", () => {
  const repo = join(root, "untracked-noise");
  mkdirSync(repo, { recursive: true });
  const git = (...args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "seed.ts"), "const ok = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since untracked noise (git unavailable)");
    return;
  }
  // A symlink to an unbuilt asset is untracked but unlintable: stat()ing it
  // would report "cannot read" and fail the whole run with exit 2.
  symlinkSync(join(repo, "build", "logo.png"), join(repo, "logo.png"));
  // git reports an untracked nested repo as the bare directory "vendored/".
  mkdirSync(join(repo, "vendored"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: join(repo, "vendored") });
  writeFileSync(join(repo, "vendored", "lib.ts"), SLOP);
  // A repo that never ignored node_modules must not hand --since its vendor tree.
  mkdirSync(join(repo, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(repo, "node_modules", "pkg", "index.ts"), SLOP);
  const result = run(["--since=HEAD"], repo);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /clean \(0 files checked\)/u);
});

check("--since does not read added content as a diff header", () => {
  const repo = join(root, "plus-content");
  mkdirSync(repo, { recursive: true });
  const git = (...args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "a.ts"), "let x = 0;\n");
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since content header (git unavailable)");
    return;
  }
  // An added line reading `++ x;` arrives from git as `+++ x;`, which used to
  // parse as a destination header and fail the whole scan with exit 2.
  writeFileSync(join(repo, "a.ts"), `let x = 0;\n++ x;\n${SLOP}`);
  git("add", "-A");
  const result = run(["--since=HEAD"], repo);
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.doesNotMatch(result.stderr, /cannot read/u);
  assert.match(result.stdout, /a\.ts:3:22 require-safety-comment/u);
});

check("one file reached by two paths is linted once", () => {
  // Deduplication keys on filesystem identity, not on a case-folded path: two
  // distinct files on a case-sensitive volume must both be scanned, and two
  // names for one file must not be.
  const dir = join(root, "identity");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "real.ts"), SLOP);
  try {
    symlinkSync(join(dir, "real.ts"), join(dir, "alias.ts"), "file");
  } catch {
    console.log("skip identity dedupe (symlinks unavailable)");
    return;
  }
  const result = run([join(dir, "real.ts"), join(dir, "alias.ts")]);
  assert.match(result.stdout, /1 finding in 1 file/u, result.stdout);
});

check("--since treats a dash-leading ref as a ref, not an option", () => {
  // `--since=--no-patch` was handed to git ahead of the `--` separator, so git
  // read it as another diff option and the scan reported clean with exit 0.
  const result = run(["--since=--no-patch"], join(root, "repo"));
  assert.equal(result.status, 2, `${result.stdout}${result.stderr}`);
  assert.match(result.stderr, /cannot diff against --no-patch/u);
});

check("--since reports a bad ref instead of passing silently", () => {
  const result = run(["--since=no-such-ref"], join(root, "repo"));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot diff against no-such-ref/u);
});

check("runs when invoked through a symlinked path", () => {
  const link = join(root, "checker-link.mjs");
  try {
    symlinkSync(CHECKER, link, "file");
  } catch {
    console.log("skip symlink invocation (symlinks unavailable)");
    return;
  }
  const result = spawnSync(process.execPath, [link, "slop.ts"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1, `silent no-op through a symlink: ${JSON.stringify(result.stdout)}`);
  assert.match(result.stdout, /require-safety-comment-for-type-assertion/u);
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
  // 1, not 2: the tree is readable, so the loop must not be reported as a
  // failed scan, and the one file in it must be counted once.
  assert.equal(result.status, 1, `${result.stdout}${result.stderr}`);
  assert.doesNotMatch(result.stderr, /cannot read/u);
  assert.match(result.stdout, /1 file checked|1 finding in 1 file/u);
});

rmSync(root, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
// `--since` skips most of what it collects, so the summary has to count the
// files that actually reached the linter. One changed file beside one unchanged
// one reported "clean (2 files checked)" -- overstating coverage is the same
// class of lie as reporting a failed scan as clean.
check("--since counts only the files it linted, not the files it collected", () => {
  const repo = mkdtempSync(join(tmpdir(), "slop-since-count-"));
  const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  mkdirSync(join(repo, "src"), { recursive: true });
  git("init", "-q", ".");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  writeFileSync(join(repo, "src", "changed.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, "src", "unchanged.ts"), "export const b = 2;\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  writeFileSync(join(repo, "src", "changed.ts"), "export const a = 1;\nexport const c = 3;\n");

  assert.match(run(["--since=HEAD", "src"], repo).stdout, /clean \(1 file checked\)/u);
  // A plain scan still counts every file, so this is not "always report 1".
  assert.match(run(["src"], repo).stdout, /clean \(2 files checked\)/u);

  git("add", "-A");
  git("commit", "-qm", "settle");
  const none = run(["--since=HEAD", "src"], repo);
  assert.match(none.stdout, /clean \(0 files checked\)/u);
  assert.equal(none.status, 0);
  rmSync(repo, { recursive: true, force: true });
});

console.log("\nall slop-check CLI tests passed");
