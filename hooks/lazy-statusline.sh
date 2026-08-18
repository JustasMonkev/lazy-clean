#!/usr/bin/env bash
# CLAUDE_CONFIG_DIR overrides ~/.claude, matching where the hooks write the flag (issue #34)
flag="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.lazy-active"
[ -f "$flag" ] || exit 0

# Hide the badge while leaving lazy active. LAZY_HIDE_STATUS wins over the
# stored preference; 0/false/no/empty mean "don't hide". `+set` distinguishes
# empty from unset, and the value is trimmed and lowercased, so this agrees
# with getHideStatus in lazy-config.js on every input.
if [ -n "${LAZY_HIDE_STATUS+set}" ]; then
    hide=$(printf '%s' "$LAZY_HIDE_STATUS" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
    case "$hide" in
        ''|0|false|no) ;;
        *) exit 0 ;;
    esac
else
    for config in "${XDG_CONFIG_HOME:-$HOME/.config}/lazy/config.json" "${APPDATA:+$APPDATA/lazy/config.json}"; do
        [ -n "$config" ] && [ -f "$config" ] || continue
        grep -q '"hideStatus"[[:space:]]*:[[:space:]]*true' "$config" && exit 0
    done
fi

mode=$(head -n1 "$flag" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
# The flag file is hand-editable, and its contents used to reach the prompt
# verbatim — escape sequences and all. Anything that is not a level is not one.
case "$mode" in
    lite|full|ultra|review) ;;
    *) exit 0 ;;
esac

# ultra is the high-intensity mode; flag it amber so it stands out from the
# default green at a glance. The level is still in the text, so color is a
# redundant cue, not the only one.
color=108
[ "$mode" = "ultra" ] && color=173

if [ -z "$mode" ] || [ "$mode" = "full" ]; then
    printf '\033[38;5;%sm[LAZY]\033[0m' "$color"
else
    printf '\033[38;5;%sm[LAZY:%s]\033[0m' "$color" "$(printf '%s' "$mode" | tr '[:lower:]' '[:upper:]')"
fi
