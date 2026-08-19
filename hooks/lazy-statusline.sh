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
    # A real JSON validator, not a scan for the key: getHideStatus() hides the
    # badge only when JSON.parse SUCCEEDS and `config.hideStatus` is exactly
    # true, so anything less than full validation disagrees somewhere. Three
    # passes of partial checks each left another hole — a nested key, a value
    # with trailing garbage, then leading garbage — so this parses the document
    # and rejects whatever is not JSON. awk keeps the no-node-per-prompt
    # property the original grep was there for.
    #
    # Failing to parse shows the badge, matching getHideStatus()'s own catch,
    # and that is the safe direction: it cannot hide a badge nobody hid.
    # Same 65536-byte cap as getHideStatus(): this runs on every prompt render
    # and the whole document has to validate before hideStatus can be trusted,
    # so an oversized config would stall the prompt (1MB measured at ~30s here).
    # Skipping it shows the badge, which is where an unparseable config already
    # lands. The two must cap at the same size or they disagree about a file
    # between the caps.
    if [ -f "$config" ] && [ "$(wc -c < "$config")" -le 65536 ]; then
        hidden=$(awk 'BEGIN {
                # awk has no chr() and does not read "0x53" as a number, so the
                # table is keyed by the four hex digits of the escape. ASCII only:
                # nothing above it can appear in the key being compared.
                for (c = 1; c < 128; c++) {
                    CHAR[sprintf("%04x", c)] = sprintf("%c", c)
                    CHAR[sprintf("%04X", c)] = sprintf("%c", c)
                }
                # A raw NUL is a control character like any other and JSON.parse
                # rejects it, but a \000 inside a regex bracket is the one piece
                # of this that awks disagree about, so build the character and
                # compare against it instead.
                NUL = sprintf("%c", 0)
            }
            function ws() { while (i <= n && substr(s, i, 1) ~ /[ \t\r\n]/) i++ }
            # Escapes are DECODED, not carried through: `{"hide\\u0053tatus":true}`
            # is a valid document whose root key is `hideStatus`, and comparing
            # the raw bytes missed it. An escape outside the JSON set fails the
            # parse, as JSON.parse does.
            function str(   j, out, d, e, hex) {
                j = i + 1; out = ""
                while (j <= n) {
                    d = substr(s, j, 1)
                    if (d == "\\") {
                        e = substr(s, j + 1, 1)
                        if (e == "u") {
                            hex = substr(s, j + 2, 4)
                            if (hex !~ /^[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]$/) return 0
                            # Only the ASCII range is turned back into a character;
                            # anything above it cannot appear in the key we compare
                            # against, so a marker that matches nothing is right.
                            out = out (hex in CHAR ? CHAR[hex] : "\001")
                            j += 6; continue
                        }
                        if (e == "" || index("\"\\/bfnrt", e) == 0) return 0
                        if (e == "b") out = out "\b"
                        else if (e == "f") out = out "\f"
                        else if (e == "n") out = out "\n"
                        else if (e == "r") out = out "\r"
                        else if (e == "t") out = out "\t"
                        else out = out e
                        j += 2; continue
                    }
                    if (d == "\"") { i = j + 1; tok = out; return 1 }
                    # JSON.parse rejects EVERY raw U+0000-U+001F inside a string,
                    # not just a newline: a literal tab in an unrelated key made
                    # this accept a document getHideStatus() throws on, and the
                    # two then disagreed about whether to hide the badge. A raw
                    # U+0001 is handled by RS above, which ends the record early
                    # and leaves the string unterminated -- also a rejection.
                    if (d == NUL || d ~ /[\001-\037]/) return 0
                    out = out d; j++
                }
                return 0
            }
            function scalar(   j) {
                if (substr(s, i, 1) == "\"") return str()
                if (substr(s, i, 4) == "true")  { i += 4; lit = "true";  return 1 }
                if (substr(s, i, 5) == "false") { i += 5; lit = "false"; return 1 }
                if (substr(s, i, 4) == "null")  { i += 4; lit = "null";  return 1 }
                # The JSON number grammar, not a run of numeric punctuation:
                # `1e` and `01` are not numbers, and JSON.parse rejects the whole
                # document over either.
                j = i
                if (substr(s, j, 1) == "-") j++
                if (substr(s, j, 1) == "0") j++
                else if (substr(s, j, 1) ~ /[1-9]/) { while (substr(s, j, 1) ~ /[0-9]/) j++ }
                else return 0
                if (substr(s, j, 1) == ".") {
                    j++
                    if (substr(s, j, 1) !~ /[0-9]/) return 0
                    while (substr(s, j, 1) ~ /[0-9]/) j++
                }
                if (substr(s, j, 1) ~ /[eE]/) {
                    j++
                    if (substr(s, j, 1) ~ /[+-]/) j++
                    if (substr(s, j, 1) !~ /[0-9]/) return 0
                    while (substr(s, j, 1) ~ /[0-9]/) j++
                }
                i = j; lit = "num"; return 1
            }
            function value(   c) {
                c = substr(s, i, 1)
                # `lit` is set AFTER the recursion, not before: a nested scalar
                # left its own value behind, so `{"hideStatus":{"enabled":true}}`
                # read as a root `true`.
                if (c == "{") { if (!object(0)) return 0; lit = "object"; return 1 }
                if (c == "[") { if (!array()) return 0; lit = "array"; return 1 }
                return scalar()
            }
            function array(   c) {
                i++; ws()
                if (substr(s, i, 1) == "]") { i++; return 1 }
                while (1) {
                    ws(); if (!value()) return 0
                    ws(); c = substr(s, i, 1)
                    if (c == ",") { i++; continue }
                    if (c == "]") { i++; return 1 }
                    return 0
                }
            }
            function object(root,   c, key) {
                i++; ws()
                if (substr(s, i, 1) == "}") { i++; return 1 }
                while (1) {
                    ws()
                    if (substr(s, i, 1) != "\"") return 0
                    if (!str()) return 0
                    key = tok
                    ws(); if (substr(s, i, 1) != ":") return 0
                    i++; ws()
                    if (!value()) return 0
                    # Root only, and the LAST occurrence wins, as JSON.parse does.
                    if (root && key == "hideStatus") result = (lit == "true")
                    ws(); c = substr(s, i, 1)
                    if (c == ",") { i++; continue }
                    if (c == "}") { i++; return 1 }
                    return 0
                }
            }
            # The default record separator, and the file is reassembled from its
            # lines here rather than parsed a record at a time. Splitting on any
            # byte made that byte a document boundary: with RS = "\x01", a config
            # of `{}` + U+0001 + `{"hideStatus":true}` validated the SECOND
            # record on its own and hid the badge, while JSON.parse rejects the
            # file as a whole. There is no byte that cannot appear in a file, so
            # the parser gets the whole document and a stray control byte fails
            # it -- inside a string by the check in str(), outside one by not
            # being valid JSON structure.
            { doc = (NR == 1 ? $0 : doc "\n" $0) }
            END {
                s = doc
                # getHideStatus() strips a UTF-8 BOM before parsing, so a config
                # saved with one is honoured there and has to be here too.
                sub(/^\357\273\277/, "", s)
                n = length(s); i = 1; result = 0
                ws()
                if (substr(s, i, 1) != "{") exit
                if (!object(1)) exit
                ws()
                if (i <= n) exit        # trailing anything means it is not one document
                if (result) print "hide"
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
