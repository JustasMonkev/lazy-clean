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

function modeState(directory, sessionId) {
  const scoped = validSessionId(sessionId);
  const statePath = path.join(directory, scoped ? sessionStateFile(sessionId) : '.lazy-active');
  return {
    scoped,
    readMode() {
      try {
        const stat = fs.statSync(statePath);
        if (!stat.isFile() || stat.size > 4096) return null;
        return normalizePersistedMode(fs.readFileSync(statePath, 'utf8').trim());
      } catch (e) {
        // Missing, unreadable, or corrupt state supplies no level.
        return null;
      }
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
  };
}

module.exports = { modeState };
