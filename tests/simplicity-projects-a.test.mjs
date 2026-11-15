import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepare,grade} from '../benchmarks/run.mjs';
import {tasks} from '../benchmarks/simplicity-projects-a.mjs';

const settings = `exports.loadSettings = async (path, read = require('node:fs/promises').readFile) => {
  let raw;
  try {raw = await read(path,'utf8');}
  catch (error) {if (error?.code === 'ENOENT') return {enabled:true,limit:10}; throw error;}
  const data = JSON.parse(raw);
  return {enabled:data.enabled === undefined ? true : data.enabled,limit:data.limit === undefined ? 10 : data.limit};
};`;
const basket = `exports.createBasket = (initial = []) => {
  let items = initial.map(row => ({...row}));
  const count = () => items.reduce((sum,row) => sum + row.quantity,0);
  const total = () => items.reduce((sum,row) => sum + row.price * row.quantity,0);
  return {
    get count() {return count();}, get total() {return total();},
    set(sku,price,quantity) {const index = items.findIndex(row => row.sku === sku); const row = {sku,price,quantity}; if (index < 0) items.push(row); else items[index] = row;},
    remove(sku) {items = items.filter(row => row.sku !== sku);},
    reset(rows = []) {items = rows.map(row => ({...row}));},
    receipt() {return {items:items.map(row => ({...row})),count:count(),total:total()};},
  };
};`;
const service = `exports.saveDraft = async (draft,{store,audit}) => {
  let result;
  try {result = await store.write(draft);}
  catch (error) {await audit({type:'failed',id:draft.id}); throw error;}
  await audit({type:'saved',id:draft.id});
  return result;
};`;
const references = {
  'settings-report': ['settings.cjs',settings],
  'shopping-basket': ['basket.cjs',basket],
  'audited-drafts': ['service.cjs',service],
};
const alternatives = {
  'settings-report': settings.replace("return {enabled:data.enabled === undefined ? true : data.enabled,limit:data.limit === undefined ? 10 : data.limit};",'const {enabled = true,limit = 10} = data; return {enabled,limit};'),
  'shopping-basket': basket.replace('const count = () => items.reduce((sum,row) => sum + row.quantity,0);', 'let quantity = items.reduce((sum,row) => sum + row.quantity,0); const refresh = () => {quantity = items.reduce((sum,row) => sum + row.quantity,0);}; const count = () => quantity;').replace('else items[index] = row;', 'else items[index] = row; refresh();').replace('items = items.filter(row => row.sku !== sku);', 'items = items.filter(row => row.sku !== sku); refresh();').replace('items = rows.map(row => ({...row}));', 'items = rows.map(row => ({...row})); refresh();'),
  'audited-drafts': service.replace("catch (error) {await audit({type:'failed',id:draft.id}); throw error;}","catch (error) {return Promise.resolve().then(() => audit({type:'failed',id:draft.id})).then(() => {throw error;});}"),
};
const mutants = {
  'settings-report': [
    settings.replace('return {enabled:data.enabled === undefined ? true : data.enabled,limit:data.limit === undefined ? 10 : data.limit};','return {enabled:true,limit:10,...data};'),
    settings.replace('data.enabled === undefined ? true : data.enabled','data.enabled || true'),
    settings.replace("if (error?.code === 'ENOENT') ",'if (true) '),
    settings.replace('const data = JSON.parse(raw);',"let data; try {data = JSON.parse(raw);} catch {data = {}; }"),
    settings.replace('throw error;','throw new Error(error.message);'),
    settings.replace('data.limit === undefined ? 10 : data.limit','data.limit || 10'),
  ],
  'shopping-basket': [
    basket.replace('sum + row.quantity','sum + 1'),
    basket.replace('sum + row.price * row.quantity','sum + row.price'),
    basket.replace('else items[index] = row;','else items.push(row);'),
    basket.replace('items = items.filter(row => row.sku !== sku);','items = items.filter(row => row.sku === sku);'),
    basket.replace('items:items.map(row => ({...row}))','items'),
    basket.replace('items = rows.map(row => ({...row}));','items = rows;'),
    basket.replace('items = initial.map(row => ({...row}));','items = initial;'),
  ],
  'audited-drafts': [
    tasks.find(task => task.id === 'audited-drafts').files['service.cjs'],
    service.replace("await audit({type:'failed',id:draft.id});","audit({type:'failed',id:draft.id});"),
    service.replace("await audit({type:'failed',id:draft.id}); ",''),
    service.replace('throw error;','throw new Error(String(error));'),
    service.replace("await audit({type:'saved',id:draft.id});","audit({type:'saved',id:draft.id});"),
    service.replace('return result;','return draft.id;'),
  ],
};
const root = mkdtempSync(join(tmpdir(),'simplicity-a-'));
let rejected = 0;
try {
  assert.equal(tasks.length,3);
  assert.equal(new Set(tasks.map(task => task.id)).size,3);
  for (const task of tasks) {
    assert.ok(Object.keys(task.files).length >= 2 && Object.keys(task.files).length <= 3);
    const cwd = join(root,task.id); prepare(task,cwd);
    const baseline = await grade(task,cwd);
    assert.equal(baseline.pass,false,`${task.id} baseline unexpectedly passed`);
    assert.equal(baseline.error,null);
    assert.match(baseline.output,/AssertionError/);
    const [file,source] = references[task.id];
    for (const accepted of [source,alternatives[task.id]]) {
      writeFileSync(join(cwd,file),accepted);
      const verdict = await grade(task,cwd); assert.equal(verdict.pass,true,`${task.id} reference/alternative: ${verdict.output}`);
    }
    for (const mutant of mutants[task.id]) {
      assert.notEqual(mutant,source); writeFileSync(join(cwd,file),mutant);
      const verdict = await grade(task,cwd);
      assert.equal(verdict.pass,false,`${task.id} mutant escaped`); assert.equal(verdict.error,null,`${task.id} tool failure`);
      assert.match(verdict.output,/AssertionError/,`${task.id} failed without behavioral assertion: ${verdict.output}`); rejected++;
    }
    writeFileSync(join(cwd,file),source); assert.equal((await grade(task,cwd)).pass,true,`${task.id} restoration`);
  }
  console.log(`simplicity projects A: 3 failing baselines, 3 references, 3 alternatives, ${rejected} behaviorally rejected mutants, 3 restorations passed`);
} finally {rmSync(root,{recursive:true,force:true});}
