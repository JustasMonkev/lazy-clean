#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lintSource, RULE_IDS } from "./check.mjs";

const here = dirname(fileURLToPath(import.meta.url));

let failures = 0;

function rulesFor(source, filePath = "sample.ts") {
  return lintSource(source, filePath).map((finding) => finding.rule);
}

function expectRule(description, source, rule, filePath = "sample.ts") {
  const rules = rulesFor(source, filePath);
  if (!rules.includes(rule)) {
    failures += 1;
    console.error(`FAIL ${description}: expected ${rule}, got [${rules.join(", ")}]`);
  } else {
    console.log(`ok   ${description}`);
  }
}

function expectNoRule(description, source, rule, filePath = "sample.ts") {
  const rules = rulesFor(source, filePath);
  if (rules.includes(rule)) {
    failures += 1;
    console.error(`FAIL ${description}: did not expect ${rule}`);
  } else {
    console.log(`ok   ${description}`);
  }
}

// --- type-evidence rules -----------------------------------------------------

expectRule("flags any annotation", "function f(value: any) { return value; }", "no-any");
expectRule("flags any generic", "const items: Array<any> = [];", "no-any");
// A bare alias and a union member disable checking as completely as an
// annotation, and neither position was recognized.
expectRule("flags a bare any alias", "type Payload = any;", "no-any");
expectRule("flags any in a union", "type Maybe = string | any;", "no-any");
expectNoRule("allows an ordinary alias", "type Ok = string;", "no-any");
// A regex after a statement block is a regex, not division: leaving its body
// unmasked linted the pattern's contents as code.
expectNoRule("does not lint inside a regex following a block", "if (ready) {}\n/x: any/.test(text);", "no-any");
expectRule("still lints after an object literal divided by something", "const ratio = {a:1}.a / total;\nconst v: any = 1;", "no-any");
expectNoRule("allows words containing any", "const company: Company = load();", "no-any");
expectNoRule("skips any in plain JS", "const value = x; // : any is not a JS concept", "no-any", "sample.js");
expectNoRule("ignores any inside strings", 'const message = "cast to any";', "no-any");

expectRule("flags chained assertions", "const user = value as unknown as User;", "no-chained-type-assertions");
expectRule("flags unknown alias", "type Payload = unknown;", "no-unknown-alias");
// A formatter splits the declaration, which a line-scoped pattern never saw.
expectRule("flags a multiline unknown alias", "type Payload =\n  unknown;", "no-unknown-alias");
expectRule(
  "flags a multiline unknown alias with a generic parameter",
  "type Boxed<T extends Record<string, unknown>> =\n  unknown;",
  "no-unknown-alias",
);
expectNoRule("allows an unknown type-guard parameter", "function isUser(value: unknown): value is User { return true; }", "no-unknown-alias");
expectNoRule("allows an unknown return at a parse boundary", "function parse(raw: string): unknown { return JSON.parse(raw); }", "no-unknown-alias");
// `unknown` in a signature is the type no-any tells you to reach for: the
// canonical type guard, the parse boundary, the error handler.
expectNoRule("allows unknown return at a parse boundary", "function parse(input: string): unknown { return JSON.parse(input); }", "no-unknown-alias");
expectNoRule("allows unknown parameter in a type guard", "function isUser(value: unknown): value is User { return true; }", "no-unknown-alias");
expectNoRule("allows unknown error parameter", "app.use((cause: unknown, res: Response) => report(cause));", "no-unknown-alias");
expectNoRule("allows unknown in catch", "try { run(); } catch (error: unknown) { log(error); }", "no-unknown-alias");

expectRule("flags object parameter", "function accept(value: object) {}", "no-object-type");
expectNoRule("allows a schema builder call", "const schema = { address: object(addressSchema) };", "no-object-type");
expectRule("flags Record<string, any>", "const cache: Record<string, any> = {};", "no-unsafe-dictionary-type");
expectRule("flags index signature any", "interface Bag { [key: string]: any }", "no-unsafe-dictionary-type");
expectNoRule("allows Record<string, unknown>", "function log(message: string, context?: Record<string, unknown>) {}", "no-unsafe-dictionary-type");
expectNoRule("allows typed Record", "const cache: Record<UserId, User> = init();", "no-unsafe-dictionary-type");

expectRule("flags literal widening", 'const name: string = "claude";', "no-known-value-widening");
expectRule("flags number widening", "let retries: number = 3;", "no-known-value-widening");
expectNoRule("allows inferred literal", 'const name = "claude";', "no-known-value-widening");
expectNoRule("allows non-literal annotation", "const name: string = compute();", "no-known-value-widening");
expectNoRule("allows an annotated exported constant", "const DEFAULT_CONCURRENCY: number = 4;", "no-known-value-widening");

expectRule("flags Reflect.get", "const value = Reflect.get(target, key);", "no-reflect");
expectNoRule(
  "allows Reflect in a Proxy trap",
  "const handler = { get(target, key, receiver) { return Reflect.get(target, key, receiver); } };",
  "no-reflect",
);
expectRule("flags vi.mock", 'vi.mock("./database");', "no-module-mocking");
expectRule("flags jest.mock", 'jest.mock("./database");', "no-module-mocking", "sample.js");

expectRule(
  "flags conditional empty-object spread",
  "const options = { ...(verbose ? { verbose } : {}) };",
  "no-conditional-empty-object-spread",
);
expectNoRule("allows plain spread", "const options = { ...defaults, ...overrides };", "no-conditional-empty-object-spread");

// no-runtime-typeof was removed: narrowing a union with `typeof` is the
// idiomatic TypeScript, `typeof x === "undefined"` is the only environment
// probe there is, and plain JS has no static type to fix. Nothing separated
// those from defensive slop without a type checker, and two corpus runs put the
// rule's precision at zero. These pin the removal.
expectNoRule("allows union narrowing", 'if (typeof value === "string") { use(value); }', "no-runtime-typeof");
expectNoRule("allows environment detection", 'const isBrowser = typeof window !== "undefined";', "no-runtime-typeof");
expectNoRule("allows optional callback detection", 'if (typeof onDone === "function") onDone();', "no-runtime-typeof");

// The malformed-JSX valve looked for a closing tag ANYWHERE in the file, so an
// earlier complete `<div></div>` vouched for a later unclosed `<div>`: the
// tokenizer entered text mode and ran to EOF, hiding every finding below the
// incomplete element — the state a file is in halfway through an edit.
// One closer closes one element. A single `</div>` used to vouch for both
// openers of `<div><div></div>`, leaving the depth positive and masking the rest
// of the file as text.
expectRule(
  "one closing tag does not vouch for two nested openers",
  "const a = <div><div></div>;\nconst value: any = 1;",
  "no-any",
  "sample.tsx",
);
expectRule(
  "a self-closing tag does not consume a later element's closer",
  "const a = <div />;\nconst b = <div>text</div>;\nconst value: any = 1;",
  "no-any",
  "sample.tsx",
);
expectNoRule(
  "well-formed nesting still masks its own text",
  "const a = <div><span>Files are stored as blobs</span></div>;",
  "require-safety-comment-for-type-assertion",
  "sample.tsx",
);
expectRule(
  "an earlier closing tag does not vouch for a later unclosed element",
  "const a = <div></div>;\nconst b = <div>;\nfunction f(value: any) { return value; }",
  "no-any",
  "sample.tsx",
);
expectNoRule(
  "still treats a properly closed element's children as text",
  "const a = <div>Files are stored as blobs</div>;",
  "require-safety-comment-for-type-assertion",
  "sample.tsx",
);
expectRule("flags bare assertion", "const user = payload as User;", "require-safety-comment-for-type-assertion");
// Prose is not code: JSX text nodes are not string literals, so every sentence
// containing "as" used to read as a type assertion.
expectNoRule(
  "allows English prose in JSX",
  "const help = <p>Files are stored as blobs and served as static assets</p>;",
  "require-safety-comment-for-type-assertion",
  "sample.tsx",
);
expectRule(
  "an exported class body is not a specifier list",
  "export class Service {\n  run(input: unknown) {\n    return input as Config;\n  }\n}",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "an exported namespace body is not a specifier list",
  "export namespace API {\n  export const cfg = raw as Config;\n}",
  "require-safety-comment-for-type-assertion",
);
// Requiring a type NAME meant every anonymous form walked past: these are the
// shapes an inline narrowing actually takes.
// `[K in Keys as Rename<K>]` is a mapped-type key remap, not an assertion. The
// corpus caught this on real axios, eslint and type-fest source — and showed
// the rule had been reporting eight of them since before this change.
expectNoRule(
  "does not read a mapped-type key remap as an assertion",
  'type Listener = { [Node in RuleNode as Node["type"]]?: (node: Node) => void };',
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "does not read a templated key remap as an assertion",
  "type Getters<T> = { [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K] };",
  "require-safety-comment-for-type-assertion",
);
// Object and tuple types nest, and a literal type has no name at all.
expectRule("flags a nested object-literal assertion", "const a = payload as { user: { id: string } };", "require-safety-comment-for-type-assertion");
expectRule("flags a nested tuple assertion", "const a = payload as [string, [number, number]];", "require-safety-comment-for-type-assertion");
// An argumentless matcher is a tautology only in one polarity:
// `expect(false).toBeTruthy()` always FAILS, which is a different defect.
expectNoRule("allows a failing truthiness assertion", "expect(false).toBeTruthy();", "no-tautological-assertion", "sample.test.ts");
expectNoRule("allows a failing falsiness assertion", "expect(true).toBeFalsy();", "no-tautological-assertion", "sample.test.ts");
expectNoRule("allows a failing zero truthiness assertion", "expect(0).toBeTruthy();", "no-tautological-assertion", "sample.test.ts");
expectRule("flags a passing truthiness assertion", "expect(true).toBeTruthy();", "no-tautological-assertion", "sample.test.ts");
expectRule("flags a passing falsiness assertion", "expect(0).toBeFalsy();", "no-tautological-assertion", "sample.test.ts");
// A file caught mid-edit: the text after an unterminated quote is still string
// contents, and leaving it bare invented an assertion the file does not have.
expectNoRule(
  "does not read an unterminated string as code",
  'const message = "value as User',
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "still checks the code below an unterminated string",
  'const message = "value as User\nconst real = payload as User;',
  "require-safety-comment-for-type-assertion",
);
// Same mid-edit case for a regex being typed. This checker runs from a
// PostToolUse hook, so a half-written pattern is ordinary input: leaving the
// body bare scanned pattern text as TypeScript and invented findings from it.
expectNoRule(
  "does not read an unterminated regex as code",
  "const pattern = /x: any",
  "no-any",
);
expectNoRule(
  "does not read an unterminated regex as an assertion",
  "const pattern = /value as User",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "still checks the code below an unterminated regex",
  "const pattern = /x: any\nconst value: any = 1;",
  "no-any",
);
// A regex cannot span lines, so an escape at the end of one does not continue
// onto the next: pairing this slash with the one below masked real code away.
expectRule(
  "does not pair an unterminated regex with a slash on the next line",
  "const pattern = /x\\\nconst value: any = 1;/",
  "no-any",
);
// Nesting in a type is arbitrary, so the depth a pattern can balance was the
// wrong thing to tune: every level added was another assertion slipping past.
// The type is scanned now, so these are depth tests only in name.
expectRule(
  "flags an assertion four generic levels deep",
  "const a = payload as Promise<Array<Map<string, Set<User>>>>;",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "flags an assertion six generic levels deep",
  "const a = payload as A<B<C<D<E<F<G>>>>>>;",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "flags an assertion three object levels deep",
  "const a = payload as { u: { p: { id: string } } };",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "flags an assertion three tuple levels deep",
  "const a = payload as [string, [number, [boolean]]];",
  "require-safety-comment-for-type-assertion",
);
// A `<` that is really a comparison must not be scanned as a type: the scan
// stops at the statement end rather than hunting for a `>` down the file.
expectNoRule(
  "does not read a comparison after as-position text as a type",
  "const ok = count as number;\nconst cmp = a < b;\nconst d = c > e;",
  "no-any",
);
// An unfinished template literal is masked to the END of the file, not the end
// of the line: unlike a string or a regex, a template legitimately spans lines,
// so its later lines are template text too.
expectNoRule(
  "does not read an unfinished template literal as code",
  "const message = `value as User",
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "does not read an unfinished template literal as an any annotation",
  "const message = `x: any",
  "no-any",
);
expectNoRule(
  "masks the later lines of an unfinished template literal too",
  "const message = `line one\nvalue as User\nconst v: any = 1;",
  "no-any",
);
// `any` in a LATER type argument disables checking exactly as completely as in
// the first, and `Map<string, any>` is the shape people actually write.
expectRule("flags any as a second type argument", "type Cache = Map<string, any>;", "no-any");
expectRule("flags any as a third type argument", "type T = Fn<A, B, any>;", "no-any");
expectRule("flags any as the first type argument", "type C = Map<any, string>;", "no-any");
// The angle-bracket assertion form goes through the same scanner as `as`, so
// its depth is not capped either.
expectRule(
  "flags a deep angle-bracket assertion",
  "const value = <Promise<Array<Map<string, Set<User>>>>>payload;",
  "require-safety-comment-for-type-assertion",
);
expectRule("flags a plain angle-bracket assertion", "const value = <User>payload;", "require-safety-comment-for-type-assertion");
// Still not an assertion: a generic arrow function, and a comparison.
expectNoRule("a generic arrow function is not an angle assertion", "const identity = <T>(value: T) => value;", "require-safety-comment-for-type-assertion");
expectNoRule("a comparison is not an angle assertion", "const ok = a < b && c > d;", "require-safety-comment-for-type-assertion");
// A closing tag inside a STRING is not the element's closer. Believing it was
// opened a children region that ran past the code below it.
expectNoRule(
  "a closing tag inside a JSX expression string does not open a children region",
  'const el = <div>{"</div>"}\nconst value: any = 1;',
  "no-nothing",
  "sample.tsx",
);
expectRule(
  "code after an unfinished element with a quoted closing tag is still checked",
  'const el = <div>{"</div>"}\nconst value: any = 1;',
  "no-any",
  "sample.tsx",
);
// A nested element inside an attribute hole overwrote the saved tag name, so
// the outer tag's closer was claimed under the inner name and the NEXT
// same-named element lost its prose masking — its text reached the rules.
expectNoRule(
  "prose masking survives a nested tag in an attribute hole",
  'const a = <div title={<span/>}>hello</div>;\nconst b = <span>does any of this survive</span>;',
  "no-any",
  "sample.tsx",
);
// A union collapses to `any` whichever side it is written on.
expectRule("flags any before a union delimiter", "type Cache = Map<string, any | null>;", "no-any");
expectRule("flags any before an intersection delimiter", "type T = A<string, any & B>;", "no-any");
expectRule("flags any after a union delimiter", "type C = Map<string, null | any>;", "no-any");
// A `;` separates object-type members at ANY nesting depth, so it only ends the
// scan outside braces. Testing the outermost opener got the first of these
// right and the second wrong.
expectRule(
  "flags an assertion whose object type is nested in a generic",
  "const a = payload as Promise<{ id: string; name: string }>;",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "flags an assertion with a semicolon-separated object type",
  "const a = payload as { id: string; name: string };",
  "require-safety-comment-for-type-assertion",
);
// A `;` outside braces still ends the scan, so a comparison cannot run away.
expectNoRule(
  "a comparison followed by a statement end is not a type",
  "const ok = count as number;\nconst cmp = a < b;\nconst d = c > e;",
  "no-any",
);
// Every quote form, not just double quotes: a closer inside any of them is not
// the element's closer.
for (const [label, quoted] of [
  ["a single-quoted", "{'</div>'}"],
  ["a double-quoted", '{"</div>"}'],
  ["a template", "{`</div>`}"],
]) {
  expectRule(
    `code after an unfinished element with ${label} closing tag is still checked`,
    `const el = <div>${quoted}\nconst value: any = 1;`,
    "no-any",
    "sample.tsx",
  );
}
// A tuple element is a type position: `[any, string]` erases as much as the
// generic and union forms.
expectRule("flags any as a tuple element", "type Pair = [any, string];", "no-any");
expectRule("flags any as a later tuple element", "type T = [string, any];", "no-any");
// `=>` is one token: counting its `>` as a generic closer ended the type early.
expectRule(
  "flags an assertion whose generic holds a function type",
  "const a = payload as Promise<() => void>;",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "flags an assertion that is a bare function type",
  "const a = payload as () => void;",
  "require-safety-comment-for-type-assertion",
);
// A closing tag inside a LINE COMMENT is not the element's closer. Believing it
// was opened a children region that masked the code above the comment.
expectRule(
  "code above a commented-out closing tag is still checked",
  "const el = <div>\nconst value: any = 1;\n// </div>",
  "no-any",
  "sample.tsx",
);
// ...but a URL in JSX text is not a comment, which is what kept line comments
// out of the pre-pass until the `:` told the two apart.
expectNoRule(
  "a URL in JSX text is not read as a comment",
  "const el = <p>see https://example.com/x for more</p>;\nconst v = 1;",
  "no-filler-comments",
  "sample.tsx",
);
// The destructured form installs the same silent literal as the dotted one.
expectRule(
  "flags a destructured credential default",
  'const { API_TOKEN = "dev-token" } = process.env;',
  "no-env-secret-fallback",
);
expectRule(
  "flags a renamed destructured credential default",
  'const { API_TOKEN: token = "dev-token" } = process.env;',
  "no-env-secret-fallback",
);
expectNoRule(
  "an ordinary destructured default is not a credential",
  'const { PORT = "3000" } = process.env;',
  "no-env-secret-fallback",
);
// no-any matches the TOKEN now, not a list of positions. These are the four
// positions that arrived one review pass at a time, plus the two the corpus
// turned up once the rule stopped enumerating.
for (const [label, source] of [
  ["a return type", "type Handler = () => any;"],
  ["a default type parameter", "interface Box<T = any> { value: T }"],
  ["an annotation", "function f(value: any) { return value; }"],
  ["an assertion", "const a = payload as any;"],
  ["a later type argument", "type Cache = Map<string, any>;"],
  ["a union member", "type U = string | any;"],
  ["a tuple element", "type Pair = [any, string];"],
  ["an array", "const xs: any[] = [];"],
  ["a mapped-type value", "type M = { [K in keyof T]: any };"],
  ["an alias", "type P = any;"],
]) expectRule(`flags any in ${label}`, source, "no-any");
// A VALUE named `any` is not the type: a method declaration and a property key
// are the two shapes the corpus found, and both would be false positives.
expectNoRule("a method named any is not the type", "interface S { any(signals: AbortSignal[]): AbortSignal }", "no-any");
expectNoRule("a property key named any is not the type", "const m = { any: 1 };", "no-any");
expectNoRule("a property access named any is not the type", "const v = matchers.any;", "no-any");
// The word `any` in prose never reaches the rules: the masker blanks comments,
// strings and JSX text first, which is what makes matching the token safe.
expectNoRule("the word any in a comment is not the type", "// call dispose on any handles\nconst x = 1;", "no-any");
expectNoRule("the word any in a string is not the type", 'const msg = "any of these will do";', "no-any");
expectNoRule("the word any in JSX text is not the type", "const el = <p>pick any option</p>;", "no-any", "sample.tsx");

// A protocol-relative URL right after a JSX tag is not a line comment. The `:`
// test alone read it as one, hid the element's real closer, and masked the code
// after it -- a regression from the pass that added line comments here.
expectRule(
  "a protocol-relative URL in JSX text does not hide the closing tag",
  'const el = <div>//cdn.example.com</div>; const value = payload as User;',
  "require-safety-comment-for-type-assertion",
  "sample.tsx",
);
// ...and the commented-out closer that motivated line comments still works.
expectRule(
  "code above a commented-out closing tag is still checked",
  "const el = <div>\nconst value: any = 1;\n// </div>",
  "no-any",
  "sample.tsx",
);

// Every defaulted binding, not the first: an ordinary default in front of a
// credential hid it, because the line runner never retried the later one.
expectRule(
  "flags a credential default after an ordinary one",
  'const { PORT = "3000", API_TOKEN = "dev-token" } = process.env;',
  "no-env-secret-fallback",
);
expectNoRule(
  "ordinary defaults alone are not credentials",
  'const { PORT = "3000", DEBUG = "1" } = process.env;',
  "no-env-secret-fallback",
);
// A template-literal TYPE. Masking blanks the text but keeps both backticks,
// so the type ends at the closing one; without this the scan found no type at
// all and the assertion went unreported.
expectRule(
  "flags an assertion to a template-literal type",
  "const key = raw as `user:${string}`;",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "flags an assertion to a plain template-literal type",
  "const key = raw as `fixed`;",
  "require-safety-comment-for-type-assertion",
);
// A runtime template is still not a type assertion.
expectNoRule(
  "a runtime template after as-shaped prose is not an assertion",
  "const msg = `served as static assets`;",
  "require-safety-comment-for-type-assertion",
);

// A PARAMETER named `any` is a value binding too. declaredNames only collects
// names after a declaration keyword, so the reference in the body was reported
// as the type -- the same false positive as `const any`, one binding form over.
expectNoRule("a parameter named any silences the rule for the file", "function pick(any: number) { return any + 1; }", "no-any");
expectNoRule("an arrow parameter named any counts too", "const f = (any: number) => any + 1;", "no-any");
// ...and a generic argument is not a parameter binding, so coverage stays.
expectRule("a later generic argument is not a parameter binding", "type Cache = Map<string, any>;", "no-any");
expectRule("an annotation is still reported beside ordinary parameters", "function pick(value: any) { return value; }", "no-any");

// `-1` and `1.5` are ordinary numeric literals. The backreference does the
// comparing, so widening the class cannot make two different numbers tautological.
expectRule("flags a negative tautological assertion", "expect(-1).toBe(-1);", "no-tautological-assertion", "sample.test.ts");
expectRule("flags a decimal tautological assertion", "expect(1.5).toEqual(1.5);", "no-tautological-assertion", "sample.test.ts");
expectNoRule("two different numbers are not tautological", "expect(-1).toBe(-2);", "no-tautological-assertion", "sample.test.ts");
expectRule("a negative zero is still falsy for toBeFalsy", "expect(-0).toBeFalsy();", "no-tautological-assertion", "sample.test.ts");
expectRule("flags a string-literal type assertion", 'const a = payload as "ready";', "require-safety-comment-for-type-assertion");
expectRule("flags a numeric-literal type assertion", "const a = payload as 42;", "require-safety-comment-for-type-assertion");
expectRule('flags an indexed-access assertion', 'const a = payload as User["id"];', "require-safety-comment-for-type-assertion");
expectRule("flags a keyed indexed-access assertion", "const a = payload as T[keyof T];", "require-safety-comment-for-type-assertion");
// `<User>payload` is the other assertion syntax, and was not recognized at all.
// The multi-line pass must not re-report what the per-line pass already found:
// `\s*` before the terminator swallows a trailing newline, which made every
// single-line assertion look like it spanned lines.
{
  const once = lintSource("const a = payload as User;\n", "sample.ts")
    .filter((f) => f.rule === "require-safety-comment-for-type-assertion");
  assert.equal(once.length, 1, `reported ${once.length} times`);
  console.log("ok   a single-line assertion is reported exactly once");
}
// A generic arrow function is not an assertion — the type-parameter list is
// followed by a signature, not an operand.
expectNoRule("does not read a generic arrow as an assertion", "const identity = <T>(value: T) => value;", "require-safety-comment-for-type-assertion");
expectNoRule("does not read a constrained generic arrow as an assertion", "const f = <T extends object>(x: T) => x;", "require-safety-comment-for-type-assertion");
expectNoRule("does not read a trailing-comma generic arrow as an assertion", "const g = <T,>(x: T) => x;", "require-safety-comment-for-type-assertion");
// Standard containers compose deeper than two levels.
expectRule("flags a deeply nested generic assertion", "const p = payload as Promise<Array<Map<string, User>>>;", "require-safety-comment-for-type-assertion");
// One comment justifies one assertion, so the rest of the line needs its own.
expectRule(
  "a same-line SAFETY comment does not justify a second assertion",
  "const a = first as A, b = second as B; // SAFETY: first was parsed by schema",
  "require-safety-comment-for-type-assertion",
);
{
  const both = lintSource("const a = first as A, b = second as B;", "sample.ts")
    .filter((f) => f.rule === "require-safety-comment-for-type-assertion");
  assert.equal(both.length, 2, `reported ${both.length}, expected both assertions`);
  console.log("ok   both unjustified assertions on a line are reported");
}
expectRule("flags an angle-bracket assertion", "const user = <User>payload;", "require-safety-comment-for-type-assertion");
expectRule("flags an angle-bracket assertion in a call", "send(<User>payload);", "require-safety-comment-for-type-assertion");
expectNoRule("does not read a generic annotation as an assertion", "const list: Array<User> = [];", "require-safety-comment-for-type-assertion");
expectNoRule("does not read a generic call as an assertion", "const call = parse<User>(raw);", "require-safety-comment-for-type-assertion");
expectNoRule("does not read a comparison as an assertion", "const smaller = a < b;", "require-safety-comment-for-type-assertion");
// In TSX the same characters open an element.
expectNoRule("does not read a JSX element as an assertion", "const el = <div>hi</div>;", "require-safety-comment-for-type-assertion", "sample.tsx");
// A formatter splits the type across lines, which the per-line pass cannot see.
expectRule(
  "flags an assertion whose type spans lines",
  "const user = payload as {\n  id: string;\n};",
  "require-safety-comment-for-type-assertion",
);
// A `SAFETY:` comment justifies the assertion it is attached to, not every
// assertion within three lines of it.
expectRule(
  "a SAFETY comment does not justify an unrelated later assertion",
  "// SAFETY: checked upstream\nconst x = a as Foo;\n\nconst y = b as Bar;",
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "a SAFETY comment justifies the assertion directly below it",
  "// SAFETY: checked upstream\nconst x = a as Foo;",
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "a multi-line SAFETY block justifies the assertion below it",
  "/**\n * SAFETY: validated at the boundary\n */\nconst x = a as Foo;",
  "require-safety-comment-for-type-assertion",
);
expectRule("flags a keyof type assertion", "const a = payload as keyof User;", "require-safety-comment-for-type-assertion");
expectRule("flags a stacked keyof typeof assertion", "const a = payload as keyof typeof config;", "require-safety-comment-for-type-assertion");
expectRule("flags a parenthesized type assertion", "const a = payload as (User & Admin);", "require-safety-comment-for-type-assertion");
expectRule("flags an object-literal type assertion", "const a = payload as { id: string };", "require-safety-comment-for-type-assertion");
expectRule("flags a tuple type assertion", "const a = payload as [string, number];", "require-safety-comment-for-type-assertion");
expectRule("flags a function type assertion", "const a = payload as () => void;", "require-safety-comment-for-type-assertion");
expectRule("flags a typeof type assertion", "const a = payload as typeof User;", "require-safety-comment-for-type-assertion");
// The catch exemption is scoped to the handler. An expression-bodied handler
// has no block, and falling back to the whole file let one `.catch(e => f(e))`
// exempt every later variable named `error`.
expectRule(
  "an expression-bodied catch handler does not exempt the rest of the file",
  "promise.catch(error => handle(error));\nfunction parse(error) { return error as User; }",
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "still allows narrowing inside an expression-bodied catch handler",
  "promise.catch(error => report(error as Error));",
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "still allows narrowing inside a block catch handler",
  "try { run(); } catch (error) { report(error as Error); }",
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "allows aliases in a multi-line import list",
  'import {\n  readFile as read,\n  writeFile as write,\n} from "node:fs/promises";',
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "sees an assertion inside an exported function",
  "export function load(raw: string) {\n  const parsed = JSON.parse(raw) as Config;\n  return parsed;\n}",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "sees an assertion on an export declaration",
  "export const user = payload as User;",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "the catch exemption ends at the handler's closing brace",
  'try { f(); } catch (error) {\n  log(error);\n}\nconst user = error as User;',
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "allows narrowing a catch binding to a domain type",
  'try { f(); } catch (error) {\n  const problem = error as ProblemDetails;\n  return problem.status;\n}',
  "require-safety-comment-for-type-assertion",
);
// The exemption covers the narrowing, not the line: a second, unrelated
// assertion sharing it is still the thing the rule exists to ask about.
expectRule(
  "an unrelated assertion beside an exempt catch narrowing is still reported",
  'try { f(); } catch (error) {\n  const a = error as Error, b = payload as User;\n}',
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "allows narrowing in a promise catch callback",
  'load().catch(error => {\n  const fault = error as NodeJS.ErrnoException;\n  report(fault);\n});',
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "allows narrowing a catch binding",
  'try { read(); } catch (cause) {\n  const error = cause as NodeJS.ErrnoException;\n  if (error.code === "ENOENT") return;\n}',
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "allows assertion with SAFETY comment",
  "// SAFETY: payload was validated by the schema above.\nconst user = payload as User;",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "flags an assertion to a readonly array",
  "const users = payload as readonly User[];",
  "require-safety-comment-for-type-assertion",
);
expectNoRule("allows as const", "const modes = ['a', 'b'] as const;", "require-safety-comment-for-type-assertion");
expectNoRule("allows import alias", 'import { readFile as read } from "node:fs";', "require-safety-comment-for-type-assertion");

// --- pointless-code rules ----------------------------------------------------

// The rule's premise is "declared only to be assigned". A branch that READS the
// variable breaks it, and the `const` rewrite the message names would throw on
// the temporal dead zone.
expectNoRule(
  "allows a let whose branch reads the variable it initializes",
  "let value;\nif (enabled) value = value || fallback;\nelse value = other;",
  "no-let-if-else-assign",
);
// A property that happens to share the variable's name is not a read of it.
// Counting it as one silenced this rule on real eslint, playwright and corepack
// code — `name = nameOrOptions.name` is exactly the shape the rule exists for.
expectRule(
  "a same-named property is not a self-reference",
  "let name;\nif (isObject) name = options.name;\nelse name = options;",
  "no-let-if-else-assign",
);
expectRule(
  "still flags a let assigned from unrelated expressions",
  "let value;\nif (enabled) value = first;\nelse value = second;",
  "no-let-if-else-assign",
);
// `$` is an identifier character and a regex anchor: unescaped, the name-match
// guards could never fire on a variable containing one.
expectRule(
  "matches a binding whose name contains a dollar sign",
  "try { run(); } catch (err$) { console.error(err$); throw err$; }",
  "no-log-and-rethrow",
);
// Formatting the executor is not a fix: the block-bodied form is the same sleep.
expectRule(
  "flags a block-bodied hard-coded sleep",
  "const wait = new Promise(resolve => { setTimeout(resolve, 1000); });",
  "no-arbitrary-sleep",
);
// The built-in error constructors are callable without `new`, and lose the
// stack the same way. A helper whose name merely ends in Error is not one.
expectRule(
  "flags a callable Error rethrow",
  "try { run(); } catch (error) { throw Error(error.message); }",
  "no-message-only-rethrow",
);
expectNoRule(
  "does not read a helper call as an error constructor",
  "try { run(); } catch (error) { throw toError(error.message); }",
  "no-message-only-rethrow",
);
// A formatter splits an empty declaration across lines, which is the spelling a
// line-at-a-time pattern could never see.
expectRule(
  "flags an empty interface written across lines",
  "interface Marker {\n}",
  "no-empty-type-declaration",
);
expectRule("flags an empty type alias across lines", "type Marker = {\n};", "no-empty-type-declaration");
// `= {}` after a type parameter is its DEFAULT, not an empty alias. Reachable
// only once the rule crossed lines, and it fired on real eslint source.
expectNoRule(
  "does not read a default type parameter as an empty alias",
  "export type R<O extends Partial<X> = {}> = Custom<O>;",
  "no-empty-type-declaration",
);
expectNoRule("allows an interface with fields", "interface Shape {\n  width: number;\n}", "no-empty-type-declaration");
// Masking keeps a literal's width and offsets but blanks its contents, so these
// two are indistinguishable on the masked line and only the raw text separates
// a tautology from a real assertion.
expectRule("flags a string asserted against itself", 'expect("ok").toBe("ok");', "no-tautological-assertion", "sample.test.ts");
expectNoRule("allows a string asserted against a different one", 'expect("ok").toBe("different");', "no-tautological-assertion", "sample.test.ts");
// Bracket access is the same lookup; the key is masked, so the rule has to read
// it off the raw line to tell a credential from a port number.
expectRule(
  "flags a bracket-form credential fallback",
  'const token = process.env["API_TOKEN"] || "development-token";',
  "no-env-secret-fallback",
);
expectNoRule(
  "allows a bracket-form fallback for a non-credential",
  'const port = process.env["PORT"] || "3000";',
  "no-env-secret-fallback",
);
// The handler ends at its call, not at the end of its line.
expectRule(
  "an expression-bodied handler does not exempt the rest of its own line",
  "promise.catch(error => handle(error)); const user = error as User;",
  "require-safety-comment-for-type-assertion",
);
expectRule("flags useless rethrow", "try { run(); } catch (error) { throw error; }", "no-useless-rethrow");
expectNoRule("allows wrapping rethrow", "try { run(); } catch (error) { throw new AppError(error); }", "no-useless-rethrow");

expectRule("flags empty catch", "try { run(); } catch {}", "no-empty-catch");
expectNoRule("allows justified empty catch", "try { run(); } catch { /* best-effort cleanup */ }", "no-empty-catch");

// A bare marker justifies nothing: the comment that ADMITS the debt was
// silencing the rule that reports it.
expectRule("a TODO does not justify an empty catch", "try { run(); } catch { /* TODO */ }", "no-empty-catch");
expectRule("a TODO with a task does not justify one either", "try { run(); } catch { /* TODO: fix */ }", "no-empty-catch");
expectNoRule(
  "a reason carrying a TODO still justifies it",
  "try { run(); } catch { /* TODO: the cache is advisory, a miss is fine */ }",
  "no-empty-catch",
);
expectRule("a TODO does not justify fake success", "try { return load(); } catch { /* TODO */ return null; }", "no-catch-fake-success");
expectRule("flags catch returning null", "try { return load(); } catch { return null; }", "no-catch-fake-success");
expectRule("flags catch returning empty array", "try { return load(); } catch (error) { return []; }", "no-catch-fake-success");
expectNoRule(
  "allows justified fallback",
  "try { return load(); } catch { /* offline mode falls back to empty state */ return null; }",
  "no-catch-fake-success",
);

expectRule("flags JSON clone", "const copy = JSON.parse(JSON.stringify(state));", "no-json-clone");
expectRule("flags ?? undefined", "const value = input ?? undefined;", "no-redundant-fallback");
// `|| undefined` maps "" and 0 to undefined; that is how an optional field gets
// omitted from a payload, not a no-op.
expectNoRule("allows || undefined", "const company = input.company || undefined;", "no-redundant-fallback");
expectRule("flags === true", "if (enabled === true) { run(); }", "no-boolean-literal-compare");
expectNoRule("allows !== true tri-state", "if (flag !== true) { run(); }", "no-boolean-literal-compare");
expectNoRule("allows normalizing an untyped value", "config.hideStatus = hide === true;", "no-boolean-literal-compare");
// The exemption covers the normalization, not the line it sits on: a redundant
// comparison sharing the line is still the thing this rule exists to catch.
expectRule(
  "a redundant comparison beside a normalization is still reported",
  "if (enabled === true) normalized = input === true;",
  "no-boolean-literal-compare",
);
expectNoRule("allows comparing a parsed property", "if (parsed.enabled === true) run();", "no-boolean-literal-compare");
// Kept deliberately, and measured rather than assumed: widening the operand to
// properties and calls added 286 findings across 5,115 files, and the sample
// was narrowing every time -- `payload.isAxiosError === true` guarding an
// unknown, `node.optional === true` on a `boolean | undefined` AST field,
// `process.browser === true` on an ambient global. Same reason `!== true` is
// exempt: off a property, `=== true` usually distinguishes true from undefined.
expectNoRule("allows comparing a call result", "if (parser.testLine(line) === true) run();", "no-boolean-literal-compare");
expectNoRule("allows comparing an optional-chained property", "if (flags?.on === true) run();", "no-boolean-literal-compare");

// `any` is not a reserved word, so a file may bind it as a value. The
// token-wide rule reported the declaration AND the reference -- valid,
// type-safe code the checker was telling an agent to rewrite.
expectNoRule("a file that binds any as a value is left alone", "const any = 1;\nconsole.log(any);", "no-any");
expectNoRule("the reference to a bound any is left alone too", "let any = 1;\nconst x: string = String(any);", "no-any");
// ...and a file that does NOT bind it keeps full coverage.
expectRule("a file that does not bind any still reports the type", "const value: any = 1;", "no-any");

// A comment is evidence only when it says something. A bare marker above a
// hard-coded sleep is the most likely comment to find there, and it silenced
// the rule outright.
expectRule(
  "a TODO does not justify a hard-coded sleep",
  "// TODO\nawait new Promise(resolve => setTimeout(resolve, 1000));",
  "no-arbitrary-sleep",
);
expectRule(
  "an unrelated one-word comment does not justify a sleep",
  "// wip\nawait new Promise(resolve => setTimeout(resolve, 1000));",
  "no-arbitrary-sleep",
);
expectNoRule(
  "a real justification still silences a sleep",
  "// the device needs a second to settle after reset\nawait new Promise(resolve => setTimeout(resolve, 1000));",
  "no-arbitrary-sleep",
);
expectRule("flags if (!!x)", "if (!!user) { greet(user); }", "no-double-negation-condition");
expectNoRule("allows !! in assignment", "const hasUser = !!user;", "no-double-negation-condition");
// A conditional TYPE is not a runtime ternary: `Boolean(...)` is not syntax in
// type space, so the rewrite this rule names cannot be applied there at all.
expectNoRule(
  "allows a conditional type predicate",
  "type IsString<T> = T extends string ? true : false;",
  "no-boolean-literal-ternary",
);
// Conditional types nest, so a span-scoped exemption just uncovered the outer
// one — the line has to be skipped, not a span of it.
expectNoRule(
  "allows a nested conditional type predicate",
  "type A<T> = T extends string ? true : ((T extends [T] ? false : true) : never) ? false : true;",
  "no-boolean-literal-ternary",
);
expectRule(
  "still flags a runtime boolean ternary",
  "const flag = ready ? true : false;",
  "no-boolean-literal-ternary",
);
expectRule("flags boolean literal ternary", "const ready = count > 0 ? true : false;", "no-boolean-literal-ternary");
expectRule("flags await Promise.resolve", "const value = await Promise.resolve(compute());", "no-await-promise-resolve");

expectRule(
  "flags V2 name beside the version it replaced",
  "function parseConfig(input: string) {}\nfunction parseConfigV2(input: string) {}",
  "no-slop-symbol-names",
);
expectRule("flags enhanced prefix", "const enhancedFetch = wrap(fetch);", "no-slop-symbol-names");
expectRule("flags Enhanced suffix", "class UserServiceEnhanced {}", "no-slop-symbol-names");
expectRule(
  "flags New suffix beside the class it replaced",
  "class UserService {}\nclass UserServiceNew {}",
  "no-slop-symbol-names",
);
expectNoRule("allows newUser", "const newUser = createUser();", "no-slop-symbol-names");
// The suffix is only an edit artifact when the thing it was cloned from is
// still in the file. On its own it is an ordinary name.
expectNoRule("allows lastUpdated", "const lastUpdated = new Date();", "no-slop-symbol-names");
expectNoRule("allows deepCopy", "function deepCopy<T>(value: T): T { return structuredClone(value); }", "no-slop-symbol-names");
expectNoRule("allows a versioned API name", "interface PaymentV2 { id: string }", "no-slop-symbol-names");
expectNoRule("allows currentTemp", "let currentTemp = 20;", "no-slop-symbol-names");
expectRule("flags shape in names", "const userShape = build();", "no-shape-in-symbol-names");
expectNoRule("allows shape as the domain", "interface Shape { radius: number }", "no-shape-in-symbol-names");
expectNoRule(
  "reads geometry context from the whole file, not one line",
  "export type Shape =\n  | { kind: 'circle'; radius: number }\n  | { kind: 'rect'; width: number };",
  "no-shape-in-symbol-names",
);
// The declaration can sit well below the union that gives it meaning.
expectNoRule(
  "allows a shape class declared far below its domain",
  `export type Shape = { kind: 'circle'; radius: number };\n${"\n".repeat(12)}export class ShapeLayer {}`,
  "no-shape-in-symbol-names",
);
// The word list is what keeps the rule alive. It once held `path`, `render` and
// `draw`, which are identifiers in most server and React files, so a single
// distant import disarmed the rule for the whole file.
expectRule(
  "an unrelated path import does not disarm the rule",
  `import path from "node:path";\n${"\n".repeat(8)}const shapeData = load();`,
  "no-shape-in-symbol-names",
);
expectRule(
  "a render call does not disarm the rule",
  "function render(el) { return el; }\nconst nodeShape = build();",
  "no-shape-in-symbol-names",
);

// --- comment rules -----------------------------------------------------------

expectRule("flags in-a-real-app comment", "// In a real app, fetch this from the API\nconst users = [];", "no-filler-comments");
expectRule("flags simulate comment", "// Simulate network latency\nawait delay(100);", "no-filler-comments");
expectNoRule("allows simulating a physical system", "// Simulate one fixed timestep of the rigid-body solver.\nstep(dt);", "no-filler-comments");
expectNoRule("allows documenting a placeholder prop", "/** Placeholder text for the search box. */\nplaceholder?: string;", "no-filler-comments");
expectNoRule(
  "allows mock vocabulary in a test file",
  "// Mock response captured from the billing sandbox.\nconst body = load();",
  "no-filler-comments",
  "billing.test.ts",
);
expectRule("flags truncation ellipsis comment", "// ...\nrun();", "no-filler-comments");
expectRule("flags rest-of-code comment", "// rest of the implementation unchanged\nrun();", "no-filler-comments");
expectRule("flags not-implemented comment", "// not implemented\nrun();", "no-filler-comments");
expectNoRule("allows HTTP 501 status name", "// 501 (Not Implemented) and 505 are excluded from retries.\nrun();", "no-filler-comments");
expectRule("flags narration comment", "// First, we validate the input\nvalidate(input);", "no-narration-comments");
expectRule("flags lets comment", "// Let's set up the router\nconst router = createRouter();", "no-narration-comments");
expectRule("flags change-note comment", "// Added this to make the linter happy\nconst unused = 1;", "no-change-note-comments");
expectRule("flags as-requested comment", "// Renamed as requested\nconst total = sum(items);", "no-change-note-comments");
expectNoRule("allows citing a spec", "// Fields are numbered as per RFC 8949 section 3.1.\nconst tag = 0;", "no-change-note-comments");
expectRule("flags backcompat comment", "// kept for backwards compatibility\nexport const oldName = newName;", "no-backcompat-comments");
expectNoRule(
  "allows the @deprecated JSDoc tag",
  "/** @deprecated Use `createSession` instead. */\nexport function create() {}",
  "no-backcompat-comments",
);
expectNoRule("allows kept-for prose", "// The retry budget is kept for the lifetime of the connection.\nrun();", "no-backcompat-comments");
expectRule("flags emoji comment", "// ✅ validation passed\nrun();", "no-emoji");
expectNoRule("allows a text-presentation check mark", "// ✓ marks a passing row in the summary table.\nrun();", "no-emoji");
expectNoRule("allows a text-presentation warning sign", "// ⚠ Callers must hold the write lock here.\nrun();", "no-emoji");
expectRule("flags an emoji-presentation warning sign", "// ⚠️ this path is slow\nrun();", "no-emoji");
expectRule(
  "flags typed jsdoc in TS",
  "/**\n * @param {string} name - the name\n */\nfunction greet(name: string) {}",
  "no-typed-jsdoc",
);
expectNoRule(
  "allows typed jsdoc in JS",
  "/**\n * @param {string} name\n */\nfunction greet(name) {}",
  "no-typed-jsdoc",
  "sample.js",
);
expectRule("flags restating comment", "// get the user name\nconst value = getUserName(user);", "no-restating-comments");
expectNoRule("allows a two-word section header", "// Public API\nexport const publicApi = { version: 1 };", "no-restating-comments");
expectNoRule("allows a comment naming a transform", "// Union to intersection converter\ntype UnionToIntersection<U> = U;", "no-restating-comments");
expectNoRule("allows informative comment", "// Milliseconds; the upstream API rejects sub-second precision.\nconst timeout = 30000;", "no-restating-comments");


// --- error-handling slop -----------------------------------------------------

expectRule("flags log-and-rethrow", "try { run(); } catch (error) { console.error(error); throw error; }", "no-log-and-rethrow");
expectRule("flags logger log-and-rethrow", "try { run(); } catch (err) { logger.warn('failed', err); throw err; }", "no-log-and-rethrow");
expectNoRule("allows logging a handled error", "try { run(); } catch (error) { console.error(error); return null; }", "no-log-and-rethrow");
expectNoRule("allows logging separate context before a rethrow", "try { run(); } catch (error) { log.error('dist-tag ls', spec); throw error; }", "no-log-and-rethrow");

expectRule("flags message-only rethrow", "try { run(); } catch (error) { throw new Error(error.message); }", "no-message-only-rethrow");
expectRule("flags interpolated message-only rethrow", "try { run(); } catch (e) { throw new TypeError(`load failed: ${e.message}`); }", "no-message-only-rethrow");
expectNoRule("allows wrapping with cause", "try { run(); } catch (error) { throw new Error(`load failed: ${error.message}`, { cause: error }); }", "no-message-only-rethrow");
expectNoRule("allows a fresh error", "try { run(); } catch (error) { throw new ConfigError('config is unreadable'); }", "no-message-only-rethrow");

// --- pointless control flow --------------------------------------------------

expectRule("flags boolean return branches", "function ok(x) { if (x > 0) { return true; } else { return false; } }", "no-boolean-return-branches");
expectRule("flags braceless boolean return branches", "function ok(x) { if (x) return false; else return true; }", "no-boolean-return-branches");
expectNoRule("allows a guard clause before a loop result", "function ok(xs) { for (const x of xs) { if (x.bad) return false; }\n  return true; }", "no-boolean-return-branches");
expectNoRule("allows returning values from both branches", "function pick(x) { if (x) { return 'on'; } else { return 'off'; } }", "no-boolean-return-branches");
// The condition is often not boolean — `return xs.length` turns a boolean API
// into a number — and this rule prints under the mechanical heading, where the
// message is meant to be the one correct answer.
const looseBranches = lintSource("function ok(xs) { if (xs.length) return true; else return false; }", "sample.js");
assert.equal(looseBranches[0].rule, "no-boolean-return-branches");
assert.match(looseBranches[0].message, /Return the condition, wrapped in `Boolean/u);
const invertedBranches = lintSource("function ok(xs) { if (xs.length) return false; else return true; }", "sample.js");
assert.match(invertedBranches[0].message, /Return its negation, wrapped in `Boolean/u);
console.log("ok   boolean return branches keep the coercion and the polarity");

// Structured logging is the common spelling: rejecting braces in the argument
// list made `logger.error({ err: e }, "failed")` report clean while the
// positional form reported.
expectRule("flags a structured log and rethrow", 'try { run(); } catch (e) { logger.error({ err: e }, "failed"); throw e; }', "no-log-and-rethrow");
expectRule("flags a nested structured log and rethrow", 'try { run(); } catch (e) { logger.error({ ctx: { err: e } }, "failed"); throw e; }', "no-log-and-rethrow");
expectRule("still flags the positional form", 'try { run(); } catch (e) { logger.error(e, "failed"); throw e; }', "no-log-and-rethrow");
// The log still has to MENTION the caught error: separate context before a
// rethrow is deliberate, and the braces must not have loosened that.
expectNoRule("allows a structured log that does not mention the error", 'try { run(); } catch (e) { logger.error({ url: target }, "failed"); throw e; }', "no-log-and-rethrow");

expectRule("flags let assigned in both branches", "let label;\nif (flag) {\n  label = 'on';\n} else {\n  label = 'off';\n}", "no-let-if-else-assign");
expectRule("flags annotated let assigned in both branches", "let label: string;\nif (flag) label = 'on';\nelse label = 'off';", "no-let-if-else-assign");
expectNoRule("allows a branch that does more than assign", "let n;\nif (isRange) {\n  n = split(body);\n} else {\n  n = parse(body);\n  n = n.map(embrace);\n}", "no-let-if-else-assign");
expectNoRule("allows an accumulator loop", "let total = 0;\nfor (const value of values) total += value;", "no-let-if-else-assign");
// A write after the branches means the variable is not declared only for them,
// and this rule prints under "one correct answer": the `const` it prescribes
// would not compile, because the later line reassigns it.
// A DESTRUCTURED parameter binding named `any` is a value, not the type. This
// rule fires from a PostToolUse hook, so a finding here tells an agent to
// rewrite type-safe code.
expectNoRule("allows a destructured parameter binding named any", "function pick({ any }: { any: number }) { return any + 1; }", "no-any");
expectNoRule("allows a destructured binding named any in an arrow", "const f = ({ any }: Props) => any + 1;", "no-any");
expectNoRule("allows a destructured binding named any with a default", "function pick({ any = 1 }) { return any; }", "no-any");
// `{ any: renamed }` binds `renamed`, not `any` -- the name before a `:` is a
// property key, so the file has no value called `any` and the type still counts.
expectRule("a renamed destructured property does not bind any", "function f({ any: renamed }) { const x: any = 1; return renamed; }", "no-any");
// The guard is file-wide, so a shape it wrongly accepted would silence every
// finding in the file. `]` is not a terminator for exactly this reason.
expectRule("a tuple type containing any is not a binding", "const pair: [string, any] = [\"a\", 1];", "no-any");
expectRule("a Record value type of any is not a binding", "const map: Record<string, any> = {};", "no-any");
expectRule("a function type parameter of any is not a binding", "const fn: (a: string, b: any) => void = noop;", "no-any");

expectNoRule("allows a let written again after the branches", "let value;\nif (flag) value = first;\nelse value = second;\nvalue = third;", "no-let-if-else-assign");
expectNoRule("allows a let compound-assigned after the branches", "let value;\nif (flag) value = first;\nelse value = second;\nvalue += extra;", "no-let-if-else-assign");
expectNoRule("allows a let incremented after the branches", "let value;\nif (flag) value = first;\nelse value = second;\nvalue++;", "no-let-if-else-assign");
// The span stops at the end of the enclosing block, so a same-named variable in
// a sibling scope does not silence the rule, and `===` is not a write.
expectRule("still flags when a sibling scope writes the same name", "function a() {\n  let value;\n  if (flag) value = first;\n  else value = second;\n  return value;\n}\nfunction b() {\n  let value = 0;\n  value = 9;\n  return value;\n}", "no-let-if-else-assign");
expectRule("still flags when the later line only compares", "let value;\nif (flag) value = first;\nelse value = second;\nreturn value === limit;", "no-let-if-else-assign");

// --- promise slop ------------------------------------------------------------

expectRule("flags promise constructor wrapper", "export function wrap(value) { return new Promise((resolve) => resolve(value)); }", "no-promise-constructor-wrapper");
expectRule("flags block-bodied promise wrapper", "const p = new Promise<number>((resolve) => { resolve(compute()); });", "no-promise-constructor-wrapper");
expectNoRule("allows a real promise adapter", "const p = new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });", "no-promise-constructor-wrapper");

expectRule("flags a hard-coded sleep", "await new Promise((resolve) => setTimeout(resolve, 500));", "no-arbitrary-sleep");
expectNoRule("allows a parameterised sleep helper", "export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));", "no-arbitrary-sleep");
expectNoRule("allows a justified sleep", "// The vendor API rejects bursts inside a 200ms window.\nawait new Promise((resolve) => setTimeout(resolve, 200));", "no-arbitrary-sleep");

// --- collection slop ---------------------------------------------------------

expectRule("flags forEach push", "const ids = [];\nrows.forEach((row) => ids.push(row.id));", "no-foreach-push");
expectRule("flags block-bodied forEach push", "tokens.forEach((token) => {\n  table.push([token.id, token.created]);\n});", "no-foreach-push");
expectNoRule("allows forEach with more than a push", "rows.forEach((row) => {\n  const name = row.name.trim();\n  if (name) out.push(name);\n});", "no-foreach-push");
expectNoRule("allows a for-of push", "for (const row of rows) ids.push(row.id);", "no-foreach-push");

// --- type and config slop ----------------------------------------------------

expectRule("flags empty interface", "interface Options {}", "no-empty-type-declaration");
expectRule("flags empty type alias", "type Extra = {};", "no-empty-type-declaration");
expectNoRule("allows an extending interface", "interface Props extends React.HTMLAttributes<HTMLDivElement> {}", "no-empty-type-declaration");
expectNoRule("allows a populated interface", "interface Options { retries: number }", "no-empty-type-declaration");

expectRule("flags a secret default", "const token = process.env.API_SECRET || 'dev-secret';", "no-env-secret-fallback");
expectRule("flags an empty key default", "const key = process.env.STRIPE_KEY ?? '';", "no-env-secret-fallback");
expectNoRule("allows a non-secret default", "const env = process.env.NODE_ENV || 'development';", "no-env-secret-fallback");
expectNoRule("allows a key-prefix default", "const prefix = process.env.CACHE_KEY_PREFIX ?? 'app';", "no-env-secret-fallback");

// --- test slop ---------------------------------------------------------------

expectRule("flags tautological assertion", "it('works', () => { expect(true).toBe(true); });", "no-tautological-assertion");
expectRule("flags tautological equality", "expect(false).toEqual(false);", "no-tautological-assertion");
expectNoRule("allows asserting a computed boolean", "expect(isPaid(invoice)).toBe(true);", "no-tautological-assertion");
expectNoRule("allows asserting a number", "expect(totalItems(state)).toBe(4);", "no-tautological-assertion");

// --- suppression and doc slop ------------------------------------------------

expectRule("flags bare ts-ignore", "// @ts-ignore\nconst parsed = legacyParse(input);", "no-unjustified-suppression");
expectRule("flags ts-expect-error without a reason", "// @ts-expect-error broken\nconst parsed = legacyParse(input);", "no-unjustified-suppression");
expectNoRule("allows an explained suppression", "// @ts-expect-error the vendored declaration is missing the strict option\nconst parsed = legacyParse(input, { strict: true });", "no-unjustified-suppression");
expectNoRule("allows an ordinary comment", "// Parses the vendored payload.\nconst parsed = legacyParse(input);", "no-unjustified-suppression");
// The `--` separator is the convention for the reason, not the reason itself.
expectRule(
  "flags a suppression whose separator is followed by nothing",
  "// @ts-ignore --\nconst parsed = legacyParse(input);",
  "no-unjustified-suppression",
);
expectNoRule(
  "allows a reason after the separator",
  "// @ts-expect-error -- the vendored types omit the strict option\nconst parsed = legacyParse(input, { strict: true });",
  "no-unjustified-suppression",
);

expectRule("flags a Constructor doc comment", "/** Constructor */\nexport class AuthClient {}", "no-obvious-doc-comments");
expectRule("flags a this-function doc comment", "/**\n * This function returns the current token.\n */\ngetToken() { return this.token; }", "no-obvious-doc-comments");
expectNoRule("allows a doc comment that adds information", "/** Aggregates rows into per-name totals, dropping zero-count rows. */\nexport function summarize(rows) {}", "no-obvious-doc-comments");
expectNoRule("allows an informative this-function note", "// This function is used recursively from IndexedSourceMapConsumer.\nfunction sourceContentFor(source) {}", "no-obvious-doc-comments");
// This rule prints as a mechanical "delete the comment", so an accessor doc
// that carries a contract the declaration does not state cannot be swept up
// with the ones that only restate the name.
expectRule("flags a bare getter doc comment", "/** Getter for the value. */\nget value() { return this.v; }", "no-obvious-doc-comments");
expectNoRule("allows a getter doc with a second clause", "/** Getter for the cached value; invalidated after every write. */\nget value() { return this.v; }", "no-obvious-doc-comments");
expectNoRule("allows a getter doc with a second sentence", "/** Getter for the value. Returns undefined when empty. */\nget value() { return this.v; }", "no-obvious-doc-comments");
expectNoRule("allows a getter doc with a qualifying clause", "/** Getter for the value, which is recomputed lazily. */\nget value() { return this.v; }", "no-obvious-doc-comments");
// The bare forms are a separate alternative and must be unaffected.
expectRule("still flags a bare Getter doc comment", "/** Getter. */\nget value() { return this.v; }", "no-obvious-doc-comments");
// From the corpus: eslint's version getter. JSDoc TAGS are not prose, and the
// first cut of this fix lost the finding because the body did not end at the
// sentence -- `@static` and `@returns` were standing in for information.
expectRule(
  "a restating getter doc followed by JSDoc tags is still flagged",
  "/**\n * Getter for package version.\n * @static\n * @returns {string} The version from package.json.\n */\nstatic get version() { return pkg.version; }",
  "no-obvious-doc-comments",
  // JavaScript, as the corpus file is: in TypeScript the typed-JSDoc rule
  // claims this comment first, which is a different finding on the same text.
  "sample.js",
);

// TypeScript requires the directive on the line directly above the error, so
// the reason usually sits above THAT. Demanding it on the directive line is the
// rule failing to read a reason that is already written down.
expectNoRule(
  "allows a suppression explained in the comment directly above it",
  "// The upstream types omit this export, tracked in vendor issue 91.\n// @ts-expect-error\nimport { thing } from \"vendor\";",
  "no-unjustified-suppression",
);
expectRule(
  "still flags a bare suppression with nothing above it",
  "const gap = 1;\n// @ts-expect-error\nimport { thing } from \"vendor\";",
  "no-unjustified-suppression",
);
// Two bare directives in a row justify nothing, and a one-word comment is not
// a reason -- isJustification() wants at least two words.
expectRule(
  "a directive above another directive does not justify it",
  "// @ts-expect-error\n// @ts-expect-error\nimport { thing } from \"vendor\";",
  "no-unjustified-suppression",
);
expectRule(
  "a one-word comment above does not justify it",
  "// ok\n// @ts-expect-error\nimport { thing } from \"vendor\";",
  "no-unjustified-suppression",
);
// From the corpus: prettier's `// @ts-expect-error: fine` under a `@param` /
// `@returns` block. A `/** */` block above documents the DECLARATION -- it says
// nothing about why the checker is wrong -- and the first cut of this fix
// accepted it and dropped three real findings.
expectRule(
  "a JSDoc block above does not justify a suppression",
  "/**\n * @param {Error} error\n * @returns {Error}\n */\n// @ts-expect-error: fine\nfunction wrap(error) { return error; }",
  "no-unjustified-suppression",
);
expectRule(
  "an explanation separated by code does not justify it",
  "// The reason, but with a statement below it.\nconst spaced = 2;\n// @ts-expect-error\nimport { thing } from \"vendor\";",
  "no-unjustified-suppression",
);


// --- JSX text is prose, not code ---------------------------------------------

expectNoRule(
  "does not read JSX prose as a type assertion",
  "function Hint() {\n  return <p>Treat the number as guidance, not a target.</p>;\n}",
  "require-safety-comment-for-type-assertion",
  "sample.tsx",
);
expectNoRule(
  "does not read a repeated 'as' in JSX prose as chained assertions",
  "const help = <p>Retry as soon as the network returns.</p>;",
  "no-chained-type-assertions",
  "sample.tsx",
);
expectRule(
  "still sees code inside a JSX hole",
  "const el = <div>{payload as User}</div>;",
  "require-safety-comment-for-type-assertion",
  "sample.tsx",
);
expectRule(
  "still sees code in a JSX attribute",
  "const el = <div title={value as any} />;",
  "no-any",
  "sample.tsx",
);
expectRule(
  "still sees a JSX comment",
  "const el = <div>{/* placeholder for now */}</div>;",
  "no-filler-comments",
  "sample.tsx",
);
expectRule(
  "still sees code after a JSX element closes",
  "const el = <p>Some prose here</p>;\nconst leak = payload as any;",
  "no-any",
  "sample.tsx",
);
expectRule(
  "an arrow generic is not a JSX element",
  "const identity = <T,>(value: T): T => value as any;",
  "no-any",
  "sample.tsx",
);
expectRule(
  "a less-than comparison is not a JSX element",
  "const ok = fn(a < b, c) && (payload as any);",
  "no-any",
  "sample.tsx",
);
expectRule(
  "an unclosed tag does not blank the code below it",
  "const broken = <div><span>oops</div>;\nconst leak = payload as any;",
  "no-any",
  "sample.tsx",
);

expectNoRule(
  "a regex after an if condition is not code",
  "if (enabled) /: any/.test(input);",
  "no-any",
);
expectRule(
  "division after a plain call is still division",
  "const ratio = compute(a) / (raw as any) / 2;",
  "no-any",
);

// --- masking correctness -----------------------------------------------------

expectNoRule("ignores patterns inside strings", 'const doc = "catch {} and JSON.parse(JSON.stringify(x))";', "no-empty-catch");
expectNoRule("ignores patterns inside template literals", "const doc = `if (x === true) {}`;", "no-boolean-literal-compare");
expectNoRule("ignores patterns inside regex literals", "const pattern = /catch \\{\\}/u;", "no-empty-catch");
expectNoRule("ignores commented-out slop", "// const copy = JSON.parse(JSON.stringify(state));", "no-json-clone");
expectRule(
  "still sees code inside template holes",
  "const message = `count: ${flag === true ? 1 : 0}`;",
  "no-boolean-literal-compare",
);

// --- tokenizer defects -------------------------------------------------------

// `http://example.com ...` in ordinary code is a `http:` label followed by a
// real comment; only JSX text gets the scheme exemption.
expectNoRule(
  "a URL label in ordinary code is still a comment",
  "http://example.com served as User;\nconst ok = 1;",
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "does not read a URL in JSX text as a comment",
  "const docs = <p>See https://example.com/docs for now.</p>;",
  "no-filler-comments",
  "sample.tsx",
);
expectRule(
  "still sees code on a line whose JSX text holds a URL",
  "const docs = <p>https://example.com {raw as any}</p>;",
  "no-any",
  "sample.tsx",
);
expectRule(
  "an apostrophe in JSX text does not blank the rest of the line",
  "const note = <p>We don't validate {JSON.parse(JSON.stringify(raw))}</p>;",
  "no-json-clone",
  "sample.tsx",
);
expectRule(
  "a lone backtick does not blank the rest of the file",
  'const help = <p>Press the ` key</p>;\nconst clone = JSON.parse(JSON.stringify(config));',
  "no-json-clone",
  "sample.tsx",
);
expectNoRule(
  "an identifier ending in a keyword is not a regex position",
  'const share = metrics.opt_in / metrics.total + " ratio a/b: any values";',
  "no-any",
);
expectRule(
  "division after ++ is not a regex",
  "const rate = index++ / (raw as Config) / scale;",
  "require-safety-comment-for-type-assertion",
);
// TS 4.4+ types the catch binding, and every sibling catch rule already allows
// the annotation.
expectRule(
  "a typed catch binding is still a useless rethrow",
  "try { f(); } catch (e: unknown) { throw e; }",
  "no-useless-rethrow",
);

expectRule(
  "a nested generic does not escape the assertion rule",
  "const a = data as Map<string, Set<number>>;",
  "require-safety-comment-for-type-assertion",
);

// The specifier-list skip must need specifier syntax: matching any export that
// ends in `{` silenced the rule for the whole body below it.
expectRule(
  "an exported object literal is not a specifier list",
  "export const cfg = {\n  port: raw.port as number,\n};",
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "a multi-line import alias list is still skipped",
  'import {\n  readFile as read,\n  writeFile as write,\n} from "node:fs";',
  "require-safety-comment-for-type-assertion",
);

// A constructor signature is a type, not a name: `new` matched as a plain named
// type and the `(` after it failed the terminator check, so the assertion was
// not reported at all -- silence is the one outcome a rule about missing
// justifications must not produce.
expectRule(
  "a constructor-signature assertion is still an assertion",
  "const Ctor = value as new () => Service;",
  "require-safety-comment-for-type-assertion",
);
expectRule(
  "an abstract constructor signature too",
  "const Ctor = value as abstract new (n: number) => Service;",
  "require-safety-comment-for-type-assertion",
);
// The `(` lookahead is what keeps `new` a keyword here: without it any name
// starting with those three letters would be swallowed as a constructor type.
expectRule(
  "an operand whose name starts with new is unaffected",
  "const svc = newValue as Service;",
  "require-safety-comment-for-type-assertion",
);
expectNoRule(
  "a justified constructor-signature assertion stays clean",
  "// SAFETY: the registry only stores constructors\nconst Ctor = value as new () => Service;",
  "require-safety-comment-for-type-assertion",
);

// The pattern JSX masking exists for: a render prop holds a whole element, and
// its children are prose.
expectNoRule(
  "an element inside an attribute expression has its text masked",
  "const a = <Foo overlay={<Tooltip>Delete the file marked as stale</Tooltip>}>ok</Foo>;",
  "require-safety-comment-for-type-assertion",
  "sample.tsx",
);
expectRule(
  "a real assertion in an attribute expression is still found",
  "const a = <Foo n={raw.n as number}>ok</Foo>;",
  "require-safety-comment-for-type-assertion",
  "sample.tsx",
);

expectRule(
  "a leading BOM does not hide the file",
  "\uFEFFconst value: any = 1;",
  "no-any",
);

assert.deepEqual(
  lintSource("\uFEFFconst value: any = 1;", "sample.ts"),
  lintSource("const value: any = 1;", "sample.ts"),
  "a BOM must not shift line 1 columns",
);
console.log("ok   a leading BOM does not shift columns");

const shebang = lintSource("\uFEFF#!/usr/bin/env node\nconst value: any = 1;\n", "sample.ts");
assert.deepEqual(shebang.map((finding) => finding.line), [2]);
console.log("ok   a BOM before a shebang still skips the shebang");

// The assertion pattern ran in O(n^2) on one long line: 9s for a 56KB
// identifier and 3.6s for a 60KB comment, on a checker a PostToolUse hook runs
// after every edit. The bound is loose on purpose — it fails on quadratic
// backtracking, not on a slow machine.
const REDOS_BUDGET_MS = 1000;
for (const [label, source, budget = REDOS_BUDGET_MS] of [
  ["a long identifier line", `const x = ${"a".repeat(56_000)};\n`],
  ["a long comment line", `// ${"word ".repeat(12_000)}\n`],
  // The type after `as` is scanned forward now, so the shapes that could make a
  // scan run long belong here too: an opener that never closes, many candidates
  // on one line, and real depth.
  ["an unclosed type opener", `const a = payload as ${"<".repeat(20_000)}\n`],
  ["many assertion candidates", `const a = ${"payload as X ".repeat(4_000)};\n`],
  ["deeply nested generics", `const a = payload as ${"A<".repeat(2_000)}B${">".repeat(2_000)};\n`],
  // The later-write check bounds its scan by the next write to that name, not
  // by the end of the file. Scanning the rest of the source per match instead
  // put this at 3.0s against 0.15s before the guard existed -- a rule guard is
  // not allowed to cost more than the whole scan it guards. This one input is
  // 400KB rather than one long line, so linting it legitimately costs a few
  // hundred ms; the budget is its own to keep the shared one strict.
  ["many branch-assigned declarations",
    Array.from({ length: 4_000 }, (_, i) => `let v${i};\nif (c) v${i} = a;\nelse v${i} = b;\nuse(v${i});\n`).join(""),
    2_000],
]) {
  const started = Date.now();
  lintSource(source, "sample.ts");
  const elapsed = Date.now() - started;
  assert.ok(elapsed < budget, `${label} took ${elapsed}ms, over the ${budget}ms budget`);
  console.log(`ok   ${label} does not backtrack (${elapsed}ms, budget ${budget}ms)`);
}

// It is only a no-op when the value cannot be null: `null ?? undefined` is
// undefined, and JSON.stringify drops an undefined property while keeping null.
// So it needs judgment, and must not print as a mechanical one-answer fix.
const nullish = lintSource("const value = input ?? undefined;", "sample.ts");
assert.equal(nullish[0].severity, "review");
assert.match(nullish[0].message, /can be `null`/u);
console.log("ok   ?? undefined is a review finding, not a mechanical one");

// structuredClone THROWS on a function where the JSON round-trip silently drops
// it, so the message must not read as "swap this in and keep everything".
{
  const clone = lintSource("const copy = JSON.parse(JSON.stringify(state));", "sample.ts")
    .find((f) => f.rule === "no-json-clone");
  assert.match(clone.message, /THROWS on a function/u);
  assert.doesNotMatch(clone.message, /keeps those/u);
  console.log("ok   no-json-clone does not promise structuredClone keeps functions");
}

// The mechanical tier means "this exact replacement preserves behaviour". Three
// rules were sure the code was wrong but could not name such a replacement, and
// printing them as one-answer fixes is how correct code got rewritten.
for (const [source, rule, why] of [
  ["const copy = JSON.parse(JSON.stringify(state));", "no-json-clone", "structuredClone keeps a Date a Date"],
  ["const value = await Promise.resolve(input);", "no-await-promise-resolve", "dropping the wrapper drops a tick"],
  ["const user = value as unknown as User;", "no-chained-type-assertions", "parse-instead is a design, not a rewrite"],
  ["const p = new Promise(resolve => resolve(value));", "no-promise-constructor-wrapper", "Promise.resolve(p) IS p when p is a promise"],
]) {
  const found = lintSource(source, "sample.ts").find((f) => f.rule === rule);
  assert.ok(found, `${rule} did not fire on its own sample`);
  assert.equal(found.severity, "review", `${rule} is mechanical, but ${why}`);
  console.log(`ok   ${rule} is a review finding (${why})`);
}

// A comment finding is reported at the opener, but the text that triggered it
// can sit many lines below — both --since and the hook scope by written line.
const spanned = lintSource(
  "/**\n * A\n * B\n * C\n * D\n * @param {number} a first\n */\nexport function add(a: number) { return a; }",
  "sample.ts",
);
assert.equal(spanned[0].rule, "no-typed-jsdoc");
assert.equal(spanned[0].line, 1);
assert.ok(spanned[0].endLine >= 6, `expected a span past the trigger line, got ${spanned[0].endLine}`);
console.log("ok   a multi-line comment finding carries its span");

const positioned = lintSource("const ok = 1;\nconst copy = JSON.parse(JSON.stringify(ok));\n", "sample.ts");
assert.equal(positioned.length, 1);
assert.equal(positioned[0].line, 2);
assert.equal(positioned[0].rule, "no-json-clone");
console.log("ok   reports correct line numbers");

// SKILL.md's rule list is the only inventory an agent reads, and it had drifted
// to naming two rules that no longer exist while omitting twelve that do.
const ruleNames = (text) => new Set([...text.matchAll(/(?:\bname|\brule):\s*"([a-z0-9-]+)"/gu)].map((m) => m[1]));
const implemented = ruleNames(readFileSync(join(here, "check.mjs"), "utf8"));
const documented = new Set(
  [...readFileSync(join(here, "..", "SKILL.md"), "utf8").matchAll(/`([a-z][a-z0-9-]+)`/gu)]
    .map((m) => m[1])
    .filter((name) => /^(?:no|require)-/u.test(name)),
);
assert.deepEqual(
  [...implemented].filter((name) => !documented.has(name)).sort(), [],
  "SKILL.md is missing rules the checker implements",
);
assert.deepEqual(
  [...documented].filter((name) => !implemented.has(name)).sort(), [],
  "SKILL.md names rules the checker does not implement",
);
console.log(`ok   SKILL.md lists exactly the ${implemented.size} implemented rules`);

// The severity bar in one line: a "review" rule may name a replacement that is
// not always equivalent, but the message has to say where it diverges.
// `new Promise(r => r(JSON.parse(t)))` REJECTS when the parse throws, while
// `Promise.resolve(JSON.parse(t))` throws synchronously — a caller catching one
// does not catch the other.
{
  const [finding] = lintSource("const p = new Promise(resolve => resolve(JSON.parse(text)));", "sample.ts")
    .filter((f) => f.rule === "no-promise-constructor-wrapper");
  const names = finding && /async/u.test(finding.message) && /synchronous/u.test(finding.message);
  if (!names) {
    failures += 1;
    console.error(`FAIL promise-wrapper message names the throwing case: ${finding ? finding.message : "<no finding>"}`);
  } else {
    console.log("ok   promise-wrapper message names the throwing case");
  }
}

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

// The registry is what makes a typo reportable, so a rule missing from it is a
// rule whose ignore directive silently does nothing. Same drift guard as the
// SKILL.md check above, against the ids the source actually yields.
{
  const emitted = new Set(
    [...readFileSync(join(here, "check.mjs"), "utf8").matchAll(/(?:\bname|\brule):\s*"([a-z0-9-]+)"/gu)]
      .map((match) => match[1]),
  );
  assert.deepEqual(
    [...emitted].filter((id) => !RULE_IDS.has(id)).sort(), [],
    "RULE_IDS is missing rules the checker emits",
  );
  assert.deepEqual(
    [...RULE_IDS].filter((id) => !emitted.has(id)).sort(), [],
    "RULE_IDS names rules the checker does not emit",
  );
  console.log(`ok   RULE_IDS lists exactly the ${RULE_IDS.size} emitted rules`);
}

const ASSERTION = "require-safety-comment-for-type-assertion";
const ignoring = (reason) => `// slop-check-ignore ${ASSERTION} -- ${reason}`;

function expectSuppression(description, source, { rules, suppressed }) {
  const findings = lintSource(source, "sample.ts");
  const actual = findings.map((finding) => finding.rule);
  if (JSON.stringify(actual) !== JSON.stringify(rules) || findings.suppressed.length !== suppressed) {
    failures += 1;
    console.error(
      `FAIL ${description}: expected [${rules.join(", ")}] and ${suppressed} suppressed, `
      + `got [${actual.join(", ")}] and ${findings.suppressed.length}`,
    );
  } else {
    console.log(`ok   ${description}`);
  }
}

expectSuppression(
  "an ignore silences the line below it",
  `${ignoring("parsed by the schema above")}\nconst user = payload as User;\n`,
  { rules: [], suppressed: 1 },
);

expectSuppression(
  "an ignore silences its own line",
  `const user = payload as User; ${ignoring("parsed by the schema above")}\n`,
  { rules: [], suppressed: 1 },
);

// Two lines and no further: an ignore that outlived the line it was written for
// is how a rule turns off without anyone deciding to turn it off.
expectSuppression(
  "an ignore stops after the next line",
  `${ignoring("parsed by the schema above")}\nconst a = x as A;\nconst b = y as B;\n`,
  { rules: [ASSERTION], suppressed: 1 },
);

expectSuppression(
  "one ignore takes several rule ids",
  `// slop-check-ignore no-json-clone, ${ASSERTION} -- both deliberate at this boundary\n`
  + "const copy = JSON.parse(JSON.stringify(payload as User));\n",
  { rules: [], suppressed: 2 },
);

expectSuppression(
  "a file-level ignore covers the whole file",
  `// slop-check-ignore-file ${ASSERTION} -- every assertion here is a parser boundary\nconst a = x as A;\nconst b = y as B;\n`,
  { rules: [], suppressed: 2 },
);

// Each of these looks like a working ignore and is not one, which is the only
// way a suppression feature can make a codebase worse than having none.
expectSuppression(
  "an ignore with no reason suppresses nothing",
  `// slop-check-ignore ${ASSERTION}\nconst user = payload as User;\n`,
  { rules: ["no-unjustified-ignore", ASSERTION], suppressed: 0 },
);

expectSuppression(
  "a one-word reason does not count as a reason",
  `// slop-check-ignore ${ASSERTION} -- later\nconst user = payload as User;\n`,
  { rules: ["no-unjustified-ignore", ASSERTION], suppressed: 0 },
);

expectSuppression(
  "an ignore naming no rule suppresses nothing",
  "// slop-check-ignore -- checked this one already\nconst user = payload as User;\n",
  { rules: ["no-unjustified-ignore", ASSERTION], suppressed: 0 },
);

expectSuppression(
  "a misspelled rule id suppresses nothing",
  "// slop-check-ignore no-safety-comment -- close, but not the id\nconst user = payload as User;\n",
  { rules: ["no-unjustified-ignore", ASSERTION], suppressed: 0 },
);

expectSuppression(
  "a file-level ignore below line 10 suppresses nothing",
  `${"const filler = 1;\n".repeat(10)}// slop-check-ignore-file ${ASSERTION} -- too far down to be read\nconst user = payload as User;\n`,
  { rules: ["no-unjustified-ignore", ASSERTION], suppressed: 0 },
);

expectSuppression(
  "a directive quoted inside a block comment is not a directive",
  `/*\n${ignoring("example syntax")}\n*/\nconst user = payload as User;\n`,
  { rules: [ASSERTION], suppressed: 0 },
);

// An ignore names what it silences. Reaching the rules that only want SOME
// reason nearby let it silence rules it never named -- and let a malformed one,
// which suppresses nothing and says so, silence them just the same.
expectSuppression(
  "an ignore does not justify a rule it does not name",
  `// slop-check-ignore ${ASSERTION} -- parsed by the schema above\nawait new Promise((resolve) => setTimeout(resolve, 1000));\n`,
  { rules: ["no-arbitrary-sleep"], suppressed: 0 },
);

expectSuppression(
  "a malformed ignore does not justify a swallowed catch",
  "try {\n  work();\n} catch (error) {\n  // slop-check-ignore -- names no rule at all\n}\n",
  { rules: ["no-empty-catch", "no-unjustified-ignore"], suppressed: 0 },
);

{
  const findings = lintSource(
    "const user = payload as User;\nconst copy = JSON.parse(JSON.stringify(user));\n",
    "sample.ts",
    { disabled: new Set([ASSERTION]) },
  );
  assert.deepEqual(findings.map((finding) => finding.rule), ["no-json-clone"]);
  assert.equal(findings.suppressed.length, 1);
  console.log("ok   a disabled rule is filtered like an ignored one");
}

// The count is a property of the scan rather than a finding, so `--json` stays
// the bare array its consumers already parse.
{
  const findings = lintSource(`${ignoring("parsed by the schema above")}\nconst user = payload as User;\n`, "sample.ts");
  assert.equal(JSON.stringify(findings), "[]");
  console.log("ok   the suppressed count stays out of the JSON payload");
}

// Overlapping patterns reporting one position twice also counted it twice in
// the tally, which reads as two things to fix.
{
  const source = readFileSync(join(here, "check.mjs"), "utf8");
  const positions = lintSource(source, "check.mjs").map((f) => `${f.line}:${f.column}:${f.rule}`);
  assert.equal(new Set(positions).size, positions.length, "one position reported twice for one rule");
  console.log("ok   no position is reported twice for one rule");
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nall slop-check checker tests passed");
