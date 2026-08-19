#!/usr/bin/env node
// lazy — shared configuration resolver
//
// Resolution order for default mode:
//   1. LAZY_DEFAULT_MODE environment variable
//   2. Config file defaultMode field:
//      - $XDG_CONFIG_HOME/lazy/config.json (any platform, if set)
//      - ~/.config/lazy/config.json (macOS / Linux fallback)
//      - %APPDATA%\lazy\config.json (Windows fallback)
//   3. 'full'

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_MODE = 'full';
const VALID_MODES = ['off', 'lite', 'full', 'ultra', 'review'];
const RUNTIME_MODES = ['off', 'lite', 'full', 'ultra'];

function normalizeMode(mode) {
  if (typeof mode !== 'string') return null;
  const normalized = mode.trim().toLowerCase();
  return RUNTIME_MODES.includes(normalized) ? normalized : null;
}

function normalizeConfigMode(mode) {
  if (typeof mode !== 'string') return null;
  const normalized = mode.trim().toLowerCase();
  return VALID_MODES.includes(normalized) ? normalized : null;
}

function normalizePersistedMode(mode) {
  return normalizeMode(mode) || normalizeConfigMode(mode);
}

// "stop lazy" / "normal mode" turn lazy off, but only as a standalone
// command. Matching the phrase anywhere in the message turned it off mid-task
// for ordinary requests like "add a normal mode toggle" — so require the whole
// message to be the command, ignoring case and trailing punctuation.
function isDeactivationCommand(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?\s]+$/, '');
  return t === 'stop lazy' || t === 'normal mode';
}

// lazy: only embed the plugin install path in a statusline shell command when
// it's made of ordinary path characters. An allowlist beats escaping every shell's
// metacharacters; a hostile clone path (quotes, &, $, backtick, ;, etc.) falls back
// to manual setup instead. Allows : \ / for normal Windows and POSIX paths. Full
// per-shell escaper only if a real need appears.
function isShellSafe(p) {
  // Accented and CJK usernames are ordinary path characters, not shell
  // metacharacters; the ASCII-only allowlist sent most non-English-locale
  // installs down the manual-setup branch.
  return typeof p === 'string' && /^[\p{L}\p{N} _.\-:/\\~]+$/u.test(p);
}

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'lazy');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'lazy'
    );
  }
  return path.join(os.homedir(), '.config', 'lazy');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function getClaudeDir() {
  // lazy: CLAUDE_CONFIG_DIR overrides ~/.claude, matching Claude Code.
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function getDefaultMode() {
  // 1. Environment variable (highest priority)
  const envMode = (process.env.LAZY_DEFAULT_MODE || '').trim();
  // lazy: a default must be a runtime level (off/lite/full/ultra); review is
  // a session-only mode, never a valid default (#377). Validate against
  // RUNTIME_MODES so a stray env var or config can't make review the default.
  if (envMode && RUNTIME_MODES.includes(envMode.toLowerCase())) {
    return envMode.toLowerCase();
  }

  // 2. Config file
  try {
    const configPath = getConfigPath();
    // Strip UTF-8 BOM (common on Windows-saved files) so JSON.parse doesn't choke
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
    if (config.defaultMode && RUNTIME_MODES.includes(config.defaultMode.toLowerCase())) {
      return config.defaultMode.toLowerCase();
    }
  } catch (e) {
    // Config file doesn't exist or is invalid — fall through
  }

  // 3. Default
  return DEFAULT_MODE;
}

// Hide the status-bar indicator while keeping lazy active (#324).
// LAZY_HIDE_STATUS=1 (or any truthy value; 0/false/empty mean "don't hide")
// takes precedence, else config.hideStatus === true.
// The statusline re-reads and re-validates this file on EVERY prompt render,
// and `hideStatus` cannot be trusted until the whole document parses. A config
// far larger than the handful of keys lazy stores is a mistake rather than a
// preference, and reading it stalls the prompt -- 1MB measured at ~30s in the
// shell parser. Above the cap the file is not read and the badge shows, which
// is the same direction an unparseable config already takes. The cap is applied
// in the shell and PowerShell statuslines too: it is part of the answer, so all
// three have to share it or they disagree.
const CONFIG_SIZE_LIMIT = 65536;

function getHideStatus() {
  const env = process.env.LAZY_HIDE_STATUS;
  if (env !== undefined) {
    const v = env.trim().toLowerCase();
    return v !== '' && v !== '0' && v !== 'false' && v !== 'no';
  }
  try {
    const configPath = getConfigPath();
    if (fs.statSync(configPath).size > CONFIG_SIZE_LIMIT) return false;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
    return config.hideStatus === true;
  } catch (_) {
    // No config, no preference: the badge shows.
    return false;
  }
}

function writeDefaultMode(mode) {
  // lazy: only a runtime level can be a default; review is session-only (#377).
  const normalized = normalizeMode(mode);
  if (!normalized) return null;

  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
    if (!config || typeof config !== 'object' || Array.isArray(config)) config = {};
  } catch (_) {
    // No config yet, or an unreadable one: start from an empty object rather
    // than refuse to record the preference.
  }
  config.defaultMode = normalized;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return normalized;
}

// Persist the status-badge preference (#618). Mirrors writeDefaultMode; the
// LAZY_HIDE_STATUS env var still wins over the stored value on read.
function writeHideStatus(hide) {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
    if (!config || typeof config !== 'object' || Array.isArray(config)) config = {};
  } catch (_) {
    // Same as writeDefaultMode: a missing or corrupt config is replaced, not
    // a reason to drop the setting.
  }
  config.hideStatus = hide === true;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return config.hideStatus;
}

module.exports = {
  CONFIG_SIZE_LIMIT,
  DEFAULT_MODE,
  VALID_MODES,
  RUNTIME_MODES,
  getDefaultMode,
  getConfigDir,
  getConfigPath,
  getClaudeDir,
  getHideStatus,
  isShellSafe,
  normalizeMode,
  normalizeConfigMode,
  normalizePersistedMode,
  isDeactivationCommand,
  writeDefaultMode,
  writeHideStatus,
};
