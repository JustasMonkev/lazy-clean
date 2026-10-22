# Eliminate an implementation, not its contract

These examples illustrate the existing reuse ladder, not another required pass.
Remove code that duplicates an existing capability; do not just compress its
syntax. First check the project's installed versions and target platforms, then
compare accepted inputs, outputs, validation, ownership, and async lifetimes.
Keep useful domain helpers and required error, cancellation, and cleanup paths.

## Existing Input + native date support

Instead of building calendar navigation, day grids, and selection state, reuse
the house `Input` **if its installed implementation supports native date props**.
This illustrative JSX assumes it forwards `id`, `name`, `type`, and `value` to an
HTML input and supplies `event.currentTarget.value`; inspect the real component first.

```jsx
<label htmlFor="start-date">
  Start date
  <Input
    id="start-date"
    name="startDate"
    type="date"
    value={startDate}
    onChange={(event) => setStartDate(event.currentTarget.value)}
  />
</label>
```

This fits a date-only value contract (`YYYY-MM-DD` or empty), not a timestamp.
Preserve existing required/min/max rules, validation messages, submission
validation, and state ownership. Check keyboard and assistive-technology use in
supported browsers; a native control does not guarantee the required experience.
Keep a custom control when range selection, display format, or other requirements
do not fit. No new component dependency is implied.
[HTML date input contract](https://html.spec.whatwg.org/multipage/input.html#date-state-(type=date)).

## URLSearchParams instead of splitting and decoding by hand

Replace a custom query parser/encoder only when its contract is form-style query
encoding with string values and repeated keys. For example:

```js
const params = new URLSearchParams("?tag=js&tag=css&q=a+b&literal=%2B&empty=");
const tags = params.getAll("tag");
const query = params.get("q");
const output = new URLSearchParams();
for (const tag of tags) output.append("tag", tag);
output.set("q", query ?? "");
```

Here `tags` is `["js", "css"]`, `query` is `"a b"`, `literal` decodes to `"+"`,
and `empty` is `""`; a missing key returns `null`. Serialization gives
`tag=js&tag=css&q=a+b`. `get()` takes the first duplicate; use `getAll()` when
duplicates matter, not an object conversion that loses them. Validate decoded
values at the same boundary as before. This is not a drop-in replacement for
nested/bracket arrays, automatic number coercion, strict malformed-escape errors,
or byte-preserving signed queries. Preserve those contracts or retain the parser.
[URLSearchParams contract](https://url.spec.whatwg.org/#urlsearchparams).

## Intl.NumberFormat instead of a display-formatting engine

Replace custom currency-symbol/separator tables and string-formatting steps when
the required display matches `Intl` for the supported locale and runtime:

```js
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const label = usd.format(amount);
```

For validated numeric USD major-unit inputs, `1234.5` displays as `$1,234.50`,
`0` as `$0.00`, and `-1234.5` as `-$1,234.50`. Rounding is not interchangeable:
here `1.005` formats as `$1.01`, while `(1.005).toFixed(2)` gives `"1.00"`.
Check negative zero too, plus locale-data availability on deployment targets.
Keep an existing project money helper if it owns policy. `Intl` formats;
it does not validate money, convert currencies/units, or replace decimal
arithmetic. Do not remove those steps or promise byte-identical output across
runtime/locale-data versions. Use only options supported by the installed runtime.
[Intl.NumberFormat contract](https://tc39.es/ecma402/#sec-intl.numberformat).
