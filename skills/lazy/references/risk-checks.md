# Risk checks for changed behavior

Use only the parts relevant to the change. These are checks, not a request to
add infrastructure or harden unrelated code.

- **Contracts:** keep defaults, explicit false/zero/empty values, existing input
  formats, history, metadata, generated files, lockfiles, errors, and user state
  unless the task changes them. Unspecified behavior in an existing app is not
  permission to remove it. For a new input format, follow the spec rather than
  inventing leniency.
- **Lifetimes:** timers, listeners, tasks, and waits need timeout/cancellation
  when applicable, cleanup after success, failure, and partial setup, and no
  stale completion or double claim.
- **Trust boundaries:** parsing, persistence, deserialization, redirects, replay,
  normalization, and privilege changes can invalidate earlier checks. Validate
  the resulting value before trusting it. Types alone do not validate outside data.
- **External work:** bound time, bytes, items, retries, memory, path lengths, and
  collisions where applicable. A refetch keeps required request semantics while
  reapplying security policy.
- **Hidden defects:** run the changed path (code you edited, reused, or call) on
  inputs the request did not name: empty, zero, negative, duplicate, and largest
  values; inherited or integer-like keys; NaN and unparseable values; a second
  call; late, repeated, or reordered callbacks; a failure midway. Fix a defect
  that breaks the request, recurs at a sibling site, or sits in a function you
  edited, even if unrequested, and say so. Report any other defect with a
  failing input instead of fixing it. Fix the cause; a clamp or fallback that
  hides it is not a fix. Behavior callers or tests rely on is contract.
- **Evidence:** cover behavior, edges, and failure modes using the repo's tests
  with the fewest cases that each catch a distinct bug. No test scaffolding: no
  hand-rolled runner, single-use helper, success log, or case another already
  proves. Include the riskiest alternate path. If existing red-green checks already
  prove the risky regression, mutation work is optional. For a targeted
  challenge, follow [lazy-mutation](../../lazy-mutation/SKILL.md).

## Decision examples

- `value || defaultValue` loses an explicit `false`, `0`, or empty string.
  Preserve each value the existing contract permits.
- A bug in a helper used by both a button and restore flow belongs in the
  shared helper; checking only the button leaves the bug alive.
- A single-caller function can name a business rule or isolate a side effect.
  Keep it when that helps; caller count alone says nothing about its value.
- A test file is already using the project's runner. Add to it; do not create
  a second runner just to avoid a framework already installed.
- Asked to add a field to a parser that also accepts impossible dates: the
  parser is the edited function, so fix the dates too and say so. The same flaw
  in a module the task never touches is reported with a failing input.
- A value that goes wrong upstream is fixed upstream. Rounding or defaulting it
  at the point of use makes the wrong value look valid.
- A one-line fix needs its failing case and boundary, not a test harness.
- An input parser already accepts uppercase IDs. Keep that behavior unless
  the user asks to change it, even if the new task does not mention uppercase.
