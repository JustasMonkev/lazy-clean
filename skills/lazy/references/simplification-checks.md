# TS/JS simplification checks

Use this short pass before finishing a TypeScript or JavaScript change,
including a `tsconfig.json` change. The examples are illustrative TS/JS syntax,
not a requirement for Java, Python, Ruby, Rust, or Go; apply the same reasoning
in the language being changed. Python changes have their own
[Python checks](python-checks.md).

## Check the TypeScript version and tsconfig

Read the `typescript` version from the lockfile,
`node_modules/typescript/package.json`, or the local `node_modules/.bin/tsc -v`,
not from memory. Do not use `npx tsc` to check: without a local install it can
fetch an unrelated `tsc` package from the registry. If no local version is
available, report it as unknown and follow the manifest's range. TypeScript 7 is
the native (Go) compiler shipped as the regular `typescript` package with the
usual `tsc` command; `tsgo` and `@typescript/native-preview` were its preview
names. TypeScript 6 is the last JavaScript-based release. A repo may pin both:
`@typescript/typescript6` provides `tsc6`, often aliased as `typescript` for
tools that need the old API. The language is the same, so these checks and the
slop checker apply to every version; what changes is configuration, emit, and
tooling.

TypeScript 6 deprecates these and TypeScript 7 rejects them. Do not suggest them
on 6 or 7; on 5.x or older, flag them only when the task is an upgrade:

- `baseUrl`: write `paths` entries relative to the tsconfig, such as
  `"@/*": ["./src/*"]`.
- `moduleResolution` `node`, `node10`, or `classic`: use `nodenext` for Node
  or `bundler` for bundled apps.
- `target: "es5"` and `downlevelIteration`: the lowest target is `es2015`;
  leave older output to the bundler or Babel.
- `module` `amd`, `umd`, `systemjs`, or `none`, and `outFile`: use ES modules
  and a bundler.
- `esModuleInterop: false`, `allowSyntheticDefaultImports: false`, and
  `alwaysStrict: false`.
- `import data from './data.json' assert { type: 'json' }`: write `with`.
- `module Foo {}` namespace declarations: write `namespace Foo {}`.

TypeScript 6 and 7 changed defaults: `strict` is on, `module` is `esnext`,
`target` is a current ECMAScript year, `rootDir` is the tsconfig directory,
`noUncheckedSideEffectImports` is on, and `types` is `[]`, so global types such
as Node's need `"types": ["node"]`. When an upgrade changes behavior, set the
old value explicitly or fix the code; do not rely on the new default silently.
`"ignoreDeprecations": "6.0"` is a temporary migration step, never a fix;
mark it with `lazy:` and the version it has to go before.

TypeScript 7.0 has no stable programmatic API yet. Tools that import
`typescript` (typescript-eslint, ts-morph, ts-jest, language service plugins,
Vue, Svelte, Astro, and Angular template tooling) may need the TypeScript 6
alias; keep it unless those tools support 7. TypeScript 7 also recognizes
fewer JSDoc forms in `checkJs` projects: prefer real types or standard JSDoc
over Closure-style `function(string): void`, `@enum`, or `@class`.

## Check the type and argument boundaries

- Infer obvious private or local types and return types. Keep explicit public
  contracts, but never add `any` or a cast just to bypass checking; narrow or
  parse the value at the trust boundary instead.
- Normalize overload, encoding, and callback arguments once at the entry point.
  Use the normalized value on the one normal path.

```ts
// Before: a redundant private return annotation.
const labelFor = (item: Item): string => item.label;

// After: the local return type is inferred; keep public contracts explicit.
const labelFor = (item: Item) => item.label;
```

```ts
// After normalizing `encodingOrCallback` once (`BufferEncoding | Callback | undefined`):
const callback = typeof encodingOrCallback === 'function' ? encodingOrCallback : undefined;
const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
declare const chunk: string | Uint8Array; // Buffer is a Uint8Array.

// Before: an unnecessary outer copy remains after argument normalization.
const buf = Buffer.from(
  typeof chunk === 'string' ? Buffer.from(chunk, encoding) : Buffer.from(chunk),
);

// After: one conversion, with the required string/encoding distinction.
const buf = typeof chunk === 'string' ? Buffer.from(chunk, encoding) : Buffer.from(chunk);
```

Keep the string branch and its `encoding`: removing it broke Latin-1 replay with
an HTTP parse error. For this `string | Uint8Array` input, `Buffer.from(chunk)`
makes an owned binary copy; do not retain a caller's buffer or view when a later
caller mutation could corrupt a cache. If `ArrayBuffer` or `SharedArrayBuffer`
inputs are supported, use an owned-copy path for them: `Buffer.from(arrayBuffer)`
shares caller memory ([Node.js API](https://nodejs.org/api/buffer.html#static-method-bufferfromarraybuffer-byteoffset-length)).
Do not generalize the copy claim to every `Buffer.from` overload.

## Check control flow and errors

- Use a one-liner or ternary where it is clearer, such as selecting a value.
  Keep explicit multi-step control flow when it expresses sequencing, cleanup,
  cancellation, or error handling.
- Handle a returned error directly instead of throwing solely to catch it
  locally; log a wrapped cleanup error at that boundary. Keep `catch` for
  genuinely thrown or rejected driver failures, including falsy thrown values.

```ts
// Before: throw/catch only to log a returned wrapped cleanup error.
try {
  const result = await closeResources();
  if (result.error) throw result.error;
} catch (error) {
  logger.warn(error);
}

// After: log a returned error directly, while retaining the real rejection path.
const warn = (error: unknown) => logger.warn(error);
try {
  const result = await closeResources();
  if (result.error) warn(result.error);
} catch (error) {
  warn(error); // no truthiness guard: thrown false, 0, or undefined still arrive here
}
```

Do not replace a custom wait or cleanup path with a standard-library helper
without matching error, cancellation, listener cleanup, and ownership
semantics. For example, `events.once(res, 'close')` rejects when `res` emits
`'error'`; it is not interchangeable with a non-rejecting close promise and
can leave close-only cleanup skipped.

## Check module shape

- Keep a module to one reason to change. Put a new function beside the code
  that owns its data or policy; add a file for a separate reason to change, not
  for every function.
- Every export is a contract. Keep a new helper module-private until another
  module uses it. Add a barrel `index.ts` or a re-export alias only when the
  repo already uses that pattern.
- No import-time side effects in shared modules: no I/O, timers, env reads, or
  global registration at import. Do that work in the entry point or in an
  explicit init function that callers and tests control.
- Pass a capability (`fetch`, `now`, a store function) as an ordinary
  parameter when a test or second caller needs a seam. Do not add a class, DI
  container, or interface for it.
- Break an import cycle by moving the shared type or pure function to the
  lower-level module, not with a lazy `require` or dynamic `import()`.

```ts
// Before: importing this module reads the environment and starts a timer.
const client = createClient(process.env.API_URL!);
setInterval(() => client.ping(), 30_000);
export const getUser = (id: string) => client.get(`/users/${id}`);

// After: callers own configuration and lifetime; the policy takes what it needs.
export const getUser = (client: Client, id: string) => client.get(`/users/${id}`);
```

## Check type modeling

- Model mutually exclusive states as a discriminated union, not a bag of
  optional fields that allows impossible combinations. Changing an existing
  exported type is a contract change; do it only when the task owns it.
- Use `as const` for literal tables and `satisfies` (TypeScript 4.9+) to check
  a literal against a type without widening it. Read the installed TypeScript
  version before using newer syntax.
- Type outside data as `unknown` and parse it once at the boundary, with the
  project's schema library if one is installed or a small type guard. Do not
  pass `any` inward.
- Do not loosen `strict`, `noImplicitAny`, or lint settings to make a change
  compile.

```ts
// Before: { status: 'error' } without an error type-checks, and so does both.
type Result = { status: 'ok' | 'error'; user?: User; error?: Error };

// After: each state carries exactly what it needs, and a new state fails to compile.
type Result = { status: 'ok'; user: User } | { status: 'error'; error: Error };

function describe(result: Result) {
  switch (result.status) {
    case 'ok': return result.user.name;
    case 'error': return result.error.message;
    default: {
      const unhandled: never = result;
      return unhandled;
    }
  }
}
```

## Check function shape

- Use early returns for guard clauses instead of nesting the main path.
- When a new caller would pass a boolean that switches behavior, prefer two
  named functions or an options object; keep existing signatures unchanged.
- Name values by domain meaning (`retryDelayMs`, `activeUsers`), not by type or
  shape (`data`, `obj2`, `userArray`).
- Use `Promise.all` for independent awaits only when failing fast is correct;
  it leaves the other promises running. Keep sequential awaits when order,
  rate limits, or partial-failure handling matter.

## Check deletion claims

Challenge a guard, `WeakRef`, helper, or wrapper with evidence: inspect object
lifetimes, every caller, callbacks, restore/replay, cancellation, and cleanup.
Remove it only when those paths prove it redundant. A useful domain helper,
side-effect boundary, test seam, or framework contract earns its place even
with one caller. Prove risky deletion with a regression or mutation check; line
count alone is not evidence.
