import test from 'node:test';import assert from 'node:assert/strict';import {score,summarize,rankCandidates} from './r3-score.mjs';
test('source unsupported assertion accepted is unsafe; extra keys never pass',()=>{
 const c={task:'hero-source',target:{verdict:'not-stated'}};
 assert.equal(score(c,{verdict:'supported'}).unsafe,true);assert.equal(score(c,{verdict:'not-stated',extra:'x'}).pass,false);assert.equal(score(c,{verdict:'not-stated'}).pass,true);
});
test('wrong accepted template is unsafe, decisions cannot be gamed',()=>{
 const c={task:'mechanism-template',target:{decision:'accept',templateId:'tpl-on-attack'}};
 assert.equal(score(c,{decision:'accept',templateId:'tpl-on-hit-react'}).unsafe,true);
 assert.equal(score(c,{decision:'refuse',templateId:'tpl-on-attack'}).pass,false);
});
test('raw alignment mandatory and priority is not macro averaging',()=>{
 assert.throws(()=>summarize([{id:'a',requestDigest:'x'}],{complete:true,results:[{id:'b'}]}));
 const make=(hero,mechanism)=>({epoch:1,score:{tasks:{'hero-source':{pct:hero,unsafe:0,schema:10,total:10},'owner-mechanism':{pct:90,unsafe:0,schema:10,total:10},'mechanism-template':{pct:mechanism,unsafe:0,schema:10,total:10}}}});
 assert(rankCandidates(make(99,50),make(90,100))<0);
});
