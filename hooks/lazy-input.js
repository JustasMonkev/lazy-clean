// Lifecycle hosts can leave stdin open. Bound bytes and waiting on every path.
function readHookInput(callback) {
  let input = '';
  let bytes = 0;
  let done = false;
  const timer = setTimeout(finish, 1000);
  timer.unref();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', onData);
  process.stdin.on('end', finish);
  process.stdin.on('error', finish);

  function onData(chunk) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 32e6) {
      input = '';
      finish();
      return;
    }
    input += chunk;
  }

  function finish() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    process.stdin.removeListener('data', onData);
    process.stdin.removeListener('end', finish);
    process.stdin.removeListener('error', finish);
    process.stdin.destroy();
    let data = null;
    try {
      const parsed = JSON.parse(input.replace(/^\uFEFF/, ''));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
    } catch (e) { /* absent or malformed payload uses the caller's legacy fallback */ }
    callback(data);
  }
}

module.exports = { readHookInput };
