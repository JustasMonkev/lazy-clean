const fs = require('fs');
const path = require('path');
const os = require('os');
const { getClaudeDir, getConfigDir, normalizePersistedMode } = require('./lazy-config');

const STATE_FILE = '.lazy-active';

// lazy: VS Code Copilot never sets COPILOT_PLUGIN_DATA — it only injects
// CLAUDE_PLUGIN_ROOT, pointed at an install path under .vscode/agent-plugins/
// (#528). Without this fallback isCopilot was false, so lazy assumed
// native Claude Code and emitted the statusline nudge, which VS Code Copilot
// doesn't read.
function isVsCodeCopilotRoot(pluginRoot) {
  if (!pluginRoot) return false;
  return pluginRoot.split(/[\\/]+/).includes('agent-plugins') &&
    pluginRoot.toLowerCase().includes('.vscode');
}

const isCopilot = Boolean(process.env.COPILOT_PLUGIN_DATA) ||
  isVsCodeCopilotRoot(process.env.CLAUDE_PLUGIN_ROOT);
const isCodex = !isCopilot && Boolean(process.env.PLUGIN_DATA);
const isQoder = !isCopilot && !isCodex && Boolean(process.env.QODER_SESSION_ID);

let stateDir = getClaudeDir();
if (isCodex) stateDir = process.env.PLUGIN_DATA;
// COPILOT_PLUGIN_DATA is unset under VS Code Copilot, so fall back to
// getClaudeDir() rather than building a path from undefined.
if (isCopilot) stateDir = process.env.COPILOT_PLUGIN_DATA || getClaudeDir();
if (isQoder) stateDir = path.join(os.homedir(), '.qoder');

// Qoder has no SessionStart event, so nothing clears this file at a session
// boundary: a level written in one session was still there in the next. Keying
// it by QODER_SESSION_ID is what makes the documented "sticks until session
// end" true there — and it is what lets `/lazy default` pin the level THIS
// session is running at without freezing every later session at that level too.
// The id reaches a filename, so anything that is not a plain name is replaced.
// These files are never cleaned up, deliberately: mtime is not a liveness
// signal — a session open or resumed past any age still owns its level — so
// deleting by age silently reset live sessions to the default. Each file is a
// handful of bytes, which is the cheaper thing to leave lying around.
const stateFile = isQoder
  ? `${STATE_FILE}-${String(process.env.QODER_SESSION_ID).replace(/[^\w.-]/gu, '_').slice(0, 64)}`
  : STATE_FILE;
const statePath = path.join(stateDir, stateFile);
function setMode(mode) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, mode);
}

function clearMode() {
  // Already absent is the state we wanted; nothing to report.
  try { fs.unlinkSync(statePath); } catch (e) { /* no flag to clear */ }
}

// Live mode written by activate/mode-tracker. Absent flag = lazy off.
function readMode() {
  try {
    // The flag file is on disk and hand-editable; anything that is not a level
    // is not a level. It used to reach the statusline verbatim, so a file
    // holding escape sequences printed them straight into the prompt.
    return normalizePersistedMode(fs.readFileSync(statePath, 'utf8').trim());
  } catch (e) {
    // No flag file means lazy is off, which is a level, not a failure.
    return null;
  }
}

function writeHookOutput(event, mode, context = '') {
  if (isCopilot) {
    // Copilot reads additionalContext on SessionStart; ignores output elsewhere.
    process.stdout.write(JSON.stringify(
      event === 'SessionStart' && context ? { additionalContext: context } : {}));
    return;
  }
  if (isCodex) {
    // No systemMessage: Codex renders it as a yellow `warning:` line that reads
    // like an error every session, and dims the completed-hook bullet from green
    // to neutral (#605). The mode stays visible through the hook-context line
    // Codex prints from additionalContext ("LAZY MODE ACTIVE — level: …").
    const output = {};
    if (context) {
      output.hookSpecificOutput = {
        hookEventName: event,
        additionalContext: context,
      };
    }
    process.stdout.write(JSON.stringify(output));
    return;
  }
  if (isQoder) {
    // Qoder: hookSpecificOutput JSON, same shape as Codex minus systemMessage.
    // UserPromptSubmit additionalContext is injected into the Agent's conversation.
    const output = {};
    if (context) {
      output.hookSpecificOutput = {
        hookEventName: event,
        additionalContext: context,
      };
    }
    process.stdout.write(JSON.stringify(output));
    return;
  }
  // Native Claude: SessionStart accepts raw stdout, but SubagentStart needs the
  // hookSpecificOutput JSON form or the context is dropped.
  if (event === 'SubagentStart') {
    process.stdout.write(JSON.stringify(
      { hookSpecificOutput: { hookEventName: event, additionalContext: context } }));
    return;
  }
  process.stdout.write(context);
}

module.exports = {
  clearMode,
  isCodex,
  isCopilot,
  isQoder,
  readMode,
  setMode,
  writeHookOutput,
};
