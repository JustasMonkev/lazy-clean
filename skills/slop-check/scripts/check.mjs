#!/usr/bin/env node
/**
 * slop-check checker — zero-dependency scanner for low-evidence and pointless
 * TypeScript/JavaScript patterns that AI assistants commonly produce.
 *
 * Runs with plain `node`. No npm packages, no config files, no installation.
 *
 *   node check.mjs [paths...] [--json] [--summary] [--since=<git-ref>]
 *
 * With no paths it scans the current directory recursively. `--since=<ref>`
 * keeps only findings on lines the diff against <ref> added, which is how an
 * existing codebase adopts the checker without a baseline file: `--since=HEAD`
 * before a commit, `--since=origin/main` in CI. Exit code 1 when findings
 * exist, 2 when a path could not be read, 0 when clean. Findings are
 * heuristic review prompts, not verdicts: fix real slop, and leave genuine
 * false positives alone with a short justification instead of contorting the
 * code.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
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
    while (end >= 0 && /\s/.test(out[end])) end -= 1;
    let start = end;
    while (start >= 0 && /[\w$]/.test(out[start])) start -= 1;
    // `opt_in`, `count_of`, `gen.return`: a keyword only counts when it is the
    // whole identifier, not its tail, and never a property name.
    if (out[start] === "." || out[start] === "#") return false;
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
    const schemeSlashes = c === "/" && source[i + 1] === "/" &&
      source[i - 1] === ":" && /[A-Za-z]/u.test(source[i - 2] ?? "");
    if (c === "/" && source[i + 1] === "/" && !schemeSlashes) {
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
      if (j >= n || source[j] === "\n") {
        i += 1;
        continue;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    if (c === "`") {
      if (source.indexOf("`", i + 1) === -1 && !source.slice(i + 1).includes("${")) {
        i += 1;
        continue;
      }
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
      const prevPrevChar = prev === null ? null : out[prev.index - 1];
      const arrowBefore = prevChar === ">" && prev !== null && prevPrevChar === "=";
      const updateOperator =
        (prevChar === "+" && prevPrevChar === "+") || (prevChar === "-" && prevPrevChar === "-");
      const startsRegex = !updateOperator && (
        prev === null ||
        "([{,;=:!&|?+*%^~".includes(prevChar) ||
        arrowBefore ||
        (/[A-Za-z]/.test(prevChar) && precededByKeyword(prev.index)));
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

// Unconditional: no domain word ends in "Enhanced"/"Refactored" and nothing is
// legitimately named `improvedFetch`.
const SLOP_NAME_PATTERN =
  /(?:Enhanced|Improved|Optimized|Refactored)$|^(?:enhanced|improved|optimized|refactored|better)[A-Z_]/u;

// Conditional: `lastUpdated`, `deepCopy`, `isNew`, `currentTemp` and `uuidV4`
// are ordinary names. What makes the suffix an edit artifact is the thing it
// was cloned from still sitting in the same file, so require that sibling.
const VERSIONED_NAME_PATTERN = /^(.+?)(?:Final|Updated|Fixed|New|Old|Copy|Temp|V\d+|_v\d+)$/u;

// "shape" is the domain in geometry, canvas, and tensor code.
const GEOMETRY_CONTEXT_PATTERN =
  /\b(?:radius|width|height|circle|rect|rectangle|polygon|polyline|path|point|vertex|vertices|svg|canvas|geometry|bbox|tensor|dims?|draw|render)\b/iu;

const FILLER_COMMENT_PATTERN = new RegExp(
  [
    String.raw`\bin a real(?:istic)? (?:app|application|implementation|project|scenario|world)\b`,
    String.raw`\bin production,? (?:you|we|this)\b`,
    String.raw`\bfor (?:now|simplicity|brevity|demonstration|this example)\b`,
    String.raw`\b(?:this is |just |only )?a placeholder\b|\bplaceholder (?:for now|implementation|value|until)\b`,
    String.raw`\bsimulat(?:e|es|ed|ing) (?:a |an |the )?(?:network|api|latency|delay|response|error|failure|request|backend|db|database|server|user)\b`,
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
    String.raw`\bas per (?:your|our|the) (?:request|instructions?|feedback|comment)\b`,
    String.raw`\bper (?:your|the) (?:request|instructions?)\b`,
    String.raw`\bas discussed\b`,
    String.raw`\bas (?:you )?mentioned (?:above|earlier|before|in (?:your|the) (?:message|request|comment))\b`,
    String.raw`\bto (?:make|keep) (?:the )?(?:linter|lint|tests?|typescript|compiler|type checker|ci) (?:happy|pass|passing|quiet)\b`,
    String.raw`\bto satisfy (?:the )?(?:linter|lint|compiler|typescript|type checker)\b`,
    String.raw`^\s*(?:NEW|UPDATED|CHANGED|ADDED|MODIFIED|FIXED)[:!]`,
  ].join("|"),
  "iu",
);

const BACKCOMPAT_COMMENT_PATTERN =
  /backwards?[- ]compat|\bonly for compatibility\b|\bkept for (?:backwards?|legacy|compat|the old)\b|^\s*deprecated,? use\b/iu;

const TEXT_PRESENTATION_SYMBOLS = "\u2713\u2714\u2717\u2718\u26A0\u2022\u2026";
const SYMBOL_RANGES = "\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}";
const EMOJI_PATTERN = new RegExp(
  `[\\u{1F000}-\\u{1FAFF}]|[${SYMBOL_RANGES}]\\u{FE0F}|(?![${TEXT_PRESENTATION_SYMBOLS}])[${SYMBOL_RANGES}]`,
  "u",
);

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
    // Only the bare alias. `(value: unknown)` is the canonical type-guard and
    // error-handler signature and `): unknown` is the correct return for a
    // parse boundary — flagging them contradicted no-any, whose own message
    // tells you to use `unknown` plus parsing at the boundary.
    name: "no-unknown-alias",
    tsOnly: true,
    pattern: /\btype\s+[\w$]+(?:<[^=]*>)?\s*=\s*unknown\s*;?\s*$/u,
    message: "A type alias for `unknown` names nothing. Declare the shape the owner actually guarantees.",
  },
  {
    name: "no-object-type",
    tsOnly: true,
    pattern: /:\s*object\b(?!\s*\()/u,
    message: "The `object` type says almost nothing. Declare the specific shape callers must provide.",
  },
  {
    name: "no-unsafe-dictionary-type",
    tsOnly: true,
    // Only the `any` form. `Record<string, unknown>` is the safe idiom no-any
    // points at, and structured-log context genuinely has no fixed key set.
    pattern: /\bRecord\s*<\s*string\s*,\s*any\s*>|\{\s*\[\s*[\w$]+\s*:\s*string\s*\]\s*:\s*any\b/u,
    message: "A string-keyed `any` dictionary erases key and value evidence. Model the actual keys and values.",
  },
  {
    name: "no-known-value-widening",
    tsOnly: true,
    // A SCREAMING_SNAKE constant is annotated on purpose: the widened type is
    // the published contract, and the literal type would be the wrong one.
    skipLine: /\b(?:const|let)\s+[A-Z][A-Z0-9_]*\s*:/u,
    pattern: /\b(?:const|let)\s+[\w$]+\s*:\s*(?:string\s*=\s*["'`]|number\s*=\s*-?\d|boolean\s*=\s*(?:true|false)\b)/u,
    message: "Annotating a literal with its primitive type discards the known value. Let inference keep the literal, or use `as const`.",
  },
  {
    name: "no-reflect",
    // Inside a Proxy trap, Reflect.get/apply forwarding the receiver is the
    // documented correct implementation; direct access breaks getter `this`.
    skipLine: /\breceiver\b|\bthisArg\b|\bnew Proxy\b/u,
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
    // `|| undefined` is NOT a no-op: it maps "" and 0 to undefined, which is
    // how optional fields get omitted from a payload. Only `??` is redundant.
    pattern: /\?\?\s*undefined\b/u,
    message: "`?? undefined` is a no-op — the value is already undefined when nullish. Delete the fallback.",
  },
  {
    name: "no-boolean-literal-compare",
    // `flag = value === true` normalizes an untyped value; the comparison has
    // to be the whole right-hand side, or a comparison anywhere on an
    // assignment line escapes.
    skipLine: /=\s*[\w$.[\]]+\s*===?\s*true\s*;?\s*$/u,
    pattern: /(?:^|[^!<>=.\w$])[\w$]+\s*===?\s*true\b/u,
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
    name: "no-empty-type-declaration",
    tsOnly: true,
    pattern: /\binterface\s+[\w$]+(?:<[^>]*>)?\s*\{\s*\}|\btype\s+[\w$]+(?:<[^>]*>)?\s*=\s*\{\s*\}/u,
    message: "An empty interface or `{}` alias carries no contract and accepts almost anything. Declare the real fields or delete the declaration.",
  },
  {
    name: "no-env-secret-fallback",
    pattern: /\bprocess\s*\.\s*env\s*\.\s*[A-Z0-9_$]*(?:SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?|PRIVATE_KEY|APIKEY|API_KEY|_KEY|_KEYS)\s*(?:\|\||\?\?)\s*["'`]/u,
    message: "Defaulting a credential to a literal turns a missing secret into a silent misconfiguration. Fail fast when the variable is absent.",
  },
  {
    name: "no-tautological-assertion",
    pattern: /\bexpect\s*\(\s*(true|false|\d+)\s*\)\s*\.\s*(?:toBe|toEqual|toStrictEqual|toBeTruthy|toBeFalsy)\s*\(\s*\1?\s*\)/u,
    message: "Asserting a literal against itself passes no matter what the code does. Assert on the value under test, or delete the test.",
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
      const versioned = VERSIONED_NAME_PATTERN.exec(name);
      if (SLOP_NAME_PATTERN.test(name) || (versioned && ctx.declaredNames.has(versioned[1]))) {
        yield {
          line: lineNumber,
          column: match.index + match[0].indexOf(name) + 1,
          rule: "no-slop-symbol-names",
          message: `"${name}" is named after the edit, not the domain. Rename it for its role and delete the version it replaced.`,
        };
      }
      if (name.toLowerCase().includes("shape") && !GEOMETRY_CONTEXT_PATTERN.test(line)) {
        yield {
          line: lineNumber,
          column: match.index + match[0].indexOf(name) + 1,
          rule: "no-shape-in-symbol-names",
          message: `Rename "${name}" for its domain role; "shape" describes structure rather than ownership.`,
        };
      }
    }

  }
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

// `import {` / `export {` opening a specifier list that continues on later
// lines. Anything with a paren is a declaration (`export function f() {`), not
// a specifier list — treating those as one skipped the whole function body.
const SPECIFIER_LIST_OPEN = /^\s*(?:import|export)\b[^(){}]*\{[^}]*$/u;
const MODULE_STATEMENT = /^\s*import\b|^\s*export\s*(?:type\s+)?[{*]/u;

// `as` followed by something type-shaped and then a real terminator. Without
// the terminator, English prose in JSX text ("served as static assets") and
// every multi-word sentence containing "as" was reported as a type assertion.
const TYPE_ASSERTION_PATTERN =
  /([\w$]+)?\s*\bas\s+(?!const\b|any\b|unknown\b)[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:<[^<>]*>)?(?:\[\])*\s*(?=[;,)\]}=&|?:]|$)/u;


// Multi-line shapes matched against the masked source. Each was measured
// against 651 files of third-party JavaScript before landing; anything that
// fired on human-written code was tightened or dropped.
function* iterateCandidateFindings(ctx) {
  const { masked, lineStarts, comments } = ctx;
  const commentLines = new Set();
  for (const comment of comments) {
    const start = offsetToPosition(lineStarts, comment.start).line;
    const end = offsetToPosition(lineStarts, Math.max(comment.start, comment.end - 1)).line;
    for (let l = start; l <= end; l += 1) commentLines.add(l);
  }
  const justifiedNear = (line) =>
    commentLines.has(line) || commentLines.has(line - 1) || commentLines.has(line - 2);

  // A literal delay only: `setTimeout(resolve, ms)` in a sleep helper is fine.
  for (const match of masked.matchAll(
    /\bnew\s+Promise\s*(?:<[^>]*>)?\s*\(\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*setTimeout\s*\(\s*\1\s*,\s*\d/gu,
  )) {
    const position = offsetToPosition(lineStarts, match.index);
    if (justifiedNear(position.line)) continue;
    yield {
      ...position,
      rule: "no-arbitrary-sleep",
      message: "A hard-coded sleep guesses at timing instead of waiting for the event. Await the real signal, or name the delay as a policy and say why.",
    };
  }

  // The log call has to mention the caught error; logging separate context
  // before a rethrow is deliberate.
  for (const match of masked.matchAll(
    /\bcatch\s*\(\s*([\w$]+)\s*(?::[^)]*)?\)\s*\{\s*(?:console|logger|log)\s*\.\s*[\w$]+\s*\(([^;{}]*)\)\s*;?\s*throw\s+\1\s*;?\s*\}/gu,
  )) {
    if (!new RegExp(String.raw`\b${match[1]}\b`, "u").test(match[2])) continue;
    yield {
      ...offsetToPosition(lineStarts, match.index),
      rule: "no-log-and-rethrow",
      message: "Logging and rethrowing reports the same failure at every frame. Let it propagate, or attach context with `cause` and log once at the boundary.",
    };
  }

  for (const match of masked.matchAll(
    /\bcatch\s*\(\s*([\w$]+)\s*(?::[^)]*)?\)\s*\{\s*throw\s+new\s+[\w$.]*Error\s*\(([^;]*?)\)\s*;?\s*\}/gu,
  )) {
    if (!new RegExp(String.raw`\b${match[1]}\s*(?:\?\.|\.)\s*message\b`, "u").test(match[2])) continue;
    if (/\bcause\b/u.test(match[2])) continue;
    yield {
      ...offsetToPosition(lineStarts, match.index),
      rule: "no-message-only-rethrow",
      message: "Rebuilding an error from its message throws away the stack and the original type. Rethrow it, or wrap it with `{ cause }`.",
    };
  }

  for (const match of masked.matchAll(
    /\bif\s*\((?:[^()]|\([^()]*\))*\)\s*\{?\s*return\s+(true|false)\s*;?\s*\}?\s*else\b\s*\{?\s*return\s+(true|false)\s*;?/gu,
  )) {
    if (match[1] === match[2]) continue;
    yield {
      ...offsetToPosition(lineStarts, match.index),
      rule: "no-boolean-return-branches",
      message: "Branching to return `true` or `false` restates the condition. Return the condition itself.",
    };
  }

  // Each branch must be exactly one assignment; a branch that does more is a
  // real branch, not a conditional expression written long.
  for (const match of masked.matchAll(
    /\blet\s+([\w$]+)\s*(?::[^=;]+)?;\s*if\s*\((?:[^()]|\([^()]*\))*\)\s*(?:\{\s*\1\s*=\s*[^;{}]+;\s*\}|\1\s*=\s*[^;{}]+;)\s*else\b\s*(?:\{\s*\1\s*=\s*[^;{}]+;\s*\}|\1\s*=\s*[^;{}]+;)/gu,
  )) {
    yield {
      ...offsetToPosition(lineStarts, match.index),
      rule: "no-let-if-else-assign",
      message: "A `let` declared only to be assigned in both branches hides a single expression. Use `const` with a conditional expression.",
    };
  }

  for (const match of masked.matchAll(
    /\bnew\s+Promise\s*(?:<[^>]*>)?\s*\(\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\{?\s*\1\s*\([^;{}]*\)\s*;?\s*\}?\s*\)/gu,
  )) {
    yield {
      ...offsetToPosition(lineStarts, match.index),
      rule: "no-promise-constructor-wrapper",
      message: "Wrapping a value in `new Promise` to resolve it immediately is `Promise.resolve` with extra steps. Return the value from an async function.",
    };
  }

  for (const match of masked.matchAll(
    /\.\s*forEach\s*\(\s*\(?\s*[\w$,\s]*\)?\s*=>\s*\{?\s*([\w$.]+)\s*\.\s*push\s*\([^;{}]*\)\s*;?\s*\}?\s*\)/gu,
  )) {
    yield {
      ...offsetToPosition(lineStarts, match.index),
      rule: "no-foreach-push",
      message: "A `forEach` whose whole body pushes into an array is a `map` written the long way. Use `map` (or `flatMap`) and bind the result.",
    };
  }
}

function* iterateAssertionFindings(ctx) {
  if (!ctx.isTypeScript) return;
  const { maskedLines, comments, lineStarts } = ctx;

  // Since TS 4.4 a catch binding is `unknown`, so narrowing it with `as Error`
  // is the only way to read `.code`/`.message`. Demanding a SAFETY: comment on
  // every catch block is noise, not evidence.
  const catchBindings = new Map();
  for (let index = 0; index < maskedLines.length; index += 1) {
    const binding = /\bcatch\s*\(\s*([\w$]+)/u.exec(maskedLines[index]);
    if (binding && !catchBindings.has(binding[1])) catchBindings.set(binding[1], index);
  }

  const commentLines = new Set();
  for (const comment of comments) {
    if (/\bSAFETY\s*:/u.test(comment.text)) {
      const { line } = offsetToPosition(lineStarts, comment.start);
      const endLine = offsetToPosition(lineStarts, Math.max(comment.start, comment.end - 1)).line;
      for (let l = line; l <= endLine; l += 1) commentLines.add(l);
    }
  }
  // `import { readFile as read, ... }` spans lines; skipping only the line the
  // keyword sits on left every aliased specifier below it flagged.
  let inSpecifierList = false;
  for (let index = 0; index < maskedLines.length; index += 1) {
    const line = maskedLines[index];
    if (inSpecifierList) {
      if (line.includes("}")) inSpecifierList = false;
      continue;
    }
    if (SPECIFIER_LIST_OPEN.test(line)) {
      inSpecifierList = true;
      continue;
    }
    if (MODULE_STATEMENT.test(line)) continue;
    const match = TYPE_ASSERTION_PATTERN.exec(line);
    if (!match) continue;
    const operand = match[1];
    if (operand && catchBindings.has(operand) && catchBindings.get(operand) <= index) continue;
    const lineNumber = index + 1;
    const hasSafetyComment =
      commentLines.has(lineNumber) || commentLines.has(lineNumber - 1) ||
      commentLines.has(lineNumber - 2) || commentLines.has(lineNumber - 3);
    if (!hasSafetyComment) {
      yield {
        line: lineNumber,
        column: match.index + (match[0].length - match[0].replace(/^\s*[\w$]*\s*/u, "").length) + 1,
        rule: "require-safety-comment-for-type-assertion",
        message: "This type assertion has no `SAFETY:` justification. State the checked invariant immediately before the assertion, or remove it.",
      };
    }
  }
}

// Only the type-checker directives. eslint's `--` reason convention is not
// widely adopted, so the same rule over eslint-disable fired on 279 of 651
// real-world files — it would drown the signal it is looking for.
const SUPPRESSION_DIRECTIVE_PATTERN = /@ts-(?:ignore|expect-error|nocheck)\b|\bbiome-ignore\b/u;

const OBVIOUS_DOC_COMMENT_PATTERN = new RegExp(
  [
    String.raw`^\s*(?:the\s+)?(?:constructor|getter|setter|default export|main entry point)\.?\s*$`,
    String.raw`^\s*(?:getter|setter) for\b`,
    String.raw`^\s*this (?:function|method|class|component|hook|module|file|helper|utility) (?:takes|returns|will|does|handles|creates|gets|sets|adds|removes|checks|converts|simply|just)\b`,
  ].join("|"),
  "iu",
);

function suppressionIsJustified(body) {
  const match = SUPPRESSION_DIRECTIVE_PATTERN.exec(body);
  if (!match) return true;
  const rest = body.slice(match.index + match[0].length);
  if (rest.includes("--")) return true;
  const reason = rest.replace(/[\w@$][\w@$/.]*[-/][\w@$/.-]*/gu, " ");
  return (reason.match(/[A-Za-z]/gu) ?? []).length >= 10;
}

const TEST_FILE_PATTERN = /(?:^|[\\/])(?:__tests__|__mocks__|test|tests|fixtures)[\\/]|\.(?:test|spec)\.[cm]?[jt]sx?$/u;

function* iterateCommentFindings(ctx) {
  const { comments, lineStarts, maskedLines, isTypeScript } = ctx;
  const inTestFile = TEST_FILE_PATTERN.test(ctx.path);
  for (const comment of comments) {
    const position = offsetToPosition(lineStarts, comment.start);
    const body = comment.text.replace(/^\/\/+\s?|^\/\*+|\*+\/$/gu, "").replace(/^\s*\*\s?/gmu, "");

    if (inTestFile && /\bmock\b/iu.test(body) && !/\b(?:placeholder|not implemented|TODO)\b/iu.test(body)) {
      continue;
    }
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
    if (BACKCOMPAT_COMMENT_PATTERN.test(body) && !/@deprecated/u.test(comment.text)) {
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

    if (SUPPRESSION_DIRECTIVE_PATTERN.test(body) && !suppressionIsJustified(body)) {
      yield { ...position, rule: "no-unjustified-suppression", message: "A type-checker suppression with no stated reason hides the problem instead of the noise. State why the checker is wrong on the same line, or fix what it reported." };
      continue;
    }
    if (OBVIOUS_DOC_COMMENT_PATTERN.test(body)) {
      yield { ...position, rule: "no-obvious-doc-comments", message: "This doc comment restates the declaration below it. Say why the code exists, or delete the comment." };
      continue;
    }

    if (comment.kind !== "line") continue;
    const maskedBefore = maskedLines[position.line - 1]?.slice(0, position.column - 1) ?? "";
    if (maskedBefore.trim()) continue;
    const words = (body.match(/[A-Za-z]{3,}/gu) ?? [])
      .map((word) => word.toLowerCase())
      .filter((word) => !IDENTIFIER_STOP_WORDS.has(word));
    if (words.length < 3) continue;
    for (let next = position.line; next < Math.min(position.line + 3, maskedLines.length); next += 1) {
      const codeLine = maskedLines[next];
      if (!codeLine?.trim() || /^\s*\/\//u.test(codeLine)) continue;
      const identifierWords = splitIdentifierWords(codeLine);
      const matched = words.filter((word) => identifierWords.has(word)).length;
      const required = words.length;
      if (matched >= required) {
        yield { ...position, rule: "no-restating-comments", message: "This comment restates the identifiers on the next line. It adds no information; delete it." };
      }
      break;
    }
  }
}

// A mechanical finding has one correct fix and needs no judgment. A review
// finding is a heuristic prompt where "this is deliberate, leaving it" is a
// legitimate answer — the distinction the flat list used to hide, which pushed
// agents into rewriting correct code to clear the list.
const MECHANICAL_RULES = new Set([
  "no-redundant-fallback", "no-boolean-literal-ternary", "no-double-negation-condition",
  "no-await-promise-resolve", "no-useless-rethrow", "no-json-clone", "no-emoji",
  "no-typed-jsdoc", "no-narration-comments", "no-change-note-comments",
  "no-chained-type-assertions", "no-boolean-return-branches", "no-let-if-else-assign",
  "no-promise-constructor-wrapper", "no-obvious-doc-comments",
]);

export function lintSource(rawSource, filePath) {
  const extension = extname(filePath);
  // A leading BOM is not part of line 1: it defeats the shebang skip and shifts
  // every column on that line by one.
  const source = rawSource.charCodeAt(0) === 0xfeff ? rawSource.slice(1) : rawSource;
  const { masked, comments } = maskSource(source);
  const declaredNames = new Set();
  for (const match of masked.matchAll(SLOP_DECLARATION_PATTERN)) declaredNames.add(match[1]);
  const ctx = {
    path: filePath,
    declaredNames,
    isTypeScript: TYPESCRIPT_EXTENSIONS.has(extension),
    masked,
    maskedLines: masked.split("\n"),
    comments,
    lineStarts: buildLineStarts(masked),
  };
  const findings = [
    ...iterateLineFindings(ctx),
    ...iterateBlockFindings(ctx),
    ...iterateCandidateFindings(ctx),
    ...iterateAssertionFindings(ctx),
    ...iterateCommentFindings(ctx),
  ];
  findings.sort((a, b) => a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule));
  return findings.map((finding) => ({
    path: filePath,
    ...finding,
    severity: MECHANICAL_RULES.has(finding.rule) ? "fix" : "review",
  }));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function collectFiles(entry, scan) {
  let stats;
  try {
    stats = statSync(entry);
  } catch {
    console.error(`slop-check: cannot read ${entry}`);
    scan.unreadable += 1;
    return;
  }
  if (stats.isDirectory()) {
    for (const name of readdirSync(entry)) {
      if (SKIPPED_DIRECTORIES.has(name)) continue;
      collectFiles(join(entry, name), scan);
    }
    return;
  }
  if (!stats.isFile() || stats.size > MAX_FILE_BYTES) return;
  // Case-insensitive: on a case-insensitive filesystem the PostToolUse hook
  // accepts PROBE.TS and spawns the checker, which then silently scanned
  // nothing and reported clean.
  const suffix = extname(entry).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(suffix) || entry.toLowerCase().endsWith(".d.ts")) return;
  // The same file can arrive twice (listed explicitly and again via its
  // directory); linting it twice would double every finding and the count.
  const key = resolve(entry);
  if (scan.seen.has(key)) return;
  scan.seen.add(key);
  scan.files.push(entry);
}

// The printed path mirrors what the caller passed in: absolute stays absolute.
// Rewriting every path relative to cwd turned /tmp/x.ts into tmp/x.ts when run
// from /, and ../../x.ts for anything outside cwd — neither is what the caller
// (often a hook passing an absolute file path) asked about.
function displayPath(file) {
  return isAbsolute(file) ? file : relative(process.cwd(), file) || file;
}

// Line numbers the diff against `ref` added, per absolute path. Git already
// stores the baseline, so adopting the checker on an existing repo needs no
// baseline file to generate, refresh, or drift.
function addedLines(ref) {
  const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64e6 });
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  const byFile = new Map();
  let lines = null;
  for (const line of git(["diff", "-U0", "--no-color", ref, "--"]).split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4);
      lines = target === "/dev/null" ? null : new Set();
      if (lines) byFile.set(resolve(root, target.replace(/^b\//u, "")), lines);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (!hunk || !lines) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    for (let k = 0; k < count; k += 1) lines.add(start + k);
  }
  return byFile;
}

function renderTally(findings) {
  const counts = new Map();
  for (const finding of findings) counts.set(finding.rule, (counts.get(finding.rule) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([rule, count]) => `  ${count} ${rule}`).join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const summaryOnly = args.includes("--summary");
  const since = args.find((arg) => arg.startsWith("--since="))?.slice("--since=".length);
  const targets = args.filter((arg) => !arg.startsWith("-"));
  for (const arg of args) {
    if (arg.startsWith("-") && !["--json", "--summary"].includes(arg) && !arg.startsWith("--since=")) {
      console.error(`slop-check: ignoring unknown option ${arg}`);
    }
  }

  let added = null;
  if (since !== undefined) {
    try {
      added = addedLines(since);
    } catch (error) {
      console.error(`slop-check: cannot diff against ${since} (${error.message.trim().split("\n")[0]})`);
      process.exitCode = 2;
      return;
    }
  }

  const scan = { files: [], seen: new Set(), unreadable: 0 };
  for (const target of targets.length > 0 ? targets : added ? [...added.keys()] : ["."]) {
    collectFiles(target, scan);
  }
  const { files } = scan;

  const findings = [];
  for (const file of files) {
    const changed = added?.get(resolve(file));
    if (added && !changed) continue;
    const fileFindings = lintSource(readFileSync(file, "utf8"), displayPath(file));
    findings.push(...(changed ? fileFindings.filter((finding) => changed.has(finding.line)) : fileFindings));
  }

  const scanned = added ? findings.length > 0 || files.length : files.length;
  const summary = findings.length === 0
    ? `slop-check: clean (${scanned} file${scanned === 1 ? "" : "s"} checked)`
    : `slop-check: ${findings.length} finding${findings.length === 1 ? "" : "s"} in ${new Set(findings.map((finding) => finding.path)).size} file${new Set(findings.map((finding) => finding.path)).size === 1 ? "" : "s"}`;

  if (json) {
    console.log(JSON.stringify(findings, null, 2));
  } else if (summaryOnly) {
    if (findings.length > 0) console.log(renderTally(findings));
    console.log(summary);
  } else {
    for (const [severity, heading] of [
      ["fix", "Fix (mechanical, one correct answer):"],
      ["review", 'Review (heuristic — "deliberate, leaving it" is a valid answer):'],
    ]) {
      const group = findings.filter((finding) => finding.severity === severity);
      if (group.length === 0) continue;
      console.log(heading);
      for (const finding of group) {
        console.log(`  ${finding.path}:${finding.line}:${finding.column} ${finding.rule} — ${finding.message}`);
      }
    }
    if (findings.length >= 10) console.log(renderTally(findings));
    console.log(summary);
  }
  // 2 = the scan itself failed, so "no findings" is not a clean bill of health.
  if (scan.unreadable > 0) process.exitCode = 2;
  else process.exitCode = findings.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
