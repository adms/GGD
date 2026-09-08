import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
import {correctGrowthReceiver} from './main-review-corrections.mjs';
const root=fileURLToPath(new URL('../../../outputs/forge-mechanism-priority-r3-20260906/',import.meta.url));
const review=JSON.parse(fs.readFileSync(root+'main-catalog-review.json')),probe=JSON.parse(fs.readFileSync(root+'main-growth-receiver-probe.json'));
test('runtime correction quarantines growth and invalidates positive oracle without changing originals',()=>{
 const before=JSON.stringify(review),r=correctGrowthReceiver(review,probe);assert.equal(JSON.stringify(review),before);assert.equal(r.review.counts.enabled,31);assert.equal(r.review.counts.quarantined,4);
 const c=r.cases.find(c=>c.id.endsWith('single-stat-growth'));assert.deepEqual(c.target,{decision:'refuse',templateId:null});
 for(const c of r.cases){const u=JSON.parse(c.messages[1].content);assert(!u.catalog.some(t=>t.templateId==='tpl-growth-charge'));assert(u.unavailable.some(t=>t.templateId==='tpl-growth-charge'));assert.equal(c.trainingEligible,false);}
 assert.equal(r.correction.pinnedPostDiagnosticsChanged,false);assert.equal(r.manifest.releaseQualified,false);
});
test('wrong revision and non-reproducing evidence fail closed',()=>{
 assert.throws(()=>correctGrowthReceiver(review,{...probe,revision:'wrong'}));
 const p=structuredClone(probe);p.one.after.victims[0].agi=p.one.before.victims[0].agi;assert.throws(()=>correctGrowthReceiver(review,p));
});
