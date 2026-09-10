const { readHookInput } = require('./lazy-input');
const { getSessionState } = require('./lazy-runtime');
const { getHideStatus } = require('./lazy-config');

readHookInput((data) => {
  if (getHideStatus()) return;
  const mode = getSessionState(data && data.session_id).readMode();
  if (!mode || mode === 'off') return;
  const color = mode === 'ultra' ? 173 : 108;
  const suffix = mode === 'full' ? '' : ':' + mode.toUpperCase();
  process.stdout.write(`\x1b[38;5;${color}m[LAZY${suffix}]\x1b[0m`);
});
