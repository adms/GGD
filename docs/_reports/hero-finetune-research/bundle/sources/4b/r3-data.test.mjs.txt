import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {buildCases,validateCases} from './r3-data.mjs';
const snapshot=JSON.parse(fs.readFileSync(new URL('../../../outputs/forge-mechanism-priority-r3-20260906/source-snapshot.json',import.meta.url)));
const old=JSON.parse(fs.readFileSync(new URL('../../../outputs/forge-classification-reviewed-r2-20260906/cases.private.json',import.meta.url)));
test('all source claims reviewed; all source families isolated; R2 heldout never trained',()=>{
 const {cases,review}=buildCases(snapshot,old);assert.equal(review.length,143);validateCases(cases);
 const train=cases.filter(c=>c.split==='train');for(const c of old.filter(c=>c.split!=='train'))assert(!train.some(t=>t.id===c.id||t.id==='retained-'+c.id||t.id==='retention-'+c.id));
 assert.equal(new Set(cases.filter(c=>c.sourceId).map(c=>c.sourceId)).size,143);
 for(const c of cases.filter(c=>c.task==='owner-mechanism'))assert(!JSON.parse(c.messages[1].content).source.text.includes('「'));
});
test('source leak and duplicate request mutations rejected',()=>{
 const {cases}=buildCases(snapshot,old);assert.throws(()=>validateCases([...cases,cases[0]]));
 const c=structuredClone(cases);const first=c.find(x=>x.sourceId);first.split=first.split==='train'?'test':'train';assert.throws(()=>validateCases(c),/SPLIT_LEAK/);
});
