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
      else if (entry.name === ".lazy-active") found.push(path.relative(box.home, p));
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
eq("state file: qoder lives in ~/.qoder", stateFileFor({ QODER_SESSION_ID: "q" }), [path.join(".qoder", ".lazy-active")]);

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
  const target = env && env.QODER_SESSION_ID ? path.join(mt.home, ".qoder", ".lazy-active") : mt.flag;
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
r = track({ prompt: "/lazy-review" });
eq("/lazy-review activates review", [r.flag, r.stdout], ["review", "LAZY MODE CHANGED — level: review"]);
r = track({ prompt: "/lazy:lazy-review" });
eq("/lazy:lazy-review activates review", r.flag, "review");
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

// One invocation is not the test: the leak showed up on the NEXT prompt, which
// re-derived the level from the default the command had already replaced.
r = track({ prompt: "fix the parser" }, { flag: "off", config: JSON.stringify({ defaultMode: "ultra" }), env: qoder });
eq("a pinned off survives later prompts on qoder", [r.flag, r.stdout], ["off", ""]);

r = track({ prompt: "/lazy ultra" }, { env: qoder });
ok("qoder folds the switch confirmation into one JSON write",
  parses(r.stdout) &&
  JSON.parse(r.stdout).hookSpecificOutput.additionalContext
    .startsWith("LAZY MODE CHANGED — level: ultra\n\nLAZY MODE ACTIVE — level: ultra"));
r = track({ prompt: "stop lazy" }, { env: qoder });
eq("qoder emits no ruleset after deactivation", [r.flag, JSON.parse(r.stdout)],
  [null, { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "LAZY MODE OFF" } }]);

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

// `/lazy default` is about later sessions. With no state file, readMode()
// derives the live level from the config default, so `/lazy default off` used
// to switch the running session off as a side effect.
const ocDefault = freshHome("opencode-default");
const ocDefaultState = path.join(ocDefault.env.XDG_CONFIG_HOME, "opencode", ".lazy-active");
fs.mkdirSync(path.join(ocDefault.env.XDG_CONFIG_HOME, "lazy"), { recursive: true });
fs.writeFileSync(path.join(ocDefault.env.XDG_CONFIG_HOME, "lazy", "config.json"), JSON.stringify({ defaultMode: "ultra" }));
const ocDefaultOff = opencodeCommand("default off", ocDefault.env.XDG_CONFIG_HOME);
ok("/lazy default off records the new default",
  Array.isArray(ocDefaultOff.logs) && ocDefaultOff.logs.some((l) => l.message === "lazy default off"),
  JSON.stringify(ocDefaultOff.logs));
ok("/lazy default off pins the level the session was already running at",
  fs.existsSync(ocDefaultState) && fs.readFileSync(ocDefaultState, "utf8").trim() === "ultra",
  fs.existsSync(ocDefaultState) ? fs.readFileSync(ocDefaultState, "utf8") : "<no state file>");
// An explicit level is the user's choice for this session; leave it be.
const ocPinned = freshHome("opencode-pinned");
const ocPinnedState = path.join(ocPinned.env.XDG_CONFIG_HOME, "opencode", ".lazy-active");
fs.mkdirSync(path.dirname(ocPinnedState), { recursive: true });
fs.writeFileSync(ocPinnedState, "lite");
opencodeCommand("default ultra", ocPinned.env.XDG_CONFIG_HOME);
eq("/lazy default does not overwrite an explicit session level", fs.readFileSync(ocPinnedState, "utf8"), "lite");

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
    return { status: res.status, out: res.stdout };
  };
  eq("statusline prints nothing with no flag file", statusline(null), { status: 0, out: "" });
  ok("statusline prints [LAZY] for full", statusline("full").out.includes("[LAZY]"));
  ok("statusline prints [LAZY:ULTRA] for ultra", statusline("ultra\n").out.includes("[LAZY:ULTRA]"));
  ok("statusline colors ultra amber", statusline("ultra").out.includes("38;5;173"));
  ok("statusline colors other levels green", statusline("lite").out.includes("38;5;108"));
  ok("statusline prints [LAZY:LITE] for lite", statusline("lite").out.includes("[LAZY:LITE]"));
  ok("statusline prints [LAZY:REVIEW] for review", statusline("review").out.includes("[LAZY:REVIEW]"));
  ok("statusline normalizes case and padding", statusline("  ULTRA  ").out.includes("[LAZY:ULTRA]"));
  // readMode() rejects `ultra\nsecond line` (the whole file has to be a level),
  // so the badge must not paint one either — it used to read only line 1.
  eq("a multi-line flag prints nothing, matching readMode", statusline("ultra\nsecond line"), { status: 0, out: "" });
  eq("a flag of off prints nothing", statusline("off"), { status: 0, out: "" });
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
  for (const body of ['{\n  "hideStatus":\n  true\n}', '{"hideStatus":true}', '{ "hideStatus" : true }', '{"hideStatus":false}']) {
    writeConfig(sl, body);
    const hidden = statusline("ultra").out === "";
    ok(`statusline agrees with getHideStatus on ${JSON.stringify(body)}`,
      hidden === withEnv(sl.env, () => config.getHideStatus()));
  }
  fs.rmSync(sl.config, { force: true });

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
  eq("an unknown flag prints nothing, matching readMode", statusline("banana"), { status: 0, out: "" });
  eq("an empty flag file prints nothing, matching readMode", statusline(""), { status: 0, out: "" });
  eq("a whitespace-only flag prints nothing, matching readMode", statusline("   \n\n"), { status: 0, out: "" });
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
    child.stdin.write("x".repeat(40e6), () => { try { child.stdin.end(); } catch { /* destroyed */ } });
    child.on("close", (status) => { clearTimeout(killer); resolve({ status, stdout }); });
  });
  ok("a 40MB subagent payload exits 0 and fails open", res.status === 0 && parses(res.stdout));
}

// --- summary -----------------------------------------------------------------

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
