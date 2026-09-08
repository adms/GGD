import test from'node:test';import assert from'node:assert/strict';
import{publicInput,fitExamples,chooseNeighbors,catalogRanking,chooseCatalog}from'./nonllm-baseline.mjs';
const messages=u=>[{role:'user',content:JSON.stringify(u)}];
const source={task:'owner-mechanism',source:{id:'secret-label',name:'supported',snapshot:'x',text:'造成25傷害。'},claim:'造成25傷害。'};
test('CPU baseline uses public source/context, train only; candidate contracts survive oracle/ID poisoning',()=>{
 const poisoned={...source,id:'answer-is-false',target:{verdict:'contradicted'},source:{...source.source,id:'other',name:'contradicted',snapshot:'y'}};
 assert.deepEqual(publicInput(messages(source)),publicInput(messages(poisoned)));
 const row={id:'train',split:'train',messages:messages(source),target:{verdict:'supported'}},before=JSON.stringify(row),m=fitExamples([row]);
 assert.deepEqual(chooseNeighbors(m.neighbors(messages(poisoned)),1).value,{verdict:'supported'});assert.equal(JSON.stringify(row),before);
 assert.throws(()=>fitExamples([{...row,split:'test'}]),/NON_TRAIN_ROW/);
 assert.notDeepEqual(publicInput(messages(source)),publicInput(messages({...source,source:{text:'不造成任何傷害。'}})));
 assert.equal(publicInput(messages({...source,source:{text:'「造成25傷害。」不造成傷害。'}})).text,'不造成傷害。');
 const u={task:'mechanism-stack',request:'自身回血',allowedPlans:[{id:'plan-self',templateIds:['tpl-heal','tpl-buff'],description:'自身回血',requiredChoices:[],equivalentOrders:[]}]};
 assert.deepEqual(chooseCatalog(catalogRanking(messages(u)),0).value,{decision:'accept',templateIds:['tpl-heal','tpl-buff'],onConflict:'reject'});
 const other={...u,allowedPlans:[{...u.allowedPlans[0],id:'other',templateIds:['tpl-other']}]},n=fitExamples([{id:'stack-train',split:'train',messages:messages(u),target:{decision:'accept',templateIds:['tpl-heal','tpl-buff'],onConflict:'reject'}}]);
 assert.deepEqual(chooseNeighbors(n.neighbors(messages(other)),1).value,{decision:'refuse',templateIds:[],onConflict:'reject'});
 assert.equal(catalogRanking(messages(source)),null);
});
