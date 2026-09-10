# Share session identity, JSON parsing, and read bounds with the lifecycle hooks.
& node (Join-Path $PSScriptRoot 'lazy-statusline.js')
exit $LASTEXITCODE
