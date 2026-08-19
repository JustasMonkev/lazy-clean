#!/usr/bin/env node
// lazy — UserPromptSubmit hook to track which lazy mode is active
// Inspects user input for /lazy commands and writes mode to flag file

const { getDefaultMode, isDeactivationCommand, writeDefaultMode } = require('./lazy-config');
const { clearMode, isQoder, readMode, setMode, writeHookOutput } = require('./lazy-runtime');
const { getLazyInstructions } = require('./lazy-instructions');

let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;
  try {
    // Strip UTF-8 BOM some shells prepend when piping (breaks JSON.parse)
    const data = JSON.parse(input.replace(/^\uFEFF/, ''));
    let prompt = (data.prompt || '').trim().toLowerCase();

    // Claude Code dispatches /lazy as a skill: data.prompt then carries
    // the whole skill body wrapped in XML tags, never the typed command, so
    // the [/@$]lazy anchor below can't match and the mode flag was never
    // written (#584). Rebuild the command string from the tags — but only
    // when the prompt *starts* with the platform's dispatch envelope. The
    // prompt is untrusted text; tags merely pasted or discussed mid-message
    // must stay inert, same reason the anchors below exist at all.
    const nameTag = prompt.match(/^(?:<command-message>[^<]*<\/command-message>\s*)?<command-name>\s*\/?([^<\n]*?)\s*<\/command-name>/);
    if (nameTag && nameTag[1]) {
      const argsTag = prompt.match(/<command-args>\s*([^<\n]*?)\s*<\/command-args>/);
      prompt = ('/' + nameTag[1] + ' ' + (argsTag ? argsTag[1] : '')).trim();
    }

    // One JSON object per invocation. Every branch records what it wants to
    // say and exactly one write happens at the end: writing from the branches
    // emitted two concatenated objects on Qoder, where the ruleset below is
    // also written, and neither could be parsed.
    let notice = null;
    let modeSwitched = false;
    let deactivated = false;
    // Outer scope because Qoder initializes the mode further down and has to
    // re-answer a bare `/lazy` from the level that initialization produced.
    let isReportOnly = false;
    // The default as it stood BEFORE this prompt could change it. Qoder's
    // first-prompt initializer below reads the default to pick the live level,
    // so without this `/lazy default ultra` announced "new sessions start in
    // ultra" and then started ultra in this one.
    let defaultBeforeCommand = null;
    if (/^[/@$]lazy/.test(prompt)) {
      const parts = prompt.split(/\s+/);
      const cmd = parts[0].replace(/^[@$]/, '/');
      const arg = parts[1] || '';

      let mode = null;
      let handled = false;

      if (cmd === '/lazy-review' || cmd === '/lazy:lazy-review') {
        mode = 'review';
      } else if (cmd === '/lazy' || cmd === '/lazy:lazy') {
        // `/lazy default <mode>` persists the default to config (survives
        // restarts). Plain switches stay session-scoped ("sticks until session
        // end"), so this is the only path that writes config. review is not a
        // valid default (#377), so only off/lite/full/ultra are accepted.
        if (arg === 'default') {
          const dmode = parts[2];
          if (dmode === 'off' || dmode === 'lite' || dmode === 'full' || dmode === 'ultra') {
            // A failed write must say so: silently doing nothing looks like it
            // worked until the next session starts in the old mode.
            try {
              defaultBeforeCommand = getDefaultMode();
              writeDefaultMode(dmode);
              notice = 'LAZY DEFAULT SET — new sessions start in ' + dmode + '.';
            } catch (e) {
              notice = 'LAZY: could not write the default (' + e.message + ').';
            }
          } else {
            notice = 'LAZY: ' + (dmode ? '"' + dmode + '" is not' : 'a default level is required —') + ' one of off|lite|full|ultra.';
          }
          handled = true; // don't fall through to the session-mode switch
        } else if (arg === 'lite') mode = 'lite';
        else if (arg === 'full') mode = 'full';
        else if (arg === 'ultra') mode = 'ultra';
        else if (arg === 'off') mode = 'off';
        else if (arg === '') {
          // Report what is live, never what the config would start. Reporting
          // the default said "ACTIVE — level: full" while the flag was absent,
          // so the model believed lazy was on and every subagent saw it off.
          isReportOnly = true;
          mode = readMode();
        } else {
          // An unrecognized level used to fall back to the default, silently
          // downgrading an ultra session — or turning lazy off outright when
          // the default was off.
          notice = 'LAZY: unknown level "' + arg + '" — use lite|full|ultra|off.';
          handled = true;
        }
      }

      if (handled) {
        // The branch above already said what happened.
      } else if (isReportOnly) {
        notice = mode ? 'LAZY MODE ACTIVE — level: ' + mode : 'LAZY MODE OFF — start with /lazy lite|full|ultra.';
      } else if (mode && mode !== 'off') {
        setMode(mode);
        modeSwitched = true;
        notice = 'LAZY MODE CHANGED — level: ' + mode;
      } else if (mode === 'off') {
        clearMode();
        deactivated = true;
        notice = 'LAZY MODE OFF';
      }
    }

    // Detect deactivation
    if (!modeSwitched && !deactivated && isDeactivationCommand(prompt)) {
      clearMode();
      deactivated = true;
      notice = 'LAZY MODE OFF';
    }

    // Qoder has no SessionStart event, so UserPromptSubmit does double duty:
    // activate the default mode on first prompt (if no flag exists yet), then
    // inject the ruleset on every prompt. Claude Code/Codex do this in
    // SessionStart via lazy-activate.js; Qoder can't, so we do it here.
    // Skip when deactivated — user just turned lazy off.
    if (isQoder && !deactivated) {
      let currentMode = readMode();
      if (!currentMode) {
        // First prompt in session — initialize from config/env default, or from
        // the default this very prompt replaced: `/lazy default` is documented
        // as changing what LATER sessions start at, so it must not decide this
        // one's level.
        currentMode = defaultBeforeCommand ?? getDefaultMode();
        // `off` is normally left unwritten — no flag IS off, and writing one
        // would make every session start by creating state. But when this
        // prompt moved the default, the absent flag stops meaning "off" and
        // starts meaning "derive from the new default", so the NEXT prompt
        // activated what this one only scheduled. Pin it in that case.
        if (currentMode !== 'off' || defaultBeforeCommand !== null) {
          try { setMode(currentMode); } catch (e) { /* best-effort: the ruleset below still goes out */ }
        }
      }
      // The report-only notice above was computed before this initialization
      // ran, so a bare `/lazy` on the first Qoder prompt said OFF in the same
      // message that turned lazy on. Answer from the level that is live now.
      if (isReportOnly) {
        notice = currentMode && currentMode !== 'off'
          ? 'LAZY MODE ACTIVE — level: ' + currentMode
          : 'LAZY MODE OFF — start with /lazy lite|full|ultra.';
      }
      if (currentMode && currentMode !== 'off') {
        writeHookOutput('UserPromptSubmit', currentMode,
          [notice, getLazyInstructions(currentMode)].filter(Boolean).join('\n\n'));
        return;
      }
    }

    if (notice) writeHookOutput('UserPromptSubmit', readMode() || 'off', notice);
  } catch (e) {
    // Silent fail
  }
}

process.stdin.on('data', chunk => {
  input += chunk;
  // Bound stdin: no real hook payload approaches 32MB; a runaway pipe would OOM the string.
  if (input.length > 32e6) { finish(); process.stdin.destroy(); }
});
process.stdin.on('end', finish);

// Never hang the session. On Windows, Claude Code runs this hook through a
// PowerShell `if {}` wrapper that can swallow the piped prompt JSON, so stdin
// 'end' never fires and the hook blocks forever — freezing the session (#443).
// On error, or after a short fallback, process whatever arrived (recovering the
// mode if data came without EOF) and exit. unref() keeps the timer from adding
// latency to the normal path, where 'end' fires first. Mirrors the best-effort,
// never-block contract the other lifecycle hooks already follow.
process.stdin.on('error', () => { finish(); process.stdin.destroy(); });
setTimeout(() => { finish(); process.stdin.destroy(); }, 1000).unref();
