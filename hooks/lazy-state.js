const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizePersistedMode } = require('./lazy-config');

function sessionStateFile(id) {
  const readable = id.replace(/[^\w.-]/gu, '_').slice(0, 32);
  const utf8 = Buffer.from(id, 'utf8');
  // Keep legacy UTF-8 names for well-formed IDs; 0xff cannot occur in UTF-8,
  // so it separates malformed IDs' exact UTF-16 identity from that namespace.
  const identity = utf8.toString('utf8') === id
    ? utf8
    : Buffer.concat([Buffer.from([0xff]), Buffer.from(id, 'utf16le')]);
  const digest = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16);
  return `.lazy-active-${readable}-${digest}`;
}

function validSessionId(id) {
  return typeof id === 'string' && id.length > 0;
}

function readModeFile(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 4096) return null;
    return normalizePersistedMode(fs.readFileSync(file, 'utf8').trim());
  } catch (e) {
    return null;
  }
}

function modeState(directory, sessionId) {
  const scoped = validSessionId(sessionId);
  const statePath = path.join(directory, scoped ? sessionStateFile(sessionId) : '.lazy-active');
  const claimDirectory = `${statePath}.migration`;
  const claimPath = path.join(claimDirectory, 'mode');
  const state = {
    scoped,
    readMode() {
      const mode = readModeFile(statePath);
      if (mode || !scoped) return mode;
      return readModeFile(claimPath) || readModeFile(statePath);
    },
    setMode(mode) {
      fs.mkdirSync(directory, { recursive: true });
      // Readers must see the old or new level, never a truncated write.
      const temporary = `${statePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
      try {
        fs.writeFileSync(temporary, mode, { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, statePath);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    },
    clearMode() {
      try { fs.unlinkSync(statePath); } catch (e) { /* already absent or checked by the caller */ }
    },
    migrateLegacyMode() {
      if (!scoped || state.readMode() || !modeState(directory).readMode()) return;
      const legacyPath = path.join(directory, '.lazy-active');
      fs.mkdirSync(claimDirectory, { mode: 0o700 });
      try {
        fs.renameSync(legacyPath, claimPath);
      } catch (e) {
        fs.rmdirSync(claimDirectory);
        if (e.code === 'ENOENT') return;
        throw e;
      }
      let migrated = false;
      try {
        if (!readModeFile(claimPath)) return;
        try {
          fs.linkSync(claimPath, statePath);
          migrated = true;
        } catch (e) {
          if (e.code !== 'EEXIST' || !readModeFile(statePath)) throw e;
        }
      } finally {
        if (!migrated) fs.linkSync(claimPath, legacyPath);
        fs.unlinkSync(claimPath);
        fs.rmdirSync(claimDirectory);
      }
    },
  };
  return state;
}

module.exports = { modeState };
