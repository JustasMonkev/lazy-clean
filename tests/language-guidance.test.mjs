#!/usr/bin/env node
// The language, one-caller, and mutation guidance has to reach every surface an
// agent actually reads — the skills, the three rules files, and the condensed
// ruleset the hooks inject — or one platform silently reviews by older rules.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// The markdown surfaces are hard-wrapped, so a phrase like "framework contract"
// is routinely split across two lines. Match against the unwrapped text.
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const flat = (text) => text.replace(/\s+/gu, " ");

let passes = 0;
let failures = 0;

function ok(description, condition, detail) {
  if (condition) {
    passes += 1;
    return;
  }
  failures += 1;
  console.error(`FAIL ${description}${detail ? `: ${detail}` : ""}`);
}

const LANGUAGES = ["TypeScript", "JavaScript", "Java", "Python", "Ruby", "Rust", "Go"];
const RULES_FILES = ["AGENTS.md", ".cursor/rules/lazy-clean.mdc", ".github/copilot-instructions.md"];
// Verification delegates execution to its skill; it does not give coding advice.
const OPENCODE_ONE_SHOTS = new Set(["lazy-debt.md", "lazy-gain.md", "lazy-help.md", "lazy-verify.md"]);
const OPENCODE_COMMANDS = fs
  .readdirSync(path.join(ROOT, ".opencode", "command"))
  .filter((file) => /^lazy(?:-.*)?\.md$/u.test(file) && !OPENCODE_ONE_SHOTS.has(file))
  .map((file) => `.opencode/command/${file}`);
const ADVICE_SKILLS = [
  "skills/lazy/SKILL.md",
  "skills/lazy-review/SKILL.md",
  "skills/lazy-audit/SKILL.md",
  "skills/slop-check/SKILL.md",
  "skills/lazy-clean/SKILL.md",
];

// `Java` is a prefix of `JavaScript`, so a file listing only JavaScript must not
// pass as listing Java: match each name with no letter after it.
const lists = (text, language) => new RegExp(`\\b${language}(?![A-Za-z])`, "u").test(text);
for (const file of [...ADVICE_SKILLS, ...RULES_FILES, ...OPENCODE_COMMANDS, "README.md"]) {
  const text = flat(read(file));
  for (const language of LANGUAGES) ok(`${file} lists ${language}`, lists(text, language));
  ok(`${file} does not mandate latest-release research`, !/latest stable/iu.test(text));
  ok(`${file} keeps advice compatible with installed versions`, /installed version/iu.test(text));
  ok(`${file} says what to do when a version fact is unavailable`, /do not guess|instead of guessing/iu.test(text));
}

// README describes the behavior; the instruction surfaces have to command it.
for (const file of [...ADVICE_SKILLS, ...RULES_FILES, ...OPENCODE_COMMANDS]) {
  const text = flat(read(file));
  ok(`${file} says where the pinned version lives`, /toolchain file, manifest, lockfile/iu.test(text));
}
ok("README.md promises no guessed versions", /instead of guessing|do not guess/iu.test(flat(read("README.md"))));

ok(
  "review examples avoid unconditional inlining",
  !/single implementation\. Inline it\./iu.test(flat(read("skills/lazy-review/SKILL.md"))),
);
ok("review examples avoid the email-at-sign shortcut", !/EmailValidator|"@" in email/iu.test(flat(read("skills/lazy-review/SKILL.md"))));
ok("review examples state concrete invariants", /finite numbers and min <= max/iu.test(flat(read("skills/lazy-review/SKILL.md"))));
ok("review examples preserve locale and timezone", /en-US\/UTC.*Intl\.DateTimeFormat/iu.test(flat(read("skills/lazy-review/SKILL.md"))));
ok("review examples include a keep case", /KEEP.*rollback.*one caller/iu.test(flat(read("skills/lazy-review/SKILL.md"))));

for (const file of [...ADVICE_SKILLS, ...RULES_FILES, ...OPENCODE_COMMANDS, "README.md", "hooks/lazy-instructions.js"]) {
  const text = flat(read(file));
  // The contradiction this guidance replaced: caller or export count alone was
  // listed as evidence of waste, which is the opposite instruction.
  ok(`${file} does not treat caller count alone as waste`,
    !/layer with one caller|files exporting one/iu.test(text));
}

for (const file of [...ADVICE_SKILLS, ...RULES_FILES, ...OPENCODE_COMMANDS]) {
  const text = flat(read(file));
  ok(`${file} guards one-caller helpers`, /one caller/iu.test(text));
  ok(`${file} names the framework contract exception`, /framework contract/iu.test(text));
}

const BUILD_SURFACES = ["skills/lazy/SKILL.md", "skills/lazy-clean/SKILL.md", ...RULES_FILES, ".opencode/command/lazy.md"];
const REVIEW_SURFACES = [
  "skills/lazy-review/SKILL.md",
  "skills/lazy-audit/SKILL.md",
  "skills/slop-check/SKILL.md",
  ".opencode/command/lazy-review.md",
  ".opencode/command/lazy-audit.md",
];
// "Mutation evidence is optional when red-green checks already prove the risk"
// alone lets a reviewer cut evidence that covers risk nothing else proves: the
// surface must also protect that evidence, either by telling a reviewer to keep
// it or by requiring a mutation check when existing coverage is absent.
const protectsUsefulMutationTest = (text) =>
  /\bmutation\b/iu.test(text) &&
  /optional/iu.test(text) &&
  /red-green/iu.test(text) &&
  /keep (?:meaningful mutation|tests that catch real)|otherwise[^.;]*meaningful mutation/iu.test(text);

ok("a mutation mention alone is not proof", !protectsUsefulMutationTest("Mutation is discussed."));
ok("optional-when-proven alone is not protection",
  !protectsUsefulMutationTest("Mutation evidence is optional when existing red-green checks already prove the risky behavior."));
ok("a keep clause plus the optional case is protection",
  protectsUsefulMutationTest("Keep meaningful mutation evidence when existing red-green checks do not already prove the risky behavior; it is optional when they do."));
ok("a required otherwise-check plus the optional case is protection",
  protectsUsefulMutationTest("Mutation work is optional when existing red-green checks already prove the risk; otherwise a small meaningful mutation check is useful."));
for (const file of BUILD_SURFACES) {
  ok(`${file} has a risk-scoped mutation policy`, protectsUsefulMutationTest(read(file)));
}
for (const file of REVIEW_SURFACES) {
  ok(`${file} protects useful mutation evidence`, protectsUsefulMutationTest(read(file)));
}

for (const file of BUILD_SURFACES) {
  const text = flat(read(file));
  ok(`${file} requires behavior, edge, and failure coverage`, /edge/iu.test(text) && /failure mode/iu.test(text));
  ok(`${file} forbids a new dependency for mutation evidence`, /no new dependency|without a new dependency|never add a dependency/iu.test(text));
  ok(`${file} names task-owned surgical scope`, /task-owned/iu.test(text));
  ok(`${file} preserves explicit values`, /explicit false\/zero\/empty/iu.test(text));
}

// The hooks are the only surface that rewrites the ruleset before an agent sees
// it: SKILL.md is filtered per level, and subagents get the condensed fallback.
// Both paths must still carry the guidance.
const instructions = require(path.join(ROOT, "hooks", "lazy-instructions.js"));
const DELIVERY_CONTRACT = [
  ["states material assumptions", /material assumptions/iu],
  ["defines a plan and verifiable finish", /step.*check plan/iu],
  ["uses task-owned surgical scope", /task-owned/iu],
  ["preserves explicit values", /explicit false\/zero\/empty/iu],
  ["delivers the SOLID boundary check", /design checks/iu],
  ["preserves useful single-implementation boundaries", /one implementation alone is not waste/iu],
  ["separates behavior and design review", /judge behavior and design separately/iu],
  ["includes design substance without a reference read", /group behavior by reason to change.*policy independent.*ordinary parameters.*capabilities.*Interchangeable implementations.*inputs, results, errors, and lifecycle/iu],
  ["requires saved regression coverage", /map changed requirements, edge cases, and failure modes to rerunnable tests.*add missing coverage.*inline probes alone are not coverage/iu],
  ["retains unfinished checks after compaction", /unfinished checks through handoffs and compaction/iu],
];
for (const mode of ["lite", "full", "ultra"]) {
  for (const [surface, text] of [
    [`getLazyInstructions(${mode})`, flat(instructions.getLazyInstructions(mode))],
    [`getSubagentInstructions(${mode})`, flat(instructions.getSubagentInstructions(mode))],
    [`getFallbackInstructions(${mode})`, flat(instructions.getFallbackInstructions(mode))],
  ]) {
    for (const language of LANGUAGES) ok(`${surface} lists ${language}`, lists(text, language));
    ok(`${surface} keeps installed-version compatibility`, /installed version/iu.test(text));
    ok(`${surface} forbids guessing an unavailable version`, /do not guess/iu.test(text));
    ok(`${surface} guards one-caller helpers`, /one caller/iu.test(text));
    ok(`${surface} scopes mutation evidence to meaningful risk`, /mutation/iu.test(text) && /optional|meaningful/iu.test(text));
    ok(`${surface} does not demand both forms of evidence`,
      !/prove risky removals with regression and mutation checks/iu.test(text));
    for (const [description, pattern] of DELIVERY_CONTRACT)
      ok(`${surface} ${description}`, pattern.test(text));
  }
}

// `off` is the one level with no instructions at all, so it must stay empty
// rather than degrade into a header plus the new sections.
ok("off injects nothing", instructions.getLazyInstructions("off") === "" && instructions.getSubagentInstructions("off") === "");

// The filter drops mode-keyed lines; a rule bullet shaped like a worked example
// would vanish from every other level. Nothing added here may be mode-keyed.
const skillBody = read("skills/lazy/SKILL.md");
const designCheckPath = path.join(ROOT, "skills/lazy/references/design-checks.md");
assert.ok(fs.existsSync(designCheckPath), "design reference must ship with the skill");
for (const file of [...RULES_FILES, ".opencode/command/lazy.md"]) {
  ok(`${file} routes to the shipped design reference`, read(file).includes("<skills-dir>/lazy/references/design-checks.md"));
}
for (const mode of ["lite", "full", "ultra"]) {
  for (const text of [instructions.getLazyInstructions(mode), instructions.getFallbackInstructions(mode)]) {
    ok(`design reference resolves in ${mode}`, text.includes(designCheckPath));
  }
}
const levels = ["lite", "full", "ultra"].map((mode) => instructions.filterSkillBodyForMode(skillBody, mode));
const guidanceLines = (text) => text.split("\n").filter((line) => /one caller|mutation|installed version|task-owned|red → green|python-checks|not memory|unrun check/iu.test(line));
assert.ok(guidanceLines(skillBody).length > 0, "SKILL.md must carry the guidance for this check to mean anything");
for (const [index, level] of levels.entries())
  ok(`level ${index} keeps every guidance line`,
    guidanceLines(level).length === guidanceLines(skillBody).length,
    `${guidanceLines(level).length} of ${guidanceLines(skillBody).length}`);

// Clean and modular basics for the two languages with dedicated references.
// Each reference must ship, carry its substance, and be reachable from every
// surface that gives build or review advice, or the guidance exists only on disk.
const LANGUAGE_REFERENCES = [
  ["simplification-checks.md", [
    /one reason to change/iu, /import-time side effects/iu, /discriminated union/iu,
    /`unknown` and parse it once at the boundary/iu, /TypeScript 4\.9\+/u,
    /Do not loosen `strict`/u, /Promise\.all.*failing fast/iu,
    // TypeScript 6/7: native compiler naming, removed options, new defaults, API gap.
    /`npx tsc -v`/u, /TypeScript 7 is the native \(Go\) compiler/u, /`tsgo`/u, /`@typescript\/typescript6`/u,
    /`baseUrl`/u, /`node10`/u, /`target: "es5"`/u, /`outFile`/u, /write `with`/u, /`namespace Foo \{\}`/u,
    /`types` is `\[\]`/u, /"ignoreDeprecations": "6\.0".*never a fix/u, /no stable programmatic API/u,
    /typescript-eslint/u, /on 5\.x or older, flag them only when the task is an upgrade/u,
  ]],
  ["python-checks.md", [
    /requires-python/u, /\(3\.10\)/u, /one reason to change/iu, /import-time side effects/iu,
    /__name__ == "__main__"/u, /mutable default/iu, /`if not value`/u, /is None/u,
    /bare `except:`/u, /raise NewError\(\.\.\.\) from err/u, /typing\.Protocol/u,
    /`@dataclass`/u, /configures/u, /Do not add a tool, loosen its config/u,
    /pytest\.raises/u,
  ]],
];
for (const [file, patterns] of LANGUAGE_REFERENCES) {
  const reference = path.join(ROOT, "skills/lazy/references", file);
  assert.ok(fs.existsSync(reference), `${file} must ship with the skill`);
  const text = flat(fs.readFileSync(reference, "utf8"));
  for (const pattern of patterns) ok(`${file} covers ${pattern}`, pattern.test(text));
  for (const mode of ["lite", "full", "ultra"]) {
    ok(`${file} resolves in getLazyInstructions(${mode})`,
      instructions.getLazyInstructions(mode).includes(`(<${reference}>)`));
    ok(`${file} resolves in getFallbackInstructions(${mode})`,
      instructions.getFallbackInstructions(mode).includes(reference));
  }
  for (const surface of [...RULES_FILES, ".opencode/command/lazy.md"])
    ok(`${surface} routes to ${file}`, read(surface).includes(`<skills-dir>/lazy/references/${file}`));
  for (const skill of ["skills/lazy-clean/SKILL.md", "skills/lazy-review/SKILL.md", "skills/lazy-audit/SKILL.md"])
    ok(`${skill} routes to ${file}`, read(skill).includes(`../lazy/references/${file}`));
}
ok("slop-check routes Python to its checks", read("skills/slop-check/SKILL.md").includes("../lazy/references/python-checks.md"));

// The inline basics must survive where a rules file is the only thing an agent
// reads (Cursor, Copilot): a link alone to an uninstalled reference is nothing.
for (const file of [...RULES_FILES, ".opencode/command/lazy.md"]) {
  const text = flat(read(file));
  ok(`${file} inlines the module basics`, /one reason to change/iu.test(text) && /import time/iu.test(text));
  ok(`${file} inlines the TypeScript union rule`, /exclusive states as unions/iu.test(text));
  ok(`${file} inlines the Python behavior traps`, /mutable defaults/iu.test(text) && /bare `except:`/u.test(text));
  ok(`${file} inlines the TypeScript 7 removals`,
    /TypeScript 6\/7/u.test(text) && /`baseUrl`/u.test(text) && /`target: "es5"`/u.test(text) && /typescript-eslint/u.test(text));
}
for (const mode of ["lite", "full", "ultra"]) {
  const text = flat(instructions.getFallbackInstructions(mode));
  ok(`getFallbackInstructions(${mode}) carries the TypeScript 7 removals`,
    /TypeScript 7 \(native tsc\)/u.test(text) && /baseUrl/u.test(text) && /TypeScript 6 alias/u.test(text));
  ok(`getLazyInstructions(${mode}) routes tsconfig changes to the TS/JS checks`,
    /TS\/JS and tsconfig/u.test(instructions.getLazyInstructions(mode)));
}

// The finish checklist is what turns the rules into a checked result instead of
// a remembered one; it belongs at the end of every build surface.
const FINISH_CHECKLIST = [/check the diff, not memory/iu, /nothing unasked was added/iu,
  /traces to the request or its verification/iu, /tests that ran/iu, /never claim an unrun check/iu];
const finishSurfaces = [
  ["skills/lazy/SKILL.md", read("skills/lazy/SKILL.md")],
  ...[...RULES_FILES, ".opencode/command/lazy.md"].map((file) => [file, read(file)]),
  ...["lite", "full", "ultra"].flatMap((mode) => [
    [`getLazyInstructions(${mode})`, instructions.getLazyInstructions(mode)],
    [`getFallbackInstructions(${mode})`, instructions.getFallbackInstructions(mode)],
  ]),
];
for (const [surface, raw] of finishSurfaces) {
  const text = flat(raw);
  for (const pattern of FINISH_CHECKLIST) ok(`${surface} finish checklist has ${pattern}`, pattern.test(text));
  const tail = text.slice(Math.floor(text.length * 0.6));
  ok(`${surface} ends with the finish checklist`, /check the diff, not memory/iu.test(tail));
}

// A relative link in a shipped skill that points nowhere sends the agent to a
// file that is not there; skills-only installs copy skills/ as a whole, so
// ../lazy/references links resolve there too.
const skillMarkdown = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return skillMarkdown(full);
  return entry.name.endsWith(".md") ? [full] : [];
});
for (const file of skillMarkdown(path.join(ROOT, "skills"))) {
  for (const [, target] of fs.readFileSync(file, "utf8").matchAll(/\]\(((?:\.\.?\/|references\/)[^)#\s]+)[^)]*\)/gu))
    ok(`${path.relative(ROOT, file)} link ${target} resolves`, fs.existsSync(path.resolve(path.dirname(file), target)));
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
