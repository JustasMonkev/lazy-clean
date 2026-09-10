#!/usr/bin/env bash
# Node is already required by the hooks; share their session and config parsing.
exec node "$(dirname "$0")/lazy-statusline.js"
