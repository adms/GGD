import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {buildR4} from './r4-data.mjs';
const root=new URL('../../../outputs/forge-mechanism-priority-r3-20260906/',import.meta.url),read=n=>JSON.parse(fs.readFileSync(new URL(n,root)));
test('reviewed data extension preserves prior evidence and forbids source or request leakage',()=>{
 const old=read('cases.private.json'),snapshot=read('source-snapshot.json'),{cases,review}=buildR4(old,snapshot);
 assert(review.some(c=>c.split==='test'));assert(review.some(c=>c.split==='train'));
 const train=cases.filter(c=>c.split==='train');const held=new Set(old.filter(c=>c.split!=='train'&&c.sourceId).map(c=>c.sourceId));assert(train.every(c=>!held.has(c.sourceId)));
 for(const c of old)assert.deepEqual(cases.find(n=>n.id===c.id).messages,c.messages);
 const bad=structuredClone(old);bad.find(c=>c.sourceId==='godie-e002.e').split='test';assert.throws(()=>buildR4(bad,snapshot),/SOURCE_SPLIT_LEAK/);
 const badSource=structuredClone(snapshot);badSource.sources.find(s=>s.id==='godie-e002.e').ownerOriginal='changed';assert.throws(()=>buildR4(old,badSource),/ANCHOR_MISSING/);
});
