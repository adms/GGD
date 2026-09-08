import test from 'node:test';import assert from 'node:assert/strict';import {score,preservation,rank} from './r6-score.mjs';
test('stack contract rejects plan ID in templateIds even if broad schema accepts',()=>{
 const c={task:'mechanism-stack',messages:[{}, {content:JSON.stringify({allowedPlans:[{id:'pair',templateIds:['tpl-single-strike','tpl-single-strike'],equivalentOrders:[]}]})}],target:{decision:'accept',templateIds:['tpl-single-strike','tpl-single-strike'],onConflict:'reject'}};
 assert.equal(score(c,c.target).pass,true);const s=score(c,{...c.target,templateIds:['pair']});assert.equal(s.schema,false);assert.equal(s.unsafe,true);
});
test('new unsafe on a previously wrong source row still rejects',()=>{
 const tasks=Object.fromEntries(['hero-source','owner-mechanism','mechanism-template','mechanism-stack'].map(k=>[k,{passed:1,unsafe:0}]));const a={tasks,rows:[{id:'x',task:'owner-mechanism',pass:false,unsafe:false}]};const b={tasks,rows:[{id:'x',task:'owner-mechanism',pass:false,unsafe:true}]};assert.deepEqual(preservation(a,b).newUnsafe,['x']);assert.equal(preservation(a,b).pass,false);
});
test('source correctness preserved and unchanged R3 wins metric ties',()=>{
 const tasks=Object.fromEntries(['hero-source','owner-mechanism','mechanism-template','mechanism-stack'].map(k=>[k,{passed:2,unsafe:0,schema:2}]));const a={tasks,rows:[{id:'a',task:'hero-source',pass:true,unsafe:false}]},b={tasks,rows:[{id:'a',task:'hero-source',pass:false,unsafe:false}]};assert.equal(preservation(a,b).pass,false);
 assert(rank({step:0,score:a,preservation:{pass:true}},{step:16,score:a,preservation:{pass:true}})<0);
});
