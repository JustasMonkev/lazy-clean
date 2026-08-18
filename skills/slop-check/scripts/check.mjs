#!/usr/bin/env node
/**
 * slop-check checker — zero-dependency scanner for low-evidence and pointless
 * TypeScript/JavaScript patterns that AI assistants commonly produce.
 *
 * Runs with plain `node`. No npm packages, no config files, no installation.
 *
 *   node check.mjs [paths...] [--json]
 *
 * With no paths it scans the current directory recursively. Exit code 1 when
 * findings exist, 0 when clean. Findings are heuristic review prompts, not
 * verdicts: fix real slop, and leave genuine false positives alone with a
 * short justification instead of contorting the code.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SKIPPED_DIRECTORIES = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", "vendor", "target",
  ".next", ".nuxt", ".output", ".turbo", ".cache", ".venv",
 ".agent", ".agents", ".claude", ".codex", ".continue", ".cursor",
  ".opencode", ".pi", ".roo", ".windsurf",
]);
const MAX_FILE_BYTES = 1_000_000;

// ---------------------------------------------------------------------------
// Masking tokenizer: blanks out string contents, template-literal text, regex
// literal bodies, and comments so rule patterns only ever match real code.
// Line and column positions are preserved because every masked character is
// replaced with a space and newlines are kept.
// ---------------------------------------------------------------------------

const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "case", "delete", "void", "in", "of", "new", "do",
  "else", "instanceof", "yield", "await", "throw",
]);

function maskSource(source) {
  const out = source.split("");
  const comments = [];
  const n = source.length;
  let i = 0;
  let braceDepth = 0;
  const templateHoleDepths = [];

  const blank = (start, end) => {
    for (let k = start; k < end && k < n; k += 1) {
      if (source[k] !== "\n") out[k] = " ";
    }
  };

  const lastCodeChar = (before) => {
    for (let k = before; k >= 0; k -= 1) {
      const ch = out[k];
      if (ch !== " " && ch !== "\n" && ch !== "\t" && ch !== "\r") return { char: ch, index: k };
    }
    return null;
  };

  const precededByKeyword = (index) => {
    let end = index;
    while (end >= 0 && /[\s]/.test(out[end])) end -= 1;
    let start = end;
    while (start >= 0 && /[A-Za-z]/.test(out[start])) start -= 1;
    return REGEX_PRECEDING_KEYWORDS.has(out.slice(start + 1, end + 1).join(""));
  };

  // Consume a template literal body starting after a backtick or after the `}`
  // closing a template hole. Returns the index to resume scanning from.
  const consumeTemplateBody = (start) => {
    let j = start;
    while (j < n) {
      const ch = source[j];
      if (ch === "\\") { j += 2; continue; }
      if (ch === "`") { blank(start, j); return j + 1; }
      if (ch === "$" && source[j + 1] === "{") {
        blank(start, j);
        templateHoleDepths.push(braceDepth);
        return j + 2;
      }
      j += 1;
    }
    blank(start, n);
    return n;
  };

  if (source.startsWith("#!")) {
    let j = 0;
    while (j < n && source[j] !== "\n") j += 1;
    blank(0, j);
    i = j;
  }

  while (i < n) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      let j = i;
      while (j < n && source[j] !== "\n") j += 1;
      comments.push({ start: i, end: j, kind: "line", text: source.slice(i, j) });
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      let j = source.indexOf("*/", i + 2);
      j = j === -1 ? n : j + 2;
      comments.push({ start: i, end: j, kind: "block", text: source.slice(i, j) });
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") { j += 2; continue; }
        if (source[j] === c || source[j] === "\n") break;
        j += 1;
      }
      blank(i + 1, Math.min(j, n));
      i = Math.min(j, n) + 1;
      continue;
    }
    if (c === "`") {
      i = consumeTemplateBody(i + 1);
      continue;
    }
    if (c === "{") {
      braceDepth += 1;
      i += 1;
      continue;
    }
    if (c === "}") {
      if (templateHoleDepths.length > 0 && braceDepth === templateHoleDepths[templateHoleDepths.length - 1]) {
        templateHoleDepths.pop();
        i = consumeTemplateBody(i + 1);
      } else {
        braceDepth -= 1;
        i += 1;
      }
      continue;
    }
    if (c === "/") {
      const prev = lastCodeChar(i - 1);
      const prevChar = prev?.char ?? null;
      const arrowBefore = prevChar === ">" && prev !== null && out[prev.index - 1] === "=";
      const startsRegex =
        prev === null ||
        "([{,;=:!&|?+*%^~".includes(prevChar) ||
        arrowBefore ||
        (/[A-Za-z]/.test(prevChar) && precededByKeyword(prev.index));
      if (startsRegex) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const ch = source[j];
          if (ch === "\\") { j += 2; continue; }
          if (ch === "\n") break;
          if (ch === "[") inClass = true;
          else if (ch === "]") inClass = false;
          else if (ch === "/" && !inClass) break;
          j += 1;
        }
        if (j < n && source[j] === "/") {
          blank(i + 1, j);
          i = j + 1;
          while (i < n && /[a-z]/i.test(source[i])) i += 1;
          continue;
        }
      }
    }
    i += 1;
  }

  return { masked: out.join(""), comments };
}

// ---------------------------------------------------------------------------
// Rule engine
// ---------------------------------------------------------------------------

function buildLineStarts(text) {
  const starts = [0];
  for (let k = 0; k < text.length; k += 1) {
    if (text[k] === "\n") starts.push(k + 1);
  }
  return starts;
}

function offsetToPosition(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lineStarts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: offset - lineStarts[low] + 1 };
}

const IDENTIFIER_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "at", "is",
  "are", "be", "this", "that", "we", "it", "its", "with", "from", "then",
  "now", "will", "into", "by", "if", "not", "all", "our", "you", "your",
]);

function splitIdentifierWords(line) {
  const words = new Set();
  for (const identifier of line.match(/[A-Za-z_$][\w$]*/gu) ?? []) {
    for (const part of identifier
      .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
      .replace(/[_$]/gu, " ")
      .toLowerCase()
      .split(/\s+/u)) {
      if (part) words.add(part);
    }
  }
  return words;
}

const SLOP_NAME_PATTERN =
  /(?:Enhanced|Improved|Optimized|Refactored|Better|Final|Updated|Fixed|New|Old|Copy|Temp)$|^(?:enhanced|improved|optimized|refactored|better)[A-Z_]|(?:V|_v)\d+$/u;

const FILLER_COMMENT_PATTERN = new RegExp(
  [
    String.raw`\bin a real(?:istic)? (?:app|application|implementation|project|scenario|world)\b`,
    String.raw`\bin production,? (?:you|we|this)\b`,
    String.raw`\bfor (?:now|simplicity|brevity|demonstration|this example)\b`,
    String.raw`\bplaceholder\b`,
    String.raw`\bsimulat(?:e|es|ed|ing)\b`,
    String.raw`\bmock (?:data|implementation|response|result)\b`,
    String.raw`(?<!\()\bnot implemented\b`,
    String.raw`\bimplement(?:ation)? (?:this |details? )?(?:later|here|goes here)\b`,
    String.raw`\blogic (?:goes|would go) here\b`,
    String.raw`\brest of (?:the )?(?:code|logic|implementation|file)\b`,
    String.raw`\b(?:remains?|left|stays?) unchanged\b`,
    String.raw`\bsame as (?:before|above)\b`,
    String.raw`\byou (?:would|could|can|might want to) (?:add|implement|replace|extend|customize)\b`,
    String.raw`\bleft as an exercise\b`,
    String.raw`\bTODO:? implement\b`,
    String.raw`^\s*\.\.\.\s*$`,
  ].join("|"),
  "iu",
);

const NARRATION_COMMENT_PATTERN =
  /^\s*(?:now,? we|now,? let|first,|next,|then,|finally,|let's |lets |here,? we|we (?:now|then|first|simply|just|start|begin)\b|step \d)/iu;

const CHANGE_NOTE_COMMENT_PATTERN = new RegExp(
  [
    String.raw`\bas requested\b`,
    String.raw`\bas per\b`,
    String.raw`\bper (?:your|the) (?:request|instructions?)\b`,
    String.raw`\bas discussed\b`,
    String.raw`\bas mentioned\b`,
    String.raw`\bto (?:make|keep) (?:the )?(?:linter|lint|tests?|typescript|compiler|type checker|ci) (?:happy|pass|passing|quiet)\b`,
    String.raw`\bto satisfy (?:the )?(?:linter|lint|compiler|typescript|type checker)\b`,
    String.raw`^\s*(?:NEW|UPDATED|CHANGED|ADDED|MODIFIED|FIXED)[:!]`,
  ].join("|"),
  "iu",
);

const BACKCOMPAT_COMMENT_PATTERN =
  /backwards?[- ]compat|\bfor compatibility\b|\bkept for\b|\bdeprecated,? use\b/iu;

const EMOJI_PATTERN = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

// Each line rule runs against masked code, line by line.
// `tsOnly` rules are skipped for plain JavaScript files.
const LINE_RULES = [
  {
    name: "no-any",
    tsOnly: true,
    pattern: /:\s*any\b|\bas\s+any\b|<\s*any\s*[,>]|\bany\s*\[\]/u,
    message: "`any` disables the type system. Use a precise type, or `unknown` plus parsing at the boundary.",
  },
  {
    name: "no-chained-type-assertions",
    tsOnly: true,
    pattern: /\bas\s+[\w$.]+(?:\[\])?\s+as\s+[\w$]/u,
    message: "Chained assertions (`as X as Y`) fabricate evidence. Parse or validate the value instead.",
  },
  {
    name: "no-unknown-in-signatures",
    tsOnly: true,
    pattern: /\)\s*:\s*unknown\b|[(,]\s*[\w$]+\s*:\s*unknown\s*[,)=]|\btype\s+[\w$]+(?:<[^=]*>)?\s*=\s*unknown\b/u,
    skipLine: /\bcatch\b/u,
    message: "`unknown` in a signature or alias defers the real type. Name the owner contract and parse at the boundary.",
  },
  {
    name: "no-object-type",
    tsOnly: true,
    pattern: /:\s*object\b/u,
    message: "The `object` type says almost nothing. Declare the specific shape callers must provide.",
  },
  {
    name: "no-unsafe-dictionary-type",
    tsOnly: true,
    pattern: /\bRecord\s*<\s*string\s*,\s*(?:any|unknown)\s*>|\{\s*\[\s*[\w$]+\s*:\s*string\s*\]\s*:\s*(?:any|unknown)\b/u,
    message: "String-keyed `any`/`unknown` dictionaries erase key and value evidence. Model the actual keys and values.",
  },
  {
    name: "no-known-value-widening",
    tsOnly: true,
    pattern: /\b(?:const|let)\s+[\w$]+\s*:\s*(?:string\s*=\s*["'`]|number\s*=\s*-?\d|boolean\s*=\s*(?:true|false)\b)/u,
    message: "Annotating a literal with its primitive type discards the known value. Let inference keep the literal, or use `as const`.",
  },
  {
    name: "no-reflect",
    pattern: /\bReflect\s*\.\s*(?:get|apply)\s*\(/u,
    message: "`Reflect.get`/`Reflect.apply` bypass typed access. Use direct property access or a typed call.",
  },
  {
    name: "no-module-mocking",
    pattern: /\b(?:vi|jest)\s*\.\s*(?:mock|doMock|unmock|setMock|requireMock)\s*\(/u,
    message: "Module mocks patch the loader instead of the design. Inject the dependency through a real seam.",
  },
  {
    name: "no-conditional-empty-object-spread",
    pattern: /\.\.\.\s*\([^()]*\?[^()]*:\s*\{\s*\}\s*\)|\.\.\.\s*\([^()]*\?\s*\{\s*\}\s*:/u,
    message: "Spreading a ternary with `{}` hides field omission. Build the object explicitly or spread `cond && { field }`... only with clear intent.",
  },
  {
    name: "no-json-clone",
    pattern: /\bJSON\s*\.\s*parse\s*\(\s*JSON\s*\.\s*stringify\b/u,
    message: "`JSON.parse(JSON.stringify(...))` is a lossy, slow clone. Use `structuredClone`, or copy the fields you need.",
  },
  {
    name: "no-redundant-fallback",
    pattern: /\?\?\s*undefined\b|\|\|\s*undefined\b/u,
    message: "`?? undefined` / `|| undefined` is a no-op. Delete the fallback.",
  },
  {
    name: "no-boolean-literal-compare",
    pattern: /(?:^|[^!<>=])===?\s*true\b/u,
    message: "`x === true` restates the boolean. Use the value directly, or fix the type if it is not actually boolean.",
  },
  {
    name: "no-double-negation-condition",
    pattern: /\b(?:if|while)\s*\(\s*!!/u,
    message: "Conditions already coerce to boolean; `!!` here is noise. Drop it.",
  },
  {
    name: "no-boolean-literal-ternary",
    pattern: /\?\s*true\s*:\s*false\b|\?\s*false\s*:\s*true\b/u,
    message: "`cond ? true : false` restates the condition. Use the condition (or its negation) directly.",
  },
  {
    name: "no-await-promise-resolve",
    pattern: /\bawait\s+Promise\s*\.\s*resolve\s*\(/u,
    message: "`await Promise.resolve(x)` is `x` with extra steps. Await the real async value or drop the wrapper.",
  },
];

const SLOP_DECLARATION_PATTERN = /\b(?:function|const|let|var|class|interface|type|enum)\s+([\w$]+)/gu;

function* iterateLineFindings(ctx) {
  const { maskedLines, isTypeScript } = ctx;
  for (let index = 0; index < maskedLines.length; index += 1) {
    const line = maskedLines[index];
    if (!line.trim()) continue;
    const lineNumber = index + 1;
    for (const rule of LINE_RULES) {
      if (rule.tsOnly && !isTypeScript) continue;
      if (rule.skipLine?.test(line)) continue;
      const match = rule.pattern.exec(line);
      if (match) {
        yield { line: lineNumber, column: match.index + 1, rule: rule.name, message: rule.message };
      }
    }

    for (const match of line.matchAll(SLOP_DECLARATION_PATTERN)) {
      const name = match[1];
      if (SLOP_NAME_PATTERN.test(name)) {
        yield {
          line: lineNumber,
          column: match.index + match[0].indexOf(name) + 1,
          rule: "no-slop-symbol-names",
          message: `"${name}" is named after the edit, not the domain. Rename it for its role and delete the version it replaced.`,
        };
      }
      if (name.toLowerCase().includes("shape")) {
        yield {
          line: lineNumber,
          column: match.index + match[0].indexOf(name) + 1,
          rule: "no-shape-in-symbol-names",
          message: `Rename "${name}" for its domain role; "shape" describes structure rather than ownership.`,
        };
      }
    }

    const typeofMatch = /\btypeof\s+[\w$.[\]]+\s*[!=]==?\s*["'`]/u.exec(line);
    if (typeofMatch && !isInsideTypeGuard(ctx, index)) {
      yield {
        line: lineNumber,
        column: typeofMatch.index + 1,
        rule: "no-runtime-typeof",
        message: "Runtime `typeof` checks outside a type guard patch over missing type evidence. Fix the type or parse at the boundary.",
      };
    }
  }
}

function isInsideTypeGuard(ctx, lineIndex) {
  const lookBack = Math.max(0, lineIndex - 30);
  for (let k = lineIndex; k >= lookBack; k -= 1) {
    if (/\)\s*:\s*[\w$.[\]\s]*\bis\s+[\w$]/u.test(ctx.maskedLines[k])) return true;
  }
  return false;
}

function* iterateBlockFindings(ctx) {
  const { masked, lineStarts, comments } = ctx;
  const hasCommentInRange = (start, end) =>
    comments.some((comment) => comment.start >= start && comment.start < end);

  for (const match of masked.matchAll(/\bcatch\s*\(\s*([\w$]+)\s*\)\s*\{\s*throw\s+\1\s*;?\s*\}/gu)) {
    yield {
      ...offsetToPosition(lineStarts, match.index),
      rule: "no-useless-rethrow",
      message: "A catch that only rethrows is dead weight. Delete the try/catch or actually handle the error.",
    };
  }

  for (const match of masked.matchAll(/\bcatch\s*(?:\(\s*[\w$]*\s*(?::[^)]*)?\))?\s*\{(\s*)\}/gu)) {
    if (hasCommentInRange(match.index, match.index + match[0].length)) continue;
    yield {
      ...offsetToPosition(lineStarts, match.index),
      rule: "no-empty-catch",
      message: "An empty catch silently swallows failures. Handle the error, rethrow, or justify the swallow in a comment.",
    };
  }

  for (const match of masked.matchAll(
    /\bcatch\s*(?:\(\s*[\w$]*\s*(?::[^)]*)?\))?\s*\{\s*return\s+(?:null|undefined|false|\[\s*\]|\{\s*\}|["'`]{2}|0)\s*;?\s*\}/gu,
  )) {
    if (hasCommentInRange(match.index, match.index + match[0].length)) continue;
    yield {
      ...offsetToPosition(lineStarts, match.index),
      rule: "no-catch-fake-success",
      message: "Returning a default from catch disguises failure as success. Propagate the error or return an explicit failure value.",
    };
  }
}

function* iterateAssertionFindings(ctx) {
  if (!ctx.isTypeScript) return;
  const { maskedLines, comments, lineStarts } = ctx;
  const commentLines = new Set();
  for (const comment of comments) {
    if (/\bSAFETY\s*:/u.test(comment.text)) {
      const { line } = offsetToPosition(lineStarts, comment.start);
      const endLine = offsetToPosition(lineStarts, Math.max(comment.start, comment.end - 1)).line;
      for (let l = line; l <= endLine; l += 1) commentLines.add(l);
    }
  }
  for (let index = 0; index < maskedLines.length; index += 1) {
    const line = maskedLines[index];
    if (/^\s*(?:import|export)\b/u.test(line)) continue;
    const match = /\bas\s+(?!const\b|any\b|unknown\b)[A-Za-z_$]/u.exec(line);
    if (!match) continue;
    const lineNumber = index + 1;
    const hasSafetyComment =
      commentLines.has(lineNumber) || commentLines.has(lineNumber - 1) ||
      commentLines.has(lineNumber - 2) || commentLines.has(lineNumber - 3);
    if (!hasSafetyComment) {
      yield {
        line: lineNumber,
        column: match.index + 1,
        rule: "require-safety-comment-for-type-assertion",
        message: "This type assertion has no `SAFETY:` justification. State the checked invariant immediately before the assertion, or remove it.",
      };
    }
  }
}

function* iterateCommentFindings(ctx) {
  const { comments, lineStarts, maskedLines, isTypeScript } = ctx;
  for (const comment of comments) {
    const position = offsetToPosition(lineStarts, comment.start);
    const body = comment.text.replace(/^\/\/+\s?|^\/\*+|\*+\/$/gu, "").replace(/^\s*\*\s?/gmu, "");

    if (FILLER_COMMENT_PATTERN.test(body)) {
      yield { ...position, rule: "no-filler-comments", message: "Filler comment: placeholder, simulation, or \"in a real app\" hand-waving. Ship the real thing or delete the comment and the code it excuses." };
      continue;
    }
    if (NARRATION_COMMENT_PATTERN.test(body)) {
      yield { ...position, rule: "no-narration-comments", message: "Narration comment (\"now we...\", \"first, ...\"). The code already shows the sequence; delete it." };
      continue;
    }
    if (CHANGE_NOTE_COMMENT_PATTERN.test(body)) {
      yield { ...position, rule: "no-change-note-comments", message: "This comment describes the edit or appeases a tool, not the code. It is noise the moment the change lands; delete it." };
      continue;
    }
    if (BACKCOMPAT_COMMENT_PATTERN.test(body)) {
      yield { ...position, rule: "no-backcompat-comments", message: "Compatibility shims nobody asked for are dead code with a caption. Update the call sites and delete the alias, or justify why it must stay." };
      continue;
    }
    if (EMOJI_PATTERN.test(comment.text)) {
      yield { ...position, rule: "no-emoji", message: "Emoji in source comments are decoration, not information. Remove them." };
      continue;
    }
    if (isTypeScript && comment.kind === "block" && comment.text.startsWith("/**") && /@(?:param|returns?)\s*\{/u.test(comment.text)) {
      yield { ...position, rule: "no-typed-jsdoc", message: "JSDoc `{type}` annotations restate the TypeScript signature and drift from it. Keep types in the signature only." };
      continue;
    }

    if (comment.kind !== "line") continue;
    const maskedBefore = maskedLines[position.line - 1]?.slice(0, position.column - 1) ?? "";
    if (maskedBefore.trim()) continue;
    const words = (body.match(/[A-Za-z]{3,}/gu) ?? [])
      .map((word) => word.toLowerCase())
      .filter((word) => !IDENTIFIER_STOP_WORDS.has(word));
    if (words.length < 2) continue;
    for (let next = position.line; next < Math.min(position.line + 3, maskedLines.length); next += 1) {
      const codeLine = maskedLines[next];
      if (!codeLine?.trim() || /^\s*\/\//u.test(codeLine)) continue;
      const identifierWords = splitIdentifierWords(codeLine);
      const matched = words.filter((word) => identifierWords.has(word)).length;
      const required = words.length <= 2 ? words.length : Math.max(2, words.length - 1);
      if (matched >= required) {
        yield { ...position, rule: "no-restating-comments", message: "This comment restates the identifiers on the next line. It adds no information; delete it." };
      }
      break;
    }
  }
}

export function lintSource(source, filePath) {
  const extension = extname(filePath);
  const { masked, comments } = maskSource(source);
  const ctx = {
    path: filePath,
    isTypeScript: TYPESCRIPT_EXTENSIONS.has(extension),
    masked,
    maskedLines: masked.split("\n"),
    comments,
    lineStarts: buildLineStarts(masked),
  };
  const findings = [
    ...iterateLineFindings(ctx),
    ...iterateBlockFindings(ctx),
    ...iterateAssertionFindings(ctx),
    ...iterateCommentFindings(ctx),
  ];
  findings.sort((a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule));
  return findings.map((finding) => ({ path: filePath, ...finding }));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function collectFiles(entry, files) {
  let stats;
  try {
    stats = statSync(entry);
  } catch {
    console.error(`slop-check: cannot read ${entry}`);
    return;
  }
  if (stats.isDirectory()) {
    for (const name of readdirSync(entry)) {
      if (SKIPPED_DIRECTORIES.has(name)) continue;
      collectFiles(join(entry, name), files);
    }
    return;
  }
  if (!stats.isFile() || stats.size > MAX_FILE_BYTES) return;
  if (!SOURCE_EXTENSIONS.has(extname(entry)) || entry.endsWith(".d.ts")) return;
  files.push(entry);
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const targets = args.filter((arg) => !arg.startsWith("--"));
  const files = [];
  for (const target of targets.length > 0 ? targets : ["."]) {
    collectFiles(target, files);
  }

  const findings = [];
  for (const file of files) {
    findings.push(...lintSource(readFileSync(file, "utf8"), relative(process.cwd(), file) || file));
  }

  if (json) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    for (const finding of findings) {
      console.log(`${finding.path}:${finding.line}:${finding.column} ${finding.rule} — ${finding.message}`);
    }
    console.log(
      findings.length === 0
        ? `slop-check: clean (${files.length} file${files.length === 1 ? "" : "s"} checked)`
        : `slop-check: ${findings.length} finding${findings.length === 1 ? "" : "s"} in ${files.length} file${files.length === 1 ? "" : "s"}`,
    );
  }
  process.exitCode = findings.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
