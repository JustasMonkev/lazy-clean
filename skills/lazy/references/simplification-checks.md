# TS/JS simplification checks

Use this short pass before finishing a TypeScript or JavaScript change. The
examples are illustrative TS/JS syntax, not a requirement for Java, Python,
Ruby, Rust, or Go; apply the same reasoning in the language being changed.

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

## Check deletion claims

Challenge a guard, `WeakRef`, helper, or wrapper with evidence: inspect object
lifetimes, every caller, callbacks, restore/replay, cancellation, and cleanup.
Remove it only when those paths prove it redundant. A useful domain helper,
side-effect boundary, test seam, or framework contract earns its place even
with one caller. Prove risky deletion with a regression or mutation check; line
count alone is not evidence.
