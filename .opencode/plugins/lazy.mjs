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
const { getDefaultMode, normalizePersistedMode } = require('../../hooks/lazy-config');
const { parseCommandFile } = require('./lazy-frontmatter.cjs');

// OpenCode has no flag-file convention of its own; keep mode beside its config.
const statePath = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
  'opencode',
  '.lazy-active',
);

function readMode() {
  try {
    return normalizePersistedMode(fs.readFileSync(statePath, 'utf8').trim()) || getDefaultMode();
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
    try { client && client.app && client.app.log({ body: { service: 'lazy', level, message } }); } catch (e) {}
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
      } catch (e) {}

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
      // `off` is persisted like any mode; the transform reads it and stays silent.
      const args = String(input.arguments || '').trim();
      const mode = args ? normalizePersistedMode(args) : getDefaultMode();
      if (!mode) return;
      writeMode(mode);
      log('info', 'lazy ' + mode);
    },
  };
};
