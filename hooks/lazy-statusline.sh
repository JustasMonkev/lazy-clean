#!/usr/bin/env bash
# CLAUDE_CONFIG_DIR overrides ~/.claude, matching where the hooks write the flag (issue #34)
flag="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.lazy-active"
[ -f "$flag" ] || exit 0

# Hide the badge while leaving lazy active. LAZY_HIDE_STATUS wins over the
# stored preference, and 0/false/no/empty mean "don't hide", matching
# getHideStatus in lazy-config.js.
case "${LAZY_HIDE_STATUS:-}" in
    '') ;;
    0|false|FALSE|no|NO) ;;
    *) exit 0 ;;
esac
if [ -z "${LAZY_HIDE_STATUS:-}" ]; then
    for config in "${XDG_CONFIG_HOME:-$HOME/.config}/lazy/config.json" "${APPDATA:-}/lazy/config.json"; do
        [ -f "$config" ] || continue
        grep -q '"hideStatus"[[:space:]]*:[[:space:]]*true' "$config" && exit 0
    done
fi

mode=$(head -n1 "$flag" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
# The flag file is hand-editable, and its contents used to reach the prompt
# verbatim — escape sequences and all. Anything that is not a level is not one.
case "$mode" in
    lite|full|ultra|review) ;;
    off) exit 0 ;;
    *) mode="" ;;
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
