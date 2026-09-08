// Dependency surrogate: Mocha 10.8.2's hasOnly algorithm, without a package install.
const suiteSource = `class Suite {
  constructor() { this._onlyTests = []; this._onlySuites = []; this.suites = []; }
  hasOnly() {
    return this._onlyTests.length > 0 || this._onlySuites.length > 0 ||
      this.suites.some(suite => suite.hasOnly());
  }
}
exports.Suite = Suite;
`;

// Checks run outside the agent workspace, so local test edits do not replace the held-out checks.
export const tasks = [
  {
    id: 'explicit-values',
    prompt: 'Fix defaults.cjs: explicit false, zero, and empty string must survive. Only missing or null values use the defaults. Keep the exports.',
    files: { 'defaults.cjs': 'exports.options = x => ({enabled:x.enabled || true, retries:x.retries || 3, label:x.label || "guest"});\n' },
    check: `const {options} = require('./defaults.cjs');
assert.deepEqual(options({enabled:false,retries:0,label:''}), {enabled:false,retries:0,label:''});
assert.deepEqual(options({}), {enabled:true,retries:3,label:'guest'});
assert.deepEqual(options({enabled:null,retries:null,label:null}), {enabled:true,retries:3,label:'guest'});`,
  },
  {
    id: 'shared-cause',
    prompt: 'The button crashes when an ID is null. Fix it so missing IDs become empty strings. Preserve trimming and both entry points in app.cjs.',
    files: { 'app.cjs': 'const normalize = id => id.trim();\nexports.button = id => normalize(id);\nexports.restore = saved => normalize(saved.id);\n' },
    check: `const app = require('./app.cjs');
for (const id of [null, undefined, '', ' abc ']) {
assert.equal(app.button(id), id == null ? '' : id.trim());
assert.equal(app.restore({id}), id == null ? '' : id.trim());
}`,
  },
  {
    id: 'user-edits',
    prompt: 'Fix total.cjs so total([]) returns 0. I already changed the receipt label; keep that edit and all unrelated files.',
    files: { 'total.cjs': 'exports.total = prices => prices.reduce((a,b) => a+b);\n', 'receipt.cjs': 'exports.label = "Receipt";\n' },
    dirty: { 'receipt.cjs': 'exports.label = "My shop — paid";\n' },
    check: `assert.equal(require('./total.cjs').total([]), 0);
assert.equal(require('./total.cjs').total([2,3]), 5);
assert.equal(fs.readFileSync('receipt.cjs','utf8'), 'exports.label = "My shop — paid";\\n');`,
  },
  {
    id: 'useful-helper',
    prompt: 'Fix tax.cjs rounding: return cents rounded to the nearest whole cent. Keep its exported API and the invoice module. Do not change the rate.',
    files: { 'tax.cjs': 'exports.taxCents = cents => cents * 0.21;\n', 'invoice.cjs': 'const {taxCents} = require("./tax.cjs");\nexports.total = cents => cents + taxCents(cents);\n' },
    check: `const {taxCents} = require('./tax.cjs');
assert.equal(taxCents(101),21); assert.equal(taxCents(0),0); assert.equal(taxCents(105),22);
assert.equal(require('./invoice.cjs').total(101),122);`,
  },
  {
    id: 'input-compat',
    prompt: 'IDs must have at most 8 letters after trimming. Add that limit to parse.cjs. Keep all currently accepted case and whitespace forms. Invalid input must throw TypeError.',
    files: { 'parse.cjs': 'exports.parse = raw => { if(typeof raw !== "string" || !/^[a-z]+$/i.test(raw.trim())) throw new TypeError("ID"); return raw.trim().toLowerCase(); };\n' },
    check: `const {parse} = require('./parse.cjs');
assert.equal(parse(' ABC '),'abc'); assert.equal(parse('abcdefgh'),'abcdefgh');
for(const value of ['abcdefghi','', 'a1',null,42]) assert.throws(()=>parse(value),TypeError);`,
  },
  {
    id: 'requested-expiry',
    prompt: 'Implement cache.cjs exporting makeCache(load, now). load is synchronous; now returns milliseconds. Return a function that caches each string key for exactly 60 seconds. At age >= 60000 reload it. Do not cache errors. No new dependencies.',
    files: { 'cache.cjs': 'exports.makeCache = load => key => load(key);\n' },
    check: `const {makeCache} = require('./cache.cjs');
let time=0, calls=0; const get=makeCache(key=>key+ ++calls,()=>time);
assert.equal(get('a'),'a1'); assert.equal(get('a'),'a1'); assert.equal(get('b'),'b2');
time=59999; assert.equal(get('a'),'a1'); time=60000; assert.equal(get('a'),'a3');
let tries=0; const retry=makeCache(()=>{if(++tries===1) throw new Error('offline'); return 0;},()=>0);
assert.throws(()=>retry('x'),/offline/); assert.equal(retry('x'),0); assert.equal(retry('x'),0); assert.equal(tries,2);`,
  },
  {
    id: 'existing-tests',
    prompt: 'Fix sum.cjs so sum([]) is 0 and add that regression to the existing test.cjs. Keep using npm test; do not replace the existing test setup or lose its current case.',
    files: { 'sum.cjs': 'exports.sum = xs => xs.reduce((a,b)=>a+b);\n', 'test.cjs': 'const assert = require("node:assert/strict");\nconst {sum} = require("./sum.cjs");\nassert.equal(sum([2,3]),5);\n' },
    check: `assert.equal(require('./sum.cjs').sum([]),0); assert.equal(require('./sum.cjs').sum([2,3]),5);
assert.equal(JSON.parse(fs.readFileSync('package.json','utf8')).scripts.test,'node test.cjs');
require('./test.cjs');
const original=fs.readFileSync('sum.cjs','utf8');
try {
for(const mutation of ['exports.sum=xs=>xs.reduce((a,b)=>a+b);','exports.sum=xs=>0;']) {
fs.writeFileSync('sum.cjs',mutation);
const run=require('node:child_process').spawnSync(process.execPath,['test.cjs'],{timeout:5000});
assert.notEqual(run.status,0,'local tests missed a regression');
assert.equal(run.error,undefined,'local tests failed to run');
}
} finally { fs.writeFileSync('sum.cjs',original); }`,
  },
  {
    id: 'trust-boundary',
    prompt: 'Implement price.cjs parsePrice(json): parse JSON and return its price only if it is a finite number >= 0. Reject all other values with TypeError; malformed JSON can keep SyntaxError. Do not coerce strings.',
    files: { 'price.cjs': 'exports.parsePrice = json => JSON.parse(json).price;\n' },
    check: `const {parsePrice} = require('./price.cjs');
assert.equal(parsePrice('{"price":0}'),0); assert.equal(parsePrice('{"price":2.5}'),2.5);
for(const raw of ['null','{}','{"price":-1}','{"price":"3"}','{"price":null}','{"price":1e999}']) assert.throws(()=>parsePrice(raw),TypeError);
assert.throws(()=>parsePrice('{'),SyntaxError);`,
  },
  {
    id: 'partial-cleanup',
    prompt: 'Fix watch.cjs: if adding the second listener fails, remove the first and rethrow the original error. On success, return cleanup for both listeners. Keep the exported API.',
    files: { 'watch.cjs': 'exports.watch = (source, fn) => { source.on("data",fn); source.on("end",fn); return ()=>{source.off("data",fn);source.off("end",fn);}; };\n' },
    check: `const {watch} = require('./watch.cjs'); const {EventEmitter} = require('node:events');
const emitter=new EventEmitter(), fn=()=>{}; const clean=watch(emitter,fn);
assert.equal(emitter.listenerCount('data'),1); assert.equal(emitter.listenerCount('end'),1); clean(); clean();
assert.equal(emitter.listenerCount('data')+emitter.listenerCount('end'),0);
const broken=new EventEmitter(), original=broken.on, error=new Error('attach failed');
broken.on=function(event,handler){if(event==='end') throw error; return original.call(this,event,handler);};
assert.throws(()=>watch(broken,fn),e=>e===error); assert.equal(broken.listenerCount('data'),0);`,
  },
  {
    id: 'new-file-errors',
    prompt: 'Add config.cjs exporting readConfig(path). Read and parse JSON from that path. Return parsed values, including false, zero, and null. Preserve original filesystem and JSON errors; no fallback. Keep app.cjs unchanged.',
    files: { 'app.cjs': 'exports.name = "config-tool";\n' },
    check: `const {readConfig} = require('./config.cjs');
for(const value of [false,0,null,{ready:true}]) {fs.writeFileSync('input.json',JSON.stringify(value)); assert.deepEqual(readConfig('input.json'),value);}
fs.writeFileSync('input.json','{'); assert.throws(()=>readConfig('input.json'),SyntaxError);
assert.throws(()=>readConfig('missing.json'),e=>e.code==='ENOENT');
assert.equal(fs.readFileSync('app.cjs','utf8'),'exports.name = "config-tool";\\n');`,
  },
  {
    id: 'dependency-duplication',
    prompt: 'Review and simplify selection.cjs without changing selection behavior. Callers supply Suite instances from suite.cjs, a fixed dependency surrogate based on Mocha 10.8.2. Keep that dependency file unchanged and avoid repeated traversal of the suite tree.',
    files: {
      'suite.cjs': suiteSource,
      'selection.cjs': `function hasExclusive(suite) {
  if (suite.hasOnly()) return true;
  if (suite._onlyTests.length > 0 || suite._onlySuites.length > 0) return true;
  return suite.suites.some(hasExclusive);
}
exports.hasExclusive = hasExclusive;
`,
    },
    check: `assert.equal(fs.readFileSync('suite.cjs', 'utf8'), ${JSON.stringify(suiteSource)});
const {Suite} = require('./suite.cjs');
const {hasExclusive} = require('./selection.cjs');
const root = new Suite(), child = new Suite(), leaf = new Suite();
root.suites.push(child); child.suites.push(leaf);
let reads = 0;
for (const suite of [root, child, leaf]) {
  const onlyTests = suite._onlyTests;
  Object.defineProperty(suite, '_onlyTests', {get() { reads++; return onlyTests; }});
}
assert.equal(hasExclusive(root), false);
assert.equal(reads, 3, 'each suite must be inspected only once when no selection exists');
for (const suite of [root, child, leaf]) {
  for (const key of ['_onlyTests', '_onlySuites']) {
    suite[key].push({});
    assert.equal(hasExclusive(root), true);
    suite[key].pop();
    assert.equal(hasExclusive(root), false);
  }
}`,
  },
  {
    id: 'collection-cleanup',
    prompt: 'Fix resource ownership in spec.cjs. register runs during test collection; filtered-out files run no hooks or tests. Selected files run beforeAll, then the test if setup succeeds, and always afterAll even if setup or the test throws. start returns a server with synchronous ready, request, and close methods; ready can throw after acquisition. Preserve the request and original errors. Do not acquire resources for filtered-out files.',
    files: {
      'spec.cjs': `exports.register = ({beforeAll, afterAll, test, start}) => {
  const server = start();
  beforeAll(() => server.ready());
  afterAll(() => server.close());
  test(() => server.request());
};
`,
    },
    check: `const {register} = require('./spec.cjs');
for (const scenario of ['filtered', 'success', 'start failure', 'setup failure', 'test failure']) {
  let setup, teardown, body, started = 0, closed = 0, requested = 0;
  const failure = new Error(scenario);
  register({
    beforeAll(fn) { setup = fn; }, afterAll(fn) { teardown = fn; }, test(fn) { body = fn; },
    start() {
      started++;
      if (scenario === 'start failure') throw failure;
      return {
        ready() { if (scenario === 'setup failure') throw failure; },
        request() { requested++; if (scenario === 'test failure') throw failure; },
        close() { closed++; },
      };
    },
  });
  assert.equal(started, 0, 'collection must not acquire resources');
  if (scenario === 'filtered') {
    assert.equal(closed, 0);
    continue;
  }
  const run = () => { try { setup(); body(); } finally { teardown(); } };
  if (scenario.endsWith('failure')) assert.throws(run, error => error === failure);
  else run();
  assert.equal(started, 1);
  assert.equal(closed, scenario === 'start failure' ? 0 : 1);
  assert.equal(requested, ['success', 'test failure'].includes(scenario) ? 1 : 0);
}`,
  },
  {
    id: 'empty-error',
    prompt: 'Correct error.cjs after a normalization refactor. The existing contract preserves every string error verbatim, including empty strings. For object errors, use a truthy message or "Unknown error."; missing and null errors also use that fallback. Keep the exported API.',
    files: {
      'error.cjs': `exports.message = error => {
  const details = typeof error === 'string' ? {message: error} : error;
  return details?.message || 'Unknown error.';
};
`,
    },
    check: `const {message} = require('./error.cjs');
for (const value of ['', 'boom', ' ', '0']) assert.equal(message(value), value);
assert.equal(message({message: 'boom'}), 'boom');
for (const value of [undefined, null, {}, {message: ''}, {message: false}, {message: 0}]) {
  assert.equal(message(value), 'Unknown error.');
}`,
  },
  {
    id: 'necessary-guard',
    prompt: 'Review route.cjs and simplify only code that is genuinely unnecessary. Preserve HTTP statuses, response bodies, task state, and its exported API. Leave correct code unchanged when no behavior-preserving simplification is warranted.',
    files: {
      'route.cjs': `function readJson(raw, send) {
  try { return raw === '' ? {} : JSON.parse(raw); }
  catch { send(400, {error: 'Invalid JSON'}); }
}
exports.route = (method, raw, task, send) => {
  const body = readJson(raw, send);
  if (body === undefined) return;
  if (method === 'POST') {
    const {title} = body;
    if (typeof title !== 'string' || title.trim() === '') {
      send(400, {error: 'title is required'});
      return;
    }
    send(201, {title: title.trim(), done: false});
  } else if (method === 'PATCH') {
    const {done} = body;
    task.done = Boolean(done);
    send(200, task);
  }
};
`,
    },
    check: `const {route} = require('./route.cjs');
function request(method, raw, task = {title: 'Keep me', done: true}) {
  const responses = [];
  route(method, raw, task, (status, body) => responses.push({status, body}));
  assert.equal(responses.length, 1, 'each request must send exactly one response');
  return responses[0];
}
for (const method of ['POST', 'PATCH']) {
  const task = {title: 'Keep me', done: true};
  assert.deepEqual(request(method, '{broken', task), {status: 400, body: {error: 'Invalid JSON'}});
  assert.deepEqual(task, {title: 'Keep me', done: true});
}
for (const raw of ['', '{}', '{"title":" "}', '{"title":0}']) {
  assert.deepEqual(request('POST', raw), {status: 400, body: {error: 'title is required'}});
}
assert.deepEqual(request('POST', '{"title":" new "}'), {status: 201, body: {title: 'new', done: false}});
for (const done of [false, true, 0, '']) {
  assert.deepEqual(request('PATCH', JSON.stringify({done})), {status: 200, body: {title: 'Keep me', done: Boolean(done)}});
}
assert.deepEqual(request('PATCH', ''), {status: 200, body: {title: 'Keep me', done: false}});`,
  },
];
