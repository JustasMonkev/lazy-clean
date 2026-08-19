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
# from unset — that path matches getHideStatus exactly. The config fallback
# strips whitespace before matching, so the key and value may sit on separate
# lines as JSON allows; it is still a match and not a parse, so it can disagree
# with getHideStatus on a nested `hideStatus` or one inside a string, and it
# reads $APPDATA on every platform where getConfigDir() resolves one directory.
# Parsing would mean a node start on every prompt render, which is the cost this
# whole script exists to avoid.
if [ -n "${LAZY_HIDE_STATUS+set}" ]; then
    hide=$(normalize "$LAZY_HIDE_STATUS")
    case "$hide" in
        ''|0|false|no) ;;
        *) exit 0 ;;
    esac
else
    # getConfigDir() reads exactly ONE directory, chosen before any file is
    # looked at — so pick the same one here rather than trying paths in turn.
    # Iterating made $HOME/.config outrank %APPDATA% on Windows, where a stale
    # Unix-style config could override the one the hooks actually write.
    # $OSTYPE is bash's stand-in for process.platform: msys/cygwin/win32 are the
    # Windows shells, and WSL reports linux, which is what a node process there
    # reports too.
    if [ -n "${XDG_CONFIG_HOME:-}" ]; then
        config="$XDG_CONFIG_HOME/lazy/config.json"
    else
        case "${OSTYPE:-}" in
            msys*|cygwin*|win32*) config="${APPDATA:-$HOME/AppData/Roaming}/lazy/config.json" ;;
            *) config="$HOME/.config/lazy/config.json" ;;
        esac
    fi
    # Root-level only, and a real scan rather than a substring match: a nested
    # `{"nested":{"hideStatus":true}}`, or the same bytes inside a string value,
    # used to hide a badge that getHideStatus() — which reads only
    # `config.hideStatus` — leaves showing. awk keeps the no-node-per-prompt
    # property the grep was there for.
    #
    # It has to agree with JSON.parse on the ways a file can be wrong, not just
    # on where the key sits: a value that is not followed by `,` or `}` means the
    # document does not parse (`{"hideStatus":true garbage}`), unbalanced braces
    # or an unterminated string mean the same, and a duplicated root key resolves
    # to the LAST one, as JSON.parse does. Anything invalid shows the badge,
    # which is the direction that cannot hide a badge the user never hid.
    if [ -f "$config" ]; then
        hidden=$(awk 'BEGIN { RS = "\x01" }
            {
                n = length($0); depth = 0; i = 1; result = 0; invalid = 0; seenRoot = 0
                while (i <= n) {
                    c = substr($0, i, 1)
                    if (c == "\"") {
                        j = i + 1; tok = ""; closed = 0
                        while (j <= n) {
                            d = substr($0, j, 1)
                            if (d == "\\") { j += 2; tok = tok "\\"; continue }
                            if (d == "\"") { closed = 1; break }
                            tok = tok d; j++
                        }
                        if (!closed) { invalid = 1; break }
                        if (depth == 1 && tok == "hideStatus") {
                            k = j + 1
                            while (k <= n && substr($0, k, 1) ~ /[ \t\r\n]/) k++
                            if (substr($0, k, 1) == ":") {
                                k++
                                while (k <= n && substr($0, k, 1) ~ /[ \t\r\n]/) k++
                                seenRoot = 1
                                if (substr($0, k, 4) == "true") {
                                    k += 4
                                    while (k <= n && substr($0, k, 1) ~ /[ \t\r\n]/) k++
                                    e = substr($0, k, 1)
                                    if (e != "," && e != "}") { invalid = 1; break }
                                    result = 1; i = k; continue
                                }
                                result = 0
                            }
                        }
                        i = j + 1; continue
                    }
                    if (c == "{" || c == "[") depth++
                    else if (c == "}" || c == "]") { depth--; if (depth < 0) { invalid = 1; break } }
                    else if (c == ",") {
                        # A trailing comma is not JSON, and JSON.parse rejects
                        # the whole document over it.
                        k = i + 1
                        while (k <= n && substr($0, k, 1) ~ /[ \t\r\n]/) k++
                        e = substr($0, k, 1)
                        if (e == "}" || e == "]" || e == "") { invalid = 1; break }
                    }
                    i++
                }
                if (!invalid && depth == 0 && seenRoot && result) print "hide"
            }' "$config" 2>/dev/null)
        [ "$hidden" = "hide" ] && exit 0
    fi
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
