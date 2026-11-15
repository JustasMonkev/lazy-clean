export const tasks = [
  {
    id: 'catalogue-expiry',
    prompt: 'Fix createCatalogue(load, now, ttl) in catalogue.cjs for the existing price caller. get(id) returns the loader result and caches each successful result by string ID until ttl milliseconds after that load completes. A cached entry is usable only while now() is strictly less than its expiry. Preserve all results including null, false, zero and empty strings. Propagate original load errors and do not cache failures; an expired failed refresh must not return stale data. Instances and IDs are independent. load and now are supplied functions; load returns a promise, now returns milliseconds, and ttl is positive. Concurrent requests, invalid arguments, eviction, retries and cancellation are outside scope. Preserve adapter.cjs and price.cjs public behavior.',
    files: {
      'catalogue.cjs': `exports.createCatalogue = (load, now, ttl) => ({get: id => load(id)});\n`,
      'adapter.cjs': `exports.createLoader = fetchItem => id => fetchItem('/items/' + encodeURIComponent(id));\n`,
      'price.cjs': `exports.quote = async (catalogue, id) => ({id, value: await catalogue.get(id)});\n`,
    },
    check: `const {createCatalogue} = require('./catalogue.cjs');
const {createLoader} = require('./adapter.cjs');
const {quote} = require('./price.cjs');
process.exitCode = 1;
(async () => {
  let time = 0;
  const calls = [];
  let value = 0;
  let failure;
  const catalogue = createCatalogue(createLoader(async path => {calls.push(path); time += 2; if (failure) throw failure; return value;}), () => time, 10);
  assert.deepEqual(await quote(catalogue, 'a/b'), {id: 'a/b', value: 0});
  time = 11; value = 7;
  assert.equal(await catalogue.get('a/b'), 0);
  assert.equal(calls.length, 1);
  time = 12;
  assert.equal(await catalogue.get('a/b'), 7);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls, ['/items/a%2Fb', '/items/a%2Fb']);
  time = 24; failure = new Error('offline');
  await assert.rejects(catalogue.get('a/b'), error => error === failure);
  await assert.rejects(catalogue.get('a/b'), error => error === failure);
  assert.equal(calls.length, 4);
  failure = undefined; value = '';
  assert.equal(await catalogue.get('a/b'), '');
  assert.equal(await catalogue.get('a/b'), '');
  assert.equal(calls.length, 5);
  for (const [id, result] of [['', false], ['null', null], ['other', 0]]) {
    value = result;
    assert.equal(await catalogue.get(id), result);
    value = 'changed';
    assert.equal(await catalogue.get(id), result);
  }
  const retainedCalls = []; let retainedValue = 'original A';
  const retained = createCatalogue(async id => {retainedCalls.push(id); return retainedValue;}, () => 0, 10);
  assert.equal(await retained.get('A'),'original A'); retainedValue = 'B';
  assert.equal(await retained.get('B'),'B'); retainedValue = 'replacement A';
  assert.equal(await retained.get('A'),'original A'); assert.deepEqual(retainedCalls,['A','B']);
  const separate = createCatalogue(async () => 'separate', () => time, 10);
  assert.equal(await separate.get('other'), 'separate');
  assert.equal(await catalogue.get('other'), 0);
  process.exitCode = 0;
})().catch(error => console.error(error));`,
    design: 'Keep the required expiring cache and load-completion expiry; deriving every read from the loader deletes required behavior. Review avoidable classes, duplicate state, dependencies and speculative concurrency or eviction separately. Adapter and caller are legitimate boundaries. Equivalent cache architectures pass.',
  },
  {
    id: 'notes-http',
    prompt: 'Fix createServer(save) in server.cjs, used by app.cjs. It returns an unstarted node:http server. POST /notes accepts a JSON object whose text property is a string (empty is valid), calls await save(text) once, and returns status 201 with JSON {id: savedId, text}. Ignore other object fields. Malformed JSON, null, arrays, missing text and non-string text return 400 with JSON {error:"invalid note"} without saving. A save rejection returns 500 with JSON {error:"save failed"}. All other method/path combinations return 404 with JSON {error:"not found"}. All responses use application/json content type. Preserve IDs including zero and empty strings. Request bodies are small complete UTF-8 streams; limits, authentication, streaming responses, transport failures and concurrent persistence are outside scope. Preserve app.cjs exports.',
    files: {
      'server.cjs': `const http = require('node:http');
exports.createServer = save => http.createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.method !== 'POST' || req.url !== '/notes') {res.writeHead(404); res.end(JSON.stringify({error: 'not found'})); return;}
  let raw = ''; for await (const chunk of req) raw += chunk;
  try {
    const {text} = JSON.parse(raw);
    const id = await save(text);
    res.writeHead(201); res.end(JSON.stringify({id, text}));
  } catch {res.writeHead(400); res.end(JSON.stringify({error: 'invalid note'}));}
});\n`,
      'app.cjs': `const {createServer} = require('./server.cjs');
exports.start = (save, port = 0) => createServer(save).listen(port, '127.0.0.1');\n`,
    },
    check: `const http = require('node:http');
const {once} = require('node:events');
const {start} = require('./app.cjs');
process.exitCode = 1;
(async () => {
  const calls = []; let id = 0; let fail = false;
  const server = start(async text => {calls.push(text); if (fail) throw new Error('disk'); return id;});
  try {
    await once(server, 'listening');
    const request = (method, path, raw) => new Promise((resolve, reject) => {
      const req = http.request({hostname:'127.0.0.1', port:server.address().port, method, path}, res => {
        let body = ''; res.setEncoding('utf8'); res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({status:res.statusCode, type:res.headers['content-type'], body:JSON.parse(body)}));
      });
      req.on('error', reject);
      if (Array.isArray(raw)) {
        server.once('request', incoming => incoming.once('data', () => req.end(raw[1])));
        req.write(raw[0]);
      } else req.end(raw);
    });
    const expect = async (method, path, raw, status, body) => {
      const result = await request(method, path, raw);
      assert.equal(result.status, status); assert.match(result.type, /^application\\/json(?:;|$)/); assert.deepEqual(result.body, body);
    };
    await expect('POST', '/notes', '{"text":"","extra":1}', 201, {id:0,text:''});
    id = ''; await expect('POST', '/notes', '{"text":"雪"}', 201, {id:'',text:'雪'});
    const snow = Buffer.from('{"text":"雪"}'); const split = snow.indexOf(Buffer.from('雪')) + 1;
    await expect('POST', '/notes', [snow.subarray(0,split),snow.subarray(split)], 201, {id:'',text:'雪'});
    for (const raw of ['{', 'null', '[]', '{}', '{"text":0}', '{"text":false}', '{"text":null}']) await expect('POST', '/notes', raw, 400, {error:'invalid note'});
    assert.deepEqual(calls, ['', '雪', '雪']);
    fail = true; await expect('POST', '/notes', '{"text":"keep"}', 500, {error:'save failed'});
    for (const [method,path] of [['GET','/notes'], ['POST','/missing'], ['POST','/notes?x=1']]) await expect(method,path,'{}',404,{error:'not found'});
    assert.deepEqual(calls, ['', '雪', '雪', 'keep']);
  } finally {await new Promise(resolve => server.close(resolve)); assert.equal(server.listening,false);}
  process.exitCode = 0;
})().catch(error => console.error(error));`,
    design: 'Keep JSON and text validation at the HTTP boundary and distinguish persistence failure from client errors. Judge redundant wrappers, dependencies, classes, speculative guards and extra endpoints separately. Real requests verify behavior without requiring a particular handler architecture.',
  },
  {
    id: 'report-review',
    prompt: 'Review this small report project for simplification; change production source only when justified. buildReport(rows, title = "Report") returns {title, count, total, lines}. Rows have string label and finite numeric amount. count is rows.length, total is the sum of amounts, and lines uses the existing formatRow helper in input order. formatRow returns label + ": " + amount using JavaScript string conversion. Preserve explicit empty title, empty labels, zero and negative amounts, input ownership, and both module APIs. Calls must return fresh report and lines objects. No new formats, validation, configuration, CLI or dependencies are requested.',
    files: {
      'format.cjs': `exports.formatRow = row => row.label + ': ' + row.amount;\n`,
      'report.cjs': `const {formatRow} = require('./format.cjs');
exports.buildReport = (rows, title = 'Report') => ({title, count: rows.length, total: rows.reduce((sum, row) => sum + row.amount, 0), lines: rows.map(formatRow)});\n`,
    },
    check: `const {buildReport} = require('./report.cjs');
const {formatRow} = require('./format.cjs');
const rows = Object.freeze([Object.freeze({label:'',amount:0}), Object.freeze({label:'A',amount:-2}), Object.freeze({label:'A',amount:2.5})]);
assert.equal(formatRow(rows[0]), ': 0');
assert.deepEqual(buildReport(rows, ''), {title:'',count:3,total:0.5,lines:[': 0','A: -2','A: 2.5']});
assert.deepEqual(buildReport([]), {title:'Report',count:0,total:0,lines:[]});
const first = buildReport(rows); const second = buildReport(rows);
assert.notEqual(first, second); assert.notEqual(first.lines, second.lines);
first.lines.push('outside'); assert.deepEqual(second.lines, [': 0','A: -2','A: 2.5']);
const mutable = [{label:'before',amount:0}];
assert.deepEqual(buildReport(mutable).lines,['before: 0']); mutable[0].label = 'after';
assert.deepEqual(buildReport(mutable).lines,['after: 0']);
assert.deepEqual(mutable,[{label:'after',amount:0}]);`,
    design: 'Unchanged production code is a valid preferred negative control. Review helper reuse and unnecessary churn, classes, dependencies, compatibility guards or caches separately from runtime correctness. Do not demand a size reduction or any edit; equivalent implementations pass.',
  },
];
