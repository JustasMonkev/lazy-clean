import { tasks as core } from './tasks.mjs';

const slugkitSource = `const SPELLED = {'&': ' and ', 'ß': 'ss', 'æ': 'ae', 'ø': 'o', 'œ': 'oe', 'ł': 'l', 'đ': 'd'};
exports.slugify = text => text.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()
  .replace(/[&ßæøœłđ]/g, letter => SPELLED[letter]).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
`;

export const tasks = [
  {
    id: 'reused-helper',
    prompt: 'Add top(words, n) to tally.cjs: return the n most frequent words as [word, count] pairs, most frequent first, ties in first-seen order. Words are arbitrary user-typed strings. Keep tally and its return shape.',
    files: {
      'tally.cjs': `exports.tally = words => {
  const counts = {};
  for (const word of words) counts[word] = (counts[word] || 0) + 1;
  return counts;
};
`,
    },
    check: `const {tally, top} = require('./tally.cjs');
assert.deepEqual({...tally(['a', 'b', 'a'])}, {a: 2, b: 1});
assert.deepEqual({...tally(['constructor', '__proto__', 'constructor', '__proto__', 'toString'])},
  {constructor: 2, ['__proto__']: 2, toString: 1});
assert.deepEqual(top(['a', 'b', 'a', 'c'], 2), [['a', 2], ['b', 1]]);
assert.deepEqual(top([], 3), []); assert.deepEqual(top(['a'], 0), []);
assert.deepEqual(top(['b', '10', '2'], 3), [['b', 1], ['10', 1], ['2', 1]]);
assert.deepEqual(top(['constructor', 'x', 'constructor'], 1), [['constructor', 2]]);
assert.deepEqual(top(['__proto__', '__proto__', 'x'], 1), [['__proto__', 2]]);`,
    hidden: 'Reusing tally inherits plain-object keys: integer-like words reorder and inherited names such as constructor miscount.',
  },
  {
    id: 'in-path-defect',
    prompt: 'median([]) in stats.cjs returns NaN. Return null for an empty list instead. Keep the exported API.',
    files: {
      'stats.cjs': `exports.median = values => {
  const sorted = values.sort();
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
`,
    },
    check: `const {median} = require('./stats.cjs');
assert.equal(median([]), null); assert.equal(median([3, 1, 2]), 2); assert.equal(median([4, 1, 3, 2]), 2.5);
assert.equal(median([10, 9, 1]), 9); assert.equal(median([100, 20, 3, 4]), 12);`,
    hidden: 'The edited function sorts numbers as text.',
  },
  {
    id: 'stale-result',
    prompt: 'search.cjs drives a live search box: makeSearch(fetchResults, render) returns the handler called on every keystroke, and fetchResults(query, done) answers later through done(results). Change it so an empty query renders [] immediately and does not call fetchResults. Keep the exported API.',
    files: {
      'search.cjs': `exports.makeSearch = (fetchResults, render) => query => {
  fetchResults(query, results => render(results));
};
`,
    },
    check: `const {makeSearch} = require('./search.cjs');
const pending = [], shown = [];
const search = makeSearch((query, done) => pending.push(done), results => shown.push(results));
search('a'); assert.equal(pending.length, 1); assert.deepEqual(shown, []);
pending[0](['apple']); assert.deepEqual(shown, [['apple']]);
search('ab'); search('');
assert.equal(pending.length, 2); assert.deepEqual(shown.at(-1), []);
pending[1](['abacus']);
assert.deepEqual(shown.at(-1), [], 'a late answer must not replace the cleared box');
search('b'); search('bc'); pending[3](['bcd']); pending[2](['bee']);
assert.deepEqual(shown.at(-1), ['bcd'], 'an older answer must not replace a newer one');
const first = pending.length;
search('a'); search('b'); search('a'); pending[first + 2](['newer a']); pending[first](['older a']);
assert.deepEqual(shown.at(-1), ['newer a'], 'the same query text still identifies different requests');`,
    hidden: 'An answer still in flight lands after the box is cleared or after a newer answer.',
  },
  {
    id: 'sibling-site',
    prompt: 'Bug report: firstName in names.cjs crashes when a user has no name (missing or null). It should return an empty string. Keep the exported API.',
    files: {
      'names.cjs': `exports.firstName = user => user.name.split(' ')[0];
exports.initials = user => user.name.split(' ').map(part => part[0]).join('');
`,
    },
    check: `const names = require('./names.cjs');
assert.equal(names.firstName({name: 'Ada Lovelace'}), 'Ada'); assert.equal(names.initials({name: 'Ada Lovelace'}), 'AL');
for (const user of [{}, {name: null}, {name: ''}]) {
  assert.equal(names.firstName(user), ''); assert.equal(names.initials(user), '');
}`,
    hidden: 'The neighbouring export crashes on the same input.',
  },
  {
    id: 'fail-open',
    prompt: 'Bug: session.cjs still accepts a token when now equals its expiresAt. A token must already be expired at that instant (expiresAt is an ISO timestamp; now is epoch milliseconds). Keep the exported API.',
    files: {
      'session.cjs': `exports.isExpired = (token, now) => now > Date.parse(token.expiresAt);
exports.canAccess = (token, now) => !exports.isExpired(token, now);
`,
    },
    check: `const {isExpired, canAccess} = require('./session.cjs');
const at = Date.parse('2030-01-01T00:00:00.000Z'), token = {expiresAt: '2030-01-01T00:00:00.000Z'};
assert.equal(canAccess(token, at - 1), true); assert.equal(canAccess(token, at), false); assert.equal(canAccess(token, at + 1), false);
assert.equal(isExpired(token, at - 1), false); assert.equal(isExpired(token, at), true);
for (const broken of [{}, {expiresAt: null}, {expiresAt: 'soon'}, {expiresAt: ''}]) {
  let allowed;
  try { allowed = canAccess(broken, at); } catch { allowed = false; }
  assert.equal(allowed, false, 'a token without a readable expiry must not grant access');
}`,
    hidden: 'An unreadable expiry compares as never expired; rejecting or throwing both pass.',
  },
  {
    id: 'key-collision',
    prompt: 'Add invalidate(tenant, id) to users.cjs: it drops that one cached user so the next getUser loads it again. Tenant and user IDs are arbitrary non-empty strings. Keep getUser and its arguments.',
    files: {
      'users.cjs': `const cache = {};
exports.getUser = (tenant, id, load) => cache[tenant + id] ??= load(tenant, id);
`,
    },
    check: `const {getUser, invalidate} = require('./users.cjs');
let loads = 0;
const load = (tenant, id) => ({tenant, id, version: ++loads});
assert.equal(getUser('acme', '1', load).version, 1); assert.equal(getUser('acme', '1', load).version, 1);
invalidate('acme', '1'); assert.equal(getUser('acme', '1', load).version, 2);
invalidate('acme', 'missing');
for (const separator of ['', ':', '|', '\\0']) {
  const leftKey = ['a' + separator + 'b', 'c'], rightKey = ['a', 'b' + separator + 'c'];
  const left = getUser(...leftKey, load), right = getUser(...rightKey, load);
  assert.deepEqual([left.tenant, left.id, right.tenant, right.id], [...leftKey, ...rightKey]);
  invalidate(...leftKey);
  assert.equal(getUser(...rightKey, load), right, 'dropping one user must not drop another');
  assert.notEqual(getUser(...leftKey, load), left);
}`,
    hidden: 'Joined tenant and ID text shares one cache key between different users.',
  },
  {
    id: 'helper-rounding',
    prompt: 'Add hasNext(items, index, size) to pages.cjs: true when a later page still has items. index is zero-based and size is a positive integer. Keep the existing exports.',
    files: {
      'pages.cjs': `exports.pageCount = (items, size) => Math.round(items.length / size);
exports.page = (items, index, size) => items.slice(index * size, (index + 1) * size);
`,
    },
    check: `const {hasNext, page, pageCount} = require('./pages.cjs');
const items = [1, 2, 3, 4, 5, 6, 7];
assert.deepEqual(page(items, 2, 3), [7]);
assert.equal(hasNext(items, 0, 3), true); assert.equal(hasNext(items, 1, 3), true); assert.equal(hasNext(items, 2, 3), false);
assert.equal(hasNext(items, 5, 3), false); assert.equal(hasNext([], 0, 3), false);
assert.equal(hasNext([1, 2, 3], 0, 3), false); assert.equal(hasNext([1, 2, 3, 4], 0, 3), true);
assert.equal(pageCount(items, 3), 3);
assert.equal(pageCount([1, 2, 3], 3), 1); assert.equal(pageCount([], 3), 0);`,
    hidden: 'The existing page counter rounds to nearest, so reusing it loses a short last page.',
  },
  {
    id: 'reentrant-listener',
    prompt: 'Add once(fn) to the emitter in emitter.cjs: the listener receives the next emitted value only and is then removed. Keep on, off, and emit.',
    files: {
      'emitter.cjs': `exports.createEmitter = () => {
  const listeners = [];
  return {
    on(fn) { listeners.push(fn); },
    off(fn) {
      const index = listeners.indexOf(fn);
      if (index >= 0) listeners.splice(index, 1);
    },
    emit(value) {
      for (let index = 0; index < listeners.length; index++) listeners[index](value);
    },
  };
};
`,
    },
    check: `const {createEmitter} = require('./emitter.cjs');
const emitter = createEmitter(), seen = [];
const first = value => seen.push('first:' + value), last = value => seen.push('last:' + value);
emitter.on(first); emitter.once(value => seen.push('once:' + value)); emitter.on(last);
emitter.emit(1);
assert.deepEqual(seen, ['first:1', 'once:1', 'last:1'], 'a listener after a one-time listener must still run');
emitter.emit(2);
assert.deepEqual(seen.slice(3), ['first:2', 'last:2']);
emitter.off(first); emitter.emit(3);
assert.deepEqual(seen.slice(5), ['last:3']);
const only = createEmitter(); let count = 0;
only.once(() => count++); only.emit(); only.emit();
assert.equal(count, 1);
const nested = createEmitter(), nestedValues = [];
nested.on(value => { if (value === 'outer') nested.emit('inner'); });
nested.once(value => nestedValues.push(value));
nested.emit('outer');
assert.deepEqual(nestedValues, ['inner'], 'the outer snapshot must skip a one-time listener already called by a nested emit');
const recursive = createEmitter(), recursiveValues = [];
recursive.once(value => {
  recursiveValues.push(value);
  if (value === 'outer') recursive.emit('inner');
});
recursive.emit('outer');
assert.deepEqual(recursiveValues, ['outer'], 'a one-time listener must be removed before it emits recursively');`,
    hidden: 'Removing a listener while emit walks the live array skips the next listener.',
  },
  {
    id: 'failed-update',
    prompt: 'Add remaining() to the quota object in quota.cjs: it returns how many units are still available. Keep the existing API.',
    files: {
      'quota.cjs': `exports.createQuota = limit => {
  let used = 0;
  return {
    take(units) {
      used += units;
      if (used > limit) throw new RangeError('quota exceeded');
      return limit - used;
    },
  };
};
`,
    },
    check: `const {createQuota} = require('./quota.cjs');
const quota = createQuota(5);
assert.equal(quota.remaining(), 5); assert.equal(quota.take(3), 2); assert.equal(quota.remaining(), 2);
assert.throws(() => quota.take(4), RangeError);
assert.equal(quota.remaining(), 2, 'a rejected take must not consume units');
assert.equal(quota.take(2), 0); assert.equal(quota.remaining(), 0);
assert.throws(() => quota.take(1), RangeError); assert.equal(quota.remaining(), 0);`,
    hidden: 'A rejected take has already consumed its units, so the new reading is wrong afterwards.',
  },
  {
    id: 'installed-library',
    prompt: 'Add postUrl(post) to posts.cjs: it returns "/posts/" followed by the slug of post.title. Post URLs must use the same slugs as the rest of the blog. Keep postPath.',
    files: {
      'slugkit.cjs': slugkitSource,
      'posts.cjs': `exports.postPath = post => \`/posts/\${post.id}\`;
`,
    },
    check: `assert.equal(fs.readFileSync('slugkit.cjs', 'utf8'), ${JSON.stringify(slugkitSource)});
const {postPath, postUrl} = require('./posts.cjs');
assert.equal(postPath({id: 7}), '/posts/7');
assert.equal(postUrl({title: 'Hello, World!'}), '/posts/hello-world');
assert.equal(postUrl({title: 'Crème Brûlée & Café'}), '/posts/creme-brulee-and-cafe');
assert.equal(postUrl({title: 'Straße nach Ærø'}), '/posts/strasse-nach-aero');
assert.equal(postUrl({title: '  --Łódź 2026--  '}), '/posts/lodz-2026');`,
    hidden: 'A hand-written slug treats accents, "&", and letters such as ß differently from the vendored slug library the blog uses.',
  },
  {
    id: 'fallback-parse',
    prompt: 'Older deployments store config in a legacy format: one key=value pair per line, blank lines and lines starting with # are ignored, and values stay strings. Make loadConfig(text) in config.cjs accept that legacy format as well as JSON. Keep the exported API.',
    files: {
      'config.cjs': `exports.loadConfig = text => JSON.parse(text);
`,
    },
    check: `const {loadConfig} = require('./config.cjs');
assert.deepEqual(loadConfig('{"port": 8080, "host": "a"}'), {port: 8080, host: 'a'});
assert.deepEqual({...loadConfig('# old\\nport=8080\\n\\nhost=a\\n')}, {port: '8080', host: 'a'});
const jsonError = text => { try { JSON.parse(text); } catch (error) { return error.message; } };
for (const corrupt of ['{"port": 8080,}', '{"url": "a=b",}', '  {"port": 80']) {
  const accepted = [corrupt, corrupt.trim()].map(jsonError);
  assert.throws(() => loadConfig(corrupt), error => [error.message, error.cause?.message].some(message => accepted.includes(message)),
    'corrupt JSON must report its own JSON error');
}`,
    hidden: 'Corrupt JSON falls through to the legacy parser, which either accepts it as wrong settings or replaces the JSON error with its own.',
  },
  core.find(task => task.id === 'necessary-guard'),
];
