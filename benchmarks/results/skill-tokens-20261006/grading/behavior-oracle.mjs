import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [variant, modulePath] = process.argv.slice(2);
const outcomes = [];
let subject;
try {
  if (!['train', 'heldout'].includes(variant) || !modulePath) throw new Error('Usage: node behavior-oracle.mjs train|heldout /absolute/stringUtils.ts');
  subject = await import(pathToFileURL(resolve(modulePath)).href);
} catch (error) {
  console.log(JSON.stringify({ status: 'tooling-failure', variant: variant ?? null, module: modulePath ?? null, error: String(error), checks: [] }));
  process.exit(2);
}
function check(name, assertion) {
  try { assertion(); outcomes.push({ name, status: 'pass' }); }
  catch (error) { outcomes.push({ name, status: 'fail', error: String(error), expected: error.expected, actual: error.actual }); }
}
const exportsExpected = ['ansiRegex', 'cacheNormalizedWhitespaces', 'escapeForAttributeSelector', 'escapeForTextSelector', 'escapeHTML', 'escapeHTMLAttribute', 'escapeRegExp', 'escapeTemplateString', 'escapeWithQuotes', 'formatObject', 'formatObjectOrVoid', 'isString', 'longestCommonSubstring', 'normalizeEscapedRegexQuotes', 'normalizeWhiteSpace', 'parseRegex', 'quoteCSSAttributeValue', 'stripAnsiEscapes', 'toSnakeCase', 'toTitleCase', 'tomlArray', 'tomlBasicString', 'tomlMultilineBasicString', 'trimString', 'trimStringWithEllipsis', 'truncateDataUrl'].sort();
check('public exports preserved', () => assert.deepEqual(Object.keys(subject).sort(), exportsExpected));
check('unrelated selector exactness', () => assert.equal(subject.escapeForTextSelector('hello', true), '"hello"s'));
check('unrelated selector inexactness', () => assert.equal(subject.escapeForAttributeSelector('hello', false), '"hello"i'));
check('unrelated whitespace normalization', () => assert.equal(subject.normalizeWhiteSpace('  a\u200bb\t c  '), 'ab c'));
check('unrelated HTML escaping', () => assert.equal(subject.escapeHTML('a<&>'), 'a&lt;&amp;>'));
check('unrelated snake case', () => assert.equal(subject.toSnakeCase('ignoreHTTPSErrors'), 'ignore_https_errors'));
check('unrelated regex valid syntax', () => { const re = subject.parseRegex('/a+/gi'); assert.equal(re.source, 'a+'); assert.equal(re.flags, 'gi'); });
check('unrelated regex error preserved', () => assert.throws(() => subject.parseRegex('bad'), /Invalid regex, must start with/));
check('unrelated string false/empty', () => { assert.equal(subject.isString(''), true); assert.equal(subject.isString(false), false); });
if (variant === 'train') {
  const cases = [
    ['ASCII no suffix', 'abcdef', 4, '', 'abcd'],
    ['ASCII fitting suffix', 'abcdef', 4, '..', 'ab..'],
    ['ASCII suffix exceeds cap', 'abcdef', 2, '...', '..'],
    ['zero cap empty suffix', 'abc', 0, '', ''],
    ['zero cap nonempty suffix', 'abc', 0, '…', ''],
    ['empty input unchanged', '', 0, 'long suffix', ''],
    ['fitting ASCII unchanged despite suffix', 'ab', 2, 'long suffix', 'ab'],
    ['fitting astral unchanged', '😀', 1, '...', '😀'],
    ['astral input without suffix', '😀ab', 2, '', '😀a'],
    ['astral input with suffix', '😀abc', 3, '…', '😀a…'],
    ['astral suffix counts one point', 'abcd', 3, '😀!', 'a😀!'],
    ['astral suffix exceeds cap', 'abcd', 2, '😀?!', '😀?'],
    ['suffix fills cap', 'abcd', 2, '😀!', '😀!'],
    ['unpaired input preserved as one point', '\uD800ab', 2, '', '\uD800a'],
    ['unpaired suffix preserved', 'abcd', 1, '\uD800Z', '\uD800'],
  ];
  for (const [name, input, cap, suffix, expected] of cases) check(name, () => assert.equal(subject.trimString(input, cap, suffix), expected));
  check('omitted suffix remains empty', () => assert.equal(subject.trimString('😀ab', 2), '😀a'));
  check('ellipsis wrapper zero cap', () => assert.equal(subject.trimStringWithEllipsis('abc', 0), ''));
  check('ellipsis wrapper astral input', () => assert.equal(subject.trimStringWithEllipsis('😀abc', 3), '😀a…'));
  check('ellipsis wrapper fitting input', () => assert.equal(subject.trimStringWithEllipsis('😀', 1), '😀'));
} else {
  const cases = [
    ['lowercase scheme', 'data:text/plain,hello', 'data:text/plain,…'],
    ['uppercase scheme', 'DATA:text/plain,hello', 'DATA:text/plain,…'],
    ['mixed scheme', 'DaTa:image/png;base64,abc', 'DaTa:image/png;base64,…'],
    ['media prefix exact casing', 'dAtA:TEXT/PLAIN;Charset=UTF-8,hello', 'dAtA:TEXT/PLAIN;Charset=UTF-8,…'],
    ['empty payload', 'DATA:text/plain,', 'DATA:text/plain,…'],
    ['empty media prefix', 'DaTa:,hello', 'DaTa:,…'],
    ['first comma only', 'DATA:text/plain,a,b,c', 'DATA:text/plain,…'],
    ['no comma lowercase', 'data:text/plain', 'data:text/plain'],
    ['no comma uppercase', 'DATA:text/plain', 'DATA:text/plain'],
    ['scheme only no comma', 'DaTa:', 'DaTa:'],
    ['empty string', '', ''],
    ['ordinary URL unchanged', 'https://example.invalid/DATA:text/plain,a', 'https://example.invalid/DATA:text/plain,a'],
    ['other scheme unchanged', 'database:text/plain,a', 'database:text/plain,a'],
    ['leading space not accepted', ' DATA:text/plain,a', ' DATA:text/plain,a'],
    ['embedded scheme not accepted', 'xDATA:text/plain,a', 'xDATA:text/plain,a'],
    ['Unicode prefix retained', 'DATA:text/😀;x=α,hello', 'DATA:text/😀;x=α,…'],
  ];
  for (const [name, input, expected] of cases) check(name, () => assert.equal(subject.truncateDataUrl(input), expected));
  check('unrelated trim remains ASCII-compatible', () => assert.equal(subject.trimString('abcdef', 4, '..'), 'ab..'));
  check('unrelated ellipsis remains ASCII-compatible', () => assert.equal(subject.trimStringWithEllipsis('abcdef', 4), 'abc…'));
}
const failed = outcomes.filter(check => check.status === 'fail').length;
console.log(JSON.stringify({ status: failed ? 'behavior-fail' : 'pass', variant, module: resolve(modulePath), passed: outcomes.length - failed, failed, checks: outcomes }));
process.exitCode = failed ? 1 : 0;
