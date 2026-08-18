# CLAUDE_CONFIG_DIR overrides ~/.claude, matching where the hooks write the flag (issue #34)
$ClaudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$Flag = Join-Path $ClaudeDir ".lazy-active"
# -LiteralPath throughout: Test-Path and Get-Content treat a plain path as a
# wildcard pattern, so a profile directory containing [ or ] loses the badge.
if (-not (Test-Path -LiteralPath $Flag)) {
    exit 0
}

# Hide the badge while leaving lazy active. LAZY_HIDE_STATUS wins over the
# stored preference; 0/false/no/empty mean "don't hide", matching
# getHideStatus in lazy-config.js.
if ($null -ne $env:LAZY_HIDE_STATUS) {
    if ($env:LAZY_HIDE_STATUS.Trim() -notin @("", "0", "false", "no")) { exit 0 }
} else {
    $ConfigDir = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } elseif ($env:APPDATA) { $env:APPDATA } else { Join-Path $HOME ".config" }
    $Config = Join-Path (Join-Path $ConfigDir "lazy") "config.json"
    if (Test-Path -LiteralPath $Config) {
        try {
            if ((Get-Content -LiteralPath $Config -Raw -ErrorAction Stop | ConvertFrom-Json).hideStatus -eq $true) { exit 0 }
        } catch {
            # Unreadable or invalid config: show the badge rather than vanish.
        }
    }
}

$Mode = ""
try {
    # An empty flag file yields $null from Get-Content, and $null.Trim() throws
    # — which used to swallow the badge entirely on Windows.
    $Mode = ([string](Get-Content -LiteralPath $Flag -ErrorAction Stop | Select-Object -First 1)).Trim().ToLowerInvariant()
} catch {
    exit 0
}

# The flag file is hand-editable; anything that is not a level is not one.
if ($Mode -cnotin @("lite", "full", "ultra", "review")) { exit 0 }

$Esc = [char]27
# ultra is the high-intensity mode; flag it amber so it stands out from the
# default green. The level is still in the text, so color is a redundant cue.
$Color = if ($Mode -ceq "ultra") { "173" } else { "108" }
if ($Mode -ceq "full") {
    [Console]::Write("${Esc}[38;5;${Color}m[LAZY]${Esc}[0m")
} else {
    $Suffix = $Mode.ToUpperInvariant()
    [Console]::Write("${Esc}[38;5;${Color}m[LAZY:$Suffix]${Esc}[0m")
}
