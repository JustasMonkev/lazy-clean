export const tasks = [
  {
    id: 'settings-report',
    prompt: 'Fix this settings-report tool. Running node cli.cjs <path> prints one JSON object and a newline: {"enabled":<value>,"limit":<value>}. Settings files contain JSON objects; omitted enabled and limit use true and 10 respectively, while explicit false and zero survive. A missing file uses those defaults. Malformed JSON and all other read failures must fail: the CLI exits nonzero, writes the error message to stderr and no report to stdout. Preserve loadSettings(path, read) as an async API, with read defaulting to fs/promises.readFile, called once with path and "utf8". The API propagates the original non-missing read error and parse error. Keep both files usable without dependencies.',
    files: {
      'settings.cjs': `exports.loadSettings = async (path, read = require('node:fs/promises').readFile) => {
  try {
    const settings = JSON.parse(await read(path, 'utf8'));
    return {enabled: settings.enabled || true, limit: settings.limit || 10};
  } catch { return {enabled: true, limit: 10}; }
};
`,
      'cli.cjs': `const {loadSettings} = require('./settings.cjs');
loadSettings(process.argv[2]).then(settings => console.log(JSON.stringify(settings))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
`,
    },
    check: `const {spawnSync} = require('node:child_process');
const {loadSettings} = require('./settings.cjs');
const run = path => spawnSync(process.execPath, ['cli.cjs', path], {encoding: 'utf8', timeout: 2000});
fs.writeFileSync('provided.json', '{"enabled":false,"limit":0}');
fs.writeFileSync('extra.json', '{"enabled":false,"limit":0,"extra":"ignored"}');
fs.writeFileSync('partial.json', '{"limit":3}');
fs.writeFileSync('malformed.json', '{');
for (const [path, expected] of [['extra.json', {enabled:false,limit:0}], ['provided.json', {enabled:false,limit:0}], ['partial.json', {enabled:true,limit:3}], ['absent.json', {enabled:true,limit:10}]]) {
  const result = run(path); assert.equal(result.error, undefined); assert.equal(result.status, 0); assert.equal(result.stderr, ''); assert.equal(result.stdout, JSON.stringify(expected)+'\\n');
}
for (const path of ['malformed.json', '.']) {
  const result = run(path); assert.equal(result.error, undefined); assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.ok(result.stderr.trim());
}
process.exitCode = 1;
(async () => {
  for (const asynchronous of [false,true]) {
    const calls = [];
    assert.deepEqual(await loadSettings('x', (...args) => {calls.push(args); return asynchronous ? Promise.resolve('{}') : '{}';}), {enabled:true,limit:10});
    assert.deepEqual(calls, [['x','utf8']]);
    const missing = Object.assign(new Error('missing'), {code:'ENOENT'});
    const denied = Object.assign(new Error('denied'), {code:'EACCES'});
    for (const original of [missing,denied,new Error('disk')]) {
      let count = 0;
      const read = () => {count++; if (asynchronous) return Promise.reject(original); throw original;};
      if (original === missing) assert.deepEqual(await loadSettings('x',read), {enabled:true,limit:10});
      else await assert.rejects(loadSettings('x',read), error => error === original);
      assert.equal(count,1);
    }
  }
  await assert.rejects(loadSettings('x', () => '{'), SyntaxError);
  process.exitCode = 0;
})().catch(error => console.error(error));`,
    design: 'Assess narrowly scoped missing-file recovery, reuse of platform I/O, and preservation of the CLI/API boundary separately from behavior. Equivalent defaults construction and error handling are accepted. No new configuration, dependency, or generalized loader is needed.',
  },
  {
    id: 'shopping-basket',
    prompt: 'Fix the basket API used by demo.cjs. createBasket(initial = []) accepts rows {sku, price, quantity}; SKUs are unique strings, prices are nonnegative integer cents, quantities are positive integers. set(sku, price, quantity) replaces that SKU or appends a new one; remove(sku) removes it if present; reset(rows = []) replaces all rows. count is current total quantity and total is current price times quantity summed in cents. receipt() returns {items, count, total} as a fixed snapshot; input rows and returned receipt rows must not share mutable objects with the basket. Instances are independent, order follows insertion, replacing an existing SKU keeps its place. Preserve mutation method signatures; their return values are unspecified. Running node demo.cjs must print the receipt for two tea at 250 cents plus one cake at 400 cents.',
    files: {
      'basket.cjs': `exports.createBasket = (initial = []) => {
  let items = initial.map(row => ({...row}));
  let count = items.reduce((sum,row) => sum + row.quantity,0);
  let total = items.reduce((sum,row) => sum + row.price * row.quantity,0);
  return {
    get count() {return count;},
    get total() {return total;},
    set(sku,price,quantity) {const index = items.findIndex(row => row.sku === sku); const row = {sku,price,quantity}; if (index < 0) items.push(row); else items[index] = row; count += quantity; total += price * quantity;},
    remove(sku) {items = items.filter(row => row.sku !== sku);},
    reset(rows = []) {items = rows.map(row => ({...row}));},
    receipt() {return {items: items.map(row => ({...row})),count,total};},
  };
};
`,
      'demo.cjs': `const {createBasket} = require('./basket.cjs');
const basket = createBasket();
basket.set('tea',250,2);
basket.set('cake',400,1);
console.log(JSON.stringify(basket.receipt()));
`,
    },
    check: `const {createBasket} = require('./basket.cjs');
const {spawnSync} = require('node:child_process');
const input = [{sku:'tea',price:250,quantity:2}]; const basket = createBasket(input); const other = createBasket();
input[0].quantity = 99; input.push({sku:'outside',price:1,quantity:1});
const verify = (items,count,total) => {assert.equal(basket.count,count); assert.equal(basket.total,total); assert.deepEqual(basket.receipt(),{items,count,total});};
verify([{sku:'tea',price:250,quantity:2}],2,500);
const saved = basket.receipt();
basket.set('tea',300,1); basket.set('free',0,3);
verify([{sku:'tea',price:300,quantity:1},{sku:'free',price:0,quantity:3}],4,300);
assert.deepEqual(saved,{items:[{sku:'tea',price:250,quantity:2}],count:2,total:500});
saved.items[0].price = 999; assert.equal(basket.total,300);
const exposed = basket.receipt(); exposed.items[0].quantity = 88; exposed.items.push({sku:'x',price:2,quantity:2});
verify([{sku:'tea',price:300,quantity:1},{sku:'free',price:0,quantity:3}],4,300);
basket.remove('missing'); basket.remove('tea'); basket.remove('tea'); verify([{sku:'free',price:0,quantity:3}],3,0);
basket.set('tea',10,2); verify([{sku:'free',price:0,quantity:3},{sku:'tea',price:10,quantity:2}],5,20);
const replacement = [{sku:'new',price:7,quantity:4}]; basket.reset(replacement); replacement[0].price = 100;
verify([{sku:'new',price:7,quantity:4}],4,28); basket.reset(); verify([],0,0);
assert.deepEqual(other.receipt(),{items:[],count:0,total:0}); other.set('own',1,1); verify([],0,0);
const result = spawnSync(process.execPath,['demo.cjs'],{encoding:'utf8',timeout:2000}); assert.equal(result.error,undefined); assert.equal(result.status,0); assert.equal(result.stderr,'');
assert.deepEqual(JSON.parse(result.stdout),{items:[{sku:'tea',price:250,quantity:2},{sku:'cake',price:400,quantity:1}],count:3,total:900});`,
    design: 'Assess derivation of inexpensive totals from authoritative rows versus correctly synchronized caches separately from runtime success. Receipt snapshots are intentional stored history and copies protect ownership. Either Map or array storage and either correct totals strategy are acceptable.',
  },
  {
    id: 'audited-drafts',
    prompt: 'Fix saveDraft in service.cjs while preserving the store adapter and public API. saveDraft(draft, {store, audit}) awaits store.write(draft) exactly once. On success it returns the exact store result and awaits audit({type:"saved", id:draft.id}); an audit failure propagates unchanged and must not generate a failed event. On write failure it awaits audit({type:"failed", id:draft.id}) exactly once then rejects with the original write error. A failed-event audit failure must also propagate unchanged; it takes precedence because this audit is required. Do not retry either operation. Both dependencies may return normally, throw synchronously, resolve, or reject. Keep createStore(writeFile) working: write(draft) calls writeFile(draft.id + ".json", JSON.stringify(draft), "utf8") and returns draft.id after the write completes.',
    files: {
      'service.cjs': `exports.saveDraft = async (draft, {store,audit}) => {
  try {
    const result = await store.write(draft);
    await audit({type:'saved',id:draft.id});
    return result;
  } catch (error) {
    await audit({type:'failed',id:draft.id});
    throw error;
  }
};
`,
      'store.cjs': `exports.createStore = writeFile => ({
  async write(draft) {
    await writeFile(draft.id + '.json',JSON.stringify(draft),'utf8');
    return draft.id;
  },
});
`,
    },
    check: `const {saveDraft} = require('./service.cjs'); const {createStore} = require('./store.cjs');
process.exitCode = 1;
(async () => {
  const draft = Object.freeze({id:'note',text:'hello'}); const result = {version:3};
  for (const asynchronous of [false,true]) {
    const events = [];
    const store = {write(value) {assert.equal(value,draft); events.push('write'); return asynchronous ? Promise.resolve(result) : result;}};
    assert.equal(await saveDraft(draft,{store,audit(event) {events.push(event); return asynchronous ? Promise.resolve() : undefined;}}),result);
    assert.deepEqual(events,['write',{type:'saved',id:'note'}]);
    const auditError = new Error('audit'); const seen = [];
    await assert.rejects(saveDraft(draft,{store,audit(event) {seen.push(event); if (asynchronous) return Promise.reject(auditError); throw auditError;}}), error => error === auditError);
    assert.deepEqual(seen,[{type:'saved',id:'note'}]);
    for (const original of [new Error('write'),false,undefined]) {
      const calls = []; const failing = {write(value) {assert.equal(value,draft); calls.push('write'); if (asynchronous) return Promise.reject(original); throw original;}};
      await assert.rejects(saveDraft(draft,{store:failing,audit(event) {calls.push(event);}}),error => Object.is(error,original));
      assert.deepEqual(calls,['write',{type:'failed',id:'note'}]);
      let audits = 0;
      await assert.rejects(saveDraft(draft,{store:failing,audit() {audits++; if (asynchronous) return Promise.reject(auditError); throw auditError;}}), error => error === auditError); assert.equal(audits,1);
    }
  }
  let release; const pending = new Promise(resolve => {release = resolve;}); const events = [];
  const saving = saveDraft(draft,{store:{write() {events.push('write'); return pending;}},audit(event) {events.push(event);}});
  assert.deepEqual(events,['write']); release(result); assert.equal(await saving,result); assert.deepEqual(events,['write',{type:'saved',id:'note'}]);
  let finish; const auditPending = new Promise(resolve => {finish = resolve;}); let settled = false;
  const audited = saveDraft(draft,{store:{write() {return result;}},audit() {return auditPending;}}).then(value => {settled=true; return value;});
  await new Promise(resolve => setImmediate(resolve)); assert.equal(settled,false); finish(); assert.equal(await audited,result);
  let finishFailed; const failedPending = new Promise(resolve => {finishFailed = resolve;}); let failedSettled = false;
  const writeError = new Error('deferred write'); const failedEvents = [];
  const failedAudit = saveDraft(draft,{store:{write() {throw writeError;}},audit(event) {failedEvents.push(event); return failedPending;}}).then(() => {failedSettled = true; return null;}, error => {failedSettled = true; return error;});
  await new Promise(resolve => setImmediate(resolve)); assert.equal(failedSettled,false); assert.deepEqual(failedEvents,[{type:'failed',id:'note'}]);
  finishFailed(); assert.equal(await failedAudit,writeError);
  const writes = []; const adapter = createStore((...args) => {writes.push(args);});
  assert.equal(await adapter.write(draft),'note'); assert.deepEqual(writes,[['note.json',JSON.stringify(draft),'utf8']]);
  const diskError = new Error('disk'); await assert.rejects(createStore(() => Promise.reject(diskError)).write(draft), error => error === diskError);
  process.exitCode = 0;
})().catch(error => console.error(error));`,
    design: 'Assess whether failure reporting covers precisely the operation whose failure it describes. Required audit awaits and propagation are behavior, not removable ceremony. Preserve the adapter boundary; equivalent control flow and error handling pass without a preferred syntax.',
  },
];
