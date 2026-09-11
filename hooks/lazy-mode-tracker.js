#!/usr/bin/env node
// lazy — UserPromptSubmit hook to track which lazy mode is active
// Inspects user input for /lazy commands and writes mode to flag file

const { getDefaultMode, isDeactivationCommand, normalizeMode, writeDefaultMode } = require('./lazy-config');
const { getSessionState, isQoder, writeHookOutput } = require('./lazy-runtime');
const { readHookInput } = require('./lazy-input');
const { getLazyInstructions } = require('./lazy-instructions');

readHookInput((data) => {
  if (!data) return;
  const { clearMode, readMode, setMode, scoped } = getSessionState(data.session_id);
  try {
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
    // Session-scoped state needs explicit off so restore cannot mistake it for
    // an uninitialized session. Legacy no-ID callers retain absence-as-off.
    // Verify writes before reporting a successful switch.
    const turnOff = () => {
      if (isQoder || scoped) {
        try {
          setMode('off');
        } catch (e) { /* checked below, not assumed */ }
        // In scoped state absence means "not initialized", not off, so
        // only an explicit `off` on disk counts as deactivated here.
        return readMode() === 'off';
      }
      clearMode();
      return readMode() === null;
    };

    let notice = null;
    let modeSwitched = false;
    let deactivated = false;
    // Outer scope because Qoder initializes the mode further down and has to
    // re-answer a bare `/lazy` from the level that initialization produced.
    let isReportOnly = false;
    if (/^[/@$]lazy/.test(prompt)) {
      const parts = prompt.split(/\s+/);
      const cmd = parts[0].replace(/^[@$]/, '/');
      const arg = parts[1] || '';

      let mode = null;
      let handled = false;

      if (cmd === '/lazy-review' || cmd === '/lazy:lazy-review') {
        // One-shot, exactly as skills/lazy-review/SKILL.md promises: "it sets no
        // mode, so there is nothing to revert". Persisting `review` pinned every
        // later prompt and every subagent to a level the docs never mention, and
        // made a bare `/lazy` answer "ACTIVE — level: review" with no documented
        // way back. The review ruleset goes out for THIS turn and the live level
        // is untouched -- which is what OpenCode already did, so this is the two
        // hosts agreeing rather than a new rule.
        writeHookOutput('UserPromptSubmit', readMode() || 'off', getLazyInstructions('review'));
        return;
      }
      if (cmd === '/lazy' || cmd === '/lazy:lazy') {
        // `/lazy default <mode>` persists the default to config (survives
        // restarts). Plain switches stay session-scoped ("sticks until session
        // end"), so this is the only path that writes config. review is not a
        // valid default (#377), so only off/lite/full/ultra are accepted.
        if (arg === 'default') {
          const dmode = parts[2];
          if (dmode === 'off' || dmode === 'lite' || dmode === 'full' || dmode === 'ultra') {
            // A missing scoped level is derived from the config default
            // whenever no flag exists, so this session has to be pinned BEFORE
            // the default moves. Pinning afterwards left a failed pin with the
            // new default already written, and the next prompt adopted it — the
            // command changing the one session it promises not to touch.
            // `off` is pinned like any level: absent means "derive", not "off",
            // once the value it would derive from has changed.
            let pinned = true;
            if ((isQoder || scoped) && !readMode()) {
              try {
                setMode(getDefaultMode());
              } catch (e) {
                notice = 'LAZY: could not pin the current level, so the default was left unchanged (' + e.message + ').';
                pinned = false;
              }
            }
            // A failed write must say so: silently doing nothing looks like it
            // worked until the next session starts in the old mode.
            if (pinned) {
              try {
                writeDefaultMode(dmode);
                // LAZY_DEFAULT_MODE outranks the config file getDefaultMode()
                // reads, so with it set to something else the write lands and
                // changes nothing anyone will see. Saying "new sessions start
                // in ultra" there is simply false.
                const override = normalizeMode(process.env.LAZY_DEFAULT_MODE);
                notice = override && override !== dmode
                  ? 'LAZY: default saved as ' + dmode + ', but LAZY_DEFAULT_MODE=' + override +
                    ' overrides it — new sessions start in ' + override + ' until that variable is unset.'
                  : 'LAZY DEFAULT SET — new sessions start in ' + dmode + '.';
              } catch (e) {
                notice = 'LAZY: could not write the default (' + e.message + ').';
              }
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
        notice = mode && mode !== 'off' ? 'LAZY MODE ACTIVE — level: ' + mode : 'LAZY MODE OFF — start with /lazy lite|full|ultra.';
      } else if (mode && mode !== 'off') {
        // A failed write must say so, same as the off path below: setMode()
        // throwing landed in the outer silent catch, so /lazy ultra printed
        // nothing and the old level stayed live while the user believed it
        // changed. Read the level back from disk instead of assuming.
        try { setMode(mode); } catch (e) { /* verified by readMode below */ }
        modeSwitched = readMode() === mode;
        notice = modeSwitched
          ? 'LAZY MODE CHANGED — level: ' + mode
          : 'LAZY: could not switch to ' + mode + ' — the mode state could not be written, so the previous level is still active.';
      } else if (mode === 'off') {
        deactivated = turnOff();
        notice = deactivated
          ? 'LAZY MODE OFF'
          : 'LAZY: could not turn lazy off — the mode state could not be written, so lazy is still active.';
      }
    }

    // Detect deactivation
    if (!modeSwitched && !deactivated && isDeactivationCommand(prompt)) {
      deactivated = turnOff();
      notice = deactivated
        ? 'LAZY MODE OFF'
        : 'LAZY: could not turn lazy off — the mode state could not be written, so lazy is still active.';
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
        currentMode = getDefaultMode();
        // Pin off too: another session may change the shared default later.
        try { setMode(currentMode); } catch (e) { /* best-effort: the ruleset below still goes out */ }
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
});
