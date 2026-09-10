// lazy-clean — OpenCode plugin.
//
// Injects the lazy ruleset into every chat's system prompt at the active
// intensity, persists /lazy mode switches, and registers slash commands.
// Reuses the shared instruction builder so Claude Code, Codex, and OpenCode
// all read one source of truth (skills/lazy/SKILL.md).
//
// OpenCode loads this as a server plugin — it is wired up in opencode.json:
//   { "plugin": ["./.opencode/plugins/lazy.mjs"] }

import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The shared instruction builder is CommonJS; bridge to it from this ES module.
const require = createRequire(import.meta.url);
const { getLazyInstructions } = require('../../hooks/lazy-instructions');
const { getDefaultMode, normalizeMode, writeDefaultMode } = require('../../hooks/lazy-config');
const { parseCommandFile } = require('./lazy-frontmatter.cjs');
const { modeState } = require('../../hooks/lazy-state');

const stateDir = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'opencode',
);
const statePath = path.join(stateDir, '.lazy-active');
const readMode = (state) => normalizeMode(state.readMode()) || getDefaultMode();

export default async ({ client } = {}) => {
  const log = (level, message) => {
    try {
      const sent = client && client.app && client.app.log({ body: { service: 'lazy', level, message } });
      // The client is asynchronous, so try/catch only covers a synchronous
      // throw. A rejection nobody observes — the server connection closing
      // mid-turn is the ordinary way to get one — is an unhandled rejection,
      // which can take the plugin host down over a log line.
      if (sent && typeof sent.then === 'function') sent.then(undefined, () => {});
    } catch (e) { /* logging must never break a turn */ }
  };

  const injected = new WeakMap();
  const lazySkillsDir = path.resolve(__dirname, '../../skills');

  return {
    // Register slash commands + skills directory.
    config: async (config) => {
      if (!config.command) config.command = {};
      const commandDir = path.join(__dirname, '..', 'command');
      try {
        for (const file of fs.readdirSync(commandDir).filter((f) => f.endsWith('.md'))) {
          const name = path.basename(file, '.md');
          const parsed = parseCommandFile(path.join(commandDir, file));
          if (parsed) config.command[name] = parsed;
        }
      } catch (e) {
        // No command directory in this install; the skills path below still
        // registers, so lazy stays usable without slash commands.
      }

      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(lazySkillsDir)) {
        config.skills.paths.push(lazySkillsDir);
      }
    },

    // Append the ruleset to the system prompt every turn.
    'experimental.chat.system.transform': async (input, output) => {
      const state = modeState(stateDir, input && input.sessionID);
      const mode = readMode(state);
      if (state.scoped && !normalizeMode(state.readMode())) {
        try { state.setMode(mode); } catch (e) { log('error', 'lazy: could not retain this session level (' + e.message + ')'); }
      }
      const previous = injected.get(output.system);
      if (previous) {
        const index = output.system.indexOf(previous);
        if (index !== -1) output.system.splice(index, 1);
        injected.delete(output.system);
      }
      if (mode === 'off') return;
      const instructions = getLazyInstructions(mode);
      output.system.push(instructions);
      injected.set(output.system, instructions);
    },

    'command.execute.before': async (input) => {
      if (!input || input.command !== 'lazy') return;
      const state = modeState(stateDir, input.sessionID);
      const args = String(input.arguments || '').trim().split(/\s+/).filter(Boolean);

      // `/lazy default <level>` persists across sessions, same as the Claude
      // hook. Without this the documented command silently did nothing here.
      if (args[0] === 'default') {
        const persisted = normalizeMode(args[1]);
        if (!persisted) {
          log('info', 'lazy: "' + (args[1] || '') + '" is not a default level (off|lite|full|ultra)');
          return;
        }
        if (state.scoped) {
          try {
            if (!normalizeMode(state.readMode())) state.setMode(readMode(state));
            const saved = writeDefaultMode(persisted) || persisted;
            const override = normalizeMode(process.env.LAZY_DEFAULT_MODE);
            log('info', override && override !== saved
              ? 'lazy: default saved as ' + saved + ', but LAZY_DEFAULT_MODE=' + override + ' overrides it'
              : 'lazy default ' + saved + ' (new sessions only; this session stays ' + readMode(state) + ')');
          } catch (e) {
            log('error', 'lazy: could not change the default (' + e.message + ')');
          }
          return;
        }
        // Older hosts without sessionID keep the documented global fallback.
        const sessionLevel = normalizeMode(state.readMode());
        let cleared = null;
        // An unwritable config directory threw straight into OpenCode's hook
        // runner; the Claude tracker already catches this case and reports it.
        try {
          // The save comes FIRST and the clear second. Clearing first meant a
          // failed save destroyed the level the user already had: with `lite`
          // stored and the config unwritable, `/lazy default ultra` reported
          // that nothing was saved and left the next chat on the configured
          // `full` -- neither the level they had nor the one they asked for.
          // Saving first makes the throw land before anything is removed.
          const saved = writeDefaultMode(persisted) || persisted;
          if (sessionLevel) {
            try {
              fs.rmSync(statePath, { force: true });
              cleared = sessionLevel;
            } catch (e) {
              // Reported below: an override that could not be cleared still
              // wins, and claiming the default applies would be the original bug.
              cleared = false;
            }
          }
          // Same as the Claude hook: LAZY_DEFAULT_MODE outranks the config file
          // getDefaultMode() reads, so reporting plain success there is false.
          const override = normalizeMode(process.env.LAZY_DEFAULT_MODE);
          if (override && override !== saved) {
            log('info', 'lazy: default saved as ' + saved + ', but LAZY_DEFAULT_MODE=' + override + ' overrides it');
          } else if (cleared === false) {
            log('error', 'lazy: default saved as ' + saved + ', but the stored ' + sessionLevel
              + ' level could not be cleared, so it still overrides the default');
          } else {
            log('info', 'lazy default ' + saved + (cleared
              ? ' (cleared the stored ' + cleared + ' level, so this and later chats follow the new default; /lazy <level> holds one again)'
              : ' (this chat has no level of its own, so it follows the new default too; /lazy <level> holds one)'));
          }
        } catch (e) {
          log('error', 'lazy: could not write the default (' + e.message + ')');
        }
        return;
      }

      // Bare `/lazy` reports; it must not overwrite the live level with the
      // config default the way it used to.
      if (args.length === 0) {
        log('info', 'lazy ' + readMode(state));
        return;
      }

      // normalizeMode, not normalizePersistedMode: `review` is a session-only
      // mode elsewhere, and persisting it here pinned every future turn to a
      // level documented nowhere.
      // `off` is persisted like any mode; the transform reads it and stays silent.
      const mode = normalizeMode(args[0]);
      if (!mode) {
        log('info', 'lazy: unknown level "' + args[0] + '" — use lite|full|ultra|off');
        return;
      }
      try {
        state.setMode(mode);
        log('info', 'lazy ' + mode);
      } catch (e) {
        log('error', 'lazy: could not switch to ' + mode + ' (' + e.message + ')');
      }
    },
  };
};
