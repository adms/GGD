import test from 'node:test';import assert from 'node:assert/strict';import {buildRequest,validateRecommendation} from './classification-client.mjs';
test('ki-beam retrieval and manual-only parameter contract',()=>{
 const catalog={system:'test',vfx:[{id:'fx.prim.fire.beam',usable:true},{id:'fx.prim.ki.beam',usable:true},{id:'fx.preview',usable:false}],mechanism:[]};
 const request=buildRequest(catalog,{task:'vfx',request:'「把敵人冰凍！」發出一個氣功砲，其他參數我自己調。'});
 assert.equal(request.candidates[0].id,'fx.prim.ki.beam');assert(!JSON.stringify(request.messages).includes('冰凍'));
 const good={decision:'accept',suggestedTemplateIds:['fx.prim.ki.beam'],reasonCode:'matching-template'};assert(validateRecommendation(request,good).pass);
 assert(!validateRecommendation(request,{...good,alpha:1}).pass);
 assert(!validateRecommendation(request,{...good,suggestedTemplateIds:['fx.preview']}).pass);
 assert(!validateRecommendation(request,{...good,suggestedTemplateIds:['invented']}).pass);
});
