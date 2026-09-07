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
const OPENCODE_ONE_SHOTS = new Set(["lazy-debt.md", "lazy-gain.md", "lazy-help.md"]);
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
const levels = ["lite", "full", "ultra"].map((mode) => instructions.filterSkillBodyForMode(skillBody, mode));
const guidanceLines = (text) => text.split("\n").filter((line) => /one caller|mutation|installed version|task-owned|red → green/iu.test(line));
assert.ok(guidanceLines(skillBody).length > 0, "SKILL.md must carry the guidance for this check to mean anything");
for (const [index, level] of levels.entries())
  ok(`level ${index} keeps every guidance line`,
    guidanceLines(level).length === guidanceLines(skillBody).length,
    `${guidanceLines(level).length} of ${guidanceLines(skillBody).length}`);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
