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
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
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
// Only the extensions where `<` unambiguously means JSX. A `.js` `<` is a
// comparison and a `.ts` `<T>value` is a cast, so neither opts in.
const JSX_EXTENSIONS = new Set([".jsx", ".tsx"]);

const MAX_FILE_BYTES = 1_000_000;

// ---------------------------------------------------------------------------
// Masking tokenizer: blanks out string contents, template-literal text, regex
// literal bodies, JSX text children, and comments so rule patterns only ever
// match real code. Line and column positions are preserved because every
// masked character is replaced with a space and newlines are kept.
// ---------------------------------------------------------------------------

const REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "case", "delete", "void", "in", "of", "new", "do",
  "else", "instanceof", "yield", "await", "throw",
]);

// `if (ready) /^y/.test(answer)` is a regex, not a division: the only tokens a
// `)` can be followed by a regex after are the heads of these statements.
const CONTROL_PAREN_KEYWORDS = new Set(["if", "while", "for", "with"]);

// A `<` opens a JSX element only in expression position. Same shape as the
// regex heuristic: after an operator, an opener, or a statement keyword.
const JSX_PRECEDING_PUNCTUATION = "([{,;=:?&|}>";

// JSX text is prose, not code, and it is the only place a bare English sentence
// reaches the rules. `jsx` is set per file extension by the caller.
function maskSource(source, { jsx = false } = {}) {
  const out = source.split("");
  const comments = [];
  const n = source.length;
  let i = 0;
  let braceDepth = 0;
  // Template holes (`${...}`) and JSX holes (`{...}` between tags) both suspend
  // a text region until the `}` that matches the brace depth they opened at.
  // One stack keeps them ordered when they nest inside each other.
  const holes = [];
  // Number of JSX elements whose children we are currently inside. Saved and
  // reset on entering a hole, because a hole is expression context again.
  let jsxElementDepth = 0;
  // >= 0 while scanning between `<` and the `>` that ends a tag; counts nested
  // `<...>` so a generic like `<Select<Option> ...>` does not end the tag early.
  let jsxTagAngles = -1;
  let jsxTagBraceDepth = 0;
  let jsxTagClosing = false;
  // True for exactly one iteration: the `<` we stopped JSX text at is a tag.
  let jsxTextPending = false;
  // Whether the tag currently being scanned has children at all, plus the name
  // and offset it was decided from — the claim happens at the `>`, once a
  // self-closing tag can be told apart from a real opener.
  let jsxTagNests = false;
  let jsxTagName = "";
  let jsxTagStart = 0;
  let closingTagNames = null;

  // Safety valve for malformed JSX: an element with no closing tag *after it*
  // must not open a children region, because everything below it would then be
  // masked as text. Positions, not just names: a file-wide name set let an
  // earlier `<div></div>` vouch for a later unclosed `<div>`, and the tokenizer
  // ran to EOF in text mode — hiding every finding below the incomplete edit,
  // which is exactly the state a file is in mid-write. Collected in one pass on
  // the first tag seen, so a file without JSX never pays for it.
  // One closer can only close one opener. Asking "is there a closer after this
  // point" let a single `</div>` vouch for both openers of `<div><div></div>`,
  // so the depth never returned to zero and everything below was masked as
  // text. A per-name cursor makes the closer a consumable: an element claims one
  // when it actually opens a children region, and the next opener has to find
  // another.
  const claimedThrough = new Map();
  // Spans of the raw source that cannot hold a real closing tag. The
  // closing-tag index below is built by scanning ahead of the masker, so it
  // reads bytes nothing has classified yet: `const el = <div>{"</div>"}` made
  // the string contents answer for the element, which then opened a children
  // region that swallowed the code after it.
  //
  // Every quote form, and block comments -- but a quote only counts when it
  // CLOSES ON ITS OWN LINE. That one condition is what makes this safe in JSX
  // text, where a pre-pass cannot tell code from prose: an apostrophe in
  // "don't" never finds a partner on its line, so it claims nothing, while
  // `{'</div>'}` in an expression hole closes immediately and does. An earlier
  // version claimed a span whether or not the quote closed, and read prose
  // apostrophes, a URL's `//` and a lone backtick as literals -- the pairing
  // test fixed the quotes, and a `//` is a comment unless a `:` precedes it,
  // which is what tells a URL scheme from a comment in prose and code alike.
  // A template that spans lines is given up with them; a closing tag inside one
  // is rarer than the prose this protects.
  const QUOTES = "\"'`";
  const literalSpans = () => {
    const spans = [];
    for (let k = 0; k < n; k += 1) {
      const ch = source[k];
      if (ch === "/" && source[k + 1] === "*") {
        const close = source.indexOf("*/", k + 2);
        if (close === -1) break;
        spans.push([k, close + 2]);
        k = close + 1;
        continue;
      }
      // A line comment, EXCEPT when the `//` follows a `:` -- that is a URL
      // scheme, and reading `https://example.com` in JSX text as a comment was
      // one of the failures that kept line comments out of here at first. The
      // colon is the whole difference: prose carries URLs, and a `//` with no
      // colon before it is a comment in code and prose alike.
      if (ch === "/" && source[k + 1] === "/" && source[k - 1] !== ":") {
        const close = source.indexOf("\n", k + 2);
        const end = close === -1 ? n : close;
        spans.push([k, end]);
        k = end - 1;
        continue;
      }
      if (!QUOTES.includes(ch)) continue;
      let j = k + 1;
      while (j < n && source[j] !== ch && source[j] !== "\n") {
        if (source[j] === "\\") j += 1;
        j += 1;
      }
      // Unterminated on its line: not a literal, so claim nothing.
      if (j >= n || source[j] === "\n") continue;
      spans.push([k, j + 1]);
      k = j;
    }
    return spans;
  };
  let literal = null;
  // Ascending and non-overlapping by construction, so this is a binary search.
  const insideLiteral = (offset) => {
    if (literal === null) literal = literalSpans();
    let low = 0;
    let high = literal.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (literal[mid][1] <= offset) low = mid + 1;
      else high = mid;
    }
    return low < literal.length && offset > literal[low][0] && offset < literal[low][1];
  };

  const findClosingTag = (name, after) => {
    if (closingTagNames === null) {
      closingTagNames = new Map();
      for (const match of source.matchAll(/<\/([A-Za-z_$][\w$.:-]*)?/gu)) {
        if (insideLiteral(match.index)) continue;
        const key = match[1] ?? "";
        const positions = closingTagNames.get(key);
        if (positions) positions.push(match.index);
        else closingTagNames.set(key, [match.index]);
      }
    }
    const positions = closingTagNames.get(name);
    if (!positions) return -1;
    // matchAll yields ascending offsets, so this is a binary search for the
    // first unclaimed closer past the opener. A linear scan is quadratic on a
    // file of several thousand `<div>`s, which this runs on after every edit.
    let low = claimedThrough.get(name) ?? 0;
    let high = positions.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (positions[mid] > after) high = mid;
      else low = mid + 1;
    }
    return low < positions.length ? low : -1;
  };
  const hasClosingTag = (name, after) => findClosingTag(name, after) !== -1;
  // Called only once the element really opens a children region — not for a
  // self-closing tag, which is known only at the `>` and closes nothing.
  const claimClosingTag = (name, after) => {
    const at = findClosingTag(name, after);
    if (at !== -1) claimedThrough.set(name, at + 1);
  };

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

  const wordEndingAt = (index) => {
    let end = index;
    while (end >= 0 && /\s/.test(out[end])) end -= 1;
    let start = end;
    while (start >= 0 && /[\w$]/.test(out[start])) start -= 1;
    // `opt_in`, `count_of`, `gen.return`: a keyword only counts when it is the
    // whole identifier, not its tail, and never a property name.
    if (out[start] === "." || out[start] === "#") return "";
    return out.slice(start + 1, end + 1).join("");
  };

  const precededByKeyword = (index) => REGEX_PRECEDING_KEYWORDS.has(wordEndingAt(index));

  // `if (ready) {}` then a regex on the next line: a `}` closing a STATEMENT
  // block is a regex predecessor, while one closing an object literal means
  // division. The difference is what opened it — an object literal's `{` sits in
  // expression position, a block's does not. Without this the regex body stayed
  // unmasked and its contents were linted as code.
  const closesStatementBlock = (index) => {
    let depth = 0;
    for (let k = index; k >= 0; k -= 1) {
      const ch = out[k];
      if (ch === "}") depth += 1;
      else if (ch === "{") {
        depth -= 1;
        if (depth === 0) {
          const before = lastCodeChar(k - 1);
          return before === null || !"=([{,:".includes(before.char);
        }
      }
    }
    return false;
  };

  // Walk back from a `)` to its own `(` and report the keyword in front of it.
  const closesControlParen = (index) => {
    let depth = 0;
    for (let k = index; k >= 0; k -= 1) {
      const ch = out[k];
      if (ch === ")") depth += 1;
      else if (ch === "(") {
        depth -= 1;
        if (depth === 0) return CONTROL_PAREN_KEYWORDS.has(wordEndingAt(k - 1));
      }
    }
    return false;
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
        holes.push({ depth: braceDepth, kind: "template", elementDepth: jsxElementDepth });
        jsxElementDepth = 0;
        return j + 2;
      }
      j += 1;
    }
    blank(start, n);
    return n;
  };

  // Consume the raw text between an element's tags. Stops at the next tag and
  // at a `{` hole, exactly like a template body stops at `${`.
  const consumeJsxText = (start) => {
    let j = start;
    while (j < n) {
      const ch = source[j];
      if (ch === "<") {
        blank(start, j);
        jsxTextPending = true;
        return j;
      }
      if (ch === "{") {
        blank(start, j);
        holes.push({ depth: braceDepth, kind: "jsx", elementDepth: jsxElementDepth });
        jsxElementDepth = 0;
        return j + 1;
      }
      j += 1;
    }
    blank(start, n);
    return n;
  };

  const resumeAfterHole = (hole, index) => {
    jsxElementDepth = hole.elementDepth;
    if (hole.kind === "template") return consumeTemplateBody(index);
    if (hole.kind === "attribute") {
      jsxTagAngles = hole.tagAngles;
      jsxTagBraceDepth = hole.tagBraceDepth;
      jsxTagClosing = hole.tagClosing;
      jsxTagNests = hole.tagNests;
      return index;
    }
    return jsxElementDepth > 0 ? consumeJsxText(index) : index;
  };

  // `index` points at the `>` that ends a tag.
  const endJsxTag = (index) => {
    const beforeAngle = lastCodeChar(index - 1);
    const selfClosing = beforeAngle !== null && beforeAngle.char === "/";
    if (jsxTagClosing) jsxElementDepth = Math.max(0, jsxElementDepth - 1);
    else if (!selfClosing && jsxTagNests) {
      claimClosingTag(jsxTagName, jsxTagStart);
      jsxElementDepth += 1;
    }
    jsxTagAngles = -1;
    jsxTagClosing = false;
    return jsxElementDepth > 0 ? consumeJsxText(index + 1) : index + 1;
  };

  // End of the tag name that starts at `start` (the first character after `<`
  // or `</`), or -1 when what follows `<` cannot be a tag name.
  const jsxTagNameEnd = (start) => {
    if (!/[A-Za-z_$]/u.test(source[start] ?? "")) return -1;
    let j = start;
    while (j < n && /[\w$.:-]/u.test(source[j])) j += 1;
    return j;
  };

  // `<T,>(x) => x`, `<T extends B>(x) => x` and `type F = <T>(x: T) => T` are
  // the only ways a `<` in expression position is not JSX in a .tsx file.
  const opensTypeParameters = (nameEnd) => {
    if (source[nameEnd] === ",") return true;
    if (source[nameEnd] === ">" && source[nameEnd + 1] === "(") return true;
    return /^\s+extends\b/u.test(source.slice(nameEnd, nameEnd + 12));
  };

  if (source.startsWith("#!")) {
    let j = 0;
    while (j < n && source[j] !== "\n") j += 1;
    blank(0, j);
    i = j;
  }

  while (i < n) {
    const c = source[i];
    const atJsxChild = jsxTextPending;
    jsxTextPending = false;
    // Only inside JSX text, where a URL is prose. In ordinary code
    // `http://example.com ...` is a `http:` label followed by a real comment,
    // and exempting it left the comment body unmasked for every rule to match.
    const schemeSlashes = jsxElementDepth > 0 && c === "/" && source[i + 1] === "/" &&
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
        // Unterminated on this line — a file caught mid-edit. Its contents are
        // still string contents, so mask to the newline rather than stepping
        // over the quote: leaving them bare made `const m = "value as User`
        // report a type assertion the file does not contain, and inventing
        // findings for half-typed code is worse than missing them. Scanning
        // resumes on the next line, so real code below is still checked.
        blank(i + 1, j);
        i = j;
        continue;
      }
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    if (c === "`") {
      // No shortcut for a backtick with no partner ahead of it. That skip left
      // an unfinished template bare, so `const message = \`value as User`
      // reported an assertion the file does not contain -- and unlike a string
      // or a regex, a template CAN span lines, so consumeTemplateBody masks to
      // the end of the file rather than to the end of the line. Reaching here
      // means code position: JSX prose goes through consumeJsxText, and string
      // and comment bodies are already blanked.
      i = consumeTemplateBody(i + 1);
      continue;
    }
    if (c === "{") {
      // An attribute hole is expression context, like a template or text hole.
      // Standing the tag state aside is what lets a `<` inside it open a tag:
      // while it stayed set, a nested `<Tooltip>Delete as stale</Tooltip>` in a
      // render prop was never recognized and its prose reached the rules.
      if (jsx && jsxTagAngles >= 0 && braceDepth === jsxTagBraceDepth) {
        holes.push({
          depth: braceDepth, kind: "attribute", elementDepth: jsxElementDepth,
          tagAngles: jsxTagAngles, tagBraceDepth: jsxTagBraceDepth,
          tagClosing: jsxTagClosing, tagNests: jsxTagNests,
        });
        jsxTagAngles = -1;
        jsxElementDepth = 0;
        i += 1;
        continue;
      }
      braceDepth += 1;
      i += 1;
      continue;
    }
    if (c === "}") {
      if (holes.length > 0 && braceDepth === holes[holes.length - 1].depth) {
        i = resumeAfterHole(holes.pop(), i + 1);
      } else {
        braceDepth -= 1;
        i += 1;
      }
      continue;
    }
    if (jsx && jsxTagAngles >= 0 && braceDepth === jsxTagBraceDepth) {
      if (c === "<") { jsxTagAngles += 1; i += 1; continue; }
      if (c === ">") {
        if (jsxTagAngles > 0) { jsxTagAngles -= 1; i += 1; continue; }
        i = endJsxTag(i);
        continue;
      }
      // Never read the `/` of `/>` or `</` as a regex or a comment opener.
      if (c === "/") { i += 1; continue; }
    }
    if (jsx && c === "<" && jsxTagAngles < 0) {
      if (source[i + 1] === ">") {
        if (!hasClosingTag("", i)) { i += 2; continue; }
        // A fragment has no self-closing form, so it opens here and claims now.
        claimClosingTag("", i);
        jsxElementDepth += 1;
        i = consumeJsxText(i + 2);
        continue;
      }
      if (source[i + 1] === "/" && source[i + 2] === ">") {
        jsxElementDepth = Math.max(0, jsxElementDepth - 1);
        i = jsxElementDepth > 0 ? consumeJsxText(i + 3) : i + 3;
        continue;
      }
      const closing = source[i + 1] === "/";
      const nameEnd = jsxTagNameEnd(i + (closing ? 2 : 1));
      if (nameEnd !== -1) {
        const prev = lastCodeChar(i - 1);
        const prevChar = prev?.char ?? null;
        const inExpressionPosition =
          prev === null ||
          JSX_PRECEDING_PUNCTUATION.includes(prevChar) ||
          (prevChar === ">" && out[prev.index - 1] === "=") ||
          (/[A-Za-z]/u.test(prevChar) && precededByKeyword(prev.index));
        if (atJsxChild || (!closing && inExpressionPosition && !opensTypeParameters(nameEnd))) {
          jsxTagAngles = 0;
          jsxTagBraceDepth = braceDepth;
          jsxTagClosing = closing;
          jsxTagName = closing ? "" : source.slice(i + 1, nameEnd);
          jsxTagStart = i;
          jsxTagNests = closing || hasClosingTag(jsxTagName, i);
          i = nameEnd;
          continue;
        }
      }
      if (atJsxChild) {
        // A stray `<` in text (invalid JSX, but do not fall out of text mode).
        i = consumeJsxText(i + 1);
        continue;
      }
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
        (prevChar === ")" && closesControlParen(prev.index)) ||
        (prevChar === "}" && closesStatementBlock(prev.index)) ||
        (/[A-Za-z]/.test(prevChar) && precededByKeyword(prev.index)));
      if (startsRegex) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const ch = source[j];
          // A regex literal cannot span lines, so an escape at the end of one
          // does not continue onto the next: without this the scan walked into
          // the following line and could pair the slash with one down there.
          if (ch === "\\") {
            if (source[j + 1] === "\n" || j + 1 >= n) break;
            j += 2;
            continue;
          }
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
        // Unterminated: the closing slash is missing, which for a file caught
        // mid-edit is the ordinary state of a pattern being typed. Leaving the
        // body unmasked scanned pattern text as code — `/x: any` reported
        // no-any against a regex — and this checker runs from a PostToolUse
        // hook, so half-typed files are its normal input, not an edge case.
        // Mask to the end of the line and resume on the next one, which is
        // where the code continues: a regex literal cannot span lines.
        blank(i + 1, j);
        i = j;
        continue;
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

// Multi-line rules match a whole block but report at its opening keyword, which
// can sit well above the body. Carrying the last line of the match lets a
// consumer scoping by edited lines know an edit inside the body created the
// finding. Single-line matches carry no endLine.
function matchSpan(lineStarts, match) {
  const start = offsetToPosition(lineStarts, match.index);
  const end = offsetToPosition(lineStarts, match.index + match[0].length - 1);
  return end.line > start.line ? { ...start, endLine: end.line } : start;
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

// "shape" is the domain in geometry, canvas, and tensor code. Read over the
// whole file, because a `ShapeLayer` class sits well below the union that gives
// it meaning — but only words that are unambiguously geometric. This list once
// carried `path`, `render` and `draw`, which appear as identifiers in most
// server and React files and disarmed the rule everywhere; narrowing the read
// to a few lines instead traded that for missing the domain context above.
const GEOMETRY_CONTEXT_PATTERN =
  /\b(?:radius|circle|rect|rectangle|polygon|polyline|vertex|vertices|svg|canvas|geometry|bbox|tensor)\b/iu;

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
// An env var whose name says it holds a credential. Shared because the dot and
// bracket lookups are two spellings of one rule, and the name list drifting
// between them would leave one spelling quietly weaker than the other.
const CREDENTIAL_NAME_FRAGMENT = String.raw`[A-Z0-9_$]*(?:SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?|PRIVATE_KEY|APIKEY|API_KEY|_KEY|_KEYS)`;
const CREDENTIAL_NAME = new RegExp(String.raw`^${CREDENTIAL_NAME_FRAGMENT}$`, "u");
const ENV_SECRET_FALLBACK_MESSAGE =
  "Defaulting a credential to a literal turns a missing secret into a silent misconfiguration. Fail fast when the variable is absent.";

const LINE_RULES = [
  {
    name: "no-any",
    tsOnly: true,
    // `type Payload = any` and `A | any` disable checking as completely as an
    // annotation does; the rule only knew the positions where `any` follows a
    // colon, `as`, a generic delimiter, or precedes `[]`. `[<,]` and not `<`:
    // `Map<string, any>` is the SECOND type argument, and matching only the
    // first meant the common shape of this defect was reported clean while
    // `Map<any, string>` was reported. A union is matched from BOTH sides for
    // the same reason: `any | null` collapses to `any` exactly as `null | any`
    // does, and operand order is not a property worth being sensitive to.
    pattern: /:\s*any\b|\bas\s+any\b|[<,[]\s*any\s*[,>\]]|\bany\s*\[\]|\btype\s+[\w$]+(?:<(?:[^<>]|<[^<>]*>)*>)?\s*=\s*any\b|[|&]\s*any\b|\bany\s*[|&]/u,
    message: "`any` disables the type system. Use a precise type, or `unknown` plus parsing at the boundary.",
  },
  {
    name: "no-chained-type-assertions",
    tsOnly: true,
    pattern: /\bas\s+[\w$.]+(?:\[\])?\s+as\s+[\w$]/u,
    message: "Chained assertions (`as X as Y`) fabricate evidence. Parse or validate the value instead.",
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
    message: "`JSON.parse(JSON.stringify(...))` is a lossy, slow clone: it drops undefined and functions, and turns a Date into a string. `structuredClone` keeps the Date but THROWS on a function, so it is not a drop-in — copy the fields you need, or confirm the value holds none before swapping.",
  },
  {
    name: "no-redundant-fallback",
    // `|| undefined` is NOT a no-op: it maps "" and 0 to undefined, which is
    // how optional fields get omitted from a payload. `?? undefined` is only a
    // no-op when the value cannot be null — it maps null to undefined, and
    // JSON.stringify drops an undefined property while keeping a null one.
    pattern: /\?\?\s*undefined\b/u,
    message: "`?? undefined` does nothing unless the value can be `null`, where it normalizes null to undefined. Delete it, or keep it and say which you meant.",
  },
  {
    name: "no-boolean-literal-compare",
    // `flag = value === true` normalizes an untyped value; the comparison has
    // to be the whole right-hand side, or a comparison anywhere on an
    // assignment line escapes. Exempting the occurrence rather than the line
    // keeps a second, redundant comparison on the same line reportable.
    exempt: /=\s*[\w$.[\]]+\s*===?\s*true\s*;?\s*$/u,
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
    // A conditional TYPE is not this defect: `T extends string ? true : false`
    // is the only way to write that predicate — there is no `Boolean(...)` in
    // type space, so the rewrite this rule names is not even syntax there.
    // `extends` is the keyword only a conditional type puts in front of such a
    // ternary, and it has to skip the whole line rather than exempt a span:
    // conditional types nest (`... ? (... ? false : true) : never ? false : true`)
    // and a span-scoped exemption just uncovered the outer one. The cost is a
    // one-line `class A extends B { … x ? true : false … }`, which this rule
    // then misses; a mechanical "one correct answer" printed against valid type
    // code is the worse of the two.
    skipLine: /\bextends\b/u,
    pattern: /\?\s*true\s*:\s*false\b|\?\s*false\s*:\s*true\b/u,
    message: "`cond ? true : false` restates the condition. Use the condition (or its negation) directly, wrapped in `Boolean(...)` when the condition is not already boolean.",
  },
  {
    // new RegExp, not a literal: the pattern interpolates the shared credential
    // name list, and a backtick in the quote class cannot live in String.raw.
    name: "no-env-secret-fallback",
    pattern: new RegExp(
      "\\bprocess\\s*\\.\\s*env\\s*\\.\\s*" + CREDENTIAL_NAME_FRAGMENT + "\\s*(?:\\|\\||\\?\\?)\\s*[\"'`]",
      "u",
    ),
    message: ENV_SECRET_FALLBACK_MESSAGE,
  },
  {
    // `process.env["API_TOKEN"]` is the same lookup, and generated or
    // lint-constrained code writes it this way. Masking blanks the key, so the
    // structure matches here and `verify` reads the real name off the raw line.
    name: "no-env-secret-fallback",
    pattern: /\bprocess\s*\.\s*env\s*\[\s*(["'])([^\n]*?)\1\s*\]\s*(?:\|\||\?\?)\s*["'`]/du,
    verify: (match, rawLine) => CREDENTIAL_NAME.test(rawLine.slice(...match.indices[2])),
    message: ENV_SECRET_FALLBACK_MESSAGE,
  },
  {
    // `const { API_TOKEN = "dev-token" } = process.env` installs the same silent
    // literal as the dotted form, and it is how the lookup is usually written
    // when several variables are read at once. The `= process.env` tail is what
    // makes it this rule rather than any destructuring default; `verify` reads
    // the real binding name off the raw line, since masking blanks the literal
    // but keeps its quotes.
    name: "no-env-secret-fallback",
    pattern: /\{[^{}]*?(?<![\w$])([A-Za-z_$][\w$]*)\s*(?::\s*[\w$]+\s*)?=\s*["'`][^\n]*?\}\s*=\s*process\s*\.\s*env\b/du,
    verify: (match, rawLine) => CREDENTIAL_NAME.test(rawLine.slice(...match.indices[1])),
    message: ENV_SECRET_FALLBACK_MESSAGE,
  },
  {
    name: "no-tautological-assertion",
    // String literals too: `expect("ok").toBe("ok")` protects nothing either.
    // Masking keeps a literal's quotes and width but blanks its contents, so
    // `"ok"` and `"no"` are indistinguishable here — `verify` compares the raw
    // source text of the two spans before this is called a tautology.
    // The matcher is captured because polarity decides the answer for the
    // argumentless ones: `expect(false).toBeTruthy()` is not a tautology, it is
    // a test that always FAILS — a different defect, and not this rule's.
    pattern: /\bexpect\s*\(\s*(true|false|\d+|"[^"\n]*"|'[^'\n]*')\s*\)\s*\.\s*(toBe|toEqual|toStrictEqual|toBeTruthy|toBeFalsy)\s*\(\s*(\1)?\s*\)/du,
    verify: (match, rawLine) => {
      const literal = rawLine.slice(...match.indices[1]);
      if (match[2] === "toBeTruthy" || match[2] === "toBeFalsy") {
        // Only a literal, so its truthiness is decidable here: an empty string,
        // `0` and `false` are the falsy ones this rule can see.
        const truthy = !(literal === "false" || /^0+(?:\.0+)?$/u.test(literal) || /^(["'])\1$/u.test(literal));
        return truthy === (match[2] === "toBeTruthy");
      }
      return match.indices[3] !== undefined &&
        literal === rawLine.slice(...match.indices[3]);
    },
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
  const { maskedLines, rawLines, isTypeScript } = ctx;
  const isGeometryFile = maskedLines.some((line) => GEOMETRY_CONTEXT_PATTERN.test(line));
  for (let index = 0; index < maskedLines.length; index += 1) {
    const line = maskedLines[index];
    if (!line.trim()) continue;
    const lineNumber = index + 1;
    for (const rule of LINE_RULES) {
      if (rule.tsOnly && !isTypeScript) continue;
      if (rule.skipLine?.test(line)) continue;
      // `exempt` blanks just the part it matches, so the rest of the line is
      // still inspected; the blanks keep every column where it was.
      const probe = rule.exempt
        ? line.replace(rule.exempt, (matched) => " ".repeat(matched.length))
        : line;
      const match = rule.pattern.exec(probe);
      // `verify` gets the unmasked line: masking preserves every offset, so a
      // rule can match structure on the masked line and still read the literal
      // text it needs to tell two same-shaped literals apart.
      if (match && (!rule.verify || rule.verify(match, rawLines[index]))) {
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
      if (name.toLowerCase().includes("shape") && !isGeometryFile) {
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
  // A comment is only justification if it justifies something. `/* TODO */` in
  // a swallowed catch explains nothing about why losing the error is safe, and
  // accepting it let the marker that ADMITS the debt silence the rule that
  // reports it. A leading marker is stripped before counting, so `TODO: fix` is
  // still nothing while `TODO: the cache is advisory` is a reason that happens
  // to carry one. Two words is the bar — `best-effort cleanup` is terse but
  // real, and no bare marker survives the strip with two words left.
  const isJustification = (comment) => {
    const body = comment.text
      .replace(/^\/\/+|^\/\*+|\*+\/$/gu, "")
      .replace(/^\s*\*\s?/gmu, "")
      .replace(/^\s*(?:todo|fixme|xxx|hack|note|wip)\b[\s:!-]*/iu, "")
      .trim();
    return body.split(/\s+/u).filter(Boolean).length >= 2;
  };
  const hasCommentInRange = (start, end) =>
    comments.some((comment) => comment.start >= start && comment.start < end && isJustification(comment));

  for (const match of masked.matchAll(/\bcatch\s*\(\s*([\w$]+)\s*(?::[^)]*)?\)\s*\{\s*throw\s+\1\s*;?\s*\}/gu)) {
    yield {
      ...matchSpan(lineStarts, match),
      rule: "no-useless-rethrow",
      message: "A catch that only rethrows is dead weight. Delete the try/catch, keeping any `finally` block, or actually handle the error.",
    };
  }

  for (const match of masked.matchAll(/\bcatch\s*(?:\(\s*[\w$]*\s*(?::[^)]*)?\))?\s*\{(\s*)\}/gu)) {
    if (hasCommentInRange(match.index, match.index + match[0].length)) continue;
    yield {
      ...matchSpan(lineStarts, match),
      rule: "no-empty-catch",
      message: "An empty catch silently swallows failures. Handle the error, rethrow, or justify the swallow in a comment.",
    };
  }

  for (const match of masked.matchAll(
    /\bcatch\s*(?:\(\s*[\w$]*\s*(?::[^)]*)?\))?\s*\{\s*return\s+(?:null|undefined|false|\[\s*\]|\{\s*\}|["'`]{2}|0)\s*;?\s*\}/gu,
  )) {
    if (hasCommentInRange(match.index, match.index + match[0].length)) continue;
    yield {
      ...matchSpan(lineStarts, match),
      rule: "no-catch-fake-success",
      message: "Returning a default from catch disguises failure as success. Propagate the error or return an explicit failure value.",
    };
  }
}

// `import {` / `export {` opening a specifier list that continues on later
// lines. Only real specifier-list syntax counts: matching any export ending in
// `{` made `export const cfg = {` skip every line down to its closing brace.
const SPECIFIER_LIST_OPEN = /^\s*(?:import|export)\s*(?:type\s+)?(?:[\w$*]+\s*,\s*)?\{[^}()]*$/u;
const MODULE_STATEMENT = /^\s*import\b|^\s*export\s*(?:type\s+)?[{*]/u;

// A type name: `User`, `A.B`, `Map<string, User>`. `as const` and the two
// top types are excluded — they are assertions the rule does not ask about.
// Three levels of generic nesting, not one: `Promise<Array<Map<string, User>>>`
// is an ordinary assertion target. Each level's branches are disjoint on their
// first character, so the nesting cannot backtrack.
const NAMED_TYPE = String.raw`(?!const\b|any\b|unknown\b)[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>)?`;
// The anonymous type forms. Requiring a name meant `payload as { id: string }`,
// `as [string, number]`, `as () => void` and `as typeof User` were all missed,
// which are exactly the shapes hand-written narrowing reaches for. `typeof`
// leads so the named alternative cannot claim the keyword and stop there.
// `keyof`/`typeof` stack in practice — `as keyof typeof config` is the common
// one — so they are a bounded prefix rather than a separate alternative. Bounded
// because an unbounded `*` over two whitespace-led alternatives is the shape
// that backtracks, and this runs after every edit.
const TYPE_OPERATOR = String.raw`(?:(?:keyof|typeof)\s+){0,3}`;
// An object or tuple type nests: `{ user: { id: string } }` and
// `[string, [number, number]]` are ordinary shapes, and a one-level pattern saw
// neither. Two levels, and each pair of branches is disjoint on its first
// character, so none of these can backtrack.
const OBJECT_TYPE = String.raw`\{(?:[^{}]|\{[^{}]*\})*\}`;
const TUPLE_TYPE = String.raw`\[(?:[^[\]]|\[[^[\]]*\])*\]`;
// A literal type. Masking blanks a string's contents but keeps its quotes, so
// `as "ready"` still has the shape of one here.
const LITERAL_TYPE = String.raw`"[^"\n]*"|'[^'\n]*'|-?\d[\w.]*|true\b|false\b|null\b`;
const ASSERTED_TYPE = [
  // Function type first, so `as (a: A) => B` reports at the whole type rather
  // than stopping at the parenthesized-type alternative below.
  String.raw`\((?:[^()]*)\)\s*=>\s*(?:${NAMED_TYPE}|${OBJECT_TYPE})`,
  String.raw`${TYPE_OPERATOR}(?:${NAMED_TYPE}|${OBJECT_TYPE}|${TUPLE_TYPE})`,
  LITERAL_TYPE,
  // A parenthesized type: `as (User & Admin)`. One nesting level, and the two
  // branches are disjoint on their first character, so it cannot backtrack.
  String.raw`\((?:[^()]|\([^()]*\))*\)`,
].join("|");
// `as` followed by something type-shaped and then a real terminator. Without
// the terminator, English prose in JSX text ("served as static assets") and
// every multi-word sentence containing "as" was reported as a type assertion.
// The operand prefix is anchored to an identifier start and needs real
// whitespace before `as`: written as `([\w$]+)?\s*` it backtracked O(n^2) and
// spent 9s on one long line, which this runs on after every edit.
// Global: every assertion on the line is examined, not just the first.
// The type after `as`, SCANNED rather than pattern-matched. Nesting in a type
// is arbitrary — `Promise<Array<Map<string, Set<User>>>>` is an ordinary
// container composition — and a regex can only balance to a fixed depth, so
// every added level was another assertion that slipped past unjustified. Three
// levels of `<>` and two of `{}` were the last limits; counting delimiters has
// none, and it drops the nested alternations that made the pattern expensive.
const CLOSER = { "<": ">", "{": "}", "[": "]", "(": ")" };
// A `;` ends the scan, because a `<` that was really a comparison would
// otherwise run to the end of the file looking for its `>`. NOT while inside
// braces at ANY depth: an object type separates its members with `;`, so both
// `as { id: string; }` and `as Promise<{ id: string; name: string }>` are
// ordinary. Testing only the OUTERMOST opener got the first right and the
// second wrong — the `;` sits inside braces nested in a `<>`, so a nesting
// counter is the thing to track, not the opener the scan began at.
// The cap bounds the work per candidate, since this runs from a PostToolUse
// hook on every edit.
const SCAN_LIMIT = 4000;

function balancedEnd(text, start) {
  const open = text[start];
  const close = CLOSER[open];
  if (!close) return -1;
  const limit = Math.min(text.length, start + SCAN_LIMIT);
  let depth = 0;
  let braces = 0;
  for (let k = start; k < limit; k += 1) {
    const ch = text[k];
    if (ch === "{") braces += 1;
    else if (ch === "}") braces -= 1;
    // `=>` is one token: the `>` in `as Promise<() => void>` closed the generic
    // early, so the scan ended mid-type and the terminator check rejected the
    // whole assertion. Only matters for `<`, where `>` is the closer.
    if (ch === ">" && text[k - 1] === "=" && close === ">") continue;
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return k + 1;
    } else if (ch === ";" && braces === 0) return -1;
  }
  return -1;
}

// Sticky, so nothing is sliced: on a 56,000-character line, slicing per step is
// what turns a linear scan quadratic.
const TYPE_OPERATOR_AT = /(?:keyof|typeof)\s+/uy;
const LITERAL_TYPE_AT = /"[^"\n]*"|'[^'\n]*'|-?\d[\w.]*|true\b|false\b|null\b/uy;
// `as const` and the two top types are excluded — they are assertions the rule
// does not ask about.
const TYPE_NAME_AT = /(?!const\b|any\b|unknown\b)[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/uy;
const ARROW_AT = /\s*=>\s*/uy;
const at = (pattern, text, index) => {
  pattern.lastIndex = index;
  const m = pattern.exec(text);
  return m ? pattern.lastIndex : -1;
};

// The end of the type starting at `pos`, or -1 if there is not one there.
function typeEnd(text, pos) {
  let k = pos;
  // `keyof`/`typeof` stack in practice — `as keyof typeof config` is the common
  // one — and are a prefix rather than a type of their own.
  for (let guard = 0; guard < 4; guard += 1) {
    const next = at(TYPE_OPERATOR_AT, text, k);
    if (next === -1) break;
    k = next;
  }
  const ch = text[k];
  if (ch === "{" || ch === "[") return balancedEnd(text, k);
  if (ch === "(") {
    const closed = balancedEnd(text, k);
    if (closed === -1) return -1;
    // A function type: `as (a: A) => B`. Without this the scan would stop at
    // the parameter list and the terminator check would reject the whole thing.
    const arrow = at(ARROW_AT, text, closed);
    return arrow === -1 ? closed : typeEnd(text, arrow);
  }
  // Masking blanks a string's contents but keeps its quotes, so `as "ready"`
  // still has the shape of a literal type here.
  const literal = at(LITERAL_TYPE_AT, text, k);
  if (literal !== -1) return literal;
  const named = at(TYPE_NAME_AT, text, k);
  if (named === -1) return -1;
  k = named;
  if (text[k] === "<") {
    const closed = balancedEnd(text, k);
    if (closed === -1) return -1;
    k = closed;
  }
  return k;
}

// The operand prefix is anchored to an identifier start and needs real
// whitespace before `as`: written as `([\w$]+)?\s*` it backtracked O(n^2) and
// spent 9s on one long line, which this runs on after every edit.
const AS_PREFIX = /(?:(?<![\w$.])([\w$]+)\s+)?\bas\s+(?:readonly\s+)?/gu;
// A real terminator after the type. Without it, English prose in JSX text
// ("served as static assets") and every multi-word sentence containing "as" was
// reported as a type assertion.
const TYPE_TERMINATOR = /[;,)\]}=&|?:]/u;
const TRAILING_SPACE_AT = /\s*/uy;

// Yields the same shape `matchAll` did — `[0]`, `[1]`, `.index` — so both the
// per-line and the whole-file pass read unchanged.
function* matchAssertions(text) {
  AS_PREFIX.lastIndex = 0;
  for (let m = AS_PREFIX.exec(text); m !== null; m = AS_PREFIX.exec(text)) {
    let end = typeEnd(text, m.index + m[0].length);
    if (end === -1) continue;
    // An array (`User[]`) or an indexed access (`User["id"]`, `T[keyof T]`).
    // Masking blanks the key but keeps the brackets, so the shape is intact.
    for (let next = end; text[next] === "["; next = end) {
      const closed = balancedEnd(text, next);
      if (closed === -1) break;
      end = closed;
    }
    const afterSpace = at(TRAILING_SPACE_AT, text, end);
    const stop = afterSpace === -1 ? end : afterSpace;
    if (stop < text.length && !TYPE_TERMINATOR.test(text[stop])) continue;
    yield { 0: text.slice(m.index, stop), 1: m[1], index: m.index };
    // Continue AFTER this assertion so a nested `as` inside the type it
    // consumed is not reported a second time.
    AS_PREFIX.lastIndex = Math.max(AS_PREFIX.lastIndex, stop);
  }
}


// `<User>payload`, the pre-`as` assertion syntax. The `<` has to be in
// expression position — after an operator, an opener, `return` or `=>` — which
// is what separates it from `Array<User>` and from `a < b`.
// The type is scanned, not pattern-matched, for the same reason `as` is: a
// fixed nesting depth meant one level past it slipped through, and
// `<Promise<Array<Map<string, Set<User>>>>>payload` is a valid assertion.
const ANGLE_PREFIX = /(?:^|[=(,[:]|=>|\breturn)\s*(?=<)/gmu;
// The operand may not start with `(`: `const identity = <T>(value: T) => value`
// is a generic arrow function, and reading its type-parameter list as an
// assertion put a finding on ordinary type-safe code. A parenthesized operand
// (`<User>(payload)`) is given up with it — the far rarer of the two.
const ANGLE_OPERAND = /^[\w$[]/u;

function* matchAngleAssertions(text) {
  ANGLE_PREFIX.lastIndex = 0;
  for (let m = ANGLE_PREFIX.exec(text); m !== null; m = ANGLE_PREFIX.exec(text)) {
    const open = m.index + m[0].length;
    const closed = balancedEnd(text, open);
    if (closed === -1) continue;
    // The angle brackets have to hold a TYPE, not an arbitrary comparison:
    // `a < b, c > d` balances too. typeEnd over the interior, with the closing
    // `>` as its terminator, is the same test the `as` form applies.
    const inner = typeEnd(text, open + 1);
    if (inner === -1) continue;
    let after = inner;
    while (after < closed - 1 && /\s/u.test(text[after])) after += 1;
    if (after !== closed - 1) continue;
    if (!ANGLE_OPERAND.test(text.slice(closed, closed + 1))) continue;
    yield { 0: text.slice(m.index, closed), index: m.index, open };
  }
}

// A name captured from source, made safe to interpolate into a pattern. `$` is
// both a legal identifier character and a regex anchor, so it has to be escaped
// — and `\b` is then still the wrong boundary, because `$` is not a regex word
// character: `\berr$\b` can never match `err$`. The guards below use
// `(?<![\w$])` / `(?![\w$])` instead, which is the identifier boundary they
// meant all along.
const escapeForRegExp = (text) => text.replace(/[$\\^*+?.()|[\]{}]/gu, "\\$&");
// `.` and `#` are excluded too: in `name = nameOrOptions.name` the trailing
// `name` is a property, not a read of the variable being declared, and counting
// it as one silenced the rule on real code in eslint, playwright and corepack.
const IDENT_BEFORE = String.raw`(?<![\w$.#])`;
const IDENT_AFTER = String.raw`(?![\w$])`;

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
    // `{?` for the block-bodied executor: `new Promise(r => { setTimeout(r, 1000); })`
    // is the same hard-coded sleep, and formatting one should not clear it.
    /\bnew\s+Promise\s*(?:<[^>]*>)?\s*\(\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\{?\s*setTimeout\s*\(\s*\1\s*,\s*\d/gu,
  )) {
    const position = matchSpan(lineStarts, match);
    if (justifiedNear(position.line)) continue;
    yield {
      ...position,
      rule: "no-arbitrary-sleep",
      message: "A hard-coded sleep guesses at timing instead of waiting for the event. Await the real signal, or name the delay as a policy and say why.",
    };
  }

  // `type Payload =\n  unknown;` is ordinary formatter output, and a line-scoped
  // pattern never saw the declaration — the same gap the empty-type rule had.
  // Only the bare alias: `(value: unknown)` is the canonical type-guard and
  // error-handler signature and `): unknown` is the correct return for a parse
  // boundary — flagging them contradicted no-any, whose own message tells you to
  // use `unknown` plus parsing at the boundary.
  if (ctx.isTypeScript) {
    for (const match of masked.matchAll(/\btype\s+[\w$]+(?:<(?:[^<>]|<[^<>]*>)*>)?\s*=\s*unknown\s*(?=;|$)/gmu)) {
      yield {
        ...matchSpan(lineStarts, match),
        rule: "no-unknown-alias",
        message: "A type alias for `unknown` names nothing. Declare the shape the owner actually guarantees.",
      };
    }
  }

  // `interface Marker {\n}` is what a formatter produces, and a line-at-a-time
  // pattern never saw both braces — so the normal spelling of the defect was the
  // one that got through. Matched against the whole masked source instead.
  if (ctx.isTypeScript) {
    for (const match of masked.matchAll(
      // The generic list has to be balanced. `<[^>]*>` stopped at the first `>`,
      // so `type R<O extends Partial<X> = {}> = ...` ended at `Partial<X>` and
      // the DEFAULT VALUE of a type parameter read as an empty alias — a false
      // positive the one-line version could never reach.
      /\binterface\s+[\w$]+(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\{\s*\}|\btype\s+[\w$]+(?:<(?:[^<>]|<[^<>]*>)*>)?\s*=\s*\{\s*\}/gu,
    )) {
      yield {
        ...matchSpan(lineStarts, match),
        rule: "no-empty-type-declaration",
        message: "An empty interface or `{}` alias carries no contract and accepts almost anything. Declare the real fields or delete the declaration.",
      };
    }
  }

  // The log call has to mention the caught error; logging separate context
  // before a rethrow is deliberate.
  for (const match of masked.matchAll(
    /\bcatch\s*\(\s*([\w$]+)\s*(?::[^)]*)?\)\s*\{\s*(?:console|logger|log)\s*\.\s*[\w$]+\s*\(([^;{}]*)\)\s*;?\s*throw\s+\1\s*;?\s*\}/gu,
  )) {
    if (!new RegExp(`${IDENT_BEFORE}${escapeForRegExp(match[1])}${IDENT_AFTER}`, "u").test(match[2])) continue;
    yield {
      ...matchSpan(lineStarts, match),
      rule: "no-log-and-rethrow",
      message: "Logging and rethrowing reports the same failure at every frame. Let it propagate, or attach context with `cause` and log once at the boundary.",
    };
  }

  for (const match of masked.matchAll(
    // The built-in error constructors are callable without `new`, and
    // `throw Error(e.message)` loses the stack exactly like `throw new Error(...)`.
    // Only the built-ins are accepted bare: `new` is what proves construction,
    // so without it `throw toError(e.message)` would read as one too.
    /\bcatch\s*\(\s*([\w$]+)\s*(?::[^)]*)?\)\s*\{\s*throw\s+(?:new\s+[\w$.]*Error|(?:Error|TypeError|RangeError|SyntaxError|EvalError|ReferenceError|URIError|AggregateError))\s*\(([^;]*?)\)\s*;?\s*\}/gu,
  )) {
    if (!new RegExp(`${IDENT_BEFORE}${escapeForRegExp(match[1])}\\s*(?:\\?\\.|\\.)\\s*message\\b`, "u").test(match[2])) continue;
    if (/\bcause\b/u.test(match[2])) continue;
    yield {
      ...matchSpan(lineStarts, match),
      rule: "no-message-only-rethrow",
      message: "Rebuilding an error from its message throws away the stack and the original type. Rethrow it, or wrap it with `{ cause }`.",
    };
  }

  for (const match of masked.matchAll(
    /\bif\s*\((?:[^()]|\([^()]*\))*\)\s*\{?\s*return\s+(true|false)\s*;?\s*\}?\s*else\b\s*\{?\s*return\s+(true|false)\s*;?/gu,
  )) {
    if (match[1] === match[2]) continue;
    yield {
      ...matchSpan(lineStarts, match),
      rule: "no-boolean-return-branches",
      // Per occurrence: match[1] is the `if` branch, so the rule already knows
      // whether the answer is the condition or its negation. `xs.length` is a
      // number, and this prints under the "one correct answer" heading.
      message: `Branching to return \`true\` or \`false\` restates the condition. Return ${match[1] === "true" ? "the condition" : "its negation"}, wrapped in \`Boolean(...)\` when it is not already boolean.`,
    };
  }

  // Each branch must be exactly one assignment; a branch that does more is a
  // real branch, not a conditional expression written long.
  for (const match of masked.matchAll(
    /\blet\s+([\w$]+)\s*(?::[^=;]+)?;\s*if\s*\((?:[^()]|\([^()]*\))*\)\s*(?:\{\s*\1\s*=\s*[^;{}]+;\s*\}|\1\s*=\s*[^;{}]+;)\s*else\b\s*(?:\{\s*\1\s*=\s*[^;{}]+;\s*\}|\1\s*=\s*[^;{}]+;)/gu,
  )) {
    // "Declared only to be assigned" has to be true: `value = value || fallback`
    // READS the variable it initializes, where the `const` rewrite this rule
    // names would hit the temporal dead zone and throw. Blank the declaration
    // and the assignment targets; a surviving mention is a read.
    const name = escapeForRegExp(match[1]);
    // `=(?!=)` so an assignment target is stripped but a comparison is not:
    // `value = value == other` reads the variable and must stay visible here.
    const reads = match[0]
      .replace(new RegExp(String.raw`\blet\s+${name}${IDENT_AFTER}`, "gu"), "")
      .replace(new RegExp(String.raw`${IDENT_BEFORE}${name}\s*=(?!=)`, "gu"), "");
    if (new RegExp(`${IDENT_BEFORE}${name}${IDENT_AFTER}`, "u").test(reads)) continue;
    yield {
      ...matchSpan(lineStarts, match),
      rule: "no-let-if-else-assign",
      message: "A `let` declared only to be assigned in both branches hides a single expression. Use `const` with a conditional expression.",
    };
  }

  for (const match of masked.matchAll(
    /\bnew\s+Promise\s*(?:<[^>]*>)?\s*\(\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\{?\s*\1\s*\([^;{}]*\)\s*;?\s*\}?\s*\)/gu,
  )) {
    yield {
      ...matchSpan(lineStarts, match),
      rule: "no-promise-constructor-wrapper",
      message: "Wrapping a value in `new Promise` to resolve it immediately is `Promise.resolve` with extra steps. Call `Promise.resolve(value)` \u2014 or, when the expression can throw, return it from an `async` function: the constructor turns a throw into a rejected promise, and `Promise.resolve(expr)` evaluates `expr` first, so it throws synchronously instead.",
    };
  }

  for (const match of masked.matchAll(
    /\.\s*forEach\s*\(\s*\(?\s*[\w$,\s]*\)?\s*=>\s*\{?\s*([\w$.]+)\s*\.\s*push\s*\([^;{}]*\)\s*;?\s*\}?\s*\)/gu,
  )) {
    yield {
      ...matchSpan(lineStarts, match),
      rule: "no-foreach-push",
      message: "A `forEach` whose whole body pushes into an array is a `map` written the long way. Use `map` (or `flatMap`) and bind the result.",
    };
  }
}

function* iterateAssertionFindings(ctx) {
  if (!ctx.isTypeScript) return;
  const { masked, maskedLines, comments, lineStarts } = ctx;

  // Since TS 4.4 a catch binding is `unknown`, so narrowing it with `as Error`
  // is the only way to read `.code`/`.message`. Demanding a SAFETY: comment on
  // every catch block is noise, not evidence. The exemption ends at the
  // handler's closing brace: keyed on the name alone it followed any later
  // variable that happened to be called `error` out of the handler entirely.
  const catchBindings = new Map();
  if (/\bcatch\s*\(\s*[\w$]/u.test(masked)) {
    // One pass pairs every brace and paren, so a handler's extent is a lookup.
    // Rescanning per handler is quadratic on a file whose braces never close.
    const closeBrace = new Map();
    const closeParen = new Map();
    const openBraces = [];
    const openParens = [];
    for (let k = 0; k < masked.length; k += 1) {
      if (masked[k] === "{") openBraces.push(k);
      else if (masked[k] === "}" && openBraces.length) closeBrace.set(openBraces.pop(), k);
      else if (masked[k] === "(") openParens.push(k);
      else if (masked[k] === ")" && openParens.length) closeParen.set(openParens.pop(), k);
    }
    for (const binding of masked.matchAll(/\bcatch\s*\(\s*([\w$]+)/gu)) {
      const from = binding.index + binding[0].length;
      // `catch (`'s own parenthesis. For `catch (e) { ... }` it closes right
      // after the binding; for `.catch(e => ...)` it closes at the end of the
      // call, which bounds an expression-bodied handler that has no block.
      const argsEnd = closeParen.get(binding.index + binding[0].indexOf("(")) ?? masked.length;
      // A block body is either the arrow's, inside those parens, or the
      // statement `catch`'s, immediately after them. Anything else — chiefly
      // `.catch(e => f(e))` — ends with the call. Falling back to the file
      // meant one expression-bodied handler exempted every later `error`.
      const brace = masked.indexOf("{", from);
      const isArrowBlock = brace !== -1 && brace < argsEnd && !/[;}]/u.test(masked.slice(from, brace));
      const isCatchBlock = brace !== -1 && brace > argsEnd && !masked.slice(argsEnd + 1, brace).trim();
      const end = isArrowBlock || isCatchBlock
        ? closeBrace.get(brace) ?? masked.length
        : argsEnd;
      // Offsets, not line numbers: rounding the handler out to whole lines put
      // everything else on its line inside it, so `promise.catch(e => f(e));
      // const user = error as User;` exempted the assertion after the call.
      const range = [binding.index, end];
      const ranges = catchBindings.get(binding[1]);
      if (ranges) ranges.push(range);
      else catchBindings.set(binding[1], [range]);
    }
  }
  const inCatchBlock = (name, offset) =>
    (catchBindings.get(name) ?? []).some(([from, to]) => from <= offset && offset <= to);

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
  // Lines the per-line pass declined to look at, so the multi-line pass below
  // declines the same ones rather than re-deriving the rule.
  const skippedLines = new Set();
  for (let index = 0; index < maskedLines.length; index += 1) {
    const line = maskedLines[index];
    if (!line.trim()) continue;
    if (inSpecifierList) {
      if (line.includes("}")) inSpecifierList = false;
      skippedLines.add(index + 1);
      continue;
    }
    if (SPECIFIER_LIST_OPEN.test(line)) {
      inSpecifierList = true;
      skippedLines.add(index + 1);
      continue;
    }
    if (MODULE_STATEMENT.test(line)) { skippedLines.add(index + 1); continue; }
    const lineNumber = index + 1;
    // Every assertion on the line, not just the first: exempting the catch
    // narrowing in `const a = error as Error, b = payload as User;` used to
    // exempt the whole line, and the second assertion escaped with it.
    // One comment justifies one assertion. `const a = first as A, b = second as
    // B; // SAFETY: first was parsed` says nothing about `second`, so the
    // evidence is spent on the first assertion and the rest of the line needs
    // its own — which in practice means splitting the line.
    let evidence = commentLines.has(lineNumber) || commentLines.has(lineNumber - 1);
    for (const candidate of matchAssertions(line)) {
      // The operand's own offset in the file, not the line's: lineStarts is
      // built over the masked source, which shares every offset with the raw.
      if (candidate[1] && inCatchBlock(candidate[1], lineStarts[index] + candidate.index)) continue;
      // `{ [K in Keys as Rename<K>]: V }` — the `as` of a mapped-type key remap
      // is not an assertion, and the indexed-access suffix made the whole clause
      // look like one. An unclosed `[` with an `in` inside it, immediately
      // before this `as`, is that header and nothing else.
      const asAt = candidate.index + /\bas\s/u.exec(candidate[0]).index;
      if (/\[[^\]]*\bin\b[^\]]*$/u.test(line.slice(0, asAt))) continue;
      if (evidence) { evidence = false; continue; }
      yield {
        line: lineNumber,
        // Point at the `as` itself: the operand is optional in the pattern, so
        // measuring from the match start moved the column onto the type name
        // for `foo.bar as Baz`, where the operand is not captured.
        column: asAt + 1,
        rule: "require-safety-comment-for-type-assertion",
        message: "This type assertion has no `SAFETY:` justification. State the checked invariant immediately before the assertion, or remove it.",
      };
    }
  }

  // Attached to THIS assertion: on its line, or on the line directly above.
  // Every line of a multi-line comment is in commentLines, so the line above is
  // its last line and a `/** SAFETY: ... */` block still counts. The old
  // three-line window was a blanket: one comment exempted every assertion
  // within three lines of it, including ones it says nothing about.
  const unjustified = (offset) => {
    const { line, column } = offsetToPosition(lineStarts, offset);
    if (skippedLines.has(line)) return null;
    if (commentLines.has(line) || commentLines.has(line - 1)) return null;
    return { line, column };
  };

  // An assertion whose TYPE spans lines — `payload as {\n  id: string;\n}` is
  // what a formatter produces — cannot be seen by the per-line pass at all.
  // Only matches that actually cross a newline are taken here, so nothing the
  // loop above already reported can arrive twice.
  for (const candidate of matchAssertions(masked)) {
    // The TYPE has to span lines, not just the whitespace after it: `\s*` before
    // the terminator swallows the trailing newline, so testing the raw match
    // reported single-line assertions here a second time.
    if (!candidate[0].replace(/\s+$/u, "").includes("\n")) continue;
    const asAt = candidate.index + /\bas\s/u.exec(candidate[0]).index;
    if (candidate[1] && inCatchBlock(candidate[1], candidate.index)) continue;
    const lineStart = lineStarts[offsetToPosition(lineStarts, asAt).line - 1];
    if (/\[[^\]]*\bin\b[^\]]*$/u.test(masked.slice(lineStart, asAt))) continue;
    const at = unjustified(asAt);
    if (!at) continue;
    yield {
      ...at,
      rule: "require-safety-comment-for-type-assertion",
      message: "This type assertion has no `SAFETY:` justification. State the checked invariant immediately before the assertion, or remove it.",
    };
  }

  // `<User>payload` is the other assertion syntax, and it was not recognized at
  // all. TS only and never TSX, where the same characters open an element — the
  // caller decides via `angleAssertions`, because a .tsx file has to be excluded
  // even though it is TypeScript.
  if (ctx.angleAssertions) {
    for (const candidate of matchAngleAssertions(masked)) {
      const at = unjustified(candidate.open);
      if (!at) continue;
      yield {
        ...at,
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
  // The separator only justifies when something follows it.
  const separated = rest.indexOf("--");
  if (separated !== -1 && rest.slice(separated + 2).trim()) return true;
  const reason = rest.replace(/[\w@$][\w@$/.]*[-/][\w@$/.-]*/gu, " ");
  return (reason.match(/[A-Za-z]/gu) ?? []).length >= 10;
}

const TEST_FILE_PATTERN = /(?:^|[\\/])(?:__tests__|__mocks__|test|tests|fixtures)[\\/]|\.(?:test|spec)\.[cm]?[jt]sx?$/u;

function* iterateCommentFindings(ctx) {
  const { comments, lineStarts, maskedLines, isTypeScript } = ctx;
  const inTestFile = TEST_FILE_PATTERN.test(ctx.path);
  for (const comment of comments) {
    const start = offsetToPosition(lineStarts, comment.start);
    const endLine = offsetToPosition(lineStarts, Math.max(comment.start, comment.end - 1)).line;
    // Multi-line comments carry their span for the same reason block rules do:
    // the finding is reported at the opener, but the text that triggered it can
    // sit many lines below, and both --since and the hook scope by written line.
    const position = endLine > start.line ? { ...start, endLine } : start;
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
//
// The bar for entry, and the only thing that keeps this set from drifting back
// into a severity ranking: the rule's message must name a replacement that
// preserves behaviour in EVERY case the rule fires. "Do something better here"
// is review, however certain the rule is that the code is wrong. Four rules were
// demoted against this bar — `no-json-clone` (structuredClone keeps a Date a
// Date and ignores toJSON, so it is not the same value), `no-await-promise-
// resolve` (dropping the wrapper drops a microtask tick),
// `no-chained-type-assertions` ("parse or validate instead" is a design, not a
// rewrite), and `no-promise-constructor-wrapper` (`Promise.resolve(p)` IS `p`
// when `p` is already a promise, where the wrapper is a distinct one) — so
// measure a new entry against them, not against how sure you are.
const MECHANICAL_RULES = new Set([
  "no-boolean-literal-ternary", "no-double-negation-condition",
  "no-useless-rethrow", "no-emoji",
  "no-typed-jsdoc", "no-narration-comments", "no-change-note-comments",
  "no-boolean-return-branches", "no-let-if-else-assign",
  "no-obvious-doc-comments",
]);

export function lintSource(rawSource, filePath) {
  const extension = extname(filePath).toLowerCase();
  // A leading BOM is not part of line 1: it defeats the shebang skip and shifts
  // every column on that line by one.
  const source = rawSource.charCodeAt(0) === 0xfeff ? rawSource.slice(1) : rawSource;
  const { masked, comments } = maskSource(source, { jsx: JSX_EXTENSIONS.has(extension) });
  const declaredNames = new Set();
  for (const match of masked.matchAll(SLOP_DECLARATION_PATTERN)) declaredNames.add(match[1]);
  const ctx = {
    path: filePath,
    declaredNames,
    isTypeScript: TYPESCRIPT_EXTENSIONS.has(extension),
    // TS but not TSX: in a .tsx file `<User>` opens an element, not an assertion.
    angleAssertions: TYPESCRIPT_EXTENSIONS.has(extension) && !JSX_EXTENSIONS.has(extension),
    masked,
    maskedLines: masked.split("\n"),
    rawLines: source.split("\n"),
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

// Filesystem identity, not a case-folded path: case-insensitivity is a property
// of the volume, not the platform, so folding by process.platform merged
// `src/A.ts` and `src/a.ts` on a case-sensitive macOS volume and silently
// dropped whichever was collected second. dev+ino also makes two paths to one
// file — including a symlink loop — the same entry for free.
const identity = (stats, target) => (stats.ino ? `${stats.dev}:${stats.ino}` : resolve(target));

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
    // `ln -s . dir/self` recursed until ELOOP, then reported the whole tree as
    // unreadable (exit 2) and counted the same files once per loop turn.
    const dirKey = identity(stats, entry);
    if (scan.seenDirs.has(dirKey)) return;
    scan.seenDirs.add(dirKey);
    let names;
    try {
      names = readdirSync(entry);
    } catch {
      console.error(`slop-check: cannot read ${entry}`);
      scan.unreadable += 1;
      return;
    }
    for (const name of names) {
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
  const key = identity(stats, entry);
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

const QUOTED_PATH_ESCAPES = {
  a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", "\\": "\\", '"': '"',
};

// The path out of a `+++ b/...` header. Git appends a TAB after a path holding
// a space, and quotes any path with a control character, a quote, or a
// backslash; with core.quotepath=false an octal escape is always one ASCII byte.
function diffTargetPath(target) {
  const raw = target.replace(/\t$/u, "");
  const unquoted = raw.length > 1 && raw.startsWith('"') && raw.endsWith('"')
    ? raw.slice(1, -1).replace(/\\([0-7]{3}|[\s\S])/gu, (_, escape) =>
      escape.length === 3 ? String.fromCharCode(parseInt(escape, 8)) : QUOTED_PATH_ESCAPES[escape] ?? escape)
    : raw;
  return unquoted.replace(/^b\//u, "");
}

// Stands in for the line set of a wholly new file: every line is an added line.
const ALL_LINES = { has: () => true };

// Line numbers the diff against `ref` added, per absolute path. Git already
// stores the baseline, so adopting the checker on an existing repo needs no
// baseline file to generate, refresh, or drift.
function addedLines(ref) {
  const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64e6 });
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  const byFile = new Map();

  // A file git has never seen is absent from the diff entirely, so a brand-new
  // source file — the likeliest place for fresh slop, and exactly what the
  // documented `--since=HEAD` before a commit is aimed at — scanned as clean.
  // Every line of it is added.
  for (const name of git(["-C", root, "ls-files", "--others", "--exclude-standard", "-z"]).split("\0")) {
    // Only names the scan would lint anyway are worth a map entry: a trailing
    // slash is an untracked nested repo git refused to descend into, and
    // stat()ing every untracked name made a dangling symlink to an unbuilt
    // asset fail the whole run with exit 2.
    if (!name || name.endsWith("/")) continue;
    const base = name.slice(name.lastIndexOf("/") + 1).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(extname(base)) || base.endsWith(".d.ts")) continue;
    // A directory the recursive scan skips is skipped here too: --exclude-standard
    // drops what .gitignore lists, but a repo that never ignored node_modules or
    // dist would otherwise hand --since its whole vendor tree.
    if (name.split("/").slice(0, -1).some((part) => SKIPPED_DIRECTORIES.has(part))) continue;
    byFile.set(resolve(root, name), ALL_LINES);
  }

  let lines = null;
  // The prefixes are pinned because diff.mnemonicprefix renames `b/` to `w/`,
  // and quotepath is off so a non-ASCII name arrives verbatim, not C-quoted.
  const diff = git([
    "-c", "core.quotepath=false", "diff", "-U0", "--no-color",
    "--src-prefix=a/", "--dst-prefix=b/", "--end-of-options", ref, "--",
  ]);
  // A `+++ ` line is a header only where a header can appear: directly after the
  // `--- ` source line. An added source line reading `++ x;` arrives as
  // `+++ x;` and used to become a path that failed the whole scan.
  let afterSourceHeader = false;
  for (const line of diff.split("\n")) {
    const wasHeader = afterSourceHeader;
    afterSourceHeader = line.startsWith("--- ");
    if (wasHeader && line.startsWith("+++ ")) {
      const target = line.slice(4);
      lines = target === "/dev/null" ? null : new Set();
      if (lines) byFile.set(resolve(root, diffTargetPath(target)), lines);
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
  // `--` ends the options, POSIX-style: everything after it is a path. A source
  // file whose name starts with `-` was otherwise unreachable — it read as an
  // option, went unscanned, and the run still exited 0, which is a clean bill of
  // health for a file nobody looked at.
  const endOfOptions = args.indexOf("--");
  const optionArgs = endOfOptions === -1 ? args : args.slice(0, endOfOptions);
  const json = optionArgs.includes("--json");
  const summaryOnly = optionArgs.includes("--summary");
  const since = optionArgs.find((arg) => arg.startsWith("--since="))?.slice("--since=".length);
  const targets = [
    ...optionArgs.filter((arg) => !arg.startsWith("-")),
    ...(endOfOptions === -1 ? [] : args.slice(endOfOptions + 1)),
  ];
  // Exit 2, not a warning: the run did not do what it was asked, and the whole
  // point of the code is that a scan which skipped something never reports
  // clean. 0 = clean, 1 = findings, 2 = scan failed.
  const unknown = optionArgs.filter(
    (arg) => arg.startsWith("-") && !["--json", "--summary"].includes(arg) && !arg.startsWith("--since="),
  );
  if (unknown.length > 0) {
    console.error(`slop-check: unknown option ${unknown[0]} (use \`-- ${unknown[0]}\` to scan a file with that name)`);
    process.exitCode = 2;
    return;
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

  // `--since` with no paths still means "under here", the same as a bare run:
  // the changed-file map comes from the repository root, so from packages/a it
  // was handing back findings in packages/b. Filtering the map keeps the fast
  // path (visit only changed files) while honouring the directory asked about.
  const cwd = resolve(process.cwd());
  const underCwd = (file) => {
    const rel = relative(cwd, file);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  };
  const scan = { files: [], seen: new Set(), seenDirs: new Set(), unreadable: 0 };
  for (const target of targets.length > 0 ? targets : added ? [...added.keys()].filter(underCwd) : ["."]) {
    collectFiles(target, scan);
  }
  const { files } = scan;

  const findings = [];
  // Files that actually reached lintSource. With `--since`, the collected list
  // includes every file under the target and most are skipped, so reporting
  // `files.length` claimed coverage the scan never had: one changed file beside
  // one unchanged one said "clean (2 files checked)".
  let linted = 0;
  for (const file of files) {
    const changed = added?.get(resolve(file));
    if (added && !changed) continue;
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      // Statted during collection, unreadable now: denied permissions, or the
      // file was deleted mid-scan. Crashing here exits 1, the code the contract
      // already spends on "findings exist".
      console.error(`slop-check: cannot read ${file}`);
      scan.unreadable += 1;
      continue;
    }
    linted += 1;
    const fileFindings = lintSource(source, displayPath(file));
    // Same overlap test the PostToolUse hook uses: a block rule reports at the
    // keyword that opens the block, so testing the anchor line alone dropped
    // findings whose body is exactly what `git diff` reports as changed.
    const touched = (finding) => {
      for (let line = finding.line; line <= (finding.endLine ?? finding.line); line += 1) {
        if (changed.has(line)) return true;
      }
      return false;
    };
    findings.push(...(changed ? fileFindings.filter(touched) : fileFindings));
  }

  const scanned = linted;
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

// Node realpaths the main module, so comparing against the raw argv fails for
// any path with a symlinked component — /tmp on macOS, a junction on Windows,
// a symlinked plugin directory anywhere. The CLI then did nothing at all and
// exited 0, which reads exactly like "clean".
function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  if (import.meta.url === pathToFileURL(entry).href) return true;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    // An unresolvable argv[0] means this is not the entry point; importers
    // (the hook, the tests) must not trigger a scan.
    return false;
  }
}

if (isMainModule()) {
  main();
}
