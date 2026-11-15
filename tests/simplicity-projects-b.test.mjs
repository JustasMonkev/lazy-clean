import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepare, grade} from '../benchmarks/run.mjs';
import {tasks} from '../benchmarks/simplicity-projects-b.mjs';

const cache = `exports.createCatalogue = (load, now, ttl) => {
  const entries = new Map();
  return {async get(id) {
    const entry = entries.get(id);
    if (entry && now() < entry.expires) return entry.value;
    const value = await load(id);
    entries.set(id, {value, expires: now() + ttl});
    return value;
  }};
};`;
const server = `const http = require('node:http');
exports.createServer = save => http.createServer(async (req, res) => {
  const send = (status, body) => {res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(body));};
  if (req.method !== 'POST' || req.url !== '/notes') return send(404, {error:'not found'});
  req.setEncoding('utf8');
  let raw = ''; for await (const chunk of req) raw += chunk;
  let note;
  try {note = JSON.parse(raw);} catch {return send(400, {error:'invalid note'});}
  if (!note || Array.isArray(note) || typeof note.text !== 'string') return send(400, {error:'invalid note'});
  let id;
  try {id = await save(note.text);} catch {return send(500, {error:'save failed'});}
  send(201, {id, text:note.text});
});`;
const report = tasks[2].files['report.cjs'];
const references = [cache, server, report];
const alternatives = [
  cache.replace('const entries = new Map();', 'const entries = Object.create(null);').replace('entries.get(id)', 'entries[id]').replace('entries.set(id, {value, expires: now() + ttl});', 'entries[id] = {value, expires: now() + ttl};'),
  server.replace("const http = require('node:http');", "const {createServer} = require('node:http');").replace('http.createServer(', 'createServer('),
  `const {formatRow} = require('./format.cjs'); exports.buildReport = (rows, title = 'Report') => {let total = 0; const lines = []; for (const row of rows) {total += row.amount; lines.push(formatRow(row));} return {title,count:rows.length,total,lines};};`,
];
const mutants = [
  [
    `exports.createCatalogue = (load, now, ttl) => {let entry; return {async get(id) {if (entry && entry.id === id && now() < entry.expires) return entry.value; const value = await load(id); entry = {id,value,expires:now() + ttl}; return value;}};};`,
    cache.replace('now() < entry.expires', 'now() <= entry.expires'),
    cache.replace('entry && now()', 'entry && entry.value && now()'),
    cache.replace('const value = await load(id);', 'const started = now(); const value = await load(id);').replace('expires: now() + ttl', 'expires: started + ttl'),
    cache.replace('const value = await load(id);', 'let value; try {value = await load(id);} catch {return entry.value;}'),
  ],
  [
    server.replace("req.setEncoding('utf8');", ''),
    server.replace("typeof note.text !== 'string'", '!note.text'),
    server.replace("send(500, {error:'save failed'})", "send(201, {error:'save failed'})"),
    server.replace("return send(400, {error:'invalid note'});}", "return send(500, {error:'invalid note'});}"),
    server.replace('send(201, {id, text:note.text})', "send(201, {id:id || 'missing', text:note.text})"),
  ],
  [
    report.replace('({title,', "({title:title || 'Report',"),
    report.replace('sum + row.amount', 'sum + Math.abs(row.amount)'),
    report.replace('lines: rows.map(formatRow)', 'lines: rows.filter(row => row.amount).map(formatRow)'),
    report.replace('rows.map(formatRow)', 'rows.reverse().map(formatRow)'),
  ],
];
const root = mkdtempSync(join(tmpdir(), 'simplicity-b-'));
try {
  assert.equal(tasks.length, 3);
  assert.equal(new Set(tasks.map(task => task.id)).size, 3);
  for (const [index, task] of tasks.entries()) {
    assert.ok(Object.keys(task.files).length >= 2 && Object.keys(task.files).length <= 3);
    assert.ok(task.design.length > 0);
    const cwd = join(root, task.id);
    const file = Object.keys(task.files).find(name => ['catalogue.cjs', 'server.cjs', 'report.cjs'].includes(name));
    prepare(task, cwd);
    const initial = await grade(task, cwd);
    assert.equal(initial.error, null, initial.output);
    assert.equal(initial.pass, index === 2, `${task.id} initial: ${initial.output}`);
    for (const source of [references[index], alternatives[index]]) {
      writeFileSync(join(cwd, file), source);
      const result = await grade(task, cwd);
      assert.equal(result.error, null, result.output);
      assert.equal(result.pass, true, `${task.id} valid: ${result.output}`);
    }
    for (const source of mutants[index]) {
      writeFileSync(join(cwd, file), source);
      const result = await grade(task, cwd);
      assert.equal(result.error, null, `${task.id}: ${result.error}`);
      assert.equal(result.pass, false, `${task.id} escaped mutation: ${source}`);
    }
    writeFileSync(join(cwd, file), references[index]);
    const restored = await grade(task, cwd);
    assert.equal(restored.pass, true, `${task.id} restoration: ${restored.output}`);
  }
  console.log('simplicity projects B: three initial verdicts, references, alternatives, fourteen mutants and restorations passed');
} finally {rmSync(root, {recursive:true, force:true});}
