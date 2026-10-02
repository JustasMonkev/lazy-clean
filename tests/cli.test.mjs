#!/usr/bin/env node
// End-to-end tests for the slop-check CLI: argument handling, exit codes, and
// the parts of file collection the rule-level tests in
// skills/slop-check/scripts/check.test.mjs never exercise.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
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

// The checker is a text scanner, not the compiler, so it is independent of the
// installed TypeScript version, including the native TypeScript 7 `tsc`. Syntax
// that current compilers accept must scan cleanly and must not hide slop after it.
const MODERN_TS = `import config from './config.json' with { type: 'json' };
import type { User } from './user.ts';

export namespace Limits {
  export const max = 10;
}

const routes = {
  home: '/',
  user: '/users/:id',
} as const satisfies Record<string, string>;

export class Session {
  accessor user: User | undefined;
  #token: string;
  constructor(token: string) { this.#token = token; }
  [Symbol.dispose]() { this.#token = ''; }
}

export function open(token: string) {
  using session = new Session(token);
  return config.page === 'home' ? routes.home : session.user?.name;
}

export const first = <const T extends readonly unknown[]>(items: T) => items[0];
`;
// A separate directory keeps these files out of the directory-scan expectations.
const modernRoot = mkdtempSync(join(tmpdir(), "slop-modern-"));
writeFileSync(join(modernRoot, "modern.mts"), MODERN_TS);
writeFileSync(join(modernRoot, "modern-slop.mts"), `${MODERN_TS}${SLOP}`);

check("current TypeScript syntax scans clean", () => {
  const result = run(["modern.mts"], modernRoot);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /clean \(1 file checked\)/u);
});

check("slop after current TypeScript syntax is still found", () => {
  const result = run(["modern-slop.mts"], modernRoot);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /modern-slop\.mts:26:22 require-safety-comment-for-type-assertion/u);
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
  const paths = [...result.stdout.matchAll(/^\s+(\S+?):\d+:\d+ /gmu)]
    .map((match) => match[1].replaceAll("\\", "/"));
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

check("a repeated message is stated once, on its first finding", () => {
  write("repeated.ts", "const a: any = 1;\nconst b: any = 2;\nconst enhancedFetch = wrap(fetch);\nconst enhancedLoad = wrap(load);\n");
  const result = run(["repeated.ts"]);
  assert.equal(result.stdout.split("`any` disables the type system").length - 1, 1, result.stdout);
  assert.match(result.stdout, /repeated\.ts:2:10 no-any\n/u);
  assert.match(result.stdout, /"enhancedFetch" is named/u);
  assert.match(result.stdout, /"enhancedLoad" is named/u);
});

check("--summary replaces findings with the per-rule tally", () => {
  const result = run(["mixed.ts", "--summary"]);
  assert.match(result.stdout, /1 no-json-clone/u);
  assert.doesNotMatch(result.stdout, /disables the type system|lossy, slow clone/u);
  assert.equal(result.status, 1);
});

check("assertion tallies use a neutral display name while retaining the legacy ID", () => {
  const summary = run(["slop.ts", "--summary"]);
  assert.equal(summary.status, 1);
  assert.match(summary.stdout, /1 type assertion review/u);
  assert.doesNotMatch(summary.stdout, /safety-comment/u);
  const json = run(["slop.ts", "--summary", "--json"]);
  assert.equal(JSON.parse(json.stdout)[0].rule, "require-safety-comment-for-type-assertion");
  const disabled = run(["slop.ts", "--summary", "--disable=require-safety-comment-for-type-assertion"]);
  assert.equal(disabled.status, 0);
  assert.match(disabled.stdout, /1 suppressed/u);
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

check("--help prints usage", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: node <skill-directory>\/scripts\/check\.mjs \[options\] \[paths\.\.\.\]/u);
  assert.match(result.stdout, /-h, --help/u);
  assert.match(result.stdout, /Replace findings with a rule tally; keep the run summary/u);
  assert.doesNotMatch(result.stdout, /unknown option/u);
});

check("-h prints usage", () => {
  const result = run(["-h"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Scan only lines added since/u);
});

check("--help can be requested with a target and still prints usage", () => {
  const result = run(["--help", "slop.ts"]);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stderr, /unknown option/u);
  assert.match(result.stdout, /Usage: node/u);
  assert.doesNotMatch(result.stdout, /slop\.ts/u);
});

check("--help does not hide an unknown option", () => {
  const result = run(["--jsoon", "--help"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown option --jsoon/u);
  assert.doesNotMatch(result.stdout, /Usage:/u);
});

check("-- keeps --help as a literal path", () => {
  const result = run(["--", "--help"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot read --help/u);
  assert.doesNotMatch(result.stdout, /Usage:/u);
});

check("-- lets a dash-leading filename be scanned", () => {
  // Without an end-of-options marker this name was unreachable: it read as an
  // option, went unscanned, and the run exited 0 — clean for a file nobody read.
  write("-dash.ts", "const value: any = 1;\n");
  const result = run(["--", "-dash.ts"]);
  assert.equal(result.status, 1);
  // Column 14 is the `any` itself. The rule used to report at the delimiter
  // in front of it, which is where the position list was matching.
  assert.match(result.stdout, /-dash\.ts:1:14 no-any/u);
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
  // Compared, not matched: a Windows path interpolated into a `u`-flagged
  // pattern is a SyntaxError (`\U` is not an escape), so the regex spelling
  // failed before it could assert anything.
  const reported = `${join(root, "slop.ts")}:1:22 `;
  assert.ok(
    result.stdout.split("\n").some((line) => line.trimStart().startsWith(reported)),
    result.stdout,
  );
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

check("--since rejects new justification markers and preserves legacy evidence", () => {
  const repo = join(root, "new-justifications");
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  const legacy = "// SAFETY: parsed by the schema above\nconst user = payload as User;\n";
  const block = "/* SAFETY:\n * parsed by the schema above\n */\nconst user = payload as User;\n";
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "legacy.ts"), legacy);
    writeFileSync(join(repo, "existing-assertion.ts"), SLOP);
    writeFileSync(join(repo, "block.ts"), block);
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since justification provenance (git unavailable)");
    return;
  }
  writeFileSync(join(repo, "legacy.ts"), `${legacy}export const added = 1;\n`);
  assert.equal(run(["--since=HEAD", "legacy.ts"], repo).status, 0);
  assert.equal(run(["--json", "legacy.ts"], repo).status, 0);
  const cases = [
    ["new.ts", legacy, "require-safety-comment-for-type-assertion"],
    ["inline.ts", "const user = payload as User; // SAFETY: parsed by the schema above\n", "require-safety-comment-for-type-assertion"],
    ["angle.ts", "// SAFETY: parsed by the schema above\nconst user = <User>payload;\n", "require-safety-comment-for-type-assertion"],
    ["multiline.ts", "/* SAFETY:\n * parsed by the schema above\n */\nconst user = payload as {\n  id: string;\n};\n", "require-safety-comment-for-type-assertion"],
    ["ignored.ts", "// slop-check-ignore require-safety-comment-for-type-assertion -- parsed at the boundary\nconst user = payload as User;\n", "require-safety-comment-for-type-assertion"],
    ["file-ignored.ts", "// slop-check-ignore-file require-safety-comment-for-type-assertion -- parsed at the boundary\nconst user = payload as User;\n", "require-safety-comment-for-type-assertion"],
    ["catch.ts", "try { save(); } catch {\n  // SAFETY: the resource is already gone\n}\n", "no-empty-catch"],
    ["sleep.ts", "// lazy: deliberate timing policy\nawait new Promise(resolve => setTimeout(resolve, 1000));\n", "no-arbitrary-sleep"],
  ];
  for (const [file, source, rule] of cases) {
    writeFileSync(join(repo, file), source);
    const result = run(["--since=HEAD", "--json", file], repo);
    assert.equal(result.status, 1, file);
    const findings = JSON.parse(result.stdout);
    assert.ok(findings.some(f => f.rule === "no-new-justification-comments"), file);
    assert.equal(findings.find(f => f.rule === "no-new-justification-comments").severity, "fix", file);
    assert.ok(findings.some(f => f.rule === rule), file);
    assert.match(findings.find(f => f.rule === "no-new-justification-comments").message, /final response/u);
  }
  writeFileSync(join(repo, "existing-assertion.ts"), `// SAFETY: parsed by the schema above\n${SLOP}`);
  const addedOnly = run(["--since=HEAD", "--json", "existing-assertion.ts"], repo);
  assert.equal(addedOnly.status, 1);
  assert.deepEqual(JSON.parse(addedOnly.stdout).map(f => f.rule), ["no-new-justification-comments"]);
  writeFileSync(join(repo, "block.ts"), block.replace("schema above", "schema at the boundary"));
  const editedBlock = run(["--since=HEAD", "--json", "block.ts"], repo);
  assert.equal(editedBlock.status, 1);
  const marker = JSON.parse(editedBlock.stdout).find(f => f.rule === "no-new-justification-comments");
  assert.equal(marker.line, 1);
  assert.equal(marker.endLine, 3);
  writeFileSync(join(repo, "metadata.ts"), "// SPDX-License-Identifier: MIT\n// @ts-check\nconnect(options);\nconst text = '// SAFETY: only string data';\n");
  assert.equal(run(["--since=HEAD", "metadata.ts"], repo).status, 0);
  for (const [file, source] of [
    ["safety-prose.js", "// The serializer rejects SAFETY: prefixes in user data.\nconnect(options);\n"],
    ["lazy-prose.js", "/* The serializer rejects lazy: prefixes in user data. */\nconnect(options);\n"],
    ["marker-jsdoc.js", "/** @param options Serialized data must not contain SAFETY: or lazy: prefixes. */\nfunction connect(options) { return options; }\n"],
  ]) {
    writeFileSync(join(repo, file), source);
    const result = run(["--since=HEAD", "--json", file], repo);
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  }
});

check("--since reviews new compiler suppressions and new explanations for old directives", () => {
  const repo = join(root, "compiler-suppressions");
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  const bare = "// @ts-ignore\nlegacyCall();\n";
  const justified = "// @ts-expect-error vendor stub is missing the strict option\nconnect(options);\n";
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "bare.ts"), bare);
    writeFileSync(join(repo, "preceding.ts"), bare);
    writeFileSync(join(repo, "preceding-block.ts"), bare);
    writeFileSync(join(repo, "preceding-multiline.ts"), bare);
    writeFileSync(join(repo, "legacy.ts"), justified);
    writeFileSync(join(repo, "legacy-eslint.js"), "/* eslint no-console: off */\nconsole.log(value);\n");
    writeFileSync(join(repo, "edited-eslint.js"), "/* eslint no-console: error */\nconsole.log(value);\n");
    writeFileSync(join(repo, "biome-range.js"), "// biome-ignore-start lint: generated payload\nconnect(options);\n");
    for (const tool of ["c8", "v8"]) writeFileSync(join(repo, `${tool}-range.js`), `/* ${tool} ignore start */\nconnect(options);\n`);
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since compiler suppression provenance (git unavailable)");
    return;
  }
  writeFileSync(join(repo, "biome-range.js"), "// biome-ignore-start lint: generated payload\nconnect(options);\n// biome-ignore-end lint: generated payload\n");
  assert.equal(run(["--since=HEAD", "--json", "biome-range.js"], repo).status, 0);
  assert.equal(run(["--json", "biome-range.js"], repo).status, 0);
  for (const tool of ["c8", "v8"]) {
    const file = `${tool}-range.js`;
    writeFileSync(join(repo, file), `/* ${tool} ignore start */\nconnect(options);\n/* ${tool} ignore stop */\n`);
    assert.equal(run(["--since=HEAD", "--json", file], repo).status, 0, file);
  }
  writeFileSync(join(repo, "legacy.ts"), `${justified}export const added = 1;\n`);
  assert.equal(run(["--since=HEAD", "legacy.ts"], repo).status, 0);
  writeFileSync(join(repo, "legacy-eslint.js"), "/* eslint no-console: off */\nconsole.log(value);\nexport const added = 1;\n");
  assert.equal(run(["--since=HEAD", "legacy-eslint.js"], repo).status, 0);
  const cases = [
    ["new.ts", justified],
    ["mock.test.ts", "// @ts-expect-error mock vendor stub is missing the strict option\nconnect(options);\n"],
    ["ignore.ts", "// @ts-ignore -- vendor declaration has an incorrect parameter\nconnect(options);\n"],
    ["nocheck.ts", "// @ts-nocheck -- vendor declarations are incorrect for this module\nconnect(options);\n"],
    ["biome.js", "// biome-ignore lint/suspicious/noExplicitAny -- vendor declaration has an incorrect parameter\nconnect(options);\n"],
    ["biome-all.js", "// biome-ignore-all lint: generated payload\nconnect(options);\n"],
    ["biome-start.js", "// biome-ignore-start lint: generated payload\nconnect(options);\n"],
    ["eslint.js", "// eslint-disable-next-line no-console -- required diagnostic output\nconsole.log(value);\n"],
    ["eslint-config.js", "/* eslint no-console: off */\nconsole.log(value);\n"],
    ["eslint-zero.js", "/* eslint no-console: 0 */\nconsole.log(value);\n"],
    ["eslint-commaless.js", "/* eslint no-alert: 2 no-console: 0 */\nconsole.log(value);\n"],
    ["eslint-commaless-array.js", '/* eslint no-alert: [2, { mode: "off" }] no-console: ["off"] */\nconsole.log(value);\n'],
    ["eslint-array.js", '/* eslint curly: 2, "no-console": ["off", { allow: ["warn"] }] */\nconsole.log(value);\n'],
    ["eslint-zero-array.js", "/* eslint no-console: [0, { allow: ['warn'] }] */\nconsole.log(value);\n"],
    ["eslint-reason.js", "/* eslint no-console: off -- required diagnostic output (vendor {\n */\nconsole.log(value);\n"],
    ["edited-eslint.js", "/* eslint\n no-console: off\n*/\nconsole.log(value);\n"],
    ["format.js", "// prettier-ignore\nconst values = [1, 2];\n"],
    ["coverage.js", "// c8 ignore next\nconnect(options);\n"],
    ["node-coverage.js", "/* node:coverage ignore next */\nconnect(options);\n"],
    ["node-coverage-lines.js", "/* node:coverage ignore next 3 */\nconnect(options);\n"],
    ["node-coverage-block.js", "/* node:coverage disable */\nconnect(options);\n/* node:coverage enable */\n"],
    ["deno-lint.ts", "// deno-lint-ignore no-console\nconsole.log(value);\n"],
    ["deno-lint-file.ts", "// deno-lint-ignore-file no-console\nconsole.log(value);\n"],
    ["deno-format.ts", "// deno-fmt-ignore\nconst values = [1, 2];\n"],
    ["deno-format-file.ts", "// deno-fmt-ignore-file\nconst values = [1, 2];\n"],
    ["oxlint.js", "// oxlint-disable-next-line no-console\nconsole.log(value);\n"],
    ["oxlint-line.js", "console.log(value); // oxlint-disable-line no-console\n"],
    ["oxlint-block.js", "/* oxlint-disable no-console */\nconsole.log(value);\n/* oxlint-enable no-console */\n"],
    ["bare.ts", bare.replace("@ts-ignore", "@ts-ignore -- vendor declaration has an incorrect parameter")],
    ["preceding.ts", `// The vendor declaration has an incorrect parameter\n${bare}`, 0, 2],
    ["preceding-block.ts", `/* The vendor declaration has an incorrect parameter */\n${bare}`, 1, 2],
    ["preceding-multiline.ts", `/*\n * The vendor declaration has an incorrect parameter\n */\n${bare}`, 1, 4],
  ];
  for (const [file, source, fullStatus = 0, directiveLine] of cases) {
    writeFileSync(join(repo, file), source);
    const result = run(["--since=HEAD", "--json", file], repo);
    assert.equal(result.status, 1, file);
    const finding = JSON.parse(result.stdout).find(f => f.rule === "no-unjustified-suppression");
    assert.ok(finding, file);
    assert.equal(finding.severity, "review");
    assert.match(finding.message, /required.*final response/u);
    assert.equal(run(["--json", file], repo).status, fullStatus, "unscoped legacy handling stays compatible");
    if (directiveLine !== undefined) {
      assert.equal(finding.startLine, 1);
      assert.equal(finding.line, directiveLine);
    }
  }
  for (const [file, source] of [
    ["eslint-enabled.js", '/* eslint no-console: ["error", { level: "off", limit: 0 }] */\nconsole.log(value);\n'],
    ["eslint-enabled-reason.js", "/* eslint no-console: error -- reason mentioning no-alert: off */\nconsole.log(value);\n"],
    ["eslint-string.js", 'const value = "/* eslint no-console: off */";\n'],
    ["eslint-prose.js", "// The serialized output must not contain eslint-disable because downstream rejects it.\nconnect(options);\n"],
    ["jsdoc-prose.ts", "/** @param options Serialized output must not contain prettier-ignore or biome-ignore. */\nfunction connect(options: string) { return options; }\n"],
    ["coverage-prose.js", "// The serialized output must not contain node:coverage ignore next because downstream rejects it.\nconnect(options);\n"],
  ]) {
    writeFileSync(join(repo, file), source);
    assert.equal(run(["--since=HEAD", "--json", file], repo).status, 0, file);
  }
});

check("--since preserves unchanged comments beside code edits and rejects copied or edited markers", () => {
  const repo = join(root, "comment-spans");
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  const leading = '/* eslint no-console: off */ console.log("old");\nexport const metadata = "stable unchanged content keeps Git rename detection above its threshold";\n';
  const trailing = "const value = oldPayload as User; // SAFETY: parsed by the schema above\n";
  const split = "/* eslint no-console: off */ if (isDiffSuppression(previous.text)\n        && !isCommentMetadata(previous) && isJustification(previous)) run();\n";
  const joined = "/* eslint no-console: off */ if (isDiffSuppression(previous.text) || isCommentMetadata(previous) || IGNORE_DIRECTIVE.test(previous.text)) run();\n";
  const cases = [
    ["joined-lines.js", split, joined],
    ["split-lines.js", joined, split],
    ["leading.js", leading, leading.replace('"old"', '"new"')],
    ["trailing.ts", trailing, trailing.replace("oldPayload", "nextPayload")],
    ["block.js", '/* eslint\n no-console: off\n*/ console.log("old");\n', '/* eslint\n no-console: off\n*/ console.log("new");\n'],
    ["prefix.js", `doWork(); ${leading}`, leading],
    ["suffix.js", leading, "/* eslint no-console: off */\n"],
    ["shifted.js", `const first = 1;\n\n${leading}`, `const first = 1;\n\n\n${leading.replace('"old"', '"new"')}`],
    ["crlf.js", leading.replaceAll("\n", "\r\n"), leading.replace('"old"', '"new"').replaceAll("\n", "\r\n")],
    ["lone-cr.js", leading.replaceAll("\n", "\r"), leading.replace('"old"', '"new"').replaceAll("\n", "\r")],
    ["bom.ts", `\ufeff${trailing}`, `\ufeff${trailing.replace("oldPayload", "nextPayload")}`],
    ["unicode.ts", trailing.replace("above", "above ✓"), trailing.replace("oldPayload", "nextPayload").replace("above", "above ✓")],
    ["no-eof-newline.js", leading.trimEnd(), leading.replace('"old"', '"new"').trimEnd()],
  ];
  const lineEndings = ["\n", "\r\n", "\r"];
  if (process.platform !== "win32") {
    cases.push([":colon.ts", leading, leading.replace('"old"', '"new"')]);
    cases.push([":(exclude)special.ts", leading, leading.replace('"old"', '"new"')]);
  }
  const multiline = '/* eslint\n no-console: off\n*/ console.log("old");\n';
  const plain = "const first = 1;\nconst last = 2;\n";
  const insertions = [
    ["start", `const inserted = 3;\n${plain}`],
    ["middle", "const first = 1;\nconst inserted = 3;\nconst last = 2;\n"],
    ["end", `${plain}const inserted = 3;\n`],
    ["blank", "const first = 1;\n\nconst last = 2;\n"],
  ];
  for (const [oldIndex, oldEnding] of lineEndings.entries())
    for (const [newIndex, newEnding] of lineEndings.entries()) {
      cases.push([`format-${oldIndex}-${newIndex}.js`, leading.replaceAll("\n", oldEnding), leading.replace('"old"', '"new"').replaceAll("\n", newEnding)]);
      cases.push([`style-${oldIndex}-${newIndex}.js`, leading.replaceAll("\n", oldEnding), leading.replaceAll("\n", newEnding)]);
      cases.push([`multiline-${oldIndex}-${newIndex}.js`, multiline.replaceAll("\n", oldEnding), multiline.replace('"old"', '"new"').replaceAll("\n", newEnding), (oldEnding === "\r") !== (newEnding === "\r") ? 1 : 0]);
      for (const [name, inserted] of insertions)
        for (const prefix of ["", "/* eslint no-console: off */ "])
          cases.push([`insert-${oldIndex}-${newIndex}-${name}-${prefix ? "comment" : "plain"}.js`, `${prefix}${plain}`.replaceAll("\n", oldEnding), `${prefix}${inserted}`.replaceAll("\n", newEnding)]);
    }
  const marker = "// SAFETY: parsed by the schema above\n";
  const copies = `${marker}const first = payload as User;\nconst second = payload as User;\n`;
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    for (const [file, original] of cases) writeFileSync(join(repo, file), original);
    writeFileSync(join(repo, "copies.ts"), copies);
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since comment spans (git unavailable)");
    return;
  }
  for (const [file, , source, expected = 0] of cases) {
    writeFileSync(join(repo, file), source);
    const result = run(["--since=HEAD", "--json", file], repo);
    assert.equal(result.status, expected, `${file}: ${result.stderr || result.stdout}`);
    if (expected === 1) assert.ok(JSON.parse(result.stdout).some(f => f.rule === "no-unjustified-suppression"), file);
  }
  git("mv", "leading.js", "renamed.js");
  const renamed = run(["--since=HEAD", "--json", "renamed.js"], repo);
  assert.equal(renamed.status, 0, `rename: ${renamed.stderr || renamed.stdout}`);
  writeFileSync(join(repo, "trailing.ts"), trailing.replace("the schema", "schema"));
  const edited = run(["--since=HEAD", "--json", "trailing.ts"], repo);
  assert.equal(edited.status, 1, `edited: ${edited.stderr || edited.stdout}`);
  assert.ok(JSON.parse(edited.stdout).some(f => f.rule === "no-new-justification-comments"));
  writeFileSync(join(repo, "copies.ts"), copies.replace("const second", `${marker}const second`));
  const copied = run(["--since=HEAD", "--json", "copies.ts"], repo);
  assert.equal(copied.status, 1, `copied: ${copied.stderr || copied.stdout}`);
  assert.equal(JSON.parse(copied.stdout).filter(f => f.rule === "no-new-justification-comments").length, 1);
});

check("--since cleans comparison snapshots after success and Git failure", () => {
  if (process.platform === "win32") {
    console.log("skip comparison cleanup shim (POSIX executable)");
    return;
  }
  const repo = join(root, "comparison-cleanup");
  const shim = join(root, "comparison-git");
  const record = join(root, "comparison-directory.txt");
  mkdirSync(repo, { recursive: true });
  mkdirSync(shim, { recursive: true });
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  let realGit;
  try {
    realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "app.js"), '/* eslint no-console: off */ console.log("old");\n');
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip comparison cleanup (git unavailable)");
    return;
  }
  writeFileSync(join(shim, "git"), `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("--no-index")) {
  require("node:fs").writeFileSync(${JSON.stringify(record)}, args[args.indexOf("-C") + 1]);
  if (process.env.SLOP_TEST_DIFF_FAIL === "1") process.exit(2);
}
const result = require("node:child_process").spawnSync(${JSON.stringify(realGit)}, args, { stdio: "inherit" });
process.exit(result.status ?? 2);
`);
  chmodSync(join(shim, "git"), 0o755);
  writeFileSync(join(repo, "app.js"), '/* eslint no-console: off */ console.log("new");\n');
  for (const [fail, status] of [["0", 0], ["1", 2]]) {
    const result = spawnSync(process.execPath, [CHECKER, "--since=HEAD", "--json", "app.js"], {
      cwd: repo, encoding: "utf8", env: { ...process.env, PATH: `${shim}:${process.env.PATH}`, SLOP_TEST_DIFF_FAIL: fail },
    });
    assert.equal(result.status, status, result.stderr || result.stdout);
    assert.equal(existsSync(readFileSync(record, "utf8")), false, "comparison directory is removed");
    if (status === 2) assert.match(result.stderr, /cannot compare comments/u);
  }
});

check("--since reviews new rationale for every suppression family and preserves required metadata", () => {
  const repo = join(root, "all-suppression-rationale");
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  const directives = [
    "// @ts-ignore", "// biome-ignore lint/suspicious/noExplicitAny",
    "// eslint-disable-next-line no-console", "// oxlint-disable-next-line no-console",
    "// deno-lint-ignore no-console", "// deno-fmt-ignore", "// prettier-ignore",
    "/* istanbul ignore next */", "/* c8 ignore next */", "/* v8 ignore next */",
    "/* node:coverage ignore next */",
  ];
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    for (const [index, directive] of directives.entries()) writeFileSync(join(repo, `${index}.ts`), `${directive}\nfunction connect(options: string) { return options; }\n`);
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since all suppression rationale (git unavailable)");
    return;
  }
  for (const [index, directive] of directives.entries()) {
    const file = `${index}.ts`;
    const body = `${directive}\nfunction connect(options: string) { return options; }\n`;
    writeFileSync(join(repo, file), `// Vendor tooling requires this diagnostic output\n${body}`);
    const result = run(["--since=HEAD", "--json", file], repo);
    assert.equal(result.status, 1, `${directive}: ${result.stderr || result.stdout}`);
    assert.ok(JSON.parse(result.stdout).some(f => f.rule === "no-unjustified-suppression" && f.startLine === 1 && f.line === 2), directive);
    for (const prefix of [
      "// SPDX-License-Identifier: MIT", "/** @param options Stable account identifier, never a display name. */",
      "/** @throws {Error} When startup fails. */", "/** @exception {Error} When startup fails. */",
      "/** @yields {string} The next account identifier. */", "/** @customTag Account metadata used by the documentation plugin. */",
      "/* c8 ignore stop */", "/* v8 ignore stop */",
      "/* exported foo, bar */",
      '/// <reference types="node" />', '/// <reference path="dependency.d.ts" />', '/// <reference lib="es2020" />',
      '/// <reference no-default-lib="true" />', '/// <amd-module name="legacy" />', '/// <amd-dependency path="legacy" />',
      "initialize(); // Parse options before connecting",
      "initialize(); /* Parse options before connecting */",
      "/* Parse options before connecting */ initialize();",
    ]) {
      writeFileSync(join(repo, file), `${prefix}\n${body}`);
      const retained = run(["--since=HEAD", "--json", file], repo);
      assert.equal(retained.status, 0, `${prefix}: ${retained.stderr || retained.stdout}`);
    }
  }
});

check("--since combines contiguous standalone rationale without crossing code, gaps, or metadata", () => {
  const repo = join(root, "wrapped-rationale");
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  const bare = "// eslint-disable-next-line no-console\nconnect(options);\n";
  const cases = [
    ["new.js", bare, `// Vendor declaration is\n// incorrect.\n${bare}`, 1, 1, 3],
    ["old-tail.js", `// incorrect.\n${bare}`, `// Vendor declaration is\n// incorrect.\n${bare}`, 1, 1, 3],
    ["licensed.js", bare, `// SPDX-License-Identifier: MIT\n// Vendor declaration is\n// incorrect.\n${bare}`, 1, 2, 4],
    ["gap.js", bare, `// Vendor declaration is\n\n// incorrect.\n${bare}`, 0],
    ["code.js", bare, `// Vendor declaration is\ninitialize(); // incorrect.\n${bare}`, 0],
    ["one-word.js", bare, `// incorrect.\n//\n${bare}`, 0],
    ["metadata.js", bare, `/** @throws {Error} When startup fails. */\n// incorrect.\n${bare}`, 0],
    ["email-prose.js", bare, `/** Vendor contact user@example.com requires this workaround. */\n${bare}`, 1, 1, 2],
    ["after-code.ts", `initialize();\n${bare}`, `initialize();\n/// <reference types="node" />\n${bare}`, 1, 2, 3],
    ["fake-xml.ts", bare, `/// <not-a-reference types="node" />\n${bare}`, 1, 1, 2],
    ["mixed-tag.js", bare, `/** Vendor runtime requires this suppression. @see issue */\n${bare}`, 1, 1, 2],
    ["mixed-lines.js", bare, `/**\n * Vendor runtime requires this suppression.\n * @see issue\n */\n${bare}`, 1, 1, 5],
    ["inline-link.js", bare, `/** Vendor runtime requires {@link issue} for this suppression. */\n${bare}`, 1, 1, 2],
    ["description-tag.js", bare, `/** @description Vendor runtime requires this suppression. @see issue */\n${bare}`, 1, 1, 2],
    ["one-word-tag.js", bare, `/** incorrect. @see issue */\n${bare}`, 0],
    ["exported-prose.js", bare, `// exported foo, bar\n${bare}`, 1, 1, 2],
  ];
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    for (const [file, original] of cases) writeFileSync(join(repo, file), original);
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since wrapped rationale (git unavailable)");
    return;
  }
  for (const [file, , source, status, startLine, line] of cases) {
    writeFileSync(join(repo, file), source);
    const result = run(["--since=HEAD", "--json", file], repo);
    assert.equal(result.status, status, `${file}: ${result.stderr || result.stdout}`);
    if (status === 1) assert.ok(JSON.parse(result.stdout).some(f => f.rule === "no-unjustified-suppression" && f.startLine === startLine && f.line === line), file);
  }
});

check("--since keeps legacy safety evidence attached to its baseline assertion", () => {
  const repo = join(root, "assertion-attachments");
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  const marker = "// SAFETY: parsed by the schema above\n";
  const original = `${marker}const stable = 1;\n`;
  const oldAssertion = `${marker}const old = oldPayload as User;\n`;
  const cases = [
    ["inserted.ts", original, `${marker}const user = payload as User;\nconst stable = 1;\n`],
    ["angle.ts", original, `${marker}const user = <User>payload;\nconst stable = 1;\n`],
    ["multiline.ts", original, `${marker}const user = payload as {\n id: string;\n};\nconst stable = 1;\n`],
    ["before-old.ts", oldAssertion, `${marker}const user = payload as User;\nconst old = oldPayload as User;\n`],
    ["same-line.ts", oldAssertion, `${marker}const user = payload as User; const old = oldPayload as User;\n`],
    ["existing.ts", oldAssertion, oldAssertion.replace("oldPayload", "nextPayload"), 0],
  ];
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    for (const [file, base] of cases) writeFileSync(join(repo, file), base);
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since assertion attachment (git unavailable)");
    return;
  }
  for (const [file, , source, expected = 1] of cases) {
    writeFileSync(join(repo, file), source);
    const result = run(["--since=HEAD", "--json", file], repo);
    assert.equal(result.status, expected, `${file}: ${result.stderr || result.stdout}`);
    const findings = JSON.parse(result.stdout);
    if (expected) assert.ok(findings.some(f => f.rule === "require-safety-comment-for-type-assertion" && f.line === 2), file);
    assert.ok(!findings.some(f => f.rule === "no-new-justification-comments"), file);
  }
});

check("--since reports deletion-only edits inside surviving justification comments", () => {
  const repo = join(root, "deleted-rationale");
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  const cases = [
    ["safety.ts", "/* SAFETY:\n * validated by the schema\n * vendor fields checked\n */\nconst user = payload as User;\n", "no-new-justification-comments"],
    ["lazy.js", "/* lazy:\n * deliberate timing policy\n * vendor fields checked\n */\nawait new Promise(resolve => setTimeout(resolve, 1000));\n", "no-new-justification-comments"],
    ["suppression.js", "/* eslint-disable no-console\n * vendor fields checked\n */\nconsole.log(value);\n", "no-unjustified-suppression"],
    ["explanation.js", "/* Vendor diagnostic is incorrect.\n * vendor fields checked\n */\n// eslint-disable-next-line no-console\nconsole.log(value);\n", "no-unjustified-suppression"],
  ];
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    for (const [file, source] of cases) writeFileSync(join(repo, file), source);
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since deleted rationale (git unavailable)");
    return;
  }
  for (const [file, original, rule] of cases) {
    writeFileSync(join(repo, file), original.replace(" * vendor fields checked\n", ""));
    const result = run(["--since=HEAD", "--json", file], repo);
    assert.equal(result.status, 1, `${file}: ${result.stderr || result.stdout}`);
    const findings = JSON.parse(result.stdout);
    assert.ok(findings.some(f => f.rule === rule && (f.startLine ?? f.line) === 1), file);
    assert.ok(!findings.some(f => f.rule === "require-safety-comment-for-type-assertion" || f.rule === "no-arbitrary-sleep"), "unchanged code stays out of scope");
  }
});

// The tally is part of the same report `--since` scopes to the diff. Counting
// every ignore in a file one of whose lines changed reported "1 suppressed" for
// an untouched ignore somebody else wrote, which reads as this change having
// silenced something.
check("--since counts only suppressions on lines the diff added", () => {
  const repo = join(root, "since-suppressed");
  mkdirSync(repo, { recursive: true });
  const git = (...args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  const ignored =
    "// slop-check-ignore require-safety-comment-for-type-assertion -- parsed by the schema above\n"
    + "const first = payload as User;\n";
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "app.ts"), ignored);
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since suppression scope (git unavailable)");
    return;
  }

  assert.match(run(["app.ts"], repo).stdout, /1 suppressed/u, "a full scan still counts it");

  writeFileSync(join(repo, "app.ts"), `${ignored}export const added = 1;\n`);
  const since = run(["--since=HEAD"], repo);
  assert.equal(since.status, 0, since.stdout);
  assert.doesNotMatch(since.stdout, /suppressed/u, "the untouched ignore is out of scope");
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
  try {
    symlinkSync(join(repo, "build", "logo.png"), join(repo, "logo.png"));
  } catch {
    console.log("skip --since untracked noise (symlinks unavailable)");
    return;
  }
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

check("--since does not read a removed/added line pair as a file header", () => {
  const repo = join(root, "minus-header");
  mkdirSync(repo, { recursive: true });
  const git = (...args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "a.ts"), "let x = 0;\n-- x;\n");
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since minus header (git unavailable)");
    return;
  }
  // A removed line reading `-- x;` arrives as `--- x;` and used to arm the
  // header check; the following added `++ y;` (`+++ y;`) then became a bogus
  // path that failed the scan and swallowed the real file's findings.
  writeFileSync(join(repo, "a.ts"), `let x = 0;\n++ y;\n${SLOP}`);
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

// A declaration file is skipped whatever its module format. `.d.ts` was and
// `.d.mts`/`.d.cts` were not, so whether a hand-written `any` in a declaration
// was reported came down to the module format of the file it lived in.
check("declaration files are skipped in every module format", () => {
  const dir = mkdtempSync(join(tmpdir(), "slop-decl-"));
  for (const name of ["types.d.ts", "types.d.mts", "types.d.cts"]) {
    writeFileSync(join(dir, name), "export type External = any;\n");
  }
  writeFileSync(join(dir, "real.ts"), "export const a = 1;\n");
  const result = run([dir]);
  assert.match(result.stdout, /clean \(1 file checked\)/u);
  assert.equal(result.status, 0);
  rmSync(dir, { recursive: true, force: true });
});

// A failed scan must not print a clean bill of health on stdout. Exit 2 and a
// stderr line already said so; the summary a human reads said "clean".
check("a failed scan does not print a clean summary", () => {
  const result = run(["definitely-not-here.ts"]);
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stdout, /clean/u);
  assert.match(result.stdout, /scan incomplete \(1 path unreadable/u);
});

// `--since` keys changes by their path under the repository root, so an
// explicit target that is a symlink to a tracked directory looked up the alias
// spelling, found nothing, and reported clean.
check("--since follows a symlinked target to the changed files", () => {
  const repo = mkdtempSync(join(tmpdir(), "slop-since-symlink-"));
  const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  mkdirSync(join(repo, "real"), { recursive: true });
  git("init", "-q", ".");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  writeFileSync(join(repo, "real", "a.ts"), "export const a = 1;\n");
  try {
    symlinkSync("real", join(repo, "alias"));
  } catch {
    console.log("skip --since symlinked target (symlinks unavailable)");
    return;
  }
  git("add", "-A");
  git("commit", "-qm", "base");
  writeFileSync(join(repo, "real", "a.ts"), "export const a = 1;\nconst bad: any = 2;\n");

  const viaReal = run(["--since=HEAD", "real"], repo);
  const viaAlias = run(["--since=HEAD", "alias"], repo);
  assert.match(viaReal.stdout, /no-any/u);
  assert.match(viaAlias.stdout, /no-any/u);
  assert.equal(viaAlias.status, viaReal.status);
  rmSync(repo, { recursive: true, force: true });
});

rmSync(root, { recursive: true, force: true });
rmSync(modernRoot, { recursive: true, force: true });

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

// The changed-file command in skills/slop-check/SKILL.md is read out of the doc
// and run, so the doc is the thing under test. Without --diff-filter=d, git
// prints the pathname of a DELETED file, the checker cannot read it, and an
// ordinary deletion-only change exits 2 as "scan incomplete" with nothing wrong.
check("the final scan handles deletions, shell edits, and untracked names safely", () => {
  const repo = mkdtempSync(join(tmpdir(), "slop-final-"));
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  try {
    git("init", "-q", ".");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    writeFileSync(join(repo, "keep.ts"), "export const a = 1;\n");
    writeFileSync(join(repo, "gone.ts"), "export const b = 2;\n");
    git("add", "-A");
    git("commit", "-qm", "base");
    rmSync(join(repo, "gone.ts"));
    const deletionOnly = run(["--since=HEAD"], repo);
    assert.equal(deletionOnly.status, 0, deletionOnly.stderr);
    assert.match(deletionOnly.stdout, /0 files checked/u);
    writeFileSync(join(repo, "keep.ts"), `export const a = 1;\n${SLOP}`);
    writeFileSync(join(repo, "new file.ts"), SLOP);
    writeFileSync(join(repo, "-dash.ts"), SLOP);
    const result = run(["--since=HEAD", "--json"], repo);
    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).map(x => basename(x.path)).sort(), ["-dash.ts", "keep.ts", "new file.ts"]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

write("disable-me.ts", SLOP);

check("--disable turns a rule off for the run", () => {
  const result = run(["--disable=require-safety-comment-for-type-assertion", "disable-me.ts"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /clean \(1 file checked, 1 suppressed\)/u);
});

check("--disable takes a comma-separated list", () => {
  write("two-rules.ts", "const copy = JSON.parse(JSON.stringify(payload as User));\n");
  const result = run(["--disable=no-json-clone,require-safety-comment-for-type-assertion", "two-rules.ts"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /2 suppressed/u);
});

// A warning and a run, not exit 2: a misspelled id leaves the rule ON, so the
// scan is stricter than asked for. Saying nothing is what would read as "off".
check("--disable warns about an id that is not a rule", () => {
  const result = run(["--disable=no-such-rule", "disable-me.ts"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not a rule id/u);
  assert.match(result.stdout, /1 finding in 1 file/u);
});

check("an ignore comment silences the rule it names", () => {
  write("ignored.ts", `// slop-check-ignore require-safety-comment-for-type-assertion -- parsed at the boundary above\n${SLOP}`);
  const result = run(["ignored.ts"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /clean \(1 file checked, 1 suppressed\)/u);
});

check("an ignore with no reason is reported instead of applied", () => {
  write("unjustified.ts", `// slop-check-ignore require-safety-comment-for-type-assertion\n${SLOP}`);
  const result = run(["unjustified.ts"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /unjustified\.ts:1:1 no-unjustified-ignore/u);
  assert.match(result.stdout, /2 findings in 1 file/u);
});

// The count is a scan property, not a finding: consumers parse a bare array.
check("--json stays a bare array when findings are suppressed", () => {
  const result = run(["--json", "ignored.ts"]);
  assert.deepEqual(JSON.parse(result.stdout), []);
});

check("--explain prints one rule's explanation and exits 0", () => {
  const result = run(["--explain=no-json-clone"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no-json-clone/u);
  assert.match(result.stdout, /structuredClone/u, "names the replacement");
  assert.match(result.stdout, /THROWS on functions/u, "names where the replacement diverges");
  assert.doesNotMatch(result.stdout, /clean|finding/u, "no scan runs");
});

check("assertion findings request evidence without adding comments", () => {
  write("assertions.ts", "const a = input as User;\nconst b = input as {\n  id: string;\n};\nconst c = <User>input;\n");
  const result = run(["--json", "assertions.ts"]);
  assert.equal(result.status, 1);
  const findings = JSON.parse(result.stdout).filter(f => f.rule === "require-safety-comment-for-type-assertion");
  assert.equal(findings.length, 3);
  for (const finding of findings) {
    assert.match(finding.message, /checked invariant.*final response/u);
    assert.doesNotMatch(finding.message, /immediately before|SAFETY:/u);
  }
});

check("empty-catch findings put justification in the response", () => {
  write("swallow.ts", "try { save(); } catch {}\n");
  const result = run(["--json", "swallow.ts"]);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).find(f => f.rule === "no-empty-catch").message, /final response/u);
});

check("malformed-ignore findings never recommend replacement comments", () => {
  for (const [name, source] of [
    ["missing-reason", "// slop-check-ignore no-any\nconst parsed: any = input;\n"],
    ["missing-rule", "// slop-check-ignore -- parsed at the boundary\n"],
    ["unknown-rule", "// slop-check-ignore no-such-rule -- parsed at the boundary\n"],
    ["late-file-ignore", `${"\n".repeat(10)}// slop-check-ignore-file no-any -- parsed at the boundary\nconst parsed: any = input;\n`],
  ]) {
    const file = write(`${name}.ts`, source);
    for (const args of [[file], ["--json", file]]) {
      const result = run(args);
      assert.equal(result.status, 1);
      const message = args.length === 1 ? result.stdout : JSON.parse(result.stdout).find(f => f.rule === "no-unjustified-ignore").message;
      assert.match(message, /suppresses nothing/u);
      assert.match(message, /final response/u);
      assert.doesNotMatch(message, /Write `slop-check-ignore|<why the rule is wrong here>/u);
    }
  }
});

check("comment findings move useful rationale to the response", () => {
  for (const [rule, source] of [
    ["no-narration-comments", "// First, write the journal so crash recovery can replay an interrupted update.\nwriteJournal();\napplyUpdate();\n"],
    ["no-change-note-comments", "// As discussed in ADR-17, retry only idempotent requests\nretry(request);\n"],
    ["no-obvious-doc-comments", "/** Constructor */\nclass AuthClient {}\n"],
    ["no-unjustified-suppression", "// @ts-expect-error\nconnect(options);\n"],
  ]) {
    const file = write(`${rule}.ts`, source);
    const result = run(["--json", file]);
    assert.equal(result.status, 1);
    const finding = JSON.parse(result.stdout).find(f => f.rule === rule);
    assert.match(finding.message, /final response/u);
    assert.doesNotMatch(finding.message, /retain reasons|retain enduring design rationale|Say why the code exists|on the same line/u);
  }
});

for (const rule of ["require-safety-comment-for-type-assertion", "no-empty-catch", "no-unjustified-ignore", "no-unjustified-suppression"])
  check(`${rule} explanation never asks for a new justification comment`, () => {
    const result = run([`--explain=${rule}`]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /final response/u);
    assert.doesNotMatch(result.stdout, /needs a comment|comment is the difference|SAFETY comment is valid|slop-check-ignore no-any --/u);
  });

check("--explain reports a mechanical tier for a mechanical rule", () => {
  for (const rule of ["no-double-negation-condition", "no-new-justification-comments"]) {
    const result = run([`--explain=${rule}`]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /fix \(mechanical/u);
  }
});

check("--explain names a misspelled rule and exits 2", () => {
  const result = run(["--explain=no-json-clon"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not a rule id/u);
  assert.match(result.stderr, /no-json-clone/u, "the id list suggests the intended rule");
});

check("--explain rejects repeated values before printing an explanation", () => {
  for (const id of ["no-any", "no-such-rule", ""]) {
    const result = run(["--explain=no-any", `--explain=${id}`]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /only once/u);
  }
});

check("help does not hide invalid explanation values", () => {
  for (const help of ["--help", "-h"]) {
    for (const id of ["no-such-rule", "", "constructor"]) {
      for (const args of [[help, `--explain=${id}`], [`--explain=${id}`, help]]) {
        const result = run(args);
        assert.equal(result.status, 2);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, /not a rule id/u);
      }
    }
    const result = run([help, "--explain=no-any"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/u);
  }
});

check("heuristic documentation rules stay review-only in explanations", () => {
  for (const id of ["no-emoji", "no-obvious-doc-comments", "no-narration-comments", "no-change-note-comments"]) {
    const result = run([`--explain=${id}`]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /review \(heuristic/u);
  }
});

check("--explain ignores paths and runs no scan", () => {
  const result = run(["--explain=no-any", "slop.ts"]);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /slop\.ts/u);
  assert.doesNotMatch(result.stdout, /1 finding/u);
});

check("--explain preserves durable contracts and sanitizing boundaries", () => {
  for (const [id, contract] of [
    ["no-change-note-comments", /retain.*ADR/iu],
    ["no-backcompat-comments", /persisted.*protocol/iu],
    ["no-let-if-else-assign", /retain.*annotation/iu],
    ["no-message-only-rethrow", /approved public error.*without.*cause/iu],
  ]) {
    const result = run([`--explain=${id}`]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, contract);
  }
});

check("--explain with no value is an unknown option", () => {
  const result = run(["--explain"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown option/u);
});

check("--explain indents every example line", () => {
  const result = run(["--explain=no-json-clone"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\n    const state = .*\n    const copy =/u);
});

check("--explain rejects empty and inherited object keys", () => {
  for (const id of ["", "constructor", "__proto__", "toString"]) {
    const result = run([`--explain=${id}`]);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /not a rule id/u);
  }
});

check("--explain does not hide an unknown option", () => {
  const result = run(["--explain=no-any", "--jsoon"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown option/u);
});

check("-- keeps explain-shaped arguments as paths", () => {
  const result = run(["--", "--explain=no-any"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot read --explain=no-any/u);
});

check("--explain bypasses scan options and missing paths", () => {
  const result = run(["--explain=no-any", "--since=missing-ref", "--summary", "--json", "missing.ts"]);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Why it fires:/u);
});

check("usage lists --explain", () => {
  const result = run(["--help"]);
  assert.match(result.stdout, /--explain=<rule>/u);
});

check("array performance findings are advisory, serialized, and individually configurable", () => {
  write("array-performance.js", [
    "const result = [1, 2].reduce((acc, value) => acc.concat(value), []);",
    "const doubled = [1, 2].filter(value => value > 0).map(value => value * 2);",
    "",
  ].join("\n"));
  const result = run(["--json", "array-performance.js"]);
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).map(({ rule, severity, line }) => ({ rule, severity, line })), [
    { rule: "no-reduce-accumulator-copy", severity: "review", line: 1 },
    { rule: "no-array-filter-map", severity: "review", line: 2 },
  ]);
  const filtered = run(["--json", "--disable=no-array-filter-map", "array-performance.js"]);
  assert.equal(filtered.status, 1, filtered.stderr);
  assert.deepEqual(JSON.parse(filtered.stdout).map(finding => finding.rule), ["no-reduce-accumulator-copy"]);
  const disabled = run(["--disable=no-array-filter-map,no-reduce-accumulator-copy", "array-performance.js"]);
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.match(disabled.stdout, /2 suppressed/u);
});

check("--since sees changed multiline array operations without reporting untouched copies", () => {
  const repo = join(root, "array-diff");
  mkdirSync(repo);
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  const reducer = [
    "const legacy = [1].reduce((acc, value) => [...acc, value], []);",
    "const result = [1, 2].reduce((acc, value) => {",
    "  return acc;",
    "}, []);",
    "",
  ].join("\n");
  const pipeline = "const doubled = [1, 2]\n  .filter(value => value > 0);\n";
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  writeFileSync(join(repo, "reduce.js"), reducer);
  writeFileSync(join(repo, "pipeline.js"), pipeline);
  git("add", "-A");
  git("commit", "-qm", "base");
  writeFileSync(join(repo, "reduce.js"), reducer.replace("return acc;", "return [...acc, value];"));
  writeFileSync(join(repo, "pipeline.js"), pipeline.replace(";", "\n  .map(value => value * 2);"));
  const result = run(["--since=HEAD", "--json"], repo);
  assert.equal(result.status, 1, result.stderr);
  const findings = JSON.parse(result.stdout);
  assert.deepEqual(findings.map(finding => finding.rule).sort(), ["no-array-filter-map", "no-reduce-accumulator-copy"]);
  const copy = findings.find(finding => finding.rule === "no-reduce-accumulator-copy");
  assert.ok(copy.line > 1 && copy.line <= 3 && (copy.endLine || copy.line) >= 3,
    "the changed reducer body is reported instead of the unchanged legacy copy");
});

check("--since includes receiver-only and reducer-initial-only multiline changes", () => {
  const repo = join(root, "array-span-diff");
  mkdirSync(repo);
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  const pipeline = (receiver) => [
    "const customCollection = getCollection();",
    `const result = ${receiver}`,
    "",
    "",
    "",
    "",
    "",
    "  .filter(value => value > 0)",
    "  .map(value => value * 2);",
    "const preexisting = Reflect.get(source, key);",
    "",
  ].join("\n");
  const reducer = (initial) => [
    "const customCollection = getCollection();",
    "const items = [1, 2];",
    "const result = items.reduce(",
    "  (acc, item) => {",
    "    return acc.concat(item);",
    "  },",
    "",
    "",
    "",
    "",
    "",
    `  ${initial},`,
    ");",
    "const preexisting = Reflect.get(source, key);",
    "",
  ].join("\n");
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  writeFileSync(join(repo, "pipeline.js"), pipeline("customCollection"));
  writeFileSync(join(repo, "reducer.js"), reducer("customCollection"));
  git("add", "-A");
  git("commit", "-qm", "base");
  const baselineRules = JSON.parse(run(["--json"], repo).stdout).filter(({ rule }) =>
    ["no-array-filter-map", "no-reduce-accumulator-copy"].includes(rule));
  assert.deepEqual(baselineRules, [], "customCollection does not establish an array finding before the edit");
  writeFileSync(join(repo, "pipeline.js"), pipeline("[]"));
  writeFileSync(join(repo, "reducer.js"), reducer("[]"));

  const result = run(["--since=HEAD", "--json"], repo);
  assert.equal(result.status, 1, result.stderr);
  const findings = JSON.parse(result.stdout);
  assert.deepEqual(findings.map(({ rule }) => rule).sort(), [
    "no-array-filter-map",
    "no-reduce-accumulator-copy",
  ]);
  const pipelineFinding = findings.find(({ rule }) => rule === "no-array-filter-map");
  const reducerFinding = findings.find(({ rule }) => rule === "no-reduce-accumulator-copy");
  assert.ok(pipelineFinding.startLine <= 2 && pipelineFinding.endLine >= 9,
    "filter/map span includes its changed receiver");
  assert.ok(reducerFinding.startLine <= 12 && reducerFinding.endLine >= 12,
    "reducer span includes its changed initial value");
});

check("multiline array suppressions honor evidence starts and keep later operations visible", () => {
  const file = write("array-suppressions.js", [
    "const users = [];",
    "// slop-check-ignore no-array-filter-map -- preserve callback order",
    "const receiverSuppressed = users",
    "  .filter(active)",
    "  .map(normalize);",
    "const anchorSuppressed = users",
    "  // slop-check-ignore no-array-filter-map -- preserve callback order",
    "  .filter(active)",
    "  .map(email);",
    "const reducerItems = [1, 2];",
    "// slop-check-ignore no-reduce-accumulator-copy -- preserve callback behavior",
    "const reducerSuppressed = reducerItems.reduce(",
    "  (acc, item) => {",
    "    return [...acc, item];",
    "  },",
    "  [],",
    ");",
    "const bodySuppressed = [1, 2].reduce(",
    "  (acc, item) => {",
    "    // slop-check-ignore no-reduce-accumulator-copy -- preserve callback behavior",
    "    return [...acc, item];",
    "  },",
    "  [],",
    ");",
    "const nextPipeline = users",
    "  .filter(active)",
    "  .map(email);",
    "const nextReducer = [1, 2].reduce(",
    "  (acc, item) => {",
    "    return [...acc, item];",
    "  },",
    "  [],",
    ");",
    "",
  ].join("\n"));
  const json = run(["--json", file]);
  assert.equal(json.status, 1, json.stderr);
  const findings = JSON.parse(json.stdout);
  assert.deepEqual(findings.map(({ rule, line }) => [rule, line]), [
    ["no-array-filter-map", 26],
    ["no-reduce-accumulator-copy", 30],
  ], "only unrelated later operations remain reported");

  const summary = run([file]);
  assert.equal(summary.status, 1, summary.stdout);
  assert.match(summary.stdout, /2 findings? in 1 file, 4 suppressed/u);
});

check("--since counts only a changed multiline expression's suppression", () => {
  const repo = join(root, "array-suppression-diff");
  mkdirSync(repo);
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" });
  const source = (mapName) => [
    "const users = [];",
    "const existing = users",
    "  // slop-check-ignore no-array-filter-map -- preserve callback order",
    "  .filter(active)",
    "  .map(email);",
    "// slop-check-ignore no-array-filter-map -- preserve callback order",
    "const changed = users",
    "  .filter(active)",
    `  .map(${mapName});`,
    "",
  ].join("\n");
  try {
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    writeFileSync(join(repo, "pipeline.js"), source("email"));
    git("add", "-A");
    git("commit", "-qm", "base");
  } catch {
    console.log("skip --since multiline suppression scope (git unavailable)");
    return;
  }
  writeFileSync(join(repo, "pipeline.js"), source("normalize"));
  const result = run(["--since=HEAD"], repo);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /clean \(1 file checked, 1 suppressed\)/u);
  assert.doesNotMatch(result.stdout, /2 suppressed/u, "the untouched operation is outside the changed expression");
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}

console.log("\nall slop-check CLI tests passed");
