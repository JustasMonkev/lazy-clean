'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const {validators} = require(process.env.CANDIDATE_MODULE);
const message = 'Url or Uri must start with <scheme>://';

function rejectsNormally(value) {
  assert.throws(() => validators.setUrl(value), (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'Error');
    assert.equal(error.message, message);
    return true;
  });
}

test('nonstring URL inputs use the ordinary validation error without coercion', () => {
  for (const value of [undefined, null, false, true, 0, 42, NaN, 1n, Symbol('url'), [], {},
    new String('https://example.test'), () => 'https://example.test',
    {match() { throw new Error('must not call an input-owned match method'); }},
    {toString() { throw new Error('must not coerce input'); }}]) {
    rejectsNormally(value);
  }
});

test('string acceptance remains exactly the existing scheme regex policy', () => {
  const values = [
    '', 'example.test', '/relative', '//example.test', 'http:/example.test',
    'http://', 'https://example.test', 'FTP://example.test', '1_+.-://host',
    'about:', 'about:blank', 'data:', 'data:text/plain,hello',
    'prefixabout:blank', 'prefixdata:text/plain,hello', ' xdata:payload',
    '\nabout:blank', 'ABOUT:blank', 'DATA:text/plain,hello',
    ' prefixhttps://example.test', 'https://example.test\n',
  ];
  const legacyPolicy = /^([a-zA-Z0-9_+.-]+:\/\/)|(about:)|(data:)/;
  for (const value of values) {
    if (legacyPolicy.test(value)) {
      assert.equal(validators.setUrl(value), undefined, JSON.stringify(value));
    } else {
      rejectsNormally(value);
    }
  }
});

test('network validation behavior is preserved', () => {
  for (const value of [0, 1, 2, 4, 6]) {
    assert.equal(validators.setNetworkConnection(value), undefined);
  }
  for (const value of [-1, 3, 5, 7, 1.5, NaN, Infinity, '1', false, null, undefined, {}]) {
    assert.throws(() => validators.setNetworkConnection(value), {
      name: 'Error', message: 'Network type must be one of 0, 1, 2, 4, 6',
    });
  }
});
