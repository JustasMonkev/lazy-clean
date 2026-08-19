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

// OpenCode has no flag-file convention of its own; keep mode beside its config.
const statePath = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'opencode',
  '.lazy-active',
);

function readMode() {
  try {
    return normalizeMode(fs.readFileSync(statePath, 'utf8').trim()) || getDefaultMode();
  } catch (e) {
    return getDefaultMode();
  }
}

function writeMode(mode) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, mode);
}

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
    'experimental.chat.system.transform': async (_input, output) => {
      const mode = readMode();
      if (mode === 'off') return;
      const instructions = getLazyInstructions(mode);
      if (output.system.length > 0) {
        output.system[output.system.length - 1] += '\n\n' + instructions;
      } else {
        output.system.push(instructions);
      }
    },

    // Persist `/lazy <level>` so the next turn's injection follows it.
    // lazy: mode applies from the next message, not the current one — the
    // transform reads the flag the command writes. Good enough; switch to a
    // synchronous store if same-turn switching ever matters.
    'command.execute.before': async (input) => {
      if (!input || input.command !== 'lazy') return;
      const args = String(input.arguments || '').trim().split(/\s+/).filter(Boolean);

      // `/lazy default <level>` persists across sessions, same as the Claude
      // hook. Without this the documented command silently did nothing here.
      if (args[0] === 'default') {
        const persisted = normalizeMode(args[1]);
        if (!persisted) {
          log('info', 'lazy: "' + (args[1] || '') + '" is not a default level (off|lite|full|ultra)');
          return;
        }
        // Pin the level this session is actually running at before moving the
        // default out from under it. With no state file, readMode() derives the
        // live level from the config default, so `/lazy default off` used to
        // switch off the session that ran it — a command about later sessions
        // silently changed this one.
        const live = readMode();
        try {
          if (!fs.existsSync(statePath)) writeMode(live);
        } catch (e) {
          // Writing the default anyway would move this session's level, which is
          // the one thing the pin exists to prevent — and the state directory
          // and the config directory can fail independently. Leave both as they
          // are rather than half-applying the command.
          log('error', 'lazy: could not pin the current level, so the default was left unchanged (' + e.message + ')');
          return;
        }
        // An unwritable config directory threw straight into OpenCode's hook
        // runner; the Claude tracker already catches this case and reports it.
        try {
          const saved = writeDefaultMode(persisted) || persisted;
          // Same as the Claude hook: LAZY_DEFAULT_MODE outranks the config file
          // getDefaultMode() reads, so reporting plain success there is false.
          const override = normalizeMode(process.env.LAZY_DEFAULT_MODE);
          log('info', override && override !== saved
            ? 'lazy: default saved as ' + saved + ', but LAZY_DEFAULT_MODE=' + override + ' overrides it'
            : 'lazy default ' + saved);
        } catch (e) {
          log('error', 'lazy: could not write the default (' + e.message + ')');
        }
        return;
      }

      // Bare `/lazy` reports; it must not overwrite the live level with the
      // config default the way it used to.
      if (args.length === 0) {
        log('info', 'lazy ' + readMode());
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
        writeMode(mode);
        log('info', 'lazy ' + mode);
      } catch (e) {
        log('error', 'lazy: could not switch to ' + mode + ' (' + e.message + ')');
      }
    },
  };
};
