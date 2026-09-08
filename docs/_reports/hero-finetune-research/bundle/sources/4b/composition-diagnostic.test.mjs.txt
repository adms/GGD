import test from 'node:test';import assert from 'node:assert/strict';
import {compositionPlans,validateSelection,makeCatalog} from './composition-diagnostic.mjs';
test('only enumerated complete plans pass; repeated strikes are intentional and order is explicit',()=>{
 const catalog={allowedPlans:compositionPlans};
 for(const plan of compositionPlans)for(const ids of [plan.templateIds,...plan.equivalentOrders])assert.equal(validateSelection(catalog,{decision:'accept',templateIds:ids,onConflict:'reject'}).pass,true);
 for(const ids of [[],['tpl-buff-self'],['tpl-buff-self','tpl-on-hit-react'],['tpl-drain-leech'],['tpl-single-strike','tpl-single-strike','tpl-single-strike']])assert.equal(validateSelection(catalog,{decision:'accept',templateIds:ids,onConflict:'reject'}).pass,false);
 assert.equal(validateSelection(catalog,{decision:'refuse',templateIds:[],onConflict:'reject'}).pass,true);
 for(const value of [{decision:'refuse',templateIds:['tpl-buff-self'],onConflict:'reject'},{decision:'accept',templateIds:compositionPlans[0].templateIds,onConflict:'lastWins'},{decision:'accept',templateIds:compositionPlans[0].templateIds,onConflict:'reject',params:{}},{decision:'accept',templateIds:'tpl-buff-self',onConflict:'reject'}])assert.equal(validateSelection(catalog,value).pass,false);
});
test('partial or mismatched runtime evidence cannot authorize composition vocabulary',()=>{
 assert.throws(()=>makeCatalog({revision:'a'},{passed:10,total:11,checks:[]}),/10 !== 11/);
 assert.throws(()=>makeCatalog({revision:'a'},{passed:11,total:11,checks:[],revision:'b'}));
 assert.throws(()=>makeCatalog({revision:'a'},{passed:11,total:11,checks:[],revision:'a'}));
});
