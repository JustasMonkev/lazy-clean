#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lintSource } from "./check.mjs";

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
expectNoRule("allows words containing any", "const company: Company = load();", "no-any");
expectNoRule("skips any in plain JS", "const value = x; // : any is not a JS concept", "no-any", "sample.js");
expectNoRule("ignores any inside strings", 'const message = "cast to any";', "no-any");

expectRule("flags chained assertions", "const user = value as unknown as User;", "no-chained-type-assertions");
expectRule("flags unknown alias", "type Payload = unknown;", "no-unknown-alias");
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

expectRule("flags bare assertion", "const user = payload as User;", "require-safety-comment-for-type-assertion");
// Prose is not code: JSX text nodes are not string literals, so every sentence
// containing "as" used to read as a type assertion.
expectNoRule(
  "allows English prose in JSX",
  "const help = <p>Files are stored as blobs and served as static assets</p>;",
  "require-safety-comment-for-type-assertion",
  "sample.tsx",
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
expectNoRule("allows as const", "const modes = ['a', 'b'] as const;", "require-safety-comment-for-type-assertion");
expectNoRule("allows import alias", 'import { readFile as read } from "node:fs";', "require-safety-comment-for-type-assertion");

// --- pointless-code rules ----------------------------------------------------

expectRule("flags useless rethrow", "try { run(); } catch (error) { throw error; }", "no-useless-rethrow");
expectNoRule("allows wrapping rethrow", "try { run(); } catch (error) { throw new AppError(error); }", "no-useless-rethrow");

expectRule("flags empty catch", "try { run(); } catch {}", "no-empty-catch");
expectNoRule("allows justified empty catch", "try { run(); } catch { /* best-effort cleanup */ }", "no-empty-catch");

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
expectNoRule("allows comparing a parsed property", "if (parsed.enabled === true) run();", "no-boolean-literal-compare");
expectRule("flags if (!!x)", "if (!!user) { greet(user); }", "no-double-negation-condition");
expectNoRule("allows !! in assignment", "const hasUser = !!user;", "no-double-negation-condition");
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

expectRule("flags let assigned in both branches", "let label;\nif (flag) {\n  label = 'on';\n} else {\n  label = 'off';\n}", "no-let-if-else-assign");
expectRule("flags annotated let assigned in both branches", "let label: string;\nif (flag) label = 'on';\nelse label = 'off';", "no-let-if-else-assign");
expectNoRule("allows a branch that does more than assign", "let n;\nif (isRange) {\n  n = split(body);\n} else {\n  n = parse(body);\n  n = n.map(embrace);\n}", "no-let-if-else-assign");
expectNoRule("allows an accumulator loop", "let total = 0;\nfor (const value of values) total += value;", "no-let-if-else-assign");

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

expectRule("flags a Constructor doc comment", "/** Constructor */\nexport class AuthClient {}", "no-obvious-doc-comments");
expectRule("flags a this-function doc comment", "/**\n * This function returns the current token.\n */\ngetToken() { return this.token; }", "no-obvious-doc-comments");
expectNoRule("allows a doc comment that adds information", "/** Aggregates rows into per-name totals, dropping zero-count rows. */\nexport function summarize(rows) {}", "no-obvious-doc-comments");
expectNoRule("allows an informative this-function note", "// This function is used recursively from IndexedSourceMapConsumer.\nfunction sourceContentFor(source) {}", "no-obvious-doc-comments");


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
for (const [label, source] of [
  ["a long identifier line", `const x = ${"a".repeat(56_000)};\n`],
  ["a long comment line", `// ${"word ".repeat(12_000)}\n`],
]) {
  const started = Date.now();
  lintSource(source, "sample.ts");
  const elapsed = Date.now() - started;
  assert.ok(elapsed < REDOS_BUDGET_MS, `${label} took ${elapsed}ms, over the ${REDOS_BUDGET_MS}ms budget`);
  console.log(`ok   ${label} does not backtrack (${elapsed}ms)`);
}

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

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nall slop-check checker tests passed");
