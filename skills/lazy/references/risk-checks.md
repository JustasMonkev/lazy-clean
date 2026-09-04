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
- **Evidence:** cover behavior, edges, and failure modes using the repo's tests.
  Include the riskiest alternate path. Flip one branch, boundary, operator, or
  return value; confirm a test fails for that change, then revert the mutation
  and rerun. Do not count an unrelated failure as proof.

## Decision examples

- `value || defaultValue` loses an explicit `false`, `0`, or empty string.
  Preserve each value the existing contract permits.
- A bug in a helper used by both a button and restore flow belongs in the
  shared helper; checking only the button leaves the bug alive.
- A single-caller function can name a business rule or isolate a side effect.
  Keep it when that helps; caller count alone says nothing about its value.
- A test file is already using the project's runner. Add to it; do not create
  a second runner just to avoid a framework already installed.
- An input parser already accepts uppercase IDs. Keep that behavior unless
  the user asks to change it, even if the new task does not mention uppercase.
