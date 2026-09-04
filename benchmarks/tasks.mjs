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
];
