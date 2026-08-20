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
const hasUnavailableVersionRule = (text) =>
  text
    .split(/\n\s*\n/u)
    .map(flat)
    .some(
      (block) =>
        /latest stable/iu.test(block) &&
        /official source/iu.test(block) &&
        /cannot be checked|cannot check|unable to check|check failed/iu.test(block) &&
        /say so|report|state/iu.test(block) &&
        /do not guess/iu.test(block),
    );

for (const file of [...ADVICE_SKILLS, ...RULES_FILES, ...OPENCODE_COMMANDS, "README.md"]) {
  const text = flat(read(file));
  for (const language of LANGUAGES) ok(`${file} lists ${language}`, lists(text, language));
  ok(`${file} requires the latest-stable check`, /latest stable/iu.test(text));
  ok(`${file} names the official source`, /official source/iu.test(text));
}

// README describes the behavior; the instruction surfaces have to command it.
for (const file of [...ADVICE_SKILLS, ...RULES_FILES, ...OPENCODE_COMMANDS]) {
  const text = flat(read(file));
  ok(`${file} forbids guessing an unavailable version`, /do not guess/iu.test(text));
  ok(`${file} reports a failed latest-version lookup`, hasUnavailableVersionRule(read(file)));
  ok(`${file} says where the pinned version lives`, /toolchain file, manifest, lockfile/iu.test(text));
}
ok("README.md promises no guessed versions", /instead of guessing|do not guess/iu.test(flat(read("README.md"))));

ok(
  "slop-check does not order unconditional inlining before the helper guard",
  !/single implementation\. Inline it\./iu.test(flat(read("skills/slop-check/SKILL.md"))),
);

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
const hasMutationWitness = (text) =>
  text
    .split(/\n\s*\n/u)
    .map(flat)
    .some((block) => /\bmutation\b/iu.test(block) && /\bfail(?:s|ed|ure)?\b/iu.test(block) && /\brevert/iu.test(block));
const protectsUsefulMutationTest = (text) =>
  text.split(/\r?\n/u).some(
    (line) =>
      /\bmutation\b/iu.test(line) &&
      (/\bfail(?:s|ed|ure)?\b/iu.test(line) || /catch(?:es)? a?\s*real regression/iu.test(line)) &&
      /keep|earned|not bloat|never flag|do not flag/iu.test(line),
  );

ok("a mutation mention alone is not proof", !hasMutationWitness("Mutation is discussed."));
for (const file of BUILD_SURFACES) {
  ok(`${file} requires a failing, reverted mutation`, hasMutationWitness(read(file)));
}
for (const file of REVIEW_SURFACES) {
  ok(`${file} protects useful mutation tests`, protectsUsefulMutationTest(read(file)));
}

for (const file of BUILD_SURFACES) {
  const text = flat(read(file));
  ok(`${file} requires behavior, edge, and failure coverage`, /edge/iu.test(text) && /failure mode/iu.test(text));
  ok(`${file} forbids a new dependency for the mutation check`, /no new dependency|without a new dependency/iu.test(text));
}

// The hooks are the only surface that rewrites the ruleset before an agent sees
// it: SKILL.md is filtered per level, and subagents get the condensed fallback.
// Both paths must still carry the guidance.
const instructions = require(path.join(ROOT, "hooks", "lazy-instructions.js"));
for (const mode of ["lite", "full", "ultra"]) {
  for (const [surface, text] of [
    [`getLazyInstructions(${mode})`, flat(instructions.getLazyInstructions(mode))],
    [`getSubagentInstructions(${mode})`, flat(instructions.getSubagentInstructions(mode))],
  ]) {
    for (const language of LANGUAGES) ok(`${surface} lists ${language}`, lists(text, language));
    ok(`${surface} requires the latest-stable check`, /latest stable/iu.test(text));
    ok(`${surface} forbids guessing an unavailable version`, /do not guess/iu.test(text));
    ok(`${surface} guards one-caller helpers`, /one caller/iu.test(text));
    ok(`${surface} requires a mutation check`, /mutation/iu.test(text));
  }
}

// `off` is the one level with no instructions at all, so it must stay empty
// rather than degrade into a header plus the new sections.
ok("off injects nothing", instructions.getLazyInstructions("off") === "" && instructions.getSubagentInstructions("off") === "");

// The filter drops mode-keyed lines; a rule bullet shaped like a worked example
// would vanish from every other level. Nothing added here may be mode-keyed.
const skillBody = read("skills/lazy/SKILL.md");
const levels = ["lite", "full", "ultra"].map((mode) => instructions.filterSkillBodyForMode(skillBody, mode));
const guidanceLines = (text) => text.split("\n").filter((line) => /one caller|mutation|latest stable/iu.test(line));
assert.ok(guidanceLines(skillBody).length > 0, "SKILL.md must carry the guidance for this check to mean anything");
for (const [index, level] of levels.entries())
  ok(`level ${index} keeps every guidance line`,
    guidanceLines(level).length === guidanceLines(skillBody).length,
    `${guidanceLines(level).length} of ${guidanceLines(skillBody).length}`);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
