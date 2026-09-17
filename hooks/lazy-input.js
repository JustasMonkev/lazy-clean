// Lifecycle hosts can leave stdin open. Bound bytes and waiting on every path.
function readHookInput(callback) {
  const chunks = [];
  let data = null;
  let bytes = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let complete = false;
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
      finish();
      return;
    }
    if (complete) return;
    chunks.push(chunk);
    // Find the object boundary once; JSON.parse still validates the full payload.
    for (const char of chunk) {
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          complete = true;
          break;
        }
      }
    }
    if (!complete) return;
    let parsed;
    try {
      parsed = JSON.parse(chunks.join('').replace(/^\uFEFF/, ''));
    } catch (e) { return; /* malformed input uses the fallback at EOF or timeout */ }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed;
      finish();
    }
  }

  function finish() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    process.stdin.removeListener('data', onData);
    process.stdin.removeListener('end', finish);
    process.stdin.removeListener('error', finish);
    process.stdin.destroy();
    callback(data);
  }
}

module.exports = { readHookInput };
