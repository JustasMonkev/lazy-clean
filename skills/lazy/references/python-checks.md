# Python checks

Use this short pass before finishing a Python change. Apply only the parts the
change touches; it is not a request to restyle or re-type unrelated code.

## Check the version and tools first

Read the version from `requires-python` in `pyproject.toml`, `.python-version`,
`setup.cfg`, `tox.ini`, the lockfile, or `python --version`. Features that need
a minimum version: f-strings (3.6), `dataclasses` and `from __future__ import
annotations` (3.7), `typing.Protocol`, `TypedDict`, and `Literal` (3.8),
`functools.cache` and built-in generics like `list[int]` (3.9), `match`, runtime
`X | None`, `zip(strict=True)`, and `@dataclass(slots=True, kw_only=True)`
(3.10), `tomllib`, `typing.Self`, and `except*` (3.11), `itertools.batched` and
the `type` statement (3.12). Gate on the oldest version the project supports,
not the local interpreter. Below a gate, use `str.format` for f-strings, an
installed `typing_extensions` for typing names,
`functools.lru_cache(maxsize=None)` for `cache`, `typing.List[int]` for generics
(or `from __future__ import annotations` on 3.7 and later), and `NamedTuple`, an
already-installed `dataclasses` backport, or `attrs` before 3.7; do not add a
backport dependency just for style. If the version cannot be read, say so and
use only syntax that the oldest plausible version accepts.

Run the formatter, linter, type checker, and test runner the project already
configures (look in `pyproject.toml`, `setup.cfg`, `tox.ini`, `noxfile.py`, the
Makefile, or CI). Do not add a tool, loosen its config, or add
`# type: ignore` / `# noqa` to silence it; a deliberate one names the code and
the reason: `# type: ignore[arg-type]  # vendor stub is wrong; see issue 12`.

## Check module shape

- Keep a module to one reason to change. Put a new function beside the code
  that owns its data or policy. Do not start a `utils.py` or `helpers.py` grab
  bag, or a package hierarchy for one module.
- No import-time side effects in shared modules: no network, file writes,
  `logging.basicConfig`, or env-dependent configuration at import. Scripts put
  their work in `main()` behind `if __name__ == "__main__":`.
- Keep `__init__.py` minimal. Re-export only an intended public API, and follow
  the repo's absolute or relative import style.
- Break an import cycle by moving the shared type or pure function to the
  lower-level module. A function-local import needs a reason, such as an
  optional dependency.
- Pass collaborators (a clock, a session, a path, a callable) as ordinary
  parameters, defaulted at the entry point, when a test or second caller needs
  a seam. Do not add a DI container, registry, or ABC hierarchy for it.

```python
# Before: the import connects and reads the environment; tests must patch globals.
client = Client(os.environ["API_URL"])

def fetch_user(user_id):
    return client.get(f"/users/{user_id}")

# After: the entry point owns configuration; the policy takes what it needs.
def fetch_user(client: Client, user_id: str) -> User:
    return User.from_json(client.get(f"/users/{user_id}"))

def main() -> None:
    print(fetch_user(Client(os.environ["API_URL"]), sys.argv[1]))

if __name__ == "__main__":
    main()
```

## Check data and types

- Annotate public functions when the repo uses type hints; let locals infer.
  Never add `Any` or `cast` just to satisfy the checker.
- Give internal records a shape: `@dataclass` (with `frozen=True` when not
  mutated), `NamedTuple`, or `TypedDict` for dict-shaped JSON. Do not thread
  loose dicts with implied keys through internal code.
- Use `Enum` or `Literal` for a closed set of values instead of bare strings.
- Use `typing.Protocol` for a new, typing-only capability a consumer needs. One
  implementation does not need an abstract base class. Keep an existing ABC
  when it enforces `@abstractmethod`, backs `isinstance`, `issubclass`, or
  `register()`, or shares implementation; a `Protocol` preserves none of that.
- Parse external data (JSON, env, CLI, request bodies, files) once at the
  boundary, with an installed validator if the project has one. Type hints do
  not validate anything at runtime.

## Check idioms that change behavior

- A mutable default is shared across calls. Use `None` and create the value
  inside the function, unless callers already pass `None` with its own
  meaning; then use a private sentinel (`_MISSING = object()`) so that input
  keeps its behavior.
- `if not value` treats `0`, `""`, `[]`, and `False` as missing, like `||` in
  JavaScript. Use `is None` when only a missing value should get the default.
- Compare with `is None`, not `== None`. Use `isinstance` unless the exact type
  is the contract.
- Use `with` for files, locks, connections, and temporary state, after checking
  what the context manager's exit actually does: `with sqlite3.connect(...)`
  commits or rolls back but does not close, and `closing(...)` alone closes
  without committing. Keep both, as in
  `with closing(sqlite3.connect(path)) as conn, conn:`, or keep the explicit
  commit, rollback, and `close()`. Bound network, subprocess, and queue waits
  with a timeout.
- Prefer the standard library: `collections.Counter` and `defaultdict`,
  `itertools`, `functools.cache`, `dataclasses.replace`, `pathlib` (when the repo
  uses it), `json`, `csv`, and timezone-aware `datetime.now(timezone.utc)`.
- Use a comprehension for a simple map or filter; keep a loop for multi-step
  logic, side effects, or early exits. Use `enumerate` and `zip` instead of
  manual indexes.

```python
# Before: one list shared by every call, and explicit zero replaced.
def add(item, items=[], limit=None):
    limit = limit or 10
    items.append(item)
    return items[:limit]

# After: a fresh list per call, and limit=0 is preserved.
def add(item, items=None, limit=None):
    items = [] if items is None else items
    limit = 10 if limit is None else limit
    items.append(item)
    return items[:limit]
```

Changing a mutable default is a behavior change for any caller that relied on
the shared list; check callers before fixing it inside an unrelated task.

## Check errors

- No bare `except:` and no `except Exception: pass` that swallow or handle an
  error: bare `except:` also catches `KeyboardInterrupt` and `SystemExit`, so a
  handler catches the narrowest error it can actually handle. Cleanup that must
  run on every exit is different: keep it in `finally`, or in an explicit
  `except BaseException:` that re-raises, and do not narrow it.
- Rethrow with a bare `raise`; translate with `raise NewError(...) from err` so
  the cause survives. Do not log and re-raise the same error at every layer.
- Do not turn a failure into `None`, `{}`, or `False` when callers need to know
  it failed. Raise, or use the result type the repo already uses.
- Use `contextlib.suppress(SpecificError)` only for a deliberate ignore, with
  a comment giving the reason.
- Libraries log with `logging.getLogger(__name__)`, not `print`, and pass
  arguments lazily: `log.info("saved %s", path)`.

```python
# Before: every failure, including a typo, becomes "no config".
try:
    config = json.loads(path.read_text())
except Exception:
    config = {}

# After: only the expected missing file is a default; bad JSON still fails loudly.
try:
    config = json.loads(path.read_text())
except FileNotFoundError:
    config = {}
```

## Check tests

- Use the runner and style already in the repo; never add pytest to a
  unittest project or the reverse.
  - pytest: `@pytest.mark.parametrize` instead of copy-pasted cases, `tmp_path`
    and `monkeypatch` instead of hand-built temp directories or global edits,
    and `pytest.raises(Error, match=...)` for failures.
  - unittest: `self.subTest` for case tables, `tempfile.TemporaryDirectory` and
    `unittest.mock.patch` as context managers, and `assertRaises` or
    `assertRaisesRegex` for failures.
- Patch a seam the code owns, where the name is looked up. Do not assert that a
  mock was called with the value the test just gave it.
- Cover behavior, edges (empty, `None`, `0`, unicode, boundaries), and failure
  modes.
