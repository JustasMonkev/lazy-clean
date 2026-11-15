import { tasks as core } from './tasks.mjs';

export const tasks = [
  {
    id: 'query-pairs',
    prompt: 'Implement encodeQuery(pairs) in query.cjs. Input is an array of string [name, value] pairs. Return an application/x-www-form-urlencoded query without a leading question mark. Preserve pair order, duplicate names, empty names and values, and inputs. Spaces encode as +; literal +, &, =, / and ~ must be percent-encoded; Unicode uses UTF-8. An empty array returns an empty string.',
    files: {
      'query.cjs': `exports.encodeQuery = pairs => pairs.map(([name, value]) => name + '=' + value).join('&');
`,
    },
    check: `const {encodeQuery} = require('./query.cjs');
const pairs = Object.freeze([Object.freeze(['tag', 'a b']), Object.freeze(['tag', 'a+b']), Object.freeze(['', '']), Object.freeze(['x&=', '/~'])]);
assert.equal(encodeQuery(pairs), 'tag=a+b&tag=a%2Bb&=&x%26%3D=%2F%7E');
const mutablePairs = [['city', 'Vilnius ☕'], ['*.-_', '*.-_']];
assert.equal(encodeQuery(mutablePairs), 'city=Vilnius+%E2%98%95&*.-_=*.-_');
assert.deepEqual(mutablePairs, [['city', 'Vilnius ☕'], ['*.-_', '*.-_']]);
assert.equal(encodeQuery([['é', '雪'], ['tag', ''], ['tag', 'last']]), '%C3%A9=%E9%9B%AA&tag=&tag=last');
assert.equal(encodeQuery([]), '');`,
    design: 'Record native URLSearchParams delegation versus a custom encoder as a descriptive choice. Correct alternative implementations pass; syntax is not a behavior requirement.',
  },
  {
    id: 'existing-component',
    prompt: 'Add renderStatus(label, tone = "neutral") to panel.cjs. It returns a span with class="badge badge-<tone>" and the label as text. Escape &, <, >, double quote, and single quote in both interpolated values using &amp;, &lt;, &gt;, &quot;, and &#39;. Preserve explicit empty values and string conversion. Keep existing public module behavior, including renderPreview and badge exports, and propagate original conversion errors.',
    files: {
      'badge.cjs': `const entities = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
const escape = value => String(value).replace(/[&<>"']/g, character => entities[character]);
exports.badge = (label, tone = 'neutral') => '<span class="badge badge-' + escape(tone) + '">' + escape(label) + '</span>';
`,
      'panel.cjs': `const {badge} = require('./badge.cjs');
exports.renderPreview = label => badge(label, 'preview');
`,
    },
    check: String.raw`const panel = require('./panel.cjs');
const {badge} = require('./badge.cjs');
for (const render of [panel.renderStatus, badge]) {
  assert.equal(render('Ready'), '<span class="badge badge-neutral">Ready</span>');
  assert.equal(render('', ''), '<span class="badge badge-"></span>');
  assert.equal(render(0, false), '<span class="badge badge-false">0</span>');
  assert.equal(render(null), '<span class="badge badge-neutral">null</span>');
  assert.equal(render('&<>"\'', '&<>"\''), '<span class="badge badge-&amp;&lt;&gt;&quot;&#39;">&amp;&lt;&gt;&quot;&#39;</span>');
  const original = new Error('conversion failed');
  const invalid = {toString() {throw original;}};
  assert.throws(() => render(invalid), error => error === original);
  assert.throws(() => render('ok', invalid), error => error === original);
}
assert.equal(panel.renderPreview('<draft>'), '<span class="badge badge-preview">&lt;draft&gt;</span>');`,
    design: 'Record reuse of the existing badge component and escaping helper versus duplicated rendering/escaping code. Preserve the existing preview caller and public badge API; equivalent behavior is accepted regardless of implementation.',
  },
  core.find(task => task.id === 'shared-cause'),
  core.find(task => task.id === 'trust-boundary'),
  {
    id: 'optional-config',
    prompt: 'Fix loadConfig(path, read, defaults) in config.cjs. Call read(path, "utf8") once and return its JSON.parse result without changing valid JSON values. read may return or resolve any JSON.parse-compatible value, or throw/reject. Return the supplied defaults only when read fails with code ENOENT. Propagate every other original read failure, including falsy values, and all parse/conversion failures even if they have code ENOENT. Do not retry or add validation.',
    files: {
      'config.cjs': `exports.loadConfig = async (path, read, defaults) => {
  try { return JSON.parse(await read(path, 'utf8')); }
  catch { return defaults; }
};
`,
    },
    check: `const {loadConfig} = require('./config.cjs');
process.exitCode = 1;
(async () => {
  const defaults = {enabled: true};
  for (const [raw, expected] of [['{"enabled":false,"limit":0,"label":""}', {enabled: false, limit: 0, label: ''}], ['null', null], ['false', false], ['0', 0], ['""', ''], ['[]', []], [null, null], [false, false], [0, 0], [{toString() {return '{"coerced":true}';}}, {coerced: true}]]) {
    for (const asynchronous of [false, true]) {
      const calls = [];
      assert.deepEqual(await loadConfig('settings.json', (...args) => {calls.push(args); return asynchronous ? Promise.resolve(raw) : raw;}, defaults), expected);
      assert.deepEqual(calls, [['settings.json', 'utf8']]);
    }
  }
  for (const asynchronous of [false, true]) {
    const missing = Object.assign(new Error('missing'), {code: 'ENOENT'});
    for (const original of [missing, Object.assign(new Error('denied'), {code: 'EACCES'}), new Error('broken'), false, 0, '', null, undefined]) {
      let calls = 0;
      const read = (path, encoding) => {
        calls++;
        assert.equal(path, 'settings.json'); assert.equal(encoding, 'utf8');
        if (asynchronous) return Promise.reject(original);
        throw original;
      };
      if (original === missing) assert.equal(await loadConfig('settings.json', read, defaults), defaults);
      else await assert.rejects(loadConfig('settings.json', read, defaults), error => Object.is(error, original));
      assert.equal(calls, 1);
    }
  }
  await assert.rejects(loadConfig('settings.json', () => '{', defaults), SyntaxError);
  const original = Object.assign(new Error('conversion failed'), {code: 'ENOENT'});
  await assert.rejects(loadConfig('settings.json', () => ({toString() {throw original;}}), defaults), error => error === original);
  assert.deepEqual(defaults, {enabled: true});
  process.exitCode = 0;
})().catch(error => { console.error(error); });`,
    design: 'Record recovery limited to the read boundary versus a broad catch/fallback, retries, or speculative validation. ENOENT recovery is required; deleting it is not simplification. Runtime behavior accepts equivalent implementations and preserves original failures.',
  },
  {
    id: 'collection-count',
    prompt: 'Fix createCollection(initialIds = []) in collection.cjs. IDs are strings. add(id), remove(id), and reset(ids = []) maintain distinct IDs in insertion order; duplicate additions and missing removals have no effect. count is the current number of IDs. initialCount is an intentional snapshot of the distinct initial IDs and never changes. snapshot() returns a fresh array; changing input or returned arrays must not affect membership. Instances are independent. Preserve this API; mutation methods have no specified return value.',
    files: {
      'collection.cjs': `exports.createCollection = (initialIds = []) => {
  let ids = new Set(initialIds);
  let count = ids.size;
  const initialCount = ids.size;
  return {
    get count() { return count; },
    initialCount,
    add(id) { ids.add(id); count++; },
    remove(id) { ids.delete(id); count--; },
    reset(next = []) { ids = new Set(next); },
    snapshot() { return [...ids]; },
  };
};
`,
    },
    check: `const {createCollection} = require('./collection.cjs');
const initial = ['a', '', 'a'];
const collection = createCollection(initial);
const other = createCollection();
initial.push('outside');
assert.equal(collection.count, 2); assert.equal(collection.initialCount, 2);
assert.deepEqual(collection.snapshot(), ['a', '']);
collection.add('a'); assert.equal(collection.count, 2);
collection.add('b'); assert.equal(collection.count, 3);
collection.remove('missing'); assert.equal(collection.count, 3);
const previous = collection.snapshot();
collection.remove('a'); assert.equal(collection.count, 2);
collection.remove('a'); assert.equal(collection.count, 2);
collection.add('a'); assert.equal(collection.count, 3);
assert.deepEqual(collection.snapshot(), ['', 'b', 'a']);
assert.deepEqual(previous, ['a', '', 'b']);
previous.push('outside'); assert.deepEqual(collection.snapshot(), ['', 'b', 'a']);
const replacement = ['z', 'z'];
collection.reset(replacement); replacement.push('outside');
assert.equal(collection.count, 1); assert.deepEqual(collection.snapshot(), ['z']);
assert.equal(collection.initialCount, 2);
assert.equal(other.count, 0); assert.equal(other.initialCount, 0); assert.deepEqual(other.snapshot(), []);
other.add('independent'); assert.equal(other.count, 1); assert.equal(other.initialCount, 0);
assert.deepEqual(collection.snapshot(), ['z']);
collection.reset(); assert.equal(collection.count, 0); assert.equal(collection.initialCount, 2);
collection.remove('missing'); assert.equal(collection.count, 0);
collection.add(''); assert.equal(collection.count, 1); assert.deepEqual(collection.snapshot(), ['']);
collection.remove(''); assert.equal(collection.count, 0); assert.deepEqual(collection.snapshot(), []);
assert.notEqual(collection.snapshot(), collection.snapshot());`,
    design: 'Record deriving current count from authoritative membership versus maintaining a synchronized count. Both may pass runtime checks; report design separately. Preserve initialCount as intentional historical state and fresh snapshot arrays as ownership boundaries, rather than replacing every stored value with a live derivation.',
  },
  {
    id: 'already-minimal',
    prompt: 'Review tags.cjs for simplification and change it only if justified. tags(labels) takes an array of strings and returns a fresh array containing distinct labels in first-seen order, including empty strings. Inputs must not be mutated. Preserve its public API and case-sensitive equality. Do not add new features.',
    files: {
      'tags.cjs': `exports.tags = labels => [...new Set(labels)];
`,
    },
    check: `const {tags} = require('./tags.cjs');
const labels = Object.freeze(['z', '', 'A', 'z', 'a', '', 'A']);
assert.deepEqual(tags(labels), ['z', '', 'A', 'a']);
const empty = Object.freeze([]);
assert.deepEqual(tags(empty), []); assert.notEqual(tags(empty), empty);
const unique = Object.freeze(['one']);
const result = tags(unique); assert.deepEqual(result, ['one']); assert.notEqual(result, unique);
result.push('two'); assert.deepEqual(unique, ['one']);
const mutableLabels = ['z', '', 'A', 'z', 'a', '', 'A'];
const first = tags(mutableLabels);
const second = tags(mutableLabels);
assert.deepEqual(first, ['z', '', 'A', 'a']);
assert.deepEqual(second, ['z', '', 'A', 'a']);
assert.notEqual(first, second);
first.push('new');
assert.deepEqual(second, ['z', '', 'A', 'a']);
assert.deepEqual(tags(mutableLabels), ['z', '', 'A', 'a']);
assert.deepEqual(mutableLabels, ['z', '', 'A', 'z', 'a', '', 'A']);`,
    design: 'Leaving production source unchanged is a valid result. Record unchanged, justified simplification, or unnecessary churn separately from behavior; never require an edit or award size gains for deleting behavior.',
  },
];
