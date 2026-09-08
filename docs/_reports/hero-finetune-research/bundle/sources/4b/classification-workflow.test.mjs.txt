import test from 'node:test';import assert from 'node:assert/strict';import {stages} from './classification-workflow.mjs';
test('reviewed workflow connects core, report, Mac precision checks and preservation',()=>{
 const c={root:'/tmp/run',python:'/tmp/python',model:'/tmp/model',runtime:'/tmp/runtime',baseReceipt:'/tmp/base-receipt.json'};
 assert.deepEqual(stages('run',c).map(s=>s.name),['core','paired-report','mac-export-and-quality','preserve']);
 assert.deepEqual(stages('finish',c).map(s=>s.name),['paired-report','mac-export-and-quality','preserve']);
 assert(stages('finish',c)[1].args.includes(c.baseReceipt));assert(stages('run',c)[0].args.includes(c.model));
 assert.throws(()=>stages('run',{...c,publish:true}));assert.throws(()=>stages('run',{...c,root:'relative'}));assert.throws(()=>stages('resume',c));
});
