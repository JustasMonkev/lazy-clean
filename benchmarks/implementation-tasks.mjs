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
assert.equal(encodeQuery([['city', 'Vilnius ☕'], ['*.-_', '*.-_']]), 'city=Vilnius+%E2%98%95&*.-_=*.-_');
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
result.push('two'); assert.deepEqual(unique, ['one']);`,
    design: 'Leaving production source unchanged is a valid result. Record unchanged, justified simplification, or unnecessary churn separately from behavior; never require an edit or award size gains for deleting behavior.',
  },
];
