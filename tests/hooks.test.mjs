#!/usr/bin/env node
// Runtime-hook tests for the lazy-clean plugin. Zero dependencies:
//   node tests/hooks.test.mjs                       (from the repo root, no env)
//   LAZY_PLUGIN_ROOT=/path/to/lazy-clean node hooks.test.mjs   (run from anywhere)
//
// Covers the pure surface (lazy-config, lazy-instructions, lazy-runtime) in
// process, and spawns the stdin-driven hooks (lazy-mode-tracker, lazy-subagent,
// edit-check, lazy-activate, lazy-statusline.sh) against a sandboxed
// HOME / CLAUDE_CONFIG_DIR / XDG_CONFIG_HOME. All sandbox state lives in one
// mkdtemp directory that is removed on exit.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

// Resolve the plugin root from this file's own location (tests/ lives one level
// under it) so `node tests/hooks.test.mjs` works with no environment at all.
function findPluginRoot() {
  const candidates = [];
  if (process.env.LAZY_PLUGIN_ROOT) candidates.push(process.env.LAZY_PLUGIN_ROOT);
  candidates.push(path.join(here, ".."), here, process.cwd());
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "hooks", "lazy-config.js")) &&
        fs.existsSync(path.join(candidate, "skills", "lazy", "SKILL.md"))) {
      // realpath so a symlinked checkout does not confuse the orphan-copy test.
      return fs.realpathSync(candidate);
    }
  }
  throw new Error("plugin root not found; run from the repo or set LAZY_PLUGIN_ROOT");
}

const ROOT = findPluginRoot();
const HOOKS = path.join(ROOT, "hooks");
const SKILL_MD = path.join(ROOT, "skills", "lazy", "SKILL.md");

let failures = 0;
let passes = 0;

function ok(description, condition, detail = "") {
  if (condition) {
    passes += 1;
    console.log(`ok   ${description}`);
  } else {
    failures += 1;
    console.error(`FAIL ${description}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(description, actual, expected) {
  let same;
  try {
    assert.deepEqual(actual, expected);
    same = true;
  } catch {
    same = false;
  }
  ok(description, same, `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

// --- sandbox -----------------------------------------------------------------

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "lazy-hooks-test-"));
const cleanup = () => fs.rmSync(SANDBOX, { recursive: true, force: true });
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => { cleanup(); process.exit(130); });
}

function freshHome(name) {
  const home = path.join(SANDBOX, name);
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(home, ".config"), { recursive: true });
  return {
    home,
    env: {
      HOME: home,
      USERPROFILE: home,
      CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
      XDG_CONFIG_HOME: path.join(home, ".config"),
    },
    flag: path.join(home, ".claude", ".lazy-active"),
    config: path.join(home, ".config", "lazy", "config.json"),
    settings: path.join(home, ".claude", "settings.json"),
  };
}

// Mirrors lazy-runtime's naming: a readable prefix plus a digest of the WHOLE
// id, because sanitizing alone let `a/b` and `a:b` share one file.
function qoderStateFile(id) {
  const readable = String(id).replace(/[^\w.-]/gu, "_").slice(0, 32);
  const digest = createHash("sha256").update(String(id)).digest("hex").slice(0, 16);
  return `.lazy-active-${readable}-${digest}`;
}

function writeConfig(box, text) {
  fs.mkdirSync(path.dirname(box.config), { recursive: true });
  fs.writeFileSync(box.config, text);
}

// Hook env starts from a scrubbed base so the developer's own shell can't leak in.
const SCRUBBED = [
  "LAZY_DEFAULT_MODE", "LAZY_HIDE_STATUS", "LAZY_SUBAGENT_MATCHER",
  "COPILOT_PLUGIN_DATA", "PLUGIN_DATA", "QODER_SESSION_ID", "CLAUDE_PLUGIN_ROOT",
  "CLAUDE_CONFIG_DIR", "XDG_CONFIG_HOME", "APPDATA",
];

function baseEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of SCRUBBED) delete env[key];
  return { ...env, ...extra };
}

function runHook(script, payload, extraEnv = {}, opts = {}) {
  const res = spawnSync(process.execPath, [path.join(HOOKS, script)], {
    input: payload === null ? undefined : payload,
    encoding: "utf8",
    env: baseEnv(extraEnv),
    timeout: 20000,
    ...opts,
  });
  return { status: res.status, stdout: res.stdout || "", stderr: res.stderr || "" };
}

// Runs a hook with data written to stdin but the pipe left OPEN (no EOF) — the
// Windows PowerShell-wrapper case (#443) the 1s fallback timer exists for.
function runHookNoEof(script, payload, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HOOKS, script)], {
      stdio: ["pipe", "pipe", "pipe"],
      env: baseEnv(extraEnv),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.stdin.write(payload); // deliberately no end()
    child.stdin.on("error", () => {});
    const killer = setTimeout(() => child.kill("SIGKILL"), 10000);
    const started = Date.now();
    child.on("close", (status, signal) => {
      clearTimeout(killer);
      resolve({ status, signal, stdout, stderr, ms: Date.now() - started });
    });
  });
}

function parses(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    // The throw IS the answer: this predicate asks whether the text parses.
    return false;
  }
}

// --- lazy-config -------------------------------------------------------------

const config = require(path.join(HOOKS, "lazy-config.js"));

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const cfgBox = freshHome("config");
const CFG_ENV = { ...cfgBox.env, LAZY_DEFAULT_MODE: undefined, LAZY_HIDE_STATUS: undefined };

function defaultModeWith({ env, file }) {
  if (file === null) fs.rmSync(cfgBox.config, { force: true });
  else writeConfig(cfgBox, file);
  return withEnv({ ...CFG_ENV, LAZY_DEFAULT_MODE: env }, () => config.getDefaultMode());
}

eq("getDefaultMode falls back to full", defaultModeWith({ env: undefined, file: null }), "full");
eq("getDefaultMode reads env", defaultModeWith({ env: "ultra", file: null }), "ultra");
eq("getDefaultMode lowercases env", defaultModeWith({ env: "ULTRA", file: null }), "ultra");
eq("getDefaultMode trims env", defaultModeWith({ env: "  ultra  ", file: null }), "ultra");
eq("getDefaultMode trims tabs/newlines in env", defaultModeWith({ env: "\tULTRA\n", file: null }), "ultra");
eq("getDefaultMode ignores a whitespace-only env", defaultModeWith({ env: "   ", file: null }), "full");
eq("getDefaultMode rejects review from env", defaultModeWith({ env: "review", file: null }), "full");
eq("getDefaultMode rejects garbage env", defaultModeWith({ env: "; rm -rf /", file: null }), "full");
eq("getDefaultMode ignores empty env", defaultModeWith({ env: "", file: null }), "full");

eq("config file supplies default", defaultModeWith({ env: undefined, file: '{"defaultMode":"lite"}' }), "lite");
eq("config file BOM is stripped", defaultModeWith({ env: undefined, file: '\uFEFF{"defaultMode":"ultra"}' }), "ultra");
eq("invalid JSON config falls back", defaultModeWith({ env: undefined, file: "{defaultMode: ultra" }), "full");
eq("array config falls back", defaultModeWith({ env: undefined, file: '["ultra"]' }), "full");
eq("null config falls back", defaultModeWith({ env: undefined, file: "null" }), "full");
eq("non-string defaultMode falls back", defaultModeWith({ env: undefined, file: '{"defaultMode":5}' }), "full");
eq("review rejected as a stored default", defaultModeWith({ env: undefined, file: '{"defaultMode":"review"}' }), "full");
eq("env beats config file", defaultModeWith({ env: "ultra", file: '{"defaultMode":"lite"}' }), "ultra");
eq("padded env still beats config file", defaultModeWith({ env: " ultra ", file: '{"defaultMode":"lite"}' }), "ultra");

// truthiness tables
for (const [value, expected] of [["1", true], ["true", true], ["yes", true], ["banana", true],
  ["0", false], ["false", false], ["FALSE", false], ["False", false], ["no", false], ["No", false],
  ["", false], ["   ", false], [" 0 ", false], [" 1 ", true]]) {
  eq(`getHideStatus env ${JSON.stringify(value)}`,
    withEnv({ ...CFG_ENV, LAZY_HIDE_STATUS: value }, () => config.getHideStatus()), expected);
}
writeConfig(cfgBox, '{"hideStatus":true}');
eq("getHideStatus reads config true", withEnv(CFG_ENV, () => config.getHideStatus()), true);
writeConfig(cfgBox, '{"hideStatus":1}');
eq("getHideStatus requires strict true in config", withEnv(CFG_ENV, () => config.getHideStatus()), false);
writeConfig(cfgBox, '{"hideStatus":true}');
eq("env 0 overrides config true", withEnv({ ...CFG_ENV, LAZY_HIDE_STATUS: "0" }, () => config.getHideStatus()), false);
eq("an env var set to empty overrides config true",
  withEnv({ ...CFG_ENV, LAZY_HIDE_STATUS: "" }, () => config.getHideStatus()), false);

// isShellSafe
for (const good of ["/home/user/lazy-clean", "/Users/a b/plugins/lazy", "C:\\Users\\me\\.claude",
  "~/x", "/x/lazy-clean-1.2.3", "/Users/José/.claude", "/用户/lazy", "/x/Ünïcödé_1.2"]) {
  ok(`isShellSafe allows ${JSON.stringify(good)}`, config.isShellSafe(good) === true);
}
for (const bad of ["/tmp/a;rm -rf /", "/tmp/a$(id)", "/tmp/`id`", "/tmp/a&b", "/tmp/it's", '/tmp/a"b',
  "/tmp/a|b", "/tmp/a>b", "/tmp/ok\n", "/tmp/ok\nrm -rf /", "/tmp/a\tb", "", "/tmp/a\0b", "/tmp/emoji😀"]) {
  ok(`isShellSafe rejects ${JSON.stringify(bad)}`, config.isShellSafe(bad) === false);
}
ok("isShellSafe rejects non-strings", config.isShellSafe(undefined) === false && config.isShellSafe(5) === false);

// isDeactivationCommand
for (const yes of ["stop lazy", "STOP LAZY.", "  Normal Mode!!  ", "normal mode", "stop lazy?!", "normal mode\n"]) {
  ok(`isDeactivationCommand ${JSON.stringify(yes)}`, config.isDeactivationCommand(yes) === true);
}
for (const no of ["add a normal mode toggle", "stop lazy please", "please stop lazy", "stop  lazy",
  "", null, undefined, 42, "stop laziness"]) {
  ok(`isDeactivationCommand rejects ${JSON.stringify(no)}`, config.isDeactivationCommand(no) === false);
}

// normalizers
eq("normalizeMode trims + lowercases", config.normalizeMode("  ULTRA  "), "ultra");
eq("normalizeMode rejects review", config.normalizeMode("review"), null);
eq("normalizeConfigMode accepts review", config.normalizeConfigMode("review"), "review");
eq("normalizePersistedMode accepts both", [config.normalizePersistedMode("lite"), config.normalizePersistedMode("review"), config.normalizePersistedMode("x")], ["lite", "review", null]);

// writeDefaultMode / writeHideStatus
const writeBox = freshHome("write");
withEnv(writeBox.env, () => {
  eq("writeDefaultMode normalizes", config.writeDefaultMode(" ULTRA "), "ultra");
  eq("writeDefaultMode persisted", JSON.parse(fs.readFileSync(writeBox.config, "utf8")).defaultMode, "ultra");
  eq("writeDefaultMode rejects review", config.writeDefaultMode("review"), null);
  eq("writeDefaultMode rejects garbage", config.writeDefaultMode("banana"), null);
  eq("writeDefaultMode rejects non-string", config.writeDefaultMode(5), null);
  eq("rejected write leaves config untouched", JSON.parse(fs.readFileSync(writeBox.config, "utf8")).defaultMode, "ultra");

  writeConfig(writeBox, '{"hideStatus":true,"unrelated":"keep"}');
  config.writeDefaultMode("lite");
  eq("writeDefaultMode preserves other keys",
    JSON.parse(fs.readFileSync(writeBox.config, "utf8")),
    { hideStatus: true, unrelated: "keep", defaultMode: "lite" });

  writeConfig(writeBox, "[1,2,3]");
  config.writeDefaultMode("full");
  eq("writeDefaultMode repairs an array config", JSON.parse(fs.readFileSync(writeBox.config, "utf8")), { defaultMode: "full" });

  writeConfig(writeBox, "not json at all");
  eq("writeHideStatus repairs a corrupt config", config.writeHideStatus(true), true);
  eq("writeHideStatus persisted", JSON.parse(fs.readFileSync(writeBox.config, "utf8")), { hideStatus: true });
  eq("writeHideStatus coerces to strict boolean", config.writeHideStatus("truthy string"), false);
});

// Unwritable config location: mkdir/write throws so the caller can report it.
const notADir = path.join(SANDBOX, "not-a-dir");
fs.writeFileSync(notADir, "");
withEnv({ ...writeBox.env, XDG_CONFIG_HOME: notADir }, () => {
  let threw = null;
  try { config.writeDefaultMode("ultra"); } catch (e) { threw = e.code; }
  eq("writeDefaultMode throws on an unwritable config dir", threw, "ENOTDIR");
});

// --- lazy-instructions -------------------------------------------------------

const instructions = require(path.join(HOOKS, "lazy-instructions.js"));
const skillBody = fs.readFileSync(SKILL_MD, "utf8");

// Wording-independent view of SKILL.md: a line is mode-keyed if it is an
// intensity table row or a quoted worked example whose label is a runtime mode.
// Spec: frontmatter and maintainer-only HTML comments are stripped, mode-keyed
// lines are filtered, and everything else survives verbatim.
const bodyLines = skillBody
  .replace(/^---[\s\S]*?---\s*/, "")
  .replace(/<!--[\s\S]*?-->\n?/g, "")
  .split(/\r?\n/);
const rowMode = (line) => {
  const m = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
  return m ? config.normalizeMode(m[1].trim()) : null;
};
const exampleMode = (line) => {
  const m = line.match(/^-\s*([^:]+):\s*"/);
  return m ? config.normalizeMode(m[1].trim()) : null;
};
const keyedMode = (line) => rowMode(line) || exampleMode(line);
const tableRows = (text) => text.split("\n").filter(rowMode).map(rowMode);
const exampleRows = (text) => text.split("\n").filter(exampleMode).map(exampleMode);

ok("frontmatter and HTML comments are stripped",
  !instructions.filterSkillBodyForMode(skillBody, "full").includes("<!--") &&
  !instructions.filterSkillBodyForMode("---\nname: x\n---\nbody\n", "full").includes("name: x"));
ok("SKILL.md still has mode-keyed rows and examples to filter",
  new Set(tableRows(skillBody)).size === 3 && new Set(exampleRows(skillBody)).size === 3);

for (const mode of ["lite", "full", "ultra"]) {
  const out = instructions.filterSkillBodyForMode(skillBody, mode);
  eq(`filter keeps only the ${mode} table row`, tableRows(out), [mode]);
  eq(`filter keeps only the ${mode} worked example`, exampleRows(out), [mode]);
  // Every line that is not mode-keyed must survive byte-for-byte, in order —
  // this is the "ordinary bullets and table headers survive" invariant.
  eq(`filter drops nothing else in ${mode}`, out.split("\n"),
    bodyLines.filter((l) => (keyedMode(l) ? keyedMode(l) === mode : true)));
  ok(`filter keeps the intensity table header in ${mode}`, /^\|\s*Level\s*\|/m.test(out));
  ok(`filter strips frontmatter in ${mode}`, !out.includes("argument-hint:"));
  ok(`filter keeps prose headings in ${mode}`, out.includes("## The ladder") && out.includes("## Intensity"));
}
eq("filter treats an unknown mode as full", tableRows(instructions.filterSkillBodyForMode(skillBody, "banana")), ["full"]);
eq("filter treats review as full (review is not a runtime level)", tableRows(instructions.filterSkillBodyForMode(skillBody, "review")), ["full"]);
eq("filter treats undefined as full", tableRows(instructions.filterSkillBodyForMode(skillBody, undefined)), ["full"]);
eq("filter tolerates an empty body", instructions.filterSkillBodyForMode("", "full"), "");

// A rule bullet that merely starts with a mode word must survive every mode.
const synthetic = [
  "- Full: this is prose, not a worked example, and must never be dropped.",
  '- lite: "a real worked example"',
  '- ultra: "another worked example"',
  "| **lite** | row |",
  "| **not-a-mode** | row |",
].join("\n");
const syntheticFull = instructions.filterSkillBodyForMode(synthetic, "full");
ok("unquoted mode-word bullet survives in another mode", syntheticFull.includes("- Full: this is prose"));
ok("quoted worked example for another mode is dropped", !syntheticFull.includes("a real worked example"));
ok("table row whose label is not a mode always survives", syntheticFull.includes("| **not-a-mode** | row |"));

// off is not a level anyone can be instructed in: no header, no orphaned table.
eq("getLazyInstructions(off) is empty", instructions.getLazyInstructions("off"), "");
eq("getSubagentInstructions(off) is empty", instructions.getSubagentInstructions("off"), "");
eq("getLazyInstructions(OFF) is empty too", instructions.getLazyInstructions("  OFF  "), "");

// review is an independent mode: a pointer, not a filtered body.
ok("getLazyInstructions(review) returns the pointer",
  instructions.getLazyInstructions("review") === "LAZY MODE ACTIVE — level: review. Behavior defined by /lazy-review skill.");
ok("getSubagentInstructions(review) returns the pointer",
  instructions.getSubagentInstructions("review") === "LAZY MODE ACTIVE — level: review. Behavior defined by /lazy-review skill.");

for (const mode of ["lite", "full", "ultra"]) {
  const full = instructions.getLazyInstructions(mode);
  const sub = instructions.getSubagentInstructions(mode);
  ok(`getLazyInstructions(${mode}) headers the level`, full.startsWith(`LAZY MODE ACTIVE — level: ${mode}\n`));
  ok(`getLazyInstructions(${mode}) uses SKILL.md`, full.includes("## Intensity"));
  ok(`getSubagentInstructions(${mode}) is the condensed form`, !sub.includes("## Intensity") && sub.includes("## The ladder"));
  ok(`getSubagentInstructions(${mode}) is materially smaller`, sub.length < full.length * 0.8, `${sub.length} vs ${full.length}`);
  ok(`getSubagentInstructions(${mode}) states what the level means`, sub.includes(`Current level: **${mode}**`));
}
ok("getLazyInstructions(garbage) degrades to full", instructions.getLazyInstructions("banana").startsWith("LAZY MODE ACTIVE — level: full"));

// Missing SKILL.md must fall back to the built-in ruleset, not throw.
const orphan = path.join(SANDBOX, "orphan-plugin");
fs.mkdirSync(orphan, { recursive: true });
fs.cpSync(HOOKS, path.join(orphan, "hooks"), { recursive: true, dereference: true });
const orphanInstructions = require(path.join(orphan, "hooks", "lazy-instructions.js"));
const fallback = orphanInstructions.getLazyInstructions("ultra");
ok("missing SKILL.md falls back cleanly", fallback.startsWith("LAZY MODE ACTIVE — level: ultra") && fallback.includes("## The ladder"));
ok("fallback carries no SKILL.md-only text", !fallback.includes("## Intensity"));
eq("missing SKILL.md still yields nothing for off", orphanInstructions.getLazyInstructions("off"), "");

// --- lazy-runtime (env is read at module load, so probe in child processes) ---

const RUNTIME_PROBE = path.join(SANDBOX, "runtime-probe.cjs");
fs.writeFileSync(RUNTIME_PROBE, `
const r = require(${JSON.stringify(path.join(HOOKS, "lazy-runtime.js"))});
const out = { isCopilot: r.isCopilot, isCodex: r.isCodex, isQoder: r.isQoder };
if (process.env.PROBE_SET) { r.setMode(process.env.PROBE_SET); out.read = r.readMode(); }
if (process.env.PROBE_WRITE) r.writeHookOutput(process.env.PROBE_EVENT, 'full', process.env.PROBE_CTX || '');
else process.stdout.write(JSON.stringify(out));
`);

function probeRuntime(env) {
  const res = spawnSync(process.execPath, [RUNTIME_PROBE], { encoding: "utf8", env: baseEnv(env), timeout: 20000 });
  return { out: res.stdout, status: res.status };
}

const rtBox = freshHome("runtime");
const codexDir = path.join(rtBox.home, "codexdata");
const copilotDir = path.join(rtBox.home, "copilotdata");
fs.mkdirSync(codexDir, { recursive: true });
fs.mkdirSync(copilotDir, { recursive: true });

function platformOf(env) {
  const { isCopilot, isCodex, isQoder } = JSON.parse(probeRuntime({ ...rtBox.env, ...env }).out);
  return isCopilot ? "copilot" : isCodex ? "codex" : isQoder ? "qoder" : "native";
}

eq("platform: bare env is native", platformOf({}), "native");
eq("platform: PLUGIN_DATA is codex", platformOf({ PLUGIN_DATA: codexDir }), "codex");
eq("platform: COPILOT_PLUGIN_DATA is copilot", platformOf({ COPILOT_PLUGIN_DATA: copilotDir }), "copilot");
eq("platform: QODER_SESSION_ID is qoder", platformOf({ QODER_SESSION_ID: "q" }), "qoder");
eq("platform: copilot beats codex", platformOf({ COPILOT_PLUGIN_DATA: copilotDir, PLUGIN_DATA: codexDir }), "copilot");
eq("platform: codex beats qoder", platformOf({ PLUGIN_DATA: codexDir, QODER_SESSION_ID: "q" }), "codex");
eq("platform: copilot beats qoder", platformOf({ COPILOT_PLUGIN_DATA: copilotDir, QODER_SESSION_ID: "q" }), "copilot");

// isVsCodeCopilotRoot is not exported; exercise it through CLAUDE_PLUGIN_ROOT.
for (const [root, expected] of [
  ["/x/.vscode/agent-plugins/lazy", "copilot"],
  ["/x/.VSCode/agent-plugins/lazy", "copilot"],
  ["C:\\Users\\me\\.vscode\\agent-plugins\\lazy", "copilot"],
  ["/x/.vscode-server/agent-plugins/lazy", "copilot"],
  ["/x/agent-plugins/lazy", "native"],
  ["/x/.vscode/plugins/lazy", "native"],
  ["/x/agent-plugins-extra/.vscode/lazy", "native"],
  ["", "native"],
]) {
  eq(`vscode-copilot root ${JSON.stringify(root)}`, platformOf({ CLAUDE_PLUGIN_ROOT: root }), expected);
}
eq("vscode root beats PLUGIN_DATA", platformOf({ CLAUDE_PLUGIN_ROOT: "/x/.vscode/agent-plugins/l", PLUGIN_DATA: codexDir }), "copilot");

function stateFileFor(env) {
  const box = freshHome("state");
  fs.mkdirSync(path.join(box.home, "codexdata"), { recursive: true });
  fs.mkdirSync(path.join(box.home, "copilotdata"), { recursive: true });
  const resolved = Object.fromEntries(Object.entries(env).map(([k, v]) =>
    [k, typeof v === "string" ? v.replace("<HOME>", box.home) : v]));
  probeRuntime({ ...box.env, ...resolved, PROBE_SET: "ultra" });
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      // Qoder appends its session id, so match the prefix rather than the exact
      // name — otherwise this sweep silently finds nothing and asserts nothing.
      else if (entry.name.startsWith(".lazy-active")) found.push(path.relative(box.home, p));
    }
  };
  walk(box.home);
  return found;
}

eq("state file: native lives in CLAUDE_CONFIG_DIR", stateFileFor({}), [path.join(".claude", ".lazy-active")]);
eq("state file: codex lives in PLUGIN_DATA", stateFileFor({ PLUGIN_DATA: "<HOME>/codexdata" }), [path.join("codexdata", ".lazy-active")]);
eq("state file: copilot lives in COPILOT_PLUGIN_DATA", stateFileFor({ COPILOT_PLUGIN_DATA: "<HOME>/copilotdata" }), [path.join("copilotdata", ".lazy-active")]);
eq("state file: vscode copilot falls back to the claude dir",
  stateFileFor({ CLAUDE_PLUGIN_ROOT: "/x/.vscode/agent-plugins/l" }), [path.join(".claude", ".lazy-active")]);
// Keyed by session id, unlike every other host: the others get a SessionStart
// event that clears the flag, and Qoder does not, so a shared file made every
// level permanent.
eq("state file: qoder lives in ~/.qoder, keyed by session",
  stateFileFor({ QODER_SESSION_ID: "q" }), [path.join(".qoder", qoderStateFile("q"))]);
// The id reaches a filename; a path separator in it must not escape the dir.
eq("state file: a qoder session id cannot escape its directory",
  stateFileFor({ QODER_SESSION_ID: "../../etc/x" }), [path.join(".qoder", qoderStateFile("../../etc/x"))]);
ok("state file: a qoder session id stays inside .qoder",
  !qoderStateFile("../../etc/x").includes("/") && !qoderStateFile("../../etc/x").includes("\\"),
  qoderStateFile("../../etc/x"));
// Sanitizing alone collided: `a/b` and `a:b` both became `a_b`, which put two
// sessions back on one file — the leak this naming exists to prevent.
ok("state file: ids that sanitize alike do not collide",
  qoderStateFile("a/b") !== qoderStateFile("a:b"), qoderStateFile("a/b"));
ok("state file: ids sharing a long prefix do not collide",
  qoderStateFile(`${"x".repeat(64)}A`) !== qoderStateFile(`${"x".repeat(64)}B`), "prefix collision");
eq("state file: the same id is always the same file", qoderStateFile("sess"), qoderStateFile("sess"));

// setMode / readMode / clearMode round-trip and read failure modes. readMode
// validates: the flag file is hand-editable, so anything that is not a level
// must reach callers as null (off) rather than verbatim.
const stateBox = freshHome("modestate");
withEnv(stateBox.env, () => {
  delete require.cache[require.resolve(path.join(HOOKS, "lazy-runtime.js"))];
  delete require.cache[require.resolve(path.join(HOOKS, "lazy-config.js"))];
  const rt = require(path.join(HOOKS, "lazy-runtime.js"));
  rt.setMode("lite");
  eq("readMode round-trips setMode", rt.readMode(), "lite");
  for (const [content, expected] of [
    ["ultra\n", "ultra"],
    ["  ULTRA  ", "ultra"],
    ["review", "review"],
    ["off", "off"],
    ["banana", null],
    ["banana; rm -rf /", null],
    ["\u001b[31mEVIL\u001b[0m", null],
    ["lite\nsecond line", null],
    ["   \n\n", null],
    ["", null],
  ]) {
    fs.writeFileSync(stateBox.flag, content);
    eq(`readMode(${JSON.stringify(content)})`, rt.readMode(), expected);
  }
  rt.setMode("ultra");
  rt.clearMode();
  eq("clearMode removes the flag", rt.readMode(), null);
  rt.clearMode();
  eq("clearMode is idempotent", rt.readMode(), null);
  fs.mkdirSync(stateBox.flag, { recursive: true });
  eq("readMode survives a directory in place of the flag", rt.readMode(), null);
  fs.rmdirSync(stateBox.flag);
  eq("readMode returns null when absent", rt.readMode(), null);
});

// writeHookOutput shape, per platform per event.
function hookOutput(env, event, ctx) {
  return probeRuntime({ ...rtBox.env, ...env, PROBE_WRITE: "1", PROBE_EVENT: event, PROBE_CTX: ctx }).out;
}
eq("native SessionStart writes raw stdout", hookOutput({}, "SessionStart", "CTX"), "CTX");
eq("native UserPromptSubmit writes raw stdout", hookOutput({}, "UserPromptSubmit", "CTX"), "CTX");
eq("native SubagentStart writes hookSpecificOutput JSON",
  JSON.parse(hookOutput({}, "SubagentStart", "CTX")),
  { hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: "CTX" } });
eq("native SubagentStart still emits JSON with empty context",
  JSON.parse(hookOutput({}, "SubagentStart", "")),
  { hookSpecificOutput: { hookEventName: "SubagentStart", additionalContext: "" } });
eq("copilot SessionStart uses bare additionalContext",
  JSON.parse(hookOutput({ COPILOT_PLUGIN_DATA: copilotDir }, "SessionStart", "CTX")), { additionalContext: "CTX" });
eq("copilot ignores non-SessionStart events",
  JSON.parse(hookOutput({ COPILOT_PLUGIN_DATA: copilotDir }, "SubagentStart", "CTX")), {});
eq("copilot emits {} for empty SessionStart context",
  JSON.parse(hookOutput({ COPILOT_PLUGIN_DATA: copilotDir }, "SessionStart", "")), {});
for (const [name, env] of [["codex", { PLUGIN_DATA: codexDir }], ["qoder", { QODER_SESSION_ID: "q" }]]) {
  for (const event of ["SessionStart", "SubagentStart", "UserPromptSubmit"]) {
    eq(`${name} ${event} uses hookSpecificOutput`, JSON.parse(hookOutput(env, event, "CTX")),
      { hookSpecificOutput: { hookEventName: event, additionalContext: "CTX" } });
  }
  eq(`${name} emits {} with no context`, JSON.parse(hookOutput(env, "SessionStart", "")), {});
}

// --- lazy-mode-tracker -------------------------------------------------------

const mt = freshHome("tracker");
function track(prompt, { flag, config: cfg, env } = {}) {
  // Qoder keeps its state in ~/.qoder, not the claude dir.
  // Qoder state is keyed by session id, so that a level set in one session does
  // not leak into the next — the same reason the file is not just .lazy-active.
  const target = env && env.QODER_SESSION_ID
    ? path.join(mt.home, ".qoder", qoderStateFile(env.QODER_SESSION_ID))
    : mt.flag;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (flag === null) fs.rmSync(target, { force: true });
  else if (flag !== undefined) fs.writeFileSync(target, flag);
  if (cfg === null) fs.rmSync(mt.config, { force: true });
  else if (cfg !== undefined) writeConfig(mt, cfg);
  const res = runHook("lazy-mode-tracker.js", typeof prompt === "string" ? prompt : JSON.stringify(prompt), { ...mt.env, ...env });
  return {
    ...res,
    flag: fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null,
    config: fs.existsSync(mt.config) ? JSON.parse(fs.readFileSync(mt.config, "utf8")) : null,
  };
}

let r = track({ prompt: "/lazy ultra" }, { flag: null, config: null });
eq("/lazy ultra sets the flag", [r.status, r.flag, r.stdout], [0, "ultra", "LAZY MODE CHANGED — level: ultra"]);
r = track({ prompt: "/LAZY LITE" });
eq("/lazy is case-insensitive", [r.flag, r.stdout], ["lite", "LAZY MODE CHANGED — level: lite"]);
r = track({ prompt: "@lazy ultra" });
eq("@lazy switches mode", r.flag, "ultra");
r = track({ prompt: "$lazy lite" });
eq("$lazy switches mode", r.flag, "lite");
r = track({ prompt: "/lazy:lazy ultra" });
eq("/lazy:lazy (namespaced) switches mode", r.flag, "ultra");
// One-shot: the review pointer goes out for this turn and the live level is
// untouched. Persisting `review` pinned every later prompt and subagent to a
// level skills/lazy-review/SKILL.md says is not a mode at all.
r = track({ prompt: "/lazy-review" });
eq("/lazy-review emits the review pointer without switching",
  [r.flag, r.stdout], ["ultra", "LAZY MODE ACTIVE — level: review. Behavior defined by /lazy-review skill."]);
r = track({ prompt: "/lazy:lazy-review" });
eq("/lazy:lazy-review does not switch either", r.flag, "ultra");
r = track({ prompt: "/lazy off" });
eq("/lazy off clears the flag", [r.flag, r.stdout], [null, "LAZY MODE OFF"]);

// `/lazy` reports what is live — never a level it did not persist.
r = track({ prompt: "/lazy" }, { flag: "ultra" });
eq("/lazy reports the live level", [r.flag, r.stdout], ["ultra", "LAZY MODE ACTIVE — level: ultra"]);
r = track({ prompt: "/lazy" }, { flag: "review" });
eq("/lazy reports review", r.stdout, "LAZY MODE ACTIVE — level: review");
r = track({ prompt: "/lazy" }, { flag: null, config: '{"defaultMode":"lite"}' });
eq("/lazy with no flag says OFF instead of claiming the default",
  [r.flag, r.stdout], [null, "LAZY MODE OFF — start with /lazy lite|full|ultra."]);
r = track({ prompt: "/lazy" }, { flag: null, config: '{"defaultMode":"off"}' });
ok("/lazy never announces ACTIVE — level: off", !r.stdout.includes("ACTIVE — level: off"));
r = track({ prompt: "/lazy" }, { flag: "banana", config: null });
eq("/lazy treats an invalid flag as off", r.stdout, "LAZY MODE OFF — start with /lazy lite|full|ultra.");

// An unrecognized level must not touch the mode.
r = track({ prompt: "/lazy utra" }, { flag: "ultra", config: '{"defaultMode":"full"}' });
eq("/lazy <typo> keeps the current mode and explains",
  [r.flag, r.stdout], ["ultra", 'LAZY: unknown level "utra" — use lite|full|ultra|off.']);
r = track({ prompt: "/lazy utra" }, { flag: "ultra", config: '{"defaultMode":"off"}' });
eq("/lazy <typo> no longer deactivates when the default is off", r.flag, "ultra");
r = track({ prompt: "/lazy UTRA" }, { flag: "ultra", config: null });
eq("/lazy <TYPO> is echoed lowercased", r.stdout, 'LAZY: unknown level "utra" — use lite|full|ultra|off.');

// Other lazy-* skills own their own dispatch: the tracker stays out of the way.
for (const other of ["/lazy-help", "/lazy-audit", "/lazy-clean", "/lazyfoo bar"]) {
  r = track({ prompt: other }, { flag: "ultra" });
  eq(`${other} is left to its own skill`, [r.status, r.stdout, r.flag], [0, "", "ultra"]);
}

// skill-dispatch envelope (#584)
r = track({ prompt: "<command-name>/lazy</command-name>\n<command-args>ultra</command-args>" }, { flag: null });
eq("command envelope switches mode", [r.flag, r.stdout], ["ultra", "LAZY MODE CHANGED — level: ultra"]);
r = track({ prompt: "<command-message>lazy</command-message>\n<command-name>lazy</command-name>\n<command-args>lite</command-args>" });
eq("command envelope with a leading message still switches", r.flag, "lite");
r = track({ prompt: "<command-name>lazy</command-name>" });
eq("command envelope with no args reports only", [r.flag, r.stdout], ["lite", "LAZY MODE ACTIVE — level: lite"]);
r = track({ prompt: "please explain <command-name>/lazy</command-name><command-args>off</command-args> to me" });
eq("mid-message envelope stays inert", [r.flag, r.stdout], ["lite", ""]);
r = track({ prompt: "<command-name>/commit</command-name><command-args>x</command-args>" });
eq("another skill's envelope is ignored", [r.flag, r.stdout], ["lite", ""]);

// deactivation
r = track({ prompt: "stop lazy" }, { flag: "ultra" });
eq("stop lazy deactivates", [r.flag, r.stdout], [null, "LAZY MODE OFF"]);
r = track({ prompt: "STOP LAZY." }, { flag: "ultra" });
eq("STOP LAZY. deactivates", [r.flag, r.stdout], [null, "LAZY MODE OFF"]);
r = track({ prompt: "normal mode" }, { flag: "ultra" });
eq("normal mode deactivates", r.flag, null);
r = track({ prompt: "add a normal mode toggle" }, { flag: "ultra" });
eq("a prompt merely containing the phrase does NOT deactivate", [r.flag, r.stdout], ["ultra", ""]);
r = track({ prompt: "fix the parser bug" }, { flag: "ultra" });
eq("an ordinary prompt is inert", [r.flag, r.stdout], ["ultra", ""]);

// malformed input never crashes and never blocks
for (const [name, payload] of [
  ["empty stdin", ""],
  ["malformed JSON", '{"prompt":'],
  ["missing prompt field", '{"session_id":"x"}'],
  ["null prompt", '{"prompt":null}'],
  ["non-string prompt", '{"prompt":{"a":1}}'],
  ["bare array payload", "[]"],
]) {
  const res = track(payload, { flag: "ultra" });
  eq(`${name} exits 0 silently and preserves the flag`, [res.status, res.stdout, res.flag], [0, "", "ultra"]);
}
r = track("\uFEFF" + JSON.stringify({ prompt: "/lazy lite" }), { flag: "ultra" });
eq("BOM-prefixed payload still parses", r.flag, "lite");

// /lazy default persists to config, session-scoped switches do not, and every
// outcome is reported — a silent no-op looked like it had worked.
r = track({ prompt: "/lazy default ultra" }, { flag: "lite", config: null });
eq("/lazy default ultra writes config", [r.config, r.stdout], [{ defaultMode: "ultra" }, "LAZY DEFAULT SET — new sessions start in ultra."]);
eq("/lazy default does not change the session mode", r.flag, "lite");
r = track({ prompt: "/lazy full" }, { config: null });
eq("a plain switch does not write config", r.config, null);
r = track({ prompt: "/lazy default review" }, { flag: "lite", config: null });
eq("/lazy default review is rejected, with a reason",
  [r.config, r.flag, r.stdout], [null, "lite", 'LAZY: "review" is not one of off|lite|full|ultra.']);
r = track({ prompt: "/lazy default zzz" }, { config: null });
eq("/lazy default <garbage> says why", r.stdout, 'LAZY: "zzz" is not one of off|lite|full|ultra.');
r = track({ prompt: "/lazy default" }, { config: null });
eq("bare /lazy default asks for a level", r.stdout, "LAZY: a default level is required — one of off|lite|full|ultra.");
r = track({ prompt: "/lazy default off" }, { config: null });
eq("/lazy default off is accepted", r.config, { defaultMode: "off" });

// A failed config write is reported rather than silently dropped.
const blocked = path.join(SANDBOX, "blocked-config");
fs.writeFileSync(blocked, "");
r = track({ prompt: "/lazy default ultra" }, { flag: "ultra", env: { XDG_CONFIG_HOME: blocked } });
ok("a failing writeDefaultMode reports the error",
  r.status === 0 && r.stdout.startsWith("LAZY: could not write the default (") && r.stdout.includes("ENOTDIR"), r.stdout);
eq("a failing writeDefaultMode leaves the session mode alone", r.flag, "ultra");

// Qoder does double duty on UserPromptSubmit (no SessionStart event there).
const qoder = { QODER_SESSION_ID: "q" };
r = track({ prompt: "hello" }, { flag: null, config: null, env: qoder });
eq("qoder activates the default on the first prompt", r.flag, "full");
ok("qoder injects the ruleset as hookSpecificOutput",
  JSON.parse(r.stdout).hookSpecificOutput.additionalContext.startsWith("LAZY MODE ACTIVE — level: full"));
// The report-only notice used to be computed before the initialization above,
// so one message said OFF and ACTIVE at once — and still wrote the flag.
r = track({ prompt: "/lazy" }, { flag: null, config: null, env: qoder });
const bare = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
ok("qoder reports the level a bare /lazy just initialized",
  bare.startsWith("LAZY MODE ACTIVE — level: full") && !bare.includes("LAZY MODE OFF"), bare.slice(0, 120));
eq("a bare /lazy on qoder still initializes the flag", r.flag, "full");
r = track({ prompt: "/lazy" }, { flag: null, config: null, env: { ...qoder, LAZY_DEFAULT_MODE: "off" } });
eq("a bare /lazy with an off default reports off and writes nothing",
  [r.flag, JSON.parse(r.stdout).hookSpecificOutput.additionalContext],
  [null, "LAZY MODE OFF — start with /lazy lite|full|ultra."]);

// `/lazy default` changes what LATER sessions start at. Qoder's initializer
// above reads the default to pick the live level, so writing a new one used to
// announce "new sessions start in ultra" and start ultra in this one.
r = track({ prompt: "/lazy default ultra" }, { flag: null, config: JSON.stringify({ defaultMode: "off" }), env: qoder });
eq("/lazy default on qoder records the new default", r.config, { defaultMode: "ultra" });
// Explicitly `off`, not absent: absent means "derive from the default", which
// is the value this very command just changed, so the next prompt would have
// activated ultra. Pinning off is what makes the answer survive the turn.
eq("/lazy default on qoder does not activate it in this session", r.flag, "off");
eq("/lazy default on qoder says only that new sessions are affected",
  JSON.parse(r.stdout).hookSpecificOutput.additionalContext,
  "LAZY DEFAULT SET — new sessions start in ultra.");
// The session was already running at the old default: it keeps that level, and
// keeps receiving that ruleset, rather than jumping to the new one.
r = track({ prompt: "/lazy default off" }, { flag: null, config: JSON.stringify({ defaultMode: "lite" }), env: qoder });
eq("/lazy default off on qoder leaves this session at the level it had", r.flag, "lite");
ok("/lazy default off on qoder still injects the live ruleset",
  parses(r.stdout) &&
  JSON.parse(r.stdout).hookSpecificOutput.additionalContext
    .startsWith("LAZY DEFAULT SET — new sessions start in off."),
  r.stdout.slice(0, 160));

// LAZY_DEFAULT_MODE outranks the config file getDefaultMode() reads, so the
// write lands and changes nothing anyone will see. Claiming success there is
// simply false.
r = track({ prompt: "/lazy default ultra" },
  { config: null, env: { LAZY_DEFAULT_MODE: "lite" } });
eq("/lazy default still records the request when the env shadows it", r.config, { defaultMode: "ultra" });
ok("/lazy default reports the env override instead of claiming success",
  /LAZY_DEFAULT_MODE=lite overrides it/.test(r.stdout) && !/LAZY DEFAULT SET/.test(r.stdout), r.stdout);
r = track({ prompt: "/lazy default ultra" }, { config: null, env: { LAZY_DEFAULT_MODE: "ultra" } });
ok("an env override that agrees is not reported as a conflict",
  /LAZY DEFAULT SET/.test(r.stdout), r.stdout);

// Session state is never deleted by age: a Qoder session open or resumed past
// any age still owns its level, so mtime is not a liveness signal. Pruning by it
// meant another session's write silently reset a live one to the default.
{
  const box = freshHome("qoder-longlived");
  const stale = path.join(box.home, ".qoder", ".lazy-active-longlived");
  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.writeFileSync(stale, "ultra");
  const monthAgo = Date.now() / 1000 - 30 * 24 * 60 * 60;
  fs.utimesSync(stale, monthAgo, monthAgo);
  runHook("lazy-mode-tracker.js", JSON.stringify({ prompt: "/lazy lite" }),
    { ...box.env, QODER_SESSION_ID: "other" });
  ok("another session's write leaves long-lived session state alone",
    fs.existsSync(stale) && fs.readFileSync(stale, "utf8") === "ultra",
    fs.existsSync(stale) ? fs.readFileSync(stale, "utf8") : "<deleted>");
}

// Qoder has no SessionStart, so nothing clears its flag at a session boundary:
// the level pinned by `/lazy default` stayed pinned for every later session,
// which is the opposite of what the command promises.
{
  const box = freshHome("qoder-session-scope");
  const cfg = path.join(box.env.XDG_CONFIG_HOME, "lazy", "config.json");
  fs.mkdirSync(path.dirname(cfg), { recursive: true });
  fs.writeFileSync(cfg, JSON.stringify({ defaultMode: "off" }));
  const inSession = (id, prompt) => runHook("lazy-mode-tracker.js", JSON.stringify({ prompt }),
    { ...box.env, QODER_SESSION_ID: id });
  const stateOf = (id) => {
    const file = path.join(box.home, ".qoder", qoderStateFile(id));
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  };
  inSession("sessionA", "/lazy default ultra");
  eq("the pin is scoped to the session that ran the command", stateOf("sessionA"), "off");
  const later = inSession("sessionB", "hello");
  ok("a later qoder session adopts the new default",
    /LAZY MODE ACTIVE — level: ultra/.test(later.stdout), later.stdout.slice(0, 160));
  eq("the later session pins its own state", stateOf("sessionB"), "ultra");
}

// The state directory and the config directory fail independently here too, and
// the pin has to happen BEFORE the default moves: pinning afterwards left a
// failed pin with the new default already written for the next prompt to adopt.
const qoderBlocked = freshHome("qoder-blocked-pin");
fs.writeFileSync(path.join(qoderBlocked.home, ".qoder"), "");   // a file where the dir must go
r = track({ prompt: "/lazy default ultra" },
  { flag: undefined, config: JSON.stringify({ defaultMode: "lite" }), env: { ...qoder, HOME: qoderBlocked.home } });
ok("a failed qoder pin reports the failure",
  /could not pin the current level/.test(JSON.parse(r.stdout).hookSpecificOutput.additionalContext),
  r.stdout.slice(0, 200));
ok("a failed qoder pin does not claim the default was set",
  !/LAZY DEFAULT SET/.test(JSON.parse(r.stdout).hookSpecificOutput.additionalContext),
  r.stdout.slice(0, 200));
eq("a failed qoder pin leaves the stored default alone", r.config, { defaultMode: "lite" });

// One invocation is not the test: the leak showed up on the NEXT prompt, which
// re-derived the level from the default the command had already replaced.
r = track({ prompt: "fix the parser" }, { flag: "off", config: JSON.stringify({ defaultMode: "ultra" }), env: qoder });
eq("a pinned off survives later prompts on qoder", [r.flag, r.stdout], ["off", ""]);

r = track({ prompt: "/lazy ultra" }, { env: qoder });
ok("qoder folds the switch confirmation into one JSON write",
  parses(r.stdout) &&
  JSON.parse(r.stdout).hookSpecificOutput.additionalContext
    .startsWith("LAZY MODE CHANGED — level: ultra\n\nLAZY MODE ACTIVE — level: ultra"));
// `/lazy-review` is one-shot: skills/lazy-review/SKILL.md says "it sets no
// mode, so there is nothing to revert", and persisting `review` pinned every
// later prompt and subagent to a level with no documented way back.
{
  const before = track({ prompt: "/lazy ultra" }, { flag: null });
  eq("the live level before /lazy-review", before.flag, "ultra");
  const review = track({ prompt: "/lazy-review" }, { flag: before.flag });
  eq("/lazy-review leaves the live level alone", review.flag, "ultra");
  eq("/lazy-review still emits the review pointer for this turn",
    review.stdout, "LAZY MODE ACTIVE — level: review. Behavior defined by /lazy-review skill.");
  const after = track({ prompt: "/lazy" }, { flag: review.flag });
  eq("a bare /lazy after /lazy-review reports the real level, not review",
    after.stdout, "LAZY MODE ACTIVE — level: ultra");
}

// A deactivation that could not be written must NOT claim it worked. Both
// writes swallow their own failures, so the state is read back rather than
// assumed. A directory where the state file goes fails every write, for root
// too — permission bits alone do not reproduce this when the suite runs as root.
{
  const box = freshHome("qoder-off-unwritable");
  const state = path.join(box.home, ".qoder", qoderStateFile("s-unwritable"));
  fs.mkdirSync(path.dirname(state), { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  fs.mkdirSync(path.join(box.env.XDG_CONFIG_HOME, "lazy"), { recursive: true });
  fs.writeFileSync(path.join(box.env.XDG_CONFIG_HOME, "lazy", "config.json"), JSON.stringify({ defaultMode: "full" }));
  const res = runHook("lazy-mode-tracker.js", JSON.stringify({ prompt: "/lazy off" }),
    { ...box.env, QODER_SESSION_ID: "s-unwritable" });
  const context = parses(res.stdout) ? JSON.parse(res.stdout).hookSpecificOutput.additionalContext : "";
  ok("a failed deactivation reports the failure", /could not turn lazy off/.test(context), context.slice(0, 160));
  ok("a failed deactivation does not claim LAZY MODE OFF", !/^LAZY MODE OFF/.test(context), context.slice(0, 160));
  ok("a failed deactivation admits lazy is still active", /still active/.test(context), context.slice(0, 160));
}

r = track({ prompt: "stop lazy" }, { env: qoder });
// `off` is written, not cleared. On Claude Code and Codex an absent flag IS
// off, because lazy-activate.js rewrites it at SessionStart. Qoder has no
// SessionStart and derives the level from the config default whenever no flag
// exists, so absent meant BOTH "turned off" and "not started yet" — and the
// next prompt re-derived the default and turned lazy back on.
eq("qoder emits no ruleset after deactivation", [r.flag, JSON.parse(r.stdout)],
  ["off", { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "LAZY MODE OFF" } }]);

// The leak this closes, in the order it happens: off, then an ordinary prompt,
// then `/lazy default`, then another ordinary prompt. Every step must stay off.
{
  const box = { flag: null, config: JSON.stringify({ defaultMode: "full" }), env: qoder };
  let step = track({ prompt: "/lazy off" }, box);
  eq("qoder /lazy off records an explicit off", step.flag, "off");
  step = track({ prompt: "fix the parser" }, { ...box, flag: step.flag });
  eq("qoder stays off on the next ordinary prompt", [step.flag, step.stdout], ["off", ""]);
  step = track({ prompt: "/lazy default ultra" }, { ...box, flag: step.flag });
  ok("qoder /lazy default does not re-enable an off session",
    step.flag === "off" && !/# Lazy/.test(step.stdout), JSON.stringify([step.flag, step.stdout.slice(0, 120)]));
  step = track({ prompt: "fix the parser" }, { ...box, flag: step.flag, config: JSON.stringify({ defaultMode: "ultra" }) });
  eq("qoder stays off after the default moved", [step.flag, step.stdout], ["off", ""]);
  step = track({ prompt: "/lazy full" }, { ...box, flag: step.flag });
  eq("qoder can be switched back on after an explicit off", step.flag, "full");
}

// One JSON object per invocation. Every branch used to write its own, and the
// Qoder ruleset block then wrote a second, so stdout carried two concatenated
// top-level objects and Qoder could parse neither.
for (const [name, prompt] of [
  ["report-only /lazy", "/lazy"],
  ["/lazy <typo>", "/lazy utra"],
  ["/lazy default ultra", "/lazy default ultra"],
  ["/lazy default review", "/lazy default review"],
]) {
  const res = track({ prompt }, { flag: "ultra", config: null, env: qoder });
  ok(`qoder emits one JSON object for ${name}`, parses(res.stdout), res.stdout.slice(0, 120));
}

// --- lazy-subagent -----------------------------------------------------------

const sa = freshHome("subagent");
function subagent(payload, { flag, matcher } = {}) {
  if (flag === null) fs.rmSync(sa.flag, { force: true });
  else if (flag !== undefined) fs.writeFileSync(sa.flag, flag);
  const env = { ...sa.env };
  if (matcher !== undefined) env.LAZY_SUBAGENT_MATCHER = matcher;
  return runHook("lazy-subagent.js", payload, env);
}
const injected = (res) => res.stdout.length > 0 && JSON.parse(res.stdout).hookSpecificOutput.hookEventName === "SubagentStart";

let s = subagent('{"agent_type":"general-purpose"}', { flag: null });
eq("no flag: inject nothing", [s.status, s.stdout], [0, ""]);
s = subagent('{"agent_type":"general-purpose"}', { flag: "off" });
eq("flag=off: inject nothing", [s.status, s.stdout], [0, ""]);
s = subagent('{"agent_type":"general-purpose"}', { flag: "banana" });
eq("an invalid flag reads as off, so nothing is injected", [s.status, s.stdout], [0, ""]);
s = subagent('{"agent_type":"general-purpose"}', { flag: "ultra" });
ok("no matcher: inject into every subagent", injected(s));
ok("subagent payload is the condensed ruleset",
  JSON.parse(s.stdout).hookSpecificOutput.additionalContext.includes("Current level: **ultra**"));
s = subagent('{"agent_type":"general-purpose"}', { flag: "review" });
eq("flag=review injects the pointer",
  JSON.parse(s.stdout).hookSpecificOutput.additionalContext,
  "LAZY MODE ACTIVE — level: review. Behavior defined by /lazy-review skill.");
s = subagent('{"agent_type":"general-purpose"}', { flag: "  ULTRA  " });
ok("a padded/uppercased flag is normalized before use",
  JSON.parse(s.stdout).hookSpecificOutput.additionalContext.includes("Current level: **ultra**"));

s = subagent('{"agent_type":"general-purpose"}', { flag: "ultra", matcher: "general" });
ok("matcher: unanchored substring matches", injected(s));
s = subagent('{"agent_type":"general-purpose"}', { matcher: "GENERAL" });
ok("matcher is case-insensitive", injected(s));
s = subagent('{"agent_type":"general-purpose"}', { matcher: "^general-purpose$" });
ok("matcher: anchored exact match", injected(s));
s = subagent('{"agent_type":"explore"}', { matcher: "explore|general" });
ok("matcher: alternation", injected(s));
s = subagent('{"agent_type":"general-purpose"}', { matcher: "^explore$" });
eq("matcher: definite mismatch skips injection", [s.status, s.stdout], [0, ""]);
for (const [name, payload] of [
  ["missing agent_type", '{"session_id":"x"}'],
  ["empty agent_type", '{"agent_type":""}'],
  ["malformed JSON", "{oops"],
  ["empty stdin", ""],
]) {
  s = subagent(payload, { matcher: "^explore$" });
  ok(`matcher fails open on ${name}`, injected(s));
}
s = subagent('{"agent_type":"anything"}', { matcher: "[unclosed" });
ok("an invalid matcher regex is treated as unset (and never crashes)", injected(s) && s.status === 0);
s = subagent('{"agent_type":"zzz"}', { matcher: "" });
ok("an empty matcher means no matcher", injected(s));

// --- edit-check --------------------------------------------------------------

const files = path.join(SANDBOX, "files");
fs.mkdirSync(files, { recursive: true });
const TS_SLOP = 'export function f(v: any) { return v as unknown as string; }\nconst n: string = "claude";\n';
const JS_SLOP = 'vi.mock("./db");\nconst x = Reflect.get(o, k);\n';
const write = (name, body) => { const p = path.join(files, name); fs.writeFileSync(p, body); return p; };
const dirtyTs = write("dirty.ts", TS_SLOP);
const cleanTs = write("clean.ts", "export const add = (a: number, b: number): number => a + b;\n");
const bigTs = write("many.ts", "const x: any = 1;\n".repeat(3000));

function editCheck(payload) {
  return runHook("edit-check.js", typeof payload === "string" ? payload : JSON.stringify(payload));
}
const toolPayload = (file, extra = {}) => ({ tool_name: "Write", tool_input: { file_path: file, ...extra } });
const contextOf = (res) => JSON.parse(res.stdout).hookSpecificOutput.additionalContext;

let e = editCheck(toolPayload(dirtyTs));
eq("edit-check exits 0 on findings", e.status, 0);
const parsed = e.stdout ? JSON.parse(e.stdout) : null;
ok("edit-check emits PostToolUse hookSpecificOutput", parsed && parsed.hookSpecificOutput.hookEventName === "PostToolUse");
ok("edit-check surfaces findings as additionalContext",
  parsed && parsed.hookSpecificOutput.additionalContext.startsWith("slop-check findings for the lines you just wrote"));
ok("edit-check never blocks (no decision/permission field)",
  parsed && !("decision" in parsed) && !("permissionDecision" in parsed.hookSpecificOutput));

for (const [name, payload] of [
  ["clean file", toolPayload(cleanTs)],
  ["unknown extension", toolPayload(write("notes.md", "# hi\n"))],
  ["no extension", toolPayload(path.join(files, "Makefile"))],
  ["nonexistent file", toolPayload(path.join(files, "nope.ts"))],
  ["a .d.ts declaration file", toolPayload(write("types.d.ts", TS_SLOP))],
  ["missing file_path", { tool_input: {} }],
  ["missing tool_input", { tool_name: "Edit" }],
  ["null file_path", { tool_input: { file_path: null } }],
  ["malformed JSON", "{oops"],
  ["empty stdin", ""],
]) {
  const res = editCheck(payload);
  eq(`edit-check stays silent + exit 0 on ${name}`, [res.status, res.stdout], [0, ""]);
}
for (const ext of ["ts", "tsx", "mts", "cts"]) {
  const res = editCheck(toolPayload(write(`dirty.${ext}`, TS_SLOP)));
  ok(`edit-check applies TypeScript rules to .${ext}`, res.status === 0 && res.stdout.includes("no-any"));
}
for (const ext of ["js", "jsx", "mjs", "cjs"]) {
  const res = editCheck(toolPayload(write(`slop.${ext}`, JS_SLOP)));
  ok(`edit-check checks .${ext}`, res.status === 0 && res.stdout.includes("no-reflect"));
}

// A case-insensitive filesystem hands the hook PROBE.TS; the hook lowercases the
// extension, and so must the checker, or it silently scans nothing.
const upperTs = write("PROBE.TS", JS_SLOP + TS_SLOP);
e = editCheck(toolPayload(upperTs));
ok("an uppercase .TS file is scanned at all", e.status === 0 && e.stdout.includes("no-reflect"));
// Both collectFiles and lintSource lowercase the extension; when only the
// first did, PROBE.TS was scanned but linted as JavaScript, silently skipping
// every TypeScript-only rule.
ok("an uppercase .TS file gets the TypeScript rules", e.stdout.includes("no-any"));

// Only the lines this tool call wrote are reported.
const ranges = write("ranges.ts", "const ok = 1;\nconst bad: any = 2;\nconst also: any = 3;\nconst more: any = 4;\n");
e = editCheck({ tool_name: "Edit", tool_input: { file_path: ranges, old_string: "x", new_string: "const bad: any = 2;" } });
const scoped = contextOf(e);
ok("an Edit reports the findings it wrote", scoped.includes("ranges.ts:2"));
ok("an Edit does not report findings far from the edit", !scoped.includes("ranges.ts:4"));
// The hook cannot prove pre-existence, so it must not tell the agent the rest
// of the file predates the edit — that reads as "leave your own slop alone".
ok("an Edit counts the rest of the file without claiming it predates the edit",
  /further findings? elsewhere in this file, not attributed to this edit/.test(scoped) &&
  !/predate|leave them alone/.test(scoped), scoped);

// D: block rules report at the `catch`, several lines above the line the edit
// wrote. With one line of headroom the whole report was suppressed.
const blockTs = write("block.ts",
  "export function run() {\n  try {\n    work();\n  } catch (e) {\n    console.log(e);\n    throw e;\n  }\n}\n");
e = editCheck({ tool_name: "Edit", tool_input: { file_path: blockTs, old_string: "x", new_string: "    throw e;" } });
ok("an Edit inside a catch block reports the block finding it created",
  e.stdout.includes("block.ts:4") && e.stdout.includes("no-log-and-rethrow"), e.stdout);

// A block rule reports at the keyword that opens the block; the body can sit
// arbitrarily far below it, which a fixed line offset cannot follow.
const spacedTs = write("spaced.ts",
  "export function run() {\n  try {\n    work();\n  } catch (e) {\n\n\n\n\n    return null;\n  }\n}\n");
e = editCheck({ tool_name: "Edit", tool_input: { file_path: spacedTs, old_string: "x", new_string: "    return null;" } });
ok("an Edit deep inside a catch block still reports the block finding it created",
  e.stdout.includes("spaced.ts:4") && e.stdout.includes("no-catch-fake-success"), e.stdout);

// The comment rules carry no span: a multi-line JSDoc still reports at its
// `/**`, so the headroom above the written line is what surfaces it.
const jsdocTs = write("jsdoc.ts",
  "/**\n * Combine two numbers.\n * @param {number} a first\n */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n");
e = editCheck({ tool_name: "Edit", tool_input: { file_path: jsdocTs, old_string: "x", new_string: " * @param {number} a first" } });
ok("an Edit inside a multi-line comment still reports the comment finding",
  e.stdout.includes("jsdoc.ts:1") && e.stdout.includes("no-typed-jsdoc"), e.stdout);

// F: "line\n".split("\n").length is 2, so a one-line edit used to claim the
// line below it and report a pre-existing finding as the agent's own.
const trailingTs = write("trailing.ts", "const ok = 1;\nconst mid = 2;\nconst bad: any = 3;\n");
e = editCheck({ tool_name: "Edit", tool_input: { file_path: trailingTs, old_string: "x", new_string: "const ok = 1;\n" } });
eq("a trailing newline does not stretch the edit onto the next lines", e.stdout, "");
e = editCheck({ tool_name: "Edit", tool_input: { file_path: ranges, old_string: "x", new_string: "NOT IN THE FILE" } });
ok("an unlocatable edit falls back to the whole file",
  contextOf(e).includes("ranges.ts:2") && contextOf(e).includes("ranges.ts:4"));
e = editCheck(toolPayload(ranges));
ok("a Write reports the whole file",
  contextOf(e).includes("ranges.ts:2") && contextOf(e).includes("ranges.ts:4"));

// A slop-heavy Write used to inject 400KB of additionalContext — roughly 100k
// tokens of context for one edit. The list is capped and says what it dropped.
e = editCheck(toolPayload(bigTs));
ok("a findings-heavy file produces one complete JSON object on a normal EOF",
  e.status === 0 && parses(e.stdout));
ok("a findings-heavy file has its finding list capped",
  contextOf(e).length < 20000, String(contextOf(e).length));
ok("the cap says how many findings it dropped",
  /\(\d+ more on these lines, not listed\.\)/.test(contextOf(e)), contextOf(e).slice(-200));

// --- .opencode plugin --------------------------------------------------------

// The mode writes used to be unguarded, so an unwritable config directory threw
// out of the plugin and into OpenCode's hook runner.
const ocBox = freshHome("opencode");
const blockedConfigDir = path.join(SANDBOX, "blocked-opencode");
fs.writeFileSync(blockedConfigDir, "");
function opencodeCommand(commandArguments, configHome = blockedConfigDir) {
  const source = `
    import plugin from ${JSON.stringify(pathToFileURL(path.join(ROOT, ".opencode", "plugins", "lazy.mjs")).href)};
    const logs = [];
    const hooks = await plugin({ client: { app: { log: async ({ body }) => { logs.push(body); } } } });
    await hooks["command.execute.before"]({ command: "lazy", arguments: ${JSON.stringify(commandArguments)} });
    process.stdout.write(JSON.stringify(logs));
  `;
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    encoding: "utf8",
    env: baseEnv({ ...ocBox.env, XDG_CONFIG_HOME: configHome }),
    timeout: 20000,
  });
  return { status: res.status, logs: res.stdout ? JSON.parse(res.stdout) : null, stderr: res.stderr || "" };
}
for (const [name, args] of [["a mode switch", "ultra"], ["/lazy default", "default ultra"]]) {
  const res = opencodeCommand(args);
  ok(`opencode survives an unwritable config on ${name}`, res.status === 0, res.stderr.slice(0, 200));
  ok(`opencode logs the failed write on ${name}`,
    Array.isArray(res.logs) && res.logs.some((l) => l.level === "error" && /could not/.test(l.message)),
    JSON.stringify(res.logs));
}

// A bare `/lazy` reports; it must not overwrite the live level with the default.
const ocLive = freshHome("opencode-live");
const ocState = path.join(ocLive.env.XDG_CONFIG_HOME, "opencode", ".lazy-active");
fs.mkdirSync(path.dirname(ocState), { recursive: true });
fs.writeFileSync(ocState, "lite");
const bareLazy = opencodeCommand("", ocLive.env.XDG_CONFIG_HOME);
eq("a bare /lazy reports the live level", bareLazy.logs, [{ service: "lazy", level: "info", message: "lazy lite" }]);
eq("a bare /lazy leaves the live level alone", fs.readFileSync(ocState, "utf8"), "lite");

// client.app.log is asynchronous, so try/catch covers only a synchronous throw.
// A rejection nobody observes is an unhandled rejection, which can take the
// plugin host down over a log line.
{
  const rejecting = `
    import plugin from ${JSON.stringify(pathToFileURL(path.join(ROOT, ".opencode", "plugins", "lazy.mjs")).href)};
    process.on("unhandledRejection", (e) => { process.stdout.write("UNHANDLED:" + e); process.exit(3); });
    const hooks = await plugin({ client: { app: { log: async () => { throw new Error("connection closed"); } } } });
    await hooks["command.execute.before"]({ command: "lazy", arguments: "default ultra" });
    await new Promise((r) => setTimeout(r, 50));
    process.stdout.write("SURVIVED");
  `;
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", rejecting],
    { encoding: "utf8", env: baseEnv(freshHome("opencode-log-reject").env), timeout: 20000 });
  ok("a rejecting OpenCode log does not become an unhandled rejection",
    res.status === 0 && res.stdout.includes("SURVIVED"), `${res.status} ${res.stdout.slice(0, 120)}`);
}

// readMode() falls back to the default for an EMPTY or invalid state file just
// as it does for a missing one, so neither holds a level of its own: the chat
// follows the new default and the file is left exactly as it was found.
for (const [name, body] of [["an empty", ""], ["an invalid", "nonsense"]]) {
  const box = freshHome(`opencode-${name.replace(/\W/gu, "")}-state`);
  fs.mkdirSync(path.join(box.env.XDG_CONFIG_HOME, "lazy"), { recursive: true });
  fs.writeFileSync(path.join(box.env.XDG_CONFIG_HOME, "lazy", "config.json"), JSON.stringify({ defaultMode: "lite" }));
  const state = path.join(box.env.XDG_CONFIG_HOME, "opencode", ".lazy-active");
  fs.mkdirSync(path.dirname(state), { recursive: true });
  fs.writeFileSync(state, body);
  const res = opencodeCommand("default ultra", box.env.XDG_CONFIG_HOME);
  eq(`/lazy default leaves ${name} state file untouched`, fs.readFileSync(state, "utf8"), body);
  ok(`/lazy default reports that ${name} state file follows the new default`,
    Array.isArray(res.logs) && res.logs.some((l) => /follows the new default/.test(l.message)),
    JSON.stringify(res.logs));
}
// A valid level is the user's choice for this session and is left alone.
{
  const box = freshHome("opencode-valid-state");
  const state = path.join(box.env.XDG_CONFIG_HOME, "opencode", ".lazy-active");
  fs.mkdirSync(path.dirname(state), { recursive: true });
  fs.writeFileSync(state, "ultra");
  opencodeCommand("default lite", box.env.XDG_CONFIG_HOME);
  eq("/lazy default leaves a valid session level alone", fs.readFileSync(state, "utf8"), "ultra");
}

// `/lazy default` is about later sessions. With no state file, readMode()
// derives the live level from the config default, so `/lazy default off` used
// to switch the running session off as a side effect.
const ocDefault = freshHome("opencode-default");
const ocDefaultState = path.join(ocDefault.env.XDG_CONFIG_HOME, "opencode", ".lazy-active");
fs.mkdirSync(path.join(ocDefault.env.XDG_CONFIG_HOME, "lazy"), { recursive: true });
fs.writeFileSync(path.join(ocDefault.env.XDG_CONFIG_HOME, "lazy", "config.json"), JSON.stringify({ defaultMode: "ultra" }));
const ocDefaultOff = opencodeCommand("default off", ocDefault.env.XDG_CONFIG_HOME);
ok("/lazy default off records the new default",
  Array.isArray(ocDefaultOff.logs) && ocDefaultOff.logs.some((l) => l.message.startsWith("lazy default off")),
  JSON.stringify(ocDefaultOff.logs));
// statePath is ONE global file and OpenCode gives the plugin no session-start
// event to clear it, so pinning the live level here would outlive the session
// and shadow the default from then on. The Claude hook can pin because
// lazy-activate.js rewrites the flag at SessionStart; this one cannot.
ok("/lazy default writes no global state file to pin the session",
  !fs.existsSync(ocDefaultState),
  fs.existsSync(ocDefaultState) ? fs.readFileSync(ocDefaultState, "utf8") : "<no state file>");
ok("/lazy default says the chat follows the new default",
  ocDefaultOff.logs.some((l) => /follows the new default/.test(l.message)),
  JSON.stringify(ocDefaultOff.logs));

// The finding this replaced the pin over: with a pin, a LATER session read the
// pinned old level instead of the default just set, so the command never took
// effect anywhere.
{
  const box = freshHome("opencode-later-session");
  fs.mkdirSync(path.join(box.env.XDG_CONFIG_HOME, "lazy"), { recursive: true });
  fs.writeFileSync(path.join(box.env.XDG_CONFIG_HOME, "lazy", "config.json"), JSON.stringify({ defaultMode: "full" }));
  opencodeCommand("default ultra", box.env.XDG_CONFIG_HOME);
  const later = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import plugin from ${JSON.stringify(pathToFileURL(path.join(ROOT, ".opencode", "plugins", "lazy.mjs")).href)};
    const hooks = await plugin({ client: { app: { log: async () => {} } } });
    const out = { system: [] };
    await hooks["experimental.chat.system.transform"]({}, out);
    console.log(JSON.stringify(out.system.join("\\n")));
  `], { encoding: "utf8", env: baseEnv(box.env), timeout: 20000 });
  const injected = later.status === 0 ? JSON.parse(later.stdout.trim()) : "";
  ok("a later OpenCode session starts at the newly saved default",
    /level: ultra/.test(injected) && !/level: full/.test(injected),
    later.stderr.slice(0, 200) || injected.slice(0, 200));
}

// The config directory and the state directory fail independently. A failed
// config write must leave NO state file behind: readMode() prefers that file,
// so one written here would outrank config and environment from then on, while
// the command reported that nothing was saved.
const ocBlockedPin = freshHome("opencode-blocked-config");
const ocBlockedState = path.join(ocBlockedPin.env.XDG_CONFIG_HOME, "opencode", ".lazy-active");
// A file where the config directory has to go: mkdir fails, the state dir does not.
fs.writeFileSync(path.join(ocBlockedPin.env.XDG_CONFIG_HOME, "lazy"), "");
const ocPinFail = opencodeCommand("default ultra", ocBlockedPin.env.XDG_CONFIG_HOME);
ok("a failed default write is reported",
  Array.isArray(ocPinFail.logs) && ocPinFail.logs.some((l) => l.level === "error" && /could not write the default/.test(l.message)),
  JSON.stringify(ocPinFail.logs));
ok("a failed default write does not report the default as set",
  Array.isArray(ocPinFail.logs) && !ocPinFail.logs.some((l) => /^lazy default /.test(l.message)),
  JSON.stringify(ocPinFail.logs));
ok("a failed default write leaves no state file behind",
  !fs.existsSync(ocBlockedState),
  fs.existsSync(ocBlockedState) ? fs.readFileSync(ocBlockedState, "utf8") : "<no state file>");

// An explicit level is the user's choice for this session; leave it be.
const ocPinned = freshHome("opencode-pinned");
const ocPinnedState = path.join(ocPinned.env.XDG_CONFIG_HOME, "opencode", ".lazy-active");
fs.mkdirSync(path.dirname(ocPinnedState), { recursive: true });
fs.writeFileSync(ocPinnedState, "lite");
const ocHeld = opencodeCommand("default ultra", ocPinned.env.XDG_CONFIG_HOME);
eq("/lazy default does not overwrite an explicit session level", fs.readFileSync(ocPinnedState, "utf8"), "lite");
ok("/lazy default does not claim to move a chat holding its own level",
  Array.isArray(ocHeld.logs) && ocHeld.logs.some((l) => l.message === "lazy default ultra"),
  JSON.stringify(ocHeld.logs));

// A file whose name starts with `-` is an unknown option to the checker, which
// exits 2 — so the hook reported nothing for a file the CLI can scan after `--`.
{
  // The RELATIVE name, with cwd set: an absolute path never starts with `-`, so
  // passing one would test nothing.
  write("-dash.ts", "const value: any = 1;\n");
  const res = runHook("edit-check.js",
    JSON.stringify({ tool_name: "Edit", tool_input: { file_path: "-dash.ts", new_string: "const value: any = 1;" } }),
    {}, { cwd: files });
  ok("a dash-leading filename still reports findings through the hook",
    res.stdout.includes("no-any"), res.stdout.slice(0, 200) || "<no output>");
}

// One drift guard over every command template, not just /lazy: the help card
// carried the same stale claim that an omitted level means full, which sent the
// agent to work at full while the transform injected the persisted level. Both
// patterns are negative, so rewording the report sentence stays free.
{
  const { parseCommandFile } = require(path.join(ROOT, ".opencode", "plugins", "lazy-frontmatter.cjs"));
  const commandDir = path.join(ROOT, ".opencode", "command");
  for (const file of fs.readdirSync(commandDir).filter((name) => name.endsWith(".md"))) {
    const { template } = parseCommandFile(path.join(commandDir, file));
    const fallback = template.match(/\b(?:no|without|absent|bare)\b[^.;]*\b(?:use|defaults? to|means|assume)\s+(?:lite|full|ultra|off)\b/i);
    ok(`${file} names no level for a bare /lazy`, !fallback, fallback && fallback[0]);
    const equated = template.match(/\/lazy\s*\((?:lite|full|ultra|off)\b/i);
    ok(`${file} does not equate a bare /lazy with a level`, !equated, equated && equated[0]);
  }
  // Provenance is the one claim in these templates that can mislead a reader
  // about this package rather than merely about a level: the benchmark figures
  // are upstream's and were never reproduced here. The skill body said so and
  // the OpenCode template did not, so the same command answered differently
  // depending on the host.
  const gain = parseCommandFile(path.join(commandDir, "lazy-gain.md")).template;
  ok("the OpenCode gain card attributes the figures upstream", /\bupstream\b/i.test(gain), gain.slice(0, 200));
  ok("the OpenCode gain card says they are not reproduced here",
    /\bnot been reproduced\b/i.test(gain), gain.slice(0, 200));

  // The template and the plugin answer the same command, so they must not
  // contradict each other about what `/lazy default` does to the CURRENT chat.
  // The plugin stopped pinning the live level, so a chat holding no level of
  // its own now follows the new default -- and the template still said to keep
  // working at the old one.
  const lazyTemplate = parseCommandFile(path.join(commandDir, "lazy.md")).template;
  ok("the /lazy template does not promise the current chat is unchanged",
    !/keep working at the level already active/i.test(lazyTemplate)
      && !/do NOT switch anything/i.test(lazyTemplate),
    lazyTemplate.slice(0, 300));
  ok("the /lazy template names the follows-the-default case the plugin logs",
    /follows the new default/i.test(lazyTemplate), lazyTemplate.slice(0, 300));
  // Not prose-matching for its own sake: the phrase asserted here is the one
  // the plugin actually logs, so the two drift together or not at all.
  ok("the plugin logs the phrase the template promises",
    fs.readFileSync(path.join(ROOT, ".opencode", "plugins", "lazy.mjs"), "utf8")
      .includes("follows the new default"));
}

// A comment finding reports at the `/**`, so an edit deeper inside the comment
// used to fall outside the range entirely once it passed the headroom.
const deepDocTs = write("deepdoc.ts",
  "/**\n * A\n * B\n * C\n * D\n * E\n * @param {number} a first\n */\nexport function add(a: number) { return a; }\n");
e = editCheck({ tool_name: "Edit", tool_input: { file_path: deepDocTs, old_string: "x", new_string: " * @param {number} a first" } });
ok("an Edit deep inside a comment reports the comment finding it created",
  e.stdout.includes("deepdoc.ts:1") && e.stdout.includes("no-typed-jsdoc"), e.stdout.slice(0, 200));

// A findings-heavy file overran spawnSync's default 1MB buffer: the child ended
// with a null status, which read as "the checker broke", and the hook dropped
// the report for exactly the file that needed it most.
const floodTs = write("flood.ts", "const user = payload as User;\n".repeat(10000));
e = editCheck(toolPayload(floodTs));
// Raw stdout, not contextOf: against a build with this bug there is no JSON to
// parse, and the assertion has to fail rather than abort the suite.
ok("a findings-heavy file still gets a capped report",
  e.stdout.includes("more on these lines, not listed."), e.stdout.slice(0, 200));

// Neither statusline may coerce the stored preference: getHideStatus() requires
// the property to be strictly boolean true. The .sh path is exercised above;
// PowerShell is not installed here, so this is a drift guard on the source.
{
  const ps1 = fs.readFileSync(path.join(ROOT, "hooks", "lazy-statusline.ps1"), "utf8");
  ok("the PowerShell statusline requires a boolean hideStatus", /-is \[bool\]/.test(ps1));
  // All three answer the same question on every render, so a file sized between
  // two different caps would make them disagree about the badge.
  {
    const limit = String(config.CONFIG_SIZE_LIMIT);
    ok("the PowerShell statusline caps the config size at the shared limit",
      ps1.includes(limit), limit);
    ok("the Bash statusline caps the config size at the shared limit",
      fs.readFileSync(path.join(HOOKS, "lazy-statusline.sh"), "utf8").includes(limit), limit);
  }
  // PowerShell member access is case-insensitive, so `.hideStatus` answered for
  // a `HideStatus` key that getHideStatus() ignores. Static guard: there is no
  // pwsh in CI, so this asserts the source shape rather than the behaviour.
  ok("the PowerShell statusline matches the key case-sensitively",
    /-ceq 'hideStatus'/.test(ps1) && !/\)\.hideStatus/.test(ps1), ps1.slice(0, 200));
}

// The OpenCode template is what /lazy-debt actually runs there, so it has to
// carry the same marker set as the skill body.
{
  const template = fs.readFileSync(path.join(ROOT, ".opencode", "command", "lazy-debt.md"), "utf8");
  ok("the OpenCode debt template matches the skill's marker set", template.includes("<!--") && template.includes("exclude-dir"), template.slice(0, 80));
}

// --- lazy-activate -----------------------------------------------------------

const act = freshHome("activate");
function activate(env = {}, payload = '{"source":"startup"}') {
  return runHook("lazy-activate.js", payload, { ...act.env, ...env });
}
let a = activate();
eq("SessionStart exits 0", a.status, 0);
eq("SessionStart writes the mode flag", fs.readFileSync(act.flag, "utf8"), "full");
ok("SessionStart emits the ruleset", a.stdout.startsWith("LAZY MODE ACTIVE — level: full"));
ok("SessionStart nudges for a missing statusline", a.stdout.includes("STATUSLINE SETUP NEEDED"));
ok("the nudge names the statusline script", a.stdout.includes("lazy-statusline"));
ok("the nudge flag file is written", fs.existsSync(path.join(act.home, ".claude", ".lazy-statusline-nudged")));
a = activate();
ok("the statusline nudge is emitted at most once", !a.stdout.includes("STATUSLINE SETUP NEEDED"));

const act2 = freshHome("activate-configured");
fs.writeFileSync(act2.settings, JSON.stringify({ statusLine: { type: "command", command: "x" } }));
a = runHook("lazy-activate.js", "{}", act2.env);
ok("no nudge when statusLine is already configured", !a.stdout.includes("STATUSLINE SETUP NEEDED"));

const act3 = freshHome("activate-bom");
fs.writeFileSync(act3.settings, "\uFEFF" + JSON.stringify({ statusLine: { type: "command", command: "x" } }));
a = runHook("lazy-activate.js", "{}", act3.env);
ok("a BOM in settings.json does not defeat statusline detection", !a.stdout.includes("STATUSLINE SETUP NEEDED"));

const act4 = freshHome("activate-off");
fs.writeFileSync(act4.flag, "lite");
a = runHook("lazy-activate.js", "{}", { ...act4.env, LAZY_DEFAULT_MODE: "off" });
eq("default off clears the flag and emits no ruleset", [a.status, a.stdout, fs.existsSync(act4.flag)], [0, "OK", false]);

const act5 = freshHome("activate-codex");
const codexData = path.join(act5.home, "codexdata");
fs.mkdirSync(codexData, { recursive: true });
a = runHook("lazy-activate.js", "{}", { ...act5.env, PLUGIN_DATA: codexData });
ok("codex SessionStart emits valid hookSpecificOutput JSON",
  JSON.parse(a.stdout).hookSpecificOutput.hookEventName === "SessionStart");
ok("codex gets no statusline nudge", !a.stdout.includes("STATUSLINE SETUP NEEDED"));
ok("codex state lands in PLUGIN_DATA", fs.readFileSync(path.join(codexData, ".lazy-active"), "utf8") === "full");

// --- lazy-clean.json (event wiring) -----------------------------------------

const wiring = JSON.parse(fs.readFileSync(path.join(HOOKS, "lazy-clean.json"), "utf8"));
eq("wiring declares exactly the four lifecycle events",
  Object.keys(wiring.hooks).sort(), ["PostToolUse", "SessionStart", "SubagentStart", "UserPromptSubmit"]);
const allHooks = Object.entries(wiring.hooks).flatMap(([event, groups]) =>
  groups.flatMap((g) => g.hooks.map((h) => ({ event, matcher: g.matcher, ...h }))));
for (const h of allHooks) {
  ok(`${h.event} hook is a command hook`, h.type === "command");
  ok(`${h.event} timeout is sane`, Number.isInteger(h.timeout) && h.timeout >= 5 && h.timeout <= 60, String(h.timeout));
  ok(`${h.event} has a status message`, typeof h.statusMessage === "string" && h.statusMessage.length > 0);
  const m = /^node -e "([\s\S]*)"$/.exec(h.command);
  ok(`${h.event} command is a node -e one-liner`, Boolean(m));
  if (!m) continue;
  const source = m[1].split('\\"').join('"');
  let syntaxOk = true;
  try { new vm.Script(source); } catch { syntaxOk = false; }
  ok(`${h.event} node -e source parses`, syntaxOk);
  ok(`${h.event} resolves the hook through CLAUDE_PLUGIN_ROOT`, source.includes("CLAUDE_PLUGIN_ROOT"));
  ok(`${h.event} normalizes backslash plugin roots`, source.includes("String.fromCharCode(92)"));
}
const byEvent = Object.fromEntries(allHooks.map((h) => [h.event, h]));
ok("SessionStart wires lazy-activate.js", byEvent.SessionStart.command.includes("lazy-activate.js"));
ok("SubagentStart wires lazy-subagent.js", byEvent.SubagentStart.command.includes("lazy-subagent.js"));
ok("UserPromptSubmit wires lazy-mode-tracker.js", byEvent.UserPromptSubmit.command.includes("lazy-mode-tracker.js"));
ok("PostToolUse wires edit-check.js", byEvent.PostToolUse.command.includes("edit-check.js"));
for (const script of ["lazy-activate.js", "lazy-subagent.js", "lazy-mode-tracker.js", "edit-check.js"]) {
  ok(`${script} exists on disk`, fs.existsSync(path.join(HOOKS, script)));
}
for (const source of ["startup", "resume", "clear", "compact"]) {
  ok(`SessionStart matcher covers ${source}`, new RegExp(byEvent.SessionStart.matcher).test(source));
}
// Claude Code matches tool names exactly, so the test has to anchor too: an
// unanchored .test() said the matcher covered NotebookEdit, which it does not.
const matchesTool = (tool) => new RegExp(`^(?:${byEvent.PostToolUse.matcher})$`, "u").test(tool);
for (const tool of ["Write", "Edit", "MultiEdit"]) {
  ok(`PostToolUse matcher covers ${tool}`, matchesTool(tool));
}
// NotebookEdit is deliberately out: edit-check.js filters on file extension and
// a notebook is not a TS/JS file.
for (const tool of ["Read", "Bash", "Grep", "Glob", "WebFetch", "NotebookEdit"]) {
  ok(`PostToolUse matcher skips ${tool}`, !matchesTool(tool));
}
ok("UserPromptSubmit hook fallback timer (1s) fits inside its wired timeout",
  byEvent.UserPromptSubmit.timeout * 1000 > 1000);
// The wired command really runs end to end.
const wireBox = freshHome("wire");
const wired = spawnSync(process.execPath, ["-e", byEvent.UserPromptSubmit.command.replace(/^node -e "/, "").replace(/"$/, "").split('\\"').join('"')], {
  input: '{"prompt":"/lazy ultra"}', encoding: "utf8", env: baseEnv({ ...wireBox.env, CLAUDE_PLUGIN_ROOT: ROOT }), timeout: 20000,
});
eq("the wired UserPromptSubmit command runs the hook for real",
  [wired.status, wired.stdout, fs.readFileSync(wireBox.flag, "utf8")],
  [0, "LAZY MODE CHANGED — level: ultra", "ultra"]);

// --- lazy-statusline.sh ------------------------------------------------------

const STATUSLINE = path.join(HOOKS, "lazy-statusline.sh");
const canRunBash = process.platform !== "win32" && spawnSync("bash", ["-c", "true"]).status === 0;
if (!canRunBash) {
  console.log("skip statusline tests (bash unavailable)");
} else {
  const sl = freshHome("statusline");
  const statusline = (flagContent, env = {}) => {
    if (flagContent === null) fs.rmSync(sl.flag, { force: true });
    else fs.writeFileSync(sl.flag, flagContent);
    const res = spawnSync("bash", [STATUSLINE], { encoding: "utf8", env: baseEnv({ ...sl.env, ...env }), timeout: 20000 });
    // stderr too: a bash warning on the render path lands in the prompt.
    return { status: res.status, out: res.stdout, err: res.stderr };
  };
  eq("statusline prints nothing with no flag file", statusline(null), { status: 0, out: "", err: "" });
  ok("statusline prints [LAZY] for full", statusline("full").out.includes("[LAZY]"));
  ok("statusline prints [LAZY:ULTRA] for ultra", statusline("ultra\n").out.includes("[LAZY:ULTRA]"));
  ok("statusline colors ultra amber", statusline("ultra").out.includes("38;5;173"));
  ok("statusline colors other levels green", statusline("lite").out.includes("38;5;108"));
  ok("statusline prints [LAZY:LITE] for lite", statusline("lite").out.includes("[LAZY:LITE]"));
  ok("statusline prints [LAZY:REVIEW] for review", statusline("review").out.includes("[LAZY:REVIEW]"));
  ok("statusline normalizes case and padding", statusline("  ULTRA  ").out.includes("[LAZY:ULTRA]"));
  // readMode() rejects `ultra\nsecond line` (the whole file has to be a level),
  // so the badge must not paint one either — it used to read only line 1.
  eq("a multi-line flag prints nothing, matching readMode", statusline("ultra\nsecond line"), { status: 0, out: "", err: "" });
  eq("a flag of off prints nothing", statusline("off"), { status: 0, out: "", err: "" });
  eq("statusline always exits 0", [statusline("banana").status, statusline(null).status], [0, 0]);
  fs.writeFileSync(sl.flag, "lite");
  ok("statusline falls back to $HOME/.claude when CLAUDE_CONFIG_DIR is unset",
    spawnSync("bash", [STATUSLINE], { encoding: "utf8", env: baseEnv({ HOME: sl.home }), timeout: 20000 }).stdout.includes("[LAZY:LITE]"));

  // The flag file is hand-editable and its contents used to reach the prompt
  // verbatim — escape sequences and all.
  ok("statusline never echoes escape sequences from the flag file",
    !statusline("\u001b[31mEVIL\u001b[0m").out.includes("EVIL"));
  ok("statusline never echoes shell metacharacters from the flag file",
    !statusline("banana; rm -rf /").out.includes("rm"));
  ok("an unknown level prints no badge at all", statusline("banana").out === "");

  // hideStatus: the badge can be suppressed while lazy stays active.
  ok("LAZY_HIDE_STATUS=1 hides the badge", statusline("ultra", { LAZY_HIDE_STATUS: "1" }).out === "");
  ok("LAZY_HIDE_STATUS=true hides the badge", statusline("ultra", { LAZY_HIDE_STATUS: "true" }).out === "");
  for (const value of ["0", "false", "FALSE", "no", "NO", ""]) {
    ok(`LAZY_HIDE_STATUS=${JSON.stringify(value)} keeps the badge`,
      statusline("ultra", { LAZY_HIDE_STATUS: value }).out.includes("[LAZY:ULTRA]"));
  }
  writeConfig(sl, '{"hideStatus":true}');
  ok("config hideStatus:true hides the badge", statusline("ultra").out === "");
  ok("LAZY_HIDE_STATUS=0 overrides config hideStatus:true",
    statusline("ultra", { LAZY_HIDE_STATUS: "0" }).out.includes("[LAZY:ULTRA]"));
  writeConfig(sl, '{"hideStatus":false}');
  ok("config hideStatus:false keeps the badge", statusline("ultra").out.includes("[LAZY:ULTRA]"));
  writeConfig(sl, '{"defaultMode":"ultra"}');
  ok("a config without hideStatus keeps the badge", statusline("ultra").out.includes("[LAZY:ULTRA]"));

  // JSON allows the key and value on separate lines; a line-based match could
  // not see that, so the badge showed for a user who had hidden it.
  // The later cases are why the substring match had to go: getHideStatus() reads
  // `config.hideStatus` and nothing else, so a nested key, the same bytes inside
  // a string, a non-boolean, and an unparseable file all leave the badge showing.
  for (const body of [
    '{\n  "hideStatus":\n  true\n}', '{"hideStatus":true}', '{ "hideStatus" : true }', '{"hideStatus":false}',
    '{"nested":{"hideStatus":true}}',
    '{"hideStatus":false,"nested":{"hideStatus":true}}',
    '{"note":"hideStatus:true"}',
    '{"hideStatus":"true"}',
    '{"list":["hideStatus",true]}',
    '{"hideStatus":tru',
    // The shell side has to agree on the ways a file is WRONG too, not just on
    // where the key sits: JSON.parse rejects each of these outright.
    '{"hideStatus":true garbage}',
    '{"hideStatus":true,}',
    '{"hideStatus":true',
    '{"hideStatus":true}}',
    '{"note":"x,"hideStatus":true}',
    '{"a":[1,],"hideStatus":true}',
    // A duplicated root key resolves to the LAST one, both sides.
    '{"hideStatus":true,"hideStatus":false}',
    '{"hideStatus":false,"hideStatus":true}',
    '{"defaultMode":"lite","hideStatus":true}',
    '{"list":[1,2],"hideStatus":true}',
    // Anything around the document is not the document: JSON.parse rejects it.
    'garbage {"hideStatus":true}',
    '{"hideStatus":true} trailing',
    // And a validator has to accept what IS valid, not only reject what is not.
    '{"deep":{"a":{"b":[1,{"c":2}]}},"hideStatus":true}',
    '{"n":-1.5e3,"hideStatus":true}',
    '{"esc":"a\\"b","hideStatus":true}',
    '{}',
    // Escapes are part of the format: `\\u0053` IS an `S`, and getHideStatus()
    // strips a BOM before parsing, so both have to be honoured here too.
    '{"hide\\u0053tatus":true}',
    '\uFEFF{"hideStatus":true}',
    '{"a":"x\\ty","hideStatus":true}',
    '{"a":"s\\/p","hideStatus":true}',
    '{"a":"\\u0041","hideStatus":true}',
    // ...and an escape outside the JSON set is not one.
    '{"a":"\\q","hideStatus":true}',
    '{"a":"\\u00zz","hideStatus":true}',
    // A RAW control character inside any string is not valid JSON, escaped or
    // not, so a stray tab in an unrelated key has to fail the whole document
    // here exactly as it fails JSON.parse.
    '{"a":"x\ty","hideStatus":true}',
    '{"a":"x\ry","hideStatus":true}',
    '{"a":"x\u0000y","hideStatus":true}',
    '{"a":"x\u001fy","hideStatus":true}',
    '{"hideStatus":true,"a":"x\ty"}',
    // A raw control byte OUTSIDE a string is not a document boundary. Splitting
    // records on one made the second half validate on its own and hide the
    // badge, while JSON.parse rejects the file whole.
    '{}\u0001{"hideStatus":true}',
    '{"hideStatus":false}\u0001{"hideStatus":true}',
    '{"hideStatus":true}\u0001garbage',
    '{"hideStatus":true}\n{"hideStatus":true}',
    // The size cap: the statusline validates the WHOLE document on every prompt
    // render, so an oversized config is skipped rather than parsed. Just under
    // the cap still hides, which is what makes the cap the reason above it.
    `{"pad":"${"x".repeat(60_000)}","hideStatus":true}`,
    `{"pad":"${"x".repeat(70_000)}","hideStatus":true}`,
  ]) {
    writeConfig(sl, body);
    const hidden = statusline("ultra").out === "";
    ok(`statusline agrees with getHideStatus on ${JSON.stringify(body)}`,
      hidden === withEnv(sl.env, () => config.getHideStatus()));
  }
  fs.rmSync(sl.config, { force: true });

  // A NUL byte in the flag file. `$(<file)` discards it and warns on stderr, so
  // `ul\0tra` normalized to `ultra` and painted an active badge while
  // readMode() kept the byte and rejected the same state as off -- and the
  // warning itself leaked into the prompt.
  {
    for (const [label, body] of [
      ["a NUL inside the level", "ul\u0000tra"],
      ["a trailing NUL", "ultra\u0000"],
      ["a leading NUL", "\u0000ultra"],
    ]) {
      // Through the helper, not written behind it: `statusline(x)` REWRITES the
      // flag with x, so pre-writing the body tested "ultra" and passed against
      // the bug.
      const res = statusline(body);
      // The real readMode(), not a re-implementation of it: the whole claim is
      // that these two agree. Module state is resolved at import, so the cache
      // has to be dropped for the box env to apply.
      const live = withEnv(sl.env, () => {
        delete require.cache[require.resolve(path.join(HOOKS, "lazy-runtime.js"))];
        delete require.cache[require.resolve(path.join(HOOKS, "lazy-config.js"))];
        return require(path.join(HOOKS, "lazy-runtime.js")).readMode();
      });
      ok(`the statusline agrees with readMode on ${label}`,
        (res.out === "") === (live === null), JSON.stringify([res.out, live]));
      ok(`${label} leaks no warning into the prompt`, !/warning|null byte/i.test(res.err || ""), res.err);
    }
  }

  // An oversized flag is corrupt, not a preference, and both reads of it took
  // the whole file -- a 20MB flag cost ~6.6s per prompt render. The badge is a
  // few bytes either way, so this asserts the outcome and the fact that the
  // ordinary sizes on either side of the cap still behave.
  {
    // The defect is COST, so the assertion is a clock. An 8MB flag measured
    // 1.7s per prompt render before the cap and 10ms after, so 1s is a wide
    // margin either way -- this fails on the old code by 70% and passes on the
    // new one by two orders of magnitude, which is what keeps it from being a
    // flaky timing test.
    const started = Date.now();
    const big = statusline("a".repeat(8 * 1024 * 1024));
    const elapsed = Date.now() - started;
    ok("an oversized flag does not stall the render", elapsed < 1000, `${elapsed}ms`);
    ok("an oversized flag prints nothing", big.out === "" && big.err === "", JSON.stringify(big).slice(0, 120));
    // Not "always reject a long-ish flag": a padded level is still a level.
    const padded = statusline("ultra".padEnd(200, " "));
    ok("a merely padded flag still prints", padded.out.includes("[LAZY:ULTRA]"), JSON.stringify(padded).slice(0, 120));
  }

  // getConfigDir() resolves exactly ONE directory, so a config in a directory it
  // did not pick must not override the explicit hideStatus:false in the one it did.
  const appdata = path.join(sl.home, "appdata");
  fs.mkdirSync(path.join(appdata, "lazy"), { recursive: true });
  fs.writeFileSync(path.join(appdata, "lazy", "config.json"), '{"hideStatus":true}');
  writeConfig(sl, '{"hideStatus":false}');
  ok("a second config dir cannot override the picked dir's hideStatus:false",
    statusline("ultra", { APPDATA: appdata }).out.includes("[LAZY:ULTRA]"));
  ok("statusline agrees with getHideStatus when two config dirs disagree",
    (statusline("ultra", { APPDATA: appdata }).out === "") ===
      withEnv({ ...sl.env, APPDATA: appdata }, () => config.getHideStatus()));
  fs.rmSync(path.join(appdata, "lazy", "config.json"), { force: true });

  // The shell normalizes the value the same way getHideStatus does, so the
  // badge and the config API cannot disagree about what "hidden" means.
  for (const value of ["False", "No", " 0 ", " ", "TRUE", "yes", "f alse", "\tno\n"]) {
    const jsHides = withEnv({ ...sl.env, LAZY_HIDE_STATUS: value }, () => config.getHideStatus());
    const shHides = statusline("ultra", { LAZY_HIDE_STATUS: value }).out === "";
    ok(`statusline agrees with getHideStatus on ${JSON.stringify(value)}`, shHides === jsHides);
  }
  // Set-but-empty means "don't hide" and must win over the config, same as
  // `env !== undefined` in getHideStatus.
  writeConfig(sl, '{"hideStatus":true}');
  ok("an empty LAZY_HIDE_STATUS overrides config hideStatus:true",
    statusline("ultra", { LAZY_HIDE_STATUS: "" }).out.includes("[LAZY:ULTRA]"));
  fs.rmSync(sl.config, { force: true });

  // The badge and readMode() must agree about whether lazy is on: painting
  // [LAZY] for a flag readMode() rejects is the mismatch /lazy just lost.
  eq("an unknown flag prints nothing, matching readMode", statusline("banana"), { status: 0, out: "", err: "" });
  eq("an empty flag file prints nothing, matching readMode", statusline(""), { status: 0, out: "", err: "" });
  eq("a whitespace-only flag prints nothing, matching readMode", statusline("   \n\n"), { status: 0, out: "", err: "" });
  ok("surrounding whitespace is still trimmed, matching readMode",
    statusline("\n  ULTRA \t\n").out.includes("[LAZY:ULTRA]"));
}

// --- never-block contract (no EOF on stdin, the Windows #443 case) ------------
// finish() writes to stdout and then destroys stdin instead of calling
// process.exit(), which used to cut the write off mid-object.

const asyncBox = freshHome("noeof");
{
  fs.rmSync(asyncBox.flag, { force: true });
  const res = await runHookNoEof("lazy-mode-tracker.js", '{"prompt":"/lazy ultra"}', asyncBox.env);
  eq("mode-tracker recovers without EOF (1s fallback)",
    [res.status, res.stdout, fs.readFileSync(asyncBox.flag, "utf8")],
    [0, "LAZY MODE CHANGED — level: ultra", "ultra"]);
  ok("mode-tracker exits promptly without EOF", res.ms < 3000, `${res.ms}ms`);
}
{
  const res = await runHookNoEof("lazy-mode-tracker.js", "{oops", asyncBox.env);
  eq("mode-tracker exits 0 on malformed JSON without EOF", [res.status, res.stdout], [0, ""]);
  ok("malformed JSON without EOF still exits promptly", res.ms < 3000, `${res.ms}ms`);
}
{
  const res = await runHookNoEof("lazy-subagent.js", '{"agent_type":"general-purpose"}',
    { ...asyncBox.env, LAZY_SUBAGENT_MATCHER: "general" });
  ok("subagent recovers without EOF and emits complete JSON",
    res.status === 0 && parses(res.stdout) &&
    JSON.parse(res.stdout).hookSpecificOutput.hookEventName === "SubagentStart");
  ok("subagent exits promptly without EOF", res.ms < 3000, `${res.ms}ms`);
}
{
  const res = await runHookNoEof("lazy-subagent.js", '{"agent_type":"other"}',
    { ...asyncBox.env, LAZY_SUBAGENT_MATCHER: "^general$" });
  eq("subagent mismatch without EOF exits 0 silently", [res.status, res.stdout], [0, ""]);
}
{
  const res = await runHookNoEof("edit-check.js", JSON.stringify(toolPayload(cleanTs)));
  eq("edit-check exits 0 without EOF", res.status, 0);
}
{
  // The whole point of the destroy()-instead-of-exit() change: a findings-heavy
  // file must arrive complete on the fallback path, not cut off mid-object.
  const full = editCheck(toolPayload(bigTs)).stdout;          // normal EOF: complete
  const res = await runHookNoEof("edit-check.js", JSON.stringify(toolPayload(bigTs)));
  eq("edit-check exits 0 on the no-EOF path", res.status, 0);
  ok("edit-check emits complete, parseable JSON on the no-EOF path",
    parses(res.stdout) && res.stdout.length === full.length,
    `got ${res.stdout.length} of ${full.length} bytes, parses=${parses(res.stdout)}`);
  ok("edit-check still exits promptly on the no-EOF path", res.ms < 4000, `${res.ms}ms`);
  // The finding cap now keeps the payload well under a pipe buffer, which is
  // the stronger of the two protections against the truncation this pins:
  // stdin.destroy() is what makes the write complete, the cap is what makes it
  // small. Both are asserted, so removing either fails here.
  ok("the payload stays under a pipe buffer", full.length < 60000, String(full.length));
}
{
  // A 40MB prompt trips the 32MB stdin bound: the hook drops the payload and
  // exits without growing the string unbounded, and without hanging.
  const started = Date.now();
  const res = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HOOKS, "lazy-mode-tracker.js")],
      { stdio: ["pipe", "pipe", "pipe"], env: baseEnv(asyncBox.env) });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stdin.on("error", () => {});
    const killer = setTimeout(() => child.kill("SIGKILL"), 15000);
    child.stdin.write(JSON.stringify({ prompt: "/lazy lite " + "x".repeat(40e6) }), () => {
      try { child.stdin.end(); } catch { /* already destroyed */ }
    });
    child.on("close", (status) => { clearTimeout(killer); resolve({ status, stdout }); });
  });
  eq("a 40MB prompt exits 0 without output (32MB stdin bound)", [res.status, res.stdout], [0, ""]);
  ok("a 40MB prompt does not hang", Date.now() - started < 10000, `${Date.now() - started}ms`);
  eq("a 40MB prompt does not disturb the stored mode", fs.readFileSync(asyncBox.flag, "utf8"), "ultra");
}
{
  const res = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HOOKS, "lazy-subagent.js")],
      { stdio: ["pipe", "pipe", "pipe"], env: baseEnv({ ...asyncBox.env, LAZY_SUBAGENT_MATCHER: "general" }) });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stdin.on("error", () => {});
    const killer = setTimeout(() => child.kill("SIGKILL"), 15000);
    child.stdin.write("x".repeat(40e6), () => { try { child.stdin.end(); } catch { /* the child already exited and closed the pipe */ } });
    child.on("close", (status) => { clearTimeout(killer); resolve({ status, stdout }); });
  });
  ok("a 40MB subagent payload exits 0 and fails open", res.status === 0 && parses(res.stdout));
}

// --- summary -----------------------------------------------------------------

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
