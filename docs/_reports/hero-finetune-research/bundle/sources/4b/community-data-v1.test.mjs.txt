import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {build} from './community-data-v1.mjs';import {validateCases} from './r3-data.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),heroes=JSON.parse(fs.readFileSync(path.join(root,'outputs/forge-final-three-hours-20260906/seven-heroes-source-v1/heroes.json')));
test('community source cases: all 49 units, three labels, disjoint heroes, no answer/params in prompts',()=>{
 const {cases,counts,reviews}=build(heroes);assert.deepEqual(counts,{train:84,dev:21,test:42});assert.equal(reviews.length,147);
 assert.equal(new Set(cases.map(c=>c.sourceId)).size,49);
 for(const h of heroes){const rows=cases.filter(c=>c.heroId===h.id);assert.equal(rows.length,21);assert(rows.every(c=>c.split===h.split));}
 for(const c of cases){const i=JSON.parse(c.messages[1].content);assert(!('target'in i));assert(!('params'in i.source));assert(!c.messages.some(m=>m.content.includes(c.reviewReason)));assert.equal(c.trainingEligible,c.split==='train');assert.equal(c.selectionEligible,c.split==='dev');}
 const a=structuredClone(cases);const source=a[0].sourceId;const row=a.find((c,i)=>i&&c.sourceId===source);row.split=row.split==='train'?'test':'train';assert.throws(()=>validateCases(a),/SPLIT_LEAK/);
});
