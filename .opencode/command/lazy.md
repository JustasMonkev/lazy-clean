---
description: Switch lazy intensity level (lite/full/ultra/off)
---

Switch to lazy $ARGUMENTS mode. If the arguments begin with `default`, do NOT switch anything: `/lazy default <level>` records what LATER sessions start at, so report only that the stored default changed and keep working at the level already active. With no level given, report the level already active — the one named in your context, or off if none is — and switch nothing. Lazy senior dev mode, before any code: does it need to exist at all (YAGNI)? Does the standard library do it? A native platform feature? Can it be one line? Build the minimum that works. No unrequested abstractions, no avoidable dependencies, no boilerplate. Mark deliberate simplifications that cut a real corner with a known ceiling using a lazy: comment that names the ceiling and upgrade path.
