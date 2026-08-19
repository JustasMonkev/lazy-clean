#!/usr/bin/env bash
# CLAUDE_CONFIG_DIR overrides ~/.claude, matching where the hooks write the flag (issue #34)
flag="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.lazy-active"
[ -f "$flag" ] || exit 0

# String.prototype.trim() + toLowerCase(), so this and lazy-config.js normalize
# a value identically. Interior whitespace survives, which is what makes "f alse"
# and a multi-line flag file invalid in both.
normalize() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value" | tr '[:upper:]' '[:lower:]'
}

# Hide the badge while leaving lazy active. LAZY_HIDE_STATUS wins over the
# stored preference; 0/false/no/empty mean "don't hide", and `+set` tells empty
# from unset — that path matches getHideStatus exactly. The config fallback is a
# grep, not a JSON parse, so it can disagree with getHideStatus on a nested,
# multi-line, or invalid config, and it reads $APPDATA on every platform where
# getConfigDir() resolves exactly one directory.
if [ -n "${LAZY_HIDE_STATUS+set}" ]; then
    hide=$(normalize "$LAZY_HIDE_STATUS")
    case "$hide" in
        ''|0|false|no) ;;
        *) exit 0 ;;
    esac
else
    # getConfigDir() reads exactly ONE directory, so stop at the first config
    # that exists instead of letting a second one override it: bash cannot see
    # process.platform, and $APPDATA is only that directory on Windows.
    for config in "${XDG_CONFIG_HOME:-$HOME/.config}/lazy/config.json" "${APPDATA:+$APPDATA/lazy/config.json}"; do
        [ -n "$config" ] && [ -f "$config" ] || continue
        grep -q '"hideStatus"[[:space:]]*:[[:space:]]*true' "$config" && exit 0
        break
    done
fi

# The whole file, not its first line: readMode() trims the whole file and
# rejects whatever is left over, so `ultra\nanything` is off there and must not
# paint a badge here either.
mode=$(normalize "$(<"$flag")")
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
