import { tasks as core } from './tasks.mjs';

export const tasks = [
  core.find(task => task.id === 'dependency-duplication'),
  {
    id: 'formatter-extension',
    prompt: 'Add CSV invoices to invoice.cjs. render(items, format = "text", extra = {}) must keep text output and support "csv" as "totalCents\\n<N>". Items have integer priceCents and quantity. Callers may supply extra formatter functions keyed by format name; a formatter receives {totalCents} and returns its output. An extra formatter overrides a built-in. Unknown formats throw TypeError. Keep the exported render API and avoid mutating inputs.',
    files: {
      'invoice.cjs': `exports.render = (items, format = 'text') => {
  if (format !== 'text') throw new TypeError('Unknown format');
  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  return 'Total: ' + totalCents;
};
`,
    },
    check: `const {render} = require('./invoice.cjs');
const items = Object.freeze([Object.freeze({priceCents: 105, quantity: 2}), Object.freeze({priceCents: 0, quantity: 3})]);
assert.equal(render(items), 'Total: 210'); assert.equal(render([], 'csv'), 'totalCents\\n0');
assert.equal(render(items, 'csv'), 'totalCents\\n210');
assert.equal(render(items, 'custom', {custom: invoice => invoice.totalCents}), 210);
assert.equal(render(items, 'text', {text: () => ''}), '');
for (const format of ['missing', 'toString', 'constructor', '__proto__']) assert.throws(() => render(items, format), TypeError);
const original = new Error('formatter failed');
assert.throws(() => render(items, 'custom', {custom() {throw original;}}), error => error === original);`,
    design: 'Calculation occurs once independently of output format; a new caller formatter needs no edit to the calculation/dispatch policy. No framework or class hierarchy for this small registry.',
  },
  {
    id: 'store-substitution',
    prompt: 'Fix CachedStore in store.cjs so callers can substitute it for the backing synchronous store. find(key) accepts every string, including an empty key. Values may be false, zero, empty string, or null. Only undefined means absent and must be retried on the next call. Cache present results, preserve object identity, and propagate original backing errors without caching failures. Keep the constructor and find method.',
    files: {
      'store.cjs': `class CachedStore {
  constructor(store) { this.store = store; this.cache = new Map(); }
  find(key) {
    if (!key) throw new TypeError('key required');
    const value = this.cache.get(key) || this.store.find(key);
    this.cache.set(key, value);
    return value;
  }
}
exports.CachedStore = CachedStore;
`,
    },
    check: `const {CachedStore} = require('./store.cjs');
for (const value of [false, 0, '', null, {id: 1}]) {
  let calls = 0; const source = {find(key) {assert.equal(key, ''); calls++; return value;}};
  const cached = new CachedStore(source);
  assert.equal(cached.find(''), value); assert.equal(cached.find(''), value); assert.equal(calls, 1);
}
let calls = 0; const retry = new CachedStore({find() {calls++; return calls === 1 ? undefined : 0;}});
assert.equal(retry.find('later'), undefined); assert.equal(retry.find('later'), 0); assert.equal(retry.find('later'), 0); assert.equal(calls, 2);
const original = new Error('offline'); let tries = 0;
const recovering = new CachedStore({find() {if (++tries === 1) throw original; return false;}});
assert.throws(() => recovering.find('a'), error => error === original); assert.equal(recovering.find('a'), false);
assert.equal(recovering.find('b'), false); assert.equal(tries, 3);`,
    design: 'One find contract covers the cache and backing store, without caller type checks or special-case access to cache internals. Local tests cover falsy results and recovery.',
  },
  {
    id: 'single-backend',
    prompt: 'Simplify this checkout feature and add createCheckout(charge) in checkout.cjs. It returns checkout(items), using the supplied synchronous charge(totalCents) capability. Keep the existing checkout(items) production export, order of items, total calculation, return value and original errors. There is one production backend. Isolated callers of createCheckout must be able to load and use checkout.cjs while the production gateway is unavailable. gateway.cjs is a fixed dependency; do not edit it.',
    files: {
      'gateway.cjs': `exports.charge = totalCents => ({receipt: 'paid', totalCents});
`,
      'checkout.cjs': `const gateway = require('./gateway.cjs');
exports.checkout = items => {
  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  return gateway.charge(totalCents);
};
`,
    },
    check: `const {checkout, createCheckout} = require('./checkout.cjs');
const items = Object.freeze([Object.freeze({priceCents: 101, quantity: 2})]);
assert.deepEqual(checkout(items), {receipt: 'paid', totalCents: 202});
assert.deepEqual(checkout([]), {receipt: 'paid', totalCents: 0});
let amount; const expected = {receipt: 'fake'};
assert.equal(createCheckout(total => {amount = total; return expected;})(items), expected); assert.equal(amount, 202);
const original = new Error('declined');
assert.throws(() => createCheckout(() => {throw original;})(items), error => error === original);
assert.equal(fs.readFileSync('gateway.cjs', 'utf8'), "exports.charge = totalCents => ({receipt: 'paid', totalCents});\\n");
fs.renameSync('gateway.cjs', 'gateway.unavailable');
try {
  const isolated = require('node:child_process').spawnSync(process.execPath, ['-e', "const {createCheckout}=require('./checkout.cjs');require('node:assert/strict').equal(createCheckout(n=>n)([]),0);"], {encoding: 'utf8', timeout: 5000});
  assert.equal(isolated.error, undefined); assert.equal(isolated.status, 0, isolated.stderr);
} finally {fs.renameSync('gateway.unavailable', 'gateway.cjs');}`,
    design: 'The supplied dependency is the narrow charge function. Default assembly reuses the same calculation/policy; isolated use does not import the concrete gateway. No second production adapter is required.',
  },
  {
    id: 'readonly-consumer',
    prompt: 'names.cjs must support a read-only directory client exposing only list(). list returns an array of {name} objects. Preserve the names array in order, duplicate and empty names, input immutability, and original list errors. Existing full clients must still work. Reject a missing/non-function list with TypeError. Simplify only within this request; do not add write/delete placeholders to callers.',
    files: {
      'names.cjs': `exports.names = directory => {
  for (const operation of ['list', 'save', 'delete']) {
    if (typeof directory?.[operation] !== 'function') throw new TypeError('Invalid directory');
  }
  return directory.list().map(user => user.name);
};
`,
    },
    check: `const {names} = require('./names.cjs');
const users = Object.freeze([Object.freeze({name: ''}), Object.freeze({name: 'A'}), Object.freeze({name: 'A'})]);
const reader = {list() {assert.equal(this, reader); return users;}};
assert.deepEqual(names(reader), ['', 'A', 'A']); assert.deepEqual(names({list() {return [];}, save() {}, delete() {}}), []);
const original = new Error('offline'); assert.throws(() => names({list() {throw original;}}), error => error === original);
for (const value of [null, undefined, {}, {list: 1}]) assert.throws(() => names(value), TypeError);`,
    design: 'The reader requires only list and retains its receiver. No unused capabilities or speculative interface hierarchy; local tests exercise a genuine read-only object.',
  },
  core.find(task => task.id === 'necessary-guard'),
];
