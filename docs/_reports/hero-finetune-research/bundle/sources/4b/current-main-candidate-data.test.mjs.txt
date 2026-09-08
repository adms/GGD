import test from 'node:test';
import assert from 'node:assert/strict';
import {build,pairs} from './current-main-candidate-data.mjs';
const review=()=>({revision:'4793eaaaf2775b2081f5eca5881db32e0aab0ea8',system:'test-only system',counts:{total:46,enabled:30,quarantined:5,draft:11},rows:[...pairs.map(([id])=>({templateId:'tpl-'+id,status:'enabled',description:'fixture, not semantic proof'})),...Array.from({length:5},(_,i)=>({templateId:'quarantine-'+i,status:'quarantined'})),...Array.from({length:11},(_,i)=>({templateId:'draft-'+i,status:'draft'}))]});
test('candidate-only export covers all enabled families with alternatives and no hidden labels',()=>{
 const {cases,manifest}=build(review(),[]);assert.equal(cases.length,60);assert.equal(manifest.trainingApproved,false);
 const covered=new Set();for(const c of cases){assert.equal(c.trainingEligible,false);const input=JSON.parse(c.messages[1].content);assert.equal(input.catalog.length,30);assert.equal(input.unavailable.length,16);assert(!('target' in input));for(const t of c.acceptedTargets)if(t.templateId)covered.add(t.templateId);}
 assert.deepEqual([...covered].sort(),pairs.map(([id])=>'tpl-'+id).sort());
 assert.equal(cases.filter(c=>c.target.decision==='refuse').length,30);
 assert.equal(cases.find(c=>c.id==='main-candidate-instant-blast-supported').acceptedTargets.length,4);
});
test('exact prior request and changed catalog fail closed',()=>{
 const prior=[{messages:[{role:'system',content:'x'},{role:'user',content:JSON.stringify({request:pairs[0][1]})}]}];
 assert.throws(()=>build(review(),prior),/EXACT_REQUEST_REUSE/);
 const changed=review();changed.rows[0].status='quarantined';assert.throws(()=>build(changed,[]));
 const version=review();version.revision='new-unreviewed';assert.throws(()=>build(version,[]));
});
test('v4 removes summon training pair and preserves all 29 remaining families',()=>{
 const r=review();r.counts={total:46,enabled:29,quarantined:6,draft:11};const row=r.rows.find(x=>x.templateId==='tpl-summon-agent');row.status='quarantined';row.issue='#1076';
 const {cases,manifest}=build(r,[]);assert.equal(cases.length,58);assert.equal(manifest.positive,29);assert(!cases.some(c=>c.acceptedTargets.some(t=>t.templateId==='tpl-summon-agent')));assert(cases.every(c=>JSON.parse(c.messages[1].content).unavailable.length===17));
 delete row.issue;assert.throws(()=>build(r,[]),/SUMMON_QUARANTINE_REQUIRED/);
});
